import type { Application, DeclineReason, DisclosureKey, IncomeType, IncomeVerificationStatus, NotifiedMethod } from "@/types";

// Rules and field set: docs/sdlc/changes/rental-application/spec.md.

export const DISCLOSURE_QUESTIONS: { key: DisclosureKey; label: string }[] = [
  { key: "evicted", label: "Ever been evicted?" },
  { key: "asked_to_move", label: "Ever been asked to move out by a landlord?" },
  { key: "broke_lease", label: "Ever broken a lease?" },
  { key: "bankruptcy", label: "Ever filed for bankruptcy?" },
  { key: "convicted", label: "Ever been convicted of a crime?" },
  { key: "sex_offender", label: "Required to register as a sex offender?" },
  { key: "pending_charges", label: "Any criminal charges pending?" },
];

export const INCOME_TYPE_LABELS: Record<IncomeType, string> = {
  employment: "Employment",
  self_employment: "Self-employment",
  benefits: "Benefits / assistance",
  child_support: "Child support",
  other: "Other",
};

export const DECLINE_REASON_LABELS: Record<DeclineReason, string> = {
  income: "Income below criteria",
  rental_history: "Rental history",
  credit: "Credit",
  criminal_history: "Criminal history (written criteria)",
  incomplete: "Incomplete application",
  false_information: "False information",
  unit_unavailable: "Unit no longer available",
  other: "Other",
};

export const NOTIFIED_METHOD_LABELS: Record<NotifiedMethod, string> = {
  phone: "Phone", mail: "Mail", email: "Email", in_person: "In person",
};

export const VERIFICATION_LABELS: Record<IncomeVerificationStatus, string> = {
  not_started: "Not started",
  requested: "Documents requested",
  verified: "Verified",
  unable_to_verify: "Unable to verify",
  waived: "Waived",
};

export const toCents = (dollars: string): number | null => {
  const n = parseFloat(dollars);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : null;
};
export const toDollars = (cents: number | null | undefined): string => (cents == null ? "" : String(cents / 100));

/**
 * Tex. Prop. Code §92.352: deemed rejected if not accepted within 7 days of a complete application;
 * §92.353 moves a weekend deadline to the next weekday. Holidays aren't modeled.
 */
export function decideBy(completedOn: string | null | undefined): string | null {
  if (!completedOn) return null;
  const d = new Date(`${completedOn}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 7);
  const dow = d.getUTCDay();
  if (dow === 6) d.setUTCDate(d.getUTCDate() + 2);
  if (dow === 0) d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

/** Household gross monthly income in cents; legacy rows fall back to `monthly_income`. */
export function householdIncomeCents(a: Pick<Application, "incomes" | "monthly_income">): number | null {
  if (a.incomes?.length) return a.incomes.reduce((s, i) => s + (i.monthly_cents ?? 0), 0);
  return a.monthly_income ? Math.round(a.monthly_income * 100) : null;
}

/** Income ÷ rent against the configured multiple; null when either side is unknown. */
export function incomeCheck(a: Application, multiple: number): { ratio: number; meets: boolean } | null {
  const income = householdIncomeCents(a);
  const rent = a.quoted_rent_cents ?? (a.unit_market_rent ? Math.round(a.unit_market_rent * 100) : null);
  if (!income || !rent) return null;
  const ratio = income / rent;
  return { ratio, meets: ratio >= multiple };
}

/** Required fields still empty before an application can be marked complete. */
export function missingForComplete(a: Partial<Application>): string[] {
  const missing: string[] = [];
  if (!a.first_name?.trim() || !a.last_name?.trim()) missing.push("applicant name");
  if (!a.email?.trim() && !a.phone?.trim()) missing.push("email or phone");
  if (!a.unit_id) missing.push("unit");
  if (!a.desired_move_in) missing.push("desired move-in");
  if (!a.quoted_rent_cents) missing.push("quoted rent");
  if (!a.criteria_notice_on) missing.push("criteria notice date");
  if (!a.authorized_on) missing.push("authorization date");
  if (!a.certified_on) missing.push("certification date");
  return missing;
}

/** §92.3515(e): a rejected applicant who never got the criteria notice is owed the fee back too. */
export function refundFlags(a: Application): { deposit: boolean; fee: boolean } {
  const closed = a.status === "declined" || a.status === "withdrawn";
  return {
    deposit: closed && a.deposit_outcome === "held" && !!a.deposit_cents,
    fee: a.status === "declined" && !!a.fee_cents && !a.criteria_notice_on,
  };
}
