"use client"

import type React from "react"

import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { ClientTaskForm } from "@/components/client-task-form"
import { TaskComments } from "@/components/task-comments"
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
import { cn } from "@/lib/utils"
import { format, isPast, differenceInDays } from "date-fns"
import { Plus, Trash2, CheckCircle2, Activity, Clock, Filter, Pencil, MessageSquare } from "lucide-react"

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
  const [commentTask, setCommentTask] = useState<Task | null>(null)
  const [newTask, setNewTask] = useState({
    title: "",
    notes: "",
    resources: [] as Array<{ url: string; title?: string }>,
    priority: "medium",
    status: "todo",
    deadline: "",
    vault_attachments: [] as Array<{ vault_item_id: string; title: string; drive_file_url: string | null; link_url: string | null }>,
    deliverable_required: false,
    deliverable_description: "",
  })
  const [newResourceUrl, setNewResourceUrl] = useState("")
  const [newResourceTitle, setNewResourceTitle] = useState("")
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

    if (!clientData?.project_id) {
      toast.error("No project linked to your account. Please contact your team.")
      return
    }
    console.log("clientData.founder_id:", clientData?.founder_id)
    console.log("clientData.project_id:", clientData?.project_id)

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
        resources: newTask.resources.length > 0 ? newTask.resources : null,
        priority: newTask.priority,
        status: newTask.status,
        due_date: newTask.deadline ? new Date(newTask.deadline).toISOString() : null,
        project_id: clientData.project_id,
        bucket: activeBucket,
        is_completed: newTask.status === "completed",
        vault_attachments: newTask.vault_attachments.length > 0 ? newTask.vault_attachments : null,
        deliverable_required: newTask.deliverable_required,
        deliverable_description: newTask.deliverable_description || null,
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
            user_id: clientData.founder_id,
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
      resources: [],
      priority: "medium",
      status: "todo",
      deadline: "",
      vault_attachments: [],
      deliverable_required: false,
      deliverable_description: "",
    })
    setNewResourceUrl("")
    setNewResourceTitle("")
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
      resources: (task as any).resources || [],
      priority: task.priority,
      status: task.status,
      deadline: task.due_date ? format(new Date(task.due_date), "yyyy-MM-dd'T'HH:mm") : "",
      vault_attachments: (task as any).vault_attachments || [],
      deliverable_required: (task as any).deliverable_required || false,
      deliverable_description: (task as any).deliverable_description || "",
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

  const taskStats = tasks.reduce(
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
              <DialogContent className="sm:max-w-[580px]">
                <DialogHeader>
                  <DialogTitle>Add New Task</DialogTitle>
                </DialogHeader>
                <ClientTaskForm
                  task={newTask}
                  onTaskChange={setNewTask}
                  newResourceUrl={newResourceUrl}
                  setNewResourceUrl={setNewResourceUrl}
                  newResourceTitle={newResourceTitle}
                  setNewResourceTitle={setNewResourceTitle}
                  projectId={clientData?.project_id}
                />
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

            <Dialog open={isEditOpen} onOpenChange={(open) => { setIsEditOpen(open); if (!open) resetForm() }}>
              <DialogContent className="sm:max-w-[580px]">
                <DialogHeader>
                  <DialogTitle>Edit Task</DialogTitle>
                </DialogHeader>
                <ClientTaskForm
                  task={newTask}
                  onTaskChange={setNewTask}
                  newResourceUrl={newResourceUrl}
                  setNewResourceUrl={setNewResourceUrl}
                  newResourceTitle={newResourceTitle}
                  setNewResourceTitle={setNewResourceTitle}
                  projectId={clientData?.project_id}
                />
                <DialogFooter>
                  <Button variant="outline" onClick={() => { setIsEditOpen(false); resetForm() }}>
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

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="border-primary/10 bg-card/50">
          <CardContent className="p-4 flex flex-col gap-1">
            <span className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider">In Progress</span>
            <div className="flex items-center justify-between">
              <span className="text-2xl font-bold">{taskStats.inProgress}</span>
              <Activity size={16} className="text-blue-500 opacity-50" />
            </div>
          </CardContent>
        </Card>
        <Card className="border-primary/10 bg-card/50">
          <CardContent className="p-4 flex flex-col gap-1">
            <span className="text-[10px] text-red-400 font-bold uppercase tracking-wider">Blocked</span>
            <div className="flex items-center justify-between">
              <span className="text-2xl font-bold text-red-400">{taskStats.blocked}</span>
              <Activity size={16} className="text-red-500 opacity-50" />
            </div>
          </CardContent>
        </Card>
        <Card className="border-primary/10 bg-card/50">
          <CardContent className="p-4 flex flex-col gap-1">
            <span className="text-[10px] text-emerald-400 font-bold uppercase tracking-wider">Completed</span>
            <div className="flex items-center justify-between">
              <span className="text-2xl font-bold text-emerald-400">{taskStats.completed}</span>
              <Activity size={16} className="text-emerald-500 opacity-50" />
            </div>
          </CardContent>
        </Card>
        <Card className="border-primary/10 bg-card/50">
          <CardContent className="p-4 flex flex-col gap-1">
            <span className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider">Total Todo</span>
            <div className="flex items-center justify-between">
              <span className="text-2xl font-bold">{taskStats.todo}</span>
              <Activity size={16} className="text-muted-foreground opacity-30" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Bucket Tabs and Controls */}
      <div className="flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-2 overflow-x-auto pb-2 md:pb-0 w-full md:w-auto scrollbar-hide">
          {BUCKETS.map((bucket) => (
            <Button
              key={bucket}
              variant={activeBucket === bucket ? "default" : "outline"}
              className="shrink-0"
              onClick={() => setActiveBucket(bucket)}
            >
              {bucket.charAt(0).toUpperCase() + bucket.slice(1).replace("-", " ")}
            </Button>
          ))}
        </div>

        <div className="flex items-center gap-2 w-full md:w-auto">
          <div className="relative flex-1 md:w-64">
            <Filter className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search tasks..."
              className="pl-9 bg-white border-muted shadow-none h-10"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <Select value={filterPriority} onValueChange={setFilterPriority}>
            <SelectTrigger className="w-[130px] h-10 bg-white border-muted">
              <SelectValue placeholder="Priority" />
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

      {/* Tasks Grid */}
      {/* Tasks Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {filteredTasks.length > 0 ? (
          filteredTasks.map((task) => (
            <Card key={task.id} className={cn("group hover:border-primary/30 transition-all border-border/50", task.is_completed && "opacity-50")}>
              <CardContent className="p-4">
                <div className="flex gap-3">
                  {/* Checkbox */}
                  <div
                    className={cn(
                      "size-5 rounded border-2 flex items-center justify-center transition-colors shrink-0 mt-0.5 cursor-pointer",
                      task.is_completed ? "bg-primary border-primary" : "border-muted-foreground/30 hover:border-primary hover:bg-primary/10"
                    )}
                    onClick={(e) => { e.stopPropagation(); updateTaskStatus(task.id, task.is_completed ? "todo" : "completed") }}
                  >
                    {task.is_completed && <CheckCircle2 size={12} className="text-primary-foreground" />}
                  </div>

                  {/* Task Content */}
                  <div className="flex-1 min-w-0">
                    {/* Title + priority + deadline */}
                    <div className="flex items-start gap-2 mb-2 flex-wrap">
                      <h3 className={cn("font-semibold text-sm flex-1 min-w-0 leading-snug", task.is_completed && "line-through")}>
                        {task.title}
                      </h3>
                      <div className="flex items-center gap-1 shrink-0">
                        <span className={cn(
                          "text-[10px] px-1.5 py-0.5 rounded font-medium capitalize",
                          task.priority === "urgent" ? "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-400" :
                          task.priority === "high" ? "bg-orange-100 text-orange-700 dark:bg-orange-950/40 dark:text-orange-400" :
                          task.priority === "medium" ? "bg-yellow-100 text-yellow-700 dark:bg-yellow-950/40 dark:text-yellow-400" :
                          "bg-muted text-muted-foreground"
                        )}>{task.priority}</span>
                        {task.due_date && getDeadlineBadge(task.due_date)}
                      </div>
                    </div>

                    {/* Notes preview */}
                    {(task as any).notes && (
                      <p className="text-xs text-muted-foreground line-clamp-2 mb-2">{(task as any).notes}</p>
                    )}

                    {/* Status dropdown — single control */}
                    <Select value={task.status} onValueChange={(v) => updateTaskStatus(task.id, v)}>
                      <SelectTrigger className="h-6 w-auto text-[11px] border-0 bg-muted/60 px-2 gap-1 rounded-md" onClick={(e) => e.stopPropagation()}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {STATUSES.map((s) => (
                          <SelectItem key={s} value={s} className="text-xs capitalize">
                            {s.replace("-", " ")}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Action Buttons */}
                  <div className="flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-7 text-muted-foreground hover:text-primary hover:bg-primary/10"
                      onClick={(e) => { e.stopPropagation(); setCommentTask(task) }}
                    >
                      <MessageSquare size={14} />
                    </Button>
                    {clientData?.can_create_tasks && (
                      <>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-7 text-muted-foreground hover:text-primary hover:bg-primary/10"
                          onClick={(e) => { e.stopPropagation(); handleEditClick(task) }}
                        >
                          <Pencil size={14} />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-7 text-destructive hover:bg-destructive/10"
                          onClick={(e) => { e.stopPropagation(); handleDeleteClick(task) }}
                        >
                          <Trash2 size={14} />
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        ) : (
          <div className="col-span-full flex flex-col items-center justify-center py-12 text-center">
            <Activity size={32} className="text-muted-foreground/30 mb-4" />
            <p className="text-muted-foreground">No tasks in this bucket</p>
          </div>
        )}
      </div>

      {/* Comments Dialog */}
      <Dialog open={!!commentTask} onOpenChange={(v) => { if (!v) setCommentTask(null) }}>
        <DialogContent className="sm:max-w-[600px] h-[500px] flex flex-col">
          <DialogHeader>
            <DialogTitle className="truncate">{commentTask?.title}</DialogTitle>
          </DialogHeader>
          <div className="flex-1 min-h-0">
            {commentTask && <TaskComments taskId={commentTask.id} />}
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Task</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{selectedTask?.title}"? This action cannot be undone.
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
