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
import { useTheme } from "next-themes"
import { createClient } from "@/lib/supabase/client"
import { cn } from "@/lib/utils"
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
  { title: "Inbox", icon: Inbox },
]

const extraNav = [
  { title: "Team", icon: Users2 },
  { title: "Clients", icon: UserCircle },
  { title: "Settings", icon: Settings },
]

function SidebarInner({
  activeTab,
  setActiveTab,
  userName,
  userEmail,
  userInitials,
  inboxUnread,
  teamCount,
}: {
  activeTab: string
  setActiveTab: (tab: string) => void
  userName: string
  userEmail: string
  userInitials: string
  inboxUnread: number
  teamCount: number
}) {
  const { state, toggleSidebar } = useSidebar()
  const collapsed = state === "collapsed"
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  useEffect(() => { setMounted(true) }, [])

  const currentTheme = mounted ? theme : "dark"

  return (
    <Sidebar collapsible="icon">
      {/* Header — h-16 matches the main top header exactly */}
      <SidebarHeader className="border-b border-sidebar-border shrink-0 px-3 h-16 flex flex-row items-center">
        <div className="flex items-center gap-2.5 min-w-0">
          {/* Kobin AI logo */}
          <div
            className="size-8 rounded-xl overflow-hidden shrink-0 cursor-pointer shadow-sm"
            onClick={toggleSidebar}
            title="Toggle sidebar"
          >
            <svg viewBox="0 0 100 100" width="32" height="32" xmlns="http://www.w3.org/2000/svg">
              <rect width="100" height="100" rx="22" fill="#0D0D0D" />
              {/* Left vertical stem of K */}
              <rect x="28" y="18" width="14" height="64" rx="7" fill="#E8E4D9" />
              {/* Upper-right arm of K */}
              <rect
                x="36" y="28"
                width="36" height="14"
                rx="7"
                transform="rotate(38 36 28)"
                fill="#E8E4D9"
              />
              {/* Lower-right arm of K */}
              <rect
                x="36" y="58"
                width="36" height="14"
                rx="7"
                transform="rotate(-38 36 72)"
                fill="#E8E4D9"
              />
              {/* Blue dot at K junction */}
              <circle cx="47" cy="50" r="9" fill="#5B4FE8" />
            </svg>
          </div>
          {!collapsed && (
            <div className="flex flex-col min-w-0 flex-1">
              <span className="text-sm font-semibold truncate leading-tight text-sidebar-foreground">Kobin Ai</span>
              <span className="text-[10px] text-sidebar-foreground/50 truncate">{userEmail}</span>
            </div>
          )}
        </div>
      </SidebarHeader>

      <SidebarContent className="py-2 overflow-y-auto overflow-x-hidden [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
        {/* Workspace group */}
        <SidebarGroup className="px-2">
          {!collapsed && (
            <SidebarGroupLabel className="text-[10px] font-semibold uppercase tracking-widest text-sidebar-foreground/40 px-2 mb-1">
              Workspace
            </SidebarGroupLabel>
          )}
          <SidebarGroupContent>
            <SidebarMenu className="gap-0.5">
              {mainNav.map((item) => {
                const isActive = activeTab === item.title
                return (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton
                      tooltip={item.title}
                      isActive={isActive}
                      onClick={() => setActiveTab(item.title)}
                      className={cn(
                        "rounded-lg h-9 text-sm font-medium transition-all w-full",
                        collapsed ? "justify-center px-0" : "px-2.5",
                        isActive
                          ? "bg-[#5B4FE8] text-white hover:bg-[#4D43CC] hover:text-white"
                          : "text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent"
                      )}
                    >
                      <item.icon
                        className={cn(
                          "size-4 shrink-0",
                          isActive ? "text-white" : "text-sidebar-foreground/60"
                        )}
                      />
{!collapsed && (
  <>
    <span className="flex-1 truncate">{item.title}</span>
    {item.title === "Team" && teamCount > 0 && (
      <span className="ml-auto flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-[#5B4FE8] px-1.5 text-[10px] font-semibold text-white">
        {teamCount > 99 ? "99+" : teamCount}
      </span>
    )}
  </>
)}
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Divider */}
        <div className="mx-3 my-2 h-px bg-sidebar-border/60" />

        {/* Management group */}
        <SidebarGroup className="px-2">
          {!collapsed && (
            <SidebarGroupLabel className="text-[10px] font-semibold uppercase tracking-widest text-sidebar-foreground/40 px-2 mb-1">
              Management
            </SidebarGroupLabel>
          )}
          <SidebarGroupContent>
            <SidebarMenu className="gap-0.5">
              {extraNav.map((item) => {
                const isActive = activeTab === item.title
                return (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton
                      tooltip={item.title}
                      isActive={isActive}
                      onClick={() => setActiveTab(item.title)}
                      className={cn(
                        "rounded-lg h-9 text-sm font-medium transition-all w-full",
                        collapsed ? "justify-center px-0" : "px-2.5",
                        isActive
                          ? "bg-[#5B4FE8] text-white hover:bg-[#4D43CC] hover:text-white"
                          : "text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent"
                      )}
                    >
                      <item.icon
                        className={cn(
                          "size-4 shrink-0",
                          isActive ? "text-white" : "text-sidebar-foreground/60"
                        )}
                      />
{!collapsed && (
  <>
    <span className="flex-1 truncate">{item.title}</span>
    {item.title === "Inbox" && inboxUnread > 0 && (
      <span className="ml-auto flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-[#5B4FE8] px-1.5 text-[10px] font-semibold text-white">
        {inboxUnread > 99 ? "99+" : inboxUnread}
      </span>
    )}
  </>
)}
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border pt-2 pb-3 shrink-0 px-2">
        {/* Light/Dark toggle */}
        {mounted && (
          collapsed ? (
            <button
              onClick={() => setTheme(currentTheme === "dark" ? "light" : "dark")}
              className="w-full flex items-center justify-center h-9 rounded-lg text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent transition-all"
            >
              {currentTheme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
            </button>
          ) : (
            <div className="flex items-center rounded-lg border border-sidebar-border bg-sidebar-accent/40 p-1 mb-1">
              <button
                onClick={() => setTheme("light")}
                className={cn(
                  "flex flex-1 items-center justify-center gap-1.5 rounded-md py-1.5 text-xs font-medium transition-all",
                  currentTheme === "light"
                    ? "bg-[#5B4FE8] text-white shadow-sm"
                    : "text-sidebar-foreground/60 hover:text-sidebar-foreground"
                )}
              >
                <Sun className="size-3" />
                Light
              </button>
              <button
                onClick={() => setTheme("dark")}
                className={cn(
                  "flex flex-1 items-center justify-center gap-1.5 rounded-md py-1.5 text-xs font-medium transition-all",
                  currentTheme === "dark"
                    ? "bg-[#5B4FE8] text-white shadow-sm"
                    : "text-sidebar-foreground/60 hover:text-sidebar-foreground"
                )}
              >
                <Moon className="size-3" />
                Dark
              </button>
            </div>
          )
        )}

        {/* User profile */}
        <button
          className={cn(
            "flex items-center gap-2.5 rounded-lg px-2 py-2 w-full transition-all hover:bg-sidebar-accent",
            collapsed && "justify-center px-0"
          )}
        >
          <div className="size-7 rounded-full bg-gradient-to-br from-[#5B4FE8] to-[#7C3AED] flex items-center justify-center text-white text-[11px] font-bold shrink-0">
            {userInitials}
          </div>
          {!collapsed && (
            <div className="flex flex-col min-w-0 text-left flex-1">
              <span className="text-xs font-medium truncate leading-tight text-sidebar-foreground">{userName}</span>
              <span className="text-[10px] text-sidebar-foreground/50 truncate">{userEmail}</span>
            </div>
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
  const [inboxUnread, setInboxUnread] = useState(0)
  const [teamCount, setTeamCount] = useState(0)
  const supabase = useMemo(() => createClient(), [])

  useEffect(() => {
    const getUserData = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return

        setUserEmail(user.email ?? "")
        const { data: profile } = await supabase
          .from("profiles")
          .select("full_name, user_type")
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

        // Fetch real inbox unread count
        try {
          const { data: memberships } = await supabase
            .from("chat_room_members")
            .select("room_id, last_read_at")
            .eq("user_id", user.id)

          if (memberships?.length) {
            const roomIds = memberships.map(m => m.room_id)
            const lastReadMap: Record<string, string> = {}
            memberships.forEach(m => { lastReadMap[m.room_id] = m.last_read_at || "1970-01-01" })

            const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
            const { data: recentMsgs } = await supabase
              .from("chat_messages")
              .select("room_id, created_at, sender_id")
              .in("room_id", roomIds)
              .neq("sender_id", user.id)
              .gte("created_at", thirtyDaysAgo)

            let unread = 0
            for (const msg of recentMsgs || []) {
              if (msg.created_at > (lastReadMap[msg.room_id] || "1970-01-01")) unread++
            }
            setInboxUnread(Math.min(unread, 99))
          }
        } catch { /* non-critical */ }

        // Fetch real team member count (founders only)
        if (profile?.user_type === "founder") {
          try {
            const { count } = await supabase
              .from("team_members")
              .select("id", { count: "exact", head: true })
              .eq("founder_id", user.id)
              .eq("is_active", true)
            setTeamCount(count || 0)
          } catch { /* non-critical */ }
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
      inboxUnread={inboxUnread}
      teamCount={teamCount}
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