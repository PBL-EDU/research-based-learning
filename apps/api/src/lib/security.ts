import { createHash, timingSafeEqual } from "node:crypto";

/** 内容哈希，用于「同内容重复发布」的幂等判断。 */
export function sha256Hex(input: string | Buffer): string {
  return createHash("sha256").update(input).digest("hex");
}

/**
 * 设备令牌比对。
 *
 * 用 timingSafeEqual 而不是 ===：字符串比较会在第一个不同字节处提前返回，
 * 理论上可被用来逐字节猜测令牌。
 */
export function isDeviceTokenValid(header: string | undefined, expected: string): boolean {
  if (!header || !header.startsWith("Bearer ")) return false;
  const provided = Buffer.from(header.slice("Bearer ".length), "utf8");
  const target = Buffer.from(expected, "utf8");
  if (provided.length !== target.length) return false;
  return timingSafeEqual(provided, target);
}

export function bearerToken(header: string | undefined): string | null {
  if (!header || !header.startsWith("Bearer ")) return null;
  return header.slice("Bearer ".length);
}
