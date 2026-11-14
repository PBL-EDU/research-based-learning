import { describe, expect, it } from "vitest";
import {
  assetsDir,
  cardFilePath,
  domainSummaryPath,
  literatureDir,
  literatureNotePath,
  literatureReviewPath,
  safeSegment,
  shortId,
  skimReportPath,
} from "../src";

const CARD_ID = "3f2504e0-4f89-41d3-9a0c-0305e82c3301";
const CITEKEY = "zhong-2015-a1b2";

describe("v3 路径：文件夹名 = 文件前缀", () => {
  it("文献信息文件与文件夹同名", () => {
    expect(literatureNotePath("课程与教学论", CITEKEY)).toBe(
      `领域/课程与教学论/文献/${CITEKEY}/${CITEKEY}.md`,
    );
  });

  it("略读报告带文献前缀", () => {
    expect(skimReportPath("课程与教学论", CITEKEY)).toBe(
      `领域/课程与教学论/文献/${CITEKEY}/${CITEKEY}-略读.md`,
    );
  });

  it("精读卡片直接放在文献文件夹，带前缀", () => {
    expect(cardFilePath("deep_read", "课程与教学论", CITEKEY, CARD_ID)).toBe(
      `领域/课程与教学论/文献/${CITEKEY}/${CITEKEY}-dr-3f2504e.md`,
    );
  });

  it("实践卡片与文章总结同样带前缀", () => {
    expect(cardFilePath("practice", "课程与教学论", CITEKEY, CARD_ID)).toBe(
      `领域/课程与教学论/文献/${CITEKEY}/${CITEKEY}-pc-3f2504e.md`,
    );
    expect(cardFilePath("article_summary", "课程与教学论", CITEKEY, CARD_ID)).toBe(
      `领域/课程与教学论/文献/${CITEKEY}/${CITEKEY}-sum-3f2504e.md`,
    );
  });

  it("领域总结不属于单篇文献", () => {
    expect(cardFilePath("domain_summary", "课程与教学论", CITEKEY, CARD_ID)).toBe(
      "领域/课程与教学论/领域总结-阅读.md",
    );
    expect(domainSummaryPath("课程与教学论", "practice")).toBe(
      "领域/课程与教学论/领域总结-实践.md",
    );
  });

  it("领域综述在领域根目录", () => {
    expect(literatureReviewPath("课程与教学论")).toBe("领域/课程与教学论/文献综述.md");
  });

  it("资产目录与卡片同级", () => {
    expect(assetsDir("课程与教学论", CITEKEY)).toBe(
      `领域/课程与教学论/文献/${CITEKEY}/assets`,
    );
    expect(literatureDir("课程与教学论", CITEKEY)).toBe(`领域/课程与教学论/文献/${CITEKEY}`);
  });

  it("文件名以文献前缀开头", () => {
    const path = cardFilePath("deep_read", "课程与教学论", CITEKEY, CARD_ID);
    const name = path.split("/").pop() ?? "";
    expect(name.startsWith(`${CITEKEY}-dr-`)).toBe(true);
    expect(name).toMatch(/^zhong-2015-a1b2-dr-[0-9a-f]{7}\.md$/);
  });
});

describe("路径清洗", () => {
  it("去掉 Windows 非法字符", () => {
    expect(safeSegment('单元:设计/第一讲*"草稿"', "兜底")).not.toMatch(/[\\/:*?"<>|]/);
  });

  it("空名走兜底", () => {
    expect(safeSegment("   ", "未命名领域")).toBe("未命名领域");
  });

  it("超长名截断到 60 字符", () => {
    expect(safeSegment("长".repeat(200), "兜底")).toHaveLength(60);
  });

  it("短 id 取 7 位", () => {
    expect(shortId(CARD_ID)).toBe("3f2504e");
  });
});
