import { useEffect, useState } from "react";
import { useApp } from "@/context";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { Tenant } from "@/types";
import { HistoryList } from "@/components/documents/history-list";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tenant?: Tenant;
  /** Prefill values for create mode (e.g. from an approved application). */
  defaults?: Partial<Tenant>;
  onSaved?: (t: Tenant) => void;
}

export function TenantDialog({ open, onOpenChange, tenant, defaults, onSaved }: Props) {
  const app = useApp();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [dob, setDob] = useState("");
  const [employer, setEmployer] = useState("");
  const [income, setIncome] = useState("");
  const [emergency, setEmergency] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    const src = tenant ?? defaults;
    setFirstName(src?.first_name ?? "");
    setLastName(src?.last_name ?? "");
    setEmail(src?.email ?? "");
    setPhone(src?.phone ?? "");
    setDob(src?.date_of_birth ?? "");
    setEmployer(src?.employer ?? "");
    setIncome(src?.monthly_income ? String(src.monthly_income) : "");
    setEmergency(src?.emergency_contact ?? "");
    setNotes(src?.notes ?? "");
  }, [open, tenant, defaults]);

  async function save() {
    if (!firstName.trim() || !lastName.trim()) return;
    setSaving(true);
    try {
      const payload = {
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        email: email.trim() || null,
        phone: phone.trim() || null,
        date_of_birth: dob || null,
        employer: employer.trim() || null,
        monthly_income: income ? parseFloat(income) : null,
        emergency_contact: emergency.trim() || null,
        notes: notes.trim() || null,
      };
      const saved = tenant
        ? await app.updateTenant(tenant.id, payload)
        : await app.createTenant(payload);
      onSaved?.(saved);
      onOpenChange(false);
    } catch (err) {
      app.setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!tenant) return;
    if (!confirm(`Delete ${tenant.first_name} ${tenant.last_name}? Their leases and rent history will also be removed.`)) return;
    try {
      await app.deleteTenant(tenant.id);
      onOpenChange(false);
    } catch (err) {
      app.setError((err as Error).message);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto overflow-x-hidden">
        <DialogHeader>
          <DialogTitle>{tenant ? "Edit tenant" : "New tenant"}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="t-first">First name</Label>
              <Input id="t-first" value={firstName} onChange={(e) => setFirstName(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="t-last">Last name</Label>
              <Input id="t-last" value={lastName} onChange={(e) => setLastName(e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="t-email">Email</Label>
              <Input id="t-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="t-phone">Phone</Label>
              <Input id="t-phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="t-dob">Date of birth</Label>
              <Input id="t-dob" type="date" value={dob} onChange={(e) => setDob(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="t-emerg">Emergency contact</Label>
              <Input id="t-emerg" value={emergency} onChange={(e) => setEmergency(e.target.value)} placeholder="Name · phone" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="t-emp">Employer</Label>
              <Input id="t-emp" value={employer} onChange={(e) => setEmployer(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="t-inc">Monthly income</Label>
              <Input id="t-inc" type="number" value={income} onChange={(e) => setIncome(e.target.value)} />
            </div>
          </div>
          <div>
            <Label htmlFor="t-notes">Notes</Label>
            <Textarea id="t-notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
          </div>
        </div>
        {tenant && <HistoryList entity="tenant" entityId={tenant.id} />}
        <DialogFooter className="mt-2">
          {tenant && (
            <Button type="button" variant="ghost" className="text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={remove}>
              Delete
            </Button>
          )}
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button type="button" onClick={save} disabled={saving || !firstName.trim() || !lastName.trim()}>
            {tenant ? "Save changes" : "Create tenant"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
