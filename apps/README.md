# apps/

三个运行时应用，按 [P0 执行计划](../docs/P0-执行计划.md) 的顺序落地：

| 目录 | 内容 | 工作包 |
|---|---|---|
| `obsidian-plugin/` | Obsidian 插件：卡片表单、发布按钮、publish-outbox | W2 |
| `api/` | NestJS 服务端：设备码授权、发布/读接口、资产上传 | W3 |
| `portal/` | Next.js 公众入口：列表、详情、作者页 | W4 |

三端只通过 `@rlc/contract` 交汇，不互相 import。
