import { useState, useEffect, useCallback } from "react";

export type Route =
  | { name: "dashboard" }
  | { name: "properties" }
  | { name: "property"; id: number }
  | { name: "tenants" }
  | { name: "tenant"; id: number }
  | { name: "applications" }
  | { name: "leases" }
  | { name: "rent" }
  | { name: "maintenance" }
  | { name: "expenses" }
  | { name: "reports" }
  | { name: "settings" }
  | { name: "not-found" };

export function parse(path: string): Route {
  if (path === "/" || path === "/dashboard") return { name: "dashboard" };
  if (path === "/properties") return { name: "properties" };
  let m = path.match(/^\/properties\/(\d+)$/);
  if (m) return { name: "property", id: parseInt(m[1], 10) };
  if (path === "/tenants") return { name: "tenants" };
  m = path.match(/^\/tenants\/(\d+)$/);
  if (m) return { name: "tenant", id: parseInt(m[1], 10) };
  if (path === "/applications") return { name: "applications" };
  if (path === "/leases") return { name: "leases" };
  if (path === "/rent") return { name: "rent" };
  if (path === "/maintenance") return { name: "maintenance" };
  if (path === "/expenses") return { name: "expenses" };
  if (path === "/reports") return { name: "reports" };
  if (path === "/settings") return { name: "settings" };
  return { name: "not-found" };
}

/** Navigate from components that don't get `navigate` as a prop; the router hears the popstate. */
export function navigateTo(to: string) {
  window.history.pushState(null, "", to);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

export function useRouter() {
  const [path, setPath] = useState<string>(() => window.location.pathname);

  const navigate = useCallback((to: string) => {
    if (to === window.location.pathname) return;
    window.history.pushState(null, "", to);
    setPath(window.location.pathname); // `to` may carry a query string; routes match the path only
  }, []);

  useEffect(() => {
    const handler = () => setPath(window.location.pathname);
    window.addEventListener("popstate", handler);
    return () => window.removeEventListener("popstate", handler);
  }, []);

  return { path, route: parse(path), navigate };
}
