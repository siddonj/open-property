import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RentRollTab } from "./rent-roll-tab";
import { IncomeTab } from "./income-tab";
import { MaintenanceTab } from "./maintenance-tab";
import { DelinquencyTab } from "./delinquency-tab";
import { OccupancyTab } from "./occupancy-tab";
import { ProfitLossTab } from "./profit-loss-tab";
import { BudgetTab } from "./budget-tab";

export function ReportsPage() {
  // Deep links such as /reports?tab=profit-loss&property_id=3&from=2026-01&to=2026-10 (property page Financials card).
  const params = new URLSearchParams(window.location.search);
  const initialProperty = params.get("property_id") ?? undefined;
  return (
    <div className="flex-1 overflow-auto">
      <div className="mx-auto w-full max-w-7xl space-y-6 p-6">
        <header>
          <h1 className="text-2xl font-semibold tracking-tight">Reports</h1>
          <p className="text-sm text-muted-foreground">Rent roll, income, profit and loss, and maintenance spend over time</p>
        </header>

        <Tabs defaultValue={params.get("tab") ?? "rent-roll"}>
          <TabsList>
            <TabsTrigger value="rent-roll">Rent roll</TabsTrigger>
            <TabsTrigger value="income">Income</TabsTrigger>
            <TabsTrigger value="profit-loss">Profit &amp; loss</TabsTrigger>
            <TabsTrigger value="budget">Budget</TabsTrigger>
            <TabsTrigger value="maintenance">Maintenance</TabsTrigger>
            <TabsTrigger value="delinquency">Delinquency</TabsTrigger>
            <TabsTrigger value="occupancy">Occupancy</TabsTrigger>
          </TabsList>

          <TabsContent value="rent-roll" className="mt-4">
            <RentRollTab />
          </TabsContent>
          <TabsContent value="income" className="mt-4">
            <IncomeTab />
          </TabsContent>
          <TabsContent value="profit-loss" className="mt-4">
            <ProfitLossTab
              initialPropertyId={initialProperty}
              initialFrom={params.get("from") ?? undefined}
              initialTo={params.get("to") ?? undefined}
            />
          </TabsContent>
          <TabsContent value="budget" className="mt-4">
            <BudgetTab />
          </TabsContent>
          <TabsContent value="maintenance" className="mt-4">
            <MaintenanceTab />
          </TabsContent>
          <TabsContent value="delinquency" className="mt-4">
            <DelinquencyTab />
          </TabsContent>
          <TabsContent value="occupancy" className="mt-4">
            <OccupancyTab />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
