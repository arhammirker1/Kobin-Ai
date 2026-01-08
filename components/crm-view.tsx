"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input, Textarea } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Search, Plus, Video, CalendarIcon, FileText, Linkedin } from "lucide-react"
import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import { toast } from "sonner"
import { format, parseISO } from "date-fns"
import { cn } from "@/lib/utils"

const RELATIONSHIP_TYPES = [
  { value: "lead", label: "Lead" },
  { value: "client", label: "Client" },
  { value: "investor", label: "Investor" },
  { value: "partner", label: "Partner" },
  { value: "talent", label: "Talent" },
]

type Relationship = {
  id: string
  full_name: string
  company: string | null
  role: string | null
  relationship_type: "lead" | "client" | "investor" | "partner" | "talent"
  linkedin_profile_url: string | null
  meeting_link: string | null
  status: "active" | "archived"
  tags: string[]
  created_at: string
  updated_at: string
}

type CalendarEvent = {
  id: string
  title: string
  start_time: string
  end_time: string
  meeting_link: string | null
  purpose: string | null
  outcome: string | null
}

export function CrmView() {
  const [relationships, setRelationships] = useState<Relationship[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedType, setSelectedType] = useState<string | null>(null)
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false)
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false)
  const [isMeetingDialogOpen, setIsMeetingDialogOpen] = useState(false)
  const [isOutcomeDialogOpen, setIsOutcomeDialogOpen] = useState(false)
  const [selectedRelationship, setSelectedRelationship] = useState<Relationship | null>(null)
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null)
  const [upcomingMeetings, setUpcomingMeetings] = useState<Record<string, CalendarEvent | null>>({})
  const [outcomeText, setOutcomeText] = useState("")

  const [newRelationship, setNewRelationship] = useState<Partial<Relationship>>({
    full_name: "",
    company: "",
    role: "",
    relationship_type: "lead",
    linkedin_profile_url: "",
    meeting_link: "",
    status: "active",
    tags: [],
  })

  const [newMeeting, setNewMeeting] = useState({
    title: "",
    date: format(new Date(), "yyyy-MM-dd"),
    startTime: "09:00",
    endTime: "10:00",
    meetingLink: "",
    purpose: "",
  })

  const supabase = createClient()

  useEffect(() => {
    fetchRelationships()
  }, [])

  const fetchRelationships = async () => {
    setIsLoading(true)
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return

    const { data, error } = await supabase
      .from("relationships")
      .select("*")
      .eq("user_id", user.id)
      .eq("status", "active")
      .order("created_at", { ascending: false })

    if (error) {
      console.error("[v0] Error fetching relationships:", error)
      toast.error("Failed to load relationships")
    } else {
      setRelationships(data || [])
      data?.forEach((rel) => fetchNextMeeting(rel.id))
    }
    setIsLoading(false)
  }

  const fetchNextMeeting = async (relationshipId: string) => {
    const { data, error } = await supabase
      .from("events")
      .select("id, title, start_time, end_time, meeting_link, purpose, outcome")
      .eq("relationship_id", relationshipId)
      .gte("start_time", new Date().toISOString())
      .order("start_time", { ascending: true })
      .limit(1)
      .single()

    if (!error && data) {
      setUpcomingMeetings((prev) => ({ ...prev, [relationshipId]: data }))
    }
  }

  const handleAddRelationship = async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return

    if (!newRelationship.full_name) {
      toast.error("Name is required")
      return
    }

    const { error } = await supabase.from("relationships").insert({
      user_id: user.id,
      full_name: newRelationship.full_name,
      company: newRelationship.company || null,
      role: newRelationship.role || null,
      relationship_type: newRelationship.relationship_type || "lead",
      linkedin_profile_url: newRelationship.linkedin_profile_url || null,
      meeting_link: newRelationship.meeting_link || null,
      status: "active",
      tags: newRelationship.tags || [],
    })

    if (error) {
      console.error("[v0] Error adding relationship:", error)
      toast.error("Failed to add relationship")
    } else {
      toast.success("Relationship added")
      setIsAddDialogOpen(false)
      setNewRelationship({
        full_name: "",
        company: "",
        role: "",
        relationship_type: "lead",
        linkedin_profile_url: "",
        meeting_link: "",
        status: "active",
        tags: [],
      })
      fetchRelationships()
    }
  }

  const handleUpdateRelationship = async () => {
    if (!selectedRelationship) return

    const { error } = await supabase
      .from("relationships")
      .update({
        full_name: selectedRelationship.full_name,
        company: selectedRelationship.company,
        role: selectedRelationship.role,
        relationship_type: selectedRelationship.relationship_type,
        linkedin_profile_url: selectedRelationship.linkedin_profile_url,
        meeting_link: selectedRelationship.meeting_link,
        tags: selectedRelationship.tags,
      })
      .eq("id", selectedRelationship.id)

    if (error) {
      console.error("[v0] Error updating relationship:", error)
      toast.error("Failed to update relationship")
    } else {
      toast.success("Relationship updated")
      setIsEditDialogOpen(false)
      fetchRelationships()
    }
  }

  const handleDeleteRelationship = async (id: string) => {
    const { error } = await supabase.from("relationships").delete().eq("id", id)

    if (error) {
      console.error("[v0] Error deleting relationship:", error)
      toast.error("Failed to delete relationship")
    } else {
      toast.success("Relationship deleted")
      fetchRelationships()
    }
  }

  const handleScheduleMeeting = async () => {
    if (!selectedRelationship) {
      toast.error("Please select a relationship")
      return
    }

    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return

    const { data: relationshipExists, error: checkError } = await supabase
      .from("relationships")
      .select("id")
      .eq("id", selectedRelationship.id)
      .eq("user_id", user.id)
      .single()

    if (checkError || !relationshipExists) {
      toast.error("Relationship not found. It may have been deleted.")
      setSelectedRelationship(null)
      return
    }

    const start = parseISO(`${newMeeting.date}T${newMeeting.startTime}`)
    const end = parseISO(`${newMeeting.date}T${newMeeting.endTime}`)

    const { error } = await supabase.from("events").insert({
      user_id: user.id,
      title: newMeeting.title,
      start_time: start.toISOString(),
      end_time: end.toISOString(),
      type: "deal",
      relationship_id: selectedRelationship.id,
      meeting_link: newMeeting.meetingLink || selectedRelationship.meeting_link || "",
      purpose: newMeeting.purpose,
    })

    if (error) {
      console.error("[v0] Error scheduling meeting:", error)
      toast.error("Failed to schedule meeting")
    } else {
      toast.success("Meeting scheduled")
      setIsMeetingDialogOpen(false)
      setNewMeeting({
        title: "",
        date: format(new Date(), "yyyy-MM-dd"),
        startTime: "09:00",
        endTime: "10:00",
        meetingLink: "",
        purpose: "",
      })
      fetchNextMeeting(selectedRelationship.id)
    }
  }

  const handleSaveOutcome = async () => {
    if (!selectedEvent) return

    const { error } = await supabase.from("events").update({ outcome: outcomeText }).eq("id", selectedEvent.id)

    if (error) {
      console.error("[v0] Error saving outcome:", error)
      toast.error("Failed to save outcome")
    } else {
      toast.success("Outcome saved")
      setIsOutcomeDialogOpen(false)
      setOutcomeText("")
      setSelectedEvent(null)
    }
  }

  const filteredRelationships = relationships.filter((r) => {
    const matchesSearch =
      r.full_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.company?.toLowerCase().includes(searchQuery.toLowerCase())
    const matchesType = !selectedType || r.relationship_type === selectedType
    return matchesSearch && matchesType
  })

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-3xl font-bold tracking-tight">Relationships</h1>
          <p className="text-muted-foreground text-sm">
            Manage leads, clients, and partners. Calendar is the source of truth.
          </p>
        </div>
        <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2 shadow-sm font-bold">
              <Plus size={18} />
              <span className="hidden md:inline">New Relationship</span>
              <span className="md:hidden">New</span>
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Add New Relationship</DialogTitle>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="name">Full Name *</Label>
                <Input
                  id="name"
                  value={newRelationship.full_name}
                  onChange={(e) => setNewRelationship({ ...newRelationship, full_name: e.target.value })}
                  placeholder="John Doe"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="company">Company</Label>
                  <Input
                    id="company"
                    value={newRelationship.company || ""}
                    onChange={(e) => setNewRelationship({ ...newRelationship, company: e.target.value })}
                    placeholder="Acme Inc"
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="role">Role</Label>
                  <Input
                    id="role"
                    value={newRelationship.role || ""}
                    onChange={(e) => setNewRelationship({ ...newRelationship, role: e.target.value })}
                    placeholder="CEO"
                  />
                </div>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="type">Relationship Type</Label>
                <Select
                  value={newRelationship.relationship_type}
                  onValueChange={(v: any) => setNewRelationship({ ...newRelationship, relationship_type: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {RELATIONSHIP_TYPES.map((type) => (
                      <SelectItem key={type.value} value={type.value}>
                        {type.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="linkedin">LinkedIn Profile (Optional)</Label>
                <Input
                  id="linkedin"
                  value={newRelationship.linkedin_profile_url || ""}
                  onChange={(e) => setNewRelationship({ ...newRelationship, linkedin_profile_url: e.target.value })}
                  placeholder="https://linkedin.com/in/..."
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="meeting">Default Meeting Link (Optional)</Label>
                <Input
                  id="meeting"
                  value={newRelationship.meeting_link || ""}
                  onChange={(e) => setNewRelationship({ ...newRelationship, meeting_link: e.target.value })}
                  placeholder="https://meet.google.com/..."
                />
                <p className="text-xs text-muted-foreground">Used as default for meetings with this person</p>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="tags">Tags</Label>
                <Input
                  id="tags"
                  value={newRelationship.tags?.join(", ") || ""}
                  onChange={(e) =>
                    setNewRelationship({
                      ...newRelationship,
                      tags: e.target.value
                        .split(",")
                        .map((t) => t.trim())
                        .filter(Boolean),
                    })
                  }
                  placeholder="follow-up, urgent, hot-lead"
                />
                <p className="text-xs text-muted-foreground">Comma-separated tags</p>
              </div>
            </div>
            <DialogFooter>
              <Button onClick={handleAddRelationship}>Add Relationship</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
        <div className="flex items-center gap-2 overflow-x-auto pb-2 md:pb-0 w-full md:w-auto no-scrollbar">
          {RELATIONSHIP_TYPES.map((type) => (
            <Badge
              key={type.value}
              variant={selectedType === type.value ? "default" : "outline"}
              className="px-4 py-1.5 rounded-full font-bold whitespace-nowrap cursor-pointer hover:bg-muted/50 capitalize"
              onClick={() => setSelectedType(selectedType === type.value ? null : type.value)}
            >
              {type.label}
            </Badge>
          ))}
        </div>
        <div className="relative flex-1 md:w-64">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search people..."
            className="pl-9 bg-white border-muted shadow-none h-10"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredRelationships.map((rel) => {
          const nextMeeting = upcomingMeetings[rel.id]
          const hasUpcomingMeeting = nextMeeting && new Date(nextMeeting.start_time) > new Date()
          const meetingPassed = nextMeeting && new Date(nextMeeting.start_time) < new Date()

          return (
            <Card key={rel.id} className="hover:shadow-md transition-all">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <CardTitle className="text-base truncate">{rel.full_name}</CardTitle>
                    {rel.company && <p className="text-sm text-muted-foreground truncate">{rel.company}</p>}
                  </div>
                  <Badge
                    variant="outline"
                    className={cn(
                      "text-[10px] uppercase font-bold shrink-0",
                      rel.relationship_type === "lead" && "bg-blue-50 text-blue-600 border-blue-200",
                      rel.relationship_type === "client" && "bg-emerald-50 text-emerald-600 border-emerald-200",
                      rel.relationship_type === "investor" && "bg-purple-50 text-purple-600 border-purple-200",
                      rel.relationship_type === "partner" && "bg-amber-50 text-amber-600 border-amber-200",
                      rel.relationship_type === "talent" && "bg-cyan-50 text-cyan-600 border-cyan-200",
                    )}
                  >
                    {rel.relationship_type}
                  </Badge>
                </div>
                {rel.role && <p className="text-xs text-muted-foreground mt-1">{rel.role}</p>}
                {rel.tags && rel.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {rel.tags.map((tag, idx) => (
                      <Badge key={idx} variant="secondary" className="text-[9px] h-5">
                        {tag}
                      </Badge>
                    ))}
                  </div>
                )}
              </CardHeader>
              <CardContent className="space-y-3">
                {hasUpcomingMeeting && (
                  <div className="p-3 rounded-lg bg-primary/5 border border-primary/20">
                    <p className="text-xs font-semibold text-primary mb-1">Next Meeting</p>
                    <p className="text-xs font-medium truncate">{nextMeeting.title}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {format(parseISO(nextMeeting.start_time), "MMM d, h:mm a")}
                    </p>
                    {nextMeeting.purpose && (
                      <p className="text-xs text-muted-foreground mt-1 line-clamp-2">Purpose: {nextMeeting.purpose}</p>
                    )}
                    {nextMeeting.meeting_link && (
                      <Button
                        size="sm"
                        className="w-full mt-2 h-8 text-xs"
                        onClick={() => window.open(nextMeeting.meeting_link!, "_blank")}
                      >
                        <Video className="h-3 w-3 mr-1" />
                        Join Meeting
                      </Button>
                    )}
                  </div>
                )}
                {meetingPassed && !nextMeeting.outcome && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="w-full h-8 text-xs bg-transparent"
                    onClick={() => {
                      setSelectedEvent(nextMeeting)
                      setOutcomeText(nextMeeting.outcome || "")
                      setIsOutcomeDialogOpen(true)
                    }}
                  >
                    <FileText className="h-3 w-3 mr-1 shrink-0" />
                    <span className="truncate">Add Meeting Outcome</span>
                  </Button>
                )}
                <div className="flex flex-wrap gap-2">
                  {rel.linkedin_profile_url && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="flex-1 min-w-0 h-8 text-xs bg-transparent"
                      onClick={() => window.open(rel.linkedin_profile_url!, "_blank")}
                    >
                      <Linkedin className="h-3 w-3 mr-1 shrink-0" />
                      <span className="truncate">LinkedIn</span>
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    className="flex-1 min-w-0 h-8 text-xs bg-transparent"
                    onClick={() => {
                      setSelectedRelationship(rel)
                      setNewMeeting({
                        title: `Meeting with ${rel.full_name}`,
                        date: format(new Date(), "yyyy-MM-dd"),
                        startTime: "09:00",
                        endTime: "10:00",
                        meetingLink: "",
                        purpose: "",
                      })
                      setIsMeetingDialogOpen(true)
                    }}
                  >
                    <CalendarIcon className="h-3 w-3 mr-1 shrink-0" />
                    <span className="truncate">Schedule</span>
                  </Button>
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="ghost"
                    className="flex-1 h-8 text-xs"
                    onClick={() => {
                      setSelectedRelationship(rel)
                      setIsEditDialogOpen(true)
                    }}
                  >
                    Edit
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="flex-1 h-8 text-xs text-destructive hover:text-destructive"
                    onClick={() => handleDeleteRelationship(rel.id)}
                  >
                    Delete
                  </Button>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Relationship</DialogTitle>
          </DialogHeader>
          {selectedRelationship && (
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="edit-name">Full Name</Label>
                <Input
                  id="edit-name"
                  value={selectedRelationship.full_name}
                  onChange={(e) => setSelectedRelationship({ ...selectedRelationship, full_name: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="edit-company">Company</Label>
                  <Input
                    id="edit-company"
                    value={selectedRelationship.company || ""}
                    onChange={(e) => setSelectedRelationship({ ...selectedRelationship, company: e.target.value })}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="edit-role">Role</Label>
                  <Input
                    id="edit-role"
                    value={selectedRelationship.role || ""}
                    onChange={(e) => setSelectedRelationship({ ...selectedRelationship, role: e.target.value })}
                  />
                </div>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="edit-type">Relationship Type</Label>
                <Select
                  value={selectedRelationship.relationship_type}
                  onValueChange={(v: any) => setSelectedRelationship({ ...selectedRelationship, relationship_type: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {RELATIONSHIP_TYPES.map((type) => (
                      <SelectItem key={type.value} value={type.value}>
                        {type.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="edit-linkedin">LinkedIn Profile (Optional)</Label>
                <Input
                  id="edit-linkedin"
                  value={selectedRelationship.linkedin_profile_url || ""}
                  onChange={(e) =>
                    setSelectedRelationship({ ...selectedRelationship, linkedin_profile_url: e.target.value })
                  }
                  placeholder="https://linkedin.com/in/..."
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="edit-meeting">Default Meeting Link (Optional)</Label>
                <Input
                  id="edit-meeting"
                  value={selectedRelationship.meeting_link || ""}
                  onChange={(e) => setSelectedRelationship({ ...selectedRelationship, meeting_link: e.target.value })}
                  placeholder="https://meet.google.com/..."
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="edit-tags">Tags</Label>
                <Input
                  id="edit-tags"
                  value={selectedRelationship.tags?.join(", ") || ""}
                  onChange={(e) =>
                    setSelectedRelationship({
                      ...selectedRelationship,
                      tags: e.target.value
                        .split(",")
                        .map((t) => t.trim())
                        .filter(Boolean),
                    })
                  }
                  placeholder="follow-up, urgent, hot-lead"
                />
                <p className="text-xs text-muted-foreground">Comma-separated tags</p>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button onClick={handleUpdateRelationship}>Save Changes</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isMeetingDialogOpen} onOpenChange={setIsMeetingDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Schedule Meeting</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="meeting-title">Meeting Title</Label>
              <Input
                id="meeting-title"
                value={newMeeting.title}
                onChange={(e) => setNewMeeting({ ...newMeeting, title: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="meeting-date">Date</Label>
                <Input
                  id="meeting-date"
                  type="date"
                  value={newMeeting.date}
                  onChange={(e) => setNewMeeting({ ...newMeeting, date: e.target.value })}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="meeting-start">Start Time</Label>
                <Input
                  id="meeting-start"
                  type="time"
                  value={newMeeting.startTime}
                  onChange={(e) => setNewMeeting({ ...newMeeting, startTime: e.target.value })}
                />
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="meeting-end">End Time</Label>
              <Input
                id="meeting-end"
                type="time"
                value={newMeeting.endTime}
                onChange={(e) => setNewMeeting({ ...newMeeting, endTime: e.target.value })}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="meeting-purpose">Purpose</Label>
              <Textarea
                id="meeting-purpose"
                value={newMeeting.purpose}
                onChange={(e) => setNewMeeting({ ...newMeeting, purpose: e.target.value })}
                placeholder="What's the goal of this meeting?"
                rows={3}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="meeting-link">Meeting Link (Optional)</Label>
              <Input
                id="meeting-link"
                value={newMeeting.meetingLink}
                onChange={(e) => setNewMeeting({ ...newMeeting, meetingLink: e.target.value })}
                placeholder="https://meet.google.com/..."
              />
              <p className="text-xs text-muted-foreground">Overrides default meeting link</p>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={handleScheduleMeeting}>Schedule Meeting</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isOutcomeDialogOpen} onOpenChange={setIsOutcomeDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Meeting Outcome</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="outcome">What was the result of this meeting?</Label>
              <Textarea
                id="outcome"
                value={outcomeText}
                onChange={(e) => setOutcomeText(e.target.value)}
                placeholder="Key takeaways, next steps, decisions made..."
                rows={6}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsOutcomeDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveOutcome}>Save Outcome</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
