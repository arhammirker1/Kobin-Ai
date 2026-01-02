"use client"

import { useEffect } from "react"
import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import {
  Search,
  Plus,
  FileText,
  Bookmark,
  Clock,
  Share2,
  MoreHorizontal,
  History,
  Tag,
  ChevronRight,
  MessageSquare,
  Send,
} from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { toast } from "sonner"

export function VaultView() {
  const [notes, setNotes] = useState<any[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState("")

  const supabase = createClient()

  useEffect(() => {
    fetchNotes()
  }, [])

  const fetchNotes = async () => {
    setIsLoading(true)
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return

    const { data, error } = await supabase
      .from("vault_notes")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })

    if (error) {
      console.error("[v0] Error fetching notes:", error)
    } else {
      setNotes(data || [])
    }
    setIsLoading(false)
  }

  const handleAddNote = async (isDecision = false) => {
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return

    const { error } = await supabase.from("vault_notes").insert({
      user_id: user.id,
      title: isDecision ? "New Strategic Decision" : "New Note",
      content: "Start typing your knowledge entry...",
      is_decision: isDecision,
    })

    if (error) {
      toast.error("Failed to capture knowledge")
    } else {
      fetchNotes()
      toast.success(isDecision ? "Decision logged" : "Note captured")
    }
  }

  const filteredNotes = notes.filter(
    (n) =>
      n.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      n.content.toLowerCase().includes(searchQuery.toLowerCase()),
  )

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-3xl font-bold tracking-tight">Knowledge Vault</h1>
          <p className="text-muted-foreground text-sm">
            Your second brain. Capture decisions, why they were made, and when.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" className="gap-2 font-bold bg-transparent" onClick={() => handleAddNote(true)}>
            <History size={18} />
            Decision Log
          </Button>
          <Button className="gap-2 shadow-sm font-bold" onClick={() => handleAddNote(false)}>
            <Plus size={18} />
            Capture Note
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-3 h-5 w-5 text-muted-foreground" />
          <Input
            placeholder="Search everything in your vault..."
            className="pl-10 h-12 bg-white border-muted shadow-sm rounded-2xl text-base"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <Button
          variant="outline"
          className="h-12 px-6 rounded-2xl bg-white border-muted font-bold text-sm hidden md:flex"
        >
          Filter by Tag
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Recent Notes Grid */}
        <div className="lg:col-span-8 space-y-6">
          <div className="flex items-center justify-between px-1">
            <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-widest flex items-center gap-2">
              <Bookmark size={14} className="text-primary" />
              Recent Notes
            </h3>
            <Button variant="link" size="sm" className="text-[10px] font-bold uppercase tracking-widest p-0 h-auto">
              View All
            </Button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filteredNotes
              .filter((n) => !n.is_decision)
              .map((note) => (
                <Card
                  key={note.id}
                  className="group hover:border-primary/30 transition-all cursor-pointer shadow-sm overflow-hidden flex flex-col"
                >
                  <CardContent className="p-5 flex-1 space-y-3">
                    <div className="flex items-start justify-between">
                      <h4 className="font-bold text-sm group-hover:text-primary transition-colors line-clamp-1">
                        {note.title}
                      </h4>
                      <MoreHorizontal size={14} className="text-muted-foreground shrink-0" />
                    </div>
                    <p className="text-xs text-muted-foreground line-clamp-3 leading-relaxed font-medium">
                      {note.content}
                    </p>
                    <div className="flex flex-wrap gap-2 pt-2">
                      {note.tags?.map((tag: string) => (
                        <Badge
                          key={tag}
                          variant="secondary"
                          className="text-[9px] font-bold h-4 px-1.5 uppercase tracking-widest bg-muted/50"
                        >
                          {tag}
                        </Badge>
                      ))}
                    </div>
                  </CardContent>
                  <div className="px-5 py-3 bg-muted/20 border-t border-muted/50 flex items-center justify-between text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
                    <span className="flex items-center gap-1">
                      <Clock size={10} />
                      {new Date(note.created_at).toLocaleDateString()}
                    </span>
                    <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Share2 size={12} className="hover:text-primary" />
                      <Tag size={12} className="hover:text-primary" />
                    </div>
                  </div>
                </Card>
              ))}
            <div
              className="flex flex-col items-center justify-center p-6 border-2 border-dashed rounded-3xl border-muted hover:border-primary/30 hover:bg-primary/5 transition-all group cursor-pointer"
              onClick={() => handleAddNote(false)}
            >
              <Plus
                size={32}
                className="text-muted-foreground group-hover:text-primary transition-transform group-hover:scale-110 mb-2"
              />
              <span className="text-sm font-bold text-muted-foreground group-hover:text-primary">
                New Knowledge Entry
              </span>
            </div>
          </div>
        </div>

        {/* Decision Log Summary Sidebar */}
        <div className="lg:col-span-4 space-y-6">
          <Card className="border-primary/20 bg-primary/5">
            <CardHeader className="pb-3 flex flex-row items-center justify-between">
              <CardTitle className="text-sm font-bold flex items-center gap-2 uppercase tracking-widest text-primary">
                <History size={16} />
                Decision Log
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {filteredNotes
                .filter((n) => n.is_decision)
                .map((d) => (
                  <div key={d.id} className="space-y-2 group cursor-pointer">
                    <div className="flex items-start justify-between">
                      <h5 className="text-sm font-bold group-hover:text-primary transition-colors tracking-tight">
                        {d.title}
                      </h5>
                      <Badge
                        className="text-[9px] font-bold uppercase tracking-widest h-4 px-1"
                        style={{
                          backgroundColor: d.impact === "High" ? "#FF0000" : "#808080",
                          color: d.impact === "High" ? "#FFFFFF" : "#000000",
                        }}
                      >
                        {d.impact}
                      </Badge>
                    </div>
                    <p className="text-[11px] text-muted-foreground font-medium italic leading-relaxed">
                      "{d.content}"
                    </p>
                    <div className="flex items-center justify-between text-[9px] font-bold text-muted-foreground uppercase tracking-widest pt-1">
                      <span>{new Date(d.created_at).toLocaleDateString()}</span>
                      <ChevronRight
                        size={12}
                        className="opacity-0 group-hover:opacity-100 transition-opacity text-primary"
                      />
                    </div>
                    {d.id !== filteredNotes.filter((n) => n.is_decision).length && (
                      <div className="h-px bg-primary/10 w-full mt-4" />
                    )}
                  </div>
                ))}
              <Button
                variant="ghost"
                className="w-full text-[10px] font-bold uppercase tracking-widest text-primary hover:bg-primary/10 h-8"
              >
                Open Full Audit Log
              </Button>
            </CardContent>
          </Card>

          {/* Quick Stats / Second Brain Health */}
          <Card className="bg-emerald-50/50 border-emerald-100">
            <CardContent className="p-4 flex items-center gap-4">
              <div className="size-10 rounded-xl bg-emerald-100 flex items-center justify-center text-emerald-600">
                <FileText size={20} />
              </div>
              <div className="flex flex-col">
                <span className="text-xl font-bold text-emerald-700">142</span>
                <span className="text-[10px] font-bold text-emerald-600 uppercase tracking-widest">
                  Knowledge Points
                </span>
              </div>
            </CardContent>
          </Card>

          {/* Smart Reminders */}
          <div className="space-y-2">
            {[
              { label: "Reply to 12 comments on latest post", Icon: MessageSquare },
              { label: "New DMs from 3 potential leads", Icon: Send },
            ].map((r, i) => (
              <div key={i} className="flex items-center justify-between text-sm group cursor-pointer">
                <div className="flex items-center gap-2 font-medium">
                  <r.Icon size={14} className="text-primary" />
                  <span>{r.label}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

function cn(...inputs: any[]) {
  return inputs.filter(Boolean).join(" ")
}
