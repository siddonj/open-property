import { useEffect, useMemo, useState } from "react";
import { FileText, Plus, Search, UserPlus } from "lucide-react";
import { useApp } from "@/context";
import { formatDate, formatMoney, toIsoDate } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TenantDialog } from "@/components/tenants/tenant-dialog";
import { ApplicationDialog } from "./application-dialog";
import type { Application, ApplicationStatus, Tenant } from "@/types";

const STATUS_TONE: Record<ApplicationStatus, string> = {
  new: "default",
  screening: "secondary",
  approved: "default",
  declined: "outline",
  withdrawn: "outline",
};

const FILTERS: { value: ApplicationStatus | "active" | "all"; label: string }[] = [
  { value: "active", label: "Active" },
  { value: "new", label: "New" },
  { value: "screening", label: "Screening" },
  { value: "approved", label: "Approved" },
  { value: "declined", label: "Declined" },
  { value: "withdrawn", label: "Withdrawn" },
  { value: "all", label: "All" },
];

const isActive = (a: Application) => a.status === "new" || a.status === "screening";

export function ApplicationsPage({ navigate }: { navigate: (to: string) => void }) {
  const app = useApp();
  const [applications, setApplications] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["value"]>("active");
  const [q, setQ] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Application | undefined>(undefined);
  const [tenantDefaults, setTenantDefaults] = useState<Partial<Tenant> | undefined>(undefined);

  async function load() {
    try {
      setLoading(true);
      setApplications(await app.listApplications());
    } catch (err) {
      app.setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  const filtered = useMemo(() => {
    let out = applications;
    if (filter === "active") out = out.filter(isActive);
    else if (filter !== "all") out = out.filter((a) => a.status === filter);
    if (q.trim()) {
      const needle = q.toLowerCase();
      out = out.filter((a) =>
        `${a.first_name} ${a.last_name} ${a.email ?? ""} ${a.phone ?? ""}`.toLowerCase().includes(needle),
      );
    }
    return out;
  }, [applications, filter, q]);

  const today = toIsoDate(new Date());
  const dueCount = applications.filter((a) => isActive(a) && a.follow_up_date && a.follow_up_date <= today).length;

  function openNew() { setEditing(undefined); setDialogOpen(true); }

  function createTenantFrom(a: Application) {
    setTenantDefaults({
      first_name: a.first_name,
      last_name: a.last_name,
      email: a.email,
      phone: a.phone,
      employer: a.employer,
      monthly_income: a.monthly_income,
    });
  }

  return (
    <div className="flex-1 overflow-auto">
      <div className="mx-auto w-full max-w-7xl space-y-6 p-6">
        <header className="flex items-end justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Applications</h1>
            <p className="text-sm text-muted-foreground">
              {applications.filter(isActive).length} active · {dueCount} follow-up{dueCount === 1 ? "" : "s"} due
            </p>
          </div>
          <Button onClick={openNew}>
            <Plus className="mr-1 h-4 w-4" /> New application
          </Button>
        </header>

        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <Tabs value={filter} onValueChange={(v) => setFilter(v as typeof filter)}>
            <TabsList>
              {FILTERS.map((f) => <TabsTrigger key={f.value} value={f.value}>{f.label}</TabsTrigger>)}
            </TabsList>
          </Tabs>
          <div className="relative md:w-72">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Search name, email, phone" className="pl-9" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
        </div>

        {loading ? (
          <Card className="p-8 text-center text-sm text-muted-foreground">Loading…</Card>
        ) : filtered.length === 0 ? (
          <Card className="flex flex-col items-center justify-center gap-2 p-12 text-center">
            <FileText className="h-7 w-7 text-muted-foreground" />
            <p className="font-medium">No applications here</p>
            <p className="text-sm text-muted-foreground">
              {applications.length === 0 ? "Record an application to start tracking your leasing pipeline." : "Try a different filter."}
            </p>
            {applications.length === 0 && (
              <Button className="mt-2" onClick={openNew}><Plus className="mr-1 h-4 w-4" /> New application</Button>
            )}
          </Card>
        ) : (
          <Card className="overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Applicant</TableHead>
                  <TableHead>Property · Unit</TableHead>
                  <TableHead>Desired move-in</TableHead>
                  <TableHead>Follow-up</TableHead>
                  <TableHead className="text-right">Income</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((a) => (
                  <TableRow key={a.id} className="cursor-pointer" onClick={() => { setEditing(a); setDialogOpen(true); }}>
                    <TableCell>
                      <div className="font-medium">{a.first_name} {a.last_name}</div>
                      <div className="text-xs text-muted-foreground">{[a.email, a.phone].filter(Boolean).join(" · ") || "No contact info"}</div>
                    </TableCell>
                    <TableCell>
                      {a.unit_id ? (
                        <button
                          type="button"
                          className="text-left text-sm hover:underline"
                          onClick={(e) => { e.stopPropagation(); if (a.property_id) navigate(`/properties/${a.property_id}`); }}
                        >
                          <span className="text-muted-foreground">{a.property_name}</span>
                          <span className="px-1 text-muted-foreground/40">·</span>
                          <span className="font-medium">{a.unit_name}</span>
                        </button>
                      ) : (
                        <span className="text-xs text-muted-foreground">No unit</span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm">{a.desired_move_in ? formatDate(a.desired_move_in) : "—"}</TableCell>
                    <TableCell><FollowUpCell application={a} today={today} /></TableCell>
                    <TableCell className="text-right tabular-nums">
                      {a.monthly_income ? `${formatMoney(a.monthly_income, app.settings.currency)}/mo` : "—"}
                    </TableCell>
                    <TableCell>
                      <Badge variant={STATUS_TONE[a.status] as never} className="capitalize">{a.status}</Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      {a.status === "approved" && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={(e) => { e.stopPropagation(); createTenantFrom(a); }}
                        >
                          <UserPlus className="mr-1 h-3.5 w-3.5" /> Create tenant
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        )}
      </div>

      <ApplicationDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        application={editing}
        onSaved={load}
      />
      <TenantDialog
        open={!!tenantDefaults}
        onOpenChange={(o) => { if (!o) setTenantDefaults(undefined); }}
        defaults={tenantDefaults}
        onSaved={(t) => navigate(`/tenants/${t.id}`)}
      />
    </div>
  );
}

function FollowUpCell({ application: a, today }: { application: Application; today: string }) {
  if (!(a.status === "new" || a.status === "screening")) return <span className="text-xs text-muted-foreground">—</span>;
  if (!a.follow_up_date) return <span className="text-xs text-muted-foreground">No follow-up set</span>;
  if (a.follow_up_date < today) return <span className="text-sm font-medium text-destructive">Overdue · {formatDate(a.follow_up_date)}</span>;
  if (a.follow_up_date === today) return <span className="text-sm font-medium text-amber-700">Due today</span>;
  return <span className="text-sm">{formatDate(a.follow_up_date)}</span>;
}
