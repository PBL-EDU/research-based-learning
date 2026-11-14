import { describe, expect, it } from "vitest";
import { extractSection, skimReportDocument } from "../src";

const NOTE = [
  "---",
  "schema: lit@1",
  "---",
  "",
  "## 摘要",
  "",
  "这是摘要第一段。",
  "这是摘要第二段。",
  "",
  "## 为什么读它",
  "",
  "因为它谈单元设计。",
  "",
  "### 子标题",
  "",
  "子内容",
  "",
  "## 读后判断",
  "",
  "- [ ] 值得精读",
].join("\n");

describe("extractSection", () => {
  it("抽出摘要两段，遇到下一个二级标题停止", () => {
    const section = extractSection(NOTE, "摘要");
    expect(section).toBe("这是摘要第一段。\n这是摘要第二段。");
  });

  it("有子标题时不提前截断", () => {
    const section = extractSection(NOTE, "为什么读它");
    expect(section).toContain("因为它谈单元设计。");
    expect(section).toContain("子内容");
    expect(section).not.toContain("读后判断");
  });

  it("找不到标题时返回空串", () => {
    expect(extractSection(NOTE, "不存在的节")).toBe("");
  });

  it("标题后面没有内容时返回空串", () => {
    const md = "## 摘要\n\n## 下一节\n\n内容";
    expect(extractSection(md, "摘要")).toBe("");
  });
});

describe("skimReportDocument", () => {
  it("frontmatter 带 decision，正文完整", () => {
    const doc = skimReportDocument({
      domainName: "课程与教学论",
      domainSlug: "curriculum-theory",
      citekey: "zhong-2015-a1b2",
      decision: "deep_read",
      confidence: "高",
      createdAt: "2026-11-14T10:00:00+08:00",
      body: "## 研究问题\n\n单元是什么？",
      model: "deepseek-chat",
    });
    expect(doc).toContain("schema: skim@1");
    expect(doc).toContain("decision: deep_read");
    expect(doc).toContain("confidence: 高");
    expect(doc).toContain("## 研究问题");
  });
});
