import path from "node:path";
import type { FastifyInstance } from "fastify";
import { Prisma } from "@prisma/client";
import {
  PublishPayload,
  isAllowedAssetMime,
  type CardKind,
} from "@rlc/contract";
import type { Env } from "../env";
import { prisma } from "../db";
import { apiError } from "../lib/errors";
import { sha256Hex } from "../lib/security";
import { newPublicationId, publicationSlug } from "../lib/ids";
import { renderMarkdown, excerptFrom } from "../lib/render";
import { assetUrl, saveAsset } from "../lib/assets";
import { toDetail, toListItem, type PublicationView } from "../lib/dto";
import { resolveAuth } from "../lib/auth";

export const LIST_INCLUDE = {
  author: true,
  domain: true,
  organization: true,
  revisions: { orderBy: { revision: "desc" as const }, take: 1 },
  assets: true,
} satisfies Prisma.PublicationInclude;

type PublicationRow = Prisma.PublicationGetPayload<{ include: typeof LIST_INCLUDE }>;

/** 科普版是「当前这一版卡片」的附属物：重发时整体替换。 */
async function replaceVariants(
  publicationId: string,
  variants: PublishPayload["variants"],
): Promise<void> {
  await prisma.publicationVariant.deleteMany({ where: { publicationId } });
  if (variants.length === 0) return;

  await prisma.publicationVariant.createMany({
    data: variants.map((variant) => ({
      publicationId,
      audienceName: variant.audienceName,
      audienceDescription: variant.audienceDescription ?? null,
      title: variant.title,
      hook: variant.hook ?? null,
      bodyMd: variant.bodyMd,
      bodyHtml: renderMarkdown(variant.bodyMd),
      quote: variant.quote ?? null,
      action: variant.action ?? null,
      tags: variant.tags,
      figureMermaid: variant.figureMermaid ?? null,
      aiAssisted: true,
    })),
  });
}

/** 已有卡片重发时补存资产（曾漏掉：只有首次发布会保存图片）。 */
async function persistAssets(
  publicationId: string,
  revision: number,
  uploads: Array<{ filename: string; mime: string; buffer: Buffer; role: string }>,
  env: Env,
): Promise<void> {
  if (uploads.length === 0) return;

  const stored = await Promise.all(
    uploads.map((upload) =>
      saveAsset({
        dataDir: env.dataDir,
        publicationId,
        revision,
        filename: upload.filename,
        mime: upload.mime,
        buffer: upload.buffer,
      }),
    ),
  );

  await prisma.$transaction(async (tx) => {
    await tx.asset.deleteMany({ where: { publicationId, revision } });
    await tx.asset.createMany({
      data: stored.map((asset, index) => ({
        publicationId,
        revision,
        kind: uploads[index]?.role ?? "visual",
        storageKey: asset.storageKey,
        mime: asset.mime,
        bytes: asset.bytes,
        sha256: asset.sha256,
      })),
    });
  });
}

export function toView(row: PublicationRow, env: Env, withBody: boolean): PublicationView {
  const revision = row.revisions[0];
  const frontmatter = (revision?.frontmatter ?? {}) as Record<string, unknown>;
  const currentAssets = row.assets.filter((asset) => asset.revision === row.currentRevision);
  const cover = currentAssets.find((asset) => asset.kind === "cover" || asset.kind === "visual");

  const view: PublicationView = {
    id: row.id,
    kind: row.kind,
    title: row.title,
    slug: row.slug,
    domain: { name: row.domain.name, slug: row.domain.slug },
    author: { handle: row.author.handle, displayName: row.author.displayName },
    ...(row.organization
      ? { org: { slug: row.organization.slug, name: row.organization.name } }
      : {}),
    excerpt: excerptFrom({ bodyMd: revision?.bodyMd ?? "", frontmatter }),
    revision: row.currentRevision,
    publishedAt: row.publishedAt.toISOString(),
    counts: {
      comments: row.commentCount,
      likes: row.likeCount,
      reposts: row.repostCount,
    },
    ...(cover ? { coverUrl: assetUrl(env.publicBaseUrl, cover.storageKey) } : {}),
  };

  if (!withBody) return view;

  view.bodyMd = revision?.bodyMd ?? "";
  view.bodyHtml = revision?.bodyHtml ?? "";
  view.source = frontmatter;
  view.aiAssisted = frontmatter.aiAssisted === true;
  view.assets = currentAssets.map((asset) => ({
    url: assetUrl(env.publicBaseUrl, asset.storageKey),
    role: (asset.kind as "visual" | "cover" | "inline") ?? "visual",
  }));

  return view;
}

export async function publicationRoutes(app: FastifyInstance, env: Env): Promise<void> {
  app.get("/api/v1/publications", async (request, reply) => {
    const query = request.query as Record<string, string | undefined>;
    const take = Math.min(Math.max(Number.parseInt(query.limit ?? "20", 10) || 20, 1), 50);

    const where: Prisma.PublicationWhereInput = {
      status: "published",
      visibility: { in: ["public", "community"] },
    };
    if (query.domain) where.domain = { slug: query.domain };
    if (query.org) where.organization = { is: { slug: query.org } };
    if (query.kind) where.kind = query.kind;
    if (query.q) {
      where.OR = [
        { title: { contains: query.q, mode: "insensitive" } },
        { author: { displayName: { contains: query.q, mode: "insensitive" } } },
      ];
    }

    const rows = await prisma.publication.findMany({
      where,
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

  app.get("/api/v1/publications/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const row = await prisma.publication.findUnique({
      where: { id },
      include: { ...LIST_INCLUDE, variants: { orderBy: { createdAt: "asc" } } },
    });

    if (!row) {
      return reply.code(404).send(apiError("NOT_FOUND", "卡片不存在", request.id));
    }
    if (row.status === "withdrawn") {
      return reply.code(410).send(apiError("PUBLICATION_WITHDRAWN", "这张卡片已被作者撤回", request.id));
    }

    const view = toView(row, env, true);
    view.variants = row.variants.map((variant) => ({
      audienceName: variant.audienceName,
      ...(variant.audienceDescription ? { audienceDescription: variant.audienceDescription } : {}),
      title: variant.title,
      ...(variant.hook ? { hook: variant.hook } : {}),
      bodyMd: variant.bodyMd,
      bodyHtml: variant.bodyHtml,
      ...(variant.quote ? { quote: variant.quote } : {}),
      ...(variant.action ? { action: variant.action } : {}),
      tags: variant.tags,
      ...(variant.figureMermaid ? { figureMermaid: variant.figureMermaid } : {}),
    }));

    return reply.send(toDetail(view));
  });

  app.post("/api/v1/publications", async (request, reply) => {
    const auth = await resolveAuth(request.headers.authorization, env);
    if (!auth) {
      return reply.code(401).send(apiError("AUTH_REQUIRED", "缺少或无效的设备令牌", request.id));
    }
    if (!auth.org) {
      return reply
        .code(403)
        .send(apiError("FORBIDDEN", "这个账号还没有加入任何组织，请联系管理员", request.id));
    }
    const orgId = auth.org.id;
    if (!request.isMultipart()) {
      return reply.code(415).send(
        apiError("VALIDATION_FAILED", "必须使用 multipart/form-data", request.id),
      );
    }

    let rawPayload: string | null = null;
    const files = new Map<string, { buffer: Buffer; mime: string }>();

    for await (const part of request.parts()) {
      if (part.type === "file") {
        const buffer = await part.toBuffer();
        files.set(path.basename(part.filename), { buffer, mime: part.mimetype });
      } else if (part.fieldname === "payload") {
        // @fastify/multipart 会对 Content-Type: application/json 的字段自动 JSON.parse，
        // 此时 part.value 是对象而不是字符串。两种形态都要接住。
        const value: unknown = part.value;
        rawPayload = typeof value === "string" ? value : JSON.stringify(value);
      }
    }

    if (!rawPayload) {
      return reply.code(422).send(apiError("VALIDATION_FAILED", "缺少 payload 字段", request.id));
    }

    let json: unknown;
    try {
      json = JSON.parse(rawPayload);
    } catch (error) {
      request.log.warn(
        { payloadLength: rawPayload.length, parseError: (error as Error).message },
        "payload json parse failed",
      );
      return reply.code(422).send(apiError("VALIDATION_FAILED", "payload 不是合法 JSON", request.id));
    }

    const parsed = PublishPayload.safeParse(json);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      return reply.code(422).send(
        apiError("VALIDATION_FAILED", `payload 校验失败：${issue?.path.join(".")} ${issue?.message}`, request.id, {
          issues: parsed.error.issues.slice(0, 5),
        }),
      );
    }
    const payload = parsed.data;
    const kind = payload.kind as CardKind;

    // 资产核对：声明的每个资产都要有同名文件，且哈希、类型都对得上。
    const uploads: Array<{ filename: string; mime: string; buffer: Buffer; role: string }> = [];
    for (const declaration of payload.assets) {
      const filename = path.basename(declaration.localPath);
      const file = files.get(filename);
      if (!file) {
        return reply.code(422).send(
          apiError("ASSET_HASH_MISMATCH", `缺少资产文件：${filename}`, request.id),
        );
      }
      if (!isAllowedAssetMime(file.mime)) {
        return reply.code(415).send(
          apiError("ASSET_TYPE_FORBIDDEN", `不支持的资产类型：${file.mime}`, request.id),
        );
      }
      const actual = `sha256:${sha256Hex(file.buffer)}`;
      if (actual !== declaration.sha256) {
        return reply.code(422).send(
          apiError("ASSET_HASH_MISMATCH", `资产哈希不一致：${filename}`, request.id),
        );
      }
      uploads.push({ filename, mime: file.mime, buffer: file.buffer, role: declaration.role });
    }

    try {
      const author = await prisma.account.findUnique({ where: { id: auth.account.id } });
      if (!author) {
        return reply.code(500).send(apiError("INTERNAL", "账号不存在", request.id));
      }

      const domain = await prisma.domain.upsert({
        where: { slug: payload.domain.slug },
        update: { name: payload.domain.name },
        create: { slug: payload.domain.slug, name: payload.domain.name },
      });

      const bodyHtml = renderMarkdown(payload.bodyMd);
      const contentHash = sha256Hex(payload.bodyMd);

      // source 是 PublishPayload 的顶层字段，但门户的 DTO 从 frontmatter 里取。
      // 合并存储，保证「发布时带的来源」和「门户显示的来源」是同一份数据。
      const frontmatter = {
        ...(payload.frontmatter as Record<string, unknown>),
        ...(payload.source ? { source: payload.source } : {}),
      };

      const existing = await prisma.publication.findUnique({
        where: { authorId_clientCardId: { authorId: author.id, clientCardId: payload.clientCardId } },
        include: LIST_INCLUDE,
      });

      if (existing) {
        const latest = existing.revisions[0];
        const url = `${env.publicBaseUrl}/c/${existing.id}`;
        if (latest?.contentHash === contentHash) {
          await replaceVariants(existing.id, payload.variants);
          await persistAssets(existing.id, existing.currentRevision, uploads, env);
          return reply.send({ id: existing.id, url, revision: existing.currentRevision, replay: true });
        }

        const revision = existing.currentRevision + 1;
        await prisma.$transaction(async (tx) => {
          await tx.publicationRevision.create({
            data: {
              publicationId: existing.id,
              revision,
              bodyMd: payload.bodyMd,
              bodyHtml,
              frontmatter: frontmatter as Prisma.InputJsonValue,
              contentHash,
            },
          });
          await tx.publication.update({
            where: { id: existing.id },
            data: {
              currentRevision: revision,
              title: payload.title,
              orgId,
              updatedAt: new Date(),
            },
          });
        });

        await replaceVariants(existing.id, payload.variants);
        await persistAssets(existing.id, revision, uploads, env);
        return reply.send({ id: existing.id, url, revision, replay: false });
      }

      const id = newPublicationId();
      const slug = publicationSlug(payload.title, id);

      const stored = await Promise.all(
        uploads.map((upload) =>
          saveAsset({
            dataDir: env.dataDir,
            publicationId: id,
            revision: 1,
            filename: upload.filename,
            mime: upload.mime,
            buffer: upload.buffer,
          }),
        ),
      );

      await prisma.$transaction(async (tx) => {
        await tx.publication.create({
          data: {
            id,
            authorId: author.id,
            domainId: domain.id,
            orgId,
            kind,
            title: payload.title,
            slug,
            clientCardId: payload.clientCardId,
            visibility: payload.visibility,
            currentRevision: 1,
          },
        });
        await tx.publicationRevision.create({
          data: {
            publicationId: id,
            revision: 1,
            bodyMd: payload.bodyMd,
            bodyHtml,
            frontmatter: frontmatter as Prisma.InputJsonValue,
            contentHash,
          },
        });
        if (stored.length > 0) {
          await tx.asset.createMany({
            data: stored.map((asset, index) => ({
              publicationId: id,
              revision: 1,
              kind: uploads[index]?.role ?? "visual",
              storageKey: asset.storageKey,
              mime: asset.mime,
              bytes: asset.bytes,
              sha256: asset.sha256,
            })),
          });
        }
      });

      await replaceVariants(id, payload.variants);
      return reply.code(201).send({
        id,
        url: `${env.publicBaseUrl}/c/${id}`,
        revision: 1,
        replay: false,
      });
    } catch (error) {
      request.log.error({ err: error }, "publish failed");
      return reply.code(500).send(apiError("INTERNAL", "发布失败，请查看服务端日志", request.id));
    }
  });

  app.post("/api/v1/publications/:id/withdraw", async (request, reply) => {
    const auth = await resolveAuth(request.headers.authorization, env);
    if (!auth) {
      return reply.code(401).send(apiError("AUTH_REQUIRED", "缺少或无效的设备令牌", request.id));
    }
    const { id } = request.params as { id: string };
    const row = await prisma.publication.findUnique({ where: { id }, include: { author: true } });
    if (!row) return reply.code(404).send(apiError("NOT_FOUND", "卡片不存在", request.id));
    if (row.authorId !== auth.account.id) {
      return reply.code(403).send(apiError("FORBIDDEN", "只能撤回自己发布的卡片", request.id));
    }

    await prisma.publication.update({ where: { id }, data: { status: "withdrawn" } });
    return reply.send({ id, status: "withdrawn" });
  });
}
