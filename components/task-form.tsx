"use client"

import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Button } from "@/components/ui/button"
import { useEffect, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { cn } from "@/lib/utils"

const PRIORITIES = ["low", "medium", "high", "urgent"]
const STATUSES = ["todo", "in-progress", "blocked", "completed"]
const UNASSIGNED = "__unassigned__"

interface TaskFormData {
  title: string
  notes: string
  resources: Array<{ url: string; title?: string }>
  priority: string
  status: string
  deadline: string
  assigned_to: string
  linked: string
  related_context_type: "project" | "goal" | "meeting" | "none"
  related_context_id: string
  related_context_name: string
  project_id?: string
  vault_attachments: Array<{ vault_item_id: string; title: string; drive_file_url: string | null; link_url: string | null }>
  deliverable_required: boolean
  deliverable_description: string
}

interface TeamMember {
  id: string
  user_id: string
  position: string
  profile: {
    full_name: string
  }
}

interface Project {
  id: string
  name: string
  status: string
}

interface TaskFormProps {
  task: TaskFormData
  onTaskChange: (task: TaskFormData) => void
  teamMembers: TeamMember[]
  newResourceUrl: string
  setNewResourceUrl: (url: string) => void
  newResourceTitle: string
  setNewResourceTitle: (title: string) => void
}

export function TaskForm({
  task,
  onTaskChange,
  teamMembers,
  newResourceUrl,
  setNewResourceUrl,
  newResourceTitle,
  setNewResourceTitle,
}: TaskFormProps) {
  const [projects, setProjects] = useState<Project[]>([])
  const supabase = createClient()

  const [activeTab, setActiveTab] = useState<"details" | "assignment" | "resources" | "deliverable">("details")

  useEffect(() => {
    fetchProjects()
  }, [])

  useEffect(() => {
    if (task.project_id) fetchVaultItems(task.project_id)
  }, [])

  const [vaultItems, setVaultItems] = useState<Array<{ id: string; title: string; item_type: string; drive_file_url: string | null; link_url: string | null }>>([])
  const [loadingVault, setLoadingVault] = useState(false)

  const fetchVaultItems = async (projectId: string) => {
    setLoadingVault(true)
    // Get all folders for this project
    const { data: folders } = await supabase
      .from("vault_folders")
      .select("id")
      .eq("project_id", projectId)
    
    if (!folders?.length) { setLoadingVault(false); return }
    
    const folderIds = folders.map((f) => f.id)
    const { data: items } = await supabase
      .from("vault_items")
      .select("id, title, item_type, drive_file_url, link_url")
      .in("folder_id", folderIds)
      .in("item_type", ["file", "link"])
      .order("created_at", { ascending: false })
    
    setVaultItems(items || [])
    setLoadingVault(false)
  }

  const fetchProjects = async () => {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) return

      const { data: profile } = await supabase.from("profiles").select("user_type").eq("id", user.id).single()

      let founderId = user.id

      if (profile?.user_type === "team_member") {
        const { data: teamMember } = await supabase
          .from("team_members")
          .select("founder_id")
          .eq("user_id", user.id)
          .single()

        if (teamMember) {
          founderId = teamMember.founder_id
        }
      }

      const { data, error } = await supabase
        .from("projects")
        .select("id, name, status")
        .eq("founder_id", founderId)
        .in("status", ["active", "on-hold"])
        .order("name")

      if (error) {
        console.error("[v0] Error fetching projects:", error)
      } else {
        setProjects(data || [])
      }
    } catch (error) {
      console.error("[v0] Error in fetchProjects:", error)
    }
  }

  const handleAddResource = () => {
    if (!newResourceUrl.trim()) return
    onTaskChange({
      ...task,
      resources: [...task.resources, { url: newResourceUrl, title: newResourceTitle }],
    })
    setNewResourceUrl("")
    setNewResourceTitle("")
  }

  const handleRemoveResource = (index: number) => {
    onTaskChange({
      ...task,
      resources: task.resources.filter((_, i) => i !== index),
    })
  }

  const TABS = [
    { id: "details", label: "Details" },
    { id: "assignment", label: "Assignment" },
    { id: "resources", label: "Resources" },
    { id: "deliverable", label: "Deliverable" },
  ] as const

  const summaryChips = [
    task.priority !== "medium" && task.priority,
    projects.find((p) => p.id === task.project_id)?.name,
    task.vault_attachments.length > 0 && `${task.vault_attachments.length} vault file${task.vault_attachments.length > 1 ? "s" : ""}`,
    task.resources.length > 0 && `${task.resources.length} link${task.resources.length > 1 ? "s" : ""}`,
    task.deliverable_required && "deliverable required",
    task.assigned_to && task.assigned_to !== UNASSIGNED && teamMembers.find((m) => m.user_id === task.assigned_to)?.profile?.full_name,
  ].filter(Boolean) as string[]

  return (
    <div className="flex flex-col -mx-6 -mb-6">
      {/* Title + Notes — always visible */}
      <div className="px-6 pt-2 pb-4 border-b border-border/40">
        <textarea
          placeholder="What needs to be done?"
          value={task.title}
          onChange={(e) => onTaskChange({ ...task, title: e.target.value })}
          rows={2}
          className="w-full resize-none border-none outline-none bg-transparent text-base font-semibold placeholder:text-muted-foreground/50 text-foreground leading-snug mb-2 font-sans"
        />
        <textarea
          placeholder="Notes or context…"
          value={task.notes}
          onChange={(e) => onTaskChange({ ...task, notes: e.target.value })}
          rows={2}
          className="w-full resize-none border-none outline-none bg-transparent text-sm placeholder:text-muted-foreground/40 text-muted-foreground leading-relaxed font-sans"
        />
      </div>

      {/* Tabs */}
      <div className="flex border-b border-border/40 px-6">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              "text-xs py-2.5 mr-5 border-b-2 transition-colors",
              activeTab === tab.id
                ? "border-foreground text-foreground font-medium"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            {tab.label}
            {tab.id === "resources" && (task.resources.length > 0 || task.vault_attachments.length > 0) && (
              <span className="ml-1.5 text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded-full">
                {task.resources.length + task.vault_attachments.length}
              </span>
            )}
            {tab.id === "deliverable" && task.deliverable_required && (
              <span className="ml-1.5 w-1.5 h-1.5 rounded-full bg-primary inline-block" />
            )}
          </button>
        ))}
      </div>

      {/* Tab panels */}
      <div className="px-6 py-4 min-h-[180px]">

        {/* ── Details ── */}
        {activeTab === "details" && (
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-3 gap-3">
              {/* Priority toggle */}
              <div>
                <p className="text-[10px] uppercase tracking-widest font-medium text-muted-foreground mb-1.5">Priority</p>
                <div className="flex gap-1">
                  {PRIORITIES.map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => onTaskChange({ ...task, priority: p })}
                      className={cn(
                        "flex-1 text-[11px] py-1.5 rounded-md border transition-colors capitalize",
                        task.priority === p
                          ? p === "urgent"
                            ? "bg-red-50 border-red-200 text-red-700 font-medium dark:bg-red-950/30 dark:border-red-800 dark:text-red-400"
                            : p === "high"
                            ? "bg-orange-50 border-orange-200 text-orange-700 font-medium dark:bg-orange-950/30 dark:border-orange-800 dark:text-orange-400"
                            : "bg-muted border-border text-foreground font-medium"
                          : "border-border/50 text-muted-foreground hover:bg-muted/50"
                      )}
                    >
                      {p === "urgent" ? "!!!" : p === "medium" ? "Med" : p.charAt(0).toUpperCase() + p.slice(1)}
                    </button>
                  ))}
                </div>
              </div>

              {/* Status */}
              <div>
                <p className="text-[10px] uppercase tracking-widest font-medium text-muted-foreground mb-1.5">Status</p>
                <Select value={task.status} onValueChange={(v) => onTaskChange({ ...task, status: v })}>
                  <SelectTrigger className="h-8 text-xs">
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

              {/* Deadline */}
              <div>
                <p className="text-[10px] uppercase tracking-widest font-medium text-muted-foreground mb-1.5">Deadline</p>
                <Input
                  type="datetime-local"
                  value={task.deadline}
                  onChange={(e) => onTaskChange({ ...task, deadline: e.target.value })}
                  className="h-8 text-xs"
                />
              </div>
            </div>

            {/* Project */}
            <div>
              <p className="text-[10px] uppercase tracking-widest font-medium text-muted-foreground mb-1.5">Project</p>
              <Select
                value={task.project_id || "none"}
                onValueChange={(v) => {
                  const newProjectId = v === "none" ? undefined : v
                  onTaskChange({ ...task, project_id: newProjectId, vault_attachments: [] })
                  if (newProjectId) fetchVaultItems(newProjectId)
                }}
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder="No project" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none" className="text-xs">No Project</SelectItem>
                  {projects.map((project) => (
                    <SelectItem key={project.id} value={project.id} className="text-xs">
                      {project.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        )}

        {/* ── Assignment ── */}
        {activeTab === "assignment" && (
          <div className="flex flex-col gap-4">
            <div>
              <p className="text-[10px] uppercase tracking-widest font-medium text-muted-foreground mb-1.5">Assign to</p>
              <Select value={task.assigned_to || UNASSIGNED} onValueChange={(v) => onTaskChange({ ...task, assigned_to: v })}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder="Unassigned" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={UNASSIGNED} className="text-xs">Unassigned</SelectItem>
                  {teamMembers.map((member) => (
                    <SelectItem key={member.user_id} value={member.user_id} className="text-xs">
                      {member.profile?.full_name ?? "Unnamed"} — {member.position}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        )}

        {/* ── Resources ── */}
        {activeTab === "resources" && (
          <div className="flex flex-col gap-4">
            {/* Vault picker */}
            {task.project_id ? (
              <div>
                <p className="text-[10px] uppercase tracking-widest font-medium text-muted-foreground mb-1.5">Attach from vault</p>
                {loadingVault ? (
                  <p className="text-xs text-muted-foreground">Loading…</p>
                ) : vaultItems.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No files in this project's vault yet</p>
                ) : (
                  <div className="border border-border/50 rounded-lg overflow-hidden max-h-36 overflow-y-auto divide-y divide-border/30">
                    {vaultItems.map((item) => {
                      const isAttached = task.vault_attachments.some((a) => a.vault_item_id === item.id)
                      return (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => {
                            if (isAttached) {
                              onTaskChange({ ...task, vault_attachments: task.vault_attachments.filter((a) => a.vault_item_id !== item.id) })
                            } else {
                              onTaskChange({ ...task, vault_attachments: [...task.vault_attachments, { vault_item_id: item.id, title: item.title, drive_file_url: item.drive_file_url, link_url: item.link_url }] })
                            }
                          }}
                          className={cn(
                            "w-full flex items-center gap-2 px-3 py-2 text-xs text-left transition-colors",
                            isAttached ? "bg-primary/10 text-primary" : "hover:bg-muted text-foreground"
                          )}
                        >
                          <span>{item.item_type === "file" ? "📄" : "🔗"}</span>
                          <span className="flex-1 truncate">{item.title}</span>
                          {isAttached && <span className="font-semibold text-primary">✓</span>}
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>
            ) : (
              <div className="text-xs text-muted-foreground border border-dashed border-border rounded-lg px-3 py-2.5">
                Link a project in Details to attach vault files
              </div>
            )}

            {/* External links */}
            <div>
              <p className="text-[10px] uppercase tracking-widest font-medium text-muted-foreground mb-1.5">External links</p>
              <div className="flex flex-col gap-1.5 mb-2">
                {task.resources.map((resource, index) => (
                  <div key={index} className="flex items-center gap-2 px-2.5 py-1.5 bg-muted/50 rounded-md">
                    <span className="text-xs">🔗</span>
                    <a
                      href={resource.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex-1 text-xs text-primary truncate"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {resource.title || resource.url}
                    </a>
                    <button
                      type="button"
                      onClick={() => handleRemoveResource(index)}
                      className="text-muted-foreground hover:text-destructive text-sm leading-none"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
              <div className="flex gap-2">
                <Input
                  placeholder="https://…"
                  value={newResourceUrl}
                  onChange={(e) => setNewResourceUrl(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleAddResource() } }}
                  className="flex-1 h-8 text-xs"
                />
                <Input
                  placeholder="Label"
                  value={newResourceTitle}
                  onChange={(e) => setNewResourceTitle(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleAddResource() } }}
                  className="w-28 h-8 text-xs"
                />
                <Button type="button" onClick={handleAddResource} size="sm" className="h-8 text-xs px-3">
                  Add
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* ── Deliverable ── */}
        {activeTab === "deliverable" && (
          <div className="flex flex-col gap-3">
            <button
              type="button"
              onClick={() => onTaskChange({ ...task, deliverable_required: !task.deliverable_required, deliverable_description: !task.deliverable_required ? task.deliverable_description : "" })}
              className={cn(
                "flex items-start gap-3 px-3 py-3 rounded-lg border text-left transition-colors",
                task.deliverable_required
                  ? "bg-primary/5 border-primary/20"
                  : "border-border/50 hover:bg-muted/50"
              )}
            >
              <div className={cn(
                "w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 mt-0.5 transition-colors",
                task.deliverable_required ? "bg-primary border-primary" : "border-border"
              )}>
                {task.deliverable_required && <span className="text-[10px] text-primary-foreground font-bold leading-none">✓</span>}
              </div>
              <div>
                <p className="text-sm font-medium text-foreground">Require deliverable on completion</p>
                <p className="text-xs text-muted-foreground mt-0.5">Assignee must upload a file or link. It auto-saves to the project's Deliverables folder in the Vault.</p>
              </div>
            </button>

            {task.deliverable_required && (
              <div>
                <p className="text-[10px] uppercase tracking-widest font-medium text-muted-foreground mb-1.5">What should they submit?</p>
                <Input
                  placeholder="e.g. Final design files exported from Figma"
                  value={task.deliverable_description}
                  onChange={(e) => onTaskChange({ ...task, deliverable_description: e.target.value })}
                  className="text-xs h-8"
                />
              </div>
            )}
          </div>
        )}
      </div>

      {/* Footer summary chips */}
      {summaryChips.length > 0 && (
        <div className="px-6 py-2.5 border-t border-border/40 flex flex-wrap gap-1.5">
          {summaryChips.map((chip) => (
            <span key={chip} className="text-[11px] px-2 py-0.5 rounded-full border border-border/50 text-muted-foreground">
              {chip}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
