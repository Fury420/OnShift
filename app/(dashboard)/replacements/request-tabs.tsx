"use client"

import { useState } from "react"
import { Umbrella, ArrowLeftRight, Plus } from "lucide-react"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { LeaveRequestDialog } from "@/components/leaves/leave-request-dialog"
import { EmployeeLeavesTable, type LeaveRow } from "@/components/leaves/employee-leaves-table"
import { AdminLeavesTable, type AdminLeaveRow } from "@/components/leaves/admin-leaves-table"
import { ApproveAsReplacementTable, type LeaveToApproveRow } from "@/components/leaves/approve-as-replacement-table"
import { MyRequestsTable, type MyReplacementRequest } from "@/components/shift-replacement/my-requests-table"
import { IncomingRequestsTable } from "@/components/shift-replacement/incoming-requests-table"
import { AdminReplacementsTable, type AdminReplacementRequest } from "@/components/shift-replacement/admin-replacements-table"
import { NewReplacementDialog, type ShiftOption, type ColleagueOption } from "@/components/shift-replacement/new-replacement-dialog"

const EMPTY_MESSAGE = "Zatiaľ tu nič nie je."

export interface RequestTabsProps {
  isAdmin: boolean
  leaves: LeaveRow[]
  myRequests: MyReplacementRequest[]
  pendingLeavesForAdmin: AdminLeaveRow[]
  leavesToApproveAsReplacement: LeaveToApproveRow[]
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
  pendingLeavesForAdmin,
  leavesToApproveAsReplacement,
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
      {isAdmin && (
        <p className="text-sm text-muted-foreground mt-1">Admin schvaľovanie</p>
      )}

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
              <Button size="sm" onClick={() => setLeaveDialogOpen(true)}>
                <Plus className="size-4" />
                Nová žiadosť
              </Button>
            </CardHeader>
            <CardContent className="flex flex-col gap-6">
              {isAdmin ? (
                pendingLeavesForAdmin.length === 0 ? (
                  <p className="py-8 text-center text-muted-foreground">{EMPTY_MESSAGE}</p>
                ) : (
                  <AdminLeavesTable rows={pendingLeavesForAdmin} />
                )
              ) : (
                <>
                  {leavesToApproveAsReplacement.length > 0 && (
                    <div className="flex flex-col gap-2">
                      <p className="text-sm font-medium">Žiadosti na schválenie (ste navrhnutý ako zastup)</p>
                      <ApproveAsReplacementTable rows={leavesToApproveAsReplacement} />
                    </div>
                  )}
                  <div className="flex flex-col gap-2">
                    {leaves.length === 0 && leavesToApproveAsReplacement.length === 0 ? (
                      <p className="py-8 text-center text-muted-foreground">{EMPTY_MESSAGE}</p>
                    ) : leaves.length === 0 ? (
                      <p className="py-4 text-center text-muted-foreground text-sm">{EMPTY_MESSAGE}</p>
                    ) : (
                      <EmployeeLeavesTable rows={leaves} />
                    )}
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="vymeny" className="mt-4">
          <div className="flex flex-col gap-4">
            {!isAdmin && myShifts.length > 0 && (
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 gap-4">
                  <CardTitle className="text-base">Moje naplánované zmeny</CardTitle>
                  <Button size="sm" variant="outline" onClick={() => setReplacementDialogOpen(true)}>
                    <Plus className="size-4" />
                    Požiadať o zastup
                  </Button>
                </CardHeader>
                <CardContent>
                  <div className="rounded-md border divide-y">
                    {myShifts.map((s) => (
                      <div key={s.id} className="flex items-center justify-between px-4 py-2.5 text-sm">
                        <span>{s.label}</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {!isAdmin && myShifts.length === 0 && (
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 gap-4">
                  <CardTitle className="text-base">Moje naplánované zmeny</CardTitle>
                  <Button size="sm" variant="outline" disabled>
                    <Plus className="size-4" />
                    Požiadať o zastup
                  </Button>
                </CardHeader>
                <CardContent>
                  <p className="py-6 text-center text-muted-foreground text-sm">Žiadne nadchádzajúce zmeny.</p>
                </CardContent>
              </Card>
            )}

            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  {isAdmin ? "Žiadosti o výmenu na schválenie" : "Žiadosti o zastup"}
                </CardTitle>
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
                        <p className="text-sm font-medium">Požiadali ťa o zastup</p>
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
          </div>
        </TabsContent>
      </Tabs>

      <LeaveRequestDialog open={leaveDialogOpen} onOpenChange={setLeaveDialogOpen} colleagues={colleagues} />
      <NewReplacementDialog
        open={replacementDialogOpen}
        onOpenChange={setReplacementDialogOpen}
        myShifts={myShifts}
        colleagues={colleagues}
      />
    </>
  )
}
