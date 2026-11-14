import Link from "next/link";
import { notFound } from "next/navigation";
import { getOrgStudent } from "../../../../../lib/api";
import { PublicationCard } from "../../../../components/PublicationCard";

export const dynamic = "force-dynamic";

export default async function StudentPage({
  params,
}: {
  params: Promise<{ org: string; handle: string }>;
}) {
  const { org: slug, handle } = await params;
  const student = await getOrgStudent(slug, handle);

  if (!student) notFound();

  return (
    <>
      <nav className="breadcrumb">
        <Link href="/">全部组织</Link>
        <span className="muted"> › </span>
        <Link href={`/o/${student.org.slug}`}>{student.org.name}</Link>
        <span className="muted"> › </span>
        <span>{student.displayName}</span>
      </nav>

      <section className="person-head">
        <span className="avatar avatar-lg">{student.displayName.slice(0, 1)}</span>
        <div>
          <h1>{student.displayName}</h1>
          <p className="muted">
            @{student.handle} · {student.org.name} · {student.items.length} 张卡片
          </p>
        </div>
      </section>

      {student.items.length === 0 ? (
        <div className="empty">
          <p>这位同学还没有公开的卡片</p>
        </div>
      ) : (
        <div className="card-grid">{student.items.map((item) => <PublicationCard key={item.id} item={item} />)}</div>
      )}
    </>
  );
}
