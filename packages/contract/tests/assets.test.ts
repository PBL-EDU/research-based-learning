import { describe, expect, it } from "vitest";
import { ASSET_MIME_ALLOWLIST, AssetDecl, isAllowedAssetMime } from "../src";

const validDecl = {
  localPath: "assets/aha.png",
  role: "visual" as const,
  mime: "image/png" as const,
  sha256: "sha256:" + "a".repeat(64),
  bytes: 1024,
};

describe("资产白名单", () => {
  it("只放行位图，不含 svg（可携带脚本）也不含 pdf", () => {
    expect(ASSET_MIME_ALLOWLIST).toEqual(["image/png", "image/jpeg", "image/webp"]);
    expect(isAllowedAssetMime("image/svg+xml")).toBe(false);
    expect(isAllowedAssetMime("application/pdf")).toBe(false);
  });

  it("PDF 资产声明被拒（R1 版权红线：文献永不上传）", () => {
    const result = AssetDecl.safeParse({ ...validDecl, mime: "application/pdf" });
    expect(result.success).toBe(false);
  });

  it("超过 8MB 的资产被拒", () => {
    const result = AssetDecl.safeParse({ ...validDecl, bytes: 9 * 1024 * 1024 });
    expect(result.success).toBe(false);
  });

  it("合法 png 声明通过", () => {
    expect(AssetDecl.safeParse(validDecl).success).toBe(true);
  });
});
