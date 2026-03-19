"use client"

import { useEffect, useState, useMemo, useCallback } from "react"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  CalendarIcon,
  Video,
  Plus,
  ArrowRight,
  Clock,
  AlertCircle,
  CheckCircle2,
  Users,
  TrendingUp,
  FileText,
  Calendar,
} from "lucide-react"
import { format, formatDistanceToNow, isPast, differenceInDays, isToday, isTomorrow } from "date-fns"
import { cn } from "@/lib/utils"

// ─── Types ─────────────────────────────────────────────────────────────────────

interface MeetingEvent {
  id: string
  title: string
  start_time: string
  end_time: string
  meeting_link: string | null
  purpose: string | null
  type: string
  relationship_id: string | null
  contact_name?: string | null
}

interface ActionItem {
  id: string
  title: string
  source: string
  urgency: "overdue" | "today" | "soon" | "normal"
  badge: string
  href?: string
}

interface PulseData {
  tasksDueToday: number
  overdueCount: number
  meetingsToday: number
  nextMeetingIn: string | null
  pipelineValue: number
  activeDeals: number
  staleContacts: number
}

interface PipelineStageCount {
  stage: string
  label: string
  count: number
  color: string
}

interface StaleContact {
  id: string
  full_name: string
  company: string | null
  days: number
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

function getGreeting(): string {
  const h = new Date().getHours()
  if (h < 12) return "Good morning"
  if (h < 17) return "Good afternoon"
  return "Good evening"
}

function getUrgency(dueDate: string | null, priority: string): ActionItem["urgency"] {
  if (!dueDate) return "normal"
  const d = new Date(dueDate)
  if (isPast(d)) return "overdue"
  if (isToday(d)) return "today"
  if (isTomorrow(d)) return "soon"
  return "normal"
}

function minutesUntil(iso: string): number {
  return Math.round((new Date(iso).getTime() - Date.now()) / 60000)
}

// ─── Sub-components ────────────────────────────────────────────────────────────

function PulseCard({
  label,
  value,
  sub,
  accent,
}: {
  label: string
  value: string | number
  sub?: string
  accent?: "warn" | "good" | "info" | "neutral"
}) {
  const valColor = {
    warn: "text-amber-700 dark:text-amber-400",
    good: "text-emerald-700 dark:text-emerald-400",
    info: "text-blue-700 dark:text-blue-400",
    neutral: "text-foreground",
  }[accent ?? "neutral"]

  return (
    <div className="bg-card border rounded-xl p-3.5">
      <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5">
        {label}
      </p>
      <p className={cn("text-2xl font-semibold leading-none", valColor)}>{value}</p>
      {sub && <p className="text-[11px] text-muted-foreground mt-1.5">{sub}</p>}
    </div>
  )
}

function ActionRow({ item }: { item: ActionItem }) {
  const urgencyStyles: Record<ActionItem["urgency"], string> = {
    overdue: "border-l-[3px] border-l-red-500",
    today: "border-l-[3px] border-l-amber-500",
    soon: "border-l-[3px] border-l-blue-400",
    normal: "border-l-[3px] border-l-transparent",
  }
  const badgeStyles: Record<ActionItem["urgency"], string> = {
    overdue: "bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-400",
    today: "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400",
    soon: "bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400",
    normal: "bg-muted text-muted-foreground",
  }

  return (
    <div
      className={cn(
        "bg-card border rounded-xl px-3.5 py-3 flex items-center gap-3 hover:border-primary/30 transition-colors cursor-pointer",
        urgencyStyles[item.urgency],
      )}
    >
      <div
        className={cn(
          "size-4 rounded-full border-2 flex-shrink-0",
          item.urgency === "overdue" ? "border-red-400" : "border-muted-foreground/40",
        )}
      />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground truncate">{item.title}</p>
        <p className="text-[11px] text-muted-foreground mt-0.5">{item.source}</p>
      </div>
      <span
        className={cn(
          "text-[10px] font-semibold px-2 py-0.5 rounded-full flex-shrink-0",
          badgeStyles[item.urgency],
        )}
      >
        {item.badge}
      </span>
    </div>
  )
}

function MeetingRow({ event }: { event: MeetingEvent }) {
  const mins = minutesUntil(event.start_time)
  const isSoon = mins > 0 && mins <= 60
  const isNow = mins <= 0 && mins > -90

  return (
    <div
      className={cn(
        "border rounded-xl px-4 py-3 flex items-center gap-4",
        isSoon
          ? "bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800"
          : "bg-card",
      )}
    >
      {isSoon && (
        <div className="size-2 rounded-full bg-emerald-500 flex-shrink-0 animate-pulse" />
      )}
      <div className="text-center flex-shrink-0 w-11">
        <p className="text-sm font-semibold text-foreground leading-none">
          {format(new Date(event.start_time), "h:mm")}
        </p>
        <p className="text-[10px] text-muted-foreground uppercase mt-0.5">
          {format(new Date(event.start_time), "a")}
        </p>
      </div>
      <div className="w-px self-stretch bg-border flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground truncate">{event.title}</p>
        <p className="text-[11px] text-muted-foreground mt-0.5">
          {event.contact_name
            ? `with ${event.contact_name}`
            : event.purpose
            ? event.purpose
            : ""}
          {isSoon && ` · in ${mins} min`}
          {isNow && " · happening now"}
        </p>
      </div>
      {event.meeting_link && (
        <Button
          size="sm"
          variant={isSoon ? "default" : "outline"}
          className="h-7 text-xs px-3 flex-shrink-0"
          onClick={() => window.open(event.meeting_link!, "_blank")}
        >
          Join
        </Button>
      )}
    </div>
  )
}

// ─── Main component ────────────────────────────────────────────────────────────

export function TodayView() {
  const supabase = useMemo(() => createClient(), [])

  const [loading, setLoading] = useState(true)
  const [userName, setUserName] = useState("there")
  const [pulse, setPulse] = useState<PulseData>({
    tasksDueToday: 0,
    overdueCount: 0,
    meetingsToday: 0,
    nextMeetingIn: null,
    pipelineValue: 0,
    activeDeals: 0,
    staleContacts: 0,
  })
  const [actionItems, setActionItems] = useState<ActionItem[]>([])
  const [meetings, setMeetings] = useState<MeetingEvent[]>([])
  const [pipelineStages, setPipelineStages] = useState<PipelineStageCount[]>([])
  const [staleContacts, setStaleContacts] = useState<StaleContact[]>([])
  const [clock, setClock] = useState(() => format(new Date(), "h:mm a"))

  // Live clock
  useEffect(() => {
    const t = setInterval(() => setClock(format(new Date(), "h:mm a")), 30000)
    return () => clearInterval(t)
  }, [])

  const loadAll = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const now = new Date()
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0)
    const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59)
    const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000)

    // Single Promise.all — all queries in parallel
    const [
      profileRes,
      eventsRes,
      tasksDueRes,
      allTasksRes,
      relationshipsRes,
      staleRes,
    ] = await Promise.all([
      supabase.from("profiles").select("full_name").eq("id", user.id).single(),

      // Today's meetings
      supabase
        .from("events")
        .select("id, title, start_time, end_time, meeting_link, purpose, type, relationship_id")
        .eq("user_id", user.id)
        .gte("start_time", todayStart.toISOString())
        .lte("start_time", todayEnd.toISOString())
        .order("start_time", { ascending: true }),

      // Tasks with due_date today or overdue and not completed
      supabase
        .from("tasks")
        .select("id, title, priority, status, due_date, bucket")
        .eq("user_id", user.id)
        .neq("status", "completed")
        .lte("due_date", todayEnd.toISOString())
        .order("due_date", { ascending: true })
        .limit(10),

      // All task statuses for stats
      supabase
        .from("tasks")
        .select("status")
        .eq("user_id", user.id),

      // Pipeline: active relationships with deal_value + stage
      supabase
        .from("relationships")
        .select("id, full_name, company, pipeline_stage, deal_value, stage_entered_at")
        .eq("user_id", user.id)
        .eq("status", "active")
        .not("pipeline_stage", "in", '("closed_won","closed_lost")'),

      // Stale: contacts not moved in 14+ days
      supabase
        .from("relationships")
        .select("id, full_name, company, stage_entered_at")
        .eq("user_id", user.id)
        .eq("status", "active")
        .not("pipeline_stage", "in", '("closed_won","closed_lost")')
        .lt("stage_entered_at", fourteenDaysAgo.toISOString())
        .order("stage_entered_at", { ascending: true })
        .limit(5),
    ])

    // ── Profile ──────────────────────────────────────────────────────────────
    if (profileRes.data?.full_name) {
      const firstName = profileRes.data.full_name.split(" ")[0]
      setUserName(firstName)
    }

    // ── Meetings ─────────────────────────────────────────────────────────────
    const eventsData = eventsRes.data || []

    // Bulk fetch contact names for meetings that have relationship_id
    let contactMap: Record<string, string> = {}
    const relIds = [...new Set(eventsData.map((e) => e.relationship_id).filter(Boolean))] as string[]
    if (relIds.length > 0) {
      const { data: contacts } = await supabase
        .from("relationships")
        .select("id, full_name")
        .in("id", relIds)
      if (contacts) {
        contactMap = Object.fromEntries(contacts.map((c) => [c.id, c.full_name]))
      }
    }

    const enrichedEvents: MeetingEvent[] = eventsData.map((e) => ({
      ...e,
      contact_name: e.relationship_id ? contactMap[e.relationship_id] ?? null : null,
    }))

    // Only show future + in-progress meetings
    const futureMeetings = enrichedEvents.filter(
      (e) => new Date(e.end_time || e.start_time) >= now,
    )
    setMeetings(futureMeetings)

    // Next meeting countdown
    const nextMeeting = futureMeetings[0]
    const nextMins = nextMeeting ? minutesUntil(nextMeeting.start_time) : null
    const nextMeetingLabel =
      nextMins !== null
        ? nextMins <= 0
          ? "happening now"
          : nextMins < 60
          ? `in ${nextMins} min`
          : `in ${Math.round(nextMins / 60)}h`
        : null

    // ── Tasks ────────────────────────────────────────────────────────────────
    const tasksDue = tasksDueRes.data || []
    const overdueCount = tasksDue.filter(
      (t) => t.due_date && isPast(new Date(t.due_date)),
    ).length

    // Build action items from due tasks
    const taskActions: ActionItem[] = tasksDue.slice(0, 4).map((t) => ({
      id: t.id,
      title: t.title,
      source: `Tasks · ${t.priority} priority`,
      urgency: getUrgency(t.due_date, t.priority),
      badge: t.due_date && isPast(new Date(t.due_date))
        ? "Overdue"
        : isToday(new Date(t.due_date!))
        ? "Today"
        : "Soon",
    }))

    setActionItems(taskActions)

    // ── Pipeline ─────────────────────────────────────────────────────────────
    const relData = relationshipsRes.data || []
    const pipelineValue = relData.reduce((sum, r) => sum + (r.deal_value ?? 0), 0)

    const STAGE_CONFIG = [
      { stage: "new_lead", label: "New lead", color: "#B4B2A9" },
      { stage: "contacted", label: "Contacted", color: "#85B7EB" },
      { stage: "meeting_booked", label: "Meeting booked", color: "#AFA9EC" },
      { stage: "proposal", label: "Proposal sent", color: "#EF9F27" },
      { stage: "negotiating", label: "Negotiating", color: "#D85A30" },
    ]

    const stageCounts: PipelineStageCount[] = STAGE_CONFIG.map((s) => ({
      ...s,
      count: relData.filter((r) => r.pipeline_stage === s.stage).length,
    }))
    setPipelineStages(stageCounts)

    // ── Stale contacts ───────────────────────────────────────────────────────
    const staleData = (staleRes.data || []).map((r) => ({
      id: r.id,
      full_name: r.full_name,
      company: r.company,
      days: r.stage_entered_at
        ? differenceInDays(now, new Date(r.stage_entered_at))
        : 0,
    }))
    setStaleContacts(staleData)

    // ── Pulse summary ────────────────────────────────────────────────────────
    setPulse({
      tasksDueToday: tasksDue.length,
      overdueCount,
      meetingsToday: eventsData.length,
      nextMeetingIn: nextMeetingLabel,
      pipelineValue,
      activeDeals: relData.length,
      staleContacts: staleData.length,
    })

    setLoading(false)
  }, [supabase])

  useEffect(() => {
    loadAll()
  }, [loadAll])

  // Max pipeline count for bar scaling
  const maxStageCount = Math.max(...pipelineStages.map((s) => s.count), 1)

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-500">

      {/* ── Greeting ─────────────────────────────────────────────────────── */}
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {getGreeting()}, {userName}.
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {format(new Date(), "EEEE")} — here's what needs your attention today.
          </p>
        </div>
        <div className="text-right hidden md:block">
          <p className="text-xl font-semibold tabular-nums">{clock}</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {format(new Date(), "EEE, d MMMM yyyy")}
          </p>
        </div>
      </div>

      {/* ── Two-column layout ─────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 xl:grid-cols-[1fr_288px] gap-6 items-start">

        {/* LEFT COLUMN */}
        <div className="space-y-6">

          {/* ── Pulse cards ─────────────────────────────────────────────── */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <PulseCard
              label="Tasks due today"
              value={loading ? "—" : pulse.tasksDueToday}
              sub={pulse.overdueCount > 0 ? `${pulse.overdueCount} overdue` : "All on track"}
              accent={pulse.overdueCount > 0 ? "warn" : "good"}
            />
            <PulseCard
              label="Meetings today"
              value={loading ? "—" : pulse.meetingsToday}
              sub={pulse.nextMeetingIn ? `next ${pulse.nextMeetingIn}` : "None scheduled"}
              accent={pulse.nextMeetingIn ? "info" : "neutral"}
            />
            <PulseCard
              label="Pipeline value"
              value={
                loading
                  ? "—"
                  : pulse.pipelineValue > 0
                  ? `$${Math.round(pulse.pipelineValue / 1000)}k`
                  : "$0"
              }
              sub={`${pulse.activeDeals} active deals`}
              accent={pulse.pipelineValue > 0 ? "good" : "neutral"}
            />
            <PulseCard
              label="Stale contacts"
              value={loading ? "—" : pulse.staleContacts}
              sub="14+ days silent"
              accent={pulse.staleContacts > 0 ? "warn" : "good"}
            />
          </div>

          {/* ── Action items ─────────────────────────────────────────────── */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold">Needs action now</h2>
              <button
                className="text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
                onClick={() => {
                  const event = new CustomEvent("navigate-tab", { detail: "Tasks" })
                  window.dispatchEvent(event)
                }}
              >
                View all tasks <ArrowRight size={12} />
              </button>
            </div>
            {loading ? (
              <div className="space-y-2">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-16 bg-muted/40 rounded-xl animate-pulse" />
                ))}
              </div>
            ) : actionItems.length > 0 ? (
              <div className="space-y-2">
                {actionItems.map((item) => (
                  <ActionRow key={item.id} item={item} />
                ))}
              </div>
            ) : (
              <div className="bg-card border rounded-xl p-6 text-center">
                <CheckCircle2 size={24} className="text-emerald-500 mx-auto mb-2" />
                <p className="text-sm font-medium">Nothing overdue</p>
                <p className="text-xs text-muted-foreground mt-1">You're on top of everything.</p>
              </div>
            )}
          </div>

          {/* ── Today's meetings ──────────────────────────────────────────── */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold">Today's meetings</h2>
              <button
                className="text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
                onClick={() => {
                  const event = new CustomEvent("navigate-tab", { detail: "Calendar" })
                  window.dispatchEvent(event)
                }}
              >
                Open calendar <ArrowRight size={12} />
              </button>
            </div>
            {loading ? (
              <div className="space-y-2">
                {[1, 2].map((i) => (
                  <div key={i} className="h-16 bg-muted/40 rounded-xl animate-pulse" />
                ))}
              </div>
            ) : meetings.length > 0 ? (
              <div className="space-y-2">
                {meetings.map((m) => (
                  <MeetingRow key={m.id} event={m} />
                ))}
              </div>
            ) : (
              <div className="bg-card border rounded-xl p-6 text-center">
                <Calendar size={24} className="text-muted-foreground/40 mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">No meetings scheduled today</p>
              </div>
            )}
          </div>

        </div>

        {/* RIGHT COLUMN */}
        <div className="space-y-4">

          {/* ── Pipeline snapshot ─────────────────────────────────────────── */}
          <div className="bg-card border rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold">Pipeline snapshot</h2>
              <button
                className="text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
                onClick={() => {
                  const event = new CustomEvent("navigate-tab", { detail: "Relationships" })
                  window.dispatchEvent(event)
                }}
              >
                Open <ArrowRight size={12} />
              </button>
            </div>
            {loading ? (
              <div className="space-y-2.5">
                {[1, 2, 3, 4, 5].map((i) => (
                  <div key={i} className="h-4 bg-muted/40 rounded animate-pulse" />
                ))}
              </div>
            ) : (
              <div className="space-y-2.5">
                {pipelineStages.map((s) => (
                  <div key={s.stage} className="flex items-center gap-2.5">
                    <span className="text-[11px] text-muted-foreground w-[90px] flex-shrink-0 truncate">
                      {s.label}
                    </span>
                    <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{
                          width: `${Math.round((s.count / maxStageCount) * 100)}%`,
                          background: s.color,
                        }}
                      />
                    </div>
                    <span className="text-[11px] text-muted-foreground w-3 text-right flex-shrink-0">
                      {s.count}
                    </span>
                  </div>
                ))}
              </div>
            )}
            <div className="mt-3 pt-3 border-t flex items-center justify-between">
              <span className="text-[11px] text-muted-foreground">Total pipeline</span>
              <span className="text-xs font-semibold">
                {pulse.pipelineValue > 0
                  ? `$${pulse.pipelineValue.toLocaleString()}`
                  : "No deals yet"}
              </span>
            </div>
          </div>

          {/* ── Follow up needed ──────────────────────────────────────────── */}
          <div className="bg-card border rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold">Follow up needed</h2>
              <button
                className="text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
                onClick={() => {
                  const event = new CustomEvent("navigate-tab", { detail: "Relationships" })
                  window.dispatchEvent(event)
                }}
              >
                View all <ArrowRight size={12} />
              </button>
            </div>
            {loading ? (
              <div className="space-y-2">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-8 bg-muted/40 rounded animate-pulse" />
                ))}
              </div>
            ) : staleContacts.length > 0 ? (
              <div className="divide-y divide-border/60">
                {staleContacts.map((c) => (
                  <div key={c.id} className="flex items-center gap-2 py-2 first:pt-0 last:pb-0">
                    <div
                      className="size-1.5 rounded-full flex-shrink-0"
                      style={{
                        background: c.days >= 21 ? "#E24B4A" : c.days >= 14 ? "#EF9F27" : "#B4B2A9",
                      }}
                    />
                    <span className="text-xs text-foreground flex-1 truncate">
                      {c.full_name}
                      {c.company && (
                        <span className="text-muted-foreground"> · {c.company}</span>
                      )}
                    </span>
                    <span className="text-[11px] text-muted-foreground flex-shrink-0">
                      {c.days}d
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground text-center py-3">
                All contacts are up to date
              </p>
            )}
          </div>

          {/* ── Quick actions ─────────────────────────────────────────────── */}
          <div className="bg-card border rounded-xl p-4">
            <h2 className="text-sm font-semibold mb-3">Quick actions</h2>
            <div className="grid grid-cols-2 gap-2">
              {[
                {
                  icon: Plus,
                  label: "Add task",
                  tab: "Tasks",
                },
                {
                  icon: Calendar,
                  label: "Schedule meeting",
                  tab: "Calendar",
                },
                {
                  icon: Users,
                  label: "Add contact",
                  tab: "Relationships",
                },
                {
                  icon: FileText,
                  label: "Log a note",
                  tab: "Vault",
                },
              ].map(({ icon: Icon, label, tab }) => (
                <button
                  key={label}
                  className="flex flex-col gap-1.5 p-3 border rounded-lg bg-transparent hover:bg-muted/50 hover:border-border transition-colors text-left"
                  onClick={() => {
                    const event = new CustomEvent("navigate-tab", { detail: tab })
                    window.dispatchEvent(event)
                  }}
                >
                  <Icon size={14} className="text-muted-foreground" />
                  <span className="text-[12px] text-muted-foreground font-medium">{label}</span>
                </button>
              ))}
            </div>
          </div>

        </div>
      </div>
    </div>
  )
}