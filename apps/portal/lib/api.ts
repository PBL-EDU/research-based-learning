import type { PublicationDetail, PublicationListItem } from "@rlc/contract";

/**
 * 门户只在服务端调用 API：浏览器永远不直接访问 127.0.0.1:4000。
 * 这样 API 可以只监听内网，也不需要给浏览器配跨域。
 */
const API_BASE = (process.env.RLC_API_BASE ?? "http://127.0.0.1:4000").replace(/\/+$/, "");

async function fetchJson<T>(path: string): Promise<T | null> {
  try {
    const response = await fetch(`${API_BASE}${path}`, {
      cache: "no-store",
      headers: { accept: "application/json" },
    });
    if (!response.ok) return null;
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

export interface OrgSummary {
  slug: string;
  name: string;
  memberCount: number;
  publicationCount: number;
}

export interface OrgMember {
  handle: string;
  displayName: string;
  role: string;
  cardCount: number;
}

export interface OrgDetail {
  slug: string;
  name: string;
  members: OrgMember[];
}

export interface StudentPage {
  handle: string;
  displayName: string;
  org: { slug: string; name: string };
  items: PublicationListItem[];
}

export async function listOrgs(): Promise<OrgSummary[]> {
  const data = await fetchJson<{ items: OrgSummary[] }>("/api/v1/orgs");
  return data?.items ?? [];
}

export async function getOrg(slug: string): Promise<OrgDetail | null> {
  return fetchJson<OrgDetail>(`/api/v1/orgs/${encodeURIComponent(slug)}`);
}

export async function listOrgPublications(slug: string): Promise<PublicationListItem[]> {
  const data = await fetchJson<{ items: PublicationListItem[] }>(
    `/api/v1/orgs/${encodeURIComponent(slug)}/publications?limit=50`,
  );
  return data?.items ?? [];
}

export async function getOrgStudent(slug: string, handle: string): Promise<StudentPage | null> {
  return fetchJson<StudentPage>(
    `/api/v1/orgs/${encodeURIComponent(slug)}/members/${encodeURIComponent(handle)}`,
  );
}

export async function listPublications(): Promise<PublicationListItem[]> {
  const data = await fetchJson<{ items: PublicationListItem[] }>("/api/v1/publications?limit=50");
  return data?.items ?? [];
}

export async function getPublication(id: string): Promise<PublicationDetail | null> {
  return fetchJson<PublicationDetail>(`/api/v1/publications/${encodeURIComponent(id)}`);
}

export function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}/${month}/${day}`;
}

export function formatDay(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return `${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function groupByDomain(items: PublicationListItem[]): Array<{
  domain: string;
  slug: string;
  items: PublicationListItem[];
}> {
  const groups = new Map<string, { domain: string; slug: string; items: PublicationListItem[] }>();
  for (const item of items) {
    const key = item.domain.slug;
    const existing = groups.get(key);
    if (existing) {
      existing.items.push(item);
    } else {
      groups.set(key, { domain: item.domain.name, slug: item.domain.slug, items: [item] });
    }
  }
  return [...groups.values()];
}
