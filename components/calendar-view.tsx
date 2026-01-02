"use client"

import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import { ChevronLeft, ChevronRight, Plus, Clock } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { format, addDays, startOfWeek, addHours, startOfDay, parseISO, isSameDay } from "date-fns"
import { toast } from "sonner"

export function CalendarView() {
  const [currentDate, setCurrentDate] = useState(new Date())
  const [events, setEvents] = useState<any[]>([])
  const [isDialogOpen, setIsDialogOpen] = useState(false)
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

  const hours = Array.from({ length: 15 }, (_, i) => i + 7) // 7 AM to 10 PM
  const weekStart = startOfWeek(currentDate, { weekStartsOn: 1 })
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold tracking-tight">Calendar</h2>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1 border rounded-md p-1 bg-muted/50">
            <Button variant="ghost" size="icon" onClick={() => setCurrentDate(addDays(currentDate, -7))}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="px-2 font-medium">
              {format(weekStart, "MMM d")} - {format(addDays(weekStart, 6), "MMM d, yyyy")}
            </span>
            <Button variant="ghost" size="icon" onClick={() => setCurrentDate(addDays(currentDate, 7))}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                New Event
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
        </div>
      </div>

      <div className="grid grid-cols-8 border rounded-lg overflow-hidden bg-card">
        <div className="border-r bg-muted/20">
          <div className="h-12 border-b" />
          {hours.map((hour) => (
            <div key={hour} className="h-20 border-b p-2 text-xs text-muted-foreground text-right font-medium">
              {format(addHours(startOfDay(new Date()), hour), "h a")}
            </div>
          ))}
        </div>

        {weekDays.map((day) => (
          <div key={day.toString()} className="border-r last:border-r-0">
            <div
              className={`h-12 border-b p-2 text-center flex flex-col justify-center ${isSameDay(day, new Date()) ? "bg-primary/5" : ""}`}
            >
              <span className="text-xs uppercase font-semibold text-muted-foreground">{format(day, "EEE")}</span>
              <span className={`text-sm font-bold ${isSameDay(day, new Date()) ? "text-primary" : ""}`}>
                {format(day, "d")}
              </span>
            </div>
            <div className="relative h-[1200px]">
              {" "}
              {/* 15 hours * 80px */}
              {hours.map((hour) => (
                <div key={hour} className="h-20 border-b border-muted/30" />
              ))}
              {events
                .filter((e) => isSameDay(parseISO(e.start_time), day))
                .map((event) => {
                  const start = parseISO(event.start_time)
                  const startHour = start.getHours() + start.getMinutes() / 60
                  const duration = (parseISO(event.end_time).getTime() - start.getTime()) / (1000 * 60 * 60)
                  const top = (startHour - 7) * 80
                  const height = duration * 80

                  return (
                    <div
                      key={event.id}
                      className="absolute inset-x-1 rounded p-1 text-[10px] font-medium border shadow-sm z-10 overflow-hidden"
                      style={{
                        top: `${top}px`,
                        height: `${height}px`,
                        backgroundColor: event.type === "deal" ? "var(--primary-light)" : "var(--muted)",
                        borderColor: "var(--primary)",
                        color: "var(--foreground)",
                      }}
                    >
                      <div className="truncate font-bold">{event.title}</div>
                      <div className="flex items-center gap-1 opacity-70">
                        <Clock className="h-2 w-2" />
                        {format(start, "h:mm a")}
                      </div>
                    </div>
                  )
                })}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
