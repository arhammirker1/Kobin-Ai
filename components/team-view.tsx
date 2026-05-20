"use client"

import type React from "react"
import { TeamMeetingsDialog } from "./team-meetings-dialog"
import { Calendar } from "lucide-react"
import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { cn } from "@/lib/utils"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import { useToast } from "@/hooks/use-toast"
import { UserPlus, Edit, Trash2, Mail, Lock, Briefcase, Info } from "lucide-react"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"

interface TeamMember {
  id: string
  user_id: string
  position: string
  is_active: boolean
  can_view_tasks: boolean
  can_update_task_status: boolean
  can_perform_tasks: boolean
  can_create_tasks: boolean
  can_view_calendar: boolean
  can_view_linkedin: boolean
  can_view_relationships: boolean
  can_view_vault: boolean
  can_view_analytics: boolean
  can_view_projects: boolean
  can_create_projects: boolean
  can_access_clients: boolean
  can_access_inbox: boolean
  created_at: string
  profile: {
    full_name: string
    email: string
  }
}

interface TeamMemberFormData {
  full_name: string
  email: string
  password: string
  position: string
  can_view_tasks: boolean
  can_update_task_status: boolean
  can_perform_tasks: boolean
  can_create_tasks: boolean
  can_view_calendar: boolean
  can_view_linkedin: boolean
  can_view_relationships: boolean
  can_view_vault: boolean
  can_view_analytics: boolean
  can_view_projects: boolean
  can_create_projects: boolean
  can_access_clients: boolean
  can_access_inbox: boolean
}

// ── Presets ────────────────────────────────────────────────────────────────

type PresetKey = "admin" | "pm" | "executor" | "sales" | "analyst" | "custom"

const BLANK_PERMS: Partial<TeamMemberFormData> = {
  can_view_tasks: false, can_perform_tasks: false, can_update_task_status: false,
  can_create_tasks: false, can_view_projects: false, can_create_projects: false,
  can_view_calendar: false, can_view_vault: false, can_access_inbox: false,
  can_view_relationships: false, can_view_linkedin: false,
  can_view_analytics: false, can_access_clients: false,
}

const ROLE_PRESETS: Record<Exclude<PresetKey, "custom">, Partial<TeamMemberFormData>> = {
  admin: {
    can_view_tasks: true, can_perform_tasks: true, can_update_task_status: true,
    can_create_tasks: true, can_view_projects: true, can_create_projects: true,
    can_view_calendar: true, can_view_relationships: true,
    can_view_vault: true, can_view_analytics: true, can_access_clients: true,
    can_access_inbox: true,
  },
  pm: {
    can_view_tasks: true, can_perform_tasks: true, can_update_task_status: true,
    can_create_tasks: true, can_view_projects: true, can_create_projects: true,
    can_view_calendar: true, can_view_vault: true, can_access_inbox: true,
    can_view_relationships: true,
  },
  executor: {
    can_view_tasks: true, can_perform_tasks: true, can_update_task_status: true,
    can_view_projects: true, can_view_calendar: true, can_view_vault: true,
    can_access_inbox: true,
  },
  sales: {
    can_view_tasks: true, can_perform_tasks: true, can_update_task_status: true,
    can_view_calendar: true, can_view_relationships: true,
    can_access_inbox: true, can_view_vault: true,
  },
  analyst: {
    can_view_tasks: true, can_view_projects: true, can_view_analytics: true,
    can_view_calendar: true, can_view_vault: true, can_access_inbox: true,
  },
}

const PRESET_META: Record<PresetKey, { label: string; desc: string }> = {
  admin:    { label: "Admin",            desc: "Full operational control — co-founders, ops heads, senior managers." },
  pm:       { label: "Project Manager",  desc: "Runs projects and manages team delivery. No social or analytics access." },
  executor: { label: "Team Member",      desc: "Completes assigned work only — designers, developers, marketers, writers." },
  sales:    { label: "Sales / Outreach", desc: "CRM, outreach and communication. No project or task management." },
  analyst:  { label: "Analyst",          desc: "Data monitoring and reporting only." },
  custom:   { label: "Custom",           desc: "Manually configured — adjust any toggles below." },
}

// ── Permission definitions ─────────────────────────────────────────────────

const PERM_GROUPS = [
  {
    label: "Tasks",
    perms: [
      { key: "can_view_tasks",    label: "View tasks",    desc: "See the founder's full task board" },
      { key: "can_perform_tasks", label: "Perform tasks", desc: "Mark assigned tasks complete" },
      { key: "can_create_tasks",  label: "Manage tasks",  desc: "Create, edit and delete any task" },
    ],
  },
  {
    label: "Projects",
    perms: [
      { key: "can_view_projects",   label: "View projects",   desc: "Browse active projects" },
      { key: "can_create_projects", label: "Create projects", desc: "Spin up and manage new projects" },
    ],
  },
  {
    label: "Access",
    perms: [
      { key: "can_view_calendar",      label: "Calendar",       desc: "View and manage events" },
      { key: "can_view_vault",         label: "Vault",          desc: "Access project files and deliverables" },
      { key: "can_access_inbox",       label: "Inbox",          desc: "Send and receive messages" },
      { key: "can_view_relationships", label: "Relationships",  desc: "CRM and contact management" },
      { key: "can_view_analytics",     label: "Analytics",      desc: "View workspace metrics" },
    ],
  },
]

const PERM_LABELS: Record<string, string> = {
  can_view_tasks: "View tasks", can_perform_tasks: "Perform tasks", can_create_tasks: "Manage tasks",
  can_view_projects: "View projects", can_create_projects: "Create projects",
  can_view_calendar: "Calendar", can_view_vault: "Vault", can_access_inbox: "Inbox",
  can_view_relationships: "Relationships",
  can_view_analytics: "Analytics", can_access_clients: "Manage clients",
}

// Dependency map: enabling A also enables deps
const PERM_DEPS: Record<string, string[]> = {
  can_perform_tasks:  ["can_view_tasks"],
  can_create_tasks:   ["can_view_tasks"],
  can_create_projects:["can_view_projects"],
}

// ── Sub-components ─────────────────────────────────────────────────────────

function PermToggleRow({
  label, desc, checked, onToggle,
}: { label: string; desc: string; checked: boolean; onToggle: () => void }) {
  return (
    <div className="flex items-center justify-between py-2.5 border-b border-border/40 last:border-0 gap-3">
      <div className="min-w-0">
        <p className="text-sm text-foreground">{label}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{desc}</p>
      </div>
      <Switch checked={checked} onCheckedChange={onToggle} className="shrink-0" />
    </div>
  )
}

function StepDot({ n, active }: { n: number; active: boolean }) {
  return (
    <div className={cn(
      "w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium shrink-0 transition-colors",
      active ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground border border-border"
    )}>{n}</div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────

export function TeamView() {
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([])
  const [loading, setLoading] = useState(true)
  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [selectedMember, setSelectedMember] = useState<TeamMember | null>(null)
  const [meetingDialogOpen, setMeetingDialogOpen] = useState(false)
  const [createStep, setCreateStep] = useState<1 | 2 | 3>(1)
  const [activePreset, setActivePreset] = useState<PresetKey | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const { toast } = useToast()
  const supabase = createClient()

  const defaultForm: TeamMemberFormData = {
    full_name: "", email: "", password: "", position: "",
    ...BLANK_PERMS,
  } as TeamMemberFormData

  const [formData, setFormData] = useState<TeamMemberFormData>(defaultForm)

  useEffect(() => { fetchTeamMembers() }, [])

  const fetchTeamMembers = async () => {
    try {
      setLoading(true)
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data, error } = await supabase
        .from("team_members")
        .select(`*, profile:profiles!team_members_user_id_profiles_fkey(full_name, email)`)
        .eq("founder_id", user.id)
        .eq("is_active", true)
      if (error) throw error
      setTeamMembers(data || [])
    } catch (error) {
      console.error("[v0] Error fetching team members:", error)
      toast({ title: "Error", description: "Failed to load team members", variant: "destructive" })
    } finally {
      setLoading(false)
    }
  }

  const applyPreset = (key: PresetKey) => {
    setActivePreset(key)
    if (key === "custom") return
    setFormData(prev => ({ ...prev, ...BLANK_PERMS, ...ROLE_PRESETS[key] }))
  }

  const togglePerm = (key: string) => {
    setActivePreset("custom")
    setFormData(prev => {
      const newVal = !prev[key as keyof TeamMemberFormData]
      const updates: Partial<TeamMemberFormData> = { [key]: newVal }
      if (newVal && PERM_DEPS[key]) {
        PERM_DEPS[key].forEach(dep => { updates[dep as keyof TeamMemberFormData] = true as any })
      }
      return { ...prev, ...updates }
    })
  }

  const handleCreateTeamMember = async () => {
    setIsSubmitting(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error("Not authenticated")

      const response = await fetch("/api/create-team-member", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...formData, can_update_task_status: formData.can_perform_tasks, founder_id: user.id }),
      })

      if (!response.ok) {
        const err = await response.json()
        throw new Error(err.message || "Failed to create team member")
      }

      toast({ title: "Success", description: "Team member created successfully" })
      setFormData(defaultForm)
      setActivePreset(null)
      setCreateStep(1)
      setCreateDialogOpen(false)
      fetchTeamMembers()
    } catch (error: any) {
      toast({ title: "Error", description: error.message || "Failed to create team member", variant: "destructive" })
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleUpdatePermissions = async (memberId: string, updates: Partial<TeamMember>) => {
    try {
      const { error } = await supabase.from("team_members").update(updates).eq("id", memberId)
      if (error) throw error
      toast({ title: "Saved", description: "Permissions updated" })
      fetchTeamMembers()
    } catch {
      toast({ title: "Error", description: "Failed to update permissions", variant: "destructive" })
    }
  }

  const handleDeleteTeamMember = async (userId: string, memberId: string) => {
    try {
      const response = await fetch("/api/delete-team-member", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, memberId }),
      })
      if (!response.ok) {
        const err = await response.json()
        throw new Error(err.message)
      }
      toast({ title: "Deleted", description: "Team member removed" })
      setDeleteDialogOpen(false)
      fetchTeamMembers()
    } catch (error: any) {
      toast({ title: "Error", description: error.message || "Failed to delete", variant: "destructive" })
    }
  }

  const activePermLabels = Object.entries(formData)
    .filter(([k, v]) => v === true && PERM_LABELS[k])
    .map(([k]) => PERM_LABELS[k])

  return (
    <div className="flex-1 space-y-6 p-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Team Workspace</h2>
          <p className="text-muted-foreground">Manage your team members and their permissions</p>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => setMeetingDialogOpen(true)} variant="outline">
            <Calendar className="mr-2 h-4 w-4" />
            Schedule Meeting
          </Button>

          {/* ── Create dialog ── */}
          <Dialog open={createDialogOpen} onOpenChange={(open) => {
            setCreateDialogOpen(open)
            if (!open) { setCreateStep(1); setFormData(defaultForm); setActivePreset(null) }
          }}>
            <DialogTrigger asChild>
              <Button><UserPlus className="mr-2 h-4 w-4" />Add Team Member</Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[560px] max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Add Team Member</DialogTitle>
                <DialogDescription>Set up their account and permissions in 3 steps.</DialogDescription>
              </DialogHeader>

              {/* Step indicator */}
              <div className="flex items-center gap-2 py-2">
                <StepDot n={1} active={createStep === 1} />
                <span className={cn("text-xs", createStep === 1 ? "text-foreground font-medium" : "text-muted-foreground")}>Account</span>
                <div className="flex-1 h-px bg-border mx-1" />
                <StepDot n={2} active={createStep === 2} />
                <span className={cn("text-xs", createStep === 2 ? "text-foreground font-medium" : "text-muted-foreground")}>Permissions</span>
                <div className="flex-1 h-px bg-border mx-1" />
                <StepDot n={3} active={createStep === 3} />
                <span className={cn("text-xs", createStep === 3 ? "text-foreground font-medium" : "text-muted-foreground")}>Review</span>
              </div>

              {/* ── Step 1: Account ── */}
              {createStep === 1 && (
                <div className="space-y-4 pt-2">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs uppercase tracking-wider text-muted-foreground font-medium">Full name</Label>
                      <Input placeholder="Alex Johnson" value={formData.full_name} onChange={e => setFormData({ ...formData, full_name: e.target.value })} />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs uppercase tracking-wider text-muted-foreground font-medium">Position</Label>
                      <div className="relative">
                        <Briefcase className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                        <Input className="pl-9" placeholder="Operations Manager" value={formData.position} onChange={e => setFormData({ ...formData, position: e.target.value })} />
                      </div>
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs uppercase tracking-wider text-muted-foreground font-medium">Email</Label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                      <Input className="pl-9" type="email" placeholder="alex@company.com" value={formData.email} onChange={e => setFormData({ ...formData, email: e.target.value })} />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs uppercase tracking-wider text-muted-foreground font-medium">Password</Label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                      <Input className="pl-9" type="password" placeholder="Min. 6 characters" minLength={6} value={formData.password} onChange={e => setFormData({ ...formData, password: e.target.value })} />
                    </div>
                    <p className="text-xs text-muted-foreground">They can change this after first login</p>
                  </div>
                  <div className="flex justify-end pt-2">
                    <Button
                      onClick={() => setCreateStep(2)}
                      disabled={!formData.full_name.trim() || !formData.email.trim() || !formData.password || !formData.position.trim()}
                    >
                      Next →
                    </Button>
                  </div>
                </div>
              )}

              {/* ── Step 2: Permissions ── */}
              {createStep === 2 && (
                <div className="space-y-4 pt-2">
                  {/* Preset pills */}
                  <div className="space-y-2">
                    <p className="text-xs uppercase tracking-wider text-muted-foreground font-medium">Role preset</p>
                    <div className="flex flex-wrap gap-2">
                      {(Object.keys(PRESET_META) as PresetKey[]).filter(k => k !== "custom").map(key => (
                        <button
                          key={key}
                          type="button"
                          onClick={() => applyPreset(key)}
                          className={cn(
                            "text-xs px-3 py-1.5 rounded-full border transition-colors",
                            activePreset === key
                              ? "bg-primary text-primary-foreground border-primary"
                              : "border-border text-muted-foreground hover:border-primary/50 hover:text-foreground"
                          )}
                        >
                          {PRESET_META[key].label}
                        </button>
                      ))}
                      {activePreset === "custom" && (
                        <span className="text-xs px-3 py-1.5 rounded-full border border-border text-muted-foreground bg-muted">Custom</span>
                      )}
                    </div>
                    {activePreset && activePreset !== "custom" && (
                      <p className="text-xs text-muted-foreground">{PRESET_META[activePreset].desc}</p>
                    )}
                  </div>

                  {/* Permission groups */}
                  <div className="border border-border/50 rounded-lg overflow-hidden divide-y divide-border/50">
                    {PERM_GROUPS.map(group => (
                      <div key={group.label}>
                        <div className="px-4 py-2 bg-muted/40">
                          <p className="text-[10px] uppercase tracking-widest font-medium text-muted-foreground">{group.label}</p>
                        </div>
                        <div className="px-4">
                          {group.perms.map(p => (
                            <PermToggleRow
                              key={p.key}
                              label={p.label}
                              desc={p.desc}
                              checked={!!formData[p.key as keyof TeamMemberFormData]}
                              onToggle={() => togglePerm(p.key)}
                            />
                          ))}
                        </div>
                      </div>
                    ))}

                    {/* Manage clients — special section */}
                    <div>
                      <div className="px-4 py-2 bg-muted/40">
                        <p className="text-[10px] uppercase tracking-widest font-medium text-muted-foreground">Client management</p>
                      </div>
                      <div className="px-4">
                        <div className="flex items-start justify-between py-2.5 gap-3">
                          <div className="min-w-0">
                            <p className="text-sm text-foreground">Manage clients</p>
                            <p className="text-xs text-muted-foreground mt-0.5">Add clients, create portal credentials, view client list</p>
                            <div className="flex items-center gap-1.5 mt-2 px-2 py-1 bg-muted rounded-md w-fit">
                              <Info size={11} className="text-muted-foreground shrink-0" />
                              <span className="text-[10px] text-muted-foreground">For your team only — not a client-facing permission</span>
                            </div>
                          </div>
                          <Switch
                            checked={formData.can_access_clients}
                            onCheckedChange={() => togglePerm("can_access_clients")}
                            className="shrink-0 mt-1"
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="flex justify-between pt-2">
                    <Button variant="outline" onClick={() => setCreateStep(1)}>← Back</Button>
                    <Button onClick={() => setCreateStep(3)}>Next →</Button>
                  </div>
                </div>
              )}

              {/* ── Step 3: Review ── */}
              {createStep === 3 && (
                <div className="space-y-4 pt-2">
                  <div className="border border-border/50 rounded-lg p-4 space-y-4">
                    {/* Member summary */}
                    <div className="flex items-center gap-3 pb-4 border-b border-border/40">
                      <div className="w-11 h-11 rounded-full bg-primary/10 flex items-center justify-center text-primary font-semibold text-sm shrink-0">
                        {formData.full_name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2)}
                      </div>
                      <div>
                        <p className="font-medium text-sm">{formData.full_name}</p>
                        <p className="text-xs text-muted-foreground">{formData.position} · {formData.email}</p>
                        {activePreset && activePreset !== "custom" && (
                          <p className="text-xs text-muted-foreground mt-0.5">Role: {PRESET_META[activePreset].label}</p>
                        )}
                      </div>
                    </div>

                    {/* Permission chips */}
                    <div>
                      <p className="text-xs uppercase tracking-wider text-muted-foreground font-medium mb-2">Permissions granted</p>
                      {activePermLabels.length > 0 ? (
                        <div className="flex flex-wrap gap-1.5">
                          {activePermLabels.map(label => (
                            <span key={label} className="text-xs px-2.5 py-1 rounded-full bg-primary/10 text-primary border border-primary/20">
                              {label}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 px-3 py-2 bg-muted rounded-md border border-border">
                          <Info size={13} className="text-muted-foreground" />
                          <span className="text-xs text-muted-foreground">No permissions selected — this member won't see anything yet</span>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex justify-between pt-2">
                    <Button variant="outline" onClick={() => setCreateStep(2)}>← Back</Button>
                    <Button onClick={handleCreateTeamMember} disabled={isSubmitting}>
                      {isSubmitting ? "Creating…" : "Create team member"}
                    </Button>
                  </div>
                </div>
              )}
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <TeamMeetingsDialog
        open={meetingDialogOpen}
        onOpenChange={setMeetingDialogOpen}
        onMeetingCreated={() => fetchTeamMembers()}
        teamMembers={teamMembers}
      />

      {/* ── Member list ── */}
      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="text-muted-foreground">Loading team members...</div>
        </div>
      ) : teamMembers.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <UserPlus className="h-10 w-10 text-muted-foreground/30 mb-4" />
          <h3 className="text-base font-medium mb-1">No team members yet</h3>
          <p className="text-sm text-muted-foreground mb-4">Create your first team member to start delegating tasks</p>
          <Button onClick={() => setCreateDialogOpen(true)}>
            <UserPlus className="mr-2 h-4 w-4" />Add Team Member
          </Button>
        </div>
      ) : (
        <div className="grid gap-3">
          {teamMembers.map((member) => (
            <div key={member.id} className="border border-border/50 rounded-xl p-4 bg-card hover:border-primary/20 transition-colors">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-semibold text-sm shrink-0">
                    {(member.profile?.full_name || "?").split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2)}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold text-sm">{member.profile?.full_name ?? "Unnamed"}</p>
                      <Badge variant={member.is_active ? "default" : "secondary"} className="text-[10px]">
                        {member.is_active ? "Active" : "Inactive"}
                      </Badge>
                      {member.can_access_clients && (
                        <Badge variant="secondary" className="text-[10px]">Manage clients</Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">{member.profile?.email} · {member.position}</p>
                  </div>
                </div>
                <div className="flex gap-1.5 shrink-0">
                  <Button variant="outline" size="sm" onClick={() => { setSelectedMember(member); setEditDialogOpen(true) }}>
                    <Edit className="h-3.5 w-3.5" />
                  </Button>
                  <Button variant="outline" size="sm" className="text-destructive hover:bg-destructive/10" onClick={() => { setSelectedMember(member); setDeleteDialogOpen(true) }}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>

              {/* Permission badges */}
              <div className="mt-3 flex flex-wrap gap-1.5">
                {Object.entries(PERM_LABELS).map(([key, label]) =>
                  member[key as keyof TeamMember] ? (
                    <span key={key} className="text-[10px] px-2 py-0.5 rounded-full border border-border/60 text-muted-foreground bg-muted/40">
                      {label}
                    </span>
                  ) : null
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Edit dialog ── */}
      {selectedMember && (
        <>
          <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
            <DialogContent className="sm:max-w-[500px] max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Edit permissions</DialogTitle>
                <DialogDescription>{selectedMember.profile?.full_name} · {selectedMember.position}</DialogDescription>
              </DialogHeader>

              <div className="space-y-4 pt-2">
                {/* Active toggle */}
                <div className="flex items-center justify-between px-4 py-3 bg-muted/40 rounded-lg border border-border/50">
                  <div>
                    <p className="text-sm font-medium">Account active</p>
                    <p className="text-xs text-muted-foreground">Disable to block access without deleting</p>
                  </div>
                  <Switch
                    checked={selectedMember.is_active}
                    onCheckedChange={(checked) => {
                      handleUpdatePermissions(selectedMember.id, { is_active: checked })
                      setSelectedMember({ ...selectedMember, is_active: checked })
                    }}
                  />
                </div>

                {/* Permission groups */}
                <div className="border border-border/50 rounded-lg overflow-hidden divide-y divide-border/50">
                  {PERM_GROUPS.map(group => (
                    <div key={group.label}>
                      <div className="px-4 py-2 bg-muted/40">
                        <p className="text-[10px] uppercase tracking-widest font-medium text-muted-foreground">{group.label}</p>
                      </div>
                      <div className="px-4">
                        {group.perms.map(p => (
                          <PermToggleRow
                            key={p.key}
                            label={p.label}
                            desc={p.desc}
                            checked={!!selectedMember[p.key as keyof TeamMember]}
                            onToggle={() => {
                              const newVal = !selectedMember[p.key as keyof TeamMember]
                              const updates: Partial<TeamMember> = { [p.key]: newVal }
                              if (newVal && PERM_DEPS[p.key]) {
                                PERM_DEPS[p.key].forEach(dep => { updates[dep as keyof TeamMember] = true as any })
                              }
                              handleUpdatePermissions(selectedMember.id, updates)
                              setSelectedMember({ ...selectedMember, ...updates })
                            }}
                          />
                        ))}
                      </div>
                    </div>
                  ))}

                  {/* Manage clients */}
                  <div>
                    <div className="px-4 py-2 bg-muted/40">
                      <p className="text-[10px] uppercase tracking-widest font-medium text-muted-foreground">Client management</p>
                    </div>
                    <div className="px-4">
                      <div className="flex items-start justify-between py-2.5 gap-3">
                        <div className="min-w-0">
                          <p className="text-sm text-foreground">Manage clients</p>
                          <p className="text-xs text-muted-foreground mt-0.5">Add clients, create portal credentials, view client list</p>
                          <div className="flex items-center gap-1.5 mt-2 px-2 py-1 bg-muted rounded-md w-fit">
                            <Info size={11} className="text-muted-foreground shrink-0" />
                            <span className="text-[10px] text-muted-foreground">For your team only — not a client-facing permission</span>
                          </div>
                        </div>
                        <Switch
                          checked={selectedMember.can_access_clients}
                          onCheckedChange={(checked) => {
                            handleUpdatePermissions(selectedMember.id, { can_access_clients: checked })
                            setSelectedMember({ ...selectedMember, can_access_clients: checked })
                          }}
                          className="shrink-0 mt-1"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex justify-end pt-2">
                  <Button onClick={() => setEditDialogOpen(false)}>Done</Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>

          <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete team member?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will permanently remove <strong>{selectedMember.profile?.full_name}</strong> and revoke their access. This cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => handleDeleteTeamMember(selectedMember.user_id, selectedMember.id)}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  Delete
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </>
      )}
    </div>
  )
}