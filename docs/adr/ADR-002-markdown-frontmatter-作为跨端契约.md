# ADR-002：Markdown + YAML frontmatter 作为跨端契约

## Status
Accepted（2026-11-13）

## Context
同一张精读卡片需要在三个地方出现：Obsidian 里的可编辑文件、服务器的存储与检索、门户的渲染页面。若每端各定一套结构（本地 md、服务器 JSON 表、门户 React props），任何字段调整都要改三处，且极易不一致。

需求又明确"服务器提供 md 报告模板"——说明组织方希望**报告形态是统一且可打印的**。

## Decision
用 **Markdown 正文 + YAML frontmatter** 作为卡片的规范形态，并在三端共享一份 Zod 定义的 schema：

- 本地：`.md` 文件，frontmatter 承载结构化字段（Aha 五点、观念价值、行动指导）。
- 服务器：`publication_revision.body_md` 逐字保存 + `frontmatter jsonb` 冗余结构化字段（供筛选/搜索/摘录）。
- 门户：从 `body_md` 渲染 HTML，`frontmatter` 只用于列表卡片摘要。
- **schema 版本写在 frontmatter**（`schema: dr-card@1`），服务端只接受已知版本并拒收未知版本（不做"尽力解析"）。
- 模板与 JSON Schema 由服务端注册表下发（带 ETag），插件内置离线兜底副本。

## Consequences
**变容易**
- 学生可以直接在编辑器里手改，不依赖插件 UI；
- 迁移/备份/导出零成本（就是一堆文本文件）；
- 契约测试可做在金标文件层面（fixture md → 快照）。

**变难**
- 结构化查询能力弱于关系表（接受：只把必要的几个字段冗余到 jsonb 与列）；
- 需要写 schema 迁移器（`@1 → @2`）并保留至少一个大版本的兼容读；
- frontmatter 是 YAML，有类型陷阱（日期、多行字符串），必须统一序列化器（禁用 `js-yaml` 默认的日期推断）。

## Alternatives considered
| 方案 | 否决理由 |
|---|---|
| 纯 JSON 存储 + 渲染成 md | 本地可读性差，Obsidian 编辑体验崩塌 |
| 各端各自建模，靠 API 适配 | 三处漂移，长期维护成本最高 |
| 用 OpenAPI 生成三端类型（schema 反推 md） | 方向反了：md 是人的产物，不是 API 的衍生品 |
