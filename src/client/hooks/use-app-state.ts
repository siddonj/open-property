import { useCallback, useEffect, useState } from "react";
import { api } from "../api";
import { toIsoDate } from "../lib/utils";
import type {
  Property,
  Unit,
  Tenant,
  Lease,
  RentCharge,
  Vendor,
  WorkOrder,
  Account,
  Bill,
  NewBill,
  NewBillPayment,
  RecurringTask,
  NewRecurringTask,
  ApprovalStatus,
  Application,
  NewApplication,
  ChecklistKind,
  LeaseChecklist,
  NewProperty,
  NewUnit,
  NewTenant,
  NewLease,
  NewWorkOrder,
  NewVendor,
  IncomeReport,
  ProfitLossReport,
  BudgetReport,
  MaintenanceReport,
  DelinquencyRow,
  OccupancyReport,
  Me,
  AppUser,
  Role,
} from "../types";

/** Why the app can't load: not signed in (401) or signed in without an account (403). */
export interface AuthProblem {
  status: 401 | 403;
  message: string;
}

export interface AppSettings {
  default_rent_due_day: number;
  late_fee_amount: number;
  late_fee_grace_days: number;
  currency: string;
  renewal_notice_days: number;
  /** 0 = approval disabled. */
  maintenance_approval_threshold: number;
}

const DEFAULT_SETTINGS: AppSettings = {
  default_rent_due_day: 1,
  late_fee_amount: 50,
  late_fee_grace_days: 5,
  currency: "USD",
  renewal_notice_days: 60,
  maintenance_approval_threshold: 0,
};

function parseSettings(raw: Record<string, string>): AppSettings {
  const num = (key: keyof AppSettings, fallback: number) => {
    const v = parseFloat(raw[key]);
    return Number.isFinite(v) ? v : fallback;
  };
  return {
    default_rent_due_day: num("default_rent_due_day", DEFAULT_SETTINGS.default_rent_due_day),
    late_fee_amount: num("late_fee_amount", DEFAULT_SETTINGS.late_fee_amount),
    late_fee_grace_days: num("late_fee_grace_days", DEFAULT_SETTINGS.late_fee_grace_days),
    currency: raw.currency || DEFAULT_SETTINGS.currency,
    renewal_notice_days: num("renewal_notice_days", DEFAULT_SETTINGS.renewal_notice_days),
    maintenance_approval_threshold: num("maintenance_approval_threshold", DEFAULT_SETTINGS.maintenance_approval_threshold),
  };
}

export function useAppState() {
  const [properties, setProperties] = useState<Property[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [me, setMe] = useState<Me | null>(null);
  const [signOut, setSignOut] = useState(false);
  const [authProblem, setAuthProblem] = useState<AuthProblem | null>(null);

  // Lookup loaders ─────────────────────────────────────────────────

  const refreshLookups = useCallback(async () => {
    const [props, vens, st] = await Promise.all([
      api<{ properties: Property[] }>("GET", `/api/properties?today=${toIsoDate(new Date())}`),
      api<{ vendors: Vendor[] }>("GET", "/api/vendors").catch(() => ({ vendors: [] })),
      api<{ settings: Record<string, string> }>("GET", "/api/settings").catch(() => ({ settings: {} })),
    ]);
    setProperties(props.properties);
    setVendors(vens.vendors);
    setSettings(parseSettings(st.settings));
  }, []);

  const updateSettings = useCallback(async (patch: Partial<AppSettings>) => {
    const body: Record<string, string> = {};
    for (const [k, v] of Object.entries(patch)) {
      if (v !== undefined) body[k] = String(v);
    }
    const res = await api<{ settings: Record<string, string> }>("PUT", "/api/settings", body);
    setSettings(parseSettings(res.settings));
  }, []);

  // Initial load.
  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        // /api/me first: a 401 or 403 replaces the whole app, so nothing else should load.
        const r = await fetch("/api/me");
        const body = (await r.json().catch(() => ({}))) as { user?: Me; sign_out?: boolean; error?: string };
        if (r.status === 401 || r.status === 403) {
          setAuthProblem({ status: r.status, message: body.error ?? r.statusText });
          return;
        }
        if (!r.ok || !body.user) throw new Error(body.error ?? `${r.status} ${r.statusText}`);
        setMe(body.user);
        setSignOut(!!body.sign_out);
        await refreshLookups();
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setLoading(false);
      }
    })();
  }, [refreshLookups]);

  // Users (admin) ──────────────────────────────────────────────────

  const listUsers = useCallback(async () => {
    const data = await api<{ users: AppUser[] }>("GET", "/api/users");
    return data.users;
  }, []);

  const createUser = useCallback(async (data: { email: string; name?: string; role: Role }) => {
    const res = await api<{ user: AppUser }>("POST", "/api/users", data);
    return res.user;
  }, []);

  const updateUser = useCallback(async (id: number, patch: { name?: string; role?: Role; active?: boolean }) => {
    const res = await api<{ user: AppUser }>("PUT", `/api/users/${id}`, patch);
    if (me && id === me.id) setMe({ id: me.id, email: me.email, name: res.user.name, role: res.user.role });
    return res.user;
  }, [me]);

  // Property mutations ─────────────────────────────────────────────

  const createProperty = useCallback(async (data: NewProperty) => {
    const res = await api<{ property: Property }>("POST", "/api/properties", data);
    await refreshLookups();
    return res.property;
  }, [refreshLookups]);

  const updateProperty = useCallback(async (id: number, patch: Partial<NewProperty>) => {
    const res = await api<{ property: Property }>("PUT", `/api/properties/${id}`, patch);
    await refreshLookups();
    return res.property;
  }, [refreshLookups]);

  const deleteProperty = useCallback(async (id: number) => {
    await api("DELETE", `/api/properties/${id}`);
    await refreshLookups();
  }, [refreshLookups]);

  // Unit mutations ─────────────────────────────────────────────────

  const listUnits = useCallback(async (propertyId?: number): Promise<Unit[]> => {
    const path = propertyId ? `/api/units?property_id=${propertyId}` : "/api/units";
    const data = await api<{ units: Unit[] }>("GET", path);
    return data.units;
  }, []);

  const createUnit = useCallback(async (data: NewUnit) => {
    const res = await api<{ unit: Unit }>("POST", "/api/units", data);
    await refreshLookups();
    return res.unit;
  }, [refreshLookups]);

  const updateUnit = useCallback(async (id: number, patch: Partial<NewUnit>) => {
    const res = await api<{ unit: Unit }>("PUT", `/api/units/${id}`, patch);
    await refreshLookups();
    return res.unit;
  }, [refreshLookups]);

  const deleteUnit = useCallback(async (id: number) => {
    await api("DELETE", `/api/units/${id}`);
    await refreshLookups();
  }, [refreshLookups]);

  // Tenant mutations ───────────────────────────────────────────────

  const listTenants = useCallback(async (q?: string): Promise<Tenant[]> => {
    const path = q ? `/api/tenants?q=${encodeURIComponent(q)}` : "/api/tenants";
    const data = await api<{ tenants: Tenant[] }>("GET", path);
    return data.tenants;
  }, []);

  const createTenant = useCallback(async (data: NewTenant) => {
    const res = await api<{ tenant: Tenant }>("POST", "/api/tenants", data);
    return res.tenant;
  }, []);

  const updateTenant = useCallback(async (id: number, patch: Partial<NewTenant>) => {
    const res = await api<{ tenant: Tenant }>("PUT", `/api/tenants/${id}`, patch);
    return res.tenant;
  }, []);

  const deleteTenant = useCallback(async (id: number) => {
    await api("DELETE", `/api/tenants/${id}`);
  }, []);

  // Lease mutations ────────────────────────────────────────────────

  const listLeases = useCallback(async (params?: { tenant_id?: number; unit_id?: number; status?: string }): Promise<Lease[]> => {
    const qs = new URLSearchParams();
    if (params?.tenant_id) qs.set("tenant_id", String(params.tenant_id));
    if (params?.unit_id) qs.set("unit_id", String(params.unit_id));
    if (params?.status) qs.set("status", params.status);
    const path = qs.toString() ? `/api/leases?${qs.toString()}` : "/api/leases";
    const data = await api<{ leases: Lease[] }>("GET", path);
    return data.leases;
  }, []);

  const createLease = useCallback(async (data: NewLease) => {
    const res = await api<{ lease: Lease }>("POST", "/api/leases", data);
    await refreshLookups();
    return res.lease;
  }, [refreshLookups]);

  const updateLease = useCallback(async (id: number, patch: Partial<NewLease>) => {
    const res = await api<{ lease: Lease }>("PUT", `/api/leases/${id}`, patch);
    await refreshLookups();
    return res.lease;
  }, [refreshLookups]);

  const deleteLease = useCallback(async (id: number) => {
    await api("DELETE", `/api/leases/${id}`);
    await refreshLookups();
  }, [refreshLookups]);

  // Rent / payments ────────────────────────────────────────────────

  const listCharges = useCallback(async (period?: string): Promise<RentCharge[]> => {
    const path = period ? `/api/rent-charges?period=${encodeURIComponent(period)}` : "/api/rent-charges";
    const data = await api<{ charges: RentCharge[] }>("GET", path);
    return data.charges;
  }, []);

  const generateCharges = useCallback(async (period: string) => {
    const data = await api<{ created: number; period: string }>("POST", `/api/rent-charges/generate?today=${toIsoDate(new Date())}`, { period });
    return data;
  }, []);

  const recordPayment = useCallback(async (input: {
    charge_id: number;
    amount: number;
    method?: string;
    reference?: string | null;
    notes?: string | null;
    paid_at?: string;
  }) => {
    const res = await api<{ charge: RentCharge }>("POST", `/api/payments?today=${toIsoDate(new Date())}`, input);
    return res.charge;
  }, []);

  // Vendor mutations ───────────────────────────────────────────────

  const createVendor = useCallback(async (data: NewVendor) => {
    const res = await api<{ vendor: Vendor }>("POST", "/api/vendors", data);
    await refreshLookups();
    return res.vendor;
  }, [refreshLookups]);

  const updateVendor = useCallback(async (id: number, patch: Partial<NewVendor>) => {
    const res = await api<{ vendor: Vendor }>("PUT", `/api/vendors/${id}`, patch);
    await refreshLookups();
    return res.vendor;
  }, [refreshLookups]);

  const deleteVendor = useCallback(async (id: number) => {
    await api("DELETE", `/api/vendors/${id}`);
    await refreshLookups();
  }, [refreshLookups]);

  // Work order mutations ───────────────────────────────────────────

  const listWorkOrders = useCallback(async (params?: { status?: string; property_id?: number }): Promise<WorkOrder[]> => {
    const qs = new URLSearchParams();
    if (params?.status) qs.set("status", params.status);
    if (params?.property_id) qs.set("property_id", String(params.property_id));
    const path = qs.toString() ? `/api/work-orders?${qs.toString()}` : "/api/work-orders";
    const data = await api<{ work_orders: WorkOrder[] }>("GET", path);
    return data.work_orders;
  }, []);

  const createWorkOrder = useCallback(async (data: NewWorkOrder) => {
    const res = await api<{ work_order: WorkOrder }>("POST", "/api/work-orders", data);
    return res.work_order;
  }, []);

  const updateWorkOrder = useCallback(async (id: number, patch: Partial<NewWorkOrder>) => {
    const res = await api<{ work_order: WorkOrder }>("PUT", `/api/work-orders/${id}`, patch);
    return res.work_order;
  }, []);

  const deleteWorkOrder = useCallback(async (id: number) => {
    await api("DELETE", `/api/work-orders/${id}`);
  }, []);

  const decideApproval = useCallback(async (id: number, decision: Exclude<ApprovalStatus, "pending">) => {
    const res = await api<{ work_order: WorkOrder }>("POST", `/api/work-orders/${id}/approval`, { decision });
    return res.work_order;
  }, []);

  // Accounts & bills ─────────────────────────────────────────────

  const listAccounts = useCallback(async (): Promise<Account[]> => {
    const data = await api<{ accounts: Account[] }>("GET", "/api/accounts");
    return data.accounts;
  }, []);

  const listBills = useCallback(async (params?: { property_id?: number; status?: "paid" | "unpaid" }): Promise<Bill[]> => {
    const qs = new URLSearchParams();
    if (params?.property_id) qs.set("property_id", String(params.property_id));
    if (params?.status) qs.set("status", params.status);
    const data = await api<{ bills: Bill[] }>("GET", qs.toString() ? `/api/bills?${qs.toString()}` : "/api/bills");
    return data.bills;
  }, []);

  const createBill = useCallback(async (data: NewBill) => {
    const res = await api<{ bill: Bill }>("POST", "/api/bills", data);
    return res.bill;
  }, []);

  const updateBill = useCallback(async (id: number, data: NewBill) => {
    const res = await api<{ bill: Bill }>("PUT", `/api/bills/${id}`, data);
    return res.bill;
  }, []);

  const deleteBill = useCallback(async (id: number) => {
    await api("DELETE", `/api/bills/${id}`);
  }, []);

  const payBill = useCallback(async (id: number, data: NewBillPayment) => {
    const res = await api<{ bill: Bill }>("POST", `/api/bills/${id}/payments`, data);
    return res.bill;
  }, []);

  const voidBillPayment = useCallback(async (paymentId: number) => {
    const res = await api<{ bill: Bill }>("POST", `/api/bill-payments/${paymentId}/void`);
    return res.bill;
  }, []);

  // Recurring tasks ──────────────────────────────────────────────

  const listRecurringTasks = useCallback(async (): Promise<RecurringTask[]> => {
    const data = await api<{ recurring_tasks: RecurringTask[] }>("GET", "/api/recurring-tasks");
    return data.recurring_tasks;
  }, []);

  const createRecurringTask = useCallback(async (data: NewRecurringTask) => {
    await api("POST", "/api/recurring-tasks", data);
  }, []);

  const updateRecurringTask = useCallback(async (id: number, patch: Partial<NewRecurringTask>) => {
    await api("PUT", `/api/recurring-tasks/${id}`, patch);
  }, []);

  const deleteRecurringTask = useCallback(async (id: number) => {
    await api("DELETE", `/api/recurring-tasks/${id}`);
  }, []);

  const generateRecurringTasks = useCallback(async (today: string) => {
    return api<{ created: number; through: string }>("POST", "/api/recurring-tasks/generate", { today });
  }, []);

  // Lease checklists ─────────────────────────────────────────────

  const listChecklists = useCallback(async (leaseId: number): Promise<LeaseChecklist[]> => {
    const data = await api<{ checklists: LeaseChecklist[] }>("GET", `/api/leases/${leaseId}/checklists`);
    return data.checklists;
  }, []);

  const createChecklist = useCallback(async (leaseId: number, kind: ChecklistKind): Promise<LeaseChecklist[]> => {
    const data = await api<{ checklists: LeaseChecklist[] }>("POST", `/api/leases/${leaseId}/checklists`, { kind });
    return data.checklists;
  }, []);

  const addChecklistItem = useCallback(async (checklistId: number, label: string) => {
    await api("POST", `/api/checklists/${checklistId}/items`, { label });
  }, []);

  const updateChecklistItem = useCallback(async (itemId: number, patch: { label?: string; done?: boolean }) => {
    await api("PUT", `/api/checklist-items/${itemId}`, patch);
  }, []);

  const deleteChecklistItem = useCallback(async (itemId: number) => {
    await api("DELETE", `/api/checklist-items/${itemId}`);
  }, []);

  // Applications ─────────────────────────────────────────────────

  const listApplications = useCallback(async (params?: { status?: string; q?: string }): Promise<Application[]> => {
    const qs = new URLSearchParams();
    if (params?.status) qs.set("status", params.status);
    if (params?.q) qs.set("q", params.q);
    const path = qs.toString() ? `/api/applications?${qs.toString()}` : "/api/applications";
    const data = await api<{ applications: Application[] }>("GET", path);
    return data.applications;
  }, []);

  const createApplication = useCallback(async (data: NewApplication) => {
    const res = await api<{ application: Application }>("POST", "/api/applications", data);
    return res.application;
  }, []);

  const updateApplication = useCallback(async (id: number, patch: Partial<NewApplication>) => {
    const res = await api<{ application: Application }>("PUT", `/api/applications/${id}`, patch);
    return res.application;
  }, []);

  const deleteApplication = useCallback(async (id: number) => {
    await api("DELETE", `/api/applications/${id}`);
  }, []);

  // Reports ──────────────────────────────────────────────────────

  const getIncomeReport = useCallback(async (params?: { from?: string; to?: string; property_id?: number }): Promise<IncomeReport> => {
    const qs = new URLSearchParams();
    if (params?.from) qs.set("from", params.from);
    if (params?.to) qs.set("to", params.to);
    if (params?.property_id) qs.set("property_id", String(params.property_id));
    const path = qs.toString() ? `/api/reports/income?${qs.toString()}` : "/api/reports/income";
    return api<IncomeReport>("GET", path);
  }, []);

  const getProfitLossReport = useCallback(async (params: { from: string; to: string; property_id?: number }): Promise<ProfitLossReport> => {
    const qs = new URLSearchParams({ from: params.from, to: params.to });
    if (params.property_id) qs.set("property_id", String(params.property_id));
    return api<ProfitLossReport>("GET", `/api/reports/profit-loss?${qs.toString()}`);
  }, []);

  const getBudgetReport = useCallback(async (propertyId: number, year: number): Promise<BudgetReport> => {
    return api<BudgetReport>("GET", `/api/reports/budget?property_id=${propertyId}&year=${year}`);
  }, []);

  const saveBudget = useCallback(async (data: { property_id: number; year: number; lines: { account_id: number; amount_cents: number | null }[] }) => {
    await api("PUT", "/api/budgets", data);
  }, []);

  const getMaintenanceReport = useCallback(async (params?: { from?: string; to?: string; property_id?: number; vendor_id?: number }): Promise<MaintenanceReport> => {
    const qs = new URLSearchParams();
    if (params?.from) qs.set("from", params.from);
    if (params?.to) qs.set("to", params.to);
    if (params?.property_id) qs.set("property_id", String(params.property_id));
    if (params?.vendor_id) qs.set("vendor_id", String(params.vendor_id));
    const path = qs.toString() ? `/api/reports/maintenance?${qs.toString()}` : "/api/reports/maintenance";
    return api<MaintenanceReport>("GET", path);
  }, []);

  // Both pass the local date so overdue and occupancy match the dashboard.
  const getDelinquencyReport = useCallback(async (params?: { property_id?: number }): Promise<{ rows: DelinquencyRow[] }> => {
    const qs = new URLSearchParams({ today: toIsoDate(new Date()) });
    if (params?.property_id) qs.set("property_id", String(params.property_id));
    return api<{ rows: DelinquencyRow[] }>("GET", `/api/reports/delinquency?${qs.toString()}`);
  }, []);

  const getOccupancyReport = useCallback(async (params?: { from?: string; to?: string; property_id?: number }): Promise<OccupancyReport> => {
    const today = toIsoDate(new Date());
    const qs = new URLSearchParams({ today, to: params?.to ?? today.slice(0, 7) });
    if (params?.from) qs.set("from", params.from);
    if (params?.property_id) qs.set("property_id", String(params.property_id));
    return api<OccupancyReport>("GET", `/api/reports/occupancy?${qs.toString()}`);
  }, []);

  return {
    // data
    properties, vendors, settings,
    loading, error, setError,
    // signed-in user
    me, signOut, authProblem,
    listUsers, createUser, updateUser,
    // refresh
    refreshLookups,
    // settings
    updateSettings,
    // properties / units
    createProperty, updateProperty, deleteProperty,
    listUnits, createUnit, updateUnit, deleteUnit,
    // tenants
    listTenants, createTenant, updateTenant, deleteTenant,
    // leases
    listLeases, createLease, updateLease, deleteLease,
    // rent
    listCharges, generateCharges, recordPayment,
    // vendors
    createVendor, updateVendor, deleteVendor,
    // work orders
    listWorkOrders, createWorkOrder, updateWorkOrder, deleteWorkOrder, decideApproval,
    // accounts & bills
    listAccounts, listBills, createBill, updateBill, deleteBill, payBill, voidBillPayment,
    // recurring tasks
    listRecurringTasks, createRecurringTask, updateRecurringTask, deleteRecurringTask, generateRecurringTasks,
    // lease checklists
    listChecklists, createChecklist, addChecklistItem, updateChecklistItem, deleteChecklistItem,
    // applications
    listApplications, createApplication, updateApplication, deleteApplication,
    // reports
    getIncomeReport, getProfitLossReport, getBudgetReport, saveBudget, getMaintenanceReport, getDelinquencyReport, getOccupancyReport,
  };
}

export type AppStateValue = ReturnType<typeof useAppState>;
