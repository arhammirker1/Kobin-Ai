"use client"

import { X, Check, Sparkles, ArrowRight, Zap, Lock } from "lucide-react"
import { useRouter } from "next/navigation"
import { cn } from "@/lib/utils"
import type { Plan } from "@/lib/plans"
import { PLAN_LABELS } from "@/lib/plans"

interface UpgradeModalProps {
  open: boolean
  onClose: () => void
  featureName?: string
  requiredPlan?: Plan
}

const PLAN_FEATURES: Record<"pro" | "agency", string[]> = {
  pro: [
    "Unlimited team members & projects",
    "Gmail integration & CRM pipeline",
    "Google Calendar sync",
    "AI Command Bar (⌘K)",
    "Semantic vault search",
    "Workspace intelligence & risk alerts",
    "Push notifications",
  ],
  agency: [
    "Everything in Pro",
    "Meeting recorder + AI transcription",
    "AI Writer (vault-powered RAG)",
    "Proactive AI morning briefings",
    "AI memory system",
    "Auto lead detection from Gmail",
    "White-label client portal",
    "500 GB vault storage",
  ],
}

export function UpgradeModal({
  open,
  onClose,
  featureName,
  requiredPlan = "pro",
}: UpgradeModalProps) {
  const router = useRouter()

  if (!open) return null

  const isAgency = requiredPlan === "agency"
  const features = PLAN_FEATURES[requiredPlan as "pro" | "agency"] ?? PLAN_FEATURES.pro
  const planLabel = PLAN_LABELS[requiredPlan]

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

      {/* Modal */}
      <div className="relative w-full max-w-sm bg-card border border-border rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Top accent bar */}
        <div className="h-0.5 bg-gradient-to-r from-violet-500 via-purple-500 to-violet-600" />

        <div className="p-6">
          {/* Close button */}
          <button
            onClick={onClose}
            className="absolute top-4 right-4 w-7 h-7 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
          >
            <X size={14} />
          </button>

          {/* Icon + heading */}
          <div className="flex items-start gap-3 mb-5">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center flex-shrink-0 shadow-lg">
              <Sparkles size={18} className="text-white" />
            </div>
            <div>
              <h2 className="text-[15px] font-semibold text-foreground leading-snug">
                {featureName
                  ? `${featureName} requires ${planLabel}`
                  : `Upgrade to ${planLabel}`}
              </h2>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Unlock powerful features for your agency
              </p>
            </div>
          </div>

          {/* Feature list */}
          <div className="space-y-2 mb-5 p-3 bg-muted/30 rounded-xl border border-border/50">
            {features.map((f) => (
              <div key={f} className="flex items-center gap-2.5">
                <div className="w-4 h-4 rounded-full bg-violet-500/15 border border-violet-500/25 flex items-center justify-center flex-shrink-0">
                  <Check size={9} className="text-violet-400" />
                </div>
                <span className="text-[12px] text-foreground/75">{f}</span>
              </div>
            ))}
          </div>

          {/* CTAs */}
          <div className="space-y-2">
            {!isAgency && (
              <button
                onClick={() => {
                  onClose()
                  router.push("/upgrade?plan=pro")
                }}
                className="w-full flex items-center justify-center gap-2 py-2.5 bg-[#5B4FE8] hover:bg-[#4D43CC] text-white rounded-xl text-[13px] font-semibold transition-colors shadow-sm"
              >
                <Zap size={12} />
                Upgrade to Pro — PKR 8,000/mo
                <ArrowRight size={12} />
              </button>
            )}
            <button
              onClick={() => {
                onClose()
                router.push("/upgrade?plan=agency")
              }}
              className={cn(
                "w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-[13px] font-semibold transition-colors",
                isAgency
                  ? "bg-[#5B4FE8] hover:bg-[#4D43CC] text-white shadow-sm"
                  : "bg-muted/50 hover:bg-muted border border-border text-foreground/70 hover:text-foreground"
              )}
            >
              {isAgency && <Zap size={12} />}
              Upgrade to Agency — PKR 22,000/mo
              {isAgency && <ArrowRight size={12} />}
            </button>
            <p className="text-[10px] text-muted-foreground/50 text-center pt-0.5">
              14-day free trial · No credit card stored by Kobin
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}