import { describe, expect, it } from "vitest";
import { parseCardPath } from "../src";

describe("从路径反推归属 · 新布局", () => {
  it("精读卡片", () => {
    expect(
      parseCardPath("领域/课程与教学论/文献/zhong-2015-a1b2/zhong-2015-a1b2-dr-3f2504e.md"),
    ).toEqual({
      domain: "课程与教学论",
      citekey: "zhong-2015-a1b2",
      kind: "deep_read",
    });
  });

  it("实践卡片", () => {
    expect(
      parseCardPath("领域/课程与教学论/文献/zhong-2015-a1b2/zhong-2015-a1b2-pc-3f2504e.md")?.kind,
    ).toBe("practice");
  });

  it("文章总结", () => {
    expect(
      parseCardPath("领域/课程与教学论/文献/zhong-2015-a1b2/zhong-2015-a1b2-sum-1a2b3c4.md")?.kind,
    ).toBe("article_summary");
  });

  it("文献笔记与略读报告不算卡片", () => {
    expect(parseCardPath("领域/课程与教学论/文献/zhong-2015-a1b2/zhong-2015-a1b2.md")?.kind).toBe(
      "unknown",
    );
    expect(
      parseCardPath("领域/课程与教学论/文献/zhong-2015-a1b2/zhong-2015-a1b2-略读.md")?.kind,
    ).toBe("unknown");
  });
});

describe("从路径反推归属 · 旧布局兼容", () => {
  it("旧的 精读卡片/ 子目录仍然识别", () => {
    expect(
      parseCardPath("领域/课程与教学论/文献/zhong-2015-a1b2/精读卡片/dr-3f2504e.md"),
    ).toEqual({
      domain: "课程与教学论",
      citekey: "zhong-2015-a1b2",
      kind: "deep_read",
    });
  });

  it("旧的 文献信息.md 不算卡片", () => {
    expect(parseCardPath("领域/课程与教学论/文献/zhong-2015-a1b2/文献信息.md")?.kind).toBe(
      "unknown",
    );
  });
});

describe("边界", () => {
  it("领域总结没有 citekey", () => {
    expect(parseCardPath("领域/课程与教学论/领域总结-阅读.md")).toEqual({
      domain: "课程与教学论",
      citekey: null,
      kind: "domain_summary",
    });
  });

  it("不在领域目录下的文件返回 null", () => {
    expect(parseCardPath("00-系统/publish-outbox.jsonl")).toBeNull();
    expect(parseCardPath("领域")).toBeNull();
  });
});
