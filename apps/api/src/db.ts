import { PrismaClient } from "@prisma/client";

/** 单个 PrismaClient 实例。Fastify 插件与脚本共享它。 */
export const prisma = new PrismaClient();

export type Db = typeof prisma;
