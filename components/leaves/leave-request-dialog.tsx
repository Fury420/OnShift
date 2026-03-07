"use client"

import { useState, useEffect, useTransition } from "react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { DatePicker } from "@/components/ui/date-picker"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { requestLeave, updateLeave } from "@/app/actions/leaves"
import { requestReplacement } from "@/app/actions/shift-replacements"

export interface LeaveForEdit {
  id: string
  type: "vacation" | "sick" | "personal"
  startDate: string
  endDate: string
  note: string | null
}

export interface ColleagueOption {
  id: string
  name: string
}

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  leave?: LeaveForEdit
  defaultDate?: string
  // optional shift context for requesting replacement alongside leave
  shiftId?: string
  shiftLabel?: string // e.g. "16:00–21:00"
  colleagues?: ColleagueOption[]
}

export function LeaveRequestDialog({ open, onOpenChange, leave, defaultDate, shiftId, shiftLabel, colleagues }: Props) {
  const isEdit = !!leave
  const [type, setType] = useState<"vacation" | "sick" | "personal">("vacation")
  const [startDate, setStartDate] = useState("")
  const [endDate, setEndDate] = useState("")
  const [note, setNote] = useState("")
  const [replacementUserId, setReplacementUserId] = useState("")
  const [error, setError] = useState("")
  const [isPending, startTransition] = useTransition()

  useEffect(() => {
    if (open) {
      setType(leave?.type ?? "vacation")
      setStartDate(leave?.startDate ?? defaultDate ?? "")
      setEndDate(leave?.endDate ?? defaultDate ?? "")
      setNote(leave?.note ?? "")
      setReplacementUserId("")
      setError("")
    }
  }, [open, leave, defaultDate])

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError("")

    if (!startDate || !endDate) {
      setError("Vyplňte dátum od aj do.")
      return
    }
    if (startDate > endDate) {
      setError("Dátum od musí byť pred dátumom do.")
      return
    }

    startTransition(async () => {
      try {
        if (isEdit) {
          await updateLeave(leave.id, { type, startDate, endDate, note })
        } else {
          await requestLeave({ type, startDate, endDate, note })
          if (shiftId && replacementUserId) {
            await requestReplacement(shiftId, replacementUserId)
          }
        }
        onOpenChange(false)
      } catch (err) {
        setError(err instanceof Error ? err.message : "Nastala chyba")
      }
    })
  }

  const showReplacementPicker = !isEdit && !!shiftId && !!colleagues?.length

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Upraviť žiadosť" : "Nová žiadosť o voľno"}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label>Typ</Label>
            <Select value={type} onValueChange={(v) => setType(v as typeof type)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="vacation">Dovolenka</SelectItem>
                <SelectItem value="sick">PN (pracovná neschopnosť)</SelectItem>
                <SelectItem value="personal">Osobné voľno</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <DatePicker
              label="Dátum od"
              value={startDate}
              onChange={setStartDate}
            />
            <DatePicker
              label="Dátum do"
              value={endDate}
              onChange={setEndDate}
              minDate={startDate}
            />
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

          {showReplacementPicker && (
            <div className="flex flex-col gap-1.5">
              <Label>
                Požiadať o zastup zmeny{shiftLabel ? ` (${shiftLabel})` : ""}{" "}
                <span className="text-muted-foreground font-normal">(nepovinné)</span>
              </Label>
              <Select value={replacementUserId} onValueChange={setReplacementUserId}>
                <SelectTrigger>
                  <SelectValue placeholder="— bez zastup —" />
                </SelectTrigger>
                <SelectContent>
                  {colleagues!.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {error && <p className="text-sm text-destructive">{error}</p>}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Zrušiť
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending
                ? isEdit ? "Ukladám…" : "Odosielam…"
                : isEdit ? "Uložiť" : "Odoslať žiadosť"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
