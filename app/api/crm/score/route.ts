import { createClient } from "@/lib/supabase/server"
import { scoreAndPersist } from "@/lib/ai/lead-scoring"
import { detectAndPersist } from "@/lib/ai/ghosting-detector"
import { supabaseAdmin } from "@/lib/supabase/admin"
import { NextResponse } from "next/server"

// GET /api/crm/score?contactId=xxx
// Returns current score + ghosting status for a contact

export async function GET(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { searchParams } = new URL(request.url)
    const contactId = searchParams.get("contactId")

    if (!contactId) {
      return NextResponse.json({ error: "contactId required" }, { status: 400 })
    }

    // Get stored score from relationships table
    const { data: contact } = await supabaseAdmin
      .from("relationships")
      .select("lead_score, lead_status, is_ghosting, ghosting_days, last_inbound_at, last_outbound_at, score_updated_at")
      .eq("id", contactId)
      .eq("user_id", user.id)
      .single()

    if (!contact) {
      return NextResponse.json({ error: "Contact not found" }, { status: 404 })
    }

    return NextResponse.json({
      score: contact.lead_score || 0,
      status: contact.lead_status || "cold",
      is_ghosting: contact.is_ghosting || false,
      ghosting_days: contact.ghosting_days || 0,
      last_inbound_at: contact.last_inbound_at,
      last_outbound_at: contact.last_outbound_at,
      score_updated_at: contact.score_updated_at,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

// POST /api/crm/score
// Recalculates score + ghosting for a specific contact

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { contactId } = await request.json()
    if (!contactId) {
      return NextResponse.json({ error: "contactId required" }, { status: 400 })
    }

    // Verify ownership
    const { data: contact } = await supabaseAdmin
      .from("relationships")
      .select("id")
      .eq("id", contactId)
      .eq("user_id", user.id)
      .single()

    if (!contact) {
      return NextResponse.json({ error: "Contact not found" }, { status: 404 })
    }

    // Run scoring + ghosting detection
    const [scoreResult, ghostingResult] = await Promise.all([
      scoreAndPersist(contactId, user.id),
      detectAndPersist(contactId, user.id),
    ])

    return NextResponse.json({
      score: scoreResult.score,
      status: scoreResult.status,
      breakdown: scoreResult.breakdown,
      ghosting: ghostingResult,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
