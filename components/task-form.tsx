"use client"

import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Button } from "@/components/ui/button"
import { useEffect, useState } from "react"
import { createClient } from "@/lib/supabase/client"

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

  useEffect(() => {
    fetchProjects()
  }, [])

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

  return (
    <div className="grid gap-4 py-4">
      <div className="grid gap-2">
        <Label htmlFor="title">Task Title</Label>
        <Input
          id="title"
          placeholder="What needs to be done?"
          value={task.title}
          onChange={(e) => onTaskChange({ ...task, title: e.target.value })}
        />
      </div>

      <div className="grid gap-2">
        <Label htmlFor="notes">Notes</Label>
        <Input
          id="notes"
          placeholder="Additional notes"
          value={task.notes}
          onChange={(e) => onTaskChange({ ...task, notes: e.target.value })}
        />
      </div>

      <div className="grid gap-2">
        <Label htmlFor="resources">Resources</Label>
        <div className="flex flex-col gap-2">
          <div className="flex gap-2 flex-col md:flex-row">
            <Input
              id="resource-url"
              placeholder="URL"
              value={newResourceUrl}
              onChange={(e) => setNewResourceUrl(e.target.value)}
              className="flex-1 min-w-0"
            />
            <Input
              id="resource-title"
              placeholder="Title (Optional)"
              value={newResourceTitle}
              onChange={(e) => setNewResourceTitle(e.target.value)}
              className="flex-1 min-w-0"
            />
            <Button onClick={handleAddResource} className="shrink-0" type="button">
              Add Resource
            </Button>
          </div>
          <div className="flex flex-col gap-2">
            {task.resources.map((resource, index) => (
              <div key={index} className="flex items-center gap-2">
                <a
                  href={resource.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-primary/10 border border-primary/20 hover:bg-primary/20 text-xs text-primary font-medium"
                  title={resource.url}
                  onClick={(e) => e.stopPropagation()}
                >
                  {resource.title || "Link"}
                  <span className="text-primary/60">→</span>
                </a>
                <button
                  onClick={() => handleRemoveResource(index)}
                  className="text-destructive hover:text-destructive/80 text-xs font-medium"
                  type="button"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="grid gap-2">
          <Label htmlFor="priority">Priority</Label>
          <Select value={task.priority} onValueChange={(v) => onTaskChange({ ...task, priority: v })}>
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
          <Select value={task.status} onValueChange={(v) => onTaskChange({ ...task, status: v })}>
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
          value={task.deadline}
          onChange={(e) => onTaskChange({ ...task, deadline: e.target.value })}
        />
      </div>

      <div className="grid gap-2">
        <Label htmlFor="assigned_to">Assign To (Optional)</Label>
        <Select value={task.assigned_to} onValueChange={(v) => onTaskChange({ ...task, assigned_to: v })}>
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
        <Label htmlFor="project_id">Link to Project (Optional)</Label>
        <Select
          value={task.project_id || "none"}
          onValueChange={(v) => onTaskChange({ ...task, project_id: v === "none" ? undefined : v })}
        >
          <SelectTrigger>
            <SelectValue placeholder="Select project" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">No Project</SelectItem>
            {projects.map((project) => (
              <SelectItem key={project.id} value={project.id}>
                {project.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  )
}
