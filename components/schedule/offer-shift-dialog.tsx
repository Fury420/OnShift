"use client"

import { useState, useEffect, useTransition } from "react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Checkbox } from "@/components/ui/checkbox"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { DatePicker, DateRangePicker } from "@/components/ui/date-picker"
import { createShiftRule } from "@/app/actions/shift-rules"
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

function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  defaultDate?: string
  defaultStartTime?: string
  defaultEndTime?: string
}

export function OfferShiftDialog({ open, onOpenChange, defaultDate, defaultStartTime, defaultEndTime }: Props) {
  const [frequency, setFrequency] = useState<"once" | "weekly">("once")
  const [date, setDate] = useState("")
  const [selectedDays, setSelectedDays] = useState<number[]>([])
  const [validFrom, setValidFrom] = useState("")
  const [validUntil, setValidUntil] = useState("")
  const [startTime, setStartTime] = useState("16:00")
  const [endTime, setEndTime] = useState("21:00")
  const [allDay, setAllDay] = useState(true)
  const [note, setNote] = useState("")
  const [error, setError] = useState("")
  const [isPending, startTransition] = useTransition()

  useEffect(() => {
    if (open) {
      setFrequency("once")
      setDate(defaultDate ?? "")
      setSelectedDays([])
      setValidFrom("")
      setValidUntil("")
      setStartTime(defaultStartTime ?? "16:00")
      setEndTime(defaultEndTime ?? "21:00")
      setAllDay(!defaultStartTime)
      setNote("")
      setError("")
    }
  }, [open, defaultDate, defaultStartTime, defaultEndTime])

  function toggleDay(day: number) {
    setSelectedDays((prev) => prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day])
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

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError("")

    if (frequency === "once" && !date) {
      setError("Vyberte dátum."); return
    }
    if (frequency === "weekly" && selectedDays.length === 0) {
      setError("Vyberte aspoň jeden deň v týždni."); return
    }
    if (frequency === "weekly" && (!validFrom || !validUntil)) {
      setError("Vyberte obdobie platnosti."); return
    }

    startTransition(async () => {
      try {
        await createShiftRule({
          userId: null,
          frequency,
          date: frequency === "once" ? date : undefined,
          days: frequency === "weekly" ? selectedDays.join(",") : undefined,
          validFrom: frequency !== "once" ? validFrom : undefined,
          validUntil: frequency !== "once" ? validUntil : undefined,
          startTime: allDay ? undefined : startTime,
          endTime: allDay ? undefined : endTime,
          allDay,
          note: note || undefined,
        })
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
          <DialogTitle>Ponuka zmeny</DialogTitle>
          <p className="text-sm text-muted-foreground">
            Vytvorí voľnú zmenu, ktorú si zamestnanci môžu obsadiť.
          </p>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <Tabs value={frequency} onValueChange={(v) => setFrequency(v as typeof frequency)}>
            <TabsList className="w-full">
              <TabsTrigger value="once" className="flex-1">Jednorazová</TabsTrigger>
              <TabsTrigger value="weekly" className="flex-1">Opakujúca sa</TabsTrigger>
            </TabsList>
          </Tabs>

          {frequency === "once" && (
            <DatePicker value={date} onChange={setDate} label="Dátum" />
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
            </>
          )}

          <div className="flex items-center gap-2">
            <Checkbox
              id="offerAllDay"
              checked={allDay}
              onCheckedChange={(c) => setAllDay(c === true)}
            />
            <Label htmlFor="offerAllDay" className="text-sm font-normal cursor-pointer">
              Celý deň (podľa otváracích hodín)
            </Label>
          </div>

          {!allDay && (
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="offerStartTime">Začiatok</Label>
                <Input id="offerStartTime" type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} required />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="offerEndTime">Koniec</Label>
                <Input id="offerEndTime" type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} required />
              </div>
            </div>
          )}

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="offerNote">Poznámka (nepovinná)</Label>
            <Textarea id="offerNote" value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="Napr. potrebujeme výpomoc na rannú zmenu…" />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Zrušiť</Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Vytváram…" : "Vytvoriť ponuku"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
