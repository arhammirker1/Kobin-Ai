"use client"

import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { toast } from "sonner"
import { Video, CheckCircle2, AlertCircle, ExternalLink, Loader2, Unlink } from "lucide-react"

interface GoogleIntegration {
  google_email: string | null
  is_connected: boolean
  token_expires_at: string | null
}

export function GoogleIntegrationCard() {
  const [integration, setIntegration] = useState<GoogleIntegration | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isDisconnecting, setIsDisconnecting] = useState(false)
  const supabase = createClient()

  useEffect(() => {
    fetchIntegration()

    // Check URL params for success/error feedback
    const params = new URLSearchParams(window.location.search)
    if (params.get("success") === "google_connected") {
      toast.success("Google account connected successfully!")
      window.history.replaceState({}, "", "/settings")
      fetchIntegration()
    }
    if (params.get("error")) {
      const errors: Record<string, string> = {
        google_auth_failed: "Google authentication failed. Please try again.",
        token_exchange_failed: "Could not exchange token. Please try again.",
        no_code: "No authorization code received.",
        db_error: "Database error. Please try again.",
        unknown: "An unknown error occurred.",
      }
      toast.error(errors[params.get("error")!] || "Connection failed.")
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
        .select("google_email, is_connected, token_expires_at")
        .eq("user_id", user.id)
        .single()

      setIntegration(data)
    } catch {
      setIntegration(null)
    } finally {
      setIsLoading(false)
    }
  }

  const handleConnect = () => {
    window.location.href = "/api/auth/google"
  }

  const handleDisconnect = async () => {
    setIsDisconnecting(true)
    try {
      const res = await fetch("/api/google/disconnect", { method: "POST" })
      if (!res.ok) throw new Error("Failed to disconnect")
      toast.success("Google account disconnected")
      setIntegration(null)
    } catch {
      toast.error("Failed to disconnect Google account")
    } finally {
      setIsDisconnecting(false)
    }
  }

  const isConnected = integration?.is_connected === true

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
          Google Meet
          {isConnected && (
            <Badge variant="secondary" className="ml-1 bg-emerald-100 text-emerald-700 border-emerald-200 text-[10px]">
              Connected
            </Badge>
          )}
        </CardTitle>
        <CardDescription>
          Automatically generate Google Meet links when scheduling meetings
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading...
          </div>
        ) : isConnected ? (
          <>
            <div className="flex items-center gap-3 p-3 rounded-lg bg-emerald-50 border border-emerald-200">
              <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-emerald-800">Connected</p>
                <p className="text-xs text-emerald-600 truncate">
                  {integration?.google_email}
                </p>
              </div>
            </div>

            <div className="space-y-2 text-sm text-muted-foreground">
              <div className="flex items-center gap-2">
                <Video className="h-4 w-4 text-primary shrink-0" />
                <span>Meet links auto-generated when scheduling meetings</span>
              </div>
              <div className="flex items-center gap-2">
                <ExternalLink className="h-4 w-4 text-primary shrink-0" />
                <span>Attendees receive calendar invites via Google Calendar</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />
                <span>Links saved automatically to your Workspace events</span>
              </div>
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={handleDisconnect}
              disabled={isDisconnecting}
              className="gap-2 text-destructive hover:text-destructive hover:bg-destructive/10 border-destructive/30"
            >
              {isDisconnecting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Unlink className="h-4 w-4" />
              )}
              Disconnect Google Account
            </Button>
          </>
        ) : (
          <>
            <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50 border border-border">
              <AlertCircle className="h-5 w-5 text-muted-foreground shrink-0" />
              <div>
                <p className="text-sm font-medium">Not connected</p>
                <p className="text-xs text-muted-foreground">
                  Connect your Google account to enable auto-scheduling
                </p>
              </div>
            </div>

            <div className="space-y-2 text-sm text-muted-foreground">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                What you&apos;ll get:
              </p>
              <div className="flex items-center gap-2">
                <Video className="h-4 w-4 shrink-0" />
                <span>Instant Google Meet links on every scheduled meeting</span>
              </div>
              <div className="flex items-center gap-2">
                <ExternalLink className="h-4 w-4 shrink-0" />
                <span>Google Calendar events sent to all attendees</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 shrink-0" />
                <span>Works with Client meetings, CRM contacts & team syncs</span>
              </div>
            </div>

            <Button onClick={handleConnect} className="gap-2 w-full sm:w-auto">
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