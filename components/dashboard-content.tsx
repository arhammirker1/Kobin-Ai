"use client"
import {
  Home,
  Calendar,
  CheckSquare,
  Linkedin,
  Users,
  FileText,
  Users2,
  Settings,
  FolderOpen,
  UserCircle,
  Inbox,
  Sun,
  Moon,
  ChevronRight,
  LayoutDashboard,
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
  SidebarRail,
  useSidebar,
} from "@/components/ui/sidebar"
import { useEffect, useState, useMemo } from "react"
import { createClient } from "@/lib/supabase/client"
import { cn } from "@/lib/utils"
// Add these imports at the top of dashboard-content.tsx
import { TodayView } from "@/components/today-view"
import { CalendarView } from "@/components/calendar-view"
import { TaskView } from "@/components/task-view"
import { ProjectsView } from "@/components/projects-view"
import { LinkedinView } from "@/components/linkedin-view"
import { CrmView } from "@/components/crm-view"
import { VaultView } from "@/components/vault-view"
import { InboxView } from "@/components/inbox-view"
import { TeamView } from "@/components/team-view"
import { ClientsView } from "@/components/clients-view"
import { SettingsView } from "@/components/settings-view"
import { Header } from "@/components/header"

const mainNav = [
  { title: "Home", icon: Home },
  { title: "Calendar", icon: Calendar },
  { title: "Tasks", icon: CheckSquare },
  { title: "Projects", icon: FolderOpen },
  { title: "LinkedIn", icon: Linkedin },
  { title: "Relationships", icon: Users },
  { title: "Vault", icon: FileText },
  { title: "Inbox", icon: Inbox, badge: "4" },
]

const extraNav = [
  { title: "Team", icon: Users2, badge: "9+" },
  { title: "Clients", icon: UserCircle },
  { title: "Settings", icon: Settings },
]

function SidebarInner({
  activeTab,
  setActiveTab,
  userName,
  userEmail,
  userInitials,
}: {
  activeTab: string
  setActiveTab: (tab: string) => void
  userName: string
  userEmail: string
  userInitials: string
}) {
  const { state, toggleSidebar } = useSidebar()
  const collapsed = state === "collapsed"
  const [theme, setTheme] = useState<"light" | "dark">("light")

  useEffect(() => {
    const root = document.documentElement
    if (theme === "dark") {
      root.classList.add("dark")
    } else {
      root.classList.remove("dark")
    }
  }, [theme])

  return (
    <Sidebar collapsible="icon">
      {/* Toggle arrow */}
      <button
        onClick={toggleSidebar}
        className={cn(
          "absolute -right-3 top-6 z-50 flex size-6 items-center justify-center rounded-full border bg-background shadow-md transition-transform duration-200",
          collapsed ? "rotate-180" : ""
        )}
      >
        <ChevronRight className="size-3 text-muted-foreground" />
      </button>

      {/* Header: logo + user info */}
      <SidebarHeader className="border-b pb-3">
        <div className="flex items-center gap-3 px-3 pt-3">
          <div className="size-9 rounded-xl bg-blue-600 flex items-center justify-center shrink-0 shadow-md">
            <LayoutDashboard className="size-5 text-white" />
          </div>
          <div className={cn("flex flex-col min-w-0 transition-all duration-200", collapsed && "hidden")}>
            <span className="text-sm font-semibold truncate leading-tight">Command Center</span>
            <span className="text-[11px] text-muted-foreground truncate">{userEmail}</span>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent className="py-2">
        {/* Workspace group */}
        <SidebarGroup>
          <SidebarGroupLabel className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/60 px-3 mb-1">
            Workspace
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {mainNav.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton
                    tooltip={item.title}
                    isActive={activeTab === item.title}
                    onClick={() => setActiveTab(item.title)}
                    className={cn(
                      "mx-1 rounded-lg h-9 px-3 text-sm font-medium transition-all",
                      "text-muted-foreground hover:text-foreground hover:bg-accent",
                      activeTab === item.title &&
                        "bg-blue-50 text-blue-600 hover:bg-blue-50 hover:text-blue-600 dark:bg-blue-950 dark:text-blue-400"
                    )}
                  >
                    <item.icon
                      className={cn(
                        "size-4 shrink-0",
                        activeTab === item.title ? "text-blue-600 dark:text-blue-400" : "text-muted-foreground"
                      )}
                    />
                    <span className="flex-1">{item.title}</span>
                    {item.badge && !collapsed && (
                      <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-blue-600 px-1.5 text-[10px] font-semibold text-white">
                        {item.badge}
                      </span>
                    )}
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Management group */}
        <SidebarGroup className="mt-2">
          <SidebarGroupLabel className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/60 px-3 mb-1">
            Management
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {extraNav.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton
                    tooltip={item.title}
                    isActive={activeTab === item.title}
                    onClick={() => setActiveTab(item.title)}
                    className={cn(
                      "mx-1 rounded-lg h-9 px-3 text-sm font-medium transition-all",
                      "text-muted-foreground hover:text-foreground hover:bg-accent",
                      activeTab === item.title &&
                        "bg-blue-50 text-blue-600 hover:bg-blue-50 hover:text-blue-600 dark:bg-blue-950 dark:text-blue-400"
                    )}
                  >
                    <item.icon
                      className={cn(
                        "size-4 shrink-0",
                        activeTab === item.title ? "text-blue-600 dark:text-blue-400" : "text-muted-foreground"
                      )}
                    />
                    <span className="flex-1">{item.title}</span>
                    {item.badge && !collapsed && (
                      <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-blue-600 px-1.5 text-[10px] font-semibold text-white">
                        {item.badge}
                      </span>
                    )}
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="border-t pt-3 pb-3 space-y-2">
        {/* Light/Dark toggle */}
        {!collapsed && (
          <div className="mx-3 flex items-center justify-between rounded-full border bg-muted/40 p-1">
            <button
              onClick={() => setTheme("light")}
              className={cn(
                "flex flex-1 items-center justify-center gap-1.5 rounded-full py-1 text-xs font-medium transition-all",
                theme === "light"
                  ? "bg-background shadow-sm text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Sun className="size-3" />
              Light
            </button>
            <button
              onClick={() => setTheme("dark")}
              className={cn(
                "flex flex-1 items-center justify-center gap-1.5 rounded-full py-1 text-xs font-medium transition-all",
                theme === "dark"
                  ? "bg-background shadow-sm text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Moon className="size-3" />
              Dark
            </button>
          </div>
        )}

        {/* User profile row */}
        <button className={cn(
          "mx-1 flex w-[calc(100%-0.5rem)] items-center gap-3 rounded-lg px-3 py-2 transition-all hover:bg-accent",
          collapsed && "justify-center"
        )}>
          <div className="size-8 rounded-full bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center text-white text-xs font-bold shrink-0">
            {userInitials}
          </div>
          {!collapsed && (
            <>
              <div className="flex flex-col min-w-0 text-left">
                <span className="text-sm font-medium truncate leading-tight">{userName}</span>
                <span className="text-[11px] text-muted-foreground truncate">{userEmail}</span>
              </div>
              <ChevronRight className="ml-auto size-4 text-muted-foreground shrink-0" />
            </>
          )}
        </button>
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  )
}

export function DashboardSidebar({
  activeTab,
  setActiveTab,
}: {
  activeTab: string
  setActiveTab: (tab: string) => void
}) {
  const [userName, setUserName] = useState<string>("User")
  const [userEmail, setUserEmail] = useState<string>("")
  const [userInitials, setUserInitials] = useState<string>("U")
  const supabase = useMemo(() => createClient(), [])

  useEffect(() => {
    const getUserData = async () => {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser()

        if (user) {
          setUserEmail(user.email ?? "")
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
    <SidebarInner
      activeTab={activeTab}
      setActiveTab={setActiveTab}
      userName={userName}
      userEmail={userEmail}
      userInitials={userInitials}
    />
  )
}



export function DashboardContent({ activeTab, userType }: { activeTab: string; userType: string }) {
  return (
    <main className="flex-1 overflow-y-auto">
      {activeTab !== "Inbox" && <Header />}
      <div className={activeTab === "Inbox" ? "flex flex-col h-screen" : "p-6 max-w-[1400px] mx-auto"}>
        {activeTab === "Home" && <TodayView />}
        {activeTab === "Calendar" && <CalendarView />}
        {activeTab === "Tasks" && <TaskView userType={userType} />}
        {activeTab === "Projects" && <ProjectsView />}
        {activeTab === "LinkedIn" && <LinkedinView />}
        {activeTab === "Relationships" && <CrmView />}
        {activeTab === "Vault" && <VaultView />}
        {activeTab === "Inbox" && (
          <div className="flex-1 min-h-0 p-4 md:p-6 lg:p-8 max-w-[1400px] mx-auto w-full">
            <InboxView canSendMessages={true} />
          </div>
        )}
        {activeTab === "Team" && <TeamView />}
        {activeTab === "Clients" && <ClientsView />}
        {activeTab === "Settings" && <SettingsView />}
      </div>
    </main>
  )
}