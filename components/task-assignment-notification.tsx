"use client"

import { useEffect, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { X, CheckCircle2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"

interface Task {
  id: string
  title: string
  priority: string
  due_date: string | null
  assigned_to: string
  created_at: string
}

export function TaskAssignmentNotification() {
  const [newAssignedTask, setNewAssignedTask] = useState<Task | null>(null)
  const [isClient, setIsClient] = useState(false)
  const [notificationSound] = useState(() => {
    if (typeof window !== "undefined") {
      const audio = new Audio()
      audio.src =
        "data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBTGH0fPTgjMGHm7A7+OZRQ0PVK3n77BdGwxEnN7xv3IdBzWM0vPOfilFJnfH8N2QQAoUXrTp66hVFApGn+DyvmwhBTGH0fPTgjMGHm7A7+OZRQ0PVK3n77BdGwxEnN7xv3IdBzWM0vPOfilFJnfH8N2QQAoUXrTp66hVFApGn+DyvmwhBTGH0fPTgjMGHm7A7+OZRQ0PVK3n77BdGwxEnN7xv3IdBzWM0vPOfilFJnfH8N2QQAoUXrTp66hVFApGn+DyvmwhBTGH0fPTgjMGHm7A7+OZRQ0PVK3n77BdGwxEnN7xv3IdBzWM0vPOfilFJnfH8N2QQAoUXrTp66hVFApGn+DyvmwhBTGH0fPTgjMGHm7A7+OZRQ0PVK3n77BdGwxEnN7xv3IdBzWM0vPOfilFJnfH8N2QQAoUXrTp66hVFApGn+DyvmwhBTGH0fPTgjMGHm7A7+OZRQ0PVK3n77BdGwxEnN7xv3IdBzWM0vPOfilFJnfH8N2QQAoUXrTp66hVFApGn+DyvmwhBTGH0fPTgjMGHm7A7+OZRQ0PVK3n77BdGwxEnN7xv3IdBzWM0vPOfilFJnfH8N2QQAoUXrTp66hVFApGn+DyvmwhBTGH0fPTgjMGHm7A7+OZRQ0PVK3n77BdGwxEnN7xv3IdBzWM0vPOfilFJnfH8N2QQAoUXrTp66hVFApGn+DyvmwhBTGH0fPTgjMGHm7A7+OZRQ0PVK3n77BdGwxEnN7xv3IdBzWM0vPOfilFJnfH8N2QQAoUXrTp66hVFApGn+DyvmwhBTGH0fPTgjMGHm7A7+OZRQ0PVK3n77BdGwxEnN7xv3IdBzWM0vPOfilFJnfH8N2QQAoUXrTp66hVFApGn+DyvmwhBTGH0fPTgjMGHm7A7+OZRQ0PVK3n77BdGwxEnN7xv3IdBzWM0vPOfilF"
      return audio
    }
    return null
  })

  const supabase = createClient()

  useEffect(() => {
    setIsClient(true)
  }, [])

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
    console.log("[v0] Marked task as shown:", taskId)
  }

  useEffect(() => {
    if (!isClient) return

    checkForNewAssignments()
    const interval = setInterval(checkForNewAssignments, 10000)
    return () => clearInterval(interval)
  }, [isClient])

  const checkForNewAssignments = async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return

    const shownTaskIds = getShownTaskIds()

    // Get tasks assigned to current user in last 60 seconds
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
        console.log("[v0] New task assignment detected:", unshownTask.title)
        setNewAssignedTask(unshownTask)
        markTaskAsShown(unshownTask.id)
        playNotificationSound()
        sendBrowserNotification(unshownTask)
      }
    }
  }

  const playNotificationSound = () => {
    if (notificationSound) {
      notificationSound.play().catch((error) => {
        console.log("[v0] Could not play notification sound:", error)
      })
    }
  }

  const sendBrowserNotification = async (task: Task) => {
    if ("Notification" in window && Notification.permission === "default") {
      await Notification.requestPermission()
    }

    if ("Notification" in window && Notification.permission === "granted") {
      const notification = new Notification("New Task Assigned!", {
        body: `You've been assigned: ${task.title}`,
        icon: "/icon.svg",
        badge: "/icon.svg",
        tag: `task-${task.id}`,
      })

      notification.onclick = () => {
        window.focus()
      }
    }
  }

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case "urgent":
        return "text-red-500 bg-red-500/10 border-red-500/20"
      case "high":
        return "text-orange-500 bg-orange-500/10 border-orange-500/20"
      case "medium":
        return "text-yellow-500 bg-yellow-500/10 border-yellow-500/20"
      case "low":
        return "text-blue-500 bg-blue-500/10 border-blue-500/20"
      default:
        return "text-gray-500 bg-gray-500/10 border-gray-500/20"
    }
  }

  const formatDueDate = (dueDate: string | null) => {
    if (!dueDate) return null
    const date = new Date(dueDate)
    const now = new Date()
    const diffTime = date.getTime() - now.getTime()
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))

    if (diffDays < 0) return "Overdue"
    if (diffDays === 0) return "Due today"
    if (diffDays === 1) return "Due tomorrow"
    return `Due in ${diffDays} days`
  }

  const handleClose = () => {
    setNewAssignedTask(null)
  }

  return (
    <>
      {/* Task Assignment Pop-up - Top Right */}
      {newAssignedTask && (
        <div className="fixed top-20 right-6 z-50 animate-in slide-in-from-top-5 fade-in duration-300">
          <Card className="w-80 p-4 shadow-lg border-l-4 border-l-primary bg-card">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-2">
                  <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />
                  <span className="text-sm font-semibold text-primary">New Task Assigned</span>
                </div>
                <h4 className="font-bold text-sm mb-2 break-words">{newAssignedTask.title}</h4>
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`text-xs px-2 py-0.5 rounded-full border font-medium uppercase ${getPriorityColor(newAssignedTask.priority)}`}
                  >
                    {newAssignedTask.priority}
                  </span>
                  {newAssignedTask.due_date && (
                    <span className="text-xs text-muted-foreground">{formatDueDate(newAssignedTask.due_date)}</span>
                  )}
                </div>
              </div>
              <Button variant="ghost" size="icon" className="h-6 w-6 rounded-full shrink-0" onClick={handleClose}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          </Card>
        </div>
      )}
    </>
  )
}
