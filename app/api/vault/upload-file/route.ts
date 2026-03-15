import { createClient } from "@/lib/supabase/server"
import { supabaseAdmin } from "@/lib/supabase/admin"
import { refreshGoogleToken } from "@/lib/google/token"
import { NextResponse } from "next/server"

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ message: "Not authenticated" }, { status: 401 })
    }

    const formData = await request.formData()
    const file = formData.get("file") as File | null
    const folderId = formData.get("folder_id") as string
    const title = formData.get("title") as string

    if (!file || !folderId) {
      return NextResponse.json({ message: "file and folder_id required" }, { status: 400 })
    }

    // Get vault folder to find the Drive folder ID
    const { data: vaultFolder, error: folderError } = await supabaseAdmin
      .from("vault_folders")
      .select("drive_folder_id")
      .eq("id", folderId)
      .single()

    if (folderError || !vaultFolder) {
      return NextResponse.json({ message: "Vault folder not found" }, { status: 404 })
    }

    // Resolve founder ID — team members upload to the founder's Drive
    let uploaderId = user.id
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("user_type")
      .eq("id", user.id)
      .single()

    if (profile?.user_type === "team_member") {
      const { data: teamMember } = await supabaseAdmin
        .from("team_members")
        .select("founder_id")
        .eq("user_id", user.id)
        .eq("is_active", true)
        .single()
      if (teamMember?.founder_id) uploaderId = teamMember.founder_id
    } else if (profile?.user_type === "client") {
      const { data: client } = await supabaseAdmin
        .from("clients")
        .select("founder_id")
        .eq("portal_user_id", user.id)
        .single()
      if (client?.founder_id) uploaderId = client.founder_id
    }

    // Get founder's Google token
    const { data: integration } = await supabaseAdmin
      .from("google_integrations")
      .select("*")
      .eq("user_id", uploaderId)
      .eq("is_connected", true)
      .single()

    if (!integration) {
      return NextResponse.json({ message: "Google Drive not connected" }, { status: 400 })
    }

    const accessToken = await refreshGoogleToken(integration)

    // Upload file to Google Drive using multipart upload
    const fileBuffer = await file.arrayBuffer()
    const fileBytes = new Uint8Array(fileBuffer)

    const metadata = {
      name: title || file.name,
      parents: [vaultFolder.drive_folder_id],
    }

    // Build multipart body
    const boundary = "vault_upload_boundary_" + Date.now()
    const metaPart =
      `--${boundary}\r\n` +
      `Content-Type: application/json\r\n\r\n` +
      JSON.stringify(metadata) +
      `\r\n`
    const filePart =
      `--${boundary}\r\n` +
      `Content-Type: ${file.type || "application/octet-stream"}\r\n\r\n`
    const endPart = `\r\n--${boundary}--`

    const metaBytes = new TextEncoder().encode(metaPart)
    const filePartBytes = new TextEncoder().encode(filePart)
    const endBytes = new TextEncoder().encode(endPart)

    const body = new Uint8Array(
      metaBytes.byteLength + filePartBytes.byteLength + fileBytes.byteLength + endBytes.byteLength
    )
    let offset = 0
    body.set(metaBytes, offset); offset += metaBytes.byteLength
    body.set(filePartBytes, offset); offset += filePartBytes.byteLength
    body.set(fileBytes, offset); offset += fileBytes.byteLength
    body.set(endBytes, offset)

    const uploadRes = await fetch(
      "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": `multipart/related; boundary=${boundary}`,
          "Content-Length": body.byteLength.toString(),
        },
        body,
      }
    )

    if (!uploadRes.ok) {
      const err = await uploadRes.text()
      throw new Error(`Drive upload failed: ${err}`)
    }

    const driveFile = await uploadRes.json()

    return NextResponse.json({
      success: true,
      drive_file_id: driveFile.id,
      drive_file_url: driveFile.webViewLink,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error"
    console.error("[Vault Upload]", message)
    return NextResponse.json({ message }, { status: 500 })
  }
}