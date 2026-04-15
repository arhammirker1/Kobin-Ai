// Long-term intelligence memory system
import { supabaseAdmin } from "@/lib/supabase/admin"
import { withCache, bust } from "@/lib/redis"

export interface AIMemory {
  key: string
  value: string
  memory_type: "preference" | "pattern" | "workflow" | "fact"
  confidence: number
  times_observed: number
}

// Patterns the system auto-detects
const PATTERN_DETECTORS = [
  {
    key: "lead_followup_hours",
    detect: (data: any) => {
      if (!data.deals || data.deals.length < 3) return null
      const avgHours = data.deals
        .filter((d: any) => d.last_outbound_at && d.stage_entered_at)
        .map((d: any) => {
          const diff = new Date(d.last_outbound_at).getTime() - new Date(d.stage_entered_at).getTime()
          return diff / (1000 * 60 * 60)
        })
      if (avgHours.length === 0) return null
      const avg = Math.round(avgHours.reduce((a: number, b: number) => a + b, 0) / avgHours.length)
      return { value: String(avg), confidence: Math.min(avgHours.length / 10, 1) }
    },
    description: "hours between lead entry and first followup"
  }
]

export async function getMemories(founderId: string): Promise<AIMemory[]> {
  return withCache(`mem:${founderId}`, 300, async () => {
    const { data } = await supabaseAdmin
      .from("ai_memories")
      .select("key, value, memory_type, confidence, times_observed")
      .eq("founder_id", founderId)
      .order("confidence", { ascending: false })
      .limit(50)
    return (data || []) as AIMemory[]
  })
}

export async function upsertMemory(
  founderId: string,
  memory_type: AIMemory["memory_type"],
  key: string,
  value: string,
  confidence = 1.0
): Promise<void> {
  await supabaseAdmin
    .from("ai_memories")
    .upsert({
      founder_id: founderId,
      memory_type,
      key,
      value,
      confidence,
      last_seen_at: new Date().toISOString(),
      times_observed: 1,
    }, {
      onConflict: "founder_id,memory_type,key",
      // Increment times_observed and update value/confidence
    })
  
  // Increment counter separately (Supabase doesn't support upsert with increment easily)
  await supabaseAdmin.rpc("increment_memory_observation", {
    p_founder_id: founderId,
    p_type: memory_type,
    p_key: key,
  }).catch(() => {}) // Non-fatal

  await bust(`mem:${founderId}`)
}

export async function buildMemoryContext(founderId: string): Promise<string> {
  // AI Memory is Agency-only — return empty for other plans
  const { resolveFounderPlan } = await import("@/lib/plan-guard")
  const { getPlanLimits } = await import("@/lib/plans")
  const plan = await resolveFounderPlan(founderId)
  if (!getPlanLimits(plan).ai_memory) return ""

  const memories = await getMemories(founderId)
  if (memories.length === 0) return ""

  const lines = ["## What I know about your patterns:"]
  
  const preferences = memories.filter(m => m.memory_type === "preference")
  const patterns = memories.filter(m => m.memory_type === "pattern")
  const workflows = memories.filter(m => m.memory_type === "workflow")

  if (patterns.length > 0) {
    lines.push("Behavioral patterns:")
    patterns.slice(0, 5).forEach(m => lines.push(`- ${m.key}: ${m.value}`))
  }
  if (preferences.length > 0) {
    lines.push("Preferences:")
    preferences.slice(0, 5).forEach(m => lines.push(`- ${m.key}: ${m.value}`))
  }
  if (workflows.length > 0) {
    lines.push("Recurring workflows:")
    workflows.slice(0, 3).forEach(m => lines.push(`- ${m.value}`))
  }

  return lines.join("\n")
}

// Run after task creation to detect patterns
export async function learnFromAction(
  founderId: string,
  action: string,
  data: Record<string, any>
): Promise<void> {
  // AI Memory is Agency-only — don't learn for other plans
  const { resolveFounderPlan } = await import("@/lib/plan-guard")
  const { getPlanLimits } = await import("@/lib/plans")
  const plan = await resolveFounderPlan(founderId)
  if (!getPlanLimits(plan).ai_memory) return

  try {
    if (action === "task_created" && data.assigned_to_name && data.project) {
      await upsertMemory(
        founderId,
        "pattern",
        `default_assignee_for_${data.project.toLowerCase().replace(/\s+/g, "_")}`,
        data.assigned_to_name,
        0.7
      )
    }
    if (action === "task_created" && data.bucket) {
      await upsertMemory(founderId, "pattern", "preferred_bucket", data.bucket, 0.6)
    }
  } catch {
    // Memory learning is non-fatal
  }
}