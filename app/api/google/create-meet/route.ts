/**
 * FILE LOCATION: app/api/google/create-meet/route.ts
 *
 * PURPOSE: Creates a Google Calendar event with an auto-generated
 * Google Meet link. Called when a user schedules a meeting inside
 * Kobin Ai (from Calendar, Clients, or CRM views).
 *
 * URL it handles: POST /api/google/create-meet
 *
 * What it does:
 *  1. Looks up the user's Google tokens from google_integrations table
 *  2. Refreshes the token if expired
 *  3. Calls Google Calendar API to create the event + Meet room
 *  4. Saves the event + Meet link into the CC events table
 *  5. Returns the Meet link back to the frontend
 *
 * Expected request body:
 * {
 *   title: string
 *   description?: string
 *   start_time: string  (ISO format e.g. "2024-03-15T09:00:00.000Z")
 *   end_time: string    (ISO format)
 *   attendee_emails?: string[]  (gets Google Calendar invites)
 *   type?: "internal" | "deal" | "hiring"
 *   client_id?: string
 *   relationship_id?: string
 * }
 */

import { createClient } from "@/lib/supabase/server"
import { supabaseAdmin } from "@/lib/supabase/admin"
import { NextResponse } from "next/server"
import { refreshGoogleToken } from "@/lib/google/token"

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ message: "Not authenticated" }, { status: 401 })
    }

    const body = await request.json()
    const {
      title,
      description,
      start_time,
      end_time,
      attendee_emails = [],
      type = "internal",
      client_id,
      relationship_id,
    } = body

    if (!title || !start_time || !end_time) {
      return NextResponse.json(
        { message: "title, start_time, and end_time are required" },
        { status: 400 }
      )
    }

    // Check if user has Google connected
    const { data: integration, error: integrationError } = await supabaseAdmin
      .from("google_integrations")
      .select("*")
      .eq("user_id", user.id)
      .eq("is_connected", true)
      .single()

    if (integrationError || !integration) {
      return NextResponse.json(
        { message: "Google account not connected. Please connect in Settings." },
        { status: 400 }
      )
    }

    // Auto-refresh the token if it has expired
    const accessToken = await refreshGoogleToken(integration)

    // Build attendees list for the Google Calendar invite
    const attendees = attendee_emails
      .filter(Boolean)
      .map((email: string) => ({ email }))

    // Always include the connected Google account
    if (integration.google_email && !attendee_emails.includes(integration.google_email)) {
      attendees.push({ email: integration.google_email })
    }

    // Call Google Calendar API — conferenceDataVersion=1 tells Google to create a Meet room
    const calendarEvent = {
      summary: title,
      description: description || "",
      start: {
        dateTime: new Date(start_time).toISOString(),
        timeZone: "UTC",
      },
      end: {
        dateTime: new Date(end_time).toISOString(),
        timeZone: "UTC",
      },
      attendees,
      conferenceData: {
        createRequest: {
          requestId: `cc-${Date.now()}-${Math.random().toString(36).slice(2)}`,
          conferenceSolutionKey: { type: "hangoutsMeet" },
        },
      },
      reminders: {
        useDefault: false,
        overrides: [
          { method: "popup", minutes: 10 },
          { method: "email", minutes: 30 },
        ],
      },
    }

    const googleRes = await fetch(
      "https://www.googleapis.com/calendar/v3/calendars/primary/events?conferenceDataVersion=1&sendUpdates=all",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(calendarEvent),
      }
    )

    if (!googleRes.ok) {
      const errText = await googleRes.text()
      console.error("[Google Meet] Calendar API error:", errText)
      return NextResponse.json(
        { message: "Failed to create Google Calendar event", detail: errText },
        { status: 500 }
      )
    }

    const googleEvent = await googleRes.json()

    // Pull out the Meet link from the response
    const meetLink =
      googleEvent.conferenceData?.entryPoints?.find(
        (ep: any) => ep.entryPointType === "video"
      )?.uri || null

    const googleEventId = googleEvent.id

    // Save the event into Kobin Ai's events table
    const { data: ccEvent, error: insertError } = await supabaseAdmin
      .from("events")
      .insert({
        user_id: user.id,
        title,
        start_time: new Date(start_time).toISOString(),
        end_time: new Date(end_time).toISOString(),
        type,
        meeting_link: meetLink,
        purpose: description || null,
        client_id: client_id || null,
        relationship_id: relationship_id || null,
        google_event_id: googleEventId,
        google_meet_link: meetLink,
      })
      .select()
      .single()

    if (insertError) {
      console.error("[Google Meet] DB insert error:", insertError)
      // Don't fail the whole request — the Google event was created successfully
    }

    return NextResponse.json({
      success: true,
      meet_link: meetLink,
      google_event_id: googleEventId,
      event: ccEvent,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error"
    console.error("[Google Meet] Error:", err)
    return NextResponse.json({ message }, { status: 500 })
  }
}