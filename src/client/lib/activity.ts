import type { ActivityRow } from "@/types";

export const ENTITY_LABELS: Record<string, string> = {
  property: "Property",
  unit: "Unit",
  tenant: "Tenant",
  lease: "Lease",
  rent_charge: "Rent charge",
  vendor: "Vendor",
  work_order: "Work order",
  recurring_task: "Recurring task",
  bill: "Bill",
  application: "Application",
  budget: "Budget",
  settings: "Settings",
  user: "User",
  document: "Document",
};

const ACTION_LABELS: Record<string, string> = {
  create: "created",
  update: "updated",
  delete: "deleted",
  generate: "generated",
  payment: "recorded a payment on",
  payment_delete: "deleted a payment on",
  approve: "approved",
  reject: "rejected",
  void: "voided a payment on",
  checklist_create: "started a checklist on",
  checklist_item_add: "added a checklist item to",
  checklist_item_update: "updated a checklist item on",
  checklist_item_delete: "removed a checklist item from",
};

export const actionLabel = (a: string) => ACTION_LABELS[a] ?? a.replace(/_/g, " ");

// SQLite datetime('now') is UTC without a zone.
export function formatAt(at: string): string {
  const d = new Date(`${at.replace(" ", "T")}Z`);
  return Number.isNaN(d.getTime()) ? at : d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

const show = (v: unknown) => {
  if (v === null || v === undefined || v === "") return "—";
  const s = String(v);
  return s.length > 60 ? `${s.slice(0, 57)}…` : s;
};

export function formatChanges(changes: ActivityRow["changes"]): string[] {
  if (!changes) return [];
  return Object.entries(changes).map(([field, [from, to]]) => `${field.replace(/_/g, " ")}: ${show(from)} → ${show(to)}`);
}

// Phase 4 deep links, where the record has one. Deleted records get no link.
export function activityHref(row: ActivityRow): string | null {
  if (row.entity_id == null || row.action === "delete") return null;
  switch (row.entity) {
    case "property": return `/properties/${row.entity_id}`;
    case "tenant": return `/tenants/${row.entity_id}`;
    case "lease": return `/leases?id=${row.entity_id}`;
    case "work_order": return `/maintenance?id=${row.entity_id}`;
    case "application": return `/applications?id=${row.entity_id}`;
    default: return null;
  }
}
