import { useEffect, useState } from "react";
import { Plus, X } from "lucide-react";
import { useApp } from "@/context";
import { formatDate, toIsoDate } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { ChecklistKind, Lease, LeaseChecklist } from "@/types";

interface Props {
  lease?: Lease;
  onOpenChange: (open: boolean) => void;
}

const KINDS: { value: ChecklistKind; label: string }[] = [
  { value: "move_in", label: "Move-in" },
  { value: "move_out", label: "Move-out" },
];

export function ChecklistDialog({ lease, onOpenChange }: Props) {
  const app = useApp();
  const [checklists, setChecklists] = useState<LeaseChecklist[]>([]);
  const [kind, setKind] = useState<ChecklistKind>("move_in");

  async function load(leaseId: number) {
    try {
      setChecklists(await app.listChecklists(leaseId));
    } catch (err) {
      app.setError((err as Error).message);
    }
  }

  useEffect(() => {
    if (!lease) return;
    setChecklists([]);
    // Default to move-out when the lease is ending or over.
    setKind(lease.status === "ended" || lease.move_out_total != null ? "move_out" : "move_in");
    load(lease.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lease?.id]);

  async function act(fn: () => Promise<unknown>) {
    if (!lease) return;
    try {
      await fn();
      await load(lease.id);
    } catch (err) {
      app.setError((err as Error).message);
    }
  }

  const tenant = lease ? [lease.tenant_first_name, lease.tenant_last_name].filter(Boolean).join(" ") : "";

  return (
    <Dialog open={!!lease} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Checklists</DialogTitle>
          {lease && (
            <p className="text-sm text-muted-foreground">
              {tenant || "No tenant"} · {lease.property_name} · {lease.unit_name}
            </p>
          )}
        </DialogHeader>
        <Tabs value={kind} onValueChange={(v) => setKind(v as ChecklistKind)}>
          <TabsList>
            {KINDS.map((k) => {
              const list = checklists.find((c) => c.kind === k.value);
              const done = list?.items.filter((i) => i.done).length ?? 0;
              return (
                <TabsTrigger key={k.value} value={k.value}>
                  {k.label}{list ? ` ${done}/${list.items.length}` : ""}
                </TabsTrigger>
              );
            })}
          </TabsList>
          {KINDS.map((k) => (
            <TabsContent key={k.value} value={k.value}>
              <ChecklistPanel
                label={k.label}
                checklist={checklists.find((c) => c.kind === k.value)}
                onStart={() => act(() => app.createChecklist(lease!.id, k.value))}
                onToggle={(id, done) => act(() => app.updateChecklistItem(id, { done }))}
                onRename={(id, label) => act(() => app.updateChecklistItem(id, { label }))}
                onDelete={(id) => act(() => app.deleteChecklistItem(id))}
                onAdd={(listId, label) => act(() => app.addChecklistItem(listId, label))}
              />
            </TabsContent>
          ))}
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

function ChecklistPanel({
  label, checklist, onStart, onToggle, onRename, onDelete, onAdd,
}: {
  label: string;
  checklist?: LeaseChecklist;
  onStart: () => void;
  onToggle: (itemId: number, done: boolean) => void;
  onRename: (itemId: number, label: string) => void;
  onDelete: (itemId: number) => void;
  onAdd: (checklistId: number, label: string) => void;
}) {
  const [newItem, setNewItem] = useState("");

  if (!checklist) {
    return (
      <div className="flex flex-col items-center gap-3 py-8 text-center">
        <p className="text-sm text-muted-foreground">No {label.toLowerCase()} checklist for this lease yet.</p>
        <Button onClick={onStart}>Start {label.toLowerCase()} checklist</Button>
      </div>
    );
  }

  function add() {
    const text = newItem.trim();
    if (!text || !checklist) return;
    onAdd(checklist.id, text);
    setNewItem("");
  }

  return (
    <div className="space-y-2 pt-2">
      <ul className="divide-y rounded-md border">
        {checklist.items.map((item) => (
          <li key={item.id} className="flex items-center gap-3 px-3 py-2">
            <input
              type="checkbox"
              className="h-4 w-4 shrink-0 accent-primary"
              checked={item.done}
              onChange={(e) => onToggle(item.id, e.target.checked)}
              aria-label={`Mark "${item.label}" ${item.done ? "not done" : "done"}`}
            />
            <Input
              key={item.label}
              defaultValue={item.label}
              aria-label="Checklist item"
              className={`h-8 border-transparent bg-transparent px-1 shadow-none ${item.done ? "text-muted-foreground line-through" : ""}`}
              onBlur={(e) => {
                const v = e.target.value.trim();
                if (v && v !== item.label) onRename(item.id, v);
                else e.target.value = item.label;
              }}
              onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
            />
            {item.done && item.done_at && (
              <span className="shrink-0 text-xs text-muted-foreground">
                {/* done_at is a UTC 'YYYY-MM-DD HH:MM:SS' from SQLite; show the local date. */}
                {formatDate(toIsoDate(new Date(`${item.done_at.replace(" ", "T")}Z`)))}
              </span>
            )}
            <button
              type="button"
              onClick={() => { if (confirm(`Remove "${item.label}" from this checklist?`)) onDelete(item.id); }}
              className="shrink-0 rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label={`Remove "${item.label}"`}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </li>
        ))}
      </ul>
      <div className="flex gap-2">
        <Input
          placeholder="Add an item"
          value={newItem}
          onChange={(e) => setNewItem(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") add(); }}
        />
        <Button type="button" variant="outline" onClick={add} disabled={!newItem.trim()}>
          <Plus className="mr-1 h-4 w-4" /> Add
        </Button>
      </div>
    </div>
  );
}
