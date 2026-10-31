#!/usr/bin/env node
// Phase 5 auth and access check (docs/sdlc/changes/phase-5-team-docs/spec.md).
//
// Signs Cloudflare Access-style tokens with a local RS256 key, serves the matching JWKS, and calls
// the API as admin, manager and maintenance. Run it against a local Worker with a THROWAWAY D1
// database (it creates users and calls every route), started like this:
//
//   wrangler dev --port 8812 \
//     --var ACCESS_TEAM_DOMAIN:http://127.0.0.1:8899 --var ACCESS_AUD:check-aud \
//     --var ADMIN_EMAIL:admin@check.test
//   node scripts/check-auth.mjs http://127.0.0.1:8812
//
// The expected role table below restates spec B2 independently of the server's ACCESS table, so
// a drift between the two shows up as a failure.

import { createServer } from "node:http";
import { generateKeyPairSync, createSign } from "node:crypto";
import { readFileSync } from "node:fs";

const BASE = process.argv[2] ?? "http://127.0.0.1:8812";
const TEAM = "http://127.0.0.1:8899";
const AUD = "check-aud";
const ADMIN = "admin@check.test";
const KID = "check-key";

const key = generateKeyPairSync("rsa", { modulusLength: 2048 });
const otherKey = generateKeyPairSync("rsa", { modulusLength: 2048 });
const jwk = { ...key.publicKey.export({ format: "jwk" }), kid: KID, alg: "RS256", use: "sig" };

const jwks = createServer((req, res) => {
  res.writeHead(req.url === "/cdn-cgi/access/certs" ? 200 : 404, { "content-type": "application/json" });
  res.end(JSON.stringify({ keys: [jwk] }));
});
await new Promise((r) => jwks.listen(8899, "127.0.0.1", r));

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
function token(email, { aud = AUD, iss = TEAM, exp = 600, signWith = key.privateKey } = {}) {
  const now = Math.floor(Date.now() / 1000);
  const head = b64({ alg: "RS256", kid: KID, typ: "JWT" });
  const body = b64({ email, aud: [aud], iss, iat: now, exp: now + exp, sub: email });
  const sig = createSign("RSA-SHA256").update(`${head}.${body}`).sign(signWith).toString("base64url");
  return `${head}.${body}.${sig}`;
}

async function call(method, path, { as, tok, body } = {}) {
  const headers = { "content-type": "application/json" };
  const t = tok ?? (as ? token(as) : undefined);
  if (t) headers["Cf-Access-Jwt-Assertion"] = t;
  const r = await fetch(BASE + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  let data = null;
  try { data = await r.json(); } catch { /* empty */ }
  return { status: r.status, data };
}

let failures = 0;
function check(name, ok, detail = "") {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok || !detail ? "" : `  (${detail})`}`);
}

// ── Sign-in (spec A) ───────────────────────────────────────────────

check("health is open", (await call("GET", "/api/health")).status === 200);
check("no token → 401", (await call("GET", "/api/me")).status === 401);
check("wrong aud → 401", (await call("GET", "/api/me", { tok: token(ADMIN, { aud: "other" }) })).status === 401);
check("wrong iss → 401", (await call("GET", "/api/me", { tok: token(ADMIN, { iss: "https://evil.example" }) })).status === 401);
check("expired → 401", (await call("GET", "/api/me", { tok: token(ADMIN, { exp: -60 }) })).status === 401);
check("bad signature → 401", (await call("GET", "/api/me", { tok: token(ADMIN, { signWith: otherKey.privateKey }) })).status === 401);
check("garbage token → 401", (await call("GET", "/api/me", { tok: "not.a.jwt" })).status === 401);

const me = await call("GET", "/api/me", { as: ADMIN });
check("ADMIN_EMAIL bootstraps as admin", me.status === 200 && me.data?.user?.role === "admin", JSON.stringify(me));
const again = await call("GET", "/api/me", { as: ADMIN.toUpperCase() });
check("email is case-insensitive, no second admin row", again.data?.user?.id === me.data?.user?.id);
check("unknown email → 403", (await call("GET", "/api/me", { as: "stranger@check.test" })).status === 403);

// ── Users (spec E) ─────────────────────────────────────────────────

async function ensureUser(email, role) {
  const list = (await call("GET", "/api/users", { as: ADMIN })).data.users;
  const found = list.find((u) => u.email === email);
  if (found) {
    await call("PUT", `/api/users/${found.id}`, { as: ADMIN, body: { role, active: true } });
    return found.id;
  }
  const r = await call("POST", "/api/users", { as: ADMIN, body: { email, role } });
  return r.data.user.id;
}

const MANAGER = "manager@check.test";
const TECH = "tech@check.test";
await ensureUser(MANAGER, "manager");
await ensureUser(TECH, "maintenance");
const goneId = await ensureUser("gone@check.test", "manager");
await call("PUT", `/api/users/${goneId}`, { as: ADMIN, body: { active: false } });
check("deactivated user → 403", (await call("GET", "/api/me", { as: "gone@check.test" })).status === 403);
check("duplicate email → 409", (await call("POST", "/api/users", { as: ADMIN, body: { email: MANAGER, role: "manager" } })).status === 409);
const adminId = me.data.user.id;
check("demote last admin → 409", (await call("PUT", `/api/users/${adminId}`, { as: ADMIN, body: { role: "manager" } })).status === 409);
check("deactivate last admin → 409", (await call("PUT", `/api/users/${adminId}`, { as: ADMIN, body: { active: false } })).status === 409);
check("manager can't list users", (await call("GET", "/api/users", { as: MANAGER })).status === 403);

// ── Role matrix (spec B2) ──────────────────────────────────────────

const A = ["admin"], AM = ["admin", "manager"], AMT = ["admin", "manager", "maintenance"];

// Expected roles per route, restated from spec B2 by resource.
function expected(method, path) {
  const res = path.split("/")[2];
  const read = method === "GET";
  if (path === "/api/me") return AMT;
  if (res === "settings") return read ? AMT : A;
  if (res === "properties" || res === "units") return read ? AMT : AM;
  if (res === "vendors") return method === "DELETE" ? AM : AMT;
  if (res === "work-orders") return method === "DELETE" || path.endsWith("/approval") ? AM : AMT;
  if (res === "recurring-tasks") return AMT;
  if (["tenants", "leases", "checklists", "checklist-items", "rent-charges", "payments", "accounts", "bills",
    "bill-payments", "applications", "reports", "budgets"].includes(res)) return AM;
  if (res === "dashboard") return read ? AM : A;
  return A; // users, activity, anything new
}

const src = readFileSync(new URL("../src/server/index.ts", import.meta.url), "utf8");
const routes = [...src.matchAll(/^app\.(get|post|put|delete)\("([^"]+)"/gm)]
  .map(([, m, p]) => [m.toUpperCase(), p])
  .filter(([, p]) => p !== "/api/health");

const people = { admin: ADMIN, manager: MANAGER, maintenance: TECH };
let matrixOk = true;
for (const [method, pattern] of routes) {
  const path = pattern.replace(/:id/g, "999999");
  const allowed = expected(method, pattern);
  for (const [role, email] of Object.entries(people)) {
    // Mutating calls use a missing id or an empty body, so allowed calls fail validation (400/404),
    // never 403. Only the 403-or-not outcome is checked.
    const r = await call(method, path, { as: email, body: method === "GET" || method === "DELETE" ? undefined : {} });
    const denied = r.status === 403;
    if (denied === allowed.includes(role)) {
      matrixOk = false;
      check(`${role} ${method} ${pattern}`, false, `got ${r.status}, expected ${allowed.includes(role) ? "allowed" : "403"}`);
    }
  }
}
check(`role matrix: ${routes.length} routes × 3 roles`, matrixOk);

jwks.close();
console.log(failures ? `\n${failures} check(s) failed` : "\nAll checks passed");
process.exit(failures ? 1 : 0);
