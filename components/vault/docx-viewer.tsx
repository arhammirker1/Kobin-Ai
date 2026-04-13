"use client"

/**
 * components/vault/docx-viewer.tsx
 *
 * Renders .docx files as formatted HTML via mammoth.
 * Features:
 *  - View mode: rendered HTML (as before)
 *  - Edit mode: TipTap rich-text editor loaded with parsed HTML
 *  - Save: persists HTML to extracted_text via onSave callback
 *  - If existingHtml is provided (previously edited), shows TipTap directly
 *    without re-parsing the .docx
 *  - External save ref for parent header button
 */

import { useEffect, useState, useRef, useCallback } from "react"
import { Loader2, Download, ExternalLink, Pencil, Eye, Check, Sparkles, X, Send, ChevronRight } from "lucide-react"
import { cn } from "@/lib/utils"

// ── TipTap loader (same lazy pattern as note-editor) ─────────────────────────

let _useEditor: any = null
let _EditorContent: any = null
let _Extensions: any = null

async function loadTipTap() {
  if (_useEditor) return true
  const [core, starter, placeholder, underline] = await Promise.all([
    import("@tiptap/react"),
    import("@tiptap/starter-kit"),
    import("@tiptap/extension-placeholder"),
    import("@tiptap/extension-underline"),
  ])
  _useEditor = core.useEditor
  _EditorContent = core.EditorContent
  _Extensions = [
    starter.default.configure({ heading: { levels: [1, 2, 3] } }),
    placeholder.default.configure({ placeholder: "Start editing…" }),
    underline.default,
  ]
  return true
}

// ── Props ─────────────────────────────────────────────────────────────────────

export interface DocxViewerProps {
  fileUrl?: string | null
  filename: string
  /** Pre-existing edited HTML (from extracted_text). If provided, skips mammoth parse. */
  existingHtml?: string | null
  /** Controlled edit mode from parent */
  editMode?: boolean
  onEditModeChange?: (v: boolean) => void
  onSave?: (htmlContent: string) => void
  /** Parent assigns this ref so its Save button can trigger the child's save */
  saveRef?: React.MutableRefObject<(() => void) | null>
  /** AI writer visibility from parent */
  aiWriterOpen?: boolean
  onAIWriterToggle?: () => void
  className?: string
}

// ── Main component ────────────────────────────────────────────────────────────

export default function DocxViewer({
  fileUrl,
  filename,
  existingHtml,
  editMode = false,
  onEditModeChange,
  onSave,
  saveRef,
  aiWriterOpen = false,
  onAIWriterToggle,
  className,
}: DocxViewerProps) {
  const [parsedHtml, setParsedHtml] = useState<string | null>(existingHtml || null)
  const [loadingParse, setLoadingParse] = useState(false)
  const [parseError, setParseError] = useState<string | null>(null)
  const [tiptapReady, setTiptapReady] = useState(false)

  // ── AI Writer ─────────────────────────────────────────────────────────────
  const [aiPrompt, setAiPrompt] = useState("")
  const [aiResponse, setAiResponse] = useState("")
  const [aiLoading, setAiLoading] = useState(false)

  // Parse .docx on first load (skip if we already have existingHtml)
  useEffect(() => {
    if (existingHtml) {
      setParsedHtml(existingHtml)
      return
    }
    if (fileUrl) parseMammoth(fileUrl)
  }, [fileUrl, existingHtml])

  // Load TipTap when entering edit mode
  useEffect(() => {
    if (editMode && !_useEditor) {
      loadTipTap().then(() => setTiptapReady(true))
    } else if (editMode && _useEditor) {
      setTiptapReady(true)
    }
  }, [editMode])

  const parseMammoth = async (url: string) => {
    setLoadingParse(true)
    setParseError(null)
    try {
      const res = await fetch(url)
      if (!res.ok) throw new Error("Failed to fetch file")
      const buffer = await res.arrayBuffer()
      const mammoth = await import("mammoth")
      const result = await mammoth.convertToHtml({ arrayBuffer: buffer }, {
        styleMap: [
          "p[style-name='Heading 1'] => h1:fresh",
          "p[style-name='Heading 2'] => h2:fresh",
          "p[style-name='Heading 3'] => h3:fresh",
        ],
      })
      setParsedHtml(result.value)
    } catch (err: any) {
      setParseError(err.message || "Failed to parse document")
    } finally {
      setLoadingParse(false)
    }
  }

  if (loadingParse) {
    return (
      <div className={cn("flex-1 flex items-center justify-center gap-3", className)}>
        <Loader2 size={16} className="animate-spin text-muted-foreground" />
        <span className="text-sm text-muted-foreground">Parsing document…</span>
      </div>
    )
  }

  if (parseError && !parsedHtml) {
    return (
      <div className={cn("flex-1 flex flex-col items-center justify-center gap-4", className)}>
        <div className="w-16 h-16 rounded-2xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center">
          <span className="text-blue-400 text-2xl font-bold font-mono">W</span>
        </div>
        <div className="text-center">
          <p className="text-sm font-medium text-foreground/70 mb-1">{filename}</p>
          <p className="text-xs text-muted-foreground">{parseError}</p>
        </div>
        {fileUrl && (
          <div className="flex gap-2">
            <a href={fileUrl} download className="flex items-center gap-2 px-4 py-2 bg-foreground text-background rounded-lg text-[12px] font-semibold hover:opacity-90">
              <Download size={13} />Download
            </a>
            <a href={fileUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 px-4 py-2 bg-card border border-border rounded-lg text-[12px] text-foreground/70 hover:bg-accent">
              <ExternalLink size={13} />Open in Drive
            </a>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className={cn("flex-1 flex flex-col overflow-hidden bg-background", className)}>
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-card flex-shrink-0 gap-3">
        <span className="text-[11px] text-muted-foreground font-mono truncate flex-1">{filename}</span>
        <div className="flex items-center gap-1.5 shrink-0">
          {onAIWriterToggle && editMode && (
            <button
              onClick={onAIWriterToggle}
              className={cn(
                "flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold border transition-all",
                aiWriterOpen
                  ? "bg-violet-500/15 border-violet-500/30 text-violet-600 dark:text-violet-400"
                  : "border-border bg-muted/30 text-muted-foreground hover:text-foreground"
              )}
            >
              <Sparkles size={10} />Kobin AI
            </button>
          )}
          {fileUrl && (
            <>
              <a href={fileUrl} download className="flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] text-muted-foreground hover:text-foreground hover:bg-accent rounded-lg transition-all">
                <Download size={11} />Download
              </a>
              <a href={fileUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] text-muted-foreground hover:text-foreground hover:bg-accent rounded-lg transition-all">
                <ExternalLink size={11} />Drive
              </a>
            </>
          )}
          <button
            onClick={() => onEditModeChange?.(!editMode)}
            className={cn(
              "flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] border transition-all",
              editMode
                ? "bg-blue-500/10 border-blue-500/20 text-blue-600 dark:text-blue-400"
                : "border-border bg-muted/30 text-muted-foreground hover:text-foreground"
            )}
          >
            {editMode ? <><Eye size={10} />View</> : <><Pencil size={10} />Edit</>}
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 flex overflow-hidden">
        {editMode ? (
          <TipTapDocEditor
            html={parsedHtml || ""}
            onSave={onSave}
            saveRef={saveRef}
            aiWriterOpen={aiWriterOpen}
            onAIWriterToggle={onAIWriterToggle}
            filename={filename}
            tiptapReady={tiptapReady}
          />
        ) : (
          <div className="flex-1 overflow-y-auto">
            <div className="max-w-[720px] mx-auto px-12 py-10">
              <style>{DOCX_STYLES}</style>
              {parsedHtml ? (
                <div className="docx-content" dangerouslySetInnerHTML={{ __html: parsedHtml }} />
              ) : (
                <div className="flex flex-col items-center justify-center h-48 gap-3">
                  <Loader2 size={16} className="animate-spin text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">Loading…</p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ── TipTap editor for DOCX editing ───────────────────────────────────────────

function TipTapDocEditor({
  html, onSave, saveRef, aiWriterOpen, onAIWriterToggle, filename, tiptapReady,
}: {
  html: string
  onSave?: (html: string) => void
  saveRef?: React.MutableRefObject<(() => void) | null>
  aiWriterOpen?: boolean
  onAIWriterToggle?: () => void
  filename: string
  tiptapReady: boolean
}) {
  const [editor, setEditor] = useState<any>(null)
  const [isDirty, setIsDirty] = useState(false)

  // AI Writer state
  const [aiPrompt, setAiPrompt] = useState("")
  const [aiResponse, setAiResponse] = useState("")
  const [aiLoading, setAiLoading] = useState(false)
  const [aiSources, setAiSources] = useState<any[]>([])
  const insertRef = useRef<((content: string) => void) | null>(null)

  useEffect(() => {
    if (!tiptapReady || !_useEditor) return

    const ed = _useEditor({
      extensions: _Extensions,
      content: html,
      editorProps: {
        attributes: { class: "tiptap-editor prose-kobin outline-none min-h-[400px]" },
      },
      onUpdate: () => setIsDirty(true),
    })
    setEditor(ed)
    return () => ed?.destroy()
  }, [tiptapReady])

  // Wire insert ref for AI response
  useEffect(() => {
    if (!editor) return
    insertRef.current = (text: string) => {
      editor.chain().focus().insertContent(text).run()
    }
  }, [editor])

  // Expose save to parent
  useEffect(() => {
    if (!saveRef) return
    saveRef.current = () => {
      if (editor && isDirty) {
        onSave?.(editor.getHTML())
        setIsDirty(false)
      }
    }
    return () => { if (saveRef) saveRef.current = null }
  }, [editor, isDirty, onSave])

  const runAIWriter = async () => {
    if (!aiPrompt.trim()) return
    setAiLoading(true)
    setAiResponse("")
    setAiSources([])
    try {
      const currentContent = editor?.getHTML() || html
      const res = await fetch("/api/vault/ai-write", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: aiPrompt,
          documentTitle: filename,
          documentContent: currentContent.replace(/<[^>]+>/g, " ").slice(0, 3000),
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
      setAiResponse("AI writer error — please retry")
    } finally {
      setAiLoading(false)
    }
  }

  const insertAIResponse = () => {
    if (!aiResponse || !insertRef.current) return
    insertRef.current("\n\n" + aiResponse)
    setAiResponse("")
    setAiPrompt("")
    setAiSources([])
  }

  if (!tiptapReady || !editor) {
    return (
      <div className="flex-1 flex items-center justify-center gap-3">
        <Loader2 size={16} className="animate-spin text-muted-foreground" />
        <span className="text-sm text-muted-foreground">Loading editor…</span>
      </div>
    )
  }

  return (
    <div className="flex-1 flex overflow-hidden">
      {/* Editor area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Mini toolbar */}
        <div className="flex items-center gap-0.5 px-4 py-1.5 border-b border-border bg-card flex-shrink-0">
          {[
            { label: "B", action: () => editor.chain().focus().toggleBold().run(), active: editor.isActive("bold"), style: "font-bold" },
            { label: "I", action: () => editor.chain().focus().toggleItalic().run(), active: editor.isActive("italic"), style: "italic" },
            { label: "U", action: () => editor.chain().focus().toggleUnderline().run(), active: editor.isActive("underline"), style: "underline" },
          ].map((t) => (
            <button
              key={t.label}
              onClick={t.action}
              className={cn(
                `w-7 h-7 flex items-center justify-center rounded text-[12px] ${t.style} transition-all`,
                t.active ? "bg-[var(--brand-violet,#5B4FE8)] text-white" : "text-muted-foreground hover:bg-accent"
              )}
            >{t.label}</button>
          ))}
          <div className="w-px h-4 bg-border mx-1" />
          {[1,2,3].map((level) => (
            <button
              key={level}
              onClick={() => editor.chain().focus().toggleHeading({ level }).run()}
              className={cn(
                "px-2 h-7 flex items-center rounded text-[10px] font-bold transition-all",
                editor.isActive("heading", { level })
                  ? "bg-[var(--brand-violet,#5B4FE8)] text-white"
                  : "text-muted-foreground hover:bg-accent"
              )}
            >H{level}</button>
          ))}
          <div className="flex-1" />
          {isDirty && (
            <button
              onClick={() => { if (editor) { onSave?.(editor.getHTML()); setIsDirty(false) } }}
              className="flex items-center gap-1.5 px-2.5 py-1 bg-foreground text-background rounded text-[11px] font-semibold hover:opacity-90"
            >
              <Check size={10} />Save
            </button>
          )}
        </div>

        <div className="flex-1 overflow-y-auto">
          <div className="max-w-[720px] mx-auto px-12 py-10">
            <style>{TIPTAP_STYLES}</style>
            <_EditorContent editor={editor} className="tiptap-wrapper" />
          </div>
        </div>
      </div>

      {/* AI Writer panel */}
      {aiWriterOpen && (
        <div className="w-68 border-l border-border flex flex-col bg-card shrink-0">
          <div className="flex items-center gap-2 px-3 py-2.5 border-b border-border">
            <div className="w-5 h-5 bg-gradient-to-br from-violet-500 to-purple-600 rounded flex items-center justify-center">
              <Sparkles size={9} className="text-white" />
            </div>
            <span className="flex-1 text-[11px] font-semibold text-foreground/70">Kobin AI Writer</span>
            <button onClick={onAIWriterToggle} className="text-muted-foreground hover:text-foreground">
              <X size={11} />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-3 space-y-3">
            {!aiResponse && !aiLoading && (
              <>
                <p className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/50">Suggestions</p>
                {[
                  "Improve clarity and flow",
                  "Add an executive summary",
                  "Make it more concise",
                  "Convert bullet points to prose",
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
                <span className="text-[11px] text-muted-foreground">Writing…</span>
              </div>
            )}
            {aiResponse && !aiLoading && (
              <>
                <div className="p-2.5 bg-muted/40 border border-border rounded-lg text-[10px] text-foreground/70 leading-relaxed whitespace-pre-wrap max-h-48 overflow-y-auto">
                  {aiResponse}
                </div>
                {aiSources.length > 0 && (
                  <div className="space-y-1.5">
                    <p className="text-[8px] font-bold uppercase tracking-widest text-muted-foreground/40">Sources</p>
                    {aiSources.map((s: any) => (
                      <div key={s.id} className="flex items-center gap-2 p-1.5 bg-violet-500/5 border border-violet-500/15 rounded text-[9px]">
                        <span className="text-violet-400/70 font-semibold truncate">{s.title}</span>
                        <span className="text-muted-foreground/40 shrink-0">{(s.similarity * 100).toFixed(0)}%</span>
                      </div>
                    ))}
                  </div>
                )}
                <div className="flex gap-2">
                  <button onClick={insertAIResponse} className="flex-1 py-1.5 bg-violet-500/15 border border-violet-500/30 rounded text-[10px] font-semibold text-violet-600 dark:text-violet-400 hover:bg-violet-500/25">Insert</button>
                  <button onClick={() => { setAiResponse(""); setAiPrompt(""); setAiSources([]) }} className="flex-1 py-1.5 bg-muted/40 border border-border rounded text-[10px] text-muted-foreground hover:bg-muted">Discard</button>
                </div>
              </>
            )}
          </div>

          <div className="p-3 border-t border-border">
            <div className="flex gap-2">
              <textarea
                value={aiPrompt}
                onChange={(e) => setAiPrompt(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); runAIWriter() } }}
                placeholder="Ask AI to edit…"
                rows={2}
                className="flex-1 bg-muted/40 border border-border rounded-lg px-2.5 py-2 text-[11px] text-foreground/70 placeholder:text-muted-foreground/40 outline-none focus:border-violet-500/40 resize-none"
              />
              <button
                onClick={runAIWriter}
                disabled={aiLoading || !aiPrompt.trim()}
                className="w-8 h-8 bg-violet-500 hover:bg-violet-600 rounded-lg flex items-center justify-center self-end disabled:opacity-40"
              >
                <Send size={11} className="text-white" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Styles ────────────────────────────────────────────────────────────────────

const DOCX_STYLES = `
.docx-content { color: var(--foreground); font-size: 14px; line-height: 1.8; }
.docx-content h1 { font-size: 24px; font-weight: 700; margin: 1.4em 0 0.4em; }
.docx-content h2 { font-size: 20px; font-weight: 600; margin: 1.2em 0 0.3em; }
.docx-content h3 { font-size: 16px; font-weight: 600; margin: 1em 0 0.2em; }
.docx-content p { margin: 0.6em 0; opacity: 0.85; }
.docx-content ul, .docx-content ol { padding-left: 1.5em; margin: 0.6em 0; }
.docx-content li { margin: 0.3em 0; opacity: 0.85; }
.docx-content strong { font-weight: 600; }
.docx-content em { font-style: italic; }
.docx-content table { width: 100%; border-collapse: collapse; margin: 1em 0; font-size: 13px; }
.docx-content th { background: var(--muted); font-weight: 600; }
.docx-content th, .docx-content td { padding: 8px 12px; border: 1px solid var(--border); }
.docx-content a { color: var(--brand-violet, #5B4FE8); text-decoration: underline; }
.docx-content img { max-width: 100%; border-radius: 8px; margin: 1em 0; }
`

const TIPTAP_STYLES = `
.tiptap-wrapper .tiptap-editor { color: var(--foreground); font-size: 14px; line-height: 1.8; }
.tiptap-wrapper .tiptap-editor > * + * { margin-top: 0.6em; }
.tiptap-wrapper h1 { font-size: 22px; font-weight: 700; margin-top: 1.4em; margin-bottom: 0.3em; }
.tiptap-wrapper h2 { font-size: 18px; font-weight: 600; margin-top: 1.2em; margin-bottom: 0.2em; }
.tiptap-wrapper h3 { font-size: 15px; font-weight: 600; margin-top: 1em; }
.tiptap-wrapper p { opacity: 0.85; }
.tiptap-wrapper ul, .tiptap-wrapper ol { padding-left: 1.4em; }
.tiptap-wrapper li { margin-bottom: 0.2em; opacity: 0.85; }
.tiptap-wrapper blockquote { border-left: 3px solid var(--brand-violet, #5B4FE8); padding-left: 1em; color: var(--muted-foreground); font-style: italic; }
.tiptap-wrapper code { font-family: 'Geist Mono', monospace; font-size: 12px; padding: 2px 5px; background: var(--muted); border-radius: 4px; }
.tiptap-wrapper .is-editor-empty:first-child::before { content: attr(data-placeholder); color: var(--muted-foreground); opacity: 0.4; pointer-events: none; float: left; height: 0; }
`