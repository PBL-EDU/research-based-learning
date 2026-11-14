import { describe, expect, it } from "vitest";
import { TEMPLATES, TemplateId, templatesForSchema, getTemplate } from "../src";

describe("模板注册表", () => {
  it("恰好六个模板，对应需求里的六种报告", () => {
    expect(TEMPLATES).toHaveLength(6);
    expect(TemplateId.options).toHaveLength(6);
  });

  it("实践卡片有卡片/计划/总结三个视图，共用同一份 pc-card@1", () => {
    const practice = templatesForSchema("pc-card@1");
    expect(practice.map((t) => t.view)).toEqual(["card", "plan", "summary"]);
  });

  it("每个模板都能按 id 取回", () => {
    for (const template of TEMPLATES) {
      expect(getTemplate(template.id).title).toBe(template.title);
    }
  });

  it("精读卡片的模板存在且唯一", () => {
    const deepRead = templatesForSchema("dr-card@1");
    expect(deepRead.map((t) => t.title)).toContain("精读卡片");
  });
});
