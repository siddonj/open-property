import { useEffect, useMemo, useState } from "react";
import { Download } from "lucide-react";
import { useApp } from "@/context";
import { cn, downloadCsv, formatCents, formatPeriod } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { AccountGroup, ProfitLossMonth, ProfitLossReport } from "@/types";

const ALL = "all";

type MonthKey = Exclude<keyof ProfitLossMonth, "period">;
const COLUMNS: { key: MonthKey; label: string; tone?: string }[] = [
  { key: "rent_charged_cents", label: "Rent charged" },
  { key: "rent_collected_cents", label: "Rent collected", tone: "text-emerald-700" },
  { key: "operating_paid_cents", label: "Opex paid" },
  { key: "operating_unpaid_cents", label: "Opex unpaid", tone: "text-amber-700" },
  { key: "net_operating_cents", label: "Net operating" },
  { key: "below_noi_cents", label: "Mortgage interest" },
  { key: "capital_cents", label: "Capital" },
];

const GROUP_LABELS: Record<AccountGroup, string> = {
  operating: "Operating expenses",
  below_noi: "Below NOI",
  capital: "Capital spending",
};

/** 'YYYY-MM' for a Date in local time. */
const monthOf = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;

interface Props {
  initialPropertyId?: string;
  initialFrom?: string;
  initialTo?: string;
}

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

export function ProfitLossTab({ initialPropertyId, initialFrom, initialTo }: Props) {
  const app = useApp();
  const now = new Date();
  const [from, setFrom] = useState(() =>
    initialFrom && MONTH_RE.test(initialFrom) ? initialFrom : monthOf(new Date(now.getFullYear(), now.getMonth() - 11, 1)));
  const [to, setTo] = useState(() => (initialTo && MONTH_RE.test(initialTo) ? initialTo : monthOf(now)));
  const [propertyId, setPropertyId] = useState(initialPropertyId ?? ALL);
  const [report, setReport] = useState<ProfitLossReport | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!from || !to) return;
    (async () => {
      try {
        setLoading(true);
        setReport(await app.getProfitLossReport({ from, to, property_id: propertyId === ALL ? undefined : Number(propertyId) }));
      } catch (err) {
        app.setError((err as Error).message);
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from, to, propertyId]);

  const months = report?.months ?? [];
  const accounts = report?.accounts ?? [];
  const totals = useMemo(() => Object.fromEntries(
    COLUMNS.map((c) => [c.key, months.reduce((s, m) => s + m[c.key], 0)]),
  ) as Record<MonthKey, number>, [months]);
  const money = (c: number) => formatCents(c, app.settings.currency);
  const propertyName = propertyId === ALL ? "all properties" : app.properties.find((p) => String(p.id) === propertyId)?.name ?? "";
  const fileTag = `${from}_${to}${propertyId === ALL ? "" : `_property-${propertyId}`}`;

  function exportMonths() {
    const rows: Record<string, string | number>[] = months.map((m) => ({
      period: m.period, ...Object.fromEntries(COLUMNS.map((c) => [c.key, m[c.key] / 100])),
    }));
    rows.push({ period: "Total", ...Object.fromEntries(COLUMNS.map((c) => [c.key, totals[c.key] / 100])) });
    downloadCsv(`profit-loss-${fileTag}.csv`, rows, [{ key: "period", label: "Month" }, ...COLUMNS.map((c) => ({ key: c.key, label: c.label }))]);
  }

  function exportAccounts() {
    // Same order as the screen: each group's accounts, then its total.
    const rows: Record<string, string | number>[] = (Object.keys(GROUP_LABELS) as AccountGroup[]).flatMap((g) => {
      const items = accounts.filter((a) => a.group === g);
      return [
        ...items.map((a) => ({ group: GROUP_LABELS[g], code: a.code, name: a.name, amount: a.amount_cents / 100 })),
        { group: GROUP_LABELS[g], code: "", name: "Total", amount: items.reduce((s, a) => s + a.amount_cents, 0) / 100 },
      ];
    });
    downloadCsv(`profit-loss-accounts-${fileTag}.csv`, rows, [
      { key: "group", label: "Group" },
      { key: "code", label: "Account" },
      { key: "name", label: "Name" },
      { key: "amount", label: "Amount" },
    ]);
  }

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex flex-col gap-3 border-b p-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-sm font-semibold">Profit &amp; loss · {propertyName}</h2>
            <p className="text-xs text-muted-foreground">
              Rent by charge period; expenses by bill date. Net operating = rent collected − operating expenses.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Input type="month" className="w-40" aria-label="From month" value={from} onChange={(e) => setFrom(e.target.value)} />
            <span className="text-sm text-muted-foreground">to</span>
            <Input type="month" className="w-40" aria-label="To month" value={to} onChange={(e) => setTo(e.target.value)} />
            <Select value={propertyId} onValueChange={setPropertyId}>
              <SelectTrigger className="w-44" aria-label="Property"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All properties</SelectItem>
                {app.properties.map((p) => <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" onClick={exportMonths} disabled={months.length === 0}>
              <Download className="mr-1 h-4 w-4" /> Export CSV
            </Button>
          </div>
        </div>

        {loading ? (
          <div className="p-8 text-center text-sm text-muted-foreground">Loading…</div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Month</TableHead>
                {COLUMNS.map((c) => (
                  <TableHead key={c.key} className={cn("text-right", c.key === "below_noi_cents" && "border-l")}>{c.label}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {months.map((m) => (
                <TableRow key={m.period}>
                  <TableCell className="font-medium">{formatPeriod(m.period)}</TableCell>
                  {COLUMNS.map((c) => (
                    <TableCell key={c.key} className={cn(
                      "text-right tabular-nums", c.tone,
                      c.key === "net_operating_cents" && (m[c.key] < 0 ? "font-semibold text-rose-600" : "font-semibold"),
                      c.key === "below_noi_cents" && "border-l",
                      m[c.key] === 0 && "text-muted-foreground",
                    )}>
                      {m[c.key] === 0 ? "—" : money(m[c.key])}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
            <tfoot className="border-t bg-muted/40">
              <TableRow>
                <TableCell className="font-semibold">Total</TableCell>
                {COLUMNS.map((c) => (
                  <TableCell key={c.key} className={cn("text-right font-semibold tabular-nums", c.tone, c.key === "below_noi_cents" && "border-l",
                    c.key === "net_operating_cents" && totals[c.key] < 0 && "text-rose-600")}>
                    {money(totals[c.key])}
                  </TableCell>
                ))}
              </TableRow>
            </tfoot>
          </Table>
        )}
      </Card>

      <Card>
        <div className="flex items-center justify-between border-b p-4">
          <div>
            <h2 className="text-sm font-semibold">By account</h2>
            <p className="text-xs text-muted-foreground">Bill lines in the range, paid and unpaid</p>
          </div>
          <Button variant="outline" size="sm" onClick={exportAccounts} disabled={accounts.length === 0}>
            <Download className="mr-1 h-4 w-4" /> Export CSV
          </Button>
        </div>
        {!loading && accounts.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">No bills in this range.</div>
        ) : (
          <Table>
            <TableBody>
              {(Object.keys(GROUP_LABELS) as AccountGroup[]).map((g) => {
                const items = accounts.filter((a) => a.group === g);
                if (!items.length) return null;
                return [
                  <TableRow key={g} className="bg-muted/30 hover:bg-muted/30">
                    <TableCell colSpan={2} className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{GROUP_LABELS[g]}</TableCell>
                    <TableCell className="text-right font-semibold tabular-nums">{money(items.reduce((s, a) => s + a.amount_cents, 0))}</TableCell>
                  </TableRow>,
                  ...items.map((a) => (
                    <TableRow key={a.account_id}>
                      <TableCell className="w-20 tabular-nums text-muted-foreground">{a.code}</TableCell>
                      <TableCell>{a.name}</TableCell>
                      <TableCell className="text-right tabular-nums">{money(a.amount_cents)}</TableCell>
                    </TableRow>
                  )),
                ];
              })}
            </TableBody>
          </Table>
        )}
      </Card>
    </div>
  );
}
