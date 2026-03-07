"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Plus, ArrowLeftRight } from "lucide-react"
import { RequestTabs } from "./request-tabs"
import type { LeaveRow } from "@/components/leaves/employee-leaves-table"
import { IncomingRequestsTable } from "@/components/shift-replacement/incoming-requests-table"
import { AdminReplacementsTable } from "@/components/shift-replacement/admin-replacements-table"
import { NewReplacementDialog, type ShiftOption, type ColleagueOption } from "@/components/shift-replacement/new-replacement-dialog"

interface MyRequest {
  id: string
  shiftDate: string
  shiftTime: string
  replacementName: string
  status: "pending" | "accepted" | "rejected"
  note: string | null
}

interface IncomingRequest {
  id: string
  shiftDate: string
  shiftTime: string
  requesterName: string
  note: string | null
}

interface AdminRequest {
  id: string
  shiftDate: string
  shiftTime: string
  requesterName: string
  replacementName: string
  status: "pending"
  note: string | null
  createdAt: string
}

interface Props {
  leaves: LeaveRow[]
  isAdmin: boolean
  myRequests: MyRequest[]
  incomingRequests: IncomingRequest[]
  allPendingRequests: AdminRequest[]
  monthLabel: string
  prevMonth: string
  nextMonth: string
  isCurrentMonth: boolean
  myShifts: ShiftOption[]
  colleagues: ColleagueOption[]
}

export function CombinedClient({
  leaves,
  isAdmin,
  myRequests,
  incomingRequests,
  allPendingRequests,
  monthLabel,
  prevMonth,
  nextMonth,
  isCurrentMonth,
  myShifts,
  colleagues,
}: Props) {
  const [replacementDialogOpen, setReplacementDialogOpen] = useState(false)

  return (
    <div className="flex flex-col gap-6 max-w-4xl mx-auto w-full">
      <h1 className="text-2xl font-semibold">Žiadosti</h1>

      <RequestTabs
        leaves={leaves}
        myRequests={myRequests}
        monthLabel={monthLabel}
        prevMonth={prevMonth}
        nextMonth={nextMonth}
        isCurrentMonth={isCurrentMonth}
      />

      {/* ── Zastup: prichádzajúce / admin ─────────────────── */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div className="flex items-center gap-2">
            <ArrowLeftRight className="size-4 text-muted-foreground" />
            <CardTitle className="text-base">Zastup zmien</CardTitle>
          </div>
          <Button size="sm" variant="outline" onClick={() => setReplacementDialogOpen(true)}>
            <Plus className="size-4" />
            Požiadať o zastup
          </Button>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          {isAdmin ? (
            <div className="flex flex-col gap-2">
              <p className="text-sm text-muted-foreground">Všetky čakajúce žiadosti o zastup.</p>
              <AdminReplacementsTable requests={allPendingRequests} />
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <p className="text-sm text-muted-foreground">Kolegovia ťa navrhli ako náhradníka.</p>
              <IncomingRequestsTable requests={incomingRequests} />
            </div>
          )}
        </CardContent>
      </Card>

      <NewReplacementDialog
        open={replacementDialogOpen}
        onOpenChange={setReplacementDialogOpen}
        myShifts={myShifts}
        colleagues={colleagues}
      />
    </div>
  )
}
