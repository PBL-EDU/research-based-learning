# ADR-006：服务端用 Fastify，而不是 NestJS

## Status
Accepted（2026-11-14）

## Context

架构文档 §2.3 原定 NestJS，理由是「模块系统天然映射 bounded context，学生轮换时目录即边界」。

但在真正开工时出现两个变量：

1. **项目已升级到 TypeScript 7（原生编译器）**。NestJS 的依赖注入依赖 `experimentalDecorators` + `emitDecoratorMetadata`；TS 7 对装饰器元数据的支持尚不确定，一旦不支持，整个服务端编译不过，且不是业务代码能绕过的问题。
2. **实际开发是单人**。NestJS 的模块/守卫/拦截器体系在多人协作时收益最大；一个人维护时，它更多是样板代码。

## Decision

服务端改用 **Fastify 5 + 按目录划分的路由模块**：

```
apps/api/src/
├─ routes/        publication / comment / template / health
├─ lib/           dto / render / assets / ids / security / errors
├─ server.ts      组装 Fastify 实例
└─ index.ts       启动与优雅关闭
```

边界纪律改为三条可机械检查的规则：

1. `routes/*` 只能通过 `lib/*` 与 `db.ts` 访问数据，不直接写 SQL；
2. `lib/dto.ts` 是所有出参的**唯一出口**，且必须用契约 schema 自检；
3. 路由文件不互相 import。

## Consequences

**变容易**
- 无装饰器依赖，TS 7 下编译稳定；
- 启动快、样板少，单人维护成本低；
- 出参契约在 `toListItem/toDetail` 里强制 parse，服务端不可能返回不符合契约的对象。

**变难**
- 没有内置的 DI，测试替身要靠参数注入（目前路由依赖 `prisma` 单例，集成测试需要真库）；
- 多人协作时缺少框架级的模块约束，靠 code review + 上面的三条规则。

**何时重评**：团队超过 3 人，或需要复杂的守卫/拦截器组合时，再考虑迁回 NestJS。届时路由与 lib 层可以原样保留，只换装配层。
