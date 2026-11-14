import { describe, expect, it } from "vitest";
import {
  CommentNodeSchema,
  CommentTreeResponse,
  MAX_COMMENT_DEPTH,
  PublishPayload,
  parseCard,
} from "../src";
import { makeComment, makeDeepReadCard } from "./fixtures";

describe("讨论树契约", () => {
  it("深度 4 的节点合法，深度 5 被拒", () => {
    expect(CommentNodeSchema.safeParse(makeComment(MAX_COMMENT_DEPTH)).success).toBe(true);
    expect(CommentNodeSchema.safeParse(makeComment(MAX_COMMENT_DEPTH + 1)).success).toBe(false);
  });

  it("children 递归解析", () => {
    const root = { ...makeComment(0, "c-0"), children: [makeComment(1, "c-1")] };
    const parsedTree = CommentNodeSchema.safeParse(root);
    expect(parsedTree.success).toBe(true);
    if (parsedTree.success) {
      expect(parsedTree.data.children).toHaveLength(1);
      expect(parsedTree.data.children[0]?.parentId).toBe("c-0");
    }
  });

  it("讨论树响应结构完整", () => {
    const response = {
      publicationId: "pub_01JABCDEFGHJKMNPQRSTVWXYZ0",
      total: 1,
      roots: [makeComment(0)],
    };
    expect(CommentTreeResponse.safeParse(response).success).toBe(true);
  });
});

describe("PublishPayload", () => {
  const payload = {
    schema: "dr-card@1",
    clientCardId: "3f2504e0-4f89-41d3-9a0c-0305e82c3301",
    kind: "deep_read",
    domain: { name: "课程与教学论", slug: "curriculum-theory" },
    title: "单元是一条学习经验链",
    bodyMd: "---\nschema: dr-card@1\n---\n\n## 原文\n",
    frontmatter: { schema: "dr-card@1" },
    assets: [],
    visibility: "public",
    acknowledge: { noPdfUploaded: true, citeLengthUnder300: true },
  };

  it("双重确认齐全时通过", () => {
    expect(PublishPayload.safeParse(payload).success).toBe(true);
  });

  it("确认项缺失时被拒——不能靠前端默认勾选", () => {
    expect(
      PublishPayload.safeParse({ ...payload, acknowledge: { noPdfUploaded: true } }).success,
    ).toBe(false);
  });

  it("确认项为 false 时被拒", () => {
    expect(
      PublishPayload.safeParse({
        ...payload,
        acknowledge: { noPdfUploaded: true, citeLengthUnder300: false },
      }).success,
    ).toBe(false);
  });

  it("payload 与卡片正文可以互相印证", () => {
    const card = makeDeepReadCard();
    const result = parseCard(card);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.card.schema).toBe(payload.schema);
      expect(result.card.cardId).toBe(payload.clientCardId);
    }
  });
});
