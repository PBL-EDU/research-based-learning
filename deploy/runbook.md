# 部署 Runbook · 研究性学习社区

> 配套文档：[README.md](./README.md)（选型与成本）。本文件是**操作手册**，按阶段执行，每阶段都有验证点。
> 约定：`<SERVER_IP>` 服务器公网 IP，`<DOMAIN>` 主域名，`deploy` 运维账号。
> 全程使用 Ubuntu 24.04 LTS。

---

## 阶段 0 · 决策与账号（第 1 天）

- [ ] 拍板备案主体：A（机构）还是 B（个人 + 班内可见），见 README §1.4
- [ ] 腾讯云账号完成**企业/个人实名认证**（未实名买不了、备不了案）
- [ ] 创建**子账号** `ops-deploy`：只授 `LighthouseFullAccess` + `COSFullAccess` + `MonitorFullAccess`，开 MFA
  - 控制台 → 访问管理 → 用户 → 新建用户 → 编程访问 + 控制台访问
  - **不要用主账号登录服务器**，主账号只用来付款
- [ ] 开启**自动续费**（控制台 → 费用中心 → 续费管理）
- [ ] 日历提醒：到期前 30 天、前 7 天

**验证**：子账号能登录控制台，但看不到「费用」以外的全局设置。

---

## 阶段 1 · 域名（第 1 天，与阶段 0 并行）

```bash
# 在腾讯云「域名注册」买，避免跨平台实名/备案来回跑
# 首选 .com（¥75/年，续费 ¥85）；.cn 更便宜但个人主体审核更严
```

- [ ] 注册域名 → 立即做**实名认证**（上传身份证，1 个工作日内通过）
- [ ] 实名通过后**等满 3 个工作日**再提交备案（工信部硬性要求，系统会校验）
- [ ] 记录域名注册商账号（后面配 DNS 用）

**验证**：`whois <DOMAIN>` 显示 registrant 为你本人/单位，状态 `clientTransferProhibited`（防转移锁）。

---

## 阶段 2 · 买机器（10 分钟）

控制台 → 轻量应用服务器 → 新建：

| 项 | 值 |
|---|---|
| 地域 | 上海 / 广州 / 北京（按学生分布） |
| 镜像 | Ubuntu 24.04 LTS 64bit |
| 套餐 | 2C4G，峰值 6 Mbps，月流量 1000 GB |
| 系统盘 | 60 GB 起（套餐自带） |
| 数据盘 | **100 GB** |
| 时长 | **1 年**（月付备案会被拒：多数接入商要求剩余时长 ≥3 个月，且不支持备案） |
| 实例名 | `rlc-prod` |

买完立刻做三件事：

1. **记录公网 IP** → 这就是微信白名单要填的 IP，写进 `.env` 的 `WECHAT_EGRESS_IP`
2. **重置 root 密码**（控制台 → 重置密码），只用于首次登录
3. **配置防火墙（安全组）**：

| 端口 | 来源 | 用途 |
|---|---|---|
| 22/tcp | 0.0.0.0/0 | SSH（阶段 4 会改成密钥登录） |
| 80/tcp | 0.0.0.0/0 | HTTP（Caddy ACME + 跳转） |
| 443/tcp | 0.0.0.0/0 | HTTPS |
| 其余 | — | **全部拒绝** |

> 不要把 3000/4000/5432/6379/9000 开出去。容器端口只在 Docker 内网暴露，公网只认 80/443。

**验证**：本机 `Test-NetConnection <SERVER_IP> -Port 22` 通；`-Port 5432` 不通。

---

## 阶段 3 · 系统初始化（15 分钟）

先把部署包推上去（本机 Windows）：

```powershell
# 在仓库根目录执行；脚本会排除 .env（密钥不落盘到仓库）
.\deploy\scripts\90-push-from-windows.ps1 -ServerIp <SERVER_IP> -User root
```

然后 SSH 登录执行 bootstrap：

```bash
ssh root@<SERVER_IP>
cd /opt/rlc
bash scripts/00-bootstrap.sh
```

脚本做的事（可反复执行，幂等）：

| # | 动作 | 说明 |
|---|---|---|
| 1 | `apt update && apt upgrade` | 打齐安全补丁 |
| 2 | 时区 `Asia/Shanghai`、主机名 `rlc-prod` | 日志时间对得上 |
| 3 | 4 GB swap + `vm.swappiness=10` | 防 OOM，见 README §2.3 |
| 4 | sysctl：`somaxconn`、`file-max`、`overcommit_memory` | PG / Redis / MinIO 需要 |
| 5 | 创建 `deploy` 用户 + sudo + `~/.ssh` | 后续全部用它 |
| 6 | 安装 Docker + compose 插件（阿里云镜像源） | 国内直连 docker.com 会超时 |
| 7 | 写 `/etc/docker/daemon.json` | 镜像加速、日志限 10 MB×5、`data-root=/data/docker`、`live-restore` |
| 8 | 建目录 `/opt/rlc`、`/data/{docker,pg,minio,backup}` | |
| 9 | 开 `unattended-upgrades`（只装安全更新，不自动重启） | |
| 10 | 装 `age rclone ufw fail2ban jq htop` | 备份/防火墙/排障 |

**验证**：

```bash
docker version --format '{{.Server.Version}}'   # 有输出
docker compose version                           # v2.x
free -h                                          # Swap 有 4.0Gi
df -h /data                                      # 有 100G 数据盘
timedatectl | grep 'Time zone'                   # Asia/Shanghai
```

**数据盘没挂上怎么办**（脚本会提示，不会自动格式化——格式化错了没法救）：

```bash
lsblk                                   # 确认空盘设备名，通常是 /dev/vdb
mkfs.ext4 /dev/vdb
mkdir -p /data
echo '/dev/vdb /data ext4 defaults,noatime 0 2' >> /etc/fstab
mount -a && df -h /data
```

> **只在确认该盘无数据时执行 `mkfs`。** 先 `lsblk -f` 看有没有文件系统。

**回滚**：阶段 3 无破坏性操作，唯一不可逆的是 `mkfs`。做之前 `lsblk -f` 确认。

---

## 阶段 4 · SSH 加固（10 分钟）

先在本机生成密钥（**不要**用已有密钥，专用一把）：

```powershell
ssh-keygen -t ed25519 -a 100 -C "rlc-prod-deploy" -f $HOME\.ssh\rlc_prod
# 设置 passphrase，至少 12 位
```

推公钥：

```powershell
type $HOME\.ssh\rlc_prod.pub | ssh root@<SERVER_IP> "mkdir -p /home/deploy/.ssh && cat >> /home/deploy/.ssh/authorized_keys && chown -R deploy:deploy /home/deploy/.ssh && chmod 700 /home/deploy/.ssh && chmod 600 /home/deploy/.ssh/authorized_keys"
```

**先验证再加固**（顺序错了会把自己锁在外面）：

```powershell
ssh -i $HOME\.ssh\rlc_prod deploy@<SERVER_IP> "sudo whoami"   # 必须输出 root
```

验证通过后：

```bash
ssh -i ~/.ssh/rlc_prod deploy@<SERVER_IP>
cd /opt/rlc && sudo bash scripts/10-harden.sh
```

脚本做的事：

| 项 | 值 |
|---|---|
| `PermitRootLogin` | `no` |
| `PasswordAuthentication` | `no` |
| `KbdInteractiveAuthentication` | `no` |
| `PubkeyAuthentication` | `yes` |
| `MaxAuthTries` | 3 |
| `ClientAliveInterval` | 300 |
| `AllowUsers` | `deploy` |
| ufw | 默认拒绝入站，只放 22/80/443 |
| fail2ban | sshd 5 次失败封 1 小时 |

脚本自带保护：`authorized_keys` 为空则**直接退出不执行**；`sshd -t` 语法检查失败自动回滚。

**验证（必须另开一个终端，不要关掉当前这个）**：

```powershell
ssh -i $HOME\.ssh\rlc_prod deploy@<SERVER_IP> "echo ok"          # 能进
ssh root@<SERVER_IP> "echo should-fail"                           # 应被拒
ssh -o PreferredAuthentications=password deploy@<SERVER_IP>       # 应被拒
```

三条都对，才关掉旧终端。

**回滚**：腾讯云控制台 → 轻量 → 「登录」（VNC 网页终端）可以绕过 SSH 进去改配置。

**本机 SSH 别名**（省得每次打一长串）：

```
# C:\Users\<you>\.ssh\config
Host rlc
    HostName <SERVER_IP>
    User deploy
    IdentityFile ~/.ssh/rlc_prod
    ServerAliveInterval 30
    ServerAliveCountMax 3
```

之后 `ssh rlc` 即可。

---

## 阶段 5 · 防火墙双保险（5 分钟）

安全组是主防线，`ufw` 是第二道。阶段 4 已配 ufw，这里只做验证和补规则：

```bash
sudo ufw status verbose        # 应显示 active，22/80/443 allow
sudo systemctl status fail2ban # active (running)
sudo fail2ban-client status sshd
```

**一个必须知道的坑**：Docker 发布的端口会**绕过 ufw**（它直接写 iptables 的 `DOCKER` 链）。所以不能靠 ufw 挡数据库端口，必须靠「compose 里不 publish 端口」。本项目的 compose 只 publish 80/443，其余服务只在 `internal` 网络里，符合要求。

**验证**：从本机 `Test-NetConnection <SERVER_IP> -Port 5432` 应失败。

---

## 阶段 6 · 目录与配置（10 分钟）

```bash
cd /opt/rlc
cp .env.example .env
chmod 600 .env

# 生成三类密钥（用 hex，避免 @ : / 破坏 DATABASE_URL）
openssl rand -hex 24   # → POSTGRES_PASSWORD
openssl rand -hex 24   # → REDIS_PASSWORD
openssl rand -hex 24   # → MINIO_ROOT_PASSWORD
openssl rand -hex 32   # → JWT_SECRET
openssl rand -hex 32   # → SESSION_SECRET

nano .env     # 填入上面五个 + PORTAL_DOMAIN + API_DOMAIN + FILES_DOMAIN + ACME_EMAIL

# 同步 DATABASE_URL / REDIS_URL 里的占位符
sed -i "s|__PG__|$(grep '^POSTGRES_PASSWORD=' .env | cut -d= -f2)|; \
        s|__REDIS__|$(grep '^REDIS_PASSWORD=' .env | cut -d= -f2)|" .env
grep -E 'DATABASE_URL|REDIS_URL' .env
```

**备份加密密钥**（age）：

```bash
sudo install -d -m 750 /etc/rlc
sudo age-keygen -o /etc/rlc/age.key
sudo chown root:deploy /etc/rlc/age.key
sudo chmod 640 /etc/rlc/age.key
sudo grep 'public key' /etc/rlc/age.key      # age1... → 填进 .env 的 AGE_PUBLIC_KEY
```

关于私钥放哪，这里有个真实的取舍，必须说清：

| 放法 | 好处 | 代价 |
|---|---|---|
| 只在服务器（本方案） | 每日备份和每月演练能自动解密，无人值守 | 服务器被拿下 = 历史备份也失守 |
| 只离线 | 服务器失守也读不到备份 | **没人能自动演练 → 演练必然荒废 → 备份等于没有** |
| 服务器 + 离线各一份（**推荐**） | 自动演练能跑，机器没了也能恢复 | 多一步复制 |

所以：**服务器上留一份**（`root:deploy 0640`，只有 `deploy` 能读），**同时抄一份到密码管理器或纸上离线保存**。前者保证自动化跑得通，后者保证「机器没了」时还能解开 COS 里的备份。密钥不进 COS、不进 git、不进聊天。

```bash
# 抄完之后确认：COS 里只有密文，没有密钥
rclone ls cos:rlc-backup-xxxx/ | grep -i 'age.key' && echo "有问题！" || echo "干净"
```

**验证**：`docker compose config --quiet` 无报错（说明 .env 变量都齐了）。

---

## 阶段 7 · 起基础设施（10 分钟）

```bash
cd /opt/rlc
docker compose -f docker-compose.yml up -d
docker compose ps
```

预期三个容器 `healthy`：`rlc-postgres`、`rlc-redis`、`rlc-minio`。

```bash
# PG
docker compose exec postgres psql -U rlc -d rlc -c '\dx'      # 应有 pg_trgm / citext
# Redis
docker compose exec redis sh -c 'redis-cli --no-auth-warning -a "$REDIS_PASSWORD" ping'   # PONG
# MinIO
docker compose exec minio sh -c 'ls /data'                     # 空目录正常
```

建桶（用一次性 mc 容器，不常驻）：

```bash
set -a; . ./.env; set +a
docker run --rm --network rlc_internal \
  -e MC_HOST_local="http://${MINIO_ROOT_USER}:${MINIO_ROOT_PASSWORD}@minio:9000" \
  --entrypoint sh minio/mc -c "
    mc mb --ignore-existing local/${MINIO_BUCKET};
    mc anonymous set none local/${MINIO_BUCKET};
    mc ls local"
```

**验证**：`mc ls local` 能看到桶；`mc anonymous get local/<bucket>` 返回 `none`（私有，符合 P0 验收 A8）。

**回滚**：`docker compose down`（保留卷）；彻底重来 `docker compose down -v`（**会删数据**）。

---

## 阶段 8 · 提交 ICP 备案（材料 2 小时，等待 2–4 周）

**这是关键路径，第 2 天就该交。** 控制台 → 备案 → 首次备案。

材料清单：

| 项 | 说明 |
|---|---|
| 主体证件 | 个人：身份证正反面。机构：营业执照/事业单位法人证书 + 法人身份证 |
| 网站负责人 | 身份证 + 手机号 + 邮箱（要收核验短信） |
| 域名证书 | 注册商后台下载 |
| 网站名称 | 「XX 研究性学习辅助平台」——**不要**含「社区」「论坛」「博客」「中国」「全国」 |
| 网站内容 | 「面向中学生研究性学习课程的教学辅助平台，提供文献卡片展示与班级内讨论，邀请制，不开放公众注册」 |
| 服务内容 | 非经营性 |
| 人脸核验 | 腾讯云 App 扫脸 |

时间线（经验值）：

```
D0   提交
D1-2 腾讯云初审（可能打回补材料，常见：网站名称不合规、内容描述太泛）
D2   提交管局
D3-20 管局审核（上海/广东约 5-10 个工作日，个别省 20 天）
```

**备案期间可以做**：写代码、内测（SSH 隧道，见阶段 9）、配备份。

**备案期间不能做**：起 Caddy 对外服务（80/443 会被拦，Let's Encrypt 验证必失败并触发速率限制）。

---

## 阶段 9 · 域名解析 + HTTPS（备案通过后，30 分钟）

DNS 加三条 A 记录（腾讯云 DNSPod）。子域名随主域名备案，不用单独备案：

| 主机记录 | 类型 | 值 | 用途 | TTL |
|---|---|---|---|---|
| `community` | A | `<SERVER_IP>` | 门户 | 600 |
| `api` | A | `<SERVER_IP>` | 插件用的 API | 600 |
| `files` | A | `<SERVER_IP>` | MinIO 预签名 URL（必须独立子域名，见下） | 600 |

> **为什么 `files` 必须单独一个子域名**：SigV4 预签名把 Host 和路径都算进签名。如果拿 `files.xxx` 签名却走 `community.xxx/files/...` 访问，Host 和路径都变了，MinIO 会返回 `SignatureDoesNotMatch`，图片全挂。独立子域名 + Caddy 原样反代（`handle_path` 会剥路径，所以用 `reverse_proxy`），签名和访问才一致。

验证解析生效：

```powershell
Resolve-DnsName community.<DOMAIN>   # 应返回 SERVER_IP
Resolve-DnsName files.<DOMAIN>       # 应返回 SERVER_IP
```

起全栈（先确认 `.env` 里三个域名已改）：

```bash
cd /opt/rlc
docker compose -f docker-compose.yml -f docker-compose.app.yml up -d
docker compose logs -f caddy     # 看证书签发
```

> 如果应用镜像还没构建好（服务端仍在开发），只想先验证证书，用 `--no-deps` 只起 Caddy：
> ```bash
> docker compose -f docker-compose.yml -f docker-compose.app.yml up -d --no-deps caddy
> ```
> 此时访问域名会得到 502，但证照能签下来、能验证 80/443 通不通——这就够了。等应用镜像就绪再 `up -d` 全量。

Caddy 会自动申请 Let's Encrypt 证书（HTTP-01）。首次约 10–30 秒。

**验证**：

```bash
curl -sI https://community.<DOMAIN> | head -3          # 200/301
curl -sI https://api.<DOMAIN>/api/healthz              # 200（服务端就绪后）
echo | openssl s_client -servername community.<DOMAIN> -connect community.<DOMAIN>:443 2>/dev/null \
  | openssl x509 -noout -dates                          # 90 天有效期
```

**证书失败排查**（按顺序）：

| 现象 | 原因 | 处理 |
|---|---|---|
| `connection refused` :80 | 安全组没开 80 / ufw 挡了 | 查两处 |
| `404` on `/.well-known/acme-challenge/` | 域名解析没生效或指错机器 | `dig` 确认 |
| `timeout` | 备案未通过，80 被接入商拦 | 等备案，别重试 |
| `too many failed authorizations` | 重试太多次触发限流 | 停 1 小时再试，或换 DNS-01 |

**备案期间的内测方式**（不暴露公网）：临时给 portal 加 `ports: ["127.0.0.1:8080:3000"]`，然后本机

```powershell
ssh -L 8080:127.0.0.1:8080 rlc
# 浏览器打开 http://127.0.0.1:8080
```

内测完记得删掉这行 `ports`。

---

## 阶段 10 · 备份（1 小时，必须做恢复演练）

### 10.1 配 COS 远端

控制台建桶：`rlc-backup-<随机后缀>`，地域**与服务器同地域**，权限**私有读写**，开**服务端加密**。

建子账号 `rlc-backup`，只授这一个桶（策略见附录 A），拿 SecretId/SecretKey。

服务器上配 rclone：

```bash
rclone config create cos s3 \
  provider=Other \
  access_key_id=<SecretId> \
  secret_access_key=<SecretKey> \
  endpoint=cos.ap-shanghai.myqcloud.com \
  region=ap-shanghai \
  acl=private

rclone lsd cos:                          # 列出桶
echo test > /tmp/t.txt && rclone copy /tmp/t.txt cos:rlc-backup-xxx/ && rclone delete cos:rlc-backup-xxx/t.txt
```

### 10.2 装定时任务

```bash
sudo mkdir -p /var/log/rlc /var/lock
sudo cp scripts/crontab.example /etc/cron.d/rlc
sudo chmod 644 /etc/cron.d/rlc
sudo chown root:root /etc/cron.d/rlc
```

内容：

```
0  3 * * *   deploy  flock -n /var/lock/rlc-pg.lock      /opt/rlc/scripts/20-backup-pg.sh      >> /var/log/rlc/backup.log 2>&1
30 3 * * 0   deploy  flock -n /var/lock/rlc-assets.lock  /opt/rlc/scripts/21-backup-assets.sh  >> /var/log/rlc/backup.log 2>&1
0  4 * * *   deploy  flock -n /var/lock/rlc-health.lock  /opt/rlc/scripts/40-healthcheck.sh    >> /var/log/rlc/health.log 2>&1
15 4 1 * *   deploy  flock -n /var/lock/rlc-drill.lock   /opt/rlc/scripts/30-restore-pg.sh --drill >> /var/log/rlc/drill.log 2>&1
```

### 10.3 立刻手动跑一次

```bash
/opt/rlc/scripts/20-backup-pg.sh
/opt/rlc/scripts/21-backup-assets.sh
rclone ls cos:rlc-backup-xxx/pg/        # 应有一个 .age 文件
```

### 10.4 恢复演练（**不做这一步，前面全白搭**）

```bash
/opt/rlc/scripts/30-restore-pg.sh --drill
```

脚本会：下载最近备份 → 解密 → 恢复到临时库 `rlc_drill_<时间戳>` → 打印每张表行数 → 删掉临时库。
**期望**：`publications`、`comments` 等表行数与生产一致（空库时全 0 也算通过，说明链路通）。

---

## 阶段 11 · 监控告警（30 分钟）

三层，缺一不可：

| 层 | 工具 | 抓什么 | 成本 |
|---|---|---|---|
| 1 资源 | 腾讯云监控（轻量自带） | CPU>80% 5min、内存>85%、磁盘>80%、实例离线 | 免费 |
| 2 可用性 | 腾讯云「云拨测」或 UptimeRobot 免费版 | `https://community.<DOMAIN>` 每 5 分钟，连续 2 次失败告警 | 免费 |
| 3 业务 | `40-healthcheck.sh` 每日 04:00 | 容器状态、证书剩余天数、**最近备份是否 <26 小时**、磁盘 | 免费 |

告警通道：云监控 → 告警管理 → 通知模板 → 微信/短信/邮件（免费额度内）。

`40-healthcheck.sh` 的告警走 `.env` 里的 `ALERT_WEBHOOK`（企业微信群机器人），格式已适配：

```
https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=xxx
```

> 为什么不用公众号模板消息：个人主体未认证，没有模板消息接口。企业微信群机器人是个人能拿到的最顺的手机推送路径。

**验证**：手动 `sudo systemctl stop docker`，2 分钟内应收到告警；`start` 后收到恢复通知。

---

## 阶段 12 · 上线前检查清单

逐条打勾，有一条没过就不上线：

**安全**
- [ ] root 登录已禁、密码登录已禁、只认密钥
- [ ] ufw active，公网只有 22/80/443
- [ ] 公网扫不到 5432 / 6379 / 9000 / 3000 / 4000
- [ ] `.env` 权限 600，属主 deploy
- [ ] `.env` 没有被提交进 git（`git check-ignore deploy/.env` 有输出）
- [ ] MinIO 桶是 private，图片走预签名 URL
- [ ] age 私钥在服务器上是 `root:deploy 0640`，且另有一份离线副本
- [ ] COS 桶里搜不到任何 `age.key` 文件

**数据**
- [ ] 每日备份跑通，COS 上有文件
- [ ] **恢复演练跑通，表行数对得上**
- [ ] 备份桶用独立子账号，权限只到这一个桶
- [ ] 有一份离线备份在移动硬盘

**合规**
- [ ] 备案号挂在 portal 页脚，链接到 beian.miit.gov.cn
- [ ] 监护人知情同意书已发放并回收
- [ ] 隐私政策页可访问（写明处理者、目的、范围、期限、删除方式）
- [ ] AI 生成内容有显式声明
- [ ] 学生默认 handle 展示，真名不公开

**可用性**
- [ ] HTTPS 证书有效，自动续期（`docker compose logs caddy | grep -i renew`）
- [ ] `https://community.<DOMAIN>` 从手机 4G 能打开
- [ ] 微信 IP 白名单已加 `<SERVER_IP>`
- [ ] 自动续费已开

---

## 日常运维

### 每天（1 分钟）

```bash
ssh rlc '/opt/rlc/scripts/40-healthcheck.sh'
```

### 每周（5 分钟）

```bash
ssh rlc 'docker compose -f /opt/rlc/docker-compose.yml ps'
ssh rlc 'docker stats --no-stream'
ssh rlc 'df -h /data; free -h'
ssh rlc 'tail -50 /var/log/rlc/backup.log'
```

### 每月（15 分钟）

- 恢复演练结果看一眼（`/var/log/rlc/drill.log`）
- 下载一份备份到移动硬盘
- `sudo apt list --upgradable`，有内核/OpenSSL 更新就安排一次重启窗口
- 检查证书剩余天数（healthcheck 已在做）

### 发布新版本

```bash
# 本机
.\deploy\scripts\90-push-from-windows.ps1 -ServerIp <SERVER_IP>

# 服务器
ssh rlc
cd /opt/rlc
./scripts/20-backup-pg.sh                      # 先备份，永远先备份
docker compose -f docker-compose.yml -f docker-compose.app.yml build api portal worker
docker compose -f docker-compose.yml -f docker-compose.app.yml up -d
docker compose ps
curl -fsS https://api.<DOMAIN>/api/healthz
```

**回滚**：`docker compose ... up -d` 之前 `docker tag` 保留上一版镜像，回滚就是 retag + up。或在 `.env` 里固定 `API_TAG`，改回旧 tag 重启。

---

## 应急手册

### E1 · 磁盘满了

```bash
df -h /data
docker system df
docker image prune -af --filter "until=168h"   # 清 7 天前镜像
docker builder prune -af
journalctl --vacuum-time=7d
du -sh /data/backup/* | sort -h                # 备份暂存最大嫌疑
```

**不要**直接 `rm -rf /data/docker/volumes`。先确认是哪个卷。

### E2 · 数据库起不来

```bash
docker compose logs --tail=100 postgres
df -h /data                       # 90% 概率是磁盘满
docker compose exec postgres pg_isready
```

磁盘满导致 PG 崩溃时：清空间 → `docker compose restart postgres`。PG 会自动重放 WAL，通常能自愈。**不要**急着 `pg_resetwal`。

### E3 · 证书没续上

```bash
docker compose logs caddy | grep -i -E 'error|renew|acme'
curl -sI http://community.<DOMAIN>/.well-known/acme-challenge/test   # 应 404，不是超时
```

超时 = 80 端口不通（安全组/备案）。404 = 正常。修好后 `docker compose restart caddy`。

### E4 · 微信返回 40164（IP 不在白名单）

1. 查实际出口 IP：`ssh rlc 'curl -s https://ifconfig.me'`
2. 与 `.env` 的 `WECHAT_EGRESS_IP` 和微信后台白名单比对
3. 若不一致，先查有没有装全局代理：`ss -tunp | grep -E 'clash|v2ray|sing-box'`
4. 更新白名单后，清 Redis 里的 access_token 缓存（`docker compose exec redis redis-cli -a ... del wechat:access_token`）

### E5 · IP 要变（迁移/重建）

1. 微信后台**先加新 IP**，不要删旧 IP
2. 切流量，验证 `GET /cgi-bin/token` 正常
3. 观察 24 小时
4. 再删旧 IP
5. 更新 `.env` 的 `WECHAT_EGRESS_IP` 和监控里的目标地址

### E6 · 学生要删除自己的数据

合规要求「可携带 + 可删除」，但导出哪些表取决于 `identity` 模块的最终建模，所以这一步**由应用层提供管理接口**，不写进 shell 脚本：

1. 先导出：调 `POST /api/admin/users/:id/export`（P3 交付），拿到该学生的卡片、评论、修订的 JSON 包，交给学生/家长
2. 再删除：调 `DELETE /api/admin/users/:id`，走软删 → 30 天后硬删
3. **必须有审计日志**：谁、何时、删了什么范围，写进 `audit_log` 表，保留 6 个月（《网络安全法》第 21 条）

在接口做出来之前，手工处理用：

```bash
# 只读查一下这个人的数据量，确认删除范围（表名按最终 Prisma schema 调整）
docker compose exec postgres psql -U rlc -d rlc -c "
  SELECT 'publications' t, count(*) FROM publication WHERE author_id='<uuid>'
  UNION ALL SELECT 'comments', count(*) FROM comment WHERE author_id='<uuid>';"
```


### E7 · 疑似数据泄露

1. **先断外网，不关机**：安全组只留你本机 IP 的 22 端口
2. 留证据：`docker compose logs > /tmp/incident-$(date +%s).log`，`last`、`/var/log/auth.log`
3. 改所有密钥（PG/Redis/MinIO/JWT/SMTP/微信）
4. 评估影响：哪些表、哪些学生、是否含未满 14 岁
5. 72 小时内向网信/公安报告（若达到报告标准），通知监护人

---

## 附录 A · COS 备份桶最小权限策略

给子账号 `rlc-backup` 绑定这条自定义策略（只允许操作一个桶的前缀）：

```json
{
  "version": "2.0",
  "statement": [
    {
      "effect": "allow",
      "action": [
        "cos:PutObject",
        "cos:GetObject",
        "cos:HeadObject",
        "cos:DeleteObject",
        "cos:GetBucket",
        "cos:HeadBucket"
      ],
      "resource": [
        "qcs::cos:ap-shanghai:uid/<你的APPID>:rlc-backup-xxxx/*"
      ]
    },
    {
      "effect": "allow",
      "action": ["cos:GetService"],
      "resource": ["*"]
    }
  ]
}
```

`<你的APPID>` 在控制台「账号信息」里。**不要**给 `*` 资源，**不要**给 `cos:*`。

---

## 附录 B · 端口清单

| 端口 | 谁 | 对外 | 说明 |
|---|---|---|---|
| 22 | sshd | ✅ | 仅密钥 |
| 80 | caddy | ✅ | ACME + 301 到 443 |
| 443 | caddy | ✅ | 全部业务 |
| 3000 | portal | ❌ | 仅 `rlc_internal` |
| 4000 | api | ❌ | 仅 `rlc_internal` |
| 5432 | postgres | ❌ | 仅 `rlc_internal` |
| 6379 | redis | ❌ | 仅 `rlc_internal` |
| 9000/9001 | minio | ❌ | 仅 `rlc_internal`；控制台用 SSH 隧道 |

MinIO 控制台排障：

```powershell
ssh -L 9001:127.0.0.1:9001 rlc
```

但 compose 里没有 publish 9001，所以要先临时加 `ports: ["127.0.0.1:9001:9001"]`。或者直接用 `mc` 命令行，不需要控制台。

---

## 附录 C · 出站端口（容易被忽略）

| 目标 | 端口 | 用途 |
|---|---|---|
| `api.weixin.qq.com` | 443 | 微信 API（可选通道） |
| SMTP 服务商 | **465** | 邮箱验证码。**不要用 25**：腾讯云/阿里云默认封禁出站 25 |
| `cos.ap-shanghai.myqcloud.com` | 443 | 备份上传 |
| Docker 镜像源 | 443 | 拉镜像 |

若改用阿里云邮件推送：`smtpdm.aliyun.com:465`，需先在控制台验证发信域名（加 SPF/DKIM 解析记录），否则进垃圾箱。
