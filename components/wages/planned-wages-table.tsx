"use client"

import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

export interface PlannedWagesRow {
  userId: string
  name: string
  color: string | null
  totalMinutes: number
  hourlyRate: number | null
}

interface PlannedWagesTableProps {
  rows: PlannedWagesRow[]
}

function initials(name: string) {
  return name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2)
}

function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m === 0 ? `${h}h` : `${h}h ${String(m).padStart(2, "0")}m`
}

function formatWage(amount: number): string {
  return amount.toLocaleString("sk-SK", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €"
}

export function PlannedWagesTable({ rows }: PlannedWagesTableProps) {
  const totalWage = rows.reduce((sum, r) => {
    if (r.hourlyRate == null) return sum
    return sum + (r.totalMinutes / 60) * r.hourlyRate
  }, 0)

  const hasAnyRate = rows.some((r) => r.hourlyRate != null)

  return (
    <div className="overflow-x-auto rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Zamestnanec</TableHead>
            <TableHead className="text-right">Naplánované</TableHead>
            <TableHead className="text-right">Sadzba</TableHead>
            <TableHead className="text-right">Odhad mzdy</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 ? (
            <TableRow>
              <TableCell colSpan={4} className="py-10 text-center text-muted-foreground">
                Žiadne zverejnené zmeny za tento mesiac.
              </TableCell>
            </TableRow>
          ) : (
            rows.map((r) => {
              const wage = r.hourlyRate != null ? (r.totalMinutes / 60) * r.hourlyRate : null
              return (
                <TableRow key={r.userId}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <Avatar className="size-7">
                        <AvatarFallback
                          className="text-xs"
                          style={r.color ? { backgroundColor: r.color + "30", color: r.color } : undefined}
                        >
                          {initials(r.name)}
                        </AvatarFallback>
                      </Avatar>
                      <span className="font-medium">{r.name}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm tabular-nums">
                    {formatDuration(r.totalMinutes)}
                  </TableCell>
                  <TableCell className="text-right text-muted-foreground tabular-nums">
                    {r.hourlyRate != null
                      ? `${r.hourlyRate.toFixed(2).replace(".", ",")} €/h`
                      : "—"}
                  </TableCell>
                  <TableCell className="text-right font-medium tabular-nums">
                    {wage != null ? formatWage(wage) : "—"}
                  </TableCell>
                </TableRow>
              )
            })
          )}
        </TableBody>
        {rows.length > 0 && hasAnyRate && (
          <TableFooter>
            <TableRow>
              <TableCell colSpan={3} className="font-medium">Celkom</TableCell>
              <TableCell className="text-right font-semibold tabular-nums">
                {formatWage(totalWage)}
              </TableCell>
            </TableRow>
          </TableFooter>
        )}
      </Table>
    </div>
  )
}
