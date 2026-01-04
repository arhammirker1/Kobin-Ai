"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { format } from "date-fns"
import { CalendarIcon, Zap, ChevronRight, Linkedin, CheckSquare, Users, Video, Plus, Activity } from "lucide-react"
import { useEffect, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { cn } from "@/lib/utils"
import { differenceInHours } from "date-fns"

export function TodayView() {
  const [upcomingMeetings, setUpcomingMeetings] = useState<any[]>([])
  const [priorities, setPriorities] = useState<any[]>([])
  const [taskStats, setTaskStats] = useState({
    inProgress: 0,
    blocked: 0,
    completed: 0,
    todo: 0,
  })
  const [realStats, setRealStats] = useState({
    leads: 0,
    posts: 0,
  })
  const [activeTasks, setActiveTasks] = useState<any[]>([])

  const supabase = createClient()

  useEffect(() => {
    const loadDashboardData = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) return

      await Promise.all([fetchMeetingsAndMergePriorities(user.id), fetchTaskStats(user.id), fetchRealStats(user.id)])
    }

    loadDashboardData()
  }, [])

  const fetchMeetingsAndMergePriorities = async (userId: string) => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const tomorrow = new Date(today)
    tomorrow.setDate(tomorrow.getDate() + 1)

    const { data: events } = await supabase
      .from("events")
      .select(`
        id, title, start_time, end_time, type, meeting_link, purpose, relationship_id,
        relationships (full_name, company, tags)
      `)
      .eq("user_id", userId)
      .gte("start_time", today.toISOString())
      .lt("start_time", tomorrow.toISOString())
      .order("start_time", { ascending: true })

    const { data: tasks } = await supabase
      .from("tasks")
      .select("*")
      .eq("user_id", userId)
      .neq("status", "completed")
      .order("due_date", { ascending: true })

    const allMeetings = events || []
    setUpcomingMeetings(allMeetings)

    const meetingPriorities = allMeetings.map((e: any) => ({
      title: `${e.title}${e.relationships?.full_name ? ` w/ ${e.relationships.full_name}` : ""}`,
      tag: "Meeting",
      status: "scheduled",
      due_date: e.start_time,
      isUrgent: e.relationships?.tags?.some((t: string) => ["urgent", "follow-up"].includes(t.toLowerCase())) || false,
      type: "meeting",
    }))

    const taskPriorities = (tasks || []).map((t: any) => ({
      title: t.title,
      tag: t.priority,
      status: t.status,
      due_date: t.due_date,
      isUrgent:
        t.priority.toLowerCase() === "urgent" ||
        (t.due_date && differenceInHours(new Date(t.due_date), new Date()) < 5),
      type: "task",
    }))

    const merged = [...meetingPriorities, ...taskPriorities]
      .sort((a, b) => {
        const aTime = a.due_date ? new Date(a.due_date).getTime() : Number.POSITIVE_INFINITY
        const bTime = b.due_date ? new Date(b.due_date).getTime() : Number.POSITIVE_INFINITY
        return aTime - bTime
      })
      .slice(0, 3)

    setPriorities(merged)
  }

  const fetchTaskStats = async (userId: string) => {
    const { data, error } = await supabase
      .from("tasks")
      .select("status, title, priority, is_completed")
      .eq("user_id", userId)

    if (!error && data) {
      const stats = data.reduce(
        (acc, task) => {
          const s = (task.status || "todo").toLowerCase()
          if (s === "in-progress") acc.inProgress++
          else if (s === "blocked") acc.blocked++
          else if (s === "completed") acc.completed++
          else acc.todo++
          return acc
        },
        { inProgress: 0, blocked: 0, completed: 0, todo: 0 },
      )
      setTaskStats(stats)
      setActiveTasks(data.filter((t: any) => t.status === "in-progress" || t.status === "blocked").slice(0, 5))
    }
  }

  const fetchRealStats = async (userId: string) => {
    const [leadsRes, postsRes] = await Promise.all([
      supabase
        .from("relationships")
        .select("id", { count: "exact" })
        .eq("user_id", userId)
        .eq("relationship_type", "lead"),
      supabase.from("linkedin_posts").select("id", { count: "exact" }).eq("user_id", userId).eq("status", "Published"),
    ])

    setRealStats({
      leads: leadsRes.count || 0,
      posts: postsRes.count || 0,
    })
  }

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-700">
      <section>
        <div className="flex items-end justify-between mb-4">
          <div className="flex flex-col gap-1">
            <h1 className="text-3xl font-bold tracking-tight">Today View</h1>
            <p className="text-muted-foreground italic text-sm">"What should I focus on today?"</p>
          </div>
          <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground bg-muted/50 px-3 py-1.5 rounded-full border">
            <CalendarIcon size={12} />
            {new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Today's Priorities */}
          <Card className="lg:col-span-6 border-primary/20 bg-card/50 overflow-hidden relative min-h-[300px]">
            <div className="absolute top-0 right-0 p-4 opacity-5 pointer-events-none">
              <Zap size={80} className="text-primary" />
            </div>
            <CardHeader className="flex flex-row items-center justify-between pb-2 relative">
              <div className="space-y-0.5">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <Zap size={14} className="text-primary" />
                  Top 3 Priorities
                </CardTitle>
                <p className="text-[9px] text-muted-foreground">Focus on these to move the needle today.</p>
              </div>
              <Button variant="ghost" size="sm" className="h-6 gap-1 text-[9px] font-normal px-2">
                <Plus size={10} />
                Override
              </Button>
            </CardHeader>
            <CardContent className="space-y-2 relative pb-4">
              {priorities.length > 0 ? (
                priorities.map((p, i) => (
                  <div
                    key={i}
                    className="flex items-start justify-between p-2.5 rounded-lg bg-background/50 border border-border shadow-sm hover:border-primary/50 transition-all group cursor-pointer"
                  >
                    <div className="flex items-start gap-2.5">
                      <div className="mt-0.5 size-4 rounded-full border border-primary/30 flex items-center justify-center text-[9px] font-bold text-primary transition-all group-hover:bg-primary group-hover:text-primary-foreground">
                        {i + 1}
                      </div>
                      <div className="space-y-0.5">
                        <p className="font-semibold text-[11px] leading-tight group-hover:text-primary transition-colors line-clamp-1">
                          {p.title}
                        </p>
                        <div className="flex items-center gap-1.5">
                          <Badge
                            variant="secondary"
                            className={cn(
                              "text-[8px] h-3.5 font-bold uppercase tracking-tight px-1",
                              p.tag.toLowerCase() === "urgent" && "bg-red-500/10 text-red-500 border-red-500/20",
                              p.tag.toLowerCase() === "meeting" && "bg-blue-500/10 text-blue-500 border-blue-500/20",
                              p.tag.toLowerCase() === "high" && "bg-orange-500/10 text-orange-500 border-orange-500/20",
                            )}
                          >
                            {p.tag}
                          </Badge>
                          <Badge
                            variant="outline"
                            className={cn(
                              "text-[8px] h-3.5 font-medium px-1 bg-muted/50",
                              p.status === "blocked" && "text-red-400 border-red-400/30",
                              p.status === "in-progress" && "text-blue-400 border-blue-400/30",
                              p.status === "scheduled" && "text-emerald-400 border-emerald-400/30",
                            )}
                          >
                            {(p.status || "todo").replace("-", " ")}
                          </Badge>
                        </div>
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="flex flex-col items-center justify-center py-6 text-center h-[200px]">
                  <div className="size-10 rounded-full bg-muted/50 flex items-center justify-center mb-2">
                    <Zap size={20} className="text-muted-foreground/30" />
                  </div>
                  <h3 className="text-xs font-semibold mb-0.5">No urgent priorities right now</h3>
                  <p className="text-[10px] text-muted-foreground max-w-[180px]">
                    Create tasks with due dates or schedule meetings to see focus items here.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Quick Stats / Progress Panel */}
          <Card className="lg:col-span-6 border-none shadow-none bg-transparent">
            <CardContent className="p-0 space-y-4">
              <div className="space-y-2">
                <h3 className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest px-1 flex items-center gap-2">
                  <Activity size={10} className="text-primary" />
                  Execution Pipeline
                </h3>
                <div className="grid grid-cols-4 gap-2">
                  {[
                    { label: "In Progress", val: taskStats.inProgress, color: "" },
                    { label: "Blocked", val: taskStats.blocked, color: "text-red-400" },
                    { label: "Completed", val: taskStats.completed, color: "text-emerald-400" },
                    { label: "Total Todo", val: taskStats.todo, color: "" },
                  ].map((s, idx) => (
                    <div
                      key={idx}
                      className="p-2 rounded-lg bg-card border border-border shadow-sm flex flex-col gap-0.5"
                    >
                      <span
                        className={cn("text-[8px] font-bold uppercase truncate", s.color || "text-muted-foreground")}
                      >
                        {s.label}
                      </span>
                      <span className={cn("text-lg font-bold", s.color)}>{s.val}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Real Analytics Overview */}
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 rounded-xl bg-card border border-primary/20 shadow-sm flex flex-col gap-0.5 relative overflow-hidden group">
                  <div className="absolute -right-2 -bottom-2 opacity-5 group-hover:scale-110 transition-transform">
                    <Linkedin size={48} />
                  </div>
                  <span className="text-[9px] text-muted-foreground uppercase tracking-wider font-bold">Updates</span>
                  <div className="flex items-baseline gap-2">
                    <span className="text-xl font-bold">{realStats.posts}</span>
                    <Badge
                      variant="secondary"
                      className="text-[8px] h-3.5 font-bold bg-primary/10 text-primary border-none"
                    >
                      Live
                    </Badge>
                  </div>
                </div>
                <div className="p-3 rounded-xl bg-card border border-primary/20 shadow-sm flex flex-col gap-0.5 relative overflow-hidden group">
                  <div className="absolute -right-2 -bottom-2 opacity-5 group-hover:scale-110 transition-transform">
                    <Users size={48} />
                  </div>
                  <span className="text-[9px] text-muted-foreground uppercase tracking-wider font-bold">Leads</span>
                  <div className="flex items-baseline gap-2">
                    <span className="text-xl font-bold">{realStats.leads}</span>
                    <Badge className="text-[8px] h-3.5 bg-emerald-500/10 text-emerald-400 border-none font-bold">
                      Active
                    </Badge>
                  </div>
                </div>
              </div>

              {/* Quick Actions */}
              <div className="grid grid-cols-3 gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-9 px-2 bg-card hover:bg-primary hover:text-primary-foreground transition-all group border-primary/10 shadow-sm text-[10px]"
                >
                  <Plus size={14} className="mr-1.5 text-primary group-hover:text-primary-foreground" />
                  Note
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-9 px-2 bg-card hover:bg-primary hover:text-primary-foreground transition-all group border-primary/10 shadow-sm text-[10px]"
                >
                  <Linkedin size={14} className="mr-1.5 text-primary group-hover:text-primary-foreground" />
                  LinkedIn
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-9 px-2 bg-card hover:bg-primary hover:text-primary-foreground transition-all group border-primary/10 shadow-sm text-[10px]"
                >
                  <CheckSquare size={14} className="mr-1.5 text-primary group-hover:text-primary-foreground" />
                  Follow-up
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Meeting Hub */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 mt-6">
          <Card className="lg:col-span-8 border-border/50">
            <CardHeader className="flex flex-row items-center justify-between py-3">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <CalendarIcon size={16} className="text-primary" />
                Meetings Hub
              </CardTitle>
              <Badge
                variant="outline"
                className="font-bold text-[10px] border-emerald-200/50 text-emerald-400 bg-emerald-500/5"
              >
                {upcomingMeetings.length} Today
              </Badge>
            </CardHeader>
            <CardContent className="space-y-3 pb-4">
              {upcomingMeetings.length > 0 ? (
                upcomingMeetings.map((m, i) => {
                  const startTime = new Date(m.start_time)
                  const formattedTime = format(startTime, "h:mm")
                  const period = format(startTime, "a")
                  const hasFollowUpTag = m.relationships?.tags?.includes("follow-up")

                  return (
                    <div
                      key={i}
                      className="flex gap-4 p-4 rounded-xl hover:bg-muted/50 transition-all cursor-pointer group border border-transparent hover:border-border"
                    >
                      <div className="flex flex-col items-center gap-1 text-sm font-bold text-muted-foreground tabular-nums whitespace-nowrap min-w-[70px]">
                        {formattedTime}
                        <span className="text-[10px] font-medium opacity-60 uppercase">{period}</span>
                      </div>
                      <div className="w-px bg-border group-hover:bg-primary/30 transition-colors" />
                      <div className="flex-1 space-y-2">
                        <div className="flex items-center justify-between">
                          <p className="font-bold text-sm tracking-tight group-hover:text-primary transition-colors">
                            {m.title}
                          </p>
                          <div className="flex gap-1">
                            <Badge
                              variant="outline"
                              className={cn(
                                "text-[9px] h-4 font-bold uppercase tracking-widest",
                                m.type === "deal"
                                  ? "bg-amber-50 text-amber-600 border-amber-200"
                                  : "bg-muted text-muted-foreground",
                              )}
                            >
                              {m.type}
                            </Badge>
                            {hasFollowUpTag && (
                              <Badge variant="destructive" className="text-[9px] h-4 font-bold uppercase">
                                Follow-up
                              </Badge>
                            )}
                          </div>
                        </div>
                        {m.purpose && <p className="text-xs text-muted-foreground line-clamp-1">{m.purpose}</p>}
                        <div className="flex items-center justify-between">
                          {m.relationships && (
                            <div className="text-xs font-medium text-muted-foreground">
                              with {m.relationships.full_name}
                              {m.relationships.company && ` (${m.relationships.company})`}
                            </div>
                          )}
                          <div className="flex items-center gap-2">
                            {m.meeting_link && (
                              <Button
                                size="icon"
                                variant="ghost"
                                className="size-8 text-primary hover:bg-primary/10"
                                onClick={() => window.open(m.meeting_link, "_blank")}
                              >
                                <Video size={14} />
                              </Button>
                            )}
                            <ChevronRight
                              size={16}
                              className="text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity"
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  )
                })
              ) : (
                <div className="flex flex-col items-center justify-center py-10 text-center space-y-2 opacity-60">
                  <CalendarIcon size={24} className="text-muted-foreground" />
                  <p className="text-sm font-medium">No meetings scheduled today</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </section>
    </div>
  )
}
