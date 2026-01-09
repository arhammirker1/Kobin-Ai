"use client"

import type React from "react"

import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { toast } from "sonner"
import { format, isThisWeek, isPast } from "date-fns"
import { Plus, Trash2, CheckCircle2, Activity, Calendar } from "lucide-react"

const BUCKETS = ["today", "this-week", "delegated", "backlog"]
const PRIORITIES = ["low", "medium", "high", "urgent"]
const STATUSES = ["todo", "in-progress", "blocked", "completed"]

export function ClientTaskView({ clientData }: { clientData: any }) {
  const [tasks, setTasks] = useState<any[]>([])
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [newTask, setNewTask] = useState({
    title: "",
    notes: "",
    priority: "medium",
    status: "todo",
    deadline: "",
  })
  const [isLoading, setIsLoading] = useState(false)

  const supabase = createClient()

  useEffect(() => {
    fetchTasks()
  }, [clientData])

  const fetchTasks = async () => {
    if (!clientData) return

    const { data, error } = await supabase
      .from("tasks")
      .select("*")
      .eq("project_id", clientData.project_id)
      .order("created_at", { ascending: false })

    if (error) {
      console.error("[v0] Error fetching tasks:", error)
      toast.error("Failed to load tasks")
    } else {
      setTasks(data || [])
    }
  }

  const createTask = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!newTask.title.trim()) {
      toast.error("Task title is required")
      return
    }

    setIsLoading(true)

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (!user) {
        toast.error("Not authenticated")
        return
      }

      const { error } = await supabase.from("tasks").insert([
        {
          title: newTask.title,
          notes: newTask.notes,
          priority: newTask.priority,
          status: newTask.status,
          due_date: newTask.deadline || null,
          project_id: clientData.project_id,
          user_id: user.id,
          created_by: user.id,
        },
      ])

      if (error) {
        console.error("[v0] Error creating task:", error)
        toast.error("Failed to create task")
      } else {
        toast.success("Task created successfully!")
        setNewTask({
          title: "",
          notes: "",
          priority: "medium",
          status: "todo",
          deadline: "",
        })
        setIsDialogOpen(false)
        fetchTasks()
      }
    } catch (err) {
      console.error("[v0] Unexpected error:", err)
      toast.error("An unexpected error occurred")
    } finally {
      setIsLoading(false)
    }
  }

  const deleteTask = async (taskId: string) => {
    try {
      const { error } = await supabase.from("tasks").delete().eq("id", taskId)

      if (error) {
        console.error("[v0] Error deleting task:", error)
        toast.error("Failed to delete task")
      } else {
        toast.success("Task deleted")
        fetchTasks()
      }
    } catch (err) {
      console.error("[v0] Unexpected error:", err)
      toast.error("An unexpected error occurred")
    }
  }

  const updateTaskStatus = async (taskId: string, newStatus: string) => {
    try {
      const { error } = await supabase.from("tasks").update({ status: newStatus }).eq("id", taskId)

      if (error) {
        console.error("[v0] Error updating task:", error)
        toast.error("Failed to update task")
      } else {
        fetchTasks()
      }
    } catch (err) {
      console.error("[v0] Unexpected error:", err)
      toast.error("An unexpected error occurred")
    }
  }

  // Group tasks by bucket
  const groupTasksByBucket = () => {
    const bucketed: { [key: string]: any[] } = {
      today: [],
      "this-week": [],
      delegated: [],
      backlog: [],
    }

    tasks.forEach((task) => {
      if (!task.due_date) {
        bucketed.backlog.push(task)
      } else {
        const dueDate = new Date(task.due_date)
        const today = new Date()
        today.setHours(0, 0, 0, 0)

        const isToday =
          dueDate.getDate() === today.getDate() &&
          dueDate.getMonth() === today.getMonth() &&
          dueDate.getFullYear() === today.getFullYear()

        if (isToday) {
          bucketed.today.push(task)
        } else if (isThisWeek(dueDate)) {
          bucketed["this-week"].push(task)
        } else if (isPast(dueDate)) {
          bucketed.today.push(task)
        } else {
          bucketed.backlog.push(task)
        }
      }
    })

    return bucketed
  }

  const bucketedTasks = groupTasksByBucket()

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-700">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Tasks</h1>
          <p className="text-muted-foreground italic text-sm">Manage your project tasks</p>
        </div>
        {clientData?.can_create_tasks && (
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button className="gap-2">
                <Plus size={16} />
                New Task
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>Create New Task</DialogTitle>
              </DialogHeader>
              <form onSubmit={createTask}>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label htmlFor="title">Task Title *</Label>
                    <Input
                      id="title"
                      placeholder="Enter task title"
                      value={newTask.title}
                      onChange={(e) => setNewTask({ ...newTask, title: e.target.value })}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="notes">Notes</Label>
                    <Input
                      id="notes"
                      placeholder="Add notes (optional)"
                      value={newTask.notes}
                      onChange={(e) => setNewTask({ ...newTask, notes: e.target.value })}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="priority">Priority</Label>
                      <Select
                        value={newTask.priority}
                        onValueChange={(val) => setNewTask({ ...newTask, priority: val })}
                      >
                        <SelectTrigger id="priority">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {PRIORITIES.map((p) => (
                            <SelectItem key={p} value={p}>
                              {p.charAt(0).toUpperCase() + p.slice(1)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="deadline">Deadline</Label>
                      <Input
                        id="deadline"
                        type="date"
                        value={newTask.deadline}
                        onChange={(e) => setNewTask({ ...newTask, deadline: e.target.value })}
                      />
                    </div>
                  </div>
                </div>
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={isLoading}>
                    {isLoading ? "Creating..." : "Create Task"}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {/* Tasks grouped by bucket */}
      {BUCKETS.map((bucket) => (
        <div key={bucket}>
          <div className="mb-4 flex items-center gap-2">
            <h2 className="text-lg font-semibold capitalize">{bucket.replace("-", " ")}</h2>
            <Badge variant="outline">{bucketedTasks[bucket].length}</Badge>
          </div>

          {bucketedTasks[bucket].length > 0 ? (
            <div className="grid gap-3">
              {bucketedTasks[bucket].map((task) => (
                <Card key={task.id} className="hover:border-primary/50 transition-colors">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <button
                            onClick={() =>
                              updateTaskStatus(task.id, task.status === "completed" ? "todo" : "completed")
                            }
                            className="flex-shrink-0 text-muted-foreground hover:text-primary transition-colors"
                          >
                            <CheckCircle2
                              size={20}
                              className={task.status === "completed" ? "fill-primary text-primary" : ""}
                            />
                          </button>
                          <div>
                            <p
                              className={`font-medium ${task.status === "completed" ? "line-through text-muted-foreground" : ""}`}
                            >
                              {task.title}
                            </p>
                            {task.notes && <p className="text-sm text-muted-foreground">{task.notes}</p>}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 ml-8 flex-wrap">
                          <Badge
                            variant="outline"
                            className={
                              task.priority === "urgent"
                                ? "bg-red-500/10 text-red-600 border-red-200"
                                : task.priority === "high"
                                  ? "bg-orange-500/10 text-orange-600 border-orange-200"
                                  : task.priority === "medium"
                                    ? "bg-yellow-500/10 text-yellow-600 border-yellow-200"
                                    : "bg-green-500/10 text-green-600 border-green-200"
                            }
                          >
                            {task.priority}
                          </Badge>
                          <Badge variant="outline">{task.status}</Badge>
                          {task.due_date && (
                            <Badge variant="outline" className="flex items-center gap-1">
                              <Calendar size={12} />
                              {format(new Date(task.due_date), "MMM d")}
                            </Badge>
                          )}
                        </div>
                      </div>
                      <button
                        onClick={() => deleteTask(task.id)}
                        className="flex-shrink-0 text-muted-foreground hover:text-destructive transition-colors"
                      >
                        <Trash2 size={18} />
                      </button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-8 text-center text-muted-foreground rounded-lg border border-dashed">
              <Activity size={32} className="mb-2 opacity-30" />
              <p className="text-sm">No tasks in this bucket</p>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
