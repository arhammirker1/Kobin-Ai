"use client"

import { useEffect, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { Badge } from "@/components/ui/badge"

interface ProjectNameDisplayProps {
  projectId: string
}

export function ProjectNameDisplay({ projectId }: ProjectNameDisplayProps) {
  const [projectName, setProjectName] = useState<string | null>(null)
  const supabase = createClient()

  useEffect(() => {
    const fetchProjectName = async () => {
      const { data, error } = await supabase.from("projects").select("name").eq("id", projectId).single()

      if (!error && data) {
        setProjectName(data.name)
      }
    }

    fetchProjectName()
  }, [projectId])

  if (!projectName) return null

  return (
    <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-2 overflow-hidden">
      <span className="shrink-0">Project:</span>
      <Badge variant="outline" className="text-[8px] truncate max-w-[150px]">
        {projectName}
      </Badge>
    </div>
  )
}
