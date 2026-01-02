"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Search, Plus, Filter, Mail, Phone, Calendar, Clock, ChevronRight } from "lucide-react"
import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import { toast } from "sonner"

const STAGES = ["new", "conversation", "proposal", "closed"]

export function CrmView() {
  const [relationships, setRelationships] = useState<any[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedStage, setSelectedStage] = useState<string | null>(null)

  const supabase = createClient()

  useEffect(() => {
    fetchRelationships()
  }, [])

  const fetchRelationships = async () => {
    setIsLoading(true)
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return

    const { data, error } = await supabase
      .from("relationships")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })

    if (error) {
      console.error("[v0] Error fetching relationships:", error)
    } else {
      setRelationships(data || [])
    }
    setIsLoading(false)
  }

  const handleAddRelationship = async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return

    const { error } = await supabase.from("relationships").insert({
      user_id: user.id,
      name: "New Contact",
      stage: "new",
    })

    if (error) {
      toast.error("Failed to add contact")
    } else {
      fetchRelationships()
      toast.success("New contact created")
    }
  }

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-3xl font-bold tracking-tight">Relationships</h1>
          <p className="text-muted-foreground text-sm">Minimalist CRM. Only the leads that matter.</p>
        </div>
        <Button className="gap-2 shadow-sm font-bold" onClick={handleAddRelationship}>
          <Plus size={18} />
          New Lead
        </Button>
      </div>

      <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
        <div className="flex items-center gap-2 overflow-x-auto pb-2 md:pb-0 w-full md:w-auto no-scrollbar">
          {STAGES.map((stage) => (
            <Badge
              key={stage}
              variant={selectedStage === stage ? "default" : "outline"}
              className="px-4 py-1.5 rounded-full font-bold whitespace-nowrap cursor-pointer hover:bg-muted/50 capitalize"
              onClick={() => setSelectedStage(selectedStage === stage ? null : stage)}
            >
              {stage.replace("-", " ")}
            </Badge>
          ))}
        </div>
        <div className="flex items-center gap-2 w-full md:w-auto">
          <div className="relative flex-1 md:w-64">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search people..."
              className="pl-9 bg-white border-muted shadow-none h-10"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <Button variant="outline" size="icon" className="h-10 w-10 shrink-0 bg-white">
            <Filter size={18} />
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {STAGES.filter((s) => !selectedStage || s === selectedStage).map((stage) => (
          <div key={stage} className="space-y-4">
            <div className="flex items-center justify-between px-2">
              <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-widest">{stage}</h3>
              <Badge variant="secondary" className="text-[10px] font-bold h-5 px-2 bg-muted/50">
                {relationships.filter((l) => l.stage === stage).length}
              </Badge>
            </div>
            <div className="space-y-3">
              {relationships
                .filter((l) => l.stage === stage && l.name.toLowerCase().includes(searchQuery.toLowerCase()))
                .map((lead) => (
                  <Card
                    key={lead.id}
                    className="group hover:border-primary/30 transition-all cursor-pointer shadow-sm relative overflow-hidden"
                  >
                    <div className="absolute top-0 left-0 w-1 h-full bg-primary/20 group-hover:bg-primary transition-colors" />
                    <CardContent className="p-4 space-y-3">
                      <div className="flex items-start justify-between">
                        <div>
                          <h4 className="font-bold text-sm group-hover:text-primary transition-colors">{lead.name}</h4>
                          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                            {lead.company || "No Company"}
                          </p>
                        </div>
                        <Badge variant="outline" className="text-[9px] font-bold uppercase tracking-widest h-4 px-1.5">
                          {lead.priority || "Medium"}
                        </Badge>
                      </div>

                      <div className="flex items-center justify-between pt-2 border-t border-muted/50">
                        <div className="flex items-center gap-1.5 text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
                          <Clock size={10} />
                          {lead.last_contact ? new Date(lead.last_contact).toLocaleDateString() : "Never"}
                        </div>
                        <span className="text-xs font-bold text-foreground">{lead.value || "$0"}</span>
                      </div>

                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity pt-1">
                        <Button variant="ghost" size="icon" className="size-8">
                          <Mail size={14} />
                        </Button>
                        <Button variant="ghost" size="icon" className="size-8">
                          <Phone size={14} />
                        </Button>
                        <Button variant="ghost" size="icon" className="size-8">
                          <Calendar size={14} />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              <Button
                variant="ghost"
                onClick={handleAddRelationship}
                className="w-full h-10 border-2 border-dashed rounded-xl border-muted hover:border-primary/30 hover:bg-primary/5 text-muted-foreground hover:text-primary gap-2 text-xs font-bold"
              >
                <Plus size={14} />
                Add Lead
              </Button>
            </div>
          </div>
        ))}
      </div>

      {/* Follow-up Section */}
      <Card className="bg-primary/5 border-primary/20">
        <CardHeader className="pb-3 flex flex-row items-center justify-between">
          <CardTitle className="text-sm font-bold flex items-center gap-2 uppercase tracking-widest text-primary">
            Critical Follow-ups
          </CardTitle>
          <Badge variant="outline" className="text-[9px] font-bold bg-white">
            Action Required
          </Badge>
        </CardHeader>
        <CardContent className="space-y-3">
          {[
            { name: "Marcus Thorne", action: "Send Proposal follow-up", deadline: "Today" },
            { name: "Sarah Chen", action: "Review intro request", deadline: "Yesterday" },
          ].map((item, i) => (
            <div
              key={i}
              className="flex items-center justify-between p-3 rounded-xl bg-white border border-primary/10 shadow-sm group cursor-pointer hover:border-primary/30 transition-all"
            >
              <div className="flex items-center gap-3">
                <div className="size-8 rounded-full bg-primary/10 flex items-center justify-center text-[10px] font-bold text-primary">
                  {item.name
                    .split(" ")
                    .map((n) => n[0])
                    .join("")}
                </div>
                <div className="flex flex-col">
                  <span className="text-sm font-bold">{item.name}</span>
                  <span className="text-xs text-muted-foreground font-medium">{item.action}</span>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <Badge variant="outline" className="text-[10px] font-bold uppercase tracking-widest px-2 h-5">
                  {item.deadline}
                </Badge>
                <ChevronRight size={16} className="text-muted-foreground group-hover:text-primary transition-colors" />
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  )
}

function cn(...inputs: any[]) {
  return inputs.filter(Boolean).join(" ")
}
