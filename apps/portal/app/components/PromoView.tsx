import Link from "next/link";
import type { PublicationDetail, PromoVariant } from "@rlc/contract";
import { formatDate } from "../../lib/api";
import { MermaidDiagram } from "./MermaidDiagram";

/**
 * 科普版正文：主标题、钩子、短段落、金句、行动、标签。
 *
 * 原卡片折叠在下方，点开才显示——对外的主版本是科普版，
 * 但读者随时能追到「谁、怎么读出来的」。
 */
export function PromoView({
  detail,
  promo,
}: {
  detail: PublicationDetail;
  promo: PromoVariant;
}) {
  const source = detail.source;

  return (
    <article className="detail promo-detail">
      <nav className="breadcrumb">
        <Link href="/">全部组织</Link>
        {detail.org ? (
          <>
            <span className="muted"> › </span>
            <Link href={`/o/${detail.org.slug}`}>{detail.org.name}</Link>
          </>
        ) : null}
        <span className="muted"> › </span>
        <span>{promo.audienceName}版</span>
      </nav>

      <div className="card-meta">
        <span className="badge">{promo.audienceName}</span>
        <span className="muted">{formatDate(detail.publishedAt)}</span>
        <span className="muted">AI 辅助改写 · 学习者审核</span>
      </div>

      <h1 className="promo-title">{promo.title}</h1>
      {promo.hook ? <p className="promo-hook">{promo.hook}</p> : null}

      {detail.coverUrl ? (
        <img className="promo-hero" src={detail.coverUrl} alt={promo.title} />
      ) : null}

      <div
        className="prose promo-body"
        dangerouslySetInnerHTML={{ __html: promo.bodyHtml ?? "" }}
      />

      {promo.figureMermaid ? (
        <div className="promo-figure">
          <div className="promo-figure-label">示意图</div>
          <MermaidDiagram chart={promo.figureMermaid} />
        </div>
      ) : null}

      {promo.quote ? <blockquote className="promo-quote">{promo.quote}</blockquote> : null}

      {promo.action ? (
        <div className="promo-action">
          <strong>可以试试</strong>
          <p>{promo.action}</p>
        </div>
      ) : null}

      {promo.tags.length > 0 ? (
        <div className="promo-tags">
          {promo.tags.map((tag) => (
            <span key={tag}>#{tag}</span>
          ))}
        </div>
      ) : null}

      {source?.doi ? (
        <p className="source-line">
          来源：
          <a href={`https://doi.org/${source.doi}`} target="_blank" rel="noreferrer noopener">
            {source.title}（{source.doi}）
          </a>
        </p>
      ) : null}

      <details className="original-card">
        <summary>查看学习者原始卡片 · {detail.author.displayName}</summary>
        <div className="prose" dangerouslySetInnerHTML={{ __html: detail.bodyHtml }} />
      </details>
    </article>
  );
}
