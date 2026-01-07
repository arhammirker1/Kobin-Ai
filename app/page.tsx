"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { SidebarProvider } from "@/components/ui/sidebar"
import { DashboardSidebar } from "@/components/dashboard-sidebar"
import { DashboardContent } from "@/components/dashboard-content"

export default function Page() {
  const [activeTab, setActiveTab] = useState("Home")
  const [isLoading, setIsLoading] = useState(true)
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [userType, setUserType] = useState<string | null>(null)
  const router = useRouter()

  useEffect(() => {
    const supabase = createClient()

    if (!supabase) {
      console.error("[v0] Failed to create Supabase client")
      setIsLoading(false)
      router.push("/login")
      return
    }

    const checkAuth = async () => {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser()

        if (user) {
          const { data: profile } = await supabase.from("profiles").select("user_type").eq("id", user.id).single()

          if (profile?.user_type === "team_member") {
            router.push("/team-dashboard")
            return
          }

          if (profile?.user_type === "client") {
            router.push("/client-dashboard")
            return
          }

          setUserType(profile?.user_type || "founder")
          setIsAuthenticated(true)
        } else {
          router.push("/login")
        }
      } catch (error) {
        console.error("Auth check failed:", error)
        router.push("/login")
      } finally {
        setIsLoading(false)
      }
    }

    checkAuth()
  }, [router])

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    )
  }

  if (!isAuthenticated) {
    return null
  }

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full bg-background">
        <DashboardSidebar activeTab={activeTab} setActiveTab={setActiveTab} />
        <main className="flex-1 overflow-y-auto">
          <DashboardContent activeTab={activeTab} userType={userType || "founder"} /> {/* Passing userType */}
        </main>
      </div>
    </SidebarProvider>
  )
}
