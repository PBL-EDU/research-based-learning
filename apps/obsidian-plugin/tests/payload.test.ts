import { describe, expect, it } from "vitest";
import { parseCard } from "@rlc/contract";
import {
  buildMultipart,
  buildPublishPayload,
  guessMime,
  sha256Hex,
  type LocalAsset,
} from "../src/core/payload";

const CARD = {
  schema: "dr-card@1",
  cardId: "3f2504e0-4f89-41d3-9a0c-0305e82c3301",
  kind: "deep_read",
  domain: { name: "课程与教学论", slug: "curriculum-theory" },
  title: "单元是一条学习经验链",
  tags: [],
  source: {
    type: "literature",
    doi: "10.1234/abcd.2015.001",
    title: "单元设计",
    authors: ["钟启泉"],
    year: 2015,
    license: "publisher",
  },
  aha: {
    quote: "单元不是内容包。",
    experience: "e",
    insight: "i",
    inspiration: "n",
    meaning: "m",
  },
  conceptValue: { level: "高", note: "改变单元定义" },
  actionGuidance: [{ action: "重写一次备课" }],
  visuals: [],
  createdAt: "2026-11-12T21:10:00+08:00",
  updatedAt: "2026-11-13T09:55:00+08:00",
};

function parsedCard() {
  const result = parseCard(CARD);
  if (!result.ok) throw new Error(result.message);
  return result.card;
}

describe("资产类型", () => {
  it("只认 png/jpeg/webp", () => {
    expect(guessMime("a/b/cover.png")).toBe("image/png");
    expect(guessMime("cover.JPG")).toBe("image/jpeg");
    expect(guessMime("cover.webp")).toBe("image/webp");
  });

  it("PDF 与 SVG 一律不认（版权红线 + XSS）", () => {
    expect(guessMime("论文.pdf")).toBeNull();
    expect(guessMime("图.svg")).toBeNull();
  });
});

describe("sha256", () => {
  it("与已知向量一致", async () => {
    const data = new TextEncoder().encode("abc");
    expect(await sha256Hex(data.buffer as ArrayBuffer)).toBe(
      "sha256:ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });
});

describe("发布 payload", () => {
  it("两个红线确认项恒为 true", () => {
    const payload = buildPublishPayload({
      card: parsedCard(),
      bodyMd: "---\n---\n",
      visibility: "public",
      assets: [],
    });
    expect(payload.acknowledge).toEqual({ noPdfUploaded: true, citeLengthUnder300: true });
  });

  it("精读卡片带 source，且 frontmatter 即卡片本身", () => {
    const card = parsedCard();
    const payload = buildPublishPayload({
      card,
      bodyMd: "x",
      visibility: "public",
      assets: [],
    });
    expect(payload.schema).toBe("dr-card@1");
    expect(payload.clientCardId).toBe(card.cardId);
    expect(payload.source?.doi).toBe("10.1234/abcd.2015.001");
    expect((payload.frontmatter as { aha: { quote: string } }).aha.quote).toBe("单元不是内容包。");
  });

  it("资产声明按契约字段输出", () => {
    const asset: LocalAsset = {
      path: "领域/x/assets/a.png",
      role: "visual",
      mime: "image/png",
      bytes: 3,
      sha256: `sha256:${"a".repeat(64)}`,
      data: new ArrayBuffer(3),
    };
    const payload = buildPublishPayload({
      card: parsedCard(),
      bodyMd: "x",
      visibility: "public",
      assets: [asset],
    });
    expect(payload.assets).toEqual([
      {
        localPath: "领域/x/assets/a.png",
        role: "visual",
        mime: "image/png",
        sha256: `sha256:${"a".repeat(64)}`,
        bytes: 3,
      },
    ]);
  });
});

describe("multipart 拼装", () => {
  it("包含 payload 字段、文件字段与结束边界", () => {
    const png = new Uint8Array([1, 2, 3]);
    const result = buildMultipart({ hello: "世界" }, [
      { filename: "a.png", mime: "image/png", data: png.buffer as ArrayBuffer },
    ]);
    const text = new TextDecoder().decode(result.body);

    expect(result.contentType).toMatch(/^multipart\/form-data; boundary=----rlc/);
    expect(text).toContain('name="payload"');
    expect(text).toContain('"hello":"世界"');
    expect(text).toContain('filename="a.png"');
    expect(text).toContain("Content-Type: image/png");
    expect(text.trimEnd().endsWith("--")).toBe(true);
  });

  it("文件名里的引号与换行被清洗，避免头注入", () => {
    const result = buildMultipart({}, [
      { filename: 'a"\r\nb.png', mime: "image/png", data: new ArrayBuffer(0) },
    ]);
    const head = new TextDecoder().decode(result.body).split("\r\n\r\n")[0] ?? "";
    expect(head).not.toContain('\r\nb.png');
  });
});
