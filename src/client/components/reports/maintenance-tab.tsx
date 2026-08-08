import { useEffect, useMemo, useState } from "react";
import { useApp } from "@/context";
import { formatMoney, formatPeriod } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { MaintenanceReportMonth } from "@/types";

const ALL = "all";

export function MaintenanceTab() {
  const app = useApp();
  const [months, setMonths] = useState<MaintenanceReportMonth[]>([]);
  const [loading, setLoading] = useState(true);
  const [propertyId, setPropertyId] = useState<string>(ALL);
  const [vendorId, setVendorId] = useState<string>(ALL);

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const report = await app.getMaintenanceReport({
          property_id: propertyId === ALL ? undefined : Number(propertyId),
          vendor_id: vendorId === ALL ? undefined : Number(vendorId),
        });
        setMonths(report.months);
      } catch (err) {
        app.setError((err as Error).message);
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [propertyId, vendorId]);

  const totals = useMemo(() => ({
    count: months.reduce((s, m) => s + m.work_order_count, 0),
    cost: months.reduce((s, m) => s + m.total_cost, 0),
  }), [months]);

  return (
    <Card>
      <div className="flex flex-col gap-3 border-b p-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-sm font-semibold">Last 12 months</h2>
          <p className="text-xs text-muted-foreground">Completed work orders and cost per month</p>
        </div>
        <div className="flex gap-2">
          <Select value={propertyId} onValueChange={setPropertyId}>
            <SelectTrigger className="w-40"><SelectValue placeholder="Property" /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All properties</SelectItem>
              {app.properties.map((p) => <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={vendorId} onValueChange={setVendorId}>
            <SelectTrigger className="w-40"><SelectValue placeholder="Vendor" /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All vendors</SelectItem>
              {app.vendors.map((v) => <SelectItem key={v.id} value={String(v.id)}>{v.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      {loading ? (
        <div className="p-8 text-center text-sm text-muted-foreground">Loading…</div>
      ) : months.length === 0 ? (
        <div className="p-8 text-center text-sm text-muted-foreground">No completed work orders in the last 12 months.</div>
      ) : (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Month</TableHead>
                <TableHead className="text-right">Work orders</TableHead>
                <TableHead className="text-right">Total cost</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {months.map((m) => (
                <TableRow key={m.period}>
                  <TableCell className="font-medium">{formatPeriod(m.period)}</TableCell>
                  <TableCell className="text-right tabular-nums">{m.work_order_count}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatMoney(m.total_cost, app.settings.currency)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <div className="flex items-center justify-end gap-6 border-t bg-muted/40 px-3 py-3 text-sm font-semibold">
            <span>Total</span>
            <span className="tabular-nums">{totals.count}</span>
            <span className="tabular-nums">{formatMoney(totals.cost, app.settings.currency)}</span>
          </div>
        </>
      )}
    </Card>
  );
}
