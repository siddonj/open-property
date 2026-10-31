import { useEffect, useMemo, useState } from "react";
import { useApp } from "@/context";
import { downloadCsv, formatPeriod } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Download } from "lucide-react";
import type { OccupancyReportMonth } from "@/types";

const ALL = "all";

export function OccupancyTab() {
  const app = useApp();
  const [months, setMonths] = useState<OccupancyReportMonth[]>([]);
  const [loading, setLoading] = useState(true);
  const [propertyId, setPropertyId] = useState<string>(ALL);

  useEffect(() => {
    // Ignore a slower response for a property that is no longer selected.
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        const report = await app.getOccupancyReport({ property_id: propertyId === ALL ? undefined : Number(propertyId) });
        if (!cancelled) setMonths(report.months);
      } catch (err) {
        if (!cancelled) app.setError((err as Error).message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [propertyId]);

  const averageRate = useMemo(() => {
    if (months.length === 0) return 0;
    return Math.round(months.reduce((s, m) => s + m.occupancy_rate, 0) / months.length);
  }, [months]);

  return (
    <Card>
      <div className="flex flex-col gap-3 border-b p-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-sm font-semibold">Last 12 months</h2>
          <p className="text-xs text-muted-foreground">Units with a lease covering any day of the month</p>
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
            onClick={() => downloadCsv(`occupancy-report${propertyId === ALL ? "" : `-property-${propertyId}`}.csv`, months, [
              { key: "period", label: "Month" },
              { key: "occupied_units", label: "Occupied" },
              { key: "total_units", label: "Total units" },
              { key: "occupancy_rate", label: "Occupancy rate" },
            ])}
          >
            <Download className="mr-1 h-4 w-4" /> Export CSV
          </Button>
        </div>
      </div>
      {loading ? (
        <div className="p-8 text-center text-sm text-muted-foreground">Loading…</div>
      ) : months.length === 0 ? (
        <div className="p-8 text-center text-sm text-muted-foreground">No unit data.</div>
      ) : (
        <>
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
        </>
      )}
    </Card>
  );
}
