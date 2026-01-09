"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { format } from "date-fns"
import { CalendarIcon, Zap, ChevronRight, CheckSquare, Video, Activity } from "lucide-react"
import { useEffect, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { cn } from "@/lib/utils"
import { differenceInHours } from "date-fns"

export function ClientHomeView({ clientData }: { clientData: any }) {
  const [upcomingMeetings, setUpcomingMeetings] = useState<any[]>([])
  const [priorities, setPriorities] = useState<any[]>([])
  const [taskStats, setTaskStats] = useState({
    inProgress: 0,
    blocked: 0,
    completed: 0,
    todo: 0,
  })
  const [activeTasks, setActiveTasks] = useState<any[]>([])

  const supabase = createClient()

  useEffect(() => {
    const loadDashboardData = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user || !clientData) return

      await Promise.all([fetchMeetingsAndMergePriorities(user.id), fetchTaskStats(user.id)])
    }

    loadDashboardData()
  }, [clientData])

  const fetchMeetingsAndMergePriorities = async (userId: string) => {
    const { data: events, error: eventsError } = await supabase
      .from("events")
      .select(`
        id, 
        title, 
        start_time, 
        end_time, 
        type, 
        meeting_link, 
        purpose
      `)
      .eq("client_id", clientData.id)
      .gte("start_time", new Date().toISOString())
      .order("start_time", { ascending: true })

    if (eventsError) {
      console.error("[v0] Error fetching client meetings:", eventsError)
    }

    const upcomingEvents = events || []
    setUpcomingMeetings(upcomingEvents)

    // Fetch client's tasks
    const { data: tasks } = await supabase
      .from("tasks")
      .select("id, title, status, priority, due_date")
      .eq("project_id", clientData.project_id)
      .neq("status", "completed")
      .order("due_date", { ascending: true })

    const meetingPriorities = upcomingEvents.map((e: any) => ({
      title: e.title,
      tag: "Meeting",
      status: "scheduled",
      due_date: e.start_time,
      isUrgent: false,
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
    const { data } = await supabase.from("tasks").select("status").eq("project_id", clientData.project_id)

    if (data) {
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
    }
  }

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-700">
      <section>
        <div className="flex items-end justify-between mb-4">
          <div className="flex flex-col gap-1">
            <h1 className="text-3xl font-bold tracking-tight">Welcome to Your Portal</h1>
            <p className="text-muted-foreground italic text-sm text-balance">
              "Stay updated on your projects and meetings"
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground bg-muted/50 px-3 py-1.5 rounded-full border">
            <CalendarIcon size={12} />
            {new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Main Content Area */}
          <div className="lg:col-span-8 space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Top 3 Priorities */}
              <Card className="border-primary/20 bg-card/50 overflow-hidden relative min-h-[280px]">
                <div className="absolute top-0 right-0 p-4 opacity-5 pointer-events-none">
                  <Zap size={80} className="text-primary" />
                </div>
                <CardHeader className="flex flex-row items-center justify-between pb-2 relative">
                  <div className="space-y-0.5">
                    <CardTitle className="text-sm font-semibold flex items-center gap-2">
                      <Zap size={14} className="text-primary" />
                      Top 3 Priorities
                    </CardTitle>
                    <p className="text-[9px] text-muted-foreground">Upcoming meetings and key tasks</p>
                  </div>
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
                                  p.tag.toLowerCase() === "meeting" &&
                                    "bg-blue-500/10 text-blue-500 border-blue-500/20",
                                  p.tag.toLowerCase() === "high" &&
                                    "bg-orange-500/10 text-orange-500 border-orange-500/20",
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
                    <div className="flex flex-col items-center justify-center py-6 text-center h-[180px]">
                      <div className="size-10 rounded-full bg-muted/50 flex items-center justify-center mb-2">
                        <Zap size={20} className="text-muted-foreground/30" />
                      </div>
                      <h3 className="text-xs font-semibold mb-0.5">No upcoming items</h3>
                      <p className="text-[10px] text-muted-foreground max-w-[180px]">Check back soon for updates</p>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Execution Pipeline & Performance Metrics */}
              <div className="space-y-4">
                <Card className="border-border/50 bg-card/30">
                  <CardHeader className="pb-2 pt-4">
                    <h3 className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest flex items-center gap-2">
                      <Activity size={10} className="text-primary" />
                      Execution Pipeline
                    </h3>
                  </CardHeader>
                  <CardContent className="space-y-3 pb-4">
                    <div className="grid grid-cols-2 gap-2">
                      {[
                        { label: "In Progress", val: taskStats.inProgress },
                        { label: "Blocked", val: taskStats.blocked },
                      ].map((s, idx) => (
                        <div
                          key={idx}
                          className="p-2 rounded-lg bg-card border border-border shadow-sm flex flex-col gap-0.5"
                        >
                          <span className="text-[8px] font-bold uppercase text-muted-foreground truncate">
                            {s.label}
                          </span>
                          <span className="text-lg font-bold">{s.val}</span>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>

                <Card className="border-border/50 bg-card/30">
                  <CardHeader className="pb-2 pt-4">
                    <h3 className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest flex items-center gap-2">
                      <CheckSquare size={10} className="text-primary" />
                      Performance Metrics
                    </h3>
                  </CardHeader>
                  <CardContent className="space-y-3 pb-4">
                    <div className="grid grid-cols-2 gap-2">
                      {[
                        { label: "Completed", val: taskStats.completed },
                        {
                          label: "Total",
                          val: taskStats.completed + taskStats.todo + taskStats.inProgress + taskStats.blocked,
                        },
                      ].map((s, idx) => (
                        <div
                          key={idx}
                          className="p-2 rounded-lg bg-card border border-border shadow-sm flex flex-col gap-0.5"
                        >
                          <span className="text-[8px] font-bold uppercase text-muted-foreground truncate">
                            {s.label}
                          </span>
                          <span className="text-lg font-bold">{s.val}</span>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>

            {/* Meeting Hub */}
            <Card className="border-border/50 bg-card/30">
              <CardHeader className="flex flex-row items-center justify-between py-3">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <CalendarIcon size={16} className="text-primary" />
                  Meetings Hub
                </CardTitle>
                <Badge
                  variant="outline"
                  className="font-bold text-[10px] border-emerald-200/50 text-emerald-400 bg-emerald-500/5"
                >
                  {upcomingMeetings.length} Upcoming
                </Badge>
              </CardHeader>
              <CardContent className="space-y-3 pb-4">
                {upcomingMeetings.length > 0 ? (
                  upcomingMeetings.map((m, i) => {
                    const startTime = new Date(m.start_time)
                    const formattedTime = format(startTime, "h:mm")
                    const period = format(startTime, "a")

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
                          </div>
                          {m.purpose && <p className="text-xs text-muted-foreground line-clamp-1">{m.purpose}</p>}
                          <div className="flex items-center justify-between">
                            {m.meeting_link && (
                              <Button
                                size="icon"
                                variant="ghost"
                                className="size-8 text-primary hover:bg-primary/10"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  window.open(m.meeting_link, "_blank")
                                }}
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
                    )
                  })
                ) : (
                  <div className="flex flex-col items-center justify-center py-10 text-center space-y-2 opacity-60">
                    <CalendarIcon size={24} className="text-muted-foreground" />
                    <p className="text-sm font-medium">No meetings scheduled</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </section>
    </div>
  )
}
