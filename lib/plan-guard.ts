/**
 * lib/plan-guard.ts
 *
 * Server-side plan enforcement helpers.
 * Use at the top of any gated API route handler.
 *
 * Usage:
 *   const guard = await requireFeature(founderId, 'vault_rag')
 *   if (guard) return guard   // 403 response
 *
 *   const limitGuard = await requireWithinLimit(founderId, 'max_team_seats', currentCount)
 *   if (limitGuard) return limitGuard   // 403 response
 */

import { supabaseAdmin } from "@/lib/supabase/admin"
import { withCache } from "@/lib/redis"
import {
  getPlanLimits,
  getMinimumPlanFor,
  PLAN_LABELS,
  type Plan,
  type PlanLimits,
} from "@/lib/plans"
import { NextResponse } from "next/server"

// ── Resolve plan for a founder ───────────────────────────────────────────────

/**
 * Resolves the current plan for a founder.
 * Reads from the denormalized `profiles.plan` column (no join needed).
 * Cached in Redis for 60s to avoid hammering DB on every request.
 */
export async function resolveFounderPlan(founderId: string): Promise<Plan> {
  return withCache(`plan:${founderId}`, 60, async () => {
    const { data } = await supabaseAdmin
      .from("profiles")
      .select("plan")
      .eq("id", founderId)
      .single()
    return (data?.plan as Plan) ?? "free"
  })
}

// ── Boolean feature guard ────────────────────────────────────────────────────

/**
 * Returns a 403 NextResponse if the feature is not available on the founder's plan.
 * Returns null if the feature is allowed (call site should proceed normally).
 *
 * @example
 *   const guard = await requireFeature(founderId, 'vault_ai_writer')
 *   if (guard) return guard
 */
export async function requireFeature(
  founderId: string,
  feature: keyof PlanLimits
): Promise<NextResponse | null> {
  const plan = await resolveFounderPlan(founderId)
  const limits = getPlanLimits(plan)
  const value = limits[feature]

  // Boolean features
  if (typeof value === "boolean" && !value) {
    const requiredPlan = getMinimumPlanFor(feature)
    return NextResponse.json(
      {
        error: "plan_limit",
        feature,
        current_plan: plan,
        required_plan: requiredPlan,
        message: `This feature requires the ${PLAN_LABELS[requiredPlan]} plan. Upgrade to unlock it.`,
      },
      { status: 403 }
    )
  }

  return null // allowed
}

// ── Numeric limit guard ──────────────────────────────────────────────────────

/**
 * Returns a 403 NextResponse if adding one more item would exceed the limit.
 * Returns null if within limits (call site should proceed normally).
 *
 * @example
 *   const { count } = await supabaseAdmin.from('team_members')...
 *   const guard = await requireWithinLimit(founderId, 'max_team_seats', count)
 *   if (guard) return guard
 */
export async function requireWithinLimit(
  founderId: string,
  limitKey: "max_team_seats" | "max_projects" | "max_clients",
  currentCount: number
): Promise<NextResponse | null> {
  const plan = await resolveFounderPlan(founderId)
  const limits = getPlanLimits(plan)
  const max = limits[limitKey] as number

  if (currentCount >= max) {
    const requiredPlan = getMinimumPlanFor(limitKey)
    const limitLabel = limitKey.replace("max_", "").replace(/_/g, " ")

    return NextResponse.json(
      {
        error: "plan_limit",
        limit: limitKey,
        current: currentCount,
        max: max === Infinity ? "unlimited" : max,
        current_plan: plan,
        required_plan: requiredPlan,
        message: `You've reached the ${limitLabel} limit (${max === Infinity ? "unlimited" : max}) for your ${PLAN_LABELS[plan]} plan. Upgrade to ${PLAN_LABELS[requiredPlan]} for more.`,
      },
      { status: 403 }
    )
  }

  return null // within limits
}

// ── Convenience: get full plan context ───────────────────────────────────────

export interface PlanContext {
  founderId: string
  plan: Plan
  limits: PlanLimits
}

/**
 * Resolves the full plan context (plan + limits) for a founder.
 * Useful when you need to check multiple features in one route.
 */
export async function resolvePlanContext(founderId: string): Promise<PlanContext> {
  const plan = await resolveFounderPlan(founderId)
  return {
    founderId,
    plan,
    limits: getPlanLimits(plan),
  }
}
