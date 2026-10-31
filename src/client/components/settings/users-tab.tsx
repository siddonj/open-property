import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { useApp } from "@/context";
import { cn, formatDate } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { AppUser, Role } from "@/types";

const ROLE_OPTIONS: { value: Role; label: string; hint: string }[] = [
  { value: "admin", label: "Admin", hint: "Everything, including users and settings" },
  { value: "manager", label: "Manager", hint: "All day-to-day work, including money" },
  { value: "maintenance", label: "Maintenance", hint: "Work orders and vendors; no money or tenants" },
];

// SQLite datetime('now') is UTC without a zone.
const utc = (s: string) => `${s.replace(" ", "T")}Z`;

// Admin-only (spec E). Users are deactivated, never deleted, so history keeps their name.
export function UsersTab() {
  const app = useApp();
  const [users, setUsers] = useState<AppUser[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<Role>("manager");
  const [saving, setSaving] = useState(false);

  async function load() {
    try {
      setUsers(await app.listUsers());
    } catch (err) {
      setError((err as Error).message);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Errors (for example the last-admin rule) show inline next to the table.
  async function act(fn: () => Promise<unknown>) {
    setError(null);
    try {
      await fn();
      await load();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function add() {
    if (!email.trim()) return;
    setSaving(true);
    await act(async () => {
      await app.createUser({ email: email.trim(), name: name.trim() || undefined, role });
      setEmail("");
      setName("");
    });
    setSaving(false);
  }

  return (
    <Card>
      <div className="border-b p-4">
        <h2 className="text-sm font-semibold">Users</h2>
        <p className="text-xs text-muted-foreground">
          People who can sign in. Add their email here, then send them the app's address; they sign in through Cloudflare Access.
        </p>
      </div>

      <form
        className="grid gap-3 border-b p-4 md:grid-cols-[2fr_1.5fr_1fr_auto] md:items-end"
        onSubmit={(e) => { e.preventDefault(); add(); }}
      >
        <div className="space-y-1">
          <Label htmlFor="u-email">Email</Label>
          <Input id="u-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@example.com" />
        </div>
        <div className="space-y-1">
          <Label htmlFor="u-name">Name</Label>
          <Input id="u-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Optional" />
        </div>
        <div className="space-y-1">
          <Label htmlFor="u-role">Role</Label>
          <Select value={role} onValueChange={(v) => setRole(v as Role)}>
            <SelectTrigger id="u-role"><SelectValue /></SelectTrigger>
            <SelectContent>
              {ROLE_OPTIONS.map((r) => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <Button type="submit" disabled={saving || !email.trim()}>
          <Plus className="mr-1 h-4 w-4" /> Add user
        </Button>
      </form>

      {error && (
        <p role="alert" className="border-b bg-destructive/5 px-4 py-2 text-sm text-destructive">{error}</p>
      )}

      <ul className="divide-y">
        {users.map((u) => {
          const self = u.id === app.me?.id;
          return (
            <li key={u.id} className={cn("flex flex-wrap items-center gap-3 p-4", !u.active && "opacity-60")}>
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">
                  {u.name || u.email}
                  {self && <span className="ml-2 text-xs font-normal text-muted-foreground">(you)</span>}
                </div>
                <div className="truncate text-xs text-muted-foreground">
                  {u.name ? `${u.email} · ` : ""}
                  {u.last_seen_at ? `Last seen ${formatDate(utc(u.last_seen_at))}` : "Never signed in"}
                </div>
              </div>
              {!u.active && <Badge variant="outline">Deactivated</Badge>}
              <Select value={u.role} onValueChange={(v) => act(() => app.updateUser(u.id, { role: v as Role }))}>
                <SelectTrigger className="w-40" aria-label={`Role for ${u.email}`}><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ROLE_OPTIONS.map((r) => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
                </SelectContent>
              </Select>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => act(() => app.updateUser(u.id, { active: !u.active }))}
              >
                {u.active ? "Deactivate" : "Reactivate"}
              </Button>
            </li>
          );
        })}
      </ul>

      <div className="border-t px-4 py-3 text-xs text-muted-foreground">
        {ROLE_OPTIONS.map((r) => <p key={r.value}><span className="font-medium text-foreground">{r.label}:</span> {r.hint}</p>)}
      </div>
    </Card>
  );
}
