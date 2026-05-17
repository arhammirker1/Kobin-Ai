/**
 * app/api/vault/upload-file/route.ts
 *
 * Handles file uploads to Google Drive vault folder + auto-embeds.
 * Also accepts notes and links (no Drive upload needed for those).
 *
 * Flow:
 *  1. Get founder's Drive access token
 *  2. Upload file to the correct Drive subfolder
 *  3. Return drive_file_id + drive_file_url
 *  4. Trigger async embedding (non-blocking)
 */

import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { supabaseAdmin } from "@/lib/supabase/admin"
import { refreshGoogleToken } from "@/lib/google/token"
import { upsertVaultEmbedding, buildEmbeddingText } from "@/lib/ai/embeddings"

// ── Upload a file to a specific Drive folder ─────────────────────────────────

async function uploadFileToDrive(
  accessToken: string,
  file: File,
  driveFolderId: string
): Promise<{ id: string; webViewLink: string }> {
  const metadata = {
    name: file.name,
    parents: [driveFolderId],
  }

  const form = new FormData()
  form.append(
    "metadata",
    new Blob([JSON.stringify(metadata)], { type: "application/json" })
  )
  form.append("file", file)

  const res = await fetch(
    "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink",
    {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}` },
      body: form,
    }
  )

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Drive upload failed: ${err}`)
  }

  return res.json()
}

// ── Set file permissions to "anyone with link can view" ─────────────────────

async function makeFilePublic(
  accessToken: string,
  fileId: string
): Promise<void> {
  await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}/permissions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ role: "reader", type: "anyone" }),
  })
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ message: "Unauthorized" }, { status: 401 })

    const formData = await request.formData()
    const file = formData.get("file") as File | null
    const folderId = formData.get("folder_id") as string
    const title = formData.get("title") as string
    const description = formData.get("description") as string | null
    const documentType = formData.get("document_type") as string | null

    if (!folderId) {
      return NextResponse.json({ message: "folder_id required" }, { status: 400 })
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

    // Get folder's Drive folder ID
    const { data: folder } = await supabaseAdmin
      .from("vault_folders")
      .select("drive_folder_id")
      .eq("id", folderId)
      .eq("founder_id", founderId)
      .single()

    if (!folder?.drive_folder_id) {
      return NextResponse.json(
        { message: "Vault folder not linked to Drive" },
        { status: 400 }
      )
    }

    // No file? Return early (note/link items don't need Drive upload)
    if (!file) {
      return NextResponse.json({ drive_file_id: null, drive_file_url: null })
    }

    // Get access token
    const { data: integration } = await supabaseAdmin
      .from("google_integrations")
      .select("*")
      .eq("user_id", founderId)
      .eq("is_connected", true)
      .single()

    if (!integration) {
      return NextResponse.json(
        { message: "Google Drive not connected" },
        { status: 400 }
      )
    }

    const accessToken = await refreshGoogleToken(integration)

    // Upload to Drive
    const driveFile = await uploadFileToDrive(
      accessToken,
      file,
      folder.drive_folder_id
    )

    // Make publicly viewable (so clients can access deliverables)
    await makeFilePublic(accessToken, driveFile.id)

    return NextResponse.json({
      drive_file_id: driveFile.id,
      drive_file_url: driveFile.webViewLink,
    })
  } catch (err: any) {
    console.error("[vault/upload-file]", err)
    return NextResponse.json(
      { message: err.message || "Upload failed" },
      { status: 500 }
    )
  }
}