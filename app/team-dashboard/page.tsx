"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { TeamMemberDashboard } from "@/components/team-member-dashboard"

export default function TeamDashboardPage() {
  const [isLoading, setIsLoading] = useState(true)
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [permissions, setPermissions] = useState<any>(null)
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

        if (!user) {
          router.push("/login")
          return
        }

        // Verify user is a team member
        const { data: profile } = await supabase.from("profiles").select("user_type").eq("id", user.id).single()

        if (profile?.user_type !== "team_member") {
          // Redirect founders back to main dashboard
          router.push("/")
          return
        }

        // Fetch team member permissions
        const { data: teamMember } = await supabase.from("team_members").select("*").eq("user_id", user.id).single()

        if (!teamMember) {
          throw new Error("Team member record not found")
        }

        if (!teamMember.is_active) {
          // Account is deactivated
          await supabase.auth.signOut()
          router.push("/login")
          return
        }

        setPermissions(teamMember)
        setIsAuthenticated(true)
      } catch (error) {
        console.error("[v0] Auth check failed:", error)
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

  if (!isAuthenticated || !permissions) {
    return null
  }

  return <TeamMemberDashboard permissions={permissions} />
}
