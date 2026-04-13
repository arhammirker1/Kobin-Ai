"use client"

/**
 * components/vault/code-viewer.tsx
 *
 * Monaco editor with:
 *  - View / Edit mode toggle
 *  - Kobin AI Writer panel (streams code suggestions via /api/vault/ai-write)
 *  - Save callback + external save ref for parent header button
 *  - Full theme support (kobin-dark / kobin-light)
 */

import { useEffect, useState, useRef, useCallback } from "react"
import { useTheme } from "next-themes"
import {
  Loader2, Copy, Check, Download, Pencil, Eye,
  Sparkles, X, Send, ChevronRight, RotateCcw,
} from "lucide-react"
import { cn } from "@/lib/utils"

let MonacoEditor: any = null

// ── Language detection ────────────────────────────────────────────────────────

function detectLanguage(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase() || ""
  const map: Record<string, string> = {
    js: "javascript", jsx: "javascript",
    ts: "typescript", tsx: "typescript",
    py: "python", rb: "ruby", go: "go",
    rs: "rust", java: "java", cpp: "cpp", c: "c",
    cs: "csharp", php: "php", swift: "swift",
    kt: "kotlin", r: "r", scala: "scala",
    html: "html", css: "css", scss: "scss",
    json: "json", yaml: "yaml", yml: "yaml",
    xml: "xml", sql: "sql", sh: "shell",
    bash: "shell", md: "markdown", mdx: "markdown",
    toml: "toml", env: "dotenv", dockerfile: "dockerfile",
    graphql: "graphql", gql: "graphql",
  }
  return map[ext] || "plaintext"
}

// ── Props ─────────────────────────────────────────────────────────────────────

export interface CodeViewerProps {
  content: string | null
  filename: string
  fileUrl?: string | null
  onSave?: (content: string) => void
  /** Controlled AI writer visibility from parent */
  aiWriterOpen?: boolean
  onAIWriterToggle?: () => void
  /** Parent assigns this ref so its Save button can trigger the child's save */
  saveRef?: React.MutableRefObject<(() => void) | null>
  className?: string
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function CodeViewer({
  content: initialContent,
  filename,
  fileUrl,
  onSave,
  aiWriterOpen = false,
  onAIWriterToggle,
  saveRef,
  className,
}: CodeViewerProps) {
  const { resolvedTheme = "dark" } = useTheme()
  const [monacoLoaded, setMonacoLoaded] = useState(false)
  const [loadError, setLoadError] = useState(false)
  const [editMode, setEditMode] = useState(false)
  const [editContent, setEditContent] = useState(initialContent || "")
  const [originalContent] = useState(initialContent || "")
  const [copied, setCopied] = useState(false)
  const [isDirty, setIsDirty] = useState(false)
  const editorRef = useRef<any>(null)
  const language = detectLanguage(filename)
  const isDark = resolvedTheme === "dark"

  // ── AI Writer state ───────────────────────────────────────────────────────
  const [aiPrompt, setAiPrompt] = useState("")
  const [aiResponse, setAiResponse] = useState("")
  const [aiLoading, setAiLoading] = useState(false)
  const [aiSources, setAiSources] = useState<any[]>([])

  // ── Load Monaco ───────────────────────────────────────────────────────────
  useEffect(() => {
    const load = async () => {
      try {
        const mod = await import("@monaco-editor/react")
        MonacoEditor = mod.default
        setMonacoLoaded(true)
      } catch {
        setLoadError(true)
      }
    }
    if (!MonacoEditor) load()
    else setMonacoLoaded(true)
  }, [])

  // ── Sync content prop changes (e.g. file loaded async) ───────────────────
  useEffect(() => {
    if (!isDirty) {
      setEditContent(initialContent || "")
    }
  }, [initialContent])

  // ── Expose save via ref so parent header button works ────────────────────
  useEffect(() => {
    if (!saveRef) return
    saveRef.current = () => {
      if (editMode && isDirty) handleSave()
    }
    return () => { if (saveRef) saveRef.current = null }
  }, [editMode, isDirty, editContent])

  // ── Theme sync ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (editorRef.current) {
      import("monaco-editor").then((monaco) => {
        monaco.editor.setTheme(isDark ? "kobin-dark" : "kobin-light")
      }).catch(() => {})
    }
  }, [isDark])

  const handleSave = useCallback(() => {
    if (!editMode) return
    onSave?.(editContent)
    setIsDirty(false)
  }, [editMode, editContent, onSave])

  const handleCopy = async () => {
    const src = editMode ? editContent : (initialContent || "")
    if (!src) return
    await navigator.clipboard.writeText(src)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleRevert = () => {
    setEditContent(originalContent)
    setIsDirty(false)
  }

  const handleEditorMount = (editor: any, monaco: any) => {
    editorRef.current = editor

    monaco.editor.defineTheme("kobin-dark", {
      base: "vs-dark", inherit: true,
      rules: [
        { token: "comment", foreground: "546E7A", fontStyle: "italic" },
        { token: "keyword", foreground: "C792EA" },
        { token: "string", foreground: "C3E88D" },
        { token: "number", foreground: "F78C6C" },
        { token: "type", foreground: "FFCB6B" },
        { token: "function", foreground: "82AAFF" },
      ],
      colors: {
        "editor.background": "#0d0d0c",
        "editor.foreground": "#C8C4B8",
        "editor.lineHighlightBackground": "#ffffff08",
        "editor.selectionBackground": "#5B4FE830",
        "editorCursor.foreground": "#5B4FE8",
        "editorLineNumber.foreground": "#3E3E3C",
        "editorLineNumber.activeForeground": "#6B6759",
        "scrollbarSlider.background": "#333331",
        "scrollbarSlider.hoverBackground": "#444442",
      },
    })

    monaco.editor.defineTheme("kobin-light", {
      base: "vs", inherit: true,
      rules: [
        { token: "comment", foreground: "9B9589", fontStyle: "italic" },
        { token: "keyword", foreground: "7C3AED" },
        { token: "string", foreground: "059669" },
        { token: "number", foreground: "DC4A68" },
        { token: "function", foreground: "2563EB" },
      ],
      colors: {
        "editor.background": "#F0EDE6",
        "editor.foreground": "#0D0D0C",
        "editor.lineHighlightBackground": "#0D0D0C08",
        "editor.selectionBackground": "#5B4FE820",
        "editorCursor.foreground": "#5B4FE8",
        "editorLineNumber.foreground": "#C8C3B8",
        "editorLineNumber.activeForeground": "#6B6759",
      },
    })

    monaco.editor.setTheme(isDark ? "kobin-dark" : "kobin-light")
    editor.focus()

    // Cmd/Ctrl+S to save
    editor.addCommand(
      monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS,
      () => { if (editMode) handleSave() }
    )
  }

  // ── AI Writer ─────────────────────────────────────────────────────────────
  const runAIWriter = async () => {
    if (!aiPrompt.trim()) return
    setAiLoading(true)
    setAiResponse("")
    setAiSources([])
    try {
      const res = await fetch("/api/vault/ai-write", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: aiPrompt,
          documentTitle: filename,
          documentContent: editMode ? editContent : (initialContent || ""),
          mode: "code",
        }),
      })
      if (!res.ok) throw new Error("AI request failed")
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
          if (!line.startsWith("data: ")) continue
          try {
            const parsed = JSON.parse(line.slice(6))
            if (parsed.type === "sources") setAiSources(parsed.sources || [])
            else if (parsed.type === "delta") setAiResponse((p) => p + parsed.content)
          } catch {}
        }
      }
    } catch {
      setAiResponse("// AI writer error — please retry")
    } finally {
      setAiLoading(false)
    }
  }

  const insertAIResponse = () => {
    if (!aiResponse) return
    // In edit mode: append to end; in view mode: switch to edit mode first
    const newContent = (editMode ? editContent : (initialContent || "")) + "\n\n" + aiResponse
    setEditContent(newContent)
    setIsDirty(true)
    if (!editMode) setEditMode(true)
    setAiResponse("")
    setAiPrompt("")
    setAiSources([])
  }

  const replaceAllWithAI = () => {
    if (!aiResponse) return
    setEditContent(aiResponse)
    setIsDirty(true)
    if (!editMode) setEditMode(true)
    setAiResponse("")
    setAiPrompt("")
    setAiSources([])
  }

  // ── Plain text fallback ───────────────────────────────────────────────────
  const displayContent = editMode ? editContent : (initialContent || "")

  if (loadError || (!monacoLoaded && displayContent !== null)) {
    return (
      <div className={cn("flex-1 flex flex-col overflow-hidden", className)}>
        <CodeToolbar
          filename={filename} language={language} fileUrl={fileUrl}
          editMode={editMode} isDirty={isDirty} copied={copied}
          onCopy={handleCopy} onToggleEdit={() => setEditMode(v => !v)}
          onSave={handleSave} onRevert={handleRevert}
          aiWriterOpen={aiWriterOpen} onAIWriterToggle={onAIWriterToggle}
        />
        <div className="flex-1 overflow-auto bg-[#0d0d0c]">
          {editMode ? (
            <textarea
              className="w-full h-full p-6 font-mono text-[12px] leading-[1.7] text-[#C8C4B8] bg-transparent resize-none outline-none"
              value={editContent}
              onChange={(e) => { setEditContent(e.target.value); setIsDirty(true) }}
            />
          ) : (
            <pre className="p-6 font-mono text-[12px] leading-[1.7] text-[#C8C4B8] whitespace-pre-wrap break-words">
              <code>{displayContent}</code>
            </pre>
          )}
        </div>
      </div>
    )
  }

  if (!monacoLoaded) {
    return (
      <div className={cn("flex-1 flex items-center justify-center gap-3", className)}>
        <Loader2 size={16} className="animate-spin text-muted-foreground" />
        <span className="text-sm text-muted-foreground">Loading editor…</span>
      </div>
    )
  }

  return (
    <div className={cn("flex-1 flex flex-col overflow-hidden", className)}>
      <CodeToolbar
        filename={filename} language={language} fileUrl={fileUrl}
        editMode={editMode} isDirty={isDirty} copied={copied}
        onCopy={handleCopy} onToggleEdit={() => setEditMode(v => !v)}
        onSave={handleSave} onRevert={handleRevert}
        aiWriterOpen={aiWriterOpen} onAIWriterToggle={onAIWriterToggle}
      />

      <div className="flex-1 flex overflow-hidden">
        {/* ── Editor ── */}
        <div className="flex-1 overflow-hidden">
          <MonacoEditor
            height="100%"
            language={language}
            value={displayContent}
            theme={isDark ? "kobin-dark" : "kobin-light"}
            onMount={handleEditorMount}
            onChange={editMode ? (val: string | undefined) => {
              setEditContent(val || "")
              setIsDirty(true)
            } : undefined}
            options={{
              readOnly: !editMode,
              minimap: { enabled: false },
              fontSize: 13,
              lineHeight: 22,
              fontFamily: "'Geist Mono', 'Fira Code', monospace",
              fontLigatures: true,
              padding: { top: 20, bottom: 20 },
              scrollBeyondLastLine: false,
              smoothScrolling: true,
              cursorSmoothCaretAnimation: "on",
              renderLineHighlight: "line",
              contextmenu: false,
              scrollbar: { verticalScrollbarSize: 4, horizontalScrollbarSize: 4 },
              overviewRulerLanes: 0,
              hideCursorInOverviewRuler: true,
              renderIndentGuides: true,
              guides: { indentation: true, bracketPairs: true },
              bracketPairColorization: { enabled: true },
              folding: true,
              wordWrap: "off",
              tabSize: 2,
            }}
          />
        </div>

        {/* ── AI Writer panel ── */}
        {aiWriterOpen && (
          <div className="w-72 border-l border-border flex flex-col bg-card shrink-0">
            <div className="flex items-center gap-2 px-3 py-2.5 border-b border-border">
              <div className="w-5 h-5 bg-gradient-to-br from-violet-500 to-purple-600 rounded flex items-center justify-center">
                <Sparkles size={9} className="text-white" />
              </div>
              <span className="flex-1 text-[11px] font-semibold text-foreground/70">AI Code Assistant</span>
              <button onClick={onAIWriterToggle} className="text-muted-foreground hover:text-foreground">
                <X size={11} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-3 space-y-3">
              {!aiResponse && !aiLoading && (
                <>
                  <p className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/50">Suggestions</p>
                  {[
                    "Add TypeScript types to all functions",
                    "Add error handling and try/catch",
                    "Refactor for readability",
                    "Add JSDoc comments",
                    "Convert to async/await",
                  ].map((s) => (
                    <button
                      key={s}
                      onClick={() => setAiPrompt(s)}
                      className="flex items-start gap-2 w-full text-left p-2 bg-muted/40 border border-border rounded-lg hover:border-violet-500/30 transition-all"
                    >
                      <ChevronRight size={8} className="text-violet-400 mt-1 shrink-0" />
                      <span className="text-[10px] text-muted-foreground">{s}</span>
                    </button>
                  ))}
                </>
              )}

              {aiLoading && (
                <div className="flex items-center gap-2 py-4 justify-center">
                  <Loader2 size={13} className="animate-spin text-violet-400" />
                  <span className="text-[11px] text-muted-foreground">Generating…</span>
                </div>
              )}

              {aiResponse && !aiLoading && (
                <>
                  <div className="p-2.5 bg-muted/40 border border-border rounded-lg font-mono text-[10px] text-foreground/70 leading-relaxed whitespace-pre-wrap max-h-64 overflow-y-auto">
                    {aiResponse.slice(0, 1200)}
                    {aiResponse.length > 1200 && <span className="text-muted-foreground">…</span>}
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={insertAIResponse}
                      className="py-1.5 bg-violet-500/15 border border-violet-500/30 rounded text-[10px] font-semibold text-violet-600 dark:text-violet-400 hover:bg-violet-500/25 transition-colors"
                    >
                      Append
                    </button>
                    <button
                      onClick={replaceAllWithAI}
                      className="py-1.5 bg-violet-500 rounded text-[10px] font-semibold text-white hover:bg-violet-600 transition-colors"
                    >
                      Replace all
                    </button>
                  </div>
                  <button
                    onClick={() => { setAiResponse(""); setAiPrompt(""); setAiSources([]) }}
                    className="w-full py-1.5 bg-muted/40 border border-border rounded text-[10px] text-muted-foreground hover:bg-muted transition-colors"
                  >
                    Discard
                  </button>
                </>
              )}
            </div>

            <div className="p-3 border-t border-border">
              <div className="flex gap-2">
                <textarea
                  value={aiPrompt}
                  onChange={(e) => setAiPrompt(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); runAIWriter() }
                  }}
                  placeholder="Describe what to change…"
                  rows={2}
                  className="flex-1 bg-muted/40 border border-border rounded-lg px-2.5 py-2 text-[11px] text-foreground/70 placeholder:text-muted-foreground/40 outline-none focus:border-violet-500/40 resize-none"
                />
                <button
                  onClick={runAIWriter}
                  disabled={aiLoading || !aiPrompt.trim()}
                  className="w-8 h-8 bg-violet-500 hover:bg-violet-600 rounded-lg flex items-center justify-center self-end transition-colors disabled:opacity-40"
                >
                  <Send size={11} className="text-white" />
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Toolbar ───────────────────────────────────────────────────────────────────

function CodeToolbar({
  filename, language, fileUrl, editMode, isDirty, copied,
  onCopy, onToggleEdit, onSave, onRevert,
  aiWriterOpen, onAIWriterToggle,
}: {
  filename: string; language: string; fileUrl?: string | null
  editMode: boolean; isDirty: boolean; copied: boolean
  onCopy: () => void; onToggleEdit: () => void; onSave: () => void; onRevert: () => void
  aiWriterOpen?: boolean; onAIWriterToggle?: () => void
}) {
  return (
    <div className="flex items-center gap-3 px-4 py-2 border-b border-border bg-card flex-shrink-0">
      {/* Traffic lights */}
      <div className="flex items-center gap-1.5">
        <div className="w-2.5 h-2.5 rounded-full bg-[#FF5F57]" />
        <div className="w-2.5 h-2.5 rounded-full bg-[#FEBC2E]" />
        <div className="w-2.5 h-2.5 rounded-full bg-[#28C840]" />
      </div>

      <div className="flex items-center gap-2 flex-1">
        <span className="text-[11px] font-mono text-muted-foreground">{filename}</span>
        <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider bg-[var(--brand-violet,#5B4FE8)]/10 text-[var(--brand-violet,#5B4FE8)] border border-[var(--brand-violet,#5B4FE8)]/20">
          {language}
        </span>
        {isDirty && (
          <span className="text-[9px] text-amber-500 font-semibold">● unsaved</span>
        )}
      </div>

      <div className="flex items-center gap-1">
        {/* AI Writer */}
        {onAIWriterToggle && (
          <button
            onClick={onAIWriterToggle}
            className={cn(
              "flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold transition-all border",
              aiWriterOpen
                ? "bg-violet-500/15 border-violet-500/30 text-violet-600 dark:text-violet-400"
                : "border-border bg-muted/30 text-muted-foreground hover:text-foreground"
            )}
          >
            <Sparkles size={10} />Kobin AI
          </button>
        )}

        {/* Copy */}
        <button
          onClick={onCopy}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] text-muted-foreground hover:text-foreground hover:bg-accent transition-all"
        >
          {copied ? <Check size={11} className="text-emerald-500" /> : <Copy size={11} />}
          {copied ? "Copied" : "Copy"}
        </button>

        {/* Revert (only in edit mode with changes) */}
        {editMode && isDirty && (
          <button
            onClick={onRevert}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] text-amber-600 hover:bg-amber-500/10 transition-all"
          >
            <RotateCcw size={10} />Revert
          </button>
        )}

        {/* Save */}
        {editMode && (
          <button
            onClick={onSave}
            disabled={!isDirty}
            className="flex items-center gap-1.5 px-2.5 py-1.5 bg-foreground text-background rounded-lg text-[11px] font-semibold hover:opacity-90 transition-all disabled:opacity-40"
          >
            <Check size={11} />Save
          </button>
        )}

        {/* Edit / View toggle */}
        <button
          onClick={onToggleEdit}
          className={cn(
            "flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] transition-all border",
            editMode
              ? "bg-blue-500/10 border-blue-500/20 text-blue-600 dark:text-blue-400"
              : "border-border bg-muted/30 text-muted-foreground hover:text-foreground"
          )}
        >
          {editMode ? <><Eye size={10} />View</> : <><Pencil size={10} />Edit</>}
        </button>

        {/* Download */}
        {fileUrl && (
          <a
            href={fileUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] text-muted-foreground hover:text-foreground hover:bg-accent transition-all"
          >
            <Download size={11} />Download
          </a>
        )}
      </div>
    </div>
  )
}