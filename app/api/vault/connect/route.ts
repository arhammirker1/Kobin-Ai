import { createClient } from "@/lib/supabase/server"
import { initializeVaultForFounder } from "@/lib/google/drive"
import { NextResponse } from "next/server"

export async function POST() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ message: "Not authenticated" }, { status: 401 })
    }

    const vaultFolderId = await initializeVaultForFounder(user.id)

    return NextResponse.json({ 
      success: true, 
      vault_folder_id: vaultFolderId 
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error"
    return NextResponse.json({ message }, { status: 500 })
  }
}