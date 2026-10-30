import { useEffect, useState } from "react";
import { ArrowRight } from "lucide-react";
import { useApp } from "@/context";
import { cn, formatCents } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

interface Totals {
  collected: number;
  operating: number;
  net: number;
  capital: number;
  unpaid: number;
}

/** Year-to-date P&L summary for one property, linking to the full report. */
export function FinancialsCard({ propertyId, navigate }: { propertyId: number; navigate: (to: string) => void }) {
  const app = useApp();
  const [totals, setTotals] = useState<Totals | null>(null);
  const now = new Date();
  const from = `${now.getFullYear()}-01`;
  const to = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  useEffect(() => {
    (async () => {
      try {
        const [report, unpaidBills] = await Promise.all([
          app.getProfitLossReport({ from, to, property_id: propertyId }),
          app.listBills({ property_id: propertyId, status: "unpaid" }),
        ]);
        const sum = (k: "rent_collected_cents" | "operating_cents" | "net_operating_cents" | "capital_cents") =>
          report.months.reduce((s, m) => s + m[k], 0);
        setTotals({
          collected: sum("rent_collected_cents"),
          operating: sum("operating_cents"),
          net: sum("net_operating_cents"),
          capital: sum("capital_cents"),
          unpaid: unpaidBills.reduce((s, b) => s + b.total_cents - b.paid_cents, 0),
        });
      } catch (err) {
        app.setError((err as Error).message);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [propertyId]);

  const money = (c: number) => formatCents(c, app.settings.currency);
  const stats: { label: string; value: number; tone?: string }[] = totals ? [
    { label: "Rent collected", value: totals.collected, tone: "text-emerald-700" },
    { label: "Operating expenses", value: totals.operating },
    { label: "Net operating", value: totals.net, tone: totals.net < 0 ? "text-rose-600" : undefined },
    { label: "Capital spending", value: totals.capital },
    { label: "Unpaid bills", value: totals.unpaid, tone: totals.unpaid > 0 ? "text-amber-700" : undefined },
  ] : [];

  return (
    <section>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Financials · {now.getFullYear()} to date</h2>
        <Button variant="ghost" size="sm" onClick={() => navigate(`/reports?tab=profit-loss&property_id=${propertyId}&from=${from}&to=${to}`)}>
          Profit &amp; loss <ArrowRight className="ml-1 h-4 w-4" />
        </Button>
      </div>
      <Card className="grid grid-cols-2 divide-y p-0 md:grid-cols-5 md:divide-x md:divide-y-0">
        {totals === null ? (
          <div className="col-span-full p-4 text-sm text-muted-foreground">Loading…</div>
        ) : stats.map((s) => (
          <div key={s.label} className="p-4">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{s.label}</div>
            <div className={cn("mt-1 text-lg font-semibold tabular-nums", s.tone)}>{money(s.value)}</div>
          </div>
        ))}
      </Card>
    </section>
  );
}
