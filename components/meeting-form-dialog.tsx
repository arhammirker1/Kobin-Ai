"use client"

import { useState, useEffect, useCallback } from "react"
import { createClient } from "@/lib/supabase/client"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  Video, Link2, CheckCircle2, Loader2, Plus, X, Users, Mail,
} from "lucide-react"
import { format, parseISO } from "date-fns"
import { toast } from "sonner"
import { cn } from "@/lib/utils"

// ── Types ─────────────────────────────────────────────────────────────────────

export interface MeetingFormData {
  title: string
  date: string
  startTime: string
  endTime: string
  type: "internal" | "deal" | "hiring"
  purpose: string
  // link resolved after submit
  meeting_link?: string
}

export interface InternalParticipant {
  user_id: string
  full_name: string
  email: string
}

interface MeetingFormDialogProps {
  open: boolean
  onOpenChange: (v: boolean) => void
  /** Pre-fill title, date, times, type */
  initial?: Partial<MeetingFormData>
  /** Context label shown in header */
  title?: string
  /** If provided, pre-selected as external participant */
  prefilledClientEmail?: string | null
  /** If provided, shown as context */
  prefilledClientName?: string | null
  /** CRM/client/relationship ID to stamp on the event */
  clientId?: string | null
  relationshipId?: string | null
  /** Whether to show the internal participants picker */
  showInternalParticipants?: boolean
  /** Called with the final form + resolved meeting link after event is saved */
  onSaved: (data: MeetingFormData) => void
  onDelete?: () => void
}

// ── Component ─────────────────────────────────────────────────────────────────

export function MeetingFormDialog({
  open,
  onOpenChange,
  initial,
  title = "Schedule Meeting",
  prefilledClientEmail,
  prefilledClientName,
  clientId,
  relationshipId,
  showInternalParticipants = false,
  onSaved,
  onDelete,
}: MeetingFormDialogProps) {
  const supabase = createClient()

  // Form state
  const [form, setForm] = useState<MeetingFormData>({
    title: "",
    date: format(new Date(), "yyyy-MM-dd"),
    startTime: "09:00",
    endTime: "10:00",
    type: "internal",
    purpose: "",
    ...initial,
  })

  // Link mode
  const [linkMode, setLinkMode] = useState<"none" | "custom" | "google">("none")
  const [customLink, setCustomLink] = useState("")
  const [generatedLink, setGeneratedLink] = useState<string | null>(null)
  const [isGoogleConnected, setIsGoogleConnected] = useState(false)

  // Internal participants
  const [workspaceMembers, setWorkspaceMembers] = useState<InternalParticipant[]>([])
  const [selectedInternalIds, setSelectedInternalIds] = useState<string[]>([])

  // External participants
  const [externalEmails, setExternalEmails] = useState<string[]>(
    prefilledClientEmail ? [prefilledClientEmail] : []
  )
  const [newExternalEmail, setNewExternalEmail] = useState("")

  // UI state
  const [saving, setSaving] = useState(false)

  // ── Reset on open ──────────────────────────────────────────────────────────

  useEffect(() => {
    if (!open) return
    setForm({
      title: "",
      date: format(new Date(), "yyyy-MM-dd"),
      startTime: "09:00",
      endTime: "10:00",
      type: "internal",
      purpose: "",
      ...initial,
    })
    setLinkMode("none")
    setCustomLink("")
    setGeneratedLink(null)
    setSelectedInternalIds([])
    setExternalEmails(prefilledClientEmail ? [prefilledClientEmail] : [])
    setNewExternalEmail("")
  }, [open])

  // ── Load Google status + workspace members ─────────────────────────────────

  useEffect(() => {
    if (!open) return
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      // Check Google connection
      const { data: integration } = await supabase
        .from("google_integrations")
        .select("is_connected")
        .eq("user_id", user.id)
        .single()
      setIsGoogleConnected(integration?.is_connected === true)

      if (!showInternalParticipants) return

      // Load profile to check user type
      const { data: profile } = await supabase
        .from("profiles")
        .select("user_type")
        .eq("id", user.id)
        .single()

      let founderId = user.id
      if (profile?.user_type === "team_member") {
        const { data: tm } = await supabase
          .from("team_members")
          .select("founder_id")
          .eq("user_id", user.id)
          .single()
        if (tm?.founder_id) founderId = tm.founder_id
      }

      // Fetch founder + team members
      const { data: founderProfile } = await supabase
        .from("profiles")
        .select("id, full_name, email")
        .eq("id", founderId)
        .single()

      const { data: teamMembers } = await supabase
        .from("team_members")
        .select("user_id, profile:profiles!team_members_user_id_profiles_fkey(id, full_name, email)")
        .eq("founder_id", founderId)
        .eq("is_active", true)

      const members: InternalParticipant[] = []
      if (founderProfile && founderProfile.id !== user.id) {
        members.push({ user_id: founderProfile.id, full_name: founderProfile.full_name || "Founder", email: founderProfile.email || "" })
      }
      for (const tm of teamMembers || []) {
        const p = (tm as any).profile
        if (p && p.id !== user.id) {
          members.push({ user_id: p.id, full_name: p.full_name || "Team member", email: p.email || "" })
        }
      }
      setWorkspaceMembers(members)
    }
    load()
  }, [open, showInternalParticipants])

  // ── Helpers ────────────────────────────────────────────────────────────────

  const set = (key: keyof MeetingFormData, value: string) =>
    setForm(f => ({ ...f, [key]: value }))

  const toggleInternal = (id: string) => {
    setSelectedInternalIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    )
  }

  const addExternalEmail = () => {
    const email = newExternalEmail.trim().toLowerCase()
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      toast.error("Enter a valid email address")
      return
    }
    if (externalEmails.includes(email)) {
      toast.error("Email already added")
      return
    }
    setExternalEmails(prev => [...prev, email])
    setNewExternalEmail("")
  }

  // ── Send invites to internal participants ──────────────────────────────────

  const sendInvites = async (
    eventId: string,
    inviterUserId: string,
    startISO: string,
    endISO: string,
    meetingLink: string | null
  ) => {
    // Get inviter name once
    const { data: inviterProfile } = await supabase
      .from("profiles")
      .select("full_name")
      .eq("id", inviterUserId)
      .single()
    const inviterName = inviterProfile?.full_name || "Someone"

    const startDate = new Date(startISO)
    const endDate = new Date(endISO)
    const dateStr = startDate.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })
    const startStr = startDate.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
    const endStr = endDate.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })

    for (const inviteeId of selectedInternalIds) {
      // 1. Create invite row
      const { data: invite, error: inviteError } = await supabase
        .from("event_invites")
        .insert({
          event_id: eventId,
          invitee_user_id: inviteeId,
          inviter_user_id: inviterUserId,
          status: "pending",
        })
        .select("id")
        .single()

      if (inviteError || !invite?.id) {
        console.error("Failed to create invite:", inviteError)
        continue
      }

      // 2. Find or create DM room using dm_key (deterministic)
      const dmKey = [inviterUserId, inviteeId].sort().join(":")

      let roomId: string | null = null

      const { data: existingRoom } = await supabase
        .from("chat_rooms")
        .select("id")
        .eq("dm_key", dmKey)
        .maybeSingle()

      if (existingRoom?.id) {
        roomId = existingRoom.id
      } else {
        // Determine founder_id — use inviter if founder, otherwise look up
        const { data: inviterProfileFull } = await supabase
          .from("profiles")
          .select("user_type")
          .eq("id", inviterUserId)
          .single()

        const actualFounderId = inviterProfileFull?.user_type === "founder"
          ? inviterUserId
          : inviteeId // fallback: assume invitee is founder

        const { data: newRoom, error: roomError } = await supabase
          .from("chat_rooms")
          .insert({
            type: "direct",
            founder_id: actualFounderId,
            created_by: inviterUserId,
            dm_key: dmKey,
          })
          .select("id")
          .single()

        if (roomError || !newRoom?.id) {
          console.error("Failed to create DM room:", roomError)
          continue
        }

        roomId = newRoom.id

        // Add both members
        await supabase.from("chat_room_members").insert([
          { room_id: roomId, user_id: inviterUserId },
          { room_id: roomId, user_id: inviteeId },
        ])
      }

      if (!roomId) continue

      // 3. Send invite message to chat_messages
      const messageContent = JSON.stringify({
        type: "event_invite",
        invite_id: invite.id,
        event_title: form.title,
        event_date: dateStr,
        event_time: `${startStr} – ${endStr}`,
        event_purpose: form.purpose || null,
        meeting_link: meetingLink,
        inviter_name: inviterName,
      })

      const { error: msgError } = await supabase.from("chat_messages").insert({
        room_id: roomId,
        sender_id: inviterUserId,
        content: messageContent,
        message_type: "event_invite",
        invite_id: invite.id,
      })

      if (msgError) {
        console.error("Failed to send invite message:", msgError)
      }
    }
  }


  // ── Send meeting notification to client ────────────────────────────────────

  const sendClientMeetingMessage = async (
    eventId: string,
    inviterUserId: string,
    startISO: string,
    endISO: string,
    meetingLink: string | null
  ) => {
    if (!clientId) return

    // Get client's portal_user_id
    const { data: client } = await supabase
      .from("clients")
      .select("portal_user_id, name")
      .eq("id", clientId)
      .single()

    if (!client?.portal_user_id) return // Client doesn't have portal access yet

    const clientUserId = client.portal_user_id

    // Find DM room between founder and client
    const dmKey = [inviterUserId, clientUserId].sort().join(":")

    const { data: existingRoom } = await supabase
      .from("chat_rooms")
      .select("id")
      .eq("dm_key", dmKey)
      .maybeSingle()

    if (!existingRoom?.id) return // No DM room exists with this client yet

    // Get inviter name
    const { data: inviterProfile } = await supabase
      .from("profiles")
      .select("full_name")
      .eq("id", inviterUserId)
      .single()

    const startDate = new Date(startISO)
    const endDate = new Date(endISO)
    const dateStr = startDate.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })
    const startStr = startDate.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
    const endStr = endDate.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })

    // Create an invite row for the client too
    const { data: invite } = await supabase
      .from("event_invites")
      .insert({
        event_id: eventId,
        invitee_user_id: clientUserId,
        inviter_user_id: inviterUserId,
        status: "pending",
      })
      .select("id")
      .single()

    if (!invite?.id) return

    const messageContent = JSON.stringify({
      type: "event_invite",
      invite_id: invite.id,
      event_title: form.title,
      event_date: dateStr,
      event_time: `${startStr} – ${endStr}`,
      event_purpose: form.purpose || null,
      meeting_link: meetingLink,
      inviter_name: inviterProfile?.full_name || "Your team",
    })

    await supabase.from("chat_messages").insert({
      room_id: existingRoom.id,
      sender_id: inviterUserId,
      content: messageContent,
      message_type: "event_invite",
      invite_id: invite.id,
    })
  }

  // ── Submit ─────────────────────────────────────────────────────────────────

  // ── Submit ─────────────────────────────────────────────────────────────────

  const handleSave = async () => {
    if (!form.title.trim()) { toast.error("Title is required"); return }
    setSaving(true)

    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error("Not authenticated")

      const startISO = parseISO(`${form.date}T${form.startTime}`).toISOString()
      const endISO = parseISO(`${form.date}T${form.endTime}`).toISOString()

      let finalLink: string | null = null

      // Resolve meeting link
      if (linkMode === "custom" && customLink.trim()) {
        finalLink = customLink.trim()
      } else if (linkMode === "google" && isGoogleConnected) {
        // Collect all attendee emails
        const internalEmails = workspaceMembers
          .filter(m => selectedInternalIds.includes(m.user_id))
          .map(m => m.email)
          .filter(Boolean)
        const allEmails = [...new Set([...internalEmails, ...externalEmails])]

        const res = await fetch("/api/google/create-meet", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: form.title,
            description: form.purpose,
            start_time: startISO,
            end_time: endISO,
            attendee_emails: allEmails,
            type: form.type,
            client_id: clientId || undefined,
            relationship_id: relationshipId || undefined,
          }),
        })

        const data = await res.json()

        if (res.ok && data.meet_link) {
          finalLink = data.meet_link
          setGeneratedLink(data.meet_link)
          // If the API already inserted the event (some implementations do), call onSaved and return
          if (data.event_inserted) {
            toast.success("Meeting scheduled with Google Meet!")
            onSaved({ ...form, meeting_link: finalLink ?? undefined })
            onOpenChange(false)
            setSaving(false)
            return
          }
        } else {
          toast.error(data.message || "Failed to generate Meet link — saving without link")
        }
      }

      // Insert event into DB
      const { error } = await supabase.from("events").insert({
        user_id: user.id,
        title: form.title,
        start_time: startISO,
        end_time: endISO,
        type: form.type,
        meeting_link: finalLink,
        purpose: form.purpose || null,
        client_id: clientId || null,
        relationship_id: relationshipId || null,
      })

      if (error) throw error

      // Send invites to internal participants
      // Fetch the newly created event ID
      const { data: newEvent } = await supabase
        .from("events")
        .select("id")
        .eq("user_id", user.id)
        .eq("title", form.title)
        .eq("start_time", startISO)
        .order("created_at", { ascending: false })
        .limit(1)
        .single()

      // Send invites to internal workspace members
      if (selectedInternalIds.length > 0 && newEvent?.id) {
        await sendInvites(newEvent.id, user.id, startISO, endISO, finalLink)
      }

      // Send inbox message to client if this is a client meeting
      if (clientId && newEvent?.id) {
        await sendClientMeetingMessage(newEvent.id, user.id, startISO, endISO, finalLink)
      }

      toast.success("Meeting scheduled")
      onSaved({ ...form, meeting_link: finalLink ?? undefined })
      onOpenChange(false)
    } catch (err: any) {
      toast.error(err.message || "Failed to schedule meeting")
    } finally {
      setSaving(false)
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {prefilledClientName && (
            <p className="text-sm text-muted-foreground">with {prefilledClientName}</p>
          )}
        </DialogHeader>

        <div className="space-y-4 py-2">

          {/* Title */}
          <div className="space-y-1.5">
            <Label>Title *</Label>
            <Input
              value={form.title}
              onChange={e => set("title", e.target.value)}
              placeholder="Meeting title…"
            />
          </div>

          {/* Date + Type */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Date</Label>
              <Input type="date" value={form.date} onChange={e => set("date", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Type</Label>
              <Select value={form.type} onValueChange={v => set("type", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="internal">Internal</SelectItem>
                  <SelectItem value="deal">Deal</SelectItem>
                  <SelectItem value="hiring">Hiring</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Start + End */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Start</Label>
              <Input type="time" value={form.startTime} onChange={e => set("startTime", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>End</Label>
              <Input type="time" value={form.endTime} onChange={e => set("endTime", e.target.value)} />
            </div>
          </div>

          {/* Purpose */}
          <div className="space-y-1.5">
            <Label>Purpose</Label>
            <Input
              value={form.purpose}
              onChange={e => set("purpose", e.target.value)}
              placeholder="What's the goal of this meeting?"
            />
          </div>

          {/* ── Meeting Link Section ── */}
          <div className="space-y-2">
            <Label>Meeting Link</Label>
            <div className="grid grid-cols-3 gap-2">
              {([
                { id: "none", label: "No Link", icon: null },
                { id: "custom", label: "Custom Link", icon: <Link2 size={13} /> },
                { id: "google", label: "Auto-Generate", icon: <Video size={13} /> },
              ] as const).map(({ id, label, icon }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setLinkMode(id)}
                  disabled={id === "google" && !isGoogleConnected}
                  className={cn(
                    "flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border text-xs font-medium transition-colors",
                    linkMode === id
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border text-muted-foreground hover:border-primary/50 hover:bg-muted/40",
                    id === "google" && !isGoogleConnected && "opacity-40 cursor-not-allowed"
                  )}
                >
                  {icon}
                  {label}
                </button>
              ))}
            </div>

            {linkMode === "none" && (
              <p className="text-xs text-muted-foreground">No meeting link will be attached.</p>
            )}

            {linkMode === "custom" && (
              <Input
                placeholder="https://zoom.us/j/... or https://meet.google.com/..."
                value={customLink}
                onChange={e => setCustomLink(e.target.value)}
              />
            )}

            {linkMode === "google" && !isGoogleConnected && (
              <p className="text-xs text-muted-foreground">
                Connect Google in Settings to enable auto-generated Meet links.
              </p>
            )}

            {linkMode === "google" && isGoogleConnected && (
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-emerald-50 border border-emerald-200">
                <Video size={13} className="text-emerald-600 shrink-0" />
                <p className="text-xs text-emerald-700">
                  A Google Meet link will be created and calendar invites sent to all participants.
                </p>
              </div>
            )}

            {generatedLink && (
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-emerald-50 border border-emerald-200">
                <CheckCircle2 size={13} className="text-emerald-600 shrink-0" />
                <a href={generatedLink} target="_blank" rel="noopener noreferrer"
                  className="text-xs text-emerald-700 truncate flex-1 underline">
                  {generatedLink}
                </a>
                <button
                  onClick={() => { navigator.clipboard.writeText(generatedLink); toast.success("Copied!") }}
                  className="text-xs text-emerald-700 hover:text-emerald-900 shrink-0 font-medium"
                >
                  Copy
                </button>
              </div>
            )}
          </div>

          {/* ── Participants ── */}
          {(showInternalParticipants || true) && (
            <div className="space-y-3">
              <Label className="flex items-center gap-2">
                <Users size={14} />
                Participants
              </Label>

              {/* Internal */}
              {workspaceMembers.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">
                    Workspace Members
                  </p>
                  <div className="border border-border rounded-lg overflow-hidden divide-y divide-border">
                    {workspaceMembers.map(member => (
                      <button
                        key={member.user_id}
                        type="button"
                        onClick={() => toggleInternal(member.user_id)}
                        className={cn(
                          "w-full flex items-center gap-3 px-3 py-2 text-left transition-colors",
                          selectedInternalIds.includes(member.user_id)
                            ? "bg-primary/10"
                            : "hover:bg-muted/40"
                        )}
                      >
                        <div className={cn(
                          "size-4 rounded border flex items-center justify-center shrink-0 transition-colors",
                          selectedInternalIds.includes(member.user_id)
                            ? "border-primary bg-primary"
                            : "border-border"
                        )}>
                          {selectedInternalIds.includes(member.user_id) && (
                            <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
                              <path d="M1 4l2 2 4-4" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{member.full_name}</p>
                          <p className="text-xs text-muted-foreground truncate">{member.email}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* External */}
              <div className="space-y-1.5">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">
                  External Participants
                </p>
                <div className="flex gap-2">
                  <Input
                    placeholder="email@example.com"
                    value={newExternalEmail}
                    onChange={e => setNewExternalEmail(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && (e.preventDefault(), addExternalEmail())}
                    className="text-sm h-9"
                  />
                  <Button type="button" size="sm" variant="outline" onClick={addExternalEmail} className="h-9 px-2">
                    <Plus size={14} />
                  </Button>
                </div>
                {externalEmails.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {externalEmails.map(email => (
                      <span
                        key={email}
                        className="inline-flex items-center gap-1 text-xs bg-muted border border-border rounded-full px-2.5 py-0.5"
                      >
                        <Mail size={10} className="text-muted-foreground" />
                        {email}
                        <button
                          type="button"
                          onClick={() => setExternalEmails(prev => prev.filter(e => e !== email))}
                          className="text-muted-foreground hover:text-destructive ml-0.5"
                        >
                          <X size={10} />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
                <p className="text-[10px] text-muted-foreground">
                  {linkMode === "google" && isGoogleConnected
                    ? "Google Calendar invites will be sent to all participants listed above."
                    : "Add clients, contacts, or anyone outside your workspace."}
                </p>
              </div>
            </div>
          )}

        </div>

        <DialogFooter className="gap-2">
          {onDelete && (
            <Button
              variant="destructive"
              size="sm"
              onClick={onDelete}
              disabled={saving}
              className="mr-auto"
            >
              Delete
            </Button>
          )}
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving
              ? <><Loader2 size={14} className="animate-spin mr-1.5" />Scheduling…</>
              : linkMode === "google" && isGoogleConnected
              ? "Schedule with Meet"
              : "Schedule Meeting"
            }
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}