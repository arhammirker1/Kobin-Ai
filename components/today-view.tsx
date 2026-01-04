"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { format } from "date-fns"
import {
  CalendarIcon,
  Zap,
  ChevronRight,
  Linkedin,
  CheckSquare,
  Users,
  Video,
  Plus,
  MessageSquare,
  Send,
  Activity,
} from "lucide-react"
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
    fetchUpcomingMeetings()
    fetchTopPriorities()
    fetchTaskStats()
    fetchRealStats()
  }, [])

  const fetchUpcomingMeetings = async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return

    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const tomorrow = new Date(today)
    tomorrow.setDate(tomorrow.getDate() + 1)

    const { data: events, error } = await supabase
      .from("events")
      .select(
        `
        id,
        title,
        start_time,
        end_time,
        type,
        meeting_link,
        purpose,
        relationship_id,
        relationships (
          full_name,
          company,
          tags
        )
      `,
      )
      .eq("user_id", user.id)
      .gte("start_time", today.toISOString())
      .lt("start_time", tomorrow.toISOString())
      .order("start_time", { ascending: true })

    if (!error && events) {
      setUpcomingMeetings(events)

      const meetingPriorities = events
        .filter((e: any) => e.relationships?.tags?.includes("follow-up") || e.relationships?.tags?.includes("urgent"))
        .slice(0, 3)
        .map((e: any, idx: number) => ({
          title: `${e.title} - ${e.purpose || "Meeting"}`,
          tag: e.type === "deal" ? "Deal" : "Meeting",
          time: "1 hour",
          isUrgent: true,
        }))

      setPriorities(meetingPriorities)
    }
  }

  const fetchTopPriorities = async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return

    const { data: tasks, error } = await supabase
      .from("tasks")
      .select("*")
      .eq("user_id", user.id)
      .neq("status", "completed")
      .order("due_date", { ascending: true })

    if (!error && tasks) {
      const priorityWeight: Record<string, number> = { urgent: 4, high: 3, medium: 2, low: 1 }

      const sortedPriorities = tasks
        .sort((a, b) => {
          const now = new Date()
          const aDue = a.due_date ? new Date(a.due_date) : null
          const bDue = b.due_date ? new Date(b.due_date) : null

          if (aDue && bDue) {
            const aHours = differenceInHours(aDue, now)
            const bHours = differenceInHours(bDue, now)

            if (aHours < 24 || bHours < 24) {
              return aHours - bHours
            }
          }

          const pA = priorityWeight[a.priority.toLowerCase()] || 0
          const pB = priorityWeight[b.priority.toLowerCase()] || 0
          if (pA !== pB) return pB - pA

          return 0
        })
        .slice(0, 3)
        .map((t) => ({
          title: t.title,
          tag: t.priority,
          status: t.status,
          due_date: t.due_date,
          isUrgent:
            t.priority.toLowerCase() === "urgent" ||
            (t.due_date && differenceInHours(new Date(t.due_date), new Date()) < 5),
        }))

      setPriorities(sortedPriorities)
    }
  }

  const fetchTaskStats = async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return

    const { data, error } = await supabase
      .from("tasks")
      .select("status, title, priority, is_completed")
      .eq("user_id", user.id)

    if (!error && data) {
      const stats = data.reduce(
        (acc, task) => {
          const s = task.status.toLowerCase()
          if (s === "in-progress") acc.inProgress++
          else if (s === "blocked") acc.blocked++
          else if (s === "completed") acc.completed++
          else if (s === "todo") acc.todo++
          return acc
        },
        { inProgress: 0, blocked: 0, completed: 0, todo: 0 },
      )
      setTaskStats(stats)
      setActiveTasks(data.filter((t: any) => t.status === "in-progress" || t.status === "blocked").slice(0, 5))
    }
  }

  const fetchRealStats = async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return

    const [leadsRes, postsRes] = await Promise.all([
      supabase
        .from("relationships")
        .select("id", { count: "exact" })
        .eq("user_id", user.id)
        .eq("relationship_type", "lead"),
      supabase.from("linkedin_posts").select("id", { count: "exact" }).eq("user_id", user.id).eq("status", "Published"),
    ])

    setRealStats({
      leads: leadsRes.count || 0,
      posts: postsRes.count || 0,
    })
  }

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
      <section>
        <div className="flex items-end justify-between mb-6">
          <div className="flex flex-col gap-1">
            <h1 className="text-3xl font-bold tracking-tight">Today View</h1>
            <p className="text-muted-foreground italic">"What should I focus on today?"</p>
          </div>
          <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground bg-muted/50 px-3 py-1.5 rounded-full border">
            <CalendarIcon size={14} />
            {new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Today's Priorities */}
          <Card className="lg:col-span-7 border-primary/20 bg-card/50 overflow-hidden relative">
            <div className="absolute top-0 right-0 p-4 opacity-10 pointer-events-none">
              <Zap size={100} className="text-primary" />
            </div>
            <CardHeader className="flex flex-row items-center justify-between pb-3 relative">
              <div className="space-y-1">
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  <Zap size={16} className="text-primary" />
                  Top 3 Priorities
                </CardTitle>
                <p className="text-[10px] text-muted-foreground">Focus on these to move the needle today.</p>
              </div>
              <Button variant="ghost" size="sm" className="h-7 gap-1.5 text-[10px] font-normal">
                <Plus size={12} />
                Override
              </Button>
            </CardHeader>
            <CardContent className="space-y-3 relative pb-4">
              {priorities.length > 0 ? (
                priorities.map((p, i) => (
                  <div
                    key={i}
                    className="flex items-start justify-between p-3 rounded-lg bg-background/50 border border-border shadow-sm hover:border-primary/50 transition-all group cursor-pointer"
                  >
                    <div className="flex items-start gap-3">
                      <div className="mt-0.5 size-5 rounded-full border border-primary/30 flex items-center justify-center text-[10px] font-bold text-primary transition-all group-hover:bg-primary group-hover:text-primary-foreground">
                        {i + 1}
                      </div>
                      <div className="space-y-1">
                        <p className="font-semibold text-xs leading-tight group-hover:text-primary transition-colors">
                          {p.title}
                        </p>
                        <div className="flex items-center gap-2">
                          <Badge
                            variant="secondary"
                            className={cn(
                              "text-[9px] h-4 font-bold uppercase tracking-widest px-1.5",
                              p.tag.toLowerCase() === "urgent" && "bg-red-500/10 text-red-500 border-red-500/20",
                              p.tag.toLowerCase() === "high" && "bg-orange-500/10 text-orange-500 border-orange-500/20",
                            )}
                          >
                            {p.tag}
                          </Badge>
                          <Badge
                            variant="outline"
                            className={cn(
                              "text-[9px] h-4 font-medium px-1.5 bg-muted/50",
                              p.status === "blocked" && "text-red-400 border-red-400/30",
                              p.status === "in-progress" && "text-blue-400 border-blue-400/30",
                            )}
                          >
                            {p.status.replace("-", " ")}
                          </Badge>
                        </div>
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="flex flex-col items-center justify-center py-10 text-center">
                  <div className="size-12 rounded-full bg-muted/50 flex items-center justify-center mb-3">
                    <Zap size={24} className="text-muted-foreground/30" />
                  </div>
                  <h3 className="text-sm font-semibold mb-1">No urgent priorities right now</h3>
                  <p className="text-[11px] text-muted-foreground max-w-[200px]">
                    Create tasks with due dates to see focus items here.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Quick Stats / Progress Panel */}
          <Card className="lg:col-span-5 border-none shadow-none bg-transparent">
            <CardContent className="p-0 space-y-6">
              <div className="space-y-3">
                <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-widest px-1 flex items-center gap-2">
                  <Activity size={12} className="text-primary" />
                  Execution Pipeline
                </h3>
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-4 rounded-xl bg-card border border-border shadow-sm flex flex-col gap-1">
                    <span className="text-[10px] text-muted-foreground font-bold uppercase">In Progress</span>
                    <span className="text-2xl font-bold">{taskStats.inProgress}</span>
                  </div>
                  <div className="p-4 rounded-xl bg-card border border-border shadow-sm flex flex-col gap-1">
                    <span className="text-[10px] text-red-400 font-bold uppercase">Blocked</span>
                    <span className="text-2xl font-bold text-red-400">{taskStats.blocked}</span>
                  </div>
                  <div className="p-4 rounded-xl bg-card border border-border shadow-sm flex flex-col gap-1">
                    <span className="text-[10px] text-emerald-400 font-bold uppercase">Completed</span>
                    <span className="text-2xl font-bold text-emerald-400">{taskStats.completed}</span>
                  </div>
                  <div className="p-4 rounded-xl bg-card border border-border shadow-sm flex flex-col gap-1">
                    <span className="text-[10px] text-muted-foreground font-bold uppercase">Total Todo</span>
                    <span className="text-2xl font-bold">{taskStats.todo}</span>
                  </div>
                </div>
              </div>

              {/* Real Analytics Overview */}
              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 rounded-2xl bg-card border border-primary/20 shadow-sm flex flex-col gap-1 relative overflow-hidden group">
                  <div className="absolute -right-2 -bottom-2 opacity-5 group-hover:scale-110 transition-transform">
                    <Linkedin size={64} />
                  </div>
                  <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-bold">Updates</span>
                  <div className="flex items-baseline gap-2">
                    <span className="text-2xl font-bold">{realStats.posts}</span>
                    <Badge
                      variant="secondary"
                      className="text-[9px] h-4 font-bold bg-primary/10 text-primary border-none"
                    >
                      Live
                    </Badge>
                  </div>
                </div>
                <div className="p-4 rounded-2xl bg-card border border-primary/20 shadow-sm flex flex-col gap-1 relative overflow-hidden group">
                  <div className="absolute -right-2 -bottom-2 opacity-5 group-hover:scale-110 transition-transform">
                    <Users size={64} />
                  </div>
                  <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-bold">Leads</span>
                  <div className="flex items-baseline gap-2">
                    <span className="text-2xl font-bold">{realStats.leads}</span>
                    <Badge className="text-[9px] h-4 bg-emerald-500/10 text-emerald-400 border-none font-bold">
                      Active
                    </Badge>
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-widest px-1">
                  Quick Actions
                </h3>
                <div className="grid grid-cols-1 gap-2">
                  <Button
                    variant="outline"
                    className="justify-start h-12 px-4 bg-card hover:bg-primary hover:text-primary-foreground transition-all group border-primary/10 shadow-sm"
                  >
                    <Plus size={18} className="mr-3 text-primary group-hover:text-primary-foreground" />
                    <span className="font-medium">Capture Note</span>
                  </Button>
                  <Button
                    variant="outline"
                    className="justify-start h-12 px-4 bg-card hover:bg-primary hover:text-primary-foreground transition-all group border-primary/10 shadow-sm"
                  >
                    <Linkedin size={18} className="mr-3 text-primary group-hover:text-primary-foreground" />
                    <span className="font-medium">Schedule LinkedIn</span>
                  </Button>
                  <Button
                    variant="outline"
                    className="justify-start h-12 px-4 bg-card hover:bg-primary hover:text-primary-foreground transition-all group border-primary/10 shadow-sm"
                  >
                    <CheckSquare size={18} className="mr-3 text-primary group-hover:text-primary-foreground" />
                    <span className="font-medium">Log Follow-up</span>
                  </Button>
                </div>
              </div>

              {/* Dynamic Icons */}
              <div className="space-y-3">
                <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-widest px-1">
                  Recent Activities
                </h3>
                <div className="grid grid-cols-1 gap-2">
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
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 mt-8">
          {/* Smart Calendar / Meetings */}
          <Card className="lg:col-span-7">
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <CardTitle className="text-lg font-semibold flex items-center gap-2">
                <CalendarIcon size={18} className="text-primary" />
                Meetings Hub
              </CardTitle>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="font-normal border-emerald-200 text-emerald-600 bg-emerald-50">
                  {upcomingMeetings.length} Today
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
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

          {/* Execution Tracker */}
          <Card className="lg:col-span-5">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg font-semibold flex items-center gap-2">
                <CheckSquare size={18} className="text-primary" />
                Execution Center
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-3">
                <div className="flex items-center justify-between px-1">
                  <h4 className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">In Progress</h4>
                  <Badge variant="outline" className="text-[9px] font-bold">
                    {activeTasks.length} Active
                  </Badge>
                </div>
                <div className="space-y-2">
                  {activeTasks.length > 0 ? (
                    activeTasks.map((task, i) => {
                      const progress = task.is_completed ? 100 : task.status === "in-progress" ? 50 : 20

                      return (
                        <div
                          key={task.id}
                          className="p-3 rounded-xl bg-muted/30 border border-transparent hover:border-border transition-all cursor-pointer"
                        >
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-sm font-semibold">{task.title}</span>
                            <div className="flex items-center gap-2">
                              {task.priority && (
                                <Badge
                                  variant="outline"
                                  className={cn(
                                    "text-[9px] font-bold uppercase h-4",
                                    task.priority === "urgent"
                                      ? "bg-red-50 text-red-600 border-red-200"
                                      : task.priority === "high"
                                        ? "bg-orange-50 text-orange-600 border-orange-200"
                                        : "bg-muted text-muted-foreground",
                                  )}
                                >
                                  {task.priority}
                                </Badge>
                              )}
                              <span className="text-[10px] font-bold text-primary">{progress}%</span>
                            </div>
                          </div>
                          <div className="h-1.5 w-full bg-secondary rounded-full overflow-hidden">
                            <div
                              className="h-full bg-primary rounded-full transition-all duration-500"
                              style={{ width: `${progress}%` }}
                            />
                          </div>
                        </div>
                      )
                    })
                  ) : (
                    <div className="py-8 text-center text-xs text-muted-foreground italic">
                      No active tasks currently in progress.
                    </div>
                  )}
                </div>
              </div>

              <div className="pt-2">
                <Button className="w-full h-11 bg-primary/10 hover:bg-primary/20 text-primary border-none shadow-none font-bold text-sm">
                  Review All Tasks
                  <ChevronRight size={16} className="ml-1" />
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </section>
    </div>
  )
}
