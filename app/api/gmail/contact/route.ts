import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"

export async function GET(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ contact: null })

    const { searchParams } = new URL(request.url)
    const email = searchParams.get("email") || ""
    const name = searchParams.get("name") || ""

    // 1. Try clients table by email (exact match)
    if (email) {
      const { data: client } = await supabase
        .from("clients")
        .select("id, name, email, phone, company, role, project_id, has_portal_access, can_create_tasks")
        .eq("email", email)
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
            hasPortalAccess: client.has_portal_access,
            canCreateTasks: client.can_create_tasks,
          },
        })
      }
    }

    // 2. Try relationships — fuzzy match by name or email domain
    const { data: rels } = await supabase
      .from("relationships")
      .select("*")
      .eq("user_id", user.id)
      .eq("status", "active")

    if (rels?.length) {
      const firstName = name.split(" ")[0].toLowerCase()
      const emailDomain = email.split("@")[1]?.split(".")[0] || ""

      const matched = rels.find((r) => {
        const rName = r.full_name?.toLowerCase() || ""
        const rCompany = r.company?.toLowerCase() || ""
        return (
          (firstName.length > 1 && rName.includes(firstName)) ||
          (emailDomain.length > 2 && rCompany.includes(emailDomain))
        )
      })

      if (matched) {
        // Fetch last past event for this relationship
        const { data: lastEvent } = await supabase
          .from("events")
          .select("id, title, start_time, outcome, purpose")
          .eq("relationship_id", matched.id)
          .lt("start_time", new Date().toISOString())
          .order("start_time", { ascending: false })
          .limit(1)
          .maybeSingle()

        return NextResponse.json({
          contact: {
            type: "relationship",
            id: matched.id,
            name: matched.full_name,
            company: matched.company,
            role: matched.role,
            pipelineStage: matched.pipeline_stage,
            dealValue: matched.deal_value,
            closeProbability: matched.close_probability,
            stageEnteredAt: matched.stage_entered_at,
            lastEvent: lastEvent || null,
            linkedinUrl: matched.linkedin_profile_url,
          },
        })
      }
    }

    return NextResponse.json({ contact: null })
  } catch {
    return NextResponse.json({ contact: null })
  }
}