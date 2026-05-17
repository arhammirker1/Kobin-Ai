/**
 * lib/vault/extraction.ts
 *
 * Client-side text extraction for vault files.
 * Runs in the browser before upload — enables rich AI labeling
 * and semantic embeddings based on real document content.
 *
 * Supported:
 *   • Plain text / code / markdown → direct read
 *   • Word (.docx)               → mammoth
 *   • Excel / CSV                → xlsx sheet-to-csv
 *   • PDF                        → server-side only (returns "")
 */

export async function extractTextFromFile(file: File): Promise<string> {
  const ext = file.name.toLowerCase().split(".").pop() || ""
  const type = file.type

  // ── Plain text & code — direct read ──────────────────────────────────────
  const plainExts = [
    "txt", "md", "mdx", "js", "ts", "tsx", "jsx",
    "py", "rb", "go", "rs", "java", "cpp", "c", "h",
    "cs", "php", "swift", "kt", "r", "scala",
    "html", "css", "scss", "json", "yaml", "yml",
    "xml", "sql", "sh", "bash", "env", "toml",
    "graphql", "gql", "dockerfile",
  ]
  if (plainExts.includes(ext) || type.startsWith("text/")) {
    try {
      return (await file.text()).slice(0, 50000)
    } catch {
      return ""
    }
  }

  // ── Word (.docx) ──────────────────────────────────────────────────────────
  if (
    ext === "docx" ||
    type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  ) {
    try {
      const mammoth = await import("mammoth")
      const buffer = await file.arrayBuffer()
      const result = await mammoth.extractRawText({ arrayBuffer: buffer })
      return result.value.slice(0, 50000)
    } catch (err) {
      console.error("[Extraction] DOCX failed:", err)
      return ""
    }
  }

  // ── Excel / CSV ───────────────────────────────────────────────────────────
  if (
    ["xlsx", "xls", "csv", "tsv"].includes(ext) ||
    type === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
    type === "text/csv"
  ) {
    try {
      const XLSX = await import("xlsx")
      const buffer = await file.arrayBuffer()
      const workbook = XLSX.read(buffer, { type: "buffer" })

      const texts: string[] = []
      for (const sheetName of workbook.SheetNames) {
        const ws = workbook.Sheets[sheetName]
        // sheet_to_csv gives a compact, AI-readable representation
        const csv = XLSX.utils.sheet_to_csv(ws, { blankrows: false })
        texts.push(`Sheet: ${sheetName}\n${csv}`)
      }
      return texts.join("\n\n").slice(0, 50000)
    } catch (err) {
      console.error("[Extraction] XLSX failed:", err)
      return ""
    }
  }

  // ── PDF — skip client-side, handled server-side ───────────────────────────
  if (ext === "pdf" || type === "application/pdf") {
    return "" // upload-internal/route.ts handles this with pdf-parse
  }

  return ""
}