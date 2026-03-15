import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { invite_id, response } = await req.json() // response: "accepted" | "declined"

  if (!["accepted", "declined"].includes(response)) {
    return NextResponse.json({ error: "Invalid response" }, { status: 400 })
  }

  // Fetch the invite + event
  const { data: invite, error: inviteError } = await supabase
    .from("event_invites")
    .select("*, event:events(*)")
    .eq("id", invite_id)
    .eq("invitee_user_id", user.id)
    .single()

  if (inviteError || !invite) {
    return NextResponse.json({ error: "Invite not found" }, { status: 404 })
  }

  if (invite.status !== "pending") {
    return NextResponse.json({ error: "Invite already responded to" }, { status: 400 })
  }

  // Update invite status
  const { error: updateError } = await supabase
    .from("event_invites")
    .update({ status: response, responded_at: new Date().toISOString() })
    .eq("id", invite_id)

  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 })

  if (response === "accepted") {
    const event = invite.event

    // Add event to invitee's events table
    const { error: eventError } = await supabase.from("events").insert({
      user_id: user.id,
      title: event.title,
      start_time: event.start_time,
      end_time: event.end_time,
      type: event.type,
      meeting_link: event.meeting_link,
      purpose: event.purpose,
      relationship_id: null,
      client_id: null,
    })

    if (eventError) return NextResponse.json({ error: eventError.message }, { status: 500 })

    // Try to add to Google Calendar if they have it connected
    const { data: integration } = await supabase
      .from("google_integrations")
      .select("access_token, is_connected")
      .eq("user_id", user.id)
      .single()

    if (integration?.is_connected && integration.access_token) {
      try {
        await fetch("https://www.googleapis.com/calendar/v3/calendars/primary/events", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${integration.access_token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            summary: event.title,
            description: event.purpose || "",
            start: { dateTime: event.start_time },
            end: { dateTime: event.end_time },
            ...(event.meeting_link ? {
              conferenceData: {
                entryPoints: [{ entryPointType: "video", uri: event.meeting_link, label: "Join Meeting" }]
              }
            } : {}),
          }),
        })
      } catch (e) {
        // Non-fatal — event was already added to DB
        console.warn("Failed to add to Google Calendar:", e)
      }
    }
  }

  return NextResponse.json({ success: true })
}