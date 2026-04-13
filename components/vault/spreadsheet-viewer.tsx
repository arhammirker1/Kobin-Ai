"use client"

/**
 * components/vault/spreadsheet-viewer.tsx
 *
 * Native spreadsheet viewer using xlsx library (already in package.json).
 * Renders Excel / CSV files as interactive tables.
 * No external download needed — parses the file content in-browser.
 */

import { useEffect, useState, useMemo } from "react"
import { Loader2, Download, ChevronLeft, ChevronRight } from "lucide-react"
import { cn } from "@/lib/utils"

interface SheetData {
    name: string
    headers: string[]
    rows: string[][]
}

interface SpreadsheetViewerProps {
    /** Binary content of the file (passed from parent after fetch) */
    fileUrl?: string | null
    /** Filename for detecting CSV vs XLSX */
    filename: string
    className?: string
}

const PAGE_SIZE = 50

export default function SpreadsheetViewer({ fileUrl, filename, className }: SpreadsheetViewerProps) {
    const [sheets, setSheets] = useState<SheetData[]>([])
    const [activeSheet, setActiveSheet] = useState(0)
    const [page, setPage] = useState(0)
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const isCSV = filename.toLowerCase().endsWith(".csv")

    useEffect(() => {
        if (!fileUrl) return
        parseFile(fileUrl)
    }, [fileUrl])

    const parseFile = async (url: string) => {
        setLoading(true)
        setError(null)
        try {
            // Fetch the file
            const res = await fetch(url)
            if (!res.ok) throw new Error("Failed to fetch file")
            const buffer = await res.arrayBuffer()

            // Dynamic import of xlsx (already in package.json)
            const XLSX = await import("xlsx")
            const workbook = XLSX.read(buffer, { type: "buffer" })

            const parsedSheets: SheetData[] = workbook.SheetNames.map((name) => {
                const ws = workbook.Sheets[name]
                const jsonData = XLSX.utils.sheet_to_json(ws, {
                    header: 1,
                    defval: "",
                    raw: false,
                }) as string[][]

                if (jsonData.length === 0) return { name, headers: [], rows: [] }

                const headers = (jsonData[0] || []).map((h) => String(h || ""))
                const rows = jsonData.slice(1).map((row) =>
                    headers.map((_, i) => String(row[i] || ""))
                )

                return { name, headers, rows }
            })

            setSheets(parsedSheets)
            setActiveSheet(0)
            setPage(0)
        } catch (err: any) {
            setError(err.message || "Failed to parse spreadsheet")
        } finally {
            setLoading(false)
        }
    }

    const currentSheet = sheets[activeSheet]
    const totalPages = currentSheet ? Math.ceil(currentSheet.rows.length / PAGE_SIZE) : 0
    const visibleRows = currentSheet?.rows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE) || []

    if (loading) {
        return (
            <div className={cn("flex-1 flex items-center justify-center gap-3", className)}>
                <Loader2 size={16} className="animate-spin text-muted-foreground" />
                <span className="text-sm text-muted-foreground">Parsing spreadsheet…</span>
            </div>
        )
    }

    if (error) {
        return (
            <div className={cn("flex-1 flex flex-col items-center justify-center gap-3", className)}>
                <p className="text-sm text-destructive">{error}</p>
                {fileUrl && (
                    <a href={fileUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 px-4 py-2 bg-card border border-border rounded-lg text-sm text-foreground hover:bg-accent transition-colors">
                        <Download size={14} />Download file
                    </a>
                )}
            </div>
        )
    }

    if (!currentSheet) {
        return (
            <div className={cn("flex-1 flex items-center justify-center", className)}>
                <p className="text-sm text-muted-foreground">{fileUrl ? "Loading…" : "No file URL provided"}</p>
            </div>
        )
    }

    return (
        <div className={cn("flex-1 flex flex-col overflow-hidden bg-background", className)}>
            {/* Sheet tabs + toolbar */}
            <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-card flex-shrink-0">
                <div className="flex items-center gap-1">
                    {sheets.map((sheet, i) => (
                        <button
                            key={i}
                            onClick={() => { setActiveSheet(i); setPage(0) }}
                            className={cn(
                                "px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-all",
                                i === activeSheet
                                    ? "bg-[var(--brand-violet)] text-white"
                                    : "text-muted-foreground hover:text-foreground hover:bg-accent"
                            )}
                        >
                            {sheet.name}
                        </button>
                    ))}
                </div>
                <div className="flex items-center gap-3">
                    <span className="text-[11px] text-muted-foreground">
                        {currentSheet.rows.length} rows · {currentSheet.headers.length} cols
                    </span>
                    {fileUrl && (
                        <a href={fileUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] text-muted-foreground hover:text-foreground hover:bg-accent rounded-lg transition-all">
                            <Download size={11} />Download
                        </a>
                    )}
                </div>
            </div>

            {/* Table */}
            <div className="flex-1 overflow-auto">
                <table className="w-full text-[12px] border-collapse">
                    <thead className="sticky top-0 z-10">
                        <tr className="bg-card">
                            {/* Row number column */}
                            <th className="px-3 py-2 text-right text-[10px] font-semibold text-muted-foreground/40 border-b border-r border-border w-10 min-w-[40px]">
                                #
                            </th>
                            {currentSheet.headers.map((header, i) => (
                                <th
                                    key={i}
                                    className="px-3 py-2 text-left font-semibold text-foreground border-b border-r border-border whitespace-nowrap"
                                    style={{ minWidth: "120px", maxWidth: "300px" }}
                                >
                                    {header || <span className="text-muted-foreground/30 italic">Column {i + 1}</span>}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {visibleRows.length === 0 ? (
                            <tr>
                                <td colSpan={currentSheet.headers.length + 1} className="px-4 py-8 text-center text-muted-foreground text-sm">
                                    No data rows
                                </td>
                            </tr>
                        ) : (
                            visibleRows.map((row, rowIdx) => (
                                <tr
                                    key={rowIdx}
                                    className={cn(
                                        "transition-colors hover:bg-accent/50",
                                        rowIdx % 2 === 0 ? "bg-background" : "bg-card/40"
                                    )}
                                >
                                    <td className="px-3 py-1.5 text-right text-[10px] text-muted-foreground/40 border-r border-border">
                                        {page * PAGE_SIZE + rowIdx + 1}
                                    </td>
                                    {row.map((cell, cellIdx) => (
                                        <td
                                            key={cellIdx}
                                            className="px-3 py-1.5 text-foreground/80 border-r border-border/50"
                                            style={{ maxWidth: "300px" }}
                                        >
                                            <div className="truncate" title={cell}>{cell}</div>
                                        </td>
                                    ))}
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
                <div className="flex items-center justify-between px-4 py-2.5 border-t border-border bg-card flex-shrink-0">
                    <span className="text-[11px] text-muted-foreground">
                        Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, currentSheet.rows.length)} of {currentSheet.rows.length} rows
                    </span>
                    <div className="flex items-center gap-1">
                        <button
                            onClick={() => setPage((p) => Math.max(0, p - 1))}
                            disabled={page === 0}
                            className="p-1.5 rounded hover:bg-accent disabled:opacity-30 transition-colors"
                        >
                            <ChevronLeft size={13} />
                        </button>
                        <span className="text-[11px] text-muted-foreground px-2">
                            {page + 1} / {totalPages}
                        </span>
                        <button
                            onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                            disabled={page === totalPages - 1}
                            className="p-1.5 rounded hover:bg-accent disabled:opacity-30 transition-colors"
                        >
                            <ChevronRight size={13} />
                        </button>
                    </div>
                </div>
            )}
        </div>
    )
}