"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { requestReplacement } from "@/app/actions/shift-replacements"

export interface ShiftOption {
  id: string
  label: string // e.g. "Ut, 11.3. 16:00–21:00"
}

export interface ColleagueOption {
  id: string
  name: string
}

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  myShifts?: ShiftOption[]
  colleagues: ColleagueOption[]
  /** Pri otvorení z kalendára (klik na zmenu) – zmena je predvybraná, výber zmeny sa nezobrazí */
  initialShiftId?: string
  initialShiftLabel?: string
}

export function NewReplacementDialog({ open, onOpenChange, myShifts = [], colleagues, initialShiftId, initialShiftLabel }: Props) {
  const router = useRouter()
  const [shiftId, setShiftId] = useState("")
  const [colleagueId, setColleagueId] = useState("")
  const [note, setNote] = useState("")
  const [error, setError] = useState("")
  const [isPending, startTransition] = useTransition()

  const effectiveShiftId = initialShiftId ?? shiftId
  const showShiftSelect = !initialShiftId

  function handleOpenChange(o: boolean) {
    if (!o) {
      setShiftId("")
      setColleagueId("")
      setNote("")
      setError("")
    }
    onOpenChange(o)
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError("")
    if (!effectiveShiftId) { setError("Vyberte zmenu."); return }
    if (!colleagueId) { setError("Vyberte náhradníka."); return }

    startTransition(async () => {
      try {
        const result = await requestReplacement(effectiveShiftId, colleagueId, note || undefined)
        handleOpenChange(false)
        if (result?.shiftDate) {
          router.push(`/replacements?month=${result.shiftDate.slice(0, 7)}`)
        } else {
          router.refresh()
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Nastala chyba")
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Požiadať o zastup</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {showShiftSelect ? (
            <div className="flex flex-col gap-1.5">
              <Label>Zmena</Label>
              <Select value={shiftId} onValueChange={setShiftId}>
                <SelectTrigger>
                  <SelectValue placeholder="Vyberte zmenu…" />
                </SelectTrigger>
                <SelectContent>
                  {myShifts.length === 0 ? (
                    <SelectItem value="__none" disabled>Žiadne nadchádzajúce zmeny</SelectItem>
                  ) : (
                    myShifts.map((s) => (
                      <SelectItem key={s.id} value={s.id}>{s.label}</SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>
          ) : (
            initialShiftLabel && (
              <div className="flex flex-col gap-1.5">
                <Label>Zmena</Label>
                <p className="text-sm py-2 px-3 rounded-md bg-muted">{initialShiftLabel}</p>
              </div>
            )
          )}

          <div className="flex flex-col gap-1.5">
            <Label>Navrhnutý náhradník</Label>
            <Select value={colleagueId} onValueChange={setColleagueId}>
              <SelectTrigger>
                <SelectValue placeholder="Vyberte kolegu…" />
              </SelectTrigger>
              <SelectContent>
                {colleagues.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="note">Poznámka (nepovinná)</Label>
            <Textarea
              id="note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
            />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>
              Zrušiť
            </Button>
            <Button type="submit" disabled={isPending || (!effectiveShiftId || (showShiftSelect && myShifts.length === 0))}>
              {isPending ? "Odosielam…" : "Odoslať žiadosť"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
