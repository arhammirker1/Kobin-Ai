"use client"

/**
 * components/vault/code-viewer.tsx
 *
 * Native Monaco Editor for code files.
 * Dynamically imported — zero cost when not used.
 *
 * Supports: JS, TS, TSX, JSX, PY, JSON, HTML, CSS, SQL, YAML, MD, etc.
 */

import { useEffect, useState, useRef } from "react"
import { useTheme } from "next-themes"
import { Loader2, Copy, Check, Download } from "lucide-react"
import { cn } from "@/lib/utils"

// Lazy-load Monaco to avoid SSR + bundle size issues
let MonacoEditor: any = null

interface CodeViewerProps {
    /** Raw text content of the file */
    content: string | null
    /** Filename for language detection */
    filename: string
    /** Drive/storage URL for downloading original */
    fileUrl?: string | null
    /** Called when user edits content (if editable) */
    onChange?: (value: string) => void
    /** Whether editing is allowed */
    readOnly?: boolean
    className?: string
}

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

// ── Component ─────────────────────────────────────────────────────────────────

export default function CodeViewer({
    content,
    filename,
    fileUrl,
    onChange,
    readOnly = true,
    className,
}: CodeViewerProps) {
    const { resolvedTheme = "dark" } = useTheme()
    const [monacoLoaded, setMonacoLoaded] = useState(false)
    const [loadError, setLoadError] = useState(false)
    const [copied, setCopied] = useState(false)
    const editorRef = useRef<any>(null)

    const language = detectLanguage(filename)
    const isDark = resolvedTheme === "dark"

    // ── Load Monaco dynamically ─────────────────────────────────────────────────
    useEffect(() => {
        const load = async () => {
            try {
                const mod = await import("@monaco-editor/react")
                MonacoEditor = mod.default
                setMonacoLoaded(true)
            } catch (err) {
                console.error("[CodeViewer] Failed to load Monaco:", err)
                setLoadError(true)
            }
        }
        if (!MonacoEditor) load()
        else setMonacoLoaded(true)
    }, [])

    // ── Sync theme changes to editor ────────────────────────────────────────────
    useEffect(() => {
        if (editorRef.current) {
            import("monaco-editor").then((monaco) => {
                monaco.editor.setTheme(isDark ? "kobin-dark" : "kobin-light")
            }).catch(() => { })
        }
    }, [isDark])

    const handleCopy = async () => {
        if (!content) return
        await navigator.clipboard.writeText(content)
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
    }

    const handleEditorMount = (editor: any, monaco: any) => {
        editorRef.current = editor

        // Define Kobin dark theme
        monaco.editor.defineTheme("kobin-dark", {
            base: "vs-dark",
            inherit: true,
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

        // Define Kobin light theme
        monaco.editor.defineTheme("kobin-light", {
            base: "vs",
            inherit: true,
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
                "scrollbarSlider.background": "#C8C3B8",
                "scrollbarSlider.hoverBackground": "#B8B2A5",
            },
        })

        monaco.editor.setTheme(isDark ? "kobin-dark" : "kobin-light")

        // Focus editor on mount
        editor.focus()
    }

    // ── Fallback: plain text (Monaco not available) ───────────────────────────

    if (loadError || (!monacoLoaded && content !== null)) {
        return (
            <div className={cn("flex-1 flex flex-col overflow-hidden", className)}>
                {/* Toolbar */}
                <CodeToolbar
                    filename={filename}
                    language={language}
                    fileUrl={fileUrl}
                    content={content}
                    copied={copied}
                    onCopy={handleCopy}
                />
                {/* Plain text fallback */}
                <div className="flex-1 overflow-auto bg-[#0d0d0c] dark:bg-[#0d0d0c] bg-[#F5F2EC]">
                    {content ? (
                        <pre className="p-6 font-mono text-[12px] leading-[1.7] text-[#C8C4B8] dark:text-[#C8C4B8] text-[#0D0D0C] whitespace-pre-wrap break-words">
                            <code>{content}</code>
                        </pre>
                    ) : (
                        <div className="flex items-center justify-center h-full">
                            <p className="text-sm text-muted-foreground">No content available</p>
                        </div>
                    )}
                </div>
            </div>
        )
    }

    // ── Loading state ─────────────────────────────────────────────────────────

    if (!monacoLoaded) {
        return (
            <div className={cn("flex-1 flex items-center justify-center gap-3", className)}>
                <Loader2 size={16} className="animate-spin text-muted-foreground" />
                <span className="text-sm text-muted-foreground">Loading editor…</span>
            </div>
        )
    }

    // ── Monaco editor ─────────────────────────────────────────────────────────

    return (
        <div className={cn("flex-1 flex flex-col overflow-hidden", className)}>
            {/* Toolbar */}
            <CodeToolbar
                filename={filename}
                language={language}
                fileUrl={fileUrl}
                content={content}
                copied={copied}
                onCopy={handleCopy}
            />

            {/* Editor */}
            <div className="flex-1 overflow-hidden">
                <MonacoEditor
                    height="100%"
                    language={language}
                    value={content || ""}
                    theme={isDark ? "kobin-dark" : "kobin-light"}
                    onMount={handleEditorMount}
                    onChange={readOnly ? undefined : onChange}
                    options={{
                        readOnly,
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
                        scrollbar: {
                            verticalScrollbarSize: 4,
                            horizontalScrollbarSize: 4,
                        },
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
        </div>
    )
}

// ── Toolbar ───────────────────────────────────────────────────────────────────

function CodeToolbar({
    filename, language, fileUrl, content, copied, onCopy,
}: {
    filename: string; language: string; fileUrl?: string | null
    content: string | null; copied: boolean; onCopy: () => void
}) {
    return (
        <div className="flex items-center gap-3 px-4 py-2 border-b border-border bg-card flex-shrink-0">
            {/* Traffic light dots */}
            <div className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 rounded-full bg-[#FF5F57]" />
                <div className="w-2.5 h-2.5 rounded-full bg-[#FEBC2E]" />
                <div className="w-2.5 h-2.5 rounded-full bg-[#28C840]" />
            </div>

            <div className="flex items-center gap-2 flex-1">
                <span className="text-[11px] font-mono text-muted-foreground">{filename}</span>
                <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider bg-[var(--brand-violet)]/10 text-[var(--brand-violet)] border border-[var(--brand-violet)]/20">
                    {language}
                </span>
            </div>

            <div className="flex items-center gap-1">
                {content && (
                    <button
                        onClick={onCopy}
                        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] text-muted-foreground hover:text-foreground hover:bg-accent transition-all"
                    >
                        {copied ? <Check size={11} className="text-emerald-500" /> : <Copy size={11} />}
                        {copied ? "Copied" : "Copy"}
                    </button>
                )}
                {fileUrl && (
                    <a
                        href={fileUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] text-muted-foreground hover:text-foreground hover:bg-accent transition-all"
                    >
                        <Download size={11} />
                        Drive
                    </a>
                )}
            </div>
        </div>
    )
}