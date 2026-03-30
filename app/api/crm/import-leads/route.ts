import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"

interface LeadRow {
  full_name: string
  email: string
  company?: string
  role?: string
  linkedin_profile_url?: string
  tags?: string[]
  deal_value?: number
  pipeline_notes?: string
}

interface ImportRequest {
  leads: LeadRow[]
  file_name: string
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ message: "Not authenticated" }, { status: 401 })
    }

    const body: ImportRequest = await request.json()
    const { leads, file_name } = body

    if (!leads || !Array.isArray(leads) || leads.length === 0) {
      return NextResponse.json({ message: "No leads provided" }, { status: 400 })
    }

    if (!file_name) {
      return NextResponse.json({ message: "file_name is required" }, { status: 400 })
    }

    // Validate required fields on every row
    const invalidRows: number[] = []
    for (let i = 0; i < leads.length; i++) {
      const lead = leads[i]
      if (!lead.full_name?.trim() || !lead.email?.trim()) {
        invalidRows.push(i + 1) // 1-indexed for user display
      }
    }

    if (invalidRows.length > 0) {
      return NextResponse.json(
        {
          message: `Rows missing name or email: ${invalidRows.slice(0, 10).join(", ")}${invalidRows.length > 10 ? ` and ${invalidRows.length - 10} more` : ""}`,
        },
        { status: 400 },
      )
    }

    // ── Dedup: fetch existing emails for this user ──────────────────────────
    const { data: existingRels } = await supabase
      .from("relationships")
      .select("id")
      .eq("user_id", user.id)

    // Also fetch emails separately since email might not be in the select above
    const { data: existingEmails } = await supabase
      .from("relationships")
      .select("email")
      .eq("user_id", user.id)
      .not("email", "is", null)

    const existingEmailSet = new Set(
      (existingEmails ?? []).map((r: { email: string }) => r.email?.toLowerCase().trim()),
    )

    // Filter out duplicates
    const uniqueLeads: LeadRow[] = []
    const duplicateEmails: string[] = []

    for (const lead of leads) {
      const email = lead.email.toLowerCase().trim()
      if (existingEmailSet.has(email)) {
        duplicateEmails.push(email)
      } else {
        uniqueLeads.push(lead)
        existingEmailSet.add(email) // prevent intra-batch duplicates
      }
    }

    if (uniqueLeads.length === 0) {
      // Log import even if all skipped
      await supabase.from("crm_import_history").insert({
        user_id: user.id,
        file_name,
        rows_imported: 0,
        rows_skipped: duplicateEmails.length,
      })

      return NextResponse.json({
        inserted: 0,
        skipped: duplicateEmails.length,
        duplicateEmails: duplicateEmails.slice(0, 20),
        message: "All leads already exist as contacts",
      })
    }

    // ── Batch insert ────────────────────────────────────────────────────────
    const now = new Date().toISOString()
    const rows = uniqueLeads.map((lead) => ({
      user_id: user.id,
      full_name: lead.full_name.trim(),
      email: lead.email.trim(),
      company: lead.company?.trim() || null,
      role: lead.role?.trim() || null,
      linkedin_profile_url: lead.linkedin_profile_url?.trim() || null,
      tags: lead.tags ?? [],
      deal_value: lead.deal_value ?? null,
      pipeline_notes: lead.pipeline_notes?.trim() || null,
      relationship_type: "lead",
      pipeline_stage: "new_lead",
      status: "active",
      stage_entered_at: now,
      meeting_link: null,
    }))

    const { error: insertError } = await supabase.from("relationships").insert(rows)

    if (insertError) {
      console.error("[CRM Import] Insert error:", insertError)
      return NextResponse.json({ message: "Failed to import leads" }, { status: 500 })
    }

    // ── Log import history ──────────────────────────────────────────────────
    await supabase.from("crm_import_history").insert({
      user_id: user.id,
      file_name,
      rows_imported: uniqueLeads.length,
      rows_skipped: duplicateEmails.length,
    })

    return NextResponse.json({
      inserted: uniqueLeads.length,
      skipped: duplicateEmails.length,
      duplicateEmails: duplicateEmails.slice(0, 20),
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error"
    console.error("[CRM Import]", message)
    return NextResponse.json({ message }, { status: 500 })
  }
}
