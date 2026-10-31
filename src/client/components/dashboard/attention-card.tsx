import { CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";

export interface AttentionItem {
  key: number;
  title: string;
  detail: string;
  reason: string;
  amount?: string;
  href: string;
}

export interface AttentionGroup {
  label: string;
  tone: "overdue" | "upcoming";
  count: number;
  items: AttentionItem[];
}

const TONES = {
  overdue: { heading: "text-rose-700", reason: "text-rose-600" },
  upcoming: { heading: "text-amber-700", reason: "text-amber-700" },
};

// One "Needs attention" card: labeled groups (overdue in rose, upcoming in amber), hidden
// when empty. Every row is a button that opens the record (spec C, D).
export function AttentionCard({
  title, viewAll, groups, emptyMessage, navigate,
}: {
  title: string;
  viewAll: string;
  groups: AttentionGroup[];
  emptyMessage: string;
  navigate: (to: string) => void;
}) {
  const visible = groups.filter((g) => g.count > 0);
  return (
    <Card className="p-5">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold">{title}</h3>
        <button
          type="button"
          onClick={() => navigate(viewAll)}
          className="text-xs font-medium text-primary hover:underline"
        >
          View all
        </button>
      </div>
      {visible.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-1 py-6 text-center">
          <CheckCircle2 className="h-5 w-5 text-muted-foreground" />
          <p className="text-sm font-medium">All caught up</p>
          <p className="text-xs text-muted-foreground">{emptyMessage}</p>
        </div>
      ) : (
        <div className="space-y-4">
          {visible.map((g) => (
            <div key={g.label}>
              <h4 className={cn("text-xs font-semibold uppercase tracking-wider", TONES[g.tone].heading)}>
                {g.label} <span className="font-medium tabular-nums">· {g.count}</span>
              </h4>
              <ul className="divide-y">
                {g.items.map((item) => (
                  <li key={item.key}>
                    <button
                      type="button"
                      onClick={() => navigate(item.href)}
                      className="flex w-full items-center justify-between gap-4 py-2.5 text-left hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{item.title}</p>
                        <p className="truncate text-xs text-muted-foreground">{item.detail}</p>
                      </div>
                      <div className="shrink-0 text-right text-xs">
                        {item.amount && <div className="font-medium tabular-nums text-foreground">{item.amount}</div>}
                        <div className={cn("font-medium", TONES[g.tone].reason)}>{item.reason}</div>
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
              {g.count > g.items.length && (
                <button
                  type="button"
                  onClick={() => navigate(viewAll)}
                  className="mt-1 text-xs text-muted-foreground hover:underline"
                >
                  +{g.count - g.items.length} more
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
