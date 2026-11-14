#!/usr/bin/env bash
# ============================================================================
# 一键体检：容器 / 磁盘 / 内存 / 数据库 / 缓存 / 证书 / 备份新鲜度
#
# 用法：
#   ./scripts/40-healthcheck.sh          # 人看
#   ./scripts/40-healthcheck.sh --quiet  # 只在有问题时输出（给 cron/告警用）
#
# 退出码：0 全部正常；1 有 FAIL；2 只有 WARN
# ============================================================================
set -uo pipefail   # 故意不用 -e：单个检查失败不应中断整个体检

readonly SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly REPO_DIR="$(dirname "$SCRIPT_DIR")"
QUIET=0
[[ "${1:-}" == "--quiet" ]] && QUIET=1

FAILS=0
WARNS=0
LINES=()

ok()   { LINES+=("  ✅ $*"); }
warn() { LINES+=("  ⚠️  $*"); WARNS=$((WARNS + 1)); }
bad()  { LINES+=("  ❌ $*"); FAILS=$((FAILS + 1)); }

cd "$REPO_DIR" || { echo "找不到 $REPO_DIR"; exit 1; }
if [[ -f .env ]]; then
  set -a; . ./.env; set +a
else
  echo "缺少 .env"; exit 1
fi
: "${BACKUP_DIR:=/data/backup}"

# ---------------------------------------------------------------------------
# 1. 容器
# ---------------------------------------------------------------------------
expected=(rlc-postgres rlc-redis rlc-minio)
running=$(docker ps --format '{{.Names}}' 2>/dev/null || true)
for c in "${expected[@]}"; do
  if grep -qx "$c" <<<"$running"; then
    st=$(docker inspect -f '{{.State.Status}} {{if .State.Health}}{{.State.Health.Status}}{{else}}-{{end}}' "$c" 2>/dev/null)
    case "$st" in
      *"unhealthy"*) bad "容器 $c 状态异常：$st" ;;
      *"exited"*|*"dead"*) bad "容器 $c 已退出" ;;
      *) ok "容器 $c：$st" ;;
    esac
  else
    bad "容器 $c 不在运行"
  fi
done
# 应用层（可选）
for c in rlc-caddy rlc-api rlc-portal; do
  if grep -qx "$c" <<<"$running"; then
    st=$(docker inspect -f '{{.State.Status}}' "$c" 2>/dev/null)
    [[ "$st" == "running" ]] && ok "容器 $c：running" || bad "容器 $c：$st"
  fi
done

# ---------------------------------------------------------------------------
# 2. 磁盘
# ---------------------------------------------------------------------------
use=$(df --output=pcent / | tail -1 | tr -dc '0-9')
if   [[ "$use" -ge 90 ]]; then bad "根分区使用 ${use}%（≥90%，PG 会崩）"
elif [[ "$use" -ge 80 ]]; then warn "根分区使用 ${use}%"
else ok "根分区使用 ${use}%"; fi

if mountpoint -q /data; then
  use=$(df --output=pcent /data | tail -1 | tr -dc '0-9')
  if   [[ "$use" -ge 90 ]]; then bad "/data 使用 ${use}%（≥90%，PG 会崩）"
  elif [[ "$use" -ge 80 ]]; then warn "/data 使用 ${use}%"
  else ok "/data 使用 ${use}%"; fi
else
  warn "/data 未挂载（数据在系统盘，重装会丢）"
fi

# ---------------------------------------------------------------------------
# 3. 内存
# ---------------------------------------------------------------------------
mem_pct=$(free | awk '/Mem:/{printf "%d", $3/$2*100}')
sw_pct=$(free | awk '/Swap:/{if($2>0) printf "%d", $3/$2*100; else print 0}')
if   [[ "$mem_pct" -ge 90 ]]; then bad "内存使用 ${mem_pct}%"
elif [[ "$mem_pct" -ge 80 ]]; then warn "内存使用 ${mem_pct}%，swap 已用 ${sw_pct}%"
else ok "内存使用 ${mem_pct}%，swap ${sw_pct}%"; fi

# ---------------------------------------------------------------------------
# 4. PostgreSQL
# ---------------------------------------------------------------------------
if docker compose -f docker-compose.yml exec -T postgres pg_isready -U "$POSTGRES_USER" -q 2>/dev/null; then
  conns=$(docker compose -f docker-compose.yml exec -T postgres \
          psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Atc \
          "SELECT count(*) FROM pg_stat_activity;" 2>/dev/null | tr -dc '0-9')
  dbsize=$(docker compose -f docker-compose.yml exec -T postgres \
           psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Atc \
           "SELECT pg_size_pretty(pg_database_size(current_database()));" 2>/dev/null | tr -d '\r')
  ok "PostgreSQL 可连接（连接数 ${conns:-?}/80，库大小 ${dbsize:-?}）"
  if [[ -n "$conns" && "$conns" -ge 64 ]]; then warn "PG 连接数接近上限（${conns}/80）"; fi
  # 长事务
  longtx=$(docker compose -f docker-compose.yml exec -T postgres \
           psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Atc \
           "SELECT count(*) FROM pg_stat_activity WHERE state='idle in transaction' AND now()-state_change > interval '5 minutes';" 2>/dev/null | tr -dc '0-9')
  [[ -n "$longtx" && "$longtx" -gt 0 ]] && warn "有 $longtx 个超过 5 分钟的空闲事务"
else
  bad "PostgreSQL 连不上"
fi

# ---------------------------------------------------------------------------
# 5. Redis / MinIO
# ---------------------------------------------------------------------------
if docker compose -f docker-compose.yml exec -T redis sh -c 'redis-cli --no-auth-warning -a "$REDIS_PASSWORD" ping' 2>/dev/null | grep -q PONG; then
  ok "Redis 正常"
else
  bad "Redis 无响应"
fi

if docker compose -f docker-compose.yml exec -T minio sh -c 'ls /data >/dev/null 2>&1' 2>/dev/null; then
  ok "MinIO 容器可读数据目录"
else
  warn "MinIO 检查未通过（镜像可能不含 shell，属正常）"
fi

# ---------------------------------------------------------------------------
# 6. HTTPS 证书
# ---------------------------------------------------------------------------
if [[ -n "${PORTAL_DOMAIN:-}" ]] && command -v openssl >/dev/null; then
  end=$(echo | timeout 10 openssl s_client -servername "$PORTAL_DOMAIN" \
        -connect "${PORTAL_DOMAIN}:443" 2>/dev/null | openssl x509 -noout -enddate 2>/dev/null | cut -d= -f2)
  if [[ -n "$end" ]]; then
    days=$(( ($(date -d "$end" +%s) - $(date +%s)) / 86400 ))
    if   [[ "$days" -le 7  ]]; then bad "证书 ${days} 天后到期（$end）"
    elif [[ "$days" -le 21 ]]; then warn "证书 ${days} 天后到期"
    else ok "证书有效，剩余 ${days} 天"; fi
  else
    warn "证书检查失败（域名未解析/未起 caddy？备案中可忽略）"
  fi
fi

# ---------------------------------------------------------------------------
# 7. 备份新鲜度
# ---------------------------------------------------------------------------
check_fresh() {
  local file=$1 label=$2 max_age=$3
  if [[ ! -f "$file" ]]; then
    bad "$label：没有任何成功记录"
    return
  fi
  local last age_h
  last=$(cat "$file" 2>/dev/null | tr -dc '0-9')
  [[ -n "$last" ]] || { bad "$label：记录损坏"; return; }
  age_h=$(( ($(date +%s) - last) / 3600 ))
  if   [[ "$age_h" -gt "$max_age" ]]; then bad "$label：已 ${age_h} 小时未成功（阈值 ${max_age}h）"
  else ok "$label：${age_h} 小时前成功"; fi
}
check_fresh "$BACKUP_DIR/.last-pg-backup"       "PG 备份"   26
check_fresh "$BACKUP_DIR/.last-assets-backup"   "资产备份"  192
check_fresh "$BACKUP_DIR/.last-drill"           "恢复演练"  840

# ---------------------------------------------------------------------------
# 输出
# ---------------------------------------------------------------------------
if [[ "$QUIET" -eq 1 && "$FAILS" -eq 0 && "$WARNS" -eq 0 ]]; then
  exit 0
fi

echo "════════════════════════════════════════════════════"
echo " 体检 $(date '+%F %T')   ❌ ${FAILS}  ⚠️ ${WARNS}"
echo "════════════════════════════════════════════════════"
printf '%s\n' "${LINES[@]}"

if [[ "$FAILS" -gt 0 ]]; then
  logger -t rlc-health "体检失败：${FAILS} 项 FAIL，${WARNS} 项 WARN" || true
  if [[ -n "${ALERT_WEBHOOK:-}" ]]; then
    body=$(printf '%s\n' "${LINES[@]}" | grep -E '❌|⚠️' | head -10)
    curl -fsS -m 10 -X POST -H 'Content-Type: application/json' \
      -d "$(jq -nc --arg t "🚨 服务器体检失败（${FAILS} 项）
$body" '{msgtype:"text",text:{content:$t}}')" "$ALERT_WEBHOOK" >/dev/null 2>&1 || true
  fi
  exit 1
fi

[[ "$WARNS" -gt 0 ]] && exit 2
exit 0
