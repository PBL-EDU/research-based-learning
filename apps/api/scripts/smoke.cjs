process.env.DATABASE_URL = "postgresql://user:pass@127.0.0.1:5432/rlc";
process.env.DEVICE_TOKEN = "0123456789abcdef0123456789abcdef";
process.env.COMMENTS_ENABLED = "false";

const { buildServer } = require("./dist/server.js");
const { loadEnv } = require("./dist/env.js");

(async () => {
  const app = await buildServer(loadEnv());
  await app.ready();

  const checks = [];
  async function hit(method, url, opts) {
    const res = await app.inject({ method, url, ...opts });
    checks.push({ method, url, status: res.statusCode, body: res.body.slice(0, 160) });
  }

  await hit("GET", "/api/v1/templates");
  await hit("GET", "/api/v1/healthz");
  await hit("POST", "/api/v1/publications", { payload: {} });
  await hit("POST", "/api/v1/publications", { headers: { authorization: "Bearer wrongwrongwrongwrong" } });
  await hit("POST", "/api/v1/comments", { headers: { authorization: "Bearer 0123456789abcdef0123456789abcdef" } });
  await hit("GET", "/assets/nope.png");

  for (const c of checks) {
    console.log(`${String(c.status).padEnd(3)} ${c.method.padEnd(5)} ${c.url}`);
    console.log(`    ${c.body.replace(/\s+/g, " ").slice(0, 140)}`);
  }

  await app.close();
  process.exit(0);
})().catch((e) => { console.error("SMOKE FAIL", e); process.exit(1); });
