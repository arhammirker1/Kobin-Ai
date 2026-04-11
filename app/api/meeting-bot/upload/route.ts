/**
 * POST /api/meeting-bot/upload
 * 
 * Receives the completed transcript from the Electron desktop app
 * after a meeting recording is stopped. Saves raw data to 
 * meeting_recordings_raw and triggers async AI processing.
 */

import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()

    const {
      meeting_title,
      meeting_url,
      participant_emails,
      calendar_event_id,
      host_segments,
      participant_segments,
      combined_transcript,
      duration_seconds,
      started_at,
      ended_at,
      user_id: providedUserId,
    } = body

    // Resolve user_id — try body first, then cookies, then single-user fallback
    let user_id = providedUserId || null

    if (!user_id) {
      // Try to get user from cookies (Supabase auth)
      try {
        const { createServerClient } = await import("@supabase/ssr")
        const cookieSupabase = createServerClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
          {
            cookies: {
              getAll() {
                return req.cookies.getAll()
              },
              setAll() {},
            },
          }
        )
        const { data: { user } } = await cookieSupabase.auth.getUser()
        if (user) {
          user_id = user.id
          console.log(`[upload] Got user_id from cookies: ${user_id}`)
        }
      } catch (e) {
        console.warn("[upload] Cookie auth failed:", e)
      }
    }

    // Final fallback — get the first profile (single-user app)
    if (!user_id) {
      const { data: profiles } = await supabaseAdmin
        .from("profiles")
        .select("id")
        .limit(1)
        .single()
      if (profiles?.id) {
        user_id = profiles.id
        console.log(`[upload] Fallback to first profile: ${user_id}`)
      }
    }

    if (!user_id) {
      return NextResponse.json(
        { error: "Could not determine user. Please log in to the desktop app." },
        { status: 401 }
      )
    }

    // Validate required fields
    if (!combined_transcript && (!host_segments || host_segments.length === 0)) {
      return NextResponse.json(
        { error: "No transcript data provided" },
        { status: 400 }
      )
    }

    // Build combined transcript if not provided
    const transcript = combined_transcript || buildCombinedTranscript(
      host_segments || [],
      participant_segments || []
    )

    // Insert into meeting_recordings_raw
    const { data: recording, error: insertError } = await supabaseAdmin
      .from("meeting_recordings_raw")
      .insert({
        user_id: user_id,
        meeting_title: meeting_title || "Untitled Meeting",
        meeting_url: meeting_url || null,
        calendar_event_id: calendar_event_id || null,
        participant_emails: participant_emails || [],
        host_segments: host_segments || [],
        participant_segments: participant_segments || [],
        combined_transcript: transcript,
        duration_seconds: duration_seconds || 0,
        started_at: started_at || new Date().toISOString(),
        ended_at: ended_at || new Date().toISOString(),
        processing_status: "pending",
      })
      .select("id")
      .single()

    if (insertError) {
      console.error("Failed to insert meeting recording:", insertError)
      return NextResponse.json(
        { error: "Failed to save recording", details: insertError.message },
        { status: 500 }
      )
    }

    console.log(`✅ Meeting recording saved: ${recording.id} — "${meeting_title}"`)

    // Trigger async processing (fire-and-forget to avoid timeout)
    const processUrl = new URL("/api/meeting-bot/process", req.url)
    fetch(processUrl.toString(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ recording_id: recording.id }),
    }).catch(err => {
      console.error("Failed to trigger processing:", err)
    })

    return NextResponse.json({
      success: true,
      recording_id: recording.id,
      message: "Recording saved. AI processing started.",
    })
  } catch (error: any) {
    console.error("Upload error:", error)
    return NextResponse.json(
      { error: "Upload failed", details: error.message },
      { status: 500 }
    )
  }
}

function buildCombinedTranscript(
  hostSegments: Array<{ time: string; text: string }>,
  participantSegments: Array<{ time: string; text: string }>
): string {
  const all = [
    ...hostSegments.map(s => ({ ...s, speaker: "Host" })),
    ...participantSegments.map(s => ({ ...s, speaker: "Participant" })),
  ].sort((a, b) => (a.time || "").localeCompare(b.time || ""))

  return all.map(s => `[${s.time}] ${s.speaker}: ${s.text}`).join("\n")
}
