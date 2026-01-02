"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import {
  Plus,
  TrendingUp,
  MessageSquare,
  Eye,
  Calendar,
  Clock,
  Send,
  MoreHorizontal,
  ChevronRight,
  BarChart2,
  ThumbsUp,
} from "lucide-react"
import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import { toast } from "sonner"

const ANALYTICS = [
  { label: "Profile Visits", value: "2,482", change: "+18%", Icon: Eye },
  { label: "Post Impressions", value: "84.2k", change: "+24%", Icon: TrendingUp },
  { label: "Engagements", value: "1,240", change: "+5%", Icon: ThumbsUp },
  { label: "New Leads", value: "14", change: "+2", Icon: BarChart2 },
]

export function LinkedinView() {
  const [drafts, setDrafts] = useState<any[]>([])
  const [content, setContent] = useState("")
  const [isLoading, setIsLoading] = useState(false)

  const supabase = createClient()

  useEffect(() => {
    fetchDrafts()
  }, [])

  const fetchDrafts = async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return

    const { data, error } = await supabase
      .from("linkedin_posts")
      .select("*")
      .eq("user_id", user.id)
      .eq("status", "draft")
      .order("created_at", { ascending: false })

    if (error) {
      console.error("[v0] Error fetching drafts:", error)
    } else {
      setDrafts(data || [])
    }
  }

  const handleSaveDraft = async () => {
    if (!content.trim()) return
    setIsLoading(true)

    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return

    const { error } = await supabase.from("linkedin_posts").insert({
      user_id: user.id,
      content,
      status: "draft",
    })

    if (error) {
      toast.error("Failed to save draft")
    } else {
      toast.success("Draft saved to inbox")
      setContent("")
      fetchDrafts()
    }
    setIsLoading(false)
  }

  const handleLinkedInConnect = () => {
    window.location.href = "/api/auth/linkedin"
  }

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-3xl font-bold tracking-tight">LinkedIn Content</h1>
          <p className="text-muted-foreground text-sm">
            Founder-first personal branding. Build authority, generate leads.
          </p>
        </div>
        <Button className="gap-2 shadow-sm font-bold" onClick={handleLinkedInConnect}>
          <Plus size={18} />
          Connect LinkedIn
        </Button>
      </div>

      {/* Analytics Overview */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {ANALYTICS.map((stat, i) => (
          <Card key={i} className="border-none shadow-sm bg-white overflow-hidden group">
            <CardContent className="p-4 flex flex-col gap-1 relative">
              <div className="absolute -right-2 -bottom-2 opacity-5 group-hover:scale-110 transition-transform">
                <stat.Icon size={64} />
              </div>
              <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-bold">{stat.label}</span>
              <div className="flex items-baseline gap-2">
                <span className="text-xl font-bold">{stat.value}</span>
                <span className="text-[10px] text-emerald-500 font-bold flex items-center gap-0.5">{stat.change}</span>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Editor / Drafting Area */}
        <div className="lg:col-span-7 space-y-6">
          <Tabs defaultValue="editor" className="w-full">
            <TabsList className="bg-muted/50 p-1 border">
              <TabsTrigger value="editor" className="px-6 font-bold">
                Editor
              </TabsTrigger>
              <TabsTrigger value="preview" className="px-6 font-bold">
                Formatting Preview
              </TabsTrigger>
            </TabsList>
            <TabsContent value="editor" className="mt-4 space-y-4">
              <Card>
                <CardContent className="p-4 space-y-4">
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-muted-foreground uppercase tracking-widest">
                      Content Draft
                    </label>
                    <Textarea
                      placeholder="Share your founder journey..."
                      className="min-h-[240px] border-none shadow-none focus-visible:ring-0 p-0 text-base leading-relaxed resize-none"
                      value={content}
                      onChange={(e) => setContent(e.target.value)}
                    />
                  </div>
                  <div className="flex items-center justify-between pt-4 border-t">
                    <div className="flex items-center gap-4 text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
                      <span>{content.length} Characters</span>
                      <span>•</span>
                      <span>Estimated {Math.ceil(content.length / 500)} min read</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="font-bold bg-transparent"
                        onClick={handleSaveDraft}
                        disabled={isLoading}
                      >
                        Save to Inbox
                      </Button>
                      <Button size="sm" className="gap-2 font-bold" disabled={isLoading}>
                        <Calendar size={14} />
                        Schedule
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
            <TabsContent value="preview" className="mt-4">
              <Card className="bg-muted/10 border-dashed">
                <CardContent className="p-12 text-center text-muted-foreground italic">
                  Live preview will render here as you type...
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>

        {/* Sidebar: Inbox & Reminders */}
        <div className="lg:col-span-5 space-y-6">
          <Card>
            <CardHeader className="pb-3 flex flex-row items-center justify-between">
              <CardTitle className="text-sm font-bold flex items-center gap-2 uppercase tracking-widest text-muted-foreground">
                Content Inbox
              </CardTitle>
              <Badge variant="outline" className="text-[9px] font-bold">
                {drafts.length} Drafts
              </Badge>
            </CardHeader>
            <CardContent className="space-y-3">
              {drafts.map((draft) => (
                <div
                  key={draft.id}
                  className="p-3 rounded-xl bg-muted/30 border border-transparent hover:border-primary/20 hover:bg-white transition-all cursor-pointer group"
                >
                  <div className="flex items-start justify-between mb-1">
                    <h4 className="text-sm font-bold truncate group-hover:text-primary transition-colors">
                      {draft.content.split("\n")[0].substring(0, 40)}...
                    </h4>
                    <MoreHorizontal size={14} className="text-muted-foreground" />
                  </div>
                  <p className="text-xs text-muted-foreground line-clamp-2 mb-3 font-medium">{draft.content}</p>
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold flex items-center gap-1 text-primary">
                      <Clock size={10} />
                      Drafted {new Date(draft.created_at).toLocaleDateString()}
                    </span>
                    <span className="text-[10px] font-bold text-muted-foreground uppercase">
                      {draft.content.length} chars
                    </span>
                  </div>
                </div>
              ))}
              {drafts.length === 0 && (
                <div className="text-center py-8 text-muted-foreground text-xs italic">
                  No drafts in your inbox yet.
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="bg-primary/5 border-primary/20">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-bold flex items-center gap-2 uppercase tracking-widest text-primary">
                Smart Reminders
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {[
                { label: "Reply to 12 comments on latest post", icon: MessageSquare },
                { label: "New DMs from 3 potential leads", icon: Send },
              ].map((r, i) => (
                <div key={i} className="flex items-center justify-between text-sm group cursor-pointer">
                  <div className="flex items-center gap-2 font-medium">
                    <r.icon size={14} className="text-primary" />
                    <span>{r.label}</span>
                  </div>
                  <ChevronRight
                    size={14}
                    className="text-muted-foreground group-hover:text-primary transition-colors"
                  />
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
