"use client"

import React, { useState, useEffect, useRef, useCallback } from "react"
import { cn } from "@/lib/utils"
import { createClient } from "@/lib/supabase/client"
import {
  Plus, X, Loader2, Send, ChevronLeft, Trash2, MessageSquare, Clock,
  CheckCircle2, AlertTriangle, Database, Zap, Search, Users, Calendar,
  FolderOpen, BarChart2, FileText, Layers
} from "lucide-react"

// ── Types ─────────────────────────────────────────────────────────────────────

interface Message {
  role: "user" | "assistant"
  content: string
  timestamp: number
  actionEvents?: ActionEvent[]
  toolActivity?: ToolActivity[]
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

// A live tool status shown while the agent is "thinking"
interface ToolActivity {
  tool: string
  actionType: "read" | "action"
  label: string
  status: "running" | "done"
}

interface PendingConfirmation {
  description: string
  task_id: string
  loading: boolean
  tool: string
  args: Record<string, any>
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

// ── Tool icon map ─────────────────────────────────────────────────────────────

function ToolIcon({ tool, size = 11 }: { tool: string; size?: number }) {
  const props = { size, className: "shrink-0" }
  if (tool.includes("task"))       return <FileText {...props} />
  if (tool.includes("project"))    return <Layers {...props} />
  if (tool.includes("team") || tool.includes("workload")) return <Users {...props} />
  if (tool.includes("calendar"))   return <Calendar {...props} />
  if (tool.includes("vault"))      return <FolderOpen {...props} />
  if (tool.includes("crm") || tool.includes("deal") || tool.includes("contact")) return <BarChart2 {...props} />
  if (tool.includes("search") || tool.includes("message")) return <Search {...props} />
  if (tool.includes("workspace") || tool.includes("overview")) return <Database {...props} />
  return <Zap {...props} />
}

// ── Compression helpers ────────────────────────────────────────────────────────

function compressMessages(messages: Message[]): string {
  const json = JSON.stringify(messages)
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

function renderInline(text: string): React.ReactNode {
  const withBr = text.split(/<br\s*\/?>/gi)
  if (withBr.length > 1) {
    return (
      <>
        {withBr.map((segment, idx) => (
          <React.Fragment key={idx}>
            {renderInlineBold(segment)}
            {idx < withBr.length - 1 && <br />}
          </React.Fragment>
        ))}
      </>
    )
  }
  return renderInlineBold(text)
}

function renderInlineBold(text: string): React.ReactNode {
  const parts = text.split(/\*\*(.+?)\*\*/g)
  if (parts.length === 1) return text
  return (
    <>
      {parts.map((part, j) =>
        j % 2 === 1
          ? <strong key={j} className="text-foreground dark:text-[#F0EFEC] font-semibold">{part}</strong>
          : part
      )}
    </>
  )
}

function renderMarkdown(text: string) {
  const normalized = text.replace(/\\n/g, "\n")
  const lines = normalized.split("\n")
  const elements: React.ReactNode[] = []
  let i = 0

  while (i < lines.length) {
    const line = lines[i]

    if (line.includes("|") && lines[i + 1]?.match(/^\|[\s\-|:]+\|$/)) {
      const tableLines: string[] = []
      while (i < lines.length && lines[i].includes("|")) {
        tableLines.push(lines[i])
        i++
      }
      const parseRow = (row: string) =>
        row.split("|").map(c => c.trim()).filter((_, idx, arr) => idx > 0 && idx < arr.length - 1)
      const headerRow = parseRow(tableLines[0])
      const bodyRows = tableLines.slice(2).map(parseRow)
      elements.push(
        <div key={`table-${i}`} className="overflow-x-auto my-3 rounded-xl border border-border dark:border-[#2E2E2C]">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="bg-muted dark:bg-[#252523]">
                {headerRow.map((cell, ci) => (
                  <th key={ci} className="px-3 py-2 text-left font-semibold text-foreground dark:text-[#F0EFEC] border-b border-border dark:border-[#2E2E2C] whitespace-nowrap">
                    {renderInline(cell)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {bodyRows.map((row, ri) => (
                <tr key={ri} className={ri % 2 === 0 ? "" : "bg-muted/40 dark:bg-[#1C1C1A]/60"}>
                  {row.map((cell, ci) => (
                    <td key={ci} className="px-3 py-2 text-muted-foreground dark:text-[#B4B2A9] border-b border-border/50 dark:border-[#2E2E2C]/50 last:border-b-0">
                      {renderInline(cell)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )
      continue
    }

    if (line.startsWith("### ")) {
      elements.push(<p key={i} className="text-xs font-bold text-foreground dark:text-[#F0EFEC] mt-3 mb-1 uppercase tracking-widest">{line.slice(4)}</p>)
    } else if (line.startsWith("## ")) {
      elements.push(<p key={i} className="text-sm font-bold text-foreground dark:text-[#F0EFEC] mt-3 mb-1">{line.slice(3)}</p>)
    } else if (line.startsWith("# ")) {
      elements.push(<p key={i} className="text-base font-bold text-foreground dark:text-[#F0EFEC] mt-3 mb-1">{line.slice(2)}</p>)
    } else if (line.startsWith("**") && line.endsWith("**") && !line.slice(2, -2).includes("**")) {
      elements.push(<p key={i} className="text-sm font-semibold text-foreground dark:text-[#F0EFEC] mt-2">{line.slice(2, -2)}</p>)
    } else if (line.startsWith("- ") || line.startsWith("• ")) {
      elements.push(
        <div key={i} className="flex items-start gap-2 py-0.5">
          <span className="text-muted-foreground/50 dark:text-[#555552] mt-1 shrink-0 text-xs">•</span>
          <span className="text-sm text-muted-foreground dark:text-[#B4B2A9] leading-relaxed">{renderInline(line.slice(2))}</span>
        </div>
      )
    } else if (/^\d+\.\s/.test(line)) {
      const num = line.match(/^(\d+)\./)?.[1]
      elements.push(
        <div key={i} className="flex items-start gap-2 py-0.5">
          <span className="text-muted-foreground/50 dark:text-[#555552] text-xs mt-1 shrink-0 w-4">{num}.</span>
          <span className="text-sm text-muted-foreground dark:text-[#B4B2A9] leading-relaxed">{renderInline(line.replace(/^\d+\.\s/, ""))}</span>
        </div>
      )
    } else if (line.startsWith("---") || line.startsWith("___")) {
      elements.push(<div key={i} className="border-t border-border dark:border-[#333331] my-2" />)
    } else if (line.trim() === "") {
      elements.push(<div key={i} className="h-1" />)
    } else {
      elements.push(
        <p key={i} className="text-sm text-muted-foreground dark:text-[#B4B2A9] leading-relaxed">
          {renderInline(line)}
        </p>
      )
    }
    i++
  }

  return <div className="space-y-0.5">{elements}</div>
}

// ── Tool Activity Bar ─────────────────────────────────────────────────────────
// Shown while the agent is fetching data / executing actions

function ToolActivityBar({ activities }: { activities: ToolActivity[] }) {
  if (activities.length === 0) return null

  return (
    <div className="flex flex-col gap-1.5 mb-3">
      {activities.map((act, i) => {
        const isRead   = act.actionType === "read"
        const isDone   = act.status === "done"

        return (
          <div
            key={`${act.tool}-${i}`}
            className={cn(
              "flex items-center gap-2.5 px-3 py-2 rounded-xl border text-xs transition-all duration-300",
              isDone
                ? "border-border/40 dark:border-[#2A2A28] bg-transparent opacity-50"
                : isRead
                  ? "border-violet-500/20 bg-violet-500/5 dark:bg-violet-500/[0.06]"
                  : "border-amber-500/20 bg-amber-500/5 dark:bg-amber-500/[0.06]"
            )}
          >
            {isDone ? (
              <CheckCircle2
                size={11}
                className="text-emerald-500 shrink-0"
              />
            ) : (
              <div
                className={cn(
                  "shrink-0",
                  isRead ? "text-violet-400" : "text-amber-400"
                )}
              >
                <ToolIcon tool={act.tool} size={11} />
              </div>
            )}

            <span
              className={cn(
                "flex-1 font-medium",
                isDone
                  ? "text-muted-foreground/50 line-through"
                  : isRead
                    ? "text-violet-300 dark:text-violet-300"
                    : "text-amber-300 dark:text-amber-300"
              )}
            >
              {act.label}
            </span>

            {!isDone && (
              <div className="flex gap-0.5 items-center">
                {[0, 1, 2].map(j => (
                  <span
                    key={j}
                    className={cn(
                      "w-1 h-1 rounded-full animate-bounce",
                      isRead ? "bg-violet-400" : "bg-amber-400"
                    )}
                    style={{ animationDelay: `${j * 120}ms` }}
                  />
                ))}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────

export function CommandBar({ open, onClose }: CommandBarProps) {
  const supabase = createClient()

  const [view, setView] = useState<"list" | "chat">("list")
  const [sessions, setSessions] = useState<ChatSession[]>([])
  const [activeSession, setActiveSession] = useState<ChatSession | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState("")
  const [isStreaming, setIsStreaming] = useState(false)
  const [loadingSessions, setLoadingSessions] = useState(false)
  const [pendingConfirmation, setPendingConfirmation] = useState<PendingConfirmation | null>(null)

  // Live tool activities for the current streaming message
  const [liveActivities, setLiveActivities] = useState<ToolActivity[]>([])

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

  const [sidebarOpen, setSidebarOpen] = useState(false)

  useEffect(() => {
    if (open) {
      setSidebarOpen(false)
      setActiveSession(null)
      setMessages([])
      setInput("")
      setView("list")
      setLiveActivities([])
      setTimeout(() => inputRef.current?.focus(), 100)
    }
  }, [open])

  useEffect(() => {
    if (sidebarOpen) loadSessions()
  }, [sidebarOpen])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages, liveActivities])

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

  // ── Confirm delete/send handler ────────────────────────────────────────────

  const handleConfirm = useCallback(async () => {
    if (!pendingConfirmation) return
    setPendingConfirmation(prev => prev ? { ...prev, loading: true } : null)
    try {
      if (pendingConfirmation.tool === "send_message_confirmed") {
        const res = await fetch("/api/ai/send-message", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(pendingConfirmation.args),
        })
        const result = await res.json()
        setMessages(prev => [...prev, {
          role: "assistant",
          content: result.success
            ? `✅ Message sent to ${pendingConfirmation.args.recipient_name}.`
            : `❌ Failed to send: ${result.error || "Unknown error"}`,
          timestamp: Date.now(),
        }])
      } else {
        const res = await fetch("/api/ai/command", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ task_id: pendingConfirmation.task_id }),
        })
        const result = await res.json()
        if (result.success) {
          setMessages(prev => [...prev, {
            role: "assistant",
            content: "✅ Task deleted successfully.",
            timestamp: Date.now(),
          }])
          window.dispatchEvent(new Event("tasks-updated"))
        } else {
          setMessages(prev => [...prev, {
            role: "assistant",
            content: `❌ Failed to delete: ${result.message}`,
            timestamp: Date.now(),
          }])
        }
      }
    } catch {
      setMessages(prev => [...prev, {
        role: "assistant",
        content: `❌ Something went wrong. Please try again.`,
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
    setLiveActivities([])

    const userMsg: Message = { role: "user", content: question, timestamp: Date.now() }
    const nextMessages = [...messages, userMsg]
    setMessages(nextMessages)
    setIsStreaming(true)

    // Placeholder assistant message
    const assistantMsg: Message = {
      role: "assistant",
      content: "",
      timestamp: Date.now(),
      toolActivity: [],
    }
    setMessages(prev => [...prev, assistantMsg])

    try {
      const res = await fetch("/api/ai/command", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: question,
          history: messages.slice(-20).map(m => ({ role: m.role, content: m.content })),
        }),
      })

      if (!res.ok || !res.body) throw new Error("Request failed")

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let accumulated = ""
      const collectedActions: ActionEvent[] = []
      // Track live activities locally so we can update them
      let currentActivities: ToolActivity[] = []

      const updateLastMessage = (
        content: string,
        acts: ActionEvent[],
        toolActs: ToolActivity[]
      ) => {
        setMessages(prev => {
          const updated = [...prev]
          updated[updated.length - 1] = {
            role: "assistant",
            content,
            timestamp: Date.now(),
            actionEvents: acts.length > 0 ? [...acts] : undefined,
            toolActivity: toolActs.length > 0 ? [...toolActs] : undefined,
          }
          return updated
        })
      }

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        const raw = decoder.decode(value)
        const lines = raw.split("\n\n").filter(Boolean)

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue
          try {
            const parsed = JSON.parse(line.slice(6))

            switch (parsed.type) {

              // ── Typewriter text ──────────────────────────────────────
              case "delta": {
                accumulated += parsed.content
                // Once text starts flowing, clear live activities from
                // the streaming overlay (they stay in the frozen snapshot)
                setLiveActivities([])
                updateLastMessage(accumulated, collectedActions, currentActivities)
                break
              }

              // ── Tool started ─────────────────────────────────────────
              case "tool_started": {
                const newAct: ToolActivity = {
                  tool: parsed.tool,
                  actionType: parsed.actionType,
                  label: parsed.label,
                  status: "running",
                }
                currentActivities = [...currentActivities, newAct]
                setLiveActivities([...currentActivities])
                updateLastMessage(accumulated, collectedActions, currentActivities)
                break
              }

              // ── Tool done ────────────────────────────────────────────
              case "tool_done": {
                currentActivities = currentActivities.map(a =>
                  a.tool === parsed.tool ? { ...a, status: "done" as const } : a
                )
                setLiveActivities([...currentActivities])
                updateLastMessage(accumulated, collectedActions, currentActivities)
                break
              }

              // ── Action executed (task created, etc.) ─────────────────
              case "action_executed": {
                const { type: _t, ...actionData } = parsed
                collectedActions.push(actionData as ActionEvent)

                if (actionData.tool?.includes("task")) {
                  window.dispatchEvent(new Event("tasks-updated"))
                }
                if (actionData.tool?.includes("project")) {
                  window.dispatchEvent(new Event("projects-updated"))
                }

                if (actionData.needs_confirmation && actionData.confirmation_action) {
                  setPendingConfirmation({
                    description: actionData.confirmation_action.description,
                    task_id: actionData.confirmation_action.resolved_id,
                    tool: actionData.confirmation_action.tool,
                    args: actionData.confirmation_action.args || {},
                    loading: false,
                  })
                }

                updateLastMessage(accumulated, collectedActions, currentActivities)
                break
              }

              case "done": {
                // Stream complete
                break
              }

              case "error": {
                accumulated = accumulated || parsed.message || "Something went wrong."
                updateLastMessage(accumulated, collectedActions, currentActivities)
                break
              }
            }
          } catch {
            // malformed SSE line, skip
          }
        }
      }

      // Freeze final state
      setLiveActivities([])
      const finalMsgs = [
        ...nextMessages,
        {
          role: "assistant" as const,
          content: accumulated,
          timestamp: Date.now(),
          actionEvents: collectedActions.length > 0 ? collectedActions : undefined,
          toolActivity: currentActivities.length > 0 ? currentActivities : undefined,
        },
      ]

      // Save to DB
      const title = question.slice(0, 50) + (question.length > 50 ? "…" : "")
      const sessionId = await saveSession(activeSession?.id || null, finalMsgs, title)
      if (sessionId && !activeSession) {
        setActiveSession({ id: sessionId, title, messages: finalMsgs, updated_at: new Date().toISOString() })
      }
      loadSessions()

    } catch {
      setLiveActivities([])
      setMessages(prev => {
        const updated = [...prev]
        updated[updated.length - 1] = {
          role: "assistant",
          content: "Something went wrong. Please try again.",
          timestamp: Date.now(),
        }
        return updated
      })
    } finally {
      setIsStreaming(false)
      setLiveActivities([])
    }
  }, [input, messages, isStreaming, activeSession, saveSession, loadSessions])

  // ── Open existing session ──────────────────────────────────────────────────

  const openSession = (session: ChatSession) => {
    setActiveSession(session)
    setMessages(session.messages)
    setView("chat")
  }

  const newChat = () => {
    setActiveSession(null)
    setMessages([])
    setInput("")
    setView("list")
    setSidebarOpen(false)
    setLiveActivities([])
  }

  const deleteSession = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    await supabase.from("ai_command_chats").delete().eq("id", id)
    setSessions(prev => prev.filter(s => s.id !== id))
    if (activeSession?.id === id) newChat()
  }

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
      className="fixed inset-0 z-50 flex flex-col items-center justify-end pb-8"
      onClick={onClose}
    >
      {/* Backdrop */}
      {view === "chat" && (
        <div className="absolute inset-0 bg-black/40 dark:bg-black/60 backdrop-blur-sm transition-opacity" />
      )}

      {/* Chat panel */}
      {view === "chat" && (
        <div
          className="relative mb-3 rounded-2xl border shadow-2xl overflow-hidden flex flex-col
            border-border dark:border-[#2E2E2C]
            bg-card dark:bg-[#161614]"
          style={{ width: 680, height: 420 }}
          onClick={e => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-border dark:border-[#252523] shrink-0">
            <div className="flex items-center gap-2">
              <button
                onClick={() => { setView("list"); setActiveSession(null); setMessages([]) }}
                className="w-6 h-6 rounded flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent dark:hover:bg-[#252523] transition-colors"
              >
                <ChevronLeft size={14} />
              </button>
              <p className="text-xs text-muted-foreground truncate max-w-[400px]">
                {activeSession?.title || "New conversation"}
              </p>
            </div>
            <button
              onClick={onClose}
              className="w-6 h-6 rounded flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent dark:hover:bg-[#252523] transition-colors"
            >
              <X size={13} />
            </button>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
            {messages.map((msg, i) => (
              <div key={i} className={cn("flex gap-3", msg.role === "user" && "flex-row-reverse")}>
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
                  <div className="w-6 h-6 rounded-lg bg-accent dark:bg-[#2E2E2C] border border-border dark:border-[#333331] flex items-center justify-center text-[10px] font-semibold text-foreground shrink-0 mt-0.5">
                    Y
                  </div>
                )}

                <div className={cn("max-w-[80%]", msg.role === "user" && "items-end flex flex-col")}>
                  {msg.role === "user" ? (
                    <div className="px-3.5 py-2.5 rounded-2xl rounded-tr-sm text-sm text-foreground dark:text-[#F0EFEC] bg-accent dark:bg-[#2A2A28] border border-border dark:border-[#3A3A38] shadow-sm">
                      {msg.content}
                    </div>
                  ) : (
                    <div>
                      {/* ── Action events (task created, etc.) ────────── */}
                      {msg.actionEvents && msg.actionEvents.length > 0 && (
                        <div className="flex flex-col gap-2 mb-3">
                          {msg.actionEvents.map((action, ai) => (
                            <div key={ai}>
                              {action.needs_confirmation ? (
                                <div className="flex items-start gap-2.5 px-3 py-2.5 rounded-xl border border-amber-500/30 bg-amber-500/5">
                                  <AlertTriangle size={14} className="text-amber-400 shrink-0 mt-0.5" />
                                  <div className="flex-1 min-w-0">
                                    <p className="text-xs font-medium text-amber-600 dark:text-amber-300">
                                      {action.confirmation_action?.tool === "send_message_confirmed" ? "Confirm send" : "Confirm deletion"}
                                    </p>
                                    <p className="text-[11px] text-muted-foreground mt-0.5">{action.confirmation_action?.description}</p>
                                  </div>
                                </div>
                              ) : (
                                <div className="flex items-start gap-2.5 px-3 py-2.5 rounded-xl border border-emerald-500/30 bg-emerald-500/5">
                                  <CheckCircle2 size={14} className="text-emerald-500 shrink-0 mt-0.5" />
                                  <div className="flex-1 min-w-0">
                                    <p className="text-xs font-medium text-emerald-600 dark:text-emerald-300">
                                      {action.tool === "create_task" && "Task created"}
                                      {action.tool === "update_task" && "Task updated"}
                                      {action.tool === "create_project" && "Project created"}
                                      {action.tool === "update_project" && "Project updated"}
                                    </p>
                                    {action.summary && <p className="text-[11px] text-muted-foreground mt-0.5 truncate">{action.summary}</p>}
                                    {action.changes && action.changes.length > 0 && (
                                      <p className="text-[11px] text-muted-foreground mt-0.5 truncate">{action.changes.join(" · ")}</p>
                                    )}
                                  </div>
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}

                      {/* ── Frozen tool activity (historical messages) ── */}
                      {msg.toolActivity && msg.toolActivity.length > 0 && msg.content && (
                        <ToolActivityBar activities={msg.toolActivity} />
                      )}

                      {/* ── Live tool activity overlay (streaming now) ── */}
                      {i === messages.length - 1 && isStreaming && liveActivities.length > 0 && (
                        <ToolActivityBar activities={liveActivities} />
                      )}

                      {/* ── Text content ─────────────────────────────── */}
                      {msg.content ? (
                        renderMarkdown(msg.content)
                      ) : (
                        // Loading indicator: shown only if no tool activity yet
                        liveActivities.length === 0 && i === messages.length - 1 && isStreaming ? (
                          <div className="flex items-center gap-1.5 py-2">
                            {[0, 1, 2].map(j => (
                              <span key={j} className="w-1.5 h-1.5 rounded-full animate-bounce"
                                style={{ background: "#7C3AED", animationDelay: `${j * 150}ms` }} />
                            ))}
                          </div>
                        ) : null
                      )}

                      {/* ── Typewriter cursor ────────────────────────── */}
                      {i === messages.length - 1 && isStreaming && msg.content && (
                        <span className="inline-block w-0.5 h-3.5 ml-0.5 align-middle animate-pulse rounded-full"
                          style={{ background: "#7C3AED" }} />
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))}

            {/* Confirm / cancel buttons */}
            {pendingConfirmation && !isStreaming && (
              <div className="flex items-center gap-2 ml-9">
                <button
                  onClick={handleConfirm}
                  disabled={pendingConfirmation.loading}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors disabled:opacity-50 flex items-center gap-1.5 ${
                    pendingConfirmation.tool === "send_message_confirmed"
                      ? "bg-violet-500/20 text-violet-400 border-violet-500/30 hover:bg-violet-500/30"
                      : "bg-red-500/20 text-red-400 border-red-500/30 hover:bg-red-500/30"
                  }`}
                >
                  {pendingConfirmation.loading
                    ? <Loader2 size={11} className="animate-spin" />
                    : pendingConfirmation.tool === "send_message_confirmed"
                      ? <Send size={11} />
                      : <Trash2 size={11} />
                  }
                  {pendingConfirmation.tool === "send_message_confirmed" ? "Confirm Send" : "Confirm Delete"}
                </button>
                <button
                  onClick={() => setPendingConfirmation(null)}
                  disabled={pendingConfirmation.loading}
                  className="px-3 py-1.5 rounded-lg text-xs text-muted-foreground border border-border hover:bg-accent dark:hover:bg-[#252523] transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>
        </div>
      )}

      {/* History panel */}
      {sidebarOpen && (
        <div
          className="relative mb-2 rounded-2xl border shadow-xl overflow-hidden flex flex-col
            border-border dark:border-[#2E2E2C]
            bg-card dark:bg-[#1C1C1A]"
          style={{ width: 680, maxHeight: 280 }}
          onClick={e => e.stopPropagation()}
        >
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-border dark:border-[#252523] shrink-0">
            <div className="flex items-center gap-2">
              <MessageSquare size={12} className="text-muted-foreground" />
              <span className="text-xs font-medium text-foreground">Recent chats</span>
            </div>
            <button
              onClick={newChat}
              className="w-6 h-6 rounded flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent dark:hover:bg-[#252523] transition-colors"
              title="New chat"
            >
              <Plus size={12} />
            </button>
          </div>
          <div className="overflow-y-auto py-1">
            {loadingSessions ? (
              <div className="flex items-center justify-center py-6">
                <Loader2 size={14} className="animate-spin text-muted-foreground" />
              </div>
            ) : sessions.length === 0 ? (
              <div className="px-4 py-5 text-center">
                <p className="text-[11px] text-muted-foreground">No chats yet</p>
              </div>
            ) : (
              <div className="px-2 py-1 grid grid-cols-2 gap-1">
                {sessions.map(session => (
                  <button
                    key={session.id}
                    onClick={() => { openSession(session); setSidebarOpen(false) }}
                    className={cn(
                      "text-left px-3 py-2 rounded-lg transition-colors group relative flex items-center justify-between gap-2",
                      "hover:bg-accent dark:hover:bg-[#252523]",
                      activeSession?.id === session.id && "bg-accent dark:bg-[#252523]"
                    )}
                  >
                    <div className="flex-1 min-w-0">
                      <p className={cn(
                        "text-[12px] leading-snug truncate",
                        activeSession?.id === session.id ? "text-foreground" : "text-muted-foreground"
                      )}>
                        {session.title}
                      </p>
                      <div className="flex items-center gap-1 mt-0.5">
                        <Clock size={9} className="text-muted-foreground/50" />
                        <p className="text-[10px] text-muted-foreground/50">{formatTime(session.updated_at)}</p>
                      </div>
                    </div>
                    <button
                      onClick={(e) => deleteSession(session.id, e)}
                      className="opacity-0 group-hover:opacity-100 text-muted-foreground/40 hover:text-destructive transition-all shrink-0"
                    >
                      <Trash2 size={10} />
                    </button>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Floating input bar */}
      <div
        className="relative"
        style={{ width: 680 }}
        onClick={e => e.stopPropagation()}
      >
        <div className="absolute -top-3 left-1/4 w-32 h-6 rounded-full blur-2xl opacity-60 pointer-events-none"
          style={{ background: "radial-gradient(ellipse, #ef4444 0%, transparent 70%)" }} />
        <div className="absolute -top-3 right-1/4 w-32 h-6 rounded-full blur-2xl opacity-60 pointer-events-none"
          style={{ background: "radial-gradient(ellipse, #3b82f6 0%, transparent 70%)" }} />

        <div className={cn(
          "flex items-end gap-2 px-4 py-3 rounded-2xl border shadow-lg transition-all",
          "bg-card dark:bg-[#161614]",
          "border-border dark:border-[#2E2E2C]",
          "focus-within:border-ring/50 dark:focus-within:border-[#444442]",
          "focus-within:shadow-xl"
        )}>
          <button
            onClick={() => setSidebarOpen(v => !v)}
            className={cn(
              "shrink-0 flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-medium transition-all border",
              sidebarOpen
                ? "bg-primary text-primary-foreground border-primary"
                : "text-muted-foreground border-border hover:text-foreground hover:bg-accent dark:hover:bg-[#252523] dark:border-[#333331]"
            )}
          >
            <MessageSquare size={11} />
            <span>History</span>
          </button>

          <div className="w-px h-5 bg-border dark:bg-[#333331] shrink-0 self-center" />

          <textarea
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault()
                sendMessage()
              }
              if (e.key === "Escape") {
                if (sidebarOpen) { setSidebarOpen(false); return }
                if (view === "chat") { setView("list"); return }
                onClose()
              }
            }}
            placeholder="Ask anything…"
            rows={1}
            disabled={isStreaming}
            className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground/60 outline-none resize-none leading-5 max-h-24 disabled:opacity-50"
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
              "shrink-0 w-8 h-8 rounded-xl flex items-center justify-center transition-all",
              input.trim() && !isStreaming
                ? "opacity-100 cursor-pointer shadow-sm"
                : "opacity-25 cursor-not-allowed"
            )}
            style={{
              background: input.trim() && !isStreaming
                ? "linear-gradient(135deg, #5B5BD6 0%, #7C3AED 100%)"
                : "var(--accent)"
            }}
          >
            {isStreaming
              ? <Loader2 size={13} className="animate-spin text-white" />
              : <Send size={12} className="text-white" />
            }
          </button>
        </div>

        <div className="flex items-center justify-between mt-1.5 px-2">
          <span className="text-[10px] text-muted-foreground/50">✦ Llama 3.3 70B</span>
          <div className="flex items-center gap-3 text-[10px] text-muted-foreground/50">
            <span>↵ send</span>
            <span>⇧↵ newline</span>
            <span>ESC close</span>
          </div>
        </div>
      </div>
    </div>
  )
}