import { describe, expect, it } from "vitest";
import {
  hasDoi,
  isReviewEmpty,
  normalizeTitle,
  parseCandidates,
  stripCandidates,
  titleMatches,
} from "../src/core/review";

const BLOCK = [
  "## 参考文献",
  "",
  "候选如下。",
  "",
  "<!-- rlc:candidates",
  JSON.stringify(
    [
      {
        title: "单元设计：撬动课堂转型的一个支点",
        authors: ["钟启泉"],
        year: 2015,
        venue: "教育发展研究",
        doi: "10.1234/abcd.2015.001",
        why: "提出单元是学习经验链",
      },
      { title: "没有 DOI 的一条", authors: [], year: 1999 },
      { title: "", authors: ["空标题"] },
      "不是对象",
    ],
    null,
    0,
  ),
  "rlc:candidates -->",
  "",
].join("\n");

describe("候选文献清单", () => {
  it("解析出合法候选，跳过坏条目", () => {
    const candidates = parseCandidates(BLOCK);
    expect(candidates).toHaveLength(2);
    expect(candidates[0]?.title).toContain("单元设计");
    expect(candidates[0]?.doi).toBe("10.1234/abcd.2015.001");
    expect(candidates[1]?.doi).toBeUndefined();
  });

  it("没有候选块时返回空数组", () => {
    expect(parseCandidates("## 参考文献\n\n什么也没有")).toEqual([]);
  });

  it("坏 JSON 不抛异常", () => {
    expect(parseCandidates("<!-- rlc:candidates [{坏 rlc:candidates -->")).toEqual([]);
  });

  it("去掉候选块后正文变干净", () => {
    const stripped = stripCandidates(BLOCK);
    expect(stripped).not.toContain("rlc:candidates");
    expect(stripped).toContain("## 参考文献");
    expect(stripped.endsWith("\n\n")).toBe(false);
  });

  it("只把形如 DOI 的字符串认作 DOI", () => {
    expect(hasDoi({ title: "t", authors: [], doi: "10.1234/abc" })).toBe(true);
    expect(hasDoi({ title: "t", authors: [], doi: "abc" })).toBe(false);
  });
});

describe("标题比对", () => {
  it("忽略标点与空格", () => {
    expect(normalizeTitle("单元设计：撬动课堂转型的一个支点")).toBe(
      normalizeTitle("单元设计 撬动课堂转型的一个支点"),
    );
  });

  it("完全一致视为匹配", () => {
    expect(titleMatches("单元设计：撬动课堂转型的一个支点", "单元设计：撬动课堂转型的一个支点")).toBe(true);
  });

  it("副标题差异仍算匹配（避免误伤）", () => {
    expect(
      titleMatches(
        "单元设计：撬动课堂转型的一个支点",
        "单元设计——撬动课堂转型的一个支点（修订版）",
      ),
    ).toBe(true);
  });

  it("不同文献不匹配", () => {
    expect(titleMatches("课程与教学论", "教育心理学导论")).toBe(false);
  });
});

describe("空综述识别", () => {
  const BLANK = [
    "---",
    "schema: lit-review@1",
    "domain:",
    "  name: 课程与教学论",
    "  slug: curriculum-theory",
    "createdAt: 2026-11-14T10:00:00+08:00",
    "---",
    "",
    "# 课程与教学论 · 文献综述",
    "",
    "> 这份综述只应引用本领域「文献」目录下已录入的文献。",
    "",
    "## 这个领域在争论什么",
    "",
    "",
    "## 主要脉络",
    "",
    "### 脉络一",
    "",
    "",
    "## 参考文献",
    "",
    "（用 `[[文献/<citekey>/文献信息]]` 链接到文献笔记，一条一行）",
  ].join("\n");

  it("模板骨架算空", () => {
    expect(isReviewEmpty(BLANK)).toBe(true);
  });

  it("写进正文后不算空", () => {
    const written = BLANK.replace(
      "## 这个领域在争论什么\n",
      "## 这个领域在争论什么\n\n课程论长期围绕「学科逻辑」与「经验逻辑」争论。\n",
    );
    expect(isReviewEmpty(written)).toBe(false);
  });

  it("带候选清单时不算空（即使正文很短）", () => {
    const withCandidates = `${BLANK}\n<!-- rlc:candidates\n[{"title":"单元设计","authors":["钟启泉"],"year":2015,"doi":"10.1234/abc"}]\nrlc:candidates -->`;
    expect(isReviewEmpty(withCandidates)).toBe(false);
  });
});
