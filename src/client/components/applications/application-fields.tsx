import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { toCents, toDollars } from "@/lib/applications";

// Small form kit for the application's sections: one object's fields, or a list of them.

const NONE = "none";
const MAX_ROWS = 20; // matches the server's list cap

export interface FieldDef<T> {
  key: keyof T & string;
  label: string;
  kind?: "text" | "date" | "number" | "money" | "check" | "select";
  options?: { value: string; label: string }[];
  wide?: boolean;
}

interface FieldGridProps<T> {
  value: T;
  onChange: (next: T) => void;
  fields: FieldDef<T>[];
  idPrefix: string;
}

export function FieldGrid<T extends object>({ value, onChange, fields, idPrefix }: FieldGridProps<T>) {
  const get = (k: keyof T) => value[k] as unknown;
  const set = (k: keyof T, v: unknown) => onChange({ ...value, [k]: v });
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      {fields.map((f) => {
        const id = `${idPrefix}-${f.key}`;
        const v = get(f.key);
        if (f.kind === "check") {
          return (
            <label key={f.key} htmlFor={id} className="flex items-center gap-2 self-end pb-2 text-sm">
              <input id={id} type="checkbox" className="h-4 w-4 accent-primary" checked={!!v} onChange={(e) => set(f.key, e.target.checked)} />
              {f.label}
            </label>
          );
        }
        return (
          <div key={f.key} className={cn(f.wide && "col-span-2")}>
            <Label htmlFor={id}>{f.label}</Label>
            {f.kind === "select" ? (
              <Select value={(v as string) || NONE} onValueChange={(x) => set(f.key, x === NONE ? null : x)}>
                <SelectTrigger id={id}><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>—</SelectItem>
                  {f.options?.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                </SelectContent>
              </Select>
            ) : f.kind === "money" ? (
              <Input id={id} type="number" min={0} step="0.01" value={toDollars(v as number | null)} onChange={(e) => set(f.key, toCents(e.target.value))} />
            ) : f.kind === "number" ? (
              <Input id={id} type="number" min={0} value={v == null ? "" : String(v)} onChange={(e) => set(f.key, e.target.value === "" ? null : Number(e.target.value))} />
            ) : (
              <Input id={id} type={f.kind === "date" ? "date" : "text"} value={(v as string) ?? ""} onChange={(e) => set(f.key, e.target.value || null)} />
            )}
          </div>
        );
      })}
    </div>
  );
}

interface ListEditorProps<T> {
  items: T[] | null | undefined;
  onChange: (next: T[]) => void;
  blank: () => T;
  fields: FieldDef<T>[];
  idPrefix: string;
  addLabel: string;
  empty: string;
}

export function ListEditor<T extends object>({ items, onChange, blank, fields, idPrefix, addLabel, empty }: ListEditorProps<T>) {
  const list = items ?? [];
  return (
    <div className="space-y-2">
      {list.length === 0 && <p className="text-xs text-muted-foreground">{empty}</p>}
      {list.map((item, i) => (
        <div key={i} className="relative rounded-md border p-3 pr-10">
          <FieldGrid
            value={item}
            fields={fields}
            idPrefix={`${idPrefix}-${i}`}
            onChange={(next) => onChange(list.map((x, j) => (j === i ? next : x)))}
          />
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="absolute right-1 top-1 h-7 w-7"
            aria-label={`Remove ${addLabel.toLowerCase()} ${i + 1}`}
            onClick={() => onChange(list.filter((_, j) => j !== i))}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      ))}
      <Button type="button" size="sm" variant="outline" disabled={list.length >= MAX_ROWS} onClick={() => onChange([...list, blank()])}>
        <Plus className="mr-1 h-4 w-4" /> {addLabel}
      </Button>
    </div>
  );
}
