"use client"

/**
 * components/vault/docx-viewer.tsx
 *
 * Renders .docx files as formatted HTML using mammoth.
 * Dynamically imported — only loads when a DOCX is opened.
 */

import { useEffect, useState } from "react"
import { Loader2, Download, ExternalLink } from "lucide-react"
import { cn } from "@/lib/utils"

interface DocxViewerProps {
    fileUrl?: string | null
    filename: string
    className?: string
}

export default function DocxViewer({ fileUrl, filename, className }: DocxViewerProps) {
    const [html, setHtml] = useState<string | null>(null)
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        if (!fileUrl) return
        parseDocx(fileUrl)
    }, [fileUrl])

    const parseDocx = async (url: string) => {
        setLoading(true)
        setError(null)
        try {
            const res = await fetch(url)
            if (!res.ok) throw new Error("Failed to fetch file")
            const buffer = await res.arrayBuffer()

            // Dynamic import of mammoth
            const mammoth = await import("mammoth")
            const result = await mammoth.convertToHtml(
                { arrayBuffer: buffer },
                {
                    styleMap: [
                        "p[style-name='Heading 1'] => h1:fresh",
                        "p[style-name='Heading 2'] => h2:fresh",
                        "p[style-name='Heading 3'] => h3:fresh",
                    ],
                }
            )

            setHtml(result.value)
        } catch (err: any) {
            console.error("[DocxViewer]", err)
            setError(err.message || "Failed to parse document")
        } finally {
            setLoading(false)
        }
    }

    if (loading) {
        return (
            <div className={cn("flex-1 flex items-center justify-center gap-3", className)}>
                <Loader2 size={16} className="animate-spin text-muted-foreground" />
                <span className="text-sm text-muted-foreground">Parsing document…</span>
            </div>
        )
    }

    if (error || !html) {
        return (
            <div className={cn("flex-1 flex flex-col items-center justify-center gap-4", className)}>
                <div className="w-16 h-16 rounded-2xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center">
                    <span className="text-blue-400 text-2xl font-bold font-mono">W</span>
                </div>
                <div className="text-center">
                    <p className="text-sm font-medium text-foreground/70 mb-1">{filename}</p>
                    <p className="text-xs text-muted-foreground">{error || "Select a file to preview"}</p>
                </div>
                {fileUrl && (
                    <div className="flex gap-2">
                        <a href={fileUrl} download className="flex items-center gap-2 px-4 py-2 bg-foreground text-background rounded-lg text-[12px] font-semibold hover:opacity-90 transition-opacity">
                            <Download size={13} />Download
                        </a>
                        <a href={fileUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 px-4 py-2 bg-card border border-border rounded-lg text-[12px] text-foreground/70 hover:bg-accent transition-colors">
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
            <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-card flex-shrink-0">
                <span className="text-[11px] text-muted-foreground font-mono">{filename}</span>
                <div className="flex items-center gap-1">
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
                </div>
            </div>

            {/* Document content */}
            <div className="flex-1 overflow-y-auto">
                <div className="max-w-[720px] mx-auto px-12 py-10">
                    <style>{DOCX_STYLES}</style>
                    <div
                        className="docx-content"
                        dangerouslySetInnerHTML={{ __html: html }}
                    />
                </div>
            </div>
        </div>
    )
}

const DOCX_STYLES = `
.docx-content { color: var(--foreground); font-size: 14px; line-height: 1.8; }
.docx-content h1 { font-size: 24px; font-weight: 700; margin: 1.4em 0 0.4em; color: var(--foreground); }
.docx-content h2 { font-size: 20px; font-weight: 600; margin: 1.2em 0 0.3em; color: var(--foreground); }
.docx-content h3 { font-size: 16px; font-weight: 600; margin: 1em 0 0.2em; color: var(--foreground); }
.docx-content p { margin: 0.6em 0; color: var(--foreground); opacity: 0.85; }
.docx-content ul, .docx-content ol { padding-left: 1.5em; margin: 0.6em 0; }
.docx-content li { margin: 0.3em 0; color: var(--foreground); opacity: 0.85; }
.docx-content strong, .docx-content b { font-weight: 600; }
.docx-content em, .docx-content i { font-style: italic; }
.docx-content table { width: 100%; border-collapse: collapse; margin: 1em 0; font-size: 13px; }
.docx-content th { background: var(--muted); font-weight: 600; }
.docx-content th, .docx-content td { padding: 8px 12px; border: 1px solid var(--border); text-align: left; }
.docx-content a { color: var(--brand-violet); text-decoration: underline; }
.docx-content img { max-width: 100%; border-radius: 8px; margin: 1em 0; }
`