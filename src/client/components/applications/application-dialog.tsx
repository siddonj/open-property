import { useEffect, useState, type ReactNode } from "react";
import { useApp } from "@/context";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { formatDate, formatMoney, toIsoDate } from "@/lib/utils";
import {
  DECLINE_REASON_LABELS, DISCLOSURE_QUESTIONS, INCOME_TYPE_LABELS, NOTIFIED_METHOD_LABELS, VERIFICATION_LABELS,
  decideBy, householdIncomeCents, incomeCheck, missingForComplete,
} from "@/lib/applications";
import { FieldGrid, ListEditor, type FieldDef } from "./application-fields";
import type {
  Application, ApplicationStatus, CoApplicant, Disclosure, DisclosureKey, EmergencyContact, Guarantor, IncomeSource,
  NewApplication, Occupant, Pet, Reference, Residence, Unit, Vehicle,
} from "@/types";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  application?: Application;
  onSaved?: () => void;
}

const NO_UNIT = "none";

// Guided next steps per status. The server accepts any valid status (spec D3),
// so these are the common paths, not a hard state machine.
export const NEXT_STATUSES: Record<ApplicationStatus, { to: ApplicationStatus; label: string }[]> = {
  new: [{ to: "screening", label: "Start screening" }, { to: "withdrawn", label: "Withdrawn" }],
  screening: [{ to: "approved", label: "Approve" }, { to: "declined", label: "Decline" }, { to: "withdrawn", label: "Withdrawn" }],
  approved: [{ to: "screening", label: "Reopen" }],
  declined: [{ to: "screening", label: "Reopen" }],
  withdrawn: [{ to: "screening", label: "Reopen" }],
};

type Draft = Partial<Application>;

const opts = (labels: Record<string, string>) => Object.entries(labels).map(([value, label]) => ({ value, label }));

const CO_APPLICANT: FieldDef<CoApplicant>[] = [
  { key: "name", label: "Name", wide: true }, { key: "email", label: "Email" }, { key: "phone", label: "Phone" },
];
const OCCUPANT: FieldDef<Occupant>[] = [{ key: "name", label: "Name", wide: true }, { key: "minor", label: "Under 18", kind: "check" }];
const EMERGENCY: FieldDef<EmergencyContact>[] = [
  { key: "name", label: "Name", wide: true }, { key: "phone", label: "Phone" }, { key: "relationship", label: "Relationship" },
];
const RESIDENCE: FieldDef<Residence>[] = [
  { key: "address", label: "Address", wide: true }, { key: "from", label: "From", kind: "date" }, { key: "to", label: "To", kind: "date" },
  { key: "rent_cents", label: "Rent paid / mo", kind: "money" }, { key: "landlord_name", label: "Landlord" },
  { key: "landlord_phone", label: "Landlord phone" }, { key: "reason", label: "Reason for leaving" },
];
const INCOME: FieldDef<IncomeSource>[] = [
  { key: "type", label: "Type", kind: "select", options: opts(INCOME_TYPE_LABELS) }, { key: "earner", label: "Earner" },
  { key: "monthly_cents", label: "Gross / month", kind: "money" }, { key: "start", label: "Since", kind: "date" },
  { key: "employer", label: "Employer or source" }, { key: "position", label: "Position" },
  { key: "supervisor", label: "Supervisor" }, { key: "supervisor_phone", label: "Supervisor phone" },
];
const GUARANTOR: FieldDef<Guarantor>[] = [
  { key: "name", label: "Name", wide: true }, { key: "phone", label: "Phone" }, { key: "email", label: "Email" },
  { key: "monthly_cents", label: "Gross / month", kind: "money" },
];
const PET: FieldDef<Pet>[] = [
  { key: "type", label: "Type" }, { key: "breed", label: "Breed" }, { key: "weight_lbs", label: "Weight (lbs)", kind: "number" },
  { key: "age", label: "Age" }, { key: "neutered", label: "Spayed / neutered", kind: "check" }, { key: "vaccinated", label: "Vaccinations current", kind: "check" },
];
const VEHICLE: FieldDef<Vehicle>[] = [
  { key: "year", label: "Year" }, { key: "make", label: "Make" }, { key: "model", label: "Model" }, { key: "plate", label: "Plate" }, { key: "state", label: "State" },
];
const REFERENCE: FieldDef<Reference>[] = [
  { key: "name", label: "Name", wide: true }, { key: "phone", label: "Phone" }, { key: "relationship", label: "Relationship" },
];
const FEES: FieldDef<Draft>[] = [
  { key: "fee_cents", label: "Application fee", kind: "money" }, { key: "fee_paid_on", label: "Fee paid", kind: "date" },
  { key: "deposit_cents", label: "Application deposit", kind: "money" }, { key: "deposit_paid_on", label: "Deposit paid", kind: "date" },
  { key: "deposit_outcome", label: "Deposit outcome", kind: "select", options: opts({ held: "Held", applied: "Applied to security deposit", refunded: "Refunded", forfeited: "Forfeited" }) },
  { key: "deposit_refunded_on", label: "Refunded on", kind: "date" }, { key: "refund_address", label: "Refund mailing address", wide: true },
];
const CONSENTS: FieldDef<Draft>[] = [
  { key: "criteria_notice_on", label: "Selection criteria given", kind: "date" }, { key: "criteria_ack_on", label: "Criteria acknowledged", kind: "date" },
  { key: "authorized_on", label: "Verification authorized", kind: "date" }, { key: "certified_on", label: "Info certified true", kind: "date" },
];
const LEASE: FieldDef<Draft>[] = [
  { key: "desired_move_in", label: "Desired move-in", kind: "date" }, { key: "lease_term_months", label: "Lease term (months)", kind: "number" },
  { key: "quoted_rent_cents", label: "Quoted rent / mo", kind: "money" }, { key: "quoted_deposit_cents", label: "Quoted deposit", kind: "money" },
  { key: "follow_up_date", label: "Follow up on", kind: "date" }, { key: "referral_source", label: "How they heard of us" },
];
const DECISION: FieldDef<Draft>[] = [
  { key: "decline_reason", label: "Decline reason", kind: "select", options: opts(DECLINE_REASON_LABELS) },
  { key: "notified_at", label: "Applicant told on", kind: "date" },
  { key: "notified_method", label: "Told by", kind: "select", options: opts(NOTIFIED_METHOD_LABELS) },
];
const VERIFICATION: FieldDef<Draft>[] = [
  { key: "income_verification_status", label: "Status", kind: "select", options: opts(VERIFICATION_LABELS) },
  { key: "verified_income_cents", label: "Verified gross / month", kind: "money" },
  { key: "verified_on", label: "Verified on", kind: "date" },
];

const blankIncome = (): IncomeSource => ({ type: "employment" });
const trimOrNull = (s: string | null | undefined) => s?.trim() || null;
// Untouched sections stay NULL so a save without edits records no changes.
const listOrNull = <T,>(xs: T[] | null | undefined) => (xs?.length ? xs : null);
const flagOrNull = (v: boolean | number | null | undefined) => (v == null ? null : !!v);

// Legacy applications carry one employer + income; show them as the first income row.
function draftFrom(a?: Application): Partial<Application> {
  if (!a) return { income_verification_status: "not_started" };
  if (a.incomes?.length || !(a.employer || a.monthly_income)) return { ...a };
  return { ...a, incomes: [{ type: "employment", employer: a.employer, monthly_cents: a.monthly_income ? Math.round(a.monthly_income * 100) : null }] };
}

/** The editable fields only; joined names and server stamps never go back. */
function payload(d: Partial<Application>): NewApplication {
  const incomes = d.incomes ?? [];
  const total = householdIncomeCents({ incomes, monthly_income: d.monthly_income ?? null });
  return {
    first_name: d.first_name?.trim() ?? "", last_name: d.last_name?.trim() ?? "",
    email: trimOrNull(d.email), phone: trimOrNull(d.phone), former_names: trimOrNull(d.former_names),
    unit_id: d.unit_id ?? null, desired_move_in: d.desired_move_in || null, follow_up_date: d.follow_up_date || null,
    lease_term_months: d.lease_term_months ?? null, quoted_rent_cents: d.quoted_rent_cents ?? null,
    quoted_deposit_cents: d.quoted_deposit_cents ?? null, referral_source: trimOrNull(d.referral_source),
    active_military: flagOrNull(d.active_military), smoker: flagOrNull(d.smoker), notes: trimOrNull(d.notes),
    co_applicants: listOrNull(d.co_applicants?.filter((x) => x.name?.trim())), occupants: listOrNull(d.occupants?.filter((x) => x.name?.trim())),
    emergency_contact: d.emergency_contact ?? null, residences: listOrNull(d.residences), incomes: listOrNull(incomes),
    pets: listOrNull(d.pets), vehicles: listOrNull(d.vehicles), personal_references: listOrNull(d.personal_references),
    disclosures: d.disclosures ?? null, guarantor: d.guarantor ?? null,
    // Kept for the list column and the tenant prefill.
    monthly_income: total == null ? null : total / 100,
    employer: incomes.find((i) => i.type === "employment" && i.employer)?.employer ?? null,
    fee_cents: d.fee_cents ?? null, fee_paid_on: d.fee_paid_on || null, deposit_cents: d.deposit_cents ?? null,
    deposit_paid_on: d.deposit_paid_on || null, deposit_outcome: d.deposit_outcome ?? null,
    deposit_refunded_on: d.deposit_refunded_on || null, refund_address: trimOrNull(d.refund_address),
    criteria_notice_on: d.criteria_notice_on || null, criteria_ack_on: d.criteria_ack_on || null,
    authorized_on: d.authorized_on || null, certified_on: d.certified_on || null, completed_on: d.completed_on || null,
    conditions: trimOrNull(d.conditions), decline_reason: d.decline_reason ?? null, decline_notes: trimOrNull(d.decline_notes),
    notified_at: d.notified_at || null, notified_method: d.notified_method ?? null,
    income_verification_status: d.income_verification_status ?? "not_started",
    verified_income_cents: d.verified_income_cents ?? null, verified_on: d.verified_on || null,
  };
}

export function ApplicationDialog({ open, onOpenChange, application, onSaved }: Props) {
  const app = useApp();
  const [units, setUnits] = useState<Unit[]>([]);
  const [draft, setDraft] = useState<Partial<Application>>({});
  const [tab, setTab] = useState("applicant");
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    app.listUnits().then(setUnits).catch((err) => app.setError((err as Error).message));
  }, [open, app]);

  useEffect(() => {
    if (!open) return;
    setDraft(draftFrom(application));
    setTab("applicant");
    setProblem(null);
  }, [open, application]);

  const set = (patch: Partial<Application>) => setDraft((d) => ({ ...d, ...patch }));
  const money = (cents: number | null | undefined) => (cents == null ? "—" : formatMoney(cents / 100, app.settings.currency));

  async function save(status?: ApplicationStatus) {
    const nextStatus = status ?? draft.status;
    if (nextStatus === "declined" && draft.decline_reason === "other" && !draft.decline_notes?.trim()) {
      setTab("decision");
      setProblem("Add notes explaining the decline reason.");
      return;
    }
    setSaving(true);
    try {
      const data = status ? { ...payload(draft), status } : payload(draft);
      if (application) await app.updateApplication(application.id, data);
      else await app.createApplication(data);
      onSaved?.();
      onOpenChange(false);
    } catch (err) {
      setProblem((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!application) return;
    if (!confirm(`Delete the application from ${application.first_name} ${application.last_name}?`)) return;
    try {
      await app.deleteApplication(application.id);
      onSaved?.();
      onOpenChange(false);
    } catch (err) {
      setProblem((err as Error).message);
    }
  }

  const canSave = !saving && !!draft.first_name?.trim() && !!draft.last_name?.trim();
  const missing = missingForComplete(draft);
  const deadline = decideBy(draft.completed_on);
  const income = householdIncomeCents({ incomes: draft.incomes ?? [], monthly_income: draft.monthly_income ?? null });
  const check = incomeCheck(draft as Application, app.settings.application_income_multiple);
  const setDisclosure = (key: DisclosureKey, patch: Partial<Disclosure>) =>
    set({ disclosures: { ...draft.disclosures, [key]: { answer: null, ...draft.disclosures?.[key], ...patch } } });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {application ? `Application · ${application.status}` : "New application"}
          </DialogTitle>
        </DialogHeader>
        <p className="text-xs text-muted-foreground">
          Don't record race, religion, national origin, sex, disability, familial status, citizenship, marital status, SSN or date of birth, including in notes.
        </p>
        {problem && <p role="alert" className="text-sm text-destructive">{problem}</p>}

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="flex h-auto flex-wrap justify-start">
            <TabsTrigger value="applicant">Applicant</TabsTrigger>
            <TabsTrigger value="household">Household</TabsTrigger>
            <TabsTrigger value="history">History</TabsTrigger>
            <TabsTrigger value="income">Income</TabsTrigger>
            <TabsTrigger value="pets">Pets & vehicles</TabsTrigger>
            <TabsTrigger value="disclosures">Disclosures</TabsTrigger>
            <TabsTrigger value="fees">Fees & consents</TabsTrigger>
            <TabsTrigger value="decision">Decision</TabsTrigger>
          </TabsList>

          <TabsContent value="applicant" className="space-y-3 pt-2">
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <div>
                <Label htmlFor="a-first">First name</Label>
                <Input id="a-first" value={draft.first_name ?? ""} onChange={(e) => set({ first_name: e.target.value })} required />
              </div>
              <div>
                <Label htmlFor="a-last">Last name</Label>
                <Input id="a-last" value={draft.last_name ?? ""} onChange={(e) => set({ last_name: e.target.value })} required />
              </div>
              <div>
                <Label htmlFor="a-email">Email</Label>
                <Input id="a-email" type="email" value={draft.email ?? ""} onChange={(e) => set({ email: e.target.value })} />
              </div>
              <div>
                <Label htmlFor="a-phone">Phone</Label>
                <Input id="a-phone" value={draft.phone ?? ""} onChange={(e) => set({ phone: e.target.value })} />
              </div>
              <div className="col-span-2">
                <Label htmlFor="a-former">Former names</Label>
                <Input id="a-former" value={draft.former_names ?? ""} onChange={(e) => set({ former_names: e.target.value })} />
              </div>
              <div className="col-span-2">
                <Label htmlFor="a-unit">Property · Unit</Label>
                <Select value={draft.unit_id ? String(draft.unit_id) : NO_UNIT} onValueChange={(v) => set({ unit_id: v === NO_UNIT ? null : Number(v) })}>
                  <SelectTrigger id="a-unit"><SelectValue placeholder="Pick a unit" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_UNIT}>No unit yet</SelectItem>
                    {units.map((u) => (
                      <SelectItem key={u.id} value={String(u.id)}>
                        {u.property_name ?? "—"} · {u.name}{u.status === "vacant" ? " (vacant)" : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <FieldGrid value={draft} onChange={setDraft} fields={LEASE} idPrefix="a-lease" />
            <div>
              <Label htmlFor="a-notes">Notes</Label>
              <Textarea id="a-notes" value={draft.notes ?? ""} onChange={(e) => set({ notes: e.target.value })} rows={2} />
            </div>
          </TabsContent>

          <TabsContent value="household" className="space-y-4 pt-2">
            <Section title="Co-applicants" hint="Every adult who will live there applies. One decision covers everyone.">
              <ListEditor items={draft.co_applicants} onChange={(v) => set({ co_applicants: v })} blank={() => ({ name: "" })}
                fields={CO_APPLICANT} idPrefix="a-co" addLabel="Add co-applicant" empty="No co-applicants." />
            </Section>
            <Section title="Other occupants" hint="Names and whether each is under 18. No ages or birth dates.">
              <ListEditor items={draft.occupants} onChange={(v) => set({ occupants: v })} blank={() => ({ name: "", minor: false })}
                fields={OCCUPANT} idPrefix="a-occ" addLabel="Add occupant" empty="No other occupants." />
            </Section>
            <Section title="Emergency contact">
              <FieldGrid value={draft.emergency_contact ?? {}} onChange={(v) => set({ emergency_contact: v })} fields={EMERGENCY} idPrefix="a-emerg" />
            </Section>
            <Section title="Other">
              <div className="flex flex-wrap gap-6 text-sm">
                <label className="flex items-center gap-2">
                  <input type="checkbox" className="h-4 w-4 accent-primary" checked={!!draft.active_military} onChange={(e) => set({ active_military: e.target.checked })} />
                  Active military
                </label>
                <label className="flex items-center gap-2">
                  <input type="checkbox" className="h-4 w-4 accent-primary" checked={!!draft.smoker} onChange={(e) => set({ smoker: e.target.checked })} />
                  Smoker
                </label>
              </div>
            </Section>
          </TabsContent>

          <TabsContent value="history" className="space-y-4 pt-2">
            <Section title="Residence history" hint="Most recent first; about three years.">
              <ListEditor items={draft.residences} onChange={(v) => set({ residences: v })} blank={() => ({})}
                fields={RESIDENCE} idPrefix="a-res" addLabel="Add residence" empty="No residences recorded." />
            </Section>
            <Section title="References">
              <ListEditor items={draft.personal_references} onChange={(v) => set({ personal_references: v })} blank={() => ({})}
                fields={REFERENCE} idPrefix="a-ref" addLabel="Add reference" empty="No references." />
            </Section>
          </TabsContent>

          <TabsContent value="income" className="space-y-4 pt-2">
            <Section title="Household income" hint="Gross monthly, for the applicant and every co-applicant.">
              <ListEditor items={draft.incomes} onChange={(v) => set({ incomes: v })} blank={blankIncome}
                fields={INCOME} idPrefix="a-inc" addLabel="Add income" empty="No income recorded." />
              <p className="text-sm">
                Total {money(income)}/mo
                {check && (
                  <span className={check.meets ? "text-emerald-700" : "text-destructive"}>
                    {" "}· {check.ratio.toFixed(1)}× rent ({check.meets ? "meets" : "below"} the {app.settings.application_income_multiple}× criteria)
                  </span>
                )}
              </p>
            </Section>
            <Section title="Guarantor" hint="Optional. Shown separately; not counted in household income.">
              <FieldGrid value={draft.guarantor ?? {}} onChange={(v) => set({ guarantor: v })} fields={GUARANTOR} idPrefix="a-guar" />
            </Section>
            <Section title="Income verification" hint="Record what you checked. Document collection and verification services come in a later phase.">
              <FieldGrid value={draft} onChange={setDraft} fields={VERIFICATION} idPrefix="a-verif" />
              {application?.verified_by_name && draft.income_verification_status === "verified" && (
                <p className="text-xs text-muted-foreground">Marked verified by {application.verified_by_name}.</p>
              )}
            </Section>
          </TabsContent>

          <TabsContent value="pets" className="space-y-4 pt-2">
            <Section title="Pets" hint="Assistance animals aren't pets; handle those as accommodation requests, not here.">
              <ListEditor items={draft.pets} onChange={(v) => set({ pets: v })} blank={() => ({})}
                fields={PET} idPrefix="a-pet" addLabel="Add pet" empty="No pets." />
            </Section>
            <Section title="Vehicles">
              <ListEditor items={draft.vehicles} onChange={(v) => set({ vehicles: v })} blank={() => ({})}
                fields={VEHICLE} idPrefix="a-veh" addLabel="Add vehicle" empty="No vehicles." />
            </Section>
          </TabsContent>

          <TabsContent value="disclosures" className="space-y-3 pt-2">
            <p className="text-xs text-muted-foreground">Record the applicant's answers. Decide using your written criteria, applied the same way to everyone.</p>
            {DISCLOSURE_QUESTIONS.map((q) => {
              const d = draft.disclosures?.[q.key];
              const answer = d?.answer == null ? "none" : d.answer ? "yes" : "no";
              return (
                <div key={q.key} className="grid gap-2 md:grid-cols-[1fr_7rem_1.4fr] md:items-center">
                  <Label htmlFor={`a-disc-${q.key}`}>{q.label}</Label>
                  <Select value={answer} onValueChange={(v) => setDisclosure(q.key, { answer: v === "none" ? null : v === "yes" })}>
                    <SelectTrigger id={`a-disc-${q.key}`}><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">—</SelectItem>
                      <SelectItem value="no">No</SelectItem>
                      <SelectItem value="yes">Yes</SelectItem>
                    </SelectContent>
                  </Select>
                  <Input
                    aria-label={`${q.label} explanation`}
                    placeholder={d?.answer ? "Explanation" : ""}
                    value={d?.explanation ?? ""}
                    onChange={(e) => setDisclosure(q.key, { explanation: e.target.value || null })}
                  />
                </div>
              );
            })}
          </TabsContent>

          <TabsContent value="fees" className="space-y-4 pt-2">
            <Section title="Fee and deposit" hint="The fee isn't refundable. If the applicant is declined and never got your selection criteria, refund both (Tex. Prop. Code §92.3515).">
              <FieldGrid value={draft} onChange={setDraft} fields={FEES} idPrefix="a-fee" />
            </Section>
            <Section title="Notices and consents" hint="Dates the applicant received or signed each.">
              <FieldGrid value={draft} onChange={setDraft} fields={CONSENTS} idPrefix="a-consent" />
            </Section>
            <Section title="Complete application" hint="Texas: decide within 7 days of a complete application or it counts as rejected (§92.352).">
              {missing.length > 0 && <p className="text-sm text-amber-700">Still needed: {missing.join(", ")}.</p>}
              <div className="flex flex-wrap items-end gap-3">
                <div>
                  <Label htmlFor="a-complete">Complete on</Label>
                  <Input id="a-complete" type="date" value={draft.completed_on ?? ""} onChange={(e) => set({ completed_on: e.target.value || null })} />
                </div>
                <Button type="button" variant="outline" size="sm" disabled={missing.length > 0} onClick={() => set({ completed_on: toIsoDate(new Date()) })}>
                  Mark complete today
                </Button>
                {deadline && <p className="pb-2 text-sm">Decide by <span className="font-medium">{formatDate(deadline)}</span></p>}
              </div>
            </Section>
          </TabsContent>

          <TabsContent value="decision" className="space-y-4 pt-2">
            {application?.decided_at && (
              <p className="text-sm text-muted-foreground">
                {application.status === "approved" ? "Approved" : "Declined"} {formatDate(application.decided_at.slice(0, 10))}
                {application.decided_by_name ? ` by ${application.decided_by_name}` : ""}.
              </p>
            )}
            <div>
              <Label htmlFor="a-conditions">Approval conditions</Label>
              <Input id="a-conditions" placeholder="e.g. guarantor required, additional deposit" value={draft.conditions ?? ""} onChange={(e) => set({ conditions: e.target.value })} />
            </div>
            <FieldGrid value={draft} onChange={setDraft} fields={DECISION} idPrefix="a-dec" />
            <div>
              <Label htmlFor="a-decline-notes">Decline notes</Label>
              <Textarea id="a-decline-notes" rows={2} value={draft.decline_notes ?? ""} onChange={(e) => set({ decline_notes: e.target.value })} />
            </div>
          </TabsContent>
        </Tabs>

        {application && (
          <div className="flex flex-wrap items-center gap-2 border-t pt-3">
            <span className="text-xs text-muted-foreground">Save and move to:</span>
            {NEXT_STATUSES[application.status].map((n) => (
              <Button key={n.to} type="button" size="sm" variant="outline" disabled={!canSave} onClick={() => save(n.to)}>
                {n.label}
              </Button>
            ))}
          </div>
        )}
        <DialogFooter className="mt-2">
          {application && (
            <Button type="button" variant="ghost" className="text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={remove}>
              Delete
            </Button>
          )}
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button type="button" onClick={() => save()} disabled={!canSave}>
            {application ? "Save changes" : "Create application"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="space-y-2">
      <div>
        <h3 className="text-sm font-semibold">{title}</h3>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </div>
      {children}
    </section>
  );
}
