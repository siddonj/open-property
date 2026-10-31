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
  if (res === "documents") return AMT; // narrowed by parent record in the handler; see the document checks
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

// ── Activity history (spec C) ──────────────────────────────────────

async function lastActivity(entity, id) {
  const r = await call("GET", `/api/activity?entity=${entity}&entity_id=${id}&limit=1`, { as: ADMIN });
  return r.data?.activity?.[0];
}
async function logged(name, entity, id, email, action, field) {
  const row = await lastActivity(entity, id);
  const ok = row?.user_email === email && row?.action === action && (!field || field in (row.changes ?? {}));
  check(`history: ${name}`, ok, JSON.stringify(row));
}
const make = async (path, as, body, key) => {
  const r = await call("POST", path, { as, body });
  if (r.status !== 201) console.log(`  setup ${path} → ${r.status} ${JSON.stringify(r.data)}`);
  return r.data?.[key];
};

const prop = await make("/api/properties", MANAGER, { name: "History Check" }, "property");
await logged("property create", "property", prop.id, MANAGER, "create");
await call("PUT", `/api/properties/${prop.id}`, { as: MANAGER, body: { name: "History Check 2" } });
await logged("property update records the changed field", "property", prop.id, MANAGER, "update", "name");
const unit = await make("/api/units", MANAGER, { property_id: prop.id, name: "H1" }, "unit");
await logged("unit create", "unit", unit.id, MANAGER, "create");
const tenant = await make("/api/tenants", MANAGER, { first_name: "Hist", last_name: "Ory" }, "tenant");
await logged("tenant create", "tenant", tenant.id, MANAGER, "create");
const lease = await make("/api/leases", MANAGER, {
  unit_id: unit.id, primary_tenant_id: tenant.id, start_date: "2026-01-01", end_date: "2026-12-31", monthly_rent: 1000,
}, "lease");
await logged("lease create", "lease", lease.id, MANAGER, "create");
const charge = await make("/api/rent-charges", MANAGER, { lease_id: lease.id, period: "2026-10", due_date: "2026-10-01", amount: 1000 }, "charge");
await call("POST", "/api/payments", { as: MANAGER, body: { charge_id: charge.id, amount: 100 } });
await logged("rent payment, on its charge", "rent_charge", charge.id, MANAGER, "payment");
const vendor = await make("/api/vendors", TECH, { name: "History Vendor" }, "vendor");
await logged("vendor create by maintenance", "vendor", vendor.id, TECH, "create");
const wo = await make("/api/work-orders", TECH, { property_id: prop.id, title: "History leak" }, "work_order");
await call("PUT", `/api/work-orders/${wo.id}`, { as: TECH, body: { status: "completed", cost: 50 } });
await logged("work order update by maintenance", "work_order", wo.id, TECH, "update", "status");
const task = await make("/api/recurring-tasks", TECH, {
  property_id: prop.id, title: "History filter", interval_unit: "month", interval_count: 3, start_date: "2026-11-01",
}, "recurring_task");
await logged("recurring task create", "recurring_task", task.id, TECH, "create");
const accounts = (await call("GET", "/api/accounts", { as: MANAGER })).data.accounts;
const expense = accounts.find((a) => a.type === "expense") ?? accounts[0];
const bill = await make("/api/bills", MANAGER, {
  property_id: prop.id, bill_date: "2026-10-15", lines: [{ account_id: expense.id, description: "Parts", amount_cents: 1234 }],
}, "bill");
await logged("bill create", "bill", bill.id, MANAGER, "create", "total_cents");
const appl = await make("/api/applications", MANAGER, { first_name: "App", last_name: "Licant" }, "application");
await logged("application create", "application", appl.id, MANAGER, "create");
await call("PUT", "/api/budgets", { as: MANAGER, body: { property_id: prop.id, year: 2026, lines: [{ account_id: expense.id, amount_cents: 5000 }] } });
await logged("budget save, on its property", "budget", prop.id, MANAGER, "update");
await call("DELETE", `/api/tenants/${tenant.id}`, { as: MANAGER });
await logged("tenant delete", "tenant", tenant.id, MANAGER, "delete");
const userRow = (await call("GET", `/api/activity?entity=user&limit=100`, { as: ADMIN })).data.activity.find((r) => r.label === TECH && r.action === "create");
check("history: user created by admin", userRow?.user_email === ADMIN && userRow?.action === "create", JSON.stringify(userRow));

check("manager can read one record's history", (await call("GET", `/api/activity?entity=property&entity_id=${prop.id}`, { as: MANAGER })).status === 200);
check("manager can't browse all history", (await call("GET", "/api/activity", { as: MANAGER })).status === 403);
check("manager can't read user history", (await call("GET", `/api/activity?entity=user&entity_id=1`, { as: MANAGER })).status === 403);
check("manager can't read settings history", (await call("GET", `/api/activity?entity=settings&entity_id=1`, { as: MANAGER })).status === 403);
check("maintenance can't read history", (await call("GET", `/api/activity?entity=work_order&entity_id=${wo.id}`, { as: TECH })).status === 403);

// ── Documents (spec D) ─────────────────────────────────────────────

async function upload(as, entity, id, bytes, type, name = "file") {
  const form = new FormData();
  form.set("entity", entity);
  form.set("entity_id", String(id));
  form.set("file", new Blob([bytes], { type }), name);
  const r = await fetch(`${BASE}/api/documents`, { method: "POST", headers: { "Cf-Access-Jwt-Assertion": token(as) }, body: form });
  return { status: r.status, data: await r.json().catch(() => null) };
}
const PDF = Buffer.from("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n");
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
const HTML = Buffer.from("<html><script>alert(1)</script></html>");

const leaseDoc = await upload(MANAGER, "lease", lease.id, PDF, "application/pdf", "signed lease.pdf");
check("manager uploads a PDF to a lease", leaseDoc.status === 201, JSON.stringify(leaseDoc));
const leaseDocId = leaseDoc.data?.document?.id;
const file = await fetch(`${BASE}/api/documents/${leaseDocId}/file`, { headers: { "Cf-Access-Jwt-Assertion": token(MANAGER) } });
const body = Buffer.from(await file.arrayBuffer());
check("file comes back byte-for-byte with safe headers",
  file.status === 200 && body.equals(PDF) && file.headers.get("content-type") === "application/pdf"
  && file.headers.get("x-content-type-options") === "nosniff" && file.headers.get("content-security-policy") === "sandbox",
  `${file.status} ${[...file.headers].join(" ")}`);
check("upload shows in the lease's history", (await lastActivity("lease", lease.id))?.action === "document_add");
check("renamed HTML as PDF → 415", (await upload(MANAGER, "lease", lease.id, HTML, "application/pdf", "x.pdf")).status === 415);
check("prototype key as type → 415", (await upload(MANAGER, "lease", lease.id, HTML, "constructor", "x.html")).status === 415);
check("SVG → 415", (await upload(MANAGER, "lease", lease.id, Buffer.from("<svg/>"), "image/svg+xml", "x.svg")).status === 415);
check("over 10 MB → 413", (await upload(MANAGER, "lease", lease.id, Buffer.alloc(11 * 1024 * 1024, 0x25), "application/pdf", "big.pdf")).status === 413);
check("missing parent → 404", (await upload(MANAGER, "lease", 999999, PDF, "application/pdf")).status === 404);

check("maintenance can't open a lease document by id", (await call("GET", `/api/documents/${leaseDocId}/file`, { as: TECH })).status === 403);
check("maintenance can't list lease documents", (await call("GET", `/api/documents?entity=lease&entity_id=${lease.id}`, { as: TECH })).status === 403);
check("maintenance can't upload to a lease", (await upload(TECH, "lease", lease.id, PDF, "application/pdf")).status === 403);
const woDoc = await upload(TECH, "work_order", wo.id, PNG, "image/png", "leak.png");
check("maintenance uploads a photo to a work order", woDoc.status === 201, JSON.stringify(woDoc));
check("maintenance lists work-order documents",
  (await call("GET", `/api/documents?entity=work_order&entity_id=${wo.id}`, { as: TECH })).data?.documents?.length === 1);
check("maintenance can't delete a document", (await call("DELETE", `/api/documents/${woDoc.data?.document?.id}`, { as: TECH })).status === 403);

const tenant2 = await make("/api/tenants", MANAGER, { first_name: "Doc", last_name: "Holder" }, "tenant");
await upload(MANAGER, "tenant", tenant2.id, PDF, "application/pdf", "id.pdf");
await upload(MANAGER, "bill", bill.id, PDF, "application/pdf", "receipt.pdf");
check("delete lease with documents → 409", (await call("DELETE", `/api/leases/${lease.id}`, { as: MANAGER })).status === 409);
check("delete unit whose lease has documents → 409", (await call("DELETE", `/api/units/${unit.id}`, { as: MANAGER })).status === 409);
check("delete property whose lease has documents → 409", (await call("DELETE", `/api/properties/${prop.id}`, { as: MANAGER })).status === 409);
check("delete tenant with documents → 409", (await call("DELETE", `/api/tenants/${tenant2.id}`, { as: MANAGER })).status === 409);
check("delete work order with documents → 409", (await call("DELETE", `/api/work-orders/${wo.id}`, { as: MANAGER })).status === 409);
check("delete bill with documents → 409", (await call("DELETE", `/api/bills/${bill.id}`, { as: MANAGER })).status === 409);

await call("PUT", `/api/leases/${lease.id}`, { as: MANAGER, body: { primary_tenant_id: tenant2.id } });
check("maintenance doesn't see tenant names on units",
  (await call("GET", `/api/units/${unit.id}`, { as: TECH })).data?.unit?.active_tenant_name === null
  && (await call("GET", `/api/units/${unit.id}`, { as: MANAGER })).data?.unit?.active_tenant_name === "Doc Holder");
check("manager deletes a document", (await call("DELETE", `/api/documents/${leaseDocId}`, { as: MANAGER })).status === 200);
check("deleted document is gone", (await call("GET", `/api/documents/${leaseDocId}/file`, { as: MANAGER })).status === 404);

jwks.close();
console.log(failures ? `\n${failures} check(s) failed` : "\nAll checks passed");
process.exit(failures ? 1 : 0);
