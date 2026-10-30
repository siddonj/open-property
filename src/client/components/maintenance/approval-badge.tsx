import { cn } from "@/lib/utils";
import type { ApprovalStatus } from "@/types";

const LABEL: Record<ApprovalStatus, string> = {
  pending: "Approval required",
  approved: "Approved",
  rejected: "Rejected",
};

const TONE: Record<ApprovalStatus, string> = {
  pending: "border-amber-200 bg-amber-100 text-amber-800",
  approved: "border-emerald-200 bg-emerald-100 text-emerald-800",
  rejected: "border-rose-200 bg-rose-100 text-rose-800",
};

export function ApprovalBadge({ status, className }: { status: ApprovalStatus; className?: string }) {
  return (
    <span className={cn("inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold", TONE[status], className)}>
      {LABEL[status]}
    </span>
  );
}
