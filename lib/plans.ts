/**
 * lib/plans.ts
 *
 * Single source of truth for all plan entitlements.
 * Both server API routes and the client hook import from here.
 *
 * ── Plan hierarchy: free → pro → agency ─────────────────────────────────────
 *
 * Free:   Client Portal (3 clients), Teams (2 seats), basic vault, tasks/projects
 * Pro:    + Gmail, CRM, Calendar, AI Command Bar, Semantic Search, Intelligence
 * Agency: + Vault RAG, AI Writer, Code Assistant, Proactive AI, Memory,
 *           Meeting Recorder, Auto Lead Detection, White-label, Strong model
 */

// ── Types ────────────────────────────────────────────────────────────────────

export type Plan = "free" | "pro" | "agency"

export interface PlanLimits {
  // ── Seat / quantity limits ──────────────────────────────────────────────
  max_team_seats: number       // Infinity = unlimited
  max_projects: number
  max_clients: number
  vault_storage_gb: number

  // ── Feature flags (boolean: true = this plan has access) ────────────────
  // Integrations
  crm_pipeline: boolean
  gmail_integration: boolean
  google_calendar_sync: boolean
  meeting_recorder: boolean
  linkedin_view: boolean
  push_notifications: boolean
  white_label_portal: boolean

  // Vault AI features
  vault_ai_labeling: boolean          // auto-label on upload (all plans)
  vault_semantic_search: boolean      // item-level similarity (pro+)
  vault_rag: boolean                  // chunk-level RAG injected into AI (agency only)
  vault_ai_writer: boolean            // AI Writer panel in notes + code (agency only)

  // AI Command Bar features
  ai_command_bar: boolean                 // basic command bar (pro+)
  ai_command_bar_vault_search: boolean    // vault_semantic_search tool in AI (agency only)
  ai_command_bar_meeting_notes: boolean   // get_meeting_notes tool (agency only)
  ai_command_bar_strong_model: boolean    // route to strong model tier (agency only)
  ai_auto_lead_detection: boolean         // auto-detect leads from Gmail (agency only)

  // Proactive AI
  ai_proactive_briefings: boolean     // morning brief + EOD (agency only)
  ai_proactive_risk_alerts: boolean   // risk alerts (pro+ gets risk-only alerts)
  ai_memory: boolean                  // AI memory system (agency only)

  // Workspace intelligence (read-only analysis dashboard)
  ai_workspace_intelligence: boolean  // risk dashboard, bottleneck detection (pro+)
}

// ── Plan definitions ─────────────────────────────────────────────────────────

export const PLAN_LIMITS: Record<Plan, PlanLimits> = {
  free: {
    max_team_seats: 2,
    max_projects: 3,
    max_clients: 3,
    vault_storage_gb: 2,

    crm_pipeline: false,
    gmail_integration: false,
    google_calendar_sync: false,
    meeting_recorder: false,
    linkedin_view: false,
    push_notifications: false,
    white_label_portal: false,

    vault_ai_labeling: true,
    vault_semantic_search: false,
    vault_rag: false,
    vault_ai_writer: false,

    ai_command_bar: false,
    ai_command_bar_vault_search: false,
    ai_command_bar_meeting_notes: false,
    ai_command_bar_strong_model: false,
    ai_auto_lead_detection: false,

    ai_proactive_briefings: false,
    ai_proactive_risk_alerts: false,
    ai_memory: false,
    ai_workspace_intelligence: false,
  },

  pro: {
    max_team_seats: Infinity,
    max_projects: Infinity,
    max_clients: Infinity,
    vault_storage_gb: 50,

    crm_pipeline: true,
    gmail_integration: true,
    google_calendar_sync: true,
    meeting_recorder: false,
    linkedin_view: true,
    push_notifications: true,
    white_label_portal: false,

    vault_ai_labeling: true,
    vault_semantic_search: true,
    vault_rag: false,
    vault_ai_writer: false,

    ai_command_bar: true,
    ai_command_bar_vault_search: false,
    ai_command_bar_meeting_notes: false,
    ai_command_bar_strong_model: false,
    ai_auto_lead_detection: false,

    ai_proactive_briefings: false,
    ai_proactive_risk_alerts: true,
    ai_memory: false,
    ai_workspace_intelligence: true,
  },

  agency: {
    max_team_seats: Infinity,
    max_projects: Infinity,
    max_clients: Infinity,
    vault_storage_gb: 500,

    crm_pipeline: true,
    gmail_integration: true,
    google_calendar_sync: true,
    meeting_recorder: true,
    linkedin_view: true,
    push_notifications: true,
    white_label_portal: true,

    vault_ai_labeling: true,
    vault_semantic_search: true,
    vault_rag: true,
    vault_ai_writer: true,

    ai_command_bar: true,
    ai_command_bar_vault_search: true,
    ai_command_bar_meeting_notes: true,
    ai_command_bar_strong_model: true,
    ai_auto_lead_detection: true,

    ai_proactive_briefings: true,
    ai_proactive_risk_alerts: true,
    ai_memory: true,
    ai_workspace_intelligence: true,
  },
}

// ── Helper functions ─────────────────────────────────────────────────────────

/** Get the full limits object for a plan */
export function getPlanLimits(plan: Plan): PlanLimits {
  return PLAN_LIMITS[plan] ?? PLAN_LIMITS["free"]
}

/** Check a single boolean feature flag */
export function planHas(plan: Plan, feature: keyof PlanLimits): boolean {
  const val = PLAN_LIMITS[plan]?.[feature]
  if (typeof val === "boolean") return val
  // Numeric limits are always "has" — use planLimit() to check actual value
  return true
}

/** Get a numeric limit value */
export function planLimit(plan: Plan, limitKey: "max_team_seats" | "max_projects" | "max_clients" | "vault_storage_gb"): number {
  return (PLAN_LIMITS[plan]?.[limitKey] as number) ?? 0
}

/** Determine the minimum plan required for a feature */
export function getMinimumPlanFor(feature: keyof PlanLimits): Plan {
  // Check if free has it
  if (PLAN_LIMITS.free[feature]) return "free"
  // Check if pro has it
  const proVal = PLAN_LIMITS.pro[feature]
  if (typeof proVal === "boolean" && proVal) return "pro"
  if (typeof proVal === "number" && proVal === Infinity) return "pro"
  // Must be agency
  return "agency"
}

/** Human-readable plan labels */
export const PLAN_LABELS: Record<Plan, string> = {
  free: "Free",
  pro: "Pro",
  agency: "Agency",
}
