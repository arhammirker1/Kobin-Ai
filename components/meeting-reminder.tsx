// components/meeting-reminder.tsx
"use client"

import { useEffect, useState, useRef } from "react"
import { createClient } from "@/lib/supabase/client"
import { parseISO, differenceInMinutes } from "date-fns"

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
  const [shownReminders, setShownReminders] = useState<Set<string>>(new Set())
  const supabase = createClient()

  useEffect(() => {
    fetchUpcomingEvents()
    const interval = setInterval(fetchUpcomingEvents, 30000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    const interval = setInterval(checkForReminders, 10000)
    return () => clearInterval(interval)
  }, [events, shownReminders])

  // Cache the user ID outside the polling function
const userIdRef = useRef<string | null>(null)

useEffect(() => {
  supabase.auth.getUser().then(({ data: { user } }) => {
    if (user) userIdRef.current = user.id
  })
}, [])

const fetchUpcomingEvents = async () => {
  if (!userIdRef.current) return
  const now = new Date()
  const twentyMinutesFromNow = new Date(now.getTime() + 20 * 60 * 1000)

  const { data, error } = await supabase
    .from("events")
    .select("*")
    .eq("user_id", userIdRef.current)
    .gte("start_time", now.toISOString())
    .lte("start_time", twentyMinutesFromNow.toISOString())

  if (!error && data) setEvents(data)
}

  const sendMeetingPush = async (event: Event, minutesUntil: number) => {
    const isUrgent = minutesUntil <= 1
    try {
      await fetch("/api/push/send-self", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          payload: {
            type: "meeting_reminder",
            title: isUrgent ? "🔴 Meeting Starting Now!" : "📅 Meeting in 5 minutes",
            body: `${event.title} — ${isUrgent ? "starting NOW" : "in 5 minutes"}${event.purpose ? `\n${event.purpose}` : ""}`,
            event_id: event.id,
            meeting_link: event.meeting_link || null,
            minutes_until: minutesUntil,
          },
        }),
      })
    } catch {
      // non-fatal
    }
  }

  const checkForReminders = () => {
    const now = new Date()
    events.forEach((event) => {
      const startTime = parseISO(event.start_time)
      const minutesUntilStart = differenceInMinutes(startTime, now)

      if (minutesUntilStart >= 4.5 && minutesUntilStart <= 5.5 && !shownReminders.has(`5min-${event.id}`)) {
        setShownReminders((prev) => new Set(prev).add(`5min-${event.id}`))
        sendMeetingPush(event, 5)
      }

      if (minutesUntilStart >= 0.5 && minutesUntilStart <= 1.5 && !shownReminders.has(`1min-${event.id}`)) {
        setShownReminders((prev) => new Set(prev).add(`1min-${event.id}`))
        sendMeetingPush(event, 1)
      }
    })
  }

  // No UI — all notifications are web push only
  return null
}