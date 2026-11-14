import { describe, expect, it } from "vitest";
import { citekeyFor, domainSlug, literatureFolder, slugifyAscii, stableHash } from "../src";

describe("slugifyAscii", () => {
  it("小写化并去掉变音符号", () => {
    expect(slugifyAscii("Café Étude")).toBe("cafe-etude");
  });

  it("非字母数字折叠成连字符", () => {
    expect(slugifyAscii("Hello, World!")).toBe("hello-world");
  });

  it("首尾连字符去掉", () => {
    expect(slugifyAscii("  --ABC--  ")).toBe("abc");
  });

  it("中文没有 ASCII 形式，返回空串", () => {
    expect(slugifyAscii("课程与教学论")).toBe("");
  });
});

describe("stableHash", () => {
  it("固定 8 位十六进制且稳定", () => {
    expect(stableHash("abc")).toBe(stableHash("abc"));
    expect(stableHash("abc")).toMatch(/^[0-9a-f]{8}$/);
  });

  it("不同输入不同结果", () => {
    expect(stableHash("abc")).not.toBe(stableHash("abd"));
  });
});

describe("domainSlug", () => {
  it("英文领域直接用 slug", () => {
    expect(domainSlug("Emotion")).toBe("emotion");
  });

  it("中文领域回落为 d- + 哈希", () => {
    const slug = domainSlug("课程与教学论");
    expect(slug).toMatch(/^d-[0-9a-f]{8}$/);
    expect(domainSlug("课程与教学论")).toBe(slug);
  });
});

describe("citekeyFor", () => {
  it("作者-年份-短哈希", () => {
    const key = citekeyFor({
      title: "The voice of emotion: An FMRI study",
      authors: ["Johnstone, T."],
      year: 2006,
      doi: "10.1093/scan/nsl005",
    });
    expect(key).toMatch(/^johnstone-t-2006-[0-9a-f]{4}$/);
  });

  it("同一篇文献永远得到同一个 citekey", () => {
    const input = {
      title: "Constants across cultures in the face and emotion",
      authors: ["Ekman, P."],
      year: 1971,
      doi: "10.1037/h0030377",
    };
    expect(citekeyFor(input)).toBe(citekeyFor(input));
  });

  it("没有作者时用标题前三词", () => {
    const key = citekeyFor({ title: "Core affect and the psychological construction", year: 2003 });
    expect(key).toMatch(/^core-affect-and-2003-[0-9a-f]{4}$/);
  });

  it("没有年份写 nd", () => {
    expect(citekeyFor({ title: "Something", authors: ["Doe, J."] })).toMatch(
      /^doe-j-nd-[0-9a-f]{4}$/,
    );
  });

  it("中文标题且无作者时回落 lit", () => {
    expect(citekeyFor({ title: "单元设计：撬动课堂转型", year: 2015 })).toMatch(
      /^lit-2015-[0-9a-f]{4}$/,
    );
  });
});

describe("literatureFolder：文件夹用可读标题", () => {
  it("短标题原样使用", () => {
    expect(literatureFolder("The experience of emotion", "barrett-2007-5f6a")).toBe(
      "The experience of emotion",
    );
  });

  it("超长标题截断到 36 字以内", () => {
    const long = "单元设计撬动课堂转型的一个支点及其后续影响与再讨论续篇";
    expect(literatureFolder(long, "zhong-2015-a1b2").length).toBeLessThanOrEqual(36);
  });

  it("英文标题在词边界截断，不从词中间切开", () => {
    const full = "Constants across cultures in the face and emotion";
    const name = literatureFolder(full, "ekman-1971-9742");
    expect(name.length).toBeLessThanOrEqual(36);
    expect(name.endsWith(" ")).toBe(false);
    expect(full.startsWith(name)).toBe(true);
  });

  it("去掉文件系统非法字符", () => {
    expect(literatureFolder("单元:设计/第一讲", "lit-2020-0000")).toBe("单元 设计 第一讲");
  });

  it("空标题回落到 citekey", () => {
    expect(literatureFolder("   ", "lit-2020-0000")).toBe("lit-2020-0000");
  });
});
