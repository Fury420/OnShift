import { db } from "@/db"
import { notifications, user } from "@/db/schema"
import { and, eq, isNull, or } from "drizzle-orm"

export type NotificationType = typeof notifications.$inferInsert.type

type CreateNotificationInput = {
  organizationId: string
  actorId: string
  recipientIds: string[]
  type: NotificationType
  title: string
  body?: string
  linkUrl: string
  referenceId?: string
}

/** Insert in-app notifications for each recipient (excluding the actor). */
export async function createNotification(input: CreateNotificationInput) {
  const recipients = input.recipientIds.filter((id) => id !== input.actorId)
  if (recipients.length === 0) return

  const rows = recipients.map((recipientId) => ({
    organizationId: input.organizationId,
    recipientId,
    type: input.type,
    title: input.title,
    body: input.body ?? null,
    linkUrl: input.linkUrl,
    referenceId: input.referenceId ?? null,
  }))

  await db.insert(notifications).values(rows)
}

/** Get IDs of all non-archived admins and managers in an organization. */
export async function getAdminIds(organizationId: string): Promise<string[]> {
  const admins = await db
    .select({ id: user.id })
    .from(user)
    .where(
      and(
        eq(user.organizationId, organizationId),
        or(eq(user.role, "admin"), eq(user.role, "manager")),
        isNull(user.archivedAt),
      ),
    )
  return admins.map((a) => a.id)
}

/** Get IDs of all non-archived employees in an organization. */
export async function getOrgEmployeeIds(organizationId: string): Promise<string[]> {
  const employees = await db
    .select({ id: user.id })
    .from(user)
    .where(
      and(
        eq(user.organizationId, organizationId),
        isNull(user.archivedAt),
      ),
    )
  return employees.map((e) => e.id)
}
