import type { FastifyInstance } from "fastify";
import { TEMPLATES } from "@rlc/contract";

/** 模板注册表由契约包提供，服务端只做分发。 */
export async function templateRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/v1/templates", async (_request, reply) => {
    return reply.send({ items: TEMPLATES });
  });
}
