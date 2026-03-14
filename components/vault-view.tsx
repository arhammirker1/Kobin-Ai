"use client"

import { useEffect, useState, useRef } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  Search,
  Plus,
  FileText,
  Link2,
  StickyNote,
  FolderOpen,
  ChevronRight,
  Upload,
  ExternalLink,
  MoreHorizontal,
  Trash2,
  Eye,
  CloudOff,
  Cloud,
  Loader2,
  X,
  FolderPlus,
  Users,
  Lock,
  Globe,
} from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { toast } from "sonner"
import { cn } from "@/lib/utils"

// ── Types ─────────────────────────────────────────────────────────────────────

type FolderType = "root" | "project" | "internal" | "client_uploads" | "deliverables" | "custom"

type VaultFolder = {
  id: string
  founder_id: string
  project_id: string | null
  name: string
  drive_folder_id: string
  parent_folder_id: string | null
  folder_type: FolderType
  created_at: string
  children?: VaultFolder[]
}

type VaultItem = {
  id: string
  founder_id: string
  project_id: string | null
  folder_id: string
  item_type: "file" | "link" | "note"
  title: string
  description: string
  document_type: string
  drive_file_id: string | null
  drive_file_url: string | null
  link_url: string | null
  note_content: string | null
  added_by: string
  added_by_type: "founder" | "team" | "client"
  created_at: string
  profile?: { full_name: string }
}

type Project = {
  id: string
  name: string
}

const DOCUMENT_TYPES = [
  "Content",
  "Deliverable",
  "Report",
  "Contract",
  "Brief",
  "Design Asset",
  "Spreadsheet",
  "Presentation",
  "Reference",
  "Other",
]

const FOLDER_TYPE_META: Record<FolderType, { label: string; icon: React.ReactNode; clientVisible: boolean }> = {
  root: { label: "Vault Root", icon: <FolderOpen size={14} />, clientVisible: false },
  project: { label: "Project", icon: <FolderOpen size={14} />, clientVisible: false },
  internal: { label: "Internal", icon: <Lock size={14} />, clientVisible: false },
  client_uploads: { label: "Client Uploads", icon: <Users size={14} />, clientVisible: true },
  deliverables: { label: "Deliverables", icon: <Globe size={14} />, clientVisible: true },
  custom: { label: "Folder", icon: <FolderOpen size={14} />, clientVisible: false },
}

// ── Component ─────────────────────────────────────────────────────────────────

export function VaultView() {
  const supabase = createClient()

  // Drive connection state
  const [driveConnected, setDriveConnected] = useState(false)
  const [connectingDrive, setConnectingDrive] = useState(false)

  // Data
  const [folders, setFolders] = useState<VaultFolder[]>([])
  const [items, setItems] = useState<VaultItem[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [userId, setUserId] = useState<string | null>(null)

  // Navigation
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null)
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null)

  // UI
  const [searchQuery, setSearchQuery] = useState("")
  const [filterType, setFilterType] = useState<"all" | "file" | "link" | "note">("all")
  const [isLoading, setIsLoading] = useState(true)

  // Add item dialog
  const [addDialogOpen, setAddDialogOpen] = useState(false)
  const [addItemType, setAddItemType] = useState<"file" | "link" | "note" | null>(null)
  const [addForm, setAddForm] = useState({
    title: "",
    description: "",
    document_type: "Content",
    link_url: "",
    note_content: "",
  })
  const [uploadFile, setUploadFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Menu state
  const [menuItemId, setMenuItemId] = useState<string | null>(null)

  // ── Init ───────────────────────────────────────────────────────────────────

  useEffect(() => {
    init()
  }, [])

  const init = async () => {
    setIsLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    setUserId(user.id)

    // Check Drive connection
    const { data: integration } = await supabase
      .from("google_integrations")
      .select("drive_connected, drive_vault_folder_id")
      .eq("user_id", user.id)
      .maybeSingle()

    setDriveConnected(!!(integration?.drive_connected && integration?.drive_vault_folder_id))

    // Load projects + folders + items in parallel
    await Promise.all([
      loadProjects(user.id),
      loadFolders(user.id),
    ])

    setIsLoading(false)
  }

  const loadProjects = async (uid: string) => {
    const { data } = await supabase
      .from("projects")
      .select("id, name")
      .eq("founder_id", uid)
      .order("name")
    setProjects(data || [])
  }

  const loadFolders = async (uid: string) => {
    const { data } = await supabase
      .from("vault_folders")
      .select("*")
      .eq("founder_id", uid)
      .order("created_at")
    setFolders(data || [])
  }

  const loadItems = async (folderId: string) => {
    const { data } = await supabase
      .from("vault_items")
      .select("*, profile:profiles(full_name)")
      .eq("folder_id", folderId)
      .order("created_at", { ascending: false })
    setItems(data || [])
  }

  // ── Drive Connect ──────────────────────────────────────────────────────────

  const handleConnectDrive = async () => {
    setConnectingDrive(true)
    try {
      const res = await fetch("/api/vault/connect", { method: "POST" })
      const json = await res.json()
      if (!res.ok) throw new Error(json.message)
      setDriveConnected(true)
      await loadFolders(userId!)
      toast.success("Google Drive connected — Vault is ready")
    } catch (err: any) {
      toast.error(err.message || "Failed to connect Drive")
    } finally {
      setConnectingDrive(false)
    }
  }

  // ── Navigation ─────────────────────────────────────────────────────────────

  const selectProject = (projectId: string) => {
    setSelectedProjectId(projectId)
    setSelectedFolderId(null)
    setItems([])
  }

  const selectFolder = (folder: VaultFolder) => {
    setSelectedFolderId(folder.id)
    loadItems(folder.id)
  }

  // ── Derived data ───────────────────────────────────────────────────────────

  // Subfolders for selected project
  const projectFolders = folders.filter(
    (f) => f.project_id === selectedProjectId && f.folder_type !== "root" && f.folder_type !== "project"
  )

  const selectedFolder = folders.find((f) => f.id === selectedFolderId)

  const filteredItems = items.filter((item) => {
    const matchType = filterType === "all" || item.item_type === filterType
    const matchSearch =
      !searchQuery ||
      item.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.description?.toLowerCase().includes(searchQuery.toLowerCase())
    return matchType && matchSearch
  })

  // ── Add Item ───────────────────────────────────────────────────────────────

  const resetAddForm = () => {
    setAddForm({ title: "", description: "", document_type: "Content", link_url: "", note_content: "" })
    setUploadFile(null)
    setAddItemType(null)
  }

  const handleAddItem = async () => {
    if (!addItemType || !selectedFolderId || !userId) return
    if (!addForm.title.trim()) { toast.error("Title is required"); return }
    if (!addForm.description.trim()) { toast.error("Description is required"); return }
    if (addItemType === "link" && !addForm.link_url.trim()) { toast.error("URL is required"); return }
    if (addItemType === "file" && !uploadFile) { toast.error("Please select a file"); return }

    setUploading(true)
    try {
      let driveFileId: string | null = null
      let driveFileUrl: string | null = null

      // Upload to Drive via API if file
      if (addItemType === "file" && uploadFile) {
        const formData = new FormData()
        formData.append("file", uploadFile)
        formData.append("folder_id", selectedFolderId)
        formData.append("title", addForm.title)
        formData.append("description", addForm.description)
        formData.append("document_type", addForm.document_type)

        const res = await fetch("/api/vault/upload-file", { method: "POST", body: formData })
        const json = await res.json()
        if (!res.ok) throw new Error(json.message)
        driveFileId = json.drive_file_id
        driveFileUrl = json.drive_file_url
      }

      // Save metadata to DB
      const { error } = await supabase.from("vault_items").insert({
        founder_id: userId,
        project_id: selectedProjectId,
        folder_id: selectedFolderId,
        item_type: addItemType,
        title: addForm.title,
        description: addForm.description,
        document_type: addForm.document_type,
        drive_file_id: driveFileId,
        drive_file_url: driveFileUrl,
        link_url: addItemType === "link" ? addForm.link_url : null,
        note_content: addItemType === "note" ? addForm.note_content : null,
        added_by: userId,
        added_by_type: "founder",
      })

      if (error) throw error

      toast.success("Added to Vault")
      setAddDialogOpen(false)
      resetAddForm()
      loadItems(selectedFolderId)
    } catch (err: any) {
      toast.error(err.message || "Failed to add item")
    } finally {
      setUploading(false)
    }
  }

  const handleDeleteItem = async (itemId: string) => {
    const { error } = await supabase.from("vault_items").delete().eq("id", itemId)
    if (error) { toast.error("Failed to delete"); return }
    toast.success("Removed from Vault")
    setItems((prev) => prev.filter((i) => i.id !== itemId))
    setMenuItemId(null)
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="flex h-[calc(100vh-8rem)] gap-0 rounded-2xl border border-border/50 overflow-hidden bg-background">
      {/* ── Left sidebar: Projects ── */}
      <div className="w-56 shrink-0 border-r border-border/50 flex flex-col bg-muted/20">
        <div className="px-4 py-4 border-b border-border/50">
          <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Vault</h2>
        </div>

        {/* Drive connection status */}
        {!driveConnected ? (
          <div className="px-3 py-3 mx-2 mt-3 rounded-xl bg-amber-50 border border-amber-200 space-y-2">
            <div className="flex items-center gap-1.5 text-amber-700">
              <CloudOff size={12} />
              <span className="text-[10px] font-bold uppercase tracking-widest">Drive not connected</span>
            </div>
            <Button
              size="sm"
              className="w-full h-7 text-xs"
              onClick={handleConnectDrive}
              disabled={connectingDrive}
            >
              {connectingDrive ? <Loader2 size={12} className="animate-spin" /> : <Cloud size={12} />}
              <span className="ml-1.5">Connect Drive</span>
            </Button>
          </div>
        ) : (
          <div className="px-3 py-2 mx-2 mt-3 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center gap-1.5">
            <Cloud size={11} className="text-emerald-600" />
            <span className="text-[10px] font-bold uppercase tracking-widest text-emerald-700">Drive connected</span>
          </div>
        )}

        {/* Projects list */}
        <div className="flex-1 overflow-y-auto py-3 space-y-0.5 px-2">
          {projects.length === 0 ? (
            <p className="text-[11px] text-muted-foreground px-2 py-2">No projects yet</p>
          ) : (
            projects.map((project) => {
              const hasVaultFolders = folders.some((f) => f.project_id === project.id)
              return (
                <button
                  key={project.id}
                  onClick={() => selectProject(project.id)}
                  className={cn(
                    "w-full text-left flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors",
                    selectedProjectId === project.id
                      ? "bg-primary/10 text-primary font-semibold"
                      : "text-foreground/70 hover:bg-muted hover:text-foreground"
                  )}
                >
                  <FolderOpen size={14} className="shrink-0" />
                  <span className="truncate flex-1">{project.name}</span>
                  {!hasVaultFolders && driveConnected && (
                    <span className="size-1.5 rounded-full bg-amber-400 shrink-0" title="Vault folders not created" />
                  )}
                </button>
              )
            })
          )}
        </div>
      </div>

      {/* ── Middle: Folder list ── */}
      <div className="w-52 shrink-0 border-r border-border/50 flex flex-col bg-background">
        {!selectedProjectId ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-2 text-center px-4">
            <FolderOpen size={32} className="text-muted-foreground/40" />
            <p className="text-xs text-muted-foreground">Select a project to see its folders</p>
          </div>
        ) : (
          <>
            <div className="px-4 py-3 border-b border-border/50">
              <p className="text-xs font-bold text-foreground truncate">
                {projects.find((p) => p.id === selectedProjectId)?.name}
              </p>
              <p className="text-[10px] text-muted-foreground mt-0.5">Project folders</p>
            </div>

            <div className="flex-1 overflow-y-auto py-2 space-y-0.5 px-2">
              {projectFolders.length === 0 ? (
                <div className="px-2 py-4 text-center space-y-2">
                  <p className="text-[11px] text-muted-foreground">No folders yet</p>
                  {driveConnected && (
                    <p className="text-[10px] text-muted-foreground/70">
                      Folders are created automatically when a project is created
                    </p>
                  )}
                </div>
              ) : (
                projectFolders.map((folder) => {
                  const meta = FOLDER_TYPE_META[folder.folder_type]
                  return (
                    <button
                      key={folder.id}
                      onClick={() => selectFolder(folder)}
                      className={cn(
                        "w-full text-left flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors",
                        selectedFolderId === folder.id
                          ? "bg-primary/10 text-primary font-semibold"
                          : "text-foreground/70 hover:bg-muted hover:text-foreground"
                      )}
                    >
                      <span className="shrink-0 text-muted-foreground">{meta.icon}</span>
                      <span className="truncate flex-1 text-[13px]">{folder.name}</span>
                      {meta.clientVisible && (
                        <span title="Visible to clients" className="shrink-0">
                          <Eye size={10} className="text-muted-foreground/60" />
                        </span>
                      )}
                    </button>
                  )
                })
              )}
            </div>

            {/* Add custom folder — future feature placeholder */}
            <div className="px-3 py-3 border-t border-border/50">
              <button className="flex items-center gap-2 text-[11px] text-muted-foreground hover:text-foreground transition-colors w-full px-1 py-1">
                <FolderPlus size={13} />
                New folder
              </button>
            </div>
          </>
        )}
      </div>

      {/* ── Right: Items view ── */}
      <div className="flex-1 flex flex-col min-w-0">
        {!selectedFolderId ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center px-8">
            {!selectedProjectId ? (
              <>
                <div className="size-16 rounded-2xl bg-muted flex items-center justify-center">
                  <FolderOpen size={28} className="text-muted-foreground/40" />
                </div>
                <div>
                  <p className="font-semibold text-foreground/70">Select a project</p>
                  <p className="text-sm text-muted-foreground mt-1">Choose a project from the left to browse its vault</p>
                </div>
              </>
            ) : (
              <>
                <div className="size-16 rounded-2xl bg-muted flex items-center justify-center">
                  <FolderOpen size={28} className="text-muted-foreground/40" />
                </div>
                <div>
                  <p className="font-semibold text-foreground/70">Select a folder</p>
                  <p className="text-sm text-muted-foreground mt-1">Choose a folder to see its contents</p>
                </div>
              </>
            )}
          </div>
        ) : (
          <>
            {/* Header */}
            <div className="px-6 py-4 border-b border-border/50 flex items-center justify-between gap-4">
              <div className="flex items-center gap-2 text-sm text-muted-foreground min-w-0">
                <span className="truncate">{projects.find((p) => p.id === selectedProjectId)?.name}</span>
                <ChevronRight size={14} />
                <span className="font-semibold text-foreground truncate">{selectedFolder?.name}</span>
                {selectedFolder && FOLDER_TYPE_META[selectedFolder.folder_type].clientVisible && (
                  <Badge variant="secondary" className="text-[9px] font-bold uppercase tracking-widest h-4 px-1.5 shrink-0">
                    <Eye size={8} className="mr-1" />
                    Client visible
                  </Badge>
                )}
              </div>

              <Button
                size="sm"
                className="gap-1.5 shrink-0"
                onClick={() => { setAddDialogOpen(true) }}
              >
                <Plus size={14} />
                Add to Vault
              </Button>
            </div>

            {/* Search + filter */}
            <div className="px-6 py-3 border-b border-border/50 flex items-center gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by title or description…"
                  className="pl-9 h-9 text-sm"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
              <div className="flex items-center gap-1">
                {(["all", "file", "link", "note"] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => setFilterType(t)}
                    className={cn(
                      "px-3 py-1.5 rounded-lg text-xs font-semibold capitalize transition-colors",
                      filterType === t
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground"
                    )}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>

            {/* Items grid */}
            <div className="flex-1 overflow-y-auto p-6">
              {filteredItems.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-48 gap-3 text-center">
                  <div className="size-12 rounded-xl bg-muted flex items-center justify-center">
                    <Plus size={20} className="text-muted-foreground/40" />
                  </div>
                  <div>
                    <p className="font-semibold text-foreground/70">Empty folder</p>
                    <p className="text-sm text-muted-foreground mt-0.5">Add files, links, or notes to this folder</p>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => setAddDialogOpen(true)}>
                    <Plus size={14} className="mr-1.5" />
                    Add to Vault
                  </Button>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                  {filteredItems.map((item) => (
                    <VaultItemCard
                      key={item.id}
                      item={item}
                      menuOpen={menuItemId === item.id}
                      onMenuToggle={() => setMenuItemId(menuItemId === item.id ? null : item.id)}
                      onDelete={() => handleDeleteItem(item.id)}
                      onMenuClose={() => setMenuItemId(null)}
                    />
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* ── Add item dialog ── */}
      <Dialog open={addDialogOpen} onOpenChange={(open) => { if (!open) { setAddDialogOpen(false); resetAddForm() } }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Add to Vault</DialogTitle>
          </DialogHeader>

          {/* Step 1: Choose type */}
          {!addItemType ? (
            <div className="space-y-3 py-2">
              <p className="text-sm text-muted-foreground">What would you like to add?</p>
              <div className="grid grid-cols-3 gap-3">
                {([
                  { type: "file", label: "File Upload", icon: <Upload size={20} /> },
                  { type: "link", label: "Link", icon: <Link2 size={20} /> },
                  { type: "note", label: "Note", icon: <StickyNote size={20} /> },
                ] as const).map(({ type, label, icon }) => (
                  <button
                    key={type}
                    onClick={() => setAddItemType(type)}
                    className="flex flex-col items-center gap-2 p-4 rounded-xl border border-border hover:border-primary/50 hover:bg-primary/5 transition-colors group"
                  >
                    <span className="text-muted-foreground group-hover:text-primary transition-colors">{icon}</span>
                    <span className="text-xs font-semibold text-muted-foreground group-hover:text-foreground">{label}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            /* Step 2: Form */
            <div className="space-y-4 py-2">
              <div className="flex items-center gap-2">
                <button onClick={() => setAddItemType(null)} className="text-muted-foreground hover:text-foreground">
                  <X size={14} />
                </button>
                <span className="text-sm font-semibold capitalize">{addItemType === "file" ? "File Upload" : addItemType}</span>
              </div>

              <div className="space-y-3">
                <div>
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-1.5 block">Title *</label>
                  <Input
                    placeholder="Enter a clear title…"
                    value={addForm.title}
                    onChange={(e) => setAddForm((f) => ({ ...f, title: e.target.value }))}
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-1.5 block">Description *</label>
                  <textarea
                    placeholder="What is this? Add context so your team knows what it's for…"
                    value={addForm.description}
                    onChange={(e) => setAddForm((f) => ({ ...f, description: e.target.value }))}
                    rows={2}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 resize-none"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-1.5 block">Document Type</label>
                  <Select value={addForm.document_type} onValueChange={(v) => setAddForm((f) => ({ ...f, document_type: v }))}>
                    <SelectTrigger className="h-9 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {DOCUMENT_TYPES.map((t) => (
                        <SelectItem key={t} value={t}>{t}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Type-specific fields */}
                {addItemType === "file" && (
                  <div>
                    <label className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-1.5 block">File *</label>
                    <div
                      onClick={() => fileInputRef.current?.click()}
                      className={cn(
                        "border-2 border-dashed rounded-xl p-4 text-center cursor-pointer transition-colors",
                        uploadFile ? "border-primary/40 bg-primary/5" : "border-border hover:border-primary/30 hover:bg-muted/40"
                      )}
                    >
                      {uploadFile ? (
                        <div className="flex items-center justify-center gap-2 text-sm">
                          <FileText size={14} className="text-primary" />
                          <span className="font-medium truncate max-w-[200px]">{uploadFile.name}</span>
                          <button
                            onClick={(e) => { e.stopPropagation(); setUploadFile(null) }}
                            className="text-muted-foreground hover:text-foreground ml-1"
                          >
                            <X size={12} />
                          </button>
                        </div>
                      ) : (
                        <div className="space-y-1">
                          <Upload size={20} className="mx-auto text-muted-foreground/50" />
                          <p className="text-xs text-muted-foreground">Click to select a file</p>
                        </div>
                      )}
                    </div>
                    <input
                      ref={fileInputRef}
                      type="file"
                      className="hidden"
                      onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
                    />
                  </div>
                )}

                {addItemType === "link" && (
                  <div>
                    <label className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-1.5 block">URL *</label>
                    <Input
                      placeholder="https://…"
                      value={addForm.link_url}
                      onChange={(e) => setAddForm((f) => ({ ...f, link_url: e.target.value }))}
                    />
                  </div>
                )}

                {addItemType === "note" && (
                  <div>
                    <label className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-1.5 block">Content</label>
                    <textarea
                      placeholder="Write your note…"
                      value={addForm.note_content}
                      onChange={(e) => setAddForm((f) => ({ ...f, note_content: e.target.value }))}
                      rows={5}
                      className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 resize-none"
                    />
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-2 pt-1">
                <Button variant="outline" onClick={() => { setAddDialogOpen(false); resetAddForm() }}>
                  Cancel
                </Button>
                <Button onClick={handleAddItem} disabled={uploading}>
                  {uploading ? <Loader2 size={14} className="animate-spin mr-1.5" /> : null}
                  Add to Vault
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ── Vault Item Card ────────────────────────────────────────────────────────────

function VaultItemCard({
  item,
  menuOpen,
  onMenuToggle,
  onDelete,
  onMenuClose,
}: {
  item: VaultItem
  menuOpen: boolean
  onMenuToggle: () => void
  onDelete: () => void
  onMenuClose: () => void
}) {
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!menuOpen) return
    const handler = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) onMenuClose()
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [menuOpen])

  const typeConfig = {
    file: { icon: <FileText size={16} />, color: "bg-blue-50 text-blue-600 border-blue-100" },
    link: { icon: <Link2 size={16} />, color: "bg-violet-50 text-violet-600 border-violet-100" },
    note: { icon: <StickyNote size={16} />, color: "bg-amber-50 text-amber-600 border-amber-100" },
  }[item.item_type]

  const addedByColor = {
    founder: "bg-primary/10 text-primary",
    team: "bg-blue-50 text-blue-700",
    client: "bg-emerald-50 text-emerald-700",
  }[item.added_by_type]

  return (
    <Card className="group hover:border-primary/30 transition-all overflow-hidden">
      <CardContent className="p-4 space-y-3">
        {/* Type badge + menu */}
        <div className="flex items-start justify-between gap-2">
          <div className={cn("flex items-center gap-1.5 px-2 py-1 rounded-md border text-xs font-semibold", typeConfig.color)}>
            {typeConfig.icon}
            <span className="capitalize">{item.item_type}</span>
          </div>
          <div className="relative" ref={menuRef}>
            <button
              onClick={onMenuToggle}
              className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-muted"
            >
              <MoreHorizontal size={14} />
            </button>
            {menuOpen && (
              <div className="absolute right-0 top-6 w-36 bg-background border border-border rounded-xl shadow-lg overflow-hidden z-10">
                {item.item_type === "file" && item.drive_file_url && (
                  <a
                    href={item.drive_file_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 px-3 py-2 text-xs hover:bg-muted transition-colors"
                  >
                    <ExternalLink size={12} />
                    Open in Drive
                  </a>
                )}
                {item.item_type === "link" && item.link_url && (
                  <a
                    href={item.link_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 px-3 py-2 text-xs hover:bg-muted transition-colors"
                  >
                    <ExternalLink size={12} />
                    Open link
                  </a>
                )}
                <button
                  onClick={onDelete}
                  className="flex items-center gap-2 px-3 py-2 text-xs text-destructive hover:bg-destructive/10 transition-colors w-full text-left"
                >
                  <Trash2 size={12} />
                  Delete
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Title + description */}
        <div className="space-y-1">
          <h4 className="font-semibold text-sm leading-snug line-clamp-1">{item.title}</h4>
          <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">{item.description}</p>
        </div>

        {/* Link preview */}
        {item.item_type === "link" && item.link_url && (
          <a
            href={item.link_url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-xs text-primary hover:underline truncate"
          >
            <ExternalLink size={11} />
            <span className="truncate">{item.link_url}</span>
          </a>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between pt-1 border-t border-border/40">
          <div className={cn("text-[10px] font-semibold px-1.5 py-0.5 rounded-md capitalize", addedByColor)}>
            {item.added_by_type}
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-[9px] h-4 px-1.5 font-medium">
              {item.document_type}
            </Badge>
            <span className="text-[10px] text-muted-foreground">
              {new Date(item.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}