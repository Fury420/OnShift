"use client"

import { format } from "date-fns"
import { sk } from "date-fns/locale"
import { CalendarIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { Label } from "@/components/ui/label"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { cn } from "@/lib/utils"

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
  placeholder = "Vyberte dátum",
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
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="single"
            selected={selected}
            onSelect={(d) => {
              if (d) onChange(toDateStr(d))
            }}
            fromDate={fromDate}
            locale={sk}
            weekStartsOn={1}
          />
        </PopoverContent>
      </Popover>
    </div>
  )
}
