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
    console.log("[analyze-email] POST called")

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      console.log("[analyze-email] No user session")
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    console.log(`[analyze-email] User: ${user.id}`)

    // ── Plan enforcement — email analysis requires Pro+ ─────────────────────
    const { requireFeature } = await import("@/lib/plan-guard")
    const guard = await requireFeature(user.id, "gmail_integration")
    if (guard) return guard

    let body: any
    try {
      body = await request.json()
    } catch (parseErr) {
      console.error("[analyze-email] Failed to parse request body:", parseErr)
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
    }

    const { thread_id, relationship_id } = body
    console.log(`[analyze-email] thread_id=${thread_id}, relationship_id=${relationship_id}`)

    if (!thread_id || !relationship_id) {
      return NextResponse.json({ error: "thread_id and relationship_id required" }, { status: 400 })
    }

    console.log(`[analyze-email] Calling analyzeEmailThread...`)
    const result = await analyzeEmailThread(user.id, thread_id, relationship_id)
    console.log(`[analyze-email] Result:`, JSON.stringify(result).slice(0, 500))

    if (result.error) {
      const status = result.error === "Unauthorized" ? 401
        : result.error === "Gmail not connected" ? 400
        : result.error === "Relationship not found" || result.error === "Thread not found" ? 404
        : 500
      console.error(`[analyze-email] Error: ${result.error} (${status})`)
      return NextResponse.json({ error: result.error }, { status })
    }

    return NextResponse.json(result)
  } catch (err) {
    console.error("[analyze-email] Unhandled exception:", err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}