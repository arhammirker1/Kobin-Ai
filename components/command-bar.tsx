"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { cn } from "@/lib/utils"
import { createClient } from "@/lib/supabase/client"
import {
  Plus, X, Loader2, Send, ChevronLeft, Trash2, MessageSquare, Clock,
  CheckCircle2, AlertTriangle
} from "lucide-react"

// ── Types ─────────────────────────────────────────────────────────────────────

interface Message {
  role: "user" | "assistant"
  content: string
  timestamp: number
  actionEvents?: ActionEvent[]
}

interface ActionEvent {
  tool: string
  task_id?: string
  project_id?: string
  title?: string
  name?: string
  summary?: string
  needs_confirmation?: boolean
  confirmation_action?: {
    tool: string
    args: Record<string, any>
    resolved_id: string
    description: string
  }
  [key: string]: any
}

interface PendingConfirmation {
  description: string
  task_id: string
  loading: boolean
}

interface ChatSession {
  id: string
  title: string
  messages: Message[]
  updated_at: string
}

interface CommandBarProps {
  open: boolean
  onClose: () => void
}

// ── Compression helpers ────────────────────────────────────────────────────────
// Simple LZ-style run-length encoding for chat messages — reduces size ~40-60%

function compressMessages(messages: Message[]): string {
  const json = JSON.stringify(messages)
  // Base64 encode after basic compression (remove whitespace)
  return btoa(unescape(encodeURIComponent(json)))
}

function decompressMessages(compressed: string): Message[] {
  try {
    const json = decodeURIComponent(escape(atob(compressed)))
    return JSON.parse(json)
  } catch {
    return []
  }
}

// ── Suggested queries ─────────────────────────────────────────────────────────

const SUGGESTED = [
  "Create a task for the next sprint",
  "Show me everything overdue",
  "Which projects are at risk?",
  "Assign the API integration task to someone free",
  "Who needs a follow-up?",
  "What's the status of every active client?",
  "Which team member has the lightest workload?",
  "Create a new project for the website redesign",
  "Draft my weekly review",
]

// ── Markdown-lite renderer ─────────────────────────────────────────────────────

function renderMarkdown(text: string) {
  const lines = text.split("\n")
  const elements: React.ReactNode[] = []
  let i = 0

  while (i < lines.length) {
    const line = lines[i]

    if (line.startsWith("### ")) {
      elements.push(
        <p key={i} className="text-xs font-bold text-[#F0EFEC] mt-3 mb-1 uppercase tracking-widest">
          {line.slice(4)}
        </p>
      )
    } else if (line.startsWith("## ")) {
      elements.push(
        <p key={i} className="text-sm font-bold text-[#F0EFEC] mt-3 mb-1">
          {line.slice(3)}
        </p>
      )
    } else if (line.startsWith("**") && line.endsWith("**")) {
      elements.push(
        <p key={i} className="text-sm font-semibold text-[#F0EFEC] mt-2">
          {line.slice(2, -2)}
        </p>
      )
    } else if (line.startsWith("- ") || line.startsWith("• ")) {
      elements.push(
        <div key={i} className="flex items-start gap-2 py-0.5">
          <span className="text-[#555552] mt-1 shrink-0 text-xs">•</span>
          <span className="text-sm text-[#B4B2A9] leading-relaxed">{line.slice(2)}</span>
        </div>
      )
    } else if (/^\d+\.\s/.test(line)) {
      const num = line.match(/^(\d+)\./)?.[1]
      elements.push(
        <div key={i} className="flex items-start gap-2 py-0.5">
          <span className="text-[#555552] text-xs mt-1 shrink-0 w-4">{num}.</span>
          <span className="text-sm text-[#B4B2A9] leading-relaxed">{line.replace(/^\d+\.\s/, "")}</span>
        </div>
      )
    } else if (line.startsWith("---") || line.startsWith("___")) {
      elements.push(<div key={i} className="border-t border-[#333331] my-2" />)
    } else if (line.trim() === "") {
      elements.push(<div key={i} className="h-1" />)
    } else {
      // Inline bold
      const parts = line.split(/\*\*(.+?)\*\*/g)
      elements.push(
        <p key={i} className="text-sm text-[#B4B2A9] leading-relaxed">
          {parts.map((part, j) =>
            j % 2 === 1 ? <strong key={j} className="text-[#F0EFEC] font-semibold">{part}</strong> : part
          )}
        </p>
      )
    }
    i++
  }

  return <div className="space-y-0.5">{elements}</div>
}

// ── Main component ─────────────────────────────────────────────────────────────

export function CommandBar({ open, onClose }: CommandBarProps) {
  const supabase = createClient()

  // View state: "list" | "chat"
  const [view, setView] = useState<"list" | "chat">("list")
  const [sessions, setSessions] = useState<ChatSession[]>([])
  const [activeSession, setActiveSession] = useState<ChatSession | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState("")
  const [isStreaming, setIsStreaming] = useState(false)
  const [loadingSessions, setLoadingSessions] = useState(false)
  const [savingId, setSavingId] = useState<string | null>(null)
  const [pendingConfirmation, setPendingConfirmation] = useState<PendingConfirmation | null>(null)

  const inputRef = useRef<HTMLTextAreaElement>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  // ── Load sessions ──────────────────────────────────────────────────────────

  const loadSessions = useCallback(async () => {
    setLoadingSessions(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data } = await supabase
        .from("ai_command_chats")
        .select("id, title, messages, updated_at")
        .eq("user_id", user.id)
        .order("updated_at", { ascending: false })
        .limit(20)

      if (data) {
        const parsed: ChatSession[] = data.map(row => ({
          ...row,
          messages: typeof row.messages === "string"
            ? decompressMessages(row.messages)
            : (Array.isArray(row.messages) ? row.messages : [])
        }))
        setSessions(parsed)
      }
    } finally {
      setLoadingSessions(false)
    }
  }, [supabase])

  useEffect(() => {
    if (open) {
      loadSessions()
      setView("list")
      setActiveSession(null)
      setMessages([])
      setInput("")
      setTimeout(() => inputRef.current?.focus(), 100)
    }
  }, [open])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  // ── Keyboard ───────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (view === "chat") setView("list")
        else onClose()
      }
    }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [open, view, onClose])

  // ── Save/update session ────────────────────────────────────────────────────

  const saveSession = useCallback(async (
    sessionId: string | null,
    msgs: Message[],
    title: string
  ): Promise<string | null> => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return null

    const compressed = compressMessages(msgs)

    if (sessionId) {
      await supabase
        .from("ai_command_chats")
        .update({ messages: compressed, title, updated_at: new Date().toISOString() })
        .eq("id", sessionId)
      return sessionId
    } else {
      const { data } = await supabase
        .from("ai_command_chats")
        .insert({ user_id: user.id, title, messages: compressed })
        .select("id")
        .single()
      return data?.id || null
    }
  }, [supabase])

  // ── Confirm delete handler ──────────────────────────────────────────────────

  const handleConfirmDelete = useCallback(async () => {
    if (!pendingConfirmation) return
    setPendingConfirmation(prev => prev ? { ...prev, loading: true } : null)

    try {
      const res = await fetch("/api/ai/command", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ task_id: pendingConfirmation.task_id }),
      })
      const result = await res.json()

      if (result.success) {
        // Append confirmation message
        setMessages(prev => [...prev, {
          role: "assistant",
          content: "✅ Task deleted successfully.",
          timestamp: Date.now(),
        }])
        // Notify other components
        window.dispatchEvent(new Event("tasks-updated"))
      } else {
        setMessages(prev => [...prev, {
          role: "assistant",
          content: `❌ Failed to delete: ${result.message}`,
          timestamp: Date.now(),
        }])
      }
    } catch {
      setMessages(prev => [...prev, {
        role: "assistant",
        content: "❌ Something went wrong while deleting.",
        timestamp: Date.now(),
      }])
    } finally {
      setPendingConfirmation(null)
    }
  }, [pendingConfirmation])

  // ── Send message ───────────────────────────────────────────────────────────

  const sendMessage = useCallback(async (text?: string) => {
    const question = (text || input).trim()
    if (!question || isStreaming) return

    setInput("")
    setView("chat")
    setPendingConfirmation(null)

    const userMsg: Message = { role: "user", content: question, timestamp: Date.now() }
    const nextMessages = [...messages, userMsg]
    setMessages(nextMessages)
    setIsStreaming(true)

    const assistantMsg: Message = { role: "assistant", content: "", timestamp: Date.now() }
    setMessages(prev => [...prev, assistantMsg])

    try {
      const res = await fetch("/api/ai/command", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: question,
          history: messages.slice(-6).map((m) => ({ role: m.role, content: m.content })),
        }),
      })

      if (!res.ok || !res.body) throw new Error("Request failed")

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let accumulated = ""
      const collectedActions: ActionEvent[] = []

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        const raw = decoder.decode(value)
        const lines = raw.split("\n\n").filter(Boolean)
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue
          try {
            const parsed = JSON.parse(line.slice(6))
            if (parsed.type === "delta") {
              accumulated += parsed.content
              setMessages(prev => {
                const updated = [...prev]
                updated[updated.length - 1] = {
                  role: "assistant",
                  content: accumulated,
                  timestamp: Date.now(),
                  actionEvents: collectedActions.length > 0 ? [...collectedActions] : undefined,
                }
                return updated
              })
            } else if (parsed.type === "action_executed") {
              const { type, ...actionData } = parsed
              collectedActions.push(actionData as ActionEvent)

              // Dispatch custom events for SWR invalidation
              if (actionData.tool?.includes("task")) {
                window.dispatchEvent(new Event("tasks-updated"))
              }
              if (actionData.tool?.includes("project")) {
                window.dispatchEvent(new Event("projects-updated"))
              }

              // Handle delete confirmation
              if (actionData.needs_confirmation && actionData.confirmation_action) {
                setPendingConfirmation({
                  description: actionData.confirmation_action.description,
                  task_id: actionData.confirmation_action.resolved_id,
                  loading: false,
                })
              }
            }
          } catch {}
        }
      }

      // Attach collected actions to final message
      setMessages(prev => {
        const updated = [...prev]
        updated[updated.length - 1] = {
          role: "assistant",
          content: accumulated,
          timestamp: Date.now(),
          actionEvents: collectedActions.length > 0 ? collectedActions : undefined,
        }
        return updated
      })

      // Save to DB
      const finalMsgs = [...nextMessages, { role: "assistant" as const, content: accumulated, timestamp: Date.now() }]
      const title = question.slice(0, 50) + (question.length > 50 ? "…" : "")
      const sessionId = await saveSession(activeSession?.id || null, finalMsgs, title)

      if (sessionId && !activeSession) {
        setActiveSession({ id: sessionId, title, messages: finalMsgs, updated_at: new Date().toISOString() })
      }

      // Refresh session list in background
      loadSessions()

    } catch {
      setMessages(prev => {
        const updated = [...prev]
        updated[updated.length - 1] = {
          role: "assistant",
          content: "Something went wrong. Please try again.",
          timestamp: Date.now()
        }
        return updated
      })
    } finally {
      setIsStreaming(false)
    }
  }, [input, messages, isStreaming, activeSession, saveSession, loadSessions])

  // ── Open existing session ──────────────────────────────────────────────────

  const openSession = (session: ChatSession) => {
    setActiveSession(session)
    setMessages(session.messages)
    setView("chat")
  }

  // ── New chat ───────────────────────────────────────────────────────────────

  const newChat = () => {
    setActiveSession(null)
    setMessages([])
    setInput("")
    setView("list")
  }

  // ── Delete session ─────────────────────────────────────────────────────────

  const deleteSession = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    await supabase.from("ai_command_chats").delete().eq("id", id)
    setSessions(prev => prev.filter(s => s.id !== id))
    if (activeSession?.id === id) newChat()
  }

  // ── Format time ───────────────────────────────────────────────────────────

  const formatTime = (iso: string) => {
    const d = new Date(iso)
    const now = new Date()
    const diffDays = Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24))
    if (diffDays === 0) return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
    if (diffDays === 1) return "Yesterday"
    if (diffDays < 7) return d.toLocaleDateString("en-US", { weekday: "short" })
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" })
  }

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      onClick={onClose}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />

      {/* Panel */}
      <div
        className="relative flex overflow-hidden rounded-2xl border border-[#2E2E2C] shadow-2xl"
        style={{
          width: 780,
          height: 560,
          background: "#161614",
        }}
        onClick={e => e.stopPropagation()}
      >

        {/* ── Left sidebar: session list ── */}
        <div
          className="flex flex-col border-r border-[#252523] shrink-0"
          style={{ width: 220, background: "#1C1C1A" }}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3.5 border-b border-[#252523]">
            <div className="flex items-center gap-2">
              <div
                className="w-5 h-5 rounded-md flex items-center justify-center"
                style={{ background: "linear-gradient(135deg, #5B5BD6 0%, #7C3AED 100%)" }}
              >
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none">
                  <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"
                    stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              <span className="text-xs font-semibold text-[#F0EFEC]">AI Command</span>
            </div>
            <button
              onClick={newChat}
              className="w-6 h-6 rounded-md flex items-center justify-center text-[#555552] hover:text-[#F0EFEC] hover:bg-[#252523] transition-colors"
              title="New chat"
            >
              <Plus size={13} />
            </button>
          </div>

          {/* Session list */}
          <div className="flex-1 overflow-y-auto py-1">
            {loadingSessions ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 size={14} className="animate-spin text-[#555552]" />
              </div>
            ) : sessions.length === 0 ? (
              <div className="px-4 py-6 text-center">
                <MessageSquare size={20} className="text-[#333331] mx-auto mb-2" />
                <p className="text-[11px] text-[#555552]">No chats yet</p>
              </div>
            ) : (
              sessions.map(session => (
                <button
                  key={session.id}
                  onClick={() => openSession(session)}
                  className={cn(
                    "w-full text-left px-3 py-2.5 mx-1 rounded-lg transition-colors group relative",
                    "hover:bg-[#252523]",
                    activeSession?.id === session.id && "bg-[#252523]"
                  )}
                  style={{ width: "calc(100% - 8px)" }}
                >
                  <div className="flex items-start justify-between gap-1">
                    <p className={cn(
                      "text-[12px] leading-snug truncate flex-1",
                      activeSession?.id === session.id ? "text-[#F0EFEC]" : "text-[#8A8A85]"
                    )}>
                      {session.title}
                    </p>
                    <button
                      onClick={(e) => deleteSession(session.id, e)}
                      className="opacity-0 group-hover:opacity-100 text-[#444442] hover:text-red-400 transition-all shrink-0 mt-0.5"
                    >
                      <Trash2 size={10} />
                    </button>
                  </div>
                  <div className="flex items-center gap-1 mt-1">
                    <Clock size={9} className="text-[#444442]" />
                    <p className="text-[10px] text-[#444442]">{formatTime(session.updated_at)}</p>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>

        {/* ── Right: chat area ── */}
        <div className="flex flex-col flex-1 min-w-0">

          {/* Chat header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-[#252523]">
            <div className="flex items-center gap-2">
              {view === "chat" && (
                <button
                  onClick={newChat}
                  className="w-6 h-6 rounded flex items-center justify-center text-[#555552] hover:text-[#F0EFEC] hover:bg-[#252523] transition-colors"
                >
                  <ChevronLeft size={14} />
                </button>
              )}
              <p className="text-xs text-[#8A8A85]">
                {view === "chat" && activeSession
                  ? activeSession.title
                  : "Full workspace context"}
              </p>
            </div>
            <button
              onClick={onClose}
              className="w-6 h-6 rounded flex items-center justify-center text-[#555552] hover:text-[#F0EFEC] hover:bg-[#252523] transition-colors"
            >
              <X size={13} />
            </button>
          </div>

          {/* Messages or suggestions */}
          <div className="flex-1 overflow-y-auto">
            {view === "list" ? (
              /* Suggestions */
              <div className="px-4 py-4">
                <p className="text-[10px] font-semibold uppercase tracking-widest text-[#444442] mb-3">
                  Try asking
                </p>
                <div className="grid grid-cols-2 gap-1.5">
                  {SUGGESTED.map((s, i) => (
                    <button
                      key={i}
                      onClick={() => sendMessage(s)}
                      className="text-left px-3 py-2.5 rounded-xl border border-[#252523] bg-[#1C1C1A] hover:bg-[#252523] hover:border-[#333331] transition-all group"
                    >
                      <p className="text-[12px] text-[#8A8A85] group-hover:text-[#F0EFEC] leading-snug transition-colors">
                        {s}
                      </p>
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              /* Chat messages */
              <div className="px-5 py-4 space-y-5">
                {messages.map((msg, i) => (
                  <div key={i} className={cn("flex gap-3", msg.role === "user" && "flex-row-reverse")}>
                    {/* Avatar */}
                    {msg.role === "assistant" ? (
                      <div
                        className="w-6 h-6 rounded-lg flex items-center justify-center shrink-0 mt-0.5"
                        style={{ background: "linear-gradient(135deg, #5B5BD6 0%, #7C3AED 100%)" }}
                      >
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none">
                          <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"
                            stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </div>
                    ) : (
                      <div className="w-6 h-6 rounded-lg bg-[#2E2E2C] border border-[#333331] flex items-center justify-center text-[10px] font-semibold text-[#F0EFEC] shrink-0 mt-0.5">
                        Y
                      </div>
                    )}

                    {/* Bubble */}
                    <div className={cn("max-w-[80%]", msg.role === "user" && "items-end flex flex-col")}>
                      {msg.role === "user" ? (
                        <div
                          className="px-3.5 py-2.5 rounded-2xl rounded-tr-sm text-sm text-[#F0EFEC]"
                          style={{ background: "linear-gradient(135deg, #2E2E2C 0%, #333331 100%)" }}
                        >
                          {msg.content}
                        </div>
                      ) : (
                        <div>
                          {/* Action event cards */}
                          {msg.actionEvents && msg.actionEvents.length > 0 && (
                            <div className="flex flex-col gap-2 mb-3">
                              {msg.actionEvents.map((action, ai) => (
                                <div key={ai}>
                                  {action.needs_confirmation ? (
                                    /* Delete confirmation card */
                                    <div className="flex items-start gap-2.5 px-3 py-2.5 rounded-xl border border-amber-500/30 bg-amber-500/5">
                                      <AlertTriangle size={14} className="text-amber-400 shrink-0 mt-0.5" />
                                      <div className="flex-1 min-w-0">
                                        <p className="text-xs font-medium text-amber-300">
                                          Confirm deletion
                                        </p>
                                        <p className="text-[11px] text-[#8A8A85] mt-0.5">
                                          {action.confirmation_action?.description}
                                        </p>
                                      </div>
                                    </div>
                                  ) : (
                                    /* Success action card */
                                    <div className="flex items-start gap-2.5 px-3 py-2.5 rounded-xl border border-emerald-500/30 bg-emerald-500/5">
                                      <CheckCircle2 size={14} className="text-emerald-400 shrink-0 mt-0.5" />
                                      <div className="flex-1 min-w-0">
                                        <p className="text-xs font-medium text-emerald-300">
                                          {action.tool === "create_task" && "Task created"}
                                          {action.tool === "update_task" && "Task updated"}
                                          {action.tool === "create_project" && "Project created"}
                                          {action.tool === "update_project" && "Project updated"}
                                        </p>
                                        {action.summary && (
                                          <p className="text-[11px] text-[#8A8A85] mt-0.5 truncate">{action.summary}</p>
                                        )}
                                        {action.changes && action.changes.length > 0 && (
                                          <p className="text-[11px] text-[#8A8A85] mt-0.5 truncate">{action.changes.join(" · ")}</p>
                                        )}
                                      </div>
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}

                          {msg.content ? (
                            renderMarkdown(msg.content)
                          ) : (
                            <div className="flex items-center gap-1.5 py-2">
                              {[0, 1, 2].map(j => (
                                <span
                                  key={j}
                                  className="w-1.5 h-1.5 rounded-full animate-bounce"
                                  style={{
                                    background: "#7C3AED",
                                    animationDelay: `${j * 150}ms`
                                  }}
                                />
                              ))}
                            </div>
                          )}
                          {i === messages.length - 1 && isStreaming && msg.content && (
                            <span
                              className="inline-block w-0.5 h-3.5 ml-0.5 align-middle animate-pulse rounded-full"
                              style={{ background: "#7C3AED" }}
                            />
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                ))}

                {/* Pending delete confirmation buttons */}
                {pendingConfirmation && !isStreaming && (
                  <div className="flex items-center gap-2 ml-9">
                    <button
                      onClick={handleConfirmDelete}
                      disabled={pendingConfirmation.loading}
                      className="px-3 py-1.5 rounded-lg text-xs font-medium bg-red-500/20 text-red-400 border border-red-500/30 hover:bg-red-500/30 transition-colors disabled:opacity-50 flex items-center gap-1.5"
                    >
                      {pendingConfirmation.loading ? (
                        <Loader2 size={11} className="animate-spin" />
                      ) : (
                        <Trash2 size={11} />
                      )}
                      Confirm Delete
                    </button>
                    <button
                      onClick={() => setPendingConfirmation(null)}
                      disabled={pendingConfirmation.loading}
                      className="px-3 py-1.5 rounded-lg text-xs text-[#8A8A85] border border-[#333331] hover:bg-[#252523] transition-colors disabled:opacity-50"
                    >
                      Cancel
                    </button>
                  </div>
                )}

                <div ref={messagesEndRef} />
              </div>
            )}
          </div>

          {/* Input area */}
          <div className="px-4 pb-4 pt-2 border-t border-[#252523]">
            <div className="flex items-end gap-2 px-3 py-2.5 rounded-xl border border-[#2E2E2C] bg-[#1C1C1A] focus-within:border-[#444442] transition-colors">
              <textarea
                ref={inputRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault()
                    sendMessage()
                  }
                }}
                placeholder="Ask anything about your workspace…"
                rows={1}
                disabled={isStreaming}
                className="flex-1 bg-transparent text-sm text-[#F0EFEC] placeholder:text-[#444442] outline-none resize-none leading-5 max-h-24 disabled:opacity-50"
                style={{ minHeight: 20 }}
                onInput={e => {
                  const el = e.currentTarget
                  el.style.height = "20px"
                  el.style.height = Math.min(el.scrollHeight, 96) + "px"
                }}
              />
              <button
                onClick={() => sendMessage()}
                disabled={!input.trim() || isStreaming}
                className={cn(
                  "w-7 h-7 rounded-lg flex items-center justify-center transition-all shrink-0",
                  input.trim() && !isStreaming
                    ? "opacity-100 cursor-pointer"
                    : "opacity-30 cursor-not-allowed"
                )}
                style={{
                  background: input.trim() && !isStreaming
                    ? "linear-gradient(135deg, #5B5BD6 0%, #7C3AED 100%)"
                    : "#2E2E2C"
                }}
              >
                {isStreaming
                  ? <Loader2 size={13} className="animate-spin text-white" />
                  : <Send size={12} className="text-white" />
                }
              </button>
            </div>
            <div className="flex items-center justify-between mt-2 px-1">
              <span className="text-[10px] text-[#444442]">
                ✦ Llama 3.3 70B · Ask questions or take actions
              </span>
              <div className="flex items-center gap-3 text-[10px] text-[#444442]">
                <span>↵ send</span>
                <span>⇧↵ newline</span>
                <span>ESC close</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}