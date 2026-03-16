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
import { format, isPast, differenceInDays } from "date-fns"
import { Plus, Trash2, CheckCircle2, Filter, Pencil, MessageSquare } from "lucide-react"
import { cn } from "@/lib/utils"

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
    <div
      className="flex flex-col rounded-xl overflow-hidden border border-[#333331]"
      style={{ fontFamily: "'DM Sans', sans-serif", background: "#1C1C1A" }}
    >
      {/* Header */}
      <div className="flex items-start justify-between px-5 pt-5 pb-4 border-b border-[#333331] bg-[#1C1C1A]">
        <div>
          <h1 className="text-lg font-semibold text-[#F0EFEC] tracking-tight">Tasks & Execution</h1>
          <p className="text-xs text-[#555552] mt-0.5">Your project tasks — no complexity, just momentum.</p>
        </div>
        {clientData?.can_create_tasks && (
          <div className="flex gap-2">
            <Dialog
              open={isDialogOpen}
              onOpenChange={(open) => {
                setIsDialogOpen(open)
                if (!open) resetForm()
              }}
            >
              <DialogTrigger asChild>
                <button className="h-8 px-3 text-xs font-medium rounded-md bg-[#F0EFEC] hover:bg-white text-[#1C1C1A] transition-colors flex items-center gap-1.5">
                  <Plus size={13} />Add task
                </button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[580px] bg-[#1C1C1A] border-[#333331] text-[#F0EFEC]">
                <DialogHeader>
                  <DialogTitle className="text-[#F0EFEC]">Add New Task</DialogTitle>
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
                  <Button variant="outline" onClick={() => { setIsDialogOpen(false); resetForm() }} className="border-[#444442] text-[#8A8A85] bg-transparent hover:bg-[#252523]">
                    Cancel
                  </Button>
                  <Button onClick={createOrUpdateTask} disabled={isLoading} className="bg-[#F0EFEC] text-[#1C1C1A] hover:bg-white">
                    {isLoading ? "Creating..." : "Create Task"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            <Dialog open={isEditOpen} onOpenChange={(open) => { setIsEditOpen(open); if (!open) resetForm() }}>
              <DialogContent className="sm:max-w-[580px] bg-[#1C1C1A] border-[#333331] text-[#F0EFEC]">
                <DialogHeader>
                  <DialogTitle className="text-[#F0EFEC]">Edit Task</DialogTitle>
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
                  <Button variant="outline" onClick={() => { setIsEditOpen(false); resetForm() }} className="border-[#444442] text-[#8A8A85] bg-transparent hover:bg-[#252523]">
                    Cancel
                  </Button>
                  <Button onClick={createOrUpdateTask} disabled={isLoading} className="bg-[#F0EFEC] text-[#1C1C1A] hover:bg-white">
                    {isLoading ? "Updating..." : "Update Task"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        )}
      </div>

      {/* Analytics bar — project scoped, no workload */}
      <div className="border-b border-[#333331] bg-[#1C1C1A]">
        <div className="grid grid-cols-4 divide-x divide-[#333331]">
          {/* Completion rate */}
          <div className="px-4 py-3">
            <p className="text-[10px] uppercase tracking-widest text-[#555552] mb-1.5">Completion rate</p>
            <div className="flex items-baseline gap-2 mb-2">
              <span className="text-xl font-medium text-emerald-400">
                {tasks.length > 0 ? Math.round((taskStats.completed / tasks.length) * 100) : 0}%
              </span>
              <span className="text-xs text-[#555552]">this project</span>
            </div>
            <div className="h-1 bg-[#252523] rounded-full overflow-hidden">
              <div
                className="h-full bg-emerald-500 rounded-full transition-all duration-500"
                style={{ width: `${tasks.length > 0 ? Math.round((taskStats.completed / tasks.length) * 100) : 0}%` }}
              />
            </div>
          </div>
          {/* Volume */}
          <div className="px-4 py-3">
            <p className="text-[10px] uppercase tracking-widest text-[#555552] mb-1.5">Volume</p>
            <div className="flex items-baseline gap-3">
              <div>
                <span className="text-xl font-medium text-[#F0EFEC]">{tasks.length}</span>
                <span className="text-[10px] text-[#555552] ml-1">total</span>
              </div>
              <span className="text-[#333331]">·</span>
              <div>
                <span className="text-xl font-medium text-emerald-400">{taskStats.completed}</span>
                <span className="text-[10px] text-[#555552] ml-1">done</span>
              </div>
            </div>
          </div>
          {/* Overdue */}
          <div className="px-4 py-3">
            <p className="text-[10px] uppercase tracking-widest text-[#555552] mb-1.5">Overdue</p>
            <div className="flex items-baseline gap-2">
              <span className={cn("text-xl font-medium", tasks.filter(t => t.due_date && isPast(new Date(t.due_date)) && !t.is_completed).length > 0 ? "text-red-400" : "text-[#8A8A85]")}>
                {tasks.filter(t => t.due_date && isPast(new Date(t.due_date)) && !t.is_completed).length}
              </span>
              <span className="text-xs text-[#555552]">tasks</span>
            </div>
          </div>
          {/* Blocked */}
          <div className="px-4 py-3">
            <p className="text-[10px] uppercase tracking-widest text-[#555552] mb-1.5">Blocked</p>
            <div className="flex items-baseline gap-2">
              <span className={cn("text-xl font-medium", taskStats.blocked > 0 ? "text-amber-400" : "text-[#8A8A85]")}>
                {taskStats.blocked}
              </span>
              <span className="text-xs text-[#555552]">tasks</span>
            </div>
          </div>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-[#333331] bg-[#1C1C1A]">
        <div className="flex items-center gap-1.5">
          {BUCKETS.map((bucket) => (
            <button
              key={bucket}
              onClick={() => setActiveBucket(bucket)}
              className={cn(
                "px-3 py-1.5 rounded-md text-xs transition-colors",
                activeBucket === bucket
                  ? "bg-[#2E2E2C] text-[#F0EFEC] font-medium"
                  : "text-[#555552] hover:text-[#F0EFEC]"
              )}
            >
              {bucket.charAt(0).toUpperCase() + bucket.slice(1).replace("-", " ")}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 ml-auto">
          <div className="relative">
            <Filter size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#555552]" />
            <input
              placeholder="Search tasks…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-7 pl-7 pr-3 text-xs bg-[#252523] border border-[#333331] rounded-md text-[#F0EFEC] placeholder:text-[#555552] outline-none focus:border-[#555552] w-44"
            />
          </div>
          <select
            value={filterPriority}
            onChange={(e) => setFilterPriority(e.target.value)}
            className="h-7 px-2 text-xs bg-[#252523] border border-[#333331] rounded-md text-[#8A8A85] outline-none focus:border-[#555552]"
          >
            <option value="all">All priorities</option>
            {PRIORITIES.map((p) => (
              <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Task list */}
      <div className="overflow-y-auto max-h-[600px]">
        <div className="px-3 py-2 flex flex-col gap-0.5 bg-[#1C1C1A]">
          {/* Active */}
          {filteredTasks.filter(t => !t.is_completed).length > 0 && (
            <>
              <div className="flex items-center gap-1.5 px-1 py-1.5 mb-0.5">
                <span className="text-[10px] uppercase tracking-widest text-[#555552] font-medium">Active</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-[#252523] text-[#555552]">
                  {filteredTasks.filter(t => !t.is_completed).length}
                </span>
              </div>
              {filteredTasks.filter(t => !t.is_completed).map((task) => (
                <div
                  key={task.id}
                  className="flex items-center gap-2.5 px-3 py-2 rounded-lg cursor-pointer group transition-all border border-transparent hover:bg-[#252523]/80 hover:border-[#333331] bg-[#1C1C1A]"
                >
                  {/* Checkbox */}
                  <button
                    onClick={() => updateTaskStatus(task.id, "completed")}
                    className="w-4 h-4 rounded-full border border-[#444442] hover:border-emerald-500/60 flex items-center justify-center shrink-0 transition-all"
                  />
                  {/* Priority dot */}
                  <span style={{
                    width: 7, height: 7, borderRadius: "50%", flexShrink: 0, display: "inline-block",
                    background: task.priority === "urgent" ? "#E24B4A" : task.priority === "high" ? "#EF9F27" : task.priority === "medium" ? "#888780" : "#B4B2A9"
                  }} />
                  {/* Title */}
                  <span className="flex-1 min-w-0 text-sm text-[#F0EFEC] truncate">{task.title}</span>
                  {/* Meta */}
                  <div className="flex items-center gap-1.5 shrink-0">
                    {task.due_date && isPast(new Date(task.due_date)) && (
                      <span className="text-[10px] px-2 py-0.5 rounded-full border font-medium whitespace-nowrap bg-red-500/15 text-red-400 border-red-500/20">Overdue</span>
                    )}
                    {task.due_date && !isPast(new Date(task.due_date)) && differenceInDays(new Date(task.due_date), new Date()) <= 2 && (
                      <span className="text-[10px] px-2 py-0.5 rounded-full border font-medium whitespace-nowrap bg-amber-500/15 text-amber-400 border-amber-500/20">
                        {differenceInDays(new Date(task.due_date), new Date())}d left
                      </span>
                    )}
                    <span className={cn(
                      "text-[10px] px-2 py-0.5 rounded-full border font-medium whitespace-nowrap capitalize",
                      task.status === "completed" ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/20" :
                      task.status === "in-progress" ? "bg-blue-500/15 text-blue-400 border-blue-500/20" :
                      task.status === "blocked" ? "bg-red-500/15 text-red-400 border-red-500/20" :
                      "bg-[#252523] text-[#8A8A85] border-[#333331]"
                    )}>{task.status.replace("-", " ")}</span>
                  </div>
                  {/* Hover actions */}
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                    <button onClick={() => setCommentTask(task)} className="w-6 h-6 rounded flex items-center justify-center text-[#555552] hover:text-[#F0EFEC] hover:bg-[#252523] transition-colors">
                      <MessageSquare size={11} />
                    </button>
                    {clientData?.can_create_tasks && (
                      <>
                        <button onClick={() => handleEditClick(task)} className="w-6 h-6 rounded flex items-center justify-center text-[#555552] hover:text-[#F0EFEC] hover:bg-[#252523] transition-colors">
                          <Pencil size={11} />
                        </button>
                        <button onClick={() => handleDeleteClick(task)} className="w-6 h-6 rounded flex items-center justify-center text-[#555552] hover:text-red-400 hover:bg-[#252523] transition-colors">
                          <Trash2 size={11} />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </>
          )}

          {/* Completed */}
          {filteredTasks.filter(t => t.is_completed).length > 0 && (
            <div className="mt-2">
              <div className="flex items-center gap-1.5 px-1 py-1.5 mb-0.5">
                <span className="text-[10px] uppercase tracking-widest text-[#555552] font-medium">Completed</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-[#252523] text-[#555552]">
                  {filteredTasks.filter(t => t.is_completed).length}
                </span>
              </div>
              {filteredTasks.filter(t => t.is_completed).map((task) => (
                <div key={task.id} className="flex items-center gap-2.5 px-3 py-2 rounded-lg group transition-all opacity-40 bg-[#1C1C1A]">
                  <button
                    onClick={() => updateTaskStatus(task.id, "todo")}
                    className="w-4 h-4 rounded-full bg-emerald-500 border-emerald-500 flex items-center justify-center shrink-0"
                  >
                    <CheckCircle2 size={10} className="text-white" />
                  </button>
                  <span style={{ width: 7, height: 7, borderRadius: "50%", flexShrink: 0, display: "inline-block", background: "#888780" }} />
                  <span className="flex-1 min-w-0 text-sm text-[#8A8A85] truncate line-through">{task.title}</span>
                </div>
              ))}
            </div>
          )}

          {/* Empty state */}
          {filteredTasks.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
              <div className="w-10 h-10 rounded-xl bg-[#252523] border border-[#333331] flex items-center justify-center">
                <CheckCircle2 size={18} className="text-[#444442]" />
              </div>
              <div>
                <p className="text-sm text-[#555552] font-medium">No tasks here</p>
                <p className="text-xs text-[#444442] mt-0.5">{searchQuery ? "Try a different search" : "Add a task to get started"}</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Comments Dialog */}
      <Dialog open={!!commentTask} onOpenChange={(v) => { if (!v) setCommentTask(null) }}>
        <DialogContent className="sm:max-w-[600px] h-[500px] flex flex-col bg-[#1C1C1A] border-[#333331]">
          <DialogHeader>
            <DialogTitle className="truncate text-[#F0EFEC]">{commentTask?.title}</DialogTitle>
          </DialogHeader>
          <div className="flex-1 min-h-0">
            {commentTask && <TaskComments taskId={commentTask.id} />}
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
        <AlertDialogContent className="bg-[#1C1C1A] border-[#333331]">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-[#F0EFEC]">Delete Task</AlertDialogTitle>
            <AlertDialogDescription className="text-[#555552]">
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-[#444442] text-[#8A8A85] bg-transparent hover:bg-[#252523]">Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={deleteTask} className="bg-red-600 hover:bg-red-500 text-white border-none">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
