"use client"

import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import { createTeamMeeting, addMeetingParticipants } from "@/lib/supabase/queries/meetings"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Checkbox } from "@/components/ui/checkbox"
import { useToast } from "@/hooks/use-toast"
import { format, parseISO } from "date-fns"

interface TeamMember {
  id: string
  user_id: string
  profile?: {
    full_name: string
    email: string
  }
  can_view_calendar: boolean
}

interface TeamMeetingsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onMeetingCreated?: () => void
  teamMembers: TeamMember[]
}

export function TeamMeetingsDialog({ open, onOpenChange, onMeetingCreated, teamMembers }: TeamMeetingsDialogProps) {
  const [meetingType, setMeetingType] = useState<"individual" | "joint">("individual")
  const [selectedMember, setSelectedMember] = useState<string>("")
  const [selectedParticipants, setSelectedParticipants] = useState<string[]>([])
  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")
  const [date, setDate] = useState(format(new Date(), "yyyy-MM-dd"))
  const [startTime, setStartTime] = useState("09:00")
  const [endTime, setEndTime] = useState("10:00")
  const [meetingLink, setMeetingLink] = useState("")
  const [loading, setLoading] = useState(false)
  const [inviteAll, setInviteAll] = useState(true)

  const supabase = createClient()
  const { toast } = useToast()

  const eligibleMembers = teamMembers.filter((member) => member.can_view_calendar)

  useEffect(() => {
    if (open) {
      setTitle("")
      setDescription("")
      setDate(format(new Date(), "yyyy-MM-dd"))
      setStartTime("09:00")
      setEndTime("10:00")
      setMeetingLink("")
      setSelectedMember("")
      setSelectedParticipants([])
      setMeetingType("individual")
      setInviteAll(true)
    }
  }, [open])

  const handleParticipantToggle = (memberId: string) => {
    setSelectedParticipants((prev) =>
      prev.includes(memberId) ? prev.filter((id) => id !== memberId) : [...prev, memberId],
    )
  }

  const handleInviteAllChange = (checked: boolean) => {
    setInviteAll(checked)
    if (checked) {
      setSelectedParticipants(eligibleMembers.map((m) => m.user_id))
    } else {
      setSelectedParticipants([])
    }
  }

  const handleCreateMeeting = async () => {
    if (!title.trim()) {
      toast.error("Please enter a meeting title")
      return
    }

    if (meetingType === "individual" && !selectedMember) {
      toast.error("Please select a team member")
      return
    }

    if (meetingType === "joint" && selectedParticipants.length === 0) {
      toast.error("Please select at least one participant")
      return
    }

    setLoading(true)

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) throw new Error("No user found")

      const start = parseISO(`${date}T${startTime}`)
      const end = parseISO(`${date}T${endTime}`)

      const meeting = await createTeamMeeting(user.id, {
        title,
        description,
        start_time: start.toISOString(),
        end_time: end.toISOString(),
        meeting_type: meetingType,
        team_member_id: meetingType === "individual" ? selectedMember : undefined,
        meeting_link: meetingLink || undefined,
      })

      // For joint meetings, add participants using helper function
      if (meetingType === "joint" && meeting.id) {
        await addMeetingParticipants(meeting.id, user.id, selectedParticipants)
      }

      // Create calendar events for participants
      const eventInserts = []
      if (meetingType === "individual" && selectedMember) {
        eventInserts.push(
          {
            user_id: user.id,
            title,
            description,
            start_time: start.toISOString(),
            end_time: end.toISOString(),
            type: "team_meeting",
            meeting_link: meetingLink || null,
          },
          {
            user_id: selectedMember,
            title,
            description,
            start_time: start.toISOString(),
            end_time: end.toISOString(),
            type: "team_meeting",
            meeting_link: meetingLink || null,
          },
        )
      } else if (meetingType === "joint") {
        eventInserts.push({
          user_id: user.id,
          title,
          description,
          start_time: start.toISOString(),
          end_time: end.toISOString(),
          type: "team_meeting",
          meeting_link: meetingLink || null,
        })

        selectedParticipants.forEach((participantId) => {
          eventInserts.push({
            user_id: participantId,
            title,
            description,
            start_time: start.toISOString(),
            end_time: end.toISOString(),
            type: "team_meeting",
            meeting_link: meetingLink || null,
          })
        })
      }

      if (eventInserts.length > 0) {
        const { error: eventError } = await supabase.from("events").insert(eventInserts)
        if (eventError) throw eventError
      }

      toast.success(`Meeting created for ${selectedParticipants.length + 1} participant(s)`)
      onOpenChange(false)
      onMeetingCreated?.()
    } catch (error: any) {
      console.error("[v0] Error creating meeting:", error)
      if (error.message.includes("infinite recursion")) {
        toast.error("Database policy error - please contact support")
      } else if (error.message.includes("Unauthorized")) {
        toast.error("You don't have permission to create meetings")
      } else {
        toast.error(error.message || "Failed to create meeting")
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Schedule Team Meeting</DialogTitle>
          <DialogDescription>Create a meeting with your team members who have calendar access</DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Meeting Type Selection */}
          <div className="space-y-3">
            <Label>Meeting Type</Label>
            <div className="flex gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  checked={meetingType === "individual"}
                  onChange={() => {
                    setMeetingType("individual")
                    setSelectedParticipants([])
                    setInviteAll(true)
                  }}
                  className="w-4 h-4"
                />
                <span className="text-sm">Individual Meeting</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  checked={meetingType === "joint"}
                  onChange={() => {
                    setMeetingType("joint")
                    setSelectedMember("")
                  }}
                  className="w-4 h-4"
                />
                <span className="text-sm">Joint Meeting (Multiple Members)</span>
              </label>
            </div>
          </div>

          {/* Team Member Selection */}
          {meetingType === "individual" && (
            <div className="space-y-3">
              <Label htmlFor="team-member-select">Select Team Member</Label>
              <select
                id="team-member-select"
                value={selectedMember}
                onChange={(e) => setSelectedMember(e.target.value)}
                className="w-full px-3 py-2 border border-input rounded-md bg-background text-sm"
              >
                <option value="">Choose a team member...</option>
                {eligibleMembers.map((member) => (
                  <option key={member.user_id} value={member.user_id}>
                    {member.profile?.full_name || "Unknown"} ({member.profile?.email})
                  </option>
                ))}
              </select>
              {eligibleMembers.length === 0 && (
                <p className="text-sm text-muted-foreground">No team members with calendar access available</p>
              )}
            </div>
          )}

          {/* Joint Meeting Participants */}
          {meetingType === "joint" && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>Invite Team Members</Label>
              </div>

              <div className="flex items-center gap-2 p-3 bg-muted rounded-md mb-3">
                <Checkbox id="invite-all" checked={inviteAll} onCheckedChange={handleInviteAllChange} />
                <label htmlFor="invite-all" className="text-sm font-medium cursor-pointer">
                  Invite All ({eligibleMembers.length})
                </label>
              </div>

              {!inviteAll && (
                <div className="space-y-2 max-h-48 overflow-y-auto border rounded-md p-3">
                  {eligibleMembers.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No team members with calendar access available</p>
                  ) : (
                    eligibleMembers.map((member) => (
                      <div key={member.user_id} className="flex items-center gap-2">
                        <Checkbox
                          id={`participant-${member.user_id}`}
                          checked={selectedParticipants.includes(member.user_id)}
                          onCheckedChange={() => handleParticipantToggle(member.user_id)}
                        />
                        <label htmlFor={`participant-${member.user_id}`} className="text-sm cursor-pointer flex-1">
                          {member.profile?.full_name || "Unknown"}{" "}
                          <span className="text-muted-foreground">({member.profile?.email})</span>
                        </label>
                      </div>
                    ))
                  )}
                </div>
              )}

              {inviteAll && eligibleMembers.length > 0 && (
                <div className="text-sm text-muted-foreground p-2">
                  {selectedParticipants.length} member(s) will be invited
                </div>
              )}
            </div>
          )}

          {/* Meeting Details */}
          <div className="space-y-3">
            <Label htmlFor="meeting-title">Meeting Title</Label>
            <Input
              id="meeting-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g., Team Sync, Project Review"
            />
          </div>

          <div className="space-y-3">
            <Label htmlFor="meeting-description">Description (Optional)</Label>
            <Textarea
              id="meeting-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Add notes about the meeting..."
              rows={3}
            />
          </div>

          {/* Date & Time */}
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-2">
              <Label htmlFor="meeting-date">Date</Label>
              <Input id="meeting-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="meeting-start">Start Time</Label>
              <Input id="meeting-start" type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="meeting-end">End Time</Label>
              <Input id="meeting-end" type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
            </div>
          </div>

          {/* Meeting Link */}
          <div className="space-y-3">
            <Label htmlFor="meeting-link">Meeting Link (Optional)</Label>
            <Input
              id="meeting-link"
              value={meetingLink}
              onChange={(e) => setMeetingLink(e.target.value)}
              placeholder="https://meet.google.com/..."
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleCreateMeeting} disabled={loading}>
            {loading ? "Creating..." : "Schedule Meeting"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
