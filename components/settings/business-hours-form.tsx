"use client"

import { useState, useTransition } from "react"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { updateBusinessHours } from "@/app/actions/settings"
import { toast } from "sonner"

type DayRow = {
  dayOfWeek: string
  label: string
  isClosed: boolean
  openTime: string
  closeTime: string
}

export function BusinessHoursForm({ initialData }: { initialData: DayRow[] }) {
  const [rows, setRows] = useState<DayRow[]>(initialData)
  const [isPending, startTransition] = useTransition()

  function toggle(i: number) {
    setRows((prev) => prev.map((r, idx) => idx === i ? { ...r, isClosed: !r.isClosed } : r))
  }

  function setTime(i: number, field: "openTime" | "closeTime", value: string) {
    setRows((prev) => prev.map((r, idx) => idx === i ? { ...r, [field]: value } : r))
  }

  function save() {
    startTransition(async () => {
      try {
        await updateBusinessHours(rows.map((r) => ({
          dayOfWeek: r.dayOfWeek,
          isClosed: r.isClosed,
          openTime: r.openTime,
          closeTime: r.closeTime,
        })))
        toast.success("Otváracie hodiny uložené")
      } catch {
        toast.error("Chyba pri ukladaní")
      }
    })
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-xl border overflow-hidden">
        <div className="grid grid-cols-[1fr_2.75rem_6rem_6rem] gap-x-4 px-4 py-2 bg-muted/50 border-b text-xs font-medium text-muted-foreground items-center">
          <span>Deň</span>
          <span className="text-center">Otvorené</span>
          <span className="text-center">Od</span>
          <span className="text-center">Do</span>
        </div>
        {rows.map((row, i) => (
          <div
            key={row.dayOfWeek}
            className="grid grid-cols-[1fr_2.75rem_6rem_6rem] items-center gap-x-4 px-4 py-3 border-b last:border-b-0"
          >
            <span className="text-sm font-medium">{row.label}</span>

            <div className="flex justify-center">
              <Switch
                checked={!row.isClosed}
                onCheckedChange={() => toggle(i)}
                aria-label={`${row.label} otvorené`}
              />
            </div>

            <div className="w-24 min-w-24">
              <Label className="sr-only">Od</Label>
              <Input
                type="time"
                value={row.openTime}
                onChange={(e) => setTime(i, "openTime", e.target.value)}
                disabled={row.isClosed}
                className="h-8 text-sm"
              />
            </div>

            <div className="w-24 min-w-24">
              <Label className="sr-only">Do</Label>
              <Input
                type="time"
                value={row.closeTime}
                onChange={(e) => setTime(i, "closeTime", e.target.value)}
                disabled={row.isClosed}
                className="h-8 text-sm"
              />
            </div>
          </div>
        ))}
      </div>

      <Button onClick={save} disabled={isPending} className="self-start">
        {isPending ? "Ukladám…" : "Uložiť"}
      </Button>
    </div>
  )
}
