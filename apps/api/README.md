# 服务端 API

Research-based Learning Community 的服务端：Fastify 5 + Prisma + PostgreSQL。

> 为什么不是 NestJS：见 [ADR-006](../../docs/adr/ADR-006-服务端采用Fastify.md)。

## 接口（P0）

| 方法 | 路径 | 鉴权 | 说明 |
|---|---|---|---|
| GET | `/api/v1/healthz` | — | 健康检查（含数据库连通性） |
| GET | `/api/v1/templates` | — | 六种报告模板 |
| POST | `/api/v1/publications` | Bearer | 发布卡片（multipart：`payload` + `assets[]`） |
| GET | `/api/v1/publications` | — | 浏览（`domain` / `kind` / `q` / `limit` / `cursor`） |
| GET | `/api/v1/publications/:id` | — | 详情 |
| POST | `/api/v1/publications/:id/withdraw` | Bearer | 撤回 |
| GET | `/api/v1/comments` | — | 评论树（默认关闭） |
| POST | `/api/v1/comments` | Bearer | 发评论（默认关闭） |
| GET | `/assets/*` | — | 本地图片资产 |

**评论开关**：`COMMENTS_ENABLED=false` 时两个评论接口都返回 403 `FORBIDDEN`。这是个人备案策略——线上先只做公开只读。

## 本地开发

```bash
# 1. 起数据库（或指向已有的 PG）
docker compose -f ../../deploy/docker-compose.yml up -d postgres

# 2. 配置环境
cp .env.example .env

# 3. 应用迁移
pnpm exec prisma migrate deploy

# 4. 构建并启动
pnpm build
pnpm start
```

## 发布协议

`POST /api/v1/publications` 是 multipart：

- `payload` 字段：JSON，结构由 `@rlc/contract` 的 `PublishPayload` 校验；
- `assets` 文件：文件名必须与 `payload.assets[].localPath` 的 basename 一致；
- 服务端逐个校验 SHA-256 与 MIME 白名单（png/jpeg/webp），不匹配直接 422。

幂等：`(authorId, clientCardId)` 唯一。同内容重复发布返回 `replay: true`；内容不同则 `revision + 1`。

## 测试

```bash
pnpm test          # 单元测试（不需要数据库）
node scripts/smoke.cjs   # HTTP 冒烟（不需要数据库，healthz 预期 503）
```
