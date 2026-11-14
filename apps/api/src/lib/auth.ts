import { randomBytes } from "node:crypto";
import { prisma } from "../db";
import type { Env } from "../env";
import { bearerToken, sha256Hex } from "./security";

export interface AuthContext {
  account: { id: string; handle: string; displayName: string; role: string };
  org: { id: string; slug: string; name: string } | null;
}

interface AccountWithMemberships {
  id: string;
  handle: string;
  displayName: string;
  role: string;
  memberships: Array<{
    organization: { id: string; slug: string; name: string };
  }>;
}

function toContext(account: AccountWithMemberships): AuthContext {
  const membership = account.memberships[0];
  return {
    account: {
      id: account.id,
      handle: account.handle,
      displayName: account.displayName,
      role: account.role,
    },
    org: membership
      ? {
          id: membership.organization.id,
          slug: membership.organization.slug,
          name: membership.organization.name,
        }
      : null,
  };
}

/**
 * 解析设备令牌。
 *
 * 优先查 DeviceToken 表（每人一条，可撤销）；
 * 找不到时回退到环境变量里的单一令牌，保证升级期间旧插件还能发布。
 */
export async function resolveAuth(
  header: string | undefined,
  env: Env,
): Promise<AuthContext | null> {
  const token = bearerToken(header);
  if (!token) return null;

  const record = await prisma.deviceToken.findUnique({
    where: { tokenHash: sha256Hex(token) },
    include: {
      account: {
        include: { memberships: { include: { organization: true } } },
      },
    },
  });

  if (record) {
    if (record.revokedAt) return null;
    void prisma.deviceToken
      .update({ where: { id: record.id }, data: { lastUsedAt: new Date() } })
      .catch(() => undefined);
    return toContext(record.account);
  }

  // 兼容旧的单一令牌
  if (token === env.deviceToken) {
    const account = await prisma.account.findUnique({
      where: { handle: env.authorHandle },
      include: { memberships: { include: { organization: true } } },
    });
    if (!account) return null;
    return toContext(account);
  }

  return null;
}

const INVITE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

/** 生成形如 RLC-7K3M-9Q2P 的邀请码（去掉易混字符 I/L/O/0/1）。 */
export function generateInviteCode(): string {
  const bytes = randomBytes(8);
  const chars = [...bytes].map((byte) => INVITE_ALPHABET[byte % INVITE_ALPHABET.length]);
  return `RLC-${chars.slice(0, 4).join("")}-${chars.slice(4, 8).join("")}`;
}

/** 统一大小写与分隔符，粘贴时带空格/小写也能用。 */
export function normalizeInviteCode(code: string): string {
  return code.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function inviteCodeHash(code: string): string {
  return sha256Hex(normalizeInviteCode(code));
}

/** 设备令牌：明文只返回一次，库里只存 sha256。 */
export function generateDeviceToken(): string {
  return `rlc_${randomBytes(24).toString("hex")}`;
}

/** 极简内存限流：同一 IP 每分钟最多 10 次邀请码尝试。 */
const redeemAttempts = new Map<string, number[]>();

export function allowRedeemAttempt(ip: string): boolean {
  const now = Date.now();
  const windowStart = now - 60_000;
  const list = (redeemAttempts.get(ip) ?? []).filter((time) => time > windowStart);
  if (list.length >= 10) {
    redeemAttempts.set(ip, list);
    return false;
  }
  list.push(now);
  redeemAttempts.set(ip, list);
  return true;
}
