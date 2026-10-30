import { daysBetween } from "@/lib/utils";
import type { WorkOrder } from "@/types";

/** Days ahead that count as "due soon". */
export const DUE_SOON_DAYS = 7;

export type DueState = "overdue" | "soon" | "scheduled" | "unscheduled" | "closed";

export const isOpen = (w: WorkOrder) => w.status !== "completed" && w.status !== "cancelled";

/** Due state of a work order relative to the operator's local `today` (YYYY-MM-DD). */
export function dueState(w: WorkOrder, today: string): DueState {
  if (!isOpen(w)) return "closed";
  if (!w.scheduled_at) return "unscheduled";
  const days = daysBetween(today, w.scheduled_at.slice(0, 10));
  if (days < 0) return "overdue";
  return days <= DUE_SOON_DAYS ? "soon" : "scheduled";
}
