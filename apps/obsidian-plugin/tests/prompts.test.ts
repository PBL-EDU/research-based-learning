import { describe, expect, it } from "vitest";
import { deepReadDraftMessages, parseDraftResult } from "../src/core/prompts";
import { extractJson } from "../src/core/json";

describe("AI 起草的输入契约", () => {
  it("提示词里明确禁止编造原文，且只允许引用学生给的摘录", () => {
    const messages = deepReadDraftMessages({
      paper: { title: "单元设计" },
      quote: "单元是一条学习经验链。",
      domain: "课程与教学论",
    });
    const joined = messages.map((message) => message.content).join("\n");
    expect(joined).toContain("不得自行生成引文");
    expect(joined).toContain("单元是一条学习经验链。");
    expect(joined).toContain("只输出 JSON");
  });

  it("模型返回的草稿缺字段时报错，不「尽力补全」", () => {
    expect(() => parseDraftResult({ experience: "x" })).toThrow(/insight/);
  });

  it("草稿结构完整时解析成功，actions 缺失时给占位", () => {
    const result = parseDraftResult({
      experience: "备课时总先数课文",
      insight: "单元不是章节",
      inspiration: "把单元当经验链",
      meaning: "先问学生经历什么",
      conceptLevel: "高",
      conceptNote: "改变单元定义",
      actions: [],
    });
    expect(result.conceptLevel).toBe("高");
    expect(result.actions).toHaveLength(1);
    expect(result.actions[0]?.action).toContain("还需要你补充");
  });

  it("非法等级回落到「中」，不会让整张卡片失败", () => {
    const result = parseDraftResult({
      experience: "a",
      insight: "b",
      inspiration: "c",
      meaning: "d",
      conceptLevel: "极高",
      conceptNote: "e",
      actions: [{ action: "做一件事" }],
    });
    expect(result.conceptLevel).toBe("中");
  });
});

describe("JSON 提取", () => {
  it("能剥离 ```json 围栏", () => {
    expect(extractJson('```json\n{"a":1}\n```')).toEqual({ a: 1 });
  });

  it("能从解释文字中截取 JSON", () => {
    expect(extractJson('好的，结果如下：{"a":1} 希望有帮助')).toEqual({ a: 1 });
  });

  it("没有 JSON 时返回 null", () => {
    expect(extractJson("我没有返回 JSON")).toBeNull();
  });
});
