"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { Bell, BellDot, Check, CheckCheck, Palmtree, Calendar, Clock, ArrowLeftRight, X } from "lucide-react"
import { formatDistanceToNow } from "date-fns"
import { sk } from "date-fns/locale"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Separator } from "@/components/ui/separator"
import { getNotifications, getUnreadCount, markAsRead, markAllAsRead } from "@/app/actions/notifications"

type Notification = Awaited<ReturnType<typeof getNotifications>>["notifications"][number]

const typeIcons: Record<string, typeof Bell> = {
  leave_requested: Palmtree,
  leave_approved: Check,
  leave_rejected: X,
  leave_cancelled: Palmtree,
  shift_assigned: Calendar,
  shift_modified: Calendar,
  open_shift_published: Calendar,
  drafts_published: Calendar,
  attendance_edited: Clock,
  replacement_requested: ArrowLeftRight,
  replacement_accepted: Check,
  replacement_rejected: X,
  replacement_resolved: ArrowLeftRight,
}

export function NotificationBell() {
  const router = useRouter()
  const [unreadCount, setUnreadCount] = useState(0)
  const [items, setItems] = useState<Notification[]>([])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const pollUnread = useCallback(async () => {
    try {
      const count = await getUnreadCount()
      setUnreadCount(count)
    } catch {
      // silently ignore
    }
  }, [])

  // Poll unread count every 30s
  useEffect(() => {
    pollUnread()
    intervalRef.current = setInterval(pollUnread, 30_000)
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [pollUnread])

  // Fetch full list when popover opens
  useEffect(() => {
    if (!open) return
    setLoading(true)
    getNotifications()
      .then((data) => {
        setItems(data.notifications)
        setUnreadCount(data.unreadCount)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [open])

  async function handleItemClick(item: Notification) {
    if (!item.isRead) {
      await markAsRead(item.id)
      setItems((prev) => prev.map((n) => (n.id === item.id ? { ...n, isRead: true } : n)))
      setUnreadCount((prev) => Math.max(0, prev - 1))
    }
    setOpen(false)
    if (item.linkUrl) router.push(item.linkUrl)
  }

  async function handleMarkAllRead() {
    await markAllAsRead()
    setItems((prev) => prev.map((n) => ({ ...n, isRead: true })))
    setUnreadCount(0)
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative h-8 w-8">
          {unreadCount > 0 ? (
            <>
              <BellDot className="h-4 w-4" />
              <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-medium text-destructive-foreground">
                {unreadCount > 99 ? "99+" : unreadCount}
              </span>
            </>
          ) : (
            <Bell className="h-4 w-4" />
          )}
          <span className="sr-only">Oznámenia</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="flex w-80 max-h-[85vh] flex-col p-0">
        <div className="flex shrink-0 items-center justify-between px-4 py-3">
          <h4 className="text-sm font-semibold">Oznámenia</h4>
          {unreadCount > 0 && (
            <Button variant="ghost" size="sm" className="h-auto px-2 py-1 text-xs" onClick={handleMarkAllRead}>
              <CheckCheck className="mr-1 h-3 w-3" />
              Označiť všetky
            </Button>
          )}
        </div>
        <Separator className="shrink-0" />
        <div className="min-h-0 flex-1 overflow-y-auto">
          {loading && items.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">Načítavam...</div>
          ) : items.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">Žiadne oznámenia</div>
          ) : (
            items.map((item) => {
              const Icon = typeIcons[item.type] ?? Bell
              return (
                <button
                  key={item.id}
                  onClick={() => handleItemClick(item)}
                  className={`flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/50 ${
                    !item.isRead ? "bg-muted/30" : ""
                  }`}
                >
                  <div className={`mt-0.5 rounded-full p-1.5 ${!item.isRead ? "bg-primary/10 text-primary" : "text-muted-foreground"}`}>
                    <Icon className="h-3.5 w-3.5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className={`text-sm leading-snug ${!item.isRead ? "font-medium" : ""}`}>{item.title}</p>
                    {item.body && <p className="mt-0.5 text-xs text-muted-foreground line-clamp-2">{item.body}</p>}
                    <p className="mt-1 text-xs text-muted-foreground">
                      {formatDistanceToNow(new Date(item.createdAt), { addSuffix: true, locale: sk })}
                    </p>
                  </div>
                  {!item.isRead && <div className="mt-2 h-2 w-2 shrink-0 rounded-full bg-primary" />}
                </button>
              )
            })
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}
