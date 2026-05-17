/**
 * lib/meeting-bot/process-meeting.ts
 * 
 * Core AI processing engine for meeting transcripts.
 * Follows the same pattern as lib/gmail/analyze.ts:
 *   1. Read raw transcript
 *   2. Match participants to CRM contacts  
 *   3. Run Groq AI analysis
 *   4. Create tasks, vault notes, CRM updates
 *   5. Send AI inbox notification
 */

import { createClient } from "@supabase/supabase-js"
import { getGroqClient, GROQ_MODEL_STRONG } from "@/lib/ai/groq"
import { sendAIMessage } from "@/lib/ai/inbox-dm"

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

const STAGES = [
  "new_lead", "contacted", "meeting_booked",
  "proposal", "negotiating", "closed_won", "closed_lost"
]

export interface MeetingProcessingResult {
  success: boolean
  error?: string
  summary?: string
  tasks_created?: Array<{ id: string; title: string }>
  notes_created?: Array<{ id: string; title: string }>
  crm_updates?: Array<{ contact: string; from: string; to: string }>
}

/**
 * Main processing function — reads raw transcript, runs AI analysis,
 * creates tasks, notes, updates CRM, and sends inbox notifications.
 */
export async function processMeetingTranscript(
  recordingId: string
): Promise<MeetingProcessingResult> {
  console.log(`[meetingBot] Starting processing for recording: ${recordingId}`)

  try {
    // ── 1. Fetch the raw recording ──────────────────────────────────────────
    const { data: recording, error: fetchErr } = await supabaseAdmin
      .from("meeting_recordings_raw")
      .select("*")
      .eq("id", recordingId)
      .single()

    if (fetchErr || !recording) {
      console.error(`[meetingBot] Recording not found:`, fetchErr)
      return { success: false, error: "Recording not found" }
    }

    // Mark as processing
    await supabaseAdmin
      .from("meeting_recordings_raw")
      .update({ processing_status: "processing" })
      .eq("id", recordingId)

    const { user_id, combined_transcript, participant_emails, meeting_title } = recording

    if (!combined_transcript || combined_transcript.trim().length < 20) {
      await markFailed(recordingId, "Transcript too short to analyze")
      return { success: false, error: "Transcript too short" }
    }

    // ── 2. Match participants to CRM contacts ───────────────────────────────
    const crmMatches = await matchParticipantsToCRM(user_id, participant_emails || [])
    console.log(`[meetingBot] CRM matches: ${crmMatches.length} contacts found`)

    // Build context about matched contacts
    const contactContext = crmMatches.length > 0
      ? crmMatches.map(m =>
          `• ${m.full_name} (${m.email}) — ${m.relationship_type}, stage: ${m.pipeline_stage}`
        ).join("\n")
      : "No CRM contacts matched for this meeting."

    // ── 3. AI Analysis with Groq ────────────────────────────────────────────
    console.log(`[meetingBot] Running AI analysis (model: ${GROQ_MODEL_STRONG})...`)
    const groq = getGroqClient()

    const resp = await groq.chat.completions.create({
      model: GROQ_MODEL_STRONG,
      max_tokens: 2048,
      temperature: 0,
      messages: [{
        role: "user",
        content: `You are Kobin AI, an intelligent meeting analyst for a digital agency. Analyze this meeting transcript and extract actionable intelligence.

MEETING: "${meeting_title}"
DURATION: ${Math.round((recording.duration_seconds || 0) / 60)} minutes

CRM CONTACTS IN THIS MEETING:
${contactContext}

TRANSCRIPT:
${combined_transcript.slice(0, 8000)}

Respond ONLY with valid JSON, no markdown:
{
  "summary": "2-3 sentence summary of the meeting",
  "key_decisions": [
    {"decision": "what was decided", "context": "brief context", "decided_by": "who decided or 'team'"}
  ],
  "action_items": [
    {"action": "clear actionable task", "assignee": "host or participant name", "priority": "high|medium|low", "due_hint": "today|this_week|next_week|no_deadline"}
  ],
  "sentiment": "positive|neutral|negative|mixed",
  "topics": ["topic1", "topic2"],
  "crm_stage_suggestions": [
    {"contact_email": "email if matched", "suggested_stage": "${STAGES.join('|')}", "reason": "why stage should change"}
  ],
  "meeting_type": "sales_call|client_check_in|internal|interview|demo|other",
  "follow_up_needed": true or false,
  "follow_up_suggestion": "what follow-up is needed or null"
}`
      }]
    })

    let analysis: any = {}
    const rawContent = resp.choices[0]?.message?.content || "{}"
    const cleaned = rawContent.replace(/```json|```/g, "").trim()

    try {
      analysis = JSON.parse(cleaned)
      console.log(`[meetingBot] Analysis parsed: sentiment=${analysis.sentiment}, topics=${analysis.topics?.join(", ")}`)
    } catch (parseErr) {
      // Try JSON repair (same approach as email analysis)
      try {
        let repaired = cleaned
        const lastComma = repaired.lastIndexOf(",\n")
        const lastBrace = repaired.lastIndexOf("}")
        if (lastComma > lastBrace && lastComma > 0) {
          repaired = repaired.slice(0, lastComma)
        }
        const openBraces = (repaired.match(/{/g) || []).length
        const closeBraces = (repaired.match(/}/g) || []).length
        const openBrackets = (repaired.match(/\[/g) || []).length
        const closeBrackets = (repaired.match(/\]/g) || []).length
        for (let i = 0; i < openBrackets - closeBrackets; i++) repaired += "]"
        for (let i = 0; i < openBraces - closeBraces; i++) repaired += "}"
        analysis = JSON.parse(repaired)
      } catch {
        console.error(`[meetingBot] JSON parse failed, using fallback`)
        analysis = {
          summary: "AI analysis incomplete — transcript may be too short or unclear",
          key_decisions: [], action_items: [], sentiment: "neutral",
          topics: [], crm_stage_suggestions: [], follow_up_needed: false,
        }
      }
    }

    // ── 4. Create tasks from action items ───────────────────────────────────
    const createdTasks: Array<{ id: string; title: string }> = []
    for (const item of (analysis.action_items || []).slice(0, 5)) {
      const bucket = item.due_hint === "today" || item.priority === "high"
        ? "today"
        : item.due_hint === "this_week" ? "this-week" : "backlog"

      const { data: task } = await supabaseAdmin.from("tasks").insert({
        user_id,
        created_by: user_id,
        title: item.action,
        bucket,
        status: "todo",
        priority: item.priority || "medium",
        is_completed: false,
        notes: `Auto-created from meeting: "${meeting_title}" — Assignee: ${item.assignee || "unassigned"}`,
      }).select("id, title").single()

      if (task) createdTasks.push(task)
    }
    console.log(`[meetingBot] Created ${createdTasks.length} tasks`)

    // ── 5. Create vault decision notes ──────────────────────────────────────
    const createdNotes: Array<{ id: string; title: string }> = []
    for (const decision of (analysis.key_decisions || []).slice(0, 5)) {
      const { data: note } = await supabaseAdmin.from("vault_notes").insert({
        user_id,
        title: `Decision: ${decision.decision}`,
        content: `Context: ${decision.context}\nDecided by: ${decision.decided_by}\nMeeting: ${meeting_title}`,
        tags: ["meeting", "decision", ...(analysis.topics || []).slice(0, 3)],
        is_decision: true,
      }).select("id, title").single()

      if (note) createdNotes.push(note)
    }
    console.log(`[meetingBot] Created ${createdNotes.length} decision notes`)

    // ── 6. Update CRM pipeline stages ───────────────────────────────────────
    const crmUpdates: Array<{ contact: string; from: string; to: string }> = []
    for (const suggestion of (analysis.crm_stage_suggestions || [])) {
      const match = crmMatches.find(m => m.email === suggestion.contact_email)
      if (!match) continue

      const curIdx = STAGES.indexOf(match.pipeline_stage)
      const sugIdx = STAGES.indexOf(suggestion.suggested_stage)

      // Only advance stages, never go back (except closed_lost)
      if (sugIdx > curIdx || suggestion.suggested_stage === "closed_lost") {
        await supabaseAdmin.from("relationships").update({
          pipeline_stage: suggestion.suggested_stage,
          stage_entered_at: new Date().toISOString(),
        }).eq("id", match.id)

        crmUpdates.push({
          contact: match.full_name,
          from: match.pipeline_stage,
          to: suggestion.suggested_stage,
        })
        console.log(`[meetingBot] CRM: ${match.full_name} → ${suggestion.suggested_stage}`)
      }
    }

    // ── 7. Save analysis to meeting_analyses ────────────────────────────────
    // Extract participant names from transcript if available
    const participantNames = crmMatches.map(m => m.full_name)

    await supabaseAdmin.from("meeting_analyses").insert({
      user_id,
      recording_id: recordingId,
      summary: analysis.summary || "",
      key_decisions: analysis.key_decisions || [],
      action_items: analysis.action_items || [],
      sentiment: analysis.sentiment || "neutral",
      topics: analysis.topics || [],
      crm_matches: crmMatches.map(m => ({
        participant_email: m.email,
        relationship_id: m.id,
        name: m.full_name,
        stage_before: m.pipeline_stage,
        stage_after: crmUpdates.find(u => u.contact === m.full_name)?.to || m.pipeline_stage,
      })),
      tasks_created: createdTasks.map(t => t.id),
      notes_created: createdNotes.map(n => n.id),
    })

    // Mark recording as completed
    await supabaseAdmin
      .from("meeting_recordings_raw")
      .update({ processing_status: "completed" })
      .eq("id", recordingId)

    // ── 8. Send AI inbox notification ───────────────────────────────────────
    const taskSummary = createdTasks.length > 0
      ? `\n✅ ${createdTasks.length} task(s) created: ${createdTasks.map(t => `"${t.title}"`).join(", ")}`
      : ""

    const decisionSummary = createdNotes.length > 0
      ? `\n📋 ${createdNotes.length} decision(s) logged`
      : ""

    const crmSummary = crmUpdates.length > 0
      ? `\n📊 CRM updated: ${crmUpdates.map(u => `${u.contact}: ${u.from.replace(/_/g, " ")} → ${u.to.replace(/_/g, " ")}`).join(", ")}`
      : ""

    const followUp = analysis.follow_up_needed
      ? `\n\n💡 **Follow-up needed:** ${analysis.follow_up_suggestion || "Review action items"}`
      : ""

    await sendAIMessage(user_id,
      `🎙 **Meeting processed: "${meeting_title}"**\n\n${analysis.summary || "No summary available"}${taskSummary}${decisionSummary}${crmSummary}${followUp}\n\n_${Math.round((recording.duration_seconds || 0) / 60)} min · ${analysis.sentiment} · ${(analysis.topics || []).join(", ")}_`
    )

    console.log(`[meetingBot] ✅ Processing complete for "${meeting_title}"`)

    return {
      success: true,
      summary: analysis.summary,
      tasks_created: createdTasks,
      notes_created: createdNotes,
      crm_updates: crmUpdates,
    }

  } catch (error: any) {
    console.error(`[meetingBot] FATAL for recording ${recordingId}:`, error)
    await markFailed(recordingId, error.message)
    return { success: false, error: error.message }
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

async function matchParticipantsToCRM(
  userId: string,
  participantEmails: string[]
): Promise<Array<{
  id: string
  full_name: string
  email: string
  relationship_type: string
  pipeline_stage: string
}>> {
  if (!participantEmails || participantEmails.length === 0) return []

  // Query relationships that match any participant email
  // The relationships table stores email in various fields, check full_name as fallback
  const { data: contacts } = await supabaseAdmin
    .from("relationships")
    .select("id, full_name, email, relationship_type, pipeline_stage")
    .eq("user_id", userId)
    .in("email", participantEmails)

  return contacts || []
}

async function markFailed(recordingId: string, error: string) {
  await supabaseAdmin
    .from("meeting_recordings_raw")
    .update({
      processing_status: "failed",
      processing_error: error,
    })
    .eq("id", recordingId)
}
