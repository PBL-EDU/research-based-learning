import { describe, expect, it } from "vitest";
import {
  buildOverview,
  formatDay,
  type CardSummary,
  type LiteratureSummary,
} from "../src/core/overview";

function literature(overrides: Partial<LiteratureSummary> = {}): LiteratureSummary {
  return {
    domain: "课程与教学论",
    citekey: "zhong-2015-a1b2",
    folder: "单元设计",
    title: "单元设计：撬动课堂转型的一个支点",
    authors: ["钟启泉"],
    year: 2015,
    status: "to_read",
    notePath: "领域/课程与教学论/文献/单元设计/单元设计.md",
    cardCount: 0,
    updatedAt: "2026-11-13T10:00:00+08:00",
    ...overrides,
  };
}

function card(overrides: Partial<CardSummary> = {}): CardSummary {
  return {
    path: "领域/课程与教学论/文献/单元设计/单元设计-dr-1.md",
    kind: "deep_read",
    title: "卡片",
    domain: "课程与教学论",
    citekey: "单元设计",
    updatedAt: "2026-11-13T10:00:00+08:00",
    ...overrides,
  };
}

describe("总览：领域 → 文献 → 卡片", () => {
  it("空输入不炸", () => {
    const overview = buildOverview([], []);
    expect(overview).toMatchObject({ cardTotal: 0, literatureTotal: 0, domainTotal: 0, domains: [] });
  });

  it("文献按领域分组，卡片挂到对应文献下", () => {
    const overview = buildOverview(
      [card(), card({ path: "x", title: "第二张" })],
      [literature(), literature({ domain: "教育心理学", citekey: "li-2020-b2c3", title: "另一篇" })],
    );

    expect(overview.domainTotal).toBe(2);
    expect(overview.literatureTotal).toBe(2);

    const curriculum = overview.domains.find((node) => node.domain === "课程与教学论");
    expect(curriculum?.literatures[0]?.cards).toHaveLength(2);
    expect(curriculum?.literatures[0]?.cardCount).toBe(2);
    expect(curriculum?.cardTotal).toBe(2);
  });

  it("citekey 对不上文献的卡片进 orphans，不静默丢弃", () => {
    const overview = buildOverview(
      [card({ citekey: "not-exist" }), card({ citekey: null, path: "孤儿.md" })],
      [literature()],
    );
    expect(overview.orphans).toHaveLength(2);
  });

  it("文献按卡片数排序", () => {
    const overview = buildOverview(
      [card({ citekey: "a" }), card({ path: "2", citekey: "a" }), card({ path: "3", citekey: "b" })],
      [literature({ citekey: "a", title: "A" }), literature({ citekey: "b", title: "B" })],
    );
    const node = overview.domains[0];
    expect(node?.literatures.map((item) => item.citekey)).toEqual(["a", "b"]);
  });

  it("领域按最近更新排序", () => {
    const overview = buildOverview(
      [],
      [
        literature({ domain: "旧领域", updatedAt: "2026-01-01T00:00:00+08:00" }),
        literature({ domain: "新领域", citekey: "x", updatedAt: "2026-11-13T00:00:00+08:00" }),
      ],
    );
    expect(overview.domains.map((node) => node.domain)).toEqual(["新领域", "旧领域"]);
  });

  it("统计三类卡片", () => {
    const overview = buildOverview(
      [card(), card({ path: "p", kind: "practice" }), card({ path: "s", kind: "domain_summary" })],
      [literature()],
    );
    expect(overview.deepRead).toBe(1);
    expect(overview.practice).toBe(1);
    expect(overview.summary).toBe(1);
  });

  it("最近卡片最多 6 条", () => {
    const cards = Array.from({ length: 9 }, (_, index) =>
      card({ path: `p${index}`, updatedAt: `2026-11-${String(index + 1).padStart(2, "0")}T00:00:00+08:00` }),
    );
    const overview = buildOverview(cards, [literature()]);
    expect(overview.recent).toHaveLength(6);
    expect(overview.recent[0]?.path).toBe("p8");
  });

  it("只有目录、还没有文献的领域也出现在总览里", () => {
    const overview = buildOverview([], [], ["课程与教学论"]);
    expect(overview.domainTotal).toBe(1);
    expect(overview.domains[0]).toMatchObject({
      domain: "课程与教学论",
      literatureTotal: 0,
      cardTotal: 0,
      literatures: [],
    });
  });

  it("日期格式化", () => {
    expect(formatDay("2026-11-13T10:00:00+08:00")).toBe("2026-11-13");
    expect(formatDay(undefined)).toBe("");
  });
});
