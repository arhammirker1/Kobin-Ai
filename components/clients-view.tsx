"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input, Textarea } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Search, Plus, Video, CalendarIcon, Mail, Phone, Edit, Trash2, User } from "lucide-react"
import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import { toast } from "sonner"
import { format, parseISO } from "date-fns"

type Client = {
  id: string
  name: string
  email: string | null
  phone: string | null
  company: string | null
  role: string | null
  project_id: string | null
  status: "active" | "inactive" | "archived"
  notes: string | null
  tags: string[]
  created_at: string
  updated_at: string
}

type Project = {
  id: string
  name: string
  status: string
}

type CalendarEvent = {
  id: string
  title: string
  start_time: string
  end_time: string
  meeting_link: string | null
  purpose: string | null
}

export function ClientsView({ permissions }: { permissions?: { can_create_projects?: boolean; founder_id?: string } }) {
  const [clients, setClients] = useState<Client[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState("")
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false)
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false)
  const [isMeetingDialogOpen, setIsMeetingDialogOpen] = useState(false)
  const [selectedClient, setSelectedClient] = useState<Client | null>(null)
  const [upcomingMeetings, setUpcomingMeetings] = useState<Record<string, CalendarEvent | null>>({})

  const [newClient, setNewClient] = useState<Partial<Client>>({
    name: "",
    email: "",
    phone: "",
    company: "",
    role: "",
    project_id: null,
    status: "active",
    notes: "",
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
    fetchClients()
    fetchProjects()
  }, [])

  const fetchClients = async () => {
    setIsLoading(true)
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return

    const { data, error } = await supabase
      .from("clients")
      .select("*")
      .neq("status", "archived")
      .order("created_at", { ascending: false })

    if (error) {
      console.error("[v0] Error fetching clients:", error)
      toast.error("Failed to load clients")
    } else {
      setClients(data || [])
      data?.forEach((client) => fetchNextMeeting(client.id))
    }
    setIsLoading(false)
  }

  const fetchProjects = async () => {
    const { data, error } = await supabase
      .from("projects")
      .select("id, name, status")
      .in("status", ["active", "on-hold"])
      .order("name")

    if (!error && data) {
      setProjects(data)
    }
  }

  const fetchNextMeeting = async (clientId: string) => {
    const { data, error } = await supabase
      .from("events")
      .select("id, title, start_time, end_time, meeting_link, purpose")
      .eq("client_id", clientId)
      .gte("start_time", new Date().toISOString())
      .order("start_time", { ascending: true })
      .limit(1)
      .single()

    if (!error && data) {
      setUpcomingMeetings((prev) => ({ ...prev, [clientId]: data }))
    }
  }

  const handleAddClient = async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return

    if (!newClient.name) {
      toast.error("Name is required")
      return
    }

    // Get founder_id
    const founderId = permissions?.founder_id || user.id

    const { error } = await supabase.from("clients").insert({
      founder_id: founderId,
      created_by: user.id,
      name: newClient.name,
      email: newClient.email || null,
      phone: newClient.phone || null,
      company: newClient.company || null,
      role: newClient.role || null,
      project_id: newClient.project_id || null,
      status: "active",
      notes: newClient.notes || null,
      tags: newClient.tags || [],
    })

    if (error) {
      console.error("[v0] Error adding client:", error)
      toast.error("Failed to add client")
    } else {
      toast.success("Client added")
      setIsAddDialogOpen(false)
      setNewClient({
        name: "",
        email: "",
        phone: "",
        company: "",
        role: "",
        project_id: null,
        status: "active",
        notes: "",
        tags: [],
      })
      fetchClients()
    }
  }

  const handleUpdateClient = async () => {
    if (!selectedClient) return

    const { error } = await supabase
      .from("clients")
      .update({
        name: selectedClient.name,
        email: selectedClient.email,
        phone: selectedClient.phone,
        company: selectedClient.company,
        role: selectedClient.role,
        project_id: selectedClient.project_id,
        notes: selectedClient.notes,
        tags: selectedClient.tags,
      })
      .eq("id", selectedClient.id)

    if (error) {
      console.error("[v0] Error updating client:", error)
      toast.error("Failed to update client")
    } else {
      toast.success("Client updated")
      setIsEditDialogOpen(false)
      fetchClients()
    }
  }

  const handleDeleteClient = async (id: string) => {
    const { error } = await supabase.from("clients").delete().eq("id", id)

    if (error) {
      console.error("[v0] Error deleting client:", error)
      toast.error("Failed to delete client")
    } else {
      toast.success("Client deleted")
      fetchClients()
    }
  }

  const handleScheduleMeeting = async () => {
    if (!selectedClient) {
      toast.error("Please select a client")
      return
    }

    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return

    const start = parseISO(`${newMeeting.date}T${newMeeting.startTime}`)
    const end = parseISO(`${newMeeting.date}T${newMeeting.endTime}`)

    const { error } = await supabase.from("events").insert({
      user_id: user.id,
      title: newMeeting.title,
      start_time: start.toISOString(),
      end_time: end.toISOString(),
      type: "deal",
      client_id: selectedClient.id,
      meeting_link: newMeeting.meetingLink || "",
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
      fetchNextMeeting(selectedClient.id)
    }
  }

  const filteredClients = clients.filter((c) => {
    const matchesSearch =
      c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.company?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.email?.toLowerCase().includes(searchQuery.toLowerCase())
    return matchesSearch
  })

  const getProjectName = (projectId: string | null) => {
    if (!projectId) return null
    const project = projects.find((p) => p.id === projectId)
    return project?.name || null
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-3xl font-bold tracking-tight">Clients</h1>
          <p className="text-muted-foreground text-sm">
            Manage your clients, schedule meetings, and link them to projects.
          </p>
        </div>
        <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2 shadow-sm font-bold">
              <Plus size={18} />
              <span className="hidden md:inline">New Client</span>
              <span className="md:hidden">New</span>
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Add New Client</DialogTitle>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="name">Full Name *</Label>
                <Input
                  id="name"
                  value={newClient.name}
                  onChange={(e) => setNewClient({ ...newClient, name: e.target.value })}
                  placeholder="John Doe"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={newClient.email || ""}
                  onChange={(e) => setNewClient({ ...newClient, email: e.target.value })}
                  placeholder="john@example.com"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="phone">Phone</Label>
                <Input
                  id="phone"
                  value={newClient.phone || ""}
                  onChange={(e) => setNewClient({ ...newClient, phone: e.target.value })}
                  placeholder="+1 (555) 000-0000"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="company">Company</Label>
                  <Input
                    id="company"
                    value={newClient.company || ""}
                    onChange={(e) => setNewClient({ ...newClient, company: e.target.value })}
                    placeholder="Acme Inc"
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="role">Role</Label>
                  <Input
                    id="role"
                    value={newClient.role || ""}
                    onChange={(e) => setNewClient({ ...newClient, role: e.target.value })}
                    placeholder="CEO"
                  />
                </div>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="project">Link to Project (Optional)</Label>
                <Select
                  value={newClient.project_id || "none"}
                  onValueChange={(v) => setNewClient({ ...newClient, project_id: v === "none" ? null : v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select a project" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    {projects.map((project) => (
                      <SelectItem key={project.id} value={project.id}>
                        {project.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="notes">Notes</Label>
                <Textarea
                  id="notes"
                  value={newClient.notes || ""}
                  onChange={(e) => setNewClient({ ...newClient, notes: e.target.value })}
                  placeholder="Additional information about the client..."
                  rows={3}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="tags">Tags</Label>
                <Input
                  id="tags"
                  value={newClient.tags?.join(", ") || ""}
                  onChange={(e) =>
                    setNewClient({
                      ...newClient,
                      tags: e.target.value
                        .split(",")
                        .map((t) => t.trim())
                        .filter(Boolean),
                    })
                  }
                  placeholder="vip, priority, new"
                />
                <p className="text-xs text-muted-foreground">Comma-separated tags</p>
              </div>
            </div>
            <DialogFooter>
              <Button onClick={handleAddClient}>Add Client</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
        <div className="relative flex-1 md:w-64">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search clients..."
            className="pl-9 bg-white border-muted shadow-none h-10"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
        </div>
      ) : filteredClients.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <User className="h-12 w-12 text-muted-foreground/50 mb-4" />
            <p className="text-muted-foreground">No clients found</p>
            <p className="text-sm text-muted-foreground">Add your first client to get started</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredClients.map((client) => {
            const nextMeeting = upcomingMeetings[client.id]
            const hasUpcomingMeeting = nextMeeting && new Date(nextMeeting.start_time) > new Date()
            const projectName = getProjectName(client.project_id)

            return (
              <Card key={client.id} className="hover:shadow-md transition-all">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <CardTitle className="text-base truncate">{client.name}</CardTitle>
                      {client.company && <p className="text-sm text-muted-foreground truncate">{client.company}</p>}
                      {client.role && <p className="text-xs text-muted-foreground mt-1">{client.role}</p>}
                    </div>
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => {
                          setSelectedClient(client)
                          setIsEditDialogOpen(true)
                        }}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive"
                        onClick={() => handleDeleteClient(client.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                  {projectName && (
                    <Badge variant="outline" className="mt-2 w-fit bg-primary/5 text-primary border-primary/20">
                      {projectName}
                    </Badge>
                  )}
                  {client.tags && client.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {client.tags.map((tag, idx) => (
                        <Badge key={idx} variant="secondary" className="text-[9px] h-5">
                          {tag}
                        </Badge>
                      ))}
                    </div>
                  )}
                </CardHeader>
                <CardContent className="space-y-3">
                  {(client.email || client.phone) && (
                    <div className="space-y-1">
                      {client.email && (
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <Mail className="h-3 w-3" />
                          <span className="truncate">{client.email}</span>
                        </div>
                      )}
                      {client.phone && (
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <Phone className="h-3 w-3" />
                          <span>{client.phone}</span>
                        </div>
                      )}
                    </div>
                  )}

                  {hasUpcomingMeeting && (
                    <div className="p-3 rounded-lg bg-primary/5 border border-primary/20">
                      <p className="text-xs font-semibold text-primary mb-1">Next Meeting</p>
                      <p className="text-xs font-medium truncate">{nextMeeting.title}</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {format(parseISO(nextMeeting.start_time), "MMM d, h:mm a")}
                      </p>
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

                  <Button
                    size="sm"
                    variant="outline"
                    className="w-full h-8 text-xs bg-transparent"
                    onClick={() => {
                      setSelectedClient(client)
                      setIsMeetingDialogOpen(true)
                    }}
                  >
                    <CalendarIcon className="h-3 w-3 mr-1" />
                    Schedule Meeting
                  </Button>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {/* Edit Client Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Client</DialogTitle>
          </DialogHeader>
          {selectedClient && (
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="edit-name">Full Name *</Label>
                <Input
                  id="edit-name"
                  value={selectedClient.name}
                  onChange={(e) => setSelectedClient({ ...selectedClient, name: e.target.value })}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="edit-email">Email</Label>
                <Input
                  id="edit-email"
                  type="email"
                  value={selectedClient.email || ""}
                  onChange={(e) => setSelectedClient({ ...selectedClient, email: e.target.value })}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="edit-phone">Phone</Label>
                <Input
                  id="edit-phone"
                  value={selectedClient.phone || ""}
                  onChange={(e) => setSelectedClient({ ...selectedClient, phone: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="edit-company">Company</Label>
                  <Input
                    id="edit-company"
                    value={selectedClient.company || ""}
                    onChange={(e) => setSelectedClient({ ...selectedClient, company: e.target.value })}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="edit-role">Role</Label>
                  <Input
                    id="edit-role"
                    value={selectedClient.role || ""}
                    onChange={(e) => setSelectedClient({ ...selectedClient, role: e.target.value })}
                  />
                </div>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="edit-project">Link to Project</Label>
                <Select
                  value={selectedClient.project_id || "none"}
                  onValueChange={(v) => setSelectedClient({ ...selectedClient, project_id: v === "none" ? null : v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select a project" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    {projects.map((project) => (
                      <SelectItem key={project.id} value={project.id}>
                        {project.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="edit-notes">Notes</Label>
                <Textarea
                  id="edit-notes"
                  value={selectedClient.notes || ""}
                  onChange={(e) => setSelectedClient({ ...selectedClient, notes: e.target.value })}
                  rows={3}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="edit-tags">Tags</Label>
                <Input
                  id="edit-tags"
                  value={selectedClient.tags?.join(", ") || ""}
                  onChange={(e) =>
                    setSelectedClient({
                      ...selectedClient,
                      tags: e.target.value
                        .split(",")
                        .map((t) => t.trim())
                        .filter(Boolean),
                    })
                  }
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button onClick={handleUpdateClient}>Save Changes</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Schedule Meeting Dialog */}
      <Dialog open={isMeetingDialogOpen} onOpenChange={setIsMeetingDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Schedule Meeting with {selectedClient?.name}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="meeting-title">Meeting Title *</Label>
              <Input
                id="meeting-title"
                value={newMeeting.title}
                onChange={(e) => setNewMeeting({ ...newMeeting, title: e.target.value })}
                placeholder="Client Discovery Call"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="meeting-date">Date *</Label>
              <Input
                id="meeting-date"
                type="date"
                value={newMeeting.date}
                onChange={(e) => setNewMeeting({ ...newMeeting, date: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="start-time">Start Time</Label>
                <Input
                  id="start-time"
                  type="time"
                  value={newMeeting.startTime}
                  onChange={(e) => setNewMeeting({ ...newMeeting, startTime: e.target.value })}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="end-time">End Time</Label>
                <Input
                  id="end-time"
                  type="time"
                  value={newMeeting.endTime}
                  onChange={(e) => setNewMeeting({ ...newMeeting, endTime: e.target.value })}
                />
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="meeting-link">Meeting Link</Label>
              <Input
                id="meeting-link"
                value={newMeeting.meetingLink}
                onChange={(e) => setNewMeeting({ ...newMeeting, meetingLink: e.target.value })}
                placeholder="https://meet.google.com/..."
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="purpose">Purpose</Label>
              <Textarea
                id="purpose"
                value={newMeeting.purpose}
                onChange={(e) => setNewMeeting({ ...newMeeting, purpose: e.target.value })}
                placeholder="Discuss project requirements..."
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button onClick={handleScheduleMeeting}>Schedule Meeting</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
