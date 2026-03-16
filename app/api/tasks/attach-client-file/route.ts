import { createClient } from "@/lib/supabase/server"
import { supabaseAdmin } from "@/lib/supabase/admin"
import { refreshGoogleToken } from "@/lib/google/token"
import { NextResponse } from "next/server"

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ message: "Not authenticated" }, { status: 401 })

    const formData = await request.formData()
    const file = formData.get("file") as File | null
    const projectId = formData.get("project_id") as string
    const folderType = (formData.get("folder_type") as string) || "client_uploads"
    const title = formData.get("title") as string

    if (!file || !projectId) {
      return NextResponse.json({ message: "file and project_id required" }, { status: 400 })
    }

    // Verify user is a client of this project
    const { data: client } = await supabaseAdmin
      .from("clients")
      .select("founder_id")
      .eq("portal_user_id", user.id)
      .eq("project_id", projectId)
      .single()

    if (!client) return NextResponse.json({ message: "Not authorized for this project" }, { status: 403 })

    const founderId = client.founder_id

    // Find the target folder
    const { data: folder } = await supabaseAdmin
      .from("vault_folders")
      .select("id, drive_folder_id")
      .eq("project_id", projectId)
      .eq("folder_type", folderType)
      .single()

    if (!folder) return NextResponse.json({ message: `${folderType} folder not found` }, { status: 404 })

    // Get founder's Google token
    const { data: integration } = await supabaseAdmin
      .from("google_integrations")
      .select("*")
      .eq("user_id", founderId)
      .eq("is_connected", true)
      .single()

    if (!integration) return NextResponse.json({ message: "Google Drive not connected" }, { status: 400 })

    const accessToken = await refreshGoogleToken(integration)

    const fileBuffer = await file.arrayBuffer()
    const fileBytes = new Uint8Array(fileBuffer)
    const boundary = "client_upload_boundary_" + Date.now()
    const metadata = { name: title || file.name, parents: [folder.drive_folder_id] }
    const metaPart = `--${boundary}\r\nContent-Type: application/json\r\n\r\n${JSON.stringify(metadata)}\r\n`
    const filePart = `--${boundary}\r\nContent-Type: ${file.type || "application/octet-stream"}\r\n\r\n`
    const endPart = `\r\n--${boundary}--`
    const metaBytes = new TextEncoder().encode(metaPart)
    const filePartBytes = new TextEncoder().encode(filePart)
    const endBytes = new TextEncoder().encode(endPart)
    const body = new Uint8Array(metaBytes.byteLength + filePartBytes.byteLength + fileBytes.byteLength + endBytes.byteLength)
    let offset = 0
    body.set(metaBytes, offset); offset += metaBytes.byteLength
    body.set(filePartBytes, offset); offset += filePartBytes.byteLength
    body.set(fileBytes, offset); offset += fileBytes.byteLength
    body.set(endBytes, offset)

    const uploadRes = await fetch(
      "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink",
      { method: "POST", headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": `multipart/related; boundary=${boundary}`, "Content-Length": body.byteLength.toString() }, body }
    )

    if (!uploadRes.ok) throw new Error(`Drive upload failed: ${await uploadRes.text()}`)
    const driveFile = await uploadRes.json()

    // Save to vault_items
    const { data: vaultItem } = await supabaseAdmin
      .from("vault_items")
      .insert({
        founder_id: founderId,
        project_id: projectId,
        folder_id: folder.id,
        item_type: "file",
        title: title || file.name,
        description: "",
        document_type: folderType === "deliverables" ? "Deliverable" : "Content",
        drive_file_id: driveFile.id,
        drive_file_url: driveFile.webViewLink,
        added_by: user.id,
        added_by_type: "client",
      })
      .select("id")
      .single()

    return NextResponse.json({ success: true, vault_item_id: vaultItem?.id, drive_file_url: driveFile.webViewLink, title: title || file.name })
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error"
    console.error("[Client Attach File]", message)
    return NextResponse.json({ message }, { status: 500 })
  }
}