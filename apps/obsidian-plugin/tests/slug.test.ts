import { describe, expect, it } from "vitest";
import { domainSlug, slugifyAscii, stableHash } from "../src/core/slug";

describe("slug", () => {
  it("拉丁字母转 kebab", () => {
    expect(slugifyAscii("Curriculum Theory")).toBe("curriculum-theory");
    expect(slugifyAscii("Unit  Design!")).toBe("unit-design");
  });

  it("纯中文回落到稳定哈希，且每次相同", () => {
    const first = domainSlug("课程与教学论");
    const second = domainSlug("课程与教学论");
    expect(first).toBe(second);
    expect(first).toMatch(/^d-[0-9a-f]{8}$/);
  });

  it("不同中文名不会撞到同一个 slug", () => {
    expect(domainSlug("课程与教学论")).not.toBe(domainSlug("教育心理学"));
  });

  it("产出符合契约的 slug 规则", () => {
    for (const name of ["课程与教学论", "Curriculum Theory", "AI 教育"]) {
      expect(domainSlug(name)).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
    }
  });

  it("哈希稳定", () => {
    expect(stableHash("abc")).toBe(stableHash("abc"));
    expect(stableHash("abc")).toHaveLength(8);
  });
});
