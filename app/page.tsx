"use client"

import { useState, useEffect, useMemo } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { SidebarProvider } from "@/components/ui/sidebar"
import { DashboardSidebar, DashboardContent } from "@/components/dashboard-content"
import { CommandBar } from "@/components/command-bar"

const AUTH_TIMEOUT_MS = 8000

export default function Page() {
  const [activeTab, setActiveTab] = useState("Home")
  const [isLoading, setIsLoading] = useState(true)
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [authError, setAuthError] = useState<string | null>(null)
  const [userType, setUserType] = useState<string | null>(null)
  const [commandBarOpen, setCommandBarOpen] = useState(false)

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault()
        setCommandBarOpen(true)
      }
    }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [])
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
        {/* Floating AI command button */}
        <button
          onClick={() => setCommandBarOpen(true)}
          className="fixed bottom-6 right-6 z-40 flex items-center gap-2.5 pl-3.5 pr-4 py-3 rounded-2xl border border-[#2E2E2C] shadow-2xl transition-all hover:scale-105 active:scale-95"
          style={{ background: "linear-gradient(135deg, #1C1C1A 0%, #252523 100%)" }}
          title="AI Command Bar (⌘K)"
        >
          <div
            className="w-5 h-5 rounded-md flex items-center justify-center shrink-0"
            style={{ background: "linear-gradient(135deg, #5B5BD6 0%, #7C3AED 100%)" }}
          >
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none">
              <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"
                stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <span className="text-xs font-medium text-[#8A8A85]">Ask AI</span>
          <kbd className="text-[10px] text-[#444442] border border-[#333331] rounded px-1.5 py-0.5 bg-[#1C1C1A]">⌘K</kbd>
        </button>
        <CommandBar open={commandBarOpen} onClose={() => setCommandBarOpen(false)} />
      </div>
    </SidebarProvider>
  )
}