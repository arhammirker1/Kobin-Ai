// app/api/tasks/submit-deliverable/route.ts — NEW FILE
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
    const taskId = formData.get("task_id") as string
    const projectId = formData.get("project_id") as string
    const title = formData.get("title") as string
    const description = formData.get("description") as string || ""
    const linkUrl = formData.get("link_url") as string | null
    const file = formData.get("file") as File | null

    if (!taskId || !projectId || !title) {
      return NextResponse.json({ message: "task_id, project_id, and title required" }, { status: 400 })
    }

    // Resolve founder ID
    const { data: profile } = await supabaseAdmin
      .from("profiles").select("user_type").eq("id", user.id).single()

    let founderId = user.id
    if (profile?.user_type === "team_member") {
      const { data: tm } = await supabaseAdmin
        .from("team_members").select("founder_id").eq("user_id", user.id).eq("is_active", true).single()
      if (tm?.founder_id) founderId = tm.founder_id
    } else if (profile?.user_type === "client") {
      const { data: client } = await supabaseAdmin
        .from("clients").select("founder_id").eq("portal_user_id", user.id).single()
      if (client?.founder_id) founderId = client.founder_id
    }

    // Find the Deliverables folder for this project
    const { data: deliverableFolder } = await supabaseAdmin
      .from("vault_folders")
      .select("id, drive_folder_id")
      .eq("project_id", projectId)
      .eq("folder_type", "deliverables")
      .single()

    if (!deliverableFolder) {
      return NextResponse.json({ message: "Deliverables folder not found for this project" }, { status: 404 })
    }

    let driveFileId: string | null = null
    let driveFileUrl: string | null = null

    // Upload to Drive if file provided
    if (file) {
      const { data: integration } = await supabaseAdmin
        .from("google_integrations")
        .select("*").eq("user_id", founderId).eq("is_connected", true).single()

      if (!integration) {
        return NextResponse.json({ message: "Google Drive not connected" }, { status: 400 })
      }

      const accessToken = await refreshGoogleToken(integration)
      const fileBuffer = await file.arrayBuffer()
      const fileBytes = new Uint8Array(fileBuffer)

      const boundary = "deliverable_boundary_" + Date.now()
      const metadata = { name: title, parents: [deliverableFolder.drive_folder_id] }
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
      driveFileId = driveFile.id
      driveFileUrl = driveFile.webViewLink
    }

    // Save vault_item
    const { data: vaultItem, error: vaultError } = await supabaseAdmin
      .from("vault_items")
      .insert({
        founder_id: founderId,
        project_id: projectId,
        folder_id: deliverableFolder.id,
        item_type: file ? "file" : "link",
        title,
        description,
        document_type: "Deliverable",
        drive_file_id: driveFileId,
        drive_file_url: driveFileUrl,
        link_url: linkUrl || null,
        added_by: user.id,
        added_by_type: profile?.user_type === "client" ? "client" : profile?.user_type === "team_member" ? "team" : "founder",
      })
      .select("id")
      .single()

    if (vaultError) throw vaultError

    // Update task with deliverable reference
    await supabaseAdmin
      .from("tasks")
      .update({ deliverable_vault_item_id: vaultItem.id })
      .eq("id", taskId)

    return NextResponse.json({ success: true, vault_item_id: vaultItem.id, drive_file_url: driveFileUrl })
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error"
    console.error("[Submit Deliverable]", message)
    return NextResponse.json({ message }, { status: 500 })
  }
}