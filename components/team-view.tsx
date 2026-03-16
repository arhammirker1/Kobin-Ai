"use client"

import type React from "react"
import { useState, useCallback } from "react"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
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
import { cn } from "@/lib/utils"
import { format, isThisWeek, isPast, differenceInDays, startOfWeek } from "date-fns"
import useSWR from "swr"
import {
  Plus, Trash2, Pencil, ChevronDown, ChevronRight, X,
  Calendar, Clock, Filter, Search, Paperclip, MessageSquare,
  AlertCircle, CheckCircle2, Send, BarChart2
} from "lucide-react"
import { TaskForm } from "@/components/task-form"
import { ProjectNameDisplay } from "@/components/project-name-display"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { createClient as createSupabaseClient } from "@/lib/supabase/client"

interface TaskComment {
  id: string
  task_id: string
  user_id: string
  content: string
  created_at: string
  updated_at: string
  profile?: {
    full_name: string
    avatar_url?: string
  }
}

async function getTaskComments(taskId: string): Promise<TaskComment[]> {
  const supabase = createSupabaseClient()
  const { data, error } = await supabase
    .from("task_comments")
    .select("*, profile:profiles(full_name, avatar_url)")
    .eq("task_id", taskId)
    .order("created_at", { ascending: true })
  if (error) throw error
  return data || []
}

async function createTaskComment(taskId: string, content: string) {
  const supabase = createSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error("Not authenticated")
  const { data, error } = await supabase
    .from("task_comments")
    .insert({ task_id: taskId, user_id: user.id, content })
    .select("*, profile:profiles(full_name, avatar_url)")
    .single()
  if (error) throw error
  return data
}

async function deleteTaskComment(commentId: string) {
  const supabase = createSupabaseClient()
  const { error } = await supabase.from("task_comments").delete().eq("id", commentId)
  if (error) throw error
}

// ── Constants ─────────────────────────────────────────────────────────────

const BUCKETS = ["today", "this-week", "delegated", "backlog"]
const PRIORITIES = ["low", "medium", "high", "urgent"]
const STATUSES = ["todo", "in-progress", "blocked", "completed"]
const UNASSIGNED = "__unassigned__"

const INITIAL_TASK_STATE = {
  title: "",
  notes: "",
  resources: [] as Array<{ url: string; title?: string }>,
  priority: "medium" as const,
  status: "todo" as const,
  deadline: "",
  assigned_to: "",
  linked: "",
  related_context_type: "none" as const,
  related_context_id: "",
  related_context_name: "",
  project_id: undefined as string | undefined,
  vault_attachments: [] as Array<{ vault_item_id: string; title: string; drive_file_url: string | null; link_url: string | null }>,
  deliverable_required: false,
  deliverable_description: "",
}

// ── Types ──────────────────────────────────────────────────────────────────

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
  notes: string | null
  resources: Array<{ url: string; title?: string }> | null
  related_context_type: "project" | "goal" | "meeting" | null
  related_context_id: string | null
  related_context_name: string | null
  project_id: string | null
  vault_attachments: Array<{ vault_item_id: string; title: string; drive_file_url: string | null; link_url: string | null }> | null
  deliverable_required: boolean | null
  deliverable_description: string | null
  deliverable_vault_item_id: string | null
  created_at: string
}

interface TeamMember {
  id: string
  user_id: string
  position: string
  profile: { full_name: string }
}

interface TaskViewProps {
  permissions?: {
    can_create_tasks: boolean
    can_update_task_status: boolean
    founder_id?: string
    user_id?: string
  }
  userType?: string
}

// ── Helpers ────────────────────────────────────────────────────────────────

function priorityDot(priority: string) {
  const colors: Record<string, string> = {
    urgent: "#E24B4A",
    high: "#EF9F27",
    medium: "#888780",
    low: "#B4B2A9",
  }
  return (
    <span
      style={{
        width: 7, height: 7, borderRadius: "50%", flexShrink: 0,
        background: colors[priority] || colors.low, display: "inline-block",
      }}
    />
  )
}

function StatusBadge({ status }: { status: string }) {
  const cfg: Record<string, string> = {
    completed: "bg-emerald-500/15 text-emerald-400 border-emerald-500/20",
    "in-progress": "bg-blue-500/15 text-blue-400 border-blue-500/20",
    blocked: "bg-red-500/15 text-red-400 border-red-500/20",
    todo: "bg-zinc-500/10 text-zinc-400 border-zinc-500/15",
  }
  return (
    <span className={cn(
      "text-[10px] px-2 py-0.5 rounded-full border font-medium whitespace-nowrap capitalize",
      cfg[status] ?? cfg.todo
    )}>
      {status.replace("-", " ")}
    </span>
  )
}

function DeadlinePill({ due_date }: { due_date: string }) {
  const daysUntil = differenceInDays(new Date(due_date), new Date())
  const isOverdue = isPast(new Date(due_date))
  if (isOverdue) return (
    <span className="text-[10px] px-2 py-0.5 rounded-full border font-medium whitespace-nowrap bg-red-500/15 text-red-400 border-red-500/20 flex items-center gap-1">
      <AlertCircle size={9} />Overdue
    </span>
  )
  if (daysUntil <= 2) return (
    <span className="text-[10px] px-2 py-0.5 rounded-full border font-medium whitespace-nowrap bg-amber-500/15 text-amber-400 border-amber-500/20 flex items-center gap-1">
      <Clock size={9} />{daysUntil}d left
    </span>
  )
  return (
    <span className="text-[10px] px-2 py-0.5 rounded-full border font-medium whitespace-nowrap bg-zinc-500/10 text-zinc-400 border-zinc-500/15 flex items-center gap-1">
      <Clock size={9} />{format(new Date(due_date), "MMM d")}
    </span>
  )
}

// ── Inline Comments ────────────────────────────────────────────────────────

function InlineComments({ taskId, currentUserId }: { taskId: string; currentUserId: string | null }) {
  const [comments, setComments] = useState<TaskComment[]>([])
  const [newComment, setNewComment] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [loaded, setLoaded] = useState(false)

  const loadComments = useCallback(async () => {
    const data = await getTaskComments(taskId)
    setComments(data)
    setLoaded(true)
  }, [taskId])

  useState(() => { loadComments() })

  const handleSubmit = async () => {
    if (!newComment.trim()) return
    setIsSubmitting(true)
    try {
      await createTaskComment(taskId, newComment.trim())
      setNewComment("")
      await loadComments()
    } catch { toast.error("Failed to add comment") }
    finally { setIsSubmitting(false) }
  }

  const handleDelete = async (commentId: string) => {
    await deleteTaskComment(commentId)
    await loadComments()
  }

  const getInitials = (name: string) =>
    name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2)

  return (
    <div className="flex flex-col h-full">
      <ScrollArea className="flex-1 pr-1">
        <div className="space-y-3">
          {loaded && comments.length === 0 && (
            <p className="text-xs text-zinc-500 py-4 text-center">No comments yet</p>
          )}
          {comments.map((c) => (
            <div key={c.id} className="flex gap-2 group">
              <Avatar className="size-6 shrink-0 mt-0.5">
                <AvatarFallback className="text-[9px] bg-zinc-800 text-zinc-300">
                  {getInitials(c.profile?.full_name || "U")}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-[11px] font-medium text-zinc-200">{c.profile?.full_name || "User"}</span>
                  <span className="text-[10px] text-zinc-600">{format(new Date(c.created_at), "MMM d, h:mm a")}</span>
                </div>
                <p className="text-xs text-zinc-400 leading-relaxed break-words">{c.content}</p>
              </div>
              {currentUserId === c.user_id && (
                <button
                  onClick={() => handleDelete(c.id)}
                  className="opacity-0 group-hover:opacity-100 transition-opacity text-zinc-600 hover:text-red-400 mt-0.5"
                >
                  <X size={11} />
                </button>
              )}
            </div>
          ))}
        </div>
      </ScrollArea>
      <div className="flex gap-2 pt-3 border-t border-zinc-800 mt-3">
        <Input
          placeholder="Add a comment…"
          value={newComment}
          onChange={e => setNewComment(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSubmit() } }}
          disabled={isSubmitting}
          className="flex-1 h-7 text-xs bg-zinc-900 border-zinc-700 text-zinc-200 placeholder:text-zinc-600"
        />
        <button
          onClick={handleSubmit}
          disabled={isSubmitting || !newComment.trim()}
          className="w-7 h-7 rounded bg-zinc-700 hover:bg-zinc-600 disabled:opacity-40 flex items-center justify-center shrink-0 transition-colors"
        >
          <Send size={11} className="text-zinc-200" />
        </button>
      </div>
    </div>
  )
}

// ── Detail Panel ───────────────────────────────────────────────────────────

function DetailPanel({
  task, onClose, onEdit, onDelete, canEditOrDelete,
  getAssigneeName, currentUserId, onToggle, onStatusChange,
}: {
  task: Task
  onClose: () => void
  onEdit: (task: Task) => void
  onDelete: (id: string) => void
  canEditOrDelete: boolean
  getAssigneeName: (id: string | null) => string | null
  currentUserId: string | null
  onToggle: (id: string, is_completed: boolean) => void
  onStatusChange: (id: string, status: string) => void
}) {
  const [activeTab, setActiveTab] = useState<"details" | "comments">("details")

  return (
    <div className="flex flex-col h-full bg-zinc-950 border-l border-zinc-800">
      {/* Panel header */}
      <div className="px-4 pt-4 pb-3 border-b border-zinc-800">
        <div className="flex items-start gap-2 mb-3">
          {/* Complete toggle */}
          <button
            onClick={() => onToggle(task.id, task.is_completed)}
            className={cn(
              "w-4 h-4 rounded-full border flex items-center justify-center shrink-0 mt-0.5 transition-all",
              task.is_completed
                ? "bg-emerald-500 border-emerald-500"
                : "border-zinc-600 hover:border-emerald-500/60"
            )}
          >
            {task.is_completed && <CheckCircle2 size={10} className="text-white" />}
          </button>
          <h2 className={cn(
            "text-sm font-medium leading-snug flex-1 text-zinc-100",
            task.is_completed && "line-through text-zinc-500"
          )}>
            {task.title}
          </h2>
          <button onClick={onClose} className="text-zinc-600 hover:text-zinc-300 transition-colors shrink-0">
            <X size={14} />
          </button>
        </div>

        {/* Meta row */}
        <div className="flex flex-wrap gap-1.5 mb-2">
          <div className="flex items-center gap-1">
            {priorityDot(task.priority)}
            <span className="text-[10px] text-zinc-500 capitalize">{task.priority}</span>
          </div>
          <StatusBadge status={task.status} />
          {task.due_date && <DeadlinePill due_date={task.due_date} />}
          {task.deliverable_required && (
            <span className="text-[10px] px-2 py-0.5 rounded-full border font-medium bg-blue-500/15 text-blue-400 border-blue-500/20 flex items-center gap-1">
              <Paperclip size={9} />deliverable
            </span>
          )}
        </div>

        {/* Chips */}
        <div className="flex flex-wrap gap-1.5">
          {task.assigned_to && (
            <div className="flex items-center gap-1 text-[11px] bg-zinc-900 border border-zinc-800 rounded-full px-2 py-0.5 text-zinc-400">
              <div className="w-3.5 h-3.5 rounded-full bg-zinc-700 flex items-center justify-center text-[8px] text-zinc-300">
                {(getAssigneeName(task.assigned_to) || "?")[0]?.toUpperCase()}
              </div>
              {getAssigneeName(task.assigned_to) || "Assigned"}
            </div>
          )}
          {task.project_id && (
            <div className="text-[11px] bg-zinc-900 border border-zinc-800 rounded-full px-2 py-0.5 text-zinc-400">
              <ProjectNameDisplay projectId={task.project_id} />
            </div>
          )}
          {task.due_date && (
            <div className="flex items-center gap-1 text-[11px] bg-zinc-900 border border-zinc-800 rounded-full px-2 py-0.5 text-zinc-400">
              <Calendar size={10} />
              {format(new Date(task.due_date), "MMM d, yyyy")}
            </div>
          )}
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex border-b border-zinc-800 px-4">
        {(["details", "comments"] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={cn(
              "text-xs py-2.5 mr-4 border-b-2 capitalize transition-colors",
              activeTab === tab
                ? "border-zinc-300 text-zinc-200 font-medium"
                : "border-transparent text-zinc-500 hover:text-zinc-300"
            )}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Panel body */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
        {activeTab === "details" && (
          <>
            {task.notes && (
              <div>
                <p className="text-[10px] uppercase tracking-widest font-medium text-zinc-600 mb-2">Notes</p>
                <p className="text-xs text-zinc-400 leading-relaxed bg-zinc-900 rounded-lg p-3 border border-zinc-800">
                  {task.notes}
                </p>
              </div>
            )}

            {task.vault_attachments && task.vault_attachments.length > 0 && (
              <div>
                <p className="text-[10px] uppercase tracking-widest font-medium text-zinc-600 mb-2">Vault attachments</p>
                <div className="flex flex-col gap-2">
                  {task.vault_attachments.map((a) => (
                    <a
                      key={a.vault_item_id}
                      href={a.drive_file_url || a.link_url || "#"}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2.5 p-2.5 bg-zinc-900 border border-zinc-800 rounded-lg hover:border-zinc-600 transition-colors group"
                    >
                      <div className="w-7 h-7 rounded bg-blue-500/20 flex items-center justify-center shrink-0">
                        <Paperclip size={12} className="text-blue-400" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-zinc-200 truncate">{a.title}</p>
                        <p className="text-[10px] text-zinc-600">Vault file</p>
                      </div>
                      <ChevronRight size={12} className="text-zinc-600 group-hover:text-zinc-400 transition-colors" />
                    </a>
                  ))}
                </div>
              </div>
            )}

            {task.resources && task.resources.length > 0 && (
              <div>
                <p className="text-[10px] uppercase tracking-widest font-medium text-zinc-600 mb-2">Links</p>
                <div className="flex flex-wrap gap-1.5">
                  {task.resources.map((r, i) => (
                    <a
                      key={i}
                      href={r.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[11px] px-2.5 py-1 bg-zinc-900 border border-zinc-800 rounded-md text-zinc-400 hover:text-zinc-200 hover:border-zinc-600 transition-colors"
                    >
                      {r.title || r.url}
                    </a>
                  ))}
                </div>
              </div>
            )}

            {task.deliverable_required && (
              <div>
                <p className="text-[10px] uppercase tracking-widest font-medium text-zinc-600 mb-2">Deliverable</p>
                <div className={cn(
                  "p-3 rounded-lg border",
                  task.deliverable_vault_item_id
                    ? "bg-emerald-500/10 border-emerald-500/20"
                    : "bg-blue-500/10 border-blue-500/20"
                )}>
                  <p className={cn(
                    "text-xs font-medium mb-1",
                    task.deliverable_vault_item_id ? "text-emerald-400" : "text-blue-400"
                  )}>
                    {task.deliverable_vault_item_id ? "✓ Deliverable submitted" : "Awaiting submission"}
                  </p>
                  {task.deliverable_description && (
                    <p className="text-[11px] text-zinc-500">{task.deliverable_description}</p>
                  )}
                </div>
              </div>
            )}

            {/* Status quick-change */}
            <div>
              <p className="text-[10px] uppercase tracking-widest font-medium text-zinc-600 mb-2">Status</p>
              <div className="flex flex-wrap gap-1.5">
                {STATUSES.map(s => (
                  <button
                    key={s}
                    onClick={() => onStatusChange(task.id, s)}
                    className={cn(
                      "text-[11px] px-2.5 py-1 rounded-full border capitalize transition-colors",
                      task.status === s
                        ? "bg-zinc-200 text-zinc-900 border-zinc-200 font-medium"
                        : "bg-transparent text-zinc-500 border-zinc-800 hover:border-zinc-600 hover:text-zinc-300"
                    )}
                  >
                    {s.replace("-", " ")}
                  </button>
                ))}
              </div>
            </div>
          </>
        )}

        {activeTab === "comments" && (
          <InlineComments taskId={task.id} currentUserId={currentUserId} />
        )}
      </div>

      {/* Footer */}
      {canEditOrDelete && (
        <div className="px-4 py-3 border-t border-zinc-800 flex gap-2">
          <button
            onClick={() => onEdit(task)}
            className="flex-1 h-8 text-xs font-medium rounded-md bg-zinc-800 hover:bg-zinc-700 text-zinc-200 transition-colors flex items-center justify-center gap-1.5"
          >
            <Pencil size={11} />Edit
          </button>
          <button
            onClick={() => onDelete(task.id)}
            className="h-8 px-3 text-xs rounded-md border border-red-500/30 text-red-400 hover:bg-red-500/10 transition-colors"
          >
            Delete
          </button>
        </div>
      )}
    </div>
  )
}

// ── Analytics Bar ──────────────────────────────────────────────────────────

function AnalyticsBar({ tasks, teamMembers }: {
  tasks: Task[]
  teamMembers: TeamMember[]
}) {
  const [showOverdue, setShowOverdue] = useState(false)

  const now = new Date()
  const weekStart = startOfWeek(now)

  const allStats = tasks.reduce(
    (acc, t) => {
      const s = t.status.toLowerCase()
      if (s === "completed") acc.completed++
      else if (s === "in-progress") acc.inProgress++
      else if (s === "blocked") acc.blocked++
      else acc.todo++
      if (t.due_date && isPast(new Date(t.due_date)) && !t.is_completed) acc.overdue++
      if (new Date(t.created_at) >= weekStart) acc.createdThisWeek++
      return acc
    },
    { completed: 0, inProgress: 0, blocked: 0, todo: 0, overdue: 0, createdThisWeek: 0 }
  )

  const total = tasks.length
  const completionRate = total > 0 ? Math.round((allStats.completed / total) * 100) : 0

  const overdueTasks = tasks.filter(t => t.due_date && isPast(new Date(t.due_date)) && !t.is_completed)

  // Team workload
  const workload: Record<string, number> = {}
  tasks.forEach(t => {
    if (t.assigned_to && !t.is_completed) {
      workload[t.assigned_to] = (workload[t.assigned_to] || 0) + 1
    }
  })
  const maxWorkload = Math.max(...Object.values(workload), 1)

  // Priority breakdown
  const priBreakdown = tasks.reduce((acc, t) => {
    acc[t.priority] = (acc[t.priority] || 0) + 1; return acc
  }, {} as Record<string, number>)

  const statusColors: Record<string, string> = {
    completed: "#10b981",
    "in-progress": "#3b82f6",
    blocked: "#ef4444",
    todo: "#3f3f46",
  }

  const statusOrder = ["completed", "in-progress", "todo", "blocked"]
  const statusCounts: Record<string, number> = {
    completed: allStats.completed,
    "in-progress": allStats.inProgress,
    todo: allStats.todo,
    blocked: allStats.blocked,
  }

  return (
    <div className="border-b border-zinc-800 bg-zinc-950">
      {/* Row 1: primary metrics */}
      <div className="grid grid-cols-4 divide-x divide-zinc-800">
        {/* Completion rate */}
        <div className="px-4 py-3">
          <p className="text-[10px] uppercase tracking-widest text-zinc-600 mb-1.5">Completion rate</p>
          <div className="flex items-baseline gap-2 mb-2">
            <span className="text-xl font-medium text-emerald-400">{completionRate}%</span>
            <span className="text-xs text-zinc-600">this period</span>
          </div>
          <div className="h-1 bg-zinc-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-emerald-500 rounded-full transition-all duration-500"
              style={{ width: `${completionRate}%` }}
            />
          </div>
        </div>

        {/* Created vs completed */}
        <div className="px-4 py-3">
          <p className="text-[10px] uppercase tracking-widest text-zinc-600 mb-1.5">Volume</p>
          <div className="flex items-baseline gap-3">
            <div>
              <span className="text-xl font-medium text-zinc-200">{allStats.createdThisWeek}</span>
              <span className="text-[10px] text-zinc-600 ml-1">created</span>
            </div>
            <span className="text-zinc-700">·</span>
            <div>
              <span className="text-xl font-medium text-emerald-400">{allStats.completed}</span>
              <span className="text-[10px] text-zinc-600 ml-1">done</span>
            </div>
          </div>
        </div>

        {/* Overdue — clickable */}
        <button
          onClick={() => setShowOverdue(v => !v)}
          className="px-4 py-3 text-left hover:bg-zinc-900 transition-colors"
        >
          <p className="text-[10px] uppercase tracking-widest text-zinc-600 mb-1.5">Overdue</p>
          <div className="flex items-baseline gap-2">
            <span className={cn("text-xl font-medium", allStats.overdue > 0 ? "text-red-400" : "text-zinc-400")}>
              {allStats.overdue}
            </span>
            <span className="text-xs text-zinc-600">tasks</span>
          </div>
          {allStats.overdue > 0 && (
            <p className="text-[10px] text-red-500/70 mt-0.5 flex items-center gap-1">
              <AlertCircle size={9} />click to view
            </p>
          )}
        </button>

        {/* Blocked */}
        <div className="px-4 py-3">
          <p className="text-[10px] uppercase tracking-widest text-zinc-600 mb-1.5">Blocked</p>
          <div className="flex items-baseline gap-2">
            <span className={cn("text-xl font-medium", allStats.blocked > 0 ? "text-amber-400" : "text-zinc-400")}>
              {allStats.blocked}
            </span>
            <span className="text-xs text-zinc-600">tasks</span>
          </div>
        </div>
      </div>

      {/* Overdue panel */}
      {showOverdue && overdueTasks.length > 0 && (
        <div className="px-4 py-3 border-t border-zinc-800 bg-red-950/20">
          <p className="text-[10px] uppercase tracking-widest text-red-500 mb-2 font-medium">{overdueTasks.length} overdue tasks</p>
          <div className="flex flex-col gap-1.5">
            {overdueTasks.slice(0, 5).map(t => (
              <div key={t.id} className="flex items-center gap-3 text-xs">
                <div className="flex-1 min-w-0">
                  <span className="text-red-300 font-medium truncate block">{t.title}</span>
                </div>
                {t.due_date && (
                  <span className="text-red-500/70 shrink-0">
                    {differenceInDays(new Date(), new Date(t.due_date))}d overdue
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Row 2: status dist + workload + priority */}
      <div className="grid grid-cols-3 divide-x divide-zinc-800 border-t border-zinc-800">
        {/* Status distribution */}
        <div className="px-4 py-3">
          <p className="text-[10px] uppercase tracking-widest text-zinc-600 mb-2">Status breakdown</p>
          <div className="flex h-1.5 rounded-full overflow-hidden gap-px mb-2">
            {statusOrder.map(s => {
              const count = statusCounts[s]
              const pct = total > 0 ? (count / total) * 100 : 0
              return pct > 0 ? (
                <div
                  key={s}
                  style={{ width: `${pct}%`, background: statusColors[s] }}
                  title={`${s}: ${count}`}
                />
              ) : null
            })}
          </div>
          <div className="flex flex-wrap gap-x-3 gap-y-1">
            {statusOrder.map(s => (
              <span key={s} className="flex items-center gap-1 text-[10px] text-zinc-500">
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: statusColors[s], display: "inline-block" }} />
                {s.replace("-", " ")} {statusCounts[s]}
              </span>
            ))}
          </div>
        </div>

        {/* Team workload */}
        <div className="px-4 py-3">
          <p className="text-[10px] uppercase tracking-widest text-zinc-600 mb-2">Workload</p>
          <div className="flex flex-col gap-1.5">
            {Object.entries(workload).slice(0, 4).map(([uid, count]) => {
              const member = teamMembers.find(m => m.user_id === uid)
              const name = member?.profile?.full_name || uid.slice(0, 8)
              return (
                <div key={uid} className="flex items-center gap-2">
                  <span className="text-[11px] text-zinc-500 w-16 truncate shrink-0">{name.split(" ")[0]}</span>
                  <div className="flex-1 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-blue-500 rounded-full transition-all duration-500"
                      style={{ width: `${(count / maxWorkload) * 100}%` }}
                    />
                  </div>
                  <span className="text-[10px] text-zinc-600 w-4 text-right shrink-0">{count}</span>
                </div>
              )
            })}
            {Object.keys(workload).length === 0 && (
              <p className="text-[11px] text-zinc-700">No assigned tasks</p>
            )}
          </div>
        </div>

        {/* Priority breakdown */}
        <div className="px-4 py-3">
          <p className="text-[10px] uppercase tracking-widest text-zinc-600 mb-2">By priority</p>
          <div className="flex flex-col gap-1">
            {[
              { key: "urgent", color: "#E24B4A", label: "Urgent" },
              { key: "high", color: "#EF9F27", label: "High" },
              { key: "medium", color: "#888780", label: "Medium" },
              { key: "low", color: "#B4B2A9", label: "Low" },
            ].map(({ key, color, label }) => (
              <div key={key} className="flex items-center justify-between text-[11px]">
                <span className="flex items-center gap-1.5 text-zinc-500">
                  <span style={{ width: 6, height: 6, borderRadius: "50%", background: color, display: "inline-block" }} />
                  {label}
                </span>
                <span className="text-zinc-400 font-medium">{priBreakdown[key] || 0}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Task Row ───────────────────────────────────────────────────────────────

function TaskRow({
  task, selected, onSelect, onToggle, onEdit, onDelete,
  getAssigneeName, canEditOrDelete, commentCount, onStatusChange,
}: {
  task: Task
  selected: boolean
  onSelect: () => void
  onToggle: (id: string, is_completed: boolean) => void
  onEdit: (task: Task) => void
  onDelete: (id: string) => void
  getAssigneeName: (id: string | null) => string | null
  canEditOrDelete: boolean
  commentCount: number
  onStatusChange: (id: string, status: string) => void
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-2.5 px-3 py-2 rounded-lg cursor-pointer group transition-all",
        "border",
        selected
          ? "bg-zinc-900 border-zinc-700"
          : "bg-zinc-950 border-transparent hover:bg-zinc-900/60 hover:border-zinc-800",
        task.is_completed && "opacity-40"
      )}
      onClick={onSelect}
    >
      {/* Checkbox */}
      <button
        onClick={e => { e.stopPropagation(); onToggle(task.id, task.is_completed) }}
        className={cn(
          "w-4 h-4 rounded-full border flex items-center justify-center shrink-0 transition-all",
          task.is_completed
            ? "bg-emerald-500 border-emerald-500"
            : "border-zinc-700 hover:border-emerald-500/60"
        )}
      >
        {task.is_completed && (
          <svg width="8" height="8" viewBox="0 0 10 10" fill="none">
            <path d="M2 5l2.5 2.5L8 3" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </button>

      {/* Priority dot */}
      {priorityDot(task.priority)}

      {/* Title */}
      <span className={cn(
        "flex-1 min-w-0 text-sm text-zinc-200 truncate",
        task.is_completed && "line-through text-zinc-600"
      )}>
        {task.title}
      </span>

      {/* Meta */}
      <div className="flex items-center gap-1.5 shrink-0">
        {task.deliverable_required && (
          <Paperclip size={11} className="text-blue-500/60" />
        )}
        {commentCount > 0 && (
          <span className="flex items-center gap-0.5 text-[10px] text-zinc-600">
            <MessageSquare size={10} />{commentCount}
          </span>
        )}
        {task.due_date && <DeadlinePill due_date={task.due_date} />}
        {task.assigned_to && (
          <div className="w-5 h-5 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center text-[9px] text-zinc-300 font-medium">
            {(getAssigneeName(task.assigned_to) || "?")[0]?.toUpperCase()}
          </div>
        )}
        <StatusBadge status={task.status} />
      </div>

      {/* Hover actions */}
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
        {canEditOrDelete && (
          <>
            <button
              onClick={e => { e.stopPropagation(); onEdit(task) }}
              className="w-6 h-6 rounded flex items-center justify-center text-zinc-600 hover:text-zinc-300 hover:bg-zinc-800 transition-colors"
            >
              <Pencil size={11} />
            </button>
            <button
              onClick={e => { e.stopPropagation(); onDelete(task.id) }}
              className="w-6 h-6 rounded flex items-center justify-center text-zinc-700 hover:text-red-400 hover:bg-zinc-800 transition-colors"
            >
              <Trash2 size={11} />
            </button>
          </>
        )}
      </div>
    </div>
  )
}

// ── Main Component ─────────────────────────────────────────────────────────

export function TaskView({ permissions, userType }: TaskViewProps = {}) {
  const canEditOrDelete = userType === "founder" || permissions?.can_create_tasks
  const canCreate = userType === "founder" || permissions?.can_create_tasks
  const canPerformTasks = userType === "founder" || (permissions as any)?.can_perform_tasks || permissions?.can_update_task_status

  const supabase = createClient()

  const [activeBucket, setActiveBucket] = useState("today")
  const [searchQuery, setSearchQuery] = useState("")
  const [filterPriority, setFilterPriority] = useState("all")
  const [filterProject, setFilterProject] = useState("all")
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [isEditOpen, setIsEditOpen] = useState(false)
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false)
  const [selectedTask, setSelectedTask] = useState<Task | null>(null)
  const [detailTask, setDetailTask] = useState<Task | null>(null)
  const [editingTask, setEditingTask] = useState<Task | null>(null)
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([])
  const [newTask, setNewTask] = useState(INITIAL_TASK_STATE)
  const [newResourceUrl, setNewResourceUrl] = useState("")
  const [newResourceTitle, setNewResourceTitle] = useState("")
  const [commentCounts, setCommentCounts] = useState<Record<string, number>>({})
  const [projects, setProjects] = useState<Array<{ id: string; name: string }>>([])
  const [completedOpen, setCompletedOpen] = useState(false)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [deliverableModal, setDeliverableModal] = useState<{ taskId: string; projectId: string } | null>(null)
  const [deliverableForm, setDeliverableForm] = useState({ title: "", description: "", linkUrl: "" })
  const [deliverableFile, setDeliverableFile] = useState<File | null>(null)
  const [submittingDeliverable, setSubmittingDeliverable] = useState(false)
  const [showAnalytics, setShowAnalytics] = useState(true)

  // Load current user id
  useState(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) setCurrentUserId(user.id)
    })
  })

  const loadCommentCounts = async (taskList: Task[]) => {
    if (!taskList.length) return
    const taskIds = taskList.map(t => t.id)
    const { data } = await supabase.from("task_comments").select("task_id").in("task_id", taskIds)
    const counts: Record<string, number> = {}
    for (const row of data || []) counts[row.task_id] = (counts[row.task_id] || 0) + 1
    setCommentCounts(counts)
  }

  const {
    data: tasks,
    mutate: mutateTasks,
  } = useSWR(
    ["tasks", activeBucket, filterProject],
    async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return []
      fetchProjects()
      fetchTeamMembers()
      const query = supabase.from("tasks").select("*").eq("bucket", activeBucket)
      if (userType === "founder") {
        query.or(`user_id.eq.${user.id},created_by.eq.${user.id}`)
      } else {
        query.eq("user_id", permissions?.founder_id)
      }
      if (filterProject !== "all") query.eq("project_id", filterProject)
      const { data, error } = await query.order("created_at", { ascending: false })
      if (error) throw error
      const sorted = sortTasks(data || [])
      loadCommentCounts(sorted)
      return sorted
    },
    { revalidateOnFocus: true }
  )

  const { data: allTasksForStats } = useSWR("all-tasks-analytics", async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return []
    const founderId = permissions?.founder_id || user.id
    const { data } = await supabase
      .from("tasks")
      .select("*")
      .or(`user_id.eq.${founderId},created_by.eq.${founderId}`)
    return data || []
  })

  const sortTasks = (list: Task[]) => {
    const w = { urgent: 4, high: 3, medium: 2, low: 1 }
    return [...list].sort((a, b) => {
      if (a.is_completed !== b.is_completed) return a.is_completed ? 1 : -1
      const pd = (w[b.priority as keyof typeof w] || 0) - (w[a.priority as keyof typeof w] || 0)
      if (pd !== 0) return pd
      if (a.due_date && b.due_date) return new Date(a.due_date).getTime() - new Date(b.due_date).getTime()
      if (a.due_date) return -1
      if (b.due_date) return 1
      return 0
    })
  }

  const fetchTeamMembers = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const founderId = permissions?.founder_id || user.id
    const { data } = await supabase
      .from("team_members")
      .select("id, user_id, position, profile:profiles!team_members_user_id_profiles_fkey(full_name)")
      .eq("founder_id", founderId)
      .eq("is_active", true)
    setTeamMembers(data || [])
  }

  const fetchProjects = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const founderId = permissions?.founder_id || user.id
    const { data } = await supabase
      .from("projects").select("id, name")
      .eq("founder_id", founderId)
      .in("status", ["active", "on-hold"])
      .order("name")
    setProjects(data || [])
  }

  const handleAddTask = async () => {
    if (!newTask.title.trim()) { toast.error("Please enter a task title"); return }
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { error } = await supabase.from("tasks").insert({
      user_id: permissions?.founder_id || user.id,
      created_by: user.id,
      title: newTask.title,
      notes: newTask.notes || null,
      resources: newTask.resources.length > 0 ? newTask.resources : null,
      bucket: activeBucket,
      priority: newTask.priority,
      status: newTask.status,
      due_date: newTask.deadline ? new Date(newTask.deadline).toISOString() : null,
      assigned_to: newTask.assigned_to === UNASSIGNED ? null : newTask.assigned_to || null,
      linked: newTask.linked || null,
      is_completed: false,
      project_id: newTask.project_id || null,
      vault_attachments: newTask.vault_attachments.length > 0 ? newTask.vault_attachments : null,
      deliverable_required: newTask.deliverable_required,
      deliverable_description: newTask.deliverable_description || null,
    })
    if (error) { toast.error("Failed to add task"); return }
    setNewTask(INITIAL_TASK_STATE)
    setIsDialogOpen(false)
    mutateTasks()
    toast.success("Task added")
  }

  const handleUpdateTask = async () => {
    if (!editingTask || !newTask.title.trim()) return
    const { error } = await supabase.from("tasks").update({
      title: newTask.title,
      notes: newTask.notes || null,
      resources: newTask.resources.length > 0 ? newTask.resources : null,
      priority: newTask.priority,
      status: newTask.status,
      due_date: newTask.deadline ? new Date(newTask.deadline).toISOString() : null,
      assigned_to: newTask.assigned_to === UNASSIGNED ? null : newTask.assigned_to || null,
      linked: newTask.linked || null,
      project_id: newTask.project_id || null,
      vault_attachments: newTask.vault_attachments.length > 0 ? newTask.vault_attachments : null,
      deliverable_required: newTask.deliverable_required,
      deliverable_description: newTask.deliverable_description || null,
    }).eq("id", editingTask.id)
    if (error) { toast.error("Failed to update task"); return }
    setIsEditOpen(false)
    setEditingTask(null)
    setNewTask(INITIAL_TASK_STATE)
    mutateTasks()
    // refresh detail panel if this task is open
    if (detailTask?.id === editingTask.id) {
      const { data } = await supabase.from("tasks").select("*").eq("id", editingTask.id).single()
      if (data) setDetailTask(data)
    }
    toast.success("Task updated")
  }

  const handleEditClick = (task: Task) => {
    setEditingTask(task)
    setNewTask({
      title: task.title,
      notes: task.notes || "",
      resources: task.resources || [],
      priority: task.priority,
      status: task.status,
      deadline: task.due_date ? format(new Date(task.due_date), "yyyy-MM-dd'T'HH:mm") : "",
      assigned_to: task.assigned_to || UNASSIGNED,
      linked: task.linked || "",
      related_context_type: (task.related_context_type as any) || "none",
      related_context_id: task.related_context_id || "",
      related_context_name: task.related_context_name || "",
      project_id: task.project_id || undefined,
      vault_attachments: task.vault_attachments || [],
      deliverable_required: task.deliverable_required || false,
      deliverable_description: task.deliverable_description || "",
    })
    setIsEditOpen(true)
    fetchTeamMembers()
  }

  const toggleTask = async (id: string, is_completed: boolean) => {
    const newStatus = !is_completed ? "completed" : "todo"
    if (newStatus === "completed") {
      const task = tasks?.find(t => t.id === id)
      if (task?.deliverable_required && !task.deliverable_vault_item_id && task.project_id) {
        setDeliverableModal({ taskId: id, projectId: task.project_id })
        return
      }
    }
    const prev = tasks
    if (tasks) mutateTasks(tasks.map(t => t.id === id ? { ...t, is_completed: !is_completed, status: newStatus } : t), false)
    const { error } = await supabase.from("tasks").update({ is_completed: !is_completed, status: newStatus }).eq("id", id)
    if (error) { mutateTasks(prev, false); toast.error("Failed to update") }
    else { mutateTasks(); if (detailTask?.id === id) setDetailTask(p => p ? { ...p, is_completed: !is_completed, status: newStatus } : p) }
  }

  const updateTaskStatus = async (id: string, status: string) => {
    const isCompleted = status === "completed"
    const prev = tasks
    if (tasks) mutateTasks(tasks.map(t => t.id === id ? { ...t, status, is_completed: isCompleted } : t), false)
    const { error } = await supabase.from("tasks").update({ status, is_completed: isCompleted }).eq("id", id)
    if (error) { mutateTasks(prev, false); toast.error("Failed") }
    else { mutateTasks(); if (detailTask?.id === id) setDetailTask(p => p ? { ...p, status, is_completed: isCompleted } : p) }
  }

  const handleDeleteTask = async () => {
    if (!selectedTask) return
    const id = selectedTask.id
    if (tasks) mutateTasks(tasks.filter(t => t.id !== id), false)
    await supabase.from("tasks").delete().eq("id", id)
    mutateTasks()
    setIsDeleteModalOpen(false)
    if (detailTask?.id === id) setDetailTask(null)
    toast.success("Task deleted")
  }

  const getAssigneeName = (assigneeId: string | null) => {
    if (!assigneeId || assigneeId === UNASSIGNED) return null
    return teamMembers.find(m => m.user_id === assigneeId)?.profile?.full_name || null
  }

  const handleSubmitDeliverable = async (skip?: boolean) => {
    if (!deliverableModal) return
    if (!skip) {
      if (!deliverableForm.title.trim()) { toast.error("Title required"); return }
      if (!deliverableFile && !deliverableForm.linkUrl.trim()) { toast.error("Attach a file or link"); return }
      setSubmittingDeliverable(true)
      try {
        const fd = new FormData()
        fd.append("task_id", deliverableModal.taskId)
        fd.append("project_id", deliverableModal.projectId)
        fd.append("title", deliverableForm.title)
        fd.append("description", deliverableForm.description)
        if (deliverableFile) fd.append("file", deliverableFile)
        if (deliverableForm.linkUrl) fd.append("link_url", deliverableForm.linkUrl)
        const res = await fetch("/api/tasks/submit-deliverable", { method: "POST", body: fd })
        const json = await res.json()
        if (!res.ok) throw new Error(json.message)
        toast.success("Deliverable saved to vault!")
      } catch (err: any) { toast.error(err.message || "Failed"); setSubmittingDeliverable(false); return }
      setSubmittingDeliverable(false)
    }
    const { taskId } = deliverableModal
    setDeliverableModal(null)
    setDeliverableForm({ title: "", description: "", linkUrl: "" })
    setDeliverableFile(null)
    const prev = tasks
    if (tasks) mutateTasks(tasks.map(t => t.id === taskId ? { ...t, is_completed: true, status: "completed" } : t), false)
    const { error } = await supabase.from("tasks").update({ is_completed: true, status: "completed" }).eq("id", taskId)
    if (error) { mutateTasks(prev, false); toast.error("Failed to complete task") }
    else { mutateTasks(); toast.success("Task completed!") }
  }

  // Split tasks
  const filteredTasks = (tasks || []).filter(t => {
    const ms = t.title.toLowerCase().includes(searchQuery.toLowerCase())
    const mp = filterPriority === "all" || t.priority === filterPriority
    return ms && mp
  })
  const activeTasks = filteredTasks.filter(t => !t.is_completed)
  const completedTasks = filteredTasks.filter(t => t.is_completed)

  return (
    <div
      className="flex flex-col rounded-xl overflow-hidden border border-zinc-800"
      style={{ fontFamily: "'DM Sans', sans-serif", background: "#09090b" }}
    >
      {/* ── Page header ── */}
      <div className="flex items-start justify-between px-5 pt-5 pb-4 border-b border-zinc-800 bg-zinc-950">
        <div>
          <h1 className="text-lg font-semibold text-zinc-100 tracking-tight">Tasks & Execution</h1>
          <p className="text-xs text-zinc-600 mt-0.5">Founder-first task management — no complexity, just momentum.</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowAnalytics(v => !v)}
            className={cn(
              "h-8 px-3 text-xs rounded-md border transition-colors flex items-center gap-1.5",
              showAnalytics
                ? "bg-zinc-800 border-zinc-700 text-zinc-300"
                : "bg-transparent border-zinc-800 text-zinc-500 hover:text-zinc-300"
            )}
          >
            <BarChart2 size={12} />Analytics
          </button>
          {canCreate && (
            <Dialog open={isDialogOpen} onOpenChange={open => {
              setIsDialogOpen(open)
              if (!open) { setNewTask(INITIAL_TASK_STATE); setNewResourceUrl(""); setNewResourceTitle("") }
            }}>
              <DialogTrigger asChild>
                <button
                  onClick={() => fetchTeamMembers()}
                  className="h-8 px-3 text-xs font-medium rounded-md bg-zinc-100 hover:bg-white text-zinc-900 transition-colors flex items-center gap-1.5"
                >
                  <Plus size={13} />Add task
                </button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[580px] bg-zinc-950 border-zinc-800 text-zinc-100">
                <DialogHeader>
                  <DialogTitle className="text-zinc-100">Add New Task</DialogTitle>
                </DialogHeader>
                <TaskForm
                  task={newTask} onTaskChange={setNewTask} teamMembers={teamMembers}
                  newResourceUrl={newResourceUrl} setNewResourceUrl={setNewResourceUrl}
                  newResourceTitle={newResourceTitle} setNewResourceTitle={setNewResourceTitle}
                />
                <DialogFooter>
                  <Button variant="outline" onClick={() => setIsDialogOpen(false)} className="border-zinc-700 text-zinc-300 bg-transparent hover:bg-zinc-800">Cancel</Button>
                  <Button onClick={handleAddTask} className="bg-zinc-100 text-zinc-900 hover:bg-white">Create Task</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}
        </div>
      </div>

      {/* ── Analytics ── */}
      {showAnalytics && (
        <AnalyticsBar tasks={allTasksForStats || []} teamMembers={teamMembers} />
      )}

      {/* ── Project filter ── */}
      {projects.length > 0 && (
        <div className="flex items-center gap-1.5 px-4 py-2.5 border-b border-zinc-800 bg-zinc-950 overflow-x-auto scrollbar-hide">
          <button
            onClick={() => setFilterProject("all")}
            className={cn(
              "shrink-0 px-3 py-1 rounded-full text-xs transition-colors border",
              filterProject === "all"
                ? "bg-zinc-200 text-zinc-900 border-zinc-200 font-medium"
                : "border-zinc-800 text-zinc-500 hover:border-zinc-600 hover:text-zinc-300"
            )}
          >All projects</button>
          {projects.map(p => (
            <button
              key={p.id}
              onClick={() => setFilterProject(p.id)}
              className={cn(
                "shrink-0 px-3 py-1 rounded-full text-xs transition-colors border",
                filterProject === p.id
                  ? "bg-zinc-200 text-zinc-900 border-zinc-200 font-medium"
                  : "border-zinc-800 text-zinc-500 hover:border-zinc-600 hover:text-zinc-300"
              )}
            >{p.name}</button>
          ))}
        </div>
      )}

      {/* ── Toolbar ── */}
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-zinc-800 bg-zinc-950">
        <div className="flex items-center gap-1.5">
          {BUCKETS.map(b => (
            <button
              key={b}
              onClick={() => setActiveBucket(b)}
              className={cn(
                "px-3 py-1.5 rounded-md text-xs transition-colors",
                activeBucket === b
                  ? "bg-zinc-800 text-zinc-200 font-medium"
                  : "text-zinc-500 hover:text-zinc-300"
              )}
            >
              {b.charAt(0).toUpperCase() + b.slice(1).replace("-", " ")}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 ml-auto">
          <div className="relative">
            <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-600" />
            <input
              placeholder="Search tasks…"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="h-7 pl-7 pr-3 text-xs bg-zinc-900 border border-zinc-800 rounded-md text-zinc-300 placeholder:text-zinc-700 outline-none focus:border-zinc-600 w-44"
            />
          </div>
          <select
            value={filterPriority}
            onChange={e => setFilterPriority(e.target.value)}
            className="h-7 px-2 text-xs bg-zinc-900 border border-zinc-800 rounded-md text-zinc-400 outline-none focus:border-zinc-600"
          >
            <option value="all">All priorities</option>
            {PRIORITIES.map(p => <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>)}
          </select>
        </div>
      </div>

      {/* ── Body: list + detail panel ── */}
      <div className="flex min-h-[440px] max-h-[680px]">
        {/* Task list */}
        <div className={cn("flex flex-col min-w-0 overflow-y-auto", detailTask ? "flex-[3]" : "flex-1")}>
          <div className="px-3 py-2 flex flex-col gap-0.5">
            {/* Active section */}
            {activeTasks.length > 0 && (
              <>
                <div className="flex items-center gap-1.5 px-1 py-1.5 mb-0.5">
                  <span className="text-[10px] uppercase tracking-widest text-zinc-600 font-medium">Active</span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-zinc-800 text-zinc-600">{activeTasks.length}</span>
                </div>
                {activeTasks.map(task => (
                  <TaskRow
                    key={task.id}
                    task={task}
                    selected={detailTask?.id === task.id}
                    onSelect={() => setDetailTask(detailTask?.id === task.id ? null : task)}
                    onToggle={toggleTask}
                    onEdit={handleEditClick}
                    onDelete={id => { setSelectedTask(tasks?.find(t => t.id === id) || null); setIsDeleteModalOpen(true) }}
                    getAssigneeName={getAssigneeName}
                    canEditOrDelete={!!canEditOrDelete}
                    commentCount={commentCounts[task.id] || 0}
                    onStatusChange={updateTaskStatus}
                  />
                ))}
              </>
            )}

            {/* Completed section */}
            {completedTasks.length > 0 && (
              <div className="mt-2">
                <button
                  onClick={() => setCompletedOpen(v => !v)}
                  className="flex items-center gap-1.5 px-1 py-1.5 mb-0.5 w-full text-left"
                >
                  {completedOpen ? <ChevronDown size={12} className="text-zinc-600" /> : <ChevronRight size={12} className="text-zinc-600" />}
                  <span className="text-[10px] uppercase tracking-widest text-zinc-600 font-medium">Completed</span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-zinc-800 text-zinc-600">{completedTasks.length}</span>
                </button>
                {completedOpen && completedTasks.map(task => (
                  <TaskRow
                    key={task.id}
                    task={task}
                    selected={detailTask?.id === task.id}
                    onSelect={() => setDetailTask(detailTask?.id === task.id ? null : task)}
                    onToggle={toggleTask}
                    onEdit={handleEditClick}
                    onDelete={id => { setSelectedTask(tasks?.find(t => t.id === id) || null); setIsDeleteModalOpen(true) }}
                    getAssigneeName={getAssigneeName}
                    canEditOrDelete={!!canEditOrDelete}
                    commentCount={commentCounts[task.id] || 0}
                    onStatusChange={updateTaskStatus}
                  />
                ))}
              </div>
            )}

            {/* Empty state */}
            {filteredTasks.length === 0 && (
              <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
                <div className="w-10 h-10 rounded-xl bg-zinc-900 border border-zinc-800 flex items-center justify-center">
                  <CheckCircle2 size={18} className="text-zinc-700" />
                </div>
                <div>
                  <p className="text-sm text-zinc-500 font-medium">No tasks here</p>
                  <p className="text-xs text-zinc-700 mt-0.5">
                    {searchQuery ? "Try a different search" : "Add a task to get started"}
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Detail panel */}
        {detailTask && (
          <div className="flex-[2] min-w-[280px] max-w-[360px] overflow-hidden">
            <DetailPanel
              task={detailTask}
              onClose={() => setDetailTask(null)}
              onEdit={task => { handleEditClick(task); setDetailTask(null) }}
              onDelete={id => { setSelectedTask(tasks?.find(t => t.id === id) || null); setIsDeleteModalOpen(true); setDetailTask(null) }}
              canEditOrDelete={!!canEditOrDelete}
              getAssigneeName={getAssigneeName}
              currentUserId={currentUserId}
              onToggle={toggleTask}
              onStatusChange={updateTaskStatus}
            />
          </div>
        )}
      </div>

      {/* ── Edit dialog ── */}
      <Dialog open={isEditOpen} onOpenChange={open => {
        setIsEditOpen(open)
        if (!open) { setEditingTask(null); setNewTask(INITIAL_TASK_STATE) }
      }}>
        <DialogContent className="sm:max-w-[580px] bg-zinc-950 border-zinc-800 text-zinc-100">
          <DialogHeader>
            <DialogTitle className="text-zinc-100">Edit Task</DialogTitle>
          </DialogHeader>
          <TaskForm
            task={newTask} onTaskChange={setNewTask} teamMembers={teamMembers}
            newResourceUrl={newResourceUrl} setNewResourceUrl={setNewResourceUrl}
            newResourceTitle={newResourceTitle} setNewResourceTitle={setNewResourceTitle}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditOpen(false)} className="border-zinc-700 text-zinc-300 bg-transparent hover:bg-zinc-800">Cancel</Button>
            <Button onClick={handleUpdateTask} className="bg-zinc-100 text-zinc-900 hover:bg-white">Save Changes</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Delete dialog ── */}
      <AlertDialog open={isDeleteModalOpen} onOpenChange={setIsDeleteModalOpen}>
        <AlertDialogContent className="bg-zinc-950 border-zinc-800">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-zinc-100">Delete Task</AlertDialogTitle>
            <AlertDialogDescription className="text-zinc-500">This action cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-zinc-700 text-zinc-300 bg-transparent hover:bg-zinc-800">Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteTask} className="bg-red-600 hover:bg-red-500 text-white border-none">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Deliverable modal ── */}
      <Dialog open={!!deliverableModal} onOpenChange={v => { if (!v) { setDeliverableModal(null); setDeliverableForm({ title: "", description: "", linkUrl: "" }); setDeliverableFile(null) } }}>
        <DialogContent className="sm:max-w-[460px] bg-zinc-950 border-zinc-800">
          <DialogHeader>
            <DialogTitle className="text-zinc-100">Submit Deliverable</DialogTitle>
            <p className="text-xs text-zinc-500">Will be saved to the project's Deliverables folder in the Vault.</p>
          </DialogHeader>
          <div className="space-y-3 py-1">
            <div className="space-y-1.5">
              <Label className="text-xs text-zinc-400">Title <span className="text-red-400">*</span></Label>
              <Input placeholder="e.g. Final design files" value={deliverableForm.title} onChange={e => setDeliverableForm(p => ({ ...p, title: e.target.value }))} className="bg-zinc-900 border-zinc-700 text-zinc-200" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-zinc-400">Description</Label>
              <Input placeholder="What's included…" value={deliverableForm.description} onChange={e => setDeliverableForm(p => ({ ...p, description: e.target.value }))} className="bg-zinc-900 border-zinc-700 text-zinc-200" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-zinc-400">Upload file</Label>
              <input type="file" onChange={e => setDeliverableFile(e.target.files?.[0] || null)} className="text-xs text-zinc-400 w-full" />
            </div>
            <div className="flex items-center gap-2"><div className="flex-1 h-px bg-zinc-800" /><span className="text-xs text-zinc-700">or</span><div className="flex-1 h-px bg-zinc-800" /></div>
            <div className="space-y-1.5">
              <Label className="text-xs text-zinc-400">Paste a link</Label>
              <Input placeholder="https://…" value={deliverableForm.linkUrl} onChange={e => setDeliverableForm(p => ({ ...p, linkUrl: e.target.value }))} className="bg-zinc-900 border-zinc-700 text-zinc-200" />
            </div>
          </div>
          <div className="flex gap-2 justify-end pt-1">
            <Button variant="outline" onClick={() => handleSubmitDeliverable(true)} disabled={submittingDeliverable} className="border-zinc-700 text-zinc-300 bg-transparent hover:bg-zinc-800">Skip & complete</Button>
            <Button onClick={() => handleSubmitDeliverable(false)} disabled={submittingDeliverable} className="bg-zinc-100 text-zinc-900 hover:bg-white">{submittingDeliverable ? "Submitting…" : "Submit & complete"}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}