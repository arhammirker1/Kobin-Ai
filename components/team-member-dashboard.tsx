"use client"

import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { useRouter } from "next/navigation"
import {
  LogOut,
  Home,
  Calendar,
  CheckSquare,
  Linkedin,
  Users,
  FileText,
  Settings,
  LayoutDashboard,
  FolderOpen,
  UserCircle,
  Inbox
} from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import {
  SidebarProvider,
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarGroupContent,
  SidebarFooter,
} from "@/components/ui/sidebar"
import { CalendarView } from "@/components/calendar-view"
import { LinkedinView } from "@/components/linkedin-view"
import { CrmView } from "@/components/crm-view"
import { VaultView } from "@/components/vault-view"
import { SettingsView } from "@/components/settings-view"
import { TaskView } from "@/components/task-view"
import { ProjectsView } from "@/components/projects-view"
import { ClientsView } from "@/components/clients-view"
import { InboxView } from "@/components/inbox-view"
import useSWR, { mutate } from "swr"

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
  can_view_projects: boolean // Added can_view_projects permission
  can_create_projects: boolean // Added can_create_projects permission
  can_access_clients: boolean // Added can_access_clients permission
  can_access_inbox: boolean
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
  const [activeTab, setActiveTab] = useState("Home")
  const [profile, setProfile] = useState<Profile | null>(null)
  const router = useRouter()
  const { toast } = useToast()
  const supabase = createClient()

  const {
    data: tasks,
    error: tasksError,
    isLoading: tasksLoading,
  } = useSWR(
    permissions.can_view_tasks ? ["tasks", permissions.user_id] : null,
    async () => {
      const { data, error } = await supabase
        .from("tasks")
        .select("*")
        .eq("assigned_to", permissions.user_id)
        .order("created_at", { ascending: false })
      if (error) throw error
      return data as Task[]
    },
    { revalidateOnFocus: true, dedupingInterval: 2000 },
  )

  useEffect(() => {
    const fetchProfile = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) return
      const { data } = await supabase.from("profiles").select("full_name, email").eq("id", user.id).single()
      setProfile(data)
    }
    fetchProfile()
  }, [])

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

    const previousTasks = tasks
    if (tasks) {
      const updatedTasks = tasks.map((t) => (t.id === taskId ? { ...t, status: newStatus } : t))
      mutate(["tasks", permissions.user_id], updatedTasks, false)
    }

    try {
      const { error } = await supabase.from("tasks").update({ status: newStatus }).eq("id", taskId)
      if (error) throw error
      toast({
        title: "Success",
        description: "Task status updated",
      })
      // Revalidate in background
      mutate(["tasks", permissions.user_id])
    } catch (error) {
      // Revert on error
      mutate(["tasks", permissions.user_id], previousTasks, false)
      console.error("[v0] Error updating task:", error)
      toast({
        title: "Error",
        description: "Failed to update task status",
        variant: "destructive",
      })
    }
  }

  const navItems = [
    { title: "Home", icon: Home, show: true },
    { title: "Calendar", icon: Calendar, show: permissions.can_view_calendar },
    { title: "Tasks", icon: CheckSquare, show: permissions.can_view_tasks },
    { title: "Projects", icon: FolderOpen, show: permissions.can_view_projects },
    { title: "LinkedIn", icon: Linkedin, show: permissions.can_view_linkedin },
    { title: "Relationships", icon: Users, show: permissions.can_view_relationships },
    { title: "Vault", icon: FileText, show: permissions.can_view_vault },
    { title: "Clients", icon: UserCircle, show: permissions.can_access_clients }, // Added Clients navigation item
    { title: "Settings", icon: Settings, show: true },
    { title: "Inbox", icon: Inbox, show: permissions.can_access_inbox },

  ]

  if (!profile) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    )
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
              <span className="group-data-[collapsible=icon]:hidden">Team CC</span>
            </div>
          </SidebarHeader>
          <SidebarContent>
            <SidebarGroup>
              <SidebarGroupLabel className="px-6">Workspace</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {navItems
                    .filter((item) => item.show)
                    .map((item) => (
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
            <Button variant="ghost" className="w-full justify-start gap-2 px-2" onClick={handleSignOut}>
              <LogOut size={16} />
              <span className="group-data-[collapsible=icon]:hidden">Sign Out</span>
            </Button>
          </SidebarFooter>
        </Sidebar>

        <main className="flex-1 overflow-y-auto">
          <header className="border-b bg-card/50 backdrop-blur-sm sticky top-0 z-10 px-8 py-4 flex justify-between items-center">
            <div>
              <h2 className="text-xl font-bold">{activeTab}</h2>
              <p className="text-xs text-muted-foreground">
                {profile.full_name} • {permissions.position}
              </p>
            </div>
          </header>

          <div className="p-8 max-w-[1400px] mx-auto w-full">
            {activeTab === "Home" && (
              <div className="space-y-6">
                <Card className="bg-primary/5 border-primary/20">
                  <CardHeader>
                    <CardTitle>Welcome back, {profile.full_name}</CardTitle>
                    <CardDescription>Your current role: {permissions.position}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm">
                      You have access to:{" "}
                      {navItems
                        .filter((i) => i.show)
                        .map((i) => i.title)
                        .join(", ")}
                    </p>
                  </CardContent>
                </Card>
                {/* Minimalist "Today" summary for team members */}
                <div className="grid md:grid-cols-2 gap-6">
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-sm">Assigned Tasks</CardTitle>
                    </CardHeader>
                    <CardContent className="text-3xl font-bold">
                      {tasks?.filter((t) => t.status !== "completed").length || 0}
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-sm">Completed This Week</CardTitle>
                    </CardHeader>
                    <CardContent className="text-3xl font-bold">
                      {tasks?.filter((t) => t.status === "completed").length || 0}
                    </CardContent>
                  </Card>
                </div>
              </div>
            )}
            {activeTab === "Tasks" && permissions.can_view_tasks && (
              <TaskView
                userType="team_member"
                permissions={{
                  can_create_tasks: permissions.can_create_tasks,
                  can_update_task_status: permissions.can_update_task_status,
                  can_perform_tasks: (permissions as any).can_perform_tasks,
                  founder_id: permissions.founder_id,
                  user_id: permissions.user_id,
                }}
              />
            )}
            {activeTab === "Projects" && permissions.can_view_projects && (
              <ProjectsView
                permissions={{
                  can_create_projects: permissions.can_create_projects,
                  founder_id: permissions.founder_id,
                }}
              />
            )}
            {/* Dynamic rendering for other views if permissions allow */}
            {activeTab === "Calendar" && permissions.can_view_calendar && <CalendarView />}
            {activeTab === "LinkedIn" && permissions.can_view_linkedin && <LinkedinView />}
            {activeTab === "Relationships" && permissions.can_view_relationships && <CrmView />}
            {activeTab === "Vault" && permissions.can_view_vault && <VaultView />}
            {activeTab === "Clients" && permissions.can_access_clients && (
              <ClientsView
                permissions={{
                  can_create_projects: permissions.can_create_projects,
                  founder_id: permissions.founder_id,
                }}
              />  
            )}
            {activeTab === "Settings" && <SettingsView />}
            {activeTab === "Inbox" && permissions.can_access_inbox && (
              <InboxView canSendMessages={permissions.can_access_inbox} />
            )}
          </div>
        </main>
      </div>
    </SidebarProvider>
  )
}
