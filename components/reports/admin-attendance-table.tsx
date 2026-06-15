"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Pencil, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { adminUpdateAttendance, adminDeleteAttendance } from "@/app/actions/attendance"

const TZ = "Europe/Bratislava"

function toLocalInput(isoStr: string): string {
  return new Date(isoStr)
    .toLocaleString("sv-SE", { timeZone: TZ })
    .slice(0, 16)
    .replace(" ", "T")
}

function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m === 0 ? `${h}h` : `${h}h ${String(m).padStart(2, "0")}m`
}

export interface AdminAttendanceRow {
  id: string
  name: string
  color: string | null
  date: string
  clockIn: string
  clockOut: string
  clockInISO: string
  clockOutISO: string
  minutes: number
  note: string | null
}

interface EditState {
  id: string
  clockIn: string
  clockOut: string
}

interface Props {
  rows: AdminAttendanceRow[]
  grandTotal: number
}

export function AdminAttendanceTable({ rows, grandTotal }: Props) {
  const router = useRouter()
  const [editState, setEditState] = useState<EditState | null>(null)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState("")

  function openEdit(row: AdminAttendanceRow) {
    setError("")
    setEditState({
      id: row.id,
      clockIn: toLocalInput(row.clockInISO),
      clockOut: toLocalInput(row.clockOutISO),
    })
  }

  function handleSave() {
    if (!editState) return
    if (editState.clockIn >= editState.clockOut) {
      setError("Príchod musí byť pred odchodom.")
      return
    }
    startTransition(async () => {
      await adminUpdateAttendance(
        editState.id,
        new Date(editState.clockIn).toISOString(),
        new Date(editState.clockOut).toISOString(),
      )
      router.refresh()
      setEditState(null)
    })
  }

  function handleDelete() {
    if (!deleteId) return
    startTransition(async () => {
      await adminDeleteAttendance(deleteId)
      router.refresh()
      setDeleteId(null)
    })
  }

  return (
    <>
      <div className="overflow-x-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Dátum</TableHead>
              <TableHead>Od</TableHead>
              <TableHead>Do</TableHead>
              <TableHead className="text-right">Spolu</TableHead>
              <TableHead className="text-right">Zamestnanec</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow
                key={row.id}
                style={{ backgroundColor: row.color ? `${row.color}18` : undefined }}
              >
                <TableCell>
                  <div>{row.date}</div>
                  {row.note && (
                    <div className="text-xs text-muted-foreground mt-0.5 italic">{row.note}</div>
                  )}
                </TableCell>
                <TableCell>{row.clockIn}</TableCell>
                <TableCell>{row.clockOut}</TableCell>
                <TableCell className="text-right font-mono text-sm">
                  {formatDuration(row.minutes)}
                </TableCell>
                <TableCell className="text-right font-medium">{row.name}</TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-7"
                      onClick={() => openEdit(row)}
                    >
                      <Pencil className="size-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-7 text-destructive hover:text-destructive"
                      onClick={() => setDeleteId(row.id)}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
          <TableFooter>
            <TableRow>
              <TableCell colSpan={3} className="font-semibold">Celkom</TableCell>
              <TableCell className="text-right font-mono font-semibold">
                {formatDuration(grandTotal)}
              </TableCell>
              <TableCell colSpan={2} />
            </TableRow>
          </TableFooter>
        </Table>
      </div>

      {/* Edit dialog */}
      <Dialog open={!!editState} onOpenChange={(o) => !o && setEditState(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Upraviť záznam</DialogTitle>
          </DialogHeader>
          {editState && (
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <Label>Príchod</Label>
                <Input
                  type="datetime-local"
                  value={editState.clockIn}
                  onChange={(e) => setEditState({ ...editState, clockIn: e.target.value })}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Odchod</Label>
                <Input
                  type="datetime-local"
                  value={editState.clockOut}
                  onChange={(e) => setEditState({ ...editState, clockOut: e.target.value })}
                />
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditState(null)}>
              Zrušiť
            </Button>
            <Button onClick={handleSave} disabled={isPending}>
              {isPending ? "Ukladanie…" : "Uložiť"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Zmazať záznam?</AlertDialogTitle>
            <AlertDialogDescription>
              Táto akcia je nevratná. Záznam bude natrvalo vymazaný.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Zrušiť</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Zmazať
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
