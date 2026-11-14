/**
 * 环境变量解析。
 *
 * 故意不引入 zod：契约包才需要强校验，服务端启动配置用「缺什么就报什么」
 * 的手写检查更直接，也不会因为依赖升级改变行为。
 */
export interface Env {
  port: number;
  databaseUrl: string;
  /** 插件端 Bearer token。P0 用单一班级令牌，设备码授权在 P1 接。 */
  deviceToken: string;
  authorHandle: string;
  authorName: string;
  publicBaseUrl: string;
  dataDir: string;
  commentsEnabled: boolean;
  /** 默认组织：现有账号与卡片迁移到这里，也是没带 org 时的兜底。 */
  defaultOrgSlug: string;
  defaultOrgName: string;
}

function required(source: NodeJS.ProcessEnv, key: string): string {
  const value = source[key]?.trim();
  if (!value) throw new Error(`缺少环境变量 ${key}`);
  return value;
}

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const deviceToken = required(source, "DEVICE_TOKEN");
  if (deviceToken.length < 16) {
    throw new Error("DEVICE_TOKEN 至少 16 个字符");
  }

  const port = Number.parseInt(source.PORT ?? "4000", 10);
  if (!Number.isFinite(port) || port <= 0) throw new Error("PORT 不合法");

  return {
    port,
    databaseUrl: required(source, "DATABASE_URL"),
    deviceToken,
    authorHandle: source.AUTHOR_HANDLE?.trim() || "denghao",
    authorName: source.AUTHOR_NAME?.trim() || "邓豪",
    publicBaseUrl: (source.PUBLIC_BASE_URL?.trim() || "http://localhost:4000").replace(/\/+$/, ""),
    dataDir: source.DATA_DIR?.trim() || "./data",
    commentsEnabled: (source.COMMENTS_ENABLED ?? "false").toLowerCase() === "true",
    defaultOrgSlug: source.DEFAULT_ORG_SLUG?.trim() || "brm",
    defaultOrgName: source.DEFAULT_ORG_NAME?.trim() || "白日梦行动",
  };
}
