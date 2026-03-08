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

export interface ColleagueOption {
  id: string
  name: string
}

interface RequestDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  shift: { id: string; date: string; startTime: string; endTime: string }
  colleagues: ColleagueOption[]
}

export function RequestDialog({ open, onOpenChange, shift, colleagues }: RequestDialogProps) {
  const router = useRouter()
  const [replacementUserId, setReplacementUserId] = useState("")
  const [note, setNote] = useState("")
  const [error, setError] = useState("")
  const [isPending, startTransition] = useTransition()

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!replacementUserId) {
      setError("Vyber náhradníka")
      return
    }
    setError("")
    startTransition(async () => {
      try {
        const result = await requestReplacement(shift.id, replacementUserId, note || undefined)
        setReplacementUserId("")
        setNote("")
        onOpenChange(false)
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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Požiadať o zastup</DialogTitle>
        </DialogHeader>

        <div className="text-sm text-muted-foreground">
          Zmena: <span className="font-medium text-foreground">{shift.date}</span>{" "}
          {shift.startTime}–{shift.endTime}
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="replacement">Navrhovaný náhradník</Label>
            <Select value={replacementUserId} onValueChange={setReplacementUserId}>
              <SelectTrigger id="replacement">
                <SelectValue placeholder="Vyber kolegu…" />
              </SelectTrigger>
              <SelectContent>
                {colleagues.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="note">Poznámka (voliteľné)</Label>
            <Textarea
              id="note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Dôvod, prečo nemôžeš prísť…"
              rows={3}
            />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Zrušiť
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Odosielam…" : "Odoslať žiadosť"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
