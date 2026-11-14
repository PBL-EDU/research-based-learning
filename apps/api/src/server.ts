import { readFile } from "node:fs/promises";
import path from "node:path";
import Fastify, { type FastifyInstance } from "fastify";
import multipart from "@fastify/multipart";
import type { Env } from "./env";
import { apiError } from "./lib/errors";
import { healthRoutes } from "./routes/health";
import { templateRoutes } from "./routes/templates";
import { publicationRoutes } from "./routes/publications";
import { commentRoutes } from "./routes/comments";
import { orgRoutes } from "./routes/orgs";
import { inviteRoutes } from "./routes/invites";

const MIME_BY_EXT: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
};

export async function buildServer(env: Env): Promise<FastifyInstance> {
  const app = Fastify({
    logger: {
      level: process.env.LOG_LEVEL ?? "info",
      // 不记录 Authorization，避免令牌进日志
      redact: ["req.headers.authorization"],
    },
    bodyLimit: 32 * 1024 * 1024,
    requestIdHeader: "x-request-id",
  });

  await app.register(multipart, {
    limits: {
      fileSize: 10 * 1024 * 1024,
      files: 10,
      fields: 10,
    },
  });

  await healthRoutes(app);
  await templateRoutes(app);
  await publicationRoutes(app, env);
  await commentRoutes(app, env);
  await orgRoutes(app, env);
  await inviteRoutes(app);

  // 本地资产（P0）。生产切 COS/CDN 时只换这一段的实现。
  app.get("/assets/*", async (request, reply) => {
    const params = request.params as { "*": string };
    const segments = params["*"]
      .split("/")
      .map((segment) => decodeURIComponent(segment))
      .filter((segment) => segment.length > 0 && segment !== "." && segment !== "..");

    if (segments.length === 0) {
      return reply.code(404).send(apiError("NOT_FOUND", "资产不存在", request.id));
    }

    const filePath = path.join(env.dataDir, "assets", ...segments);
    try {
      const data = await readFile(filePath);
      const mime = MIME_BY_EXT[path.extname(filePath).toLowerCase()] ?? "application/octet-stream";
      return reply
        .type(mime)
        .header("cache-control", "public, max-age=31536000, immutable")
        .send(data);
    } catch {
      return reply.code(404).send(apiError("NOT_FOUND", "资产不存在", request.id));
    }
  });

  app.setErrorHandler((error, request, reply) => {
    request.log.error({ err: error }, "unhandled error");
    return reply.code(500).send(apiError("INTERNAL", "服务端内部错误", request.id));
  });

  return app;
}
