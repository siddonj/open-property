import type { Route } from "@/hooks/use-router";
import type { Role } from "@/types";

// What each role is shown. Display only: the API enforces the same rules (server ACCESS table).
const MAINTENANCE_PAGES: Route["name"][] = ["properties", "property", "maintenance", "settings", "not-found"];

export function canSeePage(role: Role, page: Route["name"]): boolean {
  return role !== "maintenance" || MAINTENANCE_PAGES.includes(page);
}

/** Admins and managers: money, tenants, leases, deletes and approvals. */
export const isStaff = (role: Role) => role !== "maintenance";
