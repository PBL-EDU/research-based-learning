import { marked } from "marked";

/** 去掉文件开头的 YAML frontmatter。门户渲染时不展示元数据。 */
export function stripFrontmatter(markdown: string): string {
  const text = markdown.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n");
  if (!text.startsWith("---")) return text;
  const lines = text.split("\n");
  for (let i = 1; i < lines.length; i += 1) {
    const line = lines[i];
    if (line === undefined) break;
    if (line.trim() === "---") {
      return lines
        .slice(i + 1)
        .join("\n")
        .replace(/^\n+/, "");
    }
  }
  return text;
}

/**
 * Markdown → HTML。
 *
 * 只渲染正文，不渲染 frontmatter；不做 HTML 白名单（P0 只有作者自己能发布，
 * 到 P2 开放读者评论时再引入 sanitizer——那时威胁模型才真正改变）。
 */
export function renderMarkdown(markdown: string): string {
  const body = stripFrontmatter(markdown);
  return marked.parse(body, { async: false, gfm: true, breaks: false }) as string;
}

/** 列表页摘要：优先用 Aha 摘录，其次取正文前 140 字。 */
export function excerptFrom(input: { bodyMd: string; frontmatter: unknown }): string {
  const frontmatter = input.frontmatter as
    | { aha?: { quote?: unknown }; overall?: unknown }
    | null;

  const quote = frontmatter?.aha?.quote;
  if (typeof quote === "string" && quote.trim().length > 0) {
    return truncate(quote.trim(), 140);
  }

  const overall = frontmatter?.overall;
  if (typeof overall === "string" && overall.trim().length > 0) {
    return truncate(overall.trim(), 140);
  }

  const plain = stripFrontmatter(input.bodyMd)
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/[>*_`]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return truncate(plain, 140);
}

function truncate(input: string, max: number): string {
  if (input.length <= max) return input;
  return `${input.slice(0, max - 1)}…`;
}
