import { useEffect, useMemo, useState } from "react";
import { useApp } from "@/context";
import { formatDate, formatMoney, toIsoDate } from "@/lib/utils";
import { ApprovalBadge } from "./approval-badge";
import { BillDialog, type BillPrefill } from "@/components/expenses/bill-dialog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { isStaff } from "@/lib/permissions";
import type { Account, ApprovalStatus, Unit, WorkOrder, WorkOrderPriority, WorkOrderStatus } from "@/types";
import { HistoryList } from "@/components/documents/history-list";
import { DocumentsPanel } from "@/components/documents/documents-panel";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workOrder?: WorkOrder;
  defaults?: { property_id?: number; unit_id?: number };
  onSaved?: () => void;
}

const PRIORITIES: { value: WorkOrderPriority; label: string }[] = [
  { value: "low", label: "Low" },
  { value: "normal", label: "Normal" },
  { value: "high", label: "High" },
  { value: "urgent", label: "Urgent" },
];

const STATUSES: { value: WorkOrderStatus; label: string }[] = [
  { value: "open", label: "Open" },
  { value: "assigned", label: "Assigned" },
  { value: "in_progress", label: "In progress" },
  { value: "completed", label: "Completed" },
  { value: "cancelled", label: "Cancelled" },
];

export function WorkOrderDialog({ open, onOpenChange, workOrder, defaults, onSaved }: Props) {
  const app = useApp();
  const [historyVersion, setHistoryVersion] = useState(0);
  const [units, setUnits] = useState<Unit[]>([]);
  const [propertyId, setPropertyId] = useState<number | "">("");
  const [unitId, setUnitId] = useState<number | "">("");
  const [vendorId, setVendorId] = useState<number | "">("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<WorkOrderPriority>("normal");
  const [status, setStatus] = useState<WorkOrderStatus>("open");
  const [scheduledAt, setScheduledAt] = useState("");
  const [cost, setCost] = useState("");
  const [estimate, setEstimate] = useState("");
  const [approval, setApproval] = useState<ApprovalStatus | null>(null);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  // Shown inside the dialog: the app error banner sits behind the modal overlay.
  const [formError, setFormError] = useState<string | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [billPrefill, setBillPrefill] = useState<BillPrefill | undefined>();

  useEffect(() => {
    if (!open) return;
    (async () => {
      try {
        const all = await app.listUnits();
        setUnits(all);
      } catch (err) {
        app.setError((err as Error).message);
      }
    })();
  }, [open, app]);

  useEffect(() => {
    if (!open) return;
    setPropertyId(workOrder?.property_id ?? defaults?.property_id ?? "");
    setUnitId(workOrder?.unit_id ?? defaults?.unit_id ?? "");
    setVendorId(workOrder?.vendor_id ?? "");
    setTitle(workOrder?.title ?? "");
    setDescription(workOrder?.description ?? "");
    setPriority(workOrder?.priority ?? "normal");
    setStatus(workOrder?.status ?? "open");
    setScheduledAt(workOrder?.scheduled_at?.slice(0, 10) ?? "");
    setCost(workOrder?.cost != null ? String(workOrder.cost) : "");
    setEstimate(workOrder?.estimated_cost != null ? String(workOrder.estimated_cost) : "");
    setApproval(workOrder?.approval_status ?? null);
    setNotes(workOrder?.notes ?? "");
    setFormError(null);
  }, [open, workOrder, defaults]);

  const filteredUnits = useMemo(() => {
    if (!propertyId) return units;
    return units.filter((u) => u.property_id === Number(propertyId));
  }, [units, propertyId]);

  // Auto-set property when picking a unit.
  useEffect(() => {
    if (!unitId) return;
    const u = units.find((x) => x.id === Number(unitId));
    if (u && propertyId !== u.property_id) setPropertyId(u.property_id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unitId]);

  async function save() {
    if (!title.trim()) return;
    setSaving(true);
    setFormError(null);
    try {
      const payload = {
        property_id: propertyId ? Number(propertyId) : null,
        unit_id: unitId ? Number(unitId) : null,
        vendor_id: vendorId ? Number(vendorId) : null,
        title: title.trim(),
        description: description.trim() || null,
        priority,
        status,
        scheduled_at: scheduledAt || null,
        cost: cost ? parseFloat(cost) : null,
        estimated_cost: estimate ? parseFloat(estimate) : null,
        notes: notes.trim() || null,
        // Record completion on the operator's local date (the server would use UTC).
        ...(status === "completed" && workOrder?.status !== "completed" ? { completed_at: toIsoDate(new Date()) } : {}),
      };
      if (workOrder) {
        await app.updateWorkOrder(workOrder.id, payload);
      } else {
        await app.createWorkOrder(payload);
      }
      onSaved?.();
      onOpenChange(false);
    } catch (err) {
      setFormError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function decide(decision: "approved" | "rejected") {
    if (!workOrder) return;
    try {
      const updated = await app.decideApproval(workOrder.id, decision);
      setApproval(updated.approval_status);
      setFormError(null);
      onSaved?.();
    } catch (err) {
      setFormError((err as Error).message);
    }
  }

  const threshold = app.settings.maintenance_approval_threshold;
  const estimateNum = estimate ? parseFloat(estimate) : null;
  // Mirrors the server rule so the operator sees the requirement before saving.
  const needsApproval = threshold > 0 && estimateNum != null && estimateNum > threshold;
  const estimateChanged = (workOrder?.estimated_cost ?? null) !== estimateNum;

  // D2: completed work with a cost becomes one linked bill line, so the P&L counts it once.
  const staff = !!app.me && isStaff(app.me.role);
  const canRecordExpense = staff && !!workOrder && workOrder.status === "completed" && (workOrder.cost ?? 0) > 0
    && workOrder.property_id != null && !workOrder.bill_id;

  async function recordExpense() {
    if (!workOrder || workOrder.property_id == null || workOrder.cost == null) return;
    // Shift the decimal in the string: 12.345 * 100 is 1234.4999… in floating point.
    const shifted = Math.round(Number(`${workOrder.cost}e2`));
    try {
      if (!accounts.length) setAccounts(await app.listAccounts());
      setBillPrefill({
        property_id: workOrder.property_id,
        vendor_id: workOrder.vendor_id,
        bill_date: workOrder.completed_at?.slice(0, 10) ?? toIsoDate(new Date()),
        line: {
          description: workOrder.title,
          unit_id: workOrder.unit_id,
          amount_cents: Number.isFinite(shifted) ? shifted : Math.round(workOrder.cost * 100),
          work_order_id: workOrder.id,
          work_order_title: workOrder.title,
        },
      });
      onOpenChange(false);
    } catch (err) {
      setFormError((err as Error).message);
    }
  }

  async function remove() {
    if (!workOrder) return;
    if (!confirm("Delete this work order?")) return;
    try {
      await app.deleteWorkOrder(workOrder.id);
      onSaved?.();
      onOpenChange(false);
    } catch (err) {
      app.setError((err as Error).message);
    }
  }

  return (
    <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto overflow-x-hidden">
        <DialogHeader>
          <DialogTitle>{workOrder ? "Edit work order" : "New work order"}</DialogTitle>
        </DialogHeader>

        <div className="grid gap-3">
          {workOrder?.tenant_first_name && (
            <p className="text-sm">
              <span className="text-muted-foreground">Tenant: </span>
              {workOrder.tenant_first_name} {workOrder.tenant_last_name}
              {workOrder.tenant_phone && <> · <a className="underline" href={`tel:${workOrder.tenant_phone}`}>{workOrder.tenant_phone}</a></>}
            </p>
          )}
          <div>
            <Label htmlFor="wo-title">Title</Label>
            <Input id="wo-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Leaking kitchen faucet" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Property</Label>
              <Select value={String(propertyId || "")} onValueChange={(v) => { setPropertyId(v ? Number(v) : ""); setUnitId(""); }}>
                <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>
                  {app.properties.map((p) => (
                    <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Unit</Label>
              <Select value={String(unitId || "")} onValueChange={(v) => setUnitId(v ? Number(v) : "")}>
                <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>
                  {filteredUnits.map((u) => (
                    <SelectItem key={u.id} value={String(u.id)}>{u.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label htmlFor="wo-desc">Description</Label>
            <Textarea id="wo-desc" value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label>Priority</Label>
              <Select value={priority} onValueChange={(v) => setPriority(v as WorkOrderPriority)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PRIORITIES.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Status</Label>
              <Select value={status} onValueChange={(v) => setStatus(v as WorkOrderStatus)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {STATUSES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Vendor</Label>
              <Select value={String(vendorId || "")} onValueChange={(v) => setVendorId(v ? Number(v) : "")}>
                <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>
                  {app.vendors.map((v) => (
                    <SelectItem key={v.id} value={String(v.id)}>{v.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label htmlFor="wo-sched">Scheduled date</Label>
              <Input id="wo-sched" type="date" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="wo-est">Estimated cost</Label>
              <Input id="wo-est" type="number" min={0} value={estimate} onChange={(e) => setEstimate(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="wo-cost">Actual cost</Label>
              <Input id="wo-cost" type="number" min={0} value={cost} onChange={(e) => setCost(e.target.value)} />
            </div>
          </div>
          {(approval || needsApproval) && (
            <div className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/40 px-3 py-2 text-sm">
              {workOrder && approval && !estimateChanged ? (
                <>
                  <ApprovalBadge status={approval} />
                  {approval === "approved" && workOrder.approved_at && (
                    <span className="text-xs text-muted-foreground">on {formatDate(workOrder.approved_at.slice(0, 10))}</span>
                  )}
                  {needsApproval && (
                    <span className="text-xs text-muted-foreground">
                      Estimate is over the {formatMoney(threshold, app.settings.currency)} approval threshold.
                    </span>
                  )}
                  <div className="ml-auto flex gap-2">
                    {staff && approval !== "approved" && <Button type="button" size="sm" onClick={() => decide("approved")}>Approve</Button>}
                    {staff && approval !== "rejected" && <Button type="button" size="sm" variant="outline" onClick={() => decide("rejected")}>Reject</Button>}
                  </div>
                </>
              ) : needsApproval ? (
                <span className="text-xs text-muted-foreground">
                  Over the {formatMoney(threshold, app.settings.currency)} threshold: this will need approval before it can be in progress or completed.
                </span>
              ) : (
                <span className="text-xs text-muted-foreground">Saving this estimate removes the approval requirement.</span>
              )}
            </div>
          )}
          {workOrder?.bill_id && (
            <p className="text-xs text-muted-foreground">Recorded as an expense on bill #{workOrder.bill_id}.</p>
          )}
          {workOrder?.occurrence_date && (
            <p className="text-xs text-muted-foreground">
              Generated from a recurring task for {formatDate(workOrder.occurrence_date)}.
            </p>
          )}
          <div>
            <Label htmlFor="wo-notes">Notes</Label>
            <Textarea id="wo-notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
          </div>
        </div>

        {formError && (
          <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {formError}
          </p>
        )}
        {workOrder && <DocumentsPanel entity="work_order" entityId={workOrder.id} onChange={() => setHistoryVersion((v) => v + 1)} />}
        {workOrder && <HistoryList entity="work_order" entityId={workOrder.id} version={historyVersion} />}
        <DialogFooter className="mt-2">
          {workOrder && staff && (
            <Button type="button" variant="ghost" className="text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={remove}>
              Delete
            </Button>
          )}
          {canRecordExpense && (
            <Button type="button" variant="outline" onClick={recordExpense}>Record as expense</Button>
          )}
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button type="button" onClick={save} disabled={saving || !title.trim()}>
            {workOrder ? "Save changes" : "Create work order"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    <BillDialog
      open={!!billPrefill}
      onOpenChange={(o) => { if (!o) setBillPrefill(undefined); }}
      accounts={accounts}
      prefill={billPrefill}
      onSaved={onSaved}
    />
    </>
  );
}
