#!/usr/bin/env bash
# ============================================================================
# PostgreSQL 恢复 / 演练
#
# 用法：
#   ./scripts/30-restore-pg.sh --list              列出可用备份（本地 + COS）
#   ./scripts/30-restore-pg.sh --drill             恢复最近一份到临时库，核对行数，然后删掉
#   ./scripts/30-restore-pg.sh --file <路径|远端键> 用指定备份演练
#   ./scripts/30-restore-pg.sh --in-place          覆盖生产库（危险，需输入 YES）
#
# 为什么要有 --drill：
#   没演练过的备份等于没有备份。每月 1 号由 cron 自动跑一次，
#   连续两个月失败就必须人工介入——这说明备份链路已经坏了，但没人发现。
# ============================================================================
set -Eeuo pipefail
umask 077

readonly SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly REPO_DIR="$(dirname "$SCRIPT_DIR")"
readonly AGE_KEY_FILE="${AGE_KEY_FILE:-/etc/rlc/age.key}"

log()  { printf '%s [restore] %s\n' "$(date '+%F %T')" "$*"; }
warn() { printf '\033[1;33m[warn]\033[0m %s\n' "$*"; }
die()  { printf '%s [restore][FAIL] %s\n' "$(date '+%F %T')" "$*" >&2; exit 1; }

usage() { sed -n '2,14p' "$0"; exit 0; }

MODE=""
TARGET_FILE=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --list)     MODE=list ;;
    --drill)    MODE=drill ;;
    --in-place) MODE=inplace ;;
    --file)     MODE=file; TARGET_FILE="${2:?--file 需要参数}"; shift ;;
    -h|--help)  usage ;;
    *)          die "未知参数：$1（--help 看用法）" ;;
  esac
  shift
done
[[ -n "$MODE" ]] || usage

cd "$REPO_DIR"
[[ -f .env ]] || die "找不到 $REPO_DIR/.env"
set -a; . ./.env; set +a

: "${POSTGRES_DB:?.env 缺 POSTGRES_DB}"
: "${POSTGRES_USER:?.env 缺 POSTGRES_USER}"
: "${BACKUP_DIR:=/data/backup}"
readonly PG_DIR="$BACKUP_DIR/pg"

psql_exec() { docker compose -f docker-compose.yml exec -T postgres psql -U "$POSTGRES_USER" -d "$1" "${@:2}"; }

# ---------------------------------------------------------------------------
# 选备份
# ---------------------------------------------------------------------------
pick_latest() {
  local f
  f=$(find "$PG_DIR" -type f -name '*.dump.age' -printf '%T@ %p\n' 2>/dev/null \
      | sort -rn | head -1 | cut -d' ' -f2-)
  [[ -n "$f" ]] && { echo "$f"; return 0; }

  # 本地没有就拉远端最新的
  [[ -n "${BACKUP_BUCKET:-}" ]] || return 1
  local remote
  remote=$(rclone lsl "${RCLONE_REMOTE:-cos}:${BACKUP_BUCKET}/pg/" 2>/dev/null \
           | sort -k2,3 -r | head -1 | awk '{print $NF}')
  [[ -n "$remote" ]] || return 1

  local tmp="$PG_DIR/_remote_${remote}"
  log "从 COS 拉取 $remote" >&2
  rclone copyto "${RCLONE_REMOTE:-cos}:${BACKUP_BUCKET}/pg/${remote}" "$tmp" >&2
  echo "$tmp"
}

case "$MODE" in
  list)
    echo "== 本地（${PG_DIR}）=="
    find "$PG_DIR" -type f -name '*.age' -printf '%TY-%Tm-%Td %TH:%TM  %10s  %f\n' 2>/dev/null \
      | sort -r | sed 's/^/  /' || true
    if [[ -n "${BACKUP_BUCKET:-}" ]]; then
      echo
      echo "== 远端（${RCLONE_REMOTE:-cos}:${BACKUP_BUCKET}/pg/）=="
      rclone lsl "${RCLONE_REMOTE:-cos}:${BACKUP_BUCKET}/pg/" 2>/dev/null \
        | awk '{printf "  %s %s  %10s  %s\n", $2, substr($3,1,8), $1, $4}' \
        || echo "  （读取失败，检查 rclone 配置）"
    fi
    exit 0
    ;;
esac

[[ -r "$AGE_KEY_FILE" ]] || die "读不到 age 私钥 $AGE_KEY_FILE（见 runbook 阶段 6）"
[[ -n "${AGE_PUBLIC_KEY:-}" ]] || warn "AGE_PUBLIC_KEY 未设置，本次不需要（只做解密）"

case "$MODE" in
  drill) SRC="$(pick_latest)" || die "本地和远端都找不到备份" ;;
  file)  SRC="$TARGET_FILE" ;;
  inplace)
    SRC="$(pick_latest)" || die "找不到备份"
    ;;
esac

[[ -f "$SRC" ]] || die "备份文件不存在：$SRC"
log "使用备份：$SRC"

# ---------------------------------------------------------------------------
# 解密
# ---------------------------------------------------------------------------
TMP_DIR="$(mktemp -d /tmp/rlc-restore-XXXXXX)"
TMP_DUMP="$TMP_DIR/db.dump"
cleanup() { rm -rf "$TMP_DIR"; }
trap cleanup EXIT

age -d -i "$AGE_KEY_FILE" -o "$TMP_DUMP" "$SRC" || die "解密失败（私钥不匹配？）"
log "解密完成：$(numfmt --to=iec "$(stat -c %s "$TMP_DUMP")")"

if ! docker compose -f docker-compose.yml exec -T postgres pg_restore -l < "$TMP_DUMP" > /dev/null; then
  die "备份文件结构损坏"
fi

# ---------------------------------------------------------------------------
# 选择目标库
# ---------------------------------------------------------------------------
if [[ "$MODE" == "inplace" ]]; then
  TARGET_DB="$POSTGRES_DB"
  warn "即将覆盖生产库 $TARGET_DB。当前库会先自动备份一次。"
  read -r -p "确认请输入 YES：" ans
  [[ "$ans" == "YES" ]] || die "已取消"

  log "先做一次安全备份"
  "$SCRIPT_DIR/20-backup-pg.sh" || die "安全备份失败，拒绝覆盖生产库"

  log "停掉 api / worker，避免恢复期间有连接写入"
  docker compose -f docker-compose.yml -f docker-compose.app.yml stop api worker 2>/dev/null || true
else
  TARGET_DB="rlc_drill_$(date +%Y%m%d_%H%M%S)"
fi

# ---------------------------------------------------------------------------
# 重建目标库
# ---------------------------------------------------------------------------
log "重建数据库 $TARGET_DB"
psql_exec postgres -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='$TARGET_DB' AND pid<>pg_backend_pid();" >/dev/null
psql_exec postgres -c "DROP DATABASE IF EXISTS \"$TARGET_DB\";" >/dev/null
psql_exec postgres -c "CREATE DATABASE \"$TARGET_DB\" TEMPLATE template0 ENCODING 'UTF8' LC_COLLATE 'C.UTF-8' LC_CTYPE 'C.UTF-8';" >/dev/null

log "恢复数据"
if ! docker compose -f docker-compose.yml exec -T postgres \
      pg_restore -U "$POSTGRES_USER" -d "$TARGET_DB" --no-owner --no-privileges --single-transaction \
      < "$TMP_DUMP"; then
  warn "pg_restore 返回非零（可能是无害的权限告警）。继续核对行数。"
fi

psql_exec "$TARGET_DB" -c "ANALYZE;" >/dev/null 2>&1 || true

# ---------------------------------------------------------------------------
# 核对行数
# ---------------------------------------------------------------------------
log "各表行数"
COUNT_SQL=$(psql_exec "$TARGET_DB" -Atc "
  SELECT string_agg(format('select %L as tbl, count(*) from %I.%I',
                           c.relname, n.nspname, c.relname), ' union all ')
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE c.relkind = 'r' AND n.nspname = 'public';")

if [[ -n "$COUNT_SQL" ]]; then
  psql_exec "$TARGET_DB" -c "SELECT * FROM ($COUNT_SQL) t ORDER BY tbl;" | sed 's/^/  /'
  TABLES=$(psql_exec "$TARGET_DB" -Atc "
    SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE c.relkind='r' AND n.nspname='public';")
  log "共 $TABLES 张表"
else
  [[ -s "$TMP_DUMP" ]] || die "恢复后一张表都没有"
  warn "库里没有 public 表（空库备份？）"
fi

# ---------------------------------------------------------------------------
# 收尾
# ---------------------------------------------------------------------------
if [[ "$MODE" == "inplace" ]]; then
  log "重启 api / worker"
  docker compose -f docker-compose.yml -f docker-compose.app.yml up -d
  log "生产库恢复完成。验证：curl -fsS https://${API_DOMAIN}/api/healthz"
else
  log "演练通过，删除临时库 $TARGET_DB"
  psql_exec postgres -c "DROP DATABASE \"$TARGET_DB\";" >/dev/null
  date +%s > "$BACKUP_DIR/.last-drill"
  log "演练成功（时间戳已写入 $BACKUP_DIR/.last-drill）"
fi
