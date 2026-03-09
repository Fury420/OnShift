"use server"

import { auth } from "@/lib/auth"
import { db } from "@/db"
import { organizations, user, userOrganizations } from "@/db/schema"
import { eq, and } from "drizzle-orm"
import { revalidatePath } from "next/cache"
import { requireSuperAdmin } from "@/lib/auth-guard"
import { getSession } from "@/lib/session"
import { cookies } from "next/headers"
import { redirect } from "next/navigation"

export async function createOrganization(data: {
  name: string
  ico?: string
  dic?: string
  address?: string
  phone?: string
  email?: string
  adminName: string
  adminEmail: string
  adminPassword: string
}) {
  await requireSuperAdmin()

  const [org] = await db
    .insert(organizations)
    .values({
      name: data.name,
      ico: data.ico || null,
      dic: data.dic || null,
      address: data.address || null,
      phone: data.phone || null,
      email: data.email || null,
    })
    .returning({ id: organizations.id })

  const result = await auth.api.signUpEmail({
    body: { name: data.adminName, email: data.adminEmail, password: data.adminPassword },
  })

  if (!result || "error" in result) {
    await db.delete(organizations).where(eq(organizations.id, org.id))
    throw new Error("Nepodarilo sa vytvoriť admin účet. Email možno už existuje.")
  }

  await db
    .update(user)
    .set({
      role: "admin",
      organizationId: org.id,
      emailVerified: true,
      mustChangePassword: true,
    })
    .where(eq(user.email, data.adminEmail))

  await db
    .insert(userOrganizations)
    .values({ userId: result.user.id, organizationId: org.id })
    .onConflictDoNothing()

  revalidatePath("/superadmin")
}

export async function switchOrganization(orgId: string) {
  const session = await getSession()
  if (!session) throw new Error("Neprihlásený")

  const [membership] = await db
    .select({ organizationId: userOrganizations.organizationId })
    .from(userOrganizations)
    .where(
      and(
        eq(userOrganizations.userId, session.user.id),
        eq(userOrganizations.organizationId, orgId),
      ),
    )
    .limit(1)

  if (!membership) throw new Error("Nemáš prístup k tejto organizácii")

  const cookieStore = await cookies()
  cookieStore.set("activeOrgId", orgId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  })

  revalidatePath("/", "layout")
}

export async function impersonateOrganization(orgId: string) {
  await requireSuperAdmin()

  const [org] = await db
    .select({ id: organizations.id })
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .limit(1)

  if (!org) throw new Error("Organizácia neexistuje")

  const cookieStore = await cookies()
  cookieStore.set("impersonateOrgId", orgId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 8,
  })
}

export async function stopImpersonating() {
  const cookieStore = await cookies()
  cookieStore.delete("impersonateOrgId")
}

export async function updateOrganizationDetails(data: {
  name: string
  ico?: string
  dic?: string
  icDph?: string
  address?: string
  phone?: string
  email?: string
}) {
  const session = await getSession()
  if (!session) throw new Error("Neprihlásený")

  const role = (session.user as { role?: string }).role
  if (role !== "admin" && role !== "superadmin") throw new Error("Nedostatočné oprávnenia")

  const cookieStore = await cookies()
  let orgId: string | undefined

  if (role === "superadmin") {
    orgId = cookieStore.get("impersonateOrgId")?.value
  } else {
    orgId = (session.user as { organizationId?: string | null }).organizationId ?? undefined
    const cookieOrgId = cookieStore.get("activeOrgId")?.value
    if (cookieOrgId) orgId = cookieOrgId
  }

  if (!orgId) throw new Error("Organizácia nenájdená")

  await db
    .update(organizations)
    .set({
      name: data.name,
      ico: data.ico || null,
      dic: data.dic || null,
      icDph: data.icDph || null,
      address: data.address || null,
      phone: data.phone || null,
      email: data.email || null,
      updatedAt: new Date(),
    })
    .where(eq(organizations.id, orgId))

  revalidatePath("/admin/settings")
  revalidatePath("/", "layout")
}

export async function deleteOrganization(id: string) {
  await requireSuperAdmin()
  await db.delete(organizations).where(eq(organizations.id, id))
  revalidatePath("/superadmin")
}

export async function updateOrganization(
  id: string,
  data: { name: string; ico?: string; dic?: string; icDph?: string; address?: string; phone?: string; email?: string; licenseType?: "free" | "basic" | "pro" },
) {
  await requireSuperAdmin()

  await db
    .update(organizations)
    .set({
      name: data.name,
      ico: data.ico || null,
      dic: data.dic || null,
      icDph: data.icDph || null,
      address: data.address || null,
      phone: data.phone || null,
      email: data.email || null,
      ...(data.licenseType && { licenseType: data.licenseType }),
      updatedAt: new Date(),
    })
    .where(eq(organizations.id, id))

  revalidatePath("/superadmin")
}
