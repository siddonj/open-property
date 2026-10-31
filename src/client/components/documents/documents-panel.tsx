import { useEffect, useRef, useState } from "react";
import { FileText, Paperclip, Trash2 } from "lucide-react";
import { useApp } from "@/context";
import { formatAt } from "@/lib/activity";
import { isStaff } from "@/lib/permissions";
import { Button } from "@/components/ui/button";
import type { DocEntity, DocumentRow } from "@/types";

const ACCEPT = ".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp";

const formatSize = (n: number) =>
  n < 1024 ? `${n} B` : n < 1024 * 1024 ? `${Math.round(n / 1024)} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`;

// Files on one record (spec D). Files open through the API in a new tab, never a public URL.
// Maintenance only sees this on work orders and can't delete; the API enforces both.
export function DocumentsPanel({ entity, entityId, onChange }: { entity: DocEntity; entityId: number; onChange?: () => void }) {
  const app = useApp();
  const role = app.me?.role;
  const visible = !!role && (isStaff(role) || entity === "work_order");
  const canDelete = !!role && isStaff(role);
  const [docs, setDocs] = useState<DocumentRow[] | null>(null);
  const [busy, setBusy] = useState(false);
  // Shown inside the dialog: the app error banner sits behind the modal overlay.
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  async function load() {
    try {
      setDocs(await app.listDocuments(entity, entityId));
    } catch (err) {
      setError((err as Error).message);
      setDocs([]);
    }
  }

  useEffect(() => {
    if (visible) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entity, entityId, visible]);

  async function act(fn: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      await load();
      onChange?.();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function upload(files: FileList | null) {
    const file = files?.[0];
    if (input.current) input.current.value = "";
    if (file) await act(() => app.uploadDocument(entity, entityId, file));
  }

  if (!visible) return null;
  return (
    <section className="space-y-2 border-t pt-3">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Documents</h3>
        <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => input.current?.click()}>
          <Paperclip className="mr-1 h-4 w-4" /> {busy ? "Working…" : "Upload"}
        </Button>
        <input
          ref={input}
          type="file"
          accept={ACCEPT}
          className="sr-only"
          aria-label="Upload a document"
          tabIndex={-1}
          onChange={(e) => upload(e.target.files)}
        />
      </div>
      {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
      {docs === null ? (
        <p className="text-xs text-muted-foreground">Loading…</p>
      ) : docs.length === 0 ? (
        <p className="text-xs text-muted-foreground">No documents. PDF, JPEG, PNG or WebP, up to 10 MB.</p>
      ) : (
        <ul className="divide-y rounded-md border">
          {docs.map((d) => (
            <li key={d.id} className="flex items-center gap-2 px-3 py-2 text-sm">
              <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <a
                  href={`/api/documents/${d.id}/file`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block truncate font-medium underline-offset-2 hover:underline focus-visible:underline focus-visible:outline-none"
                >
                  {d.filename}
                </a>
                <p className="truncate text-xs text-muted-foreground">
                  {formatSize(d.size)} · {d.uploaded_by_name || d.uploaded_by_email} · {formatAt(d.uploaded_at)}
                </p>
              </div>
              {canDelete && (
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  disabled={busy}
                  aria-label={`Delete ${d.filename}`}
                  onClick={() => { if (confirm(`Delete ${d.filename}?`)) act(() => app.deleteDocument(d.id)); }}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
