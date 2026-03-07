"use client"

import { useState, useEffect, useTransition } from "react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { DatePicker, DateRangePicker } from "@/components/ui/date-picker"
import { requestShift } from "@/app/actions/schedule"
import { requestShiftRule } from "@/app/actions/shift-rules"
import { toast } from "sonner"
import { cn } from "@/lib/utils"

const DAY_LABELS = [
  { value: 1, label: "Po" },
  { value: 2, label: "Ut" },
  { value: 3, label: "St" },
  { value: 4, label: "Št" },
  { value: 5, label: "Pi" },
  { value: 6, label: "So" },
  { value: 0, label: "Ne" },
]

interface RequestShiftDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  date?: string // YYYY-MM-DD – predvyplnený dátum pre jednorazovú
  defaultStartTime?: string
  defaultEndTime?: string
}

function defaultTimes(dateStr: string) {
  const [y, m, d] = dateStr.split("-").map(Number)
  const day = new Date(y, m - 1, d).getDay()
  const isWeekend = day === 5 || day === 6 || day === 0
  return { start: isWeekend ? "15:00" : "16:00", end: "21:00" }
}

function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}

export function RequestShiftDialog({ open, onOpenChange, date: initialDate, defaultStartTime, defaultEndTime }: RequestShiftDialogProps) {
  const [frequency, setFrequency] = useState<"once" | "weekly">("once")
  const [date, setDate] = useState(initialDate ?? "")
  const [selectedDays, setSelectedDays] = useState<number[]>([])
  const [validFrom, setValidFrom] = useState("")
  const [validUntil, setValidUntil] = useState("")
  const [startTime, setStartTime] = useState("16:00")
  const [endTime, setEndTime] = useState("21:00")
  const [allDay, setAllDay] = useState(false)
  const [error, setError] = useState("")
  const [isPending, startTransition] = useTransition()

  useEffect(() => {
    if (open) {
      setFrequency("once")
      setDate(initialDate ?? "")
      setSelectedDays([])
      setValidFrom("")
      setValidUntil("")
      const { start, end } = initialDate ? defaultTimes(initialDate) : { start: "16:00", end: "21:00" }
      setStartTime(defaultStartTime ?? start)
      setEndTime(defaultEndTime ?? end)
      setAllDay(false)
      setError("")
    }
  }, [open, initialDate, defaultStartTime, defaultEndTime])

  function toggleDay(day: number) {
    setSelectedDays((prev) => prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day])
  }

  function setThisMonth() {
    const now = new Date()
    const y = now.getFullYear(), m = now.getMonth()
    setValidFrom(`${y}-${String(m + 1).padStart(2, "0")}-01`)
    const lastDay = new Date(y, m + 1, 0).getDate()
    setValidUntil(`${y}-${String(m + 1).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`)
  }

  function setNextMonth() {
    const now = new Date()
    const next = new Date(now.getFullYear(), now.getMonth() + 1, 1)
    const y = next.getFullYear(), m = next.getMonth()
    setValidFrom(`${y}-${String(m + 1).padStart(2, "0")}-01`)
    const lastDay = new Date(y, m + 1, 0).getDate()
    setValidUntil(`${y}-${String(m + 1).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`)
  }

  const dateLabel = date
    ? new Date(date + "T12:00:00").toLocaleDateString("sk-SK", { weekday: "long", day: "numeric", month: "long" })
    : ""

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError("")

    if (frequency === "weekly" && selectedDays.length === 0) {
      setError("Vyberte aspoň jeden deň v týždni.")
      return
    }
    if (frequency === "weekly" && (!validFrom || !validUntil)) {
      setError("Vyberte obdobie platnosti.")
      return
    }

    startTransition(async () => {
      try {
        if (frequency === "once") {
          await requestShift({ date, startTime, endTime, note: undefined })
        } else {
          await requestShiftRule({
            frequency: "weekly",
            days: selectedDays.join(","),
            validFrom,
            validUntil,
            startTime: allDay ? undefined : startTime,
            endTime: allDay ? undefined : endTime,
            allDay,
            note: undefined,
          })
        }
        toast.success("Požiadavka odoslaná — čaká na schválenie")
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
          <DialogTitle>Požiadať o zmenu</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <Tabs value={frequency} onValueChange={(v) => setFrequency(v as typeof frequency)}>
            <TabsList className="w-full">
              <TabsTrigger value="once" className="flex-1">Jednorazová</TabsTrigger>
              <TabsTrigger value="weekly" className="flex-1">Opakujúca sa</TabsTrigger>
            </TabsList>
          </Tabs>

          {frequency === "once" && (
            <>
              {dateLabel ? (
                <p className="text-sm text-muted-foreground capitalize">{dateLabel}</p>
              ) : (
                <DatePicker value={date} onChange={setDate} label="Dátum" />
              )}
            </>
          )}

          {frequency === "weekly" && (
            <>
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

              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <Label>Obdobie</Label>
                  <div className="flex gap-1">
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
            </>
          )}

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
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Zrušiť</Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Odosielajem…" : "Požiadať"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
