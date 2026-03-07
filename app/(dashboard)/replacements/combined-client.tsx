"use client"

import type { LeaveRow } from "@/components/leaves/employee-leaves-table"
import type { AdminLeaveRow } from "@/components/leaves/admin-leaves-table"
import { RequestTabs } from "./request-tabs"

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
  pendingLeaves: AdminLeaveRow[]
  monthLabel: string
  prevMonth: string
  nextMonth: string
  isCurrentMonth: boolean
  myShifts: { id: string; label: string }[]
  colleagues: { id: string; name: string }[]
}

export function CombinedClient({
  leaves,
  isAdmin,
  myRequests,
  incomingRequests,
  allPendingRequests,
  pendingLeaves,
  monthLabel,
  prevMonth,
  nextMonth,
  isCurrentMonth,
  myShifts,
  colleagues,
}: Props) {
  return (
    <div className="flex flex-col gap-6 max-w-4xl mx-auto w-full">
      <h1 className="text-2xl font-semibold">Žiadosti</h1>

      <RequestTabs
        isAdmin={isAdmin}
        leaves={leaves}
        myRequests={myRequests}
        pendingLeaves={pendingLeaves}
        incomingRequests={incomingRequests}
        allPendingRequests={allPendingRequests}
        monthLabel={monthLabel}
        prevMonth={prevMonth}
        nextMonth={nextMonth}
        isCurrentMonth={isCurrentMonth}
        myShifts={myShifts}
        colleagues={colleagues}
      />
    </div>
  )
}
