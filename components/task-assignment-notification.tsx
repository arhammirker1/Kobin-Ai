// components/task-assignment-notification.tsx
"use client"

import { useEffect, useState } from "react"
import { createClient } from "@/lib/supabase/client"

interface Task {
  id: string
  title: string
  priority: string
  due_date: string | null
  assigned_to: string
  created_at: string
}

export function TaskAssignmentNotification() {
  const [isClient, setIsClient] = useState(false)
  const supabase = createClient()

  useEffect(() => setIsClient(true), [])

  const getShownTaskIds = (): Set<string> => {
    if (typeof window === "undefined") return new Set()
    const stored = localStorage.getItem("task-notifications-shown")
    return stored ? new Set(JSON.parse(stored)) : new Set()
  }

  const markTaskAsShown = (taskId: string) => {
    if (typeof window === "undefined") return
    const shown = getShownTaskIds()
    shown.add(taskId)
    localStorage.setItem("task-notifications-shown", JSON.stringify(Array.from(shown)))
  }

  useEffect(() => {
  if (!isClient) return
  let userId: string | null = null

  const setup = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    userId = user.id

    const channel = supabase
      .channel("task-assignments")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "tasks",
          filter: `assigned_to=eq.${user.id}`,
        },
        (payload) => {
          const task = payload.new as Task
          const shownTaskIds = getShownTaskIds()
          if (!shownTaskIds.has(task.id)) {
            markTaskAsShown(task.id)
            sendTaskPush(task)
          }
        }
      )
      .subscribe()

    return () => supabase.removeChannel(channel)
  }

  const cleanup = setup()
  return () => { cleanup.then((fn) => fn?.()) }
}, [isClient])

  const checkForNewAssignments = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const shownTaskIds = getShownTaskIds()
    const sixtySecondsAgo = new Date(Date.now() - 60000).toISOString()

    const { data, error } = await supabase
      .from("tasks")
      .select("*")
      .eq("assigned_to", user.id)
      .gte("created_at", sixtySecondsAgo)
      .order("created_at", { ascending: false })

    if (!error && data && data.length > 0) {
      const unshownTask = data.find((task) => !shownTaskIds.has(task.id))
      if (unshownTask) {
        markTaskAsShown(unshownTask.id)
        sendTaskPush(unshownTask)
      }
    }
  }

  const sendTaskPush = async (task: Task) => {
  const priorityEmoji = task.priority === "urgent" ? "🔴" : task.priority === "high" ? "🟠" : "📋"
  const title = `New task assigned`

  if ((window as any).electron?.isDesktop) {
    const electron = (window as any).electron
    if (electron?.showNotification) {
      await electron.showNotification({
        title,
        body: task.title,
        tab: "Tasks",
        type: "task",
        priority: task.priority,
        priorityEmoji,
      }).catch(() => {})
    }
  }
  // Web push removed — desktop only
}

  // No UI — all notifications are web push only
  return null
}