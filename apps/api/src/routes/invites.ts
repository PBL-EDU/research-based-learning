import type { FastifyInstance } from "fastify";
import { prisma } from "../db";
import {
  generateDeviceToken,
  inviteCodeHash,
  normalizeInviteCode,
  allowRedeemAttempt,
} from "../lib/auth";
import { sha256Hex } from "../lib/security";
import { apiError } from "../lib/errors";

/**
 * 邀请码兑换。
 *
 * 流程：管理员用 CLI 生成短码 → 学生粘到插件 → 这里一次性换成长令牌。
 * 短码只用于传递身份，令牌不经过任何人的聊天记录。
 */
export async function inviteRoutes(app: FastifyInstance): Promise<void> {
  app.post("/api/v1/invites/redeem", async (request, reply) => {
    const ip = request.ip;
    if (!allowRedeemAttempt(ip)) {
      return reply.code(429).send(apiError("RATE_LIMITED", "尝试过于频繁，请稍后再试", request.id));
    }

    const body = (request.body ?? {}) as { code?: unknown };
    if (typeof body.code !== "string" || body.code.trim().length === 0) {
      return reply.code(422).send(apiError("VALIDATION_FAILED", "缺少邀请码", request.id));
    }

    const codeHash = inviteCodeHash(body.code);
    const invite = await prisma.invite.findUnique({
      where: { codeHash },
      include: {
        account: true,
        organization: true,
      },
    });

    if (!invite) {
      return reply.code(404).send(apiError("NOT_FOUND", "邀请码不存在或已被使用", request.id));
    }
    if (invite.usedAt) {
      return reply.code(410).send(apiError("FORBIDDEN", "这个邀请码已经用过了", request.id));
    }
    if (invite.expiresAt.getTime() < Date.now()) {
      return reply.code(410).send(apiError("FORBIDDEN", "邀请码已过期，请向老师要一个新的", request.id));
    }

    const token = generateDeviceToken();

    // 抢占式标记已用：并发兑换时只有一个请求能成功。
    const claimed = await prisma.invite.updateMany({
      where: { id: invite.id, usedAt: null },
      data: { usedAt: new Date() },
    });
    if (claimed.count !== 1) {
      return reply.code(410).send(apiError("FORBIDDEN", "这个邀请码已经用过了", request.id));
    }

    await prisma.deviceToken.create({
      data: {
        tokenHash: sha256Hex(token),
        accountId: invite.accountId,
        label: "obsidian",
      },
    });

    return reply.send({
      token,
      account: {
        handle: invite.account.handle,
        displayName: invite.account.displayName,
      },
      org: {
        slug: invite.organization.slug,
        name: invite.organization.name,
      },
    });
  });

  // 仅供调试：确认某个码是否可用（不消耗）
  app.get("/api/v1/invites/check", async (request, reply) => {
    const query = request.query as { code?: string };
    if (!query.code) {
      return reply.code(422).send(apiError("VALIDATION_FAILED", "缺少 code", request.id));
    }
    const normalized = normalizeInviteCode(query.code);
    const invite = await prisma.invite.findUnique({
      where: { codeHash: inviteCodeHash(normalized) },
      include: { account: true, organization: true },
    });
    if (!invite) return reply.send({ valid: false, reason: "not_found" });
    if (invite.usedAt) return reply.send({ valid: false, reason: "used" });
    if (invite.expiresAt.getTime() < Date.now()) return reply.send({ valid: false, reason: "expired" });
    return reply.send({
      valid: true,
      handle: invite.account.handle,
      displayName: invite.account.displayName,
      org: { slug: invite.organization.slug, name: invite.organization.name },
    });
  });
}
