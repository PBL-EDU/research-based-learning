import Link from "next/link";
import { listOrgs } from "../lib/api";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const orgs = await listOrgs();

  return (
    <>
      <section className="hero">
        <h1>研究性学习社区</h1>
        <p className="muted">
          每个组织是一位老师的课堂：学生在 Obsidian 里精读文献、写下卡片，在这里被读到。
        </p>
      </section>

      {orgs.length === 0 ? (
        <div className="empty">
          <p>还没有组织</p>
          <p className="muted">老师完成部署后，这里会出现第一个组织。</p>
        </div>
      ) : (
        <div className="card-grid" style={{ marginTop: 24 }}>
          {orgs.map((org) => (
            <Link key={org.slug} href={`/o/${org.slug}`} className="card org-card">
              <div className="card-meta">
                <span className="badge">组织</span>
              </div>
              <h3>{org.name}</h3>
              <p className="muted">
                {org.memberCount} 位同学 · {org.publicationCount} 张卡片
              </p>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
