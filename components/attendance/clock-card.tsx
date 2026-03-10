"use client"

import { useEffect, useState, useTransition } from "react"
import Link from "next/link"
import { LogIn, LogOut, Clock, CalendarClock } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { clockIn, clockOut } from "@/app/actions/attendance"

interface ClockCardProps {
  isActive: boolean
  clockInTime: string | null // ISO string
  scheduledShifts: { startTime: string; endTime: string }[]
  /** Najbližšia zmena – zobrazená vpravo hore v bloku (date = YYYY-MM-DD pre presmerovanie na kalendár) */
  nextShift?: { date?: string; dateLabel: string; start: string; end: string } | null
}

function formatElapsed(ms: number) {
  const s = Math.floor(ms / 1000)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  return [h, m, sec].map((v) => String(v).padStart(2, "0")).join(":")
}

export function ClockCard({ isActive, clockInTime, scheduledShifts, nextShift }: ClockCardProps) {
  const [elapsed, setElapsed] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  useEffect(() => {
    if (!isActive || !clockInTime) {
      setElapsed(null)
      return
    }
    const start = new Date(clockInTime).getTime()
    const tick = () => setElapsed(formatElapsed(Date.now() - start))
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [isActive, clockInTime])

  const today = new Date().toLocaleDateString("sk-SK", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  })

  const clockInFormatted = clockInTime
    ? new Date(clockInTime).toLocaleTimeString("sk-SK", {
        hour: "2-digit",
        minute: "2-digit",
      })
    : null

  function handle() {
    startTransition(async () => {
      if (isActive) {
        await clockOut()
      } else {
        await clockIn()
      }
    })
  }

  return (
    <Card>
      <CardContent className="pt-6 flex flex-col gap-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex flex-col gap-0.5">
            <p className="text-sm text-muted-foreground capitalize">{today}</p>
            {scheduledShifts.length > 0 && (
              <div className="flex flex-col gap-0.5">
                {scheduledShifts.map((s, i) => (
                  <p key={i} className="text-sm text-muted-foreground flex items-center gap-1.5">
                    <CalendarClock className="size-3.5 shrink-0" />
                    {scheduledShifts.length > 1 ? `Zmena ${i + 1}:` : "Zmena:"}{" "}
                    <span className="font-medium text-foreground">
                      {s.startTime.slice(0, 5)} – {s.endTime.slice(0, 5)}
                    </span>
                  </p>
                ))}
              </div>
            )}
            {isActive && clockInFormatted && (
              <p className="text-sm text-muted-foreground">
                Príchod: <span className="font-medium text-foreground">{clockInFormatted}</span>
              </p>
            )}
          </div>

          <div className="flex flex-col items-end gap-1.5 shrink-0">
            {nextShift && (
              <Link
                href={nextShift.date ? `/schedule?month=${nextShift.date.slice(0, 7)}&date=${nextShift.date}` : "/schedule"}
                className="group/next flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 -m-2.5 text-right text-xs text-muted-foreground transition-all duration-200 hover:bg-primary/10 hover:text-primary"
                title="Prejsť do kalendára na túto zmenu"
              >
                <CalendarClock className="size-3.5 shrink-0 opacity-60 group-hover/next:opacity-100 group-hover/next:scale-110 transition-all duration-200" />
                <span className="flex flex-col">
                  <span className="font-medium text-foreground group-hover/next:text-primary transition-colors">Najbližšia zmena</span>
                  <span className="capitalize">{nextShift.dateLabel} {nextShift.start}–{nextShift.end}</span>
                </span>
              </Link>
            )}
            {isActive && elapsed && (
              <div className="flex items-center gap-2">
                <Clock className="size-4 text-green-500 shrink-0" />
                <span className="text-2xl font-mono font-semibold tabular-nums">{elapsed}</span>
              </div>
            )}
          </div>
        </div>

        <Button
          onClick={handle}
          disabled={isPending}
          variant={isActive ? "destructive" : "default"}
          size="lg"
          className="w-full sm:w-48"
        >
          {isActive ? (
            <>
              <LogOut className="size-4" />
              {isPending ? "Odhlasovanie…" : "Odhlásiť sa"}
            </>
          ) : (
            <>
              <LogIn className="size-4" />
              {isPending ? "Prihlasovanie…" : "Prihlásiť sa"}
            </>
          )}
        </Button>
      </CardContent>
    </Card>
  )
}
