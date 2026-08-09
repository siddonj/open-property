import { useEffect, useMemo, useState } from "react";
import { useApp } from "@/context";
import { formatDate, formatMoney } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { DelinquencyRow } from "@/types";

const BUCKETS = [
  { label: "0–30 days", min: 0, max: 30 },
  { label: "31–60 days", min: 31, max: 60 },
  { label: "61–90 days", min: 61, max: 90 },
  { label: "90+ days", min: 91, max: Infinity },
];

export function DelinquencyTab() {
  const app = useApp();
  const [rows, setRows] = useState<DelinquencyRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const report = await app.getDelinquencyReport();
        setRows(report.rows);
      } catch (err) {
        app.setError((err as Error).message);
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const buckets = useMemo(() => {
    return BUCKETS.map((b) => ({
      ...b,
      rows: rows.filter((r) => r.days_overdue >= b.min && r.days_overdue <= b.max),
    })).filter((b) => b.rows.length > 0);
  }, [rows]);

  const total = useMemo(() => rows.reduce((s, r) => s + r.balance, 0), [rows]);

  if (loading) return <div className="p-8 text-center text-sm text-muted-foreground">Loading…</div>;
  if (rows.length === 0) return <div className="p-8 text-center text-sm text-muted-foreground">No overdue charges.</div>;

  return (
    <div className="space-y-6">
      {buckets.map((b) => (
        <Card key={b.label}>
          <div className="flex items-center justify-between border-b p-4">
            <h2 className="text-sm font-semibold">{b.label}</h2>
            <span className="text-sm font-semibold tabular-nums text-rose-700">
              {formatMoney(b.rows.reduce((s, r) => s + r.balance, 0), app.settings.currency)}
            </span>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tenant</TableHead>
                <TableHead>Property · Unit</TableHead>
                <TableHead>Due date</TableHead>
                <TableHead className="text-right">Days overdue</TableHead>
                <TableHead className="text-right">Balance</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {b.rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>{[r.tenant_first_name, r.tenant_last_name].filter(Boolean).join(" ") || "—"}</TableCell>
                  <TableCell>
                    <span className="text-muted-foreground">{r.property_name}</span>
                    <span className="px-1 text-muted-foreground/40">·</span>
                    <span className="font-medium">{r.unit_name}</span>
                  </TableCell>
                  <TableCell>{formatDate(r.due_date)}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.days_overdue}</TableCell>
                  <TableCell className="text-right tabular-nums text-rose-700">{formatMoney(r.balance, app.settings.currency)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      ))}

      <div className="flex items-center justify-between rounded-md border bg-muted/40 px-4 py-3">
        <span className="text-sm font-semibold">Total overdue</span>
        <span className="text-sm font-semibold tabular-nums text-rose-700">{formatMoney(total, app.settings.currency)}</span>
      </div>
    </div>
  );
}
