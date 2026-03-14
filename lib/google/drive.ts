import { supabaseAdmin } from "@/lib/supabase/admin"
import { refreshGoogleToken } from "@/lib/google/token"

// ── Create a folder in Google Drive ──────────────────────────────────────────
export async function createDriveFolder(
  accessToken: string,
  name: string,
  parentFolderId?: string
): Promise<string> {
  const metadata: any = {
    name,
    mimeType: "application/vnd.google-apps.folder",
  }

  if (parentFolderId) {
    metadata.parents = [parentFolderId]
  }

  const res = await fetch("https://www.googleapis.com/drive/v3/files", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(metadata),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Failed to create Drive folder "${name}": ${err}`)
  }

  const data = await res.json()
  return data.id as string
}

// ── Initialize Vault root folder for a founder ───────────────────────────────
export async function initializeVaultForFounder(founderId: string): Promise<string> {
  const { data: integration, error } = await supabaseAdmin
    .from("google_integrations")
    .select("*")
    .eq("user_id", founderId)
    .eq("is_connected", true)
    .single()

  if (error || !integration) {
    throw new Error("Google Drive not connected")
  }

  // Already initialized
  if (integration.drive_vault_folder_id) {
    return integration.drive_vault_folder_id
  }

  const accessToken = await refreshGoogleToken(integration)

  // Create root "Vault" folder in Drive
  const vaultFolderId = await createDriveFolder(accessToken, "Vault")

  // Save to google_integrations
  await supabaseAdmin
    .from("google_integrations")
    .update({
      drive_vault_folder_id: vaultFolderId,
      drive_connected: true,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", founderId)

  // Save to vault_folders table
  await supabaseAdmin.from("vault_folders").insert({
    founder_id: founderId,
    name: "Vault",
    drive_folder_id: vaultFolderId,
    folder_type: "root",
  })

  return vaultFolderId
}

// ── Create project folder structure in Drive ─────────────────────────────────
export async function createProjectVaultFolders(
  founderId: string,
  projectId: string,
  projectName: string
): Promise<void> {
  const { data: integration } = await supabaseAdmin
    .from("google_integrations")
    .select("*")
    .eq("user_id", founderId)
    .eq("is_connected", true)
    .single()

  if (!integration?.drive_vault_folder_id) {
    // Vault not initialized yet — skip silently
    return
  }

  const accessToken = await refreshGoogleToken(integration)
  const vaultRootId = integration.drive_vault_folder_id

  // Create project folder inside Vault root
  const projectFolderId = await createDriveFolder(accessToken, projectName, vaultRootId)

  // Save project folder to DB
  const { data: projectFolderRow } = await supabaseAdmin
    .from("vault_folders")
    .insert({
      founder_id: founderId,
      project_id: projectId,
      name: projectName,
      drive_folder_id: projectFolderId,
      folder_type: "project",
    })
    .select("id")
    .single()

  if (!projectFolderRow) return

  // Create 3 default subfolders
  const subfolders = [
    { name: "Internal Documents", type: "internal" },
    { name: "Client Uploads", type: "client_uploads" },
    { name: "Deliverables", type: "deliverables" },
  ] as const

  for (const sub of subfolders) {
    const subFolderId = await createDriveFolder(accessToken, sub.name, projectFolderId)

    await supabaseAdmin.from("vault_folders").insert({
      founder_id: founderId,
      project_id: projectId,
      name: sub.name,
      drive_folder_id: subFolderId,
      folder_type: sub.type,
      parent_folder_id: projectFolderRow.id,
    })
  }
}