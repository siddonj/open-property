import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RentRollTab } from "./rent-roll-tab";
import { IncomeTab } from "./income-tab";
import { MaintenanceTab } from "./maintenance-tab";
import { DelinquencyTab } from "./delinquency-tab";

export function ReportsPage() {
  return (
    <div className="flex-1 overflow-auto">
      <div className="mx-auto w-full max-w-7xl space-y-6 p-6">
        <header>
          <h1 className="text-2xl font-semibold tracking-tight">Reports</h1>
          <p className="text-sm text-muted-foreground">Rent roll, income, and maintenance spend over time</p>
        </header>

        <Tabs defaultValue="rent-roll">
          <TabsList>
            <TabsTrigger value="rent-roll">Rent roll</TabsTrigger>
            <TabsTrigger value="income">Income</TabsTrigger>
            <TabsTrigger value="maintenance">Maintenance</TabsTrigger>
            <TabsTrigger value="delinquency">Delinquency</TabsTrigger>
          </TabsList>

          <TabsContent value="rent-roll" className="mt-4">
            <RentRollTab />
          </TabsContent>
          <TabsContent value="income" className="mt-4">
            <IncomeTab />
          </TabsContent>
          <TabsContent value="maintenance" className="mt-4">
            <MaintenanceTab />
          </TabsContent>
          <TabsContent value="delinquency" className="mt-4">
            <DelinquencyTab />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
