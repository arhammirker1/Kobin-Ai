"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { cn } from "@/lib/utils"
import { Search, Clock, X, Loader2, ChevronRight } from "lucide-react"

const SUGGESTED_QUERIES = [
  "Which clients haven't replied in 5 days?",
  "Show me everything overdue",
  "Which projects are at risk?",
  "What do I have today?",
  "Who needs a follow-up?",
  "What's the status of every active client?",
  "Which team member has the most open tasks?",
  "Show me all blocked tasks",
]

interface CommandBarProps {
  open: boolean
  onClose: () => void
}

export function CommandBar({ open, onClose }: CommandBarProps) {
  const [query, setQuery] = useState("")
  const [response, setResponse] = useState("")
  const [isStreaming, setIsStreaming] = useState(false)
  const [history, setHistory] = useState<Array<{ query: string; response: string }>>([])
  const inputRef = useRef<HTMLInputElement>(null)
  const responseRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 50)
      setQuery("")
      setResponse("")
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [open, onClose])

  useEffect(() => {
    if (responseRef.current) {
      responseRef.current.scrollTop = responseRef.current.scrollHeight
    }
  }, [response])

  const handleSubmit = useCallback(async (q?: string) => {
    const question = (q || query).trim()
    if (!question || isStreaming) return

    setIsStreaming(true)
    setResponse("")

    try {
      const res = await fetch("/api/ai/command", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: question }),
      })

      if (!res.ok || !res.body) throw new Error("Request failed")

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let accumulated = ""

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        const text = decoder.decode(value)
        const lines = text.split("\n\n").filter(Boolean)
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue
          try {
            const parsed = JSON.parse(line.slice(6))
            if (parsed.type === "delta") {
              accumulated += parsed.content
              setResponse(accumulated)
            } else if (parsed.type === "done") {
              setHistory(prev => [{ query: question, response: accumulated }, ...prev].slice(0, 5))
            }
          } catch {}
        }
      }
    } catch {
      setResponse("Something went wrong. Please try again.")
    } finally {
      setIsStreaming(false)
    }
  }, [query, isStreaming])

  const handleSuggestion = (s: string) => {
    setQuery(s)
    handleSubmit(s)
  }

  if (!open) return null

  const showSuggestions = !response && !isStreaming && !query

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[12vh]"
      onClick={onClose}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

      {/* Modal */}
      <div
        className="relative w-full max-w-2xl mx-4 rounded-2xl border border-[#333331] bg-[#1C1C1A] shadow-2xl overflow-hidden"
        onClick={e => e.stopPropagation()}
        style={{ maxHeight: "70vh", display: "flex", flexDirection: "column" }}
      >
        {/* Input */}
        <div className="flex items-center gap-3 px-4 py-3.5 border-b border-[#333331]">
          <div
            className="w-6 h-6 rounded-full flex items-center justify-center shrink-0"
            style={{ background: "linear-gradient(135deg, #5B5BD6 0%, #7C3AED 100%)" }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
              <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"
                stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault()
                handleSubmit()
              }
            }}
            placeholder="Ask anything about your workspace…"
            className="flex-1 bg-transparent text-sm text-[#F0EFEC] placeholder:text-[#555552] outline-none"
            disabled={isStreaming}
          />
          {isStreaming ? (
            <Loader2 size={15} className="animate-spin text-violet-400 shrink-0" />
          ) : query ? (
            <button
              onClick={() => { setQuery(""); setResponse("") }}
              className="text-[#555552] hover:text-[#F0EFEC] transition-colors shrink-0"
            >
              <X size={15} />
            </button>
          ) : (
            <kbd className="text-[10px] text-[#555552] px-1.5 py-0.5 border border-[#333331] rounded shrink-0">
              ESC
            </kbd>
          )}
        </div>

        {/* Content area */}
        <div ref={responseRef} className="flex-1 overflow-y-auto min-h-0">

          {/* Streaming / response */}
          {(isStreaming || response) && (
            <div className="px-5 py-4">
              {query && (
                <p className="text-[11px] text-[#555552] mb-3 font-medium">
                  {query}
                </p>
              )}
              <div
                className={cn(
                  "text-sm text-[#F0EFEC] leading-relaxed whitespace-pre-wrap",
                  !response && "flex items-center gap-2"
                )}
              >
                {!response ? (
                  <>
                    <div className="flex gap-1">
                      {[0, 1, 2].map(i => (
                        <span
                          key={i}
                          className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-bounce"
                          style={{ animationDelay: `${i * 150}ms` }}
                        />
                      ))}
                    </div>
                    <span className="text-[#555552] text-xs">Querying workspace…</span>
                  </>
                ) : (
                  <>
                    {response}
                    {isStreaming && (
                      <span
                        className="inline-block w-0.5 h-4 ml-0.5 align-middle animate-pulse"
                        style={{ background: "#7C3AED" }}
                      />
                    )}
                  </>
                )}
              </div>
            </div>
          )}

          {/* Suggestions */}
          {showSuggestions && (
            <div className="px-4 py-3">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-[#555552] mb-2 px-1">
                Try asking
              </p>
              <div className="flex flex-col gap-0.5">
                {SUGGESTED_QUERIES.map((s, i) => (
                  <button
                    key={i}
                    onClick={() => handleSuggestion(s)}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-left hover:bg-[#252523] transition-colors group"
                  >
                    <Search size={12} className="text-[#555552] shrink-0 group-hover:text-violet-400 transition-colors" />
                    <span className="text-sm text-[#8A8A85] group-hover:text-[#F0EFEC] transition-colors">
                      {s}
                    </span>
                    <ChevronRight size={11} className="text-[#333331] ml-auto shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* History */}
          {!showSuggestions && !isStreaming && !response && history.length > 0 && (
            <div className="px-4 py-3">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-[#555552] mb-2 px-1">
                Recent
              </p>
              <div className="flex flex-col gap-0.5">
                {history.map((h, i) => (
                  <button
                    key={i}
                    onClick={() => handleSuggestion(h.query)}
                    className="flex items-center gap-3 px-3 py-2 rounded-lg text-left hover:bg-[#252523] transition-colors group"
                  >
                    <Clock size={12} className="text-[#555552] shrink-0" />
                    <span className="text-sm text-[#8A8A85] group-hover:text-[#F0EFEC] transition-colors truncate">
                      {h.query}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-2.5 border-t border-[#333331] flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <span className="text-[10px]" style={{ color: "#7C3AED" }}>✦</span>
            <span className="text-[10px] text-[#555552]">AI · Full workspace context</span>
          </div>
          <div className="flex items-center gap-3 text-[10px] text-[#555552]">
            <span><kbd className="px-1 py-0.5 border border-[#333331] rounded text-[9px]">↵</kbd> ask</span>
            <span><kbd className="px-1 py-0.5 border border-[#333331] rounded text-[9px]">ESC</kbd> close</span>
          </div>
        </div>
      </div>
    </div>
  )
}