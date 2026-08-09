import { useEffect, useMemo, useState } from "react";
import { useApp } from "@/context";
import { downloadCsv, formatDate, formatMoney } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Download } from "lucide-react";
import type { Lease } from "@/types";

export function RentRollTab() {
  const app = useApp();
  const [leases, setLeases] = useState<Lease[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        setLeases(await app.listLeases({ status: "active" }));
      } catch (err) {
        app.setError((err as Error).message);
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const groups = useMemo(() => {
    const byProperty = new Map<string, Lease[]>();
    for (const l of leases) {
      const key = l.property_name ?? "Unassigned";
      if (!byProperty.has(key)) byProperty.set(key, []);
      byProperty.get(key)!.push(l);
    }
    return [...byProperty.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [leases]);

  const total = useMemo(() => leases.reduce((s, l) => s + (l.monthly_rent ?? 0), 0), [leases]);

  if (loading) return <div className="p-8 text-center text-sm text-muted-foreground">Loading…</div>;
  if (leases.length === 0) return <div className="p-8 text-center text-sm text-muted-foreground">No active leases.</div>;

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <Button
          variant="outline"
          size="sm"
          onClick={() => downloadCsv("rent-roll.csv", leases, [
            { key: "property_name", label: "Property" },
            { key: "unit_name", label: "Unit" },
            { key: "tenant_first_name", label: "Tenant first name" },
            { key: "tenant_last_name", label: "Tenant last name" },
            { key: "start_date", label: "Start" },
            { key: "end_date", label: "End" },
            { key: "monthly_rent", label: "Monthly rent" },
          ])}
        >
          <Download className="mr-1 h-4 w-4" /> Export CSV
        </Button>
      </div>
      {groups.map(([propertyName, group]) => (
        <Card key={propertyName}>
          <div className="flex items-center justify-between border-b p-4">
            <h2 className="text-sm font-semibold">{propertyName}</h2>
            <span className="text-sm font-semibold tabular-nums">
              {formatMoney(group.reduce((s, l) => s + (l.monthly_rent ?? 0), 0), app.settings.currency)}
            </span>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Unit</TableHead>
                <TableHead>Tenant</TableHead>
                <TableHead>Start</TableHead>
                <TableHead>End</TableHead>
                <TableHead className="text-right">Monthly rent</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {group.map((l) => (
                <TableRow key={l.id}>
                  <TableCell>{l.unit_name ?? "—"}</TableCell>
                  <TableCell>
                    {[l.tenant_first_name, l.tenant_last_name].filter(Boolean).join(" ") || "—"}
                  </TableCell>
                  <TableCell>{formatDate(l.start_date)}</TableCell>
                  <TableCell>{formatDate(l.end_date)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatMoney(l.monthly_rent, app.settings.currency)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      ))}

      <div className="flex items-center justify-between rounded-md border bg-muted/40 px-4 py-3">
        <span className="text-sm font-semibold">Portfolio total</span>
        <span className="text-sm font-semibold tabular-nums">{formatMoney(total, app.settings.currency)}</span>
      </div>
    </div>
  );
}
