/**
 * app/api/vault/upload-internal/route.ts
 *
 * Uploads a file to Supabase Storage (private vault bucket).
 * Also performs server-side PDF text extraction (pdf-parse).
 * Returns storage_path + extracted_text so the client can
 * save both to vault_items in one insert.
 */

import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { supabaseAdmin } from "@/lib/supabase/admin"

async function extractPdfText(buffer: Buffer): Promise<string> {
  try {
    // Dynamic import avoids build-time issues with pdf-parse's canvas dep
    const pdfParse = (await import("pdf-parse")).default
    const data = await pdfParse(buffer)
    return data.text.slice(0, 12000)
  } catch (err) {
    console.error("[upload-internal] PDF extraction failed:", err)
    return ""
  }
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ message: "Unauthorized" }, { status: 401 })

    const formData = await request.formData()
    const file = formData.get("file") as File | null
    const folderId = formData.get("folder_id") as string
    // Client may pass pre-extracted text (from mammoth / xlsx on client)
    const clientExtractedText = (formData.get("extracted_text") as string) || ""

    if (!file || !folderId) {
      return NextResponse.json({ message: "file and folder_id required" }, { status: 400 })
    }

    // Resolve founder
    let founderId = user.id
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("user_type")
      .eq("id", user.id)
      .single()

    if (profile?.user_type === "team_member") {
      const { data: tm } = await supabaseAdmin
        .from("team_members")
        .select("founder_id")
        .eq("user_id", user.id)
        .eq("is_active", true)
        .single()
      if (tm?.founder_id) founderId = tm.founder_id
    }

    // Build storage path: founderId/folderId/timestamp_filename
    const safeFilename = file.name.replace(/[^a-zA-Z0-9._-]/g, "_")
    const storagePath = `${founderId}/${folderId}/${Date.now()}_${safeFilename}`

    const buffer = Buffer.from(await file.arrayBuffer())

    const { error } = await supabaseAdmin.storage
      .from("vault")
      .upload(storagePath, buffer, {
        contentType: file.type || "application/octet-stream",
        upsert: false,
      })

    if (error) {
      console.error("[upload-internal]", error)
      return NextResponse.json({ message: error.message }, { status: 500 })
    }

    // Server-side PDF text extraction (client can't do this reliably)
    const ext = file.name.toLowerCase().split(".").pop() || ""
    let extractedText = clientExtractedText

    if (!extractedText && (ext === "pdf" || file.type === "application/pdf")) {
      extractedText = await extractPdfText(buffer)
    }

    return NextResponse.json({ storage_path: storagePath, extracted_text: extractedText || null })
  } catch (err: any) {
    console.error("[upload-internal]", err)
    return NextResponse.json({ message: err.message || "Upload failed" }, { status: 500 })
  }
}