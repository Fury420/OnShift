"use server"

import { db } from "@/db"
import { notifications } from "@/db/schema"
import { eq, and, desc, count } from "drizzle-orm"
import { getSession } from "@/lib/session"

export async function getNotifications() {
  const session = await getSession()
  if (!session) throw new Error("Nie ste prihlásený.")

  const [items, unread] = await Promise.all([
    db
      .select()
      .from(notifications)
      .where(eq(notifications.recipientId, session.user.id))
      .orderBy(desc(notifications.createdAt))
      .limit(30),
    db
      .select({ count: count() })
      .from(notifications)
      .where(
        and(
          eq(notifications.recipientId, session.user.id),
          eq(notifications.isRead, false),
        ),
      ),
  ])

  return {
    notifications: items,
    unreadCount: unread[0]?.count ?? 0,
  }
}

export async function getUnreadCount() {
  const session = await getSession()
  if (!session) return 0

  const result = await db
    .select({ count: count() })
    .from(notifications)
    .where(
      and(
        eq(notifications.recipientId, session.user.id),
        eq(notifications.isRead, false),
      ),
    )

  return result[0]?.count ?? 0
}

export async function markAsRead(id: string) {
  const session = await getSession()
  if (!session) throw new Error("Nie ste prihlásený.")

  await db
    .update(notifications)
    .set({ isRead: true })
    .where(
      and(
        eq(notifications.id, id),
        eq(notifications.recipientId, session.user.id),
      ),
    )
}

export async function markAllAsRead() {
  const session = await getSession()
  if (!session) throw new Error("Nie ste prihlásený.")

  await db
    .update(notifications)
    .set({ isRead: true })
    .where(
      and(
        eq(notifications.recipientId, session.user.id),
        eq(notifications.isRead, false),
      ),
    )
}
