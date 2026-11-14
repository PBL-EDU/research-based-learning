import { loadEnv } from "./env";
import { buildServer } from "./server";
import { prisma } from "./db";

async function main(): Promise<void> {
  const env = loadEnv();

  await prisma.$connect();

  // 默认组织：现有账号与卡片都归到这里（迁移 SQL 已回填）。
  const org = await prisma.organization.upsert({
    where: { slug: env.defaultOrgSlug },
    update: { name: env.defaultOrgName },
    create: { slug: env.defaultOrgSlug, name: env.defaultOrgName },
  });

  // 单班场景：启动时保证作者账号存在。设备码授权在 P1 接。
  const account = await prisma.account.upsert({
    where: { handle: env.authorHandle },
    update: { displayName: env.authorName },
    create: { handle: env.authorHandle, displayName: env.authorName, role: "student" },
  });

  await prisma.membership.upsert({
    where: { accountId_orgId: { accountId: account.id, orgId: org.id } },
    update: {},
    create: { accountId: account.id, orgId: org.id, role: "student" },
  });

  const app = await buildServer(env);
  await app.listen({ port: env.port, host: "0.0.0.0" });

  app.log.info(
    `评论功能：${env.commentsEnabled ? "开启" : "关闭（备案策略：先公开只读）"}；资产目录：${env.dataDir}`,
  );

  const shutdown = async (signal: string): Promise<void> => {
    app.log.info(`收到 ${signal}，正在关闭…`);
    await app.close();
    await prisma.$disconnect();
    process.exit(0);
  };

  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

main().catch((error) => {
  console.error("启动失败：", error);
  process.exit(1);
});
