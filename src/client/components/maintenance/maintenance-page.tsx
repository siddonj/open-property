import { useEffect, useMemo, useState } from "react";
import { CalendarClock, CircleAlert, Plus, Repeat, Wrench } from "lucide-react";
import { useApp } from "@/context";
import { cn, daysBetween, formatDate, formatMoney, toIsoDate } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { WorkOrderDialog } from "./work-order-dialog";
import { RecurringTasksDialog } from "./recurring-tasks";
import { ApprovalBadge } from "./approval-badge";
import { dueState, type DueState } from "./due";
import type { Unit, WorkOrder, WorkOrderStatus } from "@/types";

type ScheduleFilter = "any" | Extract<DueState, "overdue" | "soon" | "unscheduled">;
const ALL = "all";

const PRIORITY_TONE: Record<string, string> = {
  urgent: "bg-rose-100 text-rose-800 border-rose-200",
  high: "bg-amber-100 text-amber-800 border-amber-200",
  normal: "bg-sky-100 text-sky-800 border-sky-200",
  low: "bg-slate-100 text-slate-700 border-slate-200",
};

const STATUS_VARIANT: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  open: "secondary",
  assigned: "default",
  in_progress: "default",
  completed: "outline",
  cancelled: "outline",
};

export function MaintenancePage() {
  const app = useApp();
  const [orders, setOrders] = useState<WorkOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<WorkOrderStatus | "open_all" | "all">("open_all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<WorkOrder | undefined>(undefined);
  const [schedule, setSchedule] = useState<ScheduleFilter>("any");
  const [propertyFilter, setPropertyFilter] = useState<string>(ALL);
  const [unitFilter, setUnitFilter] = useState<string>(ALL);
  const [units, setUnits] = useState<Unit[]>([]);
  const [recurringOpen, setRecurringOpen] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const today = toIsoDate(new Date());

  async function load() {
    try {
      setLoading(true);
      const list = await app.listWorkOrders();
      setOrders(list);
    } catch (err) {
      app.setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    app.listUnits().then(setUnits).catch((err) => app.setError((err as Error).message));
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, []);

  async function generate() {
    setGenerating(true);
    try {
      const res = await app.generateRecurringTasks(today);
      setNotice(res.created ? `Created ${res.created} work order${res.created === 1 ? "" : "s"} from recurring tasks.` : "Nothing due from recurring tasks.");
      await load();
    } catch (err) {
      app.setError((err as Error).message);
    } finally {
      setGenerating(false);
    }
  }

  const counts = useMemo(() => {
    const c = { all: orders.length, open: 0, assigned: 0, in_progress: 0, completed: 0, urgent: 0, overdue: 0 };
    for (const o of orders) {
      if (dueState(o, today) === "overdue") c.overdue++;
      if (o.status === "open") c.open++;
      if (o.status === "assigned") c.assigned++;
      if (o.status === "in_progress") c.in_progress++;
      if (o.status === "completed") c.completed++;
      if (o.priority === "urgent" && o.status !== "completed" && o.status !== "cancelled") c.urgent++;
    }
    return c;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orders]);

  const filtered = useMemo(() => {
    let out = orders;
    if (filter === "open_all") out = out.filter((o) => o.status !== "completed" && o.status !== "cancelled");
    else if (filter !== "all") out = out.filter((o) => o.status === filter);
    if (schedule !== "any") out = out.filter((o) => dueState(o, today) === schedule);
    if (propertyFilter !== ALL) out = out.filter((o) => String(o.property_id) === propertyFilter);
    if (unitFilter !== ALL) out = out.filter((o) => String(o.unit_id) === unitFilter);
    // Overdue first, then the existing priority order from the API.
    return [...out].sort((a, b) => Number(dueState(b, today) === "overdue") - Number(dueState(a, today) === "overdue"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orders, filter, schedule, propertyFilter, unitFilter]);

  const unitOptions = propertyFilter === ALL ? [] : units.filter((u) => String(u.property_id) === propertyFilter);

  return (
    <div className="flex-1 overflow-auto">
      <div className="mx-auto w-full max-w-7xl space-y-6 p-6">
        <header className="flex items-end justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Maintenance</h1>
            <p className="text-sm text-muted-foreground">
              {counts.open + counts.assigned + counts.in_progress} open
              {counts.urgent > 0 && (
                <span className="ml-2 inline-flex items-center gap-1 rounded-full border border-rose-200 bg-rose-100 px-2 py-0.5 text-[11px] font-semibold text-rose-800">
                  <CircleAlert className="h-3 w-3" /> {counts.urgent} urgent
                </span>
              )}
              {counts.overdue > 0 && (
                <button
                  type="button"
                  onClick={() => { setFilter("open_all"); setSchedule("overdue"); }}
                  className="ml-2 inline-flex items-center gap-1 rounded-full border border-rose-200 bg-rose-50 px-2 py-0.5 text-[11px] font-semibold text-rose-700 hover:bg-rose-100"
                >
                  <CalendarClock className="h-3 w-3" /> {counts.overdue} overdue
                </button>
              )}
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setRecurringOpen(true)}>
              <Repeat className="mr-1 h-4 w-4" /> Recurring tasks
            </Button>
            <Button variant="outline" onClick={generate} disabled={generating}>
              {generating ? "Generating…" : "Generate due tasks"}
            </Button>
            <Button onClick={() => { setEditing(undefined); setDialogOpen(true); }}>
              <Plus className="mr-1 h-4 w-4" /> New work order
            </Button>
          </div>
        </header>
        {notice && (
          <div role="status" className="flex items-center justify-between rounded-md border bg-muted/40 px-3 py-2 text-sm">
            {notice}
            <button type="button" className="text-xs text-muted-foreground hover:text-foreground" onClick={() => setNotice(null)}>Dismiss</button>
          </div>
        )}

        <Tabs value={filter} onValueChange={(v) => setFilter(v as never)}>
          <TabsList>
            <TabsTrigger value="open_all">Open</TabsTrigger>
            <TabsTrigger value="open">Unassigned</TabsTrigger>
            <TabsTrigger value="assigned">Assigned</TabsTrigger>
            <TabsTrigger value="in_progress">In progress</TabsTrigger>
            <TabsTrigger value="completed">Completed</TabsTrigger>
            <TabsTrigger value="all">All</TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="flex flex-wrap gap-2">
          <Select value={schedule} onValueChange={(v) => setSchedule(v as ScheduleFilter)}>
            <SelectTrigger className="w-44" aria-label="Schedule"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="any">Any schedule</SelectItem>
              <SelectItem value="overdue">Overdue ({counts.overdue})</SelectItem>
              <SelectItem value="soon">Due in 7 days</SelectItem>
              <SelectItem value="unscheduled">Unscheduled</SelectItem>
            </SelectContent>
          </Select>
          <Select value={propertyFilter} onValueChange={(v) => { setPropertyFilter(v); setUnitFilter(ALL); }}>
            <SelectTrigger className="w-52" aria-label="Property"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All properties</SelectItem>
              {app.properties.map((p) => <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>)}
            </SelectContent>
          </Select>
          {unitOptions.length > 0 && (
            <Select value={unitFilter} onValueChange={setUnitFilter}>
              <SelectTrigger className="w-40" aria-label="Unit"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All units</SelectItem>
                {unitOptions.map((u) => <SelectItem key={u.id} value={String(u.id)}>{u.name}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
        </div>

        {loading ? (
          <Card className="p-8 text-center text-sm text-muted-foreground">Loading…</Card>
        ) : filtered.length === 0 ? (
          <Card className="flex flex-col items-center justify-center gap-2 p-12 text-center">
            <Wrench className="h-7 w-7 text-muted-foreground" />
            <p className="font-medium">Nothing here</p>
            <p className="text-sm text-muted-foreground">
              {orders.length === 0 ? "Track repairs and turnover work for your properties." : "No work orders match this filter."}
            </p>
            {orders.length === 0 && (
              <Button className="mt-2" onClick={() => { setEditing(undefined); setDialogOpen(true); }}>
                <Plus className="mr-1 h-4 w-4" /> New work order
              </Button>
            )}
          </Card>
        ) : (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {filtered.map((w) => (
              <Card
                key={w.id}
                className="cursor-pointer p-4 transition-shadow hover:shadow-md"
                onClick={() => { setEditing(w); setDialogOpen(true); }}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <h3 className="truncate font-semibold">{w.title}</h3>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {[w.property_name, w.unit_name].filter(Boolean).join(" · ") || "Unassigned"}
                    </p>
                  </div>
                  <span className={cn("inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold capitalize", PRIORITY_TONE[w.priority])}>
                    {w.priority === "urgent" && <CircleAlert className="mr-1 h-3 w-3" />}
                    {w.priority}
                  </span>
                </div>
                {w.description && (
                  <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">{w.description}</p>
                )}
                <div className="mt-3 flex items-center justify-between border-t pt-3 text-xs">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={STATUS_VARIANT[w.status] ?? "secondary"} className="capitalize">{w.status.replace("_", " ")}</Badge>
                    {w.approval_status && <ApprovalBadge status={w.approval_status} />}
                    {w.vendor_name
                      ? <span className="text-muted-foreground">{w.vendor_name}</span>
                      : w.status !== "completed" && w.status !== "cancelled" && <span className="text-muted-foreground italic">Unassigned</span>}
                    {w.recurring_task_id && <Repeat className="h-3 w-3 text-muted-foreground" aria-label="Recurring" />}
                  </div>
                  <div className="text-right text-muted-foreground">
                    <ScheduleLabel workOrder={w} today={today} />
                    {w.cost != null
                      ? <div className="font-medium tabular-nums text-foreground">{formatMoney(w.cost, app.settings.currency)}</div>
                      : w.estimated_cost != null && <div className="tabular-nums">Est. {formatMoney(w.estimated_cost, app.settings.currency)}</div>}
                    {!w.scheduled_at && w.cost == null && w.estimated_cost == null && <div>Created {formatDate(w.created_at)}</div>}
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      <WorkOrderDialog
        open={dialogOpen}
        onOpenChange={(o) => { setDialogOpen(o); if (!o) load(); }}
        workOrder={editing}
        onSaved={load}
      />
      <RecurringTasksDialog open={recurringOpen} onOpenChange={setRecurringOpen} />
    </div>
  );
}

function ScheduleLabel({ workOrder: w, today }: { workOrder: WorkOrder; today: string }) {
  if (!w.scheduled_at) return null;
  const state = dueState(w, today);
  const days = daysBetween(today, w.scheduled_at.slice(0, 10));
  if (state === "overdue") {
    return <div className="font-medium text-rose-600">Overdue · {-days} day{days === -1 ? "" : "s"}</div>;
  }
  if (state === "soon") {
    return <div className="text-amber-700">{days === 0 ? "Due today" : `Due in ${days} day${days === 1 ? "" : "s"}`}</div>;
  }
  return <div>Scheduled {formatDate(w.scheduled_at)}</div>;
}
