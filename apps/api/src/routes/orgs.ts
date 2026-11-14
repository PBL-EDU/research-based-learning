import type { FastifyInstance } from "fastify";
import { prisma } from "../db";
import type { Env } from "../env";
import { apiError } from "../lib/errors";
import { resolveAuth } from "../lib/auth";
import { toListItem } from "../lib/dto";
import { LIST_INCLUDE, toView } from "./publications";

/**
 * 组织 → 同学 的读取接口。
 *
 * 可见性策略（2026-11-14 决策）：组织之间隔离，列表只返回本组织的卡片；
 * 单张卡片详情仍然可以凭 id 打开（分享链接），不做组织校验。
 */
export async function orgRoutes(app: FastifyInstance, env: Env): Promise<void> {
  app.get("/api/v1/orgs", async (request, reply) => {
    const orgs = await prisma.organization.findMany({ orderBy: { createdAt: "asc" } });
    const items = [];

    for (const org of orgs) {
      const [memberCount, publicationCount] = await Promise.all([
        prisma.membership.count({ where: { orgId: org.id } }),
        prisma.publication.count({
          where: {
            orgId: org.id,
            status: "published",
            visibility: { in: ["public", "community"] },
          },
        }),
      ]);
      items.push({
        slug: org.slug,
        name: org.name,
        memberCount,
        publicationCount,
      });
    }

    return reply.send({ items });
  });

  app.get("/api/v1/orgs/:slug", async (request, reply) => {
    const { slug } = request.params as { slug: string };
    const org = await prisma.organization.findUnique({ where: { slug } });
    if (!org) {
      return reply.code(404).send(apiError("NOT_FOUND", "组织不存在", request.id));
    }

    const memberships = await prisma.membership.findMany({
      where: { orgId: org.id },
      include: {
        account: { include: { _count: { select: { publications: true } } } },
      },
      orderBy: { joinedAt: "asc" },
    });

    return reply.send({
      slug: org.slug,
      name: org.name,
      members: memberships.map((membership) => ({
        handle: membership.account.handle,
        displayName: membership.account.displayName,
        role: membership.role,
        cardCount: membership.account._count.publications,
      })),
    });
  });

  app.get("/api/v1/orgs/:slug/members/:handle", async (request, reply) => {
    const { slug, handle } = request.params as { slug: string; handle: string };

    const org = await prisma.organization.findUnique({ where: { slug } });
    if (!org) {
      return reply.code(404).send(apiError("NOT_FOUND", "组织不存在", request.id));
    }

    const account = await prisma.account.findUnique({
      where: { handle },
      include: { memberships: { where: { orgId: org.id } } },
    });
    if (!account || account.memberships.length === 0) {
      return reply.code(404).send(apiError("NOT_FOUND", "这位同学不在该组织中", request.id));
    }

    const rows = await prisma.publication.findMany({
      where: {
        authorId: account.id,
        orgId: org.id,
        status: "published",
        visibility: { in: ["public", "community"] },
      },
      include: LIST_INCLUDE,
      orderBy: [{ publishedAt: "desc" }, { id: "desc" }],
      take: 50,
    });

    return reply.send({
      handle: account.handle,
      displayName: account.displayName,
      org: { slug: org.slug, name: org.name },
      items: rows.map((row) => toListItem(toView(row, env, false))),
    });
  });

  app.get("/api/v1/orgs/:slug/publications", async (request, reply) => {
    const { slug } = request.params as { slug: string };
    const query = request.query as { domain?: string; kind?: string; limit?: string; cursor?: string };

    const org = await prisma.organization.findUnique({ where: { slug } });
    if (!org) {
      return reply.code(404).send(apiError("NOT_FOUND", "组织不存在", request.id));
    }

    const take = Math.min(Math.max(Number.parseInt(query.limit ?? "20", 10) || 20, 1), 50);
    const rows = await prisma.publication.findMany({
      where: {
        orgId: org.id,
        status: "published",
        visibility: { in: ["public", "community"] },
        ...(query.domain ? { domain: { slug: query.domain } } : {}),
        ...(query.kind ? { kind: query.kind } : {}),
      },
      include: LIST_INCLUDE,
      orderBy: [{ publishedAt: "desc" }, { id: "desc" }],
      take: take + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
    });

    const hasMore = rows.length > take;
    const page = hasMore ? rows.slice(0, take) : rows;
    return reply.send({
      items: page.map((row) => toListItem(toView(row, env, false))),
      nextCursor: hasMore ? page[page.length - 1]?.id ?? null : null,
    });
  });

  app.get("/api/v1/me", async (request, reply) => {
    const auth = await resolveAuth(request.headers.authorization, env);
    if (!auth) {
      return reply.code(401).send(apiError("AUTH_REQUIRED", "缺少或无效的设备令牌", request.id));
    }
    return reply.send({ account: auth.account, org: auth.org });
  });
}
