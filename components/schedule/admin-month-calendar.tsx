"use client"

import { useState, useTransition, useRef, useEffect, useCallback } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { ChevronLeft, ChevronRight, Plus, Send } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { ShiftDialog, type ShiftRuleForEdit, type EmployeeOption } from "./shift-dialog"
import { OfferShiftDialog } from "./offer-shift-dialog"
import { deleteShift, toggleShiftStatus, publishDraftShifts, approveShiftClaim, rejectShiftClaim, approveShiftRequest, rejectShiftRequest, updateShift } from "@/app/actions/schedule"
import { deleteShiftRule, skipRuleInstance, toggleShiftRuleStatus, modifyRuleInstance } from "@/app/actions/shift-rules"
import { Check, X, Pencil, Eye, EyeOff, Trash2, CalendarX, CalendarPlus } from "lucide-react"
import { toast } from "sonner"

export interface AdminCalendarShift {
  id: string
  ruleId: string | null
  userId: string
  userName: string
  date: string
  startTime: string
  endTime: string
  note: string | null
  status: "requested" | "draft" | "open" | "published"
  color: string
  isRule: boolean
  isRecurring?: boolean
  exceptionId?: string
}

export interface AdminOpenShift {
  id: string
  date: string
  startTime: string
  endTime: string
  note: string | null
  claims: { claimId: string; userId: string; userName: string; color: string }[]
  isRule?: boolean
  ruleId?: string | null
}

export interface AdminRequestedShift {
  id: string
  userId: string
  userName: string
  color: string
  date: string
  startTime: string
  endTime: string
  note: string | null
}

export interface AdminCalendarDay {
  date: string
  isCurrentMonth: boolean
  isToday: boolean
  shifts: AdminCalendarShift[]
  openShifts: AdminOpenShift[]
  requestedShifts: AdminRequestedShift[]
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
  businessHours?: Map<string, BusinessHoursEntry>
}

const DAY_LABELS = ["Po", "Ut", "St", "Št", "Pi", "So", "Ne"]
const HOUR_HEIGHT = 56 // px per hour in timeline view

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
  anchorMinutes: number // for create: the initial click point; for move: offset from block top
  // for resize/move of existing shifts:
  shiftId?: string
  isRule?: boolean
  ruleId?: string | null
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
  businessHours,
}: AdminMonthCalendarProps) {
  const router = useRouter()
  const [view, setView] = useState<"month" | "week">("week")
  const [weekIdx, setWeekIdx] = useState(() => {
    const today = new Date().toISOString().slice(0, 10)
    const idx = weeks.findIndex((w) => w.some((d) => d.date === today))
    return idx >= 0 ? idx : 0
  })
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<ShiftRuleForEdit | undefined>()
  const [defaultDate, setDefaultDate] = useState<string | undefined>()
  const [defaultStartTime, setDefaultStartTime] = useState<string | undefined>()
  const [defaultEndTime, setDefaultEndTime] = useState<string | undefined>()
  const [offerDialogOpen, setOfferDialogOpen] = useState(false)
  const [offerDate, setOfferDate] = useState<string | undefined>()
  const [offerStartTime, setOfferStartTime] = useState<string | undefined>()
  const [offerEndTime, setOfferEndTime] = useState<string | undefined>()
  const [isPending, startTransition] = useTransition()

  // Controlled dropdown — only one can be open at a time
  const [openMenuId, setOpenMenuId] = useState<string | null>(null)

  // Drag state
  const dragRef = useRef<DragState | null>(null)
  const [dragPreview, setDragPreview] = useState<DragPreview | null>(null)
  const timelineRef = useRef<HTMLDivElement>(null)
  const dragMovedRef = useRef(false) // true ak prebehol skutočný drag (nie len klik)

  // Drag handlers — these need access to startHour/PAD which are computed in render,
  // so we store them in a ref that's updated each render.
  const layoutRef = useRef({ startHour: 8, PAD: 20 })

  const getMinutesFromY = useCallback((y: number, containerRect: DOMRect) => {
    const { startHour, PAD } = layoutRef.current
    const relY = y - containerRect.top
    const minutes = startHour * 60 + ((relY - PAD) / HOUR_HEIGHT) * 60
    return snapTo15(Math.max(0, minutes))
  }, [])

  const pendingDragRef = useRef<{ startX: number; startY: number; args: [string, DragMode, AdminCalendarShift?] } | null>(null)

  const startDrag = useCallback((date: string, mode: DragMode, clientY: number, shift?: AdminCalendarShift) => {
    setOpenMenuId(null) // close any open dropdown
    dragMovedRef.current = true // skutočný drag začal
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
        dragRef.current = { mode, date, startMinutes: origStart, currentMinutes: minutes, anchorMinutes: anchorOffset, shiftId: shift.id, isRule: shift.isRule, ruleId: shift.ruleId, originalStart: origStart, originalEnd: origEnd }
      } else {
        dragRef.current = { mode, date, startMinutes: mode === "resize-top" ? origStart : origEnd, currentMinutes: minutes, anchorMinutes: minutes, shiftId: shift.id, isRule: shift.isRule, ruleId: shift.ruleId, originalStart: origStart, originalEnd: origEnd }
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
      // Start drag immediately for create and resize
      e.preventDefault()
      e.stopPropagation()
      startDrag(date, mode, e.clientY, shift)
    } else {
      // For move: defer until mouse moves 4px (so clicks still open dropdown)
      pendingDragRef.current = { startX: e.clientX, startY: e.clientY, args: [date, mode, shift] }
    }
  }, [startDrag])

  useEffect(() => {
    function onMouseMove(e: MouseEvent) {
      // Check pending move drag threshold
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

      // Ak prebehol skutočný drag, pohltíme nasledujúci click event
      // aby sa dropdown neotvoril po pustení bloku
      if (dragMovedRef.current) {
        dragMovedRef.current = false
        window.addEventListener("click", (e) => {
          e.stopPropagation()
          e.preventDefault()
        }, { capture: true, once: true })
      }

      setDragPreview(prev => {
        if (!prev) return null

        // Use setTimeout to schedule state updates outside the setState callback
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
          } else if (drag.mode === "resize-top" || drag.mode === "resize-bottom" || drag.mode === "move") {
            if (startTime !== minutesToTime(drag.originalStart!) || endTime !== minutesToTime(drag.originalEnd!)) {
              if (drag.isRule && drag.ruleId) {
                startTransition(() => modifyRuleInstance(drag.ruleId!, drag.date, { startTime, endTime }))
              } else if (drag.shiftId) {
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
    else router.push(`/admin/schedule?month=${prevMonth}`)
  }
  function handleNextWeek() {
    if (weekIdx < weeks.length - 1) setWeekIdx(weekIdx + 1)
    else router.push(`/admin/schedule?month=${nextMonth}`)
  }
  function goToToday() {
    const today = new Date().toISOString().slice(0, 10)
    const idx = weeks.findIndex((w) => w.some((d) => d.date === today))
    if (idx >= 0) {
      setWeekIdx(idx)
    } else {
      router.push("/admin/schedule")
    }
  }

  const allDraftIds = weeks.flatMap((week) =>
    week.flatMap((day) => day.shifts.filter((s) => s.status === "draft" && !s.isRule).map((s) => s.id)),
  )

  const allDraftRuleIds = [...new Set(
    weeks.flatMap((week) =>
      week.flatMap((day) => day.shifts.filter((s) => s.status === "draft" && s.isRule && s.ruleId).map((s) => s.ruleId!)),
    ),
  )]

  function openCreate(date?: string, startTime?: string, endTime?: string) {
    setEditing(undefined)
    setDefaultDate(date)
    setDefaultStartTime(startTime)
    setDefaultEndTime(endTime)
    setDialogOpen(true)
  }

  function openEditRule(s: AdminCalendarShift) {
    if (s.isRule && s.ruleId) {
      // For rule-based shifts, we'd need to fetch the full rule data
      // For now, construct what we can from the instance
      setEditing({
        id: s.ruleId,
        userId: s.userId,
        frequency: "once", // Will be overridden by the dialog's fetch
        date: s.date,
        days: null,
        dayOfMonth: null,
        validFrom: null,
        validUntil: null,
        startTime: s.startTime,
        endTime: s.endTime,
        allDay: false,
        note: s.note,
      })
    } else {
      // Legacy shift — open as "once" rule edit
      setEditing({
        id: s.id,
        userId: s.userId,
        frequency: "once",
        date: s.date,
        days: null,
        dayOfMonth: null,
        validFrom: null,
        validUntil: null,
        startTime: s.startTime,
        endTime: s.endTime,
        allDay: false,
        note: s.note,
      })
    }
    setDefaultDate(undefined)
    setDialogOpen(true)
  }

  function openOffer(date?: string, startTime?: string, endTime?: string) {
    setOfferDate(date)
    setOfferStartTime(startTime)
    setOfferEndTime(endTime)
    setOfferDialogOpen(true)
  }

  function handleDelete(id: string, isRule: boolean, ruleId?: string | null) {
    if (isRule && ruleId) {
      startTransition(() => deleteShiftRule(ruleId))
    } else {
      startTransition(() => deleteShift(id))
    }
  }

  function handleSkipInstance(ruleId: string, date: string) {
    startTransition(() => skipRuleInstance(ruleId, date))
  }

  function handleToggle(id: string, status: "draft" | "published", isRule: boolean, ruleId?: string | null) {
    if (isRule && ruleId) {
      startTransition(() => toggleShiftRuleStatus(ruleId, status))
    } else {
      startTransition(() => toggleShiftStatus(id, status))
    }
  }

  function handlePublishAll() {
    startTransition(async () => {
      if (allDraftIds.length > 0) await publishDraftShifts(allDraftIds)
      for (const ruleId of allDraftRuleIds) {
        await toggleShiftRuleStatus(ruleId, "draft")
      }
    })
  }

  function handleApproveRequest(shiftId: string) {
    startTransition(async () => {
      try {
        await approveShiftRequest(shiftId)
        toast.success("Požiadavka schválená")
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Chyba")
      }
    })
  }

  function handleRejectRequest(shiftId: string) {
    startTransition(async () => {
      try {
        await rejectShiftRequest(shiftId)
        toast.success("Požiadavka zamietnutá")
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Chyba")
      }
    })
  }

  function handleApprove(claimId: string) {
    startTransition(async () => {
      try {
        await approveShiftClaim(claimId)
        toast.success("Zmena priradená")
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Chyba")
      }
    })
  }

  function handleReject(claimId: string) {
    startTransition(async () => {
      try {
        await rejectShiftClaim(claimId)
        toast.success("Prihlásenie zamietnuté")
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Chyba")
      }
    })
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
            {(allDraftIds.length > 0 || allDraftRuleIds.length > 0) && (
              <Button variant="secondary" size="sm" onClick={handlePublishAll} disabled={isPending}>
                <Send className="size-4" />
                Publikovať všetky ({allDraftIds.length + allDraftRuleIds.length})
              </Button>
            )}
            <Button size="sm" variant="outline" onClick={() => openOffer()}>
              <CalendarPlus className="size-4" />
              Ponuka zmeny
            </Button>
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

                {day.shifts.length === 0 && day.openShifts.length === 0 && day.requestedShifts.length === 0 ? (
                  <p className="text-xs text-muted-foreground pl-10">Žiadne zmeny</p>
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
                          {!(shift.isRecurring && shift.status === "published") && (
                            <DropdownMenuItem onClick={() => openEditRule(shift)}>{shift.isRecurring ? "Upraviť pravidlo" : "Upraviť"}</DropdownMenuItem>
                          )}
                          {shift.status !== "open" && (
                            <DropdownMenuItem onClick={() => handleToggle(shift.id, shift.status as "draft" | "published", shift.isRule, shift.ruleId)} disabled={isPending}>
                              {shift.status === "draft" ? "Publikovať" : "Zrušiť publikovanie"}
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuSeparator />
                          {shift.isRecurring && (
                            <DropdownMenuItem onClick={() => handleSkipInstance(shift.ruleId!, shift.date)} disabled={isPending} className="text-destructive">Odstrániť túto zmenu</DropdownMenuItem>
                          )}
                          {!(shift.isRecurring && shift.status === "published") && (
                            <DropdownMenuItem className="text-destructive" onClick={() => handleDelete(shift.id, shift.isRule, shift.ruleId)} disabled={isPending}>
                              {shift.isRecurring ? "Odstrániť pravidlo" : "Odstrániť"}
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    ))}
                    {day.openShifts.map((os) => (
                      <div key={os.id} className="rounded-lg border border-dashed border-muted-foreground/30 px-3 py-2 flex flex-col gap-1.5 bg-muted/10">
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="text-sm font-medium text-muted-foreground">Voľná zmena</div>
                            <div className="text-xs text-muted-foreground/70">{os.startTime}–{os.endTime}</div>
                          </div>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <button className="p-1 rounded hover:bg-muted">
                                <Plus className="size-3.5 text-muted-foreground" />
                              </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => openEditRule({ id: os.id, ruleId: os.ruleId ?? null, userId: "", userName: "", date: os.date, startTime: os.startTime, endTime: os.endTime, note: os.note, status: "open", color: "", isRule: !!os.isRule })}>Upraviť</DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem className="text-destructive" onClick={() => handleDelete(os.id, !!os.isRule, os.ruleId)} disabled={isPending}>Odstrániť</DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                        {os.claims.length > 0 && (
                          <div className="flex flex-col gap-1">
                            {os.claims.map((claim) => (
                              <div key={claim.claimId} className="flex items-center justify-between gap-2 rounded px-2 py-1" style={{ backgroundColor: claim.color + "18" }}>
                                <span className="text-xs font-medium" style={{ color: claim.color }}>{claim.userName.split(" ")[0]} ⏳</span>
                                <div className="flex gap-1">
                                  <button onClick={() => handleApprove(claim.claimId)} disabled={isPending} className="p-0.5 rounded hover:bg-green-100 text-green-600">
                                    <Check className="size-3.5" />
                                  </button>
                                  <button onClick={() => handleReject(claim.claimId)} disabled={isPending} className="p-0.5 rounded hover:bg-red-100 text-destructive">
                                    <X className="size-3.5" />
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                    {day.requestedShifts.map((rs) => (
                      <div key={rs.id} className="rounded-lg border border-dashed border-amber-400/60 px-3 py-2 flex flex-col gap-1.5 bg-amber-50/50 dark:bg-amber-950/20">
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="text-sm font-medium text-amber-700 dark:text-amber-400" style={{ color: rs.color }}>{rs.userName.split(" ")[0]} — požiadavka</div>
                            <div className="text-xs text-muted-foreground">{rs.startTime}–{rs.endTime}</div>
                          </div>
                          <div className="flex gap-1">
                            <button onClick={() => handleApproveRequest(rs.id)} disabled={isPending} className="p-1 rounded hover:bg-green-100 text-green-600">
                              <Check className="size-4" />
                            </button>
                            <button onClick={() => handleRejectRequest(rs.id)} disabled={isPending} className="p-1 rounded hover:bg-red-100 text-destructive">
                              <X className="size-4" />
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
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

                const openShiftBlocks = day.openShifts.map((os) => (
                  <div key={os.id} className="rounded border border-dashed border-muted-foreground/40 px-1 py-0.5 text-xs leading-tight bg-background">
                    <div className="flex items-center justify-between gap-0.5">
                      <span className="truncate text-muted-foreground font-medium text-[10px]">Voľná</span>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button className="p-0.5 rounded hover:bg-muted opacity-0 group-hover:opacity-100 transition-opacity">
                            <Plus className="size-2.5 text-muted-foreground" />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => openEditRule({ id: os.id, ruleId: os.ruleId ?? null, userId: "", userName: "", date: os.date, startTime: os.startTime, endTime: os.endTime, note: os.note, status: "open", color: "", isRule: !!os.isRule })}>Upraviť</DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem className="text-destructive" onClick={() => handleDelete(os.id, !!os.isRule, os.ruleId)} disabled={isPending}>Odstrániť</DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                    <div className="opacity-60 text-[9px]">{os.startTime}–{os.endTime}</div>
                    {os.claims.map((claim) => (
                      <div key={claim.claimId} className="flex items-center gap-0.5 mt-0.5">
                        <span className="truncate text-[9px] flex-1" style={{ color: claim.color }}>{claim.userName.split(" ")[0]} ⏳</span>
                        <button onClick={() => handleApprove(claim.claimId)} disabled={isPending} className="text-green-600 hover:opacity-70 disabled:opacity-30">
                          <Check className="size-2.5" />
                        </button>
                        <button onClick={() => handleReject(claim.claimId)} disabled={isPending} className="text-destructive hover:opacity-70 disabled:opacity-30">
                          <X className="size-2.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                ))

                const requestedShiftBlocks = day.requestedShifts.map((rs) => (
                  <div key={rs.id} className="rounded border border-dashed border-amber-400/60 px-1 py-0.5 text-xs leading-tight bg-amber-50/50 dark:bg-amber-950/20">
                    <div className="truncate font-medium text-[10px]" style={{ color: rs.color }}>{rs.userName.split(" ")[0]} ⏳</div>
                    <div className="opacity-70 text-[9px] text-amber-600">{rs.startTime}–{rs.endTime}</div>
                    <div className="flex gap-0.5 mt-0.5">
                      <button onClick={() => handleApproveRequest(rs.id)} disabled={isPending} className="text-green-600 hover:opacity-70 disabled:opacity-30">
                        <Check className="size-2.5" />
                      </button>
                      <button onClick={() => handleRejectRequest(rs.id)} disabled={isPending} className="text-destructive hover:opacity-70 disabled:opacity-30">
                        <X className="size-2.5" />
                      </button>
                    </div>
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
                        <div className="truncate font-medium">{shift.userName.split(" ")[0]}</div>
                        <div className="opacity-80">{shift.startTime}–{shift.endTime}</div>
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start">
                      {!(shift.isRecurring && shift.status === "published") && (
                        <DropdownMenuItem onClick={() => openEditRule(shift)}>{shift.isRecurring ? "Upraviť pravidlo" : "Upraviť"}</DropdownMenuItem>
                      )}
                      {shift.status !== "open" && (
                        <DropdownMenuItem onClick={() => handleToggle(shift.id, shift.status as "draft" | "published", shift.isRule, shift.ruleId)} disabled={isPending}>
                          {shift.status === "draft" ? "Publikovať" : "Zrušiť publikovanie"}
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuSeparator />
                      {shift.isRecurring && (
                        <DropdownMenuItem onClick={() => handleSkipInstance(shift.ruleId!, shift.date)} disabled={isPending} className="text-destructive">Odstrániť túto zmenu</DropdownMenuItem>
                      )}
                      {!(shift.isRecurring && shift.status === "published") && (
                        <DropdownMenuItem className="text-destructive" onClick={() => handleDelete(shift.id, shift.isRule, shift.ruleId)} disabled={isPending}>
                          {shift.isRecurring ? "Odstrániť pravidlo" : "Odstrániť"}
                        </DropdownMenuItem>
                      )}
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
                      <div
                        className={cn(
                          "text-xs font-medium w-5 h-5 flex items-center justify-center rounded-full",
                          day.isToday
                            ? "bg-primary text-primary-foreground"
                            : day.isCurrentMonth
                            ? "text-foreground"
                            : "text-muted-foreground",
                        )}
                      >
                        {dayNum}
                      </div>
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
                          {shiftBlocks}
                          {openShiftBlocks}
                          {requestedShiftBlocks}
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-col gap-0.5">{shiftBlocks}{openShiftBlocks}{requestedShiftBlocks}</div>
                    )}
                  </div>
                )
              })}
            </div>
          ))}
        </div>}

        {/* ── Week view (timeline) ─────────────────────── */}
        {view === "week" && (() => {
          const allEntries = currentWeek.flatMap(d => [
            ...d.shifts.map(s => ({ start: s.startTime, end: s.endTime })),
            ...d.openShifts.map(s => ({ start: s.startTime, end: s.endTime })),
            ...d.requestedShifts.map(s => ({ start: s.startTime, end: s.endTime })),
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
              <div className="grid grid-cols-[48px_repeat(7,1fr)] overflow-y-auto" style={{ maxHeight: "70vh" }}>
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
                  type TaggedShift = AdminCalendarShift & { _type: "shift" }
                  type TaggedOpen = AdminOpenShift & { _type: "open" }
                  type TaggedReq = AdminRequestedShift & { _type: "requested" }
                  type TaggedItem = TaggedShift | TaggedOpen | TaggedReq

                  const allItems: TaggedItem[] = [
                    ...day.shifts.map(s => ({ ...s, _type: "shift" as const })),
                    ...day.openShifts.map(s => ({ ...s, _type: "open" as const })),
                    ...day.requestedShifts.map(s => ({ ...s, _type: "requested" as const })),
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
                                  "absolute flex flex-col justify-start rounded-md px-1.5 py-1 text-xs text-left overflow-hidden cursor-grab group/block pointer-events-auto",
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

                                {/* Hover action buttons — Tempo style */}
                                <div className="absolute top-0.5 right-0.5 z-20 hidden group-hover/block:flex gap-0.5 rounded-sm p-0.5" style={{ backgroundColor: shift.color + "40" }}>
                                  {!(shift.isRecurring && shift.status === "published") && (
                                    <button
                                      data-action-btn
                                      title={shift.isRecurring ? "Upraviť pravidlo" : "Upraviť"}
                                      className="rounded p-0.5 hover:bg-white/30 transition-colors"
                                      onMouseDown={(e) => { e.stopPropagation(); e.preventDefault() }}
                                      onClick={(e) => { e.stopPropagation(); openEditRule(shift) }}
                                    >
                                      <Pencil className="size-3" />
                                    </button>
                                  )}
                                  {shift.status !== "open" && (
                                    <button
                                      data-action-btn
                                      title={shift.status === "draft" ? "Publikovať" : "Zrušiť publikovanie"}
                                      className="rounded p-0.5 hover:bg-white/30 transition-colors"
                                      onMouseDown={(e) => { e.stopPropagation(); e.preventDefault() }}
                                      onClick={(e) => { e.stopPropagation(); handleToggle(shift.id, shift.status as "draft" | "published", shift.isRule, shift.ruleId) }}
                                    >
                                      {shift.status === "draft" ? <Eye className="size-3" /> : <EyeOff className="size-3" />}
                                    </button>
                                  )}
                                  {shift.isRecurring && (
                                    <button
                                      data-action-btn
                                      title="Odstrániť túto zmenu"
                                      className="rounded p-0.5 hover:bg-white/30 transition-colors"
                                      onMouseDown={(e) => { e.stopPropagation(); e.preventDefault() }}
                                      onClick={(e) => { e.stopPropagation(); handleSkipInstance(shift.ruleId!, shift.date) }}
                                    >
                                      <CalendarX className="size-3" />
                                    </button>
                                  )}
                                  {!(shift.isRecurring && shift.status === "published") && (
                                    <button
                                      data-action-btn
                                      title={shift.isRecurring ? "Odstrániť pravidlo" : "Odstrániť"}
                                      className="rounded p-0.5 hover:bg-red-400/40 transition-colors"
                                      onMouseDown={(e) => { e.stopPropagation(); e.preventDefault() }}
                                      onClick={(e) => { e.stopPropagation(); handleDelete(shift.id, shift.isRule, shift.ruleId) }}
                                    >
                                      <Trash2 className="size-3" />
                                    </button>
                                  )}
                                </div>

                                <div className="font-semibold truncate leading-tight pr-4">{shift.userName}</div>
                                <div className="opacity-80 leading-tight text-[10px]">
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
                                className="absolute rounded-md border border-dashed border-muted-foreground/30 px-1.5 py-0.5 text-xs bg-muted/10 overflow-hidden pointer-events-auto group/openblock"
                                style={{ top, height, width: `calc(${widthPct}% - 4px)`, left: `calc(${leftPct}% + 2px)` }}
                              >
                                {/* Hover action buttons */}
                                <div className="absolute top-0.5 right-0.5 z-20 hidden group-hover/openblock:flex gap-0.5 rounded-sm p-0.5 bg-muted/60">
                                  <button
                                    title="Upraviť"
                                    className="rounded p-0.5 hover:bg-muted transition-colors text-muted-foreground"
                                    onClick={() => openEditRule({ id: os.id, ruleId: os.ruleId ?? null, userId: "", userName: "", date: os.date, startTime: os.startTime, endTime: os.endTime, note: os.note, status: "open", color: "", isRule: !!os.isRule })}
                                  >
                                    <Pencil className="size-3" />
                                  </button>
                                  <button
                                    title="Odstrániť"
                                    className="rounded p-0.5 hover:bg-red-400/40 transition-colors text-destructive"
                                    onClick={() => handleDelete(os.id, !!os.isRule, os.ruleId)}
                                  >
                                    <Trash2 className="size-3" />
                                  </button>
                                </div>
                                <div className="font-medium text-muted-foreground leading-tight">Voľná</div>
                                <div className="text-muted-foreground/70 text-[10px] leading-tight">{os.startTime}–{os.endTime}</div>
                                {os.claims.map((claim) => (
                                  <div key={claim.claimId} className="flex items-center justify-between gap-0.5 mt-0.5 rounded px-1 py-0.5" style={{ backgroundColor: claim.color + "18" }}>
                                    <span className="text-[10px] font-medium truncate" style={{ color: claim.color }}>{claim.userName.split(" ")[0]} ⏳</span>
                                    <div className="flex gap-0.5 shrink-0">
                                      <button onClick={() => handleApprove(claim.claimId)} disabled={isPending} className="text-green-600 hover:opacity-70"><Check className="size-3" /></button>
                                      <button onClick={() => handleReject(claim.claimId)} disabled={isPending} className="text-destructive hover:opacity-70"><X className="size-3" /></button>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )
                          }

                          if (item._type === "requested") {
                            const rs = item
                            return (
                              <div
                                key={rs.id}
                                className="absolute rounded-md border border-dashed border-amber-400/60 px-1.5 py-0.5 text-xs bg-amber-50/50 dark:bg-amber-950/20 overflow-hidden pointer-events-auto"
                                style={{ top, height, width: `calc(${widthPct}% - 4px)`, left: `calc(${leftPct}% + 2px)` }}
                              >
                                <div className="font-medium truncate leading-tight" style={{ color: rs.color }}>{rs.userName.split(" ")[0]} ⏳</div>
                                <div className="text-muted-foreground text-[10px] leading-tight">{rs.startTime}–{rs.endTime}</div>
                                <div className="flex gap-0.5 mt-0.5">
                                  <button onClick={() => handleApproveRequest(rs.id)} disabled={isPending} className="text-green-600 hover:opacity-70"><Check className="size-3" /></button>
                                  <button onClick={() => handleRejectRequest(rs.id)} disabled={isPending} className="text-destructive hover:opacity-70"><X className="size-3" /></button>
                                </div>
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
      <OfferShiftDialog
        open={offerDialogOpen}
        onOpenChange={setOfferDialogOpen}
        defaultDate={offerDate}
        defaultStartTime={offerStartTime}
        defaultEndTime={offerEndTime}
      />
    </>
  )
}
