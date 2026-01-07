"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { createClient } from "@/lib/supabase/client"
import { toast } from "sonner"
import { CheckCircle2, Clock, FileText, Calendar } from "lucide-react"
import { format } from "date-fns"

interface TaskStats {
  total: number
  completed: number
  in_progress: number
  pending: number
}

interface ResourceRequest {
  id: string
  title: string
  description: string | null
  status: string
  created_at: string
}

interface UpcomingEvent {
  id: string
  title: string
  start_time: string
  meeting_link: string | null
}

export function ClientHomeView() {
  const [taskStats, setTaskStats] = useState<TaskStats>({
    total: 0,
    completed: 0,
    in_progress: 0,
    pending: 0,
  })
  const [resourceRequests, setResourceRequests] = useState<ResourceRequest[]>([])
  const [upcomingMeetings, setUpcomingMeetings] = useState<UpcomingEvent[]>([])
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  useEffect(() => {
    fetchClientData()
  }, [])

  const fetchClientData = async () => {
    try {
      setLoading(true)
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) return

      // Fetch task statistics
      const { data: tasks, error: tasksError } = await supabase
        .from("tasks")
        .select("status")
        .or(`assigned_to.eq.${user.id},created_by.eq.${user.id}`)

      if (!tasksError && tasks) {
        const stats: TaskStats = {
          total: tasks.length,
          completed: tasks.filter((t) => t.status === "completed").length,
          in_progress: tasks.filter((t) => t.status === "in-progress").length,
          pending: tasks.filter((t) => t.status === "pending").length,
        }
        setTaskStats(stats)
      }

      // Fetch upcoming meetings (events)
      const { data: events, error: eventsError } = await supabase
        .from("events")
        .select("id, title, start_time, meeting_link")
        .gte("start_time", new Date().toISOString())
        .limit(5)
        .order("start_time", { ascending: true })

      if (!eventsError && events) {
        setUpcomingMeetings(events as UpcomingEvent[])
      }

      // Placeholder for resource requests (this would be a real table in production)
      // For now, we'll show mock data
      setResourceRequests([
        {
          id: "1",
          title: "Design Assets Required",
          description: "Need logo files and brand guidelines",
          status: "pending",
          created_at: new Date().toISOString(),
        },
      ])
    } catch (error) {
      console.error("[v0] Error fetching client data:", error)
      toast.error("Failed to load dashboard data")
    } finally {
      setLoading(false)
    }
  }

  const completionPercentage = taskStats.total > 0 ? Math.round((taskStats.completed / taskStats.total) * 100) : 0

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading your dashboard...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Client Portal</h1>
        <p className="text-muted-foreground mt-2">Welcome! Here's an overview of your project, tasks, and meetings.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Tasks</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{taskStats.total}</div>
            <p className="text-xs text-muted-foreground mt-1">{taskStats.in_progress} in progress</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Completed</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-baseline gap-2">
              <div className="text-3xl font-bold">{taskStats.completed}</div>
              <span className="text-xs text-muted-foreground">({completionPercentage}%)</span>
            </div>
            <div className="w-full bg-muted rounded-full h-2 mt-3">
              <div
                className="bg-emerald-500 h-2 rounded-full transition-all duration-300"
                style={{ width: `${completionPercentage}%` }}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Upcoming Meetings</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{upcomingMeetings.length}</div>
            <p className="text-xs text-muted-foreground mt-1">
              Next {upcomingMeetings.length > 0 ? format(new Date(upcomingMeetings[0].start_time), "MMM d") : "—"}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Resources Requested</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{resourceRequests.length}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {resourceRequests.filter((r) => r.status === "pending").length} pending
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CheckCircle2 size={20} className="text-emerald-500" />
                Task Progress
              </CardTitle>
              <CardDescription>Your task completion overview</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div>
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-sm font-medium">Overall Progress</span>
                    <span className="text-lg font-bold text-emerald-600">{completionPercentage}%</span>
                  </div>
                  <div className="w-full bg-muted rounded-full h-3">
                    <div
                      className="bg-emerald-500 h-3 rounded-full transition-all duration-300"
                      style={{ width: `${completionPercentage}%` }}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-4 pt-4">
                  <div className="text-center p-3 rounded-lg bg-muted/50">
                    <div className="text-2xl font-bold text-emerald-600">{taskStats.completed}</div>
                    <p className="text-xs text-muted-foreground mt-1">Completed</p>
                  </div>
                  <div className="text-center p-3 rounded-lg bg-muted/50">
                    <div className="text-2xl font-bold text-blue-600">{taskStats.in_progress}</div>
                    <p className="text-xs text-muted-foreground mt-1">In Progress</p>
                  </div>
                  <div className="text-center p-3 rounded-lg bg-muted/50">
                    <div className="text-2xl font-bold text-amber-600">{taskStats.pending}</div>
                    <p className="text-xs text-muted-foreground mt-1">Pending</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calendar size={20} className="text-blue-500" />
                Upcoming Meetings
              </CardTitle>
              <CardDescription>Your scheduled meetings and calls</CardDescription>
            </CardHeader>
            <CardContent>
              {upcomingMeetings.length > 0 ? (
                <div className="space-y-3">
                  {upcomingMeetings.map((meeting) => (
                    <div
                      key={meeting.id}
                      className="flex items-start justify-between p-3 rounded-lg border border-border hover:bg-muted/50 transition-colors"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm truncate">{meeting.title}</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {format(new Date(meeting.start_time), "MMM d, h:mm a")}
                        </p>
                      </div>
                      {meeting.meeting_link && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="ml-2 shrink-0 bg-transparent"
                          onClick={() => window.open(meeting.meeting_link!, "_blank")}
                        >
                          Join
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8">
                  <Calendar className="h-12 w-12 text-muted-foreground/30 mx-auto mb-3" />
                  <p className="text-sm text-muted-foreground">No upcoming meetings scheduled</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText size={20} className="text-amber-500" />
                Resources
              </CardTitle>
              <CardDescription>Requested items and files</CardDescription>
            </CardHeader>
            <CardContent>
              {resourceRequests.length > 0 ? (
                <div className="space-y-3">
                  {resourceRequests.map((request) => (
                    <div key={request.id} className="p-3 rounded-lg border border-border space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <p className="font-medium text-sm flex-1">{request.title}</p>
                        <Badge
                          variant={request.status === "pending" ? "secondary" : "default"}
                          className="text-xs shrink-0"
                        >
                          {request.status}
                        </Badge>
                      </div>
                      {request.description && (
                        <p className="text-xs text-muted-foreground line-clamp-2">{request.description}</p>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8">
                  <FileText className="h-12 w-12 text-muted-foreground/30 mx-auto mb-3" />
                  <p className="text-sm text-muted-foreground">No pending resource requests</p>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium">Quick Actions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <Button variant="outline" className="w-full justify-start gap-2 bg-transparent">
                <Clock size={16} />
                View All Tasks
              </Button>
              <Button variant="outline" className="w-full justify-start gap-2 bg-transparent">
                <Calendar size={16} />
                Schedule Meeting
              </Button>
              <Button variant="outline" className="w-full justify-start gap-2 bg-transparent">
                <FileText size={16} />
                Request Resource
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
