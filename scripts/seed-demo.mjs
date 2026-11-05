#!/usr/bin/env node
// Demo data: 15 months of history for 15 properties / 100 units, ending at --today.
//
// Prints SQL to stdout. Apply it with Wrangler, local first:
//
//   node scripts/seed-demo.mjs > /tmp/seed-demo.sql
//   wrangler d1 execute open-property-db --local --file=/tmp/seed-demo.sql
//   wrangler d1 execute open-property-db --remote --file=/tmp/seed-demo.sql
//
// The same --today (default: local date) gives the same rows. The first statement claims the
// 'demo_seed' settings key, so applying the file twice fails instead of duplicating data.
// Rows are written directly, not through the API, so no activity history is recorded.
// New ids start at 101+ so they don't collide with the three baseline sample properties.

import assert from "node:assert/strict";

const pad = (n, w = 2) => String(n).padStart(w, "0");
const args = process.argv.slice(2);
const argAt = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
const now = new Date();
const TODAY = argAt("--today") ?? `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
if (!/^\d{4}-\d{2}-\d{2}$/.test(TODAY)) throw new Error("--today must be YYYY-MM-DD");
const MONTHS = 15;

// ── Deterministic randomness ──────────────────────────────────────
let seed = 20251;
const rand = () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const int = (a, b) => a + Math.floor(rand() * (b - a + 1));
const pick = (xs) => xs[Math.floor(rand() * xs.length)];
const chance = (p) => rand() < p;
const money = (a, b, step = 5) => Math.round((a + rand() * (b - a)) / step) * step;

// ── Dates ('YYYY-MM-DD' / 'YYYY-MM', all UTC so there are no DST surprises) ──
const toDate = (s) => new Date(`${s}T00:00:00Z`);
const fmt = (d) => d.toISOString().slice(0, 10);
const addDays = (s, n) => { const d = toDate(s); d.setUTCDate(d.getUTCDate() + n); return fmt(d); };
// Only used on days <= 28, so no month-end clamping is needed.
const addMonths = (s, n) => { const [y, m, d] = s.split("-").map(Number); return fmt(new Date(Date.UTC(y, m - 1 + n, d))); };
const addPeriods = (p, n) => addMonths(`${p}-01`, n).slice(0, 7);
const daysBetween = (a, b) => Math.round((toDate(b) - toDate(a)) / 86_400_000);
const CUR = TODAY.slice(0, 7);
const FIRST = addPeriods(CUR, -(MONTHS - 1));
const WINDOW_START = `${FIRST}-01`;
const periods = Array.from({ length: MONTHS }, (_, i) => addPeriods(FIRST, i));
const minDate = (a, b) => (a < b ? a : b);

// ── SQL output ────────────────────────────────────────────────────
const tables = new Map();
const ids = {};
const nextId = (table, start) => (ids[table] = (ids[table] ?? start - 1) + 1);
function row(table, values) {
  if (!tables.has(table)) tables.set(table, []);
  tables.get(table).push(values);
}
const lit = (v) => (v === null || v === undefined ? "NULL" : typeof v === "number" ? String(v) : v.sql ?? `'${String(v).replace(/'/g, "''")}'`);
const account = (code) => ({ sql: `(SELECT id FROM gl_accounts WHERE code = '${code}')` });
const cents = (dollars) => Math.round(dollars * 100);

// ── Vendors ───────────────────────────────────────────────────────
const VENDOR_DEFS = {
  plumber: ["Capital City Plumbing", "plumber", "sky"],
  hvac: ["Lone Star Heating & Air", "hvac", "teal"],
  electrician: ["Volt Electric Co.", "electrician", "amber"],
  handyman: ["Handy Hands Repair", "handyman", "orange"],
  cleaning: ["Sparkle Turnover Cleaning", "cleaning", "violet"],
  landscaping: ["Green Acres Landscaping", "landscaping", "emerald"],
  pest: ["Bugs Away Pest Control", "general", "rose"],
  roofing: ["Summit Roofing", "general", "slate"],
  appliance: ["Austin Appliance Pros", "general", "fuchsia"],
  utility: ["City Utilities", "general", "sky"],
  trash: ["Central Texas Waste", "general", "slate"],
  tax: ["County Tax Assessor", "general", "slate"],
  insurance: ["Hill Country Insurance", "general", "slate"],
  management: ["Keystone Property Management", "general", "slate"],
  bank: ["First Lone Star Bank", "general", "slate"],
  hoa: ["Brushy Creek HOA", "general", "slate"],
};
const vendor = {};
for (const [key, [name, category, color]] of Object.entries(VENDOR_DEFS)) {
  const id = nextId("vendors", 101);
  vendor[key] = id;
  row("vendors", { id, name, category, phone: `512-555-${pad(100 + id, 4)}`, email: `billing@${name.toLowerCase().replace(/[^a-z]+/g, "")}.example`, color });
}

// ── Properties and units ──────────────────────────────────────────
// [name, type, address, city, zip, year built, units, rent tier, color]
const PROPERTY_DEFS = [
  ["Cedar Ridge Apartments", "multi_family", "4500 Cedar Ridge Dr", "Austin", "78745", 1998, 32, 1.0, "sky"],
  ["Riverside Commons", "multi_family", "1200 E Riverside Dr", "Austin", "78741", 2004, 24, 1.05, "teal"],
  ["The Willows", "multi_family", "811 Willow Bend", "Round Rock", "78664", 1992, 18, 0.95, "emerald"],
  ["Barton Creek Flats", "multi_family", "2300 S Lamar Blvd", "Austin", "78704", 2012, 12, 1.25, "violet"],
  ["Elm Street Fourplex", "multi_family", "614 Elm St", "Georgetown", "78626", 1978, 4, 0.9, "amber"],
  ["Brushy Creek Townhome A", "townhouse", "1702 Brushy Creek Rd #A", "Cedar Park", "78613", 2008, 1, 1.0, "orange"],
  ["Brushy Creek Townhome B", "townhouse", "1702 Brushy Creek Rd #B", "Cedar Park", "78613", 2008, 1, 1.0, "orange"],
  ["Pecan Hollow House", "single_family", "309 Pecan Hollow", "Pflugerville", "78660", 2001, 1, 1.0, "emerald"],
  ["Mesa Verde House", "single_family", "7718 Mesa Verde Dr", "Austin", "78759", 1986, 1, 1.15, "rose"],
  ["Live Oak Cottage", "single_family", "45 Live Oak Ln", "San Marcos", "78666", 1965, 1, 0.85, "amber"],
  ["Bluebonnet House", "single_family", "2210 Bluebonnet Ln", "Austin", "78704", 1952, 1, 1.3, "sky"],
  ["Sunset Trail House", "single_family", "918 Sunset Trail", "Leander", "78641", 2016, 1, 1.05, "fuchsia"],
  ["Hidden Valley House", "single_family", "12 Hidden Valley Ct", "Round Rock", "78681", 1999, 1, 1.0, "teal"],
  ["Copperfield House", "single_family", "6004 Copperfield Dr", "Austin", "78754", 1994, 1, 0.95, "violet"],
  ["Windmill Run House", "single_family", "3311 Windmill Run", "Kyle", "78640", 2019, 1, 0.9, "slate"],
];
const properties = [];
const units = [];
for (const [name, type, address, city, zip, yearBuilt, unitCount, tier, color] of PROPERTY_DEFS) {
  const id = nextId("properties", 101);
  const mf = type === "multi_family";
  const value = mf ? unitCount * money(115_000, 160_000, 1000) : money(360_000, 560_000, 1000) * tier;
  const prop = { id, name, type, mf, unitCount, value, units: [], insuranceMonth: int(1, 12), mortgage: chance(0.6) ? Math.round(value * 0.0026) : 0 };
  properties.push(prop);
  row("properties", { id, name, type, address, city, state: "TX", zip, year_built: yearBuilt, color });
  for (let i = 0; i < unitCount; i++) {
    const beds = mf ? (i % 8 === 7 ? 3 : i % 4 < 2 ? 1 : 2) : type === "townhouse" ? 2 : int(3, 4);
    const baths = beds === 1 ? 1 : beds === 2 ? (mf ? 1 : 2.5) : 2;
    const sqft = mf ? [0, 680, 960, 1210][beds] + int(-30, 30) : beds * 520 + int(-80, 120);
    const base = mf ? [0, 1300, 1700, 2150][beds] : type === "townhouse" ? 2150 : 1850 + beds * 220;
    const rent = Math.round((base * tier) / 25) * 25;
    const unitName = mf ? (unitCount > 4 ? `${Math.floor(i / 8) + 1}${pad((i % 8) + 1)}` : `Unit ${String.fromCharCode(65 + i)}`) : "Main house";
    const unit = { id: nextId("units", 1001), prop, name: unitName, beds, rent, leases: [] };
    prop.units.push(unit);
    units.push(unit);
    row("units", { id: unit.id, property_id: id, name: unitName, bedrooms: beds, bathrooms: baths, sqft, market_rent: rent, status: "vacant" });
  }
}

// ── Tenants and leases ────────────────────────────────────────────
const FIRST_NAMES = ["Maria", "James", "Aisha", "Daniel", "Sofia", "Michael", "Priya", "David", "Elena", "Chris", "Jasmine", "Kevin", "Lauren", "Marcus", "Nina", "Omar", "Rachel", "Tyler", "Grace", "Andre", "Hannah", "Luis", "Megan", "Jordan", "Camila", "Ethan", "Fatima", "Noah", "Olivia", "Samuel", "Taylor", "Victor", "Zoe", "Isaac", "Leah", "Mateo", "Ruby", "Caleb", "Alyssa", "Devin"];
const LAST_NAMES = ["Garcia", "Johnson", "Nguyen", "Smith", "Martinez", "Brown", "Patel", "Davis", "Lopez", "Wilson", "Kim", "Anderson", "Thomas", "Hernandez", "Moore", "Jackson", "Lee", "Perez", "White", "Harris", "Clark", "Ramirez", "Lewis", "Walker", "Young", "Allen", "King", "Wright", "Scott", "Torres", "Hill", "Green", "Adams", "Baker", "Nelson", "Carter", "Mitchell", "Roberts", "Turner", "Phillips"];
const EMPLOYERS = ["Dell Technologies", "Austin ISD", "St. David's Medical Center", "University of Texas", "City of Austin", "H-E-B", "Samsung Austin", "Tesla Gigafactory", "Self-employed", "Apple", "Seton Hospital", "Whole Foods Market", "Texas State University", "Indeed", "Oracle"];

function newTenant(rent, since) {
  const id = nextId("tenants", 1001);
  const first = pick(FIRST_NAMES);
  const last = pick(LAST_NAMES);
  // good: pays on time; late: sometimes a week or two late; bad: late, partial, and some unpaid.
  const r = rand();
  const payer = r < 0.78 ? "good" : r < 0.95 ? "late" : "bad";
  row("tenants", {
    id, first_name: first, last_name: last,
    email: `${first}.${last}${id}@example.com`.toLowerCase(), phone: `512-555-${pad(id % 10000, 4)}`,
    employer: pick(EMPLOYERS), monthly_income: Math.round((rent * (2.8 + rand() * 1.4)) / 50) * 50,
    emergency_contact: `${pick(FIRST_NAMES)} ${last} · 512-555-${pad(int(0, 9999), 4)}`,
    created_at: `${addDays(since, -int(10, 30))} 10:00:00`,
  });
  return { id, payer };
}

const leases = [];
const moveOuts = [];
function addLease(unit, tenant, start, rent) {
  const end = addDays(addMonths(start, 12), -1);
  const lease = { id: nextId("leases", 1001), unit, tenant, start, end, rent };
  lease.status = start > TODAY ? "upcoming" : end < TODAY ? "ended" : "active";
  unit.leases.push(lease);
  leases.push(lease);
  row("leases", {
    id: lease.id, unit_id: unit.id, primary_tenant_id: tenant.id, start_date: start, end_date: end,
    monthly_rent: rent, deposit: rent, rent_due_day: 1, late_fee: 50, status: lease.status,
    created_at: `${addDays(start, -int(7, 25))} 10:00:00`,
  });
  return lease;
}

const roundRent = (x) => Math.round(x / 5) * 5;
for (const unit of units) {
  let rent = Math.round((unit.rent * 0.94) / 25) * 25;
  // ~93% occupied when the window opens; the rest are let a month or three in.
  let start = chance(0.93) ? addMonths(WINDOW_START, -int(0, 11)) : addMonths(WINDOW_START, int(1, 3));
  while (start <= TODAY) {
    let tenant = newTenant(rent, start);
    for (;;) {
      const lease = addLease(unit, tenant, start, rent);
      if (lease.end >= TODAY) { start = null; break; } // current lease; renewal not decided yet
      if (chance(0.65)) { start = addDays(lease.end, 1); rent = roundRent(rent * (1.02 + rand() * 0.03)); continue; }
      const out = addDays(lease.end, 1);
      moveOuts.push({ unit, date: out });
      start = addMonths(out, chance(0.4) ? 0 : int(1, 2));
      rent = roundRent(Math.max(rent, unit.rent * (0.97 + rand() * 0.06)));
      break;
    }
    if (start === null) break;
  }
  // A unit vacant today sometimes already has a signed lease starting soon.
  if (start && start > TODAY && start <= addDays(TODAY, 45) && chance(0.6)) addLease(unit, newTenant(rent, TODAY), start, rent);
}
const tenantOn = (unit, date) => unit.leases.find((l) => l.start <= date && l.end >= date)?.tenant ?? null;

// ── Rent charges and payments ─────────────────────────────────────
const rentByPropertyPeriod = new Map();
const lastMonths = new Set(periods.slice(-3));
function pay(chargeId, date, amount, payer) {
  if (date > TODAY || amount <= 0) return 0;
  const method = payer === "good" ? pick(["ach", "ach", "ach", "check"]) : pick(["check", "ach", "cash", "credit"]);
  row("payments", { id: nextId("payments", 10001), charge_id: chargeId, paid_at: date, amount, method, reference: method === "check" ? `Chk #${int(1000, 9999)}` : null });
  return amount;
}
for (const lease of leases) {
  if (lease.status === "upcoming") continue;
  const fromP = lease.start.slice(0, 7) > FIRST ? lease.start.slice(0, 7) : FIRST;
  const toP = lease.end.slice(0, 7) < CUR ? lease.end.slice(0, 7) : CUR;
  for (let p = fromP; p <= toP; p = addPeriods(p, 1)) {
    const id = nextId("rent_charges", 10001);
    const due = `${p}-01`;
    const amount = lease.rent;
    const { payer } = lease.tenant;
    let paid = 0;
    const r = rand();
    if (payer === "good") paid += pay(id, addDays(due, int(-2, 2)), amount, payer);
    else if (payer === "late") paid += pay(id, addDays(due, r < 0.35 ? int(4, 15) : int(0, 3)), amount, payer);
    else if (r < 0.45) paid += pay(id, addDays(due, int(5, 20)), amount, payer);
    else if (r < 0.75) {
      const part = roundRent(amount * (0.4 + rand() * 0.4));
      paid += pay(id, addDays(due, int(3, 12)), part, payer);
      if (!lastMonths.has(p)) paid += pay(id, addDays(due, int(25, 40)), amount - part, payer);
    } else if (!lastMonths.has(p)) paid += pay(id, addDays(due, int(30, 45)), amount, payer);
    const status = paid >= amount ? "paid" : due < TODAY ? "overdue" : paid > 0 ? "partial" : "open";
    row("rent_charges", { id, lease_id: lease.id, period: p, due_date: due, amount, amount_paid: paid, status, created_at: `${addDays(due, -5)} 09:00:00` });
    const key = `${lease.unit.prop.id}|${p}`;
    rentByPropertyPeriod.set(key, (rentByPropertyPeriod.get(key) ?? 0) + amount);
  }
}

// ── Bills (one line each unless given several) ────────────────────
function bill(prop, vendorKey, date, lines, opts = {}) {
  if (date > TODAY) return;
  const id = nextId("bills", 1001);
  const due = opts.due ?? addDays(date, 30);
  row("bills", { id, property_id: prop.id, vendor_id: vendor[vendorKey], bill_date: date, due_date: due, reference: `INV-${int(10000, 99999)}`, complete: 1, created_at: `${date} 15:00:00` });
  let total = 0;
  for (const l of lines) {
    total += cents(l.amount);
    row("bill_lines", { id: nextId("bill_lines", 10001), bill_id: id, account_id: account(l.code), unit_id: l.unit ?? null, work_order_id: l.wo ?? null, description: l.desc, amount_cents: cents(l.amount) });
  }
  // Older bills are paid; a few slip past due. Recent ones are still open.
  const paidOn = addDays(date, int(5, 20));
  if (daysBetween(date, TODAY) > 25 && paidOn <= TODAY && !chance(0.02)) {
    row("bill_payments", { id: nextId("bill_payments", 10001), bill_id: id, paid_on: paidOn, amount_cents: total, method: pick(["ach", "ach", "check", "card"]), reference: `PMT-${int(100000, 999999)}` });
  }
}

// ── Work orders ───────────────────────────────────────────────────
// [title, description, vendor key, priority, cost range, account]
const ISSUES = [
  ["Leaking kitchen faucet", "Steady drip under the sink; tenant has a bucket under it.", "plumber", "normal", [140, 320], "6520"],
  ["Clogged bathroom drain", "Tub drains very slowly.", "plumber", "normal", [110, 240], "6520"],
  ["Running toilet", "Toilet runs constantly after flushing.", "plumber", "low", [90, 180], "6520"],
  ["No hot water", "Water heater not heating. Pilot may be out.", "plumber", "high", [350, 1400], "6520"],
  ["AC not cooling", "Thermostat set to 72, unit blowing warm air.", "hvac", "high", [220, 950], "6520"],
  ["Heat not working", "Furnace clicks but won't ignite.", "hvac", "high", [180, 650], "6520"],
  ["Breaker keeps tripping", "Kitchen circuit trips when microwave runs.", "electrician", "normal", [150, 420], "6520"],
  ["Outlet not working", "Bedroom outlet dead; breaker is on.", "electrician", "low", [95, 220], "6520"],
  ["Garbage disposal jammed", "Hums but won't turn.", "handyman", "low", [85, 190], "6520"],
  ["Door lock sticking", "Front door deadbolt hard to turn.", "handyman", "normal", [75, 160], "6520"],
  ["Broken window blinds", "Living room blinds won't raise.", "handyman", "low", [60, 140], "6520"],
  ["Dishwasher leaking", "Water on the floor after each cycle.", "appliance", "normal", [180, 460], "6520"],
  ["Refrigerator not cooling", "Fridge warm, freezer still cold.", "appliance", "high", [240, 720], "6520"],
  ["Ants in kitchen", "Ant trail along the counter.", "pest", "low", [110, 190], "6573"],
  ["Ceiling stain after rain", "Brown stain spreading on hallway ceiling.", "roofing", "high", [350, 1600], "6520"],
];
const workOrders = [];
function workOrder(w) {
  const id = nextId("work_orders", 1001);
  workOrders.push({ id, ...w });
  row("work_orders", {
    id, property_id: w.prop.id, unit_id: w.unit?.id ?? null, tenant_id: w.tenant ?? null, vendor_id: w.vendorKey ? vendor[w.vendorKey] : null,
    title: w.title, description: w.desc ?? null, priority: w.priority, status: w.status, scheduled_at: w.scheduled ?? null,
    completed_at: w.completed ?? null, cost: w.cost ?? null, estimated_cost: w.estimate ?? null,
    recurring_task_id: w.recurring ?? null, occurrence_date: w.occurrence ?? null, created_at: `${w.created} 08:30:00`,
  });
  if (w.status === "completed" && w.cost && w.vendorKey) {
    bill(w.prop, w.vendorKey, w.completed, [{ code: w.code ?? "6520", amount: w.cost, unit: w.unit?.id, wo: id, desc: w.title }]);
  }
}
function lifecycle(created, range) {
  const age = daysBetween(created, TODAY);
  const done = age > 21 || (age > 7 && chance(0.7));
  if (done && chance(0.04)) return { status: "cancelled" };
  if (done) {
    const completed = minDate(addDays(created, int(1, 10)), TODAY);
    return { status: "completed", scheduled: addDays(created, int(0, 3)), completed, cost: money(range[0], range[1]) };
  }
  const s = pick(["open", "assigned", "assigned", "in_progress"]);
  return { status: s, scheduled: s === "open" ? null : addDays(created, int(-1, 6)) };
}
for (const unit of units) {
  for (const p of periods) {
    if (!chance(0.09)) continue;
    const created = `${p}-${pad(int(1, 28))}`;
    if (created > TODAY) continue;
    const [title, desc, vendorKey, priority, range, code] = pick(ISSUES);
    const life = lifecycle(created, range);
    workOrder({
      prop: unit.prop, unit, tenant: tenantOn(unit, created)?.id, vendorKey: life.status === "open" ? null : vendorKey,
      title, desc, priority: chance(0.1) ? "urgent" : priority, created, estimate: money(range[0], range[1], 25), code, ...life,
    });
  }
}
for (const { unit, date } of moveOuts) {
  if (date < WINDOW_START || date > TODAY) continue;
  const life = lifecycle(date, unit.beds > 2 ? [700, 1800] : [450, 1100]);
  workOrder({ prop: unit.prop, unit, vendorKey: "cleaning", title: "Make-ready turnover", desc: "Clean, patch and paint, replace filters and smoke detector batteries.", priority: "high", created: date, estimate: 900, code: "6580", ...life });
}

// ── Recurring tasks (monthly landscaping, quarterly HVAC filters on apartment buildings) ──
for (const prop of properties.filter((x) => x.mf)) {
  for (const [title, vendorKey, every, day, est] of [
    ["Grounds maintenance", "landscaping", 1, 12, 150 + prop.unitCount * 9],
    ["Replace HVAC filters", "hvac", 3, 20, prop.unitCount * 22],
  ]) {
    const id = nextId("recurring_tasks", 101);
    const start = addMonths(`${FIRST}-${pad(day)}`, 0);
    let last = null;
    for (let k = 0; ; k++) {
      const occ = addMonths(start, k * every);
      if (occ > addDays(TODAY, 14)) break;
      last = occ;
      const past = daysBetween(occ, TODAY) > 3;
      workOrder({
        prop, vendorKey, title, priority: "normal", created: addDays(occ, -14), scheduled: occ, estimate: est,
        status: past ? "completed" : "assigned", completed: past ? addDays(occ, int(0, 2)) : null,
        cost: past ? money(est * 0.95, est * 1.1) : null, recurring: id, occurrence: occ,
      });
    }
    row("recurring_tasks", { id, property_id: prop.id, vendor_id: vendor[vendorKey], title, priority: "normal", estimated_cost: est, interval_unit: "month", interval_count: every, start_date: start, last_generated_through: last, active: 1 });
  }
}

// ── Operating bills ───────────────────────────────────────────────
for (const prop of properties) {
  const n = prop.unitCount;
  for (const p of periods) {
    const rent = rentByPropertyPeriod.get(`${prop.id}|${p}`) ?? 0;
    if (rent) bill(prop, "management", `${p}-25`, [{ code: "6320", amount: Math.round(rent * 0.08), desc: `Management fee ${p} (8% of rent)` }]);
    if (prop.mf) {
      const summer = ["06", "07", "08", "09"].includes(p.slice(5)) ? 1.45 : 1;
      bill(prop, "utility", `${p}-08`, [
        { code: "6450", amount: money(n * 9 * summer, n * 13 * summer, 1), desc: "Common-area electricity" },
        { code: "6451", amount: money(n * 22, n * 30, 1), desc: "Water" },
        { code: "6453", amount: money(n * 14, n * 19, 1), desc: "Sewer" },
      ]);
      bill(prop, "trash", `${p}-03`, [{ code: "6525", amount: 140 + n * 6, desc: "Dumpster service" }]);
      if (["01", "04", "07", "10"].includes(p.slice(5))) bill(prop, "pest", `${p}-15`, [{ code: "6573", amount: 95 + n * 4, desc: "Quarterly pest control" }]);
    }
    if (prop.type === "townhouse") bill(prop, "hoa", `${p}-01`, [{ code: "6390", amount: 285, desc: "HOA dues" }], { due: `${p}-10` });
    if (prop.mortgage) bill(prop, "bank", `${p}-01`, [{ code: "6820", amount: prop.mortgage, desc: "Mortgage interest" }], { due: `${p}-01` });
    if (p.slice(5) === "01") bill(prop, "tax", `${p}-10`, [{ code: "6710", amount: Math.round(prop.value * 0.021), desc: `${Number(p.slice(0, 4)) - 1} property taxes` }], { due: `${p}-31` });
    if (Number(p.slice(5)) === prop.insuranceMonth) bill(prop, "insurance", `${p}-05`, [{ code: "6720", amount: Math.round(prop.value * 0.0045), desc: "Annual property and liability policy" }]);
  }
}
// A few capital projects.
const capital = [
  [properties.find((x) => x.name === "Bluebonnet House"), "roofing", 4, "1420", 14_800, "Roof replacement"],
  [properties.find((x) => x.name === "Cedar Ridge Apartments"), "handyman", 8, "1410", 8_200, "Parking lot reseal and restripe"],
  [properties.find((x) => x.name === "The Willows"), "appliance", 11, "1450", 6_350, "Replace 5 refrigerators and ranges"],
];
for (const [prop, vendorKey, offset, code, amount, desc] of capital) bill(prop, vendorKey, `${addPeriods(FIRST, offset)}-14`, [{ code, amount, desc }]);

// ── Budgets (each calendar year the window touches) ───────────────
const years = [...new Set(periods.map((p) => Number(p.slice(0, 4))))];
for (const prop of properties) {
  const n = prop.unitCount;
  const grossRent = prop.units.reduce((s, u) => s + u.rent, 0) * 12;
  const lines = [
    ["5120", grossRent * 0.95], ["6320", grossRent * 0.95 * 0.08], ["6520", n * 520], ["6580", n * 150],
    ["6710", prop.value * 0.021], ["6720", prop.value * 0.0045],
  ];
  if (prop.mf) lines.push(["6450", n * 140], ["6451", n * 310], ["6453", n * 200], ["6525", (140 + n * 6) * 12], ["6573", (95 + n * 4) * 4]);
  if (prop.type === "townhouse") lines.push(["6390", 285 * 12]);
  if (prop.mortgage) lines.push(["6820", prop.mortgage * 12]);
  for (const year of years) {
    for (const [code, amount] of lines) row("budgets", { id: nextId("budgets", 1001), property_id: prop.id, year, account_id: account(code), amount_cents: Math.round(amount / 100) * 10_000 });
  }
}

// ── Applications for units that are empty now ─────────────────────
const vacantNow = units.filter((u) => !u.leases.some((l) => l.start <= TODAY && l.end >= TODAY));
const APP_STATUSES = ["new", "new", "new", "screening", "screening", "approved", "approved", "declined", "withdrawn"];
for (let i = 0; i < Math.max(8, vacantNow.length * 2); i++) {
  const unit = vacantNow.length ? pick(vacantNow) : pick(units);
  const status = pick(APP_STATUSES);
  const created = addDays(TODAY, -int(1, 40));
  const first = pick(FIRST_NAMES);
  const last = pick(LAST_NAMES);
  row("applications", {
    id: nextId("applications", 101), unit_id: unit.id, first_name: first, last_name: last,
    email: `${first}.${last}.app${i}@example.com`.toLowerCase(), phone: `512-555-${pad(int(0, 9999), 4)}`,
    monthly_income: Math.round((unit.rent * (2.2 + rand() * 1.8)) / 50) * 50, employer: pick(EMPLOYERS),
    desired_move_in: addDays(TODAY, int(7, 45)), status,
    follow_up_date: status === "new" || status === "screening" ? addDays(TODAY, int(-3, 7)) : null,
    created_at: `${created} 11:00:00`, updated_at: `${addDays(created, int(0, daysBetween(created, TODAY)))} 11:00:00`,
  });
}

// Unit status follows today's leases (reports use leases; this keeps the unit badges in step).
const turnoverSince = addDays(TODAY, -30);
const unitStatus = (u) =>
  u.leases.some((l) => l.start <= TODAY && l.end >= TODAY) ? "occupied"
    : moveOuts.some((m) => m.unit === u && m.date >= turnoverSince && m.date <= TODAY) ? "turnover" : "vacant";

// ── Self-check: fail before printing anything if the data contradicts itself ──
const rowsOf = (t) => tables.get(t) ?? [];
const sumBy = (rows, key, val) => rows.reduce((m, r) => m.set(r[key], (m.get(r[key]) ?? 0) + r[val]), new Map());
const paidByCharge = sumBy(rowsOf("payments"), "charge_id", "amount");
for (const c of rowsOf("rent_charges")) {
  assert.equal(c.amount_paid, paidByCharge.get(c.id) ?? 0, `charge ${c.id}: amount_paid != payments`);
  assert.ok(c.amount_paid <= c.amount, `charge ${c.id}: overpaid`);
}
for (const u of units) {
  const ls = [...u.leases].sort((a, b) => a.start.localeCompare(b.start));
  for (let i = 1; i < ls.length; i++) assert.ok(ls[i].start > ls[i - 1].end, `unit ${u.id}: leases ${ls[i - 1].id} and ${ls[i].id} overlap`);
}
const billTotals = sumBy(rowsOf("bill_lines"), "bill_id", "amount_cents");
for (const p of rowsOf("bill_payments")) assert.equal(p.amount_cents, billTotals.get(p.bill_id), `bill ${p.bill_id}: payment != total`);
for (const [t, col] of [["payments", "paid_at"], ["bills", "bill_date"], ["bill_payments", "paid_on"], ["work_orders", "completed_at"]]) {
  for (const r of rowsOf(t)) assert.ok(!r[col] || r[col] <= TODAY, `${t} ${r.id}: ${col} ${r[col]} is after ${TODAY}`);
}

// ── Emit ──────────────────────────────────────────────────────────
const ORDER = ["vendors", "properties", "units", "tenants", "leases", "rent_charges", "payments", "recurring_tasks", "work_orders", "bills", "bill_lines", "bill_payments", "budgets", "applications"];
const out = [
  `-- Open Property demo data: ${MONTHS} months ending ${TODAY}. Generated by scripts/seed-demo.mjs.`,
  `INSERT INTO settings (key, value) VALUES ('demo_seed', ${lit(TODAY)});`,
];
const BATCH = 100;
for (const table of ORDER) {
  const rows = tables.get(table) ?? [];
  // Columns are the union across rows so optional fields line up.
  const cols = [...new Set(rows.flatMap((r) => Object.keys(r)))];
  for (let i = 0; i < rows.length; i += BATCH) {
    const values = rows.slice(i, i + BATCH).map((r) => `(${cols.map((c) => lit(r[c])).join(", ")})`);
    out.push(`INSERT INTO ${table} (${cols.join(", ")}) VALUES\n${values.join(",\n")};`);
  }
}
for (const status of ["occupied", "turnover"]) {
  const list = units.filter((u) => unitStatus(u) === status).map((u) => u.id);
  if (list.length) out.push(`UPDATE units SET status = '${status}' WHERE id IN (${list.join(", ")});`);
}
process.stdout.write(out.join("\n") + "\n");

const count = (t) => tables.get(t)?.length ?? 0;
process.stderr.write(
  `seed-demo: ${MONTHS} months ${FIRST}..${CUR} · ${count("properties")} properties, ${count("units")} units, ` +
  `${count("tenants")} tenants, ${count("leases")} leases, ${count("rent_charges")} rent charges, ${count("payments")} payments, ` +
  `${count("work_orders")} work orders, ${count("bills")} bills, ${count("budgets")} budget lines, ${count("applications")} applications · ` +
  `${units.filter((u) => unitStatus(u) === "occupied").length}/${units.length} occupied today\n`,
);
