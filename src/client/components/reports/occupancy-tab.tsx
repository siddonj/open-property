import { useEffect, useMemo, useState } from "react";
import { useApp } from "@/context";
import { formatPeriod } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { OccupancyReportMonth } from "@/types";

export function OccupancyTab() {
  const app = useApp();
  const [months, setMonths] = useState<OccupancyReportMonth[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const report = await app.getOccupancyReport();
        setMonths(report.months);
      } catch (err) {
        app.setError((err as Error).message);
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const averageRate = useMemo(() => {
    if (months.length === 0) return 0;
    return Math.round(months.reduce((s, m) => s + m.occupancy_rate, 0) / months.length);
  }, [months]);

  if (loading) return <div className="p-8 text-center text-sm text-muted-foreground">Loading…</div>;
  if (months.length === 0) return <div className="p-8 text-center text-sm text-muted-foreground">No unit data.</div>;

  return (
    <Card>
      <div className="border-b p-4">
        <h2 className="text-sm font-semibold">Last 12 months</h2>
        <p className="text-xs text-muted-foreground">Occupied units and occupancy rate per month</p>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Month</TableHead>
            <TableHead className="text-right">Occupied</TableHead>
            <TableHead className="text-right">Total units</TableHead>
            <TableHead className="text-right">Occupancy rate</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {months.map((m) => (
            <TableRow key={m.period}>
              <TableCell className="font-medium">{formatPeriod(m.period)}</TableCell>
              <TableCell className="text-right tabular-nums">{m.occupied_units}</TableCell>
              <TableCell className="text-right tabular-nums">{m.total_units}</TableCell>
              <TableCell className="text-right tabular-nums">{m.occupancy_rate}%</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <div className="flex items-center justify-end gap-6 border-t bg-muted/40 px-3 py-3 text-sm font-semibold">
        <span>Average</span>
        <span className="tabular-nums">{averageRate}%</span>
      </div>
    </Card>
  );
}
