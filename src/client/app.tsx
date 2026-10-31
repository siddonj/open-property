import { useEffect } from "react";
import { useAppState, type AuthProblem } from "./hooks/use-app-state";
import { canSeePage } from "./lib/permissions";
import { useRouter } from "./hooks/use-router";
import { AppContext } from "./context";
import { Sidebar } from "./components/sidebar";
import { ErrorBanner } from "./components/error-banner";
import { DashboardPage } from "./components/dashboard/dashboard-page";
import { PropertiesList } from "./components/properties/properties-list";
import { PropertyPage } from "./components/properties/property-page";
import { TenantsList } from "./components/tenants/tenants-list";
import { TenantPage } from "./components/tenants/tenant-page";
import { ApplicationsPage } from "./components/applications/applications-page";
import { LeasesPage } from "./components/leases/leases-page";
import { RentPage } from "./components/rent/rent-page";
import { MaintenancePage } from "./components/maintenance/maintenance-page";
import { ExpensesPage } from "./components/expenses/expenses-page";
import { ReportsPage } from "./components/reports/reports-page";
import { SettingsPage } from "./components/settings/settings-page";

export function App() {
  const state = useAppState();
  const { route, navigate } = useRouter();
  const role = state.me?.role;

  // Maintenance has no dashboard; their home is the work-order list.
  useEffect(() => {
    if (role === "maintenance" && route.name === "dashboard") navigate("/maintenance");
  }, [role, route.name, navigate]);

  if (state.authProblem) return <SignInProblem problem={state.authProblem} />;

  return (
    <AppContext.Provider value={state}>
      <div className="flex h-screen min-h-0 overflow-hidden">
        <Sidebar route={route} navigate={navigate} />
        <main className="flex flex-1 flex-col overflow-hidden">
          {state.loading ? (
            <div className="flex flex-1 items-center justify-center text-muted-foreground">
              Loading…
            </div>
          ) : role && !canSeePage(role, route.name) ? (
            <Placeholder title="You don't have access" message="Your role can't open this page. Ask an admin if you need it." />
          ) : (
            <>
              {route.name === "dashboard" && <DashboardPage navigate={navigate} />}
              {route.name === "properties" && <PropertiesList navigate={navigate} />}
              {route.name === "property" && <PropertyPage id={route.id} navigate={navigate} />}
              {route.name === "tenants" && <TenantsList navigate={navigate} />}
              {route.name === "tenant" && <TenantPage id={route.id} navigate={navigate} />}
              {route.name === "applications" && <ApplicationsPage navigate={navigate} />}
              {route.name === "leases" && <LeasesPage navigate={navigate} />}
              {route.name === "rent" && <RentPage />}
              {route.name === "maintenance" && <MaintenancePage />}
              {route.name === "expenses" && <ExpensesPage />}
              {route.name === "reports" && <ReportsPage />}
              {route.name === "settings" && <SettingsPage />}
              {route.name === "not-found" && (
                <Placeholder title="Not found" message="That page doesn't exist." />
              )}
            </>
          )}
        </main>
        <ErrorBanner />
      </div>
    </AppContext.Provider>
  );
}

function SignInProblem({ problem }: { problem: AuthProblem }) {
  const notConfigured = problem.message === "Sign-in is not configured";
  return (
    <main className="flex h-screen flex-col items-center justify-center gap-2 p-12 text-center">
      <h1 className="text-xl font-semibold tracking-tight">
        {problem.status === 403 ? "Your account isn't set up" : "Sign-in required"}
      </h1>
      <p className="max-w-md text-sm text-muted-foreground">
        {notConfigured
          ? "Sign-in isn't configured for this deployment. Set ACCESS_TEAM_DOMAIN and ACCESS_AUD for Cloudflare Access, or for local dev copy .dev.vars.example to .dev.vars."
          : problem.message}
      </p>
    </main>
  );
}

function Placeholder({ title, message }: { title: string; message: string }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 p-12 text-center">
      <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
      <p className="text-sm text-muted-foreground">{message}</p>
    </div>
  );
}
