import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { formatDate, getPublication } from "../../../lib/api";
import { PromoView } from "../../components/PromoView";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  const detail = await getPublication(id);
  if (!detail) return { title: "卡片不存在" };

  return {
    title: detail.title,
    description: detail.excerpt,
    openGraph: {
      title: detail.title,
      description: detail.excerpt,
      type: "article",
      publishedTime: detail.publishedAt,
      authors: [detail.author.displayName],
      ...(detail.assets?.[0]?.url ? { images: [detail.assets[0].url] } : {}),
    },
  };
}

export default async function CardPage({ params }: PageProps) {
  const { id } = await params;
  const detail = await getPublication(id);
  if (!detail) notFound();

  const source = detail.source;
  const promo = detail.variants?.[0];

  // 有科普版时，门户的主视图是科普版；原始卡片折叠在下方。
  if (promo) return <PromoView detail={detail} promo={promo} />;

  return (
    <article className="detail">
      <nav className="breadcrumb">
        <Link href="/">全部组织</Link>
        {detail.org ? (
          <>
            <span className="muted"> › </span>
            <Link href={`/o/${detail.org.slug}`}>{detail.org.name}</Link>
            <span className="muted"> › </span>
            <Link href={`/o/${detail.org.slug}/p/${detail.author.handle}`}>
              {detail.author.displayName}
            </Link>
          </>
        ) : null}
        <span className="muted"> › </span>
        <span>{detail.domain.name}</span>
      </nav>

      <header className="detail-head">
        <div className="card-meta">
          <span className="badge">{detail.domain.name}</span>
          <span className="muted">{formatDate(detail.publishedAt)}</span>
          <span className="muted">修订 v{detail.revision}</span>
        </div>
        <h1>{detail.title}</h1>
        <p className="byline">
          {detail.author.displayName}
          {source?.authors?.length ? ` · 文献作者：${source.authors.join("、")}` : ""}
          {source?.year ? ` · ${source.year}` : ""}
        </p>
        {source?.doi ? (
          <p className="source-line">
            来源：
            <a href={`https://doi.org/${source.doi}`} target="_blank" rel="noreferrer noopener">
              {source.title}（{source.doi}）
            </a>
          </p>
        ) : source?.url ? (
          <p className="source-line">
            来源：
            <a href={source.url} target="_blank" rel="noreferrer noopener">
              {source.title}
            </a>
          </p>
        ) : null}
      </header>

      <div className="prose" dangerouslySetInnerHTML={{ __html: detail.bodyHtml }} />

      {detail.assets && detail.assets.length > 0 ? (
        <section className="assets">
          {detail.assets.map((asset) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={asset.url} src={asset.url} alt="" loading="lazy" />
          ))}
        </section>
      ) : null}

      <footer className="detail-foot">
        <p className="muted">
          这张卡片由学生在 Obsidian 中完成并主动发布。若要引用，请标注作者与原始文献。
        </p>
        <p className="muted">
          评论 {detail.counts.comments} · 赞 {detail.counts.likes} · 转发 {detail.counts.reposts}
        </p>
      </footer>
    </article>
  );
}
