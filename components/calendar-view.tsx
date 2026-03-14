"use client"

import { useState, useEffect, useRef, useMemo, useCallback } from "react"
import { createClient } from "@/lib/supabase/client"
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  X,
  Video,
  Clock,
  Calendar as CalendarIcon,
  MoreHorizontal,
  Trash2,
} from "lucide-react"
import { Switch } from "@/components/ui/switch"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  format,
  addDays,
  addWeeks,
  subWeeks,
  addMonths,
  subMonths,
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  parseISO,
  isSameDay,
  isSameMonth,
  isToday,
  differenceInMinutes,
  setHours,
  setMinutes,
} from "date-fns"
import { toast } from "sonner"



// ─── Types ────────────────────────────────────────────────────────────────────

interface CalendarEvent {
  id: string
  title: string
  start_time: string
  end_time: string
  type: "internal" | "deal" | "hiring"
  meeting_link: string | null
  purpose: string | null
  relationship_id: string | null
}

interface EventFormState {
  title: string
  date: string
  startTime: string
  endTime: string
  type: "internal" | "deal" | "hiring"
  meeting_link: string
  purpose: string
}

type ViewMode = "week" | "month" | "day"

// ─── Constants ────────────────────────────────────────────────────────────────

const EVENT_COLORS: Record<string, { bg: string; border: string; text: string }> = {
  internal: {
    bg: "bg-blue-500/90",
    border: "border-blue-600",
    text: "text-white",
  },
  deal: {
    bg: "bg-emerald-500/90",
    border: "border-emerald-600",
    text: "text-white",
  },
  hiring: {
    bg: "bg-violet-500/90",
    border: "border-violet-600",
    text: "text-white",
  },
}

const HOURS = Array.from({ length: 24 }, (_, i) => i)
const HOUR_HEIGHT = 64 // px per hour

const EMPTY_FORM: EventFormState = {
  title: "",
  date: format(new Date(), "yyyy-MM-dd"),
  startTime: "09:00",
  endTime: "10:00",
  type: "internal",
  meeting_link: "",
  purpose: "",
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatHour(hour: number): string {
  if (hour === 0) return "12 AM"
  if (hour < 12) return `${hour} AM`
  if (hour === 12) return "12 PM"
  return `${hour - 12} PM`
}

function getEventStyle(event: CalendarEvent): { top: number; height: number } {
  const start = parseISO(event.start_time)
  const end = parseISO(event.end_time)
  const startMinutes = start.getHours() * 60 + start.getMinutes()
  const durationMinutes = Math.max(differenceInMinutes(end, start), 30)
  return {
    top: (startMinutes / 60) * HOUR_HEIGHT,
    height: Math.max((durationMinutes / 60) * HOUR_HEIGHT, 28),
  }
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function EventChip({
  event,
  compact = false,
  onClick,
}: {
  event: CalendarEvent
  compact?: boolean
  onClick: (e: React.MouseEvent) => void
}) {
  const colors = EVENT_COLORS[event.type] ?? EVENT_COLORS.internal
  const start = parseISO(event.start_time)
  const end = parseISO(event.end_time)

  return (
    <button
      onClick={onClick}
      className={`w-full text-left rounded-md px-2 py-1 border-l-2 text-[11px] font-medium overflow-hidden hover:brightness-110 transition-all shadow-sm ${colors.bg} ${colors.border} ${colors.text}`}
    >
      <div className="font-semibold truncate">{event.title}</div>
      {!compact && (
        <div className="opacity-80 text-[10px]">
          {format(start, "h:mm")}–{format(end, "h:mm a")}
        </div>
      )}
    </button>
  )
}

// ─── Event Form ───────────────────────────────────────────────────────────────

function EventFormDialog({
  open, onOpenChange, initial, onSave, onDelete, mode,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  initial: EventFormState
  onSave: (data: EventFormState) => Promise<void>
  onDelete?: () => Promise<void>
  mode: "create" | "edit"
}) {
  const [form, setForm] = useState<EventFormState>(initial)
  const [saving, setSaving] = useState(false)
  const [useMeet, setUseMeet] = useState(false)
  const [isGoogleConnected, setIsGoogleConnected] = useState(false)
  const [meetLink, setMeetLink] = useState<string | null>(null)
  const [attendees, setAttendees] = useState("")
  const supabase = useMemo(() => createClient(), [])

  useEffect(() => { setForm(initial); setMeetLink(null) }, [initial, open])

  useEffect(() => {
    if (!open) return
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return
      supabase.from("google_integrations").select("is_connected").eq("user_id", user.id).single()
        .then(({ data }) => setIsGoogleConnected(data?.is_connected === true))
    })
  }, [open, supabase])

  const set = (key: keyof EventFormState, value: string) =>
    setForm((f) => ({ ...f, [key]: value }))

  const handleSave = async () => {
    if (!form.title.trim()) { toast.error("Title is required"); return }
    setSaving(true)

    if (useMeet && isGoogleConnected) {
      const res = await fetch("/api/google/create-meet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: form.title,
          description: form.purpose,
          start_time: new Date(`${form.date}T${form.startTime}`).toISOString(),
          end_time: new Date(`${form.date}T${form.endTime}`).toISOString(),
          attendee_emails: attendees.split(",").map(e => e.trim()).filter(Boolean),
          type: form.type,
        }),
      })
      const data = await res.json()
      if (res.ok && data.meet_link) {
        setMeetLink(data.meet_link)
        toast.success("Meet link created!")
        await onSave({ ...form, meeting_link: data.meet_link })
        setSaving(false)
        return
      }
      toast.error(data.message || "Failed to create Meet link")
      setSaving(false)
      return
    }

    await onSave(form)
    setSaving(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{mode === "create" ? "New Event" : "Edit Event"}</DialogTitle>
        </DialogHeader>

        <div className="grid gap-3 py-2">
          <div className="grid gap-1.5">
            <Label htmlFor="ef-title">Title *</Label>
            <Input id="ef-title" value={form.title} onChange={(e) => set("title", e.target.value)} placeholder="Event title" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="ef-date">Date</Label>
              <Input id="ef-date" type="date" value={form.date} onChange={(e) => set("date", e.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="ef-type">Type</Label>
              <Select value={form.type} onValueChange={(v) => set("type", v)}>
                <SelectTrigger id="ef-type"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="internal">Internal</SelectItem>
                  <SelectItem value="deal">Deal</SelectItem>
                  <SelectItem value="hiring">Hiring</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="ef-start">Start</Label>
              <Input id="ef-start" type="time" value={form.startTime} onChange={(e) => set("startTime", e.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="ef-end">End</Label>
              <Input id="ef-end" type="time" value={form.endTime} onChange={(e) => set("endTime", e.target.value)} />
            </div>
          </div>

          {/* Google Meet toggle */}
          <div className="rounded-lg border p-3 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Video className="h-4 w-4 text-primary" />
                <span className="text-sm font-medium">Auto-generate Meet link</span>
                {!isGoogleConnected && (
                  <span className="text-[10px] text-muted-foreground border rounded px-1.5 py-0.5">
                    Connect Google in Settings
                  </span>
                )}
              </div>
              <Switch checked={useMeet} onCheckedChange={setUseMeet} disabled={!isGoogleConnected} />
            </div>

            {useMeet && isGoogleConnected && (
              <div className="grid gap-1.5">
                <Label className="text-xs">Attendee emails (comma-separated)</Label>
                <Input
                  value={attendees}
                  onChange={(e) => setAttendees(e.target.value)}
                  placeholder="alice@co.com, bob@co.com"
                  className="text-xs h-8"
                />
                <p className="text-[10px] text-muted-foreground">Google Calendar invites sent automatically</p>
              </div>
            )}

            {meetLink && (
              <div className="flex items-center gap-2 p-2 bg-emerald-50 border border-emerald-200 rounded-lg">
                <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                <a href={meetLink} target="_blank" rel="noreferrer"
                  className="text-xs text-emerald-700 truncate flex-1 underline">{meetLink}</a>
                <button onClick={() => { navigator.clipboard.writeText(meetLink); toast.success("Copied!") }}
                  className="text-xs text-emerald-700 hover:text-emerald-900 shrink-0">Copy</button>
              </div>
            )}
          </div>

          {/* Manual link — only show when Meet toggle is off */}
          {!useMeet && (
            <div className="grid gap-1.5">
              <Label htmlFor="ef-link">Meeting Link</Label>
              <Input id="ef-link" value={form.meeting_link} onChange={(e) => set("meeting_link", e.target.value)} placeholder="https://..." />
            </div>
          )}

          <div className="grid gap-1.5">
            <Label htmlFor="ef-purpose">Purpose</Label>
            <Input id="ef-purpose" value={form.purpose} onChange={(e) => set("purpose", e.target.value)} placeholder="What's the goal?" />
          </div>
        </div>

        <DialogFooter className="gap-2">
          {mode === "edit" && onDelete && (
            <Button variant="destructive" size="sm" onClick={onDelete} className="mr-auto">
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Saving…" : useMeet && isGoogleConnected ? "Create with Meet" : mode === "create" ? "Create" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─── Week View ────────────────────────────────────────────────────────────────

function WeekView({
  currentDate,
  events,
  onDayClick,
  onEventClick,
  onSlotClick,
}: {
  currentDate: Date
  events: CalendarEvent[]
  onDayClick: (day: Date) => void
  onEventClick: (event: CalendarEvent) => void
  onSlotClick: (day: Date, hour: number) => void
}) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const weekStart = startOfWeek(currentDate, { weekStartsOn: 1 })
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))

  // Scroll to 8am on mount
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = 8 * HOUR_HEIGHT - 20
    }
  }, [])

  // Current time indicator
  const now = new Date()
  const nowTop = (now.getHours() + now.getMinutes() / 60) * HOUR_HEIGHT

  return (
    <div className="flex flex-col flex-1 min-h-0 overflow-hidden border rounded-xl bg-card">
      {/* Day headers */}
      <div className="grid grid-cols-[56px_repeat(7,1fr)] border-b bg-muted/30 sticky top-0 z-20">
        <div className="border-r" />
        {weekDays.map((day) => (
          <button
            key={day.toISOString()}
            onClick={() => onDayClick(day)}
            className={`py-2 text-center border-r last:border-r-0 hover:bg-muted/50 transition-colors ${
              isToday(day) ? "bg-primary/5" : ""
            }`}
          >
            <div className="text-[10px] font-semibold uppercase text-muted-foreground tracking-wider">
              {format(day, "EEE")}
            </div>
            <div
              className={`text-base font-bold mt-0.5 w-8 h-8 flex items-center justify-center rounded-full mx-auto ${
                isToday(day) ? "bg-primary text-primary-foreground" : ""
              }`}
            >
              {format(day, "d")}
            </div>
          </button>
        ))}
      </div>

      {/* Scrollable time grid */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        <div className="grid grid-cols-[56px_repeat(7,1fr)]" style={{ height: `${HOURS.length * HOUR_HEIGHT}px` }}>
          {/* Time labels */}
          <div className="relative border-r">
            {HOURS.map((hour) => (
              <div
                key={hour}
                className="absolute right-2 text-[10px] text-muted-foreground font-medium"
                style={{ top: hour * HOUR_HEIGHT - 7 }}
              >
                {hour === 0 ? "" : formatHour(hour)}
              </div>
            ))}
          </div>

          {/* Day columns */}
          {weekDays.map((day) => {
            const dayEvents = events.filter((e) => isSameDay(parseISO(e.start_time), day))
            const isCurrentDay = isToday(day)

            return (
              <div key={day.toISOString()} className="relative border-r last:border-r-0">
                {/* Hour grid lines */}
                {HOURS.map((hour) => (
                  <div
                    key={hour}
                    className="absolute inset-x-0 border-t border-border/50 hover:bg-muted/30 cursor-pointer transition-colors"
                    style={{ top: hour * HOUR_HEIGHT, height: HOUR_HEIGHT }}
                    onClick={() => onSlotClick(day, hour)}
                  />
                ))}
                {/* Half-hour lines */}
                {HOURS.map((hour) => (
                  <div
                    key={`half-${hour}`}
                    className="absolute inset-x-0 border-t border-border/25 border-dashed pointer-events-none"
                    style={{ top: hour * HOUR_HEIGHT + HOUR_HEIGHT / 2 }}
                  />
                ))}

                {/* Current time line */}
                {isCurrentDay && (
                  <div
                    className="absolute inset-x-0 z-10 flex items-center pointer-events-none"
                    style={{ top: nowTop }}
                  >
                    <div className="w-2 h-2 rounded-full bg-red-500 -ml-1 flex-shrink-0" />
                    <div className="flex-1 h-px bg-red-500" />
                  </div>
                )}

                {/* Events */}
                {dayEvents.map((event) => {
                  const { top, height } = getEventStyle(event)
                  return (
                    <div
                      key={event.id}
                      className="absolute inset-x-1 z-10"
                      style={{ top, height }}
                    >
                      <EventChip
                        event={event}
                        compact={height < 40}
                        onClick={(e) => {
                          e.stopPropagation()
                          onEventClick(event)
                        }}
                      />
                    </div>
                  )
                })}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ─── Day View ─────────────────────────────────────────────────────────────────

function DayView({
  currentDate,
  events,
  onEventClick,
  onSlotClick,
}: {
  currentDate: Date
  events: CalendarEvent[]
  onEventClick: (event: CalendarEvent) => void
  onSlotClick: (day: Date, hour: number) => void
}) {
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = 8 * HOUR_HEIGHT - 20
    }
  }, [])

  const dayEvents = events.filter((e) => isSameDay(parseISO(e.start_time), currentDate))
  const now = new Date()
  const nowTop = (now.getHours() + now.getMinutes() / 60) * HOUR_HEIGHT

  return (
    <div className="flex flex-col flex-1 min-h-0 overflow-hidden border rounded-xl bg-card">
      {/* Header */}
      <div className="grid grid-cols-[56px_1fr] border-b bg-muted/30 sticky top-0 z-20">
        <div className="border-r" />
        <div className="py-2 px-4">
          <div className="text-[10px] font-semibold uppercase text-muted-foreground tracking-wider">
            {format(currentDate, "EEEE")}
          </div>
          <div
            className={`text-2xl font-bold mt-0.5 ${isToday(currentDate) ? "text-primary" : ""}`}
          >
            {format(currentDate, "d")}
          </div>
        </div>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        <div className="grid grid-cols-[56px_1fr]" style={{ height: `${HOURS.length * HOUR_HEIGHT}px` }}>
          <div className="relative border-r">
            {HOURS.map((hour) => (
              <div
                key={hour}
                className="absolute right-2 text-[10px] text-muted-foreground font-medium"
                style={{ top: hour * HOUR_HEIGHT - 7 }}
              >
                {hour === 0 ? "" : formatHour(hour)}
              </div>
            ))}
          </div>

          <div className="relative">
            {HOURS.map((hour) => (
              <div
                key={hour}
                className="absolute inset-x-0 border-t border-border/50 hover:bg-muted/30 cursor-pointer transition-colors"
                style={{ top: hour * HOUR_HEIGHT, height: HOUR_HEIGHT }}
                onClick={() => onSlotClick(currentDate, hour)}
              />
            ))}
            {HOURS.map((hour) => (
              <div
                key={`half-${hour}`}
                className="absolute inset-x-0 border-t border-border/25 border-dashed pointer-events-none"
                style={{ top: hour * HOUR_HEIGHT + HOUR_HEIGHT / 2 }}
              />
            ))}

            {isToday(currentDate) && (
              <div
                className="absolute inset-x-0 z-10 flex items-center pointer-events-none"
                style={{ top: nowTop }}
              >
                <div className="w-2 h-2 rounded-full bg-red-500 -ml-1" />
                <div className="flex-1 h-px bg-red-500" />
              </div>
            )}

            {dayEvents.map((event) => {
              const { top, height } = getEventStyle(event)
              return (
                <div key={event.id} className="absolute left-1 right-4 z-10" style={{ top, height }}>
                  <EventChip
                    event={event}
                    compact={height < 40}
                    onClick={(e) => {
                      e.stopPropagation()
                      onEventClick(event)
                    }}
                  />
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Month View ───────────────────────────────────────────────────────────────

function MonthView({
  currentDate,
  events,
  onDayClick,
  onEventClick,
}: {
  currentDate: Date
  events: CalendarEvent[]
  onDayClick: (day: Date) => void
  onEventClick: (event: CalendarEvent) => void
}) {
  const monthStart = startOfMonth(currentDate)
  const monthEnd = endOfMonth(currentDate)
  const calStart = startOfWeek(monthStart, { weekStartsOn: 1 })
  const calEnd = endOfWeek(monthEnd, { weekStartsOn: 1 })
  const days = eachDayOfInterval({ start: calStart, end: calEnd })

  return (
    <div className="flex flex-col flex-1 border rounded-xl overflow-hidden bg-card">
      {/* Weekday headers */}
      <div className="grid grid-cols-7 border-b bg-muted/30">
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
          <div key={d} className="py-2 text-center text-[10px] font-semibold uppercase tracking-wider text-muted-foreground border-r last:border-r-0">
            {d}
          </div>
        ))}
      </div>

      {/* Days grid */}
      <div className="flex-1 grid grid-cols-7" style={{ gridAutoRows: "1fr" }}>
        {days.map((day) => {
          const dayEvents = events.filter((e) => isSameDay(parseISO(e.start_time), day))
          const isCurrentMonth = isSameMonth(day, currentDate)
          const isCurrentDay = isToday(day)

          return (
            <div
              key={day.toISOString()}
              onClick={() => onDayClick(day)}
              className={`border-r border-b last-of-type:border-r-0 p-1.5 cursor-pointer hover:bg-muted/20 transition-colors min-h-[90px] flex flex-col gap-1 ${
                !isCurrentMonth ? "bg-muted/10" : ""
              }`}
            >
              <div className="flex items-center justify-end">
                <span
                  className={`text-xs font-semibold w-6 h-6 flex items-center justify-center rounded-full ${
                    isCurrentDay
                      ? "bg-primary text-primary-foreground"
                      : isCurrentMonth
                      ? "text-foreground"
                      : "text-muted-foreground/50"
                  }`}
                >
                  {format(day, "d")}
                </span>
              </div>
              <div className="flex flex-col gap-0.5 overflow-hidden">
                {dayEvents.slice(0, 3).map((event) => (
                  <button
                    key={event.id}
                    onClick={(e) => {
                      e.stopPropagation()
                      onEventClick(event)
                    }}
                    className={`text-left text-[10px] font-medium px-1.5 py-0.5 rounded truncate ${
                      EVENT_COLORS[event.type]?.bg ?? "bg-blue-500/90"
                    } ${EVENT_COLORS[event.type]?.text ?? "text-white"}`}
                  >
                    {event.title}
                  </button>
                ))}
                {dayEvents.length > 3 && (
                  <span className="text-[10px] text-muted-foreground px-1">+{dayEvents.length - 3} more</span>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Mini Calendar (sidebar) ──────────────────────────────────────────────────

function MiniCalendar({
  currentDate,
  onDateSelect,
}: {
  currentDate: Date
  onDateSelect: (date: Date) => void
}) {
  const [miniDate, setMiniDate] = useState(currentDate)

  const monthStart = startOfMonth(miniDate)
  const calStart = startOfWeek(monthStart, { weekStartsOn: 1 })
  const days = eachDayOfInterval({ start: calStart, end: addDays(calStart, 41) })

  return (
    <div className="w-full select-none">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-semibold">{format(miniDate, "MMMM yyyy")}</span>
        <div className="flex gap-1">
          <button
            onClick={() => setMiniDate(subMonths(miniDate, 1))}
            className="p-1 rounded hover:bg-muted transition-colors"
          >
            <ChevronLeft className="h-3 w-3" />
          </button>
          <button
            onClick={() => setMiniDate(addMonths(miniDate, 1))}
            className="p-1 rounded hover:bg-muted transition-colors"
          >
            <ChevronRight className="h-3 w-3" />
          </button>
        </div>
      </div>
      <div className="grid grid-cols-7 gap-0">
        {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => (
          <div key={i} className="text-center text-[9px] font-semibold text-muted-foreground py-1">
            {d}
          </div>
        ))}
        {days.map((day) => (
          <button
            key={day.toISOString()}
            onClick={() => onDateSelect(day)}
            className={`text-center text-xs h-7 w-full rounded transition-colors ${
              isSameDay(day, currentDate)
                ? "bg-primary text-primary-foreground font-bold"
                : isToday(day)
                ? "text-primary font-bold"
                : isSameMonth(day, miniDate)
                ? "hover:bg-muted text-foreground"
                : "text-muted-foreground/40 hover:bg-muted/50"
            }`}
          >
            {format(day, "d")}
          </button>
        ))}
      </div>
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function CalendarView() {
  const supabase = useMemo(() => createClient(), [])

  const [currentDate, setCurrentDate] = useState(new Date())
  const [viewMode, setViewMode] = useState<ViewMode>("week")
  const [events, setEvents] = useState<CalendarEvent[]>([])

  // Dialog state
  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [createForm, setCreateForm] = useState<EventFormState>(EMPTY_FORM)
  const [editingEvent, setEditingEvent] = useState<(EventFormState & { id: string }) | null>(null)

  // Fetch events
  const fetchEvents = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data, error } = await supabase
      .from("events")
      .select("id, title, start_time, end_time, type, meeting_link, purpose, relationship_id")
      .eq("user_id", user.id)
      .order("start_time", { ascending: true })

    if (error) {
      toast.error("Failed to load events")
    } else {
      setEvents((data as CalendarEvent[]) || [])
    }
  }, [supabase])

  useEffect(() => {
    fetchEvents()
  }, [fetchEvents])

  // Navigation
  const navigate = (dir: -1 | 1) => {
    if (viewMode === "day") setCurrentDate((d) => addDays(d, dir))
    else if (viewMode === "week") setCurrentDate((d) => (dir === 1 ? addWeeks(d, 1) : subWeeks(d, 1)))
    else setCurrentDate((d) => (dir === 1 ? addMonths(d, 1) : subMonths(d, 1)))
  }

  const goToToday = () => setCurrentDate(new Date())

  // Title
  const navTitle = useMemo(() => {
    if (viewMode === "day") return format(currentDate, "MMMM d, yyyy")
    if (viewMode === "week") {
      const ws = startOfWeek(currentDate, { weekStartsOn: 1 })
      const we = endOfWeek(currentDate, { weekStartsOn: 1 })
      return isSameMonth(ws, we)
        ? `${format(ws, "MMM d")} – ${format(we, "d, yyyy")}`
        : `${format(ws, "MMM d")} – ${format(we, "MMM d, yyyy")}`
    }
    return format(currentDate, "MMMM yyyy")
  }, [currentDate, viewMode])

  // Slot click → prefill form
  const handleSlotClick = (day: Date, hour: number) => {
    setCreateForm({
      ...EMPTY_FORM,
      date: format(day, "yyyy-MM-dd"),
      startTime: `${String(hour).padStart(2, "0")}:00`,
      endTime: `${String(Math.min(hour + 1, 23)).padStart(2, "0")}:00`,
    })
    setCreateDialogOpen(true)
  }

  const handleDayClick = (day: Date) => {
    setCurrentDate(day)
    setViewMode("day")
  }

  const handleEventClick = (event: CalendarEvent) => {
    const start = parseISO(event.start_time)
    const end = parseISO(event.end_time)
    setEditingEvent({
      id: event.id,
      title: event.title,
      date: format(start, "yyyy-MM-dd"),
      startTime: format(start, "HH:mm"),
      endTime: format(end, "HH:mm"),
      type: event.type,
      meeting_link: event.meeting_link ?? "",
      purpose: event.purpose ?? "",
    })
    setEditDialogOpen(true)
  }

  const handleCreate = async (form: EventFormState) => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const startISO = parseISO(`${form.date}T${form.startTime}`).toISOString()
    const endISO = parseISO(`${form.date}T${form.endTime}`).toISOString()

    const { error } = await supabase.from("events").insert({
      user_id: user.id,
      title: form.title,
      start_time: startISO,
      end_time: endISO,
      type: form.type,
      meeting_link: form.meeting_link || null,
      purpose: form.purpose || null,
      relationship_id: null,
    })

    if (error) {
      toast.error("Failed to create event")
    } else {
      toast.success("Event created")
      setCreateDialogOpen(false)
      fetchEvents()
    }
  }

  const handleUpdate = async (form: EventFormState) => {
    if (!editingEvent) return

    const startISO = parseISO(`${form.date}T${form.startTime}`).toISOString()
    const endISO = parseISO(`${form.date}T${form.endTime}`).toISOString()

    const { error } = await supabase
      .from("events")
      .update({
        title: form.title,
        start_time: startISO,
        end_time: endISO,
        type: form.type,
        meeting_link: form.meeting_link || null,
        purpose: form.purpose || null,
      })
      .eq("id", editingEvent.id)

    if (error) {
      toast.error("Failed to update event")
    } else {
      toast.success("Event updated")
      setEditDialogOpen(false)
      setEditingEvent(null)
      fetchEvents()
    }
  }

  const handleDelete = async () => {
    if (!editingEvent) return

    const { error } = await supabase.from("events").delete().eq("id", editingEvent.id)

    if (error) {
      toast.error("Failed to delete event")
    } else {
      toast.success("Event deleted")
      setEditDialogOpen(false)
      setEditingEvent(null)
      fetchEvents()
    }
  }

  return (
    <div className="flex h-[calc(100vh-120px)] gap-4">
      {/* ── Sidebar ── */}
      <aside className="hidden lg:flex flex-col gap-5 w-[200px] flex-shrink-0">
        <Button
          onClick={() => {
            setCreateForm({ ...EMPTY_FORM, date: format(new Date(), "yyyy-MM-dd") })
            setCreateDialogOpen(true)
          }}
          className="gap-2 w-full shadow-sm"
        >
          <Plus className="h-4 w-4" />
          New Event
        </Button>

        <MiniCalendar currentDate={currentDate} onDateSelect={(d) => setCurrentDate(d)} />

        {/* Legend */}
        <div className="space-y-1.5">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Event Types</p>
          {(["internal", "deal", "hiring"] as const).map((type) => (
            <div key={type} className="flex items-center gap-2">
              <div className={`w-2.5 h-2.5 rounded-sm ${EVENT_COLORS[type].bg}`} />
              <span className="text-xs capitalize text-muted-foreground">{type}</span>
            </div>
          ))}
        </div>
      </aside>

      {/* ── Main ── */}
      <div className="flex flex-col flex-1 min-w-0 gap-3">
        {/* Toolbar */}
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={goToToday}>
              Today
            </Button>
            <div className="flex">
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => navigate(-1)}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => navigate(1)}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
            <h2 className="text-lg font-semibold">{navTitle}</h2>
          </div>

          <div className="flex items-center gap-1 border rounded-lg p-0.5 bg-muted/40">
            {(["day", "week", "month"] as ViewMode[]).map((mode) => (
              <button
                key={mode}
                onClick={() => setViewMode(mode)}
                className={`px-3 py-1 text-xs font-medium rounded-md capitalize transition-colors ${
                  viewMode === mode ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {mode}
              </button>
            ))}
          </div>

          {/* Mobile new event button */}
          <Button
            size="sm"
            className="lg:hidden gap-1"
            onClick={() => {
              setCreateForm({ ...EMPTY_FORM, date: format(new Date(), "yyyy-MM-dd") })
              setCreateDialogOpen(true)
            }}
          >
            <Plus className="h-4 w-4" /> New
          </Button>
        </div>

        {/* Calendar body */}
        {viewMode === "week" && (
          <WeekView
            currentDate={currentDate}
            events={events}
            onDayClick={handleDayClick}
            onEventClick={handleEventClick}
            onSlotClick={handleSlotClick}
          />
        )}
        {viewMode === "day" && (
          <DayView
            currentDate={currentDate}
            events={events}
            onEventClick={handleEventClick}
            onSlotClick={handleSlotClick}
          />
        )}
        {viewMode === "month" && (
          <MonthView
            currentDate={currentDate}
            events={events}
            onDayClick={handleDayClick}
            onEventClick={handleEventClick}
          />
        )}
      </div>

      {/* ── Dialogs ── */}
      <EventFormDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        initial={createForm}
        onSave={handleCreate}
        mode="create"
      />
      {editingEvent && (
        <EventFormDialog
          open={editDialogOpen}
          onOpenChange={setEditDialogOpen}
          initial={editingEvent}
          onSave={handleUpdate}
          onDelete={handleDelete}
          mode="edit"
        />
      )}
    </div>
  )
}