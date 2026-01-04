// Helper functions to safely fetch meetings with proper authorization checks
// This supplements RLS with additional application-level validation

import { createClient } from "@/lib/supabase/client"

export async function getTeamMeetingsForUser(userId: string) {
  const supabase = createClient()

  // Get meetings where user is founder
  const { data: founderMeetings, error: founderError } = await supabase
    .from("team_meetings")
    .select("*")
    .eq("founder_id", userId)

  if (founderError) throw founderError

  // Get meetings where user is assigned (individual)
  const { data: individualMeetings, error: individualError } = await supabase
    .from("team_meetings")
    .select("*")
    .eq("team_member_id", userId)
    .eq("meeting_type", "individual")

  if (individualError) throw individualError

  // Get joint meetings user is participating in
  const { data: participantMeetings, error: participantError } = await supabase
    .from("team_meeting_participants")
    .select("meeting_id")
    .eq("participant_id", userId)

  if (participantError) throw participantError

  const participantMeetingIds = participantMeetings.map((p) => p.meeting_id)

  let jointMeetings = []
  if (participantMeetingIds.length > 0) {
    const { data, error } = await supabase
      .from("team_meetings")
      .select("*")
      .in("id", participantMeetingIds)
      .eq("meeting_type", "joint")

    if (error) throw error
    jointMeetings = data || []
  }

  // Combine and deduplicate
  const allMeetings = [...founderMeetings, ...individualMeetings, ...jointMeetings]

  // Remove duplicates by ID
  const seen = new Set()
  return allMeetings.filter((meeting) => {
    if (seen.has(meeting.id)) return false
    seen.add(meeting.id)
    return true
  })
}

export async function createTeamMeeting(
  userId: string,
  data: {
    title: string
    description?: string
    start_time: string
    end_time: string
    meeting_type: "individual" | "joint"
    team_member_id?: string
    meeting_link?: string
  },
) {
  const supabase = createClient()

  // SECURITY: Verify user is founder (application-level check)
  const { data: profile } = await supabase.from("profiles").select("user_type").eq("id", userId).single()

  if (profile?.user_type !== "founder") {
    throw new Error("Only founders can create meetings")
  }

  // Create meeting
  const { data: meeting, error } = await supabase
    .from("team_meetings")
    .insert({
      founder_id: userId,
      ...data,
    })
    .select()
    .single()

  if (error) throw error
  return meeting
}

export async function addMeetingParticipants(meetingId: string, founderId: string, participantIds: string[]) {
  const supabase = createClient()

  // SECURITY: Verify the founder owns this meeting
  const { data: meeting, error: verifyError } = await supabase
    .from("team_meetings")
    .select("id")
    .eq("id", meetingId)
    .eq("founder_id", founderId)
    .single()

  if (verifyError || !meeting) {
    throw new Error("Unauthorized: You cannot modify this meeting")
  }

  // Add participants
  const { error } = await supabase.from("team_meeting_participants").insert(
    participantIds.map((participantId) => ({
      meeting_id: meetingId,
      participant_id: participantId,
    })),
  )

  if (error) throw error
}
