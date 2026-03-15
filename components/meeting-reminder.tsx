// components/meeting-reminder.tsx
"use client"

import { useEffect, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { parseISO, differenceInMinutes, format } from "date-fns"
import { X, ExternalLink, Clock, Calendar } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"

interface Event {
  id: string
  title: string
  start_time: string
  end_time: string
  meeting_link?: string
  purpose?: string
  type: string
}

export function MeetingReminder() {
  const [events, setEvents] = useState<Event[]>([])
  const [fiveMinuteReminder, setFiveMinuteReminder] = useState<Event | null>(null)
  const [oneMinuteNotification, setOneMinuteNotification] = useState<Event | null>(null)
  const [shownReminders, setShownReminders] = useState<Set<string>>(new Set())

  const supabase = createClient()

  useEffect(() => {
    fetchUpcomingEvents()
    const interval = setInterval(fetchUpcomingEvents, 30000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    checkForReminders()
    const interval = setInterval(checkForReminders, 10000)
    return () => clearInterval(interval)
  }, [events])

  const fetchUpcomingEvents = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const now = new Date()
    const twentyMinutesFromNow = new Date(now.getTime() + 20 * 60 * 1000)

    const { data, error } = await supabase
      .from("events")
      .select("*")
      .eq("user_id", user.id)
      .gte("start_time", now.toISOString())
      .lte("start_time", twentyMinutesFromNow.toISOString())

    if (!error && data) setEvents(data)
  }

  const sendMeetingPush = async (event: Event, minutesUntil: number) => {
    const isUrgent = minutesUntil <= 1
    const timeLabel = isUrgent ? "starting NOW" : `in ${minutesUntil} minutes`

    try {
      await fetch("/api/push/send-self", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          payload: {
            type: "meeting_reminder",
            title: isUrgent ? "🔴 Meeting Starting Now!" : "📅 Meeting in 5 minutes",
            body: `${event.title} — ${timeLabel}${event.purpose ? `\n${event.purpose}` : ""}`,
            event_id: event.id,
            meeting_link: event.meeting_link || null,
            minutes_until: minutesUntil,
          }
        }),
      })
    } catch (e) {
      // Non-fatal
    }
  }

  const checkForReminders = () => {
    const now = new Date()

    events.forEach((event) => {
      const startTime = parseISO(event.start_time)
      const minutesUntilStart = differenceInMinutes(startTime, now)

      // 5 minute reminder
      if (minutesUntilStart >= 4.5 && minutesUntilStart <= 5.5 && !shownReminders.has(`5min-${event.id}`)) {
        setFiveMinuteReminder(event)
        setShownReminders((prev) => new Set(prev).add(`5min-${event.id}`))
        sendMeetingPush(event, 5)
      }

      // 1 minute notification
      if (minutesUntilStart >= 0.5 && minutesUntilStart <= 1.5 && !shownReminders.has(`1min-${event.id}`)) {
        setOneMinuteNotification(event)
        setShownReminders((prev) => new Set(prev).add(`1min-${event.id}`))
        sendMeetingPush(event, 1)
        requestNotificationPermission(event)
      }
    })
  }

  const requestNotificationPermission = async (event: Event) => {
    if ("Notification" in window && Notification.permission === "default") {
      await Notification.requestPermission()
    }

    if ("Notification" in window && Notification.permission === "granted") {
      const notification = new Notification("Meeting Starting Soon!", {
        body: `${event.title} starts in 1 minute`,
        icon: "/icon.svg",
        badge: "/icon.svg",
        requireInteraction: true,
      })

      notification.onclick = () => {
        window.focus()
        if (event.meeting_link) window.open(event.meeting_link, "_blank")
      }
    }
  }

  const handleJoinMeeting = (link: string) => {
    window.open(link, "_blank")
  }

  return (
    <>
      {fiveMinuteReminder && (
        <div className="fixed top-20 right-6 z-50 animate-in slide-in-from-top-5 fade-in duration-300">
          <Card className="w-80 p-4 shadow-lg border-l-4 border-l-primary bg-card">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-2">
                  <Clock className="h-4 w-4 text-primary" />
                  <span className="text-sm font-semibold text-primary">Meeting in 5 minutes</span>
                </div>
                <h4 className="font-bold text-sm mb-1">{fiveMinuteReminder.title}</h4>
                <p className="text-xs text-muted-foreground">
                  {format(parseISO(fiveMinuteReminder.start_time), "h:mm a")}
                </p>
                {fiveMinuteReminder.purpose && (
                  <p className="text-xs text-muted-foreground mt-1">{fiveMinuteReminder.purpose}</p>
                )}
              </div>
              <Button variant="ghost" size="icon" className="h-6 w-6 rounded-full"
                onClick={() => setFiveMinuteReminder(null)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          </Card>
        </div>
      )}

      {oneMinuteNotification && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm animate-in fade-in duration-200">
          <Card className="w-full max-w-md p-6 shadow-2xl border-2 border-primary animate-in zoom-in-95 duration-300">
            <div className="flex items-start justify-between gap-3 mb-4">
              <div className="flex items-center gap-3">
                <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
                  <Calendar className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <h3 className="font-bold text-lg">Meeting Starting Now!</h3>
                  <p className="text-sm text-muted-foreground">1 minute remaining</p>
                </div>
              </div>
              <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full"
                onClick={() => setOneMinuteNotification(null)}>
                <X className="h-4 w-4" />
              </Button>
            </div>

            <div className="space-y-3 mb-6">
              <div>
                <h4 className="font-semibold text-base mb-1">{oneMinuteNotification.title}</h4>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Clock className="h-4 w-4" />
                  <span>
                    {format(parseISO(oneMinuteNotification.start_time), "h:mm a")} –{" "}
                    {format(parseISO(oneMinuteNotification.end_time), "h:mm a")}
                  </span>
                </div>
              </div>
              {oneMinuteNotification.purpose && (
                <div>
                  <p className="text-sm font-medium mb-1">Purpose</p>
                  <p className="text-sm text-muted-foreground">{oneMinuteNotification.purpose}</p>
                </div>
              )}
              <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/50 px-3 py-2 rounded-md">
                <span className="font-medium uppercase">{oneMinuteNotification.type}</span>
                <span>•</span>
                <span>Meeting</span>
              </div>
            </div>

            <div className="flex gap-3">
              <Button variant="outline" onClick={() => setOneMinuteNotification(null)} className="flex-1">
                Dismiss
              </Button>
              {oneMinuteNotification.meeting_link && (
                <Button onClick={() => {
                  handleJoinMeeting(oneMinuteNotification.meeting_link!)
                  setOneMinuteNotification(null)
                }} className="flex-1">
                  <ExternalLink className="h-4 w-4 mr-2" />
                  Join Meeting
                </Button>
              )}
            </div>
          </Card>
        </div>
      )}
    </>
  )
}