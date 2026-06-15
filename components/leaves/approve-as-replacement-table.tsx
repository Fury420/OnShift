"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Check, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { approveLeave } from "@/app/actions/leaves"

const TYPE_LABELS: Record<string, string> = {
  vacation: "Dovolenka",
  sick: "PN",
  personal: "Osobné voľno",
}

export interface LeaveToApproveRow {
  id: string
  userName: string
  type: string
  startDate: string
  endDate: string
  note: string | null
}

export function ApproveAsReplacementTable({ rows }: { rows: LeaveToApproveRow[] }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [loadingId, setLoadingId] = useState<string | null>(null)

  function handleApprove(id: string, status: "approved" | "rejected") {
    setLoadingId(id)
    startTransition(async () => {
      try {
        await approveLeave(id, status)
        toast.success(status === "approved" ? "Žiadosť schválená" : "Žiadosť zamietnutá")
        router.refresh()
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Chyba")
      } finally {
        setLoadingId(null)
      }
    })
  }

  if (rows.length === 0) return null

  return (
    <div className="overflow-x-auto rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Zamestnanec</TableHead>
            <TableHead>Typ</TableHead>
            <TableHead>Od</TableHead>
            <TableHead>Do</TableHead>
            <TableHead>Poznámka</TableHead>
            <TableHead className="text-right">Akcia</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.id}>
              <TableCell className="font-medium">{row.userName}</TableCell>
              <TableCell>{TYPE_LABELS[row.type] ?? row.type}</TableCell>
              <TableCell>{row.startDate}</TableCell>
              <TableCell>{row.endDate}</TableCell>
              <TableCell className="text-muted-foreground text-sm">{row.note ?? "—"}</TableCell>
              <TableCell className="text-right">
                <div className="flex justify-end gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-8 text-green-600 hover:text-green-600"
                    disabled={!!loadingId}
                    onClick={() => handleApprove(row.id, "approved")}
                  >
                    <Check className="size-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-8 text-destructive hover:text-destructive"
                    disabled={!!loadingId}
                    onClick={() => handleApprove(row.id, "rejected")}
                  >
                    <X className="size-4" />
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
