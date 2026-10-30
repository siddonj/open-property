import { useEffect, useMemo, useState } from "react";
import { Plus, X } from "lucide-react";
import { useApp } from "@/context";
import { centsToInput, cn, formatCents, formatDate, parseCents, toIsoDate } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { Account, Bill, NewBill, Unit } from "@/types";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bill?: Bill;
  accounts: Account[];
  /** Starting values for a new bill, e.g. from a completed work order. */
  prefill?: BillPrefill;
  onSaved?: () => void;
}

export interface BillPrefill {
  property_id: number;
  vendor_id: number | null;
  bill_date: string;
  line: { description: string; unit_id: number | null; amount_cents: number; work_order_id: number; work_order_title: string };
}

interface LineDraft {
  key: number;
  account_id: string;
  description: string;
  unit_id: string;
  amount: string;
  work_order_id: number | null;
}

const NONE = "none";
const DEFAULT_ACCOUNT_CODE = "6520"; // Contracts (vendor repairs and services)

export const PAYMENT_METHOD_LABELS = { check: "Check", ach: "ACH", card: "Card", cash: "Cash", other: "Other" } as const;

/** Accounts a bill line can use, grouped as the P&L shows them. */
export function accountGroups(accounts: Account[]) {
  return [
    { label: "Operating expenses", items: accounts.filter((a) => a.type === "expense" && a.is_operating) },
    { label: "Below NOI", items: accounts.filter((a) => a.type === "expense" && !a.is_operating) },
    { label: "Capital", items: accounts.filter((a) => a.type === "asset") },
  ];
}

let nextKey = 1;

export function BillDialog({ open, onOpenChange, bill, accounts, prefill, onSaved }: Props) {
  const app = useApp();
  const [current, setCurrent] = useState<Bill | undefined>(bill);
  const [units, setUnits] = useState<Unit[]>([]);
  const [propertyId, setPropertyId] = useState("");
  const [vendorId, setVendorId] = useState(NONE);
  const [billDate, setBillDate] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<LineDraft[]>([]);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const defaultAccount = String(accounts.find((a) => a.code === DEFAULT_ACCOUNT_CODE)?.id ?? "");
  const blankLine = (): LineDraft => ({ key: nextKey++, account_id: defaultAccount, description: "", unit_id: NONE, amount: "", work_order_id: null });

  useEffect(() => {
    if (!open) return;
    app.listUnits().then(setUnits).catch(() => setUnits([]));
    setCurrent(bill);
    const start = bill ? undefined : prefill;
    setPropertyId(bill ? String(bill.property_id) : start ? String(start.property_id) : "");
    setVendorId(bill?.vendor_id ? String(bill.vendor_id) : start?.vendor_id ? String(start.vendor_id) : NONE);
    setBillDate(bill?.bill_date ?? start?.bill_date ?? toIsoDate(new Date()));
    setDueDate(bill?.due_date ?? "");
    setReference(bill?.reference ?? "");
    setNotes(bill?.notes ?? "");
    setLines(bill?.lines.length
      ? bill.lines.map((l) => ({
          key: nextKey++, account_id: String(l.account_id), description: l.description,
          unit_id: l.unit_id ? String(l.unit_id) : NONE, amount: centsToInput(l.amount_cents), work_order_id: l.work_order_id,
        }))
      : start
        ? [{ ...blankLine(), description: start.line.description, unit_id: start.line.unit_id ? String(start.line.unit_id) : NONE,
            amount: centsToInput(start.line.amount_cents), work_order_id: start.line.work_order_id }]
        : [blankLine()]);
    setFormError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, bill, prefill]);

  const propertyUnits = useMemo(() => units.filter((u) => String(u.property_id) === propertyId), [units, propertyId]);
  const groups = useMemo(() => accountGroups(accounts), [accounts]);

  const parsed = lines.map((l) => parseCents(l.amount));
  const total = parsed.reduce<number>((s, c) => s + (c ?? 0), 0);
  const livePayments = current?.payments.some((p) => !p.voided_at) ?? false;
  const readOnly = livePayments;
  const canSave = !readOnly && !!propertyId && !!billDate
    && lines.every((l, i) => l.account_id && l.description.trim() && (parsed[i] ?? 0) > 0);
  const money = (c: number) => formatCents(c, app.settings.currency);
  const linkedTitle = current ? current.lines.find((x) => x.work_order_title)?.work_order_title : prefill?.line.work_order_title;

  const setLine = (key: number, patch: Partial<LineDraft>) =>
    setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  async function save() {
    if (!canSave) return;
    setSaving(true);
    setFormError(null);
    try {
      const payload: NewBill = {
        property_id: Number(propertyId),
        vendor_id: vendorId === NONE ? null : Number(vendorId),
        bill_date: billDate,
        due_date: dueDate || null,
        reference: reference.trim() || null,
        notes: notes.trim() || null,
        lines: lines.map((l, i) => ({
          account_id: Number(l.account_id),
          description: l.description.trim(),
          amount_cents: parsed[i] as number,
          unit_id: l.unit_id === NONE ? null : Number(l.unit_id),
          work_order_id: l.work_order_id,
        })),
      };
      if (current) await app.updateBill(current.id, payload);
      else await app.createBill(payload);
      onSaved?.();
      onOpenChange(false);
    } catch (err) {
      setFormError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!current || !confirm("Delete this bill?")) return;
    try {
      await app.deleteBill(current.id);
      onSaved?.();
      onOpenChange(false);
    } catch (err) {
      setFormError((err as Error).message);
    }
  }

  async function voidPayment(paymentId: number) {
    if (!confirm("Void this payment? It stays on record but no longer counts as paid.")) return;
    try {
      setCurrent(await app.voidBillPayment(paymentId));
      onSaved?.();
    } catch (err) {
      setFormError((err as Error).message);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>{current ? "Bill" : "New bill"}</DialogTitle>
          <DialogDescription>
            {readOnly
              ? "This bill has payments, so it's read-only. Void payments to edit."
              : "Code each line to an account. A one-off expense is a bill with one line."}
          </DialogDescription>
        </DialogHeader>

        <fieldset disabled={readOnly} className="grid gap-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Property</Label>
              <Select value={propertyId} onValueChange={(v) => { setPropertyId(v); setLines((ls) => ls.map((l) => ({ ...l, unit_id: NONE }))); }} disabled={readOnly}>
                <SelectTrigger aria-label="Property"><SelectValue placeholder="Pick a property" /></SelectTrigger>
                <SelectContent>
                  {app.properties.map((p) => <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Vendor</Label>
              <Select value={vendorId} onValueChange={setVendorId} disabled={readOnly}>
                <SelectTrigger aria-label="Vendor"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>No vendor</SelectItem>
                  {app.vendors.map((v) => <SelectItem key={v.id} value={String(v.id)}>{v.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label htmlFor="bill-date">Bill date</Label>
              <Input id="bill-date" type="date" value={billDate} onChange={(e) => setBillDate(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="bill-due">Due date</Label>
              <Input id="bill-due" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="bill-ref">Reference</Label>
              <Input id="bill-ref" value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Invoice #" maxLength={100} />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Lines</Label>
            {lines.map((l, i) => (
              <div key={l.key} className="grid grid-cols-[minmax(0,1.3fr)_minmax(0,1.4fr)_minmax(0,0.9fr)_7rem_2rem] items-center gap-2">
                <Select value={l.account_id} onValueChange={(v) => setLine(l.key, { account_id: v })} disabled={readOnly}>
                  <SelectTrigger aria-label={`Line ${i + 1} account`}><SelectValue placeholder="Account" /></SelectTrigger>
                  <SelectContent>
                    {groups.map((g) => (
                      <SelectGroup key={g.label}>
                        <SelectLabel>{g.label}</SelectLabel>
                        {g.items.map((a) => (
                          <SelectItem key={a.id} value={String(a.id)}>
                            <span className="tabular-nums text-muted-foreground">{a.code}</span> {a.name}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    ))}
                  </SelectContent>
                </Select>
                <Input aria-label={`Line ${i + 1} description`} value={l.description} placeholder="Description" maxLength={200}
                  onChange={(e) => setLine(l.key, { description: e.target.value })} />
                <Select value={l.unit_id} onValueChange={(v) => setLine(l.key, { unit_id: v })} disabled={readOnly || propertyUnits.length === 0}>
                  <SelectTrigger aria-label={`Line ${i + 1} unit`}><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>Whole property</SelectItem>
                    {propertyUnits.map((u) => <SelectItem key={u.id} value={String(u.id)}>{u.name}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Input aria-label={`Line ${i + 1} amount`} inputMode="decimal" placeholder="0.00" value={l.amount}
                  className={cn("text-right tabular-nums", l.amount && parsed[i] == null && "border-destructive")}
                  onChange={(e) => setLine(l.key, { amount: e.target.value })} />
                <Button type="button" variant="ghost" size="icon" aria-label={`Remove line ${i + 1}`}
                  disabled={readOnly || lines.length === 1} onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ))}
            <div className="flex items-center justify-between">
              {readOnly ? <span /> : (
                <Button type="button" variant="ghost" size="sm" onClick={() => setLines((ls) => [...ls, blankLine()])}>
                  <Plus className="mr-1 h-4 w-4" /> Add line
                </Button>
              )}
              <span className="text-sm">Total <span className="ml-2 font-semibold tabular-nums">{money(total)}</span></span>
            </div>
            {lines.some((l) => l.work_order_id) && linkedTitle && (
              <p className="text-xs text-muted-foreground">Linked to work order "{linkedTitle}".</p>
            )}
          </div>

          <div>
            <Label htmlFor="bill-notes">Notes</Label>
            <Textarea id="bill-notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
          </div>
        </fieldset>

        {current && current.payments.length > 0 && (
          <div className="space-y-1 rounded-md border p-3">
            <p className="text-sm font-medium">Payments</p>
            {current.payments.map((p) => (
              <div key={p.id} className={cn("flex items-center justify-between text-sm", p.voided_at && "text-muted-foreground line-through")}>
                <span>
                  {formatDate(p.paid_on)} · {PAYMENT_METHOD_LABELS[p.method]}{p.reference ? ` · ${p.reference}` : ""}
                  {p.voided_at && <span className="ml-2 no-underline">(voided)</span>}
                </span>
                <span className="flex items-center gap-2">
                  <span className="tabular-nums">{money(p.amount_cents)}</span>
                  {!p.voided_at && (
                    <Button type="button" variant="ghost" size="sm" className="h-7 text-destructive hover:text-destructive" onClick={() => voidPayment(p.id)}>
                      Void
                    </Button>
                  )}
                </span>
              </div>
            ))}
          </div>
        )}

        {formError && (
          <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {formError}
          </p>
        )}
        <DialogFooter className="mt-2">
          {current && current.payments.length === 0 && (
            <Button type="button" variant="ghost" className="text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={remove}>
              Delete
            </Button>
          )}
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>{readOnly ? "Close" : "Cancel"}</Button>
          {!readOnly && (
            <Button type="button" onClick={save} disabled={saving || !canSave}>
              {current ? "Save changes" : "Create bill"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
