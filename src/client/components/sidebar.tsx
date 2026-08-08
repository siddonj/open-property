import {
  Building2,
  Users,
  ClipboardList,
  Wrench,
  Settings,
  LayoutDashboard,
  Receipt,
  BarChart3,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { Route } from "@/hooks/use-router";

interface NavItem {
  label: string;
  icon: typeof LayoutDashboard;
  path: string;
  match: (r: Route) => boolean;
}

const sections: { heading: string; items: NavItem[] }[] = [
  {
    heading: "Portfolio",
    items: [
      { label: "Dashboard",   icon: LayoutDashboard, path: "/dashboard",  match: (r) => r.name === "dashboard" },
      { label: "Properties",  icon: Building2,       path: "/properties", match: (r) => r.name === "properties" || r.name === "property" },
      { label: "Tenants",     icon: Users,           path: "/tenants",    match: (r) => r.name === "tenants" || r.name === "tenant" },
      { label: "Leases",      icon: ClipboardList,   path: "/leases",     match: (r) => r.name === "leases" },
    ],
  },
  {
    heading: "Operations",
    items: [
      { label: "Rent",         icon: Receipt,   path: "/rent",        match: (r) => r.name === "rent" },
      { label: "Maintenance",  icon: Wrench,    path: "/maintenance", match: (r) => r.name === "maintenance" },
      { label: "Reports",      icon: BarChart3, path: "/reports",     match: (r) => r.name === "reports" },
    ],
  },
  {
    heading: "Admin",
    items: [
      { label: "Settings", icon: Settings, path: "/settings", match: (r) => r.name === "settings" },
    ],
  },
];

export function Sidebar({
  route,
  navigate,
}: {
  route: Route;
  navigate: (to: string) => void;
}) {
  return (
    <aside className="hidden w-60 shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground md:flex">
      <div className="flex h-14 items-center gap-2 border-b border-sidebar-border px-4">
        <svg viewBox="0 0 200 200" className="h-8 w-8 shrink-0" aria-hidden="true">
          <rect x="16" y="16" width="168" height="168" rx="26" fill="#0D1F40" />
          <circle cx="100" cy="92" r="48" fill="none" stroke="#FFFFFF" strokeWidth="14" />
          <line x1="132" y1="122" x2="150" y2="142" stroke="#FFFFFF" strokeWidth="14" strokeLinecap="round" />
          <rect x="84" y="76" width="12" height="12" rx="2" fill="#0FA882" />
          <rect x="100" y="76" width="12" height="12" rx="2" fill="#0FA882" />
          <rect x="84" y="92" width="12" height="12" rx="2" fill="#0FA882" />
          <rect x="100" y="92" width="12" height="12" rx="2" fill="#0FA882" />
        </svg>
        <span className="font-display text-base font-semibold tracking-tight">
          Resi<span className="text-[#0FA882]">Q</span>
        </span>
      </div>

      <nav className="flex-1 overflow-y-auto px-2 py-3">
        {sections.map((section) => (
          <div key={section.heading} className="mb-4">
            <div className="px-3 pb-1 font-mono text-[11px] font-medium uppercase tracking-widest text-[#8896A8]">
              {section.heading}
            </div>
            <ul className="space-y-0.5">
              {section.items.map((item) => {
                const active = item.match(route);
                return (
                  <li key={item.label}>
                    <button
                      type="button"
                      onClick={() => navigate(item.path)}
                      className={cn(
                        "flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                        active && "bg-sidebar-accent text-sidebar-accent-foreground",
                        !active && "hover:bg-sidebar-accent/60",
                      )}
                    >
                      <item.icon className="h-4 w-4 shrink-0" />
                      <span className="flex-1 text-left">{item.label}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>
    </aside>
  );
}
