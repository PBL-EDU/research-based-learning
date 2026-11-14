import { describe, expect, it } from "vitest";
import {
  parseSkimVerdict,
  statusForDecision,
  stripSkimVerdict,
} from "../src/core/skim";

const WITH_VERDICT = [
  "## 研究问题",
  "",
  "单元是什么。",
  "",
  '<!-- rlc:verdict {"decision":"deep_read","confidence":"高","reasons":["直接谈单元本质","有课堂案例"]} rlc:verdict -->',
].join("\n");

describe("略读结论解析", () => {
  it("解析出结论、置信度与理由", () => {
    const verdict = parseSkimVerdict(WITH_VERDICT);
    expect(verdict.decision).toBe("deep_read");
    expect(verdict.confidence).toBe("高");
    expect(verdict.reasons).toHaveLength(2);
  });

  it("没有结论块时回落 undecided", () => {
    expect(parseSkimVerdict("## 研究问题\n\n没有结论").decision).toBe("undecided");
  });

  it("坏 JSON 回落 undecided，不抛异常", () => {
    expect(parseSkimVerdict("<!-- rlc:verdict {坏 rlc:verdict -->").decision).toBe("undecided");
  });

  it("非法 decision 回落 undecided", () => {
    const verdict = parseSkimVerdict('<!-- rlc:verdict {"decision":"maybe"} rlc:verdict -->');
    expect(verdict.decision).toBe("undecided");
  });

  it("去掉结论块后正文干净", () => {
    const stripped = stripSkimVerdict(WITH_VERDICT);
    expect(stripped).not.toContain("rlc:verdict");
    expect(stripped).toContain("单元是什么。");
  });
});

describe("结论驱动状态", () => {
  it("值得精读 → reading", () => {
    expect(statusForDecision("deep_read")).toBe("reading");
  });

  it("跳过 → skipped", () => {
    expect(statusForDecision("skip")).toBe("skipped");
  });

  it("未定 → 不改状态", () => {
    expect(statusForDecision("undecided")).toBeNull();
  });
});
