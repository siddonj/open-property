import { useEffect, useState } from "react";
import { useApp } from "@/context";
import { actionLabel, formatAt, formatChanges } from "@/lib/activity";
import { isStaff } from "@/lib/permissions";
import type { ActivityRow } from "@/types";

// The last 20 history rows for one record (spec "Record dialogs"). Admins and managers only;
// maintenance gets nothing rendered. `version` reloads it after the dialog saves.
export function HistoryList({ entity, entityId, version = 0 }: { entity: string; entityId: number; version?: number }) {
  const app = useApp();
  const [rows, setRows] = useState<ActivityRow[] | null>(null);
  const allowed = !!app.me && isStaff(app.me.role);

  useEffect(() => {
    if (!allowed) return;
    let stale = false;
    app.listActivity({ entity, entity_id: entityId, limit: 20 })
      .then((r) => { if (!stale) setRows(r.activity); })
      .catch(() => { if (!stale) setRows([]); });
    return () => { stale = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entity, entityId, version, allowed]);

  if (!allowed) return null;
  return (
    <section className="space-y-2 border-t pt-3">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">History</h3>
      {rows === null ? (
        <p className="text-xs text-muted-foreground">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="text-xs text-muted-foreground">No history yet. Changes made before activity history was turned on aren't recorded.</p>
      ) : (
        <ul className="max-h-48 space-y-2 overflow-y-auto pr-1">
          {rows.map((r) => (
            <li key={r.id} className="text-xs">
              <p>
                <span className="font-medium">{r.user_name || r.user_email}</span>{" "}
                {actionLabel(r.action)}
                {r.action !== "update" && r.action !== "create" && r.label ? ` · ${r.label}` : ""}
                <span className="text-muted-foreground"> · {formatAt(r.at)}</span>
              </p>
              {formatChanges(r.changes).map((line) => (
                <p key={line} className="ml-3 text-muted-foreground">{line}</p>
              ))}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
