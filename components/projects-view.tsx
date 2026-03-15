"use client"

import type React from "react"

import { createProjectChatRoom } from "@/lib/create-project-room"
import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
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
import { useToast } from "@/hooks/use-toast"
import { Plus, Edit, Trash2, FolderOpen, CheckCircle2, Clock, Calendar } from "lucide-react"
import { format } from "date-fns"

interface Project {
  id: string
  name: string
  description: string | null
  status: "active" | "on-hold" | "completed" | "archived"
  priority: "low" | "medium" | "high" | "urgent"
  start_date: string | null
  end_date: string | null
  created_by: string
  founder_id: string
  created_at: string
  updated_at: string
  creator_profile?: {
    full_name: string
  }
  task_count?: number
  completed_task_count?: number
}

interface ProjectFormData {
  name: string
  description: string
  status: "active" | "on-hold" | "completed" | "archived"
  priority: "low" | "medium" | "high" | "urgent"
  start_date: string
  end_date: string
}

interface ProjectsViewProps {
  permissions?: {
    can_create_projects: boolean
    founder_id?: string
  }
}

const defaultFormData: ProjectFormData = {
  name: "",
  description: "",
  status: "active",
  priority: "medium",
  start_date: "",
  end_date: "",
}

export function ProjectsView({ permissions }: ProjectsViewProps = {}) {
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [selectedProject, setSelectedProject] = useState<Project | null>(null)
  const [formData, setFormData] = useState<ProjectFormData>(defaultFormData)
  const [userType, setUserType] = useState<string | null>(null)
  const [canCreateProjects, setCanCreateProjects] = useState(false)
  const { toast } = useToast()
  const supabase = createClient()

  useEffect(() => {
    checkPermissions()
    fetchProjects()
  }, [])

  const checkPermissions = async () => {
    try {
      if (permissions) {
        setCanCreateProjects(permissions.can_create_projects)
        setUserType("team_member")
        return
      }

      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) return

      const { data: profile } = await supabase.from("profiles").select("user_type").eq("id", user.id).single()

      setUserType(profile?.user_type || "founder")

      if (profile?.user_type === "team_member") {
        const { data: teamMember } = await supabase
          .from("team_members")
          .select("can_create_projects")
          .eq("user_id", user.id)
          .single()

        setCanCreateProjects(teamMember?.can_create_projects || false)
      } else {
        setCanCreateProjects(true) // Founders can always create projects
      }
    } catch (error) {
      console.error("[v0] Error checking permissions:", error)
    }
  }

  const fetchProjects = async () => {
    try {
      setLoading(true)
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) return

      let founderId = permissions?.founder_id || user.id

      // If no permissions prop and user is team member, fetch founder_id
      if (!permissions && userType === "team_member") {
        const { data: teamMember } = await supabase
          .from("team_members")
          .select("founder_id")
          .eq("user_id", user.id)
          .single()

        if (teamMember) {
          founderId = teamMember.founder_id
        }
      }

      const { data, error } = await supabase
        .from("projects")
        .select("*")
        .eq("founder_id", founderId)
        .order("created_at", { ascending: false })

      if (error) throw error

      // Fetch all data in 3 flat queries, then join in JS
const projectIds = (data || []).map((p) => p.id)
const creatorIds = [...new Set((data || []).map((p) => p.created_by).filter(Boolean))]

const [profilesRes, allTasksRes] = await Promise.all([
  supabase.from("profiles").select("id, full_name").in("id", creatorIds),
  supabase
    .from("tasks")
    .select("project_id, is_completed")
    .in("project_id", projectIds),
])

const profileMap = Object.fromEntries((profilesRes.data || []).map((p) => [p.id, p]))

const taskCountMap: Record<string, { total: number; completed: number }> = {}
for (const task of allTasksRes.data || []) {
  if (!taskCountMap[task.project_id]) taskCountMap[task.project_id] = { total: 0, completed: 0 }
  taskCountMap[task.project_id].total++
  if (task.is_completed) taskCountMap[task.project_id].completed++
}

const projectsWithProfiles = (data || []).map((project) => ({
  ...project,
  creator_profile: profileMap[project.created_by] ? { full_name: profileMap[project.created_by].full_name } : null,
  task_count: taskCountMap[project.id]?.total || 0,
  completed_task_count: taskCountMap[project.id]?.completed || 0,
}))

      setProjects(projectsWithProfiles)
    } catch (error) {
      console.error("[v0] Error fetching projects:", error)
      toast({
        title: "Error",
        description: "Failed to load projects",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!formData.name.trim()) {
      toast({
        title: "Error",
        description: "Project name is required",
        variant: "destructive",
      })
      return
    }

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) throw new Error("Not authenticated")

      let founderId = permissions?.founder_id || user.id

      // If no permissions prop and user is team member, fetch founder_id
      if (!permissions && userType === "team_member") {
        const { data: teamMember } = await supabase
          .from("team_members")
          .select("founder_id")
          .eq("user_id", user.id)
          .single()

        if (teamMember) {
          founderId = teamMember.founder_id
        }
      }

      const projectData = {
        name: formData.name,
        description: formData.description || null,
        status: formData.status,
        priority: formData.priority,
        start_date: formData.start_date ? new Date(formData.start_date).toISOString() : null,
        end_date: formData.end_date ? new Date(formData.end_date).toISOString() : null,
        created_by: user.id,
        founder_id: founderId,
      }
      const { data: newProject, error } = await supabase
        .from("projects")
        .insert(projectData)
        .select("id, name")
        .single()
      if (error) throw error

      if (newProject) {
        await createProjectChatRoom(
          supabase,
          newProject.id,
          newProject.name,
          user.id,
          founderId
        )  
      }

      toast({
        title: "Success",
        description: "Project created successfully",
      })

      // Auto-create vault folder structure for this project
if (newProject?.id) {
  fetch("/api/vault/create-project-folders", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ 
      project_id: newProject.id, 
      project_name: newProject.name 
    }),
  }).catch(console.warn) // fire and forget — don't block UI
}



      setFormData(defaultFormData)
      setCreateDialogOpen(false)
      fetchProjects()
    } catch (error: any) {
      console.error("[v0] Error creating project:", error)
      toast({
        title: "Error",
        description: error.message || "Failed to create project",
        variant: "destructive",
      })
    }
  }

  const handleUpdateProject = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!selectedProject) return

    if (!formData.name.trim()) {
      toast({
        title: "Error",
        description: "Project name is required",
        variant: "destructive",
      })
      return
    }

    try {
      const projectData = {
        name: formData.name,
        description: formData.description || null,
        status: formData.status,
        priority: formData.priority,
        start_date: formData.start_date ? new Date(formData.start_date).toISOString() : null,
        end_date: formData.end_date ? new Date(formData.end_date).toISOString() : null,
      }

      const { error } = await supabase.from("projects").update(projectData).eq("id", selectedProject.id)

      if (error) throw error

      toast({
        title: "Success",
        description: "Project updated successfully",
      })

      setFormData(defaultFormData)
      setEditDialogOpen(false)
      setSelectedProject(null)
      fetchProjects()
    } catch (error: any) {
      console.error("[v0] Error updating project:", error)
      toast({
        title: "Error",
        description: error.message || "Failed to update project",
        variant: "destructive",
      })
    }
  }

  const handleDeleteProject = async () => {
    if (!selectedProject) return

    try {
      // First, unlink all tasks from this project
      await supabase.from("tasks").update({ project_id: null }).eq("project_id", selectedProject.id)

      // Then delete the project
      const { error } = await supabase.from("projects").delete().eq("id", selectedProject.id)

      if (error) throw error

      toast({
        title: "Success",
        description: "Project deleted successfully",
      })

      setDeleteDialogOpen(false)
      setSelectedProject(null)
      fetchProjects()
    } catch (error: any) {
      console.error("[v0] Error deleting project:", error)
      toast({
        title: "Error",
        description: error.message || "Failed to delete project",
        variant: "destructive",
      })
    }
  }

  const openEditDialog = (project: Project) => {
    setSelectedProject(project)
    setFormData({
      name: project.name,
      description: project.description || "",
      status: project.status,
      priority: project.priority,
      start_date: project.start_date ? format(new Date(project.start_date), "yyyy-MM-dd") : "",
      end_date: project.end_date ? format(new Date(project.end_date), "yyyy-MM-dd") : "",
    })
    setEditDialogOpen(true)
  }

  const openDeleteDialog = (project: Project) => {
    setSelectedProject(project)
    setDeleteDialogOpen(true)
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case "active":
        return "bg-green-100 text-green-700 border-green-300"
      case "on-hold":
        return "bg-yellow-100 text-yellow-700 border-yellow-300"
      case "completed":
        return "bg-blue-100 text-blue-700 border-blue-300"
      case "archived":
        return "bg-gray-100 text-gray-700 border-gray-300"
      default:
        return "bg-gray-100 text-gray-700 border-gray-300"
    }
  }

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case "urgent":
        return "bg-red-100 text-red-700 border-red-300"
      case "high":
        return "bg-orange-100 text-orange-700 border-orange-300"
      case "medium":
        return "bg-yellow-100 text-yellow-700 border-yellow-300"
      case "low":
        return "bg-gray-100 text-gray-700 border-gray-300"
      default:
        return "bg-gray-100 text-gray-700 border-gray-300"
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "active":
        return <Clock className="h-3 w-3" />
      case "completed":
        return <CheckCircle2 className="h-3 w-3" />
      default:
        return null
    }
  }

  return (
    <div className="flex-1 space-y-6 p-8">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Projects</h2>
          <p className="text-muted-foreground">Organize and manage your projects and link tasks to them</p>
        </div>
        {canCreateProjects && (
          <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                Create Project
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-xl">
              <DialogHeader>
                <DialogTitle>Create New Project</DialogTitle>
                <DialogDescription>Add a new project to organize your tasks and track progress.</DialogDescription>
              </DialogHeader>
              <form onSubmit={handleCreateProject} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Project Name</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="Enter project name"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="description">Description</Label>
                  <Textarea
                    id="description"
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    placeholder="Enter project description"
                    rows={3}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="status">Status</Label>
                    <Select
                      value={formData.status}
                      onValueChange={(value: any) => setFormData({ ...formData, status: value })}
                    >
                      <SelectTrigger id="status">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="active">Active</SelectItem>
                        <SelectItem value="on-hold">On Hold</SelectItem>
                        <SelectItem value="completed">Completed</SelectItem>
                        <SelectItem value="archived">Archived</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="priority">Priority</Label>
                    <Select
                      value={formData.priority}
                      onValueChange={(value: any) => setFormData({ ...formData, priority: value })}
                    >
                      <SelectTrigger id="priority">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="low">Low</SelectItem>
                        <SelectItem value="medium">Medium</SelectItem>
                        <SelectItem value="high">High</SelectItem>
                        <SelectItem value="urgent">Urgent</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="start_date">Start Date</Label>
                    <Input
                      id="start_date"
                      type="date"
                      value={formData.start_date}
                      onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="end_date">End Date</Label>
                    <Input
                      id="end_date"
                      type="date"
                      value={formData.end_date}
                      onChange={(e) => setFormData({ ...formData, end_date: e.target.value })}
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setCreateDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button type="submit">Create Project</Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="text-muted-foreground">Loading projects...</div>
        </div>
      ) : projects.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <FolderOpen className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">No projects yet</h3>
            <p className="text-sm text-muted-foreground mb-4 text-center max-w-sm">
              {canCreateProjects
                ? "Create your first project to organize tasks and track progress"
                : "No projects have been created yet. Contact your founder to create projects."}
            </p>
            {canCreateProjects && (
              <Button onClick={() => setCreateDialogOpen(true)}>
                <Plus className="mr-2 h-4 w-4" />
                Create Project
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {projects.map((project) => (
            <Card key={project.id} className="hover:shadow-md transition-shadow">
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="space-y-1 flex-1">
                    <div className="flex items-center gap-2">
                      <FolderOpen className="h-4 w-4 text-muted-foreground" />
                      <CardTitle className="text-lg">{project.name}</CardTitle>
                    </div>
                    <CardDescription className="line-clamp-2">
                      {project.description || "No description"}
                    </CardDescription>
                  </div>
                  {userType === "founder" && (
                    <div className="flex gap-1">
                      <Button variant="ghost" size="sm" onClick={() => openEditDialog(project)}>
                        <Edit className="h-3 w-3" />
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => openDeleteDialog(project)}>
                        <Trash2 className="h-3 w-3 text-destructive" />
                      </Button>
                    </div>
                  )}
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex flex-wrap gap-2">
                  <Badge variant="outline" className={getStatusColor(project.status)}>
                    {getStatusIcon(project.status)}
                    <span className="ml-1">{project.status}</span>
                  </Badge>
                  <Badge variant="outline" className={getPriorityColor(project.priority)}>
                    {project.priority}
                  </Badge>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Tasks</span>
                    <span className="font-medium">
                      {project.completed_task_count || 0} / {project.task_count || 0}
                    </span>
                  </div>
                  <div className="w-full bg-muted rounded-full h-2">
                    <div
                      className="bg-primary rounded-full h-2 transition-all"
                      style={{
                        width: project.task_count
                          ? `${((project.completed_task_count || 0) / project.task_count) * 100}%`
                          : "0%",
                      }}
                    />
                  </div>
                </div>

                {(project.start_date || project.end_date) && (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Calendar className="h-3 w-3" />
                    {project.start_date && <span>{format(new Date(project.start_date), "MMM d, yyyy")}</span>}
                    {project.start_date && project.end_date && <span>-</span>}
                    {project.end_date && <span>{format(new Date(project.end_date), "MMM d, yyyy")}</span>}
                  </div>
                )}

                <div className="text-xs text-muted-foreground">
                  Created by {project.creator_profile?.full_name || "Unknown"}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {selectedProject && userType === "founder" && (
        <>
          <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
            <DialogContent className="max-w-xl">
              <DialogHeader>
                <DialogTitle>Edit Project</DialogTitle>
                <DialogDescription>Update project details and settings.</DialogDescription>
              </DialogHeader>
              <form onSubmit={handleUpdateProject} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="edit_name">Project Name</Label>
                  <Input
                    id="edit_name"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="Enter project name"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit_description">Description</Label>
                  <Textarea
                    id="edit_description"
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    placeholder="Enter project description"
                    rows={3}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="edit_status">Status</Label>
                    <Select
                      value={formData.status}
                      onValueChange={(value: any) => setFormData({ ...formData, status: value })}
                    >
                      <SelectTrigger id="edit_status">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="active">Active</SelectItem>
                        <SelectItem value="on-hold">On Hold</SelectItem>
                        <SelectItem value="completed">Completed</SelectItem>
                        <SelectItem value="archived">Archived</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="edit_priority">Priority</Label>
                    <Select
                      value={formData.priority}
                      onValueChange={(value: any) => setFormData({ ...formData, priority: value })}
                    >
                      <SelectTrigger id="edit_priority">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="low">Low</SelectItem>
                        <SelectItem value="medium">Medium</SelectItem>
                        <SelectItem value="high">High</SelectItem>
                        <SelectItem value="urgent">Urgent</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="edit_start_date">Start Date</Label>
                    <Input
                      id="edit_start_date"
                      type="date"
                      value={formData.start_date}
                      onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="edit_end_date">End Date</Label>
                    <Input
                      id="edit_end_date"
                      type="date"
                      value={formData.end_date}
                      onChange={(e) => setFormData({ ...formData, end_date: e.target.value })}
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setEditDialogOpen(false)
                      setSelectedProject(null)
                      setFormData(defaultFormData)
                    }}
                  >
                    Cancel
                  </Button>
                  <Button type="submit">Save Changes</Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>

          <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete Project</AlertDialogTitle>
                <AlertDialogDescription>
                  Are you sure you want to delete <strong>{selectedProject.name}</strong>? This will unlink all tasks
                  from this project. This action cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel
                  onClick={() => {
                    setDeleteDialogOpen(false)
                    setSelectedProject(null)
                  }}
                >
                  Cancel
                </AlertDialogCancel>
                <AlertDialogAction
                  onClick={handleDeleteProject}
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
