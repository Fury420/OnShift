"use client"

import { useState, useEffect, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Palmtree } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { DatePicker, DateRangePicker } from "@/components/ui/date-picker"
import { createShift, createShiftsBatch, updateShift } from "@/app/actions/schedule"
import { getApprovedLeavesInRange } from "@/app/actions/leaves"
import { cn } from "@/lib/utils"

// "__open__" = neobsadená zmena (žiadny zamestnanec)
const OPEN_SHIFT_VALUE = "__open__"

const DAY_LABELS = [
  { value: 1, label: "Po" },
  { value: 2, label: "Ut" },
  { value: 3, label: "St" },
  { value: 4, label: "Št" },
  { value: 5, label: "Pi" },
  { value: 6, label: "So" },
  { value: 0, label: "Ne" },
]

export interface ShiftForEdit {
  id: string
  userId: string | null
  date: string
  startTime: string
  endTime: string
  note: string | null
  maxClaims: number
}

export interface EmployeeOption {
  id: string
  name: string
}

interface ShiftDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  employees: EmployeeOption[]
  shift?: ShiftForEdit
  defaultDate?: string
  defaultStartTime?: string
  defaultEndTime?: string
  fixedUserId?: string
}

function toDateStr(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${y}-${m}-${day}`
}

export function ShiftDialog({ open, onOpenChange, employees, shift, defaultDate, defaultStartTime, defaultEndTime, fixedUserId }: ShiftDialogProps) {
  const isEdit = !!shift
  const router = useRouter()

  const [userId, setUserId] = useState("")
  const [frequency, setFrequency] = useState<"once" | "weekly">("once")
  const [date, setDate] = useState("")
  const [selectedDays, setSelectedDays] = useState<number[]>([])
  const [validFrom, setValidFrom] = useState("")
  const [validUntil, setValidUntil] = useState("")
  const [startTime, setStartTime] = useState("")
  const [endTime, setEndTime] = useState("")
  const [maxClaims, setMaxClaims] = useState(1)
  const [error, setError] = useState("")
  const [isPending, startTransition] = useTransition()
  const [leavesInRange, setLeavesInRange] = useState<{ startDate: string; endDate: string; type: string }[]>([])

  const isOpenShift = fixedUserId ? false : userId === OPEN_SHIFT_VALUE
  const hasLeaveConflict = !isOpenShift && leavesInRange.length > 0

  const periodFrom = frequency === "once" ? date : validFrom
  const periodTo = frequency === "once" ? date : validUntil

  useEffect(() => {
    if (!open || !userId || userId === OPEN_SHIFT_VALUE || !periodFrom || !periodTo) {
      setLeavesInRange([])
      return
    }
    let cancelled = false
    getApprovedLeavesInRange(userId, periodFrom, periodTo).then((list) => {
      if (!cancelled) setLeavesInRange(list)
    }).catch(() => { if (!cancelled) setLeavesInRange([]) })
    return () => { cancelled = true }
  }, [open, userId, periodFrom, periodTo])

  useEffect(() => {
    if (open) {
      if (shift) {
        setUserId(fixedUserId ?? (shift.userId || OPEN_SHIFT_VALUE))
        setFrequency("once")
        setDate(shift.date ?? "")
        setSelectedDays([])
        setValidFrom("")
        setValidUntil("")
        setStartTime(shift.startTime?.slice(0, 5) ?? "16:00")
        setEndTime(shift.endTime?.slice(0, 5) ?? "21:00")
        setMaxClaims(shift.maxClaims ?? 1)
      } else {
        setUserId(fixedUserId ?? OPEN_SHIFT_VALUE)
        setFrequency("once")
        setDate(defaultDate ?? "")
        setSelectedDays([])
        setValidFrom("")
        setValidUntil("")
        setStartTime(defaultStartTime ?? "16:00")
        setEndTime(defaultEndTime ?? "21:00")
        setMaxClaims(1)
      }
      setError("")
    }
  }, [open, shift, defaultDate, defaultStartTime, defaultEndTime, fixedUserId])

  function toggleDay(day: number) {
    setSelectedDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day],
    )
  }

  function setThisWeek() {
    const now = new Date()
    const dow = now.getDay()
    const monday = new Date(now)
    monday.setDate(now.getDate() - (dow === 0 ? 6 : dow - 1))
    const sunday = new Date(monday)
    sunday.setDate(monday.getDate() + 6)
    setValidFrom(toDateStr(monday))
    setValidUntil(toDateStr(sunday))
  }

  function setThisMonth() {
    const now = new Date()
    const y = now.getFullYear()
    const m = now.getMonth()
    setValidFrom(`${y}-${String(m + 1).padStart(2, "0")}-01`)
    const lastDay = new Date(y, m + 1, 0).getDate()
    setValidUntil(`${y}-${String(m + 1).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`)
  }

  function setNextMonth() {
    const now = new Date()
    const next = new Date(now.getFullYear(), now.getMonth() + 1, 1)
    const y = next.getFullYear()
    const m = next.getMonth()
    setValidFrom(`${y}-${String(m + 1).padStart(2, "0")}-01`)
    const lastDay = new Date(y, m + 1, 0).getDate()
    setValidUntil(`${y}-${String(m + 1).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`)
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError("")
    if (hasLeaveConflict) {
      setError("Tento zamestnanec v daných termínoch nie je dostupný. Zmenu nie je možné vytvoriť.")
      return
    }

    const resolvedUserId = fixedUserId ? fixedUserId : (userId === OPEN_SHIFT_VALUE ? null : userId)

    if (frequency === "once" && !date) {
      setError("Vyberte dátum."); return
    }
    if (frequency === "weekly" && (!validFrom || !validUntil)) {
      setError("Vyberte obdobie."); return
    }
    if (!startTime || !endTime) {
      setError("Zadajte čas začiatku a konca."); return
    }

    startTransition(async () => {
      try {
        if (isEdit) {
          await updateShift(shift.id, {
            userId: resolvedUserId,
            date,
            startTime,
            endTime,
            maxClaims: resolvedUserId ? 1 : maxClaims,
          })
        } else if (frequency === "once") {
          await createShift({
            userId: resolvedUserId,
            date,
            startTime,
            endTime,
            maxClaims: resolvedUserId ? 1 : maxClaims,
          })
        } else {
          const days = selectedDays.length > 0 ? selectedDays : [0, 1, 2, 3, 4, 5, 6]
          await createShiftsBatch({
            userId: resolvedUserId,
            dateFrom: validFrom,
            dateTo: validUntil,
            days,
            startTime,
            endTime,
            maxClaims: resolvedUserId ? 1 : maxClaims,
          })
        }
        router.refresh()
        onOpenChange(false)
      } catch (err) {
        setError(err instanceof Error ? err.message : "Nastala chyba")
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Upraviť zmenu" : "Nová zmena"}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {/* Frequency tabs — only for new shifts */}
          {!isEdit && (
            <Tabs value={frequency} onValueChange={(v) => setFrequency(v as typeof frequency)}>
              <TabsList className="w-full">
                <TabsTrigger value="once" className="flex-1">Jednorazová</TabsTrigger>
                <TabsTrigger value="weekly" className="flex-1">Opakujúca sa</TabsTrigger>
              </TabsList>
            </Tabs>
          )}

          {/* Employee selector */}
          {!fixedUserId && (
            <div className="flex flex-col gap-1.5">
              <Label>Zamestnanec</Label>
              <div className="flex gap-3 items-start">
                <Select value={userId} onValueChange={setUserId}>
                  <SelectTrigger className="flex-1 min-w-0">
                    <SelectValue placeholder="Vyberte zamestnanca" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={OPEN_SHIFT_VALUE}>Neobsadená zmena</SelectItem>
                    {employees.map((e) => (
                      <SelectItem key={e.id} value={e.id}>
                        {e.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {leavesInRange.length > 0 && (
                  <div className="flex items-center gap-1.5 shrink-0 text-amber-600 dark:text-amber-500 text-sm">
                    <Palmtree className="size-4" />
                    <span className="whitespace-nowrap">
                      {leavesInRange.map((l) => {
                        const from = l.startDate.split("-")
                        const to = l.endDate.split("-")
                        const fromStr = from.length === 3 ? `${parseInt(from[2], 10)}. ${parseInt(from[1], 10)}. ${from[0]}` : l.startDate
                        const toStr = to.length === 3 ? `${parseInt(to[2], 10)}. ${parseInt(to[1], 10)}. ${to[0]}` : l.endDate
                        return fromStr === toStr ? fromStr : `${fromStr} – ${toStr}`
                      }).join(", ")}
                    </span>
                  </div>
                )}
              </div>
              {hasLeaveConflict && (
                <p className="text-sm text-destructive font-medium">
                  Tento zamestnanec v daných termínoch nie je dostupný. Zmenu nie je možné vytvoriť.
                </p>
              )}
            </div>
          )}

          {/* Date — once */}
          {frequency === "once" && (
            <DatePicker value={date} onChange={setDate} label="Dátum" />
          )}

          {/* Days — weekly */}
          {frequency === "weekly" && (
            <div className="flex flex-col gap-1.5">
              <Label>Dni v týždni</Label>
              <div className="flex gap-1">
                {DAY_LABELS.map(({ value, label }) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => toggleDay(value)}
                    className={cn(
                      "flex-1 rounded-md border py-1.5 text-sm font-medium transition-colors",
                      selectedDays.includes(value)
                        ? "bg-muted text-foreground border-border"
                        : "bg-transparent text-muted-foreground/50 border-border/50 hover:bg-muted/50",
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Date range — weekly */}
          {frequency !== "once" && (
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <Label>Obdobie</Label>
                <div className="flex gap-1">
                  <Button type="button" variant="outline" size="sm" className="h-7 text-xs" onClick={setThisWeek}>
                    Tento týždeň
                  </Button>
                  <Button type="button" variant="outline" size="sm" className="h-7 text-xs" onClick={setThisMonth}>
                    Tento mesiac
                  </Button>
                  <Button type="button" variant="outline" size="sm" className="h-7 text-xs" onClick={setNextMonth}>
                    Budúci mesiac
                  </Button>
                </div>
              </div>
              <DateRangePicker
                valueFrom={validFrom}
                valueTo={validUntil}
                onChangeFrom={setValidFrom}
                onChangeTo={setValidUntil}
              />
            </div>
          )}

          {/* Start/end time */}
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="startTime">Začiatok</Label>
              <Input
                id="startTime"
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                required
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="endTime">Koniec</Label>
              <Input
                id="endTime"
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                required
              />
            </div>
          </div>

          {/* Max claims — only for open shifts */}
          {isOpenShift && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="maxClaims">Počet miest</Label>
              <Input
                id="maxClaims"
                type="number"
                min={1}
                max={20}
                value={maxClaims}
                onChange={(e) => setMaxClaims(Math.max(1, parseInt(e.target.value) || 1))}
                className="w-24"
              />
            </div>
          )}

          {error && <p className="text-sm text-destructive">{error}</p>}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Zrušiť
            </Button>
            <Button type="submit" disabled={isPending || hasLeaveConflict}>
              {isPending ? "Ukladám…" : isEdit ? "Uložiť" : "Vytvoriť"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
