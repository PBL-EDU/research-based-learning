import { describe, expect, it } from "vitest";
import { pickPdfUrl } from "../src/core/openalex-parse";

describe("OpenAlex PDF 链接选择", () => {
  it("优先 best_oa_location.pdf_url", () => {
    const picked = pickPdfUrl({
      open_access: { is_oa: true },
      best_oa_location: { pdf_url: "https://a/b.pdf", landing_page_url: "https://a/b" },
      primary_location: { pdf_url: "https://c/d.pdf" },
    });
    expect(picked.pdfUrl).toBe("https://a/b.pdf");
    expect(picked.landingUrl).toBe("https://a/b");
    expect(picked.isOa).toBe(true);
  });

  it("没有 best 时退化到 primary", () => {
    const picked = pickPdfUrl({
      open_access: { is_oa: true },
      primary_location: { pdf_url: "https://c/d.pdf" },
    });
    expect(picked.pdfUrl).toBe("https://c/d.pdf");
  });

  it("开放获取但没有 PDF 链接", () => {
    const picked = pickPdfUrl({
      open_access: { is_oa: true },
      best_oa_location: { landing_page_url: "https://a/b" },
    });
    expect(picked.pdfUrl).toBeUndefined();
    expect(picked.landingUrl).toBe("https://a/b");
    expect(picked.isOa).toBe(true);
  });

  it("非开放获取", () => {
    const picked = pickPdfUrl({ open_access: { is_oa: false } });
    expect(picked.pdfUrl).toBeUndefined();
    expect(picked.isOa).toBe(false);
  });

  it("结构异常不抛异常", () => {
    expect(pickPdfUrl(null).pdfUrl).toBeUndefined();
    expect(pickPdfUrl({ best_oa_location: { pdf_url: 42 } }).pdfUrl).toBeUndefined();
  });
});
