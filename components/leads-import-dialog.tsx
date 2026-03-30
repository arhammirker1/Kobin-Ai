"use client"

import { useState, useCallback, useRef, useEffect } from "react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Upload,
  FileSpreadsheet,
  CheckCircle2,
  AlertCircle,
  Loader2,
  ArrowRight,
  ArrowLeft,
  X,
} from "lucide-react"
import { toast } from "sonner"
import { cn } from "@/lib/utils"

// ─── Types ──────────────────────────────────────────────────────────────────────

interface ParsedData {
  headers: string[]
  rows: Record<string, string>[]
  fileName: string
}

interface ColumnMapping {
  [csvColumn: string]: string // csvColumn → relationship field key
}

interface ImportResult {
  inserted: number
  skipped: number
  duplicateEmails?: string[]
  message?: string
}

// ─── Mappable relationship fields ───────────────────────────────────────────────

const RELATIONSHIP_FIELDS = [
  { key: "full_name", label: "Full Name", required: true },
  { key: "email", label: "Email", required: true },
  { key: "company", label: "Company", required: false },
  { key: "role", label: "Role / Job Title", required: false },
  { key: "linkedin_profile_url", label: "LinkedIn URL", required: false },
  { key: "tags", label: "Tags (comma-separated)", required: false },
  { key: "deal_value", label: "Deal Value ($)", required: false },
  { key: "pipeline_notes", label: "Notes", required: false },
] as const

type FieldKey = (typeof RELATIONSHIP_FIELDS)[number]["key"]

// ─── Smart auto-mapping ─────────────────────────────────────────────────────────

const AUTO_MAP: Record<string, FieldKey> = {
  name: "full_name",
  full_name: "full_name",
  "full name": "full_name",
  fullname: "full_name",
  "contact name": "full_name",
  "contact_name": "full_name",
  "first name": "full_name",
  firstname: "full_name",
  "last name": "full_name", // will be handled specially
  email: "email",
  "email address": "email",
  "e-mail": "email",
  "email_address": "email",
  mail: "email",
  company: "company",
  organization: "company",
  org: "company",
  "company name": "company",
  company_name: "company",
  role: "role",
  title: "role",
  "job title": "role",
  "job_title": "role",
  position: "role",
  designation: "role",
  linkedin: "linkedin_profile_url",
  "linkedin url": "linkedin_profile_url",
  "linkedin_url": "linkedin_profile_url",
  "linkedin profile": "linkedin_profile_url",
  "linkedin_profile": "linkedin_profile_url",
  tags: "tags",
  labels: "tags",
  label: "tags",
  "deal value": "deal_value",
  deal_value: "deal_value",
  value: "deal_value",
  amount: "deal_value",
  revenue: "deal_value",
  notes: "pipeline_notes",
  note: "pipeline_notes",
  comments: "pipeline_notes",
  description: "pipeline_notes",
}

function autoDetectMapping(headers: string[]): ColumnMapping {
  const mapping: ColumnMapping = {}
  const usedFields = new Set<string>()

  for (const header of headers) {
    const normalized = header.toLowerCase().trim()
    const fieldKey = AUTO_MAP[normalized]
    if (fieldKey && !usedFields.has(fieldKey)) {
      mapping[header] = fieldKey
      usedFields.add(fieldKey)
    }
  }

  return mapping
}

// ─── Component ──────────────────────────────────────────────────────────────────

type Step = "upload" | "map" | "importing" | "result"

interface LeadsImportDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onImportComplete: () => void
}

export function LeadsImportDialog({
  open,
  onOpenChange,
  onImportComplete,
}: LeadsImportDialogProps) {
  const [step, setStep] = useState<Step>("upload")
  const [parsedData, setParsedData] = useState<ParsedData | null>(null)
  const [mapping, setMapping] = useState<ColumnMapping>({})
  const [importResult, setImportResult] = useState<ImportResult | null>(null)
  const [isDragOver, setIsDragOver] = useState(false)
  const [isParsingFile, setIsParsingFile] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Reset state when dialog opens/closes
  useEffect(() => {
    if (!open) {
      // Delay reset so closing animation finishes
      const timer = setTimeout(() => {
        setStep("upload")
        setParsedData(null)
        setMapping({})
        setImportResult(null)
        setIsDragOver(false)
        setIsParsingFile(false)
      }, 300)
      return () => clearTimeout(timer)
    }
  }, [open])

  // ── File parsing ────────────────────────────────────────────────────────────

  const parseFile = useCallback(async (file: File) => {
    const maxSize = 10 * 1024 * 1024 // 10 MB
    if (file.size > maxSize) {
      toast.error("File too large. Maximum size is 10 MB.")
      return
    }

    const ext = file.name.split(".").pop()?.toLowerCase()
    if (ext !== "csv" && ext !== "xlsx" && ext !== "xls") {
      toast.error("Unsupported file type. Please upload a CSV or XLSX file.")
      return
    }

    setIsParsingFile(true)

    try {
      // Lazy-load xlsx to avoid bloating initial bundle
      const XLSX = await import("xlsx")

      const arrayBuffer = await file.arrayBuffer()
      const workbook = XLSX.read(arrayBuffer, { type: "array" })

      // Use first sheet
      const sheetName = workbook.SheetNames[0]
      if (!sheetName) {
        toast.error("The file appears to be empty.")
        setIsParsingFile(false)
        return
      }

      const sheet = workbook.Sheets[sheetName]
      const jsonData = XLSX.utils.sheet_to_json<Record<string, any>>(sheet, {
        defval: "",
      })

      if (jsonData.length === 0) {
        toast.error("No data rows found in the file.")
        setIsParsingFile(false)
        return
      }

      // Extract headers from first row keys
      const headers = Object.keys(jsonData[0])

      // Convert all values to strings
      const rows = jsonData.map((row) => {
        const stringRow: Record<string, string> = {}
        for (const key of headers) {
          stringRow[key] = row[key] != null ? String(row[key]) : ""
        }
        return stringRow
      })

      const parsed: ParsedData = { headers, rows, fileName: file.name }
      setParsedData(parsed)

      // Auto-detect column mapping
      const autoMapping = autoDetectMapping(headers)
      setMapping(autoMapping)

      setStep("map")
    } catch (err) {
      console.error("[Import] Parse error:", err)
      toast.error("Failed to parse file. Please check the format.")
    } finally {
      setIsParsingFile(false)
    }
  }, [])

  // ── Drag & drop handlers ──────────────────────────────────────────────────

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(false)
  }, [])

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
      setIsDragOver(false)

      const file = e.dataTransfer.files[0]
      if (file) parseFile(file)
    },
    [parseFile],
  )

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (file) parseFile(file)
      // Reset so same file can be re-selected
      e.target.value = ""
    },
    [parseFile],
  )

  // ── Mapping helpers ───────────────────────────────────────────────────────

  const updateMapping = (csvColumn: string, fieldKey: string) => {
    setMapping((prev) => {
      const next = { ...prev }

      // If this field was already mapped to another column, clear it
      if (fieldKey !== "__skip__") {
        for (const key of Object.keys(next)) {
          if (next[key] === fieldKey && key !== csvColumn) {
            delete next[key]
          }
        }
      }

      if (fieldKey === "__skip__") {
        delete next[csvColumn]
      } else {
        next[csvColumn] = fieldKey
      }

      return next
    })
  }

  const requiredFieldsMapped =
    Object.values(mapping).includes("full_name") &&
    Object.values(mapping).includes("email")

  const mappedFieldCount = Object.keys(mapping).length

  // ── Import ────────────────────────────────────────────────────────────────

  const handleImport = async () => {
    if (!parsedData || !requiredFieldsMapped) return

    setStep("importing")

    try {
      // Build lead objects from mapping
      const leads = parsedData.rows
        .map((row) => {
          const lead: Record<string, any> = {}

          for (const [csvCol, fieldKey] of Object.entries(mapping)) {
            const value = row[csvCol]?.trim()
            if (!value) continue

            if (fieldKey === "tags") {
              lead.tags = value.split(",").map((t: string) => t.trim()).filter(Boolean)
            } else if (fieldKey === "deal_value") {
              const num = parseFloat(value.replace(/[^0-9.-]/g, ""))
              if (!isNaN(num)) lead.deal_value = num
            } else {
              lead[fieldKey] = value
            }
          }

          return lead
        })
        .filter((lead) => lead.full_name && lead.email) // Must have required fields

      if (leads.length === 0) {
        toast.error("No valid leads found after mapping. Check your column selection.")
        setStep("map")
        return
      }

      const res = await fetch("/api/crm/import-leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leads, file_name: parsedData.fileName }),
      })

      const data = await res.json()

      if (!res.ok) {
        toast.error(data.message || "Import failed")
        setStep("map")
        return
      }

      setImportResult(data)
      setStep("result")
    } catch (err) {
      console.error("[Import] Error:", err)
      toast.error("Import failed. Please try again.")
      setStep("map")
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet size={18} />
            {step === "upload" && "Import Leads"}
            {step === "map" && "Map Columns"}
            {step === "importing" && "Importing..."}
            {step === "result" && "Import Complete"}
          </DialogTitle>
        </DialogHeader>

        {/* ── Step 1: Upload ──────────────────────────────────────────────── */}
        {step === "upload" && (
          <div className="flex-1 py-4">
            <div
              className={cn(
                "border-2 border-dashed rounded-xl p-10 text-center transition-all duration-200 cursor-pointer",
                isDragOver
                  ? "border-primary bg-primary/5 scale-[1.01]"
                  : "border-muted-foreground/25 hover:border-primary/50 hover:bg-muted/30",
              )}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
            >
              {isParsingFile ? (
                <div className="flex flex-col items-center gap-3">
                  <Loader2 className="h-10 w-10 text-primary animate-spin" />
                  <p className="text-sm font-medium">Parsing file...</p>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-3">
                  <div className="size-14 rounded-2xl bg-primary/10 flex items-center justify-center">
                    <Upload className="h-6 w-6 text-primary" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold">
                      Drop your file here, or{" "}
                      <span className="text-primary underline underline-offset-2">
                        browse
                      </span>
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Supports CSV and XLSX · Max 10 MB
                    </p>
                  </div>
                </div>
              )}
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.xlsx,.xls"
              className="hidden"
              onChange={handleFileSelect}
            />

            <div className="mt-5 p-3.5 rounded-lg bg-muted/40 border border-border/50">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                Expected format
              </p>
              <div className="overflow-x-auto">
                <table className="text-[11px] w-full">
                  <thead>
                    <tr className="border-b border-border/50">
                      <th className="text-left py-1.5 px-2 font-semibold text-primary">
                        Name *
                      </th>
                      <th className="text-left py-1.5 px-2 font-semibold text-primary">
                        Email *
                      </th>
                      <th className="text-left py-1.5 px-2 font-medium text-muted-foreground">
                        Company
                      </th>
                      <th className="text-left py-1.5 px-2 font-medium text-muted-foreground">
                        Role
                      </th>
                    </tr>
                  </thead>
                  <tbody className="text-muted-foreground">
                    <tr>
                      <td className="py-1 px-2">Sarah Chen</td>
                      <td className="py-1 px-2">sarah@acme.com</td>
                      <td className="py-1 px-2">Acme Corp</td>
                      <td className="py-1 px-2">VP Sales</td>
                    </tr>
                    <tr>
                      <td className="py-1 px-2">James Park</td>
                      <td className="py-1 px-2">james@startup.io</td>
                      <td className="py-1 px-2">Startup Inc</td>
                      <td className="py-1 px-2">CTO</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ── Step 2: Column mapping ──────────────────────────────────────── */}
        {step === "map" && parsedData && (
          <div className="flex-1 overflow-y-auto space-y-4 py-2">
            {/* File info bar */}
            <div className="flex items-center justify-between p-2.5 rounded-lg bg-muted/40 border border-border/50">
              <div className="flex items-center gap-2">
                <FileSpreadsheet size={14} className="text-primary" />
                <span className="text-xs font-medium truncate max-w-[200px]">
                  {parsedData.fileName}
                </span>
              </div>
              <Badge variant="secondary" className="text-[10px]">
                {parsedData.rows.length} rows
              </Badge>
            </div>

            {/* Mapping controls */}
            <div className="space-y-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Map your columns
              </p>
              <div className="space-y-1.5">
                {parsedData.headers.map((header) => {
                  const mappedTo = mapping[header]
                  const fieldInfo = RELATIONSHIP_FIELDS.find(
                    (f) => f.key === mappedTo,
                  )
                  return (
                    <div
                      key={header}
                      className={cn(
                        "flex items-center gap-3 p-2 rounded-lg border transition-all",
                        mappedTo
                          ? "bg-primary/5 border-primary/20"
                          : "bg-muted/20 border-border/50",
                      )}
                    >
                      {/* CSV column name */}
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold truncate">
                          {header}
                        </p>
                        <p className="text-[10px] text-muted-foreground truncate">
                          e.g. "{parsedData.rows[0]?.[header] || "—"}"
                        </p>
                      </div>

                      {/* Arrow */}
                      <ArrowRight
                        size={12}
                        className="text-muted-foreground/50 shrink-0"
                      />

                      {/* Field selector */}
                      <Select
                        value={mappedTo || "__skip__"}
                        onValueChange={(v) => updateMapping(header, v)}
                      >
                        <SelectTrigger className="w-[180px] h-8 text-xs">
                          <SelectValue placeholder="Skip" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__skip__" className="text-xs">
                            <span className="text-muted-foreground">
                              — Skip column —
                            </span>
                          </SelectItem>
                          {RELATIONSHIP_FIELDS.map((field) => {
                            const alreadyMapped =
                              Object.values(mapping).includes(field.key) &&
                              mapping[header] !== field.key
                            return (
                              <SelectItem
                                key={field.key}
                                value={field.key}
                                className="text-xs"
                                disabled={alreadyMapped}
                              >
                                {field.label}
                                {field.required && " *"}
                                {alreadyMapped && " (mapped)"}
                              </SelectItem>
                            )
                          })}
                        </SelectContent>
                      </Select>

                      {/* Required indicator */}
                      {fieldInfo?.required && (
                        <CheckCircle2
                          size={14}
                          className="text-emerald-500 shrink-0"
                        />
                      )}
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Preview table */}
            {mappedFieldCount > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Preview (first 5 rows)
                </p>
                <div className="overflow-x-auto rounded-lg border border-border/50">
                  <table className="w-full text-[11px]">
                    <thead>
                      <tr className="bg-muted/40 border-b border-border/50">
                        {Object.entries(mapping).map(([csvCol, fieldKey]) => {
                          const field = RELATIONSHIP_FIELDS.find(
                            (f) => f.key === fieldKey,
                          )
                          return (
                            <th
                              key={csvCol}
                              className="text-left py-1.5 px-2.5 font-semibold whitespace-nowrap"
                            >
                              {field?.label || fieldKey}
                            </th>
                          )
                        })}
                      </tr>
                    </thead>
                    <tbody>
                      {parsedData.rows.slice(0, 5).map((row, i) => (
                        <tr
                          key={i}
                          className="border-b border-border/30 last:border-0"
                        >
                          {Object.keys(mapping).map((csvCol) => (
                            <td
                              key={csvCol}
                              className="py-1.5 px-2.5 text-muted-foreground truncate max-w-[180px]"
                            >
                              {row[csvCol] || "—"}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Validation message */}
            {!requiredFieldsMapped && (
              <div className="flex items-center gap-2 p-2.5 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/50">
                <AlertCircle size={14} className="text-amber-600 shrink-0" />
                <p className="text-xs text-amber-700 dark:text-amber-400">
                  Map both <strong>Full Name</strong> and{" "}
                  <strong>Email</strong> to continue
                </p>
              </div>
            )}
          </div>
        )}

        {/* ── Step 3: Importing ──────────────────────────────────────────── */}
        {step === "importing" && (
          <div className="flex-1 flex flex-col items-center justify-center py-12 gap-4">
            <Loader2 className="h-10 w-10 text-primary animate-spin" />
            <div className="text-center">
              <p className="text-sm font-semibold">Importing leads...</p>
              <p className="text-xs text-muted-foreground mt-1">
                Adding {parsedData?.rows.length} contacts to your pipeline
              </p>
            </div>
          </div>
        )}

        {/* ── Step 4: Result ──────────────────────────────────────────────── */}
        {step === "result" && importResult && (
          <div className="flex-1 py-6 space-y-5">
            <div className="flex flex-col items-center gap-3">
              <div className="size-14 rounded-2xl bg-emerald-100 dark:bg-emerald-950/40 flex items-center justify-center">
                <CheckCircle2 className="h-7 w-7 text-emerald-600" />
              </div>
              <div className="text-center">
                <p className="text-lg font-bold">Import complete!</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Your leads are now in the pipeline
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="p-3.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/50 text-center">
                <p className="text-2xl font-bold text-emerald-600">
                  {importResult.inserted}
                </p>
                <p className="text-[11px] font-medium text-emerald-700 dark:text-emerald-400 mt-0.5">
                  Contacts added
                </p>
              </div>
              <div className="p-3.5 rounded-xl bg-muted/40 border border-border/50 text-center">
                <p className="text-2xl font-bold text-muted-foreground">
                  {importResult.skipped}
                </p>
                <p className="text-[11px] font-medium text-muted-foreground mt-0.5">
                  Duplicates skipped
                </p>
              </div>
            </div>

            {importResult.skipped > 0 &&
              importResult.duplicateEmails &&
              importResult.duplicateEmails.length > 0 && (
                <div className="p-2.5 rounded-lg bg-muted/30 border border-border/50">
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
                    Skipped (already in CRM)
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {importResult.duplicateEmails.slice(0, 10).map((email) => (
                      <Badge
                        key={email}
                        variant="secondary"
                        className="text-[10px]"
                      >
                        {email}
                      </Badge>
                    ))}
                    {importResult.duplicateEmails.length > 10 && (
                      <Badge variant="secondary" className="text-[10px]">
                        +{importResult.duplicateEmails.length - 10} more
                      </Badge>
                    )}
                  </div>
                </div>
              )}
          </div>
        )}

        {/* ── Footer ─────────────────────────────────────────────────────── */}
        <DialogFooter className="gap-2 sm:gap-2">
          {step === "map" && (
            <>
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={() => {
                  setStep("upload")
                  setParsedData(null)
                  setMapping({})
                }}
              >
                <ArrowLeft size={13} />
                Back
              </Button>
              <Button
                size="sm"
                className="gap-1.5"
                disabled={!requiredFieldsMapped}
                onClick={handleImport}
              >
                Import {parsedData?.rows.length} leads
                <ArrowRight size={13} />
              </Button>
            </>
          )}
          {step === "result" && (
            <Button
              size="sm"
              className="gap-1.5"
              onClick={() => {
                onImportComplete()
                onOpenChange(false)
              }}
            >
              <CheckCircle2 size={13} />
              View in Pipeline
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
