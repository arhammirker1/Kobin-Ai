"use client"

import { Search, Plus, Timer, LogOut } from "lucide-react"
import { Button } from "@/components/ui/button"
import { createClient } from "@/lib/supabase/client"
import { useRouter } from "next/navigation"
import { useEffect, useState, useCallback } from "react"
import { SidebarTrigger } from "@/components/ui/sidebar"
import { CommandBar } from "@/components/command-bar"

export function Header() {
  const router = useRouter()
  const supabase = createClient()
  const [userName, setUserName] = useState<string>("")
  const [commandBarOpen, setCommandBarOpen] = useState(false)

  const openCommandBar = useCallback(() => setCommandBarOpen(true), [])

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
    <header className="h-16 border-b flex items-center justify-between px-4 md:px-8 bg-background/80 backdrop-blur-md sticky top-0 z-10">
      <div className="flex items-center gap-3 md:gap-4">
        <SidebarTrigger className="md:hidden" />
        <button
          onClick={openCommandBar}
          className="relative flex items-center gap-2.5 w-full max-w-md h-9 pl-9 pr-3 rounded-md bg-muted/50 border border-transparent hover:border-border/50 transition-colors text-sm text-muted-foreground cursor-pointer"
        >
          <Search className="absolute left-2.5 h-4 w-4 text-muted-foreground" />
          <span className="flex-1 text-left">Ask AI anything…</span>
          <div className="flex items-center gap-1 shrink-0">
            <kbd className="text-[10px] px-1.5 py-0.5 border border-border/60 rounded bg-background/50">⌘K</kbd>
          </div>
        </button>
      </div>

      <div className="flex items-center gap-2 md:gap-3">
        <Button variant="outline" size="sm" className="hidden md:flex gap-2 bg-transparent">
          <Timer size={16} />
          <span className="hidden lg:inline">Focus Mode</span>
        </Button>
        <Button size="sm" className="gap-2">
          <Plus size={16} />
          <span className="hidden sm:inline">New Action</span>
        </Button>
        <div className="w-px h-4 bg-border mx-1 hidden md:block" />
        {userName && <span className="text-sm font-medium text-muted-foreground hidden lg:inline">{userName}</span>}
        <Button variant="ghost" size="icon" onClick={handleSignOut} title="Sign Out">
          <LogOut size={18} />
        </Button>
      </div>
    <CommandBar open={commandBarOpen} onClose={() => setCommandBarOpen(false)} />
    </header>
  )
}
