"use client"

import {
  useEffect,
  useState,
  useRef,
  useCallback,
  useMemo,
  KeyboardEvent,
} from "react"
import { createClient } from "@/lib/supabase/client"
import { format, isToday, isYesterday, formatDistanceToNow } from "date-fns"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import {
  Hash,
  MessageSquare,
  Plus,
  Send,
  Paperclip,
  X,
  ChevronDown,
  Search,
  Users,
  FolderOpen,
  File,
  FileText,
  FileImage,
  Download,
  Reply,
  Trash2,
  MoreHorizontal,
  Circle,
  Calendar as CalendarIcon,
} from "lucide-react"

// ─── Types ────────────────────────────────────────────────────────────────────

interface Profile {
  id: string
  full_name: string
  email?: string
  user_type?: string
}

interface ChatRoom {
  id: string
  name: string | null
  type: "direct" | "group" | "project"
  project_id: string | null
  founder_id: string
  created_by: string
  created_at: string
  dm_key: string | null
  // Derived
  display_name: string
  unread_count: number
  last_message?: string
  last_message_at?: string
  other_user?: Profile  // for DMs
}

interface ChatMessage {
  id: string
  room_id: string
  sender_id: string
  content: string | null
  file_url: string | null
  file_name: string | null
  file_type: string | null
  file_size: number | null
  reply_to_id: string | null
  edited_at: string | null
  created_at: string
  message_type?: string | null
  invite_id?: string | null
  // Joined
  sender?: Profile
  reply_to?: ChatMessage | null
}

interface FileAttachment {
  file: File
  preview?: string
  uploading: boolean
  url?: string
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatMessageDate(dateStr: string): string {
  const d = new Date(dateStr)
  if (isToday(d)) return format(d, "h:mm a")
  if (isYesterday(d)) return `Yesterday ${format(d, "h:mm a")}`
  return format(d, "MMM d, h:mm a")
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function getFileIcon(mimeType: string | null) {
  if (!mimeType) return File
  if (mimeType.startsWith("image/")) return FileImage
  if (mimeType.includes("pdf") || mimeType.includes("document")) return FileText
  return File
}

function avatarInitials(name: string): string {
  const parts = name.trim().split(" ")
  return parts.length >= 2
    ? `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase()
    : parts[0][0].toUpperCase()
}

const AVATAR_COLORS = [
  "bg-blue-500", "bg-emerald-500", "bg-violet-500",
  "bg-rose-500", "bg-amber-500", "bg-cyan-500",
]

function avatarColor(userId: string): string {
  let hash = 0
  for (let i = 0; i < userId.length; i++) hash = userId.charCodeAt(i) + ((hash << 5) - hash)
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length]
}

// ─── Avatar ───────────────────────────────────────────────────────────────────

function Avatar({ user, size = "sm" }: { user: Profile; size?: "sm" | "md" }) {
  const sz = size === "sm" ? "w-7 h-7 text-[10px]" : "w-9 h-9 text-xs"
  return (
    <div className={cn("rounded-full flex items-center justify-center font-bold text-white flex-shrink-0", avatarColor(user.id), sz)}>
      {avatarInitials(user.full_name || "?")}
    </div>
  )
}


// ─── Image Lightbox ───────────────────────────────────────────────────────────

function ImageLightbox({
  src,
  name,
  onClose,
}: {
  src: string
  name: string
  onClose: () => void
}) {
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    window.addEventListener("keydown", handleKey as any)
    return () => window.removeEventListener("keydown", handleKey as any)
  }, [onClose])

  const handleDownload = async () => {
    const response = await fetch(src)
    const blob = await response.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = name
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black/90 flex flex-col items-center justify-center"
      onClick={onClose}
    >
      {/* Top bar */}
      <div
        className="absolute top-0 left-0 right-0 flex items-center justify-between px-4 py-3 bg-black/50"
        onClick={(e) => e.stopPropagation()}
      >
        <span className="text-sm text-white/80 truncate max-w-xs">{name}</span>
        <div className="flex items-center gap-2">
          <button
            onClick={handleDownload}
            className="flex items-center gap-2 px-3 py-1.5 bg-white/10 hover:bg-white/20 rounded-lg text-white text-sm transition-colors"
          >
            <Download className="h-4 w-4" />
            Save
          </button>
          <button
            onClick={onClose}
            className="p-1.5 bg-white/10 hover:bg-white/20 rounded-lg text-white transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Image */}
      <img
        src={src}
        alt={name}
        className="max-w-[90vw] max-h-[85vh] object-contain rounded-lg"
        onClick={(e) => e.stopPropagation()}
      />
    </div>
  )
}

// -- Forward Dialogue ----------------------------------
function ForwardDialog({
  open,
  onOpenChange,
  rooms,
  onForward,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  rooms: ChatRoom[]
  onForward: (roomId: string) => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Forward message</DialogTitle>
        </DialogHeader>
        <div className="space-y-1 max-h-64 overflow-y-auto">
          {rooms.map((r) => (
            <button
              key={r.id}
              onClick={() => { onForward(r.id); onOpenChange(false) }}
              className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-muted transition-colors text-left"
            >
              {r.type === "direct" && r.other_user ? (
                <Avatar user={r.other_user} size="sm" />
              ) : (
                <div className="w-7 h-7 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
                  {r.type === "project" ? <FolderOpen className="h-3.5 w-3.5 text-emerald-500" /> : <Hash className="h-3.5 w-3.5" />}
                </div>
              )}
              <span className="text-sm font-medium">{r.display_name}</span>
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ─── Event Invite Card ────────────────────────────────────────────────────────

function EventInviteCard({
  message,
  currentUserId,
}: {
  message: ChatMessage
  currentUserId: string
}) {
  const supabase = useMemo(() => createClient(), [])
  const [status, setStatus] = useState<"pending" | "accepted" | "declined" | "loading">("loading")
  const [loading, setLoading] = useState(false)

  let data: any = {}
  try {
    data = JSON.parse(message.content || "{}")
  } catch {
    return null
  }

  const isInvitee = message.sender_id !== currentUserId

  // Load actual status from DB on mount
  useEffect(() => {
    if (!data.invite_id) { setStatus("pending"); return }
    const load = async () => {
      const { data: invite } = await supabase
        .from("event_invites")
        .select("status")
        .eq("id", data.invite_id)
        .single()
      setStatus((invite?.status as any) || "pending")
    }
    load()
  }, [data.invite_id])

  const respond = async (response: "accepted" | "declined") => {
    setLoading(true)
    try {
      const res = await fetch("/api/event-invites/respond", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invite_id: data.invite_id, response }),
      })
      if (res.ok) {
        setStatus(response)
        toast.success(
          response === "accepted"
            ? "Meeting added to your calendar!"
            : "Invite declined"
        )
      } else {
        const err = await res.json()
        toast.error(err.error || "Failed to respond")
      }
    } catch {
      toast.error("Failed to respond")
    }
    setLoading(false)
  }

  if (status === "loading") {
    return (
      <div className="max-w-sm rounded-xl border border-border bg-card shadow-sm overflow-hidden">
        <div className="bg-primary/5 border-b border-border px-4 py-2 flex items-center gap-2">
          <CalendarIcon size={14} className="text-primary" />
          <span className="text-xs font-semibold text-primary">Meeting Invite</span>
        </div>
        <div className="px-4 py-3">
          <div className="h-3 w-32 bg-muted animate-pulse rounded mb-2" />
          <div className="h-2 w-24 bg-muted animate-pulse rounded" />
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-sm rounded-xl border border-border bg-card shadow-sm overflow-hidden">
      <div className="bg-primary/5 border-b border-border px-4 py-2 flex items-center gap-2">
        <CalendarIcon size={14} className="text-primary" />
        <span className="text-xs font-semibold text-primary">Meeting Invite</span>
      </div>
      <div className="px-4 py-3 space-y-1.5">
        <p className="font-semibold text-sm">{data.event_title}</p>
        <p className="text-xs text-muted-foreground">
          {data.event_date} · {data.event_time}
        </p>
        {data.event_purpose && (
          <p className="text-xs text-muted-foreground">{data.event_purpose}</p>
        )}
        {data.meeting_link && (
          <a
            href={data.meeting_link}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-primary underline truncate block"
          >
            {data.meeting_link}
          </a>
        )}
        {/* Sender sees response status */}
        {!isInvitee && (
          <p className={`text-xs font-medium italic ${
            status === "accepted" ? "text-emerald-500" :
            status === "declined" ? "text-destructive" :
            "text-muted-foreground"
          }`}>
            {status === "accepted" ? "✓ Accepted" :
             status === "declined" ? "✗ Declined" :
             `Sent by ${data.inviter_name} · awaiting response`}
          </p>
        )}
      </div>
      {/* Invitee sees buttons only if pending */}
      {isInvitee && status === "pending" && (
        <div className="px-4 pb-3 flex gap-2">
          <button
            onClick={() => respond("accepted")}
            disabled={loading}
            className="flex-1 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 disabled:opacity-50 transition-colors"
          >
            {loading ? "…" : "Accept"}
          </button>
          <button
            onClick={() => respond("declined")}
            disabled={loading}
            className="flex-1 py-1.5 rounded-lg border border-border text-xs font-semibold hover:bg-muted disabled:opacity-50 transition-colors"
          >
            {loading ? "…" : "Decline"}
          </button>
        </div>
      )}
      {isInvitee && status === "accepted" && (
        <div className="px-4 pb-3 text-xs font-semibold text-emerald-500">
          ✓ Accepted — added to your calendar
        </div>
      )}
      {isInvitee && status === "declined" && (
        <div className="px-4 pb-3 text-xs font-semibold text-muted-foreground">
          ✗ Declined
        </div>
      )}
    </div>
  )
}

// ─── Message Bubble ───────────────────────────────────────────────────────────


function MessageBubble({
  msg, isOwn, showAvatar, roomType, onReply, onDelete, onEdit, onForward, currentUserId, onImageClick,
}: {
  msg: ChatMessage; isOwn: boolean; showAvatar: boolean; roomType: string
  onReply: (msg: ChatMessage) => void
  onDelete: (id: string) => void
  onEdit: (msg: ChatMessage) => void
  onForward: (msg: ChatMessage) => void
  currentUserId: string; onImageClick: (src: string, name: string) => void
}) {
  const [hovered, setHovered] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const FileIcon = getFileIcon(msg.file_type)


  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!menuOpen) return
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [menuOpen])

  const handleCopy = () => {
    if (msg.content) navigator.clipboard.writeText(msg.content)
    setMenuOpen(false)
  }

  return (
    <div
      className={cn("flex items-end gap-2 px-4 py-0.5 group", isOwn ? "flex-row-reverse" : "flex-row")}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => { setHovered(false) }}
    >
      {/* Avatar */}
      <div className="w-6 flex-shrink-0 mb-4">
        {!isOwn && showAvatar && msg.sender && (
          <Avatar user={msg.sender} size="sm" />
        )}
      </div>

      <div className={cn("flex flex-col max-w-[65%]", isOwn ? "items-end" : "items-start")}>
        {/* Sender name for group/project */}
        {!isOwn && showAvatar && roomType !== "direct" && msg.sender && (
          <span className="text-[10px] font-semibold text-muted-foreground mb-0.5 px-1">
            {msg.sender.full_name}
          </span>
        )}

        {/* Reply preview */}
        {msg.reply_to && (msg.reply_to.content || msg.reply_to.file_name) && (
          <div className={cn(
            "flex items-center gap-1 mb-1 px-2.5 py-1 rounded-2xl text-xs opacity-60 border border-border/40",
            isOwn ? "self-end" : "self-start"
          )}>
            <span className="font-medium">{msg.reply_to.sender?.full_name}:</span>
            <span className="truncate max-w-[120px]">{msg.reply_to.content || msg.reply_to.file_name}</span>
          </div>
        )}

        {/* Bubble */}
        {msg.message_type === "event_invite" ? (
          <EventInviteCard message={msg} currentUserId={currentUserId} />
        ) : (
        <div className={cn(
          "relative px-3.5 py-2 text-sm leading-relaxed",
          isOwn
            ? "bg-primary text-primary-foreground rounded-[20px] rounded-br-[4px]"
            : "bg-muted text-foreground rounded-[20px] rounded-bl-[4px]",
          msg.file_url && !msg.content && "p-1 bg-transparent"
        )}>
          {msg.content && <p className="whitespace-pre-wrap break-words">{msg.content}</p>}

          {msg.file_url && (
            <div className={msg.content ? "mt-2" : ""}>
              {msg.file_type?.startsWith("image/") ? (
                <button onClick={() => onImageClick(msg.file_url!, msg.file_name || "image")}>
                  <img
                    src={msg.file_url}
                    alt={msg.file_name || "image"}
                    className="max-w-[220px] max-h-[220px] rounded-[18px] object-cover hover:opacity-95 transition-opacity cursor-zoom-in"
                  />
                </button>
              ) : (
  <a
    href={msg.file_url}
    target="_blank"
    rel="noreferrer"
    className={cn(
      "flex items-center gap-2 px-3 py-2 rounded-2xl text-xs font-medium",
      isOwn
        ? "bg-white/10 text-primary-foreground"
        : "bg-background border border-border text-foreground"
    )}
  >
    <FileIcon className="h-4 w-4 flex-shrink-0" />
    <div className="min-w-0">
      <div className="truncate">{msg.file_name}</div>
      {msg.file_size && (
        <div className="opacity-60">{formatFileSize(msg.file_size)}</div>
      )}
    </div>
    <Download className="h-3 w-3 opacity-60" />
  </a>
)}
            </div>
          )}
        </div>
        )}

        {/* Time + edited — always visible */}
        <div className={cn("flex items-center gap-1 mt-0.5 px-1", isOwn ? "flex-row-reverse" : "flex-row")}>
          <span className="text-[9px] text-muted-foreground/60">
            {format(new Date(msg.created_at), "h:mm a")}
          </span>
          {msg.edited_at && (
            <span className="text-[9px] text-muted-foreground/50">
              · Edited {format(new Date(msg.edited_at), "h:mm a")}
            </span>
          )}
        </div>
      </div>

      {/* Hover actions */}
      <div className={cn(
        "flex items-center gap-0.5 mb-5 flex-shrink-0 transition-opacity",
        hovered || menuOpen ? "opacity-100 visible pointer-events-auto" : "opacity-0 invisible pointer-events-none",
        isOwn ? "flex-row-reverse" : "flex-row"
      )}>
        {/* Reply */}
        <button
          onClick={() => onReply(msg)}
          className="p-1.5 rounded-full hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
          title="Reply"
        >
          <Reply className="h-3.5 w-3.5" />
        </button>

        {/* Reaction */}
        <button
          className="p-1.5 rounded-full hover:bg-muted transition-colors text-muted-foreground hover:text-foreground text-sm"
          title="React"
        >
          😊
        </button>

        {/* More menu */}
        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setMenuOpen((v) => !v)}
            className="p-1.5 rounded-full hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
            title="More"
          >
            <MoreHorizontal className="h-3.5 w-3.5" />
          </button>

          {menuOpen && (
            <div
              className={cn(
                "absolute z-50 bottom-8 bg-popover border border-border rounded-xl shadow-lg py-1 min-w-[140px]",
                isOwn ? "right-0" : "left-0"
              )}
              onMouseLeave={() => { setHovered(false); setMenuOpen(false) }}
            >
              {msg.content && (
                <button onClick={handleCopy} className="w-full flex items-center gap-2.5 px-3 py-2 text-sm hover:bg-muted transition-colors text-left">
                  <span className="text-base">📋</span> Copy
                </button>
              )}
              <button
                onClick={() => { onForward(msg); setMenuOpen(false) }}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-sm hover:bg-muted transition-colors text-left"
              >
                <span className="text-base">↪️</span> Forward
              </button>
              {isOwn && (
                <button
                  onClick={() => { onEdit(msg); setMenuOpen(false) }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-sm hover:bg-muted transition-colors text-left"
                >
                  <span className="text-base">✏️</span> Edit
                </button>
              )}
              {isOwn && (
                <button
                  onClick={() => { onDelete(msg.id); setMenuOpen(false) }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-sm hover:bg-muted transition-colors text-destructive text-left"
                >
                  <span className="text-base">🔄</span> Unsend
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Message Input ─────────────────────────────────────────────────────────────

function MessageInput({
  onSend, replyTo, onCancelReply, editingMsg, onCancelEdit, disabled,
}: {
  onSend: (content: string, file?: File) => Promise<void>
  replyTo: ChatMessage | null; onCancelReply: () => void
  editingMsg: ChatMessage | null; onCancelEdit: () => void
  disabled?: boolean
}) {
  const [text, setText] = useState("")
  const [file, setFile] = useState<File | null>(null)
  const [sending, setSending] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const textRef = useRef<HTMLTextAreaElement>(null)
  
  
  useEffect(() => {
    if (editingMsg) {
      setText(editingMsg.content || "")
      textRef.current?.focus()
    }
  }, [editingMsg])
  const canSend = (text.trim().length > 0 || file !== null) && !sending && !disabled

  const handleSend = async () => {
    if (!canSend) return
    setSending(true)
    await onSend(text.trim(), file || undefined)
    setText("")
    setFile(null)
    if (textRef.current) textRef.current.style.height = "20px"
    setSending(false)
    textRef.current?.focus()
  }

  const handleKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setText(e.target.value)
    e.target.style.height = "auto"
    e.target.style.height = `${Math.min(e.target.scrollHeight, 120)}px`
  }

  return (
    <div className="px-3 pb-3 pt-1">

      {/* Edit preview */}
      {editingMsg && (
        <div className="flex items-center gap-2 mb-2 px-3 py-1.5 bg-muted/40 rounded-2xl text-xs border border-border/40">
          <span className="text-[10px]">✏️</span>
          <span className="text-muted-foreground">Editing message</span>
          <span className="font-medium truncate flex-1">{editingMsg.content}</span>
          <button onClick={onCancelEdit} className="text-muted-foreground hover:text-foreground ml-1">
            <X className="h-3 w-3" />
          </button>
        </div>
      )}

      {/* Reply preview */}
      {replyTo && (
        <div className="flex items-center gap-2 mb-2 px-3 py-1.5 bg-muted/40 rounded-2xl text-xs border border-border/40">
          <Reply className="h-3 w-3 text-muted-foreground flex-shrink-0" />
          <span className="text-muted-foreground">Replying to</span>
          <span className="font-medium truncate flex-1">{replyTo.content || replyTo.file_name}</span>
          <button onClick={onCancelReply} className="text-muted-foreground hover:text-foreground ml-1">
            <X className="h-3 w-3" />
          </button>
        </div>
      )}

      {/* File preview */}
      {file && (
        <div className="flex items-center gap-2 mb-2 px-3 py-1.5 bg-muted/40 rounded-2xl text-xs border border-border/40">
          <Paperclip className="h-3 w-3 text-primary flex-shrink-0" />
          <span className="truncate flex-1 font-medium">{file.name}</span>
          <span className="text-muted-foreground">{formatFileSize(file.size)}</span>
          <button onClick={() => setFile(null)} className="text-muted-foreground hover:text-destructive ml-1">
            <X className="h-3 w-3" />
          </button>
        </div>
      )}

      <div className="flex items-end gap-2">
        {/* Attachment button */}
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="p-2 text-muted-foreground hover:text-foreground transition-colors flex-shrink-0 mb-0.5"
        >
          <Paperclip className="h-5 w-5" />
        </button>
        <input
          ref={fileRef} type="file" className="hidden"
          accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.csv,.zip"
          onChange={(e) => setFile(e.target.files?.[0] || null)}
        />

        {/* Pill input */}
        <div className="flex items-end flex-1 bg-muted/40 border border-border/60 rounded-[24px] px-4 py-2 focus-within:border-border transition-colors">
          <textarea
            ref={textRef}
            value={text}
            onChange={handleTextChange}
            onKeyDown={handleKey}
            placeholder={disabled ? "No permission to send" : "Message…"}
            disabled={disabled || sending}
            rows={1}
            className="flex-1 bg-transparent text-sm resize-none outline-none placeholder:text-muted-foreground/50 min-h-[20px] max-h-[120px] leading-5"
            style={{ height: "20px" }}
          />
        </div>

        {/* Send / mic button */}
        {canSend ? (
          <button
            onClick={handleSend}
            className="p-2 text-primary hover:text-primary/80 transition-colors flex-shrink-0 mb-0.5 font-semibold text-sm"
          >
            <Send className="h-5 w-5" />
          </button>
        ) : (
          <button className="p-2 text-muted-foreground flex-shrink-0 mb-0.5">
            <Circle className="h-5 w-5" />
          </button>
        )}
      </div>
    </div>
  )
}

// ─── New DM Dialog ────────────────────────────────────────────────────────────

function NewDMDialog({
  open,
  onOpenChange,
  people,
  onSelect,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  people: Profile[]
  onSelect: (user: Profile) => void
}) {
  const [search, setSearch] = useState("")
  const filtered = people.filter((p) =>
    p.full_name.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>New Direct Message</DialogTitle>
        </DialogHeader>
        <Input
          placeholder="Search people…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          autoFocus
          className="mb-2"
        />
        <div className="space-y-1 max-h-64 overflow-y-auto">
          {filtered.map((p) => (
            <button
              key={p.id}
              onClick={() => { onSelect(p); onOpenChange(false) }}
              className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-muted transition-colors text-left"
            >
              <Avatar user={p} size="sm" />
              <div>
                <div className="text-sm font-medium">{p.full_name}</div>
                <div className="text-[10px] text-muted-foreground capitalize">{p.user_type || "member"}</div>
              </div>
            </button>
          ))}
          {filtered.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-6">No people found</p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ─── Main Inbox Component ─────────────────────────────────────────────────────

interface InboxViewProps {
  canSendMessages?: boolean // permission: can_access_inbox
}

export function InboxView({ canSendMessages = true }: InboxViewProps) {
  const supabase = useMemo(() => createClient(), [])

  // ── State ──────────────────────────────────────────────────────────────────
  const [currentUser, setCurrentUser] = useState<Profile | null>(null)
  const [rooms, setRooms] = useState<ChatRoom[]>([])
  const [activeRoomId, setActiveRoomId] = useState<string | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [people, setPeople] = useState<Profile[]>([])
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null)
  const [editingMsg, setEditingMsg] = useState<ChatMessage | null>(null)
  const [newDMOpen, setNewDMOpen] = useState(false)
  const [loadingMessages, setLoadingMessages] = useState(false)
  const [hasMore, setHasMore] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [oldestMsgDate, setOldestMsgDate] = useState<string | null>(null)
  const [loadingRooms, setLoadingRooms] = useState(true)
  const [sidebarSearch, setSidebarSearch] = useState("")
  const [lightbox, setLightbox] = useState<{ src: string; name: string } | null>(null)
  const [forwardMsg, setForwardMsg] = useState<ChatMessage | null>(null)
  const [deletingRoomId, setDeletingRoomId] = useState<string | null>(null)

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const messagesContainerRef = useRef<HTMLDivElement>(null)
  const realtimeRef = useRef<ReturnType<typeof supabase.channel> | null>(null)
  // ── Boot ────────────────────────────────────────────────────────────────────
  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data: profile } = await supabase
        .from("profiles")
        .select("id, full_name, email, user_type")
        .eq("id", user.id)
        .single()

      if (profile) setCurrentUser(profile as Profile)
      await Promise.all([loadRooms(user.id), loadPeople(user.id)])
    }
    init()
  }, [supabase])

  // ── Load rooms ─────────────────────────────────────────────────────────────
  const loadRooms = useCallback(async (userId: string) => {
  // Single query for memberships
    setLoadingRooms(true)
  const { data: memberships } = await supabase
    .from("chat_room_members")
    .select("room_id, last_read_at")
    .eq("user_id", userId)

  if (!memberships?.length) return

  const roomIds = memberships.map((m) => m.room_id)
  const lastReadMap = Object.fromEntries(memberships.map((m) => [m.room_id, m.last_read_at]))

  // Single query for all rooms
  const { data: roomData } = await supabase
    .from("chat_rooms")
    .select("*")
    .in("id", roomIds)
    .order("created_at", { ascending: true })

  if (!roomData) return

  // Single query for ALL last messages across all rooms
  const { data: allLastMsgs } = await supabase
    .from("chat_messages")
    .select("room_id, content, file_name, created_at, sender_id")
    .in("room_id", roomIds)
    .order("created_at", { ascending: false })

  // Single query for ALL members of all rooms (for DM name lookup)
  const { data: allMembers } = await supabase
    .from("chat_room_members")
    .select("room_id, user_id")
    .in("room_id", roomIds)
    .neq("user_id", userId)

  // Single query for ALL profiles we need
  const otherUserIds = [...new Set(allMembers?.map((m) => m.user_id) || [])]
  const { data: allProfiles } = otherUserIds.length > 0
    ? await supabase
        .from("profiles")
        .select("id, full_name, user_type")
        .in("id", otherUserIds)
    : { data: [] }

  // Build lookup maps
  const profileMap = Object.fromEntries((allProfiles || []).map((p) => [p.id, p]))
  const membersByRoom = (allMembers || []).reduce((acc, m) => {
    if (!acc[m.room_id]) acc[m.room_id] = []
    acc[m.room_id].push(m.user_id)
    return acc
  }, {} as Record<string, string[]>)

  // Group last messages by room (first one per room = most recent)
  const lastMsgByRoom: Record<string, any> = {}
  for (const msg of (allLastMsgs || [])) {
    if (!lastMsgByRoom[msg.room_id]) lastMsgByRoom[msg.room_id] = msg
  }

  // Single query for ALL unread counts
  const { data: allUnread } = await supabase
    .from("chat_messages")
    .select("room_id, created_at, sender_id")
    .in("room_id", roomIds)
    .neq("sender_id", userId)

  // Calculate unread per room
  const unreadByRoom: Record<string, number> = {}
  for (const msg of (allUnread || [])) {
    const lastRead = lastReadMap[msg.room_id] || "1970-01-01"
    if (msg.created_at > lastRead) {
      unreadByRoom[msg.room_id] = (unreadByRoom[msg.room_id] || 0) + 1
    }
  }

  // Assemble rooms
  const enriched = roomData.map((room) => {
    const lastMsg = lastMsgByRoom[room.id]
    let displayName = room.name || "Unnamed"
    let otherUser: Profile | undefined

    if (room.type === "direct") {
      const otherUserId = membersByRoom[room.id]?.[0]
      if (otherUserId && profileMap[otherUserId]) {
        otherUser = profileMap[otherUserId] as Profile
        displayName = otherUser.full_name
      }
    }

    return {
      ...room,
      display_name: displayName,
      unread_count: unreadByRoom[room.id] || 0,
      last_message: lastMsg ? (() => {
        if (!lastMsg.content) return lastMsg.file_name || "Attachment"
        // Don't show raw JSON for event invites
        try {
          const parsed = JSON.parse(lastMsg.content)
          if (parsed.type === "event_invite") return "📅 Meeting Invite"
        } catch {}
        return lastMsg.content
      })() : undefined,
      last_message_at: lastMsg?.created_at,
      other_user: otherUser,
    } as ChatRoom
  })

  // Sort by latest message, then by created_at
  const sorted = enriched.sort((a, b) => {
    const aTime = a.last_message_at ? new Date(a.last_message_at).getTime() : new Date(a.created_at).getTime()
    const bTime = b.last_message_at ? new Date(b.last_message_at).getTime() : new Date(b.created_at).getTime()
    return bTime - aTime
  })

  setRooms(sorted)

  if (sorted.length > 0 && !activeRoomId) {
    setActiveRoomId(sorted[0].id)
  }
  setLoadingRooms(false)
}, [supabase, activeRoomId])

  // ── Load people (for DMs) ──────────────────────────────────────────────────
  const loadPeople = useCallback(async (userId: string) => {
    const { data: profile } = await supabase
      .from("profiles")
      .select("user_type")
      .eq("id", userId)
      .single()

    let founderId = userId

    if (profile?.user_type === "team_member") {
      const { data: tm } = await supabase
        .from("team_members")
        .select("founder_id")
        .eq("user_id", userId)
        .single()
      if (tm) founderId = tm.founder_id
    } else if (profile?.user_type === "client") {
      const { data: client } = await supabase
        .from("clients")
        .select("founder_id")
        .eq("portal_user_id", userId)
        .maybeSingle()
      if (client?.founder_id) founderId = client.founder_id
    }

    // Get founder profile
    const { data: founderProfile } = await supabase
      .from("profiles")
      .select("id, full_name, user_type")
      .eq("id", founderId)
      .single()

    // Get all active team members under this founder
    const { data: teamMembers } = await supabase
      .from("team_members")
      .select("user_id, profile:profiles!team_members_user_id_profiles_fkey(id, full_name, user_type)")
      .eq("founder_id", founderId)
      .eq("is_active", true)

    const membersProfiles = teamMembers
      ?.map((tm: any) => tm.profile)
      .filter(Boolean) || []

    // For clients, also include other clients in the same org? No — just founder + team
    const allPeople = [
      ...(founderProfile ? [founderProfile] : []),
      ...membersProfiles,
    ].filter((p) => p.id !== userId) as Profile[]

    setPeople(allPeople)
  }, [supabase])

  // ── Load messages for active room ──────────────────────────────────────────
  const PAGE_SIZE = 20

  useEffect(() => {
    if (!activeRoomId) return

    const load = async () => {
      setLoadingMessages(true)
      setMessages([])
      setOldestMsgDate(null)
      setHasMore(false)

      const { data } = await supabase
        .from("chat_messages")
        .select(`
          *,
          sender:profiles(id, full_name),
          reply_to:chat_messages!reply_to_id(
            id, content, file_name,
            sender:profiles(id, full_name)
          )
        `)
        .eq("room_id", activeRoomId)
        .order("created_at", { ascending: false })
        .limit(PAGE_SIZE)

      const msgs = ((data as ChatMessage[]) || []).reverse()
      setMessages(msgs)
      setLoadingMessages(false)

      if (msgs.length === PAGE_SIZE) setHasMore(true)
      if (msgs.length > 0) setOldestMsgDate(msgs[0].created_at)
    }

    load()
  }, [activeRoomId, supabase])

  // ── Load more (scroll up) ──────────────────────────────────────────────────
  const loadMore = useCallback(async () => {
    if (!activeRoomId || !hasMore || loadingMore || !oldestMsgDate) return

    setLoadingMore(true)
    const container = messagesContainerRef.current
    const prevScrollHeight = container?.scrollHeight || 0

    const { data } = await supabase
      .from("chat_messages")
      .select(`
        *,
        sender:profiles(id, full_name),
        reply_to:chat_messages!reply_to_id(
          id, content, file_name,
          sender:profiles(id, full_name)
        )
      `)
      .eq("room_id", activeRoomId)
      .lt("created_at", oldestMsgDate)
      .order("created_at", { ascending: false })
      .limit(PAGE_SIZE)

    const older = ((data as ChatMessage[]) || []).reverse()

    if (older.length > 0) {
      setMessages((prev) => [...older, ...prev])
      setOldestMsgDate(older[0].created_at)
      if (older.length < PAGE_SIZE) setHasMore(false)

      // Maintain scroll position after prepending
      requestAnimationFrame(() => {
        if (container) {
          container.scrollTop = container.scrollHeight - prevScrollHeight
        }
      })
    } else {
      setHasMore(false)
    }

    setLoadingMore(false)
  }, [activeRoomId, hasMore, loadingMore, oldestMsgDate, supabase])

  // ── Scroll handler ─────────────────────────────────────────────────────────
  const handleScroll = useCallback(() => {
    const container = messagesContainerRef.current
    if (!container) return
    if (container.scrollTop < 80) loadMore()
  }, [loadMore])



    // ── Mark room as read ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!activeRoomId || !currentUser) return
    supabase
      .from("chat_room_members")
      .update({ last_read_at: new Date().toISOString() })
      .eq("room_id", activeRoomId)
      .eq("user_id", currentUser.id)
      .then(() => {
        setRooms((prev) =>
          prev.map((r) => r.id === activeRoomId ? { ...r, unread_count: 0 } : r)
        )
      })
  }, [activeRoomId, currentUser, supabase])
  // ── Realtime subscription ──────────────────────────────────────────────────
  useEffect(() => {
    if (!activeRoomId || !currentUser) return    
    // Cleanup previous

    if (realtimeRef.current) {
      supabase.removeChannel(realtimeRef.current)
    }

    const channel = supabase
      .channel(`room:${activeRoomId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "chat_messages",
          filter: `room_id=eq.${activeRoomId}`,
        },
        async (payload) => {
          const newMsg = payload.new as ChatMessage

          // Fetch full message with sender
          const { data } = await supabase
            .from("chat_messages")
            .select(`
              *,
              sender:profiles(id, full_name),
              reply_to:chat_messages!reply_to_id(
                id, content, file_name,
                sender:profiles(id, full_name)
              )
            `)
            .eq("id", newMsg.id)
            .single()

          if (data) {
            setMessages((prev) => [...prev, data as ChatMessage])
            // Mark read if this is the active room
            await supabase
              .from("chat_room_members")
              .update({ last_read_at: new Date().toISOString() })
              .eq("room_id", activeRoomId)
              .eq("user_id", currentUser.id)
          }
        }
      )
      .on(
        "postgres_changes",
        {
          event: "DELETE",
          schema: "public",
          table: "chat_messages",
          filter: `room_id=eq.${activeRoomId}`,
        },
        (payload) => {
          setMessages((prev) => prev.filter((m) => m.id !== (payload.old as ChatMessage).id))
        }
      )
      .subscribe()

    realtimeRef.current = channel

    return () => {
      supabase.removeChannel(channel)
    }
  }, [activeRoomId, currentUser, supabase])

  // ── Scroll to bottom on new messages ──────────────────────────────────────
  useEffect(() => {
    if (!loadingMessages) {
      messagesEndRef.current?.scrollIntoView({ behavior: "instant" })
    }
  }, [loadingMessages])

  // ── Send message ───────────────────────────────────────────────────────────
  const handleSend = useCallback(async (content: string, file?: File) => {
    if (!activeRoomId || !currentUser) return

    // Edit mode
    if (editingMsg) {
      const { error } = await supabase
        .from("chat_messages")
        .update({ content, edited_at: new Date().toISOString() })
        .eq("id", editingMsg.id)
      if (error) toast.error("Failed to edit message")
      else {
        setMessages((prev) => prev.map((m) => m.id === editingMsg.id ? { ...m, content, edited_at: new Date().toISOString() } : m))
        setEditingMsg(null)
      }
      return
    }

    let fileUrl: string | null = null
    let fileName: string | null = null
    let fileType: string | null = null
    let fileSize: number | null = null

    if (file) {
      const ext = file.name.split(".").pop()
      const path = `${currentUser.id}/${Date.now()}.${ext}`
      const { error: uploadError } = await supabase.storage
        .from("chat_attachment")
        .upload(path, file, { contentType: file.type, upsert: false })

      if (uploadError) {
        toast.error(`Upload failed: ${uploadError.message}`)
        return
      }

      const { data: urlData } = supabase.storage.from("chat_attachment").getPublicUrl(path)
      fileUrl = urlData.publicUrl
      fileName = file.name
      fileType = file.type
      fileSize = file.size
    }

    if (!content && !fileUrl) return

    const { error } = await supabase.from("chat_messages").insert({
      room_id: activeRoomId,
      sender_id: currentUser.id,
      content: content || null,
      file_url: fileUrl,
      file_name: fileName,
      file_type: fileType,
      file_size: fileSize,
      reply_to_id: replyTo?.id || null,
    })

    if (error) {
      toast.error("Failed to send message")
    } else {
      setReplyTo(null)
      // Re-sort rooms so latest message bubbles to top
      setRooms((prev) => {
        const updated = prev.map((r) =>
          r.id === activeRoomId
            ? { ...r, last_message: content || fileName || "Attachment", last_message_at: new Date().toISOString() }
            : r
        )
        return updated.sort((a, b) => {
          const aTime = a.last_message_at ? new Date(a.last_message_at).getTime() : new Date(a.created_at).getTime()
          const bTime = b.last_message_at ? new Date(b.last_message_at).getTime() : new Date(b.created_at).getTime()
          return bTime - aTime
        })
      })
    }
  }, [activeRoomId, currentUser, replyTo, editingMsg, supabase])

  // ── Delete message ─────────────────────────────────────────────────────────
  const handleDelete = useCallback(async (msgId: string) => {
    const { error } = await supabase.from("chat_messages").delete().eq("id", msgId)
    if (error) toast.error("Failed to delete message")
  }, [supabase])

  // ----- Handle Edit --------
  const handleEdit = useCallback(async (msg: ChatMessage) => {
    setEditingMsg(msg)
  }, [])
  

  // ---- Handle Forward -------------
  const handleForwardTo = useCallback(async (roomId: string) => {
    if (!currentUser || !forwardMsg) return
    await supabase.from("chat_messages").insert({
      room_id: roomId,
      sender_id: currentUser.id,
      content: forwardMsg.content || null,
      file_url: forwardMsg.file_url || null,
      file_name: forwardMsg.file_name || null,
      file_type: forwardMsg.file_type || null,
      file_size: forwardMsg.file_size || null,
    })
    setForwardMsg(null)
    toast.success("Message forwarded")
  }, [currentUser, forwardMsg, supabase])

  // Handle Delete Room

  // ── Delete entire chat room ────────────────────────────────────────────────
  const handleDeleteRoom = useCallback(async (roomId: string) => {
    setDeletingRoomId(roomId)
    try {
      const res = await fetch("/api/inbox/delete-room", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ room_id: roomId }),
      })

      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || "Failed to delete")
      }

      setRooms((prev) => prev.filter((r) => r.id !== roomId))
      if (activeRoomId === roomId) setActiveRoomId(null)
      toast.success("Chat deleted")
    } catch (err: any) {
      toast.error(err.message || "Failed to delete chat")
    } finally {
      setDeletingRoomId(null)
    }
  }, [activeRoomId])

  // ── Start DM ───────────────────────────────────────────────────────────────
  const handleStartDM = useCallback(async (otherUser: Profile) => {
    if (!currentUser) return

    // Deterministic DM key
    const dmKey = [currentUser.id, otherUser.id].sort().join(":")

    // Check if DM room already exists
    const { data: existing } = await supabase
      .from("chat_rooms")
      .select("id")
      .eq("dm_key", dmKey)
      .maybeSingle()

    if (existing) {
      setActiveRoomId(existing.id)
      return
    }

    // Create new DM room
    const { data: newRoom, error } = await supabase
      .from("chat_rooms")
      .insert({
        type: "direct",
        founder_id: currentUser.id,
        created_by: currentUser.id,
        dm_key: dmKey,
      })
      .select()
      .single()

    if (error || !newRoom) { toast.error("Failed to open DM"); return }

    // Add both users
    await supabase.from("chat_room_members").insert([
      { room_id: newRoom.id, user_id: currentUser.id },
      { room_id: newRoom.id, user_id: otherUser.id },
    ])

    await loadRooms(currentUser.id)
    setActiveRoomId(newRoom.id)
  }, [currentUser, supabase, loadRooms])

  // ── Computed ───────────────────────────────────────────────────────────────
  const activeRoom = useMemo(
    () => rooms.find((r) => r.id === activeRoomId),
    [rooms, activeRoomId]
  )

  const groupedRooms = useMemo(() => ({
    project: rooms.filter((r) => r.type === "project"),
    group: rooms.filter((r) => r.type === "group"),
    direct: rooms.filter((r) => r.type === "direct"),
  }), [rooms])

  const filteredRooms = useMemo(() => {
    if (!sidebarSearch) return rooms
    return rooms.filter((r) =>
      r.display_name.toLowerCase().includes(sidebarSearch.toLowerCase())
    )
  }, [rooms, sidebarSearch])

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="flex h-[calc(100vh-112px)] rounded-xl border border-border overflow-hidden bg-card">

      {/* ── Sidebar ── */}
      <aside className="w-60 flex-shrink-0 flex flex-col border-r border-border bg-muted/20 overflow-hidden">
        {/* Header */}
        <div className="px-3 py-3 border-b border-border">
          <h2 className="text-sm font-bold tracking-tight">Inbox</h2>
          <div className="relative mt-2">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
            <input
              value={sidebarSearch}
              onChange={(e) => setSidebarSearch(e.target.value)}
              placeholder="Search…"
              className="w-full pl-7 pr-2 py-1.5 text-xs bg-background border border-border rounded-lg outline-none focus:border-primary/50 transition-colors"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
            {loadingRooms ? (
            <div className="px-2 pt-3 space-y-1">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="flex items-center gap-2 px-2 py-1.5 rounded-lg">
                  <div className="w-7 h-7 rounded-full bg-muted animate-pulse flex-shrink-0" />
                  <div className="flex-1 space-y-1">
                    <div className="h-2.5 bg-muted animate-pulse rounded w-3/4" />
                    <div className="h-2 bg-muted animate-pulse rounded w-1/2" />
                  </div>
                </div>
              ))}
            </div>
          ) : rooms.length === 0 ? (
            <div className="px-4 py-6 text-center">
              <p className="text-xs text-muted-foreground">No conversations yet</p>
            </div>
          ) : null}
          {/* Project Channels */}
          {groupedRooms.project.length > 0 && (
            <div className="pt-3 px-2">
              <div className="flex items-center justify-between px-2 mb-1">
                <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Projects</span>
              </div>
              {groupedRooms.project.map((room) => (
                <RoomButton key={room.id} room={room} active={activeRoomId === room.id} onClick={() => setActiveRoomId(room.id)} />
              ))}
            </div>
          )}

          {/* Group Channels */}
          {groupedRooms.group.length > 0 && (
            <div className="pt-3 px-2">
              <div className="flex items-center justify-between px-2 mb-1">
                <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Channels</span>
              </div>
              {groupedRooms.group.map((room) => (
                <RoomButton key={room.id} room={room} active={activeRoomId === room.id} onClick={() => setActiveRoomId(room.id)} />
              ))}
            </div>
          )}

          {/* Direct Messages */}
          <div className="pt-3 px-2 pb-3">
            <div className="flex items-center justify-between px-2 mb-1">
              <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Direct Messages</span>
              <button
                onClick={() => setNewDMOpen(true)}
                className="p-0.5 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
              >
                <Plus className="h-3 w-3" />
              </button>
            </div>
            {groupedRooms.direct.map((room) => (
              <RoomButton key={room.id} room={room} active={activeRoomId === room.id} onClick={() => setActiveRoomId(room.id)} />
            ))}
            {groupedRooms.direct.length === 0 && (
              <button
                onClick={() => setNewDMOpen(true)}
                className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-xs text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
              >
                <Plus className="h-3 w-3" />
                New message
              </button>
            )}
          </div>
        </div>
      </aside>

      {/* ── Main Chat Area ── */}
      <div className="flex flex-col flex-1 min-w-0 min-h-0 overflow-hidden">
        {activeRoom ? (
          <>
            {/* Chat header */}
            <div className="flex items-center gap-3 px-4 py-3 border-b border-border/40 bg-card flex-shrink-0">
              <div className="flex items-center gap-3 flex-1 min-w-0">
                {activeRoom.type === "direct" && activeRoom.other_user ? (
                  <Avatar user={activeRoom.other_user} size="md" />
                ) : activeRoom.type === "project" ? (
                  <div className="w-9 h-9 rounded-full bg-emerald-500/15 flex items-center justify-center flex-shrink-0">
                    <FolderOpen className="h-4 w-4 text-emerald-600" />
                  </div>
                ) : (
                  <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <Hash className="h-4 w-4 text-primary" />
                  </div>
                )}
                <div className="min-w-0">
                  <h3 className="text-sm font-semibold truncate">{activeRoom.display_name}</h3>
                  <p className="text-[11px] text-muted-foreground">
                    {activeRoom.type === "direct" ? "Active now" : activeRoom.type === "project" ? "Project channel" : "Group channel"}
                  </p>
                </div>
              </div>
              <button
                onClick={() => activeRoomId && handleDeleteRoom(activeRoomId)}
                disabled={deletingRoomId === activeRoomId}
                className="p-2 text-muted-foreground hover:text-destructive transition-colors rounded-lg hover:bg-destructive/10 flex-shrink-0"
                title="Delete chat"
              >
                {deletingRoomId === activeRoomId ? (
                  <div className="h-4 w-4 animate-spin border-2 border-current border-t-transparent rounded-full" />
                ) : (
                  <Trash2 className="h-4 w-4" />
                )}
              </button>
            </div>

            {/* Messages */}
            <div
              ref={messagesContainerRef}
              onScroll={handleScroll}
              className="flex-1 overflow-y-auto py-2 min-h-0"
            >
              {loadingMessages ? (
                <div className="flex items-center justify-center h-32">
                  <div className="animate-spin h-5 w-5 border-2 border-primary border-t-transparent rounded-full" />
                </div>
              ) : messages.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-48 text-center px-8">
                  <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-3">
                    <MessageSquare className="h-6 w-6 text-muted-foreground/40" />
                  </div>
                  <p className="text-sm font-medium">No messages yet</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {canSendMessages ? "Send the first message!" : "Messages will appear here."}
                  </p>
                </div>
              ) : (
                <div className="space-y-0.5 pb-2">
                  {loadingMore && (
                    <div className="flex justify-center py-3">
                      <div className="animate-spin h-4 w-4 border-2 border-primary border-t-transparent rounded-full" />
                    </div>
                  )}
                  {!hasMore && messages.length > 0 && (
                    <div className="flex justify-center py-3">
                      <span className="text-[10px] text-muted-foreground">Beginning of conversation</span>
                    </div>
                  )}
                  {messages.map((msg, idx) => {
                    const prevMsg = messages[idx - 1]
                    const showAvatar =
                      !prevMsg ||
                      prevMsg.sender_id !== msg.sender_id ||
                      new Date(msg.created_at).getTime() - new Date(prevMsg.created_at).getTime() > 5 * 60 * 1000

                    // Date separator
                    const showDate =
                      !prevMsg ||
                      !isToday(new Date(msg.created_at)) !== !isToday(new Date(prevMsg.created_at)) ||
                      format(new Date(msg.created_at), "yyyy-MM-dd") !== format(new Date(prevMsg.created_at), "yyyy-MM-dd")

                    return (
                      <div key={msg.id}>
                        {showDate && (
                          <div className="flex items-center gap-3 px-4 py-2">
                            <div className="flex-1 h-px bg-border/40" />
                            <span className="text-[10px] text-muted-foreground/60 font-medium">
                              {isToday(new Date(msg.created_at)) ? "Today"
                                : isYesterday(new Date(msg.created_at)) ? "Yesterday"
                                : format(new Date(msg.created_at), "MMM d")}
                            </span>
                            <div className="flex-1 h-px bg-border/40" />
                          </div>
                        )}
                        <MessageBubble
                          msg={msg}
                          isOwn={msg.sender_id === currentUser?.id}
                          showAvatar={showAvatar}
                          roomType={activeRoom?.type || "direct"}
                          onReply={setReplyTo}
                          onDelete={handleDelete}
                          onEdit={handleEdit}
                          onForward={setForwardMsg}
                          currentUserId={currentUser?.id || ""}
                          onImageClick={(src, name) => setLightbox({ src, name })}
                        />
                      </div>
                    )
                  })}
                  <div ref={messagesEndRef} />
                </div>
              )}
            </div>

            {/* Input */}
            <MessageInput
              onSend={handleSend}
              replyTo={replyTo}
              onCancelReply={() => setReplyTo(null)}
              editingMsg={editingMsg}
              onCancelEdit={() => setEditingMsg(null)}
              disabled={!canSendMessages}
            />
          </>
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-center px-8">
            <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center mb-4">
              <MessageSquare className="h-8 w-8 text-muted-foreground/30" />
            </div>
            <h3 className="text-base font-semibold">No conversation selected</h3>
            <p className="text-sm text-muted-foreground mt-1 max-w-xs">
              Pick a channel from the sidebar or start a new direct message.
            </p>
            <Button
              variant="outline"
              size="sm"
              className="mt-4 gap-2"
              onClick={() => setNewDMOpen(true)}
            >
              <Plus className="h-4 w-4" /> New Message
            </Button>
          </div>
        )}
      </div>

      {/* Lightbox */}
      {lightbox && (
        <ImageLightbox
          src={lightbox.src}
          name={lightbox.name}
          onClose={() => setLightbox(null)}
        />
      )}

      {/* Dialogs */}
      <NewDMDialog
        open={newDMOpen}
        onOpenChange={setNewDMOpen}
        people={people}
        onSelect={handleStartDM}
      />

      {/* Forward Dialogue*/}
      <ForwardDialog
        open={!!forwardMsg}
        onOpenChange={(v) => { if (!v) setForwardMsg(null) }}
        rooms={rooms}
        onForward={handleForwardTo}
      />


    </div>
  )
}

// ─── Room Button (sidebar item) ───────────────────────────────────────────────

function RoomButton({
  room,
  active,
  onClick,
}: {
  room: ChatRoom
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-left transition-colors group",
        active ? "bg-primary/10 text-foreground" : "hover:bg-muted/50 text-muted-foreground hover:text-foreground"
      )}
    >
      <div className="flex-shrink-0">
        {room.type === "direct" && room.other_user ? (
          <Avatar user={room.other_user} size="sm" />
        ) : room.type === "project" ? (
          <div className="w-5 h-5 flex items-center justify-center">
            <FolderOpen className="h-3.5 w-3.5 text-emerald-500" />
          </div>
        ) : (
          <div className="w-5 h-5 flex items-center justify-center">
            <Hash className="h-3.5 w-3.5" />
          </div>
        )}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between">
          <span className={cn("text-xs font-medium truncate", active && "text-foreground font-semibold")}>
            {room.display_name}
          </span>
          {room.unread_count > 0 && (
            <Badge className="h-4 min-w-4 px-1 text-[9px] bg-primary text-primary-foreground rounded-full ml-1">
              {room.unread_count > 99 ? "99+" : room.unread_count}
            </Badge>
          )}
        </div>
        {room.last_message && (
          <p className="text-[10px] text-muted-foreground truncate leading-tight">
            {room.last_message}
          </p>
        )}
      </div>
    </button>
  )
}