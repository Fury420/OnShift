"use client"

import { useState } from "react"
import { Umbrella, ArrowLeftRight, Plus } from "lucide-react"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { LeaveRequestDialog } from "@/components/leaves/leave-request-dialog"
import { EmployeeLeavesTable, type LeaveRow } from "@/components/leaves/employee-leaves-table"
import { MyRequestsTable, type MyReplacementRequest } from "@/components/shift-replacement/my-requests-table"

export interface RequestTabsProps {
  leaves: LeaveRow[]
  myRequests: MyReplacementRequest[]
  monthLabel: string
  prevMonth: string
  nextMonth: string
  isCurrentMonth: boolean
}

export function RequestTabs({
  leaves,
  myRequests,
  monthLabel,
  prevMonth,
  nextMonth,
  isCurrentMonth,
}: RequestTabsProps) {
  const [leaveDialogOpen, setLeaveDialogOpen] = useState(false)

  return (
    <Tabs defaultValue="dovolenky" className="w-full">
      <TabsList className="grid w-full max-w-md grid-cols-2 lg:w-auto lg:inline-flex">
        <TabsTrigger value="dovolenky" className="gap-1.5">
          <Umbrella className="size-4" />
          Dovolenky
        </TabsTrigger>
        <TabsTrigger value="vymeny" className="gap-1.5">
          <ArrowLeftRight className="size-4" />
          Výmeny zmien
        </TabsTrigger>
      </TabsList>

      <TabsContent value="dovolenky" className="mt-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 gap-4">
            <CardTitle className="text-base">Moje žiadosti o voľno</CardTitle>
            <Button size="sm" onClick={() => setLeaveDialogOpen(true)}>
              <Plus className="size-4" />
              Nová žiadosť
            </Button>
          </CardHeader>
          <CardContent>
            <EmployeeLeavesTable rows={leaves} />
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="vymeny" className="mt-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Moje žiadosti o výmenu zmeny</CardTitle>
          </CardHeader>
          <CardContent>
            <MyRequestsTable
              requests={myRequests}
              monthLabel={monthLabel}
              prevMonth={prevMonth}
              nextMonth={nextMonth}
              isCurrentMonth={isCurrentMonth}
            />
          </CardContent>
        </Card>
      </TabsContent>

      <LeaveRequestDialog open={leaveDialogOpen} onOpenChange={setLeaveDialogOpen} />
    </Tabs>
  )
}
