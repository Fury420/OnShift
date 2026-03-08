"use client"

import { useState, useTransition, useRef, useEffect, useCallback } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { ChevronLeft, ChevronRight, Plus, Send, Palmtree } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { ShiftDialog, type ShiftForEdit, type EmployeeOption } from "./shift-dialog"
import { deleteShift, toggleShiftStatus, publishDraftShifts, deleteAllDraftShifts, updateShift, adminRemoveClaim } from "@/app/actions/schedule"
import { Pencil, Trash2 } from "lucide-react"
import { toast } from "sonner"

export interface AdminCalendarShift {
  id: string
  userId: string
  userName: string
  date: string
  startTime: string
  endTime: string
  note: string | null
  status: "draft" | "open" | "published"
  color: string
}

export interface AdminOpenShift {
  id: string
  date: string
  startTime: string
  endTime: string
  note: string | null
  status: "draft" | "open"
  claims: { claimId: string; userId: string; userName: string; color: string }[]
  maxClaims: number
}

export interface AdminCalendarLeave {
  userId: string
  userName: string
  color: string
  type: "vacation" | "sick" | "personal"
  status: "approved" | "pending"
  startDate: string
  endDate: string
}

export interface AdminCalendarDay {
  date: string
  isCurrentMonth: boolean
  isToday: boolean
  shifts: AdminCalendarShift[]
  openShifts: AdminOpenShift[]
  leaves?: AdminCalendarLeave[]
}

export interface BusinessHoursEntry {
  dayOfWeek: string
  isClosed: boolean
  openTime: string | null
  closeTime: string | null
}

interface AdminMonthCalendarProps {
  weeks: AdminCalendarDay[][]
  employees: EmployeeOption[]
  monthLabel: string
  prevMonth: string
  nextMonth: string
  initialWeek?: "first" | "last"
  initialDate?: string
  schedulePath?: string
  businessHours?: Map<string, BusinessHoursEntry>
}

const DAY_LABELS = ["Po", "Ut", "St", "Št", "Pi", "So", "Ne"]
const LEAVE_LABELS: Record<string, string> = { vacation: "Dovolenka", sick: "PN", personal: "Osobné voľno" }
const HOUR_HEIGHT = 56
const VISIBLE_HOURS = 8

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

type DragMode = "create" | "resize-top" | "resize-bottom" | "move"

interface DragState {
  mode: DragMode
  date: string
  startMinutes: number
  currentMinutes: number
  anchorMinutes: number
  shiftId?: string
  originalStart?: number
  originalEnd?: number
}

interface DragPreview {
  date: string
  topMinutes: number
  bottomMinutes: number
}

export function AdminMonthCalendar({
  weeks,
  employees,
  monthLabel,
  prevMonth,
  nextMonth,
  initialWeek,
  initialDate,
  schedulePath = "/admin/schedule",
  businessHours,
}: AdminMonthCalendarProps) {
  const router = useRouter()
  const [view, setView] = useState<"month" | "week">("week")
  const [weekIdx, setWeekIdx] = useState(() => {
    if (initialDate) {
      const idx = weeks.findIndex((w) => w.some((d) => d.date === initialDate))
      if (idx >= 0) return idx
    }
    if (initialWeek === "last") return Math.max(0, weeks.length - 1)
    if (initialWeek === "first") return 0
    const today = new Date().toISOString().slice(0, 10)
    const idx = weeks.findIndex((w) => w.some((d) => d.date === today))
    return idx >= 0 ? idx : 0
  })
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<ShiftForEdit | undefined>()
  const [defaultDate, setDefaultDate] = useState<string | undefined>()
  const [defaultStartTime, setDefaultStartTime] = useState<string | undefined>()
  const [defaultEndTime, setDefaultEndTime] = useState<string | undefined>()
  const [isPending, startTransition] = useTransition()

  const [openMenuId, setOpenMenuId] = useState<string | null>(null)

  // Drag state
  const dragRef = useRef<DragState | null>(null)
  const [dragPreview, setDragPreview] = useState<DragPreview | null>(null)
  const timelineRef = useRef<HTMLDivElement>(null)
  const timelineScrollRef = useRef<HTMLDivElement>(null)
  const dragMovedRef = useRef(false)

  const layoutRef = useRef({ startHour: 8, PAD: 20 })

  const getMinutesFromY = useCallback((y: number, containerRect: DOMRect) => {
    const { startHour, PAD } = layoutRef.current
    const relY = y - containerRect.top
    const minutes = startHour * 60 + ((relY - PAD) / HOUR_HEIGHT) * 60
    return snapTo15(Math.max(0, minutes))
  }, [])

  const pendingDragRef = useRef<{ startX: number; startY: number; args: [string, DragMode, AdminCalendarShift?] } | null>(null)

  const startDrag = useCallback((date: string, mode: DragMode, clientY: number, shift?: AdminCalendarShift) => {
    setOpenMenuId(null)
    dragMovedRef.current = true
    const col = timelineRef.current?.querySelector(`[data-day-col="${date}"]`) as HTMLElement | null
    if (!col) return
    const rect = col.getBoundingClientRect()
    const minutes = getMinutesFromY(clientY, rect)

    if (mode === "create") {
      dragRef.current = { mode, date, startMinutes: minutes, currentMinutes: minutes, anchorMinutes: minutes }
      setDragPreview({ date, topMinutes: minutes, bottomMinutes: minutes + 15 })
    } else if (shift) {
      const origStart = timeToMinutes(shift.startTime)
      const origEnd = timeToMinutes(shift.endTime)
      if (mode === "move") {
        const anchorOffset = minutes - origStart
        dragRef.current = { mode, date, startMinutes: origStart, currentMinutes: minutes, anchorMinutes: anchorOffset, shiftId: shift.id, originalStart: origStart, originalEnd: origEnd }
      } else {
        dragRef.current = { mode, date, startMinutes: mode === "resize-top" ? origStart : origEnd, currentMinutes: minutes, anchorMinutes: minutes, shiftId: shift.id, originalStart: origStart, originalEnd: origEnd }
      }
      setDragPreview({ date, topMinutes: origStart, bottomMinutes: origEnd })
    }
  }, [getMinutesFromY])

  const handleDragMouseDown = useCallback((
    e: React.MouseEvent,
    date: string,
    mode: DragMode,
    shift?: AdminCalendarShift,
  ) => {
    if (e.button !== 0) return

    if (mode === "create" || mode === "resize-top" || mode === "resize-bottom") {
      e.preventDefault()
      e.stopPropagation()
      startDrag(date, mode, e.clientY, shift)
    } else {
      pendingDragRef.current = { startX: e.clientX, startY: e.clientY, args: [date, mode, shift] }
    }
  }, [startDrag])

  useEffect(() => {
    function onMouseMove(e: MouseEvent) {
      const pending = pendingDragRef.current
      if (pending) {
        const dx = e.clientX - pending.startX
        const dy = e.clientY - pending.startY
        if (Math.abs(dx) + Math.abs(dy) > 4) {
          const [date, mode, shift] = pending.args
          pendingDragRef.current = null
          startDrag(date, mode, e.clientY, shift)
        }
        return
      }

      const drag = dragRef.current
      if (!drag) return

      const col = timelineRef.current?.querySelector(`[data-day-col="${drag.date}"]`) as HTMLElement | null
      if (!col) return
      const rect = col.getBoundingClientRect()
      const minutes = getMinutesFromY(e.clientY, rect)
      drag.currentMinutes = minutes

      if (drag.mode === "create") {
        const top = Math.min(drag.anchorMinutes, minutes)
        const bottom = Math.max(drag.anchorMinutes, minutes)
        setDragPreview({ date: drag.date, topMinutes: top, bottomMinutes: Math.max(bottom, top + 15) })
      } else if (drag.mode === "resize-top") {
        const bottom = drag.originalEnd!
        setDragPreview({ date: drag.date, topMinutes: Math.min(minutes, bottom - 15), bottomMinutes: bottom })
      } else if (drag.mode === "resize-bottom") {
        const top = drag.originalStart!
        setDragPreview({ date: drag.date, topMinutes: top, bottomMinutes: Math.max(minutes, top + 15) })
      } else if (drag.mode === "move") {
        const duration = drag.originalEnd! - drag.originalStart!
        const newStart = snapTo15(minutes - drag.anchorMinutes)
        setDragPreview({ date: drag.date, topMinutes: Math.max(0, newStart), bottomMinutes: Math.max(0, newStart) + duration })
      }
    }

    function onMouseUp() {
      pendingDragRef.current = null
      const drag = dragRef.current
      if (!drag) return
      dragRef.current = null

      if (dragMovedRef.current) {
        dragMovedRef.current = false
        window.addEventListener("click", (e) => {
          e.stopPropagation()
          e.preventDefault()
        }, { capture: true, once: true })
      }

      setDragPreview(prev => {
        if (!prev) return null

        const startTime = minutesToTime(prev.topMinutes)
        const endTime = minutesToTime(prev.bottomMinutes)

        setTimeout(() => {
          if (drag.mode === "create") {
            if (prev.bottomMinutes - prev.topMinutes >= 15) {
              setEditing(undefined)
              setDefaultDate(drag.date)
              setDefaultStartTime(startTime)
              setDefaultEndTime(endTime)
              setDialogOpen(true)
            }
          } else if (drag.shiftId) {
            if (startTime !== minutesToTime(drag.originalStart!) || endTime !== minutesToTime(drag.originalEnd!)) {
              startTransition(async () => {
                try {
                  const day = weeks.flat().find(d => d.date === drag.date)
                  const shift = day?.shifts.find(s => s.id === drag.shiftId)
                  if (shift) {
                    await updateShift(drag.shiftId!, { userId: shift.userId || null, date: drag.date, startTime, endTime, note: shift.note || undefined })
                  }
                } catch (err) {
                  toast.error(err instanceof Error ? err.message : "Chyba pri presune")
                }
              })
            }
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
  }, [getMinutesFromY, startDrag, weeks, startTransition])

  useEffect(() => {
    if (initialDate) {
      const idx = weeks.findIndex((w) => w.some((d) => d.date === initialDate))
      if (idx >= 0) setWeekIdx(idx)
      setView("week")
    } else if (initialWeek === "last") setWeekIdx(Math.max(0, weeks.length - 1))
    else if (initialWeek === "first") setWeekIdx(0)
  }, [initialDate, initialWeek, weeks.length, weeks])

  useEffect(() => {
    if (view !== "week") return
    const el = timelineScrollRef.current
    if (!el) return
    const scrollToStart = () => {
      el.scrollTop = 0
    }
    scrollToStart()
    requestAnimationFrame(scrollToStart)
  }, [view, weekIdx])

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

  function handlePrevWeek() {
    if (weekIdx > 0) setWeekIdx(weekIdx - 1)
    else router.push(`/admin/schedule?month=${prevMonth}&week=last`)
  }
  function handleNextWeek() {
    if (weekIdx < weeks.length - 1) setWeekIdx(weekIdx + 1)
    else router.push(`/admin/schedule?month=${nextMonth}&week=first`)
  }
  function goToToday() {
    const today = new Date().toISOString().slice(0, 10)
    const idx = weeks.findIndex((w) => w.some((d) => d.date === today))
    if (idx >= 0) setWeekIdx(idx)
    else router.push("/admin/schedule")
  }

  const allDraftIds = weeks.flatMap((week) =>
    week.flatMap((day) => [
      ...day.shifts.filter((s) => s.status === "draft").map((s) => s.id),
      ...day.openShifts.filter((os) => os.status === "draft").map((os) => os.id),
    ]),
  )

  function openCreate(date?: string, startTime?: string, endTime?: string) {
    setEditing(undefined)
    setDefaultDate(date)
    setDefaultStartTime(startTime)
    setDefaultEndTime(endTime)
    setDialogOpen(true)
  }

  function openEdit(s: AdminCalendarShift) {
    setEditing({
      id: s.id,
      userId: s.userId,
      date: s.date,
      startTime: s.startTime,
      endTime: s.endTime,
      note: s.note,
      maxClaims: 1,
    })
    setDefaultDate(undefined)
    setDialogOpen(true)
  }

  function openEditOpenShift(os: AdminOpenShift) {
    setEditing({
      id: os.id,
      userId: null,
      date: os.date,
      startTime: os.startTime,
      endTime: os.endTime,
      note: os.note,
      maxClaims: os.maxClaims,
    })
    setDefaultDate(undefined)
    setDialogOpen(true)
  }

  function handlePublishAll() {
    if (allDraftIds.length > 0) {
      startTransition(() => publishDraftShifts(allDraftIds))
    }
  }

  return (
    <>
      <div className="flex flex-col gap-4 w-full">
        <div className="flex items-center justify-between gap-4">
          {view === "month" ? (
            <div className="flex items-center gap-2">
              <Button variant="outline" size="icon" asChild>
                <Link href={`/admin/schedule?month=${prevMonth}`}><ChevronLeft className="size-4" /></Link>
              </Button>
              <span className="text-sm font-medium min-w-40 text-center capitalize">{monthLabel}</span>
              <Button variant="outline" size="icon" asChild>
                <Link href={`/admin/schedule?month=${nextMonth}`}><ChevronRight className="size-4" /></Link>
              </Button>
              <Button variant="outline" size="sm" asChild>
                <Link href="/admin/schedule">Dnes</Link>
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
            {allDraftIds.length > 0 && (
              <>
                <Button variant="secondary" size="sm" onClick={handlePublishAll} disabled={isPending}>
                  <Send className="size-4" />
                  Publikovať všetky ({allDraftIds.length})
                </Button>
                <Button variant="outline" size="sm" onClick={() => startTransition(() => deleteAllDraftShifts(allDraftIds))} disabled={isPending} className="text-destructive hover:text-destructive">
                  Vymazať všetky koncepty
                </Button>
              </>
            )}
            <Button size="sm" onClick={() => openCreate()}>
              <Plus className="size-4" />
              Nová zmena
            </Button>
            <div className="flex rounded-md border p-0.5 gap-0.5">
              <Button variant={view === "week" ? "secondary" : "ghost"} size="sm" className="h-7 px-3 text-xs" onClick={() => setView("week")}>Týždeň</Button>
              <Button variant={view === "month" ? "secondary" : "ghost"} size="sm" className="h-7 px-3 text-xs" onClick={() => setView("month")}>Mesiac</Button>
            </div>
          </div>
        </div>

        {/* ── Mobile: agenda list ─────────────────────────── */}
        {view === "month" && <div className="md:hidden flex flex-col gap-2">
          {weeks.flat().filter((d) => d.isCurrentMonth).map((day) => {
            const dateObj = new Date(day.date + "T12:00:00")
            const dayLabel = dateObj.toLocaleDateString("sk-SK", { weekday: "long", day: "numeric", month: "numeric" })
            return (
              <div
                key={day.date}
                className={cn(
                  "rounded-xl border p-3 flex flex-col gap-2",
                  day.isToday && "border-primary/40 bg-primary/5",
                )}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div
                      className={cn(
                        "size-8 rounded-full flex items-center justify-center text-sm font-bold shrink-0",
                        day.isToday ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
                      )}
                    >
                      {dateObj.getDate()}
                    </div>
                    <span className="text-sm font-medium capitalize">{dayLabel}</span>
                  </div>
                  <button
                    onClick={() => openCreate(day.date)}
                    className="p-1.5 rounded-lg hover:bg-muted transition-colors"
                  >
                    <Plus className="size-4 text-muted-foreground" />
                  </button>
                </div>

                {(day.leaves ?? []).length > 0 && (
                  <div className="flex flex-col gap-1 pl-10">
                    {(day.leaves ?? []).map((l, i) => (
                      <div
                        key={`leave-${l.userId}-${i}`}
                        className={cn("rounded-lg px-3 py-2 flex items-center gap-2", l.status === "pending" && "border border-dashed")}
                        style={{
                          backgroundColor: l.color + (l.status === "approved" ? "25" : "12"),
                          borderColor: l.status === "pending" ? l.color + "60" : undefined,
                        }}
                      >
                        <Palmtree className="size-4 shrink-0" style={{ color: l.color }} />
                        <div>
                          <div className="text-sm font-semibold" style={{ color: l.color }}>{l.userName.split(" ")[0]}</div>
                          <div className="text-xs opacity-75" style={{ color: l.color }}>
                            {LEAVE_LABELS[l.type] ?? l.type}
                            {l.status === "pending" && " · čaká na schválenie"}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {day.shifts.length === 0 && day.openShifts.length === 0 ? (
                  (day.leaves ?? []).length === 0 && <p className="text-xs text-muted-foreground pl-10">Žiadne zmeny</p>
                ) : (
                  <div className="flex flex-col gap-1.5 pl-10">
                    {day.shifts.map((shift) => (
                      <DropdownMenu key={shift.id}>
                        <DropdownMenuTrigger asChild>
                          <button
                            className={cn(
                              "w-full text-left rounded-lg px-3 py-2 hover:opacity-80 transition-opacity",
                              shift.status === "draft" && "opacity-60",
                            )}
                            style={{
                              backgroundColor: shift.color + "28",
                              borderLeft: `3px ${shift.status === "draft" ? "dashed" : "solid"} ${shift.color}`,
                            }}
                          >
                            <div className="text-sm font-semibold" style={{ color: shift.color }}>
                              {shift.userName.split(" ")[0]}
                            </div>
                            <div className="text-xs opacity-75" style={{ color: shift.color }}>
                              {shift.startTime}–{shift.endTime}
                              {shift.status === "draft" && " · koncept"}
                            </div>
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="start">
                          <DropdownMenuItem onClick={() => openEdit(shift)}>Upraviť</DropdownMenuItem>
                          {shift.status === "draft" && (
                            <DropdownMenuItem onClick={() => startTransition(() => toggleShiftStatus(shift.id, "draft"))} disabled={isPending}>
                              Publikovať
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuSeparator />
                          <DropdownMenuItem className="text-destructive" onClick={() => startTransition(() => deleteShift(shift.id))} disabled={isPending}>
                            Odstrániť
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    ))}
                    {day.openShifts.map((os) => {
                      const isFull = os.claims.length >= os.maxClaims
                      if (isFull) {
                        return os.claims.map((claim) => (
                          <div
                            key={`fc-${claim.claimId}`}
                            className="rounded-lg px-3 py-2 hover:opacity-80 transition-opacity"
                            style={{
                              backgroundColor: claim.color + "28",
                              borderLeft: `3px solid ${claim.color}`,
                            }}
                          >
                            <div className="text-sm font-semibold" style={{ color: claim.color }}>
                              {claim.userName.split(" ")[0]}
                            </div>
                            <div className="text-xs opacity-75" style={{ color: claim.color }}>
                              {os.startTime}–{os.endTime}
                            </div>
                          </div>
                        ))
                      }
                      return (
                        <div key={os.id} className={cn("rounded-lg border border-dashed border-muted-foreground/30 px-3 py-2 flex flex-col gap-1.5 bg-muted/10", os.status === "draft" && "opacity-70")}>
                          <div className="flex items-center justify-between">
                            <div>
                              <div className="text-sm font-medium text-muted-foreground">
                                Voľná zmena
                                {os.maxClaims > 1 && <span className="text-xs ml-1">({os.claims.length}/{os.maxClaims})</span>}
                                {os.status === "draft" && <span className="text-xs ml-1 text-muted-foreground/70">· koncept</span>}
                              </div>
                              <div className="text-xs text-muted-foreground/70">{os.startTime}–{os.endTime}</div>
                            </div>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <button className="p-1 rounded hover:bg-muted">
                                  <Plus className="size-3.5 text-muted-foreground" />
                                </button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem onClick={() => openEditOpenShift(os)}>Upraviť</DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem className="text-destructive" onClick={() => startTransition(() => deleteShift(os.id))} disabled={isPending}>Odstrániť</DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                          {os.claims.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-0.5">
                              {os.claims.map((claim) => (
                                <span key={claim.claimId} className="text-xs px-1.5 py-0.5 rounded-full flex items-center gap-1" style={{ backgroundColor: claim.color + "20", color: claim.color }}>
                                  {claim.userName.split(" ")[0]}
                                  <button
                                    onClick={() => startTransition(() => adminRemoveClaim(claim.claimId))}
                                    className="hover:opacity-60"
                                    title="Odobrať"
                                  >
                                    ×
                                  </button>
                                </span>
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
        </div>}

        {/* ── Desktop: grid calendar ───────────────────────── */}
        {view === "month" && <div className="hidden md:block rounded-xl border overflow-hidden">
          <div className="grid grid-cols-7 bg-muted/50 border-b">
            {DAY_LABELS.map((label) => (
              <div key={label} className="py-1.5 text-center text-xs font-medium text-muted-foreground">
                {label}
              </div>
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

                const openShiftBlocks = day.openShifts.map((os) => {
                  const isFull = os.claims.length >= os.maxClaims
                  if (isFull) {
                    return os.claims.map((claim) => (
                      <div
                        key={`fc-${claim.claimId}`}
                        className="rounded px-1 py-0.5 text-xs leading-tight hover:opacity-80 transition-opacity"
                        style={{
                          backgroundColor: claim.color + "28",
                          borderLeft: `2px solid ${claim.color}`,
                          color: claim.color,
                        }}
                      >
                        <div className="truncate font-semibold">{claim.userName.split(" ")[0]}</div>
                        <div className="opacity-80">{os.startTime}–{os.endTime}</div>
                      </div>
                    ))
                  }
                  return (
                    <div key={os.id} className={cn("rounded border border-dashed border-muted-foreground/40 px-1 py-0.5 text-xs leading-tight bg-background", os.status === "draft" && "opacity-70")}>
                      <div className="flex items-center justify-between gap-0.5">
                        <span className="truncate text-muted-foreground font-medium text-[10px]">
                          Voľná {os.maxClaims > 1 && `(${os.claims.length}/${os.maxClaims})`}{os.status === "draft" && " · koncept"}
                        </span>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <button className="p-0.5 rounded hover:bg-muted opacity-0 group-hover:opacity-100 transition-opacity">
                              <Plus className="size-2.5 text-muted-foreground" />
                            </button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => openEditOpenShift(os)}>Upraviť</DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem className="text-destructive" onClick={() => startTransition(() => deleteShift(os.id))} disabled={isPending}>Odstrániť</DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                      <div className="opacity-60 text-[9px]">{os.startTime}–{os.endTime}</div>
                      {os.claims.length > 0 && (
                        <div className="flex flex-wrap gap-0.5 mt-0.5">
                          {os.claims.map((claim) => (
                            <span key={claim.claimId} className="text-[9px] px-1 py-0.5 rounded" style={{ backgroundColor: claim.color + "20", color: claim.color }}>{claim.userName.split(" ")[0]}</span>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })

                const leaveBlocks = (day.leaves ?? []).map((l, i) => (
                  <div
                    key={`leave-${l.userId}-${i}`}
                    className={cn("rounded px-1 py-0.5 text-[10px] leading-tight flex items-center gap-1 truncate", l.status === "pending" && "border border-dashed")}
                    style={{
                      backgroundColor: l.color + (l.status === "approved" ? "25" : "12"),
                      borderColor: l.status === "pending" ? l.color + "60" : undefined,
                      color: l.color,
                    }}
                  >
                    <Palmtree className="size-2.5 shrink-0" />
                    <span className="truncate font-medium">{l.userName.split(" ")[0]}</span>
                    {l.status === "pending" && <span className="text-[9px] opacity-60">(čaká)</span>}
                  </div>
                ))

                const shiftBlocks = day.shifts.map((shift) => (
                  <DropdownMenu key={shift.id}>
                    <DropdownMenuTrigger asChild>
                      <button
                        className={cn(
                          "w-full text-left rounded px-1 py-0.5 text-xs leading-tight hover:opacity-80 transition-opacity",
                          shift.status === "draft" && "opacity-50",
                        )}
                        style={{
                          backgroundColor: shift.color + "28",
                          borderLeft: `2px ${shift.status === "draft" ? "dashed" : "solid"} ${shift.color}`,
                          color: shift.color,
                        }}
                      >
                        <div className="truncate font-semibold">{shift.userName.split(" ")[0]}</div>
                        <div className="opacity-80">{shift.startTime}–{shift.endTime}</div>
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start">
                      <DropdownMenuItem onClick={() => openEdit(shift)}>Upraviť</DropdownMenuItem>
                      {shift.status === "draft" && (
                        <DropdownMenuItem onClick={() => startTransition(() => toggleShiftStatus(shift.id, "draft"))} disabled={isPending}>
                          Publikovať
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuSeparator />
                      <DropdownMenuItem className="text-destructive" onClick={() => startTransition(() => deleteShift(shift.id))} disabled={isPending}>
                        Odstrániť
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                ))

                return (
                  <div
                    key={day.date}
                    className={cn(
                      "min-h-20 p-1 border-r last:border-r-0 group",
                      !day.isCurrentMonth && "bg-muted/20",
                      day.isToday && "bg-primary/5",
                    )}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <Link
                        href={`${schedulePath}?month=${day.date.slice(0, 7)}&date=${day.date}`}
                        className={cn(
                          "text-xs font-medium w-5 h-5 flex items-center justify-center rounded-full hover:ring-2 hover:ring-primary/30 transition-shadow",
                          day.isToday
                            ? "bg-primary text-primary-foreground"
                            : day.isCurrentMonth
                            ? "text-foreground"
                            : "text-muted-foreground",
                        )}
                        title={`Prejsť na ${day.date}`}
                      >
                        {dayNum}
                      </Link>
                      <button
                        onClick={() => openCreate(day.date)}
                        className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded hover:bg-muted"
                      >
                        <Plus className="size-3 text-muted-foreground" />
                      </button>
                    </div>

                    {hasOpenHours ? (
                      <div
                        className="rounded-md border border-dashed border-muted-foreground/25 bg-muted/10 px-1 pt-0.5 pb-1 flex flex-col gap-0.5 min-h-10 cursor-pointer"
                        onClick={() => openCreate(day.date)}
                      >
                        <div className="text-[9px] text-muted-foreground/50 leading-none mb-0.5 select-none">
                          {bh.openTime!.slice(0, 5)}–{bh.closeTime!.slice(0, 5)}
                        </div>
                        <div className="flex flex-col gap-0.5" onClick={(e) => e.stopPropagation()}>
                          {leaveBlocks}
                          {shiftBlocks}
                          {openShiftBlocks}
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-col gap-0.5">{leaveBlocks}{shiftBlocks}{openShiftBlocks}</div>
                    )}
                  </div>
                )
              })}
            </div>
          ))}
        </div>}

        {/* ── Week view (timeline) ─────────────────────── */}
        {view === "week" && (() => {
          let startHour: number, endHour: number
          if (businessHours && businessHours.size > 0) {
            const ranges: { start: number; end: number }[] = []
            businessHours.forEach((bh) => {
              if (!bh.isClosed && bh.openTime && bh.closeTime) {
                ranges.push({
                  start: Math.floor(timeToMinutes(bh.openTime) / 60),
                  end: Math.ceil(timeToMinutes(bh.closeTime) / 60),
                })
              }
            })
            if (ranges.length > 0) {
              startHour = Math.min(...ranges.map((r) => r.start))
              endHour = Math.max(...ranges.map((r) => r.end))
            } else {
              startHour = 8
              endHour = 22
            }
          } else {
            startHour = 8
            endHour = 22
          }
          const PAD = 20
          layoutRef.current = { startHour, PAD }
          const totalHeight = (endHour - startHour) * HOUR_HEIGHT + PAD * 2
          const visibleHeight = VISIBLE_HOURS * HOUR_HEIGHT + PAD * 2
          const hours = Array.from({ length: endHour - startHour + 1 }, (_, i) => startHour + i)
          const yPos = (time: string) => PAD + ((timeToMinutes(time) - startHour * 60) / 60) * HOUR_HEIGHT
          const hPos = (start: string, end: string) => yPos(end) - yPos(start)

          const gridCols = "grid-cols-[48px_repeat(7,1fr)_16px]"
          return (
            <div className="rounded-xl border overflow-hidden" ref={timelineRef}>
              {/* Header */}
              <div className={cn("grid bg-muted/50 border-b", gridCols)}>
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
                <div className="border-l bg-muted/30 w-4 shrink-0" aria-hidden />
              </div>

              {/* Leave strips */}
              {(() => {
                const weekLeaves = new Map<string, { leave: AdminCalendarLeave; days: string[] }>()
                currentWeek.forEach((day) => {
                  (day.leaves ?? []).forEach((l) => {
                    const key = `${l.userId}-${l.startDate}-${l.endDate}`
                    if (!weekLeaves.has(key)) weekLeaves.set(key, { leave: l, days: [] })
                    weekLeaves.get(key)!.days.push(day.date)
                  })
                })
                if (weekLeaves.size === 0) return null
                return (
                  <div className={cn("grid border-b", gridCols)}>
                    <div />
                    {currentWeek.map((day) => (
                      <div key={day.date} className="border-l flex flex-col gap-0.5 py-0.5 px-0.5">
                        {(day.leaves ?? []).map((l) => {
                          const key = `${l.userId}-${l.startDate}-${l.endDate}`
                          const entry = weekLeaves.get(key)
                          const isFirst = entry?.days[0] === day.date
                          return (
                            <div
                              key={key}
                              className={cn("rounded px-1.5 py-0.5 text-[10px] leading-tight flex items-center gap-1 truncate", l.status === "pending" && "border border-dashed")}
                              style={{
                                backgroundColor: l.color + (l.status === "approved" ? "25" : "12"),
                                borderColor: l.status === "pending" ? l.color + "60" : undefined,
                                color: l.color,
                              }}
                            >
                              <Palmtree className="size-2.5 shrink-0" />
                              {isFirst && <span className="truncate font-medium">{l.userName.split(" ")[0]}</span>}
                              {isFirst && l.status === "pending" && <span className="text-[9px] opacity-60">(čaká)</span>}
                            </div>
                          )
                        })}
                      </div>
                    ))}
                    <div className="border-l" />
                  </div>
                )
              })()}

              {/* Timeline body – výška 8 hodín, vertikálny scroll, začína od začiatku pracovných hodín */}
              <div
                ref={timelineScrollRef}
                className={cn("grid overflow-y-auto overflow-x-hidden", gridCols)}
                style={{ maxHeight: visibleHeight, minHeight: Math.min(visibleHeight, totalHeight) }}
              >
                {/* Hour labels */}
                <div className="relative border-r" style={{ height: totalHeight }}>
                  {hours.map((h) => (
                    <div key={h} className="absolute right-2 text-[10px] text-muted-foreground/60 tabular-nums select-none leading-none" style={{ top: PAD + (h - startHour) * HOUR_HEIGHT }}>
                      {String(h).padStart(2, "0")}:00
                    </div>
                  ))}
                </div>

                {/* Day columns */}
                {currentWeek.map((day) => {
                  type TaggedShift = AdminCalendarShift & { _type: "shift" }
                  type TaggedOpen = AdminOpenShift & { _type: "open" }
                  type FilledClaim = { _type: "filled"; claimId: string; userId: string; userName: string; color: string; startTime: string; endTime: string; openShift: AdminOpenShift }
                  type TaggedItem = TaggedShift | TaggedOpen | FilledClaim

                  const partialOpenShifts = day.openShifts.filter(os => os.claims.length < os.maxClaims)
                  const filledClaims: FilledClaim[] = day.openShifts
                    .filter(os => os.claims.length >= os.maxClaims)
                    .flatMap(os => os.claims.map(c => ({
                      _type: "filled" as const,
                      claimId: c.claimId,
                      userId: c.userId,
                      userName: c.userName,
                      color: c.color,
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
                      className={cn("relative border-l cursor-crosshair select-none", day.isToday && "bg-primary/5", !day.isCurrentMonth && "bg-muted/20")}
                      style={{ height: totalHeight }}
                      onMouseDown={(e) => {
                        if (e.target === e.currentTarget || (e.target as HTMLElement).hasAttribute("data-grid-line")) {
                          handleDragMouseDown(e, day.date, "create")
                        }
                      }}
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

                          if (item._type === "shift") {
                            const shift = item
                            return (
                              <div
                                key={shift.id}
                                className={cn(
                                  "absolute flex flex-col justify-start rounded-md px-1.5 py-1 text-sm text-left overflow-hidden cursor-grab group/block pointer-events-auto",
                                  shift.status === "draft" && "opacity-60",
                                )}
                                style={{
                                  top, height, width: `calc(${widthPct}% - 4px)`, left: `calc(${leftPct}% + 2px)`,
                                  backgroundColor: shift.color + "30",
                                  borderLeft: `3px ${shift.status === "draft" ? "dashed" : "solid"} ${shift.color}`,
                                  color: shift.color,
                                }}
                                onMouseDown={(e) => {
                                  if (e.button !== 0 || (e.target as HTMLElement).dataset.resizeHandle || (e.target as HTMLElement).dataset.actionBtn) return
                                  handleDragMouseDown(e, day.date, "move", shift)
                                }}
                              >
                                {/* Resize handle top */}
                                <div
                                  data-resize-handle="top"
                                  className="absolute top-0 left-0 right-0 h-2 cursor-ns-resize z-10 opacity-0 group-hover/block:opacity-100"
                                  onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); handleDragMouseDown(e, day.date, "resize-top", shift) }}
                                >
                                  <div className="mx-auto mt-0.5 w-6 h-1 rounded-full" style={{ backgroundColor: shift.color + "80" }} />
                                </div>

                                {/* Hover action buttons */}
                                <div className="absolute top-0.5 right-0.5 z-20 hidden group-hover/block:flex gap-0.5 rounded-sm p-0.5" style={{ backgroundColor: shift.color + "40" }}>
                                  <button
                                    data-action-btn
                                    title="Upraviť"
                                    className="rounded p-0.5 hover:bg-white/30 transition-colors"
                                    onMouseDown={(e) => { e.stopPropagation(); e.preventDefault() }}
                                    onClick={(e) => { e.stopPropagation(); openEdit(shift) }}
                                  >
                                    <Pencil className="size-3" />
                                  </button>
                                  <button
                                    data-action-btn
                                    title="Odstrániť"
                                    className="rounded p-0.5 hover:bg-red-400/40 transition-colors"
                                    onMouseDown={(e) => { e.stopPropagation(); e.preventDefault() }}
                                    onClick={(e) => { e.stopPropagation(); startTransition(() => deleteShift(shift.id)) }}
                                  >
                                    <Trash2 className="size-3" />
                                  </button>
                                </div>

                                <div className="font-semibold truncate leading-tight pr-4">{shift.userName}</div>
                                <div className="opacity-80 leading-tight text-xs">
                                  {shift.startTime}–{shift.endTime}
                                  {shift.status === "draft" && " · koncept"}
                                </div>
                                {/* Resize handle bottom */}
                                <div
                                  data-resize-handle="bottom"
                                  className="absolute bottom-0 left-0 right-0 h-2 cursor-ns-resize z-10 opacity-0 group-hover/block:opacity-100"
                                  onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); handleDragMouseDown(e, day.date, "resize-bottom", shift) }}
                                >
                                  <div className="mx-auto mb-0.5 w-6 h-1 rounded-full" style={{ backgroundColor: shift.color + "80" }} />
                                </div>
                              </div>
                            )
                          }

                          if (item._type === "open") {
                            const os = item
                            return (
                              <div
                                key={os.id}
                                className={cn("absolute rounded-md border border-dashed border-muted-foreground/30 px-1.5 py-1 text-sm bg-muted/10 overflow-hidden pointer-events-auto group/openblock", os.status === "draft" && "opacity-70")}
                                style={{ top, height, width: `calc(${widthPct}% - 4px)`, left: `calc(${leftPct}% + 2px)` }}
                              >
                                {/* Hover action buttons */}
                                <div className="absolute top-0.5 right-0.5 z-20 hidden group-hover/openblock:flex gap-0.5 rounded-sm p-0.5 bg-muted/60">
                                  <button
                                    title="Upraviť"
                                    className="rounded p-0.5 hover:bg-muted transition-colors text-muted-foreground"
                                    onClick={() => openEditOpenShift(os)}
                                  >
                                    <Pencil className="size-3" />
                                  </button>
                                  <button
                                    title="Odstrániť"
                                    className="rounded p-0.5 hover:bg-red-400/40 transition-colors text-destructive"
                                    onClick={() => startTransition(() => deleteShift(os.id))}
                                  >
                                    <Trash2 className="size-3" />
                                  </button>
                                </div>
                                <div className="font-medium text-muted-foreground leading-tight">
                                  Voľná {os.maxClaims > 1 && `(${os.claims.length}/${os.maxClaims})`}{os.status === "draft" && " · koncept"}
                                </div>
                                <div className="text-muted-foreground/70 text-xs leading-tight">{os.startTime}–{os.endTime}</div>
                                {os.claims.map((claim) => (
                                  <span key={claim.claimId} className="text-xs px-1 py-0.5 rounded mt-0.5 inline-block" style={{ backgroundColor: claim.color + "20", color: claim.color }}>{claim.userName.split(" ")[0]}</span>
                                ))}
                              </div>
                            )
                          }

                          if (item._type === "filled") {
                            const fc = item
                            return (
                              <div
                                key={`fc-${fc.claimId}`}
                                className="absolute flex flex-col justify-start rounded-md px-1.5 py-1 text-sm text-left overflow-hidden pointer-events-auto group/block"
                                style={{
                                  top, height, width: `calc(${widthPct}% - 4px)`, left: `calc(${leftPct}% + 2px)`,
                                  backgroundColor: fc.color + "30",
                                  borderLeft: `3px solid ${fc.color}`,
                                  color: fc.color,
                                }}
                              >
                                {/* Hover action buttons */}
                                <div className="absolute top-0.5 right-0.5 z-20 hidden group-hover/block:flex gap-0.5 rounded-sm p-0.5" style={{ backgroundColor: fc.color + "40" }}>
                                  <button
                                    title="Upraviť zmenu"
                                    className="rounded p-0.5 hover:bg-white/30 transition-colors"
                                    onClick={() => openEditOpenShift(fc.openShift)}
                                  >
                                    <Pencil className="size-3" />
                                  </button>
                                  <button
                                    title="Odobrať prihlásenie"
                                    className="rounded p-0.5 hover:bg-red-400/40 transition-colors"
                                    onClick={() => startTransition(() => adminRemoveClaim(fc.claimId))}
                                  >
                                    <Trash2 className="size-3" />
                                  </button>
                                </div>
                                <div className="font-semibold truncate leading-tight pr-4">{fc.userName}</div>
                                <div className="opacity-80 leading-tight text-xs">{fc.startTime}–{fc.endTime}</div>
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
                <div className="w-4 shrink-0 border-l bg-muted/20" style={{ height: totalHeight }} aria-hidden />
              </div>
            </div>
          )
        })()}
      </div>

      <ShiftDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        employees={employees}
        shift={editing}
        defaultDate={defaultDate}
        defaultStartTime={defaultStartTime}
        defaultEndTime={defaultEndTime}
      />
    </>
  )
}
