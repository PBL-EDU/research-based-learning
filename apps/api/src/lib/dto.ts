import {
  PublicationDetail,
  PublicationListItem,
  type PublicationDetail as PublicationDetailDto,
  type PublicationListItem as PublicationListItemDto,
} from "@rlc/contract";

export interface PublicationView {
  id: string;
  kind: string;
  title: string;
  slug: string;
  domain: { name: string; slug: string };
  author: { handle: string; displayName: string };
  org?: { slug: string; name: string };
  excerpt: string;
  coverUrl?: string;
  revision: number;
  publishedAt: string;
  counts: { comments: number; likes: number; reposts: number };
  bodyMd?: string;
  bodyHtml?: string;
  source?: unknown;
  assets?: Array<{ url: string; role: "visual" | "cover" | "inline"; width?: number; height?: number }>;
  aiAssisted?: boolean;
  variants?: Array<{
    audienceName: string;
    audienceDescription?: string;
    title: string;
    hook?: string;
    bodyMd: string;
    bodyHtml?: string;
    quote?: string;
    action?: string;
    tags: string[];
    figureMermaid?: string;
  }>;
}

const ASSET_ROLES = new Set(["visual", "cover", "inline"]);

function pickSource(value: unknown): unknown {
  if (!value || typeof value !== "object") return undefined;

  const record = value as Record<string, unknown>;
  // 兼容两种输入：直接给 LiteratureSource，或给整份 frontmatter（里面带 source）。
  const candidate = record.type === "literature" ? record : record.source;
  if (!candidate || typeof candidate !== "object") return undefined;

  return (candidate as Record<string, unknown>).type === "literature" ? candidate : undefined;
}

/**
 * 映射到契约 DTO，并用契约 schema 自检。
 *
 * 这不是多此一举：服务端拼出来的对象一旦和契约漂移，门户会在运行时拿到残缺数据。
 * 在这里 parse 失败会直接抛错，问题暴露在写入路径而不是展示路径。
 */
export function toListItem(view: PublicationView): PublicationListItemDto {
  const candidate = {
    id: view.id,
    kind: view.kind,
    title: view.title,
    slug: view.slug,
    domain: view.domain,
    author: view.author,
    ...(view.org ? { org: view.org } : {}),
    excerpt: view.excerpt,
    revision: view.revision,
    publishedAt: view.publishedAt,
    counts: view.counts,
    ...(view.coverUrl ? { coverUrl: view.coverUrl } : {}),
  };

  const parsed = PublicationListItem.safeParse(candidate);
  if (!parsed.success) {
    throw new Error(
      `PublicationListItem 不符合契约：${parsed.error.issues[0]?.path.join(".")} ${parsed.error.issues[0]?.message}`,
    );
  }
  return parsed.data;
}

export function toDetail(view: PublicationView): PublicationDetailDto {
  const assets = (view.assets ?? []).filter((asset) => ASSET_ROLES.has(asset.role));
  const candidate = {
    ...toListItem(view),
    bodyHtml: view.bodyHtml ?? "",
    bodyMd: view.bodyMd ?? "",
    assets,
    variants: view.variants ?? [],
    aiAssisted: view.aiAssisted === true,
    ...(pickSource(view.source) ? { source: pickSource(view.source) } : {}),
  };

  const parsed = PublicationDetail.safeParse(candidate);
  if (!parsed.success) {
    throw new Error(
      `PublicationDetail 不符合契约：${parsed.error.issues[0]?.path.join(".")} ${parsed.error.issues[0]?.message}`,
    );
  }
  return parsed.data;
}
