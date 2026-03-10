import { redirect } from "next/navigation"
import { cookies } from "next/headers"
import { getSession } from "./session"
import { db } from "@/db"
import { userOrganizations } from "@/db/schema"
import { and, eq } from "drizzle-orm"

export async function requireAdmin() {
  const session = await getSession()
  if (!session) redirect("/login")
  const role = (session.user as { role?: string }).role
  if (role === "admin") return session
  // Superadmin impersonating a tenant gets admin-level access
  if (role === "superadmin") {
    const cookieStore = await cookies()
    if (cookieStore.get("impersonateOrgId")?.value) return session
  }
  redirect("/")
}

export async function requireManagerOrAdmin() {
  const session = await getSession()
  if (!session) redirect("/login")
  const role = (session.user as { role?: string }).role
  if (role === "admin" || role === "manager") return session
  if (role === "superadmin") {
    const cookieStore = await cookies()
    if (cookieStore.get("impersonateOrgId")?.value) return session
  }
  redirect("/")
}

export function isManagerOrAdmin(role?: string): boolean {
  return role === "admin" || role === "manager" || role === "superadmin"
}

export async function requireSuperAdmin() {
  const session = await getSession()
  if (!session) redirect("/login")
  const role = (session.user as { role?: string }).role
  if (role !== "superadmin") redirect("/")
  return session
}

export async function getOrganizationId(): Promise<string> {
  const session = await getSession()
  if (!session) throw new Error("Neprihlásený")

  const role = (session.user as { role?: string }).role
  const cookieStore = await cookies()

  // Superadmin impersonation
  if (role === "superadmin") {
    const impersonateOrgId = cookieStore.get("impersonateOrgId")?.value
    if (!impersonateOrgId) throw new Error("Superadmin nemá nastavenú organizáciu")
    return impersonateOrgId
  }

  // Regular users: check activeOrgId cookie first
  const cookieOrgId = cookieStore.get("activeOrgId")?.value
  if (cookieOrgId) {
    const [membership] = await db
      .select({ organizationId: userOrganizations.organizationId })
      .from(userOrganizations)
      .where(
        and(
          eq(userOrganizations.userId, session.user.id),
          eq(userOrganizations.organizationId, cookieOrgId),
        ),
      )
      .limit(1)
    if (membership) return membership.organizationId
    // stale cookie → fallthrough
  }

  const orgId = (session.user as { organizationId?: string | null }).organizationId
  if (!orgId) throw new Error("Používateľ nemá organizáciu")
  return orgId
}
