"use client"

/**
 * components/vault-view.tsx — Kobin AI Vault v3.1
 *
 * ── Changes from v3.0 ────────────────────────────────────────────────────────
 *  FIX 1  getViewerType — handles document_type="Note/Content/SOP/Brief/Reference"
 *          with no recognized extension → forces TipTap doc viewer
 *  FIX 2  openItem — uses extracted_text as fallback when note_content is null
 *  FIX 3  Dialog — when aiLabelMode=ON, hides ALL input fields; user only
 *          needs to pick a file and press "Add to Vault"
 *  FIX 4  Removed duplicate docx/spreadsheet viewer blocks
 *  FIX 5  Logging — every major action tagged with [Vault/*]
 *  FIX 6  Right panel is a proper side column (no overlay)
 */

import { useEffect, useState, useRef, useCallback } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  Search, Plus, FileText, Link2, StickyNote, FolderOpen,
  ChevronRight, Upload, ExternalLink, MoreHorizontal, Trash2,
  Eye, CloudOff, Cloud, Loader2, X, FolderPlus, Users, Lock,
  Globe, ArrowLeft, Sparkles, Code, Image, FileIcon, Check,
  Clock, AlertCircle, RefreshCw, Send, ChevronLeft, ChevronDown,
  Activity, MessageSquare, Zap, BookOpen, Download,
} from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import dynamic from "next/dynamic"

// ── Dynamic imports (zero bundle cost when not used) ──────────────────────

const NoteEditor = dynamic(() => import("@/components/vault/note-editor"), {
  ssr: false,
  loading: () => (
    <div className="flex-1 flex items-center justify-center">
      <Loader2 size={16} className="animate-spin text-white/30" />
    </div>
  ),
})

const CodeViewerComponent = dynamic(() => import("@/components/vault/code-viewer"), {
  ssr: false,
  loading: () => (
    <div className="flex-1 flex items-center justify-center">
      <Loader2 size={16} className="animate-spin text-white/30" />
    </div>
  ),
})

const SpreadsheetViewerComponent = dynamic(() => import("@/components/vault/spreadsheet-viewer"), {
  ssr: false,
  loading: () => (
    <div className="flex-1 flex items-center justify-center">
      <Loader2 size={16} className="animate-spin text-white/30" />
    </div>
  ),
})

const DocxViewerComponent = dynamic(() => import("@/components/vault/docx-viewer"), {
  ssr: false,
  loading: () => (
    <div className="flex-1 flex items-center justify-center">
      <Loader2 size={16} className="animate-spin text-white/30" />
    </div>
  ),
})

// ── Types ─────────────────────────────────────────────────────────────────────

type FolderType = "root" | "project" | "internal" | "client_uploads" | "deliverables" | "custom"
type ItemType = "file" | "link" | "note"
type AddedByType = "founder" | "team" | "client"
type EmbedStatus = "pending" | "embedded" | "failed" | "skipped"
type ApprovalStatus = "pending" | "approved" | "changes_requested" | "none"
type ViewerType = "doc" | "image" | "pdf" | "code" | "link" | "file" | "docx" | "spreadsheet" | null
type RightPanelTab = "context" | "approval" | "comments" | "activity"
type FilterType = "all" | "file" | "link" | "note"

interface VaultFolder {
  id: string
  founder_id: string
  project_id: string | null
  name: string
  drive_folder_id: string
  parent_folder_id: string | null
  folder_type: FolderType
  created_at: string
}

interface VaultItem {
  id: string
  founder_id: string
  project_id: string | null
  folder_id: string
  item_type: ItemType
  title: string
  description: string
  document_type: string
  drive_file_id: string | null
  drive_file_url: string | null
  link_url: string | null
  note_content: string | null
  added_by: string
  added_by_type: AddedByType
  created_at: string
  embedding_status?: EmbedStatus
  storage_path?: string | null
  extracted_text?: string | null
}

interface RelatedItem {
  item: VaultItem & { project_name?: string; folder_name?: string }
  reason: string
  similarity: number
}

interface SearchResult extends VaultItem {
  similarity: number
  project_name?: string
  folder_name?: string
}

interface Project {
  id: string
  name: string
}

// ── Constants ─────────────────────────────────────────────────────────────────

const DOCUMENT_TYPES = [
  "Content", "Deliverable", "Report", "Contract", "Brief",
  "Design Asset", "Spreadsheet", "Presentation", "Reference",
  "Proposal", "SOP", "Note", "Code", "Other",
]

const FOLDER_META: Record<FolderType, { label: string; icon: React.ReactNode; clientVisible: boolean; color: string }> = {
  root:           { label: "Vault Root",       icon: <FolderOpen size={13} />, clientVisible: false, color: "text-white/30" },
  project:        { label: "Project",          icon: <FolderOpen size={13} />, clientVisible: false, color: "text-white/30" },
  internal:       { label: "Internal",         icon: <Lock size={13} />,       clientVisible: false, color: "text-white/30" },
  client_uploads: { label: "Client Uploads",   icon: <Users size={13} />,      clientVisible: true,  color: "text-blue-400" },
  deliverables:   { label: "Deliverables",     icon: <Globe size={13} />,      clientVisible: true,  color: "text-violet-400" },
  custom:         { label: "Folder",           icon: <FolderOpen size={13} />, clientVisible: false, color: "text-white/30" },
}

const TYPE_CONFIG: Record<ItemType, { icon: React.ReactNode; badge: string; color: string }> = {
  file: { icon: <FileText size={14} />, badge: "File",  color: "bg-blue-500/10 text-blue-400 border-blue-500/20" },
  link: { icon: <Link2 size={14} />,    badge: "Link",  color: "bg-violet-500/10 text-violet-400 border-violet-500/20" },
  note: { icon: <StickyNote size={14} />, badge: "Note", color: "bg-amber-500/10 text-amber-400 border-amber-500/20" },
}

const DOC_TYPE_OVERRIDES: Partial<Record<string, { icon: React.ReactNode; badge: string; color: string }>> = {
  "Code":         { icon: <Code size={14} />,    badge: "Code",     color: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" },
  "Design Asset": { icon: <Image size={14} />,   badge: "Design",   color: "bg-pink-500/10 text-pink-400 border-pink-500/20" },
  "Spreadsheet":  { icon: <FileIcon size={14} />, badge: "Sheet",   color: "bg-green-500/10 text-green-400 border-green-500/20" },
  "Presentation": { icon: <FileIcon size={14} />, badge: "Slides",  color: "bg-orange-500/10 text-orange-400 border-orange-500/20" },
  "Contract":     { icon: <FileText size={14} />, badge: "Contract", color: "bg-red-500/10 text-red-400 border-red-500/20" },
  "Report":       { icon: <FileText size={14} />, badge: "Report",  color: "bg-cyan-500/10 text-cyan-400 border-cyan-500/20" },
}

function getTypeConfig(item: { item_type: ItemType; document_type?: string }) {
  if (item.item_type === "file" && item.document_type && DOC_TYPE_OVERRIDES[item.document_type]) {
    return DOC_TYPE_OVERRIDES[item.document_type]!
  }
  return TYPE_CONFIG[item.item_type]
}

const ADDED_BY_COLOR: Record<AddedByType, string> = {
  founder: "bg-violet-500/10 text-violet-400",
  team:    "bg-blue-500/10 text-blue-400",
  client:  "bg-emerald-500/10 text-emerald-400",
}

// ── Document types that should always open in TipTap (FIX 1) ─────────────────

const TEXT_DOC_TYPES = new Set(["Note", "Content", "Brief", "SOP", "Reference", "Proposal", "Report"])

// ── getViewerType — FIXED ─────────────────────────────────────────────────────

function getViewerType(item: VaultItem): ViewerType {
  console.log(`[Vault/Viewer] Detecting type for "${item.title}" | item_type=${item.item_type} | doc_type=${item.document_type}`)

  // Notes always go to TipTap doc viewer
  if (item.item_type === "note") {
    console.log(`[Vault/Viewer] → doc (note item_type)`)
    return "doc"
  }
  if (item.item_type === "link") {
    console.log(`[Vault/Viewer] → link`)
    return "link"
  }

  // Extract file extension from title (AI labels may strip extensions)
  const titleLower = (item.title || "").toLowerCase()
  const ext = titleLower.includes(".") ? titleLower.split(".").pop() || "" : ""
  const dt = item.document_type || ""

  // Spreadsheets
  const spreadsheetExts = ["xlsx", "xls", "csv", "tsv"]
  if (spreadsheetExts.includes(ext) || dt === "Spreadsheet") {
    console.log(`[Vault/Viewer] → spreadsheet`)
    return "spreadsheet"
  }

  // Word docs
  if (ext === "docx") {
    console.log(`[Vault/Viewer] → docx`)
    return "docx"
  }

  // Images
  const imageExts = ["jpg", "jpeg", "png", "gif", "webp", "svg", "bmp", "avif"]
  if (imageExts.includes(ext) || dt === "Design Asset") {
    console.log(`[Vault/Viewer] → image`)
    return "image"
  }

  // PDF
  if (ext === "pdf") {
    console.log(`[Vault/Viewer] → pdf`)
    return "pdf"
  }

  // Code files
  const codeExts = [
    "js", "ts", "tsx", "jsx", "py", "rb", "go", "rs", "java",
    "cpp", "c", "h", "css", "scss", "html", "json", "yaml",
    "yml", "sql", "sh", "bash", "txt", "md", "env", "toml",
    "graphql", "gql", "mdx", "swift", "kt", "r", "scala",
  ]
  if (codeExts.includes(ext) || dt === "Code") {
    // txt/md go to TipTap for rich editing; others go to Monaco
    if (["txt", "md", "mdx"].includes(ext)) {
      console.log(`[Vault/Viewer] → doc (text file: .${ext})`)
      return "doc"
    }
    console.log(`[Vault/Viewer] → code`)
    return "code"
  }

  // ── FIX 1: Text-type document_type with content ────────────────────────────
  // Handles the case where AI labeled a .txt upload as document_type="Note"
  // but the title has no extension (AI stripped it).
  const hasTextContent = !!(item.note_content || item.extracted_text)
  if (TEXT_DOC_TYPES.has(dt) && hasTextContent) {
    console.log(`[Vault/Viewer] → doc (text doc_type="${dt}" with content)`)
    return "doc"
  }

  // Also treat any file where we ONLY have extracted_text and no binary viewer as doc
  if (item.extracted_text && !item.drive_file_url && !item.storage_path) {
    console.log(`[Vault/Viewer] → doc (only extracted_text available, no binary URL)`)
    return "doc"
  }

  console.log(`[Vault/Viewer] → file (generic fallback)`)
  return "file"
}

// ── Date helper ───────────────────────────────────────────────────────────────

function formatDate(d: string) {
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric" })
}

// ═════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═════════════════════════════════════════════════════════════════════════════

export function VaultView() {
  const supabase = createClient()

  // ── State ──────────────────────────────────────────────────────────────────
  const [isLoading, setIsLoading] = useState(true)
  const [driveConnected, setDriveConnected] = useState(false)
  const [connectingDrive, setConnectingDrive] = useState(false)
  const [isFounder, setIsFounder] = useState(true)
  const [founderId, setFounderId] = useState<string | null>(null)
  const [userId, setUserId] = useState<string | null>(null)

  const [folders, setFolders] = useState<VaultFolder[]>([])
  const [items, setItems] = useState<VaultItem[]>([])
  const [projects, setProjects] = useState<Project[]>([])

  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null)
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null)

  const [searchQuery, setSearchQuery] = useState("")
  const [filterType, setFilterType] = useState<FilterType>("all")

  const [projectsSidebarOpen, setProjectsSidebarOpen] = useState(true)
  const [foldersSidebarOpen, setFoldersSidebarOpen] = useState(true)

  // Viewer
  const [activeViewer, setActiveViewer] = useState<ViewerType>(null)
  const [activeItem, setActiveItem] = useState<VaultItem | null>(null)
  const [rightPanelOpen, setRightPanelOpen] = useState(false)
  const [rightPanelTab, setRightPanelTab] = useState<RightPanelTab>("context")
  const [relatedItems, setRelatedItems] = useState<RelatedItem[]>([])
  const [loadingRelated, setLoadingRelated] = useState(false)

  // AI Writer
  const [aiWriterOpen, setAiWriterOpen] = useState(false)
  const [aiWriterPrompt, setAiWriterPrompt] = useState("")
  const [aiWriterResponse, setAiWriterResponse] = useState("")
  const [aiWriterLoading, setAiWriterLoading] = useState(false)

  // Doc editor
  const [docTitle, setDocTitle] = useState("")
  const [docContent, setDocContent] = useState("")

  // Approval
  const [approvalStatus, setApprovalStatus] = useState<ApprovalStatus>("none")
  const [approvalNote, setApprovalNote] = useState("")

  // Search overlay
  const [searchOverlayOpen, setSearchOverlayOpen] = useState(false)
  const [searchOverlayQuery, setSearchOverlayQuery] = useState("")
  const [searchResults, setSearchResults] = useState<SearchResult[]>([])
  const [searchLoading, setSearchLoading] = useState(false)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Add dialog
  const [addDialogOpen, setAddDialogOpen] = useState(false)
  const [addItemType, setAddItemType] = useState<ItemType | null>(null)
  const [addForm, setAddForm] = useState({
    title: "", description: "", document_type: "Content",
    link_url: "", note_content: "",
  })
  const [uploadFile, setUploadFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // AI labeling
  const [aiLabelMode, setAiLabelMode] = useState(true)
  const [isAiLabeling, setIsAiLabeling] = useState(false)
  const [extractedText, setExtractedText] = useState<string>("")

  // File viewer
  const [signedUrl, setSignedUrl] = useState<string | null>(null)
  const [fileContent, setFileContent] = useState<string | null>(null)
  const [fileLoading, setFileLoading] = useState(false)

  // Context menu
  const [menuItemId, setMenuItemId] = useState<string | null>(null)

  // ── Init ───────────────────────────────────────────────────────────────────

  useEffect(() => { init() }, [])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault()
        setSearchOverlayOpen(true)
        setTimeout(() => searchInputRef.current?.focus(), 50)
      }
      if (e.key === "Escape") {
        setSearchOverlayOpen(false)
        setAddDialogOpen(false)
      }
    }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [])

  const init = async () => {
    console.log("[Vault/Init] Starting vault initialization")
    setIsLoading(true)

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      console.warn("[Vault/Init] No authenticated user")
      return
    }
    setUserId(user.id)

    let fId = user.id
    const { data: profile } = await supabase
      .from("profiles").select("user_type").eq("id", user.id).single()

    if (profile?.user_type === "team_member") {
      setIsFounder(false)
      const { data: tm } = await supabase
        .from("team_members").select("founder_id")
        .eq("user_id", user.id).eq("is_active", true).single()
      if (tm?.founder_id) {
        fId = tm.founder_id
        console.log(`[Vault/Init] Team member — using founder_id=${fId}`)
      }
    }

    setFounderId(fId)

    const { data: integration } = await supabase
      .from("google_integrations")
      .select("drive_connected, drive_vault_folder_id")
      .eq("user_id", fId).maybeSingle()

    const connected = !!(integration?.drive_connected && integration?.drive_vault_folder_id)
    setDriveConnected(connected)
    console.log(`[Vault/Init] Drive connected=${connected}`)

    await Promise.all([loadProjects(fId), loadFolders(fId)])

    // Trigger background embedding (non-blocking)
    fetch("/api/vault/embed", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ batch: true }),
    }).catch((err) => console.warn("[Vault/Init] Background embed trigger failed:", err))

    setIsLoading(false)
    console.log("[Vault/Init] ✓ Vault initialized")
  }

  const loadProjects = async (uid: string) => {
    console.log(`[Vault/Projects] Loading projects for uid=${uid}`)
    const { data, error } = await supabase
      .from("projects").select("id, name").eq("founder_id", uid).order("name")
    if (error) console.error("[Vault/Projects] Error:", error)
    else console.log(`[Vault/Projects] Loaded ${data?.length ?? 0} projects`)
    setProjects(data || [])
  }

  const loadFolders = async (uid: string) => {
    console.log(`[Vault/Folders] Loading folders for uid=${uid}`)
    const { data, error } = await supabase
      .from("vault_folders").select("*").eq("founder_id", uid).order("created_at")
    if (error) console.error("[Vault/Folders] Error:", error)
    else console.log(`[Vault/Folders] Loaded ${data?.length ?? 0} folders`)
    setFolders(data || [])
  }

  const loadItems = async (folderId: string) => {
    console.log(`[Vault/Items] Loading items for folder_id=${folderId}`)
    const { data, error } = await supabase
      .from("vault_items").select("*")
      .eq("folder_id", folderId)
      .order("created_at", { ascending: false })
    if (error) console.error("[Vault/Items] Error:", error)
    else console.log(`[Vault/Items] Loaded ${data?.length ?? 0} items`)
    setItems(data || [])
  }

  // ── Drive connect ──────────────────────────────────────────────────────────

  const handleConnectDrive = async () => {
    console.log("[Vault/Drive] Connecting Drive…")
    setConnectingDrive(true)
    try {
      const res = await fetch("/api/vault/connect", { method: "POST" })
      const json = await res.json()
      if (!res.ok) throw new Error(json.message)
      setDriveConnected(true)
      await loadFolders(founderId!)
      toast.success("Google Drive connected — Vault is ready")
      console.log("[Vault/Drive] ✓ Connected")
    } catch (err: any) {
      console.error("[Vault/Drive] Connection failed:", err)
      toast.error(err.message || "Failed to connect Drive")
    } finally {
      setConnectingDrive(false)
    }
  }

  // ── Navigation ─────────────────────────────────────────────────────────────

  const selectProject = (projectId: string) => {
    console.log(`[Vault/Nav] Selected project=${projectId}`)
    setSelectedProjectId(projectId)
    setSelectedFolderId(null)
    setItems([])
    setActiveViewer(null)
    setActiveItem(null)
    setRightPanelOpen(false)
  }

  const selectFolder = (folder: VaultFolder) => {
    console.log(`[Vault/Nav] Selected folder=${folder.id} name="${folder.name}"`)
    setSelectedFolderId(folder.id)
    loadItems(folder.id)
    setActiveViewer(null)
    setActiveItem(null)
    setRightPanelOpen(false)
  }

  // ── Open item in viewer (FIX 2: extracted_text fallback) ──────────────────

  const openItem = useCallback(async (item: VaultItem) => {
    console.log(`[Vault/Viewer] Opening item="${item.title}" | type=${item.item_type} | doc_type=${item.document_type}`)
    setActiveItem(item)
    setRightPanelOpen(true)
    setRightPanelTab("context")
    setApprovalStatus("none")
    setSignedUrl(null)
    setFileContent(null)

    const viewer = getViewerType(item)
    setActiveViewer(viewer)
    console.log(`[Vault/Viewer] Viewer type resolved to "${viewer}"`)

    // ── FIX 2: Use extracted_text as content fallback for doc viewer ──────
    if (viewer === "doc") {
      setDocTitle(item.title)
      const content = item.note_content || item.extracted_text || ""
      setDocContent(content)
      console.log(`[Vault/Viewer] Doc content source: ${item.note_content ? "note_content" : item.extracted_text ? "extracted_text" : "empty"}`)
    }

    // Fetch file URL for storage-backed files
    if (item.item_type === "file") {
      setFileLoading(true)
      try {
        if (item.storage_path) {
          console.log(`[Vault/Viewer] Fetching signed URL for storage_path=${item.storage_path}`)
          const res = await fetch(`/api/vault/signed-url?item_id=${item.id}`)
          const { url } = await res.json()
          setSignedUrl(url || null)
          console.log(`[Vault/Viewer] Signed URL obtained: ${url ? "✓" : "null"}`)

          if (viewer === "code" && url) {
            console.log(`[Vault/Viewer] Fetching raw file content for code viewer`)
            const contentRes = await fetch(url)
            const text = await contentRes.text()
            setFileContent(text)
            console.log(`[Vault/Viewer] Code content length: ${text.length}`)
          }
        } else if (item.drive_file_url) {
          console.log(`[Vault/Viewer] Using Drive URL (legacy item)`)
          setSignedUrl(item.drive_file_url)
        }
      } catch (err) {
        console.error("[Vault/Viewer] Failed to fetch file URL:", err)
      }
      setFileLoading(false)
    }

    // Fetch related items via pgvector
    setLoadingRelated(true)
    setRelatedItems([])
    try {
      console.log(`[Vault/Related] Searching for related items to "${item.title}"`)
      const res = await fetch("/api/vault/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: `${item.title} ${item.description}`,
          mode: "semantic",
          limit: 5,
        }),
      })
      const json = await res.json()
      if (json.results) {
        const related = json.results
          .filter((r: SearchResult) => r.id !== item.id)
          .slice(0, 4)
          .map((r: SearchResult) => ({
            item: r,
            reason: `${(r.similarity * 100).toFixed(0)}% similarity`,
            similarity: r.similarity,
          }))
        setRelatedItems(related)
        console.log(`[Vault/Related] Found ${related.length} related items`)
      }
    } catch (err) {
      console.error("[Vault/Related] Search failed:", err)
    }
    setLoadingRelated(false)
  }, [])

  const closeViewer = () => {
    console.log("[Vault/Viewer] Closing viewer")
    setActiveViewer(null)
    setActiveItem(null)
    setRightPanelOpen(false)
    setAiWriterOpen(false)
    setAiWriterResponse("")
  }

  // ── File select & AI labeling ──────────────────────────────────────────────

  const handleFileSelect = async (file: File | null) => {
    setUploadFile(file)
    setExtractedText("")
    setAddForm(f => ({ ...f, title: "", description: "", document_type: "Content" }))

    if (!file) {
      console.log("[Vault/Upload] File deselected")
      return
    }

    console.log(`[Vault/Upload] File selected: "${file.name}" | size=${file.size} | type="${file.type}"`)

    if (!aiLabelMode) {
      console.log("[Vault/Upload] AI labeling OFF — skipping auto-label")
      return
    }

    console.log("[Vault/Upload] AI labeling ON — starting extraction + labeling")
    setIsAiLabeling(true)

    try {
      // Step 1: Extract text
      console.log(`[Vault/Extract] Extracting text from "${file.name}"`)
      const { extractTextFromFile } = await import("@/lib/vault/extraction")
      const text = await extractTextFromFile(file)
      setExtractedText(text)
      console.log(`[Vault/Extract] Extracted ${text.length} chars`)

      // Step 2: AI label
      console.log(`[Vault/Label] Calling AI label API`)
      const res = await fetch("/api/vault/ai-label", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filename: file.name,
          fileType: file.type,
          extracted_text: text || undefined,
        }),
      })

      if (!res.ok) {
        const errBody = await res.json().catch(() => ({ error: "unknown" }))
        throw new Error(errBody.error || `HTTP ${res.status}`)
      }

      const data = await res.json()
      console.log(`[Vault/Label] ✓ AI labeled: title="${data.title}" | type="${data.document_type}"`)

      setAddForm(f => ({
        ...f,
        title: data.title || f.title,
        description: data.description || f.description,
        document_type: data.document_type || f.document_type,
      }))
    } catch (err: any) {
      console.error("[Vault/Label] AI labeling failed:", err)
      // Graceful fallback — use filename stripped of extension
      const fallbackTitle = file.name.replace(/\.[^.]+$/, "").replace(/[-_]/g, " ")
      setAddForm(f => ({
        ...f,
        title: f.title || fallbackTitle,
        description: f.description || "Uploaded file",
      }))
      toast.error("AI labeling failed — please add a title manually", { duration: 3000 })
    }

    setIsAiLabeling(false)
    console.log("[Vault/Label] Labeling complete")
  }

  // ── Add item ───────────────────────────────────────────────────────────────

  const resetAddForm = () => {
    setAddForm({ title: "", description: "", document_type: "Content", link_url: "", note_content: "" })
    setUploadFile(null)
    setAddItemType(null)
    setExtractedText("")
    setIsAiLabeling(false)
  }

  const handleAddItem = async () => {
    if (!addItemType || !selectedFolderId || !userId || !founderId) return

    // When AI labeling is ON for files, just need the file
    if (addItemType === "file" && !uploadFile) { toast.error("Please select a file"); return }
    if (addItemType !== "file" && !addForm.title.trim()) { toast.error("Title is required"); return }
    if (addItemType !== "file" && !addForm.description.trim()) { toast.error("Description is required"); return }
    if (addItemType === "link" && !addForm.link_url.trim()) { toast.error("URL is required"); return }

    // If still AI labeling — wait (should not happen since button is disabled)
    if (isAiLabeling) { toast.error("AI labeling in progress, please wait…"); return }

    console.log(`[Vault/Add] Adding ${addItemType}: "${addForm.title || uploadFile?.name}"`)
    setUploading(true)

    try {
      let storagePath: string | null = null
      let serverExtractedText = extractedText

      if (addItemType === "file" && uploadFile) {
        console.log(`[Vault/Upload] Uploading "${uploadFile.name}" to Supabase Storage`)
        const formData = new FormData()
        formData.append("file", uploadFile)
        formData.append("folder_id", selectedFolderId)
        if (extractedText) formData.append("extracted_text", extractedText)

        const res = await fetch("/api/vault/upload-internal", { method: "POST", body: formData })
        const json = await res.json()
        if (!res.ok) throw new Error(json.message)

        storagePath = json.storage_path
        if (!extractedText && json.extracted_text) {
          serverExtractedText = json.extracted_text
          console.log(`[Vault/Upload] Server extracted ${json.extracted_text?.length ?? 0} chars (PDF)`)
        }
        console.log(`[Vault/Upload] ✓ Uploaded to storage_path="${storagePath}"`)
      }

      // Use filename as title fallback if AI labeling was on but form is still empty
      const finalTitle = addForm.title.trim() || (uploadFile?.name.replace(/\.[^.]+$/, "") ?? "Untitled")
      const finalDescription = addForm.description.trim() || "Uploaded file"

      const { data: newItem, error } = await supabase.from("vault_items").insert({
        founder_id: founderId,
        project_id: selectedProjectId,
        folder_id: selectedFolderId,
        item_type: addItemType,
        title: finalTitle,
        description: finalDescription,
        document_type: addForm.document_type,
        drive_file_id: null,
        drive_file_url: null,
        storage_path: storagePath,
        link_url: addItemType === "link" ? addForm.link_url : null,
        note_content: addItemType === "note" ? addForm.note_content : null,
        added_by: userId,
        added_by_type: isFounder ? "founder" : "team",
        embedding_status: "pending",
        extracted_text: addItemType === "file" ? (serverExtractedText || null) : null,
      }).select().single()

      if (error) throw error

      console.log(`[Vault/Add] ✓ Item saved: id=${newItem?.id}`)
      toast.success("Added to Vault")

      // Trigger embedding async (non-blocking)
      if (newItem) {
        fetch("/api/vault/embed", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ vault_item_id: newItem.id }),
        }).catch((err) => console.warn("[Vault/Embed] Trigger failed:", err))
        console.log(`[Vault/Embed] Embedding triggered for ${newItem.id}`)
      }

      setAddDialogOpen(false)
      resetAddForm()
      loadItems(selectedFolderId)
    } catch (err: any) {
      console.error("[Vault/Add] Failed:", err)
      toast.error(err.message || "Failed to add item")
    } finally {
      setUploading(false)
    }
  }

  const handleDeleteItem = async (itemId: string) => {
    console.log(`[Vault/Delete] Deleting item=${itemId}`)
    const { error } = await supabase.from("vault_items").delete().eq("id", itemId)
    if (error) {
      console.error("[Vault/Delete] Error:", error)
      toast.error("Failed to delete")
      return
    }
    console.log(`[Vault/Delete] ✓ Deleted ${itemId}`)
    toast.success("Removed from Vault")
    setItems((prev) => prev.filter((i) => i.id !== itemId))
    setMenuItemId(null)
    if (activeItem?.id === itemId) closeViewer()
  }

  // ── Save note ──────────────────────────────────────────────────────────────

  const saveNote = async () => {
    if (!activeItem) return
    console.log(`[Vault/Note] Saving note: id=${activeItem.id}`)
    setIsSaving(true)
    const { error } = await supabase
      .from("vault_items")
      .update({ title: docTitle, note_content: docContent })
      .eq("id", activeItem.id)
    setIsSaving(false)
    if (error) {
      console.error("[Vault/Note] Save error:", error)
      toast.error("Failed to save")
      return
    }
    console.log("[Vault/Note] ✓ Saved")
    toast.success("Saved")
    fetch("/api/vault/embed", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ vault_item_id: activeItem.id }),
    }).catch(() => { })
    loadItems(selectedFolderId!)
  }

  // ── AI Writer ──────────────────────────────────────────────────────────────

  const runAIWriter = async () => {
    if (!aiWriterPrompt.trim()) return
    console.log(`[Vault/AIWriter] Running prompt: "${aiWriterPrompt.slice(0, 60)}"`)
    setAiWriterLoading(true)
    setAiWriterResponse("")
    try {
      const res = await fetch("/api/vault/ai-write", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: aiWriterPrompt,
          documentTitle: docTitle || activeItem?.title,
          documentContent: docContent,
          projectId: selectedProjectId,
        }),
      })
      if (!res.ok) throw new Error("AI writer failed")
      const reader = res.body!.getReader()
      const decoder = new TextDecoder()
      let buf = ""
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buf += decoder.decode(value)
        const lines = buf.split("\n")
        buf = lines.pop() || ""
        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try {
              const parsed = JSON.parse(line.slice(6))
              if (parsed.type === "delta") {
                setAiWriterResponse((prev) => prev + parsed.content)
              }
            } catch { }
          }
        }
      }
      console.log("[Vault/AIWriter] ✓ Complete")
    } catch (err: any) {
      console.error("[Vault/AIWriter] Error:", err)
      toast.error("AI writer error")
    } finally {
      setAiWriterLoading(false)
    }
  }

  const insertAIResponse = () => {
    if (!aiWriterResponse) return
    setDocContent((prev) => prev + "\n\n" + aiWriterResponse)
    setAiWriterResponse("")
    setAiWriterPrompt("")
    toast.success("Inserted into document")
  }

  // ── Search overlay ─────────────────────────────────────────────────────────

  const handleSearchOverlayQuery = (q: string) => {
    setSearchOverlayQuery(q)
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current)
    if (!q.trim()) { setSearchResults([]); return }
    searchDebounceRef.current = setTimeout(async () => {
      console.log(`[Vault/Search] Querying: "${q}"`)
      setSearchLoading(true)
      try {
        const res = await fetch("/api/vault/search", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query: q, limit: 8, mode: "hybrid" }),
        })
        const json = await res.json()
        setSearchResults(json.results || [])
        console.log(`[Vault/Search] Found ${json.results?.length ?? 0} results`)
      } catch (err) {
        console.error("[Vault/Search] Error:", err)
      }
      setSearchLoading(false)
    }, 350)
  }

  const openSearchResult = (result: SearchResult) => {
    console.log(`[Vault/Search] Opening result: "${result.title}"`)
    setSearchOverlayOpen(false)
    setSearchOverlayQuery("")
    setSearchResults([])
    if (result.project_id) setSelectedProjectId(result.project_id)
    if (result.folder_id) {
      setSelectedFolderId(result.folder_id)
      loadItems(result.folder_id)
    }
    setTimeout(() => openItem(result), 100)
  }

  // ── Derived ────────────────────────────────────────────────────────────────

  const projectFolders = folders.filter(
    (f) => f.project_id === selectedProjectId &&
      f.folder_type !== "root" && f.folder_type !== "project"
  )
  const selectedFolder = folders.find((f) => f.id === selectedFolderId)
  const selectedProject = projects.find((p) => p.id === selectedProjectId)
  const filteredItems = items.filter((item) => {
    const matchType = filterType === "all" || item.item_type === filterType
    const matchSearch = !searchQuery ||
      item.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.description?.toLowerCase().includes(searchQuery.toLowerCase())
    return matchType && matchSearch
  })

  // Whether the Add to Vault button should be disabled
  const canSubmitAdd = (() => {
    if (uploading) return false
    if (isAiLabeling) return false
    if (addItemType === "file") return !!uploadFile
    if (addItemType === "link") return !!(addForm.title.trim() && addForm.link_url.trim())
    if (addItemType === "note") return !!addForm.title.trim()
    return false
  })()

  // ── Render ─────────────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <>
      <div className="flex h-[calc(100vh-4rem)] overflow-hidden rounded-2xl border border-border/50 bg-[#161614]">

        {/* ── Sidebar: Projects ── */}
        {projectsSidebarOpen && (
          <div className="w-52 shrink-0 border-r border-white/5 flex flex-col bg-[#1a1a18] overflow-hidden">
            <div className="px-3 py-3 border-b border-white/5 flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-widest text-white/30">Vault</span>
              <button onClick={() => setSearchOverlayOpen(true)} className="p-1 rounded hover:bg-white/5 text-white/30 hover:text-white/60 transition-colors" title="Search (⌘K)">
                <Search size={11} />
              </button>
            </div>

            {/* Drive status */}
            {driveConnected ? (
              <div className="mx-3 mt-3 px-2.5 py-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center gap-2">
                <Cloud size={9} className="text-emerald-400" />
                <span className="text-[9px] font-bold uppercase tracking-widest text-emerald-400">Drive Connected</span>
              </div>
            ) : isFounder ? (
              <div className="mx-3 mt-3 px-2.5 py-2 rounded-lg bg-amber-500/10 border border-amber-500/20 space-y-2">
                <div className="flex items-center gap-1.5">
                  <CloudOff size={9} className="text-amber-400" />
                  <span className="text-[9px] font-bold uppercase tracking-widest text-amber-400">Drive not connected</span>
                </div>
                <button
                  onClick={handleConnectDrive}
                  disabled={connectingDrive}
                  className="w-full flex items-center justify-center gap-1.5 py-1 bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30 rounded text-[10px] font-semibold text-amber-400 transition-colors"
                >
                  {connectingDrive ? <Loader2 size={10} className="animate-spin" /> : <Cloud size={10} />}
                  Connect Drive
                </button>
              </div>
            ) : null}

            {/* Project list */}
            <div className="flex-1 overflow-y-auto py-3 px-2 space-y-0.5">
              <div className="px-2 py-1 text-[9px] font-bold uppercase tracking-widest text-white/20">Projects</div>
              {projects.length === 0 ? (
                <p className="text-[11px] text-white/25 px-2 py-2">No projects yet</p>
              ) : (
                projects.map((project) => {
                  const hasVaultFolders = folders.some((f) => f.project_id === project.id)
                  return (
                    <button
                      key={project.id}
                      onClick={() => selectProject(project.id)}
                      className={cn(
                        "w-full text-left flex items-center gap-2 px-2.5 py-2 rounded-lg text-[12px] transition-all",
                        selectedProjectId === project.id
                          ? "bg-violet-500/15 text-violet-300 font-medium"
                          : "text-white/50 hover:bg-white/5 hover:text-white/80"
                      )}
                    >
                      <FolderOpen size={11} className="shrink-0 opacity-70" />
                      <span className="truncate flex-1">{project.name}</span>
                      {!hasVaultFolders && driveConnected && (
                        <span className="size-1.5 rounded-full bg-amber-400 shrink-0" />
                      )}
                    </button>
                  )
                })
              )}
            </div>
          </div>
        )}

        {/* ── Sidebar: Folders ── */}
        {foldersSidebarOpen && selectedProjectId && (
          <div className="w-48 shrink-0 border-r border-white/5 flex flex-col bg-[#161614] overflow-hidden">
            <div className="px-3 py-3 border-b border-white/5">
              <p className="text-[11px] font-semibold text-white/80 truncate">{selectedProject?.name}</p>
              <p className="text-[9px] text-white/25 mt-0.5 uppercase tracking-wider">Project folders</p>
            </div>
            <div className="flex-1 overflow-y-auto py-2 px-2 space-y-0.5">
              {projectFolders.length === 0 ? (
                <p className="text-[10px] text-white/20 px-2 py-3 text-center">No folders yet</p>
              ) : (
                projectFolders.map((folder) => {
                  const meta = FOLDER_META[folder.folder_type]
                  return (
                    <button
                      key={folder.id}
                      onClick={() => selectFolder(folder)}
                      className={cn(
                        "w-full text-left flex items-center gap-2 px-2.5 py-2 rounded-lg text-[12px] transition-all",
                        selectedFolderId === folder.id
                          ? "bg-violet-500/15 text-violet-300 font-medium"
                          : "text-white/50 hover:bg-white/5 hover:text-white/80"
                      )}
                    >
                      <span className={cn("shrink-0", selectedFolderId === folder.id ? "text-violet-300" : meta.color)}>{meta.icon}</span>
                      <span className="truncate flex-1">{folder.name}</span>
                      {meta.clientVisible && <Eye size={9} className="shrink-0 opacity-40" />}
                    </button>
                  )
                })
              )}
            </div>
            <div className="px-3 py-2.5 border-t border-white/5">
              <button className="flex items-center gap-1.5 text-[10px] text-white/25 hover:text-white/60 transition-colors w-full">
                <FolderPlus size={11} />New folder
              </button>
            </div>
          </div>
        )}

        {/* ── Main area ── */}
        <div className="flex-1 flex flex-col overflow-hidden min-w-0">

          {/* Topbar */}
          <div className="px-4 py-2.5 border-b border-white/5 flex items-center gap-3 bg-[#161614] flex-shrink-0">
            <div className="flex items-center gap-2 flex-shrink-0">
              <button onClick={() => setProjectsSidebarOpen((v) => !v)} className="p-1.5 rounded hover:bg-white/5 text-white/30 hover:text-white/60 transition-colors">
                <FolderOpen size={12} />
              </button>
              {selectedProjectId && (
                <button onClick={() => setFoldersSidebarOpen((v) => !v)} className="p-1.5 rounded hover:bg-white/5 text-white/30 hover:text-white/60 transition-colors">
                  <ChevronRight size={12} />
                </button>
              )}
            </div>

            {/* Breadcrumb */}
            <div className="flex items-center gap-2 text-[11px] text-white/30 flex-1 min-w-0">
              {selectedProject && <span className="truncate">{selectedProject.name}</span>}
              {selectedFolder && (
                <>
                  <ChevronRight size={10} className="opacity-50" />
                  <span className="font-semibold text-white/70 truncate">{selectedFolder.name}</span>
                </>
              )}
              {selectedFolder && FOLDER_META[selectedFolder.folder_type].clientVisible && (
                <Badge variant="outline" className="text-[8px] h-4 px-1.5 border-blue-500/30 text-blue-400 bg-blue-500/10 shrink-0">
                  <Eye size={7} className="mr-1" />Client visible
                </Badge>
              )}
              {activeItem && activeViewer && (
                <>
                  <ChevronRight size={10} className="opacity-50" />
                  <span className="text-white/60 truncate">{activeItem.title}</span>
                </>
              )}
            </div>

            <div className="flex items-center gap-2 flex-shrink-0">
              <button
                onClick={() => { setSearchOverlayOpen(true); setTimeout(() => searchInputRef.current?.focus(), 50) }}
                className="flex items-center gap-2 px-3 py-1.5 bg-white/5 hover:bg-white/8 border border-white/8 rounded-lg text-[11px] text-white/40 hover:text-white/70 transition-all"
              >
                <Search size={11} />
                <span>Search</span>
                <span className="text-[9px] border border-white/15 rounded px-1 py-0.5 font-mono">⌘K</span>
              </button>
              {selectedFolderId && (
                <button
                  onClick={() => setAddDialogOpen(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-violet-500 hover:bg-violet-600 rounded-lg text-[11px] font-semibold text-white transition-colors"
                >
                  <Plus size={11} />Add to Vault
                </button>
              )}
            </div>
          </div>

          {/* Content */}
          {!activeViewer ? (
            /* ── Cards view ── */
            <div className="flex-1 flex flex-col overflow-hidden">
              {selectedFolderId && items.length > 0 && (
                <div className="mx-4 mt-3 px-3 py-2.5 bg-violet-500/8 border border-violet-500/20 rounded-xl flex items-center gap-3 cursor-pointer hover:bg-violet-500/12 transition-colors flex-shrink-0">
                  <div className="w-7 h-7 bg-gradient-to-br from-violet-500 to-purple-600 rounded-lg flex items-center justify-center shrink-0">
                    <Sparkles size={12} className="text-white" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[10px] font-semibold text-violet-400">Kobin AI has context on this folder</div>
                    <div className="text-[10px] text-white/30 mt-0.5">
                      {items.filter(i => i.embedding_status === "embedded").length} items vectorised · pgvector indexed · Click any item to see related context
                    </div>
                  </div>
                  <Sparkles size={12} className="text-violet-500/40 shrink-0" />
                </div>
              )}

              {selectedFolderId && (
                <div className="px-4 py-2.5 flex items-center gap-3 border-b border-white/5 flex-shrink-0">
                  <div className="relative flex-1">
                    <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-white/25" />
                    <Input
                      placeholder="Filter items…"
                      className="pl-8 h-8 text-[11px] bg-white/4 border-white/8 text-white/70 placeholder:text-white/25 focus:border-violet-500/40"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                    />
                  </div>
                  <div className="flex items-center gap-0.5">
                    {(["all", "file", "link", "note"] as const).map((t) => (
                      <button
                        key={t}
                        onClick={() => setFilterType(t)}
                        className={cn(
                          "px-2.5 py-1.5 rounded-md text-[10px] font-semibold capitalize transition-all",
                          filterType === t ? "bg-white/10 text-white" : "text-white/30 hover:text-white/60 hover:bg-white/5"
                        )}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex-1 overflow-y-auto p-4">
                {!selectedProjectId ? (
                  <EmptyState icon={<FolderOpen size={28} className="text-white/15" />} title="Select a project" desc="Choose a project from the sidebar to browse its vault" />
                ) : !selectedFolderId ? (
                  <EmptyState icon={<FolderOpen size={28} className="text-white/15" />} title="Select a folder" desc="Choose a folder to see its contents" />
                ) : filteredItems.length === 0 ? (
                  <EmptyState
                    icon={<Plus size={24} className="text-white/15" />}
                    title="Empty folder"
                    desc="Add files, links, or notes to this folder"
                    action={
                      <button onClick={() => setAddDialogOpen(true)} className="mt-1 flex items-center gap-1.5 px-3 py-1.5 border border-white/10 rounded-lg text-[11px] text-white/40 hover:text-white/70 hover:border-white/20 transition-all">
                        <Plus size={11} />Add to Vault
                      </button>
                    }
                  />
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-3">
                    {filteredItems.map((item) => (
                      <VaultCard
                        key={item.id}
                        item={item}
                        active={activeItem?.id === item.id}
                        menuOpen={menuItemId === item.id}
                        onOpen={() => openItem(item)}
                        onMenuToggle={() => setMenuItemId(menuItemId === item.id ? null : item.id)}
                        onDelete={() => handleDeleteItem(item.id)}
                        onMenuClose={() => setMenuItemId(null)}
                      />
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : (
            /* ── Viewer ── (FIX 6: right panel is a proper side column) */
            <div className="flex-1 flex flex-col overflow-hidden">
              {/* Viewer header */}
              <div className="px-4 py-2.5 border-b border-white/5 flex items-center gap-3 bg-[#1a1a18] flex-shrink-0">
                <button
                  onClick={closeViewer}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 border border-white/10 rounded-lg text-[11px] text-white/40 hover:text-white/70 hover:border-white/20 transition-all"
                >
                  <ArrowLeft size={11} />Back
                </button>
                <div className="flex-1 min-w-0">
                  <p className="text-[12px] font-semibold text-white/80 truncate">{activeItem?.title}</p>
                  <p className="text-[10px] text-white/25">
                    {activeItem?.document_type} · {activeItem?.added_by_type} · {activeItem ? formatDate(activeItem.created_at) : ""}
                    {activeItem?.embedding_status === "embedded" && <span className="ml-2 text-violet-400/60">· vectorised</span>}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {activeViewer === "doc" && (
                    <>
                      <button
                        onClick={() => setAiWriterOpen((v) => !v)}
                        className={cn(
                          "flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-medium transition-all",
                          aiWriterOpen
                            ? "bg-violet-500/20 border border-violet-500/30 text-violet-300"
                            : "bg-white/5 border border-white/8 text-white/50 hover:text-white/80"
                        )}
                      >
                        <Sparkles size={11} />Kobin AI
                      </button>
                      <button
                        onClick={saveNote}
                        className="flex items-center gap-1.5 px-2.5 py-1.5 bg-white text-black hover:bg-white/90 rounded-lg text-[11px] font-semibold transition-all"
                      >
                        {isSaving ? <Loader2 size={11} className="animate-spin" /> : <Check size={11} />}
                        Save
                      </button>
                    </>
                  )}
                  {activeItem?.drive_file_url && (
                    <a href={activeItem.drive_file_url} target="_blank" rel="noopener noreferrer"
                      className="flex items-center gap-1.5 px-2.5 py-1.5 bg-white/5 border border-white/8 rounded-lg text-[11px] text-white/50 hover:text-white/80 transition-all"
                    >
                      <ExternalLink size={11} />Drive
                    </a>
                  )}
                  <button
                    onClick={() => setRightPanelOpen((v) => !v)}
                    className={cn(
                      "flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] transition-all border",
                      rightPanelOpen
                        ? "bg-white/10 border-white/15 text-white/70"
                        : "border-white/8 bg-white/5 text-white/40 hover:text-white/70"
                    )}
                  >
                    <Activity size={11} />Details
                  </button>
                </div>
              </div>

              {/* Viewer body + right panel side by side (FIX 6) */}
              <div className="flex-1 flex overflow-hidden">

                {/* ── Viewer content ── */}
                <div className="flex-1 flex flex-col overflow-hidden min-w-0">

                  {/* Doc (TipTap) — includes notes, .txt, .md, and text documents */}
                  {activeViewer === "doc" && (
                    <div className="flex-1 flex overflow-hidden">
                      <NoteEditor
                        title={docTitle}
                        content={docContent}
                        onTitleChange={setDocTitle}
                        onContentChange={setDocContent}
                        onSave={saveNote}
                        isSaving={isSaving}
                        projectName={selectedProject?.name}
                        createdAt={activeItem?.created_at}
                        className="flex-1"
                        onAIWrite={() => setAiWriterOpen(true)}
                      />
                      {aiWriterOpen && (
                        <AIWriterPanel
                          prompt={aiWriterPrompt}
                          setPrompt={setAiWriterPrompt}
                          response={aiWriterResponse}
                          loading={aiWriterLoading}
                          onRun={runAIWriter}
                          onInsert={insertAIResponse}
                          onDiscard={() => { setAiWriterResponse(""); setAiWriterPrompt("") }}
                          onClose={() => setAiWriterOpen(false)}
                        />
                      )}
                    </div>
                  )}

                  {/* Link viewer */}
                  {activeViewer === "link" && (
                    <div className="flex-1 flex flex-col items-center justify-center gap-4">
                      <div className="w-14 h-14 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl flex items-center justify-center">
                        <Link2 size={24} className="text-emerald-400" />
                      </div>
                      <div className="text-center">
                        <p className="text-[13px] font-semibold text-white/80 mb-1">{activeItem?.title}</p>
                        <p className="text-[11px] text-white/30">{activeItem?.link_url}</p>
                      </div>
                      {activeItem?.link_url && (
                        <a href={activeItem.link_url} target="_blank" rel="noopener noreferrer"
                          className="flex items-center gap-2 px-4 py-2 bg-white text-black rounded-lg text-[12px] font-semibold hover:bg-white/90 transition-colors"
                        >
                          <ExternalLink size={13} />Open link
                        </a>
                      )}
                    </div>
                  )}

                  {/* PDF */}
                  {activeViewer === "pdf" && (
                    <div className="flex-1 flex flex-col overflow-hidden">
                      {fileLoading ? (
                        <div className="flex-1 flex items-center justify-center">
                          <Loader2 size={20} className="animate-spin text-white/30" />
                        </div>
                      ) : signedUrl ? (
                        <iframe src={signedUrl} className="flex-1 border-0" title={activeItem?.title} />
                      ) : (
                        <div className="flex-1 flex flex-col items-center justify-center gap-4">
                          <FileText size={40} className="text-white/15" />
                          <p className="text-[12px] text-white/30">PDF preview unavailable</p>
                        </div>
                      )}
                      <DeliverableApprovalStrip item={activeItem!} folders={folders} approvalStatus={approvalStatus} onApprove={() => setApprovalStatus("approved")} onRequestChanges={() => setApprovalStatus("changes_requested")} onReset={() => setApprovalStatus("none")} />
                    </div>
                  )}

                  {/* Code — Monaco */}
                  {activeViewer === "code" && (
                    <div className="flex-1 flex flex-col overflow-hidden">
                      <CodeViewerComponent content={fileContent} filename={activeItem?.title || ""} fileUrl={signedUrl} readOnly className="flex-1" />
                      <DeliverableApprovalStrip item={activeItem!} folders={folders} approvalStatus={approvalStatus} onApprove={() => setApprovalStatus("approved")} onRequestChanges={() => setApprovalStatus("changes_requested")} onReset={() => setApprovalStatus("none")} />
                    </div>
                  )}

                  {/* DOCX — Mammoth */}
                  {activeViewer === "docx" && (
                    <div className="flex-1 flex flex-col overflow-hidden">
                      {fileLoading ? (
                        <div className="flex-1 flex items-center justify-center gap-2">
                          <Loader2 size={14} className="animate-spin text-white/30" />
                          <span className="text-[11px] text-white/30">Loading document…</span>
                        </div>
                      ) : (
                        <DocxViewerComponent fileUrl={signedUrl} filename={activeItem?.title || "document.docx"} className="flex-1" />
                      )}
                      <DeliverableApprovalStrip item={activeItem!} folders={folders} approvalStatus={approvalStatus} onApprove={() => setApprovalStatus("approved")} onRequestChanges={() => setApprovalStatus("changes_requested")} onReset={() => setApprovalStatus("none")} />
                    </div>
                  )}

                  {/* Spreadsheet — XLSX/CSV */}
                  {activeViewer === "spreadsheet" && (
                    <div className="flex-1 flex flex-col overflow-hidden">
                      {fileLoading ? (
                        <div className="flex-1 flex items-center justify-center gap-2">
                          <Loader2 size={14} className="animate-spin text-white/30" />
                          <span className="text-[11px] text-white/30">Loading spreadsheet…</span>
                        </div>
                      ) : (
                        <SpreadsheetViewerComponent fileUrl={signedUrl} filename={activeItem?.title || "spreadsheet.xlsx"} className="flex-1" />
                      )}
                      <DeliverableApprovalStrip item={activeItem!} folders={folders} approvalStatus={approvalStatus} onApprove={() => setApprovalStatus("approved")} onRequestChanges={() => setApprovalStatus("changes_requested")} onReset={() => setApprovalStatus("none")} />
                    </div>
                  )}

                  {/* Image */}
                  {activeViewer === "image" && (
                    <div className="flex-1 flex flex-col overflow-hidden">
                      <div className="flex-1 flex items-center justify-center p-8 bg-[#0d0d0c]">
                        {fileLoading ? (
                          <Loader2 size={20} className="animate-spin text-white/30" />
                        ) : signedUrl ? (
                          <img src={signedUrl} alt={activeItem?.title} className="max-w-full max-h-[560px] rounded-xl object-contain shadow-2xl" />
                        ) : (
                          <div className="w-24 h-24 rounded-2xl bg-white/5 border border-white/8 flex items-center justify-center">
                            <Image size={32} className="text-white/20" />
                          </div>
                        )}
                      </div>
                      <DeliverableApprovalStrip item={activeItem!} folders={folders} approvalStatus={approvalStatus} onApprove={() => setApprovalStatus("approved")} onRequestChanges={() => setApprovalStatus("changes_requested")} onReset={() => setApprovalStatus("none")} />
                    </div>
                  )}

                  {/* Generic file — no native preview */}
                  {activeViewer === "file" && activeItem && (
                    <div className="flex-1 flex flex-col overflow-hidden">
                      <div className="flex-1 flex flex-col items-center justify-center gap-6 p-8">
                        {(() => {
                          const tc = getTypeConfig(activeItem)
                          return (
                            <>
                              <div className={cn("w-20 h-20 rounded-2xl flex items-center justify-center border", tc.color.split(" ")[0], tc.color.split(" ")[2])}>
                                <span className={tc.color.split(" ")[1]}>{tc.icon}</span>
                              </div>
                              <div className="text-center">
                                <p className="text-[14px] font-semibold text-white/70">{activeItem.title}</p>
                                <p className="text-[11px] text-white/30 mt-1">{activeItem.document_type} · {formatDate(activeItem.created_at)}</p>
                              </div>
                              <div className="flex gap-3">
                                {signedUrl && (
                                  <a href={signedUrl} download className="flex items-center gap-2 px-4 py-2 bg-white text-black rounded-lg text-[12px] font-semibold hover:bg-white/90 transition-colors">
                                    <Download size={13} />Download
                                  </a>
                                )}
                                {activeItem.drive_file_url && (
                                  <a href={activeItem.drive_file_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 px-4 py-2 bg-white/5 border border-white/10 text-white/50 rounded-lg text-[12px] hover:bg-white/10 transition-colors">
                                    <ExternalLink size={13} />Open in Drive
                                  </a>
                                )}
                              </div>
                              <p className="text-[10px] text-white/20">No preview available for this file type</p>
                            </>
                          )
                        })()}
                      </div>
                      <DeliverableApprovalStrip item={activeItem} folders={folders} approvalStatus={approvalStatus} onApprove={() => setApprovalStatus("approved")} onRequestChanges={() => setApprovalStatus("changes_requested")} onReset={() => setApprovalStatus("none")} />
                    </div>
                  )}
                </div>

                {/* ── FIX 6: Right panel — proper side column ── */}
                {rightPanelOpen && activeItem && (
                  <RightPanel
                    item={activeItem}
                    tab={rightPanelTab}
                    onTabChange={setRightPanelTab}
                    onClose={() => setRightPanelOpen(false)}
                    relatedItems={relatedItems}
                    loadingRelated={loadingRelated}
                    approvalStatus={approvalStatus}
                    approvalNote={approvalNote}
                    signedUrl={signedUrl}
                    onSetNote={setApprovalNote}
                    onApprove={() => setApprovalStatus("approved")}
                    onRequestChanges={() => setApprovalStatus("changes_requested")}
                    onOpenRelated={(item) => openItem(item)}
                  />
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Search overlay ── */}
      {searchOverlayOpen && (
        <div
          className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-start justify-center pt-24"
          onClick={(e) => { if (e.target === e.currentTarget) setSearchOverlayOpen(false) }}
        >
          <div className="w-[560px] bg-[#1c1c1a] border border-white/10 rounded-2xl overflow-hidden shadow-2xl">
            <div className="flex items-center gap-3 px-4 py-3.5 border-b border-white/8">
              <Search size={14} className="text-white/30 shrink-0" />
              <input
                ref={searchInputRef}
                className="flex-1 bg-transparent text-[13px] text-white/80 outline-none placeholder:text-white/25"
                placeholder="Search or ask anything about your vault…"
                value={searchOverlayQuery}
                onChange={(e) => handleSearchOverlayQuery(e.target.value)}
              />
              <div className="flex items-center gap-1.5 px-2 py-1 bg-violet-500/15 border border-violet-500/25 rounded text-[9px] font-bold text-violet-400">
                <Sparkles size={8} />AI Search
              </div>
            </div>
            <div className="max-h-80 overflow-y-auto p-2">
              {searchLoading && (
                <div className="flex items-center justify-center py-6">
                  <Loader2 size={16} className="animate-spin text-white/30" />
                </div>
              )}
              {!searchLoading && searchResults.length === 0 && searchOverlayQuery && (
                <p className="text-[11px] text-white/25 text-center py-6">No results found</p>
              )}
              {!searchLoading && searchResults.length === 0 && !searchOverlayQuery && (
                <p className="text-[11px] text-white/20 text-center py-6">Start typing to search your vault semantically</p>
              )}
              {searchResults.map((result) => {
                const tc = getTypeConfig(result)
                return (
                  <button
                    key={result.id}
                    onClick={() => openSearchResult(result)}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-white/5 transition-colors text-left group"
                  >
                    <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center shrink-0", tc.color.split(" ")[0])}>
                      <span className={tc.color.split(" ")[1]}>{tc.icon}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[12px] font-medium text-white/80 truncate">{result.title}</p>
                      <p className="text-[10px] text-white/30 truncate">
                        {result.project_name && `${result.project_name} · `}
                        {result.description?.slice(0, 60)}
                      </p>
                    </div>
                    <div className="text-[9px] text-violet-400/60 shrink-0">
                      {(result.similarity * 100).toFixed(0)}%
                    </div>
                  </button>
                )
              })}
            </div>
            <div className="px-4 py-2.5 border-t border-white/5 flex items-center justify-between">
              <span className="text-[9px] text-white/20">Semantic search powered by pgvector</span>
              <div className="flex gap-3">
                {[["↵", "open"], ["Esc", "close"]].map(([key, label]) => (
                  <span key={key} className="text-[9px] text-white/20 flex items-center gap-1">
                    <span className="font-mono border border-white/15 rounded px-1">{key}</span>{label}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Add item dialog (FIX 3: no inputs when AI labeling is ON) ── */}
      <Dialog
        open={addDialogOpen}
        onOpenChange={(open) => { if (!open) { setAddDialogOpen(false); resetAddForm() } }}
      >
        <DialogContent className="max-w-lg bg-[#1c1c1a] border-white/10 text-white" aria-describedby="vault-add-description">
          <DialogHeader>
            <DialogTitle className="text-white/90">Add to Vault</DialogTitle>
            <p id="vault-add-description" className="text-[11px] text-white/35 mt-0.5">
              Add files, links, or notes to the selected folder
            </p>
          </DialogHeader>

          {!addItemType ? (
            <div className="space-y-3 py-2">
              <p className="text-[12px] text-white/40">What would you like to add?</p>
              <div className="grid grid-cols-3 gap-3">
                {([
                  { type: "file" as ItemType, label: "File Upload", icon: <Upload size={20} />, color: "text-blue-400" },
                  { type: "link" as ItemType, label: "Link",        icon: <Link2 size={20} />,  color: "text-emerald-400" },
                  { type: "note" as ItemType, label: "Note",        icon: <StickyNote size={20} />, color: "text-amber-400" },
                ]).map(({ type, label, icon, color }) => (
                  <button
                    key={type}
                    onClick={() => setAddItemType(type)}
                    className="flex flex-col items-center gap-2 p-4 rounded-xl border border-white/8 hover:border-violet-500/40 hover:bg-violet-500/5 transition-all group"
                  >
                    <span className={cn(color, "group-hover:scale-110 transition-transform")}>{icon}</span>
                    <span className="text-[11px] font-semibold text-white/40 group-hover:text-white/80">{label}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-4 py-2">
              <div className="flex items-center gap-2">
                <button onClick={() => setAddItemType(null)} className="text-white/30 hover:text-white/60">
                  <X size={13} />
                </button>
                <span className="text-[12px] font-semibold text-white/70 capitalize">
                  {addItemType === "file" ? "File Upload" : addItemType}
                </span>
              </div>

              <div className="space-y-3">

                {/* ── FILE type ── FIX 3: hide all inputs when AI label is ON ── */}
                {addItemType === "file" && (
                  <div className="space-y-3">
                    {/* File drop zone */}
                    <div>
                      <label className="text-[9px] font-bold uppercase tracking-widest text-white/30 mb-1.5 block">File *</label>
                      <div
                        onClick={() => fileInputRef.current?.click()}
                        className={cn(
                          "border-2 border-dashed rounded-xl p-4 text-center cursor-pointer transition-all",
                          uploadFile ? "border-violet-500/40 bg-violet-500/5" : "border-white/10 hover:border-violet-500/30 hover:bg-white/3"
                        )}
                      >
                        {uploadFile ? (
                          <div className="flex items-center justify-center gap-2 text-[12px]">
                            <FileText size={13} className="text-violet-400" />
                            <span className="text-white/60 truncate max-w-[180px]">{uploadFile.name}</span>
                            <button
                              onClick={(e) => { e.stopPropagation(); handleFileSelect(null) }}
                              className="text-white/30 hover:text-white/60 ml-1"
                            >
                              <X size={11} />
                            </button>
                          </div>
                        ) : (
                          <div className="space-y-1">
                            <Upload size={18} className="mx-auto text-white/15" />
                            <p className="text-[11px] text-white/25">Click to select · any format</p>
                          </div>
                        )}
                      </div>
                      <input
                        ref={fileInputRef}
                        type="file"
                        className="hidden"
                        onChange={(e) => handleFileSelect(e.target.files?.[0] || null)}
                      />
                    </div>

                    {/* AI label toggle */}
                    <div className="flex items-center justify-between px-1">
                      <div className="flex items-center gap-2">
                        <Sparkles size={11} className={aiLabelMode ? "text-violet-400" : "text-white/20"} />
                        <span className="text-[10px] text-white/40">AI auto-label</span>
                        {isAiLabeling && (
                          <div className="flex items-center gap-1.5">
                            <Loader2 size={10} className="animate-spin text-violet-400" />
                            <span className="text-[9px] text-violet-400/70">Analyzing…</span>
                          </div>
                        )}
                        {!isAiLabeling && uploadFile && aiLabelMode && addForm.title && (
                          <span className="text-[9px] text-emerald-400/70 flex items-center gap-1">
                            <Check size={8} />Labeled
                          </span>
                        )}
                      </div>
                      <button
                        onClick={() => setAiLabelMode(v => !v)}
                        className={cn("w-8 h-4 rounded-full transition-colors relative flex-shrink-0", aiLabelMode ? "bg-violet-500" : "bg-white/10")}
                      >
                        <span className={cn("absolute top-0.5 w-3 h-3 rounded-full bg-white transition-all", aiLabelMode ? "left-4" : "left-0.5")} />
                      </button>
                    </div>

                    {/*
                     * FIX 3: When AI labeling is ON, NO manual input fields are shown.
                     * The AI fills everything. User just picks file → clicks Upload.
                     * When AI labeling is OFF, show the full manual form.
                     */}
                    {!aiLabelMode && (
                      <>
                        <div>
                          <label className="text-[9px] font-bold uppercase tracking-widest text-white/30 mb-1.5 block">Title *</label>
                          <Input
                            placeholder="Enter a clear title…"
                            value={addForm.title}
                            onChange={(e) => setAddForm((f) => ({ ...f, title: e.target.value }))}
                            className="bg-white/5 border-white/8 text-white/80 placeholder:text-white/20 focus:border-violet-500/40 h-9 text-[12px]"
                          />
                        </div>
                        <div>
                          <label className="text-[9px] font-bold uppercase tracking-widest text-white/30 mb-1.5 block">Description *</label>
                          <textarea
                            placeholder="What is this? Add context…"
                            value={addForm.description}
                            onChange={(e) => setAddForm((f) => ({ ...f, description: e.target.value }))}
                            rows={2}
                            className="w-full rounded-lg border border-white/8 bg-white/5 px-3 py-2 text-[12px] text-white/80 placeholder:text-white/20 outline-none focus:border-violet-500/30 resize-none"
                          />
                        </div>
                        <div>
                          <label className="text-[9px] font-bold uppercase tracking-widest text-white/30 mb-1.5 block">Document Type</label>
                          <Select value={addForm.document_type} onValueChange={(v) => setAddForm((f) => ({ ...f, document_type: v }))}>
                            <SelectTrigger className="h-9 text-[12px] bg-white/5 border-white/8 text-white/70">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent className="bg-[#1c1c1a] border-white/10">
                              {DOCUMENT_TYPES.map((t) => (
                                <SelectItem key={t} value={t} className="text-white/70 text-[12px]">{t}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </>
                    )}

                    {/* When AI labeling ON + file picked + labeled — show labeled preview */}
                    {aiLabelMode && uploadFile && !isAiLabeling && addForm.title && (
                      <div className="px-3 py-2.5 bg-violet-500/8 border border-violet-500/20 rounded-lg">
                        <div className="flex items-center gap-1.5 mb-1.5">
                          <Sparkles size={9} className="text-violet-400" />
                          <span className="text-[9px] font-bold uppercase tracking-widest text-violet-400/70">AI generated metadata</span>
                        </div>
                        <p className="text-[11px] font-semibold text-white/70 truncate">{addForm.title}</p>
                        <p className="text-[10px] text-white/35 mt-0.5 line-clamp-2">{addForm.description}</p>
                        <div className="mt-1.5 flex items-center gap-1.5">
                          <span className="text-[9px] px-1.5 py-0.5 bg-white/8 rounded text-white/35">{addForm.document_type}</span>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* ── LINK type ── */}
                {addItemType === "link" && (
                  <>
                    <div>
                      <label className="text-[9px] font-bold uppercase tracking-widest text-white/30 mb-1.5 block">Title *</label>
                      <Input placeholder="Enter a clear title…" value={addForm.title} onChange={(e) => setAddForm((f) => ({ ...f, title: e.target.value }))} className="bg-white/5 border-white/8 text-white/80 placeholder:text-white/20 focus:border-violet-500/40 h-9 text-[12px]" />
                    </div>
                    <div>
                      <label className="text-[9px] font-bold uppercase tracking-widest text-white/30 mb-1.5 block">Description *</label>
                      <textarea placeholder="What is this link?" value={addForm.description} onChange={(e) => setAddForm((f) => ({ ...f, description: e.target.value }))} rows={2} className="w-full rounded-lg border border-white/8 bg-white/5 px-3 py-2 text-[12px] text-white/80 placeholder:text-white/20 outline-none focus:border-violet-500/30 resize-none" />
                    </div>
                    <div>
                      <label className="text-[9px] font-bold uppercase tracking-widest text-white/30 mb-1.5 block">URL *</label>
                      <Input placeholder="https://…" value={addForm.link_url} onChange={(e) => setAddForm((f) => ({ ...f, link_url: e.target.value }))} className="bg-white/5 border-white/8 text-white/80 placeholder:text-white/20 focus:border-violet-500/40 h-9 text-[12px]" />
                    </div>
                  </>
                )}

                {/* ── NOTE type ── */}
                {addItemType === "note" && (
                  <>
                    <div>
                      <label className="text-[9px] font-bold uppercase tracking-widest text-white/30 mb-1.5 block">Title *</label>
                      <Input placeholder="Note title…" value={addForm.title} onChange={(e) => setAddForm((f) => ({ ...f, title: e.target.value }))} className="bg-white/5 border-white/8 text-white/80 placeholder:text-white/20 focus:border-violet-500/40 h-9 text-[12px]" />
                    </div>
                    <div>
                      <label className="text-[9px] font-bold uppercase tracking-widest text-white/30 mb-1.5 block">Description *</label>
                      <Input placeholder="One sentence summary…" value={addForm.description} onChange={(e) => setAddForm((f) => ({ ...f, description: e.target.value }))} className="bg-white/5 border-white/8 text-white/80 placeholder:text-white/20 focus:border-violet-500/40 h-9 text-[12px]" />
                    </div>
                    <div>
                      <label className="text-[9px] font-bold uppercase tracking-widest text-white/30 mb-1.5 block">Content</label>
                      <textarea
                        placeholder="Write your note…"
                        value={addForm.note_content}
                        onChange={(e) => setAddForm((f) => ({ ...f, note_content: e.target.value }))}
                        rows={5}
                        className="w-full rounded-lg border border-white/8 bg-white/5 px-3 py-2 text-[12px] text-white/80 placeholder:text-white/20 outline-none focus:border-violet-500/40 resize-none"
                      />
                    </div>
                  </>
                )}
              </div>

              <div className="flex justify-between items-center pt-1">
                <p className="text-[9px] text-white/20">Auto-vectorised · indexed by Kobin AI</p>
                <div className="flex gap-2">
                  <Button
                    variant="outline" size="sm"
                    onClick={() => { setAddDialogOpen(false); resetAddForm() }}
                    className="border-white/10 text-white/50 hover:text-white/80 bg-transparent text-[11px]"
                  >
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    onClick={handleAddItem}
                    disabled={!canSubmitAdd}
                    className="bg-violet-500 hover:bg-violet-600 text-white text-[11px] disabled:opacity-50"
                  >
                    {uploading ? <Loader2 size={12} className="animate-spin mr-1" /> : null}
                    {isAiLabeling ? "Analyzing…" : "Add to Vault"}
                  </Button>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}

// ═════════════════════════════════════════════════════════════════════════════
// SUB-COMPONENTS
// ═════════════════════════════════════════════════════════════════════════════

function EmptyState({ icon, title, desc, action }: {
  icon: React.ReactNode; title: string; desc: string; action?: React.ReactNode
}) {
  return (
    <div className="flex flex-col items-center justify-center h-48 gap-3 text-center">
      <div className="w-14 h-14 rounded-2xl bg-white/3 border border-white/5 flex items-center justify-center">{icon}</div>
      <div>
        <p className="text-[13px] font-medium text-white/40">{title}</p>
        <p className="text-[11px] text-white/20 mt-0.5">{desc}</p>
      </div>
      {action}
    </div>
  )
}

// ── VaultCard ─────────────────────────────────────────────────────────────────

function VaultCard({
  item, active, menuOpen, onOpen, onMenuToggle, onDelete, onMenuClose,
}: {
  item: VaultItem; active: boolean; menuOpen: boolean
  onOpen: () => void; onMenuToggle: () => void; onDelete: () => void; onMenuClose: () => void
}) {
  const menuRef = useRef<HTMLDivElement>(null)
  const tc = getTypeConfig(item)

  useEffect(() => {
    if (!menuOpen) return
    const handler = (e: MouseEvent) => { if (!menuRef.current?.contains(e.target as Node)) onMenuClose() }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [menuOpen])

  const accentGradient =
    item.item_type === "file" ? "bg-gradient-to-r from-blue-500 to-cyan-500" :
    item.item_type === "link" ? "bg-gradient-to-r from-violet-500 to-purple-500" :
    "bg-gradient-to-r from-amber-500 to-orange-500"

  return (
    <div
      onClick={onOpen}
      className={cn(
        "group relative bg-[#1c1c1a] border rounded-xl p-3.5 cursor-pointer transition-all hover:-translate-y-0.5",
        active
          ? "border-violet-500/40 bg-violet-500/5 shadow-lg shadow-violet-500/10"
          : "border-white/6 hover:border-white/12 hover:bg-[#202020]"
      )}
    >
      <div className={cn("absolute top-0 left-0 right-0 h-0.5 rounded-t-xl opacity-0 transition-opacity group-hover:opacity-100", active && "opacity-100", accentGradient)} />

      <div className="flex items-start justify-between mb-2.5">
        <div className={cn("flex items-center gap-1.5 px-2 py-1 rounded-md border text-[9px] font-bold uppercase tracking-wider", tc.color)}>
          {tc.icon}
          <span>{tc.badge}</span>
        </div>
        <div className="flex items-center gap-1">
          {item.embedding_status === "embedded" && (
            <div title="Vectorised" className="w-1.5 h-1.5 rounded-full bg-violet-500/50" />
          )}
          <div className="relative" ref={menuRef}>
            <button
              onClick={(e) => { e.stopPropagation(); onMenuToggle() }}
              className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-white/8"
            >
              <MoreHorizontal size={12} className="text-white/40" />
            </button>
            {menuOpen && (
              <div className="absolute right-0 top-6 w-36 bg-[#252523] border border-white/10 rounded-xl shadow-xl overflow-hidden z-20">
                {item.drive_file_url && (
                  <a href={item.drive_file_url} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="flex items-center gap-2 px-3 py-2 text-[11px] text-white/60 hover:bg-white/5 transition-colors">
                    <ExternalLink size={11} />Open in Drive
                  </a>
                )}
                {item.link_url && (
                  <a href={item.link_url} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="flex items-center gap-2 px-3 py-2 text-[11px] text-white/60 hover:bg-white/5 transition-colors">
                    <ExternalLink size={11} />Open link
                  </a>
                )}
                <button onClick={(e) => { e.stopPropagation(); onDelete() }} className="flex items-center gap-2 px-3 py-2 text-[11px] text-red-400 hover:bg-red-500/10 transition-colors w-full text-left">
                  <Trash2 size={11} />Delete
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      <h4 className="text-[12px] font-semibold text-white/80 leading-snug line-clamp-1 mb-1">{item.title}</h4>
      <p className="text-[10px] text-white/30 line-clamp-2 leading-relaxed mb-3">{item.description}</p>

      {item.item_type === "link" && item.link_url && (
        <div className="flex items-center gap-1.5 mb-2.5 text-[10px] text-violet-400/70">
          <ExternalLink size={9} />
          <span className="truncate">{item.link_url}</span>
        </div>
      )}

      <div className="flex items-center justify-between pt-2 border-t border-white/5">
        <span className={cn("text-[9px] font-semibold px-1.5 py-0.5 rounded capitalize", ADDED_BY_COLOR[item.added_by_type])}>
          {item.added_by_type}
        </span>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-[8px] h-4 px-1 border-white/8 text-white/25">{item.document_type}</Badge>
          <span className="text-[9px] text-white/20">{formatDate(item.created_at)}</span>
        </div>
      </div>
    </div>
  )
}

// ── Deliverable approval strip (only renders for deliverables folder) ──────────

function DeliverableApprovalStrip({
  item, folders, approvalStatus, onApprove, onRequestChanges, onReset,
}: {
  item: VaultItem
  folders: VaultFolder[]
  approvalStatus: ApprovalStatus
  onApprove: () => void
  onRequestChanges: () => void
  onReset: () => void
}) {
  const folder = folders.find(f => f.id === item?.folder_id)
  if (!item || folder?.folder_type !== "deliverables") return null

  return (
    <div className="flex-shrink-0 border-t border-white/5 px-4 py-3 bg-[#1a1a18] flex items-center justify-between gap-4">
      <div className="flex items-center gap-2">
        {approvalStatus === "none" && <Clock size={13} className="text-amber-400" />}
        {approvalStatus === "approved" && <Check size={13} className="text-emerald-400" />}
        {approvalStatus === "changes_requested" && <AlertCircle size={13} className="text-red-400" />}
        <span className={cn("text-[11px] font-semibold",
          approvalStatus === "none" ? "text-white/40" :
          approvalStatus === "approved" ? "text-emerald-400" : "text-red-400"
        )}>
          {approvalStatus === "none" ? "Awaiting approval" : approvalStatus === "approved" ? "Approved" : "Changes requested"}
        </span>
        {approvalStatus !== "none" && (
          <button onClick={onReset} className="text-[9px] text-white/20 hover:text-white/40 transition-colors ml-2">Reset</button>
        )}
      </div>
      {approvalStatus === "none" && (
        <div className="flex gap-2">
          <button onClick={onRequestChanges} className="flex items-center gap-1.5 px-3 py-1.5 border border-red-500/25 text-red-400 rounded-lg text-[11px] font-semibold hover:bg-red-500/10 transition-colors">
            <AlertCircle size={11} />Request Changes
          </button>
          <button onClick={onApprove} className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500/10 border border-emerald-500/25 text-emerald-400 rounded-lg text-[11px] font-semibold hover:bg-emerald-500/20 transition-colors">
            <Check size={11} />Mark Approved
          </button>
        </div>
      )}
    </div>
  )
}

// ── AI Writer Panel ──────────────────────────────────────────────────────────

function AIWriterPanel({
  prompt, setPrompt, response, loading, onRun, onInsert, onDiscard, onClose,
}: {
  prompt: string; setPrompt: (v: string) => void; response: string; loading: boolean
  onRun: () => void; onInsert: () => void; onDiscard: () => void; onClose: () => void
}) {
  return (
    <div className="w-64 border-l border-white/5 flex flex-col bg-[#1a1a18]">
      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-white/5">
        <div className="w-5 h-5 bg-gradient-to-br from-violet-500 to-purple-600 rounded flex items-center justify-center">
          <Sparkles size={9} className="text-white" />
        </div>
        <span className="flex-1 text-[11px] font-semibold text-white/70">Kobin AI Writer</span>
        <button onClick={onClose} className="text-white/25 hover:text-white/60"><X size={11} /></button>
      </div>
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {!response && (
          <>
            <p className="text-[9px] font-bold uppercase tracking-widest text-white/25">Suggestions</p>
            {["Expand timeline with linked tasks", "Draft client-facing summary", "Convert todos into action items"].map((s) => (
              <button key={s} onClick={() => setPrompt(s)} className="flex items-start gap-2 w-full text-left p-2 bg-white/3 border border-white/5 rounded-lg hover:border-violet-500/30 transition-all">
                <Sparkles size={8} className="text-violet-400 mt-1 shrink-0" />
                <span className="text-[10px] text-white/50">{s}</span>
              </button>
            ))}
          </>
        )}
        {response && (
          <>
            <div className="p-2.5 bg-white/3 border border-white/8 rounded-lg text-[10px] text-white/60 leading-relaxed whitespace-pre-wrap">{response}</div>
            <div className="flex gap-2">
              <button onClick={onInsert} className="flex-1 py-1.5 bg-violet-500/15 border border-violet-500/30 rounded text-[10px] font-semibold text-violet-400 hover:bg-violet-500/25 transition-colors">Insert</button>
              <button onClick={onDiscard} className="flex-1 py-1.5 bg-white/5 border border-white/8 rounded text-[10px] text-white/40 hover:bg-white/10 transition-colors">Discard</button>
            </div>
          </>
        )}
        {loading && (
          <div className="flex items-center gap-2 py-2">
            <Loader2 size={12} className="animate-spin text-violet-400" />
            <span className="text-[10px] text-white/30">Writing…</span>
          </div>
        )}
      </div>
      <div className="p-3 border-t border-white/5">
        <div className="flex gap-2">
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); onRun() } }}
            placeholder="Ask AI to write, edit, summarise…"
            rows={2}
            className="flex-1 bg-white/5 border border-white/8 rounded-lg px-2.5 py-2 text-[11px] text-white/70 placeholder:text-white/20 outline-none focus:border-violet-500/30 resize-none"
          />
          <button onClick={onRun} disabled={loading} className="w-8 h-8 bg-violet-500 hover:bg-violet-600 rounded-lg flex items-center justify-center self-end transition-colors disabled:opacity-50">
            <Send size={11} className="text-white" />
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Comments panel ────────────────────────────────────────────────────────────

function CommentsPanel({ itemId }: { itemId: string }) {
  const supabase = createClient()
  const [comments, setComments] = useState<Array<{ id: string; content: string; user_name: string; created_at: string }>>([])
  const [newComment, setNewComment] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [userId, setUserId] = useState<string | null>(null)
  const [userName, setUserName] = useState("You")

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) {
        setUserId(data.user.id)
        supabase.from("profiles").select("full_name").eq("id", data.user.id).single()
          .then(({ data: p }) => { if (p?.full_name) setUserName(p.full_name) })
      }
    })
    loadComments()
  }, [itemId])

  const loadComments = async () => {
    console.log(`[Vault/Comments] Loading comments for item=${itemId}`)
    const { data, error } = await supabase
      .from("vault_comments")
      .select("id, content, created_at, profile:profiles!vault_comments_user_id_fkey(full_name)")
      .eq("vault_item_id", itemId)
      .order("created_at", { ascending: true })
    if (error) {
      console.error("[Vault/Comments] Load error:", error)
      return
    }
    setComments((data || []).map((c: any) => ({
      id: c.id,
      content: c.content,
      user_name: c.profile?.full_name || "Team",
      created_at: c.created_at,
    })))
  }

  const handleSubmit = async () => {
    if (!newComment.trim() || !userId) return
    console.log(`[Vault/Comments] Submitting comment for item=${itemId}`)
    setSubmitting(true)
    const { data, error } = await supabase.from("vault_comments").insert({
      vault_item_id: itemId,
      user_id: userId,
      content: newComment.trim(),
    }).select("id, content, created_at").single()
    if (error) {
      console.error("[Vault/Comments] Insert error:", error)
    } else if (data) {
      setComments(prev => [...prev, { id: data.id, content: data.content, user_name: userName, created_at: data.created_at }])
      setNewComment("")
    }
    setSubmitting(false)
  }

  const initials = (name: string) => name.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase()

  return (
    <div className="flex flex-col gap-3 h-full">
      <div className="flex-1 space-y-3 overflow-y-auto">
        {comments.length === 0 && (
          <p className="text-[10px] text-white/20 text-center py-4">No comments yet</p>
        )}
        {comments.map((c) => (
          <div key={c.id} className="flex gap-2.5">
            <div className="w-6 h-6 rounded-full bg-violet-500/80 flex items-center justify-center text-[8px] font-bold text-white shrink-0">
              {initials(c.user_name)}
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[11px] font-semibold text-white/70">{c.user_name}</span>
                <span className="text-[9px] text-white/20">{formatDate(c.created_at)}</span>
              </div>
              <p className="text-[11px] text-white/50 leading-relaxed">{c.content}</p>
            </div>
          </div>
        ))}
      </div>
      <div className="border-t border-white/5 pt-3 flex gap-2">
        <textarea
          value={newComment}
          onChange={e => setNewComment(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSubmit() } }}
          placeholder="Add a comment…"
          rows={2}
          className="flex-1 bg-white/5 border border-white/8 rounded-lg px-2.5 py-2 text-[11px] text-white/70 placeholder:text-white/20 outline-none focus:border-violet-500/30 resize-none"
        />
        <button
          onClick={handleSubmit}
          disabled={submitting || !newComment.trim()}
          className="w-8 h-8 bg-violet-500 hover:bg-violet-600 rounded-lg flex items-center justify-center self-end transition-colors disabled:opacity-40"
        >
          <Send size={11} className="text-white" />
        </button>
      </div>
    </div>
  )
}

// ── Right Panel ───────────────────────────────────────────────────────────────

function RightPanel({
  item, tab, onTabChange, onClose, relatedItems, loadingRelated,
  approvalStatus, approvalNote, signedUrl, onSetNote, onApprove, onRequestChanges, onOpenRelated,
}: {
  item: VaultItem; tab: RightPanelTab; onTabChange: (t: RightPanelTab) => void; onClose: () => void
  relatedItems: RelatedItem[]; loadingRelated: boolean
  approvalStatus: ApprovalStatus; approvalNote: string; signedUrl: string | null
  onSetNote: (v: string) => void; onApprove: () => void; onRequestChanges: () => void
  onOpenRelated: (item: VaultItem) => void
}) {
  const TABS: { key: RightPanelTab; label: string }[] = [
    { key: "context",  label: "Context" },
    { key: "approval", label: "Approval" },
    { key: "comments", label: "Comments" },
    { key: "activity", label: "Activity" },
  ]

  return (
    <div className="w-72 shrink-0 border-l border-white/5 flex flex-col bg-[#161614] overflow-hidden">
      {/* Header */}
      <div className="px-3 py-2.5 border-b border-white/5 flex items-center gap-2">
        <button onClick={onClose} className="w-6 h-6 flex items-center justify-center rounded hover:bg-white/5 text-white/25 hover:text-white/60 transition-colors">
          <X size={11} />
        </button>
        <p className="flex-1 text-[11px] font-semibold text-white/70 truncate min-w-0">{item.title}</p>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-white/5">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => onTabChange(t.key)}
            className={cn(
              "flex-1 px-2 py-2.5 text-[10px] font-semibold transition-all border-b-2 -mb-px",
              tab === t.key ? "text-violet-400 border-violet-500" : "text-white/25 border-transparent hover:text-white/50"
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-3 space-y-4">

        {tab === "context" && (
          <>
            <div className="flex items-center gap-2 px-2.5 py-2 bg-violet-500/8 border border-violet-500/15 rounded-lg">
              <Sparkles size={9} className="text-violet-400 shrink-0" />
              <span className="text-[10px] text-white/40">
                {item.embedding_status === "embedded"
                  ? <><span className="text-violet-400 font-semibold">Vectorised</span> · pgvector indexed</>
                  : item.embedding_status === "pending" ? "Embedding in progress…"
                  : "Not yet vectorised"}
              </span>
            </div>

            <div>
              <p className="text-[9px] font-bold uppercase tracking-widest text-white/20 mb-2">AI Memory — Related</p>
              {loadingRelated && (
                <div className="flex items-center gap-2 py-2">
                  <Loader2 size={11} className="animate-spin text-violet-400/50" />
                  <span className="text-[10px] text-white/25">Searching vault…</span>
                </div>
              )}
              {!loadingRelated && relatedItems.length === 0 && (
                <p className="text-[10px] text-white/20">No related items found yet.</p>
              )}
              {relatedItems.map((rel) => {
                const tc = TYPE_CONFIG[rel.item.item_type as ItemType]
                return (
                  <button
                    key={rel.item.id}
                    onClick={() => onOpenRelated(rel.item)}
                    className="w-full flex items-center gap-2.5 p-2 bg-white/3 border border-white/5 rounded-lg hover:border-violet-500/25 transition-all mb-2 text-left"
                  >
                    <div className={cn("w-7 h-7 rounded-lg flex items-center justify-center shrink-0", tc.color.split(" ")[0])}>
                      <span className={tc.color.split(" ")[1]}>{tc.icon}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[11px] font-medium text-white/70 truncate">{rel.item.title}</p>
                      <p className="text-[9px] text-white/25 truncate">{rel.reason}</p>
                    </div>
                  </button>
                )
              })}
            </div>

            <div>
              <p className="text-[9px] font-bold uppercase tracking-widest text-white/20 mb-2">Quick Actions</p>
              {[
                { icon: <MessageSquare size={11} />, label: "Draft follow-up email" },
                { icon: <Check size={11} />, label: "Create delivery task" },
                { icon: <Search size={11} />, label: "Find similar across projects" },
              ].map((action) => (
                <button key={action.label} className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-[11px] text-white/40 hover:text-white/70 hover:bg-white/5 transition-all mb-1 text-left">
                  <span className="text-white/25">{action.icon}</span>
                  {action.label}
                </button>
              ))}
            </div>
          </>
        )}

        {tab === "approval" && (
          <div className="space-y-4">
            {/* Approval status */}
            <div className="p-3 bg-white/3 border border-white/8 rounded-xl space-y-3">
              <div className="flex items-center gap-2 text-[11px] font-semibold text-white/70">
                <Clock size={13} className="text-amber-400" />Deliverable Approval
              </div>
              {approvalStatus === "none" && (
                <div className="flex items-center gap-3 p-2.5 bg-amber-500/8 border border-amber-500/20 rounded-lg">
                  <Clock size={13} className="text-amber-400 shrink-0" />
                  <span className="text-[11px] text-white/50">Awaiting approval</span>
                </div>
              )}
              {approvalStatus === "approved" && (
                <div className="flex items-center gap-2 p-2.5 bg-emerald-500/10 border border-emerald-500/25 rounded-lg">
                  <Check size={13} className="text-emerald-400" />
                  <span className="text-[11px] text-emerald-400 font-semibold">Approved</span>
                </div>
              )}
              {approvalStatus === "changes_requested" && (
                <div className="flex items-center gap-2 p-2.5 bg-red-500/10 border border-red-500/20 rounded-lg">
                  <AlertCircle size={13} className="text-red-400" />
                  <span className="text-[11px] text-red-400">Changes requested</span>
                </div>
              )}
              {approvalStatus === "none" && (
                <div className="flex gap-2">
                  <button onClick={onApprove} className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-emerald-500/10 border border-emerald-500/25 rounded-lg text-[11px] font-semibold text-emerald-400 hover:bg-emerald-500/20 transition-colors">
                    <Check size={12} />Approve
                  </button>
                  <button onClick={onRequestChanges} className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-red-500/8 border border-red-500/20 rounded-lg text-[11px] font-semibold text-red-400 hover:bg-red-500/15 transition-colors">
                    <AlertCircle size={12} />Changes
                  </button>
                </div>
              )}
              <textarea
                value={approvalNote}
                onChange={(e) => onSetNote(e.target.value)}
                placeholder="Add a note for the client (optional)…"
                rows={2}
                className="w-full bg-white/4 border border-white/8 rounded-lg px-3 py-2 text-[11px] text-white/60 placeholder:text-white/20 outline-none focus:border-violet-500/30 resize-none"
              />
            </div>

            {/* File preview in approval tab */}
            {signedUrl && (
              <div className="w-full rounded-xl overflow-hidden border border-white/8 bg-white/3" style={{ height: 240 }}>
                <iframe src={signedUrl} className="w-full h-full border-0" title={item.title} allow="autoplay" />
              </div>
            )}
          </div>
        )}

        {tab === "comments" && <CommentsPanel itemId={item.id} />}

        {tab === "activity" && (
          <div className="space-y-3">
            {[
              { dot: "bg-violet-500", text: "Item added to vault", time: formatDate(item.created_at) },
              {
                dot: item.embedding_status === "embedded" ? "bg-emerald-500" : "bg-white/20",
                text: item.embedding_status === "embedded" ? "Vectorised by Kobin AI" : "Awaiting vectorisation",
                time: formatDate(item.created_at),
              },
            ].map((a, i) => (
              <div key={i} className="flex gap-3">
                <div className={cn("w-1.5 h-1.5 rounded-full mt-1.5 shrink-0", a.dot)} />
                <div>
                  <p className="text-[11px] text-white/50">{a.text}</p>
                  <p className="text-[9px] text-white/20">{a.time}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}