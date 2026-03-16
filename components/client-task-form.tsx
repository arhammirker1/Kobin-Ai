"use client"

import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Button } from "@/components/ui/button"
import { useState, useEffect } from "react"
import { cn } from "@/lib/utils"
import { createClient } from "@/lib/supabase/client"

const PRIORITIES = ["low", "medium", "high", "urgent"]
const STATUSES = ["todo", "in-progress", "blocked", "completed"]

interface VaultAttachment {
  vault_item_id: string
  title: string
  drive_file_url: string | null
  link_url: string | null
}

interface ClientTaskFormData {
  title: string
  notes: string
  resources: Array<{ url: string; title?: string }>
  priority: string
  status: string
  deadline: string
  vault_attachments: VaultAttachment[]
  deliverable_required: boolean
  deliverable_description: string
}

interface ClientTaskFormProps {
  task: ClientTaskFormData
  onTaskChange: (task: ClientTaskFormData) => void
  newResourceUrl: string
  setNewResourceUrl: (url: string) => void
  newResourceTitle: string
  setNewResourceTitle: (title: string) => void
  projectId?: string
}

export function ClientTaskForm({
  task,
  onTaskChange,
  newResourceUrl,
  setNewResourceUrl,
  newResourceTitle,
  setNewResourceTitle,
  projectId,
}: ClientTaskFormProps) {
  const [activeTab, setActiveTab] = useState<"details" | "resources" | "deliverable">("details")
  const supabase = createClient()

  // Vault state
  const [vaultItems, setVaultItems] = useState<Array<{ id: string; title: string; item_type: string; drive_file_url: string | null; link_url: string | null; folder_type: string }>>([])
  const [loadingVault, setLoadingVault] = useState(false)

  // File upload state
  const [uploadFile, setUploadFile] = useState<File | null>(null)
  const [uploadingFile, setUploadingFile] = useState(false)
  const [uploadFolderType, setUploadFolderType] = useState<"client_uploads" | "deliverables">("client_uploads")

  useEffect(() => {
    if (projectId) fetchVaultItems(projectId)
  }, [projectId])

  const fetchVaultItems = async (pid: string) => {
    setLoadingVault(true)
    const { data: folders } = await supabase
      .from("vault_folders")
      .select("id, folder_type")
      .eq("project_id", pid)
      .in("folder_type", ["client_uploads", "deliverables"])

    if (!folders?.length) { setLoadingVault(false); return }

    const folderIds = folders.map((f) => f.id)
    const folderTypeMap = Object.fromEntries(folders.map((f) => [f.id, f.folder_type]))

    const { data: items } = await supabase
      .from("vault_items")
      .select("id, title, item_type, drive_file_url, link_url, folder_id")
      .in("folder_id", folderIds)
      .in("item_type", ["file", "link"])
      .order("created_at", { ascending: false })

    setVaultItems((items || []).map((item: any) => ({ ...item, folder_type: folderTypeMap[item.folder_id] || "client_uploads" })))
    setLoadingVault(false)
  }

  const handleUploadFile = async () => {
    if (!uploadFile || !projectId) return
    setUploadingFile(true)
    try {
      const formData = new FormData()
      formData.append("file", uploadFile)
      formData.append("project_id", projectId)
      formData.append("folder_type", uploadFolderType)
      formData.append("title", uploadFile.name)

      const res = await fetch("/api/tasks/attach-client-file", { method: "POST", body: formData })
      const json = await res.json()
      if (!res.ok) throw new Error(json.message)

      // Add to vault attachments
      onTaskChange({
        ...task,
        vault_attachments: [...task.vault_attachments, {
          vault_item_id: json.vault_item_id,
          title: json.title,
          drive_file_url: json.drive_file_url,
          link_url: null,
        }]
      })
      setUploadFile(null)
      // Refresh vault list
      if (projectId) fetchVaultItems(projectId)
    } catch (err: any) {
      console.error("Upload failed:", err)
    }
    setUploadingFile(false)
  }

  const handleAddResource = () => {
    if (!newResourceUrl.trim()) return
    onTaskChange({ ...task, resources: [...task.resources, { url: newResourceUrl, title: newResourceTitle }] })
    setNewResourceUrl("")
    setNewResourceTitle("")
  }

  const handleRemoveResource = (index: number) => {
    onTaskChange({ ...task, resources: task.resources.filter((_, i) => i !== index) })
  }

  const resourceCount = task.resources.length + task.vault_attachments.length

  const TABS = [
    { id: "details", label: "Details" },
    { id: "resources", label: "Resources", count: resourceCount },
    { id: "deliverable", label: "Deliverable" },
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
            {tab.id === "resources" && (tab as any).count > 0 && (
              <span className="ml-1.5 text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded-full">
                {(tab as any).count}
              </span>
            )}
            {tab.id === "deliverable" && task.deliverable_required && (
              <span className="ml-1.5 w-1.5 h-1.5 rounded-full bg-primary inline-block" />
            )}
          </button>
        ))}
      </div>

      {/* Tab panels */}
      <div className="px-6 py-4 min-h-[200px]">

        {/* ── Details ── */}
        {activeTab === "details" && (
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-3 gap-3">
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
              <div>
                <p className="text-[10px] uppercase tracking-widest font-medium text-muted-foreground mb-1.5">Deadline</p>
                <Input type="datetime-local" value={task.deadline} onChange={(e) => onTaskChange({ ...task, deadline: e.target.value })} className="h-8 text-xs" />
              </div>
            </div>
          </div>
        )}

        {/* ── Resources ── */}
        {activeTab === "resources" && (
          <div className="flex flex-col gap-4">

            {/* Vault picker — client-visible folders only */}
            {projectId ? (
              <div>
                <p className="text-[10px] uppercase tracking-widest font-medium text-muted-foreground mb-1.5">Attach from vault</p>
                {loadingVault ? (
                  <p className="text-xs text-muted-foreground">Loading…</p>
                ) : vaultItems.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No files in your project vault yet</p>
                ) : (
                  <div className="border border-border/50 rounded-lg overflow-hidden max-h-32 overflow-y-auto divide-y divide-border/30">
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
                          <span className="text-[10px] text-muted-foreground capitalize shrink-0">{item.folder_type.replace("_", " ")}</span>
                          {isAttached && <span className="font-semibold text-primary">✓</span>}
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>
            ) : (
              <div className="text-xs text-muted-foreground border border-dashed border-border rounded-lg px-3 py-2.5">
                No project linked — vault files unavailable
              </div>
            )}

            {/* Upload new file to vault */}
            {projectId && (
              <div>
                <p className="text-[10px] uppercase tracking-widest font-medium text-muted-foreground mb-1.5">Upload new file to vault</p>
                <div className="flex flex-col gap-2">
                  <div className="flex gap-2">
                    <Select value={uploadFolderType} onValueChange={(v: any) => setUploadFolderType(v)}>
                      <SelectTrigger className="h-8 text-xs w-40 shrink-0">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="client_uploads" className="text-xs">Client Uploads</SelectItem>
                        <SelectItem value="deliverables" className="text-xs">Deliverables</SelectItem>
                      </SelectContent>
                    </Select>
                    <input
                      type="file"
                      onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
                      className="flex-1 text-xs text-muted-foreground file:mr-2 file:text-xs file:border file:border-border file:rounded file:px-2 file:py-1 file:bg-muted file:text-foreground"
                    />
                  </div>
                  {uploadFile && (
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground flex-1 truncate">📄 {uploadFile.name}</span>
                      <Button
                        type="button"
                        size="sm"
                        onClick={handleUploadFile}
                        disabled={uploadingFile}
                        className="h-7 text-xs px-3 shrink-0"
                      >
                        {uploadingFile ? "Uploading…" : "Upload & attach"}
                      </Button>
                      <button type="button" onClick={() => setUploadFile(null)} className="text-muted-foreground hover:text-destructive text-sm">×</button>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* External links */}
            <div>
              <p className="text-[10px] uppercase tracking-widest font-medium text-muted-foreground mb-1.5">External links</p>
              <div className="flex flex-col gap-1.5 mb-2">
                {task.resources.map((resource, index) => (
                  <div key={index} className="flex items-center gap-2 px-2.5 py-1.5 bg-muted/50 rounded-md">
                    <span className="text-xs">🔗</span>
                    <a href={resource.url} target="_blank" rel="noopener noreferrer" className="flex-1 text-xs text-primary truncate" onClick={(e) => e.stopPropagation()}>
                      {resource.title || resource.url}
                    </a>
                    <button type="button" onClick={() => handleRemoveResource(index)} className="text-muted-foreground hover:text-destructive text-sm leading-none">×</button>
                  </div>
                ))}
              </div>
              <div className="flex gap-2">
                <Input placeholder="https://…" value={newResourceUrl} onChange={(e) => setNewResourceUrl(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleAddResource() } }} className="flex-1 h-8 text-xs" />
                <Input placeholder="Label" value={newResourceTitle} onChange={(e) => setNewResourceTitle(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleAddResource() } }} className="w-28 h-8 text-xs" />
                <Button type="button" onClick={handleAddResource} size="sm" className="h-8 text-xs px-3">Add</Button>
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
                task.deliverable_required ? "bg-primary/5 border-primary/20" : "border-border/50 hover:bg-muted/50"
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
                <p className="text-xs text-muted-foreground mt-0.5">The assignee must upload a file or link when completing this task. It auto-saves to the project's Deliverables folder.</p>
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
      {(task.vault_attachments.length > 0 || task.resources.length > 0 || task.deliverable_required || task.priority !== "medium") && (
        <div className="px-6 py-2.5 border-t border-border/40 flex flex-wrap gap-1.5">
          {task.priority !== "medium" && (
            <span className="text-[11px] px-2 py-0.5 rounded-full border border-border/50 text-muted-foreground capitalize">{task.priority}</span>
          )}
          {task.vault_attachments.length > 0 && (
            <span className="text-[11px] px-2 py-0.5 rounded-full border border-border/50 text-muted-foreground">{task.vault_attachments.length} vault file{task.vault_attachments.length > 1 ? "s" : ""}</span>
          )}
          {task.resources.length > 0 && (
            <span className="text-[11px] px-2 py-0.5 rounded-full border border-border/50 text-muted-foreground">{task.resources.length} link{task.resources.length > 1 ? "s" : ""}</span>
          )}
          {task.deliverable_required && (
            <span className="text-[11px] px-2 py-0.5 rounded-full border border-border/50 text-muted-foreground">deliverable required</span>
          )}
        </div>
      )}
    </div>
  )
}