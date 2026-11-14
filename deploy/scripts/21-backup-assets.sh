#!/usr/bin/env bash
# ============================================================================
# 每周 MinIO 资产备份：容器内 tar → 宿主机加密 → 上传 COS
#
# 用法：
#   ./scripts/21-backup-assets.sh
#
# 为什么用 tar 而不是 mc mirror 增量：
#   这个规模（30 人、图片几百 MB）全量 tar 只要几十秒，
#   而增量同步要维护一套远端 alias 和冲突策略，故障面更大。
#   等资产超过 20 GB 再换 mc mirror，那时也差不多该上 COS + CDN 了。
#
# 一致性：tar 期间 MinIO 可能正在写。图片是「只增不改」的资产，最坏情况是
#   少一张刚上传的图，下次备份就补上了。不值得为此停服务。
# ============================================================================
set -Eeuo pipefail
umask 077

readonly SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly REPO_DIR="$(dirname "$SCRIPT_DIR")"
readonly STAMP="$(date +%Y%m%d-%H%M%S)"
readonly VOLUME="rlc_miniodata"

log()  { printf '%s [backup-assets] %s\n' "$(date '+%F %T')" "$*"; }
die()  { printf '%s [backup-assets][FAIL] %s\n' "$(date '+%F %T')" "$*" >&2; alert "资产备份失败：$*"; exit 1; }

alert() {
  local msg="$1"
  logger -t rlc-backup "$msg" || true
  if [[ -n "${ALERT_WEBHOOK:-}" ]]; then
    curl -fsS -m 10 -X POST -H 'Content-Type: application/json' \
      -d "$(jq -nc --arg t "🚨 $msg" '{msgtype:"text",text:{content:$t}}')" \
      "$ALERT_WEBHOOK" >/dev/null || logger -t rlc-backup "告警发送失败"
  fi
}

cd "$REPO_DIR"
[[ -f .env ]] || die "找不到 $REPO_DIR/.env"
set -a; . ./.env; set +a

: "${BACKUP_DIR:=/data/backup}"
: "${BACKUP_KEEP_LOCAL:=7}"
: "${BACKUP_KEEP_REMOTE:=30}"

[[ -n "${AGE_PUBLIC_KEY:-}" ]] || die "AGE_PUBLIC_KEY 为空，拒绝生成明文备份"

readonly ASSET_DIR="$BACKUP_DIR/assets"
readonly TMP_DIR="$(mktemp -d /tmp/rlc-assets-XXXXXX)"
readonly TMP_TAR="$TMP_DIR/assets.tar.gz"
readonly ENC_FILE="$ASSET_DIR/assets_${STAMP}.tar.gz.age"

cleanup() { rm -rf "$TMP_DIR"; }
trap cleanup EXIT

install -d -m 750 "$ASSET_DIR"

if ! docker volume inspect "$VOLUME" >/dev/null 2>&1; then
  die "找不到卷 $VOLUME。MinIO 起过吗？确认 docker-compose.yml 的 project name 仍是 rlc"
fi

# ---------------------------------------------------------------------------
# 1. tar（容器内读卷，stdout 重定向到宿主机，避免产物属主变成 root）
# ---------------------------------------------------------------------------
log "打包卷 $VOLUME"
if ! docker run --rm -v "$VOLUME:/data:ro" alpine:3 \
      tar -czf - -C /data . > "$TMP_TAR"; then
  die "tar 执行失败"
fi

SIZE=$(stat -c %s "$TMP_TAR")
[[ "$SIZE" -gt 100 ]] || die "tar 只有 ${SIZE} 字节，卷可能是空的"
log "打包完成：$(numfmt --to=iec "$SIZE")"

# ---------------------------------------------------------------------------
# 2. 加密
# ---------------------------------------------------------------------------
age -r "$AGE_PUBLIC_KEY" -o "$ENC_FILE" "$TMP_TAR" || die "age 加密失败"
log "已加密：$(basename "$ENC_FILE")（$(numfmt --to=iec "$(stat -c %s "$ENC_FILE")")）"

# ---------------------------------------------------------------------------
# 3. 上传 + 清理
# ---------------------------------------------------------------------------
if [[ -n "${BACKUP_BUCKET:-}" ]]; then
  rclone copy "$ENC_FILE" "${RCLONE_REMOTE:-cos}:${BACKUP_BUCKET}/assets/" \
    || { alert "资产备份上传失败：$(basename "$ENC_FILE")"; exit 1; }
  log "已上传 ${RCLONE_REMOTE:-cos}:${BACKUP_BUCKET}/assets/"
  rclone delete --min-age "${BACKUP_KEEP_REMOTE}d" \
    "${RCLONE_REMOTE:-cos}:${BACKUP_BUCKET}/assets/" >/dev/null 2>&1 || true
fi

find "$ASSET_DIR" -type f -name '*.tar.gz.age' -mtime +"$BACKUP_KEEP_LOCAL" -delete 2>/dev/null || true
date +%s > "$BACKUP_DIR/.last-assets-backup"

log "完成。本地保留：$(find "$ASSET_DIR" -name '*.age' | wc -l) 份"
