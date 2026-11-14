import { describe, expect, it } from "vitest";
import {
  literatureFromMarkdown,
  literatureNotePath,
  literatureReviewTemplate,
  literatureTemplate,
} from "../src";

const NOTE = {
  schema: "lit@1" as const,
  citekey: "zhong-2015-a1b2",
  domain: { name: "课程与教学论", slug: "curriculum-theory" },
  title: "单元设计：撬动课堂转型的一个支点",
  authors: ["钟启泉"],
  year: 2015,
  doi: "10.1234/abcd.2015.001",
  status: "to_read" as const,
  addedAt: "2026-11-13T10:00:00+08:00",
  updatedAt: "2026-11-13T10:00:00+08:00",
};

describe("文献笔记文件", () => {
  it("模板带 frontmatter 与三段正文结构", () => {
    const md = literatureTemplate(NOTE);
    expect(md).toContain("schema: lit@1");
    expect(md).toContain("## 摘要");
    expect(md).toContain("## 为什么读它");
    expect(md).toContain("## 读后判断");
  });

  it("往返解析后字段一致", () => {
    const parsed = literatureFromMarkdown(literatureTemplate(NOTE));
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.note.citekey).toBe(NOTE.citekey);
      expect(parsed.note.doi).toBe(NOTE.doi);
      expect(parsed.note.authors).toEqual(["钟启泉"]);
    }
  });

  it("中文与冒号不影响 YAML", () => {
    const parsed = literatureFromMarkdown(
      literatureTemplate({ ...NOTE, title: '单元设计：一个"支点"与：冒号' }),
    );
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.note.title).toBe('单元设计：一个"支点"与：冒号');
  });

  it("缺 DOI 的文献文件被拒", () => {
    const md = literatureTemplate({ ...NOTE, doi: undefined });
    const parsed = literatureFromMarkdown(md);
    expect(parsed.ok).toBe(false);
  });

  it("不是文献文件时明确报 schema 不支持", () => {
    const parsed = literatureFromMarkdown(["---", "schema: dr-card@1", "---", "正文"].join("\n"));
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.code).toBe("LITERATURE_SCHEMA_UNSUPPORTED");
  });
});

describe("领域综述模板", () => {
  it("带 lit-review@1 元信息与固定章节", () => {
    const md = literatureReviewTemplate({
      domainName: "课程与教学论",
      domainSlug: "curriculum-theory",
      createdAt: "2026-11-13T10:00:00+08:00",
    });
    expect(md).toContain("schema: lit-review@1");
    expect(md).toContain("## 这个领域在争论什么");
    expect(md).toContain("## 参考文献");
    expect(md).toContain("无法核验的引用是大忌");
  });
});

describe("路径", () => {
  it("文献信息文件与文件夹同名", () => {
    expect(literatureNotePath("课程与教学论", "zhong-2015-a1b2")).toBe(
      "领域/课程与教学论/文献/zhong-2015-a1b2/zhong-2015-a1b2.md",
    );
  });
});
