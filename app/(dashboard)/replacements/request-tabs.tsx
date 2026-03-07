"use client"

import { useState } from "react"
import { Umbrella, ArrowLeftRight, Plus } from "lucide-react"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { LeaveRequestDialog } from "@/components/leaves/leave-request-dialog"
import { EmployeeLeavesTable, type LeaveRow } from "@/components/leaves/employee-leaves-table"
import { AdminLeavesTable, type AdminLeaveRow } from "@/components/leaves/admin-leaves-table"
import { MyRequestsTable, type MyReplacementRequest } from "@/components/shift-replacement/my-requests-table"
import { IncomingRequestsTable } from "@/components/shift-replacement/incoming-requests-table"
import { AdminReplacementsTable, type AdminReplacementRequest } from "@/components/shift-replacement/admin-replacements-table"
import { NewReplacementDialog, type ShiftOption, type ColleagueOption } from "@/components/shift-replacement/new-replacement-dialog"

const EMPTY_MESSAGE = "Zatiaľ tu nič nie je."

export interface RequestTabsProps {
  isAdmin: boolean
  leaves: LeaveRow[]
  myRequests: MyReplacementRequest[]
  pendingLeaves: AdminLeaveRow[]
  incomingRequests: { id: string; shiftDate: string; shiftTime: string; requesterName: string; note: string | null }[]
  allPendingRequests: AdminReplacementRequest[]
  monthLabel: string
  prevMonth: string
  nextMonth: string
  isCurrentMonth: boolean
  myShifts?: ShiftOption[]
  colleagues?: ColleagueOption[]
}

export function RequestTabs({
  isAdmin,
  leaves,
  myRequests,
  pendingLeaves,
  incomingRequests,
  allPendingRequests,
  monthLabel,
  prevMonth,
  nextMonth,
  isCurrentMonth,
  myShifts = [],
  colleagues = [],
}: RequestTabsProps) {
  const [leaveDialogOpen, setLeaveDialogOpen] = useState(false)
  const [replacementDialogOpen, setReplacementDialogOpen] = useState(false)

  return (
    <>
      <p className="text-sm text-muted-foreground mt-1">
        {isAdmin ? "Admin schvaľovanie" : "Môj prehľad"}
      </p>

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
              <CardTitle className="text-base">
                {isAdmin ? "Žiadosti o voľno na schválenie" : "Moje žiadosti o voľno"}
              </CardTitle>
              {!isAdmin && (
                <Button size="sm" onClick={() => setLeaveDialogOpen(true)}>
                  <Plus className="size-4" />
                  Nová žiadosť
                </Button>
              )}
            </CardHeader>
            <CardContent>
              {isAdmin ? (
                pendingLeaves.length === 0 ? (
                  <p className="py-8 text-center text-muted-foreground">{EMPTY_MESSAGE}</p>
                ) : (
                  <AdminLeavesTable rows={pendingLeaves} />
                )
              ) : leaves.length === 0 ? (
                <p className="py-8 text-center text-muted-foreground">{EMPTY_MESSAGE}</p>
              ) : (
                <EmployeeLeavesTable rows={leaves} />
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="vymeny" className="mt-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 gap-4">
              <CardTitle className="text-base">
                {isAdmin ? "Žiadosti o výmenu na schválenie" : "Výmeny zmien"}
              </CardTitle>
              {!isAdmin && (
                <Button size="sm" variant="outline" onClick={() => setReplacementDialogOpen(true)}>
                  <Plus className="size-4" />
                  Požiadať o zastup
                </Button>
              )}
            </CardHeader>
            <CardContent className="flex flex-col gap-6">
              {isAdmin ? (
                allPendingRequests.length === 0 ? (
                  <p className="py-8 text-center text-muted-foreground">{EMPTY_MESSAGE}</p>
                ) : (
                  <AdminReplacementsTable requests={allPendingRequests} />
                )
              ) : (
                <>
                  {incomingRequests.length > 0 && (
                    <div className="flex flex-col gap-2">
                      <p className="text-sm text-muted-foreground">Kolegovia ťa navrhli ako náhradníka.</p>
                      <IncomingRequestsTable requests={incomingRequests} />
                    </div>
                  )}
                  <div className="flex flex-col gap-2">
                    <p className="text-sm font-medium">Moje žiadosti</p>
                    {myRequests.length === 0 && incomingRequests.length === 0 ? (
                      <p className="py-8 text-center text-muted-foreground">{EMPTY_MESSAGE}</p>
                    ) : myRequests.length === 0 ? (
                      <p className="py-4 text-center text-muted-foreground text-sm">{EMPTY_MESSAGE}</p>
                    ) : (
                      <MyRequestsTable
                        requests={myRequests}
                        monthLabel={monthLabel}
                        prevMonth={prevMonth}
                        nextMonth={nextMonth}
                        isCurrentMonth={isCurrentMonth}
                      />
                    )}
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <LeaveRequestDialog open={leaveDialogOpen} onOpenChange={setLeaveDialogOpen} />
      <NewReplacementDialog
        open={replacementDialogOpen}
        onOpenChange={setReplacementDialogOpen}
        myShifts={myShifts}
        colleagues={colleagues}
      />
    </>
  )
}
