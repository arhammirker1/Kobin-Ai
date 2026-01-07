"use client"

import { Home, Calendar, CheckSquare, LayoutDashboard, LogOut } from "lucide-react"
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
import { Button } from "@/components/ui/button"
import { useRouter } from "next/navigation"

const mainNav = [
  { title: "Home", icon: Home },
  { title: "Tasks", icon: CheckSquare },
  { title: "Calendar", icon: Calendar },
]

export function ClientDashboardSidebar({
  activeTab,
  setActiveTab,
}: {
  activeTab: string
  setActiveTab: (tab: string) => void
}) {
  const [userName, setUserName] = useState<string>("Client")
  const [userInitials, setUserInitials] = useState<string>("C")
  const supabase = createClient()
  const router = useRouter()

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

  const handleLogout = async () => {
    try {
      await supabase.auth.signOut()
      router.push("/login")
    } catch (error) {
      console.error("[v0] Logout error:", error)
    }
  }

  return (
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
          <SidebarGroupLabel className="px-6">Menu</SidebarGroupLabel>
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
      </SidebarContent>
      <SidebarFooter className="p-4 border-t space-y-3">
        <div className="flex items-center gap-3 px-2 group-data-[collapsible=icon]:hidden">
          <div className="size-8 rounded-full bg-muted flex items-center justify-center text-xs font-medium">
            {userInitials}
          </div>
          <div className="flex flex-col flex-1 min-w-0">
            <span className="text-sm font-medium truncate">{userName}</span>
            <span className="text-xs text-muted-foreground">Client</span>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="w-full justify-start gap-2 text-xs bg-transparent"
          onClick={handleLogout}
        >
          <LogOut size={16} />
          <span className="group-data-[collapsible=icon]:hidden">Logout</span>
        </Button>
      </SidebarFooter>
    </Sidebar>
  )
}
