import Link from "next/link";
import { notFound } from "next/navigation";
import { getOrg, groupByDomain, listOrgPublications } from "../../../lib/api";
import { PublicationCard } from "../../components/PublicationCard";

export const dynamic = "force-dynamic";

export default async function OrgPage({ params }: { params: Promise<{ org: string }> }) {
  const { org: slug } = await params;
  const [org, items] = await Promise.all([getOrg(slug), listOrgPublications(slug)]);

  if (!org) notFound();

  const groups = groupByDomain(items);

  return (
    <>
      <nav className="breadcrumb">
        <Link href="/">全部组织</Link>
        <span className="muted"> › </span>
        <span>{org.name}</span>
      </nav>

      <section className="hero">
        <h1>{org.name}</h1>
        <p className="muted">
          {org.members.length} 位同学 · {items.length} 张卡片
        </p>
      </section>

      <div className="org-layout">
        <div>
          {groups.length === 0 ? (
            <div className="empty">
              <p>还没有公开的卡片</p>
              <p className="muted">学生在 Obsidian 里发布后会出现在这里。</p>
            </div>
          ) : (
            groups.map((group) => (
              <section className="group" key={group.slug}>
                <h2>{group.domain}</h2>
                <div className="card-grid">
                  {group.items.map((item) => (
                    <PublicationCard key={item.id} item={item} />
                  ))}
                </div>
              </section>
            ))
          )}
        </div>

        <aside className="org-aside">
          <h3>同学</h3>
          {org.members.map((member) => (
            <Link key={member.handle} href={`/o/${org.slug}/p/${member.handle}`} className="member-row">
              <span className="avatar">{member.displayName.slice(0, 1)}</span>
              <span className="member-name">{member.displayName}</span>
              <span className="muted">{member.cardCount} 张</span>
            </Link>
          ))}
        </aside>
      </div>
    </>
  );
}
