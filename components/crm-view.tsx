"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input, Textarea } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Search, Plus, Video, CalendarIcon, FileText, Linkedin, LayoutList, Kanban, Upload, ChevronLeft, ChevronRight, History, Mail, Loader2, Brain } from "lucide-react"
import { LeadsImportDialog } from "@/components/leads-import-dialog"
import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import { toast } from "sonner"
import { format, parseISO } from "date-fns"
import { cn } from "@/lib/utils"
import { PipelineView, STAGES, type PipelineContact, type PipelineStage } from "@/components/pipeline-view"



// Simple guards to prevent concurrent operations — no caching, DB is source of truth
let _syncInProgress = false


const RELATIONSHIP_TYPES = [
  { value: "lead", label: "Lead" },
  { value: "investor", label: "Investor" },
  { value: "partner", label: "Partner" },
  { value: "talent", label: "Talent" },
]

type Relationship = {
  id: string
  full_name: string
  email: string | null
  company: string | null
  role: string | null
  relationship_type: "lead" | "investor" | "partner" | "talent"
  linkedin_profile_url: string | null
  meeting_link: string | null
  status: "active" | "archived"
  tags: string[]
  pipeline_stage: PipelineStage
  deal_value: number | null
  close_probability: number | null
  stage_entered_at: string | null
  expected_close_date: string | null
  pipeline_notes: string | null
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

type ViewMode = "list" | "pipeline"

type ImportHistoryItem = {
  id: string
  file_name: string
  rows_imported: number
  rows_skipped: number
  created_at: string
}

const ITEMS_PER_PAGE = 12

export function CrmView() {
  const [relationships, setRelationships] = useState<Relationship[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedType, setSelectedType] = useState<string | null>(null)
  const [viewMode, setViewMode] = useState<ViewMode>("pipeline")
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false)
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false)
  const [isMeetingDialogOpen, setIsMeetingDialogOpen] = useState(false)
  const [isOutcomeDialogOpen, setIsOutcomeDialogOpen] = useState(false)
  const [isImportDialogOpen, setIsImportDialogOpen] = useState(false)
  const [selectedRelationship, setSelectedRelationship] = useState<Relationship | null>(null)
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null)
  const [upcomingMeetings, setUpcomingMeetings] = useState<Record<string, CalendarEvent | null>>({})
  const [outcomeText, setOutcomeText] = useState("")
  const [currentPage, setCurrentPage] = useState(1)
  const [importHistory, setImportHistory] = useState<ImportHistoryItem[]>([])
  const [gmailConnected, setGmailConnected] = useState(false)
  const [syncingEmail, setSyncingEmail] = useState(false)
  const [emailInsights, setEmailInsights] = useState<Array<{
    relationship_id: string
    contact_name: string
    thread_id: string
    subject: string
    intent: string
    sentiment: string
    summary: string
    signals: string[]
    analyzed_at: string
  }>>([])

  const [newRelationship, setNewRelationship] = useState<Partial<Relationship>>({
    full_name: "",
    email: "",
    company: "",
    role: "",
    relationship_type: "lead",
    linkedin_profile_url: "",
    meeting_link: "",
    status: "active",
    tags: [],
    pipeline_stage: "new_lead",
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
    fetchImportHistory()
    checkGmailAndSync()
  }, [])

  const checkGmailAndSync = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data: integration } = await supabase
        .from("google_integrations")
        .select("is_connected")
        .eq("user_id", user.id)
        .single()
      const connected = integration?.is_connected === true
      setGmailConnected(connected)

      if (connected) {
        // Always load fresh from DB on mount
        await loadEmailInsights()
      }
    } catch { /* non-fatal */ }
  }

  // Re-load insights when tab regains focus (lightweight DB read, not full Gmail sync)
  useEffect(() => {
    const onFocus = () => {
      if (gmailConnected) loadEmailInsights()
    }
    window.addEventListener("focus", onFocus)
    return () => window.removeEventListener("focus", onFocus)
  }, [gmailConnected])

  const syncEmailsForCRM = async () => {
    if (_syncInProgress) return
    _syncInProgress = true
    setSyncingEmail(true)
    try {
      await fetch("/api/gmail/sync-crm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      })
      // Reload fresh insights from DB after sync
      await loadEmailInsights()
    } catch { /* non-fatal */ } finally {
      setSyncingEmail(false)
      _syncInProgress = false
    }
  }

  const loadEmailInsights = async () => {
    // Always load fresh from DB — no caching, DB is the persistent store
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      // Only show analyses from the last 7 days — old stale ones should fade away
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
      console.log(`[loadEmailInsights] Loading analyses since ${sevenDaysAgo}`)

      const { data, error } = await supabase
        .from("email_analyses")
        .select("gmail_thread_id, contact_id, intent, sentiment, signals, reasoning, thread_subject, analyzed_at, relationships!inner(full_name)")
        .eq("user_id", user.id)
        .gte("analyzed_at", sevenDaysAgo)
        .order("analyzed_at", { ascending: false })
        .limit(20)

      console.log(`[loadEmailInsights] Query returned ${data?.length ?? 0} rows, error:`, error)

      if (data) {
        // Group by contact — show the most recent analysis per contact
        const seen = new Map<string, any>()
        for (const row of data) {
          const existing = seen.get(row.contact_id)
          if (!existing) {
            seen.set(row.contact_id, row)
          } else if (row.intent !== "neutral" && existing.intent === "neutral") {
            // Prefer non-neutral intents
            seen.set(row.contact_id, row)
          }
        }
        const insights = Array.from(seen.values()).map((row: any) => ({
          relationship_id: row.contact_id,
          contact_name: row.relationships?.full_name ?? "Unknown",
          thread_id: row.gmail_thread_id ?? "",
          subject: row.thread_subject || "(no subject)",
          intent: row.intent ?? "neutral",
          sentiment: row.sentiment ?? "neutral",
          summary: row.reasoning || "",
          signals: Array.isArray(row.signals) ? row.signals : [],
          analyzed_at: row.analyzed_at ?? new Date().toISOString(),
        }))
        console.log(`[loadEmailInsights] ${insights.length} unique contacts with insights:`, insights.map(i => `${i.contact_name} (${i.intent}, ${i.analyzed_at})`))
        setEmailInsights(insights)
      }
    } catch (err) {
      console.error(`[loadEmailInsights] Error:`, err)
    }
  }

  // Reset page when filters change
  useEffect(() => {
    setCurrentPage(1)
  }, [searchQuery, selectedType])

  const fetchRelationships = async () => {
    setIsLoading(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      // Run both queries in parallel — relationships + all upcoming meetings in one shot
      const [relResult, eventsResult] = await Promise.all([
        supabase
          .from("relationships")
          .select("*")
          .eq("user_id", user.id)
          .eq("status", "active")
          .order("updated_at", { ascending: false }),

        supabase
          .from("events")
          .select("id, title, start_time, end_time, meeting_link, purpose, outcome, relationship_id")
          .eq("user_id", user.id)
          .gte("start_time", new Date().toISOString())
          .not("relationship_id", "is", null)
          .order("start_time", { ascending: true }),
      ])

      if (relResult.error) {
        console.error("[v0] Error fetching relationships:", relResult.error)
        toast.error("Failed to load relationships")
        return
      }

      setRelationships(relResult.data || [])

      // Build lookup map: relationship_id → earliest upcoming event
      // One pass through the events array — already sorted asc so first match wins
      if (!eventsResult.error && eventsResult.data) {
        const meetingMap: Record<string, CalendarEvent> = {}
        for (const event of eventsResult.data) {
          if (event.relationship_id && !meetingMap[event.relationship_id]) {
            meetingMap[event.relationship_id] = event
          }
        }
        setUpcomingMeetings(meetingMap)
      }
    } finally {
      setIsLoading(false)
    }
  }

  // Refresh a single contact's next meeting after scheduling (targeted, not full reload)
  const fetchNextMeeting = async (relationshipId: string) => {
    const { data, error } = await supabase
      .from("events")
      .select("id, title, start_time, end_time, meeting_link, purpose, outcome")
      .eq("relationship_id", relationshipId)
      .gte("start_time", new Date().toISOString())
      .order("start_time", { ascending: true })
      .limit(1)
      .maybeSingle()

    if (!error) {
      setUpcomingMeetings((prev) => ({ ...prev, [relationshipId]: data }))
    }
  }

  // ─── Pipeline handlers ───────────────────────────────────────────────────────

  const handleStageChange = async (id: string, stage: PipelineStage) => {
    // Optimistic update
    setRelationships((prev) =>
      prev.map((r) => (r.id === id ? { ...r, pipeline_stage: stage } : r)),
    )

    const { error } = await supabase
      .from("relationships")
      .update({ pipeline_stage: stage, updated_at: new Date().toISOString() })
      .eq("id", id)

    if (error) {
      console.error("[v0] Error updating pipeline stage:", error)
      toast.error("Failed to update stage")
      fetchRelationships() // revert
    } else {
      const stageName = STAGES.find((s) => s.id === stage)?.label ?? stage
      toast.success(`Moved to ${stageName}`)
    }
  }

  const handleDealUpdate = async (id: string, updates: Partial<PipelineContact>) => {
    // Optimistic update
    setRelationships((prev) =>
      prev.map((r) => (r.id === id ? { ...r, ...updates } as Relationship : r)),
    )

    const { error } = await supabase
      .from("relationships")
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq("id", id)

    if (error) {
      console.error("[v0] Error updating deal:", error)
      toast.error("Failed to update deal")
      fetchRelationships()
    } else {
      toast.success("Deal updated")
    }
  }

  // ─── CRUD ────────────────────────────────────────────────────────────────────

  const handleAddRelationship = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    if (!newRelationship.full_name) {
      toast.error("Name is required")
      return
    }

    const { error } = await supabase.from("relationships").insert({
      user_id: user.id,
      full_name: newRelationship.full_name,
      email: newRelationship.email || null,
      company: newRelationship.company || null,
      role: newRelationship.role || null,
      relationship_type: newRelationship.relationship_type || "lead",
      linkedin_profile_url: newRelationship.linkedin_profile_url || null,
      meeting_link: newRelationship.meeting_link || null,
      status: "active",
      tags: newRelationship.tags || [],
      pipeline_stage: newRelationship.pipeline_stage || "new_lead",
    })

    if (error) {
      console.error("[v0] Error adding relationship:", error)
      toast.error("Failed to add relationship")
    } else {
      toast.success("Contact added to pipeline")
      setIsAddDialogOpen(false)
      setNewRelationship({
        full_name: "", email: "", company: "", role: "",
        relationship_type: "lead", linkedin_profile_url: "",
        meeting_link: "", status: "active", tags: [],
        pipeline_stage: "new_lead",
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
        email: selectedRelationship.email,
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
      toast.success("Contact updated")
      setIsEditDialogOpen(false)
      fetchRelationships()
    }
  }

  const handleDeleteRelationship = async (id: string) => {
    const { error } = await supabase.from("relationships").delete().eq("id", id)
    if (error) {
      toast.error("Failed to delete")
    } else {
      toast.success("Contact deleted")
      fetchRelationships()
    }
  }

  const handleScheduleMeeting = async () => {
    if (!selectedRelationship) return
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data: exists } = await supabase
      .from("relationships")
      .select("id")
      .eq("id", selectedRelationship.id)
      .eq("user_id", user.id)
      .single()

    if (!exists) {
      toast.error("Relationship not found")
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
      toast.error("Failed to schedule meeting")
    } else {
      toast.success("Meeting scheduled")
      // Auto-advance to meeting_booked if in new_lead or contacted
      if (["new_lead", "contacted"].includes(selectedRelationship.pipeline_stage)) {
        await handleStageChange(selectedRelationship.id, "meeting_booked")
      }
      setIsMeetingDialogOpen(false)
      setNewMeeting({
        title: "", date: format(new Date(), "yyyy-MM-dd"),
        startTime: "09:00", endTime: "10:00", meetingLink: "", purpose: "",
      })
      fetchNextMeeting(selectedRelationship.id)
    }
  }

  const handleSaveOutcome = async () => {
    if (!selectedEvent) return
    const { error } = await supabase
      .from("events")
      .update({ outcome: outcomeText })
      .eq("id", selectedEvent.id)

    if (error) {
      toast.error("Failed to save outcome")
    } else {
      toast.success("Outcome saved")
      setIsOutcomeDialogOpen(false)
      setOutcomeText("")
      setSelectedEvent(null)
    }
  }

  // ─── Import history ──────────────────────────────────────────────────────────

  const fetchImportHistory = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data } = await supabase
      .from("crm_import_history")
      .select("id, file_name, rows_imported, rows_skipped, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(10)

    if (data) setImportHistory(data)
  }

  const handleImportComplete = () => {
    fetchRelationships()
    fetchImportHistory()
  }

  // ─── Filtered list ────────────────────────────────────────────────────────────

  const filteredRelationships = relationships.filter((r) => {
    const matchesSearch =
      r.full_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.company?.toLowerCase().includes(searchQuery.toLowerCase())
    const matchesType = !selectedType || r.relationship_type === selectedType
    return matchesSearch && matchesType
  })

  // ─── Pagination ─────────────────────────────────────────────────────────────

  const totalPages = Math.max(1, Math.ceil(filteredRelationships.length / ITEMS_PER_PAGE))
  const paginatedRelationships = filteredRelationships.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE,
  )

  // ─── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-3xl font-bold tracking-tight">Relationships</h1>
          <p className="text-muted-foreground text-sm">
            Manage your pipeline, track deals, and never lose a lead.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* View toggle */}
          <div className="flex items-center gap-1 border rounded-lg p-1 bg-muted/30">
            <Button
              variant={viewMode === "pipeline" ? "default" : "ghost"}
              size="sm"
              className="h-7 gap-1.5 text-xs"
              onClick={() => setViewMode("pipeline")}
            >
              <Kanban size={13} />
              Pipeline
            </Button>
            <Button
              variant={viewMode === "list" ? "default" : "ghost"}
              size="sm"
              className="h-7 gap-1.5 text-xs"
              onClick={() => setViewMode("list")}
            >
              <LayoutList size={13} />
              List
            </Button>
          </div>

          {gmailConnected && (
            <Button
              variant="outline"
              className="gap-2 shadow-sm font-bold"
              onClick={async () => {
                await syncEmailsForCRM()
                toast.success("Gmail synced")
              }}
              disabled={syncingEmail}
            >
              {syncingEmail ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                </svg>
              )}
              <span className="hidden md:inline">
                {syncingEmail ? "Syncing…" : "Sync Gmail"}
              </span>
            </Button>
          )}
          <Button
            variant="outline"
            className="gap-2 shadow-sm font-bold"
            onClick={() => setIsImportDialogOpen(true)}
          >
            <Upload size={16} />
            <span className="hidden md:inline">Import</span>
          </Button>

          <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
            <DialogTrigger asChild>
              <Button className="gap-2 shadow-sm font-bold">
                <Plus size={18} />
                <span className="hidden md:inline">Add contact</span>
                <span className="md:hidden">Add</span>
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Add New Contact</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-2">
                {/* Name */}
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-widest">Full name *</label>
                  <Input
                    value={newRelationship.full_name}
                    onChange={(e) => setNewRelationship({ ...newRelationship, full_name: e.target.value })}
                    placeholder="Sarah Chen"
                    className="h-9"
                  />
                </div>

                {/* Email */}
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-widest">Email</label>
                  <Input
                    type="email"
                    value={newRelationship.email || ""}
                    onChange={(e) => setNewRelationship({ ...newRelationship, email: e.target.value })}
                    placeholder="sarah@company.com"
                    className="h-9"
                  />
                  <p className="text-[11px] text-muted-foreground">Used to match Gmail threads to this contact</p>
                </div>

                {/* Company + Role */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-muted-foreground uppercase tracking-widest">Company</label>
                    <Input
                      value={newRelationship.company || ""}
                      onChange={(e) => setNewRelationship({ ...newRelationship, company: e.target.value })}
                      placeholder="Sequoia Capital"
                      className="h-9"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-muted-foreground uppercase tracking-widest">Role</label>
                    <Input
                      value={newRelationship.role || ""}
                      onChange={(e) => setNewRelationship({ ...newRelationship, role: e.target.value })}
                      placeholder="Partner"
                      className="h-9"
                    />
                  </div>
                </div>

                {/* Type + Stage */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-muted-foreground uppercase tracking-widest">Type</label>
                    <Select
                      value={newRelationship.relationship_type}
                      onValueChange={(v: any) => setNewRelationship({ ...newRelationship, relationship_type: v })}
                    >
                      <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {RELATIONSHIP_TYPES.map((t) => (
                          <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-muted-foreground uppercase tracking-widest">Stage</label>
                    <Select
                      value={newRelationship.pipeline_stage}
                      onValueChange={(v: any) => setNewRelationship({ ...newRelationship, pipeline_stage: v })}
                    >
                      <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {STAGES.map((s) => (
                          <SelectItem key={s.id} value={s.id}>{s.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Tags */}
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-widest">Tags</label>
                  <Input
                    value={newRelationship.tags?.join(", ") || ""}
                    onChange={(e) =>
                      setNewRelationship({
                        ...newRelationship,
                        tags: e.target.value.split(",").map((t) => t.trim()).filter(Boolean),
                      })
                    }
                    placeholder="follow-up, hot-lead, vip"
                    className="h-9"
                  />
                </div>
              </div>
              <DialogFooter>
                <Button onClick={handleAddRelationship}>Add Contact</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Search + type filter (always visible) */}
      <div className="flex flex-col md:flex-row gap-3 items-center">
        <div className="flex items-center gap-2 overflow-x-auto pb-1 md:pb-0 w-full md:w-auto no-scrollbar">
          {RELATIONSHIP_TYPES.map((type) => (
            <Badge
              key={type.value}
              variant={selectedType === type.value ? "default" : "outline"}
              className="px-3 py-1 rounded-full font-bold whitespace-nowrap cursor-pointer hover:bg-muted/50 capitalize"
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
            className="pl-9 bg-white border-muted shadow-none h-9"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      {/* ─── AI Email Intelligence Panel ──────────────────────────────────────── */}
      {emailInsights.length > 0 && (
        <div className="rounded-2xl border border-border bg-card overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/30">
            <div className="flex items-center gap-2.5">
              <div className="w-6 h-6 rounded-lg flex items-center justify-center"
                style={{ background: "linear-gradient(135deg, #5B5BD6 0%, #7C3AED 100%)" }}>
                <Brain size={12} className="text-white" />
              </div>
              <div>
                <span className="text-xs font-semibold text-foreground">Email Intelligence</span>
                <span className="text-[10px] text-muted-foreground ml-2">
                  {emailInsights.length} contact{emailInsights.length !== 1 ? "s" : ""} analysed
                </span>
              </div>
            </div>
            {syncingEmail && (
              <div className="flex items-center gap-1.5 text-[11px] text-violet-400">
                <Loader2 size={11} className="animate-spin" />
                Syncing…
              </div>
            )}
          </div>
          {/* Cards */}
          <div className="flex gap-3 overflow-x-auto p-4 scrollbar-hide">
            {emailInsights.map((insight) => {
                const initials = insight.contact_name.split(" ").map((n: string) => n[0]).join("").toUpperCase().slice(0, 2)
                const sentimentColor = insight.sentiment === "positive"
                  ? { dot: "#10b981", bg: "bg-emerald-500/10 border-emerald-500/20", text: "text-emerald-400" }
                  : insight.sentiment === "negative"
                  ? { dot: "#ef4444", bg: "bg-red-500/10 border-red-500/20", text: "text-red-400" }
                  : { dot: "#888780", bg: "bg-muted/60 border-border", text: "text-muted-foreground" }
                const intentColors: Record<string, string> = {
                  interested: "bg-blue-500/15 text-blue-400",
                  ready_to_close: "bg-emerald-500/15 text-emerald-400",
                  requesting_meeting: "bg-violet-500/15 text-violet-400",
                  not_interested: "bg-red-500/15 text-red-400",
                  objection: "bg-orange-500/15 text-orange-400",
                }
                const intentClass = intentColors[insight.intent] || "bg-muted/60 text-muted-foreground"
                const timeAgo = insight.analyzed_at
                  ? (() => {
                      const diff = Date.now() - new Date(insight.analyzed_at).getTime()
                      const h = Math.floor(diff / 3600000)
                      const d = Math.floor(diff / 86400000)
                      return d > 0 ? `${d}d ago` : h > 0 ? `${h}h ago` : "just now"
                    })()
                  : ""
                return (
                  <div
                    key={`${insight.thread_id}-${insight.analyzed_at}`}
                    className="flex-shrink-0 w-64 rounded-xl border border-border bg-background hover:border-primary/30 transition-colors"
                  >
                    {/* Contact header */}
                    <div className="flex items-center gap-2.5 px-3 pt-3 pb-2 border-b border-border/50">
                      <div className="w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-bold flex-shrink-0"
                        style={{ background: `${sentimentColor.dot}20`, color: sentimentColor.dot }}>
                        {initials}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold truncate">{insight.contact_name}</p>
                        <p className="text-[10px] text-muted-foreground truncate">{insight.subject}</p>
                      </div>
                    </div>
                    {/* Badges */}
                    <div className="px-3 pt-2 flex flex-wrap gap-1.5">
                      <span className={cn("text-[10px] px-2 py-0.5 rounded-full border font-medium flex items-center gap-1", sentimentColor.bg, sentimentColor.text)}>
                        <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: sentimentColor.dot }} />
                        {insight.sentiment}
                      </span>
                      {insight.intent !== "neutral" && (
                        <span className={cn("text-[10px] px-2 py-0.5 rounded-full font-medium capitalize", intentClass)}>
                          {insight.intent.replace(/_/g, " ")}
                        </span>
                      )}
                    </div>
                    {/* Summary */}
                    {insight.summary && (
                      <p className="px-3 pt-2 text-[11px] text-muted-foreground leading-relaxed line-clamp-2">
                        {insight.summary}
                      </p>
                    )}
                    {/* Signals */}
                    {insight.signals?.length > 0 && (
                      <div className="px-3 pt-1.5 flex flex-wrap gap-1">
                        {insight.signals.slice(0, 3).map((s: string, si: number) => (
                          <span key={si} className="text-[9px] px-1.5 py-0.5 rounded bg-muted/60 text-muted-foreground">
                            {s}
                          </span>
                        ))}
                      </div>
                    )}
                    {/* Footer */}
                    <div className="px-3 pt-2 pb-3 flex items-center justify-between">
                      <span className="text-[10px] text-muted-foreground/50">{timeAgo}</span>
                    </div>
                  </div>
                )
              })}
          </div>
        </div>
      )}

      {/* ─── PIPELINE VIEW ─────────────────────────────────────────────────────── */}
      {viewMode === "pipeline" && (
        <PipelineView
          contacts={filteredRelationships as PipelineContact[]}
          onStageChange={handleStageChange}
          onDealUpdate={handleDealUpdate}
          loading={isLoading}
        />
      )}

      {/* ─── LIST VIEW ─────────────────────────────────────────────────────────── */}
      {viewMode === "list" && (
        <>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {paginatedRelationships.map((rel) => {
            const nextMeeting = upcomingMeetings[rel.id]
            const hasUpcomingMeeting = nextMeeting && new Date(nextMeeting.start_time) > new Date()
            const meetingPassed = nextMeeting && new Date(nextMeeting.start_time) < new Date()
            const stageCfg = STAGES.find((s) => s.id === rel.pipeline_stage)

            return (
              <Card key={rel.id} className="hover:shadow-md transition-all">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <CardTitle className="text-base truncate">{rel.full_name}</CardTitle>
                      {rel.company && <p className="text-sm text-muted-foreground truncate">{rel.company}</p>}
                    </div>
                    <div className="flex flex-col items-end gap-1.5">
                      <Badge
                        variant="outline"
                        className={cn(
                          "text-[10px] uppercase font-bold shrink-0",
                          rel.relationship_type === "lead" && "bg-blue-50 text-blue-600 border-blue-200",
                          rel.relationship_type === "investor" && "bg-purple-50 text-purple-600 border-purple-200",
                          rel.relationship_type === "partner" && "bg-amber-50 text-amber-600 border-amber-200",
                          rel.relationship_type === "talent" && "bg-cyan-50 text-cyan-600 border-cyan-200",
                        )}
                      >
                        {rel.relationship_type}
                      </Badge>
                      {stageCfg && (
                        <span className={cn(
                          "text-[10px] font-semibold px-1.5 py-0.5 rounded-full",
                          stageCfg.color, stageCfg.textColor,
                        )}>
                          {stageCfg.label}
                        </span>
                      )}
                    </div>
                  </div>
                  {rel.role && <p className="text-xs text-muted-foreground mt-1">{rel.role}</p>}
                  {rel.email && (
                    <a
                      href={`mailto:${rel.email}`}
                      className="flex items-center gap-1 text-xs text-muted-foreground mt-1 hover:text-primary transition-colors"
                    >
                      <Mail size={11} className="shrink-0" />
                      {rel.email}
                    </a>
                  )}
                  {rel.deal_value && (
                    <p className="text-sm font-semibold text-emerald-600 dark:text-emerald-400 mt-1">
                      ${rel.deal_value.toLocaleString()}
                      {rel.close_probability ? ` · ${rel.close_probability}%` : ""}
                    </p>
                  )}
                  {rel.tags && rel.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {rel.tags.map((tag, idx) => (
                        <Badge key={idx} variant="secondary" className="text-[9px] h-5">{tag}</Badge>
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
                      {nextMeeting.meeting_link && (
                        <Button
                          size="sm"
                          className="w-full mt-2 h-8 text-xs"
                          onClick={() => window.open(nextMeeting.meeting_link!, "_blank")}
                        >
                          <Video className="h-3 w-3 mr-1" />Join Meeting
                        </Button>
                      )}
                    </div>
                  )}
                  {meetingPassed && nextMeeting && !nextMeeting.outcome && (
                    <Button
                      size="sm" variant="outline"
                      className="w-full h-8 text-xs bg-transparent"
                      onClick={() => {
                        setSelectedEvent(nextMeeting)
                        setOutcomeText(nextMeeting.outcome || "")
                        setIsOutcomeDialogOpen(true)
                      }}
                    >
                      <FileText className="h-3 w-3 mr-1 shrink-0" />
                      Add Meeting Outcome
                    </Button>
                  )}
                  <div className="flex flex-wrap gap-2">
                    {rel.linkedin_profile_url && (
                      <Button
                        size="sm" variant="outline"
                        className="flex-1 min-w-0 h-8 text-xs bg-transparent"
                        onClick={() => window.open(rel.linkedin_profile_url!, "_blank")}
                      >
                        <Linkedin className="h-3 w-3 mr-1 shrink-0" />LinkedIn
                      </Button>
                    )}
                    <Button
                      size="sm" variant="outline"
                      className="flex-1 min-w-0 h-8 text-xs bg-transparent"
                      onClick={() => {
                        setSelectedRelationship(rel)
                        setNewMeeting({
                          title: `Meeting with ${rel.full_name}`,
                          date: format(new Date(), "yyyy-MM-dd"),
                          startTime: "09:00", endTime: "10:00",
                          meetingLink: "", purpose: "",
                        })
                        setIsMeetingDialogOpen(true)
                      }}
                    >
                      <CalendarIcon className="h-3 w-3 mr-1 shrink-0" />Schedule
                    </Button>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm" variant="ghost" className="flex-1 h-8 text-xs"
                      onClick={() => { setSelectedRelationship(rel); setIsEditDialogOpen(true) }}
                    >
                      Edit
                    </Button>
                    <Button
                      size="sm" variant="ghost"
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

        {/* Pagination controls */}
        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-3 pt-4">
            <Button
              variant="outline"
              size="sm"
              className="h-8 gap-1 text-xs"
              disabled={currentPage <= 1}
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
            >
              <ChevronLeft size={13} />
              Previous
            </Button>
            <span className="text-xs text-muted-foreground font-medium tabular-nums">
              Page {currentPage} of {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              className="h-8 gap-1 text-xs"
              disabled={currentPage >= totalPages}
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
            >
              Next
              <ChevronRight size={13} />
            </Button>
          </div>
        )}
        </>
      )}

      {/* ─── Shared dialogs ────────────────────────────────────────────────────── */}

      {/* Edit contact dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Edit Contact</DialogTitle></DialogHeader>
          {selectedRelationship && (
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label>Full Name</Label>
                <Input
                  value={selectedRelationship.full_name}
                  onChange={(e) => setSelectedRelationship({ ...selectedRelationship, full_name: e.target.value })}
                />
              </div>
              <div className="grid gap-2">
                <Label>Email</Label>
                <Input
                  type="email"
                  value={selectedRelationship.email || ""}
                  onChange={(e) => setSelectedRelationship({ ...selectedRelationship, email: e.target.value })}
                  placeholder="sarah@company.com"
                />
                <p className="text-[11px] text-muted-foreground">Used to match Gmail threads to this contact</p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label>Company</Label>
                  <Input
                    value={selectedRelationship.company || ""}
                    onChange={(e) => setSelectedRelationship({ ...selectedRelationship, company: e.target.value })}
                  />
                </div>
                <div className="grid gap-2">
                  <Label>Role</Label>
                  <Input
                    value={selectedRelationship.role || ""}
                    onChange={(e) => setSelectedRelationship({ ...selectedRelationship, role: e.target.value })}
                  />
                </div>
              </div>
              <div className="grid gap-2">
                <Label>Relationship Type</Label>
                <Select
                  value={selectedRelationship.relationship_type}
                  onValueChange={(v: any) => setSelectedRelationship({ ...selectedRelationship, relationship_type: v })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {RELATIONSHIP_TYPES.map((t) => (
                      <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>LinkedIn Profile</Label>
                <Input
                  value={selectedRelationship.linkedin_profile_url || ""}
                  onChange={(e) => setSelectedRelationship({ ...selectedRelationship, linkedin_profile_url: e.target.value })}
                  placeholder="https://linkedin.com/in/..."
                />
              </div>
              <div className="grid gap-2">
                <Label>Default Meeting Link</Label>
                <Input
                  value={selectedRelationship.meeting_link || ""}
                  onChange={(e) => setSelectedRelationship({ ...selectedRelationship, meeting_link: e.target.value })}
                  placeholder="https://meet.google.com/..."
                />
              </div>
              <div className="grid gap-2">
                <Label>Tags</Label>
                <Input
                  value={selectedRelationship.tags?.join(", ") || ""}
                  onChange={(e) =>
                    setSelectedRelationship({
                      ...selectedRelationship,
                      tags: e.target.value.split(",").map((t) => t.trim()).filter(Boolean),
                    })
                  }
                  placeholder="follow-up, urgent"
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button onClick={handleUpdateRelationship}>Save Changes</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Schedule meeting dialog */}
      <Dialog open={isMeetingDialogOpen} onOpenChange={setIsMeetingDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Schedule Meeting</DialogTitle></DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label>Meeting Title</Label>
              <Input
                value={newMeeting.title}
                onChange={(e) => setNewMeeting({ ...newMeeting, title: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Date</Label>
                <Input type="date" value={newMeeting.date}
                  onChange={(e) => setNewMeeting({ ...newMeeting, date: e.target.value })} />
              </div>
              <div className="grid gap-2">
                <Label>Start Time</Label>
                <Input type="time" value={newMeeting.startTime}
                  onChange={(e) => setNewMeeting({ ...newMeeting, startTime: e.target.value })} />
              </div>
            </div>
            <div className="grid gap-2">
              <Label>End Time</Label>
              <Input type="time" value={newMeeting.endTime}
                onChange={(e) => setNewMeeting({ ...newMeeting, endTime: e.target.value })} />
            </div>
            <div className="grid gap-2">
              <Label>Purpose</Label>
              <Textarea
                value={newMeeting.purpose}
                onChange={(e) => setNewMeeting({ ...newMeeting, purpose: e.target.value })}
                placeholder="What's the goal of this meeting?"
                rows={3}
              />
            </div>
            <div className="grid gap-2">
              <Label>Meeting Link (optional)</Label>
              <Input
                value={newMeeting.meetingLink}
                onChange={(e) => setNewMeeting({ ...newMeeting, meetingLink: e.target.value })}
                placeholder="https://meet.google.com/..."
              />
            </div>
          </div>
          <DialogFooter>
            <Button onClick={handleScheduleMeeting}>Schedule Meeting</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Meeting outcome dialog */}
      <Dialog open={isOutcomeDialogOpen} onOpenChange={setIsOutcomeDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Meeting Outcome</DialogTitle></DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label>What was the result of this meeting?</Label>
              <Textarea
                value={outcomeText}
                onChange={(e) => setOutcomeText(e.target.value)}
                placeholder="Key takeaways, next steps, decisions made..."
                rows={6}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsOutcomeDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSaveOutcome}>Save Outcome</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Import leads dialog */}
      <LeadsImportDialog
        open={isImportDialogOpen}
        onOpenChange={setIsImportDialogOpen}
        onImportComplete={handleImportComplete}
      />

      {/* Import history */}
      {importHistory.length > 0 && (
        <div className="mt-6 p-4 rounded-xl border bg-muted/10">
          <div className="flex items-center gap-2 mb-3">
            <History size={14} className="text-muted-foreground" />
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Recent Imports
            </h3>
          </div>
          <div className="space-y-1.5">
            {importHistory.map((item) => (
              <div
                key={item.id}
                className="flex items-center justify-between py-1.5 px-2.5 rounded-lg hover:bg-muted/30 transition-colors"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <FileText size={12} className="text-muted-foreground shrink-0" />
                  <span className="text-xs font-medium truncate">
                    {item.file_name}
                  </span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-[10px] text-muted-foreground">
                    {item.rows_imported} added{item.rows_skipped > 0 ? ` · ${item.rows_skipped} skipped` : ""}
                  </span>
                  <span className="text-[10px] text-muted-foreground/60">
                    {format(parseISO(item.created_at), "MMM d, h:mm a")}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}