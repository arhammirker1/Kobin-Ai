"use client"

import { useState } from "react"
import { toast } from "sonner"

export interface CreateMeetingParams {
  title: string
  description?: string
  start_time: string // ISO string
  end_time: string   // ISO string
  attendee_emails?: string[]
  type?: "internal" | "deal" | "hiring"
  client_id?: string
  relationship_id?: string
}

export interface MeetingResult {
  success: boolean
  meet_link: string | null
  google_event_id: string | null
  event: any
}

export function useGoogleMeet() {
  const [isCreating, setIsCreating] = useState(false)

  const createMeeting = async (
    params: CreateMeetingParams
  ): Promise<MeetingResult | null> => {
    setIsCreating(true)
    try {
      const res = await fetch("/api/google/create-meet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(params),
      })

      const data = await res.json()

      if (!res.ok) {
        toast.error(data.message || "Failed to create meeting")
        return null
      }

      toast.success(
        data.meet_link
          ? "Meeting created with Google Meet link!"
          : "Meeting created (no Meet link generated)"
      )

      return data
    } catch (err) {
      toast.error("Unexpected error creating meeting")
      return null
    } finally {
      setIsCreating(false)
    }
  }

  const copyMeetLink = (link: string) => {
    navigator.clipboard.writeText(link)
    toast.success("Meet link copied!")
  }

  return { createMeeting, copyMeetLink, isCreating }
}