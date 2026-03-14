"use client"

import { useState, useEffect } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import { Trash2, Video, Copy, CheckCircle2, Loader2, Plus, X } from "lucide-react"
import { toast } from "sonner"
import { createClient } from "@/lib/supabase/client"
import { useGoogleMeet } from "@/hooks/use-google-meet"

export interface EventFormState {
  title: string
  date: string
  startTime: string
  endTime: string
  type: "internal" | "deal" | "hiring"
  meeting_link: string
  purpose: string
}

interface EventFormDialogProps {
  open: boolean
  onOpenChange: (v: boolean) => void
  initial: EventFormState
  onSave: (data: EventFormState) => Promise<void>
  onDelete?: () => Promise<void>
  mode: "create" | "edit"
  clientEmail?: string | null
  relationshipId?: string | null
  clientId?: string | null
}

export function EventFormDialog({
  open,
  onOpenChange,
  initial,
  onSave,
  onDelete,
  mode,
  clientEmail,
  relationshipId,
  clientId,
}: EventFormDialogProps) {
  const [form, setForm] = useState<EventFormState>(initial)
  const [saving, setSaving] = useState(false)
  const [useGoogleMeetToggle, setUseGoogleMeetToggle] = useState(false)
  const [isGoogleConnected, setIsGoogleConnected] = useState(false)
  const [checkingGoogle, setCheckingGoogle] = useState(true)
  const [attendeeEmails, setAttendeeEmails] = useState<string[]>(
    clientEmail ? [clientEmail] : []
  )
  const [newEmail, setNewEmail] = useState("")
  const [generatedMeetLink, setGeneratedMeetLink] = useState<string | null>(null)
  const [linkCopied, setLinkCopied] = useState(false)

  const supabase = createClient()
  const { createMeeting, isCreating } = useGoogleMeet()

  useEffect(() => {
    setForm(initial)
    setGeneratedMeetLink(null)
    setLinkCopied(false)
  }, [initial, open])

  useEffect(() => {
    if (!open) return
    const checkGoogle = async () => {
      setCheckingGoogle(true)
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setCheckingGoogle(false); return }
      const { data } = await supabase
        .from("google_integrations")
        .select("is_connected")
        .eq("user_id", user.id)
        .single()
      setIsGoogleConnected(data?.is_connected === true)
      setCheckingGoogle(false)
    }
    checkGoogle()
  }, [open])

  const set = (key: keyof EventFormState, value: string) =>
    setForm((f) => ({ ...f, [key]: value }))

  const addAttendee = () => {
    const email = newEmail.trim().toLowerCase()
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      toast.error("Enter a valid email address")
      return
    }
    if (attendeeEmails.includes(email)) {
      toast.error("Email already added")
      return
    }
    setAttendeeEmails((prev) => [...prev, email])
    setNewEmail("")
  }

  const removeAttendee = (email: string) => {
    setAttendeeEmails((prev) => prev.filter((e) => e !== email))
  }

  const handleSave = async () => {
    if (!form.title.trim()) {
      toast.error("Title is required")
      return
    }

    setSaving(true)

    // If Google Meet toggled on, create the meeting via Google API first
    if (useGoogleMeetToggle && isGoogleConnected) {
      const startISO = new Date(`${form.date}T${form.startTime}`).toISOString()
      const endISO = new Date(`${form.date}T${form.endTime}`).toISOString()

      const result = await createMeeting({
        title: form.title,
        description: form.purpose,
        start_time: startISO,
        end_time: endISO,
        attendee_emails: attendeeEmails,
        type: form.type,
        client_id: clientId || undefined,
        relationship_id: relationshipId || undefined,
      })

      setSaving(false)

      if (result?.meet_link) {
        setGeneratedMeetLink(result.meet_link)
        // Auto-fill the meeting_link field and close after showing
        await onSave({ ...form, meeting_link: result.meet_link })
        return
      }
      // If failed, fall through to manual save
    }

    await onSave(form)
    setSaving(false)
  }

  const copyLink = () => {
    if (!generatedMeetLink) return
    navigator.clipboard.writeText(generatedMeetLink)
    setLinkCopied(true)
    setTimeout(() => setLinkCopied(false), 2000)
    toast.success("Meet link copied!")
  }

  const isBusy = saving || isCreating

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{mode === "create" ? "New Event" : "Edit Event"}</DialogTitle>
        </DialogHeader>

        <div className="grid gap-3 py-2">
          <div className="grid gap-1.5">
            <Label htmlFor="ef-title">Title *</Label>
            <Input
              id="ef-title"
              value={form.title}
              onChange={(e) => set("title", e.target.value)}
              placeholder="Event title"
            />
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
          <div className="rounded-lg border border-border p-3 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                </svg>
                <span className="text-sm font-medium">Auto-generate Meet link</span>
                {!checkingGoogle && !isGoogleConnected && (
                  <Badge variant="outline" className="text-[9px] text-muted-foreground">
                    Requires Google connection
                  </Badge>
                )}
              </div>
              <Switch
                checked={useGoogleMeetToggle}
                onCheckedChange={setUseGoogleMeetToggle}
                disabled={!isGoogleConnected || checkingGoogle}
              />
            </div>

            {!isGoogleConnected && !checkingGoogle && (
              <p className="text-xs text-muted-foreground">
                Connect your Google account in{" "}
                <a href="/settings" className="text-primary underline">Settings</a>{" "}
                to enable auto-scheduling.
              </p>
            )}

            {useGoogleMeetToggle && isGoogleConnected && (
              <div className="space-y-2">
                <Label className="text-xs">Attendee emails</Label>
                <div className="flex gap-2">
                  <Input
                    placeholder="attendee@email.com"
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addAttendee())}
                    className="text-xs h-8"
                  />
                  <Button type="button" size="sm" variant="outline" onClick={addAttendee} className="h-8 px-2">
                    <Plus className="h-3.5 w-3.5" />
                  </Button>
                </div>
                {attendeeEmails.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {attendeeEmails.map((email) => (
                      <span
                        key={email}
                        className="inline-flex items-center gap-1 text-[10px] bg-primary/10 text-primary border border-primary/20 rounded-full px-2 py-0.5"
                      >
                        {email}
                        <button onClick={() => removeAttendee(email)} className="hover:text-destructive">
                          <X className="h-2.5 w-2.5" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
                <p className="text-[10px] text-muted-foreground">
                  Google Calendar invites will be sent to all attendees
                </p>
              </div>
            )}

            {/* Show generated link */}
            {generatedMeetLink && (
              <div className="flex items-center gap-2 p-2 bg-emerald-50 border border-emerald-200 rounded-lg">
                <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                <a
                  href={generatedMeetLink}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs text-emerald-700 truncate flex-1 underline"
                >
                  {generatedMeetLink}
                </a>
                <Button size="sm" variant="ghost" className="h-7 px-2" onClick={copyLink}>
                  {linkCopied ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
                </Button>
              </div>
            )}
          </div>

          {/* Manual meeting link (shown when Google Meet is off) */}
          {!useGoogleMeetToggle && (
            <div className="grid gap-1.5">
              <Label htmlFor="ef-link">Meeting Link</Label>
              <Input
                id="ef-link"
                value={form.meeting_link}
                onChange={(e) => set("meeting_link", e.target.value)}
                placeholder="https://..."
              />
            </div>
          )}

          <div className="grid gap-1.5">
            <Label htmlFor="ef-purpose">Purpose</Label>
            <Input
              id="ef-purpose"
              value={form.purpose}
              onChange={(e) => set("purpose", e.target.value)}
              placeholder="What's the goal?"
            />
          </div>
        </div>

        <DialogFooter className="gap-2">
          {mode === "edit" && onDelete && (
            <Button variant="destructive" size="sm" onClick={onDelete} className="mr-auto">
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSave} disabled={isBusy} className="gap-2">
            {isBusy && <Loader2 className="h-4 w-4 animate-spin" />}
            {useGoogleMeetToggle && isGoogleConnected
              ? isCreating ? "Creating Meet…" : "Create with Meet"
              : saving ? "Saving…" : mode === "create" ? "Create" : "Save"
            }
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}