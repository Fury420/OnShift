"use server"

import { db } from "@/db"
import { user, wageRates } from "@/db/schema"
import { and, eq } from "drizzle-orm"
import { revalidatePath } from "next/cache"
import { requireAdmin, getOrganizationId } from "@/lib/auth-guard"
import { getRateHistory, rateOn, localDateStr } from "@/lib/wages"

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

function validate(hourlyRate: number, effectiveFrom: string) {
  if (!Number.isFinite(hourlyRate) || hourlyRate < 0) {
    throw new Error("Neplatná sadzba.")
  }
  if (!DATE_RE.test(effectiveFrom)) {
    throw new Error("Neplatný dátum účinnosti.")
  }
}

/**
 * Prepočíta cache user.hourlyRate = sadzba platná dnes (podľa histórie).
 * Volané po každej zmene histórie.
 */
async function recalcCurrentRate(userId: string, orgId: string) {
  const history = await getRateHistory(orgId, [userId])
  const current = rateOn(history.get(userId), localDateStr(new Date()))
  await db
    .update(user)
    .set({ hourlyRate: current != null ? String(current) : null, updatedAt: new Date() })
    .where(and(eq(user.id, userId), eq(user.organizationId, orgId)))
}

export async function addWageRate(userId: string, hourlyRate: number, effectiveFrom: string) {
  const session = await requireAdmin()
  const orgId = await getOrganizationId()
  validate(hourlyRate, effectiveFrom)

  // Cieľový user musí patriť do organizácie
  const [target] = await db
    .select({ id: user.id })
    .from(user)
    .where(and(eq(user.id, userId), eq(user.organizationId, orgId)))
    .limit(1)
  if (!target) throw new Error("Zamestnanec sa nenašiel.")

  await db
    .insert(wageRates)
    .values({
      organizationId: orgId,
      userId,
      hourlyRate: String(hourlyRate),
      effectiveFrom,
      createdBy: session.user.id,
    })
    .onConflictDoUpdate({
      target: [wageRates.userId, wageRates.effectiveFrom],
      set: { hourlyRate: String(hourlyRate) },
    })

  await recalcCurrentRate(userId, orgId)
  revalidatePath("/admin/employees")
  revalidatePath("/admin/reports")
}

export async function updateWageRate(
  id: string,
  data: { hourlyRate: number; effectiveFrom: string },
) {
  await requireAdmin()
  const orgId = await getOrganizationId()
  validate(data.hourlyRate, data.effectiveFrom)

  const [existing] = await db
    .select({ userId: wageRates.userId })
    .from(wageRates)
    .where(and(eq(wageRates.id, id), eq(wageRates.organizationId, orgId)))
    .limit(1)
  if (!existing) throw new Error("Záznam sa nenašiel.")

  try {
    await db
      .update(wageRates)
      .set({ hourlyRate: String(data.hourlyRate), effectiveFrom: data.effectiveFrom })
      .where(and(eq(wageRates.id, id), eq(wageRates.organizationId, orgId)))
  } catch {
    throw new Error("Pre tento dátum už existuje sadzba. Zvoľte iný dátum alebo upravte existujúci záznam.")
  }

  await recalcCurrentRate(existing.userId, orgId)
  revalidatePath("/admin/employees")
  revalidatePath("/admin/reports")
}

export async function deleteWageRate(id: string) {
  await requireAdmin()
  const orgId = await getOrganizationId()

  const [existing] = await db
    .select({ userId: wageRates.userId })
    .from(wageRates)
    .where(and(eq(wageRates.id, id), eq(wageRates.organizationId, orgId)))
    .limit(1)
  if (!existing) throw new Error("Záznam sa nenašiel.")

  await db.delete(wageRates).where(and(eq(wageRates.id, id), eq(wageRates.organizationId, orgId)))

  await recalcCurrentRate(existing.userId, orgId)
  revalidatePath("/admin/employees")
  revalidatePath("/admin/reports")
}
