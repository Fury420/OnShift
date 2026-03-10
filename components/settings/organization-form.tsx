"use client"

import { useState, useTransition } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { updateOrganizationDetails } from "@/app/actions/organizations"
import { toast } from "sonner"

interface OrganizationFormProps {
  org: {
    name: string
    ico: string | null
    dic: string | null
    icDph: string | null
    address: string | null
    phone: string | null
    email: string | null
  }
}

export function OrganizationForm({ org }: OrganizationFormProps) {
  const [name, setName] = useState(org.name)
  const [ico, setIco] = useState(org.ico ?? "")
  const [dic, setDic] = useState(org.dic ?? "")
  const [icDph, setIcDph] = useState(org.icDph ?? "")
  const [address, setAddress] = useState(org.address ?? "")
  const [phone, setPhone] = useState(org.phone ?? "")
  const [email, setEmail] = useState(org.email ?? "")
  const [isPending, startTransition] = useTransition()

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    startTransition(async () => {
      try {
        await updateOrganizationDetails({
          name: name.trim(),
          ico: ico.trim() || undefined,
          dic: dic.trim() || undefined,
          icDph: icDph.trim() || undefined,
          address: address.trim() || undefined,
          phone: phone.trim() || undefined,
          email: email.trim() || undefined,
        })
        toast.success("Údaje firmy boli uložené")
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Chyba pri ukladaní")
      }
    })
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <Label htmlFor="org-name">Názov firmy *</Label>
          <Input id="org-name" value={name} onChange={(e) => setName(e.target.value)} required />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="org-ico">IČO</Label>
          <Input id="org-ico" value={ico} onChange={(e) => setIco(e.target.value)} placeholder="12345678" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="org-dic">DIČ</Label>
          <Input id="org-dic" value={dic} onChange={(e) => setDic(e.target.value)} placeholder="2012345678" />
        </div>
        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <Label htmlFor="org-ic-dph">IČ DPH</Label>
          <Input id="org-ic-dph" value={icDph} onChange={(e) => setIcDph(e.target.value)} placeholder="SK2012345678" />
        </div>
        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <Label htmlFor="org-address">Adresa</Label>
          <Input id="org-address" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Hlavná 1, 811 01 Bratislava" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="org-phone">Telefón</Label>
          <Input id="org-phone" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+421 9XX XXX XXX" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="org-email">E-mail</Label>
          <Input id="org-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="info@firma.sk" />
        </div>
      </div>
      <div>
        <Button type="submit" disabled={isPending || !name.trim()}>
          {isPending ? "Ukladám…" : "Uložiť"}
        </Button>
      </div>
    </form>
  )
}
