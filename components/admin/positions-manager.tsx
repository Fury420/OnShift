"use client"

import { useState, useTransition } from "react"
import { Plus, Trash2, Pencil, Check, X } from "lucide-react"
import { StaffTabs } from "@/components/admin/staff-tabs"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { createPosition, updatePosition, deletePosition } from "@/app/actions/positions"

interface Position {
  id: string
  name: string
}

interface PositionsManagerProps {
  positions: Position[]
}

export function PositionsManager({ positions }: PositionsManagerProps) {
  const [newName, setNewName] = useState("")
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState("")
  const [isPending, startTransition] = useTransition()

  function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!newName.trim()) return
    startTransition(async () => {
      await createPosition(newName.trim())
      setNewName("")
    })
  }

  function startEdit(pos: Position) {
    setEditingId(pos.id)
    setEditName(pos.name)
  }

  function handleUpdate() {
    if (!editingId || !editName.trim()) return
    startTransition(async () => {
      await updatePosition(editingId, { name: editName.trim() })
      setEditingId(null)
    })
  }

  function handleDelete(id: string) {
    startTransition(() => deletePosition(id))
  }

  return (
    <>
      <div className="flex items-center justify-between">
        <StaffTabs />
      </div>

      <div className="rounded-md border divide-y">
        {positions.map((pos) => (
          <div key={pos.id} className="flex items-center gap-3 px-4 py-3">
            {editingId === pos.id ? (
              <>
                <Input
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="h-8 flex-1"
                  autoFocus
                  onKeyDown={(e) => { if (e.key === "Enter") handleUpdate(); if (e.key === "Escape") setEditingId(null) }}
                />
                <Button variant="ghost" size="icon" className="size-8" onClick={handleUpdate} disabled={isPending}>
                  <Check className="size-4" />
                </Button>
                <Button variant="ghost" size="icon" className="size-8" onClick={() => setEditingId(null)}>
                  <X className="size-4" />
                </Button>
              </>
            ) : (
              <>
                <span className="flex-1 font-medium">{pos.name}</span>
                <Button variant="ghost" size="icon" className="size-8" onClick={() => startEdit(pos)}>
                  <Pencil className="size-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-8 text-destructive hover:text-destructive"
                  onClick={() => handleDelete(pos.id)}
                  disabled={isPending}
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </>
            )}
          </div>
        ))}

        {positions.length === 0 && (
          <div className="px-4 py-8 text-center text-muted-foreground text-sm">
            Zatiaľ nemáte žiadne pozície. Pridajte prvú nižšie.
          </div>
        )}
      </div>

      <form onSubmit={handleCreate} className="flex items-end gap-3">
        <div className="flex-1 flex flex-col gap-1.5">
          <label className="text-sm font-medium">Nová pozícia</label>
          <Input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="napr. Barman, Čašník, Kuchár…"
          />
        </div>
        <Button type="submit" disabled={isPending || !newName.trim()}>
          <Plus className="size-4" />
          Pridať
        </Button>
      </form>
    </>
  )
}
