"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { EditAttendanceDialog } from "@/components/attendance/edit-attendance-dialog"

export interface AttendanceRecord {
  id: string
  date: string
  dateStr: string       // YYYY-MM-DD in Bratislava TZ
  clockIn: string
  clockOut: string | null
  duration: string | null
  note: string | null
  isOpen: boolean
  isWeekend: boolean
}

interface AttendanceTableProps {
  records: AttendanceRecord[]
  totalDuration: string   // pre-formatted fallback (no active session)
  totalMs: number         // completed sessions in ms (raw, for live calc)
  activeClockInTime: string | null // ISO string of open record
  monthLabel: string
  prevMonth: string
  nextMonth: string
  isCurrentMonth: boolean
  userName: string
  monthlyWage: number | null
  hourlyRate: number | null
}

function formatLive(ms: number) {
  const s = Math.floor(ms / 1000)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`
}

export function AttendanceTable({
  records,
  totalDuration,
  totalMs,
  activeClockInTime,
  monthLabel,
  prevMonth,
  nextMonth,
  isCurrentMonth,
  userName,
  monthlyWage,
  hourlyRate,
}: AttendanceTableProps) {
  const [liveTotal, setLiveTotal] = useState<string | null>(null)

  useEffect(() => {
    if (!activeClockInTime) {
      setLiveTotal(null)
      return
    }
    const start = new Date(activeClockInTime).getTime()
    const tick = () => setLiveTotal(formatLive(totalMs + (Date.now() - start)))
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [activeClockInTime, totalMs])

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-medium capitalize">{monthLabel}</h2>
          <p className="text-sm text-muted-foreground">{userName}</p>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" asChild>
            <Link href={`/attendance?month=${prevMonth}`}>
              <ChevronLeft className="size-4" />
            </Link>
          </Button>
          {isCurrentMonth ? (
            <Button variant="ghost" size="icon" disabled>
              <ChevronRight className="size-4" />
            </Button>
          ) : (
            <Button variant="ghost" size="icon" asChild>
              <Link href={`/attendance?month=${nextMonth}`}>
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
              <TableHead>Dátum</TableHead>
              <TableHead>Príchod – Odchod</TableHead>
              <TableHead className="text-right">Odpracované</TableHead>
              <TableHead className="w-8" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {records.length === 0 ? (
              <TableRow>
                <TableCell colSpan={3} className="py-10 text-center text-muted-foreground">
                  Žiadne záznamy za tento mesiac
                </TableCell>
              </TableRow>
            ) : (
              records.map((r) => (
                <TableRow key={r.id} className={r.isWeekend ? "bg-muted/40" : undefined}>
                  <TableCell className="font-medium">{r.date}</TableCell>
                  <TableCell>
                    <div className="flex flex-col gap-0.5">
                      {r.isOpen ? (
                        <span className="flex items-center gap-1.5">
                          {r.clockIn}
                          <span className="text-muted-foreground">–</span>
                          <Badge variant="secondary" className="text-green-600 bg-green-50">
                            Pracuje
                          </Badge>
                        </span>
                      ) : (
                        <span className="tabular-nums">
                          {r.clockIn}
                          <span className="text-muted-foreground mx-1.5">–</span>
                          {r.clockOut}
                        </span>
                      )}
                      {r.note && (
                        <span className="text-xs text-muted-foreground">{r.note}</span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm">{r.duration ?? "—"}</TableCell>
                  <TableCell className="text-right">
                    {!r.isOpen && (
                      <EditAttendanceDialog
                        id={r.id}
                        dateStr={r.dateStr}
                        clockIn={r.clockIn}
                        clockOut={r.clockOut!}
                        note={r.note}
                      />
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
          {records.length > 0 && (
            <TableFooter>
              <TableRow>
                <TableCell colSpan={2} className="font-medium">
                  Celkom
                </TableCell>
                <TableCell className="text-right font-mono font-semibold tabular-nums">
                  {liveTotal ?? totalDuration}
                </TableCell>
                <TableCell />
              </TableRow>
              {monthlyWage != null && (
                <TableRow>
                  <TableCell colSpan={2} className="font-medium text-muted-foreground">
                    Mzda za mesiac
                    {hourlyRate != null && (
                      <span className="ml-1.5 text-xs font-normal">({hourlyRate.toFixed(2).replace(".", ",")} €/h)</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right font-semibold tabular-nums">
                    {monthlyWage.toLocaleString("sk-SK", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €
                  </TableCell>
                  <TableCell />
                </TableRow>
              )}
            </TableFooter>
          )}
        </Table>
      </div>
    </div>
  )
}
