"use client"

import { useState, useEffect } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { updateOrganization } from "@/app/actions/organizations"

interface OrgDetail {
  id: string
  name: string
  ico: string | null
  dic: string | null
  icDph: string | null
  address: string | null
  phone: string | null
  email: string | null
  licenseType: "free" | "basic" | "pro"
}

interface Props {
  org: OrgDetail | null
  onClose: () => void
}

export function EditOrgDialog({ org, onClose }: Props) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [licenseType, setLicenseType] = useState<"free" | "basic" | "pro">("free")

  useEffect(() => {
    if (org) {
      setError(null)
      setLicenseType(org.licenseType)
    }
  }, [org])

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!org) return
    const fd = new FormData(e.currentTarget)
    setLoading(true)
    setError(null)
    try {
      await updateOrganization(org.id, {
        name: fd.get("name") as string,
        ico: fd.get("ico") as string,
        dic: fd.get("dic") as string,
        icDph: fd.get("icDph") as string,
        address: fd.get("address") as string,
        phone: fd.get("phone") as string,
        email: fd.get("email") as string,
        licenseType,
      })
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Chyba")
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={!!org} onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Upraviť organizáciu</DialogTitle>
        </DialogHeader>
        {org && (
          <form onSubmit={handleSubmit} className="flex flex-col gap-4 mt-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="name">Názov</Label>
              <Input id="name" name="name" required defaultValue={org.name} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="ico">IČO</Label>
              <Input id="ico" name="ico" defaultValue={org.ico ?? ""} placeholder="12345678" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="dic">DIČ</Label>
              <Input id="dic" name="dic" defaultValue={org.dic ?? ""} placeholder="2012345678" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="icDph">IČ DPH</Label>
              <Input id="icDph" name="icDph" defaultValue={org.icDph ?? ""} placeholder="SK2012345678" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="address">Adresa</Label>
              <Input id="address" name="address" defaultValue={org.address ?? ""} placeholder="Hlavná 1, 811 01 Bratislava" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="phone">Telefón</Label>
              <Input id="phone" name="phone" type="tel" defaultValue={org.phone ?? ""} placeholder="+421 900 000 000" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="email">Email</Label>
              <Input id="email" name="email" type="email" defaultValue={org.email ?? ""} placeholder="info@bar.sk" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Licencia</Label>
              <Select value={licenseType} onValueChange={(v) => setLicenseType(v as "free" | "basic" | "pro")}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="free">Free</SelectItem>
                  <SelectItem value="basic">Basic</SelectItem>
                  <SelectItem value="pro">Pro</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="submit" disabled={loading}>
              {loading ? "Ukladám..." : "Uložiť"}
            </Button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}
