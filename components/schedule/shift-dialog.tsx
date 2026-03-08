"use client"

import { useState, useEffect, useTransition } from "react"
import { useRouter } from "next/navigation"
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
import { Checkbox } from "@/components/ui/checkbox"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { DatePicker, DateRangePicker } from "@/components/ui/date-picker"
import { createShiftRule, updateShiftRule } from "@/app/actions/shift-rules"
import { cn } from "@/lib/utils"

// "__open__" = voľná zmena (žiadny zamestnanec)
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

export interface ShiftRuleForEdit {
  id: string
  userId: string
  frequency: "once" | "weekly" | "monthly"
  date: string | null
  days: string | null
  dayOfMonth: string | null
  validFrom: string | null
  validUntil: string | null
  startTime: string | null
  endTime: string | null
  allDay: boolean
  note: string | null
}

export interface EmployeeOption {
  id: string
  name: string
}

// Keep old interface name for backwards compatibility with calendar
export type ShiftForEdit = ShiftRuleForEdit

interface ShiftDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  employees: EmployeeOption[]
  shift?: ShiftRuleForEdit
  defaultDate?: string
  defaultStartTime?: string
  defaultEndTime?: string
  /** Ak je nastavené, výber zamestnanca sa nezobrazí a zmena sa vždy priradí tomuto používateľovi (napr. v kalendári len pre prihláseného). */
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
  const [allDay, setAllDay] = useState(true)
  const [error, setError] = useState("")
  const [isPending, startTransition] = useTransition()

  useEffect(() => {
    if (open) {
      if (shift) {
        setUserId(fixedUserId ?? (shift.userId || OPEN_SHIFT_VALUE))
        setFrequency(shift.frequency === "monthly" ? "weekly" : shift.frequency)
        setDate(shift.date ?? "")
        setSelectedDays(shift.days ? shift.days.split(",").map(Number) : [])
        setValidFrom(shift.validFrom ?? "")
        setValidUntil(shift.validUntil ?? "")
        setStartTime(shift.startTime?.slice(0, 5) ?? "")
        setEndTime(shift.endTime?.slice(0, 5) ?? "")
        setAllDay(shift.allDay)
      } else {
        setUserId(fixedUserId ?? employees[0]?.id ?? "")
        setFrequency("once")
        setDate(defaultDate ?? "")
        setSelectedDays([])
        setValidFrom("")
        setValidUntil("")
        setStartTime(defaultStartTime ?? "16:00")
        setEndTime(defaultEndTime ?? "21:00")
        setAllDay(!defaultStartTime)
      }
      setError("")
    }
  }, [open, shift, defaultDate, defaultStartTime, defaultEndTime, employees, fixedUserId])

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

    const resolvedUserId = fixedUserId ? fixedUserId : (userId === OPEN_SHIFT_VALUE ? null : userId)

    startTransition(async () => {
      try {
        if (isEdit) {
          await updateShiftRule(shift.id, {
            userId: resolvedUserId,
            frequency,
            date: frequency === "once" ? date : null,
            days: frequency === "weekly" ? (selectedDays.length > 0 ? selectedDays.join(",") : "0,1,2,3,4,5,6") : null,
            dayOfMonth: null,
            validFrom: frequency !== "once" ? validFrom || null : null,
            validUntil: frequency !== "once" ? validUntil || null : null,
            startTime: allDay ? null : startTime,
            endTime: allDay ? null : endTime,
            allDay,
            note: null,
          })
        } else {
          await createShiftRule({
            userId: resolvedUserId,
            frequency,
            date: frequency === "once" ? date : undefined,
            days: frequency === "weekly" ? (selectedDays.length > 0 ? selectedDays.join(",") : "0,1,2,3,4,5,6") : undefined,
            validFrom: frequency !== "once" ? validFrom || undefined : undefined,
            validUntil: frequency !== "once" ? validUntil || undefined : undefined,
            startTime: allDay ? undefined : startTime,
            endTime: allDay ? undefined : endTime,
            allDay,
            note: undefined,
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
          <DialogTitle>{isEdit ? "Upraviť pravidlo zmeny" : "Nová zmena"}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {/* Frequency tabs */}
          {!isEdit && (
            <Tabs value={frequency} onValueChange={(v) => setFrequency(v as typeof frequency)}>
              <TabsList className="w-full">
                <TabsTrigger value="once" className="flex-1">Jednorazová</TabsTrigger>
                <TabsTrigger value="weekly" className="flex-1">Opakujúca sa</TabsTrigger>
              </TabsList>
            </Tabs>
          )}

          {isEdit && (
            <div className="flex flex-col gap-1.5">
              <Label>Typ</Label>
              <Select value={frequency} onValueChange={(v) => setFrequency(v as typeof frequency)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="once">Jednorazová</SelectItem>
                  <SelectItem value="weekly">Opakujúca sa</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Employee — skryté ak je zmena len pre prihláseného (kalendár) */}
          {!fixedUserId && (
            <div className="flex flex-col gap-1.5">
              <Label>Zamestnanec</Label>
              <Select value={userId} onValueChange={setUserId}>
                <SelectTrigger>
                  <SelectValue placeholder="Vyberte zamestnanca" />
                </SelectTrigger>
                <SelectContent>
                  {employees.map((e) => (
                    <SelectItem key={e.id} value={e.id}>
                      {e.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
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

          {/* Valid from/until — recurring */}
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

          {/* All day checkbox */}
          <div className="flex items-center gap-2">
            <Checkbox
              id="allDay"
              checked={allDay}
              onCheckedChange={(c) => setAllDay(c === true)}
            />
            <Label htmlFor="allDay" className="text-sm font-normal cursor-pointer">
              Celý deň
            </Label>
          </div>

          {/* Start/end time */}
          {!allDay && (
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
          )}

          {error && <p className="text-sm text-destructive">{error}</p>}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Zrušiť
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Ukladám…" : isEdit ? "Uložiť" : "Vytvoriť"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
