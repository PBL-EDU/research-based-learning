import { describe, expect, it } from "vitest";
import { checkPublishable, parseCard, type AnyCardV1 } from "../src";
import { makeDeepReadCard, makePracticeCard } from "./fixtures";

function parsed(input: Record<string, unknown>): AnyCardV1 {
  const result = parseCard(input);
  if (!result.ok) {
    throw new Error(`夹具应当合法：${result.message}`);
  }
  return result.card;
}

describe("checkPublishable", () => {
  it("合法精读卡片无阻断项", () => {
    const readiness = checkPublishable(parsed(makeDeepReadCard()));
    expect(readiness.ok).toBe(true);
    expect(readiness.blockers).toHaveLength(0);
  });

  it("有实践总结却没有任何过程记录 → 阻断（总结无法复盘）", () => {
    const card = parsed(
      makePracticeCard({
        summary: { outcome: "完成了单元设计", delta: "不再按课文数备课" },
      }),
    );
    const readiness = checkPublishable(card);
    expect(readiness.ok).toBe(false);
    expect(readiness.blockers.map((b) => b.code)).toContain(
      "PRACTICE_SUMMARY_WITHOUT_PROCESS",
    );
  });

  it("实践卡片没有关联精读卡片 → 警告而非阻断", () => {
    const card = parsed(makePracticeCard({ linkedCards: [] }));
    const readiness = checkPublishable(card);
    expect(readiness.ok).toBe(true);
    expect(readiness.warnings.map((w) => w.code)).toContain("PRACTICE_NO_LINKED_CARD");
  });

  it("更新时间早于创建时间 → 阻断", () => {
    const card = parsed(
      makeDeepReadCard({
        createdAt: "2026-11-13T09:55:00+08:00",
        updatedAt: "2026-11-12T21:10:00+08:00",
      }),
    );
    const readiness = checkPublishable(card);
    expect(readiness.ok).toBe(false);
    expect(readiness.blockers.map((b) => b.code)).toContain("TIME_INCONSISTENT");
  });

  it("公开且授权未知 → 警告，提示人工确认引用边界", () => {
    const base = makeDeepReadCard();
    const source = { ...(base.source as Record<string, unknown>), license: "unknown" };
    const card = parsed({
      ...base,
      source,
      publish: { visibility: "public" },
    });
    const readiness = checkPublishable(card);
    expect(readiness.ok).toBe(true);
    expect(readiness.warnings.map((w) => w.code)).toContain("LICENSE_UNKNOWN");
  });
});
