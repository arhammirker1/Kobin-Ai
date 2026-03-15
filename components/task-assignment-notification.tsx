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
    checkForNewAssignments()
    const interval = setInterval(checkForNewAssignments, 10000)
    return () => clearInterval(interval)
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
    try {
      await fetch("/api/push/send-self", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          payload: {
            type: "task_assigned",
            title: "📋 New Task Assigned",
            body: task.title,
            task_id: task.id,
            priority: task.priority,
          },
        }),
      })
    } catch {
      // non-fatal
    }
  }

  // No UI — all notifications are web push only
  return null
}