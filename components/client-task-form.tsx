"use client"

import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Button } from "@/components/ui/button"
import { useState } from "react"
import { cn } from "@/lib/utils"

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
  const [activeTab, setActiveTab] = useState<"details" | "resources">("details")

  const handleAddResource = () => {
    if (!newResourceUrl.trim()) return
    onTaskChange({ ...task, resources: [...task.resources, { url: newResourceUrl, title: newResourceTitle }] })
    setNewResourceUrl("")
    setNewResourceTitle("")
  }

  const handleRemoveResource = (index: number) => {
    onTaskChange({ ...task, resources: task.resources.filter((_, i) => i !== index) })
  }

  const TABS = [
    { id: "details", label: "Details" },
    { id: "resources", label: "Resources", count: task.resources.length },
  ] as const

  return (
    <div className="flex flex-col -mx-6 -mb-6">
      {/* Title + Notes */}
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
            {tab.id === "resources" && tab.count > 0 && (
              <span className="ml-1.5 text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded-full">
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Tab panels */}
      <div className="px-6 py-4 min-h-[160px]">
        {activeTab === "details" && (
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-3 gap-3">
              {/* Priority */}
              <div>
                <p className="text-[10px] uppercase tracking-widest font-medium text-muted-foreground mb-1.5">Priority</p>
                <div className="flex gap-1">
                  {PRIORITIES.map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => onTaskChange({ ...task, priority: p })}
                      className={cn(
                        "flex-1 text-[11px] py-1.5 rounded-md border transition-colors",
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
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {STATUSES.map((s) => (
                      <SelectItem key={s} value={s} className="text-xs capitalize">{s.replace("-", " ")}</SelectItem>
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
          </div>
        )}

        {activeTab === "resources" && (
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
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
              <Button type="button" onClick={handleAddResource} size="sm" className="h-8 text-xs px-3">Add</Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}