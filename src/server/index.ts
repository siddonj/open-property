import { Hono, type Context } from "hono";
import { verifyWithJwks } from "hono/jwt";
import { z } from "zod";
import { initDB, query, get, run } from "./db";

const ROLES = ["admin", "manager", "maintenance"] as const;
type Role = (typeof ROLES)[number];
type User = { id: number; email: string; name: string; role: Role };

type Env = {
  Bindings: {
    DB: D1Database;
    DOCS: R2Bucket;
    ACCESS_TEAM_DOMAIN?: string;
    ACCESS_AUD?: string;
    ADMIN_EMAIL?: string;
    AUTH_DEV_USER?: string;
  };
  Variables: { user: User };
};

const app = new Hono<Env>();

app.use("*", async (c, next) => {
  initDB(c.env);
  await next();
});

// ── Auth and access (Phase 5) ──────────────────────────────────────

const accessConfigured = (c: Context<Env>) => !!(c.env.ACCESS_TEAM_DOMAIN && c.env.ACCESS_AUD);

// Which sign-in applies (spec A1): Cloudflare Access when configured; otherwise a dev user, only on
// localhost; otherwise none, so an unconfigured deploy is closed rather than open.
async function signedInEmail(c: Context<Env>): Promise<string | null | "unconfigured"> {
  if (accessConfigured(c)) {
    const team = c.env.ACCESS_TEAM_DOMAIN!.replace(/\/+$/, "");
    const token = c.req.header("Cf-Access-Jwt-Assertion");
    if (!token) return null;
    try {
      const payload = await verifyWithJwks(
        token,
        {
          jwks_uri: `${team}/cdn-cgi/access/certs`,
          allowedAlgorithms: ["RS256"],
          verification: { iss: team, aud: c.env.ACCESS_AUD! },
        },
        { cf: { cacheTtl: 3600, cacheEverything: true } } as RequestInit,
      );
      if (typeof payload.exp !== "number" || typeof payload.email !== "string") return null;
      return payload.email.toLowerCase();
    } catch {
      return null;
    }
  }
  const host = new URL(c.req.url).hostname;
  if (c.env.AUTH_DEV_USER && (host === "localhost" || host === "127.0.0.1")) return c.env.AUTH_DEV_USER.toLowerCase();
  return "unconfigured";
}

const AM: Role[] = ["admin", "manager"];
const AMT: Role[] = ["admin", "manager", "maintenance"];

// Spec B2. First match wins; `*` at the end matches the path and anything under it, `:id` one
// segment. A route not listed here is admin-only, so new routes fail closed.
const ACCESS: [method: string, pattern: string, roles: Role[]][] = [
  ["GET", "/api/me", AMT],
  ["GET", "/api/settings", AMT],
  ["GET", "/api/properties*", AMT],
  ["GET", "/api/units*", AMT],
  ["*", "/api/properties*", AM],
  ["*", "/api/units*", AM],
  ["DELETE", "/api/vendors/:id", AM],
  ["*", "/api/vendors*", AMT],
  ["DELETE", "/api/work-orders/:id", AM],
  ["POST", "/api/work-orders/:id/approval", AM],
  ["*", "/api/work-orders*", AMT],
  ["*", "/api/recurring-tasks*", AMT],
  ["*", "/api/tenants*", AM],
  ["*", "/api/leases*", AM],
  ["*", "/api/checklists*", AM],
  ["*", "/api/checklist-items*", AM],
  ["*", "/api/rent-charges*", AM],
  ["*", "/api/payments*", AM],
  ["*", "/api/accounts*", AM],
  ["*", "/api/bills*", AM],
  ["*", "/api/bill-payments*", AM],
  ["*", "/api/applications*", AM],
  ["GET", "/api/dashboard*", AM],
  ["*", "/api/reports*", AM],
  ["*", "/api/budgets*", AM],
  ["GET", "/api/activity", AM], // managers: one record's history only (checked in the handler)
  ["*", "/api/documents*", AMT], // narrowed by parent record in the handlers (spec D3)
];
const ACCESS_RULES = ACCESS.map(([method, pattern, roles]) => ({
  method,
  re: new RegExp("^" + pattern.replace(/\*$/, "(/.*)?").replace(/:id/g, "[^/]+") + "$"),
  roles,
}));

function rolesFor(method: string, path: string): Role[] {
  const rule = ACCESS_RULES.find((r) => (r.method === "*" || r.method === method) && r.re.test(path));
  return rule ? rule.roles : ["admin"];
}

app.use("/api/*", async (c, next) => {
  if (c.req.path === "/api/health") return next();
  const email = await signedInEmail(c);
  if (email === "unconfigured") return c.json({ error: "Sign-in is not configured" }, 401);
  if (!email) return c.json({ error: "Not signed in" }, 401);

  type Row = User & { active: number; last_seen_at: string | null };
  const find = () => get<Row>("SELECT id, email, name, role, active, last_seen_at FROM users WHERE email = ?", [email]);
  let row = await find();
  // ADMIN_EMAIL bootstrap (A3): only when that email has no row, so a deactivated admin stays out.
  if (!row && email === c.env.ADMIN_EMAIL?.toLowerCase()) {
    await run("INSERT OR IGNORE INTO users (email, role) VALUES (?, 'admin')", [email]);
    row = await find();
  }
  if (!row || !row.active) return c.json({ error: `Your account isn't set up. Ask an admin to add ${email}.` }, 403);

  const hourAgo = new Date(Date.now() - 3600_000).toISOString().replace("T", " ").slice(0, 19);
  if (!row.last_seen_at || row.last_seen_at < hourAgo) {
    await run("UPDATE users SET last_seen_at = datetime('now') WHERE id = ?", [row.id]);
  }
  c.set("user", { id: row.id, email: row.email, name: row.name, role: row.role });
  if (!rolesFor(c.req.method, c.req.path).includes(row.role)) {
    return c.json({ error: "You don't have access to this." }, 403);
  }
  await next();
});

// ── Activity history (Phase 5) ─────────────────────────────────────

type Changes = Record<string, [unknown, unknown]>;

// The fields in `patch` whose stored value actually changes (spec C1). Booleans compare as 0/1,
// the way SQLite stores them.
function diff(before: Record<string, unknown> | undefined, patch: Record<string, unknown>): Changes {
  const out: Changes = {};
  for (const [k, raw] of Object.entries(patch)) {
    if (raw === undefined) continue;
    const v = typeof raw === "boolean" ? (raw ? 1 : 0) : raw;
    const old = before?.[k] ?? null;
    if (old !== (v ?? null)) out[k] = [old, v ?? null];
  }
  return out;
}

// Called by every successful write handler after its change (spec C1). Append-only: the table's
// triggers reject UPDATE and DELETE.
async function logActivity(
  c: Context<Env>,
  entity: string,
  entityId: number | bigint | null,
  action: string,
  label?: string | null,
  changes?: Changes,
) {
  await run(
    "INSERT INTO activity (user_id, entity, entity_id, action, label, changes) VALUES (?, ?, ?, ?, ?, ?)",
    [c.get("user").id, entity, entityId === null ? null : Number(entityId), action, label ?? null,
      changes && Object.keys(changes).length ? JSON.stringify(changes) : null],
  );
}

const fullName = (r: { first_name?: unknown; last_name?: unknown } | undefined) =>
  r ? `${r.first_name ?? ""} ${r.last_name ?? ""}`.trim() : null;

// ── Helpers ────────────────────────────────────────────────────────

const intParam = (raw: string | undefined): number | null => {
  if (!raw) return null;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) ? n : null;
};

async function parseJson<T>(c: Context, schema: z.ZodType<T>): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return { ok: false, error: "Invalid JSON" };
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return { ok: false, error: parsed.error.issues.map(i => `${i.path.join(".")}: ${i.message}`).join("; ") };
  return { ok: true, data: parsed.data };
}

// Deleting a property, unit or lease cascades to its rent charges and payments, so those
// deletes are refused once any rent history exists. `scope` filters rent_charges via leases l / units u.
async function hasRentHistory(scope: string, id: number): Promise<boolean> {
  const row = await get(
    `SELECT 1 FROM rent_charges rc JOIN leases l ON l.id = rc.lease_id JOIN units u ON u.id = l.unit_id
     WHERE ${scope} = ? LIMIT 1`,
    [id],
  );
  return !!row;
}

function buildUpdate(fields: Record<string, unknown>): { sets: string[]; params: unknown[] } {
  const sets: string[] = [];
  const params: unknown[] = [];
  for (const [k, v] of Object.entries(fields)) {
    if (v !== undefined) { sets.push(`${k} = ?`); params.push(v); }
  }
  return { sets, params };
}

// The operator's local date from ?today= (PR #7), so "overdue" and "now" match what they see.
// Falls back to the UTC date when absent or malformed.
function requestToday(c: Context): string {
  const q = c.req.query("today");
  return q && isCalendarDate(q) ? q : new Date().toISOString().slice(0, 10);
}

function monthBounds(period: string): { from: string; to: string } {
  const [y, m] = period.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { from: `${period}-01`, to: `${period}-${String(last).padStart(2, "0")}` };
}

// The one occupancy rule (Phase 4, D1/D2): a non-cancelled lease covers [from, to] when it starts
// by `to` and its effective end reaches `from`. An active lease past its end date is a holdover and
// runs through `today`. Every occupied count goes through this.
function leaseCovers(alias: string, from: string, to: string, today: string): { sql: string; params: string[] } {
  return {
    sql: `${alias}.status != 'cancelled' AND ${alias}.start_date <= ?
      AND (${alias}.end_date >= ? OR (${alias}.status = 'active' AND ? >= ?))`,
    params: [to, from, today, from],
  };
}

// Correlated "is unit `u` occupied in [from, to]" for use inside a units query.
function unitOccupied(from: string, to: string, today: string): { sql: string; params: string[] } {
  const cover = leaseCovers("lc", from, to, today);
  return { sql: `EXISTS (SELECT 1 FROM leases lc WHERE lc.unit_id = u.id AND ${cover.sql})`, params: cover.params };
}

// ── Properties ─────────────────────────────────────────────────────

const PropertyInput = z.object({
  name: z.string().min(1),
  type: z.enum(["single_family", "multi_family", "condo", "townhouse", "commercial"]).optional(),
  address: z.string().optional().nullable(),
  city: z.string().optional().nullable(),
  state: z.string().optional().nullable(),
  zip: z.string().optional().nullable(),
  year_built: z.number().int().optional().nullable(),
  notes: z.string().optional().nullable(),
  color: z.string().optional(),
});

// Unit and occupied counts for the current month, matching the dashboard and occupancy report.
function propertyCountsSql(c: Context): { sql: string; params: string[] } {
  const today = requestToday(c);
  const { from, to } = monthBounds(today.slice(0, 7));
  const occ = unitOccupied(from, to, today);
  return {
    sql: `(SELECT COUNT(*) FROM units u WHERE u.property_id = p.id) as unit_count,
       (SELECT COUNT(*) FROM units u WHERE u.property_id = p.id AND ${occ.sql}) as occupied_count`,
    params: occ.params,
  };
}

app.get("/api/properties", async (c) => {
  const counts = propertyCountsSql(c);
  const rows = await query(`SELECT p.*, ${counts.sql} FROM properties p ORDER BY p.name`, counts.params);
  return c.json({ properties: rows });
});

app.get("/api/properties/:id", async (c) => {
  const id = intParam(c.req.param("id"));
  if (!id) return c.json({ error: "Invalid ID" }, 400);
  const counts = propertyCountsSql(c);
  const row = await get(`SELECT p.*, ${counts.sql} FROM properties p WHERE p.id = ?`, [...counts.params, id]);
  if (!row) return c.json({ error: "Not found" }, 404);
  return c.json({ property: row });
});

app.post("/api/properties", async (c) => {
  const parsed = await parseJson(c, PropertyInput);
  if (!parsed.ok) return c.json({ error: parsed.error }, 400);
  const d = parsed.data;
  const result = await run(
    `INSERT INTO properties (name, type, address, city, state, zip, year_built, notes, color)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [d.name, d.type ?? "single_family", d.address ?? null, d.city ?? null, d.state ?? null, d.zip ?? null, d.year_built ?? null, d.notes ?? null, d.color ?? "sky"],
  );
  const row = await get("SELECT * FROM properties WHERE id = ?", [result.lastInsertRowid]);
  await logActivity(c, "property", result.lastInsertRowid, "create", d.name);
  return c.json({ property: row }, 201);
});

app.put("/api/properties/:id", async (c) => {
  const id = intParam(c.req.param("id"));
  if (!id) return c.json({ error: "Invalid ID" }, 400);
  const parsed = await parseJson(c, PropertyInput.partial());
  if (!parsed.ok) return c.json({ error: parsed.error }, 400);
  const { sets, params } = buildUpdate(parsed.data);
  if (!sets.length) return c.json({ error: "No fields" }, 400);
  params.push(id);
  const before = await get<Record<string, unknown>>("SELECT * FROM properties WHERE id = ?", [id]);
  const r = await run(`UPDATE properties SET ${sets.join(", ")} WHERE id = ?`, params);
  if (!r.changes) return c.json({ error: "Not found" }, 404);
  await logActivity(c, "property", id, "update", before?.name as string | undefined, diff(before, parsed.data));
  const row = await get("SELECT * FROM properties WHERE id = ?", [id]);
  return c.json({ property: row });
});

app.delete("/api/properties/:id", async (c) => {
  const id = intParam(c.req.param("id"));
  if (!id) return c.json({ error: "Invalid ID" }, 400);
  if (await hasDocuments("property", id)) return c.json({ error: "Its leases have documents. Delete them first." }, 409);
  if (await hasRentHistory("u.property_id", id)) {
    return c.json({ error: "This property has rent history, so it can't be deleted. End or cancel its leases instead." }, 409);
  }
  if (await get("SELECT 1 FROM bills WHERE property_id = ? UNION ALL SELECT 1 FROM budgets WHERE property_id = ? LIMIT 1", [id, id])) {
    return c.json({ error: "This property has bills or budgets. Its financial records are kept, so it can't be deleted" }, 409);
  }
  const before = await get<Record<string, unknown>>("SELECT name FROM properties WHERE id = ?", [id]);
  const r = await run("DELETE FROM properties WHERE id = ?", [id]);
  if (!r.changes) return c.json({ error: "Not found" }, 404);
  await logActivity(c, "property", id, "delete", before?.name as string | undefined);
  return c.json({ ok: true });
});

// ── Units ──────────────────────────────────────────────────────────

const UnitInput = z.object({
  property_id: z.number().int(),
  name: z.string().min(1),
  bedrooms: z.number().min(0).optional(),
  bathrooms: z.number().min(0).optional(),
  sqft: z.number().int().optional().nullable(),
  market_rent: z.number().min(0).optional(),
  status: z.enum(["vacant", "occupied", "turnover", "unavailable"]).optional(),
  notes: z.string().optional().nullable(),
});

const UNIT_SELECT = `
  SELECT u.*,
    p.name as property_name,
    p.color as property_color,
    p.address as property_address,
    p.city as property_city,
    (SELECT l.id FROM leases l WHERE l.unit_id = u.id AND l.status = 'active' ORDER BY l.start_date DESC LIMIT 1) as active_lease_id,
    (SELECT t.first_name || ' ' || t.last_name FROM leases l LEFT JOIN tenants t ON t.id = l.primary_tenant_id WHERE l.unit_id = u.id AND l.status = 'active' ORDER BY l.start_date DESC LIMIT 1) as active_tenant_name
  FROM units u
  LEFT JOIN properties p ON p.id = u.property_id
`;

app.get("/api/units", async (c) => {
  const propertyId = intParam(c.req.query("property_id"));
  const status = c.req.query("status");
  const where: string[] = [];
  const params: unknown[] = [];
  if (propertyId) { where.push("u.property_id = ?"); params.push(propertyId); }
  if (status) { where.push("u.status = ?"); params.push(status); }
  const sql = `${UNIT_SELECT}${where.length ? " WHERE " + where.join(" AND ") : ""} ORDER BY p.name, u.name`;
  const rows = await query(sql, params);
  return c.json({ units: rows });
});

app.get("/api/units/:id", async (c) => {
  const id = intParam(c.req.param("id"));
  if (!id) return c.json({ error: "Invalid ID" }, 400);
  const row = await get(`${UNIT_SELECT} WHERE u.id = ?`, [id]);
  if (!row) return c.json({ error: "Not found" }, 404);
  return c.json({ unit: row });
});

app.post("/api/units", async (c) => {
  const parsed = await parseJson(c, UnitInput);
  if (!parsed.ok) return c.json({ error: parsed.error }, 400);
  const d = parsed.data;
  const result = await run(
    `INSERT INTO units (property_id, name, bedrooms, bathrooms, sqft, market_rent, status, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [d.property_id, d.name, d.bedrooms ?? 1, d.bathrooms ?? 1, d.sqft ?? null, d.market_rent ?? 0, d.status ?? "vacant", d.notes ?? null],
  );
  const row = await get(`${UNIT_SELECT} WHERE u.id = ?`, [result.lastInsertRowid]);
  await logActivity(c, "unit", result.lastInsertRowid, "create", d.name);
  return c.json({ unit: row }, 201);
});

app.put("/api/units/:id", async (c) => {
  const id = intParam(c.req.param("id"));
  if (!id) return c.json({ error: "Invalid ID" }, 400);
  const parsed = await parseJson(c, UnitInput.partial());
  if (!parsed.ok) return c.json({ error: parsed.error }, 400);
  const { sets, params } = buildUpdate(parsed.data);
  if (!sets.length) return c.json({ error: "No fields" }, 400);
  params.push(id);
  const before = await get<Record<string, unknown>>("SELECT * FROM units WHERE id = ?", [id]);
  const r = await run(`UPDATE units SET ${sets.join(", ")} WHERE id = ?`, params);
  if (!r.changes) return c.json({ error: "Not found" }, 404);
  await logActivity(c, "unit", id, "update", before?.name as string | undefined, diff(before, parsed.data));
  const row = await get(`${UNIT_SELECT} WHERE u.id = ?`, [id]);
  return c.json({ unit: row });
});

app.delete("/api/units/:id", async (c) => {
  const id = intParam(c.req.param("id"));
  if (!id) return c.json({ error: "Invalid ID" }, 400);
  if (await hasDocuments("unit", id)) return c.json({ error: "Its leases have documents. Delete them first." }, 409);
  if (await hasRentHistory("u.id", id)) {
    return c.json({ error: "This unit has rent history, so it can't be deleted. End or cancel its leases instead." }, 409);
  }
  const before = await get<Record<string, unknown>>("SELECT name FROM units WHERE id = ?", [id]);
  const r = await run("DELETE FROM units WHERE id = ?", [id]);
  if (!r.changes) return c.json({ error: "Not found" }, 404);
  await logActivity(c, "unit", id, "delete", before?.name as string | undefined);
  return c.json({ ok: true });
});

// ── Tenants ────────────────────────────────────────────────────────

const TenantInput = z.object({
  first_name: z.string().min(1),
  last_name: z.string().min(1),
  email: z.string().optional().nullable(),
  phone: z.string().optional().nullable(),
  date_of_birth: z.string().optional().nullable(),
  emergency_contact: z.string().optional().nullable(),
  employer: z.string().optional().nullable(),
  monthly_income: z.number().optional().nullable(),
  notes: z.string().optional().nullable(),
});

app.get("/api/tenants", async (c) => {
  const search = c.req.query("q")?.trim();
  if (search) {
    const like = `%${search}%`;
    const rows = await query(
      `SELECT t.*,
         (SELECT u.id FROM leases l LEFT JOIN units u ON u.id = l.unit_id
            WHERE l.primary_tenant_id = t.id AND l.status = 'active' LIMIT 1) as active_unit_id,
         (SELECT u.name FROM leases l LEFT JOIN units u ON u.id = l.unit_id
            WHERE l.primary_tenant_id = t.id AND l.status = 'active' LIMIT 1) as active_unit_name,
         (SELECT p.name FROM leases l LEFT JOIN units u ON u.id = l.unit_id LEFT JOIN properties p ON p.id = u.property_id
            WHERE l.primary_tenant_id = t.id AND l.status = 'active' LIMIT 1) as active_property_name
       FROM tenants t
       WHERE t.last_name LIKE ? OR t.first_name LIKE ? OR t.email LIKE ? OR t.phone LIKE ?
       ORDER BY t.last_name, t.first_name LIMIT 200`,
      [like, like, like, like],
    );
    return c.json({ tenants: rows });
  }
  const rows = await query(
    `SELECT t.*,
       (SELECT u.id FROM leases l LEFT JOIN units u ON u.id = l.unit_id
          WHERE l.primary_tenant_id = t.id AND l.status = 'active' LIMIT 1) as active_unit_id,
       (SELECT u.name FROM leases l LEFT JOIN units u ON u.id = l.unit_id
          WHERE l.primary_tenant_id = t.id AND l.status = 'active' LIMIT 1) as active_unit_name,
       (SELECT p.name FROM leases l LEFT JOIN units u ON u.id = l.unit_id LEFT JOIN properties p ON p.id = u.property_id
          WHERE l.primary_tenant_id = t.id AND l.status = 'active' LIMIT 1) as active_property_name
     FROM tenants t ORDER BY t.last_name, t.first_name LIMIT 500`,
  );
  return c.json({ tenants: rows });
});

app.get("/api/tenants/:id", async (c) => {
  const id = intParam(c.req.param("id"));
  if (!id) return c.json({ error: "Invalid ID" }, 400);
  const row = await get("SELECT * FROM tenants WHERE id = ?", [id]);
  if (!row) return c.json({ error: "Not found" }, 404);
  return c.json({ tenant: row });
});

app.post("/api/tenants", async (c) => {
  const parsed = await parseJson(c, TenantInput);
  if (!parsed.ok) return c.json({ error: parsed.error }, 400);
  const d = parsed.data;
  const result = await run(
    `INSERT INTO tenants (first_name, last_name, email, phone, date_of_birth, emergency_contact, employer, monthly_income, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [d.first_name, d.last_name, d.email ?? null, d.phone ?? null, d.date_of_birth ?? null, d.emergency_contact ?? null, d.employer ?? null, d.monthly_income ?? null, d.notes ?? null],
  );
  const row = await get("SELECT * FROM tenants WHERE id = ?", [result.lastInsertRowid]);
  await logActivity(c, "tenant", result.lastInsertRowid, "create", `${d.first_name} ${d.last_name}`);
  return c.json({ tenant: row }, 201);
});

app.put("/api/tenants/:id", async (c) => {
  const id = intParam(c.req.param("id"));
  if (!id) return c.json({ error: "Invalid ID" }, 400);
  const parsed = await parseJson(c, TenantInput.partial());
  if (!parsed.ok) return c.json({ error: parsed.error }, 400);
  const { sets, params } = buildUpdate(parsed.data);
  if (!sets.length) return c.json({ error: "No fields" }, 400);
  params.push(id);
  const before = await get<Record<string, unknown>>("SELECT * FROM tenants WHERE id = ?", [id]);
  const r = await run(`UPDATE tenants SET ${sets.join(", ")} WHERE id = ?`, params);
  if (!r.changes) return c.json({ error: "Not found" }, 404);
  await logActivity(c, "tenant", id, "update", fullName(before), diff(before, parsed.data));
  const row = await get("SELECT * FROM tenants WHERE id = ?", [id]);
  return c.json({ tenant: row });
});

app.delete("/api/tenants/:id", async (c) => {
  const id = intParam(c.req.param("id"));
  if (!id) return c.json({ error: "Invalid ID" }, 400);
  if (await hasDocuments("tenant", id)) return c.json({ error: HAS_DOCUMENTS }, 409);
  const before = await get<Record<string, unknown>>("SELECT first_name, last_name FROM tenants WHERE id = ?", [id]);
  const r = await run("DELETE FROM tenants WHERE id = ?", [id]);
  if (!r.changes) return c.json({ error: "Not found" }, 404);
  await logActivity(c, "tenant", id, "delete", fullName(before));
  return c.json({ ok: true });
});

// ── Leases ─────────────────────────────────────────────────────────

const LeaseDate = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/, "must be a YYYY-MM-DD date");

const LeaseInput = z.object({
  unit_id: z.number().int(),
  primary_tenant_id: z.number().int().nullable().optional(),
  start_date: LeaseDate,
  end_date: LeaseDate,
  monthly_rent: z.number().min(0).optional(),
  deposit: z.number().min(0).optional(),
  rent_due_day: z.number().int().min(1).max(31).optional(),
  late_fee: z.number().min(0).optional(),
  status: z.enum(["upcoming", "active", "ended", "cancelled"]).optional(),
  notes: z.string().optional().nullable(),
});

// Done/total item counts for a lease's checklist of the given kind (null total = no checklist).
function checklistProgress(kind: "move_in" | "move_out"): string {
  const items = `FROM lease_checklist_items i JOIN lease_checklists cl ON cl.id = i.checklist_id
      WHERE cl.lease_id = l.id AND cl.kind = '${kind}'`;
  return `(SELECT SUM(i.done) ${items}) as ${kind}_done,
    (SELECT CASE WHEN EXISTS (SELECT 1 FROM lease_checklists WHERE lease_id = l.id AND kind = '${kind}')
      THEN (SELECT COUNT(*) ${items}) END) as ${kind}_total`;
}

const LEASE_SELECT = `
  SELECT l.*,
    u.name as unit_name,
    p.id as property_id, p.name as property_name, p.color as property_color,
    t.first_name as tenant_first_name, t.last_name as tenant_last_name,
    t.email as tenant_email, t.phone as tenant_phone,
    ${checklistProgress("move_in")},
    ${checklistProgress("move_out")}
  FROM leases l
  LEFT JOIN units u ON u.id = l.unit_id
  LEFT JOIN properties p ON p.id = u.property_id
  LEFT JOIN tenants t ON t.id = l.primary_tenant_id
`;

// Keep units.status in step with leases: occupied while any lease is active, vacant once
// none is. Turnover/unavailable units with no active lease are left as they are.
async function syncUnitOccupancy(unitId: number) {
  await run(
    `UPDATE units SET status = CASE
       WHEN EXISTS (SELECT 1 FROM leases WHERE unit_id = ? AND status = 'active') THEN 'occupied'
       WHEN status = 'occupied' THEN 'vacant'
       ELSE status END
     WHERE id = ?`,
    [unitId, unitId],
  );
}

type LeaseShape = { unit_id: number; start_date: string; end_date: string; status: string };

// Rejects end-before-start, and an active/upcoming lease overlapping another active/upcoming
// lease on the same unit. `exceptId` is the lease being edited.
async function leaseConflict(l: LeaseShape, exceptId: number | null): Promise<{ error: string; status: 400 | 409 } | null> {
  if (l.end_date < l.start_date) return { error: "end_date must be on or after start_date", status: 400 };
  if (l.status !== "active" && l.status !== "upcoming") return null;
  const other = await get(
    `SELECT id FROM leases
     WHERE unit_id = ? AND id != ? AND status IN ('active', 'upcoming') AND start_date <= ? AND end_date >= ?
     LIMIT 1`,
    [l.unit_id, exceptId ?? 0, l.end_date, l.start_date],
  );
  return other ? { error: "This unit already has an active or upcoming lease covering those dates.", status: 409 } : null;
}

app.get("/api/leases", async (c) => {
  const status = c.req.query("status");
  const tenantId = intParam(c.req.query("tenant_id"));
  const unitId = intParam(c.req.query("unit_id"));
  const where: string[] = [];
  const params: unknown[] = [];
  if (status) { where.push("l.status = ?"); params.push(status); }
  if (tenantId) { where.push("l.primary_tenant_id = ?"); params.push(tenantId); }
  if (unitId) { where.push("l.unit_id = ?"); params.push(unitId); }
  const sql = `${LEASE_SELECT}${where.length ? " WHERE " + where.join(" AND ") : ""} ORDER BY l.start_date DESC`;
  const rows = await query(sql, params);
  return c.json({ leases: rows });
});

app.get("/api/leases/:id", async (c) => {
  const id = intParam(c.req.param("id"));
  if (!id) return c.json({ error: "Invalid ID" }, 400);
  const row = await get(`${LEASE_SELECT} WHERE l.id = ?`, [id]);
  if (!row) return c.json({ error: "Not found" }, 404);
  return c.json({ lease: row });
});

app.post("/api/leases", async (c) => {
  const parsed = await parseJson(c, LeaseInput);
  if (!parsed.ok) return c.json({ error: parsed.error }, 400);
  const d = parsed.data;
  const conflict = await leaseConflict({ ...d, status: d.status ?? "active" }, null);
  if (conflict) return c.json({ error: conflict.error }, conflict.status);
  const result = await run(
    `INSERT INTO leases (unit_id, primary_tenant_id, start_date, end_date, monthly_rent, deposit, rent_due_day, late_fee, status, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [d.unit_id, d.primary_tenant_id ?? null, d.start_date, d.end_date, d.monthly_rent ?? 0, d.deposit ?? 0, d.rent_due_day ?? 1, d.late_fee ?? 0, d.status ?? "active", d.notes ?? null],
  );
  await syncUnitOccupancy(d.unit_id);
  const row = await get(`${LEASE_SELECT} WHERE l.id = ?`, [result.lastInsertRowid]);
  await logActivity(c, "lease", result.lastInsertRowid, "create", await leaseLabel(Number(result.lastInsertRowid)));
  return c.json({ lease: row }, 201);
});

app.put("/api/leases/:id", async (c) => {
  const id = intParam(c.req.param("id"));
  if (!id) return c.json({ error: "Invalid ID" }, 400);
  const parsed = await parseJson(c, LeaseInput.partial());
  if (!parsed.ok) return c.json({ error: parsed.error }, 400);
  const { sets, params } = buildUpdate(parsed.data);
  if (!sets.length) return c.json({ error: "No fields" }, 400);
  const before = await get<LeaseShape & Record<string, unknown>>("SELECT * FROM leases WHERE id = ?", [id]);
  if (!before) return c.json({ error: "Not found" }, 404);
  const p = parsed.data;
  const conflict = await leaseConflict({
    unit_id: p.unit_id ?? before.unit_id,
    start_date: p.start_date ?? before.start_date,
    end_date: p.end_date ?? before.end_date,
    status: p.status ?? before.status,
  }, id);
  if (conflict) return c.json({ error: conflict.error }, conflict.status);
  params.push(id);
  const r = await run(`UPDATE leases SET ${sets.join(", ")} WHERE id = ?`, params);
  if (!r.changes) return c.json({ error: "Not found" }, 404);
  await logActivity(c, "lease", id, "update", await leaseLabel(id), diff(before, parsed.data));
  await syncUnitOccupancy(before.unit_id);
  if (parsed.data.unit_id !== undefined && parsed.data.unit_id !== before.unit_id) {
    await syncUnitOccupancy(parsed.data.unit_id);
  }
  const row = await get(`${LEASE_SELECT} WHERE l.id = ?`, [id]);
  return c.json({ lease: row });
});

app.delete("/api/leases/:id", async (c) => {
  const id = intParam(c.req.param("id"));
  if (!id) return c.json({ error: "Invalid ID" }, 400);
  if (await hasDocuments("lease", id)) return c.json({ error: HAS_DOCUMENTS }, 409);
  const lease = await get<{ unit_id: number }>("SELECT unit_id FROM leases WHERE id = ?", [id]);
  if (!lease) return c.json({ error: "Not found" }, 404);
  if (await hasRentHistory("l.id", id)) {
    return c.json({ error: "This lease has rent history, so it can't be deleted. End or cancel it instead." }, 409);
  }
  const label = await leaseLabel(id);
  await run("DELETE FROM leases WHERE id = ?", [id]);
  await logActivity(c, "lease", id, "delete", label);
  await syncUnitOccupancy(lease.unit_id);
  return c.json({ ok: true });
});

// Unit name and primary tenant, for activity labels.
async function leaseLabel(id: number): Promise<string | null> {
  const r = await get<{ label: string }>(
    `SELECT u.name || COALESCE(' · ' || t.first_name || ' ' || t.last_name, '') as label
     FROM leases l JOIN units u ON u.id = l.unit_id LEFT JOIN tenants t ON t.id = l.primary_tenant_id WHERE l.id = ?`,
    [id],
  );
  return r?.label ?? null;
}

// ── Lease checklists (move-in / move-out) ──────────────────────────

const ChecklistKind = z.enum(["move_in", "move_out"]);

// Default items seeded into a new checklist; operators can edit per lease.
const DEFAULT_CHECKLIST_ITEMS: Record<z.infer<typeof ChecklistKind>, string[]> = {
  move_in: [
    "Keys handed over",
    "Meter readings recorded",
    "Condition photos taken",
    "Deposit received",
    "Utilities transferred",
  ],
  move_out: [
    "Keys returned",
    "Forwarding address recorded",
    "Final inspection completed",
    "Meter readings recorded",
    "Deposit disposition recorded",
  ],
};

const ChecklistItemInput = z.object({
  label: z.string().trim().min(1),
  done: z.boolean().optional(),
});

async function checklistsForLease(leaseId: number) {
  const lists = await query<{ id: number; lease_id: number; kind: string; created_at: string }>(
    "SELECT * FROM lease_checklists WHERE lease_id = ? ORDER BY kind",
    [leaseId],
  );
  if (!lists.length) return [];
  const items = await query<{ id: number; checklist_id: number; label: string; done: number; done_at: string | null; sort: number }>(
    `SELECT * FROM lease_checklist_items
     WHERE checklist_id IN (${lists.map(() => "?").join(", ")})
     ORDER BY sort, id`,
    lists.map((l) => l.id),
  );
  return lists.map((l) => ({
    ...l,
    items: items.filter((i) => i.checklist_id === l.id).map((i) => ({ ...i, done: !!i.done })),
  }));
}

app.get("/api/leases/:id/checklists", async (c) => {
  const id = intParam(c.req.param("id"));
  if (!id) return c.json({ error: "Invalid ID" }, 400);
  return c.json({ checklists: await checklistsForLease(id) });
});

app.post("/api/leases/:id/checklists", async (c) => {
  const id = intParam(c.req.param("id"));
  if (!id) return c.json({ error: "Invalid ID" }, 400);
  const parsed = await parseJson(c, z.object({ kind: ChecklistKind }));
  if (!parsed.ok) return c.json({ error: parsed.error }, 400);
  const lease = await get("SELECT id FROM leases WHERE id = ?", [id]);
  if (!lease) return c.json({ error: "Lease not found" }, 404);
  const existing = await get("SELECT id FROM lease_checklists WHERE lease_id = ? AND kind = ?", [id, parsed.data.kind]);
  if (existing) return c.json({ error: "Checklist already exists" }, 409);
  // ON CONFLICT covers a concurrent create racing past the existence check above.
  const created = await run(
    "INSERT INTO lease_checklists (lease_id, kind) VALUES (?, ?) ON CONFLICT (lease_id, kind) DO NOTHING",
    [id, parsed.data.kind],
  );
  if (!created.changes) return c.json({ error: "Checklist already exists" }, 409);
  const labels = DEFAULT_CHECKLIST_ITEMS[parsed.data.kind];
  await run(
    `INSERT INTO lease_checklist_items (checklist_id, label, sort) VALUES ${labels.map(() => "(?, ?, ?)").join(", ")}`,
    labels.flatMap((label, i) => [created.lastInsertRowid, label, i]),
  );
  await logActivity(c, "lease", id, "checklist_create", `${parsed.data.kind} checklist`);
  return c.json({ checklists: await checklistsForLease(id) }, 201);
});

app.post("/api/checklists/:id/items", async (c) => {
  const id = intParam(c.req.param("id"));
  if (!id) return c.json({ error: "Invalid ID" }, 400);
  const parsed = await parseJson(c, ChecklistItemInput.pick({ label: true }));
  if (!parsed.ok) return c.json({ error: parsed.error }, 400);
  const list = await get<{ id: number; lease_id: number }>("SELECT id, lease_id FROM lease_checklists WHERE id = ?", [id]);
  if (!list) return c.json({ error: "Not found" }, 404);
  await run(
    `INSERT INTO lease_checklist_items (checklist_id, label, sort)
     VALUES (?, ?, (SELECT COALESCE(MAX(sort), -1) + 1 FROM lease_checklist_items WHERE checklist_id = ?))`,
    [id, parsed.data.label, id],
  );
  await logActivity(c, "lease", list.lease_id, "checklist_item_add", parsed.data.label);
  return c.json({ ok: true }, 201);
});

app.put("/api/checklist-items/:id", async (c) => {
  const id = intParam(c.req.param("id"));
  if (!id) return c.json({ error: "Invalid ID" }, 400);
  const parsed = await parseJson(c, ChecklistItemInput.partial());
  if (!parsed.ok) return c.json({ error: parsed.error }, 400);
  const { label, done } = parsed.data;
  const { sets, params } = buildUpdate({ label, done: done === undefined ? undefined : done ? 1 : 0 });
  if (done !== undefined) sets.push(done ? "done_at = datetime('now')" : "done_at = NULL");
  if (!sets.length) return c.json({ error: "No fields" }, 400);
  params.push(id);
  const item = await get<{ lease_id: number; label: string; done: number }>(
    "SELECT cl.lease_id, i.label, i.done FROM lease_checklist_items i JOIN lease_checklists cl ON cl.id = i.checklist_id WHERE i.id = ?",
    [id],
  );
  const r = await run(`UPDATE lease_checklist_items SET ${sets.join(", ")} WHERE id = ?`, params);
  if (!r.changes) return c.json({ error: "Not found" }, 404);
  await logActivity(c, "lease", item?.lease_id ?? null, "checklist_item_update", item?.label, diff(item, { label, done }));
  return c.json({ ok: true });
});

app.delete("/api/checklist-items/:id", async (c) => {
  const id = intParam(c.req.param("id"));
  if (!id) return c.json({ error: "Invalid ID" }, 400);
  const item = await get<{ lease_id: number; label: string; done: number }>(
    "SELECT cl.lease_id, i.label, i.done FROM lease_checklist_items i JOIN lease_checklists cl ON cl.id = i.checklist_id WHERE i.id = ?",
    [id],
  );
  const r = await run("DELETE FROM lease_checklist_items WHERE id = ?", [id]);
  if (!r.changes) return c.json({ error: "Not found" }, 404);
  await logActivity(c, "lease", item?.lease_id ?? null, "checklist_item_delete", item?.label);
  return c.json({ ok: true });
});

// ── Rent charges & payments ────────────────────────────────────────

const ChargeInput = z.object({
  lease_id: z.number().int(),
  period: z.string().regex(/^\d{4}-\d{2}$/),
  due_date: z.string(),
  amount: z.number().min(0).optional(),
  notes: z.string().optional().nullable(),
});

const CHARGE_SELECT = `
  SELECT c.*,
    l.unit_id, l.monthly_rent as lease_rent, l.rent_due_day,
    u.name as unit_name,
    p.id as property_id, p.name as property_name, p.color as property_color,
    t.id as tenant_id, t.first_name as tenant_first_name, t.last_name as tenant_last_name
  FROM rent_charges c
  LEFT JOIN leases l ON l.id = c.lease_id
  LEFT JOIN units u ON u.id = l.unit_id
  LEFT JOIN properties p ON p.id = u.property_id
  LEFT JOIN tenants t ON t.id = l.primary_tenant_id
`;

app.get("/api/rent-charges", async (c) => {
  const period = c.req.query("period");
  const status = c.req.query("status");
  const where: string[] = [];
  const params: unknown[] = [];
  if (period) { where.push("c.period = ?"); params.push(period); }
  if (status) { where.push("c.status = ?"); params.push(status); }
  const sql = `${CHARGE_SELECT}${where.length ? " WHERE " + where.join(" AND ") : ""} ORDER BY c.due_date, p.name, u.name`;
  const rows = await query(sql, params);
  return c.json({ charges: rows });
});

app.post("/api/rent-charges", async (c) => {
  const parsed = await parseJson(c, ChargeInput);
  if (!parsed.ok) return c.json({ error: parsed.error }, 400);
  const d = parsed.data;
  const result = await run(
    `INSERT INTO rent_charges (lease_id, period, due_date, amount, notes) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(lease_id, period) DO NOTHING`,
    [d.lease_id, d.period, d.due_date, d.amount ?? 0, d.notes ?? null],
  );
  if (!result.changes) {
    const existing = await get(`${CHARGE_SELECT} WHERE c.lease_id = ? AND c.period = ?`, [d.lease_id, d.period]);
    return c.json({ charge: existing });
  }
  const row = await get(`${CHARGE_SELECT} WHERE c.id = ?`, [result.lastInsertRowid]);
  await logActivity(c, "rent_charge", result.lastInsertRowid, "create", `${d.period} · ${await leaseLabel(d.lease_id) ?? ""}`);
  return c.json({ charge: row }, 201);
});

// Generate (idempotent) charges for a given period across all active leases.
app.post("/api/rent-charges/generate", async (c) => {
  const body = await c.req.json().catch(() => ({})) as { period?: string };
  const period = body.period;
  if (!period || !/^\d{4}-\d{2}$/.test(period)) return c.json({ error: "period (YYYY-MM) required" }, 400);
  const today = requestToday(c);
  const leases = await query<{ id: number; monthly_rent: number; rent_due_day: number; start_date: string; end_date: string }>(
    "SELECT id, monthly_rent, rent_due_day, start_date, end_date FROM leases WHERE status = 'active'",
  );
  let created = 0;
  for (const l of leases) {
    // Skip if the lease doesn't cover this period at all (starts after it or ended before it).
    if (l.start_date.slice(0, 7) > period || l.end_date.slice(0, 7) < period) continue;
    const day = String(Math.min(28, Math.max(1, l.rent_due_day))).padStart(2, "0");
    const dueDate = `${period}-${day}`;
    const r = await run(
      `INSERT INTO rent_charges (lease_id, period, due_date, amount) VALUES (?, ?, ?, ?)
         ON CONFLICT(lease_id, period) DO NOTHING`,
      [l.id, period, dueDate, l.monthly_rent],
    );
    if (r.changes) created++;
  }
  // Re-mark anything past due as 'overdue'.
  await run(
    `UPDATE rent_charges SET status = 'overdue'
     WHERE status IN ('open', 'partial') AND amount_paid < amount AND due_date < ?`,
    [today],
  );
  await logActivity(c, "rent_charge", null, "generate", `${period}: ${created} created`);
  return c.json({ created, period });
});

app.put("/api/rent-charges/:id", async (c) => {
  const id = intParam(c.req.param("id"));
  if (!id) return c.json({ error: "Invalid ID" }, 400);
  const Patch = z.object({
    amount: z.number().min(0).optional(),
    due_date: z.string().optional(),
    status: z.enum(["open", "partial", "paid", "overdue", "waived"]).optional(),
    notes: z.string().optional().nullable(),
  });
  const parsed = await parseJson(c, Patch);
  if (!parsed.ok) return c.json({ error: parsed.error }, 400);
  const { sets, params } = buildUpdate(parsed.data);
  if (!sets.length) return c.json({ error: "No fields" }, 400);
  params.push(id);
  const before = await get<Record<string, unknown>>("SELECT * FROM rent_charges WHERE id = ?", [id]);
  const r = await run(`UPDATE rent_charges SET ${sets.join(", ")} WHERE id = ?`, params);
  if (!r.changes) return c.json({ error: "Not found" }, 404);
  await logActivity(c, "rent_charge", id, "update", before?.period as string | undefined, diff(before, parsed.data));
  const row = await get(`${CHARGE_SELECT} WHERE c.id = ?`, [id]);
  return c.json({ charge: row });
});

app.delete("/api/rent-charges/:id", async (c) => {
  const id = intParam(c.req.param("id"));
  if (!id) return c.json({ error: "Invalid ID" }, 400);
  const before = await get<Record<string, unknown>>("SELECT * FROM rent_charges WHERE id = ?", [id]);
  const r = await run("DELETE FROM rent_charges WHERE id = ?", [id]);
  if (!r.changes) return c.json({ error: "Not found" }, 404);
  await logActivity(c, "rent_charge", id, "delete", before?.period as string | undefined);
  return c.json({ ok: true });
});

const PaymentInput = z.object({
  charge_id: z.number().int(),
  paid_at: z.string().optional(),
  amount: z.number().min(0),
  method: z.enum(["cash", "check", "ach", "credit", "other"]).optional(),
  reference: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

// Recompute a charge's amount_paid and status from its payments. An unpaid balance past
// its due date stays 'overdue', matching how /api/rent-charges/generate marks charges.
async function recomputeCharge(chargeId: number, today: string) {
  const paid = "(SELECT COALESCE(SUM(amount), 0) FROM payments WHERE charge_id = rent_charges.id)";
  await run(
    `UPDATE rent_charges SET
       amount_paid = ${paid},
       status = CASE
         WHEN ${paid} >= amount THEN 'paid'
         WHEN due_date < ? THEN 'overdue'
         WHEN ${paid} > 0 THEN 'partial'
         ELSE 'open' END
     WHERE id = ?`,
    [today, chargeId],
  );
}

app.get("/api/rent-charges/:id/payments", async (c) => {
  const id = intParam(c.req.param("id"));
  if (!id) return c.json({ error: "Invalid ID" }, 400);
  const rows = await query("SELECT * FROM payments WHERE charge_id = ? ORDER BY paid_at DESC", [id]);
  return c.json({ payments: rows });
});

app.post("/api/payments", async (c) => {
  const parsed = await parseJson(c, PaymentInput);
  if (!parsed.ok) return c.json({ error: parsed.error }, 400);
  const d = parsed.data;
  const charge = await get("SELECT id FROM rent_charges WHERE id = ?", [d.charge_id]);
  if (!charge) return c.json({ error: "Charge not found" }, 404);
  await run(
    `INSERT INTO payments (charge_id, paid_at, amount, method, reference, notes)
     VALUES (?, COALESCE(?, datetime('now')), ?, ?, ?, ?)`,
    [d.charge_id, d.paid_at ?? null, d.amount, d.method ?? "cash", d.reference ?? null, d.notes ?? null],
  );
  await recomputeCharge(d.charge_id, requestToday(c));
  await logActivity(c, "rent_charge", d.charge_id, "payment", `${d.amount} ${d.method ?? "cash"}`);
  const updated = await get(`${CHARGE_SELECT} WHERE c.id = ?`, [d.charge_id]);
  return c.json({ charge: updated }, 201);
});

app.delete("/api/payments/:id", async (c) => {
  const id = intParam(c.req.param("id"));
  if (!id) return c.json({ error: "Invalid ID" }, 400);
  const row = await get<{ charge_id: number; amount: number; method: string }>("SELECT charge_id, amount, method FROM payments WHERE id = ?", [id]);
  if (!row) return c.json({ error: "Not found" }, 404);
  await run("DELETE FROM payments WHERE id = ?", [id]);
  await recomputeCharge(row.charge_id, requestToday(c));
  await logActivity(c, "rent_charge", row.charge_id, "payment_delete", `${row.amount} ${row.method}`);
  return c.json({ ok: true });
});

// ── Vendors ────────────────────────────────────────────────────────

const VendorInput = z.object({
  name: z.string().min(1),
  category: z.enum(["plumber", "electrician", "hvac", "handyman", "cleaning", "landscaping", "general"]).optional(),
  phone: z.string().optional().nullable(),
  email: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  color: z.string().optional(),
});

app.get("/api/vendors", async (c) => {
  const rows = await query("SELECT * FROM vendors ORDER BY name");
  return c.json({ vendors: rows });
});

app.post("/api/vendors", async (c) => {
  const parsed = await parseJson(c, VendorInput);
  if (!parsed.ok) return c.json({ error: parsed.error }, 400);
  const d = parsed.data;
  const result = await run(
    "INSERT INTO vendors (name, category, phone, email, notes, color) VALUES (?, ?, ?, ?, ?, ?)",
    [d.name, d.category ?? "general", d.phone ?? null, d.email ?? null, d.notes ?? null, d.color ?? "slate"],
  );
  const row = await get("SELECT * FROM vendors WHERE id = ?", [result.lastInsertRowid]);
  await logActivity(c, "vendor", result.lastInsertRowid, "create", d.name);
  return c.json({ vendor: row }, 201);
});

app.put("/api/vendors/:id", async (c) => {
  const id = intParam(c.req.param("id"));
  if (!id) return c.json({ error: "Invalid ID" }, 400);
  const parsed = await parseJson(c, VendorInput.partial());
  if (!parsed.ok) return c.json({ error: parsed.error }, 400);
  const { sets, params } = buildUpdate(parsed.data);
  if (!sets.length) return c.json({ error: "No fields" }, 400);
  params.push(id);
  const before = await get<Record<string, unknown>>("SELECT * FROM vendors WHERE id = ?", [id]);
  const r = await run(`UPDATE vendors SET ${sets.join(", ")} WHERE id = ?`, params);
  if (!r.changes) return c.json({ error: "Not found" }, 404);
  await logActivity(c, "vendor", id, "update", before?.name as string | undefined, diff(before, parsed.data));
  const row = await get("SELECT * FROM vendors WHERE id = ?", [id]);
  return c.json({ vendor: row });
});

app.delete("/api/vendors/:id", async (c) => {
  const id = intParam(c.req.param("id"));
  if (!id) return c.json({ error: "Invalid ID" }, 400);
  if (await get("SELECT 1 FROM bills WHERE vendor_id = ?", [id])) {
    return c.json({ error: "This vendor has bills. Its financial records are kept, so it can't be deleted" }, 409);
  }
  const before = await get<Record<string, unknown>>("SELECT name FROM vendors WHERE id = ?", [id]);
  const r = await run("DELETE FROM vendors WHERE id = ?", [id]);
  if (!r.changes) return c.json({ error: "Not found" }, 404);
  await logActivity(c, "vendor", id, "delete", before?.name as string | undefined);
  return c.json({ ok: true });
});

// ── Work orders ────────────────────────────────────────────────────

const WorkOrderInput = z.object({
  property_id: z.number().int().nullable().optional(),
  unit_id: z.number().int().nullable().optional(),
  tenant_id: z.number().int().nullable().optional(),
  vendor_id: z.number().int().nullable().optional(),
  title: z.string().min(1),
  description: z.string().optional().nullable(),
  priority: z.enum(["low", "normal", "high", "urgent"]).optional(),
  status: z.enum(["open", "assigned", "in_progress", "completed", "cancelled"]).optional(),
  scheduled_at: z.string().optional().nullable(),
  completed_at: z.string().optional().nullable(),
  cost: z.number().min(0).optional().nullable(),
  estimated_cost: z.number().min(0).optional().nullable(),
  notes: z.string().optional().nullable(),
});

// Statuses that require approval first when a work order is above the threshold.
const APPROVAL_GATED = ["in_progress", "completed"];

/** settings.maintenance_approval_threshold; null when unset or <= 0 (approval disabled). */
async function approvalThreshold(): Promise<number | null> {
  const row = await get<{ value: string }>("SELECT value FROM settings WHERE key = 'maintenance_approval_threshold'");
  const n = parseFloat(row?.value ?? "");
  return Number.isFinite(n) && n > 0 ? n : null;
}

const approvalFor = (estimate: number | null | undefined, threshold: number | null) =>
  threshold != null && estimate != null && estimate > threshold ? "pending" : null;

const WO_SELECT = `
  SELECT w.*,
    p.name as property_name, p.color as property_color,
    u.name as unit_name,
    t.first_name as tenant_first_name, t.last_name as tenant_last_name, t.phone as tenant_phone,
    v.name as vendor_name, v.color as vendor_color,
    (SELECT bl.bill_id FROM bill_lines bl WHERE bl.work_order_id = w.id) as bill_id
  FROM work_orders w
  LEFT JOIN properties p ON p.id = w.property_id
  LEFT JOIN units u ON u.id = w.unit_id
  LEFT JOIN tenants t ON t.id = w.tenant_id
  LEFT JOIN vendors v ON v.id = w.vendor_id
`;

app.get("/api/work-orders", async (c) => {
  const status = c.req.query("status");
  const propertyId = intParam(c.req.query("property_id"));
  const where: string[] = [];
  const params: unknown[] = [];
  if (status) { where.push("w.status = ?"); params.push(status); }
  if (propertyId) { where.push("w.property_id = ?"); params.push(propertyId); }
  const sql = `${WO_SELECT}${where.length ? " WHERE " + where.join(" AND ") : ""} ORDER BY
    CASE w.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END,
    w.created_at DESC`;
  const rows = await query(sql, params);
  return c.json({ work_orders: rows });
});

app.post("/api/work-orders", async (c) => {
  const parsed = await parseJson(c, WorkOrderInput);
  if (!parsed.ok) return c.json({ error: parsed.error }, 400);
  const d = parsed.data;
  const status = d.status ?? "open";
  const approval = approvalFor(d.estimated_cost, await approvalThreshold());
  if (approval && APPROVAL_GATED.includes(status)) {
    return c.json({ error: "This work order needs approval before it can be in progress or completed. Save it as open or assigned, then approve it." }, 400);
  }
  const completedAt = d.completed_at ?? (status === "completed" ? new Date().toISOString().slice(0, 10) : null);
  const result = await run(
    `INSERT INTO work_orders (property_id, unit_id, tenant_id, vendor_id, title, description, priority, status, scheduled_at, completed_at, cost, estimated_cost, approval_status, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      d.property_id ?? null, d.unit_id ?? null, d.tenant_id ?? null, d.vendor_id ?? null,
      d.title, d.description ?? null,
      d.priority ?? "normal", status,
      d.scheduled_at ?? null, completedAt,
      d.cost ?? null, d.estimated_cost ?? null, approval, d.notes ?? null,
    ],
  );
  const row = await get(`${WO_SELECT} WHERE w.id = ?`, [result.lastInsertRowid]);
  await logActivity(c, "work_order", result.lastInsertRowid, "create", d.title);
  return c.json({ work_order: row }, 201);
});

app.put("/api/work-orders/:id", async (c) => {
  const id = intParam(c.req.param("id"));
  if (!id) return c.json({ error: "Invalid ID" }, 400);
  const parsed = await parseJson(c, WorkOrderInput.partial());
  if (!parsed.ok) return c.json({ error: parsed.error }, 400);
  const existing = await get<{ status: string; estimated_cost: number | null; approval_status: string | null } & Record<string, unknown>>(
    "SELECT * FROM work_orders WHERE id = ?",
    [id],
  );
  if (!existing) return c.json({ error: "Not found" }, 404);
  const patch: Record<string, unknown> = { ...parsed.data };

  // A changed estimate re-evaluates approval (and drops any earlier decision).
  let approval = existing.approval_status;
  if (parsed.data.estimated_cost !== undefined && parsed.data.estimated_cost !== existing.estimated_cost) {
    approval = approvalFor(parsed.data.estimated_cost, await approvalThreshold());
    patch.approval_status = approval;
    patch.approved_at = null;
  }

  const nextStatus = parsed.data.status;
  const statusChanging = nextStatus !== undefined && nextStatus !== existing.status;
  if (statusChanging && APPROVAL_GATED.includes(nextStatus) && (approval === "pending" || approval === "rejected")) {
    return c.json({
      error: approval === "rejected"
        ? "This work order's approval was rejected, so it can't be in progress or completed."
        : "This work order needs approval before it can be in progress or completed.",
    }, 400);
  }
  if (statusChanging && parsed.data.completed_at === undefined) {
    if (nextStatus === "completed") patch.completed_at = new Date().toISOString().slice(0, 10);
    else if (existing.status === "completed") patch.completed_at = null;
  }

  const { sets, params } = buildUpdate(patch);
  if (!sets.length) return c.json({ error: "No fields" }, 400);
  params.push(id);
  const r = await run(`UPDATE work_orders SET ${sets.join(", ")} WHERE id = ?`, params);
  if (!r.changes) return c.json({ error: "Not found" }, 404);
  await logActivity(c, "work_order", id, "update", existing.title as string, diff(existing, patch));
  const row = await get(`${WO_SELECT} WHERE w.id = ?`, [id]);
  return c.json({ work_order: row });
});

app.delete("/api/work-orders/:id", async (c) => {
  const id = intParam(c.req.param("id"));
  if (!id) return c.json({ error: "Invalid ID" }, 400);
  if (await hasDocuments("work_order", id)) return c.json({ error: HAS_DOCUMENTS }, 409);
  const before = await get<Record<string, unknown>>("SELECT title FROM work_orders WHERE id = ?", [id]);
  const r = await run("DELETE FROM work_orders WHERE id = ?", [id]);
  if (!r.changes) return c.json({ error: "Not found" }, 404);
  await logActivity(c, "work_order", id, "delete", before?.title as string | undefined);
  return c.json({ ok: true });
});

app.post("/api/work-orders/:id/approval", async (c) => {
  const id = intParam(c.req.param("id"));
  if (!id) return c.json({ error: "Invalid ID" }, 400);
  const parsed = await parseJson(c, z.object({ decision: z.enum(["approved", "rejected"]) }));
  if (!parsed.ok) return c.json({ error: parsed.error }, 400);
  const existing = await get<{ approval_status: string | null; title: string }>("SELECT approval_status, title FROM work_orders WHERE id = ?", [id]);
  if (!existing) return c.json({ error: "Not found" }, 404);
  if (!existing.approval_status) return c.json({ error: "This work order doesn't require approval" }, 409);
  const approved = parsed.data.decision === "approved";
  await run(
    `UPDATE work_orders SET approval_status = ?, approved_at = ${approved ? "datetime('now')" : "NULL"} WHERE id = ?`,
    [parsed.data.decision, id],
  );
  await logActivity(c, "work_order", id, approved ? "approve" : "reject", existing.title);
  const row = await get(`${WO_SELECT} WHERE w.id = ?`, [id]);
  return c.json({ work_order: row });
});

// ── Recurring tasks (preventive maintenance) ───────────────────────

// Look-ahead for generation: occurrences up to this many days out become work orders.
const GENERATE_HORIZON_DAYS = 14;
// Safety bound on occurrence stepping per template; stepping starts near the anchor date.
const MAX_OCCURRENCE_STEPS = 5_000;
// Calendar date with a real month/day range (isCalendarDate also rejects e.g. Feb 31).
const STRICT_DATE_RE = /^2\d{3}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
// Date.UTC rolls 2026-02-31 over to March, so a round trip catches days the month doesn't have.
function isCalendarDate(s: string): boolean {
  return STRICT_DATE_RE.test(s) && new Date(`${s}T00:00:00Z`).toISOString().startsWith(s);
}
// The client sends its local date; allow the timezone gap, reject a skewed clock.
const MAX_CLIENT_DAY_SKEW = 1;

const RecurringTaskInput = z.object({
  property_id: z.number().int(),
  unit_id: z.number().int().nullable().optional(),
  vendor_id: z.number().int().nullable().optional(),
  title: z.string().trim().min(1),
  description: z.string().optional().nullable(),
  priority: z.enum(["low", "normal", "high", "urgent"]).optional(),
  estimated_cost: z.number().min(0).optional().nullable(),
  interval_unit: z.enum(["week", "month"]),
  interval_count: z.number().int().min(1).max(24),
  start_date: z.string().regex(STRICT_DATE_RE),
  active: z.boolean().optional(),
});

type RecurringTask = {
  id: number; property_id: number; unit_id: number | null; vendor_id: number | null;
  title: string; description: string | null; priority: string; estimated_cost: number | null;
  interval_unit: "week" | "month"; interval_count: number; start_date: string;
  last_generated_through: string | null; active: number;
};

const isoDay = (d: Date) => d.toISOString().slice(0, 10);

/**
 * The k-th occurrence (k = 0 is start_date). Months are measured from the start date and
 * clamp to month end, so a Jan 31 start gives Feb 28/29, then Mar 31 (not Mar 28).
 */
function occurrence(start: string, unit: "week" | "month", count: number, k: number): string {
  const [y, m, d] = start.split("-").map(Number);
  if (unit === "week") return isoDay(new Date(Date.UTC(y, m - 1, d + 7 * count * k)));
  const months = m - 1 + count * k;
  const year = y + Math.floor(months / 12);
  const month = months % 12;
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return isoDay(new Date(Date.UTC(year, month, Math.min(d, lastDay))));
}

/** An occurrence index at or just before `date`, so loops start near it rather than at k = 0. */
function kNear(t: RecurringTask, date: string): number {
  const [sy, sm, sd] = t.start_date.split("-").map(Number);
  const [y, m, d] = date.split("-").map(Number);
  const k = t.interval_unit === "week"
    ? Math.floor((Date.UTC(y, m - 1, d) - Date.UTC(sy, sm - 1, sd)) / (86_400_000 * 7 * t.interval_count))
    : Math.floor(((y - sy) * 12 + (m - sm)) / t.interval_count);
  return Math.max(0, k - 1);
}

/**
 * Occurrences to generate for a template: those after its high-water mark up to `horizon`.
 * A template's first generation doesn't backfill past dates. After that, of the occurrences
 * already in the past only the latest is kept, so a missed stretch yields one overdue work
 * order rather than a backlog.
 */
function dueOccurrences(t: RecurringTask, today: string, horizon: string): string[] {
  const out: string[] = [];
  let lastPast: string | null = null;
  const k0 = kNear(t, t.last_generated_through ?? today);
  for (let k = k0; k < k0 + MAX_OCCURRENCE_STEPS; k++) {
    const occ = occurrence(t.start_date, t.interval_unit, t.interval_count, k);
    if (occ > horizon) break;
    if (t.last_generated_through && occ <= t.last_generated_through) continue;
    if (occ >= today) out.push(occ);
    else if (t.last_generated_through) lastPast = occ;
  }
  return lastPast ? [lastPast, ...out] : out;
}

/**
 * Next occurrence that generation will create, for display: after the high-water mark, or,
 * before the first generation, the first one from today on (past dates aren't backfilled).
 */
function nextOccurrence(t: RecurringTask, today: string): string | null {
  const after = t.last_generated_through;
  const k0 = kNear(t, after ?? today);
  for (let k = k0; k < k0 + MAX_OCCURRENCE_STEPS; k++) {
    const occ = occurrence(t.start_date, t.interval_unit, t.interval_count, k);
    if (after ? occ > after : occ >= today) return occ;
  }
  return null;
}

const RT_SELECT = `
  SELECT r.*, p.name as property_name, u.name as unit_name, v.name as vendor_name
  FROM recurring_tasks r
  LEFT JOIN properties p ON p.id = r.property_id
  LEFT JOIN units u ON u.id = r.unit_id
  LEFT JOIN vendors v ON v.id = r.vendor_id
`;

const withNext = (t: RecurringTask) => ({ ...t, active: !!t.active, next_occurrence: nextOccurrence(t, isoDay(new Date())) });

app.get("/api/recurring-tasks", async (c) => {
  const rows = await query<RecurringTask>(`${RT_SELECT} ORDER BY r.active DESC, p.name, r.title`);
  return c.json({ recurring_tasks: rows.map(withNext) });
});

app.post("/api/recurring-tasks", async (c) => {
  const parsed = await parseJson(c, RecurringTaskInput);
  if (!parsed.ok) return c.json({ error: parsed.error }, 400);
  const d = parsed.data;
  const result = await run(
    `INSERT INTO recurring_tasks (property_id, unit_id, vendor_id, title, description, priority, estimated_cost, interval_unit, interval_count, start_date, active)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      d.property_id, d.unit_id ?? null, d.vendor_id ?? null, d.title, d.description ?? null,
      d.priority ?? "normal", d.estimated_cost ?? null, d.interval_unit, d.interval_count, d.start_date,
      d.active === false ? 0 : 1,
    ],
  );
  await logActivity(c, "recurring_task", result.lastInsertRowid, "create", d.title);
  const row = await get<RecurringTask>(`${RT_SELECT} WHERE r.id = ?`, [result.lastInsertRowid]);
  return c.json({ recurring_task: row && withNext(row) }, 201);
});

app.put("/api/recurring-tasks/:id", async (c) => {
  const id = intParam(c.req.param("id"));
  if (!id) return c.json({ error: "Invalid ID" }, 400);
  const parsed = await parseJson(c, RecurringTaskInput.partial());
  if (!parsed.ok) return c.json({ error: parsed.error }, 400);
  const { active, ...rest } = parsed.data;
  const { sets, params } = buildUpdate({ ...rest, active: active === undefined ? undefined : active ? 1 : 0 });
  if (!sets.length) return c.json({ error: "No fields" }, 400);
  params.push(id);
  const before = await get<Record<string, unknown>>("SELECT * FROM recurring_tasks WHERE id = ?", [id]);
  const r = await run(`UPDATE recurring_tasks SET ${sets.join(", ")} WHERE id = ?`, params);
  if (!r.changes) return c.json({ error: "Not found" }, 404);
  await logActivity(c, "recurring_task", id, "update", before?.title as string | undefined, diff(before, { ...rest, active }));
  const row = await get<RecurringTask>(`${RT_SELECT} WHERE r.id = ?`, [id]);
  return c.json({ recurring_task: row && withNext(row) });
});

app.delete("/api/recurring-tasks/:id", async (c) => {
  const id = intParam(c.req.param("id"));
  if (!id) return c.json({ error: "Invalid ID" }, 400);
  // Generated work orders are kept; their recurring_task_id is set to NULL by the FK.
  const before = await get<Record<string, unknown>>("SELECT title FROM recurring_tasks WHERE id = ?", [id]);
  const r = await run("DELETE FROM recurring_tasks WHERE id = ?", [id]);
  if (!r.changes) return c.json({ error: "Not found" }, 404);
  await logActivity(c, "recurring_task", id, "delete", before?.title as string | undefined);
  return c.json({ ok: true });
});

app.post("/api/recurring-tasks/generate", async (c) => {
  const parsed = await parseJson(c, z.object({ today: z.string().regex(STRICT_DATE_RE).optional() }));
  if (!parsed.ok) return c.json({ error: parsed.error }, 400);
  const serverToday = isoDay(new Date());
  const today = parsed.data.today ?? serverToday;
  const [y, m, d] = today.split("-").map(Number);
  // The high-water mark only moves forward, so a wrong clock here would stall generation.
  const [sy, sm, sd] = serverToday.split("-").map(Number);
  if (Math.abs(Date.UTC(y, m - 1, d) - Date.UTC(sy, sm - 1, sd)) > MAX_CLIENT_DAY_SKEW * 86_400_000) {
    return c.json({ error: "Your device's date looks wrong. Check the date and time settings, then try again." }, 400);
  }
  const horizon = isoDay(new Date(Date.UTC(y, m - 1, d + GENERATE_HORIZON_DAYS)));
  const tasks = await query<RecurringTask>("SELECT * FROM recurring_tasks WHERE active = 1");
  const threshold = await approvalThreshold();
  let created = 0;
  for (const t of tasks) {
    for (const occ of dueOccurrences(t, today, horizon)) {
      // The unique (recurring_task_id, occurrence_date) index makes repeats and races no-ops.
      const r = await run(
        `INSERT INTO work_orders (property_id, unit_id, vendor_id, title, description, priority, status, scheduled_at, estimated_cost, approval_status, recurring_task_id, occurrence_date)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (recurring_task_id, occurrence_date) DO NOTHING`,
        [
          t.property_id, t.unit_id, t.vendor_id, t.title, t.description, t.priority,
          t.vendor_id ? "assigned" : "open", occ, t.estimated_cost, approvalFor(t.estimated_cost, threshold), t.id, occ,
        ],
      );
      created += r.changes ?? 0;
    }
    // High-water mark only moves forward, so deleted or rescheduled work isn't regenerated.
    await run(
      "UPDATE recurring_tasks SET last_generated_through = MAX(COALESCE(last_generated_through, ''), ?) WHERE id = ?",
      [horizon, t.id],
    );
  }
  await logActivity(c, "work_order", null, "generate", `${created} created through ${horizon}`);
  return c.json({ created, through: horizon });
});

// ── Accounts ───────────────────────────────────────────────────────

app.get("/api/accounts", async (c) => {
  const rows = await query("SELECT * FROM gl_accounts WHERE active = 1 ORDER BY code");
  return c.json({ accounts: rows });
});

// ── Bills & payments ───────────────────────────────────────────────
// Integer cents. A bill with live (non-voided) payments is locked (D6); payments are
// voided, never deleted. @clawnify/db has no transactions, so a bill is written with
// complete = 0 and sealed once all its lines exist (D8). Reports count complete bills only.

const amountCents = z.number().int().positive().max(100_000_000_000);

const BillLineInput = z.object({
  account_id: z.number().int(),
  description: z.string().trim().min(1).max(200),
  amount_cents: amountCents,
  unit_id: z.number().int().nullable().optional(),
  work_order_id: z.number().int().nullable().optional(),
});

const BillInput = z.object({
  property_id: z.number().int(),
  vendor_id: z.number().int().nullable().optional(),
  bill_date: z.string().regex(STRICT_DATE_RE),
  due_date: z.string().regex(STRICT_DATE_RE).nullable().optional(),
  reference: z.string().max(100).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
  lines: z.array(BillLineInput).min(1).max(50),
});

const BillPaymentInput = z.object({
  paid_on: z.string().regex(STRICT_DATE_RE),
  amount_cents: amountCents.optional(),
  method: z.enum(["check", "ach", "card", "cash", "other"]),
  reference: z.string().max(100).nullable().optional(),
});

type BillRow = { id: number; complete: number; total_cents: number; paid_cents: number; [k: string]: unknown };
type ChildRow = { bill_id: number; [k: string]: unknown };

const BILL_SELECT = `
  SELECT b.*, p.name AS property_name, p.color AS property_color, v.name AS vendor_name,
    (SELECT COALESCE(SUM(amount_cents), 0) FROM bill_lines WHERE bill_id = b.id) AS total_cents,
    (SELECT COALESCE(SUM(amount_cents), 0) FROM bill_payments WHERE bill_id = b.id AND voided_at IS NULL) AS paid_cents
  FROM bills b
  LEFT JOIN properties p ON p.id = b.property_id
  LEFT JOIN vendors v ON v.id = b.vendor_id`;

/** Bills matching `where` (on alias b) with their lines and payments attached. */
const billLabel = (b: { id: number; reference?: string | null } | undefined) =>
  b?.reference ? `Bill ${b.reference}` : `Bill #${b?.id}`;

async function loadBills(where: string[], params: unknown[]) {
  const w = where.length ? ` WHERE ${where.join(" AND ")}` : "";
  const bills = await query<BillRow>(`${BILL_SELECT}${w} ORDER BY b.bill_date DESC, b.id DESC`, params);
  if (!bills.length) return [];
  // Same filter on the children, so the bound-parameter count stays small.
  const lines = await query<ChildRow>(
    `SELECT l.*, a.code AS account_code, a.name AS account_name, a.type AS account_type, a.is_operating,
       u.name AS unit_name, wo.title AS work_order_title
     FROM bill_lines l JOIN bills b ON b.id = l.bill_id JOIN gl_accounts a ON a.id = l.account_id
     LEFT JOIN units u ON u.id = l.unit_id LEFT JOIN work_orders wo ON wo.id = l.work_order_id${w}
     ORDER BY l.id`,
    params,
  );
  const payments = await query<ChildRow>(
    `SELECT bp.* FROM bill_payments bp JOIN bills b ON b.id = bp.bill_id${w} ORDER BY bp.paid_on, bp.id`,
    params,
  );
  return bills.map((b) => ({
    ...b,
    complete: !!b.complete,
    status: b.total_cents > 0 && b.paid_cents >= b.total_cents ? "paid" : "unpaid",
    lines: lines.filter((l) => l.bill_id === b.id),
    payments: payments.filter((p) => p.bill_id === b.id),
  }));
}

const loadBill = async (id: number) => (await loadBills(["b.id = ?"], [id]))[0];

/** Returns an error message if the bill's references don't line up, else null. */
async function checkBill(d: z.infer<typeof BillInput>, billId: number | null): Promise<{ error: string; status: 400 | 409 } | null> {
  if (!await get("SELECT 1 FROM properties WHERE id = ?", [d.property_id])) return { error: "Property not found", status: 400 };
  if (d.vendor_id != null && !await get("SELECT 1 FROM vendors WHERE id = ?", [d.vendor_id])) return { error: "Vendor not found", status: 400 };
  if (d.due_date && d.due_date < d.bill_date) return { error: "Due date can't be before the bill date", status: 400 };
  const accounts = new Set((await query<{ id: number }>(
    "SELECT id FROM gl_accounts WHERE active = 1 AND type IN ('expense', 'asset')",
  )).map((a) => a.id));
  const units = new Set((await query<{ id: number }>("SELECT id FROM units WHERE property_id = ?", [d.property_id])).map((u) => u.id));
  const seenWorkOrders = new Set<number>();
  for (const l of d.lines) {
    if (!accounts.has(l.account_id)) return { error: "Each line needs an expense or capital account", status: 400 };
    if (l.unit_id != null && !units.has(l.unit_id)) return { error: UNIT_MISMATCH, status: 400 };
    if (l.work_order_id == null) continue;
    if (seenWorkOrders.has(l.work_order_id)) return { error: "A work order can appear on only one line", status: 400 };
    seenWorkOrders.add(l.work_order_id);
    const wo = await get<{ property_id: number | null }>("SELECT property_id FROM work_orders WHERE id = ?", [l.work_order_id]);
    if (!wo || wo.property_id !== d.property_id) return { error: "The work order doesn't belong to the selected property", status: 400 };
    const taken = await get<{ bill_id: number }>("SELECT bill_id FROM bill_lines WHERE work_order_id = ?", [l.work_order_id]);
    if (taken && taken.bill_id !== billId) return { error: "This work order is already on another bill", status: 409 };
  }
  return null;
}

async function insertLines(billId: number, lines: z.infer<typeof BillLineInput>[]) {
  for (const l of lines) {
    await run(
      "INSERT INTO bill_lines (bill_id, account_id, unit_id, work_order_id, description, amount_cents) VALUES (?, ?, ?, ?, ?, ?)",
      [billId, l.account_id, l.unit_id ?? null, l.work_order_id ?? null, l.description, l.amount_cents],
    );
  }
  await run("UPDATE bills SET complete = 1 WHERE id = ?", [billId]);
}

const UNIT_MISMATCH = "The unit doesn't belong to the selected property";
const BILL_LOCKED = "This bill has payments. Void them to edit it";

app.get("/api/bills", async (c) => {
  const where: string[] = [];
  const params: unknown[] = [];
  for (const key of ["property_id", "vendor_id"] as const) {
    const raw = c.req.query(key);
    if (raw === undefined) continue;
    const n = intParam(raw);
    if (!n) return c.json({ error: `Invalid ${key}` }, 400);
    where.push(`b.${key} = ?`); params.push(n);
  }
  const accountRaw = c.req.query("account_id");
  if (accountRaw !== undefined) {
    const n = intParam(accountRaw);
    if (!n) return c.json({ error: "Invalid account_id" }, 400);
    where.push("EXISTS (SELECT 1 FROM bill_lines WHERE bill_id = b.id AND account_id = ?)"); params.push(n);
  }
  const status = c.req.query("status");
  if (status && status !== "unpaid" && status !== "paid") return c.json({ error: "Invalid status" }, 400);
  const from = c.req.query("from");
  const to = c.req.query("to");
  if ((from && !STRICT_DATE_RE.test(from)) || (to && !STRICT_DATE_RE.test(to))) {
    return c.json({ error: "from/to must be 'YYYY-MM-DD'" }, 400);
  }
  if (from && to && (from > to || monthIndex(to.slice(0, 7)) - monthIndex(from.slice(0, 7)) >= MAX_REPORT_MONTHS)) {
    return c.json({ error: `from must be on or before to, spanning at most ${MAX_REPORT_MONTHS} months` }, 400);
  }
  if (from) { where.push("b.bill_date >= ?"); params.push(from); }
  if (to) { where.push("b.bill_date <= ?"); params.push(to); }
  let bills = await loadBills(where, params);
  if (status) bills = bills.filter((b) => b.complete && b.status === status);
  return c.json({ bills });
});

app.post("/api/bills", async (c) => {
  const parsed = await parseJson(c, BillInput);
  if (!parsed.ok) return c.json({ error: parsed.error }, 400);
  const d = parsed.data;
  const bad = await checkBill(d, null);
  if (bad) return c.json({ error: bad.error }, bad.status);
  const result = await run(
    "INSERT INTO bills (property_id, vendor_id, bill_date, due_date, reference, notes, complete) VALUES (?, ?, ?, ?, ?, ?, 0)",
    [d.property_id, d.vendor_id ?? null, d.bill_date, d.due_date ?? null, d.reference ?? null, d.notes ?? null],
  );
  const id = Number(result.lastInsertRowid);
  await insertLines(id, d.lines);
  const bill = await loadBill(id);
  await logActivity(c, "bill", id, "create", billLabel(bill), bill ? { total_cents: [null, bill.total_cents] } : undefined);
  return c.json({ bill }, 201);
});

// Full replace of header and lines.
app.put("/api/bills/:id", async (c) => {
  const id = intParam(c.req.param("id"));
  if (!id) return c.json({ error: "Invalid ID" }, 400);
  const parsed = await parseJson(c, BillInput);
  if (!parsed.ok) return c.json({ error: parsed.error }, 400);
  if (!await get("SELECT 1 FROM bills WHERE id = ?", [id])) return c.json({ error: "Not found" }, 404);
  if (await get("SELECT 1 FROM bill_payments WHERE bill_id = ? AND voided_at IS NULL", [id])) {
    return c.json({ error: BILL_LOCKED }, 409);
  }
  const d = parsed.data;
  const prior = await loadBill(id);
  const bad = await checkBill(d, id);
  if (bad) return c.json({ error: bad.error }, bad.status);
  // ponytail: payment check and rewrite aren't atomic; a payment landing mid-edit is possible but single-user.
  await run(
    "UPDATE bills SET property_id = ?, vendor_id = ?, bill_date = ?, due_date = ?, reference = ?, notes = ?, complete = 0 WHERE id = ?",
    [d.property_id, d.vendor_id ?? null, d.bill_date, d.due_date ?? null, d.reference ?? null, d.notes ?? null, id],
  );
  await run("DELETE FROM bill_lines WHERE bill_id = ?", [id]);
  await insertLines(id, d.lines);
  const bill = await loadBill(id);
  const changes = diff(prior as unknown as Record<string, unknown>, {
    property_id: d.property_id, vendor_id: d.vendor_id ?? null, bill_date: d.bill_date,
    due_date: d.due_date ?? null, reference: d.reference ?? null, notes: d.notes ?? null,
  });
  if (prior?.total_cents !== bill?.total_cents) changes.total_cents = [prior?.total_cents ?? null, bill?.total_cents ?? null];
  await logActivity(c, "bill", id, "update", billLabel(bill), changes);
  return c.json({ bill });
});

app.delete("/api/bills/:id", async (c) => {
  const id = intParam(c.req.param("id"));
  if (!id) return c.json({ error: "Invalid ID" }, 400);
  if (await hasDocuments("bill", id)) return c.json({ error: HAS_DOCUMENTS }, 409);
  // Voided payments count too: payment history is never deleted.
  if (await get("SELECT 1 FROM bill_payments WHERE bill_id = ?", [id])) {
    return c.json({ error: "This bill has payment records, so it can't be deleted" }, 409);
  }
  const before = await get<Record<string, unknown>>("SELECT id, reference FROM bills WHERE id = ?", [id]);
  const r = await run("DELETE FROM bills WHERE id = ?", [id]);
  if (!r.changes) return c.json({ error: "Not found" }, 404);
  await logActivity(c, "bill", id, "delete", billLabel(before as { id: number; reference: string | null }));
  return c.json({ ok: true });
});

app.post("/api/bills/:id/payments", async (c) => {
  const id = intParam(c.req.param("id"));
  if (!id) return c.json({ error: "Invalid ID" }, 400);
  const parsed = await parseJson(c, BillPaymentInput);
  if (!parsed.ok) return c.json({ error: parsed.error }, 400);
  const bill = await loadBill(id);
  if (!bill) return c.json({ error: "Not found" }, 404);
  if (!bill.complete) return c.json({ error: "Save the bill again before paying it" }, 409);
  const balance = bill.total_cents - bill.paid_cents;
  if (balance <= 0) return c.json({ error: "This bill is already paid" }, 409);
  const d = parsed.data;
  const amount = d.amount_cents ?? balance;
  if (amount > balance) return c.json({ error: "Payment is more than the unpaid balance" }, 400);
  // ponytail: balance check then insert isn't atomic; two simultaneous payments could overpay. Single-user app.
  await run(
    "INSERT INTO bill_payments (bill_id, paid_on, amount_cents, method, reference) VALUES (?, ?, ?, ?, ?)",
    [id, d.paid_on, amount, d.method, d.reference ?? null],
  );
  await logActivity(c, "bill", id, "payment", `${amount} cents ${d.method}`);
  return c.json({ bill: await loadBill(id) }, 201);
});

app.post("/api/bill-payments/:id/void", async (c) => {
  const id = intParam(c.req.param("id"));
  if (!id) return c.json({ error: "Invalid ID" }, 400);
  const payment = await get<{ bill_id: number; voided_at: string | null; amount_cents: number }>("SELECT bill_id, voided_at, amount_cents FROM bill_payments WHERE id = ?", [id]);
  if (!payment) return c.json({ error: "Not found" }, 404);
  if (payment.voided_at) return c.json({ error: "Payment is already voided" }, 409);
  await run("UPDATE bill_payments SET voided_at = datetime('now') WHERE id = ?", [id]);
  await logActivity(c, "bill", payment.bill_id, "void", `${payment.amount_cents} cents`);
  return c.json({ bill: await loadBill(payment.bill_id) });
});

// ── Applications ───────────────────────────────────────────────────

const ApplicationInput = z.object({
  unit_id: z.number().int().nullable().optional(),
  first_name: z.string().min(1),
  last_name: z.string().min(1),
  email: z.string().optional().nullable(),
  phone: z.string().optional().nullable(),
  monthly_income: z.number().optional().nullable(),
  employer: z.string().optional().nullable(),
  desired_move_in: z.string().optional().nullable(),
  follow_up_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  status: z.enum(["new", "screening", "approved", "declined", "withdrawn"]).optional(),
  notes: z.string().optional().nullable(),
});

app.get("/api/applications", async (c) => {
  const status = c.req.query("status");
  const search = c.req.query("q")?.trim();
  const where: string[] = [];
  const params: unknown[] = [];
  if (status) { where.push("a.status = ?"); params.push(status); }
  if (search) {
    const like = `%${search}%`;
    where.push("(a.first_name LIKE ? OR a.last_name LIKE ? OR a.email LIKE ? OR a.phone LIKE ?)");
    params.push(like, like, like, like);
  }
  const rows = await query(
    `SELECT a.*, u.name as unit_name, u.property_id as property_id, p.name as property_name
     FROM applications a
     LEFT JOIN units u ON u.id = a.unit_id
     LEFT JOIN properties p ON p.id = u.property_id
     ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
     ORDER BY a.created_at DESC`,
    params,
  );
  return c.json({ applications: rows });
});

app.post("/api/applications", async (c) => {
  const parsed = await parseJson(c, ApplicationInput);
  if (!parsed.ok) return c.json({ error: parsed.error }, 400);
  const d = parsed.data;
  const result = await run(
    `INSERT INTO applications (unit_id, first_name, last_name, email, phone, monthly_income, employer, desired_move_in, follow_up_date, status, notes, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
    [
      d.unit_id ?? null, d.first_name, d.last_name,
      d.email ?? null, d.phone ?? null, d.monthly_income ?? null, d.employer ?? null,
      d.desired_move_in ?? null, d.follow_up_date ?? null, d.status ?? "new", d.notes ?? null,
    ],
  );
  const row = await get(
    `SELECT a.*, u.name as unit_name, u.property_id as property_id, p.name as property_name
     FROM applications a LEFT JOIN units u ON u.id = a.unit_id LEFT JOIN properties p ON p.id = u.property_id
     WHERE a.id = ?`,
    [result.lastInsertRowid],
  );
  await logActivity(c, "application", result.lastInsertRowid, "create", `${d.first_name} ${d.last_name}`);
  return c.json({ application: row }, 201);
});

app.put("/api/applications/:id", async (c) => {
  const id = intParam(c.req.param("id"));
  if (!id) return c.json({ error: "Invalid ID" }, 400);
  const parsed = await parseJson(c, ApplicationInput.partial());
  if (!parsed.ok) return c.json({ error: parsed.error }, 400);
  const { sets, params } = buildUpdate(parsed.data);
  if (!sets.length) return c.json({ error: "No fields" }, 400);
  sets.push("updated_at = datetime('now')");
  params.push(id);
  const before = await get<Record<string, unknown>>("SELECT * FROM applications WHERE id = ?", [id]);
  const r = await run(`UPDATE applications SET ${sets.join(", ")} WHERE id = ?`, params);
  if (!r.changes) return c.json({ error: "Not found" }, 404);
  await logActivity(c, "application", id, "update", fullName(before), diff(before, parsed.data));
  const row = await get(
    `SELECT a.*, u.name as unit_name, u.property_id as property_id, p.name as property_name
     FROM applications a LEFT JOIN units u ON u.id = a.unit_id LEFT JOIN properties p ON p.id = u.property_id
     WHERE a.id = ?`,
    [id],
  );
  return c.json({ application: row });
});

app.delete("/api/applications/:id", async (c) => {
  const id = intParam(c.req.param("id"));
  if (!id) return c.json({ error: "Invalid ID" }, 400);
  const before = await get<Record<string, unknown>>("SELECT first_name, last_name FROM applications WHERE id = ?", [id]);
  const r = await run("DELETE FROM applications WHERE id = ?", [id]);
  if (!r.changes) return c.json({ error: "Not found" }, 404);
  await logActivity(c, "application", id, "delete", fullName(before));
  return c.json({ ok: true });
});

// ── Dashboard summary ──────────────────────────────────────────────

// SQL date for the end of the lease-renewal window (settings.renewal_notice_days, default 60).
// Takes the reference date as a bound parameter.
const RENEWAL_WINDOW_END =
  "date(?, '+' || COALESCE((SELECT CAST(value AS INTEGER) FROM settings WHERE key = 'renewal_notice_days'), 60) || ' days')";

// Fixed "upcoming" window for rent and maintenance alerts (spec D3).
const DUE_SOON_DAYS = 7;

type AttentionCharge = {
  id: number; period: string; due_date: string; balance: number;
  unit_name: string | null; property_name: string | null;
  tenant_first_name: string | null; tenant_last_name: string | null;
};
// Same balance condition as the overdue total and the delinquency report.
const ATTENTION_CHARGE_SQL = `SELECT rc.id, rc.period, rc.due_date, (rc.amount - rc.amount_paid) as balance,
    u.name as unit_name, p.name as property_name,
    t.first_name as tenant_first_name, t.last_name as tenant_last_name
  FROM rent_charges rc
  JOIN leases l ON l.id = rc.lease_id
  LEFT JOIN units u ON u.id = l.unit_id
  LEFT JOIN properties p ON p.id = u.property_id
  LEFT JOIN tenants t ON t.id = l.primary_tenant_id
  WHERE rc.status != 'waived' AND rc.amount_paid < rc.amount`;

type AttentionWorkOrder = {
  id: number; title: string; priority: string; status: string; scheduled_at: string;
  property_name: string | null; unit_name: string | null;
};
const ATTENTION_WORK_ORDER_SQL = `SELECT w.id, w.title, w.priority, w.status, w.scheduled_at,
    p.name as property_name, u.name as unit_name
  FROM work_orders w
  LEFT JOIN properties p ON p.id = w.property_id
  LEFT JOIN units u ON u.id = w.unit_id
  WHERE w.status NOT IN ('completed', 'cancelled')`;

app.get("/api/dashboard/summary", async (c) => {
  const localToday = requestToday(c);
  const periodNow = localToday.slice(0, 7);
  const month = monthBounds(periodNow);
  const occupiedNow = unitOccupied(month.from, month.to, localToday);
  // Vacant now (D5): no lease covering today; unavailable units aren't for rent.
  const occupiedToday = unitOccupied(localToday, localToday, localToday);

  const safeGet = <T,>(sql: string, params: unknown[] = [], fallback: T) =>
    get<T>(sql, params).catch(() => fallback as T | undefined).then((v) => v ?? fallback);
  const safeQuery = <T,>(sql: string, params: unknown[] = []): Promise<T[]> =>
    query<T>(sql, params).catch(() => [] as T[]);

  const [
    propertyCount,
    unitCount,
    occupiedCount,
    vacantCount,
    activeLeases,
    upcomingMoveOuts,
    monthOutstanding,
    monthCollected,
    overdueRow,
    openWorkOrders,
    urgentWorkOrders,
    upcomingExpirations,
    followupsDue,
    expiredLeases,
    renewalSetting,
    overdueWorkOrders,
    overdueCharges,
    dueSoonCharges,
    dueSoonRow,
    overdueWorkOrdersList,
    scheduledWorkOrders,
    scheduledRow,
    vacantUnits,
    leaseCounts,
  ] = await Promise.all([
    safeGet<{ n: number }>("SELECT COUNT(*) as n FROM properties", [], { n: 0 }),
    safeGet<{ n: number }>("SELECT COUNT(*) as n FROM units", [], { n: 0 }),
    safeGet<{ n: number }>(`SELECT COUNT(*) as n FROM units u WHERE ${occupiedNow.sql}`, occupiedNow.params, { n: 0 }),
    safeGet<{ n: number }>(
      `SELECT COUNT(*) as n FROM units u WHERE u.status != 'unavailable' AND NOT ${occupiedToday.sql}`,
      occupiedToday.params, { n: 0 },
    ),
    safeGet<{ n: number }>("SELECT COUNT(*) as n FROM leases WHERE status = 'active'", [], { n: 0 }),
    safeGet<{ n: number }>(
      "SELECT COUNT(*) as n FROM leases WHERE status = 'active' AND end_date >= ? AND end_date <= date(?, '+30 days')",
      [localToday, localToday], { n: 0 },
    ),
    safeGet<{ total: number }>(
      "SELECT COALESCE(SUM(amount - amount_paid), 0) as total FROM rent_charges WHERE period = ? AND status != 'waived'",
      [periodNow], { total: 0 },
    ),
    safeGet<{ total: number }>(
      "SELECT COALESCE(SUM(amount_paid), 0) as total FROM rent_charges WHERE period = ?",
      [periodNow], { total: 0 },
    ),
    safeGet<{ total: number; n: number }>(
      "SELECT COALESCE(SUM(amount - amount_paid), 0) as total, COUNT(*) as n FROM rent_charges WHERE due_date < ? AND amount_paid < amount AND status != 'waived'",
      [localToday], { total: 0, n: 0 },
    ),
    safeGet<{ n: number }>(
      "SELECT COUNT(*) as n FROM work_orders WHERE status NOT IN ('completed', 'cancelled')",
      [], { n: 0 },
    ),
    safeGet<{ n: number }>(
      "SELECT COUNT(*) as n FROM work_orders WHERE priority = 'urgent' AND status NOT IN ('completed', 'cancelled')",
      [], { n: 0 },
    ),
    safeQuery<{ id: number; end_date: string; tenant_first_name: string | null; tenant_last_name: string | null; unit_name: string | null; property_name: string | null }>(
      `SELECT l.id, l.end_date,
         t.first_name as tenant_first_name, t.last_name as tenant_last_name,
         u.name as unit_name, p.name as property_name
       FROM leases l
       LEFT JOIN tenants t ON t.id = l.primary_tenant_id
       LEFT JOIN units u ON u.id = l.unit_id
       LEFT JOIN properties p ON p.id = u.property_id
       WHERE l.status = 'active' AND l.end_date >= ? AND l.end_date <= ${RENEWAL_WINDOW_END}
       ORDER BY l.end_date ASC LIMIT 6`,
      [localToday, localToday],
    ),
    safeQuery<{ id: number; first_name: string; last_name: string; status: string; follow_up_date: string; unit_name: string | null; property_name: string | null }>(
      `SELECT a.id, a.first_name, a.last_name, a.status, a.follow_up_date,
         u.name as unit_name, p.name as property_name
       FROM applications a
       LEFT JOIN units u ON u.id = a.unit_id
       LEFT JOIN properties p ON p.id = u.property_id
       WHERE a.status IN ('new', 'screening') AND a.follow_up_date <= ?
       ORDER BY a.follow_up_date ASC`,
      [localToday],
    ),
    safeQuery<{ id: number; end_date: string; tenant_first_name: string | null; tenant_last_name: string | null; unit_name: string | null; property_name: string | null }>(
      `SELECT l.id, l.end_date,
         t.first_name as tenant_first_name, t.last_name as tenant_last_name,
         u.name as unit_name, p.name as property_name
       FROM leases l
       LEFT JOIN tenants t ON t.id = l.primary_tenant_id
       LEFT JOIN units u ON u.id = l.unit_id
       LEFT JOIN properties p ON p.id = u.property_id
       WHERE l.status = 'active' AND l.end_date < ?
       ORDER BY l.end_date ASC LIMIT 6`,
      [localToday],
    ),
    safeGet<{ value: string }>("SELECT value FROM settings WHERE key = 'renewal_notice_days'", [], { value: "60" }),
    safeGet<{ n: number }>(
      "SELECT COUNT(*) as n FROM work_orders WHERE status NOT IN ('completed', 'cancelled') AND substr(scheduled_at, 1, 10) < ?",
      [localToday], { n: 0 },
    ),
    // "Needs attention" (Phase 4, spec C): up to 6 rows each, with full counts alongside.
    safeQuery<AttentionCharge>(
      `${ATTENTION_CHARGE_SQL} AND rc.due_date < ? ORDER BY rc.due_date ASC, rc.id LIMIT 6`,
      [localToday],
    ),
    safeQuery<AttentionCharge>(
      `${ATTENTION_CHARGE_SQL} AND rc.due_date >= ? AND rc.due_date <= date(?, '+${DUE_SOON_DAYS} days')
       ORDER BY rc.due_date ASC, rc.id LIMIT 6`,
      [localToday, localToday],
    ),
    safeGet<{ total: number; n: number }>(
      `SELECT COALESCE(SUM(amount - amount_paid), 0) as total, COUNT(*) as n FROM rent_charges
       WHERE status != 'waived' AND amount_paid < amount AND due_date >= ? AND due_date <= date(?, '+${DUE_SOON_DAYS} days')`,
      [localToday, localToday], { total: 0, n: 0 },
    ),
    safeQuery<AttentionWorkOrder>(
      `${ATTENTION_WORK_ORDER_SQL} AND substr(w.scheduled_at, 1, 10) < ? ORDER BY w.scheduled_at ASC, w.id LIMIT 6`,
      [localToday],
    ),
    safeQuery<AttentionWorkOrder>(
      `${ATTENTION_WORK_ORDER_SQL} AND substr(w.scheduled_at, 1, 10) >= ? AND substr(w.scheduled_at, 1, 10) <= date(?, '+${DUE_SOON_DAYS} days')
       ORDER BY w.scheduled_at ASC, w.id LIMIT 6`,
      [localToday, localToday],
    ),
    safeGet<{ n: number }>(
      `SELECT COUNT(*) as n FROM work_orders WHERE status NOT IN ('completed', 'cancelled')
       AND substr(scheduled_at, 1, 10) >= ? AND substr(scheduled_at, 1, 10) <= date(?, '+${DUE_SOON_DAYS} days')`,
      [localToday, localToday], { n: 0 },
    ),
    // Vacant now, longest-vacant first; never-leased units (no past lease) last.
    safeQuery<{ id: number; property_id: number; unit_name: string; status: string; property_name: string | null; last_end_date: string | null }>(
      `SELECT * FROM (
         SELECT u.id, u.property_id, u.name as unit_name, u.status, p.name as property_name,
           (SELECT MAX(l.end_date) FROM leases l WHERE l.unit_id = u.id AND l.status != 'cancelled' AND l.end_date < ?) as last_end_date
         FROM units u
         LEFT JOIN properties p ON p.id = u.property_id
         WHERE u.status != 'unavailable' AND NOT ${occupiedToday.sql}
       ) ORDER BY last_end_date IS NULL, last_end_date ASC, id LIMIT 6`,
      [localToday, ...occupiedToday.params],
    ),
    safeGet<{ expired: number; expiring: number }>(
      `SELECT COALESCE(SUM(end_date < ?), 0) as expired,
         COALESCE(SUM(end_date >= ? AND end_date <= ${RENEWAL_WINDOW_END}), 0) as expiring
       FROM leases WHERE status = 'active'`,
      [localToday, localToday, localToday], { expired: 0, expiring: 0 },
    ),
  ]);

  return c.json({
    period: periodNow,
    properties: propertyCount.n,
    units: unitCount.n,
    occupied: occupiedCount.n,
    vacant: vacantCount.n,
    occupancy_rate: unitCount.n ? Math.round((occupiedCount.n / unitCount.n) * 100) : 0,
    active_leases: activeLeases.n,
    upcoming_move_outs: upcomingMoveOuts.n,
    month_outstanding: monthOutstanding.total,
    month_collected: monthCollected.total,
    overdue_total: overdueRow.total,
    overdue_count: overdueRow.n,
    open_work_orders: openWorkOrders.n,
    urgent_work_orders: urgentWorkOrders.n,
    overdue_work_orders: overdueWorkOrders.n,
    overdue_charges: overdueCharges,
    due_soon_charges: dueSoonCharges,
    due_soon_count: dueSoonRow.n,
    due_soon_total: dueSoonRow.total,
    overdue_work_orders_list: overdueWorkOrdersList,
    scheduled_work_orders: scheduledWorkOrders,
    scheduled_count: scheduledRow.n,
    vacant_units: vacantUnits,
    expired_leases_count: leaseCounts.expired,
    upcoming_expirations_count: leaseCounts.expiring,
    upcoming_expirations: upcomingExpirations,
    renewal_notice_days: parseInt(renewalSetting.value, 10) || 60,
    expired_leases: expiredLeases,
    followups_due_count: followupsDue.length,
    followups_due: followupsDue.slice(0, 6),
  });
});

// ── Settings (key/value) ───────────────────────────────────────────

app.get("/api/settings", async (c) => {
  const rows = await query<{ key: string; value: string }>("SELECT key, value FROM settings");
  const out: Record<string, string> = {};
  for (const r of rows) out[r.key] = r.value;
  return c.json({ settings: out });
});

// Known keys only. Values arrive as strings from the client, so numbers are coerced.
const SettingsInput = z.object({
  default_rent_due_day: z.coerce.number().int().min(1).max(31),
  late_fee_amount: z.coerce.number().min(0),
  late_fee_grace_days: z.coerce.number().int().min(0).max(365),
  currency: z.string().regex(/^[A-Z]{3}$/),
  renewal_notice_days: z.coerce.number().int().min(1).max(365),
  maintenance_approval_threshold: z.coerce.number().min(0),
}).partial().strict();

app.put("/api/settings", async (c) => {
  const parsed = await parseJson(c, SettingsInput);
  if (!parsed.ok) return c.json({ error: parsed.error }, 400);
  const prior = await query<{ key: string; value: string }>("SELECT key, value FROM settings");
  const entries = Object.entries(parsed.data).filter(([, v]) => v !== undefined);
  for (const [key, value] of entries) {
    await run(
      `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, datetime('now'))
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`,
      [key, String(value)],
    );
  }
  await logActivity(c, "settings", null, "update", null,
    diff(Object.fromEntries(prior.map((p) => [p.key, p.value])), Object.fromEntries(entries.map(([k, v]) => [k, String(v)]))));
  const rows = await query<{ key: string; value: string }>("SELECT key, value FROM settings");
  const out: Record<string, string> = {};
  for (const r of rows) out[r.key] = r.value;
  return c.json({ settings: out });
});

// ── Reports ────────────────────────────────────────────────────────

// Years 1900–2999 keep month stepping inside 4-digit years, so 'YYYY-MM' string
// comparison in the per-month loops stays correct.
const PERIOD_RE = /^(19|2\d)\d{2}-(0[1-9]|1[0-2])$/;
// Upper bound on report ranges; the occupancy report runs one query per month.
const MAX_REPORT_MONTHS = 36;

const monthIndex = (period: string) => {
  const [y, m] = period.split("-").map(Number);
  return y * 12 + m;
};

function periodRange(c: Context): { from: string; to: string } | null {
  const now = new Date().toISOString().slice(0, 7);
  const to = c.req.query("to") || now;
  const from = c.req.query("from") || addMonthsSql(to, -11);
  if (!PERIOD_RE.test(from) || !PERIOD_RE.test(to)) return null;
  const span = monthIndex(to) - monthIndex(from);
  if (span < 0 || span >= MAX_REPORT_MONTHS) return null;
  return { from, to };
}

function addMonthsSql(period: string, delta: number): string {
  const [y, m] = period.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

const RANGE_ERROR = "from/to must be 'YYYY-MM' (1900–2999), from <= to, spanning at most 36 months";

// Rent filtered to one property goes lease → unit → property; a lease whose unit was deleted drops out.
function rentScope(propertyId: number | null): { join: string; where: string; params: unknown[] } {
  return propertyId
    ? { join: " JOIN leases l ON l.id = rc.lease_id JOIN units u ON u.id = l.unit_id", where: " AND u.property_id = ?", params: [propertyId] }
    : { join: "", where: "", params: [] };
}

app.get("/api/reports/income", async (c) => {
  const range = periodRange(c);
  if (!range) return c.json({ error: RANGE_ERROR }, 400);
  const propertyRaw = c.req.query("property_id");
  const propertyId = intParam(propertyRaw);
  if (propertyRaw !== undefined && !propertyId) return c.json({ error: "Invalid property_id" }, 400);
  const scope = rentScope(propertyId);
  const rows = await query(
    `SELECT rc.period,
       SUM(rc.amount) as charged,
       SUM(rc.amount_paid) as collected,
       SUM(rc.amount - rc.amount_paid) as outstanding
     FROM rent_charges rc${scope.join}
     WHERE rc.period >= ? AND rc.period <= ?${scope.where}
     GROUP BY rc.period
     ORDER BY rc.period`,
    [range.from, range.to, ...scope.params],
  );
  return c.json({ from: range.from, to: range.to, months: rows });
});

type LineActual = { period: string; account_id: number; code: string; name: string; type: string; is_operating: number; is_paid: number; amount_cents: number };

/** Bill-line totals per month, account, and paid state, for complete bills only (D8). Shared by P&L and budget. */
async function billLineActuals(from: string, to: string, propertyId: number | null): Promise<LineActual[]> {
  return query<LineActual>(
    `SELECT substr(b.bill_date, 1, 7) AS period, a.id AS account_id, a.code, a.name, a.type, a.is_operating,
       CASE WHEN (SELECT COALESCE(SUM(amount_cents), 0) FROM bill_payments WHERE bill_id = b.id AND voided_at IS NULL)
              >= (SELECT SUM(amount_cents) FROM bill_lines WHERE bill_id = b.id) THEN 1 ELSE 0 END AS is_paid,
       SUM(l.amount_cents) AS amount_cents
     FROM bill_lines l
     JOIN bills b ON b.id = l.bill_id
     JOIN gl_accounts a ON a.id = l.account_id
     WHERE b.complete = 1 AND substr(b.bill_date, 1, 7) BETWEEN ? AND ?${propertyId ? " AND b.property_id = ?" : ""}
     GROUP BY period, a.id, is_paid`,
    propertyId ? [from, to, propertyId] : [from, to],
  );
}

type AccountGroup = "operating" | "below_noi" | "capital";
const accountGroup = (a: { type: string; is_operating: number }): AccountGroup =>
  a.type === "asset" ? "capital" : a.is_operating ? "operating" : "below_noi";

// Rent by charge period (D3), converted to cents per row; expenses by bill-date month.
// A bill counts as paid only when fully paid; partial payments stay in unpaid.
app.get("/api/reports/profit-loss", async (c) => {
  const range = periodRange(c);
  if (!range) return c.json({ error: RANGE_ERROR }, 400);
  const propertyRaw = c.req.query("property_id");
  const propertyId = intParam(propertyRaw);
  if (propertyRaw !== undefined && !propertyId) return c.json({ error: "Invalid property_id" }, 400);
  const scope = rentScope(propertyId);
  const rent = await query<{ period: string; charged_cents: number; collected_cents: number }>(
    `SELECT rc.period,
       SUM(CAST(ROUND(rc.amount * 100) AS INTEGER)) AS charged_cents,
       SUM(CAST(ROUND(rc.amount_paid * 100) AS INTEGER)) AS collected_cents
     FROM rent_charges rc${scope.join}
     WHERE rc.period >= ? AND rc.period <= ?${scope.where}
     GROUP BY rc.period`,
    [range.from, range.to, ...scope.params],
  );
  const lines = await billLineActuals(range.from, range.to, propertyId);

  const months = [];
  for (let period = range.from; period <= range.to; period = addMonthsSql(period, 1)) {
    const r = rent.find((x) => x.period === period);
    const m = lines.filter((l) => l.period === period);
    const sum = (f: (l: LineActual) => boolean) => m.filter(f).reduce((s, l) => s + l.amount_cents, 0);
    const opPaid = sum((l) => accountGroup(l) === "operating" && !!l.is_paid);
    const opUnpaid = sum((l) => accountGroup(l) === "operating" && !l.is_paid);
    const collected = r?.collected_cents ?? 0;
    months.push({
      period,
      rent_charged_cents: r?.charged_cents ?? 0,
      rent_collected_cents: collected,
      operating_paid_cents: opPaid,
      operating_unpaid_cents: opUnpaid,
      operating_cents: opPaid + opUnpaid,
      net_operating_cents: collected - opPaid - opUnpaid,
      below_noi_cents: sum((l) => accountGroup(l) === "below_noi"),
      capital_cents: sum((l) => accountGroup(l) === "capital"),
    });
  }

  const byAccount = new Map<number, { account_id: number; code: string; name: string; group: AccountGroup; amount_cents: number }>();
  for (const l of lines) {
    const row = byAccount.get(l.account_id) ?? { account_id: l.account_id, code: l.code, name: l.name, group: accountGroup(l), amount_cents: 0 };
    byAccount.set(l.account_id, { ...row, amount_cents: row.amount_cents + l.amount_cents });
  }
  const accounts = [...byAccount.values()].sort((a, b) => a.code.localeCompare(b.code));
  return c.json({ from: range.from, to: range.to, property_id: propertyId, months, accounts });
});

app.get("/api/reports/maintenance", async (c) => {
  const range = periodRange(c);
  if (!range) return c.json({ error: "from/to must be 'YYYY-MM' (1900–2999), from <= to, spanning at most 36 months" }, 400);
  const propertyId = intParam(c.req.query("property_id"));
  const vendorId = intParam(c.req.query("vendor_id"));
  const where: string[] = ["w.status = 'completed'", "w.completed_at IS NOT NULL", "strftime('%Y-%m', w.completed_at) >= ?", "strftime('%Y-%m', w.completed_at) <= ?"];
  const params: unknown[] = [range.from, range.to];
  if (propertyId) { where.push("w.property_id = ?"); params.push(propertyId); }
  if (vendorId) { where.push("w.vendor_id = ?"); params.push(vendorId); }
  const rows = await query(
    `SELECT strftime('%Y-%m', w.completed_at) as period,
       COUNT(*) as work_order_count,
       SUM(COALESCE(w.cost, 0)) as total_cost
     FROM work_orders w
     WHERE ${where.join(" AND ")}
     GROUP BY period
     ORDER BY period`,
    params,
  );
  return c.json({ from: range.from, to: range.to, months: rows });
});

app.get("/api/reports/delinquency", async (c) => {
  const propertyRaw = c.req.query("property_id");
  const propertyId = intParam(propertyRaw);
  if (propertyRaw !== undefined && !propertyId) return c.json({ error: "Invalid property_id" }, 400);
  // Same overdue condition and date as the dashboard's overdue total.
  const today = requestToday(c);
  const rows = await query(
    `SELECT
       rc.id, rc.lease_id, rc.due_date, rc.amount, rc.amount_paid,
       (rc.amount - rc.amount_paid) as balance,
       CAST(julianday(?) - julianday(rc.due_date) AS INTEGER) as days_overdue,
       l.unit_id, u.name as unit_name, p.id as property_id, p.name as property_name,
       t.first_name as tenant_first_name, t.last_name as tenant_last_name
     FROM rent_charges rc
     JOIN leases l ON l.id = rc.lease_id
     LEFT JOIN units u ON u.id = l.unit_id
     LEFT JOIN properties p ON p.id = u.property_id
     LEFT JOIN tenants t ON t.id = l.primary_tenant_id
     WHERE rc.status != 'waived' AND rc.amount_paid < rc.amount AND rc.due_date < ?${propertyId ? " AND u.property_id = ?" : ""}
     ORDER BY days_overdue DESC`,
    propertyId ? [today, today, propertyId] : [today, today],
  );
  return c.json({ rows });
});

app.get("/api/reports/occupancy", async (c) => {
  const range = periodRange(c);
  if (!range) return c.json({ error: "from/to must be 'YYYY-MM' (1900–2999), from <= to, spanning at most 36 months" }, 400);
  const propertyRaw = c.req.query("property_id");
  const propertyId = intParam(propertyRaw);
  if (propertyRaw !== undefined && !propertyId) return c.json({ error: "Invalid property_id" }, 400);
  const today = requestToday(c);
  const scope = propertyId ? " AND u.property_id = ?" : "";
  const scopeParams = propertyId ? [propertyId] : [];
  const totalRow = await get<{ n: number }>(`SELECT COUNT(*) as n FROM units u WHERE 1 = 1${scope}`, scopeParams);
  const totalUnits = totalRow?.n ?? 0;
  const months: { period: string; occupied_units: number; total_units: number; occupancy_rate: number }[] = [];
  let period = range.from;
  while (period <= range.to) {
    const { from, to } = monthBounds(period);
    const occ = unitOccupied(from, to, today);
    const row = await get<{ n: number }>(
      `SELECT COUNT(*) as n FROM units u WHERE ${occ.sql}${scope}`,
      [...occ.params, ...scopeParams],
    );
    const occupied = row?.n ?? 0;
    months.push({
      period,
      occupied_units: occupied,
      total_units: totalUnits,
      occupancy_rate: totalUnits ? Math.round((occupied / totalUnits) * 100) : 0,
    });
    period = addMonthsSql(period, 1);
  }
  return c.json({ from: range.from, to: range.to, property_id: propertyId, months });
});

// ── Budgets ────────────────────────────────────────────────────────
// One annual amount per property, year, and account, in cents (D4). The budget report
// returns every account's budget alongside its actuals, so there is no separate GET.

const BudgetInput = z.object({
  property_id: z.number().int(),
  year: z.number().int().min(1900).max(2999),
  lines: z.array(z.object({
    account_id: z.number().int(),
    amount_cents: z.number().int().min(0).max(100_000_000_000).nullable(),
  })).min(1).max(100),
});

// Upsert each line; a null amount removes it. Lines are independent, so a partial failure
// leaves the earlier lines saved and the operator can re-save.
app.put("/api/budgets", async (c) => {
  const parsed = await parseJson(c, BudgetInput);
  if (!parsed.ok) return c.json({ error: parsed.error }, 400);
  const d = parsed.data;
  if (!await get("SELECT 1 FROM properties WHERE id = ?", [d.property_id])) return c.json({ error: "Property not found" }, 400);
  const accounts = new Set((await query<{ id: number }>("SELECT id FROM gl_accounts WHERE active = 1")).map((a) => a.id));
  if (d.lines.some((l) => !accounts.has(l.account_id))) return c.json({ error: "Unknown account" }, 400);
  for (const l of d.lines) {
    if (l.amount_cents === null) {
      await run("DELETE FROM budgets WHERE property_id = ? AND year = ? AND account_id = ?", [d.property_id, d.year, l.account_id]);
    } else {
      await run(
        `INSERT INTO budgets (property_id, year, account_id, amount_cents) VALUES (?, ?, ?, ?)
         ON CONFLICT (property_id, year, account_id) DO UPDATE SET amount_cents = excluded.amount_cents`,
        [d.property_id, d.year, l.account_id, l.amount_cents],
      );
    }
  }
  await logActivity(c, "budget", d.property_id, "update", `${d.year}: ${d.lines.length} line(s)`);
  return c.json({ ok: true });
});

// Actuals follow the P&L: rent revenue (5120) is rent collected by charge period;
// expense and capital accounts are complete bill lines by bill date, paid or not.
// Variance is signed so positive is favorable: under budget for costs, over budget for income.
app.get("/api/reports/budget", async (c) => {
  const propertyId = intParam(c.req.query("property_id"));
  const year = intParam(c.req.query("year"));
  if (!propertyId) return c.json({ error: "property_id is required" }, 400);
  if (!year || year < 1900 || year > 2999) return c.json({ error: "year must be 1900–2999" }, 400);
  const from = `${year}-01`;
  const to = `${year}-12`;
  const accounts = await query<{ id: number; code: string; name: string; type: string; is_operating: number }>(
    "SELECT id, code, name, type, is_operating FROM gl_accounts WHERE active = 1 ORDER BY code",
  );
  const budgets = await query<{ account_id: number; amount_cents: number }>(
    "SELECT account_id, amount_cents FROM budgets WHERE property_id = ? AND year = ?",
    [propertyId, year],
  );
  const lines = await billLineActuals(from, to, propertyId);
  const scope = rentScope(propertyId);
  const rent = await get<{ collected_cents: number | null }>(
    `SELECT SUM(CAST(ROUND(rc.amount_paid * 100) AS INTEGER)) AS collected_cents
     FROM rent_charges rc${scope.join}
     WHERE rc.period >= ? AND rc.period <= ?${scope.where}`,
    [from, to, ...scope.params],
  );
  const rows = accounts.map((a) => {
    const budget = budgets.find((b) => b.account_id === a.id)?.amount_cents ?? null;
    const actual = a.code === "5120"
      ? rent?.collected_cents ?? 0
      : lines.filter((l) => l.account_id === a.id).reduce((s, l) => s + l.amount_cents, 0);
    const group = a.type === "income" ? "income" : accountGroup(a);
    return {
      account_id: a.id, code: a.code, name: a.name, group,
      budget_cents: budget,
      actual_cents: actual,
      variance_cents: budget === null ? null : group === "income" ? actual - budget : budget - actual,
    };
  });
  return c.json({ property_id: propertyId, year, lines: rows });
});

// ── Users (Phase 5) ────────────────────────────────────────────────

app.get("/api/me", (c) => c.json({ user: c.get("user"), sign_out: accessConfigured(c) }));

const USER_COLS = "id, email, name, role, active, created_at, last_seen_at";

app.get("/api/users", async (c) => {
  const users = await query(`SELECT ${USER_COLS} FROM users ORDER BY active DESC, email`);
  return c.json({ users });
});

const UserInput = z.object({
  email: z.string().trim().email(),
  name: z.string().trim().max(100).optional(),
  role: z.enum(ROLES),
});

app.post("/api/users", async (c) => {
  const parsed = await parseJson(c, UserInput);
  if (!parsed.ok) return c.json({ error: parsed.error }, 400);
  const email = parsed.data.email.toLowerCase();
  if (await get("SELECT 1 FROM users WHERE email = ?", [email])) {
    return c.json({ error: "That email already has an account." }, 409);
  }
  const r = await run("INSERT INTO users (email, name, role) VALUES (?, ?, ?)", [email, parsed.data.name ?? "", parsed.data.role]);
  const user = await get(`SELECT ${USER_COLS} FROM users WHERE id = ?`, [r.lastInsertRowid]);
  await logActivity(c, "user", r.lastInsertRowid, "create", email, { role: [null, parsed.data.role] });
  return c.json({ user }, 201);
});

const UserPatch = z.object({
  name: z.string().trim().max(100),
  role: z.enum(ROLES),
  active: z.boolean(),
}).partial().strict();

app.put("/api/users/:id", async (c) => {
  const id = intParam(c.req.param("id"));
  if (!id) return c.json({ error: "Invalid ID" }, 400);
  const parsed = await parseJson(c, UserPatch);
  if (!parsed.ok) return c.json({ error: parsed.error }, 400);
  const existing = await get<{ role: Role; active: number; email: string } & Record<string, unknown>>("SELECT * FROM users WHERE id = ?", [id]);
  if (!existing) return c.json({ error: "Not found" }, 404);
  const p = parsed.data;
  const losesAdmin = existing.role === "admin" && existing.active === 1
    && ((p.role !== undefined && p.role !== "admin") || p.active === false);
  if (losesAdmin) {
    const admins = await get<{ n: number }>("SELECT COUNT(*) as n FROM users WHERE role = 'admin' AND active = 1");
    if ((admins?.n ?? 0) <= 1) return c.json({ error: "There must be at least one active admin." }, 409);
  }
  const { sets, params } = buildUpdate({ name: p.name, role: p.role, active: p.active === undefined ? undefined : p.active ? 1 : 0 });
  if (!sets.length) return c.json({ error: "No fields" }, 400);
  await run(`UPDATE users SET ${sets.join(", ")} WHERE id = ?`, [...params, id]);
  await logActivity(c, "user", id, "update", existing.email, diff(existing, p));
  const user = await get(`SELECT ${USER_COLS} FROM users WHERE id = ?`, [id]);
  return c.json({ user });
});

// ── Documents (Phase 5) ────────────────────────────────────────────

const DOC_TABLES = { lease: "leases", tenant: "tenants", work_order: "work_orders", bill: "bills" } as const;
type DocEntity = keyof typeof DOC_TABLES;
const isDocEntity = (e: unknown): e is DocEntity => typeof e === "string" && e in DOC_TABLES;
const MAX_DOC_BYTES = 10 * 1024 * 1024;

const ascii = (b: Uint8Array, from: number, to: number) => String.fromCharCode(...b.slice(from, to));
// Allowed types, each checked against the file's first bytes (spec D2), so a renamed HTML or SVG
// file can't be stored as a "PDF" and later rendered.
const DOC_TYPES: Record<string, (b: Uint8Array) => boolean> = {
  "application/pdf": (b) => ascii(b, 0, 5) === "%PDF-",
  "image/jpeg": (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  "image/png": (b) => [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((v, i) => b[i] === v),
  "image/webp": (b) => ascii(b, 0, 4) === "RIFF" && ascii(b, 8, 12) === "WEBP",
};

// Spec D3: maintenance only on work orders, and never deletes.
function canUseDocs(role: Role, entity: string, action: "read" | "delete" = "read"): boolean {
  if (role === "maintenance") return action === "read" && entity === "work_order";
  return true;
}

// Spec D4: refuse deletes that would leave documents behind. Properties and units cascade to
// their leases, so those check the leases' documents.
async function hasDocuments(scope: "property" | "unit" | DocEntity, id: number): Promise<boolean> {
  if (scope === "property" || scope === "unit") {
    const col = scope === "property" ? "u.property_id" : "u.id";
    return !!(await get(
      `SELECT 1 FROM documents d JOIN leases l ON d.entity = 'lease' AND d.entity_id = l.id
       JOIN units u ON u.id = l.unit_id WHERE ${col} = ? LIMIT 1`,
      [id],
    ));
  }
  return !!(await get("SELECT 1 FROM documents WHERE entity = ? AND entity_id = ? LIMIT 1", [scope, id]));
}
const HAS_DOCUMENTS = "Delete its documents first.";

const DOC_COLS = `d.id, d.entity, d.entity_id, d.filename, d.content_type, d.size, d.uploaded_at,
  u.name as uploaded_by_name, u.email as uploaded_by_email`;

app.get("/api/documents", async (c) => {
  const entity = c.req.query("entity");
  const entityId = intParam(c.req.query("entity_id"));
  if (!isDocEntity(entity) || !entityId) return c.json({ error: "entity and entity_id required" }, 400);
  if (!canUseDocs(c.get("user").role, entity)) return c.json({ error: "You don't have access to this." }, 403);
  const documents = await query(
    `SELECT ${DOC_COLS} FROM documents d JOIN users u ON u.id = d.uploaded_by
     WHERE d.entity = ? AND d.entity_id = ? ORDER BY d.id DESC`,
    [entity, entityId],
  );
  return c.json({ documents });
});

app.post("/api/documents", async (c) => {
  // Reject an oversized body before reading it; the file size is checked again below because
  // Content-Length can be missing.
  if (Number(c.req.header("content-length") ?? 0) > MAX_DOC_BYTES + 512 * 1024) {
    return c.json({ error: "Files can be up to 10 MB." }, 413);
  }
  const form = await c.req.parseBody().catch(() => null);
  if (!form) return c.json({ error: "Expected a file upload" }, 400);
  const { entity, file } = form;
  const entityId = intParam(typeof form.entity_id === "string" ? form.entity_id : undefined);
  if (!isDocEntity(entity) || !entityId) return c.json({ error: "entity and entity_id required" }, 400);
  if (!canUseDocs(c.get("user").role, entity)) return c.json({ error: "You don't have access to this." }, 403);
  if (!(file instanceof File) || file.size === 0) return c.json({ error: "Choose a file to upload." }, 400);
  if (file.size > MAX_DOC_BYTES) return c.json({ error: "Files can be up to 10 MB." }, 413);
  if (!(await get(`SELECT 1 FROM ${DOC_TABLES[entity]} WHERE id = ?`, [entityId]))) {
    return c.json({ error: "Record not found" }, 404);
  }
  const head = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  const matches = DOC_TYPES[file.type];
  if (!matches || !matches(head)) return c.json({ error: "Only PDF, JPEG, PNG and WebP files can be uploaded." }, 415);

  const filename = file.name.replace(/[\\/\x00-\x1f\x7f"]/g, "_").slice(-200) || "document";
  const key = `docs/${entity}/${entityId}/${crypto.randomUUID()}`;
  await c.env.DOCS.put(key, await file.arrayBuffer(), { httpMetadata: { contentType: file.type } });
  let id: number;
  try {
    const r = await run(
      "INSERT INTO documents (entity, entity_id, r2_key, filename, content_type, size, uploaded_by) VALUES (?, ?, ?, ?, ?, ?, ?)",
      [entity, entityId, key, filename, file.type, file.size, c.get("user").id],
    );
    id = Number(r.lastInsertRowid);
  } catch (err) {
    await c.env.DOCS.delete(key); // no row, so don't keep the file
    throw err;
  }
  await logActivity(c, entity, entityId, "document_add", filename);
  const document = await get(`SELECT ${DOC_COLS} FROM documents d JOIN users u ON u.id = d.uploaded_by WHERE d.id = ?`, [id]);
  return c.json({ document }, 201);
});

type DocRow = { id: number; entity: DocEntity; entity_id: number; r2_key: string; filename: string; content_type: string };

app.get("/api/documents/:id/file", async (c) => {
  const id = intParam(c.req.param("id"));
  if (!id) return c.json({ error: "Invalid ID" }, 400);
  const doc = await get<DocRow>("SELECT * FROM documents WHERE id = ?", [id]);
  if (!doc) return c.json({ error: "Not found" }, 404);
  if (!canUseDocs(c.get("user").role, doc.entity)) return c.json({ error: "You don't have access to this." }, 403);
  const obj = await c.env.DOCS.get(doc.r2_key);
  if (!obj) return c.json({ error: "The file is missing from storage." }, 404);
  const fallback = doc.filename.replace(/[^\x20-\x7e]/g, "_");
  return new Response(obj.body, {
    headers: {
      "Content-Type": doc.content_type,
      "Content-Disposition": `inline; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(doc.filename)}`,
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "sandbox",
      "Cache-Control": "private, no-store",
    },
  });
});

app.delete("/api/documents/:id", async (c) => {
  const id = intParam(c.req.param("id"));
  if (!id) return c.json({ error: "Invalid ID" }, 400);
  const doc = await get<DocRow>("SELECT * FROM documents WHERE id = ?", [id]);
  if (!doc) return c.json({ error: "Not found" }, 404);
  if (!canUseDocs(c.get("user").role, doc.entity, "delete")) return c.json({ error: "You don't have access to this." }, 403);
  // File first: if R2 fails the row stays, so the delete can be retried and nothing is orphaned.
  await c.env.DOCS.delete(doc.r2_key);
  await run("DELETE FROM documents WHERE id = ?", [id]);
  await logActivity(c, doc.entity, doc.entity_id, "document_delete", doc.filename);
  return c.json({ ok: true });
});

// ── Activity (Phase 5) ─────────────────────────────────────────────

// Spec C3. Admins can browse everything; managers only one record's history (entity + entity_id).
// ponytail: from/to compare against UTC timestamps, so a day boundary can be off by the UTC offset.
app.get("/api/activity", async (c) => {
  const entity = c.req.query("entity");
  const entityId = intParam(c.req.query("entity_id"));
  if (c.get("user").role !== "admin" && !(entity && entityId)) {
    return c.json({ error: "You don't have access to this." }, 403);
  }
  const where: string[] = [];
  const params: unknown[] = [];
  const userId = intParam(c.req.query("user_id"));
  if (userId) { where.push("a.user_id = ?"); params.push(userId); }
  if (entity) { where.push("a.entity = ?"); params.push(entity); }
  if (entityId) { where.push("a.entity_id = ?"); params.push(entityId); }
  const from = c.req.query("from");
  if (from && isCalendarDate(from)) { where.push("a.at >= ?"); params.push(from); }
  const to = c.req.query("to");
  if (to && isCalendarDate(to)) { where.push("a.at < date(?, '+1 day')"); params.push(to); }
  const before = intParam(c.req.query("before"));
  if (before) { where.push("a.id < ?"); params.push(before); }
  const limit = Math.min(100, Math.max(1, intParam(c.req.query("limit")) ?? 100));
  const rows = await query<{ id: number; changes: string | null }>(
    `SELECT a.*, u.name as user_name, u.email as user_email FROM activity a JOIN users u ON u.id = a.user_id
     ${where.length ? "WHERE " + where.join(" AND ") : ""} ORDER BY a.id DESC LIMIT ?`,
    [...params, limit],
  );
  return c.json({
    activity: rows.map((r) => ({ ...r, changes: r.changes ? JSON.parse(r.changes) : null })),
    next_before: rows.length === limit ? rows[rows.length - 1].id : null,
  });
});

// ── Health ─────────────────────────────────────────────────────────

app.get("/api/health", (c) => c.json({ ok: true }));

export default app;
