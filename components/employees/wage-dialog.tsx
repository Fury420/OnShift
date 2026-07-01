"use client"

import { useState, useTransition } from "react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { Plus, Pencil, Trash2, Check, X, CalendarClock } from "lucide-react"
import { addWageRate, updateWageRate, deleteWageRate } from "@/app/actions/wage-rates"

const TZ = "Europe/Bratislava"

export interface WageRateItem {
  id: string
  hourlyRate: number
  effectiveFrom: string // YYYY-MM-DD
}

interface WageDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  userId: string
  userName: string
  history: WageRateItem[] // zostupne (najnovšia prvá)
}

function todayStr(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: TZ })
}

function formatDate(d: string): string {
  return new Date(d + "T12:00:00").toLocaleDateString("sk-SK", {
    day: "numeric",
    month: "numeric",
    year: "numeric",
  })
}

function formatRate(r: number): string {
  return `${r.toFixed(2).replace(".", ",")} €/h`
}

export function WageDialog({ open, onOpenChange, userId, userName, history }: WageDialogProps) {
  const [rate, setRate] = useState("")
  const [date, setDate] = useState(todayStr())
  const [error, setError] = useState("")
  const [isPending, startTransition] = useTransition()

  const [editingId, setEditingId] = useState<string | null>(null)
  const [editRate, setEditRate] = useState("")
  const [editDate, setEditDate] = useState("")

  function resetAdd() {
    setRate("")
    setDate(todayStr())
    setError("")
  }

  function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    setError("")
    const parsed = parseFloat(rate)
    if (rate === "" || Number.isNaN(parsed) || parsed < 0) {
      setError("Zadajte platnú sadzbu.")
      return
    }
    startTransition(async () => {
      try {
        await addWageRate(userId, parsed, date)
        resetAdd()
      } catch (err) {
        setError(err instanceof Error ? err.message : "Nastala chyba")
      }
    })
  }

  function startEdit(item: WageRateItem) {
    setEditingId(item.id)
    setEditRate(String(item.hourlyRate))
    setEditDate(item.effectiveFrom)
    setError("")
  }

  function cancelEdit() {
    setEditingId(null)
    setError("")
  }

  function saveEdit(id: string) {
    setError("")
    const parsed = parseFloat(editRate)
    if (editRate === "" || Number.isNaN(parsed) || parsed < 0) {
      setError("Zadajte platnú sadzbu.")
      return
    }
    startTransition(async () => {
      try {
        await updateWageRate(id, { hourlyRate: parsed, effectiveFrom: editDate })
        setEditingId(null)
      } catch (err) {
        setError(err instanceof Error ? err.message : "Nastala chyba")
      }
    })
  }

  function handleDelete(id: string) {
    setError("")
    startTransition(async () => {
      try {
        await deleteWageRate(id)
      } catch (err) {
        setError(err instanceof Error ? err.message : "Nastala chyba")
      }
    })
  }

  const today = todayStr()

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) {
          resetAdd()
          setEditingId(null)
        }
        onOpenChange(o)
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Mzda — {userName}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleAdd} className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="wr-rate">Nová sadzba (€/h)</Label>
              <Input
                id="wr-rate"
                type="number"
                min={0}
                step={0.01}
                value={rate}
                onChange={(e) => setRate(e.target.value)}
                placeholder="napr. 8.00"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="wr-date">Platí od</Label>
              <Input
                id="wr-date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>
          </div>
          <Button type="submit" disabled={isPending} className="self-start">
            <Plus className="size-4" />
            Pridať sadzbu
          </Button>
        </form>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <div className="flex flex-col gap-1.5">
          <Label className="text-muted-foreground">História sadzieb</Label>
          {history.length === 0 ? (
            <p className="text-sm text-muted-foreground">Zatiaľ žiadna sadzba — pridajte prvú vyššie.</p>
          ) : (
            <ul className="flex flex-col divide-y rounded-md border">
              {history.map((item) => {
                const isFuture = item.effectiveFrom > today
                const isEditing = editingId === item.id
                return (
                  <li key={item.id} className="flex items-center gap-2 p-2">
                    {isEditing ? (
                      <>
                        <Input
                          type="number"
                          min={0}
                          step={0.01}
                          value={editRate}
                          onChange={(e) => setEditRate(e.target.value)}
                          className="h-8 w-24"
                        />
                        <Input
                          type="date"
                          value={editDate}
                          onChange={(e) => setEditDate(e.target.value)}
                          className="h-8 flex-1"
                        />
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          className="size-8"
                          disabled={isPending}
                          onClick={() => saveEdit(item.id)}
                        >
                          <Check className="size-4" />
                        </Button>
                        <Button type="button" size="icon" variant="ghost" className="size-8" onClick={cancelEdit}>
                          <X className="size-4" />
                        </Button>
                      </>
                    ) : (
                      <>
                        <span className="font-medium tabular-nums">{formatRate(item.hourlyRate)}</span>
                        <span className="text-sm text-muted-foreground">od {formatDate(item.effectiveFrom)}</span>
                        {isFuture && (
                          <span className="ml-1 inline-flex items-center gap-1 rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-700">
                            <CalendarClock className="size-3" />
                            naplánované
                          </span>
                        )}
                        <span className="ml-auto flex items-center gap-0.5">
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            className="size-8"
                            onClick={() => startEdit(item)}
                          >
                            <Pencil className="size-4" />
                          </Button>
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            className="size-8 text-destructive"
                            disabled={isPending}
                            onClick={() => handleDelete(item.id)}
                          >
                            <Trash2 className="size-4" />
                          </Button>
                        </span>
                      </>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
