"use client"

import { useState, useEffect, useMemo } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { SidebarProvider } from "@/components/ui/sidebar"
import { DashboardSidebar } from "@/components/dashboard-sidebar"
import { DashboardContent } from "@/components/dashboard-content"

const AUTH_TIMEOUT_MS = 8000

export default function Page() {
  const [activeTab, setActiveTab] = useState("Home")
  const [isLoading, setIsLoading] = useState(true)
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [authError, setAuthError] = useState<string | null>(null)
  const [userType, setUserType] = useState<string | null>(null)
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])

  // Navigate-tab: fired by TodayView quick actions — MUST be before all early returns
  useEffect(() => {
    const handler = (e: CustomEvent<string>) => setActiveTab(e.detail)
    window.addEventListener("navigate-tab", handler as EventListener)
    return () => window.removeEventListener("navigate-tab", handler as EventListener)
  }, [])

  // Auth check
  useEffect(() => {
    let cancelled = false

    const timeout = setTimeout(() => {
      if (!cancelled) {
        setAuthError("Authentication timed out. Please refresh.")
        setIsLoading(false)
      }
    }, AUTH_TIMEOUT_MS)

    const checkAuth = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (cancelled) return

        if (user) {
          const { data: profile } = await supabase
            .from("profiles")
            .select("user_type")
            .eq("id", user.id)
            .single()

          if (cancelled) return

          if (profile?.user_type === "team_member") {
            router.push("/team-dashboard")
            return
          }

          setUserType(profile?.user_type || "founder")
          setIsAuthenticated(true)
        } else {
          router.push("/login")
        }
      } catch {
        if (!cancelled) {
          setAuthError("Something went wrong. Please refresh.")
        }
      } finally {
        clearTimeout(timeout)
        if (!cancelled) setIsLoading(false)
      }
    }

    checkAuth()

    return () => {
      cancelled = true
      clearTimeout(timeout)
    }
  }, [router, supabase])

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4" />
          <p className="text-muted-foreground">Loading…</p>
        </div>
      </div>
    )
  }

  if (authError) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center space-y-3">
          <p className="text-destructive font-medium">{authError}</p>
          <button
            onClick={() => window.location.reload()}
            className="text-sm underline text-muted-foreground"
          >
            Refresh
          </button>
        </div>
      </div>
    )
  }

  if (!isAuthenticated) return null

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full bg-background">
        <DashboardSidebar activeTab={activeTab} setActiveTab={setActiveTab} />
        <main className="flex-1 overflow-y-auto">
          <DashboardContent activeTab={activeTab} userType={userType || "founder"} />
        </main>
      </div>
    </SidebarProvider>
  )
}