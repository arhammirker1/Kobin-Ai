"use client"

import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { Badge } from "@/components/ui/badge"
import { Moon, Sun, User, Mail, Loader2, Unlink, Video, ExternalLink, AlertCircle, CheckCircle2 } from "lucide-react"
import { useTheme } from "next-themes"
import { toast } from "sonner"


// google calender integration
function GoogleIntegrationCard() {
  const [integration, setIntegration] = useState<{ google_email: string | null; is_connected: boolean } | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isDisconnecting, setIsDisconnecting] = useState(false)
  const supabase = createClient()

  useEffect(() => {
    fetchIntegration()
    const params = new URLSearchParams(window.location.search)
    if (params.get("success") === "google_connected") {
      toast.success("Google account connected!")
      window.history.replaceState({}, "", "/settings")
      fetchIntegration()
    }
    if (params.get("error")) {
      toast.error("Google connection failed. Please try again.")
      window.history.replaceState({}, "", "/settings")
    }
  }, [])

  const fetchIntegration = async () => {
    setIsLoading(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data } = await supabase
        .from("google_integrations")
        .select("google_email, is_connected")
        .eq("user_id", user.id)
        .single()
      setIntegration(data)
    } catch { setIntegration(null) }
    finally { setIsLoading(false) }
  }

  const handleDisconnect = async () => {
    setIsDisconnecting(true)
    try {
      const res = await fetch("/api/google/disconnect", { method: "POST" })
      if (!res.ok) throw new Error()
      toast.success("Google account disconnected")
      setIntegration(null)
    } catch { toast.error("Failed to disconnect") }
    finally { setIsDisconnecting(false) }
  }

  const isConnected = integration?.is_connected === true

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Video className="h-5 w-5" />
          Google Meet
          {isConnected && (
            <Badge className="ml-1 bg-emerald-100 text-emerald-700 border-emerald-200 text-[10px]">
              Connected
            </Badge>
          )}
        </CardTitle>
        <CardDescription>Auto-generate Google Meet links when scheduling meetings</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading...
          </div>
        ) : isConnected ? (
          <>
            <div className="flex items-center gap-3 p-3 rounded-lg bg-emerald-50 border border-emerald-200">
              <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />
              <div>
                <p className="text-sm font-medium text-emerald-800">Connected</p>
                <p className="text-xs text-emerald-600">{integration?.google_email}</p>
              </div>
            </div>
            <div className="space-y-1.5 text-sm text-muted-foreground">
              <div className="flex items-center gap-2"><Video className="h-4 w-4 text-primary" /> Meet links auto-generated on every meeting</div>
              <div className="flex items-center gap-2"><ExternalLink className="h-4 w-4 text-primary" /> Attendees receive Google Calendar invites</div>
            </div>
            <Button variant="outline" size="sm" onClick={handleDisconnect} disabled={isDisconnecting}
              className="gap-2 text-destructive hover:text-destructive border-destructive/30">
              {isDisconnecting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Unlink className="h-4 w-4" />}
              Disconnect
            </Button>
          </>
        ) : (
          <>
            <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50 border">
              <AlertCircle className="h-5 w-5 text-muted-foreground shrink-0" />
              <p className="text-sm text-muted-foreground">Not connected — connect to enable auto Meet links</p>
            </div>
            <Button onClick={() => window.location.href = "/api/auth/google"} className="gap-2">
              Connect Google Account
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  )
}

export function SettingsView() {
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)

  const [userEmail, setUserEmail] = useState("")
  const [fullName, setFullName] = useState("")
  const [userId, setUserId] = useState<string | null>(null)

  const supabase = createClient()

  // Handle mounting for theme
  useEffect(() => {
    setMounted(true)
  }, [])

  // Fetch user profile
  useEffect(() => {
    const getUserProfile = async () => {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser()

        if (user) {
          setUserId(user.id)
          setUserEmail(user.email || "")

          const { data: profile } = await supabase.from("profiles").select("full_name").eq("id", user.id).single()

          if (profile) {
            setFullName(profile.full_name || "")
          }
        }
      } catch (error) {
        console.error("[v0] Failed to fetch user profile:", error)
        toast.error("Failed to load profile")
      } finally {
        setIsLoading(false)
      }
    }

    getUserProfile()
  }, [supabase])

  const handleSaveProfile = async () => {
    if (!userId) {
      toast.error("User not found")
      return
    }

    setIsSaving(true)
    try {
      const { error } = await supabase.from("profiles").update({ full_name: fullName }).eq("id", userId)

      if (error) throw error

      toast.success("Profile updated successfully!")
    } catch (error) {
      console.error("[v0] Failed to update profile:", error)
      toast.error("Failed to update profile")
    } finally {
      setIsSaving(false)
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
        <p className="text-muted-foreground mt-2">Manage your account settings and preferences</p>
      </div>

      <div className="grid gap-6 max-w-2xl">
        {/* Theme Settings */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {mounted && theme === "dark" ? <Moon className="h-5 w-5" /> : <Sun className="h-5 w-5" />}
              Appearance
            </CardTitle>
            <CardDescription>Customize the appearance of the application</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="dark-mode" className="text-base">
                  Dark Mode
                </Label>
                <p className="text-sm text-muted-foreground">
                  {mounted && theme === "dark" ? "Currently using dark theme" : "Currently using light theme"}
                </p>
              </div>
              {mounted && (
                <Switch
                  id="dark-mode"
                  checked={theme === "dark"}
                  onCheckedChange={(checked) => setTheme(checked ? "dark" : "light")}
                />
              )}
            </div>
          </CardContent>
        </Card>

        {/* Profile Settings */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User className="h-5 w-5" />
              Profile
            </CardTitle>
            <CardDescription>Update your personal information</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email" className="flex items-center gap-2">
                <Mail className="h-4 w-4" />
                Email
              </Label>
              <Input id="email" type="email" value={userEmail} disabled className="bg-muted" />
              <p className="text-xs text-muted-foreground">Email cannot be changed</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="fullName">Full Name</Label>
              <Input
                id="fullName"
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Enter your full name"
              />
            </div>

            <Button onClick={handleSaveProfile} disabled={isSaving} className="w-full sm:w-auto">
              {isSaving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                "Save Changes"
              )}
            </Button>
          </CardContent>
        </Card>
        <GoogleIntegrationCard />
      </div>
    </div>
  )
}
