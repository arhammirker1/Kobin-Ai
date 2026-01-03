"use client"

import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { useRouter } from "next/navigation"
import { LogOut, User, CheckCircle2, Clock, AlertCircle } from "lucide-react"
import { useToast } from "@/hooks/use-toast"

interface TeamMemberPermissions {
  id: string
  user_id: string
  founder_id: string
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
}

interface Task {
  id: string
  title: string
  status: string
  priority: string
  bucket: string
  deadline: string | null
  created_at: string
}

interface Profile {
  full_name: string
  email: string
}

export function TeamMemberDashboard({ permissions }: { permissions: TeamMemberPermissions }) {
  const [tasks, setTasks] = useState<Task[]>([])
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const router = useRouter()
  const { toast } = useToast()
  const supabase = createClient()

  useEffect(() => {
    fetchData()
  }, [])

  const fetchData = async () => {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) return

      // Fetch profile
      const { data: profileData } = await supabase
        .from("profiles")
        .select("full_name, email")
        .eq("id", user.id)
        .single()
      setProfile(profileData)

      // Fetch assigned tasks if permission granted
      if (permissions.can_view_tasks) {
        const { data: tasksData, error } = await supabase
          .from("tasks")
          .select("*")
          .eq("assigned_to", user.id)
          .order("created_at", { ascending: false })

        if (error) throw error
        setTasks(tasksData || [])
      }
    } catch (error) {
      console.error("[v0] Error fetching data:", error)
      toast({
        title: "Error",
        description: "Failed to load dashboard data",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  const handleSignOut = async () => {
    try {
      await supabase.auth.signOut()
      router.push("/login")
    } catch (error) {
      console.error("[v0] Sign out error:", error)
      toast({
        title: "Error",
        description: "Failed to sign out",
        variant: "destructive",
      })
    }
  }

  const handleUpdateTaskStatus = async (taskId: string, newStatus: string) => {
    if (!permissions.can_update_task_status) {
      toast({
        title: "Permission Denied",
        description: "You don't have permission to update task status",
        variant: "destructive",
      })
      return
    }

    try {
      const { error } = await supabase.from("tasks").update({ status: newStatus }).eq("id", taskId)

      if (error) throw error

      toast({
        title: "Success",
        description: "Task status updated",
      })

      fetchData()
    } catch (error) {
      console.error("[v0] Error updating task:", error)
      toast({
        title: "Error",
        description: "Failed to update task status",
        variant: "destructive",
      })
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case "completed":
        return "bg-green-500/10 text-green-600 dark:text-green-400"
      case "in-progress":
        return "bg-blue-500/10 text-blue-600 dark:text-blue-400"
      case "todo":
        return "bg-slate-500/10 text-slate-600 dark:text-slate-400"
      default:
        return "bg-slate-500/10 text-slate-600 dark:text-slate-400"
    }
  }

  const getPriorityColor = (priority: string) => {
    switch (priority?.toLowerCase()) {
      case "high":
        return "destructive"
      case "medium":
        return "secondary"
      case "low":
        return "outline"
      default:
        return "outline"
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading dashboard...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="container mx-auto px-6 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Team Dashboard</h1>
            <p className="text-sm text-muted-foreground">Welcome back, {profile?.full_name}</p>
          </div>
          <Button variant="outline" onClick={handleSignOut}>
            <LogOut className="mr-2 h-4 w-4" />
            Sign Out
          </Button>
        </div>
      </header>

      <div className="container mx-auto px-6 py-8 space-y-6">
        {/* Profile Card */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-4">
              <div className="size-12 rounded-full bg-primary/10 flex items-center justify-center">
                <User className="h-6 w-6 text-primary" />
              </div>
              <div>
                <CardTitle>{profile?.full_name}</CardTitle>
                <CardDescription>{permissions.position}</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="text-sm">
                <span className="text-muted-foreground">Email:</span>{" "}
                <span className="font-medium">{profile?.email}</span>
              </div>
              <div className="text-sm">
                <span className="text-muted-foreground">Role:</span> <span className="font-medium">Team Member</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* My Tasks Section */}
        {permissions.can_view_tasks ? (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-bold">My Tasks</h2>
                <p className="text-sm text-muted-foreground">Tasks assigned to you</p>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="flex items-center gap-1">
                  <CheckCircle2 className="h-3 w-3" />
                  {tasks.filter((t) => t.status === "completed").length} Completed
                </Badge>
                <Badge variant="outline" className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {tasks.filter((t) => t.status !== "completed").length} Pending
                </Badge>
              </div>
            </div>

            {tasks.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <AlertCircle className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <h3 className="font-medium mb-2">No tasks assigned yet</h3>
                  <p className="text-sm text-muted-foreground">Your assigned tasks will appear here</p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-4">
                {tasks.map((task) => (
                  <Card key={task.id}>
                    <CardHeader>
                      <div className="flex items-start justify-between">
                        <div className="space-y-2">
                          <CardTitle className="text-lg">{task.title}</CardTitle>
                          <div className="flex items-center gap-2">
                            <Badge variant={getPriorityColor(task.priority)}>{task.priority}</Badge>
                            <Badge className={getStatusColor(task.status)}>{task.status}</Badge>
                            {task.bucket && <Badge variant="outline">{task.bucket}</Badge>}
                          </div>
                        </div>
                      </div>
                    </CardHeader>
                    {permissions.can_update_task_status && (
                      <CardContent>
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            variant={task.status === "todo" ? "default" : "outline"}
                            onClick={() => handleUpdateTaskStatus(task.id, "todo")}
                          >
                            To Do
                          </Button>
                          <Button
                            size="sm"
                            variant={task.status === "in-progress" ? "default" : "outline"}
                            onClick={() => handleUpdateTaskStatus(task.id, "in-progress")}
                          >
                            In Progress
                          </Button>
                          <Button
                            size="sm"
                            variant={task.status === "completed" ? "default" : "outline"}
                            onClick={() => handleUpdateTaskStatus(task.id, "completed")}
                          >
                            Completed
                          </Button>
                        </div>
                      </CardContent>
                    )}
                  </Card>
                ))}
              </div>
            )}
          </div>
        ) : (
          <Card>
            <CardContent className="py-12 text-center">
              <AlertCircle className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="font-medium mb-2">No permissions granted</h3>
              <p className="text-sm text-muted-foreground">Contact your administrator for access</p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}
