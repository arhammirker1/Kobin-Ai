"use client"

import { Search, Plus, Timer, LogOut } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { createClient } from "@/lib/supabase/client"
import { useRouter } from "next/navigation"
import { useEffect, useState } from "react"

export function Header() {
  const router = useRouter()
  const supabase = createClient()
  const [userName, setUserName] = useState<string>("")

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
          }
        }
      } catch (error) {
        console.error("[v0] Failed to fetch user data:", error)
      }
    }

    getUserData()
  }, [supabase])

  const handleSignOut = async () => {
    try {
      await supabase.auth.signOut()
      router.push("/login")
      router.refresh()
    } catch (error) {
      console.error("[v0] Sign out error:", error)
    }
  }

  return (
    <header className="h-16 border-b flex items-center justify-between px-6 md:px-8 bg-background/80 backdrop-blur-md sticky top-0 z-10">
      <div className="flex items-center gap-4 flex-1 max-w-md">
        <div className="relative w-full">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Quick search... (⌘K)"
            className="pl-9 bg-muted/50 border-none focus-visible:ring-1"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                console.log("[v0] Global search triggered:", e.currentTarget.value)
              }
            }}
          />
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Button variant="outline" size="sm" className="hidden md:flex gap-2 bg-transparent">
          <Timer size={16} />
          Focus Mode
        </Button>
        <Button size="sm" className="gap-2">
          <Plus size={16} />
          New Action
        </Button>
        <div className="w-px h-4 bg-border mx-1" />
        {userName && <span className="text-sm font-medium text-muted-foreground hidden md:inline">{userName}</span>}
        <Button variant="ghost" size="icon" onClick={handleSignOut} title="Sign Out">
          <LogOut size={18} />
        </Button>
      </div>
    </header>
  )
}
