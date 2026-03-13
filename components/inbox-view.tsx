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

// ─── Message Bubble ───────────────────────────────────────────────────────────

function MessageBubble({
  msg,
  isOwn,
  showAvatar,
  onReply,
  onDelete,
  currentUserId,
}: {
  msg: ChatMessage
  isOwn: boolean
  showAvatar: boolean
  onReply: (msg: ChatMessage) => void
  onDelete: (id: string) => void
  currentUserId: string
}) {
  const [hovered, setHovered] = useState(false)
  const FileIcon = getFileIcon(msg.file_type)

  return (
    <div
      className={cn("group flex gap-2.5 px-4 py-0.5 hover:bg-muted/30 transition-colors", isOwn && "flex-row-reverse")}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Avatar */}
      <div className="w-7 flex-shrink-0 pt-0.5">
        {showAvatar && msg.sender && !isOwn && <Avatar user={msg.sender} size="sm" />}
      </div>

      <div className={cn("flex flex-col max-w-[70%]", isOwn && "items-end")}>
        {/* Sender name + time */}
        {showAvatar && (
          <div className={cn("flex items-baseline gap-2 mb-0.5", isOwn && "flex-row-reverse")}>
            <span className="text-[11px] font-semibold text-foreground">
              {isOwn ? "You" : msg.sender?.full_name || "Unknown"}
            </span>
            <span className="text-[10px] text-muted-foreground">{formatMessageDate(msg.created_at)}</span>
          </div>
        )}

        {/* Reply preview */}
        {msg.reply_to && (
          <div className={cn("flex items-start gap-1.5 mb-1 px-2 py-1 rounded bg-muted/50 border-l-2 border-primary/40 text-xs text-muted-foreground max-w-full", isOwn && "border-l-0 border-r-2")}>
            <Reply className="h-3 w-3 mt-0.5 flex-shrink-0" />
            <span className="truncate">
              <span className="font-medium text-foreground">{msg.reply_to.sender?.full_name}: </span>
              {msg.reply_to.content || msg.reply_to.file_name}
            </span>
          </div>
        )}

        {/* Content bubble */}
        <div className={cn(
          "relative rounded-2xl px-3 py-2 text-sm",
          isOwn
            ? "bg-primary text-primary-foreground rounded-tr-sm"
            : "bg-muted text-foreground rounded-tl-sm"
        )}>
          {msg.content && <p className="whitespace-pre-wrap break-words leading-relaxed">{msg.content}</p>}

          {/* File attachment */}
          {msg.file_url && (
            <div className={cn("mt-1", msg.content && "mt-2")}>
              {msg.file_type?.startsWith("image/") ? (
                <a href={msg.file_url} target="_blank" rel="noreferrer">
                  <img
                    src={msg.file_url}
                    alt={msg.file_name || "image"}
                    className="max-w-[240px] max-h-[200px] rounded-lg object-cover"
                  />
                </a>
              ) : (
                <a
                  href={msg.file_url}
                  target="_blank"
                  rel="noreferrer"
                  className={cn(
                    "flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-colors",
                    isOwn ? "bg-primary-foreground/10 hover:bg-primary-foreground/20 text-primary-foreground" : "bg-background hover:bg-muted border border-border text-foreground"
                  )}
                >
                  <FileIcon className="h-4 w-4 flex-shrink-0" />
                  <div className="min-w-0">
                    <div className="truncate font-medium">{msg.file_name}</div>
                    {msg.file_size && <div className="opacity-70">{formatFileSize(msg.file_size)}</div>}
                  </div>
                  <Download className="h-3.5 w-3.5 flex-shrink-0 opacity-70" />
                </a>
              )}
            </div>
          )}

          {msg.edited_at && (
            <span className="text-[9px] opacity-50 ml-1">(edited)</span>
          )}
        </div>

        {/* Timestamp for non-avatar rows */}
        {!showAvatar && (
          <span className={cn(
            "text-[9px] text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity mt-0.5",
            isOwn ? "text-right" : "text-left"
          )}>
            {format(new Date(msg.created_at), "h:mm a")}
          </span>
        )}
      </div>

      {/* Action buttons on hover */}
      <div className={cn(
        "flex items-start gap-0.5 pt-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0",
        isOwn ? "order-first" : "order-last"
      )}>
        <button
          onClick={() => onReply(msg)}
          className="p-1 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
          title="Reply"
        >
          <Reply className="h-3.5 w-3.5" />
        </button>
        {isOwn && (
          <button
            onClick={() => onDelete(msg.id)}
            className="p-1 rounded hover:bg-destructive/10 transition-colors text-muted-foreground hover:text-destructive"
            title="Delete"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </div>
  )
}

// ─── Message Input ─────────────────────────────────────────────────────────────

function MessageInput({
  onSend,
  replyTo,
  onCancelReply,
  disabled,
}: {
  onSend: (content: string, file?: File) => Promise<void>
  replyTo: ChatMessage | null
  onCancelReply: () => void
  disabled?: boolean
}) {
  const [text, setText] = useState("")
  const [file, setFile] = useState<File | null>(null)
  const [sending, setSending] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const textRef = useRef<HTMLTextAreaElement>(null)

  const canSend = (text.trim().length > 0 || file !== null) && !sending && !disabled

  const handleSend = async () => {
    if (!canSend) return
    setSending(true)
    await onSend(text.trim(), file || undefined)
    setText("")
    setFile(null)
    setSending(false)
    textRef.current?.focus()
  }

  const handleKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  // Auto-resize textarea
  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setText(e.target.value)
    e.target.style.height = "auto"
    e.target.style.height = `${Math.min(e.target.scrollHeight, 160)}px`
  }

  return (
    <div className="px-4 pb-4 pt-2">
      {/* Reply preview */}
      {replyTo && (
        <div className="flex items-center gap-2 mb-2 px-3 py-2 bg-muted/50 rounded-lg border border-border text-xs">
          <Reply className="h-3.5 w-3.5 text-primary flex-shrink-0" />
          <span className="text-muted-foreground">Replying to </span>
          <span className="font-medium text-foreground">{replyTo.sender?.full_name}</span>
          <span className="text-muted-foreground truncate flex-1">: {replyTo.content || replyTo.file_name}</span>
          <button onClick={onCancelReply} className="ml-auto text-muted-foreground hover:text-foreground">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* File preview */}
      {file && (
        <div className="flex items-center gap-2 mb-2 px-3 py-2 bg-muted/50 rounded-lg border border-border text-xs">
          <Paperclip className="h-3.5 w-3.5 text-primary flex-shrink-0" />
          <span className="font-medium truncate flex-1">{file.name}</span>
          <span className="text-muted-foreground">{formatFileSize(file.size)}</span>
          <button onClick={() => setFile(null)} className="text-muted-foreground hover:text-destructive">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      <div className="flex items-end gap-2 bg-muted/40 border border-border rounded-2xl px-3 py-2 focus-within:border-primary/50 focus-within:bg-background transition-colors">
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="p-1 text-muted-foreground hover:text-foreground transition-colors flex-shrink-0 mb-0.5"
          title="Attach file"
        >
          <Paperclip className="h-4 w-4" />
        </button>
        <input
          ref={fileRef}
          type="file"
          className="hidden"
          accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.csv,.zip"
          onChange={(e) => setFile(e.target.files?.[0] || null)}
        />

        <textarea
          ref={textRef}
          value={text}
          onChange={handleTextChange}
          onKeyDown={handleKey}
          placeholder={disabled ? "You don't have permission to send messages" : "Message… (Enter to send, Shift+Enter for new line)"}
          disabled={disabled || sending}
          rows={1}
          className="flex-1 bg-transparent text-sm resize-none outline-none placeholder:text-muted-foreground/60 min-h-[20px] max-h-[160px] leading-relaxed"
          style={{ height: "20px" }}
        />

        <button
          onClick={handleSend}
          disabled={!canSend}
          className={cn(
            "p-1.5 rounded-xl transition-all flex-shrink-0 mb-0.5",
            canSend ? "bg-primary text-primary-foreground hover:bg-primary/90" : "text-muted-foreground/40"
          )}
        >
          <Send className="h-3.5 w-3.5" />
        </button>
      </div>
      <p className="text-[10px] text-muted-foreground mt-1 px-1">Enter to send · Shift+Enter for new line</p>
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
  const [newDMOpen, setNewDMOpen] = useState(false)
  const [loadingMessages, setLoadingMessages] = useState(false)
  const [sidebarSearch, setSidebarSearch] = useState("")

  const messagesEndRef = useRef<HTMLDivElement>(null)
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
      await loadRooms(user.id)
      await loadPeople(user.id)
    }
    init()
  }, [supabase])

  // ── Load rooms ─────────────────────────────────────────────────────────────
  const loadRooms = useCallback(async (userId: string) => {
    // Get rooms the user is a member of
    const { data: memberships } = await supabase
      .from("chat_room_members")
      .select("room_id, last_read_at")
      .eq("user_id", userId)

    if (!memberships?.length) return

    const roomIds = memberships.map((m) => m.room_id)
    const lastReadMap = Object.fromEntries(memberships.map((m) => [m.room_id, m.last_read_at]))

    const { data: roomData } = await supabase
      .from("chat_rooms")
      .select("*")
      .in("id", roomIds)
      .order("created_at", { ascending: true })

    if (!roomData) return

    // For each room, get last message + unread count
    const enriched = await Promise.all(roomData.map(async (room) => {
      const { data: lastMsgs } = await supabase
        .from("chat_messages")
        .select("content, file_name, created_at, sender_id")
        .eq("room_id", room.id)
        .order("created_at", { ascending: false })
        .limit(1)

      const lastMsg = lastMsgs?.[0]
      const lastReadAt = lastReadMap[room.id]

      const { count: unread } = await supabase
        .from("chat_messages")
        .select("id", { count: "exact", head: true })
        .eq("room_id", room.id)
        .neq("sender_id", userId)
        .gt("created_at", lastReadAt || "1970-01-01")

      // For DMs, find the other person's name
      let displayName = room.name || "Unnamed"
      let otherUser: Profile | undefined

      if (room.type === "direct") {
        const { data: members } = await supabase
          .from("chat_room_members")
          .select("user_id")
          .eq("room_id", room.id)
          .neq("user_id", userId)
          .limit(1)

        if (members?.[0]) {
          const { data: otherProfile } = await supabase
            .from("profiles")
            .select("id, full_name, user_type")
            .eq("id", members[0].user_id)
            .single()

          if (otherProfile) {
            otherUser = otherProfile as Profile
            displayName = otherProfile.full_name
          }
        }
      }

      return {
        ...room,
        display_name: displayName,
        unread_count: unread || 0,
        last_message: lastMsg ? (lastMsg.content || lastMsg.file_name || "Attachment") : undefined,
        last_message_at: lastMsg?.created_at,
        other_user: otherUser,
      } as ChatRoom
    }))

    setRooms(enriched)

    // Auto-select first room
    if (enriched.length > 0 && !activeRoomId) {
      setActiveRoomId(enriched[0].id)
    }
  }, [supabase, activeRoomId])

  // ── Load people (for DMs) ──────────────────────────────────────────────────
  const loadPeople = useCallback(async (userId: string) => {
    // Get founder_id first
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
    }

    // Get all team members under the same founder
    const { data: teamMembers } = await supabase
      .from("team_members")
      .select("user_id, profile:profiles!team_members_user_id_profiles_fkey(id, full_name, user_type)")
      .eq("founder_id", founderId)
      .eq("is_active", true)

    const membersProfiles = teamMembers
      ?.map((tm: any) => tm.profile)
      .filter(Boolean) || []

    // Also include the founder
    const { data: founderProfile } = await supabase
      .from("profiles")
      .select("id, full_name, user_type")
      .eq("id", founderId)
      .single()

    const allPeople = [
      ...(founderProfile ? [founderProfile] : []),
      ...membersProfiles,
    ].filter((p) => p.id !== userId) as Profile[]

    setPeople(allPeople)
  }, [supabase])

  // ── Load messages for active room ──────────────────────────────────────────
  useEffect(() => {
    if (!activeRoomId) return

    const load = async () => {
      setLoadingMessages(true)
      const { data } = await supabase
        .from("chat_messages")
        .select(`
          *,
          sender:profiles!chat_messages_sender_id_fkey(id, full_name),
          reply_to:chat_messages!chat_messages_reply_to_id_fkey(
            id, content, file_name,
            sender:profiles!chat_messages_sender_id_fkey(id, full_name)
          )
        `)
        .eq("room_id", activeRoomId)
        .order("created_at", { ascending: true })
        .limit(100)

      setMessages((data as ChatMessage[]) || [])
      setLoadingMessages(false)

      // Mark as read
      if (currentUser) {
        await supabase
          .from("chat_room_members")
          .update({ last_read_at: new Date().toISOString() })
          .eq("room_id", activeRoomId)
          .eq("user_id", currentUser.id)

        // Update unread count locally
        setRooms((prev) =>
          prev.map((r) => r.id === activeRoomId ? { ...r, unread_count: 0 } : r)
        )
      }
    }

    load()
  }, [activeRoomId, supabase, currentUser])

  // ── Realtime subscription ──────────────────────────────────────────────────
  useEffect(() => {
    if (!activeRoomId || !currentUser) return
    const load = async () => {
        setLoadingMessages(true)
        setMessages([])
    }
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
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  // ── Send message ───────────────────────────────────────────────────────────
  const handleSend = useCallback(async (content: string, file?: File) => {
    if (!activeRoomId || !currentUser) return

    let fileUrl: string | null = null
    let fileName: string | null = null
    let fileType: string | null = null
    let fileSize: number | null = null

    // Upload file if present
    if (file) {
      const ext = file.name.split(".").pop()
      const path = `${currentUser.id}/${Date.now()}.${ext}`
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from("chat-attachments")
        .upload(path, file)

      if (uploadError) {
        toast.error("Failed to upload file")
        return
      }

      const { data: urlData } = supabase.storage
        .from("chat-attachments")
        .getPublicUrl(path)

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
      // Update room's last message locally
      setRooms((prev) =>
        prev.map((r) =>
          r.id === activeRoomId
            ? { ...r, last_message: content || fileName || "Attachment", last_message_at: new Date().toISOString() }
            : r
        )
      )
    }
  }, [activeRoomId, currentUser, replyTo, supabase])

  // ── Delete message ─────────────────────────────────────────────────────────
  const handleDelete = useCallback(async (msgId: string) => {
    const { error } = await supabase.from("chat_messages").delete().eq("id", msgId)
    if (error) toast.error("Failed to delete message")
  }, [supabase])

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
    <div className="flex h-[calc(100vh-120px)] rounded-xl border border-border overflow-hidden bg-card">

      {/* ── Sidebar ── */}
      <aside className="w-60 flex-shrink-0 flex flex-col border-r border-border bg-muted/20">
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

        <ScrollArea className="flex-1">
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
        </ScrollArea>
      </aside>

      {/* ── Main Chat Area ── */}
      <div className="flex flex-col flex-1 min-w-0">
        {activeRoom ? (
          <>
            {/* Chat header */}
            <div className="flex items-center gap-3 px-4 py-3 border-b border-border bg-card flex-shrink-0">
              <div className="flex items-center gap-2">
                {activeRoom.type === "direct" ? (
                  activeRoom.other_user ? (
                    <Avatar user={activeRoom.other_user} size="sm" />
                  ) : (
                    <MessageSquare className="h-4 w-4 text-muted-foreground" />
                  )
                ) : activeRoom.type === "project" ? (
                  <div className="w-7 h-7 rounded-full bg-emerald-500/20 flex items-center justify-center">
                    <FolderOpen className="h-3.5 w-3.5 text-emerald-600" />
                  </div>
                ) : (
                  <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center">
                    <Hash className="h-3.5 w-3.5 text-primary" />
                  </div>
                )}
                <div>
                  <h3 className="text-sm font-semibold">{activeRoom.display_name}</h3>
                  <p className="text-[10px] text-muted-foreground capitalize">
                    {activeRoom.type === "direct" ? "Direct message" : activeRoom.type === "project" ? "Project channel" : "Group channel"}
                  </p>
                </div>
              </div>
            </div>

            {/* Messages */}
            <ScrollArea className="flex-1 py-2">
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
                          <div className="flex items-center gap-3 px-4 py-3">
                            <div className="flex-1 h-px bg-border" />
                            <span className="text-[10px] font-medium text-muted-foreground px-2">
                              {isToday(new Date(msg.created_at))
                                ? "Today"
                                : isYesterday(new Date(msg.created_at))
                                ? "Yesterday"
                                : format(new Date(msg.created_at), "MMMM d, yyyy")}
                            </span>
                            <div className="flex-1 h-px bg-border" />
                          </div>
                        )}
                        <MessageBubble
                          msg={msg}
                          isOwn={msg.sender_id === currentUser?.id}
                          showAvatar={showAvatar}
                          onReply={setReplyTo}
                          onDelete={handleDelete}
                          currentUserId={currentUser?.id || ""}
                        />
                      </div>
                    )
                  })}
                  <div ref={messagesEndRef} />
                </div>
              )}
            </ScrollArea>

            {/* Input */}
            <MessageInput
              onSend={handleSend}
              replyTo={replyTo}
              onCancelReply={() => setReplyTo(null)}
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

      {/* Dialogs */}
      <NewDMDialog
        open={newDMOpen}
        onOpenChange={setNewDMOpen}
        people={people}
        onSelect={handleStartDM}
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