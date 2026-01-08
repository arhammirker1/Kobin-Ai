"use client"
import {
  Home,
  Calendar,
  CheckSquare,
  Linkedin,
  Users,
  FileText,
  Users2,
  DollarSign,
  Settings,
  LayoutDashboard,
  FolderOpen,
} from "lucide-react"
import {
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
import { useEffect, useState } from "react"
import { createClient } from "@/lib/supabase/client"

const mainNav = [
  { title: "Home", icon: Home },
  { title: "Calendar", icon: Calendar },
  { title: "Tasks", icon: CheckSquare },
  { title: "Projects", icon: FolderOpen },
  { title: "LinkedIn", icon: Linkedin },
  { title: "Relationships", icon: Users },
  { title: "Vault", icon: FileText },
]

const extraNav = [
  { title: "Team", icon: Users2 },
  { title: "Financials", icon: DollarSign },
  { title: "Settings", icon: Settings },
]

export function DashboardSidebar({
  activeTab,
  setActiveTab,
}: {
  activeTab: string
  setActiveTab: (tab: string) => void
}) {
  const [userName, setUserName] = useState<string>("User")
  const [userInitials, setUserInitials] = useState<string>("U")
  const supabase = createClient()

  useEffect(() => {
    const getUserData = async () => {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser()

        if (user) {
          const { data: profile } = await supabase.from("profiles").select("full_name").eq("id", user.id).single()

          if (profile?.full_name) {
            setUserName(profile.full_name)
            // Generate initials from full name
            const initials = profile.full_name
              .split(" ")
              .map((n) => n[0])
              .join("")
              .toUpperCase()
            setUserInitials(initials)
          }
        }
      } catch (error) {
        console.error("[v0] Failed to fetch user data:", error)
      }
    }

    getUserData()
  }, [supabase])

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="h-16 flex items-center px-6">
        <div className="flex items-center gap-2 font-semibold">
          <div className="size-8 rounded-lg bg-primary flex items-center justify-center text-primary-foreground">
            <LayoutDashboard size={20} />
          </div>
          <span className="group-data-[collapsible=icon]:hidden">Command Center</span>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel className="px-6">Primary</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {mainNav.map((item) => (
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
        <SidebarGroup>
          <SidebarGroupLabel className="px-6">Workspace</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {extraNav.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton
                    tooltip={item.title}
                    className="px-6 h-11"
                    onClick={() => setActiveTab(item.title)}
                    isActive={activeTab === item.title}
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
      <SidebarFooter className="p-4">
        <div className="flex items-center gap-3 px-2 group-data-[collapsible=icon]:hidden">
          <div className="size-8 rounded-full bg-muted flex items-center justify-center text-xs font-medium">
            {userInitials}
          </div>
          <div className="flex flex-col">
            <span className="text-sm font-medium">{userName}</span>
            <span className="text-xs text-muted-foreground">Founder & CEO</span>
          </div>
        </div>
      </SidebarFooter>
    </Sidebar>
  )
}
