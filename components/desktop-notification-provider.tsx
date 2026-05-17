"use client"

import { useEffect, useRef, useMemo, useCallback } from "react"
import { createClient } from "@/lib/supabase/client"

// ── Types ─────────────────────────────────────────────────────────────────────

interface BatchEntry {
  count: number
  senderNames: string[]
  preview: string
  roomName: string
  roomType: string
  timer: ReturnType<typeof setTimeout>
}

// ── Constants ─────────────────────────────────────────────────────────────────

const BATCH_DELAY_MS = 2500          // 2.5s silence before firing
const ROOM_COOLDOWN_MS = 45_000      // 45s between same-room notifications

// ── Public wrapper ────────────────────────────────────────────────────────────

export function DesktopNotificationProvider() {
  if (typeof window === "undefined") return null
  const isDesktop = !!(window as any).electron?.isDesktop
  if (!isDesktop) return null
  return <DesktopNotificationCore />
}

// ── Core ──────────────────────────────────────────────────────────────────────

function DesktopNotificationCore() {
  const supabase = useMemo(() => createClient(), [])
  const batchRef    = useRef<Map<string, BatchEntry>>(new Map())
  const cooldownRef = useRef<Map<string, number>>(new Map())
  const roomCacheRef = useRef<Map<string, { name: string; type: string; dm_key?: string | null }>>(new Map())
  const activeRoomRef = useRef<string | null>(null)

  // Track which room the user is currently viewing
  useEffect(() => {
    const onNavigate = (e: CustomEvent) => {
      activeRoomRef.current = e.detail?.room || null
    }
    window.addEventListener("push-navigate", onNavigate as EventListener)
    return () => window.removeEventListener("push-navigate", onNavigate as EventListener)
  }, [])

  // ── Fire notification ──────────────────────────────────────────────────────

  const notify = useCallback(async (
    title: string,
    body: string,
    meta?: Record<string, any>
  ) => {
    const electron = (window as any).electron
    if (!electron?.showNotification) return
    try {
      await electron.showNotification({ title, body, ...meta })
    } catch {}
  }, [])

  // ── Flush batch for a room ─────────────────────────────────────────────────

  const flushBatch = useCallback(async (roomId: string) => {
    const entry = batchRef.current.get(roomId)
    if (!entry) return

    // Per-room cooldown
    const lastTs = cooldownRef.current.get(roomId) || 0
    if (Date.now() - lastTs < ROOM_COOLDOWN_MS) {
      batchRef.current.delete(roomId)
      return
    }
    cooldownRef.current.set(roomId, Date.now())

    const { count, senderNames, preview, roomName, roomType } = entry
    const uniqueSenders = [...new Set(senderNames)]

    let title: string
    let body: string
    let notifType = "inbox"

    if (roomType === "direct") {
      // DM — WhatsApp style
      title = uniqueSenders[0] || "New message"
      body = count === 1
        ? preview
        : `${count} new messages`
    } else {
      // Group / project channel
      title = roomName || "Kobin AI"
      if (count === 1) {
        body = `${uniqueSenders[0]}: ${preview}`
      } else if (uniqueSenders.length === 1) {
        body = `${uniqueSenders[0]} · ${count} new messages`
      } else {
        const extra = uniqueSenders.length - 1
        body = `${uniqueSenders[0]} + ${extra} other${extra > 1 ? "s" : ""} · ${count} new messages`
      }
    }

    await notify(title, body, {
      roomId,
      tab: "Inbox",
      type: notifType,
      count,
      roomType,
      roomName,
    })

    batchRef.current.delete(roomId)
  }, [notify])

  // ── Queue a message ────────────────────────────────────────────────────────

  const queueMessage = useCallback((
    roomId: string,
    senderName: string,
    preview: string,
    roomMeta: { name: string; type: string }
  ) => {
    // Only skip if user is actively viewing THIS exact room
    if (activeRoomRef.current === roomId) return

    const existing = batchRef.current.get(roomId)
    if (existing) {
      clearTimeout(existing.timer)
      existing.count++
      existing.senderNames.push(senderName)
      existing.preview = preview
      existing.timer = setTimeout(() => flushBatch(roomId), BATCH_DELAY_MS)
    } else {
      batchRef.current.set(roomId, {
        count: 1,
        senderNames: [senderName],
        preview,
        roomName: roomMeta.name,
        roomType: roomMeta.type,
        timer: setTimeout(() => flushBatch(roomId), BATCH_DELAY_MS),
      })
    }
  }, [flushBatch])

  // ── Realtime setup ─────────────────────────────────────────────────────────

  useEffect(() => {
    const channels: ReturnType<typeof supabase.channel>[] = []
    let notifClickCleanup: (() => void) | undefined

    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const userId = user.id

      const { data: memberships } = await supabase
        .from("chat_room_members")
        .select("room_id")
        .eq("user_id", userId)
      const roomIds = new Set((memberships || []).map((m) => m.room_id))

      const profileCache = new Map<string, string>()

      const getProfileName = async (id: string): Promise<string> => {
        if (profileCache.has(id)) return profileCache.get(id)!
        const { data } = await supabase
          .from("profiles")
          .select("full_name")
          .eq("id", id)
          .single()
        const name = data?.full_name || "Someone"
        profileCache.set(id, name)
        return name
      }

      const getRoomMeta = async (roomId: string) => {
        if (roomCacheRef.current.has(roomId)) return roomCacheRef.current.get(roomId)!
        const { data: room } = await supabase
          .from("chat_rooms")
          .select("name, type, project_id, dm_key")
          .eq("id", roomId)
          .single()
        if (!room) return { name: "Inbox", type: "group", dm_key: null }
        let name = room.name || "Channel"
        if (room.type === "project" && room.project_id) {
          const { data: proj } = await supabase
            .from("projects")
            .select("name")
            .eq("id", room.project_id)
            .single()
          if (proj) name = proj.name
        }
        const meta = { name, type: room.type, dm_key: room.dm_key || null }
        roomCacheRef.current.set(roomId, meta)
        return meta
      }

      // ── Inbox messages ─────────────────────────────────────────────────────
      const msgChannel = supabase
        .channel("desktop-inbox-notifs")
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "chat_messages" },
          async (payload) => {
            const msg = payload.new as any

            if (msg.sender_id === userId) return
            if (!roomIds.has(msg.room_id)) return
            if (msg.message_type === "ai_response" || msg.content === "...") return

            let preview: string = msg.content || ""
            if (!preview && msg.file_name) preview = `📎 ${msg.file_name}`
            if (!preview) return

            try {
              const parsed = JSON.parse(preview)
              if (parsed.type === "event_invite") preview = `📅 ${parsed.event_title}`
            } catch {}
            preview = preview.slice(0, 100)

            const [senderName, roomMeta] = await Promise.all([
              getProfileName(msg.sender_id),
              getRoomMeta(msg.room_id),
            ])

            if (roomMeta.dm_key?.startsWith("ai-room:")) return

            const effectiveName =
              roomMeta.type === "direct" ? senderName : roomMeta.name

            queueMessage(msg.room_id, senderName, preview, {
              ...roomMeta,
              name: effectiveName,
            })
          }
        )
        .subscribe()
      channels.push(msgChannel)

      // ── Task assignments ───────────────────────────────────────────────────
      const taskChannel = supabase
        .channel("desktop-task-notifs")
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "tasks",
            filter: `assigned_to=eq.${userId}`,
          },
          async (payload) => {
            const task = payload.new as any
            const priorityEmoji =
              task.priority === "urgent" ? "🔴"
              : task.priority === "high" ? "🟠"
              : "📋"
            await notify(
              `New task assigned`,
              task.title || "You have a new task",
              { tab: "Tasks", type: "task", priority: task.priority, priorityEmoji }
            )
          }
        )
        .subscribe()
      channels.push(taskChannel)

      // ── Notification click → navigate ──────────────────────────────────────
      const electron = (window as any).electron
      if (electron?.onNotificationClick) {
        notifClickCleanup = electron.onNotificationClick(
          (data: { roomId?: string; tab?: string }) => {
            activeRoomRef.current = data.roomId || null
            window.dispatchEvent(
              new CustomEvent("push-navigate", {
                detail: { tab: data.tab || "Inbox", room: data.roomId },
              })
            )
          }
        )
      }
    }

    init()

    return () => {
      channels.forEach((ch) => supabase.removeChannel(ch))
      if (notifClickCleanup) notifClickCleanup()
      batchRef.current.forEach((entry) => clearTimeout(entry.timer))
      batchRef.current.clear()
    }
  }, [supabase, notify, queueMessage])

  return null
}