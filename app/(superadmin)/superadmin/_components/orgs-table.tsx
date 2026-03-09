"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Trash2, Pencil, LogIn } from "lucide-react"
import { deleteOrganization, impersonateOrganization } from "@/app/actions/organizations"
import { EditOrgDialog } from "./edit-org-dialog"

const LICENSE_LABELS: Record<string, string> = {
  free: "Free",
  basic: "Basic",
  pro: "Pro",
}

const LICENSE_VARIANTS: Record<string, "secondary" | "default" | "outline"> = {
  free: "secondary",
  basic: "outline",
  pro: "default",
}

interface OrgRow {
  id: string
  name: string
  ico: string | null
  dic: string | null
  icDph: string | null
  address: string | null
  phone: string | null
  email: string | null
  licenseType: "free" | "basic" | "pro"
  userCount: number
  createdAt: string
}

export function OrgsTable({ rows }: { rows: OrgRow[] }) {
  const router = useRouter()
  const [deleting, setDeleting] = useState<string | null>(null)
  const [editing, setEditing] = useState<OrgRow | null>(null)
  const [isPending, startTransition] = useTransition()

  async function handleDelete(id: string, name: string) {
    if (!confirm(`Naozaj chceš zmazať organizáciu "${name}"? Táto akcia je nezvratná.`)) return
    setDeleting(id)
    try {
      await deleteOrganization(id)
    } finally {
      setDeleting(null)
    }
  }

  function handleImpersonate(id: string) {
    startTransition(async () => {
      await impersonateOrganization(id)
      router.push("/")
    })
  }

  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground">Žiadne organizácie.</p>
  }

  return (
    <>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Názov</TableHead>
            <TableHead>IČO</TableHead>
            <TableHead>DIČ</TableHead>
            <TableHead>Adresa</TableHead>
            <TableHead>Email</TableHead>
            <TableHead className="text-right">Zamestnanci</TableHead>
            <TableHead>Licencia</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.id}>
              <TableCell className="font-medium">{row.name}</TableCell>
              <TableCell className="text-muted-foreground">{row.ico ?? "—"}</TableCell>
              <TableCell className="text-muted-foreground">{row.dic ?? "—"}</TableCell>
              <TableCell className="text-muted-foreground max-w-[160px] truncate">{row.address ?? "—"}</TableCell>
              <TableCell className="text-muted-foreground">{row.email ?? "—"}</TableCell>
              <TableCell className="text-right">{row.userCount}</TableCell>
              <TableCell>
                <Badge variant={LICENSE_VARIANTS[row.licenseType]}>
                  {LICENSE_LABELS[row.licenseType]}
                </Badge>
              </TableCell>
              <TableCell className="text-right">
                <div className="flex items-center justify-end gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    disabled={isPending}
                    onClick={() => handleImpersonate(row.id)}
                    title="Vstúpiť ako tenant"
                  >
                    <LogIn className="size-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setEditing(row)}
                  >
                    <Pencil className="size-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-destructive hover:text-destructive"
                    disabled={deleting === row.id}
                    onClick={() => handleDelete(row.id, row.name)}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <EditOrgDialog org={editing} onClose={() => setEditing(null)} />
    </>
  )
}
