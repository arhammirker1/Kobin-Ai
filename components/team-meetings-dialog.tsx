"use client"

import { MeetingFormDialog } from "@/components/meeting-form-dialog"

interface TeamMember {
  id: string
  user_id: string
  profile?: { full_name: string; email: string }
  can_view_calendar: boolean
}

interface TeamMeetingsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onMeetingCreated?: () => void
  teamMembers: TeamMember[]
}

export function TeamMeetingsDialog({ open, onOpenChange, onMeetingCreated }: TeamMeetingsDialogProps) {
  return (
    <MeetingFormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Schedule Team Meeting"
      initial={{ type: "internal" }}
      showInternalParticipants={true}
      onSaved={() => onMeetingCreated?.()}
    />
  )
}