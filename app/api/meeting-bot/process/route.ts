/**
 * POST /api/meeting-bot/process
 * 
 * Processes a raw meeting transcript through the AI pipeline.
 * Called asynchronously after a recording is uploaded.
 * 
 * Creates: tasks, vault decision notes, CRM stage updates, AI inbox message.
 */

import { NextRequest, NextResponse } from "next/server"
import { processMeetingTranscript } from "@/lib/meeting-bot/process-meeting"

export const maxDuration = 60 // Allow up to 60s for AI processing

export async function POST(req: NextRequest) {
  try {
    const { recording_id } = await req.json()

    if (!recording_id) {
      return NextResponse.json(
        { error: "recording_id is required" },
        { status: 400 }
      )
    }

    console.log(`[meeting-bot/process] Starting AI processing for: ${recording_id}`)

    const result = await processMeetingTranscript(recording_id)

    if (!result.success) {
      console.error(`[meeting-bot/process] Processing failed:`, result.error)
      return NextResponse.json(
        { error: result.error },
        { status: 500 }
      )
    }

    console.log(`[meeting-bot/process] ✅ Complete:`, {
      tasks: result.tasks_created?.length || 0,
      notes: result.notes_created?.length || 0,
      crm_updates: result.crm_updates?.length || 0,
    })

    return NextResponse.json({
      success: true,
      summary: result.summary,
      tasks_created: result.tasks_created?.length || 0,
      notes_created: result.notes_created?.length || 0,
      crm_updates: result.crm_updates?.length || 0,
    })
  } catch (error: any) {
    console.error("[meeting-bot/process] Fatal error:", error)
    return NextResponse.json(
      { error: "Processing failed", details: error.message },
      { status: 500 }
    )
  }
}
