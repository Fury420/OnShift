"use client"

import { useTransition } from "react"
import { Check, X, RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import { approveShiftRuleRequest, rejectShiftRuleRequest } from "@/app/actions/shift-rules"
import { toast } from "sonner"
import { useRouter } from "next/navigation"

const DAY_NAMES: Record<number, string> = {
  1: "Po", 2: "Ut", 3: "St", 4: "Št", 5: "Pi", 6: "So", 0: "Ne",
}

function formatDays(days: string | null): string {
  if (!days) return "—"
  return days.split(",").map(Number).map((d) => DAY_NAMES[d] ?? d).join(", ")
}

function formatDate(d: string | null): string {
  if (!d) return "—"
  return new Date(d + "T12:00:00").toLocaleDateString("sk-SK", { day: "numeric", month: "numeric", year: "numeric" })
}

export interface RequestedRuleRow {
  id: string
  userName: string | null
  frequency: string
  days: string | null
  date: string | null
  validFrom: string | null
  validUntil: string | null
  startTime: string | null
  endTime: string | null
  allDay: boolean
  note: string | null
}

interface Props {
  rows: RequestedRuleRow[]
}

function RowActions({ id }: { id: string }) {
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  function handle(action: "approve" | "reject") {
    startTransition(async () => {
      try {
        if (action === "approve") {
          await approveShiftRuleRequest(id)
          toast.success("Žiadosť schválená (presunutá do konceptov)")
        } else {
          await rejectShiftRuleRequest(id)
          toast.success("Žiadosť zamietnutá")
        }
        router.refresh()
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Chyba")
      }
    })
  }

  return (
    <div className="flex gap-1">
      <Button
        size="icon"
        variant="ghost"
        className="size-7 text-green-600 hover:text-green-700 hover:bg-green-50"
        disabled={isPending}
        onClick={() => handle("approve")}
        title="Schváliť"
      >
        <Check className="size-4" />
      </Button>
      <Button
        size="icon"
        variant="ghost"
        className="size-7 text-destructive hover:text-destructive hover:bg-destructive/10"
        disabled={isPending}
        onClick={() => handle("reject")}
        title="Zamietnuť"
      >
        <X className="size-4" />
      </Button>
    </div>
  )
}

export function RequestedRulesPanel({ rows }: Props) {
  if (rows.length === 0) return null

  return (
    <Card className="border-amber-200 bg-amber-50/40 dark:bg-amber-950/10 dark:border-amber-800/40">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <RefreshCw className="size-4 text-amber-600" />
          Žiadosti o opakujúce sa zmeny
          <Badge className="bg-amber-500/15 text-amber-700 border-0 hover:bg-amber-500/15">
            {rows.length}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <div className="rounded-b-lg overflow-hidden border-t border-amber-200 dark:border-amber-800/40">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Zamestnanec</TableHead>
                <TableHead>Typ</TableHead>
                <TableHead>Dni / Dátum</TableHead>
                <TableHead>Obdobie</TableHead>
                <TableHead>Čas</TableHead>
                <TableHead>Poznámka</TableHead>
                <TableHead className="w-20" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">{r.userName ?? "—"}</TableCell>
                  <TableCell>
                    {r.frequency === "once" ? "Jednorazová" : "Týždenná"}
                  </TableCell>
                  <TableCell>
                    {r.frequency === "once"
                      ? formatDate(r.date)
                      : formatDays(r.days)}
                  </TableCell>
                  <TableCell>
                    {r.frequency !== "once"
                      ? `${formatDate(r.validFrom)} – ${formatDate(r.validUntil)}`
                      : "—"}
                  </TableCell>
                  <TableCell>
                    {r.allDay
                      ? "Celý deň"
                      : r.startTime && r.endTime
                        ? `${r.startTime.slice(0, 5)}–${r.endTime.slice(0, 5)}`
                        : "—"}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{r.note ?? "—"}</TableCell>
                  <TableCell>
                    <RowActions id={r.id} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  )
}
