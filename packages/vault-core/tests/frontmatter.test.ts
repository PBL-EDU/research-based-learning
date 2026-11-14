import { describe, expect, it } from "vitest";
import { parseCard } from "@rlc/contract";
import { cardFromMarkdown, cardToMarkdown, patchFrontmatter, splitFrontmatter } from "../src";

/**
 * 本地夹具：不跨包 import 测试文件（会越过 tsconfig 的 rootDir）。
 * 与 packages/contract/tests/fixtures 保持同构，改契约字段时两处一起改。
 */
function makeDeepReadCard(): Record<string, unknown> {
  return {
    schema: "dr-card@1",
    cardId: "3f2504e0-4f89-41d3-9a0c-0305e82c3301",
    kind: "deep_read",
    domain: { name: "课程与教学论", slug: "curriculum-theory" },
    theme: "单元设计",
    title: "单元是一条学习经验链，不是一个内容包",
    tags: ["单元设计"],
    source: {
      type: "literature",
      citekey: "zhong2015",
      doi: "10.1234/abcd.2015.001",
      title: "单元设计：撬动课堂转型的一个支点",
      authors: ["钟启泉"],
      year: 2015,
      license: "publisher",
    },
    aha: {
      quote: "单元不是教材内容的搬运单位，而是一条完整的学习经验链。",
      experience: "我过去备课时，总是先数这一单元有几篇课文。",
      insight: "它推翻了我把单元等同于教材章节的默认假设。",
      inspiration: "可以把单元当作一次完整经验的发生器来设计。",
      meaning: "备课的第一句话从「讲哪几课」变成「让学生经历什么」。",
    },
    conceptValue: { level: "高", note: "改变了单元=教材章节的默认假设" },
    actionGuidance: [
      { action: "把下周两课时改成一个单元来设计", trigger: "备课时", metric: "能写出大概念与表现性任务" },
    ],
    visuals: [{ kind: "mermaid", path: "assets/aha.mmd" }],
    createdAt: "2026-11-12T21:10:00+08:00",
    updatedAt: "2026-11-13T09:55:00+08:00",
  };
}

function card() {
  const result = parseCard(makeDeepReadCard());
  if (!result.ok) throw new Error(result.message);
  return result.card;
}

describe("frontmatter 分割", () => {
  it("取到开头 --- 块，正文里的 --- 不受影响", () => {
    const md = ["---", "a: 1", "---", "", "正文", "", "---", "", "分隔线之后"].join("\n");
    const split = splitFrontmatter(md);
    expect(split.frontmatter).toBe("a: 1");
    expect(split.body).toContain("分隔线之后");
  });

  it("没有 frontmatter 时返回 null", () => {
    expect(splitFrontmatter("只有正文").frontmatter).toBeNull();
  });
});

describe("卡片 ↔ Markdown 往返", () => {
  it("精读卡片可以无损往返", () => {
    const original = card();
    const markdown = cardToMarkdown(original);
    const parsed = cardFromMarkdown(markdown);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.card.schema).toBe("dr-card@1");
      expect(parsed.card.cardId).toBe(original.cardId);
      if (parsed.card.schema === "dr-card@1" && original.schema === "dr-card@1") {
        expect(parsed.card.aha).toEqual(original.aha);
        expect(parsed.card.actionGuidance).toEqual(original.actionGuidance);
        expect(parsed.card.source.doi).toBe(original.source.doi);
      }
    }
  });

  it("含冒号、引号、中文的摘录不会被 YAML 截断", () => {
    const original = card();
    if (original.schema !== "dr-card@1") throw new Error("夹具类型不对");
    const tricky = '他说：「单元：不是内容包」，也不是 "章节"。';
    const result = parseCard({
      ...original,
      aha: { ...original.aha, quote: tricky },
    });
    if (!result.ok) throw new Error(result.message);

    const roundTrip = cardFromMarkdown(cardToMarkdown(result.card));
    expect(roundTrip.ok).toBe(true);
    if (roundTrip.ok && roundTrip.card.schema === "dr-card@1") {
      expect(roundTrip.card.aha.quote).toBe(tricky);
    }
  });

  it("渲染出的正文包含 Aha 的五个小节", () => {
    const markdown = cardToMarkdown(card());
    for (const heading of ["## 原文", "## 我的体验", "## Aha", "## 新启发", "## 对生活的意义"]) {
      expect(markdown).toContain(heading);
    }
  });

  it("未知版本的文件被拒收，而不是静默解析", () => {
    const markdown = ["---", "schema: dr-card@9", "cardId: x", "---", "", "正文"].join("\n");
    const parsed = cardFromMarkdown(markdown);
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.code).toBe("CARD_SCHEMA_UNSUPPORTED");
  });
});

describe("只改 frontmatter 的写回", () => {
  it("写发布回执时正文一字不改", () => {
    const markdown = cardToMarkdown(card());
    const bodyBefore = splitFrontmatter(markdown).body;

    const patched = patchFrontmatter(markdown, {
      publish: { id: "pub_01JABCDEFGHJKMNPQRSTVWXYZ0", revision: 1 },
    });

    expect(splitFrontmatter(patched).body).toBe(bodyBefore);
    expect(patched).toContain("pub_01JABCDEFGHJKMNPQRSTVWXYZ0");
  });
});
