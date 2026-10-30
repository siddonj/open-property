import { useEffect, useMemo, useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { useApp } from "@/context";
import { formatDate, formatMoney, toIsoDate } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { NewRecurringTask, RecurringTask, Unit, WorkOrderPriority } from "@/types";

const NONE = "none";

const everyLabel = (t: Pick<RecurringTask, "interval_count" | "interval_unit">) =>
  t.interval_count === 1 ? `Every ${t.interval_unit}` : `Every ${t.interval_count} ${t.interval_unit}s`;

export function RecurringTasksDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const app = useApp();
  const [tasks, setTasks] = useState<RecurringTask[]>([]);
  const [editing, setEditing] = useState<RecurringTask | "new" | null>(null);

  async function load() {
    try {
      setTasks(await app.listRecurringTasks());
    } catch (err) {
      app.setError((err as Error).message);
    }
  }

  useEffect(() => {
    if (open) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  async function act(fn: () => Promise<unknown>) {
    try {
      await fn();
      await load();
    } catch (err) {
      app.setError((err as Error).message);
    }
  }

  return (
    <>
      <Dialog open={open && editing === null} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Recurring tasks</DialogTitle>
            <p className="text-sm text-muted-foreground">
              Preventive work that repeats. Use <span className="font-medium">Generate due tasks</span> on the
              maintenance page to create work orders for the next 14 days.
            </p>
          </DialogHeader>
          {tasks.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">No recurring tasks yet.</p>
          ) : (
            <ul className="divide-y rounded-md border">
              {tasks.map((t) => (
                <li key={t.id} className="flex items-center gap-3 px-3 py-2">
                  <div className="min-w-0 flex-1">
                    <p className={`truncate text-sm font-medium ${t.active ? "" : "text-muted-foreground"}`}>
                      {t.title}{!t.active && " (paused)"}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {[t.property_name, t.unit_name].filter(Boolean).join(" · ")} · {everyLabel(t)}
                      {t.vendor_name && ` · ${t.vendor_name}`}
                      {t.estimated_cost != null && ` · est. ${formatMoney(t.estimated_cost, app.settings.currency)}`}
                    </p>
                  </div>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {t.active && t.next_occurrence ? `Next ${formatDate(t.next_occurrence)}` : ""}
                  </span>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => act(() => app.updateRecurringTask(t.id, { active: !t.active }))}
                  >
                    {t.active ? "Pause" : "Resume"}
                  </Button>
                  <Button size="sm" variant="ghost" aria-label={`Edit ${t.title}`} onClick={() => setEditing(t)}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    aria-label={`Delete ${t.title}`}
                    onClick={() => {
                      if (confirm(`Delete "${t.title}"? Work orders already generated from it are kept.`)) {
                        act(() => app.deleteRecurringTask(t.id));
                      }
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
          <DialogFooter>
            <Button onClick={() => setEditing("new")}>
              <Plus className="mr-1 h-4 w-4" /> New recurring task
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <RecurringTaskForm
        task={editing === "new" ? undefined : editing ?? undefined}
        open={editing !== null}
        onClose={() => { setEditing(null); load(); }}
      />
    </>
  );
}

function RecurringTaskForm({ task, open, onClose }: { task?: RecurringTask; open: boolean; onClose: () => void }) {
  const app = useApp();
  const [units, setUnits] = useState<Unit[]>([]);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [propertyId, setPropertyId] = useState("");
  const [unitId, setUnitId] = useState(NONE);
  const [vendorId, setVendorId] = useState(NONE);
  const [priority, setPriority] = useState<WorkOrderPriority>("normal");
  const [count, setCount] = useState("1");
  const [unit, setUnit] = useState<"week" | "month">("month");
  const [startDate, setStartDate] = useState("");
  const [estimate, setEstimate] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    app.listUnits().then(setUnits).catch((err) => app.setError((err as Error).message));
    setTitle(task?.title ?? "");
    setDescription(task?.description ?? "");
    setPropertyId(task ? String(task.property_id) : "");
    setUnitId(task?.unit_id ? String(task.unit_id) : NONE);
    setVendorId(task?.vendor_id ? String(task.vendor_id) : NONE);
    setPriority(task?.priority ?? "normal");
    setCount(String(task?.interval_count ?? 1));
    setUnit(task?.interval_unit ?? "month");
    setStartDate(task?.start_date ?? toIsoDate(new Date()));
    setEstimate(task?.estimated_cost != null ? String(task.estimated_cost) : "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, task]);

  const propertyUnits = useMemo(() => units.filter((u) => String(u.property_id) === propertyId), [units, propertyId]);
  const countNum = parseInt(count, 10);
  const valid = !!title.trim() && !!propertyId && !!startDate && countNum >= 1 && countNum <= 24;

  async function save() {
    if (!valid) return;
    setSaving(true);
    try {
      const payload: NewRecurringTask = {
        title: title.trim(),
        description: description.trim() || null,
        property_id: Number(propertyId),
        unit_id: unitId === NONE ? null : Number(unitId),
        vendor_id: vendorId === NONE ? null : Number(vendorId),
        priority,
        interval_unit: unit,
        interval_count: countNum,
        start_date: startDate,
        estimated_cost: estimate ? parseFloat(estimate) : null,
        active: task?.active ?? true,
      };
      if (task) await app.updateRecurringTask(task.id, payload);
      else await app.createRecurringTask(payload);
      onClose();
    } catch (err) {
      app.setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{task ? "Edit recurring task" : "New recurring task"}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3">
          <div>
            <Label htmlFor="rt-title">Title</Label>
            <Input id="rt-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Replace HVAC filter" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Property</Label>
              <Select value={propertyId} onValueChange={(v) => { setPropertyId(v); setUnitId(NONE); }}>
                <SelectTrigger><SelectValue placeholder="Pick a property" /></SelectTrigger>
                <SelectContent>
                  {app.properties.map((p) => <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Unit</Label>
              <Select value={unitId} onValueChange={setUnitId} disabled={!propertyId}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Whole property</SelectItem>
                  {propertyUnits.map((u) => <SelectItem key={u.id} value={String(u.id)}>{u.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label htmlFor="rt-count">Every</Label>
              <Input id="rt-count" type="number" min={1} max={24} value={count} onChange={(e) => setCount(e.target.value)} />
            </div>
            <div>
              <Label>&nbsp;</Label>
              <Select value={unit} onValueChange={(v) => setUnit(v as "week" | "month")}>
                <SelectTrigger aria-label="Interval unit"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="week">week(s)</SelectItem>
                  <SelectItem value="month">month(s)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="rt-start">Starting</Label>
              <Input id="rt-start" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label>Vendor</Label>
              <Select value={vendorId} onValueChange={setVendorId}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Unassigned</SelectItem>
                  {app.vendors.map((v) => <SelectItem key={v.id} value={String(v.id)}>{v.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Priority</Label>
              <Select value={priority} onValueChange={(v) => setPriority(v as WorkOrderPriority)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(["low", "normal", "high", "urgent"] as const).map((p) => (
                    <SelectItem key={p} value={p} className="capitalize">{p}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="rt-est">Estimated cost</Label>
              <Input id="rt-est" type="number" min={0} value={estimate} onChange={(e) => setEstimate(e.target.value)} />
            </div>
          </div>
          <div>
            <Label htmlFor="rt-desc">Description</Label>
            <Textarea id="rt-desc" value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
          </div>
          {startDate && startDate < toIsoDate(new Date()) && !task && (
            <p className="text-xs text-muted-foreground">
              Past dates aren't backfilled: the first generation creates only upcoming work.
            </p>
          )}
        </div>
        <DialogFooter className="mt-2">
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="button" onClick={save} disabled={saving || !valid}>
            {task ? "Save changes" : "Create recurring task"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
