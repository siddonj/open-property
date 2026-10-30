import { useEffect, useState } from "react";
import { useApp } from "@/context";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { Application, ApplicationStatus, Unit } from "@/types";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  application?: Application;
  onSaved?: () => void;
}

const NO_UNIT = "none";

// Guided next steps per status. The server accepts any valid status (spec D3),
// so these are the common paths, not a hard state machine.
export const NEXT_STATUSES: Record<ApplicationStatus, { to: ApplicationStatus; label: string }[]> = {
  new: [{ to: "screening", label: "Start screening" }, { to: "withdrawn", label: "Withdrawn" }],
  screening: [{ to: "approved", label: "Approve" }, { to: "declined", label: "Decline" }, { to: "withdrawn", label: "Withdrawn" }],
  approved: [{ to: "screening", label: "Reopen" }],
  declined: [{ to: "screening", label: "Reopen" }],
  withdrawn: [{ to: "screening", label: "Reopen" }],
};

export function ApplicationDialog({ open, onOpenChange, application, onSaved }: Props) {
  const app = useApp();
  const [units, setUnits] = useState<Unit[]>([]);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [employer, setEmployer] = useState("");
  const [income, setIncome] = useState("");
  const [unitId, setUnitId] = useState<string>(NO_UNIT);
  const [moveIn, setMoveIn] = useState("");
  const [followUp, setFollowUp] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    app.listUnits().then(setUnits).catch((err) => app.setError((err as Error).message));
  }, [open, app]);

  useEffect(() => {
    if (!open) return;
    setFirstName(application?.first_name ?? "");
    setLastName(application?.last_name ?? "");
    setEmail(application?.email ?? "");
    setPhone(application?.phone ?? "");
    setEmployer(application?.employer ?? "");
    setIncome(application?.monthly_income ? String(application.monthly_income) : "");
    setUnitId(application?.unit_id ? String(application.unit_id) : NO_UNIT);
    setMoveIn(application?.desired_move_in ?? "");
    setFollowUp(application?.follow_up_date ?? "");
    setNotes(application?.notes ?? "");
  }, [open, application]);

  function payload() {
    return {
      first_name: firstName.trim(),
      last_name: lastName.trim(),
      email: email.trim() || null,
      phone: phone.trim() || null,
      employer: employer.trim() || null,
      monthly_income: income ? parseFloat(income) : null,
      unit_id: unitId === NO_UNIT ? null : Number(unitId),
      desired_move_in: moveIn || null,
      follow_up_date: followUp || null,
      notes: notes.trim() || null,
    };
  }

  async function save(status?: ApplicationStatus) {
    if (!firstName.trim() || !lastName.trim()) return;
    setSaving(true);
    try {
      const data = status ? { ...payload(), status } : payload();
      if (application) await app.updateApplication(application.id, data);
      else await app.createApplication(data);
      onSaved?.();
      onOpenChange(false);
    } catch (err) {
      app.setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!application) return;
    if (!confirm(`Delete the application from ${application.first_name} ${application.last_name}?`)) return;
    try {
      await app.deleteApplication(application.id);
      onSaved?.();
      onOpenChange(false);
    } catch (err) {
      app.setError((err as Error).message);
    }
  }

  const canSave = !saving && !!firstName.trim() && !!lastName.trim();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {application ? `Application · ${application.status}` : "New application"}
          </DialogTitle>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="a-first">First name</Label>
              <Input id="a-first" value={firstName} onChange={(e) => setFirstName(e.target.value)} required />
            </div>
            <div>
              <Label htmlFor="a-last">Last name</Label>
              <Input id="a-last" value={lastName} onChange={(e) => setLastName(e.target.value)} required />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="a-email">Email</Label>
              <Input id="a-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="a-phone">Phone</Label>
              <Input id="a-phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="a-employer">Employer</Label>
              <Input id="a-employer" value={employer} onChange={(e) => setEmployer(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="a-income">Monthly income</Label>
              <Input id="a-income" type="number" value={income} onChange={(e) => setIncome(e.target.value)} />
            </div>
          </div>
          <div>
            <Label>Property · Unit</Label>
            <Select value={unitId} onValueChange={setUnitId}>
              <SelectTrigger><SelectValue placeholder="Pick a unit" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_UNIT}>No unit yet</SelectItem>
                {units.map((u) => (
                  <SelectItem key={u.id} value={String(u.id)}>
                    {u.property_name ?? "—"} · {u.name}{u.status === "vacant" ? " (vacant)" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="a-movein">Desired move-in</Label>
              <Input id="a-movein" type="date" value={moveIn} onChange={(e) => setMoveIn(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="a-follow">Follow up on</Label>
              <Input id="a-follow" type="date" value={followUp} onChange={(e) => setFollowUp(e.target.value)} />
            </div>
          </div>
          <div>
            <Label htmlFor="a-notes">Notes</Label>
            <Textarea id="a-notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
          </div>
          {application && (
            <div className="flex flex-wrap items-center gap-2 border-t pt-3">
              <span className="text-xs text-muted-foreground">Save and move to:</span>
              {NEXT_STATUSES[application.status].map((n) => (
                <Button key={n.to} type="button" size="sm" variant="outline" disabled={!canSave} onClick={() => save(n.to)}>
                  {n.label}
                </Button>
              ))}
            </div>
          )}
        </div>
        <DialogFooter className="mt-2">
          {application && (
            <Button type="button" variant="ghost" className="text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={remove}>
              Delete
            </Button>
          )}
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button type="button" onClick={() => save()} disabled={!canSave}>
            {application ? "Save changes" : "Create application"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
