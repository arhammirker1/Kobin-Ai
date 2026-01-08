"use client"

import type React from "react"
import { TeamMeetingsDialog } from "./team-meetings-dialog"
import { Calendar } from "lucide-react"

import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
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
import { UserPlus, Edit, Trash2, Mail, Lock, Briefcase } from "lucide-react"
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
  can_create_tasks: boolean
  can_view_calendar: boolean
  can_view_linkedin: boolean
  can_view_relationships: boolean
  can_view_vault: boolean
  can_view_analytics: boolean
  can_view_projects: boolean // Added can_view_projects permission
  can_create_projects: boolean
  can_access_clients: boolean // Added can_access_clients permission
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
  can_create_tasks: boolean
  can_view_calendar: boolean
  can_view_linkedin: boolean
  can_view_relationships: boolean
  can_view_vault: boolean
  can_view_analytics: boolean
  can_view_projects: boolean
  can_create_projects: boolean
  can_access_clients: boolean // Added can_access_clients permission
}

export function TeamView() {
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([])
  const [loading, setLoading] = useState(true)
  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [selectedMember, setSelectedMember] = useState<TeamMember | null>(null)
  const [meetingDialogOpen, setMeetingDialogOpen] = useState(false)
  const { toast } = useToast()
  const supabase = createClient()

  const defaultForm: TeamMemberFormData = {
    full_name: "",
    email: "",
    password: "",
    position: "",
    can_view_tasks: false,
    can_update_task_status: false,
    can_create_tasks: false,
    can_view_calendar: false,
    can_view_linkedin: false,
    can_view_relationships: false,
    can_view_vault: false,
    can_view_analytics: false,
    can_view_projects: false,
    can_create_projects: false,
    can_access_clients: false, // Added can_access_clients to form state
  }

  const [formData, setFormData] = useState<TeamMemberFormData>(defaultForm)

  useEffect(() => {
    fetchTeamMembers()
  }, [])

  const fetchTeamMembers = async () => {
    try {
      setLoading(true)
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) return

      const { data, error } = await supabase
        .from("team_members")
        .select(`
          *,
          profile:profiles!team_members_user_id_profiles_fkey(full_name, email)
        `)
        .eq("founder_id", user.id)
        .eq("is_active", true)

      if (error) throw error
      setTeamMembers(data || [])
    } catch (error) {
      console.error("[v0] Error fetching team members:", error)
      toast({
        title: "Error",
        description: "Failed to load team members",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  const handleCreateTeamMember = async (e: React.FormEvent) => {
    e.preventDefault()

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) throw new Error("Not authenticated")

      // Call edge function to create team member with auth account
      const response = await fetch("/api/create-team-member", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...formData,
          founder_id: user.id,
        }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.message || "Failed to create team member")
      }

      toast({
        title: "Success",
        description: "Team member created successfully",
      })

      setFormData(defaultForm)
      setCreateDialogOpen(false)
      fetchTeamMembers()
    } catch (error: any) {
      console.error("[v0] Error creating team member:", error)
      toast({
        title: "Error",
        description: error.message || "Failed to create team member",
        variant: "destructive",
      })
    }
  }

  const handleUpdatePermissions = async (memberId: string, updates: Partial<TeamMember>) => {
    try {
      const { error } = await supabase.from("team_members").update(updates).eq("id", memberId)

      if (error) throw error

      toast({
        title: "Success",
        description: "Permissions updated successfully",
      })

      fetchTeamMembers()
    } catch (error) {
      console.error("[v0] Error updating permissions:", error)
      toast({
        title: "Error",
        description: "Failed to update permissions",
        variant: "destructive",
      })
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
        const error = await response.json()
        throw new Error(error.message || "Failed to delete team member")
      }

      toast({
        title: "Success",
        description: "Team member deleted successfully",
      })

      setDeleteDialogOpen(false)
      fetchTeamMembers()
    } catch (error: any) {
      console.error("[v0] Error deleting team member:", error)
      toast({
        title: "Error",
        description: error.message || "Failed to delete team member",
        variant: "destructive",
      })
    }
  }

  const handleCreateMeeting = () => {
    setMeetingDialogOpen(true)
  }

  const openEditDialog = (member: TeamMember) => {
    setSelectedMember(member)
    setEditDialogOpen(true)
  }

  const openDeleteDialog = (member: TeamMember) => {
    setSelectedMember(member)
    setDeleteDialogOpen(true)
  }

  return (
    <div className="flex-1 space-y-6 p-8">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Team Workspace</h2>
          <p className="text-muted-foreground">Manage your team members and their permissions</p>
        </div>
        <div className="flex gap-2">
          <Button onClick={handleCreateMeeting} variant="outline">
            <Calendar className="mr-2 h-4 w-4" />
            Schedule Meeting
          </Button>
          <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <UserPlus className="mr-2 h-4 w-4" />
                Add Team Member
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Create Team Member</DialogTitle>
                <DialogDescription>
                  Manually create a team member account. You will set their credentials and permissions.
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleCreateTeamMember} className="space-y-6">
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="full_name">Full Name</Label>
                    <Input
                      id="full_name"
                      value={formData.full_name}
                      onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="email">Email</Label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="email"
                        type="email"
                        className="pl-10"
                        value={formData.email}
                        onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                        required
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="password">Password</Label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="password"
                        type="password"
                        className="pl-10"
                        value={formData.password}
                        onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                        required
                        minLength={6}
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">Minimum 6 characters</p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="position">Position</Label>
                    <div className="relative">
                      <Briefcase className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="position"
                        className="pl-10"
                        value={formData.position}
                        onChange={(e) => setFormData({ ...formData, position: e.target.value })}
                        placeholder="e.g., Executive Assistant, Operations Manager"
                        required
                      />
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <h4 className="font-medium">Feature Permissions</h4>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="can_view_tasks" className="font-normal">
                        View Tasks
                      </Label>
                      <Switch
                        id="can_view_tasks"
                        checked={formData.can_view_tasks}
                        onCheckedChange={(checked) => setFormData({ ...formData, can_view_tasks: checked })}
                      />
                    </div>
                    <div className="flex items-center justify-between">
                      <Label htmlFor="can_update_task_status" className="font-normal">
                        Update Task Status
                      </Label>
                      <Switch
                        id="can_update_task_status"
                        checked={formData.can_update_task_status}
                        onCheckedChange={(checked) => setFormData({ ...formData, can_update_task_status: checked })}
                      />
                    </div>
                    <div className="flex items-center justify-between">
                      <Label htmlFor="can_create_tasks" className="font-normal">
                        Create Tasks
                      </Label>
                      <Switch
                        id="can_create_tasks"
                        checked={formData.can_create_tasks}
                        onCheckedChange={(checked) => setFormData({ ...formData, can_create_tasks: checked })}
                      />
                    </div>
                    <div className="flex items-center justify-between">
                      <Label htmlFor="can_view_projects" className="font-normal">
                        View Projects
                      </Label>
                      <Switch
                        id="can_view_projects"
                        checked={formData.can_view_projects}
                        onCheckedChange={(checked) => setFormData({ ...formData, can_view_projects: checked })}
                      />
                    </div>
                    <div className="flex items-center justify-between">
                      <Label htmlFor="can_create_projects" className="font-normal">
                        Create Projects
                      </Label>
                      <Switch
                        id="can_create_projects"
                        checked={formData.can_create_projects}
                        onCheckedChange={(checked) => setFormData({ ...formData, can_create_projects: checked })}
                      />
                    </div>
                    <div className="flex items-center justify-between">
                      <Label htmlFor="can_view_calendar" className="font-normal">
                        View Calendar
                      </Label>
                      <Switch
                        id="can_view_calendar"
                        checked={formData.can_view_calendar}
                        onCheckedChange={(checked) => setFormData({ ...formData, can_view_calendar: checked })}
                      />
                    </div>
                    <div className="flex items-center justify-between">
                      <Label htmlFor="can_view_linkedin" className="font-normal">
                        View LinkedIn
                      </Label>
                      <Switch
                        id="can_view_linkedin"
                        checked={formData.can_view_linkedin}
                        onCheckedChange={(checked) => setFormData({ ...formData, can_view_linkedin: checked })}
                      />
                    </div>
                    <div className="flex items-center justify-between">
                      <Label htmlFor="can_view_relationships" className="font-normal">
                        View Relationships
                      </Label>
                      <Switch
                        id="can_view_relationships"
                        checked={formData.can_view_relationships}
                        onCheckedChange={(checked) => setFormData({ ...formData, can_view_relationships: checked })}
                      />
                    </div>
                    <div className="flex items-center justify-between">
                      <Label htmlFor="can_view_vault" className="font-normal">
                        View Vault
                      </Label>
                      <Switch
                        id="can_view_vault"
                        checked={formData.can_view_vault}
                        onCheckedChange={(checked) => setFormData({ ...formData, can_view_vault: checked })}
                      />
                    </div>
                    <div className="flex items-center justify-between">
                      <Label htmlFor="can_view_analytics" className="font-normal">
                        View Analytics
                      </Label>
                      <Switch
                        id="can_view_analytics"
                        checked={formData.can_view_analytics}
                        onCheckedChange={(checked) => setFormData({ ...formData, can_view_analytics: checked })}
                      />
                    </div>
                    <div className="flex items-center justify-between">
                      <Label htmlFor="can_access_clients" className="font-normal">
                        Client Portal
                      </Label>
                      <Switch
                        id="can_access_clients"
                        checked={formData.can_access_clients}
                        onCheckedChange={(checked) => setFormData({ ...formData, can_access_clients: checked })}
                      />
                    </div>
                  </div>
                </div>

                <div className="flex justify-end gap-2">
                  <Button type="button" variant="outline" onClick={() => setCreateDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button type="submit">Create Team Member</Button>
                </div>
              </form>
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

      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="text-muted-foreground">Loading team members...</div>
        </div>
      ) : teamMembers.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <UserPlus className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">No team members yet</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Create your first team member to start delegating tasks
            </p>
            <Button onClick={() => setCreateDialogOpen(true)}>
              <UserPlus className="mr-2 h-4 w-4" />
              Add Team Member
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {teamMembers.map((member) => (
            <Card key={member.id}>
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <CardTitle>{member.profile?.full_name ?? "Unnamed User"}</CardTitle>
                      <Badge variant={member.is_active ? "default" : "secondary"}>
                        {member.is_active ? "Active" : "Inactive"}
                      </Badge>
                      {member.can_access_clients && (
                        <Badge variant="secondary" className="text-[10px]">
                          Client Portal
                        </Badge>
                      )}
                    </div>
                    <CardDescription>{member.profile?.email ?? "No email"}</CardDescription>
                    <p className="text-sm text-muted-foreground">{member.position}</p>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => openEditDialog(member)}>
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-destructive hover:bg-destructive/10 bg-transparent"
                      onClick={() => openDeleteDialog(member)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div>
                    <h4 className="text-sm font-medium mb-3">Permissions</h4>
                    <div className="flex flex-wrap gap-2">
                      {member.can_view_tasks && <Badge variant="outline">View Tasks</Badge>}
                      {member.can_update_task_status && <Badge variant="outline">Update Tasks</Badge>}
                      {member.can_create_tasks && <Badge variant="outline">Create Tasks</Badge>}
                      {member.can_view_projects && <Badge variant="outline">View Projects</Badge>}
                      {member.can_create_projects && <Badge variant="outline">Create Projects</Badge>}
                      {member.can_view_calendar && <Badge variant="outline">Calendar</Badge>}
                      {member.can_view_linkedin && <Badge variant="outline">LinkedIn</Badge>}
                      {member.can_view_relationships && <Badge variant="outline">Relationships</Badge>}
                      {member.can_view_vault && <Badge variant="outline">Vault</Badge>}
                      {member.can_view_analytics && <Badge variant="outline">Analytics</Badge>}
                      {member.can_access_clients && <Badge variant="outline">Client Portal</Badge>}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {selectedMember && (
        <>
          <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Edit Team Member</DialogTitle>
                <DialogDescription>
                  Update permissions and settings for {selectedMember.profile?.full_name ?? "this user"}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-6">
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="edit_is_active">Account Active</Label>
                    <Switch
                      id="edit_is_active"
                      checked={selectedMember.is_active}
                      onCheckedChange={(checked) => {
                        handleUpdatePermissions(selectedMember.id, { is_active: checked })
                        setSelectedMember({ ...selectedMember, is_active: checked })
                      }}
                    />
                  </div>
                </div>

                <div className="space-y-4">
                  <h4 className="font-medium">Feature Permissions</h4>
                  <div className="grid grid-cols-2 gap-4">
                    {[
                      { key: "can_view_tasks", label: "View Tasks" },
                      { key: "can_update_task_status", label: "Update Task Status" },
                      { key: "can_create_tasks", label: "Create Tasks" },
                      { key: "can_view_projects", label: "View Projects" },
                      { key: "can_create_projects", label: "Create Projects" },
                      { key: "can_view_calendar", label: "View Calendar" },
                      { key: "can_view_linkedin", label: "View LinkedIn" },
                      { key: "can_view_relationships", label: "View Relationships" },
                      { key: "can_view_vault", label: "View Vault" },
                      { key: "can_view_analytics", label: "View Analytics" },
                      { key: "can_access_clients", label: "Client Portal" },
                    ].map(({ key, label }) => (
                      <div key={key} className="flex items-center justify-between">
                        <Label htmlFor={`edit_${key}`} className="text-sm font-normal cursor-pointer">
                          {label}
                        </Label>
                        <Switch
                          id={`edit_${key}`}
                          checked={selectedMember[key as keyof TeamMember] as boolean}
                          onCheckedChange={(checked) => {
                            handleUpdatePermissions(selectedMember.id, { [key]: checked })
                            setSelectedMember({ ...selectedMember, [key]: checked })
                          }}
                        />
                      </div>
                    ))}
                  </div>
                </div>

                <div className="flex justify-end">
                  <Button onClick={() => setEditDialogOpen(false)}>Done</Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>

          <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will permanently delete <strong>{selectedMember.profile?.full_name}</strong>. This action cannot
                  be undone.
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
