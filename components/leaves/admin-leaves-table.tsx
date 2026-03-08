"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Check, X, Pencil, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Label } from "@/components/ui/label"
import { DateRangePicker } from "@/components/ui/date-picker"
import { Textarea } from "@/components/ui/textarea"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { adminUpdateLeaveStatus, adminUpdateLeave, adminDeleteLeave } from "@/app/actions/leaves"

const TYPE_LABELS: Record<string, string> = {
  vacation: "Dovolenka",
  sick: "PN",
  personal: "Osobné voľno",
}

export interface AdminLeaveRow {
  id: string
  userName: string
  type: string
  startDate: string
  endDate: string
  status: string
  note: string | null
}

interface EditState {
  id: string
  type: "vacation" | "sick" | "personal"
  startDate: string
  endDate: string
  note: string
}

interface Props {
  rows: AdminLeaveRow[]
}

function StatusBadge({ status }: { status: string }) {
  if (status === "approved") return <Badge className="bg-green-500/15 text-green-700 hover:bg-green-500/15 border-0">Schválená</Badge>
  if (status === "rejected") return <Badge variant="destructive" className="border-0">Zamietnutá</Badge>
  return <Badge className="bg-yellow-500/15 text-yellow-700 hover:bg-yellow-500/15 border-0">Čaká</Badge>
}

export function AdminLeavesTable({ rows }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [editState, setEditState] = useState<EditState | null>(null)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [editError, setEditError] = useState("")

  function openEdit(row: AdminLeaveRow) {
    setEditError("")
    setEditState({
      id: row.id,
      type: row.type as EditState["type"],
      startDate: row.startDate,
      endDate: row.endDate,
      note: row.note ?? "",
    })
  }

  function handleSave() {
    if (!editState) return
    if (editState.startDate > editState.endDate) {
      setEditError("Dátum od musí byť pred dátumom do.")
      return
    }
    startTransition(async () => {
      await adminUpdateLeave(editState.id, {
        type: editState.type,
        startDate: editState.startDate,
        endDate: editState.endDate,
        note: editState.note,
      })
      router.refresh()
      setEditState(null)
    })
  }

  function handleStatus(id: string, status: "approved" | "rejected") {
    startTransition(async () => {
      await adminUpdateLeaveStatus(id, status)
      router.refresh()
    })
  }

  function handleDelete() {
    if (!deleteId) return
    startTransition(async () => {
      await adminDeleteLeave(deleteId)
      router.refresh()
      setDeleteId(null)
    })
  }

  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground">Žiadne žiadosti o voľno.</p>
  }

  return (
    <>
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Zamestnanec</TableHead>
              <TableHead>Typ</TableHead>
              <TableHead>Od</TableHead>
              <TableHead>Do</TableHead>
              <TableHead>Stav</TableHead>
              <TableHead>Poznámka</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.id}>
                <TableCell className="font-medium">{row.userName}</TableCell>
                <TableCell>{TYPE_LABELS[row.type] ?? row.type}</TableCell>
                <TableCell>{row.startDate}</TableCell>
                <TableCell>{row.endDate}</TableCell>
                <TableCell><StatusBadge status={row.status} /></TableCell>
                <TableCell className="text-sm text-muted-foreground">{row.note ?? "—"}</TableCell>
                <TableCell>
                  <div className="flex justify-end gap-1">
                    {row.status === "pending" && (
                      <>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-7 text-green-600 hover:text-green-600"
                          disabled={isPending}
                          onClick={() => handleStatus(row.id, "approved")}
                        >
                          <Check className="size-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-7 text-destructive hover:text-destructive"
                          disabled={isPending}
                          onClick={() => handleStatus(row.id, "rejected")}
                        >
                          <X className="size-3.5" />
                        </Button>
                      </>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-7"
                      disabled={isPending}
                      onClick={() => openEdit(row)}
                    >
                      <Pencil className="size-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-7 text-destructive hover:text-destructive"
                      disabled={isPending}
                      onClick={() => setDeleteId(row.id)}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Edit dialog */}
      <Dialog open={!!editState} onOpenChange={(o) => !o && setEditState(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Upraviť žiadosť</DialogTitle>
          </DialogHeader>
          {editState && (
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <Label>Typ</Label>
                <Select
                  value={editState.type}
                  onValueChange={(v) => setEditState({ ...editState, type: v as EditState["type"] })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="vacation">Dovolenka</SelectItem>
                    <SelectItem value="sick">PN (pracovná neschopnosť)</SelectItem>
                    <SelectItem value="personal" disabled>Osobné voľno (neaktívne)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <DateRangePicker
                label="Obdobie"
                valueFrom={editState.startDate}
                valueTo={editState.endDate}
                onChangeFrom={(v) => setEditState({ ...editState, startDate: v })}
                onChangeTo={(v) => setEditState({ ...editState, endDate: v })}
              />
              <div className="flex flex-col gap-1.5">
                <Label>Poznámka</Label>
                <Textarea
                  value={editState.note}
                  onChange={(e) => setEditState({ ...editState, note: e.target.value })}
                  rows={2}
                />
              </div>
              {editError && <p className="text-sm text-destructive">{editError}</p>}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditState(null)}>Zrušiť</Button>
            <Button onClick={handleSave} disabled={isPending}>
              {isPending ? "Ukladám…" : "Uložiť"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Zmazať žiadosť?</AlertDialogTitle>
            <AlertDialogDescription>
              Táto akcia je nevratná. Žiadosť bude natrvalo vymazaná.
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
