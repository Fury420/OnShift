"use client"

import { useState, useTransition } from "react"
import { Button } from "@/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { respondToReplacement } from "@/app/actions/shift-replacements"

export interface IncomingRequest {
  id: string
  shiftDate: string
  shiftTime: string
  requesterName: string
  note: string | null
}

export function IncomingRequestsTable({ requests }: { requests: IncomingRequest[] }) {
  const [pending, startTransition] = useTransition()
  const [loadingId, setLoadingId] = useState<string | null>(null)

  function respond(id: string, response: "accepted" | "rejected") {
    setLoadingId(id)
    startTransition(async () => {
      await respondToReplacement(id, response)
      setLoadingId(null)
    })
  }

  return (
    <div className="overflow-x-auto rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Zmena</TableHead>
            <TableHead>Žiadateľ</TableHead>
            <TableHead>Poznámka</TableHead>
            <TableHead className="text-right">Akcia</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {requests.length === 0 ? (
            <TableRow>
              <TableCell colSpan={4} className="py-10 text-center text-muted-foreground">
                Žiadne čakajúce žiadosti
              </TableCell>
            </TableRow>
          ) : (
            requests.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="font-medium">
                  {r.shiftDate}
                  <span className="ml-2 text-muted-foreground text-sm">{r.shiftTime}</span>
                </TableCell>
                <TableCell>{r.requesterName}</TableCell>
                <TableCell className="text-muted-foreground">{r.note ?? "—"}</TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-2">
                    <Button
                      size="sm"
                      disabled={pending && loadingId === r.id}
                      onClick={() => respond(r.id, "accepted")}
                    >
                      Prijať
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={pending && loadingId === r.id}
                      onClick={() => respond(r.id, "rejected")}
                    >
                      Odmietnuť
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  )
}
