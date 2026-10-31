import { useEffect, useState } from "react";
import {
  Building2,
  ClipboardList,
  Home,
  Receipt,
  Wrench,
} from "lucide-react";
import { useApp } from "@/context";
import { api } from "@/api";
import { cn, daysBetween, formatDate, formatMoney, formatPeriod, toIsoDate } from "@/lib/utils";
import type { DashboardCharge, DashboardSummary, DashboardWorkOrder } from "@/types";
import { Card } from "@/components/ui/card";
import { AttentionCard, type AttentionItem } from "./attention-card";

// Matches the server's fixed "upcoming" window for rent and maintenance (spec D3).
const DUE_SOON_DAYS = 7;

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
const tenantName = (first: string | null, last: string | null) => [first, last].filter(Boolean).join(" ") || "—";
const place = (property: string | null, unit: string | null, fallback = "Unassigned") =>
  [property, unit].filter(Boolean).join(" · ") || fallback;
const dueIn = (verb: string, days: number) => (days === 0 ? `${verb} today` : `${verb} in ${plural(days, "day")}`);

export function DashboardPage({ navigate }: { navigate: (to: string) => void }) {
  const { settings, setError } = useApp();
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        const data = await api<DashboardSummary>("GET", `/api/dashboard/summary?today=${toIsoDate(new Date())}`);
        if (!cancelled) setSummary(data);
      } catch (err) {
        if (!cancelled) setError((err as Error).message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [setError]);

  const today = toIsoDate(new Date());
  const currency = settings.currency;
  const chargeItem = (ch: DashboardCharge, reason: string): AttentionItem => ({
    key: ch.id,
    title: tenantName(ch.tenant_first_name, ch.tenant_last_name),
    detail: `${place(ch.property_name, ch.unit_name)} · ${formatPeriod(ch.period)}`,
    reason,
    amount: formatMoney(ch.balance, currency, true),
    href: `/rent?period=${ch.period}&charge=${ch.id}`,
  });
  const workOrderItem = (w: DashboardWorkOrder, reason: string): AttentionItem => ({
    key: w.id,
    title: w.title,
    detail: `${place(w.property_name, w.unit_name)}${w.priority === "urgent" ? " · Urgent" : ""}`,
    reason,
    href: `/maintenance?id=${w.id}`,
  });
  const leaseItem = (l: DashboardSummary["expired_leases"][number], reason: string): AttentionItem => ({
    key: l.id,
    title: tenantName(l.tenant_first_name, l.tenant_last_name),
    detail: `${place(l.property_name, l.unit_name)} · ends ${formatDate(l.end_date)}`,
    reason,
    href: `/leases?id=${l.id}`,
  });

  if (loading || !summary) {
    return (
      <div className="flex flex-1 items-center justify-center text-muted-foreground">
        Loading dashboard…
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto">
      <div className="mx-auto w-full max-w-7xl space-y-6 p-6">
        <header className="flex items-end justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
            <p className="text-sm text-muted-foreground">
              Snapshot of {new Date().toLocaleDateString(undefined, { month: "long", year: "numeric" })}
            </p>
          </div>
        </header>

        <section className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <KpiCard
            label="Occupancy"
            value={`${summary.occupancy_rate}%`}
            sub={`${summary.occupied} of ${summary.units} units`}
            icon={<Home className="h-4 w-4" />}
          />
          <KpiCard
            label="Active leases"
            value={String(summary.active_leases)}
            sub={summary.upcoming_move_outs ? `${summary.upcoming_move_outs} ending in 30 days` : "No upcoming move-outs"}
            icon={<ClipboardList className="h-4 w-4" />}
          />
          <KpiCard
            label="Outstanding rent"
            value={formatMoney(summary.month_outstanding, settings.currency)}
            sub={`${formatMoney(summary.month_collected, settings.currency)} collected this month`}
            icon={<Receipt className="h-4 w-4" />}
          />
          <KpiCard
            label="Open work orders"
            value={String(summary.open_work_orders)}
            sub={summary.urgent_work_orders ? `${summary.urgent_work_orders} urgent` : "Nothing urgent"}
            icon={<Wrench className="h-4 w-4" />}
            tone={summary.urgent_work_orders > 0 ? "warn" : "default"}
          />
        </section>

        <section className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <Card className="p-5">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-sm font-semibold">Portfolio</h2>
              <button
                type="button"
                onClick={() => navigate("/properties")}
                className="text-xs font-medium text-primary hover:underline"
              >
                View all
              </button>
            </div>
            <dl className="space-y-3 text-sm">
              <Row label="Properties" value={summary.properties} icon={<Building2 className="h-4 w-4" />} />
              <Row label="Total units" value={summary.units} />
              <Row
                label="Occupied this month"
                value={summary.occupied}
                tone="positive"
                hint="Any lease day this month · matches the occupancy report"
              />
              <Row
                label="Vacant now"
                value={summary.vacant}
                tone={summary.vacant > 0 ? "warn" : "default"}
                hint="No lease covering today · excludes unavailable"
              />
            </dl>
          </Card>

          <Card className="p-5 lg:col-span-2">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-sm font-semibold">This month's rent</h2>
              <button
                type="button"
                onClick={() => navigate("/rent")}
                className="text-xs font-medium text-primary hover:underline"
              >
                Open ledger
              </button>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <Stat
                label="Collected"
                value={formatMoney(summary.month_collected, settings.currency)}
                tone="positive"
              />
              <Stat
                label="Outstanding"
                value={formatMoney(summary.month_outstanding, settings.currency)}
                tone={summary.month_outstanding > 0 ? "warn" : "default"}
              />
              <Stat
                label="Overdue"
                value={formatMoney(summary.overdue_total, settings.currency)}
                sub={summary.overdue_count ? `${summary.overdue_count} charge${summary.overdue_count === 1 ? "" : "s"}` : undefined}
                tone={summary.overdue_total > 0 ? "danger" : "default"}
              />
            </div>
          </Card>
        </section>

        <section className="space-y-3" aria-labelledby="attention-heading">
          <h2 id="attention-heading" className="text-sm font-semibold">Needs attention</h2>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <AttentionCard
              title="Rent"
              viewAll="/rent"
              emptyMessage={`Nothing overdue or due in the next ${DUE_SOON_DAYS} days.`}
              navigate={navigate}
              groups={[
                {
                  label: "Overdue", tone: "overdue", count: summary.overdue_count,
                  items: summary.overdue_charges.map((ch) => chargeItem(ch, `${plural(daysBetween(ch.due_date, today), "day")} overdue`)),
                },
                {
                  label: `Due in ${DUE_SOON_DAYS} days`, tone: "upcoming", count: summary.due_soon_count,
                  items: summary.due_soon_charges.map((ch) => chargeItem(ch, dueIn("Due", daysBetween(today, ch.due_date)))),
                },
              ]}
            />
            <AttentionCard
              title="Maintenance"
              viewAll="/maintenance"
              emptyMessage={`No work orders overdue or scheduled in the next ${DUE_SOON_DAYS} days.`}
              navigate={navigate}
              groups={[
                {
                  label: "Overdue", tone: "overdue", count: summary.overdue_work_orders,
                  items: summary.overdue_work_orders_list.map((w) => workOrderItem(w, `${plural(daysBetween(w.scheduled_at.slice(0, 10), today), "day")} overdue`)),
                },
                {
                  label: `Scheduled in ${DUE_SOON_DAYS} days`, tone: "upcoming", count: summary.scheduled_count,
                  items: summary.scheduled_work_orders.map((w) => workOrderItem(w, dueIn("Scheduled", daysBetween(today, w.scheduled_at.slice(0, 10))))),
                },
              ]}
            />
            <AttentionCard
              title="Leases"
              viewAll="/leases"
              emptyMessage={`No lease expirations in the next ${summary.renewal_notice_days} days.`}
              navigate={navigate}
              groups={[
                {
                  label: "Expired, still active", tone: "overdue", count: summary.expired_leases_count,
                  items: summary.expired_leases.map((l) => leaseItem(l, `Ended ${plural(daysBetween(l.end_date, today), "day")} ago`)),
                },
                {
                  label: `Ending in ${summary.renewal_notice_days} days`, tone: "upcoming", count: summary.upcoming_expirations_count,
                  items: summary.upcoming_expirations.map((l) => leaseItem(l, dueIn("Ends", daysBetween(today, l.end_date)))),
                },
              ]}
            />
            <AttentionCard
              title="Applications"
              viewAll="/applications"
              emptyMessage="Active applications are on schedule."
              navigate={navigate}
              groups={[
                {
                  label: "Follow-up due", tone: "overdue", count: summary.followups_due_count,
                  items: summary.followups_due.map((a) => ({
                    key: a.id,
                    title: `${a.first_name} ${a.last_name}`,
                    detail: `${place(a.property_name, a.unit_name, "No unit")} · ${a.status}`,
                    reason: a.follow_up_date < today ? `${plural(daysBetween(a.follow_up_date, today), "day")} overdue` : "Due today",
                    href: `/applications?id=${a.id}`,
                  })),
                },
              ]}
            />
            <AttentionCard
              title="Vacant units"
              viewAll="/properties"
              emptyMessage="Every rentable unit has a lease covering today."
              navigate={navigate}
              groups={[
                {
                  label: "Vacant now", tone: "overdue", count: summary.vacant,
                  items: summary.vacant_units.map((u) => ({
                    key: u.id,
                    title: u.unit_name,
                    detail: [u.property_name, u.status === "turnover" ? "Turnover" : null].filter(Boolean).join(" · "),
                    reason: u.last_end_date ? `Vacant ${plural(daysBetween(u.last_end_date, today), "day")}` : "Never leased",
                    href: `/properties/${u.property_id}?unit=${u.id}`,
                  })),
                },
              ]}
            />
          </div>
        </section>
      </div>
    </div>
  );
}

function KpiCard({
  label, value, sub, icon, tone = "default",
}: {
  label: string;
  value: string;
  sub?: string;
  icon: React.ReactNode;
  tone?: "default" | "warn";
}) {
  return (
    <Card className="p-5">
      <div className="mb-3 flex items-center gap-2 text-muted-foreground">
        <span className={cn(
          "flex h-7 w-7 items-center justify-center rounded-md",
          tone === "warn" ? "bg-amber-100 text-amber-700" : "bg-primary/10 text-primary",
        )}>
          {icon}
        </span>
        <span className="text-xs font-medium uppercase tracking-wider">{label}</span>
      </div>
      <div className="text-2xl font-semibold tracking-tight">{value}</div>
      {sub && <div className="mt-1 text-xs text-muted-foreground">{sub}</div>}
    </Card>
  );
}

function Row({
  label, value, icon, tone = "default", hint,
}: {
  label: string;
  value: string | number;
  icon?: React.ReactNode;
  tone?: "default" | "positive" | "warn" | "danger";
  hint?: string;
}) {
  return (
    <div className="flex items-center justify-between">
      <dt className="text-muted-foreground">
        <span className="flex items-center gap-2">
          {icon}
          {label}
        </span>
        {hint && <span className="block text-xs text-muted-foreground/80">{hint}</span>}
      </dt>
      <dd className={cn(
        "font-medium tabular-nums",
        tone === "positive" && "text-emerald-700",
        tone === "warn" && "text-amber-700",
        tone === "danger" && "text-rose-700",
      )}>
        {value}
      </dd>
    </div>
  );
}

function Stat({
  label, value, sub, tone = "default",
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "default" | "positive" | "warn" | "danger";
}) {
  return (
    <div>
      <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={cn(
        "mt-1 text-xl font-semibold tabular-nums",
        tone === "positive" && "text-emerald-700",
        tone === "warn" && "text-amber-700",
        tone === "danger" && "text-rose-700",
      )}>
        {value}
      </div>
      {sub && <div className="text-xs text-muted-foreground">{sub}</div>}
    </div>
  );
}

