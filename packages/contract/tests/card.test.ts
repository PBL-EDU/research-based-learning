import { describe, expect, it } from "vitest";
import { parseCard } from "../src";
import {
  makeArticleSummary,
  makeDeepReadCard,
  makeDomainSummary,
  makePracticeCard,
} from "./fixtures";

describe("parseCard · 版本锚点", () => {
  it("缺少 schema 时返回 CARD_SCHEMA_UNSUPPORTED，而不是 CARD_INVALID", () => {
    const result = parseCard({ cardId: "x" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("CARD_SCHEMA_UNSUPPORTED");
    }
  });

  it("未来版本 dr-card@2 被明确拒收，不做尽力解析", () => {
    const result = parseCard(makeDeepReadCard({ schema: "dr-card@2" }));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("CARD_SCHEMA_UNSUPPORTED");
      expect(result.message).toContain("dr-card@2");
    }
  });

  it("非对象输入不会抛异常", () => {
    expect(parseCard(null).ok).toBe(false);
    expect(parseCard("字符串").ok).toBe(false);
  });
});

describe("parseCard · 精读卡片 dr-card@1", () => {
  it("解析合法卡片并套用默认值", () => {
    const result = parseCard(makeDeepReadCard());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.card.schema).toBe("dr-card@1");
      expect(result.card.kind).toBe("deep_read");
      expect(result.card.tags).toEqual(["单元设计", "大概念"]);
    }
  });

  it("原文摘录 299 字通过、301 字被拒（版权红线）", () => {
    const base = makeDeepReadCard();
    const aha = base.aha as Record<string, unknown>;

    const ok = parseCard(makeDeepReadCard({ aha: { ...aha, quote: "字".repeat(299) } }));
    expect(ok.ok).toBe(true);

    const tooLong = parseCard(makeDeepReadCard({ aha: { ...aha, quote: "字".repeat(301) } }));
    expect(tooLong.ok).toBe(false);
    if (!tooLong.ok) {
      expect(tooLong.code).toBe("CARD_INVALID");
      const quoteIssue = tooLong.issues.find((i) => i.path.join(".") === "aha.quote");
      expect(quoteIssue?.message).toContain("300");
    }
  });

  it("缺少 Aha 的任一点都不可发布", () => {
    const base = makeDeepReadCard();
    const aha = { ...(base.aha as Record<string, unknown>) };
    delete aha.insight;

    const result = parseCard({ ...base, aha });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("CARD_INVALID");
      expect(result.issues.some((i) => i.path.join(".") === "aha.insight")).toBe(true);
    }
  });

  it("文献没有 DOI 也没有 URL 时被拒（防 AI 编造）", () => {
    const base = makeDeepReadCard();
    const source = { ...(base.source as Record<string, unknown>) };
    delete source.doi;

    const result = parseCard({ ...base, source });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues.some((i) => i.message.includes("可核验"))).toBe(true);
    }
  });

  it("行动指导为空数组时被拒", () => {
    const result = parseCard(makeDeepReadCard({ actionGuidance: [] }));
    expect(result.ok).toBe(false);
  });
});

describe("parseCard · 实践卡片 pc-card@1", () => {
  it("只有计划、没有过程与总结也可以保存（实践是边走边记）", () => {
    const result = parseCard(makePracticeCard());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.card.schema).toBe("pc-card@1");
    }
  });

  it("成功标准为空时被拒——没有成功标准就无法复盘", () => {
    const base = makePracticeCard();
    const plan = { ...(base.plan as Record<string, unknown>), successCriteria: [] };
    const result = parseCard({ ...base, plan });
    expect(result.ok).toBe(false);
  });

  it("过程记录是追加型数组，可含多条", () => {
    const entry = {
      date: "2026-11-13T10:00:00+08:00",
      what: "提取了大概念",
      obstacle: "总是滑回课文清单",
      adjust: "先写表现性任务再写内容",
    };
    const result = parseCard(makePracticeCard({ process: [entry] }));
    expect(result.ok).toBe(true);
    if (result.ok && result.card.schema === "pc-card@1") {
      expect(result.card.process).toHaveLength(1);
    }
  });
});

describe("parseCard · 总结类", () => {
  it("文章总结可解析", () => {
    expect(parseCard(makeArticleSummary()).ok).toBe(true);
  });

  it("领域总结的 index 不能为空", () => {
    const result = parseCard(makeDomainSummary({ index: [] }));
    expect(result.ok).toBe(false);
  });
});
