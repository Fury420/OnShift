import { toDateStr, addDays } from "./week"

/**
 * A shift rule as stored in the database.
 */
export interface ShiftRule {
  id: string
  organizationId: string
  userId: string | null
  frequency: "once" | "weekly" | "monthly"
  date: string | null
  days: string | null            // comma-separated: "1,2,3,4,5"
  dayOfMonth: string | null      // comma-separated: "1,15"
  validFrom: string | null
  validUntil: string | null
  startTime: string | null
  endTime: string | null
  allDay: boolean
  maxClaims?: number
  note: string | null
  status: "requested" | "draft" | "open" | "published"
}

export interface ShiftException {
  id: string
  ruleId: string
  date: string
  action: "skip" | "modify"
  userId: string | null
  startTime: string | null
  endTime: string | null
  note: string | null
}

export interface BusinessHoursMap {
  get(dayOfWeek: string): { openTime: string | null; closeTime: string | null; isClosed: boolean } | undefined
}

/**
 * A virtual shift instance generated from a rule.
 */
export interface ShiftInstance {
  ruleId: string
  userId: string | null
  date: string
  startTime: string
  endTime: string
  allDay: boolean
  maxClaims?: number
  note: string | null
  status: "requested" | "draft" | "open" | "published"
  isException: boolean    // true if this instance was modified by an exception
  exceptionId?: string
  frequency: "once" | "weekly" | "monthly"
}

/**
 * Expand a set of shift rules into concrete shift instances for the given date range.
 * Applies exceptions (skip / modify).
 */
export function expandRules(
  rules: ShiftRule[],
  exceptions: ShiftException[],
  rangeStart: string,
  rangeEnd: string,
  businessHours?: BusinessHoursMap,
): ShiftInstance[] {
  // Index exceptions by ruleId+date
  const exMap = new Map<string, ShiftException>()
  for (const ex of exceptions) {
    exMap.set(`${ex.ruleId}:${ex.date}`, ex)
  }

  const instances: ShiftInstance[] = []

  for (const rule of rules) {
    const dates = getRuleDates(rule, rangeStart, rangeEnd)

    for (const dateStr of dates) {
      const key = `${rule.id}:${dateStr}`
      const ex = exMap.get(key)

      // Skip if exception says so
      if (ex?.action === "skip") continue

      // Resolve times
      let startTime = rule.startTime?.slice(0, 5) ?? ""
      let endTime = rule.endTime?.slice(0, 5) ?? ""
      let userId = rule.userId
      let note = rule.note

      // allDay → use business hours
      if (rule.allDay && businessHours) {
        const dow = String(new Date(dateStr + "T12:00:00").getDay())
        const bh = businessHours.get(dow)
        if (bh && !bh.isClosed && bh.openTime && bh.closeTime) {
          startTime = bh.openTime.slice(0, 5)
          endTime = bh.closeTime.slice(0, 5)
        } else {
          // closed day, skip
          continue
        }
      }

      // Apply modification from exception
      if (ex?.action === "modify") {
        if (ex.startTime) startTime = ex.startTime.slice(0, 5)
        if (ex.endTime) endTime = ex.endTime.slice(0, 5)
        if (ex.userId !== null) userId = ex.userId
        if (ex.note !== null) note = ex.note
      }

      if (!startTime || !endTime) continue

      instances.push({
        ruleId: rule.id,
        userId,
        date: dateStr,
        startTime,
        endTime,
        allDay: rule.allDay,
        maxClaims: rule.maxClaims,
        note,
        status: rule.status,
        isException: !!ex,
        exceptionId: ex?.id,
        frequency: rule.frequency,
      })
    }
  }

  return instances
}

/**
 * Get all dates a rule applies to within [rangeStart, rangeEnd].
 */
function getRuleDates(rule: ShiftRule, rangeStart: string, rangeEnd: string): string[] {
  if (rule.frequency === "once") {
    if (!rule.date) return []
    if (rule.date >= rangeStart && rule.date <= rangeEnd) return [rule.date]
    return []
  }

  // Recurring — determine effective range
  const effStart = maxDate(rule.validFrom ?? rangeStart, rangeStart)
  const effEnd = minDate(rule.validUntil ?? rangeEnd, rangeEnd)
  if (effStart > effEnd) return []

  if (rule.frequency === "weekly") {
    return getWeeklyDates(rule.days, effStart, effEnd)
  }

  if (rule.frequency === "monthly") {
    return getMonthlyDates(rule.dayOfMonth, effStart, effEnd)
  }

  return []
}

function getWeeklyDates(daysStr: string | null, start: string, end: string): string[] {
  if (!daysStr) return []
  const days = daysStr.split(",").map(Number)
  const result: string[] = []

  const [sy, sm, sd] = start.split("-").map(Number)
  let cur = new Date(sy, sm - 1, sd, 12, 0, 0)

  while (toDateStr(cur) <= end) {
    if (days.includes(cur.getDay())) {
      result.push(toDateStr(cur))
    }
    cur = addDays(cur, 1)
  }

  return result
}

function getMonthlyDates(dayOfMonthStr: string | null, start: string, end: string): string[] {
  if (!dayOfMonthStr) return []
  const daysOfMonth = dayOfMonthStr.split(",").map(Number)
  const result: string[] = []

  const [sy, sm] = start.split("-").map(Number)
  const [ey, em] = end.split("-").map(Number)

  let year = sy
  let month = sm
  while (year < ey || (year === ey && month <= em)) {
    const daysInMonth = new Date(year, month, 0).getDate()
    for (const dom of daysOfMonth) {
      if (dom < 1 || dom > daysInMonth) continue
      const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(dom).padStart(2, "0")}`
      if (dateStr >= start && dateStr <= end) {
        result.push(dateStr)
      }
    }
    month++
    if (month > 12) { month = 1; year++ }
  }

  return result
}

function maxDate(a: string, b: string): string {
  return a > b ? a : b
}

function minDate(a: string, b: string): string {
  return a < b ? a : b
}
