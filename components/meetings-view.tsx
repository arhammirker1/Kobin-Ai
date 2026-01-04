"use client"

import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Calendar, Clock, Users, Video, Edit2, Trash2, Plus, Zap } from "lucide-react"
import { format, parseISO, isPast, isFuture, isToday, addMinutes } from "date-fns"
import { useToast } from "@/hooks/use-toast"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { ScrollArea } from "@/components/ui/scroll-area"

interface Meeting {
  id: string
  title: string
  meeting_type: "scheduled" | "instant"
  start_time: string
  end_time: string | null
  meeting_link: string | null
  description: string | null
  status: "upcoming" | "ongoing" | "ended"
  created_by: string
  founder_id: string
  invited_members?: TeamMember[]
}

interface TeamMember {
  id: string
  user_id: string
  position: string
  profile: {
    full_name: string
    email: string
  }
}

interface MeetingsViewProps {
  userType?: "founder" | "team_member"
}

export function MeetingsView({ userType = "founder" }: MeetingsViewProps) {
  const [meetings, setMeetings] = useState<Meeting[]>([])
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([])
  const [loading, setLoading] = useState(true)
  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [selectedMeeting, setSelectedMeeting] = useState<Meeting | null>(null)
  const [meetingType, setMeetingType] = useState<"scheduled" | "instant">("scheduled")
  const { toast } = useToast()
  const supabase = createClient()

  const [formData, setFormData] = useState({
    title: "",
    meeting_type: "scheduled" as "scheduled" | "instant",
    date: format(new Date(), "yyyy-MM-dd"),
    start_time: format(new Date(), "HH:mm"),
    end_time: format(addMinutes(new Date(), 30), "HH:mm"),
    meeting_link: "",
    description: "",
    invited_users: [] as string[],
  })

  useEffect(() => {
    fetchMeetings()
    if (userType === "founder") {
      fetchTeamMembers()
    }
  }, [userType])

  const fetchMeetings = async () => {
    try {
      setLoading(true)
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) return

      // Fetch meetings
      const { data: meetingsData, error: meetingsError } = await supabase
        .from("meetings")
        .select("*")
        .order("start_time", { ascending: false })

      if (meetingsError) throw meetingsError

      // For each meeting, fetch invited members
      const meetingsWithInvites = await Promise.all(
        (meetingsData || []).map(async (meeting) => {
          const { data: invites } = await supabase
            .from("meeting_invites")
            .select(
              `
              user_id,
              profiles:user_id (
                id,
                full_name,
                email
              )
            `
            )
            .eq("meeting_id", meeting.id)

          const invited_members =
            invites?.map((invite: any) => ({
              user_id: invite.user_id,
              profile: {
                full_name: invite.profiles?.full_name || "Unknown",
                email: invite.profiles?.email || "",
              },
            })) || []

          return { ...meeting, invited_members }
        })
      )

      setMeetings(meetingsWithInvites)
    } catch (error) {
      console.error("[v0] Error fetching meetings:", error)
      toast({
        title: "Error",
        description: "Failed to load meetings",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  const fetchTeamMembers = async () => {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) return

      const { data, error } = await supabase
        .from("team_members")
        .select(
          `
          id,
          user_id,
          position,
          profile:profiles!team_members_user_id_profiles_fkey(full_name, email)
        `
        )
        .eq("founder_id", user.id)
        .eq("is_active", true)

      if (error) throw error
      setTeamMembers(data || [])
    } catch (error) {
      console.error("[v0] Error fetching team members:", error)
    }
  }

  const handleCreateMeeting = async () => {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) throw new Error("Not authenticated")

      // Prepare meeting data
      const startDateTime =
        formData.meeting_type === "instant"
          ? new Date().toISOString()
          : parseISO(`${formData.date}T${formData.start_time}`).toISOString()

      const endDateTime =
        formData.meeting_type === "instant"
          ? addMinutes(new Date(), 30).toISOString()
          : formData.end_time
            ? parseISO(`${formData.date}T${formData.end_time}`).toISOString()
            : null

      // Insert meeting
      const { data: meeting, error: meetingError } = await supabase
        .from("meetings")
        .insert({
          created_by: user.id,
          founder_id: user.id,
          title: formData.title,
          meeting_type: formData.meeting_type,
          start_time: startDateTime,
          end_time: endDateTime,
          meeting_link: formData.meeting_link || null,
          description: formData.description || null,
          status: "upcoming",
        })
        .select()
        .single()

      if (meetingError) throw meetingError

      // Insert invites
      if (formData.invited_users.length > 0) {
        const invites = formData.invited_users.map((userId) => ({
          meeting_id: meeting.id,
          user_id: userId,
        }))

        const { error: invitesError } = await supabase.from("meeting_invites").insert(invites)

        if (invitesError) throw invitesError
      }

      toast({
        title: "Success",
        description: `${formData.meeting_type === "instant" ? "Instant" : "Scheduled"} meeting created`,
      })

      // Reset form
      setFormData({
        title: "",
        meeting_type: "scheduled",
        date: format(new Date(), "yyyy-MM-dd"),
        start_time: format(new Date(), "HH:mm"),
        end_time: format(addMinutes(new Date(), 30), "HH:mm"),
        meeting_link: "",
        description: "",
        invited_users: [],
      })
      setCreateDialogOpen(false)
      fetchMeetings()
    } catch (error: any) {
      console.error("[v0] Error creating meeting:", error)
      toast({
        title: "Error",
        description: error.message || "Failed to create meeting",
        variant: "destructive",
      })
    }
  }

  const handleDeleteMeeting = async (meetingId: string) => {
    try {
      const { error } = await supabase.from("meetings").delete().eq("id", meetingId)

      if (error) throw error

      toast({
        title: "Success",
        description: "Meeting deleted successfully",
      })

      setDeleteDialogOpen(false)
      setSelectedMeeting(null)
      fetchMeetings()
    } catch (error: any) {
      console.error("[v0] Error deleting meeting:", error)
      toast({
        title: "Error",
        description: "Failed to delete meeting",
        variant: "destructive",
      })
    }
  }

  const openEditDialog = (meeting: Meeting) => {
    setSelectedMeeting(meeting)
    setEditDialogOpen(true)
  }

  const openDeleteDialog = (meeting: Meeting) => {
    setSelectedMeeting(meeting)
    setDeleteDialogOpen(true)
  }

  const upcomingMeetings = meetings.filter((m) => m.status === "upcoming" || m.status === "ongoing")
  const pastMeetings = meetings.filter((m) => m.status === "ended")

  const getMeetingStatus = (meeting: Meeting) => {
    if (meeting.status === "ended") return "ended"
    if (meeting.status === "ongoing") return "ongoing"
    return "upcoming"
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "ongoing":
        return <Badge className="bg-green-500/10 text-green-500 border-green-500/20">Ongoing</Badge>
      case "upcoming":
        return <Badge variant="outline">Upcoming</Badge>
      case "ended":
        return <Badge variant="secondary">Ended</Badge>
      default:
        return null
    }
  }

  const getInitials = (name: string) => {
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Meetings</h2>
          <p className="text-muted-foreground">Schedule and manage team meetings</p>
        </div>
        {userType === "founder" && (
          <div className="flex gap-2">
            <Dialog
              open={createDialogOpen}
              onOpenChange={(open) => {
                setCreateDialogOpen(open)
                if (!open) {
                  setMeetingType("scheduled")
                  setFormData({
                    title: "",
                    meeting_type: "scheduled",
                    date: format(new Date(), "yyyy-MM-dd"),
                    start_time: format(new Date(), "HH:mm"),
                    end_time: format(addMinutes(new Date(), 30), "HH:mm"),
                    meeting_link: "",
                    description: "",
                    invited_users: [],
                  })
                }
              }}
            >
              <DialogTrigger asChild>
                <Button
                  variant="outline"
                  onClick={() => {
                    setMeetingType("instant")
                    setFormData({ ...formData, meeting_type: "instant" })
                  }}
                >
                  <Zap className="mr-2 h-4 w-4" />
                  Instant Meeting
                </Button>
              </DialogTrigger>
              <DialogTrigger asChild>
                <Button
                  onClick={() => {
                    setMeetingType("scheduled")
                    setFormData({ ...formData, meeting_type: "scheduled" })
                  }}
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Schedule Meeting
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>
                    {formData.meeting_type === "instant" ? "Create Instant Meeting" : "Schedule Meeting"}
                  </DialogTitle>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label htmlFor="title">Meeting Title / Purpose</Label>
                    <Input
                      id="title"
                      placeholder="e.g., Sprint Review, Urgent Blocker Resolution"
                      value={formData.title}
                      onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                      required
                    />
                  </div>

                  {formData.meeting_type === "scheduled" && (
                    <>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label htmlFor="date">Date</Label>
                          <Input
                            id="date"
                            type="date"
                            value={formData.date}
                            onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                            required
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="start_time">Start Time</Label>
                          <Input
                            id="start_time"
                            type="time"
                            value={formData.start_time}
                            onChange={(e) => setFormData({ ...formData, start_time: e.target.value })}
                            required
                          />
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="end_time">End Time (Optional)</Label>
                        <Input
                          id="end_time"
                          type="time"
                          value={formData.end_time}
                          onChange={(e) => setFormData({ ...formData, end_time: e.target.value })}
                        />
                      </div>
                    </>
                  )}

                  {formData.meeting_type === "instant" && (
                    <div className="bg-primary/5 border border-primary/20 rounded-lg p-4">
                      <div className="flex items-center gap-2 text-sm">
                        <Zap className="h-4 w-4 text-primary" />
                        <span className="font-medium">Instant Meeting</span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        Starts immediately, ends in 30 minutes (editable after creation)
                      </p>
                    </div>
                  )}

                  <div className="space-y-2">
                    <Label htmlFor="meeting_link">Meeting Link</Label>
                    <Input
                      id="meeting_link"
                      placeholder="Zoom, Google Meet, or internal link"
                      value={formData.meeting_link}
                      onChange={(e) => setFormData({ ...formData, meeting_link: e.target.value })}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="description">Description / Agenda (Optional)</Label>
                    <Textarea
                      id="description"
                      placeholder="Meeting agenda or notes..."
                      value={formData.description}
                      onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                      rows={3}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Invite Team Members</Label>
                    <Select
                      value={formData.invited_users[0] || ""}
                      onValueChange={(value) => {
                        if (value && !formData.invited_users.includes(value)) {
                          setFormData({ ...formData, invited_users: [...formData.invited_users, value] })
                        }
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select team members to invite" />
                      </SelectTrigger>
                      <SelectContent>
                        {teamMembers.map((member) => (
                          <SelectItem key={member.user_id} value={member.user_id}>
                            {member.profile?.full_name || "Unknown"} - {member.position}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {formData.invited_users.length > 0 && (
                      <div className="flex flex-wrap gap-2 mt-2">
                        {formData.invited_users.map((userId) => {
                          const member = teamMembers.find((m) => m.user_id === userId)
                          return (
                            <Badge key={userId} variant="secondary" className="gap-1">
                              {member?.profile?.full_name || "Unknown"}
                              <button
                                type="button"
                                onClick={() =>
                                  setFormData({
                                    ...formData,
                                    invited_users: formData.invited_users.filter((id) => id !== userId),
                                  })
                                }
                                className="ml-1 hover:text-destructive"
                              >
                                ×
                              </button>
                            </Badge>
                          )
                        })}
                      </div>
                    )}
                    <p className="text-xs text-muted-foreground">Only invited members will see this meeting</p>
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button onClick={handleCreateMeeting} disabled={!formData.title || formData.invited_users.length === 0}>
                    Create Meeting
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="text-muted-foreground">Loading meetings...</div>
        </div>
      ) : (
        <div className="space-y-8">
          {/* Upcoming Meetings */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold">Upcoming & Ongoing</h3>
            {upcomingMeetings.length === 0 ? (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <Calendar className="h-12 w-12 text-muted-foreground mb-4" />
                  <p className="text-sm text-muted-foreground">No upcoming meetings</p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-4">
                {upcomingMeetings.map((meeting) => (
                  <Card key={meeting.id} className="hover:shadow-md transition-shadow">
                    <CardHeader>
                      <div className="flex items-start justify-between">
                        <div className="space-y-1 flex-1">
                          <div className="flex items-center gap-2">
                            <CardTitle className="text-xl">{meeting.title}</CardTitle>
                            {meeting.meeting_type === "instant" && (
                              <Badge className="bg-red-500/10 text-red-500 border-red-500/20">
                                <Zap className="h-3 w-3 mr-1" />
                                Instant
                              </Badge>
                            )}
                            {getStatusBadge(getMeetingStatus(meeting))}
                          </div>
                          <div className="flex items-center gap-4 text-sm text-muted-foreground">
                            <div className="flex items-center gap-1">
                              <Clock className="h-4 w-4" />
                              {format(parseISO(meeting.start_time), "MMM d, yyyy • h:mm a")}
                              {meeting.end_time && ` - ${format(parseISO(meeting.end_time), "h:mm a")}`}
                            </div>
                            {meeting.invited_members && meeting.invited_members.length > 0 && (
                              <div className="flex items-center gap-1">
                                <Users className="h-4 w-4" />
                                {meeting.invited_members.length} invited
                              </div>
                            )}
                          </div>
                        </div>
                        {userType === "founder" && (
                          <div className="flex gap-2">
                            <Button variant="ghost" size="sm" onClick={() => openEditDialog(meeting)}>
                              <Edit2 className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-destructive hover:bg-destructive/10"
                              onClick={() => openDeleteDialog(meeting)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        )}
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {meeting.description && (
                        <p className="text-sm text-muted-foreground">{meeting.description}</p>
                      )}
                      <div className="flex items-center justify-between">
                        {meeting.invited_members && meeting.invited_members.length > 0 && (
                          <div className="flex items-center gap-2">
                            <div className="flex -space-x-2">
                              {meeting.invited_members.slice(0, 3).map((member) => (
                                <Avatar key={member.user_id} className="border-2 border-background h-8 w-8">
                                  <AvatarFallback className="text-xs">
                                    {getInitials(member.profile?.full_name || "?")}
                                  </AvatarFallback>
                                </Avatar>
                              ))}
                              {meeting.invited_members.length > 3 && (
                                <Avatar className="border-2 border-background h-8 w-8">
                                  <AvatarFallback className="text-xs">+{meeting.invited_members.length - 3}</AvatarFallback>
                                </Avatar>
                              )}
                            </div>
                          </div>
                        )}
                        {meeting.meeting_link && (
                          <Button size="sm" asChild>
                            <a href={meeting.meeting_link} target="_blank" rel="noopener noreferrer">
                              <Video className="h-4 w-4 mr-2" />
                              Join Meeting
                            </a>
                          </Button>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>

          {/* Past Meetings */}
          {pastMeetings.length > 0 && (
            <div className="space-y-4">
              <h3 className="text-lg font-semibold">Past Meetings</h3>
              <div className="grid gap-4">
                {pastMeetings.map((meeting) => (
                  <Card key={meeting.id} className="opacity-60">
                    <CardHeader>
                      <div className="flex items-start justify-between">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <CardTitle className="text-lg">{meeting.title}</CardTitle>
                            {getStatusBadge("ended")}
                          </div>
                          <div className="flex items-center gap-1 text-sm text-muted-foreground">
                            <Clock className="h-4 w-4" />
                            {format(parseISO(meeting.start_time), "MMM d, yyyy • h:mm a")}
                          </div>
                        </div>
                      </div>
                    </CardHeader>
                  </Card>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Delete Dialog */}
      {selectedMeeting && (
        <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Meeting</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to delete "{selectedMeeting.title}"? This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => handleDeleteMeeting(selectedMeeting.id)}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </div>
  )
}
