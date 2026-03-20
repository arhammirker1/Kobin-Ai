import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"

export async function GET(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ contact: null })

    const { searchParams } = new URL(request.url)
    const email = searchParams.get("email")?.toLowerCase().trim() || ""

    if (!email) return NextResponse.json({ contact: null })

    // 1. Exact email match against clients
    const { data: client } = await supabase
      .from("clients")
      .select("id, name, email, company, role, project_id")
      .ilike("email", email)
      .maybeSingle()

    if (client) {
      let projectName: string | null = null
      if (client.project_id) {
        const { data: proj } = await supabase
          .from("projects")
          .select("name")
          .eq("id", client.project_id)
          .single()
        projectName = proj?.name || null
      }
      return NextResponse.json({
        contact: {
          type: "client",
          id: client.id,
          name: client.name,
          email: client.email,
          company: client.company,
          role: client.role,
          projectName,
        },
      })
    }

    // 2. Exact email match against relationships
    const { data: rel } = await supabase
      .from("relationships")
      .select("*")
      .eq("user_id", user.id)
      .ilike("email", email)
      .maybeSingle()

    if (!rel) return NextResponse.json({ contact: null })

    // Fetch last past event for this relationship
    const { data: lastEvent } = await supabase
      .from("events")
      .select("id, title, start_time, outcome, purpose")
      .eq("relationship_id", rel.id)
      .lt("start_time", new Date().toISOString())
      .order("start_time", { ascending: false })
      .limit(1)
      .maybeSingle()

    return NextResponse.json({
      contact: {
        type: "relationship",
        id: rel.id,
        name: rel.full_name,
        email: rel.email,
        company: rel.company,
        role: rel.role,
        pipelineStage: rel.pipeline_stage,
        dealValue: rel.deal_value,
        closeProbability: rel.close_probability,
        stageEnteredAt: rel.stage_entered_at,
        lastEvent: lastEvent || null,
        linkedinUrl: rel.linkedin_profile_url,
      },
    })
  } catch {
    return NextResponse.json({ contact: null })
  }
}