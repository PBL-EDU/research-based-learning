# ============================================================================
# 从 Windows 本机推送部署包到服务器
#
# 用法：
#   .\deploy\scripts\90-push-from-windows.ps1 -ServerIp 1.2.3.4
#   .\deploy\scripts\90-push-from-windows.ps1 -ServerIp 1.2.3.4 -WithSource
#
# 默认只推 deploy/ 目录（配置 + 脚本 + compose）。
# -WithSource 额外推仓库源码到 /opt/rlc/src，供 docker build 使用。
#
# 安全：.env 永远不会被推送（密钥只在服务器上生成）。
#       服务器上已存在的 .env 不会被覆盖。
# ============================================================================
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$ServerIp,

    [string]$User = "root",

    [string]$KeyPath = "$HOME\.ssh\rlc_prod",

    # 连带推送 apps/ packages/ 等源码，供镜像构建
    [switch]$WithSource,

    # 只打印将要执行的命令
    [switch]$DryRun
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$deployDir = Join-Path $repoRoot "deploy"

function Write-Step($msg) { Write-Host "`n==> $msg" -ForegroundColor Cyan }
function Write-Ok($msg)   { Write-Host "    $msg" -ForegroundColor Green }
function Write-Warn2($msg){ Write-Host "    $msg" -ForegroundColor Yellow }

# ---------------------------------------------------------------------------
# 0. 前置检查
# ---------------------------------------------------------------------------
Write-Step "检查本机工具"
foreach ($t in @("ssh", "scp", "tar")) {
    if (-not (Get-Command $t -ErrorAction SilentlyContinue)) {
        throw "本机没有 $t。Windows 10 1803+ 自带 OpenSSH 和 bsdtar，请先启用。"
    }
    Write-Ok "$t 就绪"
}

if (-not (Test-Path $KeyPath)) {
    throw "找不到私钥 $KeyPath。先按 runbook 阶段 4 生成：ssh-keygen -t ed25519 -f `$HOME\.ssh\rlc_prod"
}
Write-Ok "私钥 $KeyPath"

if (-not (Test-Path (Join-Path $deployDir "docker-compose.yml"))) {
    throw "deploy 目录不完整：$deployDir"
}

$sshOpts = @(
    "-i", $KeyPath,
    "-o", "StrictHostKeyChecking=accept-new",
    "-o", "ConnectTimeout=15",
    "-o", "ServerAliveInterval=15"
)
$target = "$User@$ServerIp"

# ---------------------------------------------------------------------------
# 1. 打包 deploy/
# ---------------------------------------------------------------------------
Write-Step "打包 deploy/"
$tarDeploy = Join-Path $env:TEMP "rlc-deploy.tgz"
if (Test-Path $tarDeploy) { Remove-Item $tarDeploy -Force }

# bsdtar 的 --exclude 匹配路径片段，用通配符更稳
& tar -czf $tarDeploy `
    --exclude "deploy/.env" `
    --exclude "deploy/**/*.log" `
    -C $repoRoot "deploy"

if ($LASTEXITCODE -ne 0) { throw "tar 打包 deploy 失败" }
$sizeKb = [math]::Round((Get-Item $tarDeploy).Length / 1KB, 1)
Write-Ok "deploy 包 $sizeKb KB"

# ---------------------------------------------------------------------------
# 2. （可选）打包源码
# ---------------------------------------------------------------------------
$tarSrc = $null
if ($WithSource) {
    Write-Step "打包源码（排除 node_modules / dist / 大文件）"
    $tarSrc = Join-Path $env:TEMP "rlc-src.tgz"
    if (Test-Path $tarSrc) { Remove-Item $tarSrc -Force }

    $srcItems = @()
    foreach ($p in @("apps", "packages", "package.json", "pnpm-lock.yaml", "pnpm-workspace.yaml", "tsconfig.base.json")) {
        if (Test-Path (Join-Path $repoRoot $p)) { $srcItems += $p }
    }
    if ($srcItems.Count -eq 0) { throw "仓库里找不到可构建的源码（apps/ packages/）" }

    & tar -czf $tarSrc `
        --exclude "*/node_modules" `
        --exclude "*/dist" `
        --exclude "*/coverage" `
        --exclude "*/.turbo" `
        --exclude "*.zip" `
        --exclude "*/文献PDF" `
        -C $repoRoot @srcItems

    if ($LASTEXITCODE -ne 0) { throw "tar 打包源码失败" }
    $sizeMb = [math]::Round((Get-Item $tarSrc).Length / 1MB, 1)
    Write-Ok "源码包 $sizeMb MB"
}

if ($DryRun) {
    Write-Warn2 "-DryRun：到此为止，未上传任何东西"
    Write-Warn2 "包位置：$tarDeploy"
    if ($tarSrc) { Write-Warn2 "         $tarSrc" }
    return
}

# ---------------------------------------------------------------------------
# 3. 上传
# ---------------------------------------------------------------------------
Write-Step "上传到 $target"
& scp @sshOpts $tarDeploy "${target}:/tmp/rlc-deploy.tgz"
if ($LASTEXITCODE -ne 0) { throw "scp 上传 deploy 包失败（网络？密钥？）" }
Write-Ok "deploy 包已上传"

if ($tarSrc) {
    & scp @sshOpts $tarSrc "${target}:/tmp/rlc-src.tgz"
    if ($LASTEXITCODE -ne 0) { throw "scp 上传源码包失败" }
    Write-Ok "源码包已上传"
}

# ---------------------------------------------------------------------------
# 4. 远程解包
# ---------------------------------------------------------------------------
Write-Step "远程解包到 /opt/rlc"
$remoteScript = @'
set -e
if [ "$(id -u)" -eq 0 ]; then S=""; else S="sudo"; fi
$S mkdir -p /opt/rlc
# 保留已有 .env：解包不会带 .env，但如果历史包里有残留也不会被删
$S tar -xzf /tmp/rlc-deploy.tgz -C /opt/rlc --strip-components=1
if [ -f /tmp/rlc-src.tgz ]; then
  $S mkdir -p /opt/rlc/src
  $S tar -xzf /tmp/rlc-src.tgz -C /opt/rlc/src
  rm -f /tmp/rlc-src.tgz
fi
$S chown -R deploy:deploy /opt/rlc 2>/dev/null || true
$S chmod +x /opt/rlc/scripts/*.sh 2>/dev/null || true
rm -f /tmp/rlc-deploy.tgz
echo "--- /opt/rlc ---"
ls -1 /opt/rlc
echo "--- scripts ---"
ls -1 /opt/rlc/scripts
'@

# 防止文件被编辑器转成 CRLF，导致 bash 报 $'\r': command not found
$remoteScript = $remoteScript -replace "`r`n", "`n"

& ssh @sshOpts $target $remoteScript
if ($LASTEXITCODE -ne 0) { throw "远程解包失败" }
# ---------------------------------------------------------------------------
# 5. 提示
# ---------------------------------------------------------------------------
Write-Host ""
Write-Host "完成。" -ForegroundColor Green
if (-not (Test-Path (Join-Path $deployDir ".env"))) {
    Write-Warn2 "服务器上如果还没有 .env："
    Write-Warn2 "  ssh $target"
    Write-Warn2 "  cd /opt/rlc && cp .env.example .env && chmod 600 .env"
    Write-Warn2 "  然后按 runbook 阶段 6 填密钥"
}
Write-Host ""
