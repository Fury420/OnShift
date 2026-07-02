"use client"

import { useState, useTransition, useRef, useEffect, useCallback } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { ChevronLeft, ChevronRight, Plus, Check, Palmtree, ArrowLeftRight, Send, Pencil, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { LeaveRequestDialog } from "@/components/leaves/leave-request-dialog"
import type { ColleagueOption } from "@/components/shift-replacement/request-dialog"
import { NewReplacementDialog } from "@/components/shift-replacement/new-replacement-dialog"
import { claimShift, deleteShift, toggleShiftStatus, publishDraftShifts, deleteAllDraftShifts, updateShift, adminRemoveClaim } from "@/app/actions/schedule"
import { toast } from "sonner"
import { toDateStr } from "@/lib/week"
import { ShiftDialog, type ShiftForEdit, type EmployeeOption, type PositionOption } from "./shift-dialog"

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
  // admin-only fields
  date?: string
  status?: "draft" | "published"
  positionId?: string | null
  positionName?: string | null
}

export interface OpenShift {
  id: string
  positionId?: string | null
  positionName?: string | null
  startTime: string
  endTime: string
  note: string | null
  maxClaims: number
  acceptedCount: number
  claimedByUsers: { userId: string; userName: string; color: string; claimId: string }[]
  myClaimId: string | null
  iMayClaim: boolean
  // admin-only fields
  date?: string
  status?: "draft" | "open"
}

export interface CalendarLeave {
  userId: string
  userName: string
  color: string
  type: "vacation" | "sick" | "personal"
  status: "approved" | "pending"
  startDate: string
  endDate: string
}

export interface CalendarDay {
  date: string
  isCurrentMonth: boolean
  isToday: boolean
  shifts: CalendarShift[]
  openShifts: OpenShift[]
  leaves?: CalendarLeave[]
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
  initialWeek?: "first" | "last"
  initialDate?: string
  schedulePath?: string
  allEmployees: ColleagueOption[]
  businessHours?: Map<string, BusinessHoursEntry>
  currentUserId?: string
  isAdmin?: boolean
  positions?: PositionOption[]
}

interface ReplacementContext {
  shiftId: string
  shiftLabel: string
}

const DAY_LABELS = ["Po", "Ut", "St", "Št", "Pi", "So", "Ne"]
const LEAVE_LABELS: Record<string, string> = { vacation: "Dovolenka", sick: "PN", personal: "Osobné voľno" }

const LEAVE_STYLES = {
  approved: "bg-red-600 dark:bg-red-700 text-white",
  pending: "bg-amber-500 dark:bg-amber-600 text-white",
} as const
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

export function MonthCalendar({ weeks, monthLabel, prevMonth, nextMonth, initialWeek, initialDate, schedulePath = "/schedule", allEmployees, businessHours, currentUserId, isAdmin, positions = [] }: MonthCalendarProps) {
  const router = useRouter()
  const [view, setView] = useState<"month" | "week">("week")
  const [weekIdx, setWeekIdx] = useState(() => {
    if (initialDate) {
      const idx = weeks.findIndex((w) => w.some((d) => d.date === initialDate))
      if (idx >= 0) return idx
    }
    if (initialWeek === "last") return Math.max(0, weeks.length - 1)
    if (initialWeek === "first") return 0
    const today = toDateStr(new Date())
    const idx = weeks.findIndex((w) => w.some((d) => d.date === today))
    return idx >= 0 ? idx : weeks.findIndex((w) => w.some((d) => d.isCurrentMonth)) ?? 0
  })
  const [replacementCtx, setReplacementCtx] = useState<ReplacementContext | null>(null)
  const [leaveDialogOpen, setLeaveDialogOpen] = useState(false)
  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const [createDate, setCreateDate] = useState<string | undefined>()
  const [createStartTime, setCreateStartTime] = useState<string | undefined>()
  const [createEndTime, setCreateEndTime] = useState<string | undefined>()
  const [editing, setEditing] = useState<ShiftForEdit | undefined>()
  const [isPending, startTransition] = useTransition()
  const [openMenuId, setOpenMenuId] = useState<string | null>(null)

  // Drag state
  const dragRef = useRef<DragState | null>(null)
  const [dragPreview, setDragPreview] = useState<DragPreview | null>(null)
  const timelineRef = useRef<HTMLDivElement>(null)
  const timelineScrollRef = useRef<HTMLDivElement>(null)
  const layoutRef = useRef({ startHour: 8, PAD: 20 })
  const dragMovedRef = useRef(false)
  const pendingDragRef = useRef<{ startX: number; startY: number; args: [string, DragMode, CalendarShift?] } | null>(null)

  const getMinutesFromY = useCallback((y: number, containerRect: DOMRect) => {
    const { startHour, PAD } = layoutRef.current
    const relY = y - containerRect.top
    const minutes = startHour * 60 + ((relY - PAD) / HOUR_HEIGHT) * 60
    return snapTo15(Math.max(0, minutes))
  }, [])

  const startDrag = useCallback((date: string, mode: DragMode, clientY: number, shift?: CalendarShift) => {
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

  const handleDragMouseDown = useCallback((e: React.MouseEvent, date: string, mode: DragMode, shift?: CalendarShift) => {
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
        window.addEventListener("click", (e) => { e.stopPropagation(); e.preventDefault() }, { capture: true, once: true })
      }

      setDragPreview(prev => {
        if (!prev) return null
        const st = minutesToTime(prev.topMinutes)
        const et = minutesToTime(prev.bottomMinutes)
        setTimeout(() => {
          if (drag.mode === "create") {
            if (prev.bottomMinutes - prev.topMinutes >= 15) {
              openCreateDialog(drag.date, st, et)
            }
          } else if (drag.shiftId) {
            if (st !== minutesToTime(drag.originalStart!) || et !== minutesToTime(drag.originalEnd!)) {
              startTransition(async () => {
                try {
                  const day = weeks.flat().find(d => d.date === drag.date)
                  const shift = day?.shifts.find(s => s.id === drag.shiftId)
                  if (shift) {
                    await updateShift(drag.shiftId!, { userId: shift.userId || null, date: drag.date, startTime: st, endTime: et, note: shift.note || undefined })
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
  }, [getMinutesFromY, startDrag, weeks, startTransition, isAdmin])

  useEffect(() => {
    if (initialDate) {
      const idx = weeks.findIndex((w) => w.some((d) => d.date === initialDate))
      if (idx >= 0) setWeekIdx(idx)
      setView("week")
    } else if (initialWeek === "last") setWeekIdx(Math.max(0, weeks.length - 1))
    else if (initialWeek === "first") setWeekIdx(0)
    else {
      // No initialWeek/initialDate — default to today's week or first week of month
      const today = toDateStr(new Date())
      const idx = weeks.findIndex((w) => w.some((d) => d.date === today))
      setWeekIdx(idx >= 0 ? idx : weeks.findIndex((w) => w.some((d) => d.isCurrentMonth)) ?? 0)
    }
  // Reaguj len na skutočnú navigáciu (initialDate/initialWeek/mesiac), NIE na refresh dát.
  // `weeks` zámerne nie je v závislostiach — inak by router.refresh() po uložení editu
  // resetol zobrazený týždeň na dnešný. monthLabel pokrýva zmenu mesiaca.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialDate, initialWeek, monthLabel])

  useEffect(() => {
    if (view !== "week") return
    const el = timelineScrollRef.current
    if (!el) return
    const scrollToStart = () => { el.scrollTop = 0 }
    scrollToStart()
    requestAnimationFrame(scrollToStart)
  }, [view, weekIdx])

  const currentWeek = weeks[weekIdx] ?? weeks[0]
  const weekLabel = (() => {
    const s = new Date(currentWeek[0].date + "T12:00:00")
    const e = new Date(currentWeek[6].date + "T12:00:00")
    const fmt = (d: Date) => `${d.getDate()} ${d.toLocaleDateString("en-US", { month: "short" })}`
    return `${fmt(s)} – ${fmt(e)}`
  })()

  // Admin: collect all draft IDs for batch operations
  const allDraftIds = isAdmin ? weeks.flatMap((week) =>
    week.flatMap((day) => [
      ...day.shifts.filter((s) => s.status === "draft").map((s) => s.id),
      ...day.openShifts.filter((os) => os.status === "draft").map((os) => os.id),
    ]),
  ) : []

  function openCreateDialog(date?: string, startTime?: string, endTime?: string) {
    setEditing(undefined)
    setCreateDate(date)
    setCreateStartTime(startTime)
    setCreateEndTime(endTime)
    setCreateDialogOpen(true)
  }

  function closeCreateDialog() {
    setCreateDialogOpen(false)
    setEditing(undefined)
    setCreateDate(undefined)
    setCreateStartTime(undefined)
    setCreateEndTime(undefined)
    router.refresh()
  }

  function openEdit(shift: CalendarShift) {
    setEditing({
      id: shift.id,
      userId: shift.userId,
      positionId: shift.positionId ?? null,
      date: shift.date ?? "",
      startTime: shift.startTime,
      endTime: shift.endTime,
      note: shift.note,
      maxClaims: 1,
    })
    setCreateDate(undefined)
    setCreateDialogOpen(true)
  }

  function openEditOpenShift(os: OpenShift) {
    setEditing({
      id: os.id,
      userId: null,
      positionId: os.positionId ?? null,
      date: os.date ?? "",
      startTime: os.startTime,
      endTime: os.endTime,
      note: os.note,
      maxClaims: os.maxClaims,
    })
    setCreateDate(undefined)
    setCreateDialogOpen(true)
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

  function formatShiftLabel(dateStr: string, startTime: string, endTime: string) {
    const [y, m, d] = dateStr.split("-").map(Number)
    const dateLabel = new Date(y, m - 1, d).toLocaleDateString("sk-SK", { weekday: "short", day: "numeric", month: "numeric" })
    return `${dateLabel} ${startTime}–${endTime}`
  }

  function openReplacement(shiftId: string, shiftLabel: string) {
    setReplacementCtx({ shiftId, shiftLabel })
  }

  function handlePrevWeek() {
    if (weekIdx > 0) setWeekIdx(weekIdx - 1)
    else router.push(`${schedulePath}?month=${prevMonth}&week=last`)
  }

  function handleNextWeek() {
    if (weekIdx < weeks.length - 1) setWeekIdx(weekIdx + 1)
    else router.push(`${schedulePath}?month=${nextMonth}&week=first`)
  }

  function goToToday() {
    const today = toDateStr(new Date())
    const idx = weeks.findIndex((w) => w.some((d) => d.date === today))
    if (idx >= 0) setWeekIdx(idx)
    else router.push(schedulePath)
  }

  const todayStr = toDateStr(new Date())

  const nextOpenShift = !isAdmin ? (() => {
    const daysToSearch = view === "week" ? currentWeek : weeks.flat()
    for (const day of daysToSearch) {
      if (day.date < todayStr) continue
      for (const os of day.openShifts) {
        if (os.acceptedCount < os.maxClaims && os.iMayClaim && !os.myClaimId) {
          const d = new Date(day.date + "T12:00:00")
          const label = d.toLocaleDateString("sk-SK", { weekday: "long", day: "numeric", month: "long" })
          return { ...os, date: day.date, dateLabel: label }
        }
      }
    }
    return null
  })() : null

  // ── Render helpers for shift blocks ──

  function renderAdminShiftMobile(shift: CalendarShift, day: CalendarDay) {
    return (
      <DropdownMenu key={shift.id}>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            onClick={(e) => e.stopPropagation()}
            className={cn("w-full text-left rounded-lg px-3 py-2 hover:opacity-80 transition-opacity cursor-pointer", shift.status === "draft" && "opacity-60")}
            style={{ backgroundColor: shift.color + "28", borderLeft: `3px ${shift.status === "draft" ? "dashed" : "solid"} ${shift.color}` }}
          >
            <div className="text-sm font-semibold" style={{ color: shift.color }}>{shift.userName.split(" ")[0]}</div>
            <div className="text-xs opacity-75" style={{ color: shift.color }}>
              {shift.startTime}–{shift.endTime}
              {shift.status === "draft" && " · koncept"}
            </div>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuItem onClick={() => openEdit(shift)}>Upraviť</DropdownMenuItem>
          {shift.status === "draft" && (
            <DropdownMenuItem onClick={() => startTransition(() => toggleShiftStatus(shift.id, "draft"))} disabled={isPending}>Publikovať</DropdownMenuItem>
          )}
          {shift.isCurrentUser && (
            <DropdownMenuItem onClick={() => openReplacement(shift.id, formatShiftLabel(day.date, shift.startTime, shift.endTime))}>Požiadať o zastup</DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem className="text-destructive" onClick={() => startTransition(() => deleteShift(shift.id))} disabled={isPending}>Odstrániť</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    )
  }

  function renderEmployeeShiftMobile(shift: CalendarShift, day: CalendarDay) {
    const isPast = day.date < todayStr
    const clickable = shift.isCurrentUser && !isPast
    return (
      <div key={shift.id} className={cn("rounded-lg px-3 py-2 transition-opacity relative group/block", clickable && "cursor-pointer hover:opacity-80")}
        style={{ backgroundColor: shift.color + "28", borderLeft: `3px solid ${shift.color}` }}
        onClick={clickable ? () => openReplacement(shift.id, formatShiftLabel(day.date, shift.startTime, shift.endTime)) : undefined}>
        {clickable && (
          <button type="button" className="absolute top-1.5 right-1.5 p-1 rounded opacity-0 group-hover/block:opacity-100 hover:bg-black/10 transition-opacity" title="Požiadať o zastup"
            onClick={(e) => { e.stopPropagation(); openReplacement(shift.id, formatShiftLabel(day.date, shift.startTime, shift.endTime)) }}>
            <ArrowLeftRight className="size-3.5 text-muted-foreground" />
          </button>
        )}
        <div className="text-sm font-semibold pr-6" style={{ color: shift.color }}>{shift.userName.split(" ")[0]}</div>
        <div className="text-sm opacity-75" style={{ color: shift.color }}>{shift.startTime}–{shift.endTime}</div>
      </div>
    )
  }

  function renderAdminOpenShiftMobile(os: OpenShift, day: CalendarDay) {
    const isFull = os.claimedByUsers.length >= os.maxClaims
    if (isFull) {
      return os.claimedByUsers.map((claim) => (
        <div key={`fc-${claim.claimId}`} className="rounded-lg px-3 py-2 hover:opacity-80 transition-opacity"
          style={{ backgroundColor: claim.color + "28", borderLeft: `3px solid ${claim.color}` }}>
          <div className="text-sm font-semibold" style={{ color: claim.color }}>{claim.userName.split(" ")[0]}</div>
          {os.positionName && <div className="text-xs opacity-60" style={{ color: claim.color }}>{os.positionName}</div>}
          <div className="text-xs opacity-75" style={{ color: claim.color }}>{os.startTime}–{os.endTime}</div>
        </div>
      ))
    }
    return (
      <div key={os.id} className={cn("rounded-lg border border-dashed border-muted-foreground/30 px-3 py-2 flex flex-col gap-1.5 bg-muted/10", os.status === "draft" && "opacity-70")}>
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-medium text-muted-foreground">
              {os.positionName ?? "Neobsadená zmena"}
              {os.maxClaims > 1 && <span className="text-xs ml-1">({os.claimedByUsers.length}/{os.maxClaims})</span>}
              {os.status === "draft" && <span className="text-xs ml-1 text-muted-foreground/70">· koncept</span>}
            </div>
            <div className="text-xs text-muted-foreground/70">{os.startTime}–{os.endTime}</div>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="p-1 rounded hover:bg-muted"><Plus className="size-3.5 text-muted-foreground" /></button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => openEditOpenShift(os)}>Upraviť</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="text-destructive" onClick={() => startTransition(() => deleteShift(os.id))} disabled={isPending}>Odstrániť</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        {os.claimedByUsers.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-0.5">
            {os.claimedByUsers.map((claim) => (
              <span key={claim.claimId} className="text-xs px-1.5 py-0.5 rounded-full flex items-center gap-1" style={{ backgroundColor: claim.color + "20", color: claim.color }}>
                {claim.userName.split(" ")[0]}
                <button onClick={() => startTransition(() => adminRemoveClaim(claim.claimId))} className="hover:opacity-60" title="Odobrať">×</button>
              </span>
            ))}
          </div>
        )}
      </div>
    )
  }

  function renderEmployeeOpenShiftMobile(os: OpenShift, day: CalendarDay) {
    const isPast = day.date < todayStr
    const isFull = os.acceptedCount >= os.maxClaims
    if (isFull) {
      return os.claimedByUsers.map((u) => {
        const isMe = u.userId === currentUserId
        return (
          <div key={`fc-${u.claimId}`} className={cn("rounded-lg px-3 py-2 relative group/block", isMe && "cursor-pointer hover:opacity-90")}
            style={{ backgroundColor: u.color + "28", borderLeft: `3px solid ${u.color}` }}
            onClick={isMe ? () => openReplacement(os.id, formatShiftLabel(day.date, os.startTime, os.endTime)) : undefined}>
            {isMe && (
              <button type="button" className="absolute top-1.5 right-1.5 p-1 rounded opacity-0 group-hover/block:opacity-100 hover:bg-black/10 transition-opacity" title="Požiadať o zastup"
                onClick={(e) => { e.stopPropagation(); openReplacement(os.id, formatShiftLabel(day.date, os.startTime, os.endTime)) }}>
                <ArrowLeftRight className="size-3.5 text-muted-foreground" />
              </button>
            )}
            <div className="text-sm font-semibold pr-6" style={{ color: u.color }}>{u.userName.split(" ")[0]}</div>
            {os.positionName && <div className="text-xs opacity-60" style={{ color: u.color }}>{os.positionName}</div>}
            <div className="text-sm opacity-75" style={{ color: u.color }}>{os.startTime}–{os.endTime}</div>
          </div>
        )
      })
    }
    const canClaim = os.iMayClaim && !isPast
    const isClaimed = !!os.myClaimId
    return (
      <div key={os.id} className={cn("rounded-lg border border-dashed border-muted-foreground/30 px-3 py-2 flex flex-col gap-1 bg-muted/10", canClaim && "cursor-pointer hover:border-primary/50 hover:bg-primary/5 transition-colors")}
        onClick={canClaim ? () => handleClaim(os.id) : undefined}>
        <div className="flex items-center justify-between">
          <div className="text-sm font-medium text-muted-foreground">
            {os.positionName ?? "Neobsadená zmena"}
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
  }

  return (
    <div className="flex flex-col gap-4 w-full">
      {/* ── Header ── */}
      <div className="flex items-center justify-between gap-2">
        {view === "month" ? (
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" asChild>
              <Link href={`${schedulePath}?month=${prevMonth}`}><ChevronLeft className="size-4" /></Link>
            </Button>
            <span className="text-sm font-medium min-w-40 text-center capitalize">{monthLabel}</span>
            <Button variant="outline" size="icon" asChild>
              <Link href={`${schedulePath}?month=${nextMonth}`}><ChevronRight className="size-4" /></Link>
            </Button>
            <Button variant="outline" size="sm" asChild>
              <Link href={schedulePath}>Dnes</Link>
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
          {!isAdmin && (
            <Button size="sm" variant="outline" onClick={() => setLeaveDialogOpen(true)}>
              <Palmtree className="size-4" />
              <span className="hidden sm:inline">Žiadosť o dovolenku</span>
            </Button>
          )}
          {isAdmin && allDraftIds.length > 0 && (
            <>
              <Button variant="secondary" size="sm" onClick={() => startTransition(() => publishDraftShifts(allDraftIds))} disabled={isPending}>
                <Send className="size-4" />
                <span className="hidden sm:inline">Publikovať všetky ({allDraftIds.length})</span>
              </Button>
              <Button variant="outline" size="sm" onClick={() => startTransition(() => deleteAllDraftShifts(allDraftIds))} disabled={isPending} className="text-destructive hover:text-destructive">
                <Trash2 className="size-4" />
                <span className="hidden sm:inline">Vymazať koncepty</span>
              </Button>
            </>
          )}
          {isAdmin && (
            <Button size="sm" onClick={() => openCreateDialog()}>
              <Plus className="size-4" />
              <span className="hidden sm:inline">Nová zmena</span>
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
              <div key={day.date} className={cn("rounded-xl border p-3 flex flex-col gap-2", day.isToday && "border-primary/40 bg-primary/5", !day.isToday && day.shifts.length === 0 && day.openShifts.length === 0 && "opacity-50")}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className={cn("size-8 rounded-full flex items-center justify-center text-sm font-bold shrink-0", day.isToday ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground")}>{dateObj.getDate()}</div>
                    <span className={cn("text-sm font-medium capitalize", !day.isCurrentMonth && "text-muted-foreground")}>{dayLabel}</span>
                  </div>
                  {!isPast && day.isCurrentMonth && isAdmin && (
                    <button onClick={() => openCreateDialog(day.date)} className="p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground" title="Nová zmena"><Plus className="size-4" /></button>
                  )}
                </div>
                {day.shifts.length === 0 && day.openShifts.length === 0 && (day.leaves ?? []).length === 0 ? (
                  <p className="text-xs text-muted-foreground pl-10">Žiadne zmeny</p>
                ) : (
                  <div className="flex flex-col gap-1.5 pl-10">
                    {(day.leaves ?? []).map((l, i) => (
                      <div key={`leave-${l.userId}-${i}`} className={cn("rounded px-3 py-1.5 text-sm font-medium truncate", l.status === "approved" ? LEAVE_STYLES.approved : LEAVE_STYLES.pending)}>
                        {l.userName} · {LEAVE_LABELS[l.type] ?? l.type}{l.status === "pending" && " · čaká"}
                      </div>
                    ))}
                    {day.shifts.map((shift) => isAdmin ? renderAdminShiftMobile(shift, day) : renderEmployeeShiftMobile(shift, day))}
                    {day.openShifts.map((os) => isAdmin ? renderAdminOpenShiftMobile(os, day) : renderEmployeeOpenShiftMobile(os, day))}
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
                      if (isAdmin) {
                        return (
                          <DropdownMenu key={shift.id}>
                            <DropdownMenuTrigger asChild>
                              <button type="button" onClick={(e) => e.stopPropagation()}
                                className={cn("w-full text-left rounded px-1 py-0.5 text-xs leading-tight hover:opacity-80 transition-opacity cursor-pointer", shift.status === "draft" && "opacity-50")}
                                style={{ backgroundColor: shift.color + "28", borderLeft: `2px ${shift.status === "draft" ? "dashed" : "solid"} ${shift.color}`, color: shift.color }}>
                                <div className="truncate font-semibold">{shift.userName.split(" ")[0]}{shift.positionName && <span className="font-normal opacity-60 ml-1">· {shift.positionName}</span>}</div>
                                <div className="opacity-80">{shift.startTime}–{shift.endTime}</div>
                              </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="start">
                              <DropdownMenuItem onClick={() => openEdit(shift)}>Upraviť</DropdownMenuItem>
                              {shift.status === "draft" && (
                                <DropdownMenuItem onClick={() => startTransition(() => toggleShiftStatus(shift.id, "draft"))} disabled={isPending}>Publikovať</DropdownMenuItem>
                              )}
                              {shift.isCurrentUser && (
                                <DropdownMenuItem onClick={() => openReplacement(shift.id, formatShiftLabel(day.date, shift.startTime, shift.endTime))}>Požiadať o zastup</DropdownMenuItem>
                              )}
                              <DropdownMenuSeparator />
                              <DropdownMenuItem className="text-destructive" onClick={() => startTransition(() => deleteShift(shift.id))} disabled={isPending}>Odstrániť</DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        )
                      }
                      // Employee shift block
                      const clickable = shift.isCurrentUser && !isPast
                      return (
                        <div key={shift.id} className={cn("rounded px-1.5 py-0.5 text-xs leading-tight relative group/block", clickable && "font-semibold cursor-pointer hover:opacity-75 transition-opacity")}
                          style={{ backgroundColor: shift.color + "28", borderLeft: `3px solid ${shift.color}`, color: shift.color }}
                          onClick={clickable ? () => openReplacement(shift.id, formatShiftLabel(day.date, shift.startTime, shift.endTime)) : undefined}>
                          {clickable && (
                            <button type="button" className="absolute top-0.5 right-0.5 p-0.5 rounded opacity-0 group-hover/block:opacity-100 hover:bg-black/10 transition-opacity" title="Požiadať o zastup"
                              onClick={(e) => { e.stopPropagation(); openReplacement(shift.id, formatShiftLabel(day.date, shift.startTime, shift.endTime)) }}>
                              <ArrowLeftRight className="size-2.5" style={{ color: shift.color }} />
                            </button>
                          )}
                          <div className="truncate font-semibold pr-4">{shift.userName.split(" ")[0]}</div>
                          <div className="opacity-80">{shift.startTime}–{shift.endTime}</div>
                        </div>
                      )
                    })}
                    {day.openShifts.map((os) => {
                      const isFull = isAdmin ? os.claimedByUsers.length >= os.maxClaims : os.acceptedCount >= os.maxClaims
                      if (isFull) {
                        return os.claimedByUsers.map((u) => {
                          const isMe = u.userId === currentUserId
                          return (
                            <div key={`fc-${u.claimId}`}
                              className={cn("rounded px-1.5 py-0.5 text-xs leading-tight relative group/block", !isAdmin && isMe && "cursor-pointer hover:opacity-90")}
                              style={{ backgroundColor: u.color + "28", borderLeft: `3px solid ${u.color}`, color: u.color }}
                              onClick={!isAdmin && isMe ? () => openReplacement(os.id, formatShiftLabel(day.date, os.startTime, os.endTime)) : undefined}>
                              {!isAdmin && isMe && (
                                <button type="button" className="absolute top-0.5 right-0.5 p-0.5 rounded opacity-0 group-hover/block:opacity-100 hover:bg-black/10 transition-opacity" title="Požiadať o zastup"
                                  onClick={(e) => { e.stopPropagation(); openReplacement(os.id, formatShiftLabel(day.date, os.startTime, os.endTime)) }}>
                                  <ArrowLeftRight className="size-2.5" style={{ color: u.color }} />
                                </button>
                              )}
                              <div className="truncate font-semibold pr-4">{u.userName.split(" ")[0]}</div>
                              {os.positionName && <div className="opacity-60 text-[10px] truncate">{os.positionName}</div>}
                              <div className="opacity-80">{os.startTime}–{os.endTime}</div>
                            </div>
                          )
                        })
                      }
                      if (isAdmin) {
                        return (
                          <div key={os.id} className={cn("rounded border border-dashed border-muted-foreground/40 px-1 py-0.5 text-xs leading-tight bg-background group", os.status === "draft" && "opacity-70")}>
                            <div className="flex items-center justify-between gap-0.5">
                              <span className="truncate text-muted-foreground font-medium text-[10px]">
                                {os.positionName ?? "Neobsadená"} {os.maxClaims > 1 && `(${os.claimedByUsers.length}/${os.maxClaims})`}{os.status === "draft" && " · koncept"}
                              </span>
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <button className="p-0.5 rounded hover:bg-muted opacity-0 group-hover:opacity-100 transition-opacity"><Plus className="size-2.5 text-muted-foreground" /></button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  <DropdownMenuItem onClick={() => openEditOpenShift(os)}>Upraviť</DropdownMenuItem>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem className="text-destructive" onClick={() => startTransition(() => deleteShift(os.id))} disabled={isPending}>Odstrániť</DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </div>
                            <div className="opacity-60 text-[9px]">{os.startTime}–{os.endTime}</div>
                            {os.claimedByUsers.length > 0 && (
                              <div className="flex flex-wrap gap-0.5 mt-0.5">
                                {os.claimedByUsers.map((claim) => (
                                  <span key={claim.claimId} className="text-[9px] px-1 py-0.5 rounded" style={{ backgroundColor: claim.color + "20", color: claim.color }}>{claim.userName.split(" ")[0]}</span>
                                ))}
                              </div>
                            )}
                          </div>
                        )
                      }
                      // Employee open shift
                      const canClaimGrid = os.iMayClaim && !isPast
                      return (
                        <div key={os.id} className={cn("rounded border border-dashed border-muted-foreground/40 px-1.5 py-0.5 text-xs leading-tight bg-background", canClaimGrid && "cursor-pointer hover:border-primary/50 hover:bg-primary/5 transition-colors")}
                          onClick={canClaimGrid ? () => handleClaim(os.id) : undefined}>
                          <div className="flex items-center justify-between gap-0.5">
                            <span className="truncate text-muted-foreground font-medium">
                              {os.positionName ?? "Neobsadená"}
                              {os.maxClaims > 1 && <span className="ml-0.5 text-[10px] opacity-70">({os.acceptedCount}/{os.maxClaims})</span>}
                            </span>
                            {os.myClaimId && <Check className="size-2.5 text-green-600 shrink-0" />}
                          </div>
                          <div className="opacity-60">{os.startTime}–{os.endTime}</div>
                        </div>
                      )
                    })}
                    {(day.leaves ?? []).map((l, i) => (
                      <div key={`leave-${l.userId}-${i}`} className={cn("rounded px-1 py-0.5 text-[10px] leading-tight font-medium truncate", l.status === "approved" ? LEAVE_STYLES.approved : LEAVE_STYLES.pending)}>
                        {l.userName}{l.status === "pending" && " · čaká"}
                      </div>
                    ))}
                  </>
                )
                return (
                  <div key={day.date} className={cn("min-h-20 p-1 border-r last:border-r-0 group", !day.isCurrentMonth && "bg-muted/20", day.isToday && "bg-primary/5")}>
                    <div className="flex items-center justify-between mb-1 group/day">
                      <Link href={`${schedulePath}?month=${day.date.slice(0, 7)}&date=${day.date}`}
                        className={cn("text-xs font-medium w-5 h-5 flex items-center justify-center rounded-full hover:ring-2 hover:ring-primary/30 transition-shadow", day.isToday ? "bg-primary text-primary-foreground" : day.isCurrentMonth ? "text-foreground" : "text-muted-foreground")}
                        title={`Prejsť na ${day.date}`}>
                        {dayNum}
                      </Link>
                      {!isPast && day.isCurrentMonth && isAdmin && (
                        <button onClick={() => openCreateDialog(day.date)} className="opacity-0 group-hover/day:opacity-100 transition-opacity p-0.5 rounded hover:bg-muted" title="Nová zmena">
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
        let startHour: number, endHour: number
        if (businessHours && businessHours.size > 0) {
          const ranges: { start: number; end: number }[] = []
          businessHours.forEach((bh) => {
            if (!bh.isClosed && bh.openTime && bh.closeTime) {
              ranges.push({ start: Math.floor(timeToMinutes(bh.openTime) / 60), end: Math.ceil(timeToMinutes(bh.closeTime) / 60) })
            }
          })
          if (ranges.length > 0) { startHour = Math.min(...ranges.map((r) => r.start)); endHour = Math.max(...ranges.map((r) => r.end)) }
          else { startHour = 8; endHour = 22 }
        } else { startHour = 8; endHour = 22 }
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
                    <div className={cn("mx-auto mt-0.5 size-7 rounded-full flex items-center justify-center text-sm font-semibold", day.isToday ? "bg-primary text-primary-foreground" : "text-foreground")}>{dateObj.getDate()}</div>
                  </div>
                )
              })}
              <div className="border-l bg-muted/30 w-4 shrink-0" aria-hidden />
            </div>

            {/* Leave strips */}
            {(() => {
              const weekLeaves = new Map<string, { leave: CalendarLeave; days: string[] }>()
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
                        return (
                          <div key={key} className={cn("rounded px-1.5 py-0.5 text-[10px] leading-tight font-medium truncate", l.status === "approved" ? LEAVE_STYLES.approved : LEAVE_STYLES.pending)}>
                            {l.userName}{l.status === "pending" && " · čaká"}
                          </div>
                        )
                      })}
                    </div>
                  ))}
                  <div className="border-l" />
                </div>
              )
            })()}

            {/* Timeline body */}
            <div ref={timelineScrollRef} className={cn("grid overflow-y-auto overflow-x-hidden", gridCols)} style={{ maxHeight: visibleHeight, minHeight: Math.min(visibleHeight, totalHeight) }}>
              <div className="relative border-r" style={{ height: totalHeight }}>
                {hours.map((h) => (
                  <div key={h} className="absolute right-2 text-[10px] text-muted-foreground/60 tabular-nums select-none leading-none" style={{ top: PAD + (h - startHour) * HOUR_HEIGHT }}>{String(h).padStart(2, "0")}:00</div>
                ))}
              </div>

              {/* Day columns */}
              {currentWeek.map((day) => {
                const isPast = day.date < todayStr

                type TaggedShift = CalendarShift & { _type: "shift" }
                type TaggedOpen = OpenShift & { _type: "open" }
                type FilledClaim = { _type: "filled"; claimId: string; userId: string; userName: string; color: string; startTime: string; endTime: string; openShift: OpenShift }
                type TaggedItem = TaggedShift | TaggedOpen | FilledClaim

                const partialOpenShifts = day.openShifts.filter(os => isAdmin ? os.claimedByUsers.length < os.maxClaims : os.acceptedCount < os.maxClaims)
                const filledClaims: FilledClaim[] = day.openShifts
                  .filter(os => isAdmin ? os.claimedByUsers.length >= os.maxClaims : os.acceptedCount >= os.maxClaims)
                  .flatMap(os => os.claimedByUsers.map(u => ({
                    _type: "filled" as const, claimId: u.claimId, userId: u.userId, userName: u.userName, color: u.color, startTime: os.startTime, endTime: os.endTime, openShift: os,
                  })))

                const allItems: TaggedItem[] = [
                  ...day.shifts.map(s => ({ ...s, _type: "shift" as const })),
                  ...filledClaims,
                  ...partialOpenShifts.map(s => ({ ...s, _type: "open" as const })),
                ]
                const lanes = assignLanes(allItems)

                return (
                  <div key={day.date} data-day-col={day.date}
                    className={cn("relative border-l select-none", day.isToday && "bg-primary/5", !day.isCurrentMonth && "bg-muted/20", isAdmin && "cursor-crosshair")}
                    style={{ height: totalHeight }}
                    onMouseDown={isAdmin ? (e) => {
                      if (e.target === e.currentTarget || (e.target as HTMLElement).hasAttribute("data-grid-line"))
                        handleDragMouseDown(e, day.date, "create")
                    } : undefined}>
                    {hours.map((h) => (
                      <div key={h} data-grid-line className="absolute left-0 right-0 border-t border-muted/40 pointer-events-none" style={{ top: PAD + (h - startHour) * HOUR_HEIGHT }} />
                    ))}

                    <div className="absolute inset-0" style={{ pointerEvents: "none" }}>
                      {lanes.map(({ item, lane, totalLanes }) => {
                        const top = yPos(item.startTime)
                        const height = Math.max(hPos(item.startTime, item.endTime), 24)
                        const widthPct = 100 / totalLanes
                        const leftPct = (lane / totalLanes) * 100
                        const posStyle = { top, height, width: `calc(${widthPct}% - 4px)`, left: `calc(${leftPct}% + 2px)` }

                        if (item._type === "shift") {
                          const shift = item
                          if (isAdmin) {
                            const isDraft = shift.status === "draft"
                            return (
                              <div key={shift.id}
                                className={cn("absolute flex flex-col justify-start rounded-md px-1.5 py-1 text-sm overflow-hidden pointer-events-auto group/block cursor-grab", isDraft && "opacity-60")}
                                style={{ ...posStyle, backgroundColor: shift.color + "30", borderLeft: `3px ${isDraft ? "dashed" : "solid"} ${shift.color}`, color: shift.color }}
                                onMouseDown={(e) => handleDragMouseDown(e, day.date, "move", shift)}>
                                {/* Resize top handle */}
                                <div className="absolute top-0 left-0 right-0 h-2 cursor-ns-resize z-10" onMouseDown={(e) => { e.stopPropagation(); handleDragMouseDown(e, day.date, "resize-top", shift) }} />
                                <div className="font-semibold truncate leading-tight pr-5">{shift.userName}</div>
                                {shift.positionName && <div className="opacity-60 leading-tight text-xs truncate">{shift.positionName}</div>}
                                <div className="opacity-80 leading-tight text-xs">{shift.startTime}–{shift.endTime}{isDraft && " · koncept"}</div>
                                {/* Action buttons on hover */}
                                <div className="absolute top-0.5 right-0.5 flex items-center gap-0.5 opacity-0 group-hover/block:opacity-100 transition-opacity z-10">
                                  <button type="button" className="p-0.5 rounded hover:bg-black/10" title="Upraviť" onClick={(e) => { e.stopPropagation(); openEdit(shift) }}><Pencil className="size-3" /></button>
                                  <button type="button" className="p-0.5 rounded hover:bg-black/10 text-destructive" title="Odstrániť" onClick={(e) => { e.stopPropagation(); startTransition(() => deleteShift(shift.id)) }}><Trash2 className="size-3" /></button>
                                </div>
                                {/* Resize bottom handle */}
                                <div className="absolute bottom-0 left-0 right-0 h-2 cursor-ns-resize z-10" onMouseDown={(e) => { e.stopPropagation(); handleDragMouseDown(e, day.date, "resize-bottom", shift) }} />
                              </div>
                            )
                          }
                          // Employee shift block
                          const clickable = shift.isCurrentUser && !isPast
                          return (
                            <div key={shift.id}
                              className={cn("absolute flex flex-col justify-start rounded-md px-1.5 py-1 text-sm overflow-hidden pointer-events-auto group/block", clickable && "cursor-pointer hover:opacity-80 transition-opacity")}
                              style={{ ...posStyle, backgroundColor: shift.color + "30", borderLeft: `3px solid ${shift.color}`, color: shift.color }}
                              onClick={clickable ? () => openReplacement(shift.id, formatShiftLabel(day.date, shift.startTime, shift.endTime)) : undefined}>
                              {clickable && (
                                <button type="button" className="absolute top-0.5 right-0.5 p-0.5 rounded opacity-0 group-hover/block:opacity-100 hover:bg-black/10 transition-opacity z-10" title="Požiadať o zastup"
                                  onClick={(e) => { e.stopPropagation(); openReplacement(shift.id, formatShiftLabel(day.date, shift.startTime, shift.endTime)) }}>
                                  <ArrowLeftRight className="size-3" style={{ color: shift.color }} />
                                </button>
                              )}
                              <div className="font-semibold truncate leading-tight pr-5">{shift.userName}</div>
                              <div className="opacity-80 leading-tight text-xs">{shift.startTime}–{shift.endTime}</div>
                            </div>
                          )
                        }

                        if (item._type === "open") {
                          const os = item
                          if (isAdmin) {
                            const isDraft = os.status === "draft"
                            return (
                              <div key={os.id}
                                className={cn("absolute flex flex-col justify-start rounded-md border border-dashed border-muted-foreground/30 px-1.5 py-1 text-sm bg-muted/10 overflow-hidden pointer-events-auto group/block", isDraft && "opacity-60")}
                                style={posStyle}>
                                <div className="font-medium text-muted-foreground leading-tight">
                                  {os.positionName ?? "Neobsadená"}
                                  {os.maxClaims > 1 && <span className="ml-0.5 opacity-70">({os.claimedByUsers.length}/{os.maxClaims})</span>}
                                  {isDraft && <span className="ml-1 text-[10px] opacity-70">· koncept</span>}
                                </div>
                                <div className="text-muted-foreground/70 text-xs leading-tight">{os.startTime}–{os.endTime}</div>
                                {os.claimedByUsers.length > 0 && (
                                  <div className="flex flex-wrap gap-0.5 mt-0.5">
                                    {os.claimedByUsers.map((u) => (
                                      <span key={u.claimId} className="text-xs px-1 rounded-full flex items-center gap-0.5" style={{ backgroundColor: u.color + "20", color: u.color }}>
                                        {u.userName.split(" ")[0]}
                                        <button onClick={() => startTransition(() => adminRemoveClaim(u.claimId))} className="hover:opacity-60" title="Odobrať">×</button>
                                      </span>
                                    ))}
                                  </div>
                                )}
                                <div className="absolute top-0.5 right-0.5 flex items-center gap-0.5 opacity-0 group-hover/block:opacity-100 transition-opacity z-10">
                                  <button type="button" className="p-0.5 rounded hover:bg-black/10" title="Upraviť" onClick={(e) => { e.stopPropagation(); openEditOpenShift(os) }}><Pencil className="size-3 text-muted-foreground" /></button>
                                  <button type="button" className="p-0.5 rounded hover:bg-black/10" title="Odstrániť" onClick={(e) => { e.stopPropagation(); startTransition(() => deleteShift(os.id)) }}><Trash2 className="size-3 text-destructive" /></button>
                                </div>
                              </div>
                            )
                          }
                          // Employee open shift
                          const canClaimTl = os.iMayClaim && !isPast
                          const isClaimed = !!os.myClaimId
                          return (
                            <div key={os.id}
                              className={cn("absolute flex flex-col justify-start rounded-md border border-dashed border-muted-foreground/30 px-1.5 py-1 text-sm bg-muted/10 overflow-hidden pointer-events-auto", canClaimTl && "cursor-pointer hover:border-primary/50 hover:bg-primary/5 transition-colors")}
                              style={posStyle} onClick={canClaimTl ? () => handleClaim(os.id) : undefined}>
                              <div className="font-medium text-muted-foreground leading-tight">
                                {os.positionName ?? "Neobsadená"}
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
                            <div key={`fc-${fc.claimId}`}
                              className={cn("absolute flex flex-col justify-start rounded-md px-1.5 py-1 text-sm overflow-hidden pointer-events-auto group/block", !isAdmin && isMe && "cursor-pointer hover:opacity-80 transition-opacity")}
                              style={{ ...posStyle, backgroundColor: fc.color + "30", borderLeft: `3px solid ${fc.color}`, color: fc.color }}
                              onClick={!isAdmin && isMe ? () => openReplacement(fc.openShift.id, formatShiftLabel(day.date, fc.startTime, fc.endTime)) : undefined}>
                              {!isAdmin && isMe && (
                                <button type="button" className="absolute top-0.5 right-0.5 p-0.5 rounded opacity-0 group-hover/block:opacity-100 hover:bg-black/10 transition-opacity z-10" title="Požiadať o zastup"
                                  onClick={(e) => { e.stopPropagation(); openReplacement(fc.openShift.id, formatShiftLabel(day.date, fc.startTime, fc.endTime)) }}>
                                  <ArrowLeftRight className="size-3" style={{ color: fc.color }} />
                                </button>
                              )}
                              <div className="font-semibold truncate leading-tight pr-5">{fc.userName}</div>
                              {fc.openShift.positionName && <div className="opacity-60 leading-tight text-xs truncate">{fc.openShift.positionName}</div>}
                              <div className="opacity-80 leading-tight text-xs">{fc.startTime}–{fc.endTime}</div>
                              {!isAdmin && isMe && <div className="text-green-600 flex items-center gap-0.5 text-xs mt-0.5"><Check className="size-2.5" /> Prihlásený</div>}
                            </div>
                          )
                        }
                        return null
                      })}

                      {/* Drag preview ghost */}
                      {dragPreview && dragPreview.date === day.date && (
                        <div className="absolute left-1 right-1 rounded-md border-2 border-dashed border-primary/60 bg-primary/10 pointer-events-none z-20"
                          style={{ top: yPos(minutesToTime(dragPreview.topMinutes)), height: Math.max(((dragPreview.bottomMinutes - dragPreview.topMinutes) / 60) * HOUR_HEIGHT, 12) }}>
                          <div className="px-1.5 py-0.5 text-[10px] font-medium text-primary">{minutesToTime(dragPreview.topMinutes)}–{minutesToTime(dragPreview.bottomMinutes)}</div>
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

      {/* ── Nearest open shift banner (employee only) ── */}
      {!isAdmin && nextOpenShift && (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-primary/20 bg-primary/5 px-4 py-3 cursor-pointer hover:bg-primary/10 transition-colors"
          onClick={() => {
            const idx = weeks.findIndex((w) => w.some((d) => d.date === nextOpenShift.date))
            if (idx >= 0) { setWeekIdx(idx); setView("week") }
          }}>
          <div className="flex flex-col gap-0.5">
            <div className="text-sm font-semibold text-primary">Neobsadená zmena k dispozícii</div>
            <div className="text-sm text-muted-foreground capitalize">
              {nextOpenShift.dateLabel} · {nextOpenShift.startTime}–{nextOpenShift.endTime}
              {nextOpenShift.maxClaims > 1 && ` · ${nextOpenShift.maxClaims - nextOpenShift.acceptedCount} voľ. miest`}
            </div>
          </div>
          <Button size="sm" onClick={(e) => { e.stopPropagation(); handleClaim(nextOpenShift.id) }} disabled={isPending}>Prihlásiť sa</Button>
        </div>
      )}

      <LeaveRequestDialog open={leaveDialogOpen} onOpenChange={setLeaveDialogOpen} colleagues={allEmployees} />
      {!isAdmin && (
        <NewReplacementDialog
          open={!!replacementCtx}
          onOpenChange={(open) => { if (!open) setReplacementCtx(null) }}
          colleagues={currentUserId ? allEmployees.filter((e) => e.id !== currentUserId) : allEmployees}
          initialShiftId={replacementCtx?.shiftId}
          initialShiftLabel={replacementCtx?.shiftLabel}
        />
      )}
      {isAdmin && (
        <>
          <NewReplacementDialog
            open={!!replacementCtx}
            onOpenChange={(open) => { if (!open) setReplacementCtx(null) }}
            colleagues={currentUserId ? allEmployees.filter((e) => e.id !== currentUserId) : allEmployees}
            initialShiftId={replacementCtx?.shiftId}
            initialShiftLabel={replacementCtx?.shiftLabel}
          />
          <ShiftDialog
            open={createDialogOpen}
            onOpenChange={(open) => { if (!open) closeCreateDialog() }}
            employees={allEmployees}
            positions={positions}
            shift={editing}
            defaultDate={createDate}
            defaultStartTime={createStartTime}
            defaultEndTime={createEndTime}
            businessHours={businessHours}
          />
        </>
      )}
    </div>
  )
}
