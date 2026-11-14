#!/usr/bin/env bash
# ============================================================================
# 每日 PostgreSQL 备份：dump → 校验 → age 加密 → 上传 COS → 清理过期
#
# 用法：由 cron 调用，也可手动跑：
#   ./scripts/20-backup-pg.sh
#
# 保留策略：本地 BACKUP_KEEP_LOCAL 天，远端 BACKUP_KEEP_REMOTE 天（.env 可改）
# 失败会走 ALERT_WEBHOOK（企业微信群机器人）告警，并写系统日志
# ============================================================================
set -Eeuo pipefail
umask 077

readonly SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly REPO_DIR="$(dirname "$SCRIPT_DIR")"
readonly STAMP="$(date +%Y%m%d-%H%M%S)"

log()  { printf '%s [backup-pg] %s\n' "$(date '+%F %T')" "$*"; }
die()  { printf '%s [backup-pg][FAIL] %s\n' "$(date '+%F %T')" "$*" >&2; alert "PG 备份失败：$*"; exit 1; }

alert() {
  local msg="$1"
  logger -t rlc-backup "$msg" || true
  if [[ -n "${ALERT_WEBHOOK:-}" ]]; then
    curl -fsS -m 10 -X POST -H 'Content-Type: application/json' \
      -d "$(jq -nc --arg t "🚨 $msg" '{msgtype:"text",text:{content:$t}}')" \
      "$ALERT_WEBHOOK" >/dev/null || logger -t rlc-backup "告警发送失败"
  fi
}

# ---------------------------------------------------------------------------
# 读配置
# ---------------------------------------------------------------------------
cd "$REPO_DIR"
[[ -f .env ]] || die "找不到 $REPO_DIR/.env"
set -a; . ./.env; set +a

: "${POSTGRES_DB:?.env 缺 POSTGRES_DB}"
: "${POSTGRES_USER:?.env 缺 POSTGRES_USER}"
: "${BACKUP_DIR:=/data/backup}"
: "${BACKUP_KEEP_LOCAL:=7}"
: "${BACKUP_KEEP_REMOTE:=30}"

[[ -n "${AGE_PUBLIC_KEY:-}" ]] || die "AGE_PUBLIC_KEY 为空。备份必须加密，先在 .env 里填 age 公钥（runbook 阶段 6）"

readonly PG_DIR="$BACKUP_DIR/pg"
readonly TMP_DIR="$(mktemp -d /tmp/rlc-pg-XXXXXX)"
readonly TMP_DUMP="$TMP_DIR/db.dump"
readonly ENC_FILE="$PG_DIR/${POSTGRES_DB}_${STAMP}.dump.age"

cleanup() { rm -rf "$TMP_DIR"; }
trap cleanup EXIT

install -d -m 750 "$PG_DIR"

# ---------------------------------------------------------------------------
# 1. dump
# ---------------------------------------------------------------------------
log "开始 dump ${POSTGRES_DB}"
if ! docker compose -f docker-compose.yml exec -T postgres \
      pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc -Z6 > "$TMP_DUMP"; then
  die "pg_dump 执行失败"
fi

SIZE=$(stat -c %s "$TMP_DUMP")
if [[ "$SIZE" -lt 1024 ]]; then
  die "dump 只有 ${SIZE} 字节，明显异常"
fi
log "dump 完成：$(numfmt --to=iec "$SIZE")"

# ---------------------------------------------------------------------------
# 2. 校验：能让 pg_restore 读出目录，说明文件结构完整
# ---------------------------------------------------------------------------
if ! docker compose -f docker-compose.yml exec -T postgres pg_restore -l < "$TMP_DUMP" > /dev/null; then
  die "pg_restore -l 校验失败，dump 可能已损坏"
fi
log "结构校验通过"

# ---------------------------------------------------------------------------
# 3. 加密
# ---------------------------------------------------------------------------
age -r "$AGE_PUBLIC_KEY" -o "$ENC_FILE" "$TMP_DUMP" || die "age 加密失败"
log "已加密：$ENC_FILE（$(numfmt --to=iec "$(stat -c %s "$ENC_FILE")")）"

# ---------------------------------------------------------------------------
# 4. 上传
# ---------------------------------------------------------------------------
if [[ -n "${BACKUP_BUCKET:-}" ]]; then
  if rclone copy "$ENC_FILE" "${RCLONE_REMOTE:-cos}:${BACKUP_BUCKET}/pg/"; then
    log "已上传 ${RCLONE_REMOTE:-cos}:${BACKUP_BUCKET}/pg/"
  else
    # 上传失败不删本地文件，本地那份还算数
    alert "PG 备份已生成但上传失败：$(basename "$ENC_FILE")"
    exit 1
  fi

  # 远端清理
  rclone delete --min-age "${BACKUP_KEEP_REMOTE}d" \
    "${RCLONE_REMOTE:-cos}:${BACKUP_BUCKET}/pg/" >/dev/null 2>&1 || true
fi

# ---------------------------------------------------------------------------
# 5. 本地清理 + 打健康标记
# ---------------------------------------------------------------------------
find "$PG_DIR" -type f -name '*.dump.age' -mtime +"$BACKUP_KEEP_LOCAL" -delete 2>/dev/null || true
rm -f "$PG_DIR"/*.dump 2>/dev/null || true

date +%s > "$BACKUP_DIR/.last-pg-backup"
log "完成。本地保留：$(find "$PG_DIR" -name '*.dump.age' | wc -l) 份"
