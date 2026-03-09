"use client"

import { useState, useTransition, useEffect } from "react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { createEmployee, updateEmployee } from "@/app/actions/employees"

export interface PositionOption {
  id: string
  name: string
  color: string | null
}

export interface EmployeeForEdit {
  id: string
  name: string
  role: "superadmin" | "admin" | "employee"
  color: string
  hourlyRate: number | null
  positionId: string | null
}

interface EmployeeDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  employee?: EmployeeForEdit
  positions?: PositionOption[]
}

const PRESET_COLORS = [
  "#3b82f6", // blue
  "#10b981", // emerald
  "#f59e0b", // amber
  "#ef4444", // red
  "#8b5cf6", // violet
  "#ec4899", // pink
  "#06b6d4", // cyan
  "#f97316", // orange
]

export function EmployeeDialog({ open, onOpenChange, employee, positions = [] }: EmployeeDialogProps) {
  const isEdit = !!employee

  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [role, setRole] = useState<"admin" | "employee">("employee")
  const [color, setColor] = useState(PRESET_COLORS[0])
  const [positionId, setPositionId] = useState("")
  const [hourlyRate, setHourlyRate] = useState("")
  const [error, setError] = useState("")
  const [isPending, startTransition] = useTransition()

  useEffect(() => {
    if (open) {
      setName(employee?.name ?? "")
      setEmail("")
      setPassword("")
      setRole((employee?.role === "admin" ? "admin" : "employee") as "admin" | "employee")
      setColor(employee?.color || PRESET_COLORS[0])
      setPositionId(employee?.positionId ?? "")
      setHourlyRate(employee?.hourlyRate != null ? String(employee.hourlyRate) : "")
      setError("")
    }
  }, [open, employee])

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError("")

    const parsedRate = hourlyRate !== "" ? parseFloat(hourlyRate) : null

    startTransition(async () => {
      try {
        if (isEdit) {
          await updateEmployee(employee.id, { name, role, color, hourlyRate: parsedRate, positionId: positionId || null })
        } else {
          await createEmployee({ name, email, password, role, color, hourlyRate: parsedRate, positionId: positionId || null })
        }
        onOpenChange(false)
      } catch (err) {
        setError(err instanceof Error ? err.message : "Nastala chyba")
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Upraviť zamestnanca" : "Pridať zamestnanca"}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="name">Meno</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ján Novák"
              required
            />
          </div>

          {!isEdit && (
            <>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="jan@example.com"
                  required
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="password">Dočasné heslo</Label>
                <Input
                  id="password"
                  type="text"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="min. 8 znakov"
                  minLength={8}
                  required
                />
                <p className="text-xs text-muted-foreground">
                  Zdieľajte heslo so zamestnancom — môže si ho zmeniť po prihlásení.
                </p>
              </div>
            </>
          )}

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="role">Rola</Label>
            <Select value={role} onValueChange={(v) => setRole(v as "admin" | "employee")}>
              <SelectTrigger id="role">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="employee">Zamestnanec</SelectItem>
                <SelectItem value="admin">Admin</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {positions.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="position">Pozícia</Label>
              <Select value={positionId || "none"} onValueChange={(v) => setPositionId(v === "none" ? "" : v)}>
                <SelectTrigger id="position">
                  <SelectValue placeholder="Bez pozície" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Bez pozície</SelectItem>
                  {positions.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="flex flex-col gap-1.5">
            <Label>Farba v kalendári</Label>
            <div className="flex items-center gap-2">
              <div className="flex gap-1.5">
                {PRESET_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setColor(c)}
                    className={cn(
                      "size-7 rounded-full transition-transform",
                      color === c && "ring-2 ring-offset-2 ring-foreground scale-110",
                    )}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
              <input
                type="color"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                className="h-7 w-8 cursor-pointer rounded border p-0.5"
                title="Vlastná farba"
              />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="hourlyRate">Hodinová sadzba (€/h)</Label>
            <Input
              id="hourlyRate"
              type="number"
              min={0}
              step={0.01}
              value={hourlyRate}
              onChange={(e) => setHourlyRate(e.target.value)}
              placeholder="napr. 7.50"
            />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Zrušiť
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Ukladám…" : isEdit ? "Uložiť" : "Vytvoriť"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
