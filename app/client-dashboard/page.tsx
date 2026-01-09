"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { ArrowLeft, User, Mail, LogIn } from "lucide-react"
import { format, parseISO } from "date-fns"

type ClientWithAccess = {
  id: string
  name: string
  email: string | null
  company: string | null
  role: string | null
  portal_email: string | null
  has_portal_access: boolean
  last_login: string | null
  created_at: string
  status: string
}

export default function ClientDashboardPage() {
  const [clients, setClients] = useState<ClientWithAccess[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isAuthorized, setIsAuthorized] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    const checkAuthAndFetch = async () => {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser()

        if (!user) {
          router.push("/login")
          return
        }

        // Check if user is founder or team member with client portal access
        const { data: profile } = await supabase.from("profiles").select("user_type").eq("id", user.id).single()

        if (profile?.user_type === "founder") {
          setIsAuthorized(true)
          fetchClients(user.id)
        } else if (profile?.user_type === "team_member") {
          const { data: teamMember } = await supabase
            .from("team_members")
            .select("can_access_clients, is_active")
            .eq("user_id", user.id)
            .single()

          if (teamMember?.can_access_clients && teamMember?.is_active) {
            setIsAuthorized(true)
            fetchClients(user.id)
          } else {
            router.push("/team-dashboard")
          }
        } else {
          router.push("/")
        }
      } catch (error) {
        console.error("[v0] Error checking authorization:", error)
        router.push("/login")
      }
    }

    checkAuthAndFetch()
  }, [])

  const fetchClients = async (userId: string) => {
    setIsLoading(true)
    const { data, error } = await supabase
      .from("clients")
      .select("id, name, email, company, role, portal_email, has_portal_access, last_login, created_at, status")
      .eq("has_portal_access", true)
      .order("created_at", { ascending: false })

    if (error) {
      console.error("[v0] Error fetching clients:", error)
    } else {
      setClients(data || [])
    }
    setIsLoading(false)
  }

  if (!isAuthorized || isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background p-8">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex items-center gap-4 mb-6">
          <Button variant="ghost" size="icon" onClick={() => router.back()}>
            <ArrowLeft size={20} />
          </Button>
          <div>
            <h1 className="text-3xl font-bold">Client Logins</h1>
            <p className="text-muted-foreground">Manage client portal access and credentials</p>
          </div>
        </div>

        {clients.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <User className="h-12 w-12 text-muted-foreground/50 mb-4" />
              <p className="text-muted-foreground">No clients with portal access yet</p>
              <p className="text-sm text-muted-foreground">
                Create client credentials from the Clients panel to see them here
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {clients.map((client) => (
              <Card key={client.id} className="hover:shadow-md transition-all">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <CardTitle className="text-base truncate flex items-center gap-2">
                        {client.name}
                        {client.has_portal_access && (
                          <Badge variant="outline" className="bg-green-500/10 text-green-600 border-green-500/20">
                            Active
                          </Badge>
                        )}
                      </CardTitle>
                      {client.company && (
                        <p className="text-sm text-muted-foreground truncate mt-1">{client.company}</p>
                      )}
                      {client.role && <p className="text-xs text-muted-foreground">{client.role}</p>}
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="space-y-2">
                    {client.email && (
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Mail className="h-3 w-3 shrink-0" />
                        <span className="truncate">{client.email}</span>
                      </div>
                    )}
                    {client.portal_email && (
                      <div className="flex items-center gap-2 text-xs">
                        <LogIn className="h-3 w-3 shrink-0 text-primary" />
                        <span className="truncate font-medium text-primary">{client.portal_email}</span>
                      </div>
                    )}
                  </div>

                  {client.last_login && (
                    <div className="p-2 rounded-lg bg-muted/50 border">
                      <p className="text-xs text-muted-foreground">Last Login</p>
                      <p className="text-xs font-medium mt-0.5">
                        {format(parseISO(client.last_login), "MMM d, yyyy h:mm a")}
                      </p>
                    </div>
                  )}

                  {!client.last_login && (
                    <div className="p-2 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
                      <p className="text-xs text-yellow-700">Never logged in</p>
                    </div>
                  )}

                  <div className="pt-2 border-t">
                    <p className="text-xs text-muted-foreground">
                      Created: {format(parseISO(client.created_at), "MMM d, yyyy")}
                    </p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
