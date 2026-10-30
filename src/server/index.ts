import { Hono, type Context } from "hono";
import { z } from "zod";
import { initDB, query, get, run } from "./db";

type Env = { Bindings: { DB: D1Database } };

const app = new Hono<Env>();

app.use("*", async (c, next) => {
  initDB(c.env);
  await next();
});

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

app.get("/api/properties", async (c) => {
  const rows = await query(
    `SELECT p.*,
       (SELECT COUNT(*) FROM units u WHERE u.property_id = p.id) as unit_count,
       (SELECT COUNT(*) FROM units u WHERE u.property_id = p.id AND u.status = 'occupied') as occupied_count
     FROM properties p ORDER BY p.name`,
  );
  return c.json({ properties: rows });
});

app.get("/api/properties/:id", async (c) => {
  const id = intParam(c.req.param("id"));
  if (!id) return c.json({ error: "Invalid ID" }, 400);
  const row = await get("SELECT * FROM properties WHERE id = ?", [id]);
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
  const r = await run(`UPDATE properties SET ${sets.join(", ")} WHERE id = ?`, params);
  if (!r.changes) return c.json({ error: "Not found" }, 404);
  const row = await get("SELECT * FROM properties WHERE id = ?", [id]);
  return c.json({ property: row });
});

app.delete("/api/properties/:id", async (c) => {
  const id = intParam(c.req.param("id"));
  if (!id) return c.json({ error: "Invalid ID" }, 400);
  if (await hasRentHistory("u.property_id", id)) {
    return c.json({ error: "This property has rent history, so it can't be deleted. End or cancel its leases instead." }, 409);
  }
  const r = await run("DELETE FROM properties WHERE id = ?", [id]);
  if (!r.changes) return c.json({ error: "Not found" }, 404);
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
  const r = await run(`UPDATE units SET ${sets.join(", ")} WHERE id = ?`, params);
  if (!r.changes) return c.json({ error: "Not found" }, 404);
  const row = await get(`${UNIT_SELECT} WHERE u.id = ?`, [id]);
  return c.json({ unit: row });
});

app.delete("/api/units/:id", async (c) => {
  const id = intParam(c.req.param("id"));
  if (!id) return c.json({ error: "Invalid ID" }, 400);
  if (await hasRentHistory("u.id", id)) {
    return c.json({ error: "This unit has rent history, so it can't be deleted. End or cancel its leases instead." }, 409);
  }
  const r = await run("DELETE FROM units WHERE id = ?", [id]);
  if (!r.changes) return c.json({ error: "Not found" }, 404);
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
  const r = await run(`UPDATE tenants SET ${sets.join(", ")} WHERE id = ?`, params);
  if (!r.changes) return c.json({ error: "Not found" }, 404);
  const row = await get("SELECT * FROM tenants WHERE id = ?", [id]);
  return c.json({ tenant: row });
});

app.delete("/api/tenants/:id", async (c) => {
  const id = intParam(c.req.param("id"));
  if (!id) return c.json({ error: "Invalid ID" }, 400);
  const r = await run("DELETE FROM tenants WHERE id = ?", [id]);
  if (!r.changes) return c.json({ error: "Not found" }, 404);
  return c.json({ ok: true });
});

// ── Leases ─────────────────────────────────────────────────────────

const LeaseInput = z.object({
  unit_id: z.number().int(),
  primary_tenant_id: z.number().int().nullable().optional(),
  start_date: z.string(),
  end_date: z.string(),
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
  const result = await run(
    `INSERT INTO leases (unit_id, primary_tenant_id, start_date, end_date, monthly_rent, deposit, rent_due_day, late_fee, status, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [d.unit_id, d.primary_tenant_id ?? null, d.start_date, d.end_date, d.monthly_rent ?? 0, d.deposit ?? 0, d.rent_due_day ?? 1, d.late_fee ?? 0, d.status ?? "active", d.notes ?? null],
  );
  await syncUnitOccupancy(d.unit_id);
  const row = await get(`${LEASE_SELECT} WHERE l.id = ?`, [result.lastInsertRowid]);
  return c.json({ lease: row }, 201);
});

app.put("/api/leases/:id", async (c) => {
  const id = intParam(c.req.param("id"));
  if (!id) return c.json({ error: "Invalid ID" }, 400);
  const parsed = await parseJson(c, LeaseInput.partial());
  if (!parsed.ok) return c.json({ error: parsed.error }, 400);
  const { sets, params } = buildUpdate(parsed.data);
  if (!sets.length) return c.json({ error: "No fields" }, 400);
  const before = await get<{ unit_id: number }>("SELECT unit_id FROM leases WHERE id = ?", [id]);
  if (!before) return c.json({ error: "Not found" }, 404);
  params.push(id);
  const r = await run(`UPDATE leases SET ${sets.join(", ")} WHERE id = ?`, params);
  if (!r.changes) return c.json({ error: "Not found" }, 404);
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
  const lease = await get<{ unit_id: number }>("SELECT unit_id FROM leases WHERE id = ?", [id]);
  if (!lease) return c.json({ error: "Not found" }, 404);
  if (await hasRentHistory("l.id", id)) {
    return c.json({ error: "This lease has rent history, so it can't be deleted. End or cancel it instead." }, 409);
  }
  await run("DELETE FROM leases WHERE id = ?", [id]);
  await syncUnitOccupancy(lease.unit_id);
  return c.json({ ok: true });
});

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
  return c.json({ checklists: await checklistsForLease(id) }, 201);
});

app.post("/api/checklists/:id/items", async (c) => {
  const id = intParam(c.req.param("id"));
  if (!id) return c.json({ error: "Invalid ID" }, 400);
  const parsed = await parseJson(c, ChecklistItemInput.pick({ label: true }));
  if (!parsed.ok) return c.json({ error: parsed.error }, 400);
  const list = await get<{ id: number }>("SELECT id FROM lease_checklists WHERE id = ?", [id]);
  if (!list) return c.json({ error: "Not found" }, 404);
  await run(
    `INSERT INTO lease_checklist_items (checklist_id, label, sort)
     VALUES (?, ?, (SELECT COALESCE(MAX(sort), -1) + 1 FROM lease_checklist_items WHERE checklist_id = ?))`,
    [id, parsed.data.label, id],
  );
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
  const r = await run(`UPDATE lease_checklist_items SET ${sets.join(", ")} WHERE id = ?`, params);
  if (!r.changes) return c.json({ error: "Not found" }, 404);
  return c.json({ ok: true });
});

app.delete("/api/checklist-items/:id", async (c) => {
  const id = intParam(c.req.param("id"));
  if (!id) return c.json({ error: "Invalid ID" }, 400);
  const r = await run("DELETE FROM lease_checklist_items WHERE id = ?", [id]);
  if (!r.changes) return c.json({ error: "Not found" }, 404);
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
  const rows = await query(sql, params).catch(() => []);
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
  return c.json({ charge: row }, 201);
});

// Generate (idempotent) charges for a given period across all active leases.
app.post("/api/rent-charges/generate", async (c) => {
  const body = await c.req.json().catch(() => ({})) as { period?: string };
  const period = body.period;
  if (!period || !/^\d{4}-\d{2}$/.test(period)) return c.json({ error: "period (YYYY-MM) required" }, 400);
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
     WHERE status IN ('open', 'partial') AND amount_paid < amount AND due_date < date('now')`,
  );
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
  const r = await run(`UPDATE rent_charges SET ${sets.join(", ")} WHERE id = ?`, params);
  if (!r.changes) return c.json({ error: "Not found" }, 404);
  const row = await get(`${CHARGE_SELECT} WHERE c.id = ?`, [id]);
  return c.json({ charge: row });
});

app.delete("/api/rent-charges/:id", async (c) => {
  const id = intParam(c.req.param("id"));
  if (!id) return c.json({ error: "Invalid ID" }, 400);
  const r = await run("DELETE FROM rent_charges WHERE id = ?", [id]);
  if (!r.changes) return c.json({ error: "Not found" }, 404);
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
  await run(
    `INSERT INTO payments (charge_id, paid_at, amount, method, reference, notes)
     VALUES (?, COALESCE(?, datetime('now')), ?, ?, ?, ?)`,
    [d.charge_id, d.paid_at ?? null, d.amount, d.method ?? "cash", d.reference ?? null, d.notes ?? null],
  );
  // Recompute the charge's amount_paid + status.
  const charge = await get<{ amount: number }>("SELECT amount FROM rent_charges WHERE id = ?", [d.charge_id]);
  if (!charge) return c.json({ error: "Charge not found" }, 404);
  const sumRow = await get<{ total: number }>("SELECT COALESCE(SUM(amount), 0) as total FROM payments WHERE charge_id = ?", [d.charge_id]);
  const paid = Number(sumRow?.total ?? 0);
  const status = paid >= charge.amount ? "paid" : paid > 0 ? "partial" : "open";
  await run("UPDATE rent_charges SET amount_paid = ?, status = ? WHERE id = ?", [paid, status, d.charge_id]);
  const updated = await get(`${CHARGE_SELECT} WHERE c.id = ?`, [d.charge_id]);
  return c.json({ charge: updated }, 201);
});

app.delete("/api/payments/:id", async (c) => {
  const id = intParam(c.req.param("id"));
  if (!id) return c.json({ error: "Invalid ID" }, 400);
  const row = await get<{ charge_id: number }>("SELECT charge_id FROM payments WHERE id = ?", [id]);
  if (!row) return c.json({ error: "Not found" }, 404);
  await run("DELETE FROM payments WHERE id = ?", [id]);
  // Recompute the charge.
  const sumRow = await get<{ total: number }>("SELECT COALESCE(SUM(amount), 0) as total FROM payments WHERE charge_id = ?", [row.charge_id]);
  const charge = await get<{ amount: number }>("SELECT amount FROM rent_charges WHERE id = ?", [row.charge_id]);
  const paid = Number(sumRow?.total ?? 0);
  const status = !charge ? "open" : paid >= charge.amount ? "paid" : paid > 0 ? "partial" : "open";
  await run("UPDATE rent_charges SET amount_paid = ?, status = ? WHERE id = ?", [paid, status, row.charge_id]);
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
  const r = await run(`UPDATE vendors SET ${sets.join(", ")} WHERE id = ?`, params);
  if (!r.changes) return c.json({ error: "Not found" }, 404);
  const row = await get("SELECT * FROM vendors WHERE id = ?", [id]);
  return c.json({ vendor: row });
});

app.delete("/api/vendors/:id", async (c) => {
  const id = intParam(c.req.param("id"));
  if (!id) return c.json({ error: "Invalid ID" }, 400);
  const r = await run("DELETE FROM vendors WHERE id = ?", [id]);
  if (!r.changes) return c.json({ error: "Not found" }, 404);
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
    t.first_name as tenant_first_name, t.last_name as tenant_last_name,
    v.name as vendor_name, v.color as vendor_color
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
  const rows = await query(sql, params).catch(() => []);
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
  return c.json({ work_order: row }, 201);
});

app.put("/api/work-orders/:id", async (c) => {
  const id = intParam(c.req.param("id"));
  if (!id) return c.json({ error: "Invalid ID" }, 400);
  const parsed = await parseJson(c, WorkOrderInput.partial());
  if (!parsed.ok) return c.json({ error: parsed.error }, 400);
  const existing = await get<{ status: string; estimated_cost: number | null; approval_status: string | null }>(
    "SELECT status, estimated_cost, approval_status FROM work_orders WHERE id = ?",
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
  const row = await get(`${WO_SELECT} WHERE w.id = ?`, [id]);
  return c.json({ work_order: row });
});

app.delete("/api/work-orders/:id", async (c) => {
  const id = intParam(c.req.param("id"));
  if (!id) return c.json({ error: "Invalid ID" }, 400);
  const r = await run("DELETE FROM work_orders WHERE id = ?", [id]);
  if (!r.changes) return c.json({ error: "Not found" }, 404);
  return c.json({ ok: true });
});

app.post("/api/work-orders/:id/approval", async (c) => {
  const id = intParam(c.req.param("id"));
  if (!id) return c.json({ error: "Invalid ID" }, 400);
  const parsed = await parseJson(c, z.object({ decision: z.enum(["approved", "rejected"]) }));
  if (!parsed.ok) return c.json({ error: parsed.error }, 400);
  const existing = await get<{ approval_status: string | null }>("SELECT approval_status FROM work_orders WHERE id = ?", [id]);
  if (!existing) return c.json({ error: "Not found" }, 404);
  if (!existing.approval_status) return c.json({ error: "This work order doesn't require approval" }, 409);
  const approved = parsed.data.decision === "approved";
  await run(
    `UPDATE work_orders SET approval_status = ?, approved_at = ${approved ? "datetime('now')" : "NULL"} WHERE id = ?`,
    [parsed.data.decision, id],
  );
  const row = await get(`${WO_SELECT} WHERE w.id = ?`, [id]);
  return c.json({ work_order: row });
});

// ── Recurring tasks (preventive maintenance) ───────────────────────

// Look-ahead for generation: occurrences up to this many days out become work orders.
const GENERATE_HORIZON_DAYS = 14;
// Safety bound on occurrence stepping per template; stepping starts near the anchor date.
const MAX_OCCURRENCE_STEPS = 5_000;
// Calendar date with a real month/day range (DATE_RE only checks the shape).
const STRICT_DATE_RE = /^2\d{3}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
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
  const r = await run(`UPDATE recurring_tasks SET ${sets.join(", ")} WHERE id = ?`, params);
  if (!r.changes) return c.json({ error: "Not found" }, 404);
  const row = await get<RecurringTask>(`${RT_SELECT} WHERE r.id = ?`, [id]);
  return c.json({ recurring_task: row && withNext(row) });
});

app.delete("/api/recurring-tasks/:id", async (c) => {
  const id = intParam(c.req.param("id"));
  if (!id) return c.json({ error: "Invalid ID" }, 400);
  // Generated work orders are kept; their recurring_task_id is set to NULL by the FK.
  const r = await run("DELETE FROM recurring_tasks WHERE id = ?", [id]);
  if (!r.changes) return c.json({ error: "Not found" }, 404);
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
  return c.json({ created, through: horizon });
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
  ).catch(() => []);
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
  const r = await run(`UPDATE applications SET ${sets.join(", ")} WHERE id = ?`, params);
  if (!r.changes) return c.json({ error: "Not found" }, 404);
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
  const r = await run("DELETE FROM applications WHERE id = ?", [id]);
  if (!r.changes) return c.json({ error: "Not found" }, 404);
  return c.json({ ok: true });
});

// ── Dashboard summary ──────────────────────────────────────────────

// SQL date for the end of the lease-renewal window (settings.renewal_notice_days, default 60).
// Takes the reference date as a bound parameter.
const RENEWAL_WINDOW_END =
  "date(?, '+' || COALESCE((SELECT CAST(value AS INTEGER) FROM settings WHERE key = 'renewal_notice_days'), 60) || ' days')";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

app.get("/api/dashboard/summary", async (c) => {
  const today = new Date().toISOString().slice(0, 10);
  const periodNow = today.slice(0, 7);
  // The client's local date, so "due today" / "expired" match what the operator sees.
  // Falls back to the UTC date when absent or malformed.
  const qToday = c.req.query("today");
  const localToday = qToday && DATE_RE.test(qToday) ? qToday : today;

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
    recentWorkOrders,
    upcomingExpirations,
    followupsDue,
    expiredLeases,
    renewalSetting,
    overdueWorkOrders,
  ] = await Promise.all([
    safeGet<{ n: number }>("SELECT COUNT(*) as n FROM properties", [], { n: 0 }),
    safeGet<{ n: number }>("SELECT COUNT(*) as n FROM units", [], { n: 0 }),
    safeGet<{ n: number }>("SELECT COUNT(*) as n FROM units WHERE status = 'occupied'", [], { n: 0 }),
    safeGet<{ n: number }>("SELECT COUNT(*) as n FROM units WHERE status = 'vacant'", [], { n: 0 }),
    safeGet<{ n: number }>("SELECT COUNT(*) as n FROM leases WHERE status = 'active'", [], { n: 0 }),
    safeGet<{ n: number }>(
      "SELECT COUNT(*) as n FROM leases WHERE status = 'active' AND end_date <= date('now', '+30 days')",
      [], { n: 0 },
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
      "SELECT COALESCE(SUM(amount - amount_paid), 0) as total, COUNT(*) as n FROM rent_charges WHERE due_date < date('now') AND amount_paid < amount AND status != 'waived'",
      [], { total: 0, n: 0 },
    ),
    safeGet<{ n: number }>(
      "SELECT COUNT(*) as n FROM work_orders WHERE status NOT IN ('completed', 'cancelled')",
      [], { n: 0 },
    ),
    safeGet<{ n: number }>(
      "SELECT COUNT(*) as n FROM work_orders WHERE priority = 'urgent' AND status NOT IN ('completed', 'cancelled')",
      [], { n: 0 },
    ),
    safeQuery<{ id: number; title: string; priority: string; status: string; scheduled_at: string | null; property_name: string | null; unit_name: string | null; created_at: string }>(
      `SELECT w.id, w.title, w.priority, w.status, w.scheduled_at, p.name as property_name, u.name as unit_name, w.created_at
       FROM work_orders w
       LEFT JOIN properties p ON p.id = w.property_id
       LEFT JOIN units u ON u.id = w.unit_id
       WHERE w.status NOT IN ('completed', 'cancelled')
       ORDER BY CASE WHEN substr(w.scheduled_at, 1, 10) < ? THEN 0 ELSE 1 END,
         CASE w.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END, w.created_at DESC
       LIMIT 6`,
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
    recent_work_orders: recentWorkOrders,
    upcoming_expirations: upcomingExpirations,
    renewal_notice_days: parseInt(renewalSetting.value, 10) || 60,
    expired_leases: expiredLeases,
    followups_due_count: followupsDue.length,
    followups_due: followupsDue.slice(0, 6),
  });
});

// ── Settings (key/value) ───────────────────────────────────────────

app.get("/api/settings", async (c) => {
  const rows = await query<{ key: string; value: string }>("SELECT key, value FROM settings").catch(() => []);
  const out: Record<string, string> = {};
  for (const r of rows) out[r.key] = r.value;
  return c.json({ settings: out });
});

app.put("/api/settings", async (c) => {
  let body: unknown;
  try { body = await c.req.json(); } catch { return c.json({ error: "Invalid JSON" }, 400); }
  if (!body || typeof body !== "object") return c.json({ error: "Body must be an object" }, 400);
  const entries = Object.entries(body as Record<string, unknown>).filter(([, v]) => v !== undefined && v !== null);
  for (const [key, value] of entries) {
    await run(
      `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, datetime('now'))
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`,
      [key, String(value)],
    );
  }
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

app.get("/api/reports/income", async (c) => {
  const range = periodRange(c);
  if (!range) return c.json({ error: "from/to must be 'YYYY-MM' (1900–2999), from <= to, spanning at most 36 months" }, 400);
  const rows = await query(
    `SELECT period,
       SUM(amount) as charged,
       SUM(amount_paid) as collected,
       SUM(amount - amount_paid) as outstanding
     FROM rent_charges
     WHERE period >= ? AND period <= ?
     GROUP BY period
     ORDER BY period`,
    [range.from, range.to],
  );
  return c.json({ from: range.from, to: range.to, months: rows });
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
  const rows = await query(
    `SELECT
       rc.id, rc.lease_id, rc.due_date, rc.amount, rc.amount_paid,
       (rc.amount - rc.amount_paid) as balance,
       CAST(julianday('now') - julianday(rc.due_date) AS INTEGER) as days_overdue,
       l.unit_id, u.name as unit_name, p.id as property_id, p.name as property_name,
       t.first_name as tenant_first_name, t.last_name as tenant_last_name
     FROM rent_charges rc
     JOIN leases l ON l.id = rc.lease_id
     LEFT JOIN units u ON u.id = l.unit_id
     LEFT JOIN properties p ON p.id = u.property_id
     LEFT JOIN tenants t ON t.id = l.primary_tenant_id
     WHERE rc.status != 'waived' AND rc.amount_paid < rc.amount AND rc.due_date < date('now')
     ORDER BY days_overdue DESC`,
  );
  return c.json({ rows });
});

app.get("/api/reports/occupancy", async (c) => {
  const range = periodRange(c);
  if (!range) return c.json({ error: "from/to must be 'YYYY-MM' (1900–2999), from <= to, spanning at most 36 months" }, 400);
  const totalRow = await get<{ n: number }>("SELECT COUNT(*) as n FROM units");
  const totalUnits = totalRow?.n ?? 0;
  const months: { period: string; occupied_units: number; total_units: number; occupancy_rate: number }[] = [];
  let period = range.from;
  while (period <= range.to) {
    const row = await get<{ n: number }>(
      `SELECT COUNT(DISTINCT u.id) as n
       FROM units u
       JOIN leases l ON l.unit_id = u.id
       WHERE l.status != 'cancelled'
         AND l.start_date <= date(? || '-01', '+1 month', '-1 day')
         AND l.end_date >= date(? || '-01')`,
      [period, period],
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
  return c.json({ from: range.from, to: range.to, months });
});

// ── Health ─────────────────────────────────────────────────────────

app.get("/api/health", (c) => c.json({ ok: true }));

export default app;
