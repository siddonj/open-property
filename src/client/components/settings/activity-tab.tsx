import { useEffect, useState } from "react";
import { useApp } from "@/context";
import { ENTITY_LABELS, actionLabel, activityHref, formatAt, formatChanges } from "@/lib/activity";
import { navigateTo } from "@/hooks/use-router";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { ActivityRow, AppUser } from "@/types";

const ALL = "all";

// Admin-only history browser (spec C3): filter by user, record type and date; newest first.
export function ActivityTab() {
  const app = useApp();
  const [users, setUsers] = useState<AppUser[]>([]);
  const [userId, setUserId] = useState(ALL);
  const [entity, setEntity] = useState(ALL);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [rows, setRows] = useState<ActivityRow[]>([]);
  const [next, setNext] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    app.listUsers().then(setUsers).catch((err) => app.setError((err as Error).message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filter = {
    user_id: userId === ALL ? undefined : Number(userId),
    entity: entity === ALL ? undefined : entity,
    from: from || undefined,
    to: to || undefined,
  };

  async function load(before?: number) {
    setLoading(true);
    try {
      const res = await app.listActivity({ ...filter, before });
      setRows((prev) => (before ? [...prev, ...res.activity] : res.activity));
      setNext(res.next_before);
    } catch (err) {
      app.setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, entity, from, to]);

  return (
    <Card>
      <div className="border-b p-4">
        <h2 className="text-sm font-semibold">Activity</h2>
        <p className="text-xs text-muted-foreground">Every change made through the app, by who and when. History can't be edited or deleted.</p>
      </div>
      <div className="grid gap-3 border-b p-4 md:grid-cols-4">
        <div className="space-y-1">
          <Label htmlFor="act-user">User</Label>
          <Select value={userId} onValueChange={setUserId}>
            <SelectTrigger id="act-user"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Everyone</SelectItem>
              {users.map((u) => <SelectItem key={u.id} value={String(u.id)}>{u.name || u.email}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="act-entity">Record type</Label>
          <Select value={entity} onValueChange={setEntity}>
            <SelectTrigger id="act-entity"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All records</SelectItem>
              {Object.entries(ENTITY_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="act-from">From</Label>
          <Input id="act-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="act-to">To</Label>
          <Input id="act-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="p-8 text-center text-sm text-muted-foreground">{loading ? "Loading…" : "No activity matches these filters."}</div>
      ) : (
        <ul className="divide-y">
          {rows.map((r) => {
            const href = activityHref(r);
            const record = `${ENTITY_LABELS[r.entity] ?? r.entity}${r.label ? ` · ${r.label}` : r.entity_id ? ` #${r.entity_id}` : ""}`;
            return (
              <li key={r.id} className="grid gap-1 px-4 py-3 text-sm md:grid-cols-[11rem_1fr]">
                <span className="text-xs text-muted-foreground">{formatAt(r.at)}</span>
                <div className="min-w-0">
                  <p>
                    <span className="font-medium">{r.user_name || r.user_email}</span>{" "}
                    {actionLabel(r.action)}{" "}
                    {href ? (
                      <button type="button" className="underline-offset-2 hover:underline focus-visible:underline focus-visible:outline-none" onClick={() => navigateTo(href)}>
                        {record}
                      </button>
                    ) : record}
                  </p>
                  {formatChanges(r.changes).map((line) => (
                    <p key={line} className="truncate text-xs text-muted-foreground">{line}</p>
                  ))}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {next && (
        <div className="border-t p-3 text-center">
          <Button type="button" variant="outline" size="sm" disabled={loading} onClick={() => load(next)}>Load more</Button>
        </div>
      )}
    </Card>
  );
}
