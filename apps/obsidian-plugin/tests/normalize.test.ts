import { describe, expect, it } from "vitest";
import { normalizeDoi, parseTags, parseYear, splitAuthors } from "../src/core/normalize";

describe("输入归一化", () => {
  it("作者支持顿号、逗号、空格混排", () => {
    expect(splitAuthors("钟启泉、佐藤学, 李镇西 王荣生")).toEqual([
      "钟启泉",
      "佐藤学",
      "李镇西",
      "王荣生",
    ]);
  });

  it("年份只取 1500–2100 的四位数", () => {
    expect(parseYear("2015 年")).toBe(2015);
    expect(parseYear("")).toBeUndefined();
    expect(parseYear("999")).toBeUndefined();
    expect(parseYear("3015")).toBeUndefined();
  });

  it("DOI 链接归一成裸 DOI", () => {
    expect(normalizeDoi("https://doi.org/10.1234/abcd.2015.001")).toBe("10.1234/abcd.2015.001");
    expect(normalizeDoi("doi: 10.1234/abcd")).toBe("10.1234/abcd");
    expect(normalizeDoi("10.1234/abcd")).toBe("10.1234/abcd");
  });

  it("标签去重并截断到 10 个", () => {
    const tags = parseTags(
      ["单元设计", "大概念", "单元设计", "a", "b", "c", "d", "e", "f", "g", "h", "i"].join("，"),
    );
    expect(tags).toHaveLength(10);
    expect(tags[0]).toBe("单元设计");
    expect(new Set(tags).size).toBe(tags.length);
  });
});
