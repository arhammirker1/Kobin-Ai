"use client"

import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Button } from "@/components/ui/button"

const PRIORITIES = ["low", "medium", "high", "urgent"]
const STATUSES = ["todo", "in-progress", "blocked", "completed"]

interface ClientTaskFormData {
  title: string
  notes: string
  resources: Array<{ url: string; title?: string }>
  priority: string
  status: string
  deadline: string
}

interface ClientTaskFormProps {
  task: ClientTaskFormData
  onTaskChange: (task: ClientTaskFormData) => void
  newResourceUrl: string
  setNewResourceUrl: (url: string) => void
  newResourceTitle: string
  setNewResourceTitle: (title: string) => void
}

export function ClientTaskForm({
  task,
  onTaskChange,
  newResourceUrl,
  setNewResourceUrl,
  newResourceTitle,
  setNewResourceTitle,
}: ClientTaskFormProps) {
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
        <textarea
          id="notes"
          placeholder="Additional notes"
          value={task.notes}
          onChange={(e) => onTaskChange({ ...task, notes: e.target.value })}
          className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 resize-none"
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
        <Label htmlFor="deadline">Deadline (with time)</Label>
        <Input
          id="deadline"
          type="datetime-local"
          value={task.deadline}
          onChange={(e) => onTaskChange({ ...task, deadline: e.target.value })}
        />
      </div>
    </div>
  )
}
