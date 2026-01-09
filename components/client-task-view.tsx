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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { toast } from "sonner"
import { format, isPast, differenceInDays } from "date-fns"
import { Plus, Trash2, CheckCircle2, Activity, Clock, Filter, Pencil } from "lucide-react"

const BUCKETS = ["today", "this-week", "delegated", "backlog"]
const PRIORITIES = ["low", "medium", "high", "urgent"]
const STATUSES = ["todo", "in-progress", "blocked", "completed"]

interface Task {
  id: string
  title: string
  notes: string | null
  priority: string
  status: string
  due_date: string | null
  project_id: string
  created_at: string
  is_completed: boolean
}

export function ClientTaskView({ clientData }: { clientData: any }) {
  const [tasks, setTasks] = useState<Task[]>([])
  const [activeBucket, setActiveBucket] = useState("today")
  const [searchQuery, setSearchQuery] = useState("")
  const [filterPriority, setFilterPriority] = useState<string>("all")
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [isEditOpen, setIsEditOpen] = useState(false)
  const [isDeleteOpen, setIsDeleteOpen] = useState(false)
  const [selectedTask, setSelectedTask] = useState<Task | null>(null)
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
  }, [clientData, activeBucket])

  const fetchTasks = async () => {
    if (!clientData?.project_id) return

    try {
      const { data, error } = await supabase
        .from("tasks")
        .select("*")
        .eq("project_id", clientData.project_id)
        .eq("bucket", activeBucket)
        .order("created_at", { ascending: false })

      if (error) {
        console.error("[v0] Error fetching tasks:", error)
      } else {
        setTasks(data || [])
      }
    } catch (err) {
      console.error("[v0] Unexpected error fetching tasks:", err)
    }
  }

  const getAllTasks = async () => {
    if (!clientData?.project_id) return []

    try {
      const { data } = await supabase.from("tasks").select("status").eq("project_id", clientData.project_id)

      return data || []
    } catch (err) {
      console.error("[v0] Error fetching all tasks:", err)
      return []
    }
  }

  const getTaskStats = async () => {
    const allTasks = await getAllTasks()
    return allTasks.reduce(
      (acc, task) => {
        const s = task.status.toLowerCase()
        if (s === "in-progress") acc.inProgress++
        else if (s === "blocked") acc.blocked++
        else if (s === "completed") acc.completed++
        else if (s === "todo") acc.todo++
        return acc
      },
      { inProgress: 0, blocked: 0, completed: 0, todo: 0 },
    )
  }

  const createOrUpdateTask = async (e: React.FormEvent) => {
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

      const taskData = {
        title: newTask.title,
        notes: newTask.notes || null,
        priority: newTask.priority,
        status: newTask.status,
        due_date: newTask.deadline ? new Date(newTask.deadline).toISOString() : null,
        project_id: clientData.project_id,
        bucket: activeBucket,
        is_completed: newTask.status === "completed",
      }

      if (selectedTask && isEditOpen) {
        const { error } = await supabase.from("tasks").update(taskData).eq("id", selectedTask.id)

        if (error) {
          console.error("[v0] Error updating task:", error)
          toast.error("Failed to update task")
        } else {
          toast.success("Task updated successfully!")
          setIsEditOpen(false)
          resetForm()
          fetchTasks()
        }
      } else {
        const { error } = await supabase.from("tasks").insert([
          {
            ...taskData,
            user_id: user.id,
            created_by: user.id,
          },
        ])

        if (error) {
          console.error("[v0] Error creating task:", error)
          toast.error("Failed to create task")
        } else {
          toast.success("Task created successfully!")
          setIsDialogOpen(false)
          resetForm()
          fetchTasks()
        }
      }
    } catch (err) {
      console.error("[v0] Unexpected error:", err)
      toast.error("An unexpected error occurred")
    } finally {
      setIsLoading(false)
    }
  }

  const resetForm = () => {
    setNewTask({
      title: "",
      notes: "",
      priority: "medium",
      status: "todo",
      deadline: "",
    })
    setSelectedTask(null)
  }

  const deleteTask = async () => {
    if (!selectedTask) return

    try {
      const { error } = await supabase.from("tasks").delete().eq("id", selectedTask.id)

      if (error) {
        console.error("[v0] Error deleting task:", error)
        toast.error("Failed to delete task")
      } else {
        toast.success("Task deleted")
        setIsDeleteOpen(false)
        setSelectedTask(null)
        fetchTasks()
      }
    } catch (err) {
      console.error("[v0] Unexpected error:", err)
      toast.error("An unexpected error occurred")
    }
  }

  const updateTaskStatus = async (taskId: string, newStatus: string) => {
    try {
      const isCompleted = newStatus === "completed"
      const { error } = await supabase
        .from("tasks")
        .update({ status: newStatus, is_completed: isCompleted })
        .eq("id", taskId)

      if (error) {
        console.error("[v0] Error updating task status:", error)
        toast.error("Failed to update task")
      } else {
        fetchTasks()
        toast.success("Task status updated")
      }
    } catch (err) {
      console.error("[v0] Unexpected error:", err)
      toast.error("An unexpected error occurred")
    }
  }

  const handleEditClick = (task: Task) => {
    setSelectedTask(task)
    setNewTask({
      title: task.title,
      notes: task.notes || "",
      priority: task.priority,
      status: task.status,
      deadline: task.due_date ? format(new Date(task.due_date), "yyyy-MM-dd'T'HH:mm") : "",
    })
    setIsEditOpen(true)
  }

  const handleDeleteClick = (task: Task) => {
    setSelectedTask(task)
    setIsDeleteOpen(true)
  }

  const getDeadlineBadge = (due_date: string | null) => {
    if (!due_date) return null

    const daysUntil = differenceInDays(new Date(due_date), new Date())
    const isOverdue = isPast(new Date(due_date))

    if (isOverdue) {
      return (
        <Badge variant="destructive" className="text-[9px] font-bold uppercase tracking-widest">
          <Clock size={10} className="mr-1" />
          Overdue
        </Badge>
      )
    } else if (daysUntil <= 2) {
      return (
        <Badge className="text-[9px] font-bold uppercase tracking-widest bg-orange-100 text-orange-700 border-orange-300">
          <Clock size={10} className="mr-1" />
          {daysUntil}d left
        </Badge>
      )
    }

    return (
      <Badge variant="outline" className="text-[9px] font-bold uppercase tracking-widest bg-muted/30">
        <Clock size={10} className="mr-1" />
        {format(new Date(due_date), "MMM d")}
      </Badge>
    )
  }

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case "urgent":
        return "bg-red-100 text-red-700 border-red-300"
      case "high":
        return "bg-orange-100 text-orange-700 border-orange-300"
      case "medium":
        return "bg-yellow-100 text-yellow-700 border-yellow-300"
      default:
        return "bg-gray-100 text-gray-700 border-gray-300"
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case "completed":
        return "bg-green-100 text-green-700 border-green-300"
      case "in-progress":
        return "bg-blue-100 text-blue-700 border-blue-300"
      case "blocked":
        return "bg-red-100 text-red-700 border-red-300"
      default:
        return "bg-gray-100 text-gray-700 border-gray-300"
    }
  }

  const filteredTasks = tasks.filter((task) => {
    const matchesSearch = task.title.toLowerCase().includes(searchQuery.toLowerCase())
    const matchesPriority = filterPriority === "all" || task.priority === filterPriority
    return matchesSearch && matchesPriority
  })

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-3xl font-bold tracking-tight">Tasks & Execution</h1>
          <p className="text-muted-foreground text-sm">Manage your project tasks with ease.</p>
        </div>
        {clientData?.can_create_tasks && (
          <div className="flex gap-2 w-full md:w-auto">
            <Dialog
              open={isDialogOpen}
              onOpenChange={(open) => {
                setIsDialogOpen(open)
                if (!open) resetForm()
              }}
            >
              <DialogTrigger asChild>
                <Button className="gap-2 shadow-sm font-bold w-full md:w-auto">
                  <Plus size={18} />
                  Add Task
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[500px]">
                <DialogHeader>
                  <DialogTitle>Add New Task</DialogTitle>
                </DialogHeader>
                <form onSubmit={createOrUpdateTask} className="space-y-4 py-4">
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
                  <div className="grid grid-cols-3 gap-3">
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
                      <Label htmlFor="status">Status</Label>
                      <Select value={newTask.status} onValueChange={(val) => setNewTask({ ...newTask, status: val })}>
                        <SelectTrigger id="status">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {STATUSES.map((s) => (
                            <SelectItem key={s} value={s}>
                              {s.replace("-", " ").toUpperCase()}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="deadline">Deadline</Label>
                      <Input
                        id="deadline"
                        type="datetime-local"
                        value={newTask.deadline}
                        onChange={(e) => setNewTask({ ...newTask, deadline: e.target.value })}
                      />
                    </div>
                  </div>
                </form>
                <DialogFooter>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setIsDialogOpen(false)
                      resetForm()
                    }}
                  >
                    Cancel
                  </Button>
                  <Button onClick={createOrUpdateTask} disabled={isLoading}>
                    {isLoading ? "Creating..." : "Create Task"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
              <DialogContent className="sm:max-w-[500px]">
                <DialogHeader>
                  <DialogTitle>Edit Task</DialogTitle>
                </DialogHeader>
                <form onSubmit={createOrUpdateTask} className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label htmlFor="edit-title">Task Title *</Label>
                    <Input
                      id="edit-title"
                      placeholder="Enter task title"
                      value={newTask.title}
                      onChange={(e) => setNewTask({ ...newTask, title: e.target.value })}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="edit-notes">Notes</Label>
                    <Input
                      id="edit-notes"
                      placeholder="Add notes (optional)"
                      value={newTask.notes}
                      onChange={(e) => setNewTask({ ...newTask, notes: e.target.value })}
                    />
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <div className="space-y-2">
                      <Label htmlFor="edit-priority">Priority</Label>
                      <Select
                        value={newTask.priority}
                        onValueChange={(val) => setNewTask({ ...newTask, priority: val })}
                      >
                        <SelectTrigger id="edit-priority">
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
                      <Label htmlFor="edit-status">Status</Label>
                      <Select value={newTask.status} onValueChange={(val) => setNewTask({ ...newTask, status: val })}>
                        <SelectTrigger id="edit-status">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {STATUSES.map((s) => (
                            <SelectItem key={s} value={s}>
                              {s.replace("-", " ").toUpperCase()}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="edit-deadline">Deadline</Label>
                      <Input
                        id="edit-deadline"
                        type="datetime-local"
                        value={newTask.deadline}
                        onChange={(e) => setNewTask({ ...newTask, deadline: e.target.value })}
                      />
                    </div>
                  </div>
                </form>
                <DialogFooter>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setIsEditOpen(false)
                      resetForm()
                    }}
                  >
                    Cancel
                  </Button>
                  <Button onClick={createOrUpdateTask} disabled={isLoading}>
                    {isLoading ? "Updating..." : "Update Task"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        )}
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="text-sm font-medium text-muted-foreground uppercase">In Progress</div>
            <div className="text-2xl font-bold mt-2">{tasks.filter((t) => t.status === "in-progress").length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-sm font-medium text-muted-foreground uppercase">Blocked</div>
            <div className="text-2xl font-bold mt-2 text-red-600">
              {tasks.filter((t) => t.status === "blocked").length}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-sm font-medium text-muted-foreground uppercase">Completed</div>
            <div className="text-2xl font-bold mt-2 text-green-600">
              {tasks.filter((t) => t.status === "completed").length}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-sm font-medium text-muted-foreground uppercase">Total Todo</div>
            <div className="text-2xl font-bold mt-2">{tasks.length}</div>
          </CardContent>
        </Card>
      </div>

      {/* Bucket Tabs and Controls */}
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap gap-2">
          {BUCKETS.map((bucket) => (
            <Button
              key={bucket}
              variant={activeBucket === bucket ? "default" : "outline"}
              size="sm"
              onClick={() => setActiveBucket(bucket)}
              className="capitalize"
            >
              {bucket.replace("-", " ")}
            </Button>
          ))}
        </div>

        {/* Search and Filter */}
        <div className="flex flex-col md:flex-row gap-3">
          <div className="flex-1 relative">
            <Input
              placeholder="Search tasks..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={filterPriority} onValueChange={setFilterPriority}>
            <SelectTrigger className="w-full md:w-[150px]">
              <Filter size={16} className="mr-2" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Priorities</SelectItem>
              {PRIORITIES.map((p) => (
                <SelectItem key={p} value={p}>
                  {p.charAt(0).toUpperCase() + p.slice(1)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Tasks List */}
      {filteredTasks.length > 0 ? (
        <div className="grid gap-3">
          {filteredTasks.map((task) => (
            <Card key={task.id} className="hover:border-primary/50 transition-colors">
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-start gap-3 mb-2">
                      <button
                        onClick={() => updateTaskStatus(task.id, task.is_completed ? "todo" : "completed")}
                        className="flex-shrink-0 text-muted-foreground hover:text-primary transition-colors mt-0.5"
                      >
                        <CheckCircle2 size={20} className={task.is_completed ? "fill-primary text-primary" : ""} />
                      </button>
                      <div className="flex-1">
                        <p
                          className={`font-medium leading-tight ${
                            task.is_completed ? "line-through text-muted-foreground" : ""
                          }`}
                        >
                          {task.title}
                        </p>
                        {task.notes && <p className="text-sm text-muted-foreground mt-1">{task.notes}</p>}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 ml-8 flex-wrap">
                      <Badge variant="outline" className={getPriorityColor(task.priority)}>
                        {task.priority.toUpperCase()}
                      </Badge>
                      <Badge variant="outline" className={getStatusColor(task.status)}>
                        {task.status.replace("-", " ").toUpperCase()}
                      </Badge>
                      {getDeadlineBadge(task.due_date)}
                    </div>
                  </div>
                  {clientData?.can_create_tasks && (
                    <div className="flex gap-2 flex-shrink-0">
                      <button
                        onClick={() => handleEditClick(task)}
                        className="text-muted-foreground hover:text-primary transition-colors p-1"
                      >
                        <Pencil size={16} />
                      </button>
                      <button
                        onClick={() => handleDeleteClick(task)}
                        className="text-muted-foreground hover:text-destructive transition-colors p-1"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground rounded-lg border border-dashed">
          <Activity size={40} className="mb-3 opacity-30" />
          <p className="text-sm">No tasks in this bucket</p>
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Task</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this task? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={deleteTask}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
