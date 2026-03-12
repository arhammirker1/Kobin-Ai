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
  FolderOpen,
  UserCircle,
  Inbox,
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
import { useEffect, useState, useMemo } from "react"
import { createClient } from "@/lib/supabase/client"

const mainNav = [
  { title: "Home", icon: Home },
  { title: "Calendar", icon: Calendar },
  { title: "Tasks", icon: CheckSquare },
  { title: "Projects", icon: FolderOpen },
  { title: "LinkedIn", icon: Linkedin },
  { title: "Relationships", icon: Users },
  { title: "Vault", icon: FileText },
  { title: "Inbox", icon: Inbox },
]

const extraNav = [
  { title: "Team", icon: Users2 },
  { title: "Clients", icon: UserCircle },
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
  const supabase = useMemo(() => createClient(), [])

  useEffect(() => {
    const getUserData = async () => {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser()

        if (user) {
          const { data: profile } = await supabase
            .from("profiles")
            .select("full_name")
            .eq("id", user.id)
            .single()

          if (profile?.full_name) {
            setUserName(profile.full_name)
            const parts = profile.full_name.trim().split(" ")
            setUserInitials(
              parts.length >= 2
                ? `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase()
                : parts[0][0].toUpperCase()
            )
          }
        }
      } catch {
        // silently ignore — non-critical
      }
    }

    getUserData()
  }, [supabase])

  return (
    <Sidebar>
      <SidebarHeader>
        <div className="flex items-center gap-3 px-2 py-3">
          <div className="size-8 rounded-full bg-primary flex items-center justify-center text-primary-foreground text-xs font-bold">
            {userInitials}
          </div>
          <div className="flex flex-col min-w-0">
            <span className="text-sm font-semibold truncate">{userName}</span>
            <span className="text-[10px] text-muted-foreground">Command Center</span>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Workspace</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {mainNav.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton
                    isActive={activeTab === item.title}
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
          <SidebarGroupLabel>Management</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {extraNav.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton
                    isActive={activeTab === item.title}
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

      <SidebarFooter />
    </Sidebar>
  )
}