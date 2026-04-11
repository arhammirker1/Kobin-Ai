/**
 * GET /api/meeting-bot/lookup-event?meet_url=https://meet.google.com/xxx
 * 
 * Looks up a calendar event by its Google Meet link.
 * Returns the event title and attendee emails for the Electron recording widget.
 */

import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

export async function GET(req: NextRequest) {
  try {
    const meetUrl = req.nextUrl.searchParams.get("meet_url")

    if (!meetUrl) {
      return NextResponse.json({ error: "meet_url is required" }, { status: 400 })
    }

    console.log(`[lookup-event] Looking up event for: ${meetUrl}`)

    // Search events table for matching Google Meet link
    const { data: events, error } = await supabaseAdmin
      .from("events")
      .select("id, title, meeting_link, google_meet_link, user_id, relationship_id, client_id, attendee_emails")
      .or(`meeting_link.eq.${meetUrl},google_meet_link.eq.${meetUrl}`)
      .order("start_time", { ascending: false })
      .limit(1)

    if (error) {
      console.error("[lookup-event] DB error:", error)
      return NextResponse.json({ error: "Lookup failed" }, { status: 500 })
    }

    if (!events || events.length === 0) {
      console.log("[lookup-event] No matching event found")
      return NextResponse.json({ title: null, attendee_emails: [] })
    }

    const event = events[0]
    console.log(`[lookup-event] Found event: "${event.title}" (${event.id})`)

    // Collect attendee emails — start with stored attendee_emails from event
    const attendeeEmails: string[] = [...(event.attendee_emails || [])]

    // Enrich from linked relationship (CRM contact)
    if (event.relationship_id) {
      const { data: contact } = await supabaseAdmin
        .from("relationships")
        .select("email, full_name")
        .eq("id", event.relationship_id)
        .single()

      if (contact?.email && !attendeeEmails.includes(contact.email)) {
        attendeeEmails.push(contact.email)
        console.log(`[lookup-event] CRM contact: ${contact.full_name} (${contact.email})`)
      }
    }

    // Enrich from linked client
    if (event.client_id) {
      const { data: client } = await supabaseAdmin
        .from("clients")
        .select("email, name")
        .eq("id", event.client_id)
        .single()

      if (client?.email && !attendeeEmails.includes(client.email)) {
        attendeeEmails.push(client.email)
        console.log(`[lookup-event] Client: ${client.name} (${client.email})`)
      }
    }

    // Deduplicate
    const uniqueEmails = [...new Set(attendeeEmails.filter(Boolean))]

    console.log(`[lookup-event] Result: title="${event.title}", emails=[${uniqueEmails.join(", ")}]`)

    return NextResponse.json({
      title: event.title,
      attendee_emails: uniqueEmails,
      event_id: event.id,
    })
  } catch (error: any) {
    console.error("[lookup-event] Error:", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
