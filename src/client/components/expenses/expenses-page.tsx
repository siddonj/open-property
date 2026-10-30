import { useEffect, useMemo, useState } from "react";
import { CalendarClock, Download, Plus, Wallet } from "lucide-react";
import { useApp } from "@/context";
import { cn, daysBetween, downloadCsv, formatCents, formatDate, toIsoDate } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BillDialog, PAYMENT_METHOD_LABELS, accountGroups } from "./bill-dialog";
import type { Account, Bill, BillPaymentMethod } from "@/types";

type Tab = "unpaid" | "overdue" | "paid" | "all";
const ALL = "all";

const balance = (b: Bill) => b.total_cents - b.paid_cents;
const isUnpaid = (b: Bill) => b.complete && b.status === "unpaid";
const isOverdue = (b: Bill, today: string) => isUnpaid(b) && !!b.due_date && b.due_date < today;
const sumBy = (rows: Bill[], f: (b: Bill) => number) => rows.reduce((s, b) => s + f(b), 0);

/** One account name, or "N lines" when a bill spans several accounts. */
function accountSummary(b: Bill): string {
  const codes = new Set(b.lines.map((l) => l.account_id));
  if (codes.size === 1 && b.lines[0]) return `${b.lines[0].account_code} ${b.lines[0].account_name}`;
  return `${b.lines.length} lines`;
}

export function ExpensesPage() {
  const app = useApp();
  const [bills, setBills] = useState<Bill[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("unpaid");
  const [propertyFilter, setPropertyFilter] = useState(ALL);
  const [vendorFilter, setVendorFilter] = useState(ALL);
  const [accountFilter, setAccountFilter] = useState(ALL);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Bill | undefined>(undefined);
  const [paying, setPaying] = useState<Bill | undefined>(undefined);
  const today = toIsoDate(new Date());

  async function load() {
    try {
      setLoading(true);
      const [b, a] = await Promise.all([app.listBills(), accounts.length ? Promise.resolve(accounts) : app.listAccounts()]);
      setBills(b);
      setAccounts(a);
    } catch (err) {
      app.setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Property/vendor/account/date filters apply first; tabs split the result by status.
  const scoped = useMemo(() => bills.filter((b) =>
    (propertyFilter === ALL || String(b.property_id) === propertyFilter)
    && (vendorFilter === ALL || String(b.vendor_id) === vendorFilter)
    && (accountFilter === ALL || b.lines.some((l) => String(l.account_id) === accountFilter))
    && (!from || b.bill_date >= from)
    && (!to || b.bill_date <= to),
  ), [bills, propertyFilter, vendorFilter, accountFilter, from, to]);

  const byTab = useMemo(() => ({
    unpaid: scoped.filter(isUnpaid),
    overdue: scoped.filter((b) => isOverdue(b, today)),
    paid: scoped.filter((b) => b.complete && b.status === "paid"),
    all: scoped,
  }), [scoped, today]);

  const rows = byTab[tab];
  // Incomplete bills are listed under All but never counted in totals.
  const counted = rows.filter((b) => b.complete);
  const total = sumBy(counted, (b) => b.total_cents);
  const paid = sumBy(counted, (b) => b.paid_cents);
  const filtersActive = propertyFilter !== ALL || vendorFilter !== ALL || accountFilter !== ALL || !!from || !!to;
  const money = (c: number) => formatCents(c, app.settings.currency);

  function exportCsv() {
    const data: Record<string, string | number>[] = counted.map((b) => ({
      date: b.bill_date,
      property: b.property_name ?? "",
      vendor: b.vendor_name ?? "",
      reference: b.reference ?? "",
      accounts: b.lines.map((l) => `${l.account_code} ${l.account_name}`).join("; "),
      description: b.lines.map((l) => l.description).join("; "),
      due_date: b.due_date ?? "",
      status: isOverdue(b, today) ? "overdue" : b.status,
      total: b.total_cents / 100,
      paid: b.paid_cents / 100,
      balance: balance(b) / 100,
    }));
    data.push({ date: "", property: "", vendor: "", reference: "", accounts: "", description: "Total", due_date: "", status: "", total: total / 100, paid: paid / 100, balance: (total - paid) / 100 });
    downloadCsv(`expenses-${tab}.csv`, data, [
      { key: "date", label: "Bill date" },
      { key: "property", label: "Property" },
      { key: "vendor", label: "Vendor" },
      { key: "reference", label: "Reference" },
      { key: "accounts", label: "Accounts" },
      { key: "description", label: "Description" },
      { key: "due_date", label: "Due date" },
      { key: "status", label: "Status" },
      { key: "total", label: "Total" },
      { key: "paid", label: "Paid" },
      { key: "balance", label: "Balance" },
    ]);
  }

  const openNew = () => { setEditing(undefined); setDialogOpen(true); };

  return (
    <div className="flex-1 overflow-auto">
      <div className="mx-auto w-full max-w-7xl space-y-6 p-6">
        <header className="flex items-end justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Expenses</h1>
            <p className="text-sm text-muted-foreground">
              {money(sumBy(byTab.unpaid, balance))} unpaid across {byTab.unpaid.length} bill{byTab.unpaid.length === 1 ? "" : "s"}
              {byTab.overdue.length > 0 && (
                <button
                  type="button"
                  onClick={() => setTab("overdue")}
                  className="ml-2 inline-flex items-center gap-1 rounded-full border border-rose-200 bg-rose-50 px-2 py-0.5 text-[11px] font-semibold text-rose-700 hover:bg-rose-100"
                >
                  <CalendarClock className="h-3 w-3" /> {byTab.overdue.length} overdue
                </button>
              )}
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={exportCsv} disabled={counted.length === 0}>
              <Download className="mr-1 h-4 w-4" /> Export CSV
            </Button>
            <Button onClick={openNew}>
              <Plus className="mr-1 h-4 w-4" /> New bill
            </Button>
          </div>
        </header>

        <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)}>
          <TabsList>
            {(["unpaid", "overdue", "paid", "all"] as const).map((t) => (
              <TabsTrigger key={t} value={t} className="capitalize">
                {t} <span className="ml-1.5 tabular-nums text-muted-foreground">{byTab[t].length}</span>
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        <div className="flex flex-wrap items-center gap-2">
          <Select value={propertyFilter} onValueChange={setPropertyFilter}>
            <SelectTrigger className="w-48" aria-label="Property"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All properties</SelectItem>
              {app.properties.map((p) => <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={vendorFilter} onValueChange={setVendorFilter}>
            <SelectTrigger className="w-48" aria-label="Vendor"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All vendors</SelectItem>
              {app.vendors.map((v) => <SelectItem key={v.id} value={String(v.id)}>{v.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={accountFilter} onValueChange={setAccountFilter}>
            <SelectTrigger className="w-56" aria-label="Account"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All accounts</SelectItem>
              {accountGroups(accounts).map((g) => (
                <SelectGroup key={g.label}>
                  <SelectLabel>{g.label}</SelectLabel>
                  {g.items.map((a) => <SelectItem key={a.id} value={String(a.id)}>{a.code} {a.name}</SelectItem>)}
                </SelectGroup>
              ))}
            </SelectContent>
          </Select>
          <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <Input type="date" className="w-40" aria-label="From date" value={from} onChange={(e) => setFrom(e.target.value)} />
            <span>to</span>
            <Input type="date" className="w-40" aria-label="To date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          {filtersActive && (
            <Button variant="ghost" size="sm" onClick={() => { setPropertyFilter(ALL); setVendorFilter(ALL); setAccountFilter(ALL); setFrom(""); setTo(""); }}>
              Clear filters
            </Button>
          )}
        </div>

        {loading ? (
          <Card className="p-8 text-center text-sm text-muted-foreground">Loading…</Card>
        ) : rows.length === 0 ? (
          <Card className="flex flex-col items-center justify-center gap-2 p-12 text-center">
            <Wallet className="h-7 w-7 text-muted-foreground" />
            <p className="font-medium">Nothing here</p>
            <p className="text-sm text-muted-foreground">
              {bills.length === 0 ? "No expenses yet. Record bills and costs for your properties." : "No bills match this filter."}
            </p>
            {bills.length === 0 && (
              <Button className="mt-2" onClick={openNew}><Plus className="mr-1 h-4 w-4" /> New bill</Button>
            )}
          </Card>
        ) : (
          <Card className="overflow-hidden p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-28">Bill date</TableHead>
                  <TableHead>Property · vendor</TableHead>
                  <TableHead>Account</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-right">Paid</TableHead>
                  <TableHead className="w-28"><span className="sr-only">Actions</span></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((b) => (
                  <TableRow key={b.id} className="cursor-pointer" onClick={() => { setEditing(b); setDialogOpen(true); }}>
                    <TableCell className="whitespace-nowrap tabular-nums text-muted-foreground">{formatDate(b.bill_date)}</TableCell>
                    <TableCell>
                      <div className="font-medium">{b.property_name}</div>
                      <div className="text-xs text-muted-foreground">
                        {b.vendor_name ?? "No vendor"}
                        {b.reference && <span> · {b.reference}</span>}
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      <div>{accountSummary(b)}</div>
                      {b.lines.length === 1 && <div className="text-xs">{b.lines[0].description}</div>}
                    </TableCell>
                    <TableCell className="whitespace-nowrap"><StatusLabel bill={b} today={today} /></TableCell>
                    <TableCell className="text-right font-medium tabular-nums">{money(b.total_cents)}</TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">{b.paid_cents ? money(b.paid_cents) : "—"}</TableCell>
                    <TableCell className="text-right">
                      {isUnpaid(b) && (
                        <Button size="sm" variant="outline" onClick={(ev) => { ev.stopPropagation(); setPaying(b); }}>
                          Mark paid
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
              <tfoot className="border-t bg-muted/40">
                <TableRow>
                  <TableCell colSpan={4} className="font-medium">
                    Total · {counted.length} bill{counted.length === 1 ? "" : "s"}
                  </TableCell>
                  <TableCell className="text-right font-semibold tabular-nums">{money(total)}</TableCell>
                  <TableCell className="text-right font-semibold tabular-nums">{money(paid)}</TableCell>
                  <TableCell />
                </TableRow>
              </tfoot>
            </Table>
          </Card>
        )}
      </div>

      <BillDialog open={dialogOpen} onOpenChange={setDialogOpen} bill={editing} accounts={accounts} onSaved={load} />
      <PayDialog bill={paying} onClose={() => setPaying(undefined)} onPaid={load} />
    </div>
  );
}

function StatusLabel({ bill: b, today }: { bill: Bill; today: string }) {
  if (!b.complete) {
    return <span className="rounded border border-amber-300 bg-amber-50 px-1.5 py-0.5 text-xs font-medium text-amber-800">Incomplete · re-save</span>;
  }
  if (b.status === "paid") {
    const last = b.payments.filter((p) => !p.voided_at).at(-1);
    return <span className="text-emerald-700">Paid{last ? ` ${formatDate(last.paid_on, { month: "short", day: "numeric" })}` : ""}</span>;
  }
  if (!b.due_date) return <span className="text-muted-foreground">{b.paid_cents ? "Partly paid" : "Unpaid"}</span>;
  const days = daysBetween(today, b.due_date);
  return (
    <span className={cn(days < 0 ? "font-medium text-rose-600" : days <= 7 ? "text-amber-700" : "text-muted-foreground")}>
      {days < 0 ? `Overdue · ${-days} day${days === -1 ? "" : "s"}` : days === 0 ? "Due today" : `Due ${formatDate(b.due_date, { month: "short", day: "numeric" })}`}
    </span>
  );
}

/** Records one payment for the bill's remaining balance. */
function PayDialog({ bill, onClose, onPaid }: { bill?: Bill; onClose: () => void; onPaid: () => void }) {
  const app = useApp();
  const [paidOn, setPaidOn] = useState("");
  const [method, setMethod] = useState<BillPaymentMethod>("check");
  const [reference, setReference] = useState("");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (!bill) return;
    setPaidOn(toIsoDate(new Date()));
    setMethod("check");
    setReference("");
    setFormError(null);
  }, [bill]);

  async function pay() {
    if (!bill || !paidOn) return;
    setSaving(true);
    setFormError(null);
    try {
      await app.payBill(bill.id, { paid_on: paidOn, method, reference: reference.trim() || null });
      onPaid();
      onClose();
    } catch (err) {
      setFormError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={!!bill} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Mark paid</DialogTitle>
          <DialogDescription>
            Records a payment of {bill ? formatCents(balance(bill), app.settings.currency) : ""} to {bill?.vendor_name ?? "this bill"}.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="pay-date">Paid on</Label>
              <Input id="pay-date" type="date" value={paidOn} onChange={(e) => setPaidOn(e.target.value)} />
            </div>
            <div>
              <Label>Method</Label>
              <Select value={method} onValueChange={(v) => setMethod(v as BillPaymentMethod)}>
                <SelectTrigger aria-label="Method"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(PAYMENT_METHOD_LABELS).map(([k, label]) => <SelectItem key={k} value={k}>{label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label htmlFor="pay-ref">Reference</Label>
            <Input id="pay-ref" value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Check or confirmation #" maxLength={100} />
          </div>
        </div>
        {formError && (
          <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {formError}
          </p>
        )}
        <DialogFooter className="mt-2">
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="button" onClick={pay} disabled={saving || !paidOn}>Record payment</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
