# 公众入口（门户）

Research-based Learning Community 的门户：学生在 Obsidian 里发布的卡片，在这里被读到。

> 技术栈：Next.js 16（App Router）+ React 19，纯 SSR，无客户端状态。

## 页面

| 路径 | 内容 |
|---|---|
| `/` | 卡片列表：按领域分组，显示标题、摘要、作者、日期 |
| `/c/[id]` | 卡片详情：正文（服务端渲染的 HTML）、来源文献、DOI 链接、修订号、OG meta |

## 数据来源

门户**不直接暴露 API**：浏览器只访问门户，门户在服务端调用 API。

```
浏览器 → 门户（Next.js SSR） → API（127.0.0.1:4000） → PostgreSQL
```

环境变量：

| 变量 | 默认 | 说明 |
|---|---|---|
| `RLC_API_BASE` | `http://127.0.0.1:4000` | 服务端调用 API 的地址 |

## 本地运行

```bash
# 1. 确保 API 可达（本机开发走 SSH 隧道）
#    powershell -ExecutionPolicy Bypass -File ../../deploy/scripts/tunnel.ps1

# 2. 启动
pnpm --dir apps/portal dev     # http://localhost:3000
```

## 生产部署

```bash
pnpm --dir apps/portal build     # 产出 .next/standalone（postbuild 自动打补丁）
```

> **为什么要 postbuild 补丁**：pnpm 的符号链接会让 Next 的 file tracing 漏掉
> `@swc/helpers`、`caniuse-lite`、`styled-jsx` 等直接依赖，导致部署后
> `Cannot find module`。`scripts/patch-standalone.cjs` 会从 `.pnpm` 存储把
> 这些包物理复制进 standalone，幂等可重复执行。

服务器上的部署结构：

```
/opt/rlc/portal/
├─ apps/portal/server.js      Next standalone 入口
├─ apps/portal/.next/         服务端产物 + static
└─ node_modules/              补丁后的依赖
```

systemd 单元 `rlc-portal.service`：`PORT=3000 HOSTNAME=127.0.0.1`，
`RLC_API_BASE=http://127.0.0.1:4000`，只监听本机，公网由 Caddy 反代。

由 Caddy 反代到 `rlc.dreamook.com`，见 [deploy/多应用共用一个服务器.md](../../deploy/多应用共用一个服务器.md)。

## 已知限制

- 列表暂无分页 UI（API 支持 cursor，页面一次取 50 条）
- 评论/点赞只显示计数，交互接口默认关闭（备案策略）
- 图片资产 URL 由 API 的 `PUBLIC_BASE_URL` 生成；本地测试时它指向 `127.0.0.1:4000`，需要隧道在线
- 无搜索框（API 已支持 `q` 参数）
