"use client"

/**
 * components/ui/plan-gate.tsx
 *
 * Reusable gate component that wraps any feature behind a plan check.
 * Shows a locked overlay, disables, or hides content based on the user's plan.
 *
 * Usage:
 *   <PlanGate feature="vault_ai_writer" requiredPlan="agency">
 *     <AIWriterButton />
 *   </PlanGate>
 *
 *   <PlanGate feature="crm_pipeline" mode="disable">
 *     <CRMView />
 *   </PlanGate>
 */

import { usePlan } from "@/hooks/use-plan"
import type { PlanLimits, Plan } from "@/lib/plans"
import { PLAN_LABELS, getMinimumPlanFor } from "@/lib/plans"
import { Lock, Sparkles } from "lucide-react"
import { cn } from "@/lib/utils"

// ── Props ────────────────────────────────────────────────────────────────────

interface PlanGateProps {
  /** The feature flag to check from PlanLimits */
  feature: keyof PlanLimits
  /** Explicitly specify the required plan (auto-detected if omitted) */
  requiredPlan?: Plan
  /** Content to render when the feature is available */
  children: React.ReactNode
  /**
   * How to handle blocked content:
   * - 'hide': render nothing
   * - 'lock': show dimmed content with a hover overlay badge
   * - 'disable': show content but greyed out and non-interactive
   * - 'badge': show the children normally but with an upgrade badge overlaid
   */
  mode?: "hide" | "lock" | "disable" | "badge"
  /** Custom upgrade prompt message */
  upgradeMessage?: string
  /** Additional className for the wrapper */
  className?: string
}

// ── Component ────────────────────────────────────────────────────────────────

export function PlanGate({
  feature,
  requiredPlan,
  children,
  mode = "lock",
  upgradeMessage,
  className,
}: PlanGateProps) {
  const { has, loading } = usePlan()

  // While loading, render nothing to prevent flash of locked content
  if (loading) return null

  // Feature is available — render children normally
  if (has(feature)) return <>{children}</>

  // Feature is blocked — determine the plan label
  const minPlan = requiredPlan ?? getMinimumPlanFor(feature)
  const planLabel = PLAN_LABELS[minPlan]
  const message = upgradeMessage ?? `Upgrade to ${planLabel} to unlock`

  // ── Mode: hide ────────────────────────────────────────────────────────
  if (mode === "hide") return null

  // ── Mode: disable ─────────────────────────────────────────────────────
  if (mode === "disable") {
    return (
      <div
        className={cn("relative cursor-not-allowed opacity-40 pointer-events-none select-none", className)}
        title={message}
      >
        {children}
      </div>
    )
  }

  // ── Mode: badge ───────────────────────────────────────────────────────
  if (mode === "badge") {
    return (
      <div className={cn("relative", className)}>
        <div className="pointer-events-none opacity-50 select-none">
          {children}
        </div>
        <div className="absolute -top-1.5 -right-1.5 z-10">
          <span className="flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider bg-gradient-to-r from-violet-500 to-purple-600 text-white shadow-sm">
            <Sparkles size={8} />
            {planLabel}
          </span>
        </div>
      </div>
    )
  }

  // ── Mode: lock (default) ──────────────────────────────────────────────
  return (
    <div className={cn("relative group", className)}>
      {/* Dimmed children */}
      <div className="opacity-[0.15] pointer-events-none select-none blur-[0.5px]">
        {children}
      </div>

      {/* Hover overlay — centered badge */}
      <div className="absolute inset-0 flex items-center justify-center">
        <div
          className={cn(
            "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-semibold",
            "bg-background/95 border border-border shadow-md",
            "text-foreground/80",
            "opacity-0 group-hover:opacity-100 transition-opacity duration-200",
            "backdrop-blur-sm"
          )}
        >
          <Lock size={10} className="text-muted-foreground" />
          {message}
        </div>
      </div>
    </div>
  )
}

// ── Inline upgrade button ────────────────────────────────────────────────────

interface UpgradeBadgeProps {
  feature: keyof PlanLimits
  requiredPlan?: Plan
  className?: string
}

/**
 * Small badge that shows "Pro" or "Agency" for a locked feature.
 * Renders nothing if the feature is available.
 * Use this inline next to buttons/labels that should hint at upgrades.
 */
export function UpgradeBadge({ feature, requiredPlan, className }: UpgradeBadgeProps) {
  const { has, loading } = usePlan()

  if (loading || has(feature)) return null

  const minPlan = requiredPlan ?? getMinimumPlanFor(feature)
  const planLabel = PLAN_LABELS[minPlan]

  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider",
        "bg-gradient-to-r from-violet-500/15 to-purple-500/15",
        "text-violet-600 dark:text-violet-400",
        "border border-violet-500/20",
        className
      )}
    >
      <Lock size={7} />
      {planLabel}
    </span>
  )
}
