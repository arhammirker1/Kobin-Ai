/**
 * hooks/use-plan.ts
 *
 * Client-side hook that resolves the current user's plan from Supabase.
 * Handles both founders (read own plan) and team members (read founder's plan).
 *
 * Usage:
 *   const { plan, limits, has, loading } = usePlan()
 *   if (has('vault_ai_writer')) { ... }
 *   if (limits.max_team_seats > currentCount) { ... }
 */

"use client"

import { useEffect, useState, useMemo } from "react"
import { createClient } from "@/lib/supabase/client"
import { getPlanLimits, type Plan, type PlanLimits } from "@/lib/plans"

interface UsePlanResult {
  /** Current plan: 'free' | 'pro' | 'agency' */
  plan: Plan
  /** Full limits object for the current plan */
  limits: PlanLimits
  /** Whether the plan is still loading */
  loading: boolean
  /** Check if a boolean feature is enabled on this plan */
  has: (feature: keyof PlanLimits) => boolean
  /** Check if a numeric limit allows adding more */
  canAdd: (limitKey: "max_team_seats" | "max_projects" | "max_clients", currentCount: number) => boolean
}

// Module-level cache to avoid re-fetching on every mount
let _cachedPlan: Plan | null = null
let _cacheTimestamp = 0
const CACHE_TTL_MS = 60_000 // 1 minute

export function usePlan(): UsePlanResult {
  const [plan, setPlan] = useState<Plan>(_cachedPlan ?? "free")
  const [loading, setLoading] = useState(_cachedPlan === null)
  const supabase = createClient()

  useEffect(() => {
    // Use cached value if fresh
    if (_cachedPlan && Date.now() - _cacheTimestamp < CACHE_TTL_MS) {
      setPlan(_cachedPlan)
      setLoading(false)
      return
    }

    let cancelled = false

    const load = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user || cancelled) { setLoading(false); return }

        // Read the user's own profile first
        const { data: profile } = await supabase
          .from("profiles")
          .select("plan, user_type")
          .eq("id", user.id)
          .single()

        if (cancelled) return

        let resolvedPlan: Plan = "free"

        if (profile?.user_type === "team_member") {
          // Team members inherit their founder's plan
          const { data: tm } = await supabase
            .from("team_members")
            .select("founder_id")
            .eq("user_id", user.id)
            .single()

          if (cancelled) return

          if (tm?.founder_id) {
            const { data: founderProfile } = await supabase
              .from("profiles")
              .select("plan")
              .eq("id", tm.founder_id)
              .single()

            if (cancelled) return
            resolvedPlan = (founderProfile?.plan as Plan) ?? "free"
          }
        } else if (profile?.user_type === "client") {
          // Clients don't have plans — always free-equivalent
          resolvedPlan = "free"
        } else {
          // Founder — read directly
          resolvedPlan = (profile?.plan as Plan) ?? "free"
        }

        // Update cache
        _cachedPlan = resolvedPlan
        _cacheTimestamp = Date.now()

        setPlan(resolvedPlan)
      } catch (err) {
        console.error("[usePlan] Failed to resolve plan:", err)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => { cancelled = true }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const limits = useMemo(() => getPlanLimits(plan), [plan])

  const has = useMemo(() => {
    return (feature: keyof PlanLimits): boolean => {
      const val = limits[feature]
      return typeof val === "boolean" ? val : true
    }
  }, [limits])

  const canAdd = useMemo(() => {
    return (limitKey: "max_team_seats" | "max_projects" | "max_clients", currentCount: number): boolean => {
      const max = limits[limitKey] as number
      return currentCount < max
    }
  }, [limits])

  return { plan, limits, loading, has, canAdd }
}

/**
 * Force-clear the cached plan (call after a plan upgrade completes).
 */
export function invalidatePlanCache(): void {
  _cachedPlan = null
  _cacheTimestamp = 0
}
