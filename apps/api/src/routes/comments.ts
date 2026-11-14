import type { FastifyInstance } from "fastify";
import { prisma } from "../db";
import type { Env } from "../env";
import { apiError } from "../lib/errors";
import { isDeviceTokenValid } from "../lib/security";

/**
 * 评论接口。
 *
 * 默认关闭——这是备案策略（个人主体）：线上先只做「公开只读 + 分享链接」。
 * 开关是环境变量 COMMENTS_ENABLED，改完重启即生效，不需要改代码。
 */
export async function commentRoutes(app: FastifyInstance, env: Env): Promise<void> {
  app.get("/api/v1/comments", async (request, reply) => {
    if (!env.commentsEnabled) {
      return reply.code(403).send(
        apiError("FORBIDDEN", "评论功能未开启（备案策略：先公开只读）", request.id),
      );
    }

    const query = request.query as { publicationId?: string };
    if (!query.publicationId) {
      return reply.code(422).send(apiError("VALIDATION_FAILED", "缺少 publicationId", request.id));
    }

    const rows = await prisma.comment.findMany({
      where: { publicationId: query.publicationId, status: "visible" },
      include: { author: true },
      orderBy: { createdAt: "asc" },
      take: 200,
    });

    return reply.send({
      publicationId: query.publicationId,
      total: rows.length,
      roots: rows.map((row) => ({
        id: row.id,
        publicationId: row.publicationId,
        parentId: row.parentId,
        depth: row.depth,
        author: { handle: row.author.handle, displayName: row.author.displayName },
        body: row.body,
        createdAt: row.createdAt.toISOString(),
        status: row.status,
        children: [],
      })),
    });
  });

  app.post("/api/v1/comments", async (request, reply) => {
    if (!env.commentsEnabled) {
      return reply.code(403).send(
        apiError("FORBIDDEN", "评论功能未开启（备案策略：先公开只读）", request.id),
      );
    }
    if (!isDeviceTokenValid(request.headers.authorization, env.deviceToken)) {
      return reply.code(401).send(apiError("AUTH_REQUIRED", "缺少或无效的设备令牌", request.id));
    }

    const body = (request.body ?? {}) as {
      publicationId?: unknown;
      body?: unknown;
      parentId?: unknown;
    };

    if (typeof body.publicationId !== "string" || body.publicationId.length === 0) {
      return reply.code(422).send(apiError("VALIDATION_FAILED", "缺少 publicationId", request.id));
    }
    if (typeof body.body !== "string" || body.body.trim().length === 0 || body.body.length > 5000) {
      return reply.code(422).send(apiError("VALIDATION_FAILED", "评论内容为空或超过 5000 字", request.id));
    }

    const publication = await prisma.publication.findUnique({ where: { id: body.publicationId } });
    if (!publication || publication.status !== "published") {
      return reply.code(404).send(apiError("NOT_FOUND", "卡片不存在或未发布", request.id));
    }

    const author = await prisma.account.findUnique({ where: { handle: env.authorHandle } });
    if (!author) {
      return reply.code(500).send(apiError("INTERNAL", "作者账号不存在", request.id));
    }

    const created = await prisma.comment.create({
      data: {
        publicationId: body.publicationId,
        authorId: author.id,
        parentId: typeof body.parentId === "string" ? body.parentId : null,
        depth: 0,
        path: `${Date.now().toString(36)}`,
        body: body.body.trim(),
      },
    });

    return reply.code(201).send({ id: created.id });
  });
}
