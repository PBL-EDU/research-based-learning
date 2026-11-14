#!/usr/bin/env node
/**
 * 生成一次性邀请码。
 *
 * 用法（服务器上，加载 .env）：
 *   set -a; . /opt/rlc/.env; set +a
 *   node scripts/issue-invite.cjs --handle linxiaoyu --name 林小雨
 *
 * 可选参数：
 *   --org brm        组织 slug（默认取 DEFAULT_ORG_SLUG）
 *   --org-name 名称   组织显示名（默认取 DEFAULT_ORG_NAME）
 *   --days 7         有效期天数
 *
 * 邀请码只在生成时显示一次；库里只存 sha256。
 */
const { PrismaClient } = require("@prisma/client");
const crypto = require("node:crypto");

const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith("--")) continue;
    const key = arg.slice(2);
    const next = argv[i + 1];
    if (next && !next.startsWith("--")) {
      out[key] = next;
      i += 1;
    } else {
      out[key] = true;
    }
  }
  return out;
}

function generateCode() {
  const bytes = crypto.randomBytes(8);
  const chars = [...bytes].map((byte) => ALPHABET[byte % ALPHABET.length]);
  return `RLC-${chars.slice(0, 4).join("")}-${chars.slice(4, 8).join("")}`;
}

function normalize(code) {
  return code.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function hash(code) {
  return crypto.createHash("sha256").update(normalize(code)).digest("hex");
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const handle = typeof args.handle === "string" ? args.handle.trim().toLowerCase() : "";
  if (!handle) {
    console.error(
      "用法：node scripts/issue-invite.cjs --handle linxiaoyu --name 林小雨 [--org brm] [--days 7]",
    );
    process.exit(1);
  }

  const displayName = typeof args.name === "string" ? args.name.trim() : handle;
  const orgSlug =
    (typeof args.org === "string" && args.org.trim()) || process.env.DEFAULT_ORG_SLUG || "brm";
  const orgName =
    (typeof args["org-name"] === "string" && args["org-name"].trim()) ||
    process.env.DEFAULT_ORG_NAME ||
    "白日梦行动";
  const days = Number(args.days ?? 7);
  if (!Number.isFinite(days) || days <= 0) {
    console.error("--days 必须是正数");
    process.exit(1);
  }

  const prisma = new PrismaClient();
  try {
    const org = await prisma.organization.upsert({
      where: { slug: orgSlug },
      update: { name: orgName },
      create: { slug: orgSlug, name: orgName },
    });

    const account = await prisma.account.upsert({
      where: { handle },
      update: { displayName },
      create: { handle, displayName, role: "student" },
    });

    await prisma.membership.upsert({
      where: { accountId_orgId: { accountId: account.id, orgId: org.id } },
      update: {},
      create: { accountId: account.id, orgId: org.id, role: "student" },
    });

    const code = generateCode();
    const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);

    await prisma.invite.create({
      data: {
        codeHash: hash(code),
        accountId: account.id,
        orgId: org.id,
        expiresAt,
      },
    });

    console.log("");
    console.log("  邀请码（只显示这一次）：");
    console.log("    " + code);
    console.log("");
    console.log(`  学生：${displayName}（${handle}）`);
    console.log(`  组织：${orgName}（${org.slug}）`);
    console.log(`  有效期：${days} 天，至 ${expiresAt.toISOString()}`);
    console.log("");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error("生成失败：", error.message);
  process.exit(1);
});
