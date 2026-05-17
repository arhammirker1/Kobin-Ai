// AI Mode system — controls proactive behavior
import { supabaseAdmin } from "@/lib/supabase/admin"
import { withCache, bust } from "@/lib/redis"

export type AIMode = "quiet" | "balanced" | "aggressive"

export interface ModeConfig {
  sendMorningBrief: boolean
  sendEODSummary: boolean
  sendRiskAlerts: boolean
  riskAlertThreshold: "critical" | "high" | "medium"
  inboxMessageIntelligence: boolean
  proactiveFollowupReminders: boolean
}

export const MODE_CONFIGS: Record<AIMode, ModeConfig> = {
  quiet: {
    sendMorningBrief: false,
    sendEODSummary: false,
    sendRiskAlerts: true,
    riskAlertThreshold: "critical",
    inboxMessageIntelligence: false,
    proactiveFollowupReminders: false,
  },
  balanced: {
    sendMorningBrief: true,
    sendEODSummary: true,
    sendRiskAlerts: true,
    riskAlertThreshold: "high",
    inboxMessageIntelligence: true,
    proactiveFollowupReminders: true,
  },
  aggressive: {
    sendMorningBrief: true,
    sendEODSummary: true,
    sendRiskAlerts: true,
    riskAlertThreshold: "medium",
    inboxMessageIntelligence: true,
    proactiveFollowupReminders: true,
  },
}

export async function getAIMode(founderId: string): Promise<AIMode> {
  return withCache(`mode:${founderId}`, 300, async () => {
    const { data } = await supabaseAdmin
      .from("profiles")
      .select("ai_mode")
      .eq("id", founderId)
      .single()
    return (data?.ai_mode as AIMode) || "balanced"
  })
}

export async function setAIMode(founderId: string, mode: AIMode): Promise<void> {
  await supabaseAdmin
    .from("profiles")
    .update({ ai_mode: mode })
    .eq("id", founderId)
  await bust(`mode:${founderId}`)
}

export async function getModeConfig(founderId: string): Promise<ModeConfig> {
  const mode = await getAIMode(founderId)
  return MODE_CONFIGS[mode]
}