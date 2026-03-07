"use client"

import { useRef, useCallback } from "react"
import { format } from "date-fns"
import { sk } from "date-fns/locale"
import { CalendarIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { Label } from "@/components/ui/label"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { cn } from "@/lib/utils"
import type { DateRange } from "react-day-picker"

function toDateStr(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${y}-${m}-${day}`
}

function parseDate(s: string): Date | undefined {
  if (!s) return undefined
  const [y, m, d] = s.split("-").map(Number)
  return new Date(y, m - 1, d)
}

export interface DatePickerProps {
  value: string
  onChange: (value: string) => void
  label?: string
  minDate?: string
  placeholder?: string
  className?: string
}

export function DatePicker({
  value,
  onChange,
  label,
  minDate,
  placeholder = "Vyberte datum",
  className,
}: DatePickerProps) {
  const selected = parseDate(value)
  const fromDate = minDate ? parseDate(minDate) : undefined

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      {label && <Label>{label}</Label>}
      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            className={cn(
              "w-full justify-start text-left font-normal",
              !value && "text-muted-foreground"
            )}
          >
            <CalendarIcon className="mr-2 size-4" />
            {selected ? format(selected, "d. M. yyyy", { locale: sk }) : placeholder}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start" side="bottom" avoidCollisions={false}>
          <Calendar
            mode="single"
            selected={selected}
            onSelect={(d) => {
              if (d) onChange(toDateStr(d))
            }}
            fromDate={fromDate}
            locale={sk}
            weekStartsOn={1}
            className="p-2 [--cell-size:1.6rem]"
          />
        </PopoverContent>
      </Popover>
    </div>
  )
}

export interface DateRangePickerProps {
  valueFrom: string
  valueTo: string
  onChangeFrom: (value: string) => void
  onChangeTo: (value: string) => void
  label?: string
  placeholder?: string
  className?: string
}

export function DateRangePicker({
  valueFrom,
  valueTo,
  onChangeFrom,
  onChangeTo,
  label,
  placeholder = "Vyberte obdobie",
  className,
}: DateRangePickerProps) {
  const from = parseDate(valueFrom)
  const to = parseDate(valueTo)
  const selected: DateRange | undefined =
    from || to ? { from, to } : undefined

  // Track click cycle: "from" → "to" → "from" → ...
  const selectingRef = useRef<"from" | "to">(from && !to ? "to" : "from")

  // Reset cycle when popover opens
  const handleOpenChange = useCallback((open: boolean) => {
    if (open) {
      // If both dates are set, next click starts a new range
      if (from && to) selectingRef.current = "from"
      // If only from is set, next click selects end
      else if (from) selectingRef.current = "to"
      else selectingRef.current = "from"
    }
  }, [from, to])

  const handleSelect = useCallback((range: DateRange | undefined) => {
    if (!range?.from) {
      onChangeFrom("")
      onChangeTo("")
      selectingRef.current = "from"
      return
    }

    // Klik do stredu už vybraného obdobia → ten deň sa stane nový start
    if (from && to) {
      if (!range.to) {
        onChangeFrom(toDateStr(range.from))
        onChangeTo("")
        selectingRef.current = "to"
        return
      }
      const fromInMiddle = range.from > from && range.from < to
      const toInMiddle = range.to > from && range.to < to
      if (fromInMiddle || toInMiddle) {
        const newStart = fromInMiddle ? range.from : range.to
        onChangeFrom(toDateStr(newStart))
        onChangeTo("")
        selectingRef.current = "to"
        return
      }
    }

    if (selectingRef.current === "from") {
      onChangeFrom(toDateStr(range.from))
      onChangeTo("")
      selectingRef.current = "to"
    } else {
      const newFrom = range.from ? toDateStr(range.from) : ""
      const newTo = range.to ? toDateStr(range.to) : ""

      // Dvakrát kliknutý ten istý deň → jednodenný rozsah
      const sameDay = newFrom && !newTo && from && newFrom === toDateStr(from)
      if (sameDay) {
        onChangeFrom(newFrom)
        onChangeTo(newFrom)
        selectingRef.current = "from"
      } else {
        onChangeFrom(newFrom)
        onChangeTo(newTo)
        if (newTo) selectingRef.current = "from"
      }
    }
  }, [onChangeFrom, onChangeTo, from, to])

  const displayText =
    from && to
      ? `${format(from, "d. M. yyyy", { locale: sk })} - ${format(to, "d. M. yyyy", { locale: sk })}`
      : from
        ? `${format(from, "d. M. yyyy", { locale: sk })} - ...`
        : placeholder

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      {label && <Label>{label}</Label>}
      <Popover onOpenChange={handleOpenChange}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            className={cn(
              "w-full justify-start text-left font-normal",
              !valueFrom && !valueTo && "text-muted-foreground"
            )}
          >
            <CalendarIcon className="mr-2 size-4" />
            {displayText}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start" side="bottom" avoidCollisions={false}>
          <Calendar
            mode="range"
            selected={selected}
            onSelect={handleSelect}
            locale={sk}
            weekStartsOn={1}
            className="p-2 [--cell-size:1.6rem]"
          />
        </PopoverContent>
      </Popover>
    </div>
  )
}
