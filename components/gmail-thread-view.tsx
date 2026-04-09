"use client"

import { useState, useEffect, useRef } from "react"
import { createClient } from "@/lib/supabase/client"
import { format } from "date-fns"
import { differenceInDays } from "date-fns"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import { Loader2, X, Plus, ArrowUpRight, Sparkles, Brain, TrendingUp, AlertCircle, CheckCircle2 } from "lucide-react"


// ── Types ─────────────────────────────────────────────────────────────────────

interface GmailMessage {
  id: string
  threadId: string
  senderEmail: string
  senderName: string
  subject: string
  date: string
  internalDate: string
  body: string
  isUnread: boolean
}

interface ContactContext {
  type: "client" | "relationship"
  id?: string
  name: string
  email?: string
  company?: string
  role?: string
  projectName?: string
  hasPortalAccess?: boolean
  pipelineStage?: string
  dealValue?: number | null
  closeProbability?: number | null
  stageEnteredAt?: string | null
  lastEvent?: {
    id: string
    title: string
    start_time: string
    outcome: string | null
    purpose: string | null
  } | null
  linkedinUrl?: string | null
}

interface GmailThreadViewProps {
  threadId: string
  senderEmail: string
  senderName: string
  subject: string
  onClose: () => void
  onThreadSelect: (thread: { id: string; subject: string; senderEmail: string; senderName: string }) => void
  currentUser: { id: string; full_name: string; email?: string } | null
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const STAGE_LABELS: Record<string, string> = {
  new_lead: "New lead",
  contacted: "Contacted",
  meeting_booked: "Meeting booked",
  proposal: "Proposal sent",
  negotiating: "Negotiating",
  closed_won: "Closed · Won",
  closed_lost: "Closed · Lost",
}

function avatarInitials(name: string): string {
  const parts = name.trim().split(" ")
  return parts.length >= 2
    ? `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase()
    : (parts[0]?.[0] || "?").toUpperCase()
}

// Strip quoted reply lines (lines starting with ">") and "On ... wrote:" blocks
function stripQuoted(body: string): string {
  const lines = body.split("\n")
  const cleaned: string[] = []
  for (const line of lines) {
    if (line.trim().startsWith(">")) break
    if (/^On .+ wrote:/.test(line.trim())) break
    cleaned.push(line)
  }
  return cleaned.join("\n").trim()
}

// ── Contact context panel ─────────────────────────────────────────────────────

function ContactPanel({
  contact,
  loading,
  onCreateTask,
  taskCreating,
  onMoveStage,
  onLogOutcome,
  contactThreads,
  activeThreadId,
  onThreadSelect,
}: {
  contact: ContactContext | null
  loading: boolean
  onCreateTask: () => void
  taskCreating: boolean
  onMoveStage: () => void
  onLogOutcome: () => void
  contactThreads: Array<{ id: string; subject: string; snippet: string; date: string; unread: boolean }>
  activeThreadId: string
  onThreadSelect: (thread: { id: string; subject: string; senderEmail: string; senderName: string }) => void
}) {
  const [threadsOpen, setThreadsOpen] = useState(false)
  const daysInStage =
    contact?.stageEnteredAt
      ? differenceInDays(new Date(), new Date(contact.stageEnteredAt))
      : null

  return (
    <div className="w-[220px] flex-shrink-0 border-l border-border/40 flex flex-col overflow-y-auto bg-muted/10">
      {/* Header */}
      <div className="px-4 pt-4 pb-3 border-b border-border/40">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-3">
          Contact context
        </p>

        {loading ? (
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2 size={12} className="animate-spin" />
            <span className="text-xs">Matching contact…</span>
          </div>
        ) : contact ? (
          <>
            <div className="w-9 h-9 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center text-xs font-semibold">
              {avatarInitials(contact.name)}
            </div>
            <div className="mt-2 font-semibold text-sm text-foreground leading-tight">
              {contact.name}
            </div>
            {(contact.role || contact.company) && (
              <div className="text-[11px] text-muted-foreground mt-0.5">
                {[contact.role, contact.company].filter(Boolean).join(" · ")}
              </div>
            )}
            {contact.type === "relationship" && contact.pipelineStage && (
              <div className="mt-2 inline-flex items-center text-[10px] px-2 py-1 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/20">
                {STAGE_LABELS[contact.pipelineStage] || contact.pipelineStage}
              </div>
            )}
            {contact.type === "client" && contact.projectName && (
              <div className="mt-2 inline-flex items-center text-[10px] px-2 py-1 rounded-full bg-blue-500/15 text-blue-400 border border-blue-500/20">
                {contact.projectName}
              </div>
            )}
          </>
        ) : (
          <p className="text-[11px] text-muted-foreground">
            No match in your CRM
          </p>
        )}
      </div>

      {/* Deal snapshot — relationships only */}
      {contact?.type === "relationship" &&
        (contact.dealValue || contact.closeProbability || daysInStage !== null) && (
          <div className="px-4 py-3 border-b border-border/40 space-y-2">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-2">
              Deal snapshot
            </p>
            {contact.dealValue ? (
              <div className="flex justify-between">
                <span className="text-[11px] text-muted-foreground">Deal value</span>
                <span className="text-[11px] font-semibold text-foreground">
                  ${contact.dealValue.toLocaleString()}
                </span>
              </div>
            ) : null}
            {contact.closeProbability != null && (
              <div className="flex justify-between">
                <span className="text-[11px] text-muted-foreground">Close probability</span>
                <span className="text-[11px] font-semibold text-foreground">
                  {contact.closeProbability}%
                </span>
              </div>
            )}
            {daysInStage !== null && (
              <div className="flex justify-between">
                <span className="text-[11px] text-muted-foreground">Days in stage</span>
                <span
                  className={cn(
                    "text-[11px] font-semibold",
                    daysInStage > 7 ? "text-amber-400" : "text-foreground"
                  )}
                >
                  {daysInStage}d
                </span>
              </div>
            )}
          </div>
        )}

      {/* Last meeting note */}
      {contact?.type === "relationship" && contact.lastEvent && (
        <div className="px-4 py-3 border-b border-border/40">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-2">
            Last meeting note
          </p>
          <div className="bg-muted/50 rounded-lg p-2.5 border border-border/40">
            <div className="text-[10px] text-muted-foreground mb-1">
              {format(new Date(contact.lastEvent.start_time), "MMM d")} ·{" "}
              {contact.lastEvent.title}
            </div>
            <div className="text-[11px] text-foreground leading-relaxed">
              {contact.lastEvent.outcome ||
                contact.lastEvent.purpose ||
                "No notes recorded"}
            </div>
          </div>
        </div>
      )}

      {/* All threads from this contact */}
      {contact && contactThreads.length > 0 && (
        <div className="border-t border-border/40">
          <button
            onClick={() => setThreadsOpen(v => !v)}
            className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-muted/30 transition-colors"
          >
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                All threads
              </span>
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground border border-border/40">
                {contactThreads.length}
              </span>
            </div>
            <span
              className={cn(
                "text-[10px] text-muted-foreground transition-transform duration-200",
                threadsOpen && "rotate-180 inline-block"
              )}
            >
              ▾
            </span>
          </button>

          {threadsOpen && (
            <div className="border-t border-border/40">
              {contactThreads.map((t) => {
                const isActive = t.id === activeThreadId
                return (
                  <button
                    key={t.id}
                    onClick={() =>
                      !isActive &&
                      onThreadSelect({
                        id: t.id,
                        subject: t.subject,
                        senderEmail: contact.email || "",
                        senderName: contact.name,
                      })
                    }
                    className={cn(
                      "w-full text-left px-4 py-2.5 border-b border-border/30 last:border-0 transition-colors",
                      isActive
                        ? "border-l-2 border-l-foreground pl-[14px] bg-muted/20"
                        : "hover:bg-muted/30 cursor-pointer"
                    )}
                  >
                    <div className="flex items-center justify-between gap-2 mb-0.5">
                      <div className="flex items-center gap-1.5 min-w-0">
                        {t.unread && (
                          <span className="w-1.5 h-1.5 rounded-full bg-blue-400 flex-shrink-0" />
                        )}
                        <span
                          className={cn(
                            "text-[11px] truncate",
                            isActive
                              ? "font-medium text-foreground"
                              : "text-muted-foreground",
                            t.unread && "font-medium text-foreground"
                          )}
                        >
                          {t.subject || "(no subject)"}
                        </span>
                      </div>
                      <span className="text-[10px] text-muted-foreground flex-shrink-0">
                        {t.date
                          ? new Date(t.date).toLocaleDateString("en-US", {
                              month: "short",
                              day: "numeric",
                            })
                          : ""}
                      </span>
                    </div>
                    <div className="text-[10px] text-muted-foreground truncate pl-0">
                      {t.snippet}
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* Actions */}
      {contact && (
        <div className="px-4 py-3 space-y-2">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-2">
            Actions
          </p>
          <button
            onClick={onCreateTask}
            disabled={taskCreating}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg border border-border/50 bg-background text-foreground text-xs font-medium hover:bg-muted/50 hover:border-border transition-colors"
          >
            {taskCreating ? (
              <Loader2 size={11} className="animate-spin" />
            ) : (
              <Plus size={11} />
            )}
            Create follow-up task
          </button>

          {contact.type === "relationship" && (
            <>
              <button
                onClick={onMoveStage}
                className="w-full flex items-center gap-2 px-3 py-2 rounded-lg border border-border/50 bg-background text-foreground text-xs font-medium hover:bg-muted/50 hover:border-border transition-colors"
              >
                <span className="text-[11px]">◯</span> Move to next stage
              </button>
              <button
                className="w-full flex items-center gap-2 px-3 py-2 rounded-lg border border-border/50 bg-background text-foreground text-xs font-medium hover:bg-muted/50 hover:border-border transition-colors"
              >
                <span className="text-[11px]">⊟</span> Schedule a meeting
              </button>
              <button
                onClick={onLogOutcome}
                className="w-full flex items-center gap-2 px-3 py-2 rounded-lg border border-border/50 bg-background text-foreground text-xs font-medium hover:bg-muted/50 hover:border-border transition-colors"
              >
                <span className="text-[11px]">≡</span> Log meeting outcome
              </button>
            </>
          )}

          {contact.linkedinUrl && (
            <a
              href={contact.linkedinUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full flex items-center gap-2 px-3 py-2 rounded-lg border border-border/50 bg-background text-foreground text-xs font-medium hover:bg-muted/50 hover:border-border transition-colors"
            >
              <span className="text-[11px]">in</span> View LinkedIn
              <ArrowUpRight size={10} className="ml-auto text-muted-foreground" />
            </a>
          )}
        </div>
      )}
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export function GmailThreadView({
  threadId,
  senderEmail,
  senderName,
  subject,
  onClose,
  onThreadSelect,
  currentUser,
}: GmailThreadViewProps) {
  const supabase = createClient()
  const [messages, setMessages] = useState<GmailMessage[]>([])
  const [contact, setContact] = useState<ContactContext | null>(null)
  const [loadingMessages, setLoadingMessages] = useState(true)
  const [loadingContact, setLoadingContact] = useState(true)
  const [replyText, setReplyText] = useState("")
  const [sending, setSending] = useState(false)
  const [taskCreating, setTaskCreating] = useState(false)
  const [draftLoading, setDraftLoading] = useState(false)
  const replyTextareaRef = useRef<HTMLTextAreaElement>(null)
  const [analyzing, setAnalyzing] = useState(false)
  const [analysisResult, setAnalysisResult] = useState<{
    analysis: {
      intent: string
      sentiment: string
      summary: string
    }
    score_before: number
    score_after: number
    stage_changed: { from: string; to: string } | null
    tasks_created: Array<{ id: string; title: string }>
  } | null>(null)
  const [contactThreads, setContactThreads] = useState<Array<{
    id: string
    subject: string
    snippet: string
    date: string
    unread: boolean
  }>>([])
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    loadThread()
    loadContact()
    setContactThreads([])
  }, [threadId])

  const loadContactThreads = async (email: string) => {
    try {
      const res = await fetch(
        `/api/gmail/threads?from=${encodeURIComponent(email)}`
      )
      if (!res.ok) {
        setContactThreads([])
        return
      }
      const data = await res.json()
      const threads = Array.isArray(data.threads) ? data.threads.filter((t: any) => 
        t && typeof t.id === "string"
      ).map((t: any) => ({
        id: t.id,
        subject: t.subject || "(no subject)",
        snippet: t.snippet || "",
        date: t.date || "",
        unread: Boolean(t.unread),
      })) : []
      setContactThreads(threads)
    } catch {
      setContactThreads([])
    }
  }

  useEffect(() => {
    if (!loadingMessages) {
      bottomRef.current?.scrollIntoView({ behavior: "instant" })
    }
  }, [loadingMessages])

  const handleAIDraft = async () => {
    setDraftLoading(true)
    try {
      const res = await fetch("/api/ai/draft-reply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          thread_id: threadId,
          relationship_id: contact?.id || null,
          tone: "professional",
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      const draft = data.draft || ""
      setReplyText(draft)
      // Auto-resize textarea and focus it so user can see + send
      setTimeout(() => {
        const el = replyTextareaRef.current
        if (el) {
          el.style.height = "auto"
          el.style.height = `${Math.min(el.scrollHeight, 200)}px`
          el.focus()
          el.setSelectionRange(draft.length, draft.length)
        }
      }, 30)
      toast.success("Draft ready — review and send")
    } catch (err: any) {
      toast.error(err.message || "Failed to draft reply")
    } finally {
      setDraftLoading(false)
    }
  }

  const handleAnalyze = async () => {
    if (!contact?.id) { toast.error("No CRM contact linked to this email"); return }
    setAnalyzing(true)
    try {
      const res = await fetch("/api/ai/analyze-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ thread_id: threadId, relationship_id: contact.id }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setAnalysisResult({
        analysis: data.analysis,
        score_before: data.score_before,
        score_after: data.score_after,
        stage_changed: data.stage_changed,
        tasks_created: data.tasks_created || [],
      })
      if (data.stage_changed) {
        toast.success(`Stage updated: ${data.stage_changed.from.replace(/_/g, " ")} → ${data.stage_changed.to.replace(/_/g, " ")}`)
      } else {
        toast.success("Email analyzed")
      }
      if (data.tasks_created?.length > 0) {
        toast.success(`Auto-created ${data.tasks_created.length} task(s)`)
      }
    } catch (err: any) {
      toast.error(err.message || "Analysis failed")
    } finally {
      setAnalyzing(false)
    }
  }

  const loadThread = async () => {
    setLoadingMessages(true)
    try {
      const res = await fetch(`/api/gmail/thread/${threadId}`)
      const data = await res.json()
      setMessages(data.messages || [])
    } catch {
      toast.error("Failed to load email thread")
    } finally {
      setLoadingMessages(false)
    }
  }

  const loadContact = async () => {
    setLoadingContact(true)
    try {
      const params = new URLSearchParams({ email: senderEmail, name: senderName })
      const res = await fetch(`/api/gmail/contact?${params}`)
      const data = await res.json()
      setContact(data.contact)
      if (data.contact) {
        loadContactThreads(senderEmail)
      }
    } finally {
      setLoadingContact(false)
    }
  }

  const handleReply = async () => {
    if (!replyText.trim()) return
    setSending(true)
    try {
      const lastMsg = messages[messages.length - 1]
      const res = await fetch("/api/gmail/reply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          threadId,
          to: senderEmail,
          subject,
          body: replyText,
          messageId: lastMsg?.id,
        }),
      })
      if (!res.ok) throw new Error()
      toast.success("Reply sent via Gmail")
      setReplyText("")
      setTimeout(async () => {
        setLoadingMessages(true)
        try {
          const res = await fetch(`/api/gmail/thread/${threadId}`)
          const data = await res.json()
          setMessages(data.messages || [])
        } catch {
          toast.error("Failed to reload thread")
        } finally {
          setLoadingMessages(false)
        }
      }, 2000)
    } catch {
      toast.error("Failed to send reply")
    } finally {
      setSending(false)
    }
  }

  const handleCreateTask = async () => {
    setTaskCreating(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error()
      const { error } = await supabase.from("tasks").insert({
        user_id: user.id,
        created_by: user.id,
        title: `Follow up: ${subject}`,
        notes: `Email from ${senderName} (${senderEmail})\n\nThread: ${subject}`,
        bucket: "today",
        priority: "medium",
        status: "todo",
        is_completed: false,
      })
      if (error) throw error
      toast.success("Task created from email")
    } catch {
      toast.error("Failed to create task")
    } finally {
      setTaskCreating(false)
    }
  }

  const handleMoveStage = async () => {
    if (!contact?.id || contact.type !== "relationship") return
    const stages = [
      "new_lead", "contacted", "meeting_booked",
      "proposal", "negotiating", "closed_won",
    ]
    const currentIdx = stages.indexOf(contact.pipelineStage || "new_lead")
    const nextStage = stages[Math.min(currentIdx + 1, stages.length - 1)]
    await supabase
      .from("relationships")
      .update({ pipeline_stage: nextStage, stage_entered_at: new Date().toISOString() })
      .eq("id", contact.id)
    toast.success(`Moved to ${STAGE_LABELS[nextStage]}`)
    setContact((prev) => prev ? { ...prev, pipelineStage: nextStage } : prev)
  }

  const handleLogOutcome = async () => {
    if (!contact?.id || contact.type !== "relationship") return
    const outcome = window.prompt("Meeting outcome:")
    if (!outcome) return
    const { data: event } = await supabase
      .from("events")
      .select("id")
      .eq("relationship_id", contact.id)
      .order("start_time", { ascending: false })
      .limit(1)
      .maybeSingle()
    if (event) {
      await supabase.from("events").update({ outcome }).eq("id", event.id)
      toast.success("Outcome logged")
    } else {
      toast.error("No meeting found to log outcome for")
    }
  }

  return (
    <div className="flex flex-1 min-w-0 min-h-0 overflow-hidden">
      {/* Thread column */}
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        {/* Header */}
        <div className="px-5 py-3 border-b border-border/40 flex items-start gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-foreground truncate">
                {subject}
              </span>
              <span className="text-[9px] px-1.5 py-0.5 rounded bg-red-500/15 text-red-400 border border-red-500/20 font-semibold shrink-0">
                Gmail
              </span>
            </div>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              {senderName} · {senderEmail}
              {contact && (
                <span>
                  {" "}· matched →{" "}
                  <span className="text-foreground">{contact.name}</span>
                </span>
              )}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {contact?.id && (
              <button
                onClick={handleAnalyze}
                disabled={analyzing}
                className="h-7 px-3 text-xs rounded-md border border-violet-500/30 bg-violet-500/10 text-violet-400 hover:bg-violet-500/20 transition-colors flex items-center gap-1.5"
              >
                {analyzing ? <Loader2 size={11} className="animate-spin" /> : <Brain size={11} />}
                {analyzing ? "Analyzing…" : "AI Analyze"}
              </button>
            )}
            <button
              onClick={handleCreateTask}
              disabled={taskCreating}
              className="h-7 px-3 text-xs rounded-md border border-border/60 bg-transparent text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors flex items-center gap-1.5"
            >
              {taskCreating ? <Loader2 size={11} className="animate-spin" /> : <Plus size={11} />}
              Create task
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded hover:bg-muted/50 text-muted-foreground hover:text-foreground transition-colors"
            >
              <X size={14} />
            </button>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto py-4 px-5 space-y-5">
          {loadingMessages ? (
            <div className="flex items-center justify-center h-32">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : (
            messages.map((msg) => {
              const isMe =
                currentUser?.email &&
                msg.senderEmail.toLowerCase() === currentUser.email.toLowerCase()
              const cleanBody = stripQuoted(msg.body)
              const timestamp = msg.internalDate
                ? format(new Date(parseInt(msg.internalDate)), "MMM d, h:mm a")
                : msg.date

              return (
                <div
                  key={msg.id}
                  className={cn("flex gap-3", isMe && "flex-row-reverse")}
                >
                  <div
                    className={cn(
                      "w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-semibold flex-shrink-0",
                      isMe
                        ? "bg-blue-500/20 text-blue-400"
                        : "bg-emerald-500/20 text-emerald-400"
                    )}
                  >
                    {avatarInitials(isMe ? (currentUser?.full_name || "Me") : msg.senderName)}
                  </div>
                  <div
                    className={cn(
                      "flex flex-col max-w-[72%]",
                      isMe && "items-end"
                    )}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-[11px] font-medium text-foreground">
                        {isMe ? "You" : msg.senderName}
                      </span>
                      <span className="text-[10px] text-muted-foreground">
                        {timestamp}
                      </span>
                    </div>
                    <div
                      className={cn(
                        "text-sm leading-relaxed px-3.5 py-2.5 rounded-2xl whitespace-pre-wrap break-words",
                        isMe
                          ? "text-white rounded-br-sm"
                          : "bg-muted text-foreground rounded-bl-sm"
                      )}
                      style={
                        isMe
                          ? {
                              background:
                                "linear-gradient(135deg, #5B5BD6 0%, #7C3AED 100%)",
                            }
                          : undefined
                      }
                    >
                      {cleanBody || msg.body}
                    </div>
                  </div>
                </div>
              )
            })
          )}
          <div ref={bottomRef} />
        </div>

        {/* Reply bar */}
        <div className="px-5 pb-4 pt-2 border-t border-border/40">
          {/* AI analysis result banner */}
          {analysisResult && (
            <div className="mb-2 px-3 py-2.5 rounded-xl border border-violet-500/20 bg-violet-500/5 space-y-1.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Brain size={12} className="text-violet-400" />
                  <span className="text-[11px] font-semibold text-violet-300">AI Analysis</span>
                </div>
                <button onClick={() => setAnalysisResult(null)} className="text-muted-foreground/40 hover:text-muted-foreground">
                  <X size={11} />
                </button>
              </div>
              <p className="text-[11px] text-muted-foreground/80 leading-relaxed">{analysisResult.analysis?.summary}</p>
              <div className="flex flex-wrap gap-1.5">
                <span className={cn("text-[10px] px-2 py-0.5 rounded-full border font-medium capitalize", {
                  "bg-emerald-500/15 text-emerald-400 border-emerald-500/20": analysisResult.analysis?.sentiment === "positive",
                  "bg-red-500/15 text-red-400 border-red-500/20": analysisResult.analysis?.sentiment === "negative",
                  "bg-zinc-500/10 text-zinc-400 border-zinc-500/15": analysisResult.analysis?.sentiment === "neutral",
                })}>
                  {analysisResult.analysis?.sentiment} sentiment
                </span>
                <span className="text-[10px] px-2 py-0.5 rounded-full border font-medium bg-blue-500/15 text-blue-400 border-blue-500/20 capitalize">
                  {analysisResult.analysis?.intent?.replace(/_/g, " ")}
                </span>
                {analysisResult.score_after !== analysisResult.score_before && (
                  <span className={cn("text-[10px] px-2 py-0.5 rounded-full border font-medium flex items-center gap-1", {
                    "bg-emerald-500/15 text-emerald-400 border-emerald-500/20": analysisResult.score_after > analysisResult.score_before,
                    "bg-red-500/15 text-red-400 border-red-500/20": analysisResult.score_after < analysisResult.score_before,
                  })}>
                    <TrendingUp size={8} />
                    Score {analysisResult.score_before} → {analysisResult.score_after}
                  </span>
                )}
                {analysisResult.stage_changed && (
                  <span className="text-[10px] px-2 py-0.5 rounded-full border font-medium bg-amber-500/15 text-amber-400 border-amber-500/20">
                    Stage → {analysisResult.stage_changed.to.replace(/_/g, " ")}
                  </span>
                )}
              </div>
              {analysisResult.tasks_created?.length > 0 && (
                <div className="flex items-center gap-1.5 text-[10px] text-emerald-400">
                  <CheckCircle2 size={10} />
                  Auto-created: "{analysisResult.tasks_created[0].title}"
                </div>
              )}
            </div>
          )}
          <div className="flex items-end gap-2">
            <textarea
              ref={replyTextareaRef}
              value={replyText}
              onChange={(e) => {
                setReplyText(e.target.value)
                e.target.style.height = "auto"
                e.target.style.height = `${Math.min(e.target.scrollHeight, 200)}px`
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleReply()
              }}
              placeholder="Reply via Gmail… (⌘↵ to send)"
              rows={2}
              className="flex-1 bg-muted/40 border border-border/60 rounded-xl px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/50 resize-none outline-none focus:border-border transition-colors"
            />
            <div className="flex flex-col gap-1.5 shrink-0">
              <button
                onClick={handleAIDraft}
                disabled={draftLoading}
                title="AI Draft Reply"
                className="h-9 px-3 text-xs font-medium rounded-xl border border-violet-500/30 bg-violet-500/10 text-violet-400 hover:bg-violet-500/20 disabled:opacity-40 transition-colors flex items-center gap-1.5"
              >
                {draftLoading ? <Loader2 size={11} className="animate-spin" /> : <Sparkles size={11} />}
                {draftLoading ? "Drafting…" : "AI Draft"}
              </button>
              <button
                onClick={handleReply}
                disabled={sending || !replyText.trim()}
                className="h-9 px-4 text-xs font-medium rounded-xl bg-foreground text-background disabled:opacity-40 hover:opacity-85 transition-opacity flex items-center gap-1.5"
              >
                {sending && <Loader2 size={11} className="animate-spin" />}
                Send
              </button>
            </div>
          </div>
          <p className="text-[10px] text-muted-foreground mt-1.5">
            Replies are sent from your connected Gmail account · <button onClick={handleAnalyze} disabled={analyzing || !contact?.id} className="underline hover:text-foreground disabled:opacity-40">AI analyze this thread</button>
          </p>
        </div>
      </div>

      {/* Contact context panel */}
      <ContactPanel
        contact={contact}
        loading={loadingContact}
        onCreateTask={handleCreateTask}
        taskCreating={taskCreating}
        onMoveStage={handleMoveStage}
        onLogOutcome={handleLogOutcome}
        contactThreads={contactThreads}
        activeThreadId={threadId}
        onThreadSelect={onThreadSelect}
      />
    </div>
  )
}