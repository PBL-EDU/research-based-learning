import { describe, expect, it } from "vitest";
import { isDeviceTokenValid, sha256Hex } from "../src/lib/security";
import { newPublicationId, publicationSlug, slugifyTitle } from "../src/lib/ids";
import { excerptFrom, renderMarkdown, stripFrontmatter } from "../src/lib/render";
import { toDetail, toListItem, type PublicationView } from "../src/lib/dto";

describe("令牌校验", () => {
  const token = "0123456789abcdef0123456789abcdef";

  it("正确令牌通过", () => {
    expect(isDeviceTokenValid(`Bearer ${token}`, token)).toBe(true);
  });

  it("错误令牌、缺失、长度不同都拒绝", () => {
    expect(isDeviceTokenValid("Bearer wrong-token-wrong-token-", token)).toBe(false);
    expect(isDeviceTokenValid(undefined, token)).toBe(false);
    expect(isDeviceTokenValid(token, token)).toBe(false);
  });
});

describe("内容哈希", () => {
  it("与已知向量一致", () => {
    expect(sha256Hex("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });
});

describe("id 与 slug", () => {
  it("publication id 符合契约格式", () => {
    const id = newPublicationId();
    expect(id).toMatch(/^pub_[0-9a-f]{32}$/);
    expect(newPublicationId()).not.toBe(id);
  });

  it("中文标题回落到 c- 前缀", () => {
    const slug = publicationSlug("单元是一条学习经验链", "pub_0123456789abcdef0123456789abcdef");
    expect(slug).toMatch(/^[a-z0-9-]+$/);
    expect(slug.startsWith("c-")).toBe(true);
  });

  it("英文标题保留语义", () => {
    expect(slugifyTitle("Unit Design As A Lever")).toBe("unit-design-as-a-lever");
  });
});

describe("Markdown 渲染", () => {
  const markdown = ["---", "schema: dr-card@1", "---", "", "## 原文", "", "单元不是内容包。"].join("\n");

  it("渲染前剥掉 frontmatter", () => {
    const html = renderMarkdown(markdown);
    expect(html).toContain("<h2");
    expect(html).not.toContain("schema: dr-card@1");
  });

  it("stripFrontmatter 保留正文", () => {
    expect(stripFrontmatter(markdown)).toContain("单元不是内容包");
  });

  it("摘要优先用 Aha 摘录", () => {
    const excerpt = excerptFrom({
      bodyMd: markdown,
      frontmatter: { aha: { quote: "单元是一条学习经验链" } },
    });
    expect(excerpt).toBe("单元是一条学习经验链");
  });

  it("没有摘录时用正文兜底并截断", () => {
    const excerpt = excerptFrom({ bodyMd: markdown, frontmatter: {} });
    expect(excerpt.length).toBeLessThanOrEqual(140);
    expect(excerpt).toContain("单元不是内容包");
  });
});

describe("DTO 映射与契约自检", () => {
  const view: PublicationView = {
    id: "pub_0123456789abcdef0123456789abcdef",
    kind: "deep_read",
    title: "单元是一条学习经验链",
    slug: "c-3456789a",
    domain: { name: "课程与教学论", slug: "curriculum-theory" },
    author: { handle: "denghao", displayName: "邓豪" },
    excerpt: "单元不是内容包",
    revision: 1,
    publishedAt: "2026-11-14T10:00:00+08:00",
    counts: { comments: 0, likes: 0, reposts: 0 },
  };

  it("列表项符合契约", () => {
    const dto = toListItem(view);
    expect(dto.id).toBe(view.id);
    expect(dto.counts.comments).toBe(0);
  });

  it("非法的 kind 会被契约拦下", () => {
    expect(() => toListItem({ ...view, kind: "not_a_kind" })).toThrow(/契约/);
  });

  it("详情带正文与来源，且 assets 缺省为空数组", () => {
    const detail = toDetail({
      ...view,
      bodyMd: "正文",
      bodyHtml: "<p>正文</p>",
      aiAssisted: false,
      source: {
        type: "literature",
        doi: "10.1234/abcd",
        title: "单元设计",
        authors: ["钟启泉"],
        license: "unknown",
      },
    });
    expect(detail.bodyHtml).toContain("正文");
    expect(detail.assets).toEqual([]);
    expect(detail.source?.doi).toBe("10.1234/abcd");
  });
});
