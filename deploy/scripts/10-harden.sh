#!/usr/bin/env bash
# ============================================================================
# 阶段 4–5 · SSH 加固 + 防火墙 + fail2ban
#
# 用法（root）：
#   sudo bash scripts/10-harden.sh
#
# 安全闸门：
#   - deploy 的 authorized_keys 为空 → 直接退出，不改任何配置
#   - sshd -t 语法检查失败 → 自动回滚
#   - 改完用 reload 而不是 restart，不断开当前连接
#
# 执行完不要马上关当前终端！另开一个窗口验证能登录，再关。
# ============================================================================
set -Eeuo pipefail

readonly DEPLOY_USER="deploy"
readonly DROPIN="/etc/ssh/sshd_config.d/00-rlc-hardening.conf"
readonly BACKUP="/root/sshd_config.bak.$(date +%Y%m%d%H%M%S)"

log()  { printf '\033[1;34m[harden]\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m[warn]\033[0m %s\n' "$*"; }
die()  { printf '\033[1;31m[fail]\033[0m %s\n' "$*" >&2; exit 1; }

[[ $EUID -eq 0 ]] || die "必须用 root 执行：sudo bash $0"

# ---------------------------------------------------------------------------
# 0. 安全闸门：没有公钥就别动 SSH
# ---------------------------------------------------------------------------
KEYFILE="/home/$DEPLOY_USER/.ssh/authorized_keys"
if [[ ! -s "$KEYFILE" ]]; then
  die "$KEYFILE 是空的。先推公钥（见 runbook 阶段 4），否则加固后你会被锁在门外。"
fi
log "$DEPLOY_USER 已有 $(wc -l < "$KEYFILE") 条公钥"

# ---------------------------------------------------------------------------
# 1. SSH 加固
# ---------------------------------------------------------------------------
log "备份原配置到 $BACKUP"
cp -a /etc/ssh/sshd_config "$BACKUP"

# 云镜像常带 50-cloud-init.conf，里面写死 PasswordAuthentication yes。
# sshd 是「先读到的值生效」，而 Include 在主配置最顶部，所以按文件名排序先命中的赢。
# 我们的文件叫 00-，排在最前，能覆盖它；但仍然把 cloud-init 那份停掉，双重保险。
if [[ -f /etc/ssh/sshd_config.d/50-cloud-init.conf ]]; then
  if grep -qiE '^\s*PasswordAuthentication\s+yes' /etc/ssh/sshd_config.d/50-cloud-init.conf; then
    log "停用 50-cloud-init.conf（它允许密码登录，会覆盖加固）"
    mv /etc/ssh/sshd_config.d/50-cloud-init.conf \
       /etc/ssh/sshd_config.d/50-cloud-init.conf.disabled
  fi
fi

log "写入 $DROPIN"
cat > "$DROPIN" <<EOF
# 由 scripts/10-harden.sh 生成，勿手改；改脚本再跑一遍

PermitRootLogin no
PasswordAuthentication no
KbdInteractiveAuthentication no
PubkeyAuthentication yes
PermitEmptyPasswords no
MaxAuthTries 3
MaxSessions 10
LoginGraceTime 30
ClientAliveInterval 300
ClientAliveCountMax 2
AllowUsers $DEPLOY_USER
X11Forwarding no
AllowAgentForwarding no
AllowTcpForwarding yes
EOF

log "校验配置语法"
if ! sshd -t; then
  warn "sshd -t 失败，回滚"
  rm -f "$DROPIN"
  cp -a "$BACKUP" /etc/ssh/sshd_config
  die "已回滚，未做任何改动"
fi

log "重载 sshd（不重启，当前连接不断）"
systemctl reload ssh 2>/dev/null || systemctl reload sshd

# ---------------------------------------------------------------------------
# 2. 防火墙
# ---------------------------------------------------------------------------
log "配置 ufw"
ufw --force reset >/dev/null
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp   comment 'ssh'
ufw allow 80/tcp   comment 'http (acme + redirect)'
ufw allow 443/tcp  comment 'https'
ufw allow 443/udp  comment 'http/3'
ufw --force enable
ufw logging low

systemctl enable ufw >/dev/null 2>&1 || true

# ---------------------------------------------------------------------------
# 3. fail2ban
# ---------------------------------------------------------------------------
log "配置 fail2ban"
cat > /etc/fail2ban/jail.d/rlc.local <<'EOF'
[DEFAULT]
# 本机永远不封（防止自己把自己封了）
ignoreip = 127.0.0.1/8 ::1
bantime  = 1h
findtime = 10m
maxretry = 5

[sshd]
enabled = true
port    = ssh
backend = systemd
# Ubuntu 24.04 最小镜像可能没有 /var/log/auth.log，用 systemd 后端最稳
EOF

systemctl enable fail2ban >/dev/null 2>&1 || true
systemctl restart fail2ban
sleep 2

# ---------------------------------------------------------------------------
# 4. 结果
# ---------------------------------------------------------------------------
log "当前状态"
printf '\n--- ufw ---\n'
ufw status verbose | sed 's/^/  /'
printf '\n--- fail2ban ---\n'
fail2ban-client status sshd 2>/dev/null | sed 's/^/  /' || warn "fail2ban 未就绪，稍后 systemctl status fail2ban 看看"
printf '\n--- sshd 生效值 ---\n'
sshd -T 2>/dev/null | grep -E '^(permitrootlogin|passwordauthentication|kbdinteractiveauthentication|pubkeyauthentication|allowusers|maxauthtries) ' | sed 's/^/  /'

cat <<'EOF'

════════════════════════════════════════════════════════════════════
  现在验证（另开一个终端，别关当前这个）：

    ssh -i ~/.ssh/rlc_prod deploy@<SERVER_IP> "echo ok"      # 能进
    ssh root@<SERVER_IP> "echo should-fail"                  # 被拒
    ssh -o PreferredAuthentications=password deploy@<IP>     # 被拒

  三条都对再关旧终端。如果进不去了：
    腾讯云控制台 → 轻量 → 「登录」（网页 VNC），
    然后 rm /etc/ssh/sshd_config.d/00-rlc-hardening.conf && systemctl restart ssh
════════════════════════════════════════════════════════════════════
EOF
