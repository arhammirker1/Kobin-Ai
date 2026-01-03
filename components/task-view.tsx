"use client"

import { useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
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
import { toast } from "react-hot-toast"
import { format, isThisWeek, isPast, differenceInDays } from "date-fns"
import useSWR from "swr"
import { Plus, Clock, Filter, Trash2, Pencil, CheckCircle2, Link, Activity } from "lucide-react"

const BUCKETS = ["today", "this-week", "delegated", "backlog"]
const PRIORITIES = ["low", "medium", "high", "urgent"]
const STATUSES = ["todo", "in-progress", "blocked", "completed"]
const UNASSIGNED = "__unassigned__"

interface Task {
  id: string
  user_id: string
  title: string
  bucket: string
  is_completed: boolean
  priority: string
  status: string
  due_date: string | null
  assigned_to: string | null
  linked: string | null
  created_at: string
}

interface TeamMember {
  id: string
  user_id: string
  position: string
  profile: {
    full_name: string
  }
}

interface TaskViewProps {
  permissions?: {
    can_create_tasks: boolean
    can_update_task_status: boolean
    founder_id?: string
  }
}

export function TaskView({ permissions }: TaskViewProps = {}) {
  const supabase = createClient()
  const [activeBucket, setActiveBucket] = useState("today")
  const [activeFilter, setActiveFilter] = useState("all")
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [isEditOpen, setIsEditOpen] = useState(false)
  const [isEditModalOpen, setIsEditModalOpen] = useState(false)
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false)
  const [editingTask, setEditingTask] = useState<Task | null>(null)
  const [selectedTask, setSelectedTask] = useState<Task | null>(null)
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([])
  const [newTask, setNewTask] = useState({
    title: "",
    priority: "medium",
    status: "todo",
    deadline: "",
    assigned_to: "",
    linked: "",
  })

  const {
    data: tasks,
    error: tasksError,
    mutate: mutateTasks,
  } = useSWR(
    ["tasks", activeBucket],
    async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) return []

      const query = supabase.from("tasks").select("*").eq("bucket", activeBucket)

      if (permissions?.founder_id) {
        // Team member view: Show tasks created by founder, assigned to them, or created by them
        query.or(
          `user_id.eq.${permissions.founder_id},assigned_to.eq.${user.id},created_by.eq.${user.id},user_id.eq.${user.id}`,
        )
      } else {
        // Founder view
        query.or(`user_id.eq.${user.id},created_by.eq.${user.id}`)
      }

      const { data, error } = await query.order("created_at", { ascending: false })
      if (error) throw error
      return sortTasksByPriorityAndDeadline(data || [])
    },
    { revalidateOnFocus: true },
  )

  const { data: allTasks } = useSWR("all-tasks-stats", async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return []
    const founderId = permissions?.founder_id || user.id
    const { data } = await supabase
      .from("tasks")
      .select("status")
      .or(`user_id.eq.${founderId},created_by.eq.${founderId}`)
    return data || []
  })

  const taskStats = (allTasks || []).reduce(
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

  const fetchTeamMembers = async () => {
    if (!supabase) return
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return

    const founderId = permissions?.founder_id || user.id

    const { data, error } = await supabase
      .from("team_members")
      .select(`
        id,
        user_id,
        position,
        profile:profiles!team_members_user_id_profiles_fkey(full_name)
      `)
      .eq("founder_id", founderId)
      .eq("is_active", true)

    if (error) {
      console.error("[v0] Error fetching team members:", error)
    } else {
      setTeamMembers(data || [])
    }
  }

  const sortTasksByPriorityAndDeadline = (tasks: Task[]) => {
    const priorityWeight = { urgent: 4, high: 3, medium: 2, low: 1 }

    return tasks.sort((a, b) => {
      // Completed tasks go to bottom
      if (a.is_completed && !b.is_completed) return 1
      if (!a.is_completed && b.is_completed) return -1

      // Sort by priority first
      const priorityDiff =
        (priorityWeight[b.priority as keyof typeof priorityWeight] || 0) -
        (priorityWeight[a.priority as keyof typeof priorityWeight] || 0)
      if (priorityDiff !== 0) return priorityDiff

      // Then sort by deadline (tasks with closer deadlines first)
      if (a.due_date && b.due_date) {
        return new Date(a.due_date).getTime() - new Date(b.due_date).getTime()
      }
      if (a.due_date && !b.due_date) return -1
      if (!a.due_date && b.due_date) return 1

      return 0
    })
  }

  const handleAddTask = async () => {
    if (!supabase) return
    if (!newTask.title.trim()) {
      toast.error("Please enter a task title")
      return
    }

    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return

    const taskData = {
      user_id: permissions?.founder_id || user.id,
      created_by: user.id,
      title: newTask.title,
      bucket: activeBucket,
      priority: newTask.priority,
      status: newTask.status,
      due_date: newTask.deadline ? new Date(newTask.deadline).toISOString() : null,
      assigned_to: newTask.assigned_to === UNASSIGNED ? null : newTask.assigned_to || null,
      linked: newTask.linked || null,
      is_completed: false,
    }

    const { error } = await supabase.from("tasks").insert(taskData)

    if (error) {
      console.error("[v0] Error adding task:", error)
      toast.error("Failed to add task")
    } else {
      setNewTask({ title: "", priority: "medium", status: "todo", deadline: "", assigned_to: "", linked: "" })
      setIsDialogOpen(false)
      mutateTasks()
      toast.success("Task added successfully")
    }
  }

  const handleUpdateTask = async () => {
    if (!supabase || !editingTask) return
    if (!newTask.title.trim()) {
      toast.error("Please enter a task title")
      return
    }

    const taskData = {
      title: newTask.title,
      priority: newTask.priority,
      status: newTask.status,
      due_date: newTask.deadline ? new Date(newTask.deadline).toISOString() : null,
      assigned_to: newTask.assigned_to === UNASSIGNED ? null : newTask.assigned_to || null,
      linked: newTask.linked || null,
      is_completed: newTask.status === "completed",
    }

    const { error } = await supabase.from("tasks").update(taskData).eq("id", editingTask.id)

    if (error) {
      console.error("[v0] Error updating task:", error)
      toast.error("Failed to update task")
    } else {
      setIsEditOpen(false)
      setEditingTask(null)
      setNewTask({ title: "", priority: "medium", status: "todo", deadline: "", assigned_to: "", linked: "" })
      mutateTasks()
      toast.success("Task updated successfully")
    }
  }

  const handleEditClick = (task: Task) => {
    setEditingTask(task)
    setNewTask({
      title: task.title,
      priority: task.priority,
      status: task.status,
      deadline: task.due_date ? format(new Date(task.due_date), "yyyy-MM-dd'T'HH:mm") : "",
      assigned_to: task.assigned_to || UNASSIGNED,
      linked: task.linked || "",
    })
    setIsEditOpen(true)
    fetchTeamMembers()
  }

  const toggleTask = async (id: string, is_completed: boolean) => {
    if (!supabase) return
    const newStatus = !is_completed ? "completed" : "todo"

    const previousTasks = tasks
    if (tasks) {
      const updatedTasks = tasks.map((t) =>
        t.id === id ? { ...t, is_completed: !is_completed, status: newStatus } : t,
      )
      mutateTasks(updatedTasks, false)
    }

    const { error } = await supabase
      .from("tasks")
      .update({ is_completed: !is_completed, status: newStatus })
      .eq("id", id)

    if (error) {
      mutateTasks(previousTasks, false)
      toast.error("Failed to update task")
    } else {
      mutateTasks() // revalidate
      toast.success(!is_completed ? "Task completed!" : "Task reopened")
    }
  }

  const updateTaskStatus = async (id: string, status: string) => {
    if (!supabase) return

    const isCompleted = status === "completed"

    const previousTasks = tasks
    if (tasks) {
      const updatedTasks = tasks.map((t) => (t.id === id ? { ...t, status, is_completed: isCompleted } : t))
      mutateTasks(updatedTasks, false)
    }

    const { error } = await supabase.from("tasks").update({ status, is_completed: isCompleted }).eq("id", id)

    if (error) {
      mutateTasks(previousTasks, false)
      toast.error("Failed to update status")
    } else {
      mutateTasks() // revalidate
      toast.success("Status updated")
    }
  }

  const handleDeleteTask = async () => {
    if (!supabase || !selectedTask) return

    const id = selectedTask.id
    const previousTasks = tasks
    if (tasks) {
      mutateTasks(
        tasks.filter((t) => t.id !== id),
        false,
      )
    }

    const { error } = await supabase.from("tasks").delete().eq("id", id)

    if (error) {
      mutateTasks(previousTasks, false)
      toast.error("Failed to delete task")
    } else {
      mutateTasks() // revalidate
      toast.success("Task deleted")
    }
    setIsDeleteModalOpen(false)
  }

  const getDeadlineBadge = (due_date: string | null) => {
    if (!due_date) return null

    const daysUntil = differenceInDays(new Date(due_date), new Date())
    const isOverdue = isPast(new Date(due_date))

    if (isOverdue) {
      return (
        <Badge variant="destructive" className="text-[9px] font-bold uppercase tracking-widest">
          {/* Overdue icon */}
          <Clock size={10} className="mr-1" />
          Overdue
        </Badge>
      )
    } else if (daysUntil <= 2) {
      return (
        <Badge
          variant="outline"
          className="text-[9px] font-bold uppercase tracking-widest bg-orange-100 text-orange-700 border-orange-300"
        >
          {/* Clock icon */}
          <Clock size={10} className="mr-1" />
          {daysUntil}d left
        </Badge>
      )
    }

    return (
      <Badge variant="outline" className="text-[9px] font-bold uppercase tracking-widest bg-muted/30">
        {/* Clock icon */}
        <Clock size={10} className="mr-1" />
        {format(new Date(due_date), "MMM d")}
      </Badge>
    )
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

  const filteredTasks = tasks?.filter((task) => {
    const matchesSearch = task.title.toLowerCase().includes(newTask.title.toLowerCase())
    const matchesPriority = !newTask.priority || task.priority === newTask.priority
    return matchesSearch && matchesPriority
  })

  const thisWeekTasks = tasks?.filter(
    (task) => !task.is_completed && task.due_date && isThisWeek(new Date(task.due_date)),
  )

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-3xl font-bold tracking-tight">Tasks & Execution</h1>
          <p className="text-muted-foreground text-sm">Founder-first task management. No complexity, just momentum.</p>
        </div>
        <div className="flex gap-2 w-full md:w-auto">
          {(permissions?.can_create_tasks ?? true) && (
            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
              <DialogTrigger asChild>
                <Button className="gap-2 shadow-sm font-bold" onClick={() => fetchTeamMembers()}>
                  {/* Plus icon */}
                  <Plus size={18} />
                  Add Task
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[500px]">
                <DialogHeader>
                  <DialogTitle>Add New Task</DialogTitle>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                  <div className="grid gap-2">
                    <Label htmlFor="title">Task Title</Label>
                    <Input
                      id="title"
                      placeholder="What needs to be done?"
                      value={newTask.title}
                      onChange={(e) => setNewTask({ ...newTask, title: e.target.value })}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="grid gap-2">
                      <Label htmlFor="priority">Priority</Label>
                      <Select value={newTask.priority} onValueChange={(v) => setNewTask({ ...newTask, priority: v })}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {PRIORITIES.map((p) => (
                            <SelectItem key={p} value={p} className="capitalize">
                              {p}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="status">Status</Label>
                      <Select value={newTask.status} onValueChange={(v) => setNewTask({ ...newTask, status: v })}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {STATUSES.map((s) => (
                            <SelectItem key={s} value={s} className="capitalize">
                              {s.replace("-", " ")}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="deadline">Deadline</Label>
                    <Input
                      id="deadline"
                      type="datetime-local"
                      value={newTask.deadline}
                      onChange={(e) => setNewTask({ ...newTask, deadline: e.target.value })}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="assigned_to">Assign To (Optional)</Label>
                    <Select
                      value={newTask.assigned_to}
                      onValueChange={(v) => setNewTask({ ...newTask, assigned_to: v })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select team member" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={UNASSIGNED}>Unassigned</SelectItem>
                        {teamMembers.map((member) => (
                          <SelectItem key={member.user_id} value={member.user_id}>
                            {member.profile?.full_name ?? "Unnamed"} - {member.position}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="linked">Linked To (Optional)</Label>
                    <Input
                      id="linked"
                      placeholder="Related project or goal"
                      value={newTask.linked}
                      onChange={(e) => setNewTask({ ...newTask, linked: e.target.value })}
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button onClick={handleAddTask}>Create Task</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}

          <Dialog
            open={isEditOpen}
            onOpenChange={(open) => {
              setIsEditOpen(open)
              if (!open) setEditingTask(null)
            }}
          >
            <DialogContent className="sm:max-w-[500px]">
              <DialogHeader>
                <DialogTitle>Edit Task</DialogTitle>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="grid gap-2">
                  <Label htmlFor="edit-title">Task Title</Label>
                  <Input
                    id="edit-title"
                    placeholder="What needs to be done?"
                    value={newTask.title}
                    onChange={(e) => setNewTask({ ...newTask, title: e.target.value })}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="edit-priority">Priority</Label>
                    <Select value={newTask.priority} onValueChange={(v) => setNewTask({ ...newTask, priority: v })}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {PRIORITIES.map((p) => (
                          <SelectItem key={p} value={p} className="capitalize">
                            {p}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="edit-status">Status</Label>
                    <Select value={newTask.status} onValueChange={(v) => setNewTask({ ...newTask, status: v })}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {STATUSES.map((s) => (
                          <SelectItem key={s} value={s} className="capitalize">
                            {s.replace("-", " ")}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="edit-deadline">Deadline</Label>
                  <Input
                    id="edit-deadline"
                    type="datetime-local"
                    value={newTask.deadline}
                    onChange={(e) => setNewTask({ ...newTask, deadline: e.target.value })}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="edit-assigned_to">Assign To (Optional)</Label>
                  <Select value={newTask.assigned_to} onValueChange={(v) => setNewTask({ ...newTask, assigned_to: v })}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select team member" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={UNASSIGNED}>Unassigned</SelectItem>
                      {teamMembers.map((member) => (
                        <SelectItem key={member.user_id} value={member.user_id}>
                          {member.profile?.full_name ?? "Unnamed"} - {member.position}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="edit-linked">Linked To (Optional)</Label>
                  <Input
                    id="edit-linked"
                    placeholder="Related project or goal"
                    value={newTask.linked}
                    onChange={(e) => setNewTask({ ...newTask, linked: e.target.value })}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => {
                    setIsEditOpen(false)
                    setEditingTask(null)
                  }}
                >
                  Cancel
                </Button>
                <Button onClick={handleUpdateTask}>Save Changes</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
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

      <div className="flex flex-col md:flex-row gap-4 items-start md:items-center justify-between">
        <div className="flex items-center gap-2 w-full md:w-auto">
          <div className="relative flex-1 md:w-64">
            {/* Filter icon */}
            <Filter className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search tasks..."
              className="pl-9 bg-white border-muted shadow-none h-10"
              value={newTask.title}
              onChange={(e) => setNewTask({ ...newTask, title: e.target.value })}
            />
          </div>
          <Button
            variant={activeFilter === "high" ? "default" : "outline"}
            size="icon"
            className="h-10 w-10 shrink-0 bg-white"
            onClick={() => setActiveFilter(activeFilter === "high" ? "all" : "high")}
            title="Filter High Priority"
          >
            {/* Filter icon */}
            <Filter size={18} />
          </Button>
        </div>
      </div>

      {activeBucket === "this-week" && thisWeekTasks && thisWeekTasks.length > 0 && (
        <Card className="bg-primary/5 border-primary/20">
          <CardHeader>
            <CardTitle className="text-sm font-bold flex items-center gap-2">
              {/* Clock icon */}
              <Clock size={16} />
              This Week's Focus ({thisWeekTasks.length} tasks)
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {thisWeekTasks.slice(0, 5).map((task) => (
              <div
                key={task.id}
                className="p-3 rounded-xl bg-background border flex items-center justify-between text-sm"
              >
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <Badge
                    className={`text-[9px] font-bold uppercase tracking-widest ${getPriorityColor(task.priority)}`}
                  >
                    {task.priority}
                  </Badge>
                  <span className="font-medium truncate">{task.title}</span>
                </div>
                <div className="flex items-center gap-2">
                  {task.due_date && getDeadlineBadge(task.due_date)}
                  <Select value={task.status} onValueChange={(v) => updateTaskStatus(task.id, v)}>
                    <SelectTrigger className="h-8 w-32 text-xs">
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
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {tasks?.map((task) => (
          <div key={task.id} className="relative group">
            <Card
              className={`group hover:border-primary/30 transition-all cursor-pointer shadow-sm ${task.is_completed ? "opacity-60" : ""}`}
            >
              <CardContent className="p-4">
                <div className="flex items-center gap-4">
                  <div
                    className={`size-6 rounded border-2 flex items-center justify-center transition-colors shrink-0 ${task.is_completed ? "bg-primary border-primary" : "border-muted-foreground/30 hover:border-primary hover:bg-primary/10"}`}
                    onClick={() => toggleTask(task.id, task.is_completed)}
                  >
                    {task.is_completed ? (
                      <CheckCircle2 size={16} className="text-primary-foreground" />
                    ) : (
                      <div className="size-2 rounded-full bg-muted-foreground/30" />
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-1 flex-wrap">
                      <h3
                        className={`font-bold text-sm truncate group-hover:text-primary transition-colors ${task.is_completed ? "line-through" : ""}`}
                      >
                        {task.title}
                      </h3>
                      <Badge
                        className={`text-[9px] font-bold uppercase tracking-widest ${getPriorityColor(task.priority)}`}
                      >
                        {task.priority}
                      </Badge>
                      {task.due_date && getDeadlineBadge(task.due_date)}
                    </div>
                    <div className="flex items-center gap-4 text-xs text-muted-foreground font-medium flex-wrap">
                      {task.linked && (
                        <span className="flex items-center gap-1.5">
                          {/* Link icon */}
                          <Link size={12} />
                          Linked to: <span className="text-foreground">{task.linked}</span>
                        </span>
                      )}
                      {task.assigned_to && (
                        <span className="flex items-center gap-1.5">
                          Assigned:
                          <span className="text-foreground">
                            {teamMembers.find((m) => m.user_id === task.assigned_to)?.profile?.full_name ??
                              "Unassigned"}
                          </span>
                        </span>
                      )}
                      {permissions?.can_update_task_status && (
                        <span className="flex items-center gap-1.5">
                          Status:{" "}
                          <Select value={task.status} onValueChange={(v) => updateTaskStatus(task.id, v)}>
                            <SelectTrigger className="h-6 w-28 text-xs border-0 p-0 font-medium text-foreground">
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
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-8 opacity-0 group-hover:opacity-100 text-destructive hover:text-destructive hover:bg-destructive/10"
                      onClick={(e) => {
                        e.stopPropagation()
                        setSelectedTask(task)
                        setIsDeleteModalOpen(true)
                      }}
                    >
                      {/* Trash2 icon */}
                      <Trash2 size={16} />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-8 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-primary hover:bg-primary/10"
                      onClick={(e) => {
                        e.stopPropagation()
                        handleEditClick(task)
                      }}
                    >
                      {/* Pencil icon */}
                      <Pencil size={16} />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        ))}
      </div>

      <AlertDialog open={isDeleteModalOpen} onOpenChange={setIsDeleteModalOpen}>
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
              onClick={handleDeleteTask}
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
