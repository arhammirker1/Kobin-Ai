import { createClient } from "@/lib/supabase/server"
import { createProjectVaultFolders } from "@/lib/google/drive"
import { NextResponse } from "next/server"

export async function POST(request: Request) {
  try {
    const { project_id, project_name } = await request.json()

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ message: "Not authenticated" }, { status: 401 })
    }

    await createProjectVaultFolders(user.id, project_id, project_name)

    return NextResponse.json({ success: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error"
    return NextResponse.json({ message }, { status: 500 })
  }
}