"use client"

/**
 * components/vault/spreadsheet-viewer.tsx
 *
 * Native spreadsheet viewer + editor using xlsx library.
 * Renders Excel / CSV files as interactive, editable tables.
 * Edit mode: inline cell editing with Tab/Enter/Esc navigation.
 * Save: exports active sheet as CSV text via onSave callback.
 */

import { useEffect, useState, useRef, useCallback } from "react"
import { Loader2, Download, ChevronLeft, ChevronRight, Pencil, Eye, Check, RotateCcw } from "lucide-react"
import { cn } from "@/lib/utils"

interface SheetData {
  name: string
  headers: string[]
  rows: string[][]
}

interface EditingCell {
  row: number   // absolute row index across all pages
  col: number
}

export interface SpreadsheetViewerProps {
  fileUrl?: string | null
  filename: string
  onSave?: (csvContent: string) => void
  saveRef?: React.MutableRefObject<(() => void) | null>
  className?: string
}

const PAGE_SIZE = 50

export default function SpreadsheetViewer({
  fileUrl,
  filename,
  onSave,
  saveRef,
  className,
}: SpreadsheetViewerProps) {
  const [sheets, setSheets] = useState<SheetData[]>([])
  const [editableSheets, setEditableSheets] = useState<SheetData[]>([])
  const [activeSheet, setActiveSheet] = useState(0)
  const [page, setPage] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [editMode, setEditMode] = useState(false)
  const [editingCell, setEditingCell] = useState<EditingCell | null>(null)
  const [isDirty, setIsDirty] = useState(false)
  const editInputRef = useRef<HTMLInputElement>(null)

  // ── Parse file ─────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!fileUrl) return
    parseFile(fileUrl)
  }, [fileUrl])

  const parseFile = async (url: string) => {
    setLoading(true)
    setError(null)
    console.log(`[SpreadsheetViewer] Parsing "${filename}" from ${url.slice(0, 60)}…`)
    try {
      const res = await fetch(url)
      if (!res.ok) throw new Error(`Fetch failed: ${res.status} ${res.statusText}`)
      const buffer = await res.arrayBuffer()
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
        const headers = (jsonData[0] || []).map((h) => String(h ?? ""))
        const rows = jsonData.slice(1).map((row) =>
          headers.map((_, i) => String(row[i] ?? ""))
        )
        return { name, headers, rows }
      })

      console.log(`[SpreadsheetViewer] Parsed ${parsedSheets.length} sheet(s)`)
      setSheets(parsedSheets)
      setEditableSheets(JSON.parse(JSON.stringify(parsedSheets)))
      setActiveSheet(0)
      setPage(0)
    } catch (err: any) {
      console.error("[SpreadsheetViewer] Parse error:", err)
      setError(err.message || "Failed to parse spreadsheet")
    } finally {
      setLoading(false)
    }
  }

  // ── Edit handlers ──────────────────────────────────────────────────────────

  const handleCellChange = useCallback((absRowIdx: number, colIdx: number, value: string) => {
    setEditableSheets(prev => {
      const updated: SheetData[] = JSON.parse(JSON.stringify(prev))
      const sheet = updated[activeSheet]
      if (sheet?.rows[absRowIdx]) {
        sheet.rows[absRowIdx][colIdx] = value
      }
      return updated
    })
    setIsDirty(true)
  }, [activeSheet])

  const handleHeaderChange = useCallback((colIdx: number, value: string) => {
    setEditableSheets(prev => {
      const updated: SheetData[] = JSON.parse(JSON.stringify(prev))
      const sheet = updated[activeSheet]
      if (sheet?.headers[colIdx] !== undefined) {
        sheet.headers[colIdx] = value
      }
      return updated
    })
    setIsDirty(true)
  }, [activeSheet])

  // ── Save / revert ──────────────────────────────────────────────────────────

  const exportAsCSV = useCallback((): string => {
    const sheet = editableSheets[activeSheet]
    if (!sheet) return ""
    const allRows = [sheet.headers, ...sheet.rows]
    return allRows
      .map(row =>
        row.map(cell => `"${String(cell ?? "").replace(/"/g, '""')}"`).join(",")
      )
      .join("\n")
  }, [editableSheets, activeSheet])

  const handleSave = useCallback(() => {
    const csv = exportAsCSV()
    console.log(`[SpreadsheetViewer] Saving sheet "${editableSheets[activeSheet]?.name}" — ${csv.length} chars CSV`)
    onSave?.(csv)
    setIsDirty(false)
  }, [exportAsCSV, onSave, editableSheets, activeSheet])

  const handleRevert = useCallback(() => {
    console.log(`[SpreadsheetViewer] Reverting to original data`)
    setEditableSheets(JSON.parse(JSON.stringify(sheets)))
    setIsDirty(false)
    setEditingCell(null)
  }, [sheets])

  // Wire external save ref for parent header button
  useEffect(() => {
    if (!saveRef) return
    saveRef.current = handleSave
    return () => { if (saveRef) saveRef.current = null }
  }, [handleSave, saveRef])

  // Auto-focus input when editing cell changes
  useEffect(() => {
    if (editingCell && editInputRef.current) {
      editInputRef.current.focus()
      editInputRef.current.select()
    }
  }, [editingCell])

  // ── Tab / keyboard navigation ──────────────────────────────────────────────

  const handleCellKeyDown = useCallback((
    e: React.KeyboardEvent<HTMLInputElement>,
    absRowIdx: number,
    colIdx: number,
    totalCols: number,
    totalRows: number,
  ) => {
    if (e.key === "Escape") {
      setEditingCell(null)
      return
    }
    if (e.key === "Enter") {
      // Move down
      const nextRow = absRowIdx + 1 < totalRows ? absRowIdx + 1 : absRowIdx
      setEditingCell({ row: nextRow, col: colIdx })
      // Scroll page if needed
      const nextPage = Math.floor(nextRow / PAGE_SIZE)
      if (nextPage !== page) setPage(nextPage)
      return
    }
    if (e.key === "Tab") {
      e.preventDefault()
      if (colIdx + 1 < totalCols) {
        setEditingCell({ row: absRowIdx, col: colIdx + 1 })
      } else if (absRowIdx + 1 < totalRows) {
        setEditingCell({ row: absRowIdx + 1, col: 0 })
        const nextPage = Math.floor((absRowIdx + 1) / PAGE_SIZE)
        if (nextPage !== page) setPage(nextPage)
      } else {
        setEditingCell(null)
      }
    }
  }, [page])

  // ── Derived ────────────────────────────────────────────────────────────────

  const displaySheets = editMode ? editableSheets : sheets
  const currentSheet = displaySheets[activeSheet]
  const totalRows = currentSheet?.rows.length ?? 0
  const totalPages = Math.ceil(totalRows / PAGE_SIZE)
  const pageOffset = page * PAGE_SIZE
  const visibleRows = currentSheet?.rows.slice(pageOffset, pageOffset + PAGE_SIZE) || []

  // ── Render ─────────────────────────────────────────────────────────────────

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
        <a  
            href={fileUrl} target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-2 px-4 py-2 bg-card border border-border rounded-lg text-sm text-foreground hover:bg-accent transition-colors"
          >
            <Download size={14} />Download file
          </a>
        )}
      </div>
    )
  }

  if (!currentSheet) {
    return (
      <div className={cn("flex-1 flex items-center justify-center", className)}>
        <p className="text-sm text-muted-foreground">{fileUrl ? "Loading…" : "No file provided"}</p>
      </div>
    )
  }

  return (
    <div className={cn("flex-1 flex flex-col overflow-hidden bg-background", className)}>

      {/* ── Toolbar ── */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-card flex-shrink-0 gap-2 flex-wrap">
        {/* Sheet tabs */}
        <div className="flex items-center gap-1">
          {displaySheets.map((sheet, i) => (
            <button
              key={i}
              onClick={() => { setActiveSheet(i); setPage(0); setEditingCell(null) }}
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

        {/* Actions */}
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-muted-foreground">
            {totalRows} rows · {currentSheet.headers.length} cols
          </span>

          {isDirty && editMode && (
            <span className="text-[10px] text-amber-500 font-semibold">● unsaved</span>
          )}

          {editMode && isDirty && (
            <button
              onClick={handleRevert}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] text-amber-600 hover:bg-amber-500/10 border border-amber-500/25 transition-all"
            >
              <RotateCcw size={10} />Revert
            </button>
          )}

          {editMode && (
            <button
              onClick={handleSave}
              disabled={!isDirty}
              className="flex items-center gap-1.5 px-2.5 py-1.5 bg-foreground text-background rounded-lg text-[11px] font-semibold hover:opacity-90 transition-all disabled:opacity-40"
            >
              <Check size={10} />Save
            </button>
          )}

          {fileUrl && (
            <a
              href={fileUrl} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] text-muted-foreground hover:text-foreground hover:bg-accent rounded-lg transition-all"
            >
              <Download size={11} />Download
            </a>
          )}

          <button
            onClick={() => { setEditMode(v => !v); setEditingCell(null) }}
            className={cn(
              "flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] transition-all border",
              editMode
                ? "bg-blue-500/10 border-blue-500/20 text-blue-600 dark:text-blue-400"
                : "border-border bg-muted/30 text-muted-foreground hover:text-foreground"
            )}
          >
            {editMode ? <><Eye size={10} />View</> : <><Pencil size={10} />Edit</>}
          </button>
        </div>
      </div>

      {/* ── Table ── */}
      <div className="flex-1 overflow-auto">
        <table className="w-full text-[12px] border-collapse">
          <thead className="sticky top-0 z-10">
            <tr className="bg-card">
              {/* Row number column */}
              <th className="px-3 py-2 text-right text-[10px] font-semibold text-muted-foreground/40 border-b border-r border-border w-10 min-w-[40px]">
                #
              </th>
              {currentSheet.headers.map((header, colIdx) => (
                <th
                  key={colIdx}
                  className="px-0 py-0 font-semibold text-foreground border-b border-r border-border"
                  style={{ minWidth: "120px", maxWidth: "300px" }}
                >
                  {editMode ? (
                    <input
                      className="w-full px-3 py-2 bg-transparent outline-none focus:bg-accent/60 font-semibold text-[12px] border-none"
                      value={header}
                      onChange={e => handleHeaderChange(colIdx, e.target.value)}
                      placeholder={`Column ${colIdx + 1}`}
                    />
                  ) : (
                    <div className="px-3 py-2">
                      {header || <span className="text-muted-foreground/30 italic">Column {colIdx + 1}</span>}
                    </div>
                  )}
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {visibleRows.length === 0 ? (
              <tr>
                <td
                  colSpan={currentSheet.headers.length + 1}
                  className="px-4 py-8 text-center text-muted-foreground text-sm"
                >
                  No data rows
                </td>
              </tr>
            ) : (
              visibleRows.map((row, rowIdx) => {
                const absRowIdx = pageOffset + rowIdx
                return (
                  <tr
                    key={absRowIdx}
                    className={cn(
                      "transition-colors",
                      rowIdx % 2 === 0 ? "bg-background" : "bg-card/40",
                      editMode ? "hover:bg-accent/20" : "hover:bg-accent/30"
                    )}
                  >
                    {/* Row number */}
                    <td className="px-3 py-1.5 text-right text-[10px] text-muted-foreground/40 border-r border-border select-none">
                      {absRowIdx + 1}
                    </td>

                    {row.map((cell, colIdx) => {
                      const isEditing =
                        editMode &&
                        editingCell?.row === absRowIdx &&
                        editingCell?.col === colIdx

                      return (
                        <td
                          key={colIdx}
                          className={cn(
                            "px-0 py-0 border-r border-border/50",
                            editMode && "cursor-cell",
                            isEditing && "ring-2 ring-inset ring-[var(--brand-violet)] ring-offset-0"
                          )}
                          style={{ maxWidth: "300px" }}
                          onClick={() => {
                            if (editMode && !isEditing) {
                              setEditingCell({ row: absRowIdx, col: colIdx })
                            }
                          }}
                        >
                          {isEditing ? (
                            <input
                              ref={editInputRef}
                              className="w-full px-3 py-1.5 bg-accent/70 outline-none text-[12px] text-foreground"
                              value={cell}
                              onChange={e => handleCellChange(absRowIdx, colIdx, e.target.value)}
                              onBlur={() => setEditingCell(null)}
                              onKeyDown={e =>
                                handleCellKeyDown(e, absRowIdx, colIdx, row.length, totalRows)
                              }
                              style={{ minWidth: "80px", width: "100%" }}
                            />
                          ) : (
                            <div
                              className={cn(
                                "px-3 py-1.5 text-foreground/80 truncate",
                                editMode && "hover:bg-accent/30"
                              )}
                              title={cell}
                            >
                              {cell}
                            </div>
                          )}
                        </td>
                      )
                    })}
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      {/* ── Pagination ── */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between px-4 py-2.5 border-t border-border bg-card flex-shrink-0">
          <span className="text-[11px] text-muted-foreground">
            Showing {pageOffset + 1}–{Math.min(pageOffset + PAGE_SIZE, totalRows)} of {totalRows} rows
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => { setPage(p => Math.max(0, p - 1)); setEditingCell(null) }}
              disabled={page === 0}
              className="p-1.5 rounded hover:bg-accent disabled:opacity-30 transition-colors"
            >
              <ChevronLeft size={13} />
            </button>
            <span className="text-[11px] text-muted-foreground px-2">
              {page + 1} / {totalPages}
            </span>
            <button
              onClick={() => { setPage(p => Math.min(totalPages - 1, p + 1)); setEditingCell(null) }}
              disabled={page === totalPages - 1}
              className="p-1.5 rounded hover:bg-accent disabled:opacity-30 transition-colors"
            >
              <ChevronRight size={13} />
            </button>
          </div>
        </div>
      )}

      {/* ── Edit mode hint ── */}
      {editMode && (
        <div className="px-4 py-1.5 border-t border-border bg-card/50 flex-shrink-0">
          <span className="text-[10px] text-muted-foreground/50">
            Click cell to edit · Tab = next cell · Enter = down · Esc = commit · Saves as CSV
          </span>
        </div>
      )}
    </div>
  )
}