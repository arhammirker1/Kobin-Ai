"use client"

import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import { ChevronLeft, ChevronRight, Plus, Clock, Settings, Edit2, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ScrollArea } from "@/components/ui/scroll-area"
import { format, addDays, startOfWeek, addHours, startOfDay, parseISO, isSameDay } from "date-fns"
import { toast } from "sonner"

export function CalendarView() {
  const [currentDate, setCurrentDate] = useState(new Date())
  const [events, setEvents] = useState<any[]>([])
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false)
  const [editingEvent, setEditingEvent] = useState<any>(null)
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [timezone, setTimezone] = useState(Intl.DateTimeFormat().resolvedOptions().timeZone)
  const [newEvent, setNewEvent] = useState({
    title: "",
    date: format(new Date(), "yyyy-MM-dd"),
    startTime: "09:00",
    endTime: "10:00",
    type: "internal",
  })

  const supabase = createClient()

  useEffect(() => {
    fetchEvents()
  }, [currentDate])

  const fetchEvents = async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return

    const { data, error } = await supabase.from("events").select("*").eq("user_id", user.id)

    if (error) {
      console.error("[v0] Error fetching events:", error)
    } else {
      setEvents(data || [])
    }
  }

  const handleAddEvent = async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return

    const start = parseISO(`${newEvent.date}T${newEvent.startTime}`)
    const end = parseISO(`${newEvent.date}T${newEvent.endTime}`)

    const { error } = await supabase.from("events").insert({
      user_id: user.id,
      title: newEvent.title,
      start_time: start.toISOString(),
      end_time: end.toISOString(),
      type: newEvent.type,
    })

    if (error) {
      toast.error("Failed to add event")
    } else {
      toast.success("Event added")
      setIsDialogOpen(false)
      fetchEvents()
    }
  }

  const handleEditEvent = async () => {
    if (!editingEvent) return

    const start = parseISO(`${editingEvent.date}T${editingEvent.startTime}`)
    const end = parseISO(`${editingEvent.date}T${editingEvent.endTime}`)

    const { error } = await supabase
      .from("events")
      .update({
        title: editingEvent.title,
        start_time: start.toISOString(),
        end_time: end.toISOString(),
        type: editingEvent.type,
      })
      .eq("id", editingEvent.id)

    if (error) {
      toast.error("Failed to update event")
    } else {
      toast.success("Event updated")
      setIsEditDialogOpen(false)
      setEditingEvent(null)
      fetchEvents()
    }
  }

  const handleDeleteEvent = async (eventId: string) => {
    const { error } = await supabase.from("events").delete().eq("id", eventId)

    if (error) {
      toast.error("Failed to delete event")
    } else {
      toast.success("Event deleted")
      setIsEditDialogOpen(false)
      setEditingEvent(null)
      fetchEvents()
    }
  }

  const openEditDialog = (event: any) => {
    const start = parseISO(event.start_time)
    const end = parseISO(event.end_time)

    setEditingEvent({
      id: event.id,
      title: event.title,
      date: format(start, "yyyy-MM-dd"),
      startTime: format(start, "HH:mm"),
      endTime: format(end, "HH:mm"),
      type: event.type,
    })
    setIsEditDialogOpen(true)
  }

  const generateTimeSlots = () => {
    const slots = []
    for (let hour = 0; hour < 24; hour++) {
      slots.push({ hour, minute: 0 })
      slots.push({ hour, minute: 30 })
    }
    return slots
  }

  const timeSlots = generateTimeSlots()
  const weekStart = startOfWeek(currentDate, { weekStartsOn: 1 })
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))

  const slotHeight = 60
  const totalHeight = timeSlots.length * slotHeight

  const commonTimezones = [
    "America/New_York",
    "America/Chicago",
    "America/Denver",
    "America/Los_Angeles",
    "Europe/London",
    "Europe/Paris",
    "Asia/Dubai",
    "Asia/Kolkata",
    "Asia/Singapore",
    "Asia/Tokyo",
    "Australia/Sydney",
    "Pacific/Auckland",
  ]

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h2 className="text-2xl font-bold tracking-tight">Calendar</h2>
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-1 border rounded-md p-1 bg-muted/50">
            <Button variant="ghost" size="icon" onClick={() => setCurrentDate(addDays(currentDate, -7))}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="px-2 font-medium text-sm">
              {format(weekStart, "MMM d")} - {format(addDays(weekStart, 6), "MMM d, yyyy")}
            </span>
            <Button variant="ghost" size="icon" onClick={() => setCurrentDate(addDays(currentDate, 7))}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>

          <Dialog open={isSettingsOpen} onOpenChange={setIsSettingsOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm">
                <Settings className="h-4 w-4 mr-2" />
                Settings
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Calendar Settings</DialogTitle>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="grid gap-2">
                  <Label htmlFor="timezone">Timezone</Label>
                  <Select value={timezone} onValueChange={setTimezone}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {commonTimezones.map((tz) => (
                        <SelectItem key={tz} value={tz}>
                          {tz.replace(/_/g, " ")}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <p className="text-xs text-muted-foreground">
                  The calendar now displays all 24 hours. Scroll to view different times throughout the day.
                </p>
              </div>
              <DialogFooter>
                <Button onClick={() => setIsSettingsOpen(false)}>Save Changes</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                <span className="hidden sm:inline">New Event</span>
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add New Event</DialogTitle>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="grid gap-2">
                  <Label htmlFor="title">Title</Label>
                  <Input
                    id="title"
                    value={newEvent.title}
                    onChange={(e) => setNewEvent({ ...newEvent, title: e.target.value })}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="date">Date</Label>
                    <Input
                      id="date"
                      type="date"
                      value={newEvent.date}
                      onChange={(e) => setNewEvent({ ...newEvent, date: e.target.value })}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="type">Type</Label>
                    <Select value={newEvent.type} onValueChange={(v) => setNewEvent({ ...newEvent, type: v })}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="internal">Internal</SelectItem>
                        <SelectItem value="deal">Deal</SelectItem>
                        <SelectItem value="hiring">Hiring</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="start">Start Time</Label>
                    <Input
                      id="start"
                      type="time"
                      value={newEvent.startTime}
                      onChange={(e) => setNewEvent({ ...newEvent, startTime: e.target.value })}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="end">End Time</Label>
                    <Input
                      id="end"
                      type="time"
                      value={newEvent.endTime}
                      onChange={(e) => setNewEvent({ ...newEvent, endTime: e.target.value })}
                    />
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button onClick={handleAddEvent}>Create Event</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Edit Event</DialogTitle>
              </DialogHeader>
              {editingEvent && (
                <div className="grid gap-4 py-4">
                  <div className="grid gap-2">
                    <Label htmlFor="edit-title">Title</Label>
                    <Input
                      id="edit-title"
                      value={editingEvent.title}
                      onChange={(e) => setEditingEvent({ ...editingEvent, title: e.target.value })}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="grid gap-2">
                      <Label htmlFor="edit-date">Date</Label>
                      <Input
                        id="edit-date"
                        type="date"
                        value={editingEvent.date}
                        onChange={(e) => setEditingEvent({ ...editingEvent, date: e.target.value })}
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="edit-type">Type</Label>
                      <Select
                        value={editingEvent.type}
                        onValueChange={(v) => setEditingEvent({ ...editingEvent, type: v })}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="internal">Internal</SelectItem>
                          <SelectItem value="deal">Deal</SelectItem>
                          <SelectItem value="hiring">Hiring</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="grid gap-2">
                      <Label htmlFor="edit-start">Start Time</Label>
                      <Input
                        id="edit-start"
                        type="time"
                        value={editingEvent.startTime}
                        onChange={(e) => setEditingEvent({ ...editingEvent, startTime: e.target.value })}
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="edit-end">End Time</Label>
                      <Input
                        id="edit-end"
                        type="time"
                        value={editingEvent.endTime}
                        onChange={(e) => setEditingEvent({ ...editingEvent, endTime: e.target.value })}
                      />
                    </div>
                  </div>
                </div>
              )}
              <DialogFooter className="gap-2">
                <Button variant="destructive" onClick={() => handleDeleteEvent(editingEvent?.id)}>
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete
                </Button>
                <Button onClick={handleEditEvent}>Save Changes</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <ScrollArea className="h-[calc(100vh-220px)]">
        <div className="grid grid-cols-8 border rounded-lg overflow-hidden bg-card">
          <div className="border-r bg-muted/20">
            <div className="h-12 border-b sticky top-0 bg-muted/20 z-20" />
            {timeSlots.map((slot, idx) => (
              <div
                key={idx}
                className="border-b p-2 text-xs text-muted-foreground text-right font-medium"
                style={{ height: `${slotHeight}px` }}
              >
                {slot.minute === 0 && format(addHours(startOfDay(new Date()), slot.hour), "h:mm a")}
              </div>
            ))}
          </div>

          {weekDays.map((day) => (
            <div key={day.toString()} className="border-r last:border-r-0">
              <div
                className={`h-12 border-b p-2 text-center flex flex-col justify-center sticky top-0 z-20 ${isSameDay(day, new Date()) ? "bg-primary/5" : "bg-card"}`}
              >
                <span className="text-xs uppercase font-semibold text-muted-foreground">{format(day, "EEE")}</span>
                <span className={`text-sm font-bold ${isSameDay(day, new Date()) ? "text-primary" : ""}`}>
                  {format(day, "d")}
                </span>
              </div>
              <div className="relative" style={{ height: `${totalHeight}px` }}>
                {timeSlots.map((slot, idx) => (
                  <div key={idx} className="border-b border-muted/30" style={{ height: `${slotHeight}px` }} />
                ))}
                {events
                  .filter((e) => isSameDay(parseISO(e.start_time), day))
                  .map((event) => {
                    const start = parseISO(event.start_time)
                    const end = parseISO(event.end_time)
                    const startHourDecimal = start.getHours() + start.getMinutes() / 60
                    const duration = (end.getTime() - start.getTime()) / (1000 * 60 * 60)

                    const slotsFromStart = startHourDecimal * 2
                    const top = slotsFromStart * slotHeight
                    const calculatedHeight = duration * 2 * slotHeight
                    const height = Math.max(80, calculatedHeight)

                    return (
                      <div
                        key={event.id}
                        onClick={() => openEditDialog(event)}
                        className="absolute inset-x-1 rounded-md p-2 text-xs font-medium border shadow-sm z-10 overflow-hidden flex flex-col cursor-pointer hover:shadow-md hover:ring-2 hover:ring-primary/50 transition-all group"
                        style={{
                          top: `${Math.max(0, top)}px`,
                          height: `${height}px`,
                          backgroundColor: event.type === "deal" ? "hsl(var(--primary) / 0.1)" : "hsl(var(--muted))",
                          borderColor: "hsl(var(--primary))",
                          color: "hsl(var(--foreground))",
                        }}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="truncate font-bold text-sm flex-1">{event.title}</div>
                          <Edit2 className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
                        </div>
                        <div className="flex items-center gap-1 opacity-70 mt-1">
                          <Clock className="h-3 w-3 flex-shrink-0" />
                          <span className="text-[10px]">{format(start, "h:mm a")}</span>
                        </div>
                      </div>
                    )
                  })}
              </div>
            </div>
          ))}
        </div>
      </ScrollArea>

      <div className="text-xs text-muted-foreground text-center">Timezone: {timezone.replace(/_/g, " ")}</div>
    </div>
  )
}
