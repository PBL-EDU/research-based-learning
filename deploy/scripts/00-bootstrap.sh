#!/usr/bin/env bash
# ============================================================================
# 阶段 3 · 系统初始化
#
# 用法（root）：
#   bash scripts/00-bootstrap.sh
#
# 幂等：可以重复执行。唯一不可逆的操作是格式化数据盘，本脚本不做（只提示）。
# ============================================================================
set -Eeuo pipefail

readonly SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly REPO_DIR="$(dirname "$SCRIPT_DIR")"
readonly DEPLOY_USER="deploy"
readonly HOSTNAME_WANTED="rlc-prod"
readonly SWAP_SIZE="4G"

log()  { printf '\033[1;34m[bootstrap]\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m[warn]\033[0m %s\n' "$*"; }
die()  { printf '\033[1;31m[fail]\033[0m %s\n' "$*" >&2; exit 1; }

trap 'die "第 $LINENO 行失败，已中断。修好再跑，脚本可重复执行。"' ERR

[[ $EUID -eq 0 ]] || die "必须用 root 执行：sudo bash $0"

export DEBIAN_FRONTEND=noninteractive
export NEEDRESTART_MODE=a

# ---------------------------------------------------------------------------
# 1. 系统更新与基础工具
# ---------------------------------------------------------------------------
log "更新软件源并升级已安装包"
apt-get update -qq
apt-get -y -o Dpkg::Options::=--force-confdef -o Dpkg::Options::=--force-confold upgrade

log "安装基础工具"
apt-get -y install --no-install-recommends \
  curl ca-certificates gnupg lsb-release apt-transport-https \
  ufw fail2ban chrony jq htop ncdu tree unzip rsync \
  age rclone logrotate cron

# ---------------------------------------------------------------------------
# 2. 时区与主机名
# ---------------------------------------------------------------------------
log "设置时区 Asia/Shanghai"
timedatectl set-timezone Asia/Shanghai
systemctl enable --now chrony >/dev/null 2>&1 || warn "chrony 启动失败，时间可能漂移"

if [[ "$(hostname)" != "$HOSTNAME_WANTED" ]]; then
  log "设置主机名 $HOSTNAME_WANTED"
  hostnamectl set-hostname "$HOSTNAME_WANTED"
fi

# ---------------------------------------------------------------------------
# 3. swap（2C4G 上防 OOM 的关键一步，见 README §2.3）
# ---------------------------------------------------------------------------
if swapon --show | grep -q .; then
  log "swap 已存在（$(free -h | awk '/Swap:/{print $2}')），跳过"
else
  log "创建 $SWAP_SIZE swapfile"
  if [[ ! -f /swapfile ]]; then
    fallocate -l "$SWAP_SIZE" /swapfile || dd if=/dev/zero of=/swapfile bs=1M count=4096 status=progress
  fi
  chmod 600 /swapfile
  mkswap /swapfile >/dev/null
  swapon /swapfile
  grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

# ---------------------------------------------------------------------------
# 4. 内核参数（PG / Redis / MinIO 需要）
# ---------------------------------------------------------------------------
log "写入 sysctl 参数"
cat > /etc/sysctl.d/99-rlc.conf <<'EOF'
# PostgreSQL / Redis 建议
vm.overcommit_memory = 1
vm.swappiness = 10
net.core.somaxconn = 1024
fs.file-max = 100000

# 容器网络
net.ipv4.ip_forward = 1
net.bridge.bridge-nf-call-iptables = 1
EOF
sysctl --system >/dev/null

# ---------------------------------------------------------------------------
# 5. 运维用户
# ---------------------------------------------------------------------------
if id "$DEPLOY_USER" &>/dev/null; then
  log "用户 $DEPLOY_USER 已存在"
else
  log "创建运维用户 $DEPLOY_USER"
  adduser --disabled-password --gecos "" "$DEPLOY_USER"
  usermod -aG sudo "$DEPLOY_USER"
  # 允许 deploy 免密 sudo（单机运维，密钥已保护登录；如需密码可删这行）
  echo "$DEPLOY_USER ALL=(ALL) NOPASSWD:ALL" > "/etc/sudoers.d/90-$DEPLOY_USER"
  chmod 440 "/etc/sudoers.d/90-$DEPLOY_USER"
  visudo -cf "/etc/sudoers.d/90-$DEPLOY_USER" >/dev/null
fi

install -d -m 700 -o "$DEPLOY_USER" -g "$DEPLOY_USER" "/home/$DEPLOY_USER/.ssh"
touch "/home/$DEPLOY_USER/.ssh/authorized_keys"
chown "$DEPLOY_USER:$DEPLOY_USER" "/home/$DEPLOY_USER/.ssh/authorized_keys"
chmod 600 "/home/$DEPLOY_USER/.ssh/authorized_keys"

# ---------------------------------------------------------------------------
# 6. 数据盘与目录
# ---------------------------------------------------------------------------
if mountpoint -q /data; then
  log "/data 已挂载"
  DATA_ROOT=/data
else
  warn "/data 未挂载。本次先把数据放在 /opt/data，等你挂好数据盘后再迁。"
  warn "挂盘参考（先 lsblk -f 确认是空盘，再 mkfs）："
  warn "  mkfs.ext4 /dev/vdb && mkdir -p /data &&"
  warn "  echo '/dev/vdb /data ext4 defaults,noatime 0 2' >> /etc/fstab && mount -a"
  DATA_ROOT=/opt/data
fi

log "创建目录（数据根：$DATA_ROOT）"
install -d -m 755 "$DATA_ROOT"
install -d -m 755 "$DATA_ROOT/docker"
install -d -m 750 -o "$DEPLOY_USER" -g "$DEPLOY_USER" "$DATA_ROOT/backup"
install -d -m 755 /opt/rlc
install -d -m 755 /var/log/rlc
install -d -m 755 /var/lock
# 让 deploy 能直接编辑 /opt/rlc 下的配置和脚本，不用每次 sudo
chown -R "$DEPLOY_USER:$DEPLOY_USER" /var/log/rlc /opt/rlc

# ---------------------------------------------------------------------------
# 7. Docker
# ---------------------------------------------------------------------------
if command -v docker &>/dev/null; then
  log "Docker 已安装：$(docker --version)"
else
  log "安装 Docker（优先 Ubuntu 软件源，失败再走官方脚本）"
  if ! apt-get -y install docker.io docker-compose-v2 >/dev/null 2>&1; then
    warn "apt 源安装失败，改用 get.docker.com"
    curl -fsSL https://get.docker.com | bash -s docker --mirror Aliyun
  fi
fi

log "写入 /etc/docker/daemon.json"
install -d -m 755 /etc/docker
cat > /etc/docker/daemon.json <<EOF
{
  "registry-mirrors": ["https://mirror.ccs.tencentyun.com"],
  "data-root": "$DATA_ROOT/docker",
  "log-driver": "json-file",
  "log-opts": { "max-size": "10m", "max-file": "5" },
  "live-restore": true,
  "default-address-pools": [
    { "base": "172.31.0.0/16", "size": 24 }
  ]
}
EOF

systemctl daemon-reload
systemctl enable --now docker
systemctl restart docker

usermod -aG docker "$DEPLOY_USER"

if ! docker compose version &>/dev/null; then
  log "安装 docker compose 插件"
  apt-get -y install docker-compose-plugin || {
    mkdir -p /usr/local/lib/docker/cli-plugins
    curl -fsSL "https://github.com/docker/compose/releases/latest/download/docker-compose-linux-$(uname -m)" \
      -o /usr/local/lib/docker/cli-plugins/docker-compose
    chmod +x /usr/local/lib/docker/cli-plugins/docker-compose
  }
fi

# ---------------------------------------------------------------------------
# 8. 自动安全更新
# ---------------------------------------------------------------------------
log "启用无人值守安全更新（只装安全补丁，不自动重启）"
cat > /etc/apt/apt.conf.d/20auto-upgrades <<'EOF'
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
APT::Periodic::AutocleanInterval "7";
EOF
cat > /etc/apt/apt.conf.d/51unattended-upgrades-rlc <<'EOF'
Unattended-Upgrade::Automatic-Reboot "false";
Unattended-Upgrade::Remove-Unused-Kernel-Packages "true";
Unattended-Upgrade::Remove-Unused-Dependencies "true";
EOF
systemctl enable --now unattended-upgrades >/dev/null 2>&1 || warn "unattended-upgrades 未启动"

# ---------------------------------------------------------------------------
# 9. 日志轮转（脚本日志）
# ---------------------------------------------------------------------------
cat > /etc/logrotate.d/rlc <<'EOF'
/var/log/rlc/*.log {
    daily
    rotate 30
    compress
    delaycompress
    missingok
    notifempty
    copytruncate
}
EOF

# ---------------------------------------------------------------------------
# 10. 自检
# ---------------------------------------------------------------------------
log "自检结果"
printf '  %-14s %s\n' "docker"   "$(docker --version 2>/dev/null || echo 缺失)"
printf '  %-14s %s\n' "compose"  "$(docker compose version --short 2>/dev/null || echo 缺失)"
printf '  %-14s %s\n' "内存"     "$(free -h | awk '/Mem:/{print $2}')"
printf '  %-14s %s\n' "swap"     "$(free -h | awk '/Swap:/{print $2}')"
printf '  %-14s %s\n' "数据盘"   "$(df -h "$DATA_ROOT" | awk 'NR==2{print $2" 挂载于 "$6}')"
printf '  %-14s %s\n' "时区"     "$(timedatectl show -p Timezone --value)"
printf '  %-14s %s\n' "SSH 公钥" "$(wc -l < /home/$DEPLOY_USER/.ssh/authorized_keys) 条"

if [[ ! -s /home/$DEPLOY_USER/.ssh/authorized_keys ]]; then
  warn "deploy 用户还没有公钥。请先从本机推公钥，再执行 10-harden.sh（否则会把自己锁在外面）。"
fi

cat <<EOF

下一步：
  1) 推公钥（本机）：
       type \$HOME\\.ssh\\rlc_prod.pub | ssh root@<SERVER_IP> "cat >> /home/$DEPLOY_USER/.ssh/authorized_keys"
  2) 验证能用 deploy 登录并 sudo：
       ssh -i ~/.ssh/rlc_prod $DEPLOY_USER@<SERVER_IP> "sudo whoami"
  3) 再执行加固：
       cd /opt/rlc && sudo bash scripts/10-harden.sh

EOF
