"use client"

import Link from "next/link"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

export interface MyReplacementRequest {
  id: string
  shiftDate: string
  shiftTime: string
  replacementName: string
  status: "pending" | "accepted" | "rejected"
  note: string | null
}

interface MyRequestsTableProps {
  requests: MyReplacementRequest[]
  monthLabel: string
  prevMonth: string
  nextMonth: string
  isCurrentMonth: boolean
}

function StatusBadge({ status }: { status: MyReplacementRequest["status"] }) {
  if (status === "accepted")
    return <Badge className="bg-green-500/15 text-green-700 hover:bg-green-500/15 border-0">Prijatá</Badge>
  if (status === "rejected")
    return <Badge variant="destructive" className="border-0">Odmietnutá</Badge>
  return <Badge className="bg-yellow-500/15 text-yellow-700 hover:bg-yellow-500/15 border-0">Čaká</Badge>
}

export function MyRequestsTable({
  requests,
  monthLabel,
  prevMonth,
  nextMonth,
  isCurrentMonth,
}: MyRequestsTableProps) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium capitalize">{monthLabel}</span>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" asChild>
            <Link href={`/replacements?month=${prevMonth}`}>
              <ChevronLeft className="size-4" />
            </Link>
          </Button>
          {isCurrentMonth ? (
            <Button variant="ghost" size="icon" disabled>
              <ChevronRight className="size-4" />
            </Button>
          ) : (
            <Button variant="ghost" size="icon" asChild>
              <Link href={`/replacements?month=${nextMonth}`}>
                <ChevronRight className="size-4" />
              </Link>
            </Button>
          )}
        </div>
      </div>

      <div className="overflow-x-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Zmena</TableHead>
              <TableHead>Navrhnutý náhradník</TableHead>
              <TableHead>Poznámka</TableHead>
              <TableHead>Stav</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {requests.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="py-10 text-center text-muted-foreground">
                  Žiadne žiadosti za tento mesiac
                </TableCell>
              </TableRow>
            ) : (
              requests.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">
                    {r.shiftDate}
                    <span className="ml-2 text-muted-foreground text-sm">{r.shiftTime}</span>
                  </TableCell>
                  <TableCell>{r.replacementName}</TableCell>
                  <TableCell className="text-muted-foreground">{r.note ?? "—"}</TableCell>
                  <TableCell>
                    <StatusBadge status={r.status} />
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
