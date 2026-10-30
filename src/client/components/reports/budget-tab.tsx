import { useEffect, useMemo, useState } from "react";
import { Download } from "lucide-react";
import { useApp } from "@/context";
import { centsToInput, cn, downloadCsv, formatCents, parseCents } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { BudgetReportLine } from "@/types";

type Group = BudgetReportLine["group"];
const GROUPS: { key: Group; label: string }[] = [
  { key: "income", label: "Income" },
  { key: "operating", label: "Operating expenses" },
  { key: "below_noi", label: "Below NOI" },
  { key: "capital", label: "Capital spending" },
];

/** Typed budget text → cents, null for blank (no budget), undefined when invalid. */
const draftCents = (text: string): number | null | undefined => (text.trim() === "" ? null : parseCents(text) ?? undefined);

const percentUsed = (l: { budget_cents: number | null; actual_cents: number }) =>
  l.budget_cents ? Math.round((l.actual_cents / l.budget_cents) * 100) : null;

function groupTotals(lines: BudgetReportLine[]) {
  const budgeted = lines.filter((l) => l.budget_cents !== null);
  return {
    budget_cents: budgeted.reduce((s, l) => s + (l.budget_cents ?? 0), 0),
    actual_cents: lines.reduce((s, l) => s + l.actual_cents, 0),
    // Variance only over budgeted lines, so unbudgeted spend doesn't read as a shortfall twice.
    variance_cents: budgeted.reduce((s, l) => s + (l.variance_cents ?? 0), 0),
  };
}

export function BudgetTab() {
  const app = useApp();
  const thisYear = new Date().getFullYear();
  const [propertyId, setPropertyId] = useState(() => (app.properties[0] ? String(app.properties[0].id) : ""));
  const [year, setYear] = useState(thisYear);
  const [lines, setLines] = useState<BudgetReportLine[]>([]);
  const [drafts, setDrafts] = useState<Record<number, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  async function load() {
    if (!propertyId) return;
    try {
      setLoading(true);
      const report = await app.getBudgetReport(Number(propertyId), year);
      setLines(report.lines);
      setDrafts(Object.fromEntries(report.lines.map((l) => [l.account_id, l.budget_cents === null ? "" : centsToInput(l.budget_cents)])));
    } catch (err) {
      app.setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  // Properties may arrive after mount; default to the first one.
  useEffect(() => {
    if (!propertyId && app.properties[0]) setPropertyId(String(app.properties[0].id));
  }, [propertyId, app.properties]);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [propertyId, year]);

  const changed = useMemo(
    () => lines.filter((l) => draftCents(drafts[l.account_id] ?? "") !== l.budget_cents),
    [lines, drafts],
  );
  const invalid = changed.some((l) => draftCents(drafts[l.account_id] ?? "") === undefined);
  const money = (c: number) => formatCents(c, app.settings.currency);
  const propertyName = app.properties.find((p) => String(p.id) === propertyId)?.name ?? "";

  async function save() {
    if (!changed.length || invalid) return;
    setSaving(true);
    try {
      await app.saveBudget({
        property_id: Number(propertyId),
        year,
        lines: changed.map((l) => ({ account_id: l.account_id, amount_cents: draftCents(drafts[l.account_id] ?? "") as number | null })),
      });
      await load();
    } catch (err) {
      app.setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  function exportCsv() {
    const rows: Record<string, string | number>[] = GROUPS.flatMap((g) => {
      const items = lines.filter((l) => l.group === g.key);
      const t = groupTotals(items);
      return [
        ...items.map((l) => ({
          group: g.label, code: l.code, name: l.name,
          budget: l.budget_cents === null ? "" : l.budget_cents / 100,
          actual: l.actual_cents / 100,
          variance: l.variance_cents === null ? "" : l.variance_cents / 100,
          percent_used: percentUsed(l) ?? "",
        })),
        { group: g.label, code: "", name: "Total", budget: t.budget_cents / 100, actual: t.actual_cents / 100, variance: t.variance_cents / 100, percent_used: percentUsed(t) ?? "" },
      ];
    });
    downloadCsv(`budget-${year}-property-${propertyId}.csv`, rows, [
      { key: "group", label: "Group" },
      { key: "code", label: "Account" },
      { key: "name", label: "Name" },
      { key: "budget", label: "Budget" },
      { key: "actual", label: "Actual" },
      { key: "variance", label: "Variance" },
      { key: "percent_used", label: "% used" },
    ]);
  }

  if (!app.properties.length) {
    return <div className="p-8 text-center text-sm text-muted-foreground">Add a property to set a budget.</div>;
  }

  return (
    <Card>
      <div className="flex flex-col gap-3 border-b p-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-sm font-semibold">Budget vs actual · {propertyName} · {year}</h2>
          <p className="text-xs text-muted-foreground">
            Actuals use the P&amp;L rules: rent collected, and bill lines by bill date. Positive variance is favorable.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={propertyId} onValueChange={setPropertyId}>
            <SelectTrigger className="w-48" aria-label="Property"><SelectValue /></SelectTrigger>
            <SelectContent>
              {app.properties.map((p) => <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
            <SelectTrigger className="w-28" aria-label="Year"><SelectValue /></SelectTrigger>
            <SelectContent>
              {[thisYear - 2, thisYear - 1, thisYear, thisYear + 1].map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={exportCsv} disabled={lines.length === 0 || changed.length > 0}>
            <Download className="mr-1 h-4 w-4" /> Export CSV
          </Button>
          <Button size="sm" onClick={save} disabled={saving || invalid || changed.length === 0}>
            {changed.length ? `Save ${changed.length} change${changed.length === 1 ? "" : "s"}` : "Saved"}
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="p-8 text-center text-sm text-muted-foreground">Loading…</div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Account</TableHead>
              <TableHead className="w-40 text-right">Budget</TableHead>
              <TableHead className="text-right">Actual</TableHead>
              <TableHead className="text-right">Variance</TableHead>
              <TableHead className="w-24 text-right">% used</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {GROUPS.flatMap((g) => {
              const items = lines.filter((l) => l.group === g.key);
              const t = groupTotals(items);
              return [
                <TableRow key={g.key} className="bg-muted/30 hover:bg-muted/30">
                  <TableCell className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{g.label}</TableCell>
                  <TableCell className="text-right font-semibold tabular-nums">{money(t.budget_cents)}</TableCell>
                  <TableCell className="text-right font-semibold tabular-nums">{money(t.actual_cents)}</TableCell>
                  <TableCell className={cn("text-right font-semibold tabular-nums", t.variance_cents < 0 && "text-rose-600", t.variance_cents > 0 && "text-emerald-700")}>
                    {money(t.variance_cents)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">{percentUsed(t) === null ? "—" : `${percentUsed(t)}%`}</TableCell>
                </TableRow>,
                ...items.map((l) => {
                  const text = drafts[l.account_id] ?? "";
                  const bad = draftCents(text) === undefined;
                  const pct = percentUsed(l);
                  return (
                    <TableRow key={l.account_id}>
                      <TableCell><span className="mr-2 tabular-nums text-muted-foreground">{l.code}</span>{l.name}</TableCell>
                      <TableCell className="py-1">
                        <Input
                          aria-label={`${l.code} budget`}
                          inputMode="decimal"
                          placeholder="—"
                          value={text}
                          onChange={(e) => setDrafts((d) => ({ ...d, [l.account_id]: e.target.value }))}
                          className={cn("h-8 text-right tabular-nums", bad && "border-destructive")}
                        />
                      </TableCell>
                      <TableCell className={cn("text-right tabular-nums", !l.actual_cents && "text-muted-foreground")}>
                        {l.actual_cents ? money(l.actual_cents) : "—"}
                      </TableCell>
                      <TableCell className={cn("text-right tabular-nums",
                        l.variance_cents === null ? "text-muted-foreground" : l.variance_cents < 0 ? "text-rose-600" : l.variance_cents > 0 && "text-emerald-700")}>
                        {l.variance_cents === null ? (l.actual_cents ? "Unbudgeted" : "—") : money(l.variance_cents)}
                      </TableCell>
                      <TableCell className={cn("text-right tabular-nums", pct !== null && pct > 100 && g.key !== "income" ? "font-medium text-rose-600" : "text-muted-foreground")}>
                        {pct === null ? "—" : `${pct}%`}
                      </TableCell>
                    </TableRow>
                  );
                }),
              ];
            })}
          </TableBody>
        </Table>
      )}
    </Card>
  );
}
