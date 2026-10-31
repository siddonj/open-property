import { useEffect, useMemo, useState } from "react";
import { useApp } from "@/context";
import { downloadCsv, formatMoney, formatPeriod } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Download } from "lucide-react";
import type { IncomeReportMonth } from "@/types";

const ALL = "all";

export function IncomeTab() {
  const app = useApp();
  const [months, setMonths] = useState<IncomeReportMonth[]>([]);
  const [loading, setLoading] = useState(true);
  const [propertyId, setPropertyId] = useState<string>(ALL);

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const report = await app.getIncomeReport({ property_id: propertyId === ALL ? undefined : Number(propertyId) });
        setMonths(report.months);
      } catch (err) {
        app.setError((err as Error).message);
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [propertyId]);

  const totals = useMemo(() => ({
    charged: months.reduce((s, m) => s + m.charged, 0),
    collected: months.reduce((s, m) => s + m.collected, 0),
    outstanding: months.reduce((s, m) => s + m.outstanding, 0),
  }), [months]);

  return (
    <Card>
      <div className="flex flex-col gap-3 border-b p-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-sm font-semibold">Last 12 months</h2>
          <p className="text-xs text-muted-foreground">Rent charged, collected, and outstanding per charge period</p>
        </div>
        <div className="flex gap-2">
          <Select value={propertyId} onValueChange={setPropertyId}>
            <SelectTrigger className="w-44" aria-label="Property"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All properties</SelectItem>
              {app.properties.map((p) => <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            size="sm"
            disabled={months.length === 0}
            onClick={() => downloadCsv(`income-report${propertyId === ALL ? "" : `-property-${propertyId}`}.csv`, months, [
              { key: "period", label: "Month" },
              { key: "charged", label: "Charged" },
              { key: "collected", label: "Collected" },
              { key: "outstanding", label: "Outstanding" },
            ])}
          >
            <Download className="mr-1 h-4 w-4" /> Export CSV
          </Button>
        </div>
      </div>
      {loading ? (
        <div className="p-8 text-center text-sm text-muted-foreground">Loading…</div>
      ) : months.length === 0 ? (
        <div className="p-8 text-center text-sm text-muted-foreground">No rent charges in the last 12 months.</div>
      ) : (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Month</TableHead>
                <TableHead className="text-right">Charged</TableHead>
                <TableHead className="text-right">Collected</TableHead>
                <TableHead className="text-right">Outstanding</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {months.map((m) => (
                <TableRow key={m.period}>
                  <TableCell className="font-medium">{formatPeriod(m.period)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatMoney(m.charged, app.settings.currency, true)}</TableCell>
                  <TableCell className="text-right tabular-nums text-emerald-700">{formatMoney(m.collected, app.settings.currency, true)}</TableCell>
                  <TableCell className="text-right tabular-nums text-amber-700">{formatMoney(m.outstanding, app.settings.currency, true)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <div className="flex items-center justify-end gap-6 border-t bg-muted/40 px-3 py-3 text-sm font-semibold">
            <span>Total</span>
            <span className="tabular-nums">{formatMoney(totals.charged, app.settings.currency, true)}</span>
            <span className="tabular-nums text-emerald-700">{formatMoney(totals.collected, app.settings.currency, true)}</span>
            <span className="tabular-nums text-amber-700">{formatMoney(totals.outstanding, app.settings.currency, true)}</span>
          </div>
        </>
      )}
    </Card>
  );
}
