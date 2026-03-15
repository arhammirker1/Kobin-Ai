import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"
import { pushToUser } from "@/lib/web-push/push-to-user"

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { invite_id, response } = await req.json()

  if (!["accepted", "declined"].includes(response)) {
    return NextResponse.json({ error: "Invalid response" }, { status: 400 })
  }

  // Fetch invite separately from event to avoid join issues
  const { data: invite, error: inviteError } = await supabase
    .from("event_invites")
    .select("id, event_id, invitee_user_id, inviter_user_id, status")
    .eq("id", invite_id)
    .eq("invitee_user_id", user.id)
    .single()

  if (inviteError || !invite) {
    console.error("Invite fetch error:", inviteError)
    return NextResponse.json({ error: "Invite not found" }, { status: 404 })
  }

  // Allow re-accepting if already accepted (idempotent), block only declined
  if (invite.status === "declined") {
    return NextResponse.json({ error: "Invite already declined" }, { status: 400 })
  }

  // Fetch the event separately
  const { data: event, error: eventFetchError } = await supabase
    .from("events")
    .select("id, title, start_time, end_time, type, meeting_link, purpose")
    .eq("id", invite.event_id)
    .single()

  if (eventFetchError || !event) {
    console.error("Event fetch error:", eventFetchError)
    return NextResponse.json({ error: "Event not found" }, { status: 404 })
  }

  // Update invite status
  const { error: updateError } = await supabase
    .from("event_invites")
    .update({ status: response, responded_at: new Date().toISOString() })
    .eq("id", invite_id)

  if (updateError) {
    console.error("Update error:", updateError)
    return NextResponse.json({ error: updateError.message }, { status: 500 })
  }

  if (response === "accepted") {
    // Check if this event already exists for this user (idempotent)
    const { data: existingEvent } = await supabase
      .from("events")
      .select("id")
      .eq("user_id", user.id)
      .eq("title", event.title)
      .eq("start_time", event.start_time)
      .maybeSingle()
    await pushToUser(invite.inviter_user_id, {
        type: "inbox_message",
        title: "✅ Invite Accepted",
        body: `Someone accepted your meeting invite for "${event.title}"`,
        room_id: null,
    })

    if (!existingEvent) {
      const { error: eventError } = await supabase.from("events").insert({
        user_id: user.id,
        title: event.title,
        start_time: event.start_time,
        end_time: event.end_time,
        type: event.type || "internal",
        meeting_link: event.meeting_link || null,
        purpose: event.purpose || null,
        relationship_id: null,
        client_id: null,
      })

      if (eventError) {
        console.error("Event insert error:", eventError)
        return NextResponse.json({ error: eventError.message }, { status: 500 })
      }
    }

    // Try to add to Google Calendar if connected
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
        console.warn("Google Calendar add failed (non-fatal):", e)
      }
    }
  }

  return NextResponse.json({ success: true })
}