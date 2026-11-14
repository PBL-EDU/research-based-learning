import Link from "next/link";
import type { PublicationListItem } from "@rlc/contract";
import { formatDate } from "../../lib/api";

const KIND_LABEL: Record<string, string> = {
  deep_read: "精读",
  practice: "实践",
  article_summary: "总结",
  domain_summary: "领域",
};

/** 卡片列表项：门户首页、组织页、同学页共用，保证三处长得一样。 */
export function PublicationCard({ item }: { item: PublicationListItem }) {
  return (
    <article className="card">
      <div className="card-meta">
        <span className="badge">{KIND_LABEL[item.kind] ?? item.kind}</span>
        <span className="muted">{formatDate(item.publishedAt)}</span>
      </div>
      <h3>
        <Link href={`/c/${item.id}`}>{item.title}</Link>
      </h3>
      <p className="excerpt">{item.excerpt}</p>
      <div className="card-foot">
        <span className="author">{item.author.displayName}</span>
        <span className="muted">
          评论 {item.counts.comments} · 赞 {item.counts.likes}
        </span>
      </div>
    </article>
  );
}
