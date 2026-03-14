"use client"

import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { Badge } from "@/components/ui/badge"
import {
  Moon, Sun, User, Mail, Loader2, Unlink, Video,
  ExternalLink, AlertCircle, CheckCircle2, HardDrive, Cloud,
} from "lucide-react"
import { useTheme } from "next-themes"
import { toast } from "sonner"

// ── Google Integration Card ───────────────────────────────────────────────────

function GoogleIntegrationCard() {
  const [integration, setIntegration] = useState<{
    google_email: string | null
    is_connected: boolean
    drive_connected: boolean | null
    drive_vault_folder_id: string | null
  } | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isDisconnecting, setIsDisconnecting] = useState(false)
  const [isConnectingDrive, setIsConnectingDrive] = useState(false)
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
        .select("google_email, is_connected, drive_connected, drive_vault_folder_id")
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

  const handleConnectDrive = async () => {
    setIsConnectingDrive(true)
    try {
      const res = await fetch("/api/vault/connect", { method: "POST" })
      const json = await res.json()
      if (!res.ok) throw new Error(json.message)
      toast.success("Google Drive connected — Vault is ready")
      fetchIntegration()
    } catch (err: any) {
      toast.error(err.message || "Failed to connect Drive")
    } finally {
      setIsConnectingDrive(false)
    }
  }

  const isConnected = integration?.is_connected === true
  const driveConnected = integration?.drive_connected === true && !!integration?.drive_vault_folder_id

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <div className="size-8 rounded-lg bg-white border flex items-center justify-center">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
            </svg>
          </div>
          Google
          {isConnected && (
            <Badge className="ml-1 bg-emerald-100 text-emerald-700 border-emerald-200 text-[10px]">
              Connected
            </Badge>
          )}
        </CardTitle>
        <CardDescription>Google Meet for scheduling and Google Drive for Vault file storage</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading...
          </div>
        ) : isConnected ? (
          <>
            {/* Connected account */}
            <div className="flex items-center gap-3 p-3 rounded-lg bg-emerald-50 border border-emerald-200">
              <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />
              <div>
                <p className="text-sm font-medium text-emerald-800">Connected</p>
                <p className="text-xs text-emerald-600">{integration?.google_email}</p>
              </div>
            </div>

            {/* Feature rows */}
            <div className="space-y-1.5 text-sm text-muted-foreground">
              <div className="flex items-center gap-2">
                <Video className="h-4 w-4 text-primary shrink-0" />
                Meet links auto-generated on every meeting
              </div>
              <div className="flex items-center gap-2">
                <ExternalLink className="h-4 w-4 text-primary shrink-0" />
                Attendees receive Google Calendar invites
              </div>
            </div>

            {/* Drive status row */}
            <div className="border border-border rounded-lg p-3 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <HardDrive className="h-4 w-4" />
                  Google Drive (Vault)
                </div>
                {driveConnected ? (
                  <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 text-[10px]">
                    Active
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-[10px] text-muted-foreground">
                    Not set up
                  </Badge>
                )}
              </div>

              {driveConnected ? (
                <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                  <Cloud className="h-3.5 w-3.5 text-emerald-600" />
                  Vault root folder created in your Drive — files upload automatically
                </p>
              ) : (
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground">
                    Set up Drive to enable file uploads in the Vault. A root "Vault" folder will be created in your Google Drive.
                  </p>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleConnectDrive}
                    disabled={isConnectingDrive}
                    className="gap-2 h-8 text-xs"
                  >
                    {isConnectingDrive
                      ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      : <HardDrive className="h-3.5 w-3.5" />
                    }
                    Set up Drive
                  </Button>
                </div>
              )}
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={handleDisconnect}
              disabled={isDisconnecting}
              className="gap-2 text-destructive hover:text-destructive border-destructive/30"
            >
              {isDisconnecting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Unlink className="h-4 w-4" />}
              Disconnect Google Account
            </Button>
          </>
        ) : (
          <>
            <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50 border">
              <AlertCircle className="h-5 w-5 text-muted-foreground shrink-0" />
              <p className="text-sm text-muted-foreground">
                Not connected — connect to enable Google Meet and Vault Drive storage
              </p>
            </div>
            <Button onClick={() => window.location.href = "/api/auth/google"} className="gap-2">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
              </svg>
              Connect Google Account
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  )
}

// ── Settings View ─────────────────────────────────────────────────────────────

export function SettingsView() {
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [userEmail, setUserEmail] = useState("")
  const [fullName, setFullName] = useState("")
  const [userId, setUserId] = useState<string | null>(null)
  const supabase = createClient()

  useEffect(() => { setMounted(true) }, [])

  useEffect(() => {
    const getUserProfile = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (user) {
          setUserId(user.id)
          setUserEmail(user.email || "")
          const { data: profile } = await supabase.from("profiles").select("full_name").eq("id", user.id).single()
          if (profile) setFullName(profile.full_name || "")
        }
      } catch (error) {
        toast.error("Failed to load profile")
      } finally {
        setIsLoading(false)
      }
    }
    getUserProfile()
  }, [supabase])

  const handleSaveProfile = async () => {
    if (!userId) { toast.error("User not found"); return }
    setIsSaving(true)
    try {
      const { error } = await supabase.from("profiles").update({ full_name: fullName }).eq("id", userId)
      if (error) throw error
      toast.success("Profile updated successfully!")
    } catch {
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
        {/* Appearance */}
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
                <Label htmlFor="dark-mode" className="text-base">Dark Mode</Label>
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

        {/* Profile */}
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
              {isSaving ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Saving...</> : "Save Changes"}
            </Button>
          </CardContent>
        </Card>

        {/* Google (Meet + Drive) */}
        <GoogleIntegrationCard />
      </div>
    </div>
  )
}