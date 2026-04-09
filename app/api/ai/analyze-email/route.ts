/**
 * Manual email analysis endpoint.
 * Thin wrapper around the shared analyzeEmailThread() function.
 * Called by the frontend "Sync Gmail" flow and the AI tools.
 */

import { createClient } from "@/lib/supabase/server"
import { analyzeEmailThread } from "@/lib/gmail/analyze"
import { NextResponse } from "next/server"

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { thread_id, relationship_id } = await request.json()
    if (!thread_id || !relationship_id) return NextResponse.json({ error: "thread_id and relationship_id required" }, { status: 400 })

    const result = await analyzeEmailThread(user.id, thread_id, relationship_id)

    if (result.error) {
      const status = result.error === "Unauthorized" ? 401
        : result.error === "Gmail not connected" ? 400
        : result.error === "Relationship not found" || result.error === "Thread not found" ? 404
        : 500
      return NextResponse.json({ error: result.error }, { status })
    }

    return NextResponse.json(result)
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}