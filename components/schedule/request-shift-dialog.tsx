"use client"

import { useState, useEffect, useTransition } from "react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { requestShift } from "@/app/actions/schedule"
import { toast } from "sonner"

interface RequestShiftDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  date: string // YYYY-MM-DD
  defaultStartTime?: string
  defaultEndTime?: string
}

function defaultTimes(dateStr: string) {
  const [y, m, d] = dateStr.split("-").map(Number)
  const day = new Date(y, m - 1, d).getDay()
  const isWeekend = day === 5 || day === 6 || day === 0
  return { start: isWeekend ? "15:00" : "16:00", end: "21:00" }
}

export function RequestShiftDialog({ open, onOpenChange, date, defaultStartTime, defaultEndTime }: RequestShiftDialogProps) {
  const [startTime, setStartTime] = useState("")
  const [endTime, setEndTime] = useState("")
  const [note, setNote] = useState("")
  const [error, setError] = useState("")
  const [isPending, startTransition] = useTransition()

  useEffect(() => {
    if (open && date) {
      const { start, end } = defaultTimes(date)
      setStartTime(defaultStartTime ?? start)
      setEndTime(defaultEndTime ?? end)
      setNote("")
      setError("")
    }
  }, [open, date, defaultStartTime, defaultEndTime])

  const dateLabel = date
    ? new Date(date + "T12:00:00").toLocaleDateString("sk-SK", { weekday: "long", day: "numeric", month: "long" })
    : ""

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError("")
    startTransition(async () => {
      try {
        await requestShift({ date, startTime, endTime, note })
        toast.success("Požiadavka odoslaná — čaká na schválenie")
        onOpenChange(false)
      } catch (err) {
        setError(err instanceof Error ? err.message : "Nastala chyba")
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Požiadať o zmenu</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <p className="text-sm text-muted-foreground capitalize">{dateLabel}</p>

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

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="note">Poznámka (nepovinná)</Label>
            <Textarea
              id="note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              placeholder="Napr. môžem len do 22:00…"
            />
          </div>

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
