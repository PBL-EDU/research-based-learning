# 研究性学习社区

学生在 Obsidian 里完成「文献综述 → 略读 → 精读卡片 → 实践 → 总结」的研究闭环，把值得公开的卡片发布到社区；读者在网页上评论、点赞、转发，讨论又能被摘取回 Obsidian 变成新卡片。

## 设计基线

| 文档 | 内容 |
|---|---|
| [决策锁定 2026-11-13](docs/决策锁定-2026-11-13.md) | 四条已定决策、个人主体的五个连带影响、范围收缩 |
| [系统架构设计 v1](docs/研究性学习社区-系统架构设计-v1.md) | 三端模块、数据模型、API、同步、发布链路、分期、风险 |
| [P0 执行计划](docs/P0-执行计划.md) | 12 条验收断言、6 个工作包、3 周节奏 |
| [ADR 决策记录](docs/adr/) | 本地优先 / md+frontmatter 契约 / 模块化单体 / 不可变快照 / 私域 AI |
| [OpenAPI 契约](docs/api/openapi.yaml) | 17 组端点 |
| [测试策略评估](研究性学习社区-测试策略评估.md) | 三档插件测试、契约测试、E2E、15 周测试计划 |
| [公众号与小红书方案](研究性学习社区-公众号与小红书发布运营方案.md) | 接口边界、排版模板、合规红线、冷启动 |
| [部署与选型](deploy/README.md) | 云厂商/地域决策、月成本、备案主体分水岭、合规风险 |
| [部署 Runbook](deploy/runbook.md) | 12 阶段可执行清单、运维、应急手册 |

## 仓库结构

```
packages/contract      唯一契约源（Zod schema / DTO / 错误码 / 模板注册表）
packages/vault-core    纯 TS：目录布局、frontmatter 读写、slug（禁止 import obsidian）
apps/obsidian-plugin   Obsidian 插件（可安装，见其 README）
apps/api               NestJS 服务端（待开工）
apps/portal            Next.js 公众入口（待开工）
```

## 安装 Obsidian 插件

```bash
pnpm --filter @rlc/contract build
pnpm --filter @rlc/vault-core build
pnpm --dir apps/obsidian-plugin build
```

产出 `apps/obsidian-plugin/main.js`；把 `main.js`、`manifest.json`、`styles.css` 放进
`<vault>/.obsidian/plugins/research-learning-community/`，在 Obsidian 里启用即可。
也可以直接用 `apps/obsidian-plugin/research-learning-community-0.1.0.zip`。

## 开发

```bash
pnpm install
pnpm -r build
pnpm -r test
pnpm --dir apps/obsidian-plugin dev   # esbuild watch
```

> 需要 Node ≥ 22（本机可用 `C:\Users\denghao\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\node\bin\node.exe`，v24.21.0）。
