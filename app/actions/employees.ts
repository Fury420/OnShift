"use server"

import { auth } from "@/lib/auth"
import { db } from "@/db"
import { user, userOrganizations, wageRates } from "@/db/schema"
import { eq, and } from "drizzle-orm"
import { revalidatePath } from "next/cache"
import { requireAdmin, getOrganizationId } from "@/lib/auth-guard"
import { localDateStr } from "@/lib/wages"

export async function createEmployee(data: {
  name: string
  email: string
  password: string
  role: "admin" | "manager" | "employee"
  color: string
  hourlyRate?: number | null
  effectiveFrom?: string | null
  positionId?: string | null
}) {
  await requireAdmin()
  const orgId = await getOrganizationId()

  const result = await auth.api.signUpEmail({
    body: { name: data.name, email: data.email, password: data.password },
  })

  if (!result || "error" in result) {
    throw new Error("Nepodarilo sa vytvoriť účet. Email možno už existuje.")
  }

  await db
    .update(user)
    .set({
      role: data.role,
      organizationId: orgId,
      emailVerified: true,
      color: data.color || null,
      mustChangePassword: true,
      hourlyRate: data.hourlyRate != null ? String(data.hourlyRate) : null,
      positionId: data.positionId || null,
    })
    .where(eq(user.email, data.email))

  await db
    .insert(userOrganizations)
    .values({ userId: result.user.id, organizationId: orgId })
    .onConflictDoNothing()

  // Počiatočná sadzba → prvý záznam histórie (platí od zadaného dátumu, default dnes)
  if (data.hourlyRate != null) {
    await db.insert(wageRates).values({
      organizationId: orgId,
      userId: result.user.id,
      hourlyRate: String(data.hourlyRate),
      effectiveFrom: data.effectiveFrom || localDateStr(new Date()),
    })
  }

  revalidatePath("/admin/employees")
}

export async function updateEmployee(
  id: string,
  data: { name: string; role: "admin" | "manager" | "employee"; color: string; positionId?: string | null },
) {
  await requireAdmin()
  const orgId = await getOrganizationId()

  // Pozn.: mzda (hourlyRate) sa už nemení tu — spravuje sa cez históriu sadzieb
  // (app/actions/wage-rates.ts), aby mala dátum účinnosti.
  await db
    .update(user)
    .set({
      name: data.name,
      role: data.role,
      color: data.color || null,
      positionId: data.positionId || null,
      updatedAt: new Date(),
    })
    .where(and(eq(user.id, id), eq(user.organizationId, orgId)))

  revalidatePath("/admin/employees")
}

export async function deleteEmployee(id: string) {
  const session = await requireAdmin()
  const orgId = await getOrganizationId()

  if (session.user.id === id) {
    throw new Error("Nemôžeš zmazať sám seba.")
  }

  await db.delete(user).where(and(eq(user.id, id), eq(user.organizationId, orgId)))

  revalidatePath("/admin/employees")
}

export async function archiveEmployee(id: string) {
  const session = await requireAdmin()
  const orgId = await getOrganizationId()

  if (session.user.id === id) {
    throw new Error("Nemôžeš archivovať sám seba.")
  }

  await db
    .update(user)
    .set({ archivedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(user.id, id), eq(user.organizationId, orgId)))

  revalidatePath("/admin/employees")
}

export async function unarchiveEmployee(id: string) {
  await requireAdmin()
  const orgId = await getOrganizationId()

  await db
    .update(user)
    .set({ archivedAt: null, updatedAt: new Date() })
    .where(and(eq(user.id, id), eq(user.organizationId, orgId)))

  revalidatePath("/admin/employees")
}
