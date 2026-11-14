import { describe, expect, it } from "vitest";
import { SkimReportMeta, SKIM_SCHEMA } from "../src";

describe("略读报告元信息 skim@1", () => {
  it("合法元信息可解析，decision 缺省为 undecided", () => {
    const result = SkimReportMeta.safeParse({
      schema: SKIM_SCHEMA,
      citekey: "zhong-2015-a1b2",
      domain: { name: "课程与教学论", slug: "curriculum-theory" },
      createdAt: "2026-11-14T10:00:00+08:00",
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.decision).toBe("undecided");
  });

  it("decision 只接受三个值", () => {
    const base = {
      schema: SKIM_SCHEMA,
      citekey: "zhong-2015-a1b2",
      domain: { name: "课程与教学论", slug: "curriculum-theory" },
      createdAt: "2026-11-14T10:00:00+08:00",
    };
    expect(SkimReportMeta.safeParse({ ...base, decision: "deep_read" }).success).toBe(true);
    expect(SkimReportMeta.safeParse({ ...base, decision: "skip" }).success).toBe(true);
    expect(SkimReportMeta.safeParse({ ...base, decision: "maybe" }).success).toBe(false);
  });
});
