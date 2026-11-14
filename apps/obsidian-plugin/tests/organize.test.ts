import { describe, expect, it } from "vitest";
import {
  chunkText,
  cleanOcrPages,
  looksChinese,
  pageText,
  parseOcrBlocks,
  rewriteCaptions,
} from "../src/core/ocr-parse";
import { buildFullTextDocument, renderFigurePlaceholders, stripLeadingTitle } from "../src/core/organize-doc";

describe("OCR 标记清洗", () => {
  it("标准形态：ref 是类型标签，正文在坐标块之后", () => {
    const raw = [
      "<|ref|>title<|/ref|><|det|>[[52, 40, 948, 96]]<|/det|>",
      "Measuring individual differences in empathy",
      "<|ref|>text<|/ref|><|det|>[[52, 120, 948, 400]]<|/det|>",
      "The ability to understand others is central.",
    ].join("\n");

    expect(pageText(raw)).toBe(
      "Measuring individual differences in empathy\n\nThe ability to understand others is central.",
    );
  });

  it("sub_title 转成三级标题", () => {
    const raw =
      "<|ref|>sub_title<|/ref|><|det|>[[10,10,100,20]]<|/det|>\nMethods\n<|ref|>text<|/ref|><|det|>[[10,30,100,40]]<|/det|>\nWe recruited 24 adults.";
    expect(pageText(raw)).toContain("Methods");
  });

  it("doc 示例形态：ref 里直接是文字", () => {
    const raw = "<|ref|>单元设计<|/ref|><|box|>[[1,2,3,4]]<|/box|>";
    expect(pageText(raw)).toBe("单元设计");
  });

  it("多个块按顺序拼接", () => {
    const raw = "<|ref|>text<|/ref|><|det|>[[1,1,1,1]]<|/det|>\nA\n<|ref|>text<|/ref|><|det|>[[2,2,2,2]]<|/det|>\nB";
    expect(parseOcrBlocks(raw).map((block) => block.text)).toEqual(["A", "B"]);
  });

  it("没有 ref 标记时退回删标签", () => {
    expect(pageText("<|page|>Hello<|/page|>")).toBe("Hello");
  });

  it("图注改写成占位符并计数", () => {
    const result = rewriteCaptions("图 1 情绪识别的脑区\n正文", 3);
    expect(result.figures).toBe(1);
    expect(result.text).toContain("[FIG:图 1|第 3 页]");
  });

  it("Table 图注也识别", () => {
    expect(rewriteCaptions("Table 2 Results", 5).figures).toBe(1);
  });

  it("整份清洗统计页数与图表", () => {
    const cleaned = cleanOcrPages([
      { index: 0, text: "<|ref|>title<|/ref|><|det|>[[1,1,1,1]]<|/det|>\n标题" },
      { index: 1, text: "<|ref|>text<|/ref|><|det|>[[1,1,1,1]]<|/det|>\n图 2 结果" },
    ]);
    expect(cleaned.pageCount).toBe(2);
    expect(cleaned.figures).toBe(1);
    expect(cleaned.text).toContain("标题");
    expect(cleaned.text).toContain("[FIG:图 2|第 2 页]");
  });

  it("跨页断句直接接上，不当作新段落", () => {
    const cleaned = cleanOcrPages([
      { index: 0, text: "<|ref|>text<|/ref|><|det|>[[1,1,1,1]]<|/det|>\nare unrelated to measures" },
      { index: 1, text: "<|ref|>text<|/ref|><|det|>[[1,1,1,1]]<|/det|>\nof social functioning today." },
    ]);
    expect(cleaned.text).toBe("are unrelated to measures of social functioning today.");
  });

  it("上一页以句号结尾则另起一段", () => {
    const cleaned = cleanOcrPages([
      { index: 0, text: "<|ref|>text<|/ref|><|det|>[[1,1,1,1]]<|/det|>\nFirst paragraph." },
      { index: 1, text: "<|ref|>text<|/ref|><|det|>[[1,1,1,1]]<|/det|>\nSecond paragraph." },
    ]);
    expect(cleaned.text).toContain("paragraph.\n\nSecond");
  });

  it("标签不进入正文（回归：曾经整篇都是 text text text）", () => {
    const raw = [
      "<|ref|>text<|/ref|><|det|>[[1,1,1,1]]<|/det|>",
      "real content",
      "<|ref|>table_caption<|/ref|><|det|>[[2,2,2,2]]<|/det|>",
      "Table 1 Descriptives",
    ].join("\n");
    const text = pageText(raw);
    expect(text).not.toContain("<|");
    expect(text).toContain("real content");
    expect(text).toContain("Table 1 Descriptives");
  });
});

describe("语言判断", () => {
  it("中文占比高判为中文", () => {
    expect(looksChinese("这是一段关于情绪识别的中文文献，讨论了很多理论。")).toBe(true);
  });

  it("英文判为非中文", () => {
    expect(looksChinese("Emotion recognition is a core capacity of social cognition.")).toBe(false);
  });
});

describe("切块", () => {
  it("短文本不切", () => {
    expect(chunkText("abc", 100)).toEqual(["abc"]);
  });

  it("按段落边界切且不丢内容", () => {
    const text = ["A".repeat(40), "B".repeat(40), "C".repeat(40)].join("\n\n");
    const chunks = chunkText(text, 90);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.join("\n\n")).toBe(text);
  });
});

describe("去掉开头重复标题", () => {
  it("匹配时删除一行", () => {
    const text = "<!-- 第 1 页 -->\nMeasuring individual differences in empathy: Evidence for a multidimensional approach\n\n正文";
    expect(stripLeadingTitle(text, "Measuring individual differences in empathy: Evidence for a multidimensional approach")).toBe("正文");
  });

  it("不匹配时原样保留", () => {
    expect(stripLeadingTitle("正文第一段\n\n第二段", "别的标题")).toBe("正文第一段\n\n第二段");
  });
});

describe("占位符渲染", () => {
  it("FIG 变成可读提示", () => {
    const markdown = renderFigurePlaceholders("前文\n\n[FIG:图 1|第 3 页]\n\n后文");
    expect(markdown).toContain("> 📊 **图 1**（第 3 页，见原文）");
    expect(markdown).not.toContain("[FIG:");
  });

  it("删掉页标记", () => {
    expect(renderFigurePlaceholders("<!-- 第 2 页 -->\n正文")).toBe("正文");
  });
});

describe("全文文档", () => {
  it("frontmatter 带 schema 与统计", () => {
    const doc = buildFullTextDocument({
      title: "The voice of emotion",
      citekey: "johnstone-t-2006-44f2",
      authors: ["Johnstone, T."],
      year: 2006,
      doi: "10.1093/scan/nsl005",
      pages: 9,
      figures: 2,
      bilingual: true,
      body: "## 引言\n\n内容",
    });
    expect(doc).toContain("schema: lit-fulltext@1");
    expect(doc).toContain('citekey: "johnstone-t-2006-44f2"');
    expect(doc).toContain("pages: 9");
    expect(doc).toContain("bilingual: true");
    expect(doc).toContain("## 引言");
  });
});
