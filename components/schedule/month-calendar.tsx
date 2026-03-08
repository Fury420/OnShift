"use client"

import { useState, useTransition, useRef, useEffect, useCallback } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { ChevronLeft, ChevronRight, Plus, Check } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { LeaveRequestDialog } from "@/components/leaves/leave-request-dialog"
import type { ColleagueOption } from "@/components/shift-replacement/request-dialog"
import { claimShift } from "@/app/actions/schedule"
import { toast } from "sonner"
import { ShiftDialog } from "./shift-dialog"

export interface CalendarShift {
  id: string
  userId: string
  userName: string
  startTime: string
  endTime: string
  note: string | null
  color: string
  isCurrentUser: boolean
  canRequest: boolean
}

export interface OpenShift {
  id: string
  startTime: string
  endTime: string
  note: string | null
  maxClaims: number
  acceptedCount: number
  claimedByUsers: { userId: string; userName: string; color: string; claimId: string }[]
  myClaimId: string | null
  iMayClaim: boolean
}

export interface CalendarDay {
  date: string
  isCurrentMonth: boolean
  isToday: boolean
  shifts: CalendarShift[]
  openShifts: OpenShift[]
}

export interface BusinessHoursEntry {
  dayOfWeek: string
  isClosed: boolean
  openTime: string | null
  closeTime: string | null
}

interface MonthCalendarProps {
  weeks: CalendarDay[][]
  monthLabel: string
  prevMonth: string
  nextMonth: string
  allEmployees: ColleagueOption[]
  businessHours?: Map<string, BusinessHoursEntry>
  currentUserId?: string
  canCreateShifts?: boolean
}

interface LeaveContext {
  date: string
  shiftId?: string
  shiftLabel?: string
  colleagues?: ColleagueOption[]
}

const DAY_LABELS = ["Po", "Ut", "St", "Št", "Pi", "So", "Ne"]
const HOUR_HEIGHT = 56

function timeToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number)
  return h * 60 + m
}

function assignLanes<T extends { startTime: string; endTime: string }>(items: T[]): { item: T; lane: number; totalLanes: number }[] {
  if (!items.length) return []
  const indexed = items.map((item, i) => ({ item, i, start: timeToMinutes(item.startTime), end: timeToMinutes(item.endTime) }))
  indexed.sort((a, b) => a.start - b.start || a.end - b.end)
  const result: { lane: number }[] = new Array(items.length)
  const laneEnds: number[] = []
  for (const entry of indexed) {
    let lane = laneEnds.findIndex(end => end <= entry.start)
    if (lane === -1) { lane = laneEnds.length; laneEnds.push(entry.end) }
    else { laneEnds[lane] = entry.end }
    result[entry.i] = { lane }
  }
  const totalLanes = laneEnds.length
  return items.map((item, i) => ({ item, lane: result[i].lane, totalLanes }))
}

function snapTo15(minutes: number): number {
  return Math.round(minutes / 15) * 15
}

function minutesToTime(m: number): string {
  const h = Math.floor(m / 60)
  const min = m % 60
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`
}

interface DragPreview {
  date: string
  topMinutes: number
  bottomMinutes: number
}

export function MonthCalendar({ weeks, monthLabel, prevMonth, nextMonth, allEmployees, businessHours, currentUserId, canCreateShifts }: MonthCalendarProps) {
  const router = useRouter()
  const [view, setView] = useState<"month" | "week">("week")
  const [weekIdx, setWeekIdx] = useState(() => {
    const today = new Date().toISOString().slice(0, 10)
    const idx = weeks.findIndex((w) => w.some((d) => d.date === today))
    return idx >= 0 ? idx : weeks.findIndex((w) => w.some((d) => d.isCurrentMonth)) ?? 0
  })
  const [leaveCtx, setLeaveCtx] = useState<LeaveContext | null>(null)
  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const [createDate, setCreateDate] = useState<string | undefined>()
  const [createStartTime, setCreateStartTime] = useState<string | undefined>()
  const [createEndTime, setCreateEndTime] = useState<string | undefined>()
  const [isPending, startTransition] = useTransition()

  // Drag-to-create state
  const dragRef = useRef<{ date: string; anchorMinutes: number } | null>(null)
  const [dragPreview, setDragPreview] = useState<DragPreview | null>(null)
  const timelineRef = useRef<HTMLDivElement>(null)
  const layoutRef = useRef({ startHour: 8, PAD: 20 })

  const getMinutesFromY = useCallback((y: number, containerRect: DOMRect) => {
    const { startHour, PAD } = layoutRef.current
    const relY = y - containerRect.top
    const minutes = startHour * 60 + ((relY - PAD) / HOUR_HEIGHT) * 60
    return snapTo15(Math.max(0, minutes))
  }, [])

  const handleTimelineMouseDown = useCallback((e: React.MouseEvent, date: string) => {
    if (e.button !== 0) return
    e.preventDefault()
    const col = timelineRef.current?.querySelector(`[data-day-col="${date}"]`) as HTMLElement | null
    if (!col) return
    const rect = col.getBoundingClientRect()
    const minutes = getMinutesFromY(e.clientY, rect)
    dragRef.current = { date, anchorMinutes: minutes }
    setDragPreview({ date, topMinutes: minutes, bottomMinutes: minutes + 15 })
  }, [getMinutesFromY])

  useEffect(() => {
    function onMouseMove(e: MouseEvent) {
      const drag = dragRef.current
      if (!drag) return
      const col = timelineRef.current?.querySelector(`[data-day-col="${drag.date}"]`) as HTMLElement | null
      if (!col) return
      const rect = col.getBoundingClientRect()
      const minutes = getMinutesFromY(e.clientY, rect)
      const top = Math.min(drag.anchorMinutes, minutes)
      const bottom = Math.max(drag.anchorMinutes, minutes)
      setDragPreview({ date: drag.date, topMinutes: top, bottomMinutes: Math.max(bottom, top + 15) })
    }

    function onMouseUp() {
      const drag = dragRef.current
      if (!drag) return
      dragRef.current = null
      setDragPreview(prev => {
        if (!prev) return null
        const st = minutesToTime(prev.topMinutes)
        const et = minutesToTime(prev.bottomMinutes)
        setTimeout(() => {
          if (prev.bottomMinutes - prev.topMinutes >= 15) {
            if (canCreateShifts) openCreateDialog(drag.date, st, et)
          }
        }, 0)
        return null
      })
    }

    window.addEventListener("mousemove", onMouseMove)
    window.addEventListener("mouseup", onMouseUp)
    return () => {
      window.removeEventListener("mousemove", onMouseMove)
      window.removeEventListener("mouseup", onMouseUp)
    }
  }, [getMinutesFromY, canCreateShifts])

  const currentWeek = weeks[weekIdx] ?? weeks[0]
  const weekLabel = (() => {
    const s = new Date(currentWeek[0].date + "T12:00:00")
    const e = new Date(currentWeek[6].date + "T12:00:00")
    const fmt = (d: Date) => {
      const day = d.getDate()
      const mon = d.toLocaleDateString("en-US", { month: "short" })
      return `${day} ${mon}`
    }
    return `${fmt(s)} – ${fmt(e)}`
  })()

  function openCreateDialog(date?: string, startTime?: string, endTime?: string) {
    setCreateDate(date)
    setCreateStartTime(startTime)
    setCreateEndTime(endTime)
    setCreateDialogOpen(true)
  }

  function closeCreateDialog() {
    setCreateDialogOpen(false)
    setCreateDate(undefined)
    setCreateStartTime(undefined)
    setCreateEndTime(undefined)
    router.refresh()
  }

  function handleClaim(shiftId: string) {
    startTransition(async () => {
      try {
        await claimShift(shiftId)
        toast.success("Zmena bola priradená")
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Chyba pri prihlasovaní")
      }
    })
  }

  function openLeave(day: CalendarDay, shift: CalendarShift) {
    setLeaveCtx({
      date: day.date,
      shiftId: shift.id,
      shiftLabel: `${shift.startTime}–${shift.endTime}`,
      colleagues: allEmployees.filter((e) => e.id !== shift.userId),
    })
  }

  function handlePrevWeek() {
    if (weekIdx > 0) setWeekIdx(weekIdx - 1)
    else router.push(`/schedule?month=${prevMonth}`)
  }

  function handleNextWeek() {
    if (weekIdx < weeks.length - 1) setWeekIdx(weekIdx + 1)
    else router.push(`/schedule?month=${nextMonth}`)
  }

  function goToToday() {
    const today = new Date().toISOString().slice(0, 10)
    const idx = weeks.findIndex((w) => w.some((d) => d.date === today))
    if (idx >= 0) setWeekIdx(idx)
    else router.push("/schedule")
  }

  const todayStr = new Date().toISOString().slice(0, 10)

  const nextOpenShift = (() => {
    for (const week of weeks) {
      for (const day of week) {
        if (day.date < todayStr) continue
        for (const os of day.openShifts) {
          if (os.acceptedCount < os.maxClaims && os.iMayClaim && !os.myClaimId) {
            const d = new Date(day.date + "T12:00:00")
            const label = d.toLocaleDateString("sk-SK", { weekday: "long", day: "numeric", month: "long" })
            return { ...os, date: day.date, dateLabel: label }
          }
        }
      }
    }
    return null
  })()

  return (
    <div className="flex flex-col gap-4 w-full">
      {/* ── Nearest open shift banner ── */}
      {!canCreateShifts && nextOpenShift && (
        <div
          className="flex items-center justify-between gap-3 rounded-xl border border-primary/20 bg-primary/5 px-4 py-3 cursor-pointer hover:bg-primary/10 transition-colors"
          onClick={() => {
            const idx = weeks.findIndex((w) => w.some((d) => d.date === nextOpenShift.date))
            if (idx >= 0) { setWeekIdx(idx); setView("week") }
          }}
        >
          <div className="flex flex-col gap-0.5">
            <div className="text-sm font-semibold text-primary">Voľná zmena k dispozícii</div>
            <div className="text-sm text-muted-foreground capitalize">
              {nextOpenShift.dateLabel} · {nextOpenShift.startTime}–{nextOpenShift.endTime}
              {nextOpenShift.maxClaims > 1 && ` · ${nextOpenShift.maxClaims - nextOpenShift.acceptedCount} voľ. miest`}
            </div>
          </div>
          <Button
            size="sm"
            onClick={(e) => { e.stopPropagation(); handleClaim(nextOpenShift.id) }}
            disabled={isPending}
          >
            Prihlásiť sa
          </Button>
        </div>
      )}

      {/* ── Header ── */}
      <div className="flex items-center justify-between gap-2">
        {view === "month" ? (
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" asChild>
              <Link href={`/schedule?month=${prevMonth}`}><ChevronLeft className="size-4" /></Link>
            </Button>
            <span className="text-sm font-medium min-w-40 text-center capitalize">{monthLabel}</span>
            <Button variant="outline" size="icon" asChild>
              <Link href={`/schedule?month=${nextMonth}`}><ChevronRight className="size-4" /></Link>
            </Button>
            <Button variant="outline" size="sm" asChild>
              <Link href="/schedule">Dnes</Link>
            </Button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" onClick={handlePrevWeek}><ChevronLeft className="size-4" /></Button>
            <span className="text-sm font-medium min-w-40 text-center">{weekLabel}</span>
            <Button variant="outline" size="icon" onClick={handleNextWeek}><ChevronRight className="size-4" /></Button>
            <Button variant="outline" size="sm" onClick={goToToday}>Dnes</Button>
          </div>
        )}

        <div className="flex items-center gap-2">
          {canCreateShifts && (
            <Button size="sm" onClick={() => openCreateDialog()}>
              <Plus className="size-4" />
              Nová zmena
            </Button>
          )}
          <div className="flex rounded-md border p-0.5 gap-0.5">
            <Button variant={view === "week" ? "secondary" : "ghost"} size="sm" className="h-7 px-3 text-xs" onClick={() => setView("week")}>Týždeň</Button>
            <Button variant={view === "month" ? "secondary" : "ghost"} size="sm" className="h-7 px-3 text-xs" onClick={() => setView("month")}>Mesiac</Button>
          </div>
        </div>
      </div>

      {/* ── Mobile: agenda list ─────────────────────────── */}
      {view === "month" && (
        <div className="md:hidden flex flex-col gap-2">
          {weeks.flat().filter((d) => d.isCurrentMonth).map((day) => {
            const dateObj = new Date(day.date + "T12:00:00")
            const dayLabel = dateObj.toLocaleDateString("sk-SK", { weekday: "long", day: "numeric", month: "numeric" })
            const isPast = day.date < todayStr
            return (
              <div
                key={day.date}
                className={cn(
                  "rounded-xl border p-3 flex flex-col gap-2",
                  day.isToday && "border-primary/40 bg-primary/5",
                  !day.isToday && day.shifts.length === 0 && day.openShifts.length === 0 && "opacity-50",
                )}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className={cn("size-8 rounded-full flex items-center justify-center text-sm font-bold shrink-0", day.isToday ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground")}>
                      {dateObj.getDate()}
                    </div>
                    <span className={cn("text-sm font-medium capitalize", !day.isCurrentMonth && "text-muted-foreground")}>{dayLabel}</span>
                  </div>
                  {!isPast && day.isCurrentMonth && canCreateShifts && (
                    <button
                      onClick={() => openCreateDialog(day.date)}
                      className="p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground"
                      title="Nová zmena"
                    >
                      <Plus className="size-4" />
                    </button>
                  )}
                </div>
                {day.shifts.length === 0 && day.openShifts.length === 0 ? (
                  <p className="text-xs text-muted-foreground pl-10">Žiadne zmeny</p>
                ) : (
                  <div className="flex flex-col gap-1.5 pl-10">
                    {day.shifts.map((shift) => {
                      const clickable = shift.isCurrentUser && !isPast
                      return (
                        <div key={shift.id} className={cn("rounded-lg px-3 py-2 transition-opacity", clickable && "cursor-pointer hover:opacity-80")}
                          style={{ backgroundColor: shift.color + "28", borderLeft: `3px solid ${shift.color}` }}
                          onClick={clickable ? () => openLeave(day, shift) : undefined}>
                          <div className="text-sm font-semibold" style={{ color: shift.color }}>{shift.userName.split(" ")[0]}</div>
                          <div className="text-sm opacity-75" style={{ color: shift.color }}>{shift.startTime}–{shift.endTime}</div>
                        </div>
                      )
                    })}
                    {day.openShifts.map((os) => {
                      const isFull = os.acceptedCount >= os.maxClaims
                      if (isFull) {
                        return os.claimedByUsers.map((u) => (
                          <div
                            key={`fc-${u.claimId}`}
                            className="rounded-lg px-3 py-2"
                            style={{
                              backgroundColor: u.color + "28",
                              borderLeft: `3px solid ${u.color}`,
                            }}
                          >
                            <div className="text-sm font-semibold" style={{ color: u.color }}>{u.userName.split(" ")[0]}</div>
                            <div className="text-sm opacity-75" style={{ color: u.color }}>{os.startTime}–{os.endTime}</div>
                          </div>
                        ))
                      }
                      const canClaim = os.iMayClaim && !isPast
                      const isClaimed = !!os.myClaimId
                      return (
                        <div key={os.id}
                          className={cn("rounded-lg border border-dashed border-muted-foreground/30 px-3 py-2 flex flex-col gap-1 bg-muted/10",
                            canClaim && "cursor-pointer hover:border-primary/50 hover:bg-primary/5 transition-colors")}
                          onClick={canClaim ? () => handleClaim(os.id) : undefined}>
                          <div className="flex items-center justify-between">
                            <div className="text-sm font-medium text-muted-foreground">
                              Voľná zmena
                              {os.maxClaims > 1 && <span className="ml-1 text-xs opacity-70">({os.acceptedCount}/{os.maxClaims})</span>}
                            </div>
                            {canClaim && <span className="text-xs font-medium text-primary">Prihlásiť sa</span>}
                            {isClaimed && <Check className="size-3.5 text-green-600 shrink-0" />}
                          </div>
                          <div className="text-xs text-muted-foreground">{os.startTime}–{os.endTime}</div>
                          {os.claimedByUsers.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-0.5">
                              {os.claimedByUsers.map((u) => (
                                <span key={u.claimId} className="text-xs px-1.5 py-0.5 rounded-full" style={{ backgroundColor: u.color + "20", color: u.color }}>{u.userName.split(" ")[0]}</span>
                              ))}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* ── Desktop month grid ───────────────────────── */}
      {view === "month" && (
        <div className="hidden md:block rounded-xl border overflow-hidden">
          <div className="grid grid-cols-7 bg-muted/50 border-b">
            {DAY_LABELS.map((label) => (
              <div key={label} className="py-1.5 text-center text-xs font-medium text-muted-foreground">{label}</div>
            ))}
          </div>
          {weeks.map((week, wi) => (
            <div key={wi} className={cn("grid grid-cols-7", wi < weeks.length - 1 && "border-b")}>
              {week.map((day) => {
                const dateObj = new Date(day.date + "T12:00:00")
                const dayNum = dateObj.getDate()
                const dow = String(dateObj.getDay())
                const bh = businessHours?.get(dow)
                const hasOpenHours = bh && !bh.isClosed && bh.openTime && bh.closeTime
                const isPast = day.date < todayStr
                const shiftBlocks = (
                  <>
                    {day.shifts.map((shift) => {
                      const clickable = shift.isCurrentUser && !isPast
                      return (
                        <div key={shift.id}
                          className={cn("rounded px-1.5 py-0.5 text-xs leading-tight", clickable && "font-semibold cursor-pointer hover:opacity-75 transition-opacity")}
                          style={{ backgroundColor: shift.color + "28", borderLeft: `3px solid ${shift.color}`, color: shift.color }}
                          onClick={clickable ? () => openLeave(day, shift) : undefined}>
                          <div className="truncate">{shift.userName.split(" ")[0]}</div>
                          <div className="opacity-80">{shift.startTime}–{shift.endTime}</div>
                        </div>
                      )
                    })}
                    {day.openShifts.map((os) => {
                      const isFull = os.acceptedCount >= os.maxClaims
                      if (isFull) {
                        return os.claimedByUsers.map((u) => (
                          <div
                            key={`fc-${u.claimId}`}
                            className="rounded px-1.5 py-0.5 text-xs leading-tight"
                            style={{
                              backgroundColor: u.color + "28",
                              borderLeft: `3px solid ${u.color}`,
                              color: u.color,
                            }}
                          >
                            <div className="truncate font-medium">{u.userName.split(" ")[0]}</div>
                            <div className="opacity-80">{os.startTime}–{os.endTime}</div>
                          </div>
                        ))
                      }
                      const canClaimGrid = os.iMayClaim && !isPast
                      return (
                        <div key={os.id}
                          className={cn("rounded border border-dashed border-muted-foreground/40 px-1.5 py-0.5 text-xs leading-tight bg-background", canClaimGrid && "cursor-pointer hover:border-primary/50 hover:bg-primary/5 transition-colors")}
                          onClick={canClaimGrid ? () => handleClaim(os.id) : undefined}>
                          <div className="flex items-center justify-between gap-0.5">
                            <span className="truncate text-muted-foreground font-medium">
                              Voľná
                              {os.maxClaims > 1 && <span className="ml-0.5 text-[10px] opacity-70">({os.acceptedCount}/{os.maxClaims})</span>}
                            </span>
                            {os.myClaimId && <Check className="size-2.5 text-green-600 shrink-0" />}
                          </div>
                          <div className="opacity-60">{os.startTime}–{os.endTime}</div>
                        </div>
                      )
                    })}
                  </>
                )
                return (
                  <div key={day.date} className={cn("min-h-20 p-1 border-r last:border-r-0", !day.isCurrentMonth && "bg-muted/20", day.isToday && "bg-primary/5")}>
                    <div className="flex items-center justify-between mb-1 group/day">
                      <div className={cn("text-xs font-medium w-5 h-5 flex items-center justify-center rounded-full", day.isToday ? "bg-primary text-primary-foreground" : day.isCurrentMonth ? "text-foreground" : "text-muted-foreground")}>
                        {dayNum}
                      </div>
                      {!isPast && day.isCurrentMonth && canCreateShifts && (
                        <button
                          onClick={() => openCreateDialog(day.date)}
                          className="opacity-0 group-hover/day:opacity-100 transition-opacity p-0.5 rounded hover:bg-muted"
                          title="Nová zmena"
                        >
                          <Plus className="size-3 text-muted-foreground" />
                        </button>
                      )}
                    </div>
                    {hasOpenHours ? (
                      <div className="rounded-md border border-dashed border-muted-foreground/25 bg-muted/10 px-1 pt-0.5 pb-1 flex flex-col gap-0.5 min-h-10">
                        <div className="text-[9px] text-muted-foreground/50 leading-none mb-0.5 select-none">{bh.openTime!.slice(0, 5)}–{bh.closeTime!.slice(0, 5)}</div>
                        <div className="flex flex-col gap-0.5">{shiftBlocks}</div>
                      </div>
                    ) : (
                      <div className="flex flex-col gap-0.5">{shiftBlocks}</div>
                    )}
                  </div>
                )
              })}
            </div>
          ))}
        </div>
      )}

      {/* ── Week view (timeline) ─────────────────────── */}
      {view === "week" && (() => {
        const allEntries = currentWeek.flatMap(d => [
          ...d.shifts.map(s => ({ start: s.startTime, end: s.endTime })),
          ...d.openShifts.map(s => ({ start: s.startTime, end: s.endTime })),
        ])
        currentWeek.forEach(day => {
          const dow = String(new Date(day.date + "T12:00:00").getDay())
          const bh = businessHours?.get(dow)
          if (bh && !bh.isClosed && bh.openTime && bh.closeTime)
            allEntries.push({ start: bh.openTime, end: bh.closeTime })
        })
        let startHour: number, endHour: number
        if (allEntries.length > 0) {
          startHour = Math.min(...allEntries.map(e => Math.floor(timeToMinutes(e.start) / 60)))
          endHour = Math.max(...allEntries.map(e => Math.ceil(timeToMinutes(e.end) / 60)))
        } else {
          startHour = 8; endHour = 22
        }
        const PAD = 20
        layoutRef.current = { startHour, PAD }
        const totalHeight = (endHour - startHour) * HOUR_HEIGHT + PAD * 2
        const hours = Array.from({ length: endHour - startHour + 1 }, (_, i) => startHour + i)
        const yPos = (time: string) => PAD + ((timeToMinutes(time) - startHour * 60) / 60) * HOUR_HEIGHT
        const hPos = (start: string, end: string) => yPos(end) - yPos(start)

        return (
          <div className="rounded-xl border overflow-hidden" ref={timelineRef}>
            {/* Header */}
            <div className="grid grid-cols-[48px_repeat(7,1fr)] bg-muted/50 border-b">
              <div />
              {currentWeek.map((day) => {
                const dateObj = new Date(day.date + "T12:00:00")
                return (
                  <div key={day.date} className={cn("py-2 text-center border-l", day.isToday && "bg-primary/10")}>
                    <div className="text-xs font-medium text-muted-foreground">{DAY_LABELS[dateObj.getDay() === 0 ? 6 : dateObj.getDay() - 1]}</div>
                    <div className={cn("mx-auto mt-0.5 size-7 rounded-full flex items-center justify-center text-sm font-semibold", day.isToday ? "bg-primary text-primary-foreground" : "text-foreground")}>
                      {dateObj.getDate()}
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Timeline body */}
            <div className="grid grid-cols-[48px_repeat(7,1fr)]" style={{ height: totalHeight }}>
              {/* Hour labels */}
              <div className="relative border-r" style={{ height: totalHeight }}>
                {hours.map((h) => (
                  <div key={h} className="absolute right-2 -translate-y-1/2 text-[10px] text-muted-foreground/60 tabular-nums select-none" style={{ top: PAD + (h - startHour) * HOUR_HEIGHT }}>
                    {String(h).padStart(2, "0")}:00
                  </div>
                ))}
              </div>

              {/* Day columns */}
              {currentWeek.map((day) => {
                const isPast = day.date < todayStr

                type TaggedShift = CalendarShift & { _type: "shift" }
                type TaggedOpen = OpenShift & { _type: "open" }
                type FilledClaim = { _type: "filled"; claimId: string; userId: string; userName: string; color: string; startTime: string; endTime: string; openShift: OpenShift }
                type TaggedItem = TaggedShift | TaggedOpen | FilledClaim

                const partialOpenShifts = day.openShifts.filter(os => os.acceptedCount < os.maxClaims)
                const filledClaims: FilledClaim[] = day.openShifts
                  .filter(os => os.acceptedCount >= os.maxClaims)
                  .flatMap(os => os.claimedByUsers.map(u => ({
                    _type: "filled" as const,
                    claimId: u.claimId,
                    userId: u.userId,
                    userName: u.userName,
                    color: u.color,
                    startTime: os.startTime,
                    endTime: os.endTime,
                    openShift: os,
                  })))

                const allItems: TaggedItem[] = [
                  ...day.shifts.map(s => ({ ...s, _type: "shift" as const })),
                  ...filledClaims,
                  ...partialOpenShifts.map(s => ({ ...s, _type: "open" as const })),
                ]
                const lanes = assignLanes(allItems)

                return (
                  <div
                    key={day.date}
                    data-day-col={day.date}
                    className={cn("relative border-l select-none", day.isToday && "bg-primary/5", !day.isCurrentMonth && "bg-muted/20", canCreateShifts && "cursor-crosshair")}
                    style={{ height: totalHeight }}
                    onMouseDown={canCreateShifts ? (e) => {
                      if (e.target === e.currentTarget || (e.target as HTMLElement).hasAttribute("data-grid-line"))
                        handleTimelineMouseDown(e, day.date)
                    } : undefined}
                  >
                    {/* Hour grid lines */}
                    {hours.map((h) => (
                      <div key={h} data-grid-line className="absolute left-0 right-0 border-t border-muted/40 pointer-events-none" style={{ top: PAD + (h - startHour) * HOUR_HEIGHT }} />
                    ))}

                    {/* Shift blocks */}
                    <div className="absolute inset-0" style={{ pointerEvents: "none" }}>
                      {lanes.map(({ item, lane, totalLanes }) => {
                        const top = yPos(item.startTime)
                        const height = Math.max(hPos(item.startTime, item.endTime), 24)
                        const widthPct = 100 / totalLanes
                        const leftPct = (lane / totalLanes) * 100
                        const posStyle = { top, height, width: `calc(${widthPct}% - 4px)`, left: `calc(${leftPct}% + 2px)` }

                        if (item._type === "shift") {
                          const shift = item
                          const clickable = shift.isCurrentUser && !isPast
                          return (
                            <div
                              key={shift.id}
                              className={cn(
                                "absolute flex flex-col justify-start rounded-md px-1.5 py-1 text-sm overflow-hidden pointer-events-auto",
                                clickable && "cursor-pointer hover:opacity-80 transition-opacity",
                              )}
                              style={{
                                ...posStyle,
                                backgroundColor: shift.color + "30",
                                borderLeft: `3px solid ${shift.color}`,
                                color: shift.color,
                              }}
                              onClick={clickable ? () => openLeave(day, shift) : undefined}
                            >
                              <div className="font-semibold truncate leading-tight">{shift.userName}</div>
                              <div className="opacity-80 leading-tight text-xs">{shift.startTime}–{shift.endTime}</div>
                            </div>
                          )
                        }

                        if (item._type === "open") {
                          const os = item
                          const canClaimTl = os.iMayClaim && !isPast
                          const isClaimed = !!os.myClaimId
                          return (
                            <div
                              key={os.id}
                              className={cn(
                                "absolute flex flex-col justify-start rounded-md border border-dashed border-muted-foreground/30 px-1.5 py-1 text-sm bg-muted/10 overflow-hidden pointer-events-auto",
                                canClaimTl && "cursor-pointer hover:border-primary/50 hover:bg-primary/5 transition-colors",
                              )}
                              style={posStyle}
                              onClick={canClaimTl ? () => handleClaim(os.id) : undefined}
                            >
                              <div className="font-medium text-muted-foreground leading-tight">
                                Voľná
                                {os.maxClaims > 1 && <span className="ml-0.5 opacity-70">({os.acceptedCount}/{os.maxClaims})</span>}
                              </div>
                              <div className="text-muted-foreground/70 text-xs leading-tight">{os.startTime}–{os.endTime}</div>
                              {canClaimTl && <div className="text-primary font-medium text-xs mt-0.5">Prihlásiť sa</div>}
                              {isClaimed && <div className="text-green-600 flex items-center gap-0.5 text-xs mt-0.5"><Check className="size-2.5" /> Prihlásený</div>}
                              {os.claimedByUsers.length > 0 && (
                                <div className="flex flex-wrap gap-0.5 mt-0.5">
                                  {os.claimedByUsers.map((u) => (
                                    <span key={u.claimId} className="text-xs px-1 rounded-full" style={{ backgroundColor: u.color + "20", color: u.color }}>{u.userName.split(" ")[0]}</span>
                                  ))}
                                </div>
                              )}
                            </div>
                          )
                        }

                        if (item._type === "filled") {
                          const fc = item
                          const isMe = fc.userId === currentUserId
                          return (
                            <div
                              key={`fc-${fc.claimId}`}
                              className={cn(
                                "absolute flex flex-col justify-start rounded-md px-1.5 py-1 text-sm overflow-hidden pointer-events-auto",
                                isMe && "cursor-pointer hover:opacity-80 transition-opacity",
                              )}
                              style={{
                                ...posStyle,
                                backgroundColor: fc.color + "30",
                                borderLeft: `3px solid ${fc.color}`,
                                color: fc.color,
                              }}
                            >
                              <div className="font-semibold truncate leading-tight">{fc.userName}</div>
                              <div className="opacity-80 leading-tight text-xs">{fc.startTime}–{fc.endTime}</div>
                              {isMe && <div className="text-green-600 flex items-center gap-0.5 text-xs mt-0.5"><Check className="size-2.5" /> Prihlásený</div>}
                            </div>
                          )
                        }

                        return null
                      })}

                      {/* Drag preview ghost */}
                      {dragPreview && dragPreview.date === day.date && (
                        <div
                          className="absolute left-1 right-1 rounded-md border-2 border-dashed border-primary/60 bg-primary/10 pointer-events-none z-20"
                          style={{
                            top: yPos(minutesToTime(dragPreview.topMinutes)),
                            height: Math.max(((dragPreview.bottomMinutes - dragPreview.topMinutes) / 60) * HOUR_HEIGHT, 12),
                          }}
                        >
                          <div className="px-1.5 py-0.5 text-[10px] font-medium text-primary">
                            {minutesToTime(dragPreview.topMinutes)}–{minutesToTime(dragPreview.bottomMinutes)}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )
      })()}

      <LeaveRequestDialog
        open={!!leaveCtx}
        onOpenChange={(open) => { if (!open) setLeaveCtx(null) }}
        defaultDate={leaveCtx?.date}
        shiftId={leaveCtx?.shiftId}
        shiftLabel={leaveCtx?.shiftLabel}
        colleagues={leaveCtx?.colleagues}
      />
      {canCreateShifts && (
        <ShiftDialog
          open={createDialogOpen}
          onOpenChange={(open) => { if (!open) closeCreateDialog() }}
          employees={allEmployees}
          defaultDate={createDate}
          defaultStartTime={createStartTime}
          defaultEndTime={createEndTime}
        />
      )}
    </div>
  )
}
