import { db } from "@/db"
import { wageRates } from "@/db/schema"
import { and, asc, desc, eq, inArray } from "drizzle-orm"

export const WAGE_TZ = "Europe/Bratislava"

/** Jeden bod v histórii sadzieb: od tohto dňa (vrátane) platí `rate`. */
export interface RatePoint {
  effectiveFrom: string // YYYY-MM-DD
  rate: number
}

/**
 * Sadzba platná pre daný deň `dateStr` (YYYY-MM-DD).
 * `points` musia byť utriedené ZOSTUPNE podľa effectiveFrom (viď getRateHistory).
 * Vráti prvý bod s effectiveFrom <= dateStr, inak null (pred prvým záznamom).
 */
export function rateOn(points: RatePoint[] | undefined, dateStr: string): number | null {
  if (!points) return null
  for (const p of points) {
    if (p.effectiveFrom <= dateStr) return p.rate
  }
  return null
}

/** Lokálny dátum (YYYY-MM-DD) v Europe/Bratislava — konzistentne s výpočtami dochádzky. */
export function localDateStr(date: Date): string {
  return date.toLocaleDateString("en-CA", { timeZone: WAGE_TZ })
}

/**
 * Načíta históriu sadzieb pre organizáciu (voliteľne len pre zadaných userov).
 * Vráti Map<userId, RatePoint[]> utriedenú ZOSTUPNE (najnovšia sadzba prvá) —
 * pripravenú pre rateOn().
 */
export async function getRateHistory(
  orgId: string,
  userIds?: string[],
): Promise<Map<string, RatePoint[]>> {
  const conds = [eq(wageRates.organizationId, orgId)]
  if (userIds) {
    if (userIds.length === 0) return new Map()
    conds.push(inArray(wageRates.userId, userIds))
  }

  const rows = await db
    .select({
      userId: wageRates.userId,
      effectiveFrom: wageRates.effectiveFrom,
      hourlyRate: wageRates.hourlyRate,
    })
    .from(wageRates)
    .where(and(...conds))
    .orderBy(asc(wageRates.userId), desc(wageRates.effectiveFrom))

  const map = new Map<string, RatePoint[]>()
  for (const r of rows) {
    const list = map.get(r.userId) ?? []
    list.push({ effectiveFrom: r.effectiveFrom, rate: parseFloat(r.hourlyRate) })
    map.set(r.userId, list)
  }
  return map
}
