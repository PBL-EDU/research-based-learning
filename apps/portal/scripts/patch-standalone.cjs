/**
 * 修补 Next standalone 产物（pnpm 版）。
 *
 * 背景：pnpm 用符号链接组织 node_modules，Next 的 file tracing 在 monorepo 里
 * 会漏掉 next 的直接依赖，部署后运行时报 Cannot find module。
 *
 * 做法：从 workspace 的 .pnpm 存储里按 `<dep>@<version>` 找到真实包，
 * 物理复制到 standalone 的解析路径（dereference，不带符号链接）。
 *
 * 用法：pnpm --dir apps/portal build 之后自动执行（postbuild）。
 */
const fs = require("fs");
const path = require("path");

const portal = path.resolve(__dirname, "..");
const workspaceRoot = path.resolve(portal, "..", "..");
const standalone = path.join(portal, ".next", "standalone");
const target = path.join(standalone, "apps", "portal", "node_modules");
const pnpmStore = path.join(workspaceRoot, "node_modules", ".pnpm");

const nextPkg = JSON.parse(
  fs.readFileSync(path.join(portal, "node_modules", "next", "package.json"), "utf8"),
);

// 1) 拷贝静态资源：Next 的 standalone 不含 .next/static，必须手动放进去，
//    否则页面能出 HTML 但 CSS/JS 全部 404。
const staticSrc = path.join(portal, ".next", "static");
const staticDest = path.join(standalone, "apps", "portal", ".next", "static");
if (fs.existsSync(staticSrc)) {
  fs.mkdirSync(path.dirname(staticDest), { recursive: true });
  fs.cpSync(staticSrc, staticDest, { recursive: true, force: true });
  console.log("[patch-standalone] copied .next/static");
}

// 2) 拷贝 public（如果有）
const publicSrc = path.join(portal, "public");
const publicDest = path.join(standalone, "apps", "portal", "public");
if (fs.existsSync(publicSrc)) {
  fs.cpSync(publicSrc, publicDest, { recursive: true, force: true });
  console.log("[patch-standalone] copied public");
}

const wanted = new Set([
  ...Object.keys(nextPkg.dependencies ?? {}),
  ...Object.keys(nextPkg.peerDependencies ?? {}),
]);

const entries = fs.readdirSync(pnpmStore);

function findPackageDir(dep) {
  const prefix = `${dep.replace("/", "+")}@`;
  const matches = entries
    .filter((name) => name.startsWith(prefix))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  for (const name of matches.reverse()) {
    const candidate = path.join(pnpmStore, name, "node_modules", ...dep.split("/"));
    if (fs.existsSync(path.join(candidate, "package.json"))) return candidate;
  }
  return null;
}

let copied = 0;
const missing = [];
for (const dep of wanted) {
  const dest = path.join(target, ...dep.split("/"));
  if (fs.existsSync(path.join(dest, "package.json"))) continue;

  const src = findPackageDir(dep);
  if (!src) {
    missing.push(dep);
    continue;
  }

  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.cpSync(src, dest, { recursive: true, dereference: true });
  copied += 1;
}

console.log(`[patch-standalone] copied ${copied} packages`);
if (missing.length > 0) {
  console.log(`[patch-standalone] optional/missing: ${missing.join(", ")}`);
}
