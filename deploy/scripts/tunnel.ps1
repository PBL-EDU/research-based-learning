# 建立到 rlc-api 的本地隧道（Windows PowerShell）
#
# 用途：备案通过前，让本机通过 SSH 隧道访问服务器 API，不暴露 4000 端口到公网。
# 用法：powershell -ExecutionPolicy Bypass -File scripts/tunnel.ps1
# 保持窗口打开；Ctrl+C 结束。

$ErrorActionPreference = "Stop"

$server = "deploy@139.155.99.183"
$key = Join-Path $env:USERPROFILE ".ssh\rlc_deploy_ed25519"

if (-not (Test-Path $key)) {
    Write-Host "找不到私钥：$key" -ForegroundColor Red
    exit 1
}

Write-Host "建立隧道 127.0.0.1:4000/3000 -> 服务器 ..." -ForegroundColor Cyan
Write-Host "门户 http://localhost:3000 ；API http://localhost:4000" -ForegroundColor DarkGray

ssh -i $key -N -o ExitOnForwardFailure=yes -o ServerAliveInterval=30 -L 4000:127.0.0.1:4000 -L 3000:127.0.0.1:3000 $server
