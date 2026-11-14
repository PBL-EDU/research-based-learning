import { randomBytes } from "node:crypto";

/** publication id：`pub_` + 32 位十六进制，正好落在契约的 20–32 字符区间。 */
export function newPublicationId(): string {
  return `pub_${randomBytes(16).toString("hex")}`;
}

/** 标题 → URL slug。中文标题会得到空串，此时用 id 兜底。 */
export function slugifyTitle(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48)
    .replace(/-+$/g, "");
}

/** slug 保证唯一：追加 id 尾段。中文标题也能得到稳定的 ASCII slug。 */
export function publicationSlug(title: string, publicationId: string): string {
  const base = slugifyTitle(title);
  const suffix = publicationId.replace(/^pub_/, "").slice(-8);
  return base.length > 0 ? `${base}-${suffix}` : `c-${suffix}`;
}
