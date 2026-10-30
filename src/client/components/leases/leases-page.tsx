import { useEffect, useMemo, useState } from "react";
import { ClipboardList, ListChecks, Plus, RefreshCw, Search } from "lucide-react";
import { useApp } from "@/context";
import { cn, daysBetween, formatDate, formatMoney, toIsoDate } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LeaseDialog } from "./lease-dialog";
import { ChecklistDialog } from "./checklist-dialog";
import type { Lease, LeaseStatus } from "@/types";

type LeaseFilter = LeaseStatus | "all" | "expiring";
type RenewalDefaults = NonNullable<React.ComponentProps<typeof LeaseDialog>["defaults"]>;

/** Prefill for a renewal: same terms, a one-year term starting the day after the current lease ends. */
function renewalDefaults(l: Lease, today: string): RenewalDefaults {
  const [y, m, d] = l.end_date.split("-").map(Number);
  const start = new Date(y, m - 1, d + 1);
  // One year from the new start, minus a day: Oct 16 2026 → Oct 15 2027, Mar 1 2027 → Feb 29 2028.
  const end = new Date(start.getFullYear() + 1, start.getMonth(), start.getDate() - 1);
  const startIso = toIsoDate(start);
  return {
    unit_id: l.unit_id,
    primary_tenant_id: l.primary_tenant_id,
    start_date: startIso,
    end_date: toIsoDate(end),
    monthly_rent: l.monthly_rent,
    deposit: l.deposit,
    rent_due_day: l.rent_due_day,
    late_fee: l.late_fee,
    status: startIso > today ? "upcoming" : "active",
  };
}

const STATUS_TONE: Record<string, string> = {
  active: "default",
  upcoming: "secondary",
  ended: "outline",
  cancelled: "outline",
};

export function LeasesPage({ navigate }: { navigate: (to: string) => void }) {
  const app = useApp();
  const [leases, setLeases] = useState<Lease[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<LeaseFilter>("active");
  const [q, setQ] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Lease | undefined>(undefined);
  const [renewing, setRenewing] = useState<RenewalDefaults | undefined>(undefined);
  const [checklistLease, setChecklistLease] = useState<Lease | undefined>(undefined);
  const today = toIsoDate(new Date());
  const renewalWindow = app.settings.renewal_notice_days;
  // Active leases inside the renewal window, including ones already past end_date.
  const isExpiring = (l: Lease) => l.status === "active" && daysBetween(today, l.end_date) <= renewalWindow;

  async function load() {
    try {
      setLoading(true);
      const list = await app.listLeases();
      setLeases(list);
    } catch (err) {
      app.setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  const filtered = useMemo(() => {
    let out = leases;
    if (filter === "expiring") out = out.filter(isExpiring);
    else if (filter !== "all") out = out.filter((l) => l.status === filter);
    if (q.trim()) {
      const needle = q.toLowerCase();
      out = out.filter((l) =>
        `${l.tenant_first_name ?? ""} ${l.tenant_last_name ?? ""} ${l.property_name ?? ""} ${l.unit_name ?? ""}`.toLowerCase().includes(needle),
      );
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leases, filter, q, renewalWindow]);

  return (
    <div className="flex-1 overflow-auto">
      <div className="mx-auto w-full max-w-7xl space-y-6 p-6">
        <header className="flex items-end justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Leases</h1>
            <p className="text-sm text-muted-foreground">{leases.length} total · {leases.filter((l) => l.status === "active").length} active</p>
          </div>
          <Button onClick={() => { setEditing(undefined); setDialogOpen(true); }}>
            <Plus className="mr-1 h-4 w-4" /> New lease
          </Button>
        </header>

        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <Tabs value={filter} onValueChange={(v) => setFilter(v as LeaseFilter)}>
            <TabsList>
              <TabsTrigger value="active">Active</TabsTrigger>
              <TabsTrigger value="expiring">Expiring ({leases.filter(isExpiring).length})</TabsTrigger>
              <TabsTrigger value="upcoming">Upcoming</TabsTrigger>
              <TabsTrigger value="ended">Ended</TabsTrigger>
              <TabsTrigger value="all">All</TabsTrigger>
            </TabsList>
          </Tabs>
          <div className="relative md:w-72">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Search leases" className="pl-9" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
        </div>

        {loading ? (
          <Card className="p-8 text-center text-sm text-muted-foreground">Loading…</Card>
        ) : filtered.length === 0 ? (
          <Card className="flex flex-col items-center justify-center gap-2 p-12 text-center">
            <ClipboardList className="h-7 w-7 text-muted-foreground" />
            <p className="font-medium">No leases here</p>
            <p className="text-sm text-muted-foreground">{leases.length === 0 ? "Create your first lease to start collecting rent." : "Try a different filter."}</p>
            {leases.length === 0 && (
              <Button className="mt-2" onClick={() => { setEditing(undefined); setDialogOpen(true); }}>
                <Plus className="mr-1 h-4 w-4" /> New lease
              </Button>
            )}
          </Card>
        ) : (
          <Card className="overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tenant</TableHead>
                  <TableHead>Property · Unit</TableHead>
                  <TableHead>Term</TableHead>
                  <TableHead className="text-right">Rent</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((l) => {
                  const daysToEnd = daysBetween(today, l.end_date);
                  const expiring = isExpiring(l);
                  return (
                    <TableRow
                      key={l.id}
                      className="cursor-pointer"
                      onClick={() => { setEditing(l); setDialogOpen(true); }}
                    >
                      <TableCell>
                        {l.primary_tenant_id ? (
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); navigate(`/tenants/${l.primary_tenant_id}`); }}
                            className="text-left font-medium hover:underline"
                          >
                            {l.tenant_first_name} {l.tenant_last_name}
                          </button>
                        ) : (
                          <span className="text-xs text-muted-foreground">No tenant</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <span className="text-sm">
                          <span className="text-muted-foreground">{l.property_name}</span>
                          <span className="px-1 text-muted-foreground/40">·</span>
                          <span className="font-medium">{l.unit_name}</span>
                        </span>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">{formatDate(l.start_date)} → {formatDate(l.end_date)}</div>
                        {expiring && daysToEnd < 0 && (
                          <div className="text-xs font-medium text-rose-600">
                            Expired {-daysToEnd} day{daysToEnd === -1 ? "" : "s"} ago · still active
                          </div>
                        )}
                        {expiring && daysToEnd >= 0 && (
                          <div className="text-xs text-amber-700">
                            {daysToEnd === 0 ? "Ends today" : `Expiring in ${daysToEnd} day${daysToEnd === 1 ? "" : "s"}`}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{formatMoney(l.monthly_rent, app.settings.currency)}/mo</TableCell>
                      <TableCell>
                        <Badge variant={(STATUS_TONE[l.status] ?? "secondary") as never} className={cn("capitalize")}>
                          {l.status}
                        </Badge>
                        <ChecklistProgress lease={l} />
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-right">
                        <Button
                          size="sm"
                          variant="ghost"
                          title="Move-in / move-out checklists"
                          aria-label="Checklists"
                          onClick={(e) => { e.stopPropagation(); setChecklistLease(l); }}
                        >
                          <ListChecks className="h-4 w-4" />
                        </Button>
                        {l.status === "active" && (
                          <Button
                            size="sm"
                            variant={expiring ? "outline" : "ghost"}
                            onClick={(e) => { e.stopPropagation(); setRenewing(renewalDefaults(l, today)); }}
                          >
                            <RefreshCw className="mr-1 h-3.5 w-3.5" /> Renew
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </Card>
        )}
      </div>

      <LeaseDialog
        open={dialogOpen}
        onOpenChange={(o) => { setDialogOpen(o); if (!o) load(); }}
        lease={editing}
      />
      <LeaseDialog
        open={!!renewing}
        onOpenChange={(o) => { if (!o) { setRenewing(undefined); load(); } }}
        defaults={renewing}
      />
      <ChecklistDialog
        lease={checklistLease}
        onOpenChange={(o) => { if (!o) { setChecklistLease(undefined); load(); } }}
      />
    </div>
  );
}

function ChecklistProgress({ lease: l }: { lease: Lease }) {
  const parts = [
    l.move_in_total != null && `Move-in ${l.move_in_done ?? 0}/${l.move_in_total}`,
    l.move_out_total != null && `Move-out ${l.move_out_done ?? 0}/${l.move_out_total}`,
  ].filter(Boolean);
  if (!parts.length) return null;
  return <div className="mt-1 whitespace-nowrap text-xs text-muted-foreground">{parts.join(" · ")}</div>;
}
