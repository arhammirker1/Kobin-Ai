"use client"

import type React from "react"
import { useState, useEffect } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { toast } from "sonner"
import { createClient } from "@/lib/supabase/client"
import { Eye, EyeOff, Mail, Lock } from "lucide-react"

interface CreateClientModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  relationshipId: string
  relationshipName: string
  onClientCreated?: () => void
}

interface Project {
  id: string
  name: string
}

export function CreateClientModal({
  open,
  onOpenChange,
  relationshipId,
  relationshipName,
  onClientCreated,
}: CreateClientModalProps) {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [projectId, setProjectId] = useState<string | null>(null)
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(false)
  const [projectsLoading, setProjectsLoading] = useState(true)
  const supabase = createClient()

  useEffect(() => {
    if (open) {
      fetchProjects()
    }
  }, [open])

  const fetchProjects = async () => {
    try {
      setProjectsLoading(true)
      if (!supabase) {
        toast.error("Supabase not configured")
        return
      }

      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) return

      const { data, error } = await supabase
        .from("projects")
        .select("id, name")
        .eq("founder_id", user.id)
        .eq("status", "active")
        .order("created_at", { ascending: false })

      if (error) throw error
      setProjects(data || [])
    } catch (error) {
      console.error("Error fetching projects:", error)
      toast.error("Failed to load projects")
    } finally {
      setProjectsLoading(false)
    }
  }

  const validateForm = (): boolean => {
    if (!email.trim()) {
      toast.error("Email is required")
      return false
    }
    if (!email.includes("@")) {
      toast.error("Please enter a valid email")
      return false
    }
    if (!password || password.length < 8) {
      toast.error("Password must be at least 8 characters")
      return false
    }
    return true
  }

  const handleCreateClient = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!validateForm()) return
    if (!supabase) {
      toast.error("Supabase not configured")
      return
    }

    try {
      setLoading(true)
      const response = await fetch("/api/create-client", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          password,
          relationship_id: relationshipId,
          relationship_name: relationshipName,
          project_id: projectId,
        }),
      })

      const data = await response.json()
      if (!response.ok) {
        throw new Error(data.message || "Failed to create client")
      }

      toast.success("Client account created successfully")
      setEmail("")
      setPassword("")
      setProjectId(null)
      onOpenChange(false)
      onClientCreated?.()
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Failed to create client"
      toast.error(errorMessage)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Create Client Account</DialogTitle>
          <p className="text-sm text-muted-foreground mt-2">
            Creating account for <span className="font-semibold">{relationshipName}</span>
          </p>
        </DialogHeader>

        <form onSubmit={handleCreateClient} className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="client-email" className="flex items-center gap-2">
              <Mail size={16} />
              Email
            </Label>
            <Input
              id="client-email"
              type="email"
              placeholder="client@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={loading}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="client-password" className="flex items-center gap-2">
              <Lock size={16} />
              Password
            </Label>
            <div className="relative">
              <Input
                id="client-password"
                type={showPassword ? "text" : "password"}
                placeholder="Minimum 8 characters"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={loading}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                disabled={loading}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
            <p className="text-xs text-muted-foreground">Minimum 8 characters</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="client-project">Assign to Project (Optional)</Label>
            {projectsLoading ? (
              <p className="text-sm text-muted-foreground py-2">Loading projects...</p>
            ) : projects.length > 0 ? (
              <Select value={projectId || ""} onValueChange={(value) => setProjectId(value || null)}>
                <SelectTrigger id="client-project">
                  <SelectValue placeholder="Select a project" />
                </SelectTrigger>
                <SelectContent>
                  {projects.map((project) => (
                    <SelectItem key={project.id} value={project.id}>
                      {project.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <p className="text-sm text-muted-foreground py-2">No active projects available</p>
            )}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? "Creating..." : "Create Client"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
