"use client"

import type React from "react"
import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { Calendar, CheckCircle2, Clock, LogOut, Video, Home, CheckSquare, LayoutDashboard } from "lucide-react"
import { toast } from "sonner"
import { format, parseISO } from "date-fns"
import {
  SidebarProvider,
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarGroupContent,
} from "@/components/ui/sidebar"

type Task = {
  id: string
  title: string
  description: string | null
  status: string
  priority: string
  deadline: string | null
  created_at: string
}

type Meeting = {
  id: string
  title: string
  start_time: string
  end_time: string
  meeting_link: string | null
  purpose: string | null
}

type Project = {
  id: string
  name: string
  description: string | null
  status: string
}

export default function ClientPortalPage() {
  const [activeTab, setActiveTab] = useState("Home")
  const [isLoggedIn, setIsLoggedIn] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [clientData, setClientData] = useState<any>(null)
  const [tasks, setTasks] = useState<Task[]>([])
  const [meetings, setMeetings] = useState<Meeting[]>([])
  const [project, setProject] = useState<Project | null>(null)
  const router = useRouter()

  useEffect(() => {
    // Check if already logged in
    const sessionToken = localStorage.getItem("client_session_token")
    if (sessionToken) {
      loadClientData(sessionToken)
    }
  }, [])

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)

    try {
      const response = await fetch("/api/client-auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || "Login failed")
      }

      localStorage.setItem("client_session_token", data.sessionToken)
      setClientData(data.client)
      setIsLoggedIn(true)
      toast.success("Welcome back!")
      await loadClientData(data.sessionToken)
    } catch (error: any) {
      console.error("[v0] Login error:", error)
      toast.error(error.message || "Login failed")
    } finally {
      setIsLoading(false)
    }
  }

  const loadClientData = async (sessionToken: string) => {
    try {
      // In a real implementation, you'd verify the session and load data from an API
      // For now, we'll use the stored client data
      const storedClient = localStorage.getItem("client_data")
      if (storedClient) {
        const client = JSON.parse(storedClient)
        setClientData(client)
        setIsLoggedIn(true)
        // Load tasks, meetings, and project data
        // This would typically be done via API calls
      }
    } catch (error) {
      console.error("[v0] Error loading client data:", error)
      handleLogout()
    }
  }

  const handleLogout = () => {
    localStorage.removeItem("client_session_token")
    localStorage.removeItem("client_data")
    setIsLoggedIn(false)
    setClientData(null)
    setTasks([])
    setMeetings([])
    setProject(null)
    toast.success("Logged out successfully")
  }

  if (!isLoggedIn) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <Card className="w-full max-w-md border-none shadow-lg bg-card/50 backdrop-blur-sm">
          <CardHeader>
            <CardTitle className="text-2xl font-bold text-center">Client Portal</CardTitle>
            <p className="text-center text-muted-foreground text-sm">Sign in to view your projects and tasks</p>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleLogin} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="your@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>
              <Button className="w-full" type="submit" disabled={isLoading}>
                {isLoading ? "Signing in..." : "Sign In"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    )
  }

  const completedTasks = tasks.filter((t) => t.status === "completed").length
  const totalTasks = tasks.length
  const progressPercentage = totalTasks > 0 ? (completedTasks / totalTasks) * 100 : 0

  const upcomingMeetings = meetings.filter((m) => new Date(m.start_time) > new Date())

  const navItems = [
    { title: "Home", icon: Home },
    { title: "Calendar", icon: Calendar },
    { title: "Tasks", icon: CheckSquare },
  ]

  const renderContent = () => {
    if (activeTab === "Home") {
      return (
        <div className="space-y-6">
          {/* Project Overview */}
          {project && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <span>Your Project</span>
                  <Badge
                    variant={project.status === "active" ? "default" : "secondary"}
                    className={project.status === "active" ? "bg-green-500" : ""}
                  >
                    {project.status}
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <h3 className="text-lg font-semibold mb-2">{project.name}</h3>
                {project.description && <p className="text-sm text-muted-foreground">{project.description}</p>}
              </CardContent>
            </Card>
          )}

          {/* Progress Overview */}
          <div className="grid md:grid-cols-3 gap-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-muted-foreground">Total Tasks</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold">{totalTasks}</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-muted-foreground">Completed</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold text-green-600">{completedTasks}</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-muted-foreground">Progress</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold mb-2">{Math.round(progressPercentage)}%</p>
                <Progress value={progressPercentage} className="h-2" />
              </CardContent>
            </Card>
          </div>

          {/* Upcoming Meetings */}
          {upcomingMeetings.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Calendar size={20} />
                  Upcoming Meetings
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {upcomingMeetings.map((meeting) => (
                  <div key={meeting.id} className="p-4 rounded-lg border bg-card hover:shadow-md transition-shadow">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <h4 className="font-semibold">{meeting.title}</h4>
                        <p className="text-sm text-muted-foreground mt-1">
                          {format(parseISO(meeting.start_time), "MMM d, yyyy • h:mm a")}
                        </p>
                        {meeting.purpose && <p className="text-sm mt-2">{meeting.purpose}</p>}
                      </div>
                      {meeting.meeting_link && (
                        <Button
                          size="sm"
                          onClick={() => window.open(meeting.meeting_link!, "_blank")}
                          className="gap-2"
                        >
                          <Video size={16} />
                          Join
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </div>
      )
    }

    if (activeTab === "Calendar") {
      return (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calendar size={20} />
              Your Meetings
            </CardTitle>
          </CardHeader>
          <CardContent>
            {meetings.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Calendar className="h-12 w-12 mx-auto mb-3 opacity-50" />
                <p>No meetings scheduled</p>
              </div>
            ) : (
              <div className="space-y-3">
                {meetings.map((meeting) => (
                  <div key={meeting.id} className="p-4 rounded-lg border bg-card hover:shadow-md transition-shadow">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <h4 className="font-semibold">{meeting.title}</h4>
                        <p className="text-sm text-muted-foreground mt-1">
                          {format(parseISO(meeting.start_time), "MMM d, yyyy • h:mm a")} -{" "}
                          {format(parseISO(meeting.end_time), "h:mm a")}
                        </p>
                        {meeting.purpose && <p className="text-sm mt-2">{meeting.purpose}</p>}
                      </div>
                      {meeting.meeting_link && new Date(meeting.start_time) > new Date() && (
                        <Button
                          size="sm"
                          onClick={() => window.open(meeting.meeting_link!, "_blank")}
                          className="gap-2"
                        >
                          <Video size={16} />
                          Join
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )
    }

    if (activeTab === "Tasks") {
      return (
        <Card>
          <CardHeader>
            <CardTitle>Your Tasks</CardTitle>
          </CardHeader>
          <CardContent>
            {tasks.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Clock className="h-12 w-12 mx-auto mb-3 opacity-50" />
                <p>No tasks assigned yet</p>
              </div>
            ) : (
              <div className="space-y-3">
                {tasks.map((task) => (
                  <div
                    key={task.id}
                    className="p-4 rounded-lg border bg-card hover:shadow-md transition-shadow flex items-start gap-3"
                  >
                    <div className="pt-0.5">
                      {task.status === "completed" ? (
                        <CheckCircle2 className="h-5 w-5 text-green-600" />
                      ) : (
                        <div className="h-5 w-5 rounded-full border-2 border-muted-foreground/30" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h4
                        className={`font-medium ${task.status === "completed" ? "line-through text-muted-foreground" : ""}`}
                      >
                        {task.title}
                      </h4>
                      {task.description && (
                        <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{task.description}</p>
                      )}
                      <div className="flex items-center gap-2 mt-2 flex-wrap">
                        <Badge variant={task.status === "completed" ? "secondary" : "default"} className="text-xs">
                          {task.status}
                        </Badge>
                        <Badge
                          variant="outline"
                          className={`text-xs ${
                            task.priority === "high"
                              ? "border-red-500 text-red-600"
                              : task.priority === "medium"
                                ? "border-yellow-500 text-yellow-600"
                                : "border-blue-500 text-blue-600"
                          }`}
                        >
                          {task.priority}
                        </Badge>
                        {task.deadline && (
                          <span className="text-xs text-muted-foreground">
                            Due: {format(parseISO(task.deadline), "MMM d")}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )
    }
  }

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full bg-background">
        <Sidebar collapsible="icon">
          <SidebarHeader className="h-16 flex items-center px-6">
            <div className="flex items-center gap-2 font-semibold">
              <div className="size-8 rounded-lg bg-primary flex items-center justify-center text-primary-foreground">
                <LayoutDashboard size={20} />
              </div>
              <span className="group-data-[collapsible=icon]:hidden">Client Portal</span>
            </div>
          </SidebarHeader>
          <SidebarContent>
            <SidebarGroup>
              <SidebarGroupLabel className="px-6">Navigation</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {navItems.map((item) => (
                    <SidebarMenuItem key={item.title}>
                      <SidebarMenuButton
                        tooltip={item.title}
                        isActive={activeTab === item.title}
                        className="px-6 h-11"
                        onClick={() => setActiveTab(item.title)}
                      >
                        <item.icon />
                        <span>{item.title}</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </SidebarContent>
          <SidebarFooter className="p-4 border-t">
            <Button variant="ghost" className="w-full justify-start gap-2 px-2" onClick={handleLogout}>
              <LogOut size={16} />
              <span className="group-data-[collapsible=icon]:hidden">Logout</span>
            </Button>
          </SidebarFooter>
        </Sidebar>

        <main className="flex-1 overflow-y-auto">
          <header className="border-b bg-card/50 backdrop-blur-sm sticky top-0 z-10 px-8 py-4 flex justify-between items-center">
            <div>
              <h2 className="text-xl font-bold">{activeTab}</h2>
              <p className="text-xs text-muted-foreground">
                {clientData?.name}
                {clientData?.company && ` • ${clientData.company}`}
              </p>
            </div>
          </header>

          <div className="p-8 max-w-[1400px] mx-auto w-full">{renderContent()}</div>
        </main>
      </div>
    </SidebarProvider>
  )
}
