import type { FastifyInstance } from "fastify";
import { prisma } from "../db";

export async function healthRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/v1/healthz", async (_request, reply) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      return reply.send({ ok: true, db: "up", at: new Date().toISOString() });
    } catch {
      return reply.code(503).send({ ok: false, db: "down", at: new Date().toISOString() });
    }
  });
}
