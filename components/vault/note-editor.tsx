"use client"

/**
 * components/vault/note-editor.tsx
 *
 * Full-page TipTap editor (Notion/Linear style) for notes and text files.
 * Dynamically imported to avoid SSR issues + bundle size.
 *
 * Features:
 * - Bold, Italic, Underline, Strikethrough
 * - Headings H1/H2/H3
 * - Bullet list, Ordered list, Todo list
 * - Code block, Blockquote, Horizontal rule
 * - Auto-save with debounce
 * - Slash-command hint
 */

import { useEffect, useRef, useState, useCallback } from "react"
import {
    Loader2, Bold, Italic, Code, List, ListOrdered,
    Quote, Minus, Heading1, Heading2, Heading3, Strikethrough,
    Underline as UnderlineIcon, Sparkles
} from "lucide-react"
import { cn } from "@/lib/utils"

// TipTap — loaded dynamically
let useEditor: any = null
let EditorContent: any = null
let TipTapExtensions: any = null

async function loadTipTap() {
    const [core, starter, placeholder, underline, strike, code, tasks, taskItem] = await Promise.all([
        import("@tiptap/react"),
        import("@tiptap/starter-kit"),
        import("@tiptap/extension-placeholder"),
        import("@tiptap/extension-underline"),
        import("@tiptap/extension-strike"),
        import("@tiptap/extension-code-block-lowlight"),
        import("@tiptap/extension-task-list"),
        import("@tiptap/extension-task-item"),
    ])

    useEditor = core.useEditor
    EditorContent = core.EditorContent

    TipTapExtensions = [
        starter.default.configure({
            heading: { levels: [1, 2, 3] },
            bulletList: { keepMarks: true },
            orderedList: { keepMarks: true },
            // code: true (default) — do NOT disable, toggleCode() needs it
            codeBlock: false,
        }),
        placeholder.default.configure({
            placeholder: ({ node }: any) => {
                if (node.type.name === "heading") return "Heading"
                return "Write something… or type / for commands"
            },
        }),
        underline.default,
        tasks.default,
        taskItem.default.configure({ nested: true }),
    ]

    return true
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface NoteEditorProps {
    title: string
    content: string
    onTitleChange: (t: string) => void
    onContentChange: (c: string) => void
    onSave?: () => void
    isSaving?: boolean
    projectName?: string
    createdAt?: string
    className?: string
    /** Enable the AI Writer button */
    onAIWrite?: () => void
    /** Ref that gets assigned an insert function — call it to inject content into the editor */
    editorInsertRef?: React.MutableRefObject<((content: string) => void) | null>
}
// ── Component ─────────────────────────────────────────────────────────────────

export default function NoteEditor({
    title, content,
    onTitleChange, onContentChange,
    onSave, isSaving,
    projectName, createdAt,
    className, onAIWrite,
    editorInsertRef,
}: NoteEditorProps) {
    const [ready, setReady] = useState(false)
    const [loadErr, setLoadErr] = useState(false)
    const titleRef = useRef<HTMLTextAreaElement>(null)
    const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

    // ── Load TipTap ─────────────────────────────────────────────────────────────
    useEffect(() => {
        loadTipTap()
            .then(() => setReady(true))
            .catch(() => setLoadErr(true))
    }, [])

    // Auto-resize title textarea
    useEffect(() => {
        if (titleRef.current) {
            titleRef.current.style.height = "auto"
            titleRef.current.style.height = titleRef.current.scrollHeight + "px"
        }
    }, [title])

    // ── Keyboard shortcuts ──────────────────────────────────────────────────────
    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "s") {
                e.preventDefault()
                onSave?.()
            }
        }
        window.addEventListener("keydown", handler)
        return () => window.removeEventListener("keydown", handler)
    }, [onSave])

    if (!ready) {
        return (
            <div className="flex-1 flex items-center justify-center gap-3">
                <Loader2 size={16} className="animate-spin text-muted-foreground" />
                <span className="text-sm text-muted-foreground">Loading editor…</span>
            </div>
        )
    }

    if (loadErr) {
        // Graceful plain-text fallback
        return (
            <PlainTextFallback
                title={title}
                content={content}
                onTitleChange={onTitleChange}
                onContentChange={onContentChange}
                onSave={onSave}
                isSaving={isSaving}
                projectName={projectName}
            />
        )
    }

        return (
        <TipTapEditorInner
            title={title}
            content={content}
            onTitleChange={onTitleChange}
            onContentChange={onContentChange}
            onSave={onSave}
            isSaving={isSaving}
            projectName={projectName}
            createdAt={createdAt}
            className={className}
            onAIWrite={onAIWrite}
            editorInsertRef={editorInsertRef}
        />
    )
}

// ── Inner editor (only rendered after TipTap is loaded) ───────────────────────

function TipTapEditorInner({
    title, content, onTitleChange, onContentChange,
    onSave, isSaving, projectName, createdAt, className, onAIWrite, editorInsertRef,
}: NoteEditorProps) {
    const editor = useEditor({
        extensions: TipTapExtensions,
        content,
        editorProps: {
            attributes: {
                class: "tiptap-editor prose-kobin outline-none min-h-[400px]",
            },
        },
        onUpdate: ({ editor }: any) => {
            onContentChange(editor.getHTML())
        },
    })

    // ── Wire editorInsertRef so vault-view can inject AI content ───────────────
    useEffect(() => {
        if (!editorInsertRef) return
        editorInsertRef.current = (text: string) => {
            if (!editor) return
            // Convert plain-text paragraphs to TipTap-compatible content
            // TipTap insertContent handles plain strings correctly
            editor.chain().focus().insertContent(text).run()
        }
        return () => {
            if (editorInsertRef) editorInsertRef.current = null
        }
    }, [editor, editorInsertRef])

    // ── Toolbar helpers ─────────────────────────────────────────────────────────
    const tools: Array<{
        icon: React.ReactNode
        label: string
        active?: boolean
        action: () => void
    }> = editor
            ? [
                { icon: <Bold size={13} />, label: "Bold", active: editor.isActive("bold"), action: () => editor.chain().focus().toggleBold().run() },
                { icon: <Italic size={13} />, label: "Italic", active: editor.isActive("italic"), action: () => editor.chain().focus().toggleItalic().run() },
                { icon: <UnderlineIcon size={13} />, label: "Underline", active: editor.isActive("underline"), action: () => editor.chain().focus().toggleUnderline().run() },
                { icon: <Strikethrough size={13} />, label: "Strike", active: editor.isActive("strike"), action: () => editor.chain().focus().toggleStrike().run() },
                { divider: true } as any,
                { icon: <Heading1 size={13} />, label: "H1", active: editor.isActive("heading", { level: 1 }), action: () => editor.chain().focus().toggleHeading({ level: 1 }).run() },
                { icon: <Heading2 size={13} />, label: "H2", active: editor.isActive("heading", { level: 2 }), action: () => editor.chain().focus().toggleHeading({ level: 2 }).run() },
                { icon: <Heading3 size={13} />, label: "H3", active: editor.isActive("heading", { level: 3 }), action: () => editor.chain().focus().toggleHeading({ level: 3 }).run() },
                { divider: true } as any,
                { icon: <List size={13} />, label: "Bullet", active: editor.isActive("bulletList"), action: () => editor.chain().focus().toggleBulletList().run() },
                { icon: <ListOrdered size={13} />, label: "Number", active: editor.isActive("orderedList"), action: () => editor.chain().focus().toggleOrderedList().run() },
                { divider: true } as any,
                { icon: <Code size={13} />, label: "Code", active: editor.isActive("code"), action: () => editor.chain().focus().toggleCode().run() },
                { icon: <Quote size={13} />, label: "Quote", active: editor.isActive("blockquote"), action: () => editor.chain().focus().toggleBlockquote().run() },
                { icon: <Minus size={13} />, label: "Rule", action: () => editor.chain().focus().setHorizontalRule().run() },
            ]
            : []

    return (
        <div className={cn("flex-1 flex flex-col overflow-hidden bg-background", className)}>
            {/* Toolbar */}
            <div className="flex items-center gap-0.5 px-4 py-2 border-b border-border bg-card flex-shrink-0 flex-wrap">
                {tools.map((tool, i) =>
                    (tool as any).divider ? (
                        <div key={i} className="w-px h-3.5 bg-border mx-1.5" />
                    ) : (
                        <button
                            key={i}
                            title={tool.label}
                            onClick={tool.action}
                            className={cn(
                                "w-7 h-7 flex items-center justify-center rounded-md text-[11px] transition-all",
                                tool.active
                                    ? "bg-[var(--brand-violet)] text-white"
                                    : "text-muted-foreground hover:text-foreground hover:bg-accent"
                            )}
                        >
                            {tool.icon}
                        </button>
                    )
                )}
                {onAIWrite && (
                    <>
                        <div className="w-px h-3.5 bg-border mx-1.5" />
                        <button
                            onClick={onAIWrite}
                            className="flex items-center gap-1.5 px-2.5 h-7 rounded-md text-[11px] font-semibold text-[var(--brand-violet)] bg-[var(--brand-violet)]/10 border border-[var(--brand-violet)]/20 hover:bg-[var(--brand-violet)]/20 transition-all"
                        >
                            <Sparkles size={10} />
                            Kobin AI
                        </button>
                    </>
                )}
            </div>

            {/* Editor area */}
            <div className="flex-1 overflow-y-auto">
                <div className="max-w-[720px] mx-auto px-12 py-10">
                    {/* Title */}
                    <textarea
                        value={title}
                        onChange={(e) => onTitleChange(e.target.value)}
                        placeholder="Untitled"
                        rows={1}
                        className="w-full bg-transparent text-[28px] font-bold text-foreground outline-none resize-none leading-tight placeholder:text-muted-foreground/30 mb-2 overflow-hidden"
                        style={{ minHeight: "42px" }}
                        onInput={(e) => {
                            const el = e.currentTarget
                            el.style.height = "auto"
                            el.style.height = el.scrollHeight + "px"
                        }}
                    />

                    {/* Meta */}
                    <div className="flex items-center gap-2 text-[11px] text-muted-foreground/50 mb-8">
                        {createdAt && <span>{new Date(createdAt).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}</span>}
                        {projectName && <><span>·</span><span>{projectName}</span></>}
                    </div>

                    {/* TipTap content */}
                    <style>{TIPTAP_STYLES}</style>
                    <EditorContent editor={editor} className="tiptap-wrapper" />
                </div>
            </div>

            {/* Status bar */}
            <div className="px-6 py-2 border-t border-border bg-card flex-shrink-0 flex items-center justify-between">
                <p className="text-[10px] text-muted-foreground/40">
                    <kbd className="border border-border rounded px-1 font-mono text-[9px]">⌘S</kbd> to save
                    {" · "}
                    <kbd className="border border-border rounded px-1 font-mono text-[9px]">/</kbd> for commands
                </p>
                {isSaving && (
                    <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground/50">
                        <Loader2 size={9} className="animate-spin" />
                        Saving…
                    </div>
                )}
            </div>
        </div>
    )
}

// ── Plain text fallback ───────────────────────────────────────────────────────

function PlainTextFallback({
    title, content, onTitleChange, onContentChange, onSave, isSaving, projectName,
}: Omit<NoteEditorProps, "createdAt" | "className" | "onAIWrite">) {
    return (
        <div className="flex-1 flex flex-col overflow-hidden bg-background">
            <div className="flex-1 overflow-y-auto">
                <div className="max-w-[720px] mx-auto px-12 py-10">
                    <input
                        value={title}
                        onChange={(e) => onTitleChange(e.target.value)}
                        placeholder="Untitled"
                        className="w-full bg-transparent text-[28px] font-bold text-foreground outline-none mb-8 placeholder:text-muted-foreground/30"
                    />
                    <textarea
                        value={content}
                        onChange={(e) => onContentChange(e.target.value)}
                        placeholder="Start writing…"
                        className="w-full bg-transparent text-[14px] leading-7 text-foreground/80 outline-none resize-none placeholder:text-muted-foreground/30 min-h-[400px]"
                    />
                </div>
            </div>
            <div className="px-6 py-2 border-t border-border bg-card flex-shrink-0">
                <p className="text-[10px] text-muted-foreground/40"><kbd className="border border-border rounded px-1 font-mono text-[9px]">⌘S</kbd> to save</p>
            </div>
        </div>
    )
}

// ── TipTap CSS (inlined to avoid extra CSS file) ──────────────────────────────

const TIPTAP_STYLES = `
.tiptap-wrapper .tiptap-editor {
  color: var(--foreground);
  font-size: 14px;
  line-height: 1.8;
}
.tiptap-wrapper .tiptap-editor > * + * { margin-top: 0.6em; }
.tiptap-wrapper h1 { font-size: 22px; font-weight: 700; color: var(--foreground); margin-top: 1.4em; margin-bottom: 0.3em; }
.tiptap-wrapper h2 { font-size: 18px; font-weight: 600; color: var(--foreground); margin-top: 1.2em; margin-bottom: 0.2em; }
.tiptap-wrapper h3 { font-size: 15px; font-weight: 600; color: var(--foreground); margin-top: 1em; margin-bottom: 0.2em; }
.tiptap-wrapper p { color: var(--foreground); opacity: 0.8; }
.tiptap-wrapper ul, .tiptap-wrapper ol { padding-left: 1.4em; }
.tiptap-wrapper li { margin-bottom: 0.2em; color: var(--foreground); opacity: 0.8; }
.tiptap-wrapper blockquote { border-left: 3px solid var(--brand-violet); padding-left: 1em; color: var(--muted-foreground); font-style: italic; }
.tiptap-wrapper code { font-family: 'Geist Mono', monospace; font-size: 12px; padding: 2px 5px; background: var(--muted); border-radius: 4px; border: 1px solid var(--border); }
.tiptap-wrapper pre { background: var(--card); border: 1px solid var(--border); border-radius: 8px; padding: 14px; overflow-x: auto; }
.tiptap-wrapper pre code { background: none; border: none; padding: 0; font-size: 12px; }
.tiptap-wrapper hr { border: none; border-top: 1px solid var(--border); margin: 1.5em 0; }
.tiptap-wrapper strong { font-weight: 600; }
.tiptap-wrapper em { font-style: italic; }
.tiptap-wrapper .is-editor-empty:first-child::before {
  content: attr(data-placeholder);
  color: var(--muted-foreground);
  opacity: 0.4;
  pointer-events: none;
  float: left;
  height: 0;
}
/* Task list */
.tiptap-wrapper ul[data-type="taskList"] { list-style: none; padding-left: 0.4em; }
.tiptap-wrapper ul[data-type="taskList"] li { display: flex; align-items: flex-start; gap: 8px; }
.tiptap-wrapper ul[data-type="taskList"] li input[type="checkbox"] { margin-top: 4px; accent-color: var(--brand-violet); cursor: pointer; }
`