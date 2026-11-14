import { describe, expect, it } from "vitest";
import { parseLiterature, LiteratureReviewMeta, LITERATURE_SCHEMA } from "../src";

function makeLiterature(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    schema: LITERATURE_SCHEMA,
    citekey: "zhong-2015-a1b2",
    domain: { name: "课程与教学论", slug: "curriculum-theory" },
    title: "单元设计：撬动课堂转型的一个支点",
    authors: ["钟启泉"],
    year: 2015,
    doi: "10.1234/abcd.2015.001",
    status: "to_read",
    addedAt: "2026-11-13T10:00:00+08:00",
    updatedAt: "2026-11-13T10:00:00+08:00",
    ...overrides,
  };
}

describe("文献笔记 lit@1", () => {
  it("合法文献可解析", () => {
    const result = parseLiterature(makeLiterature());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.note.citekey).toBe("zhong-2015-a1b2");
      expect(result.note.status).toBe("to_read");
    }
  });

  it("没有 DOI 也没有 URL 时被拒（防 AI 编造）", () => {
    const result = parseLiterature(makeLiterature({ doi: undefined }));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues.some((issue) => issue.message.includes("DOI"))).toBe(true);
    }
  });

  it("citekey 只允许小写字母数字连字符", () => {
    expect(parseLiterature(makeLiterature({ citekey: "钟启泉2015" })).ok).toBe(false);
    expect(parseLiterature(makeLiterature({ citekey: "Zhong-2015" })).ok).toBe(false);
  });

  it("未知 schema 版本被明确拒收", () => {
    const result = parseLiterature(makeLiterature({ schema: "lit@2" }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("LITERATURE_SCHEMA_UNSUPPORTED");
  });

  it("状态缺省为 to_read", () => {
    const result = parseLiterature(makeLiterature({ status: undefined }));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.note.status).toBe("to_read");
  });
});

describe("文献综述元信息", () => {
  it("只要求领域与创建时间", () => {
    const result = LiteratureReviewMeta.safeParse({
      schema: "lit-review@1",
      domain: { name: "课程与教学论", slug: "curriculum-theory" },
      createdAt: "2026-11-13T10:00:00+08:00",
    });
    expect(result.success).toBe(true);
  });
});
