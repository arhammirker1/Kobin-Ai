"use client"

import { useState, useRef, useCallback, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  DollarSign,
  ChevronRight,
  ChevronLeft,
  Linkedin,
  Calendar,
  MoreHorizontal,
  TrendingUp,
  Clock,
  Target,
  X,
  Plus,
  Mail,
} from "lucide-react"
import { toast } from "sonner"
import { formatDistanceToNow, differenceInDays } from "date-fns"
import { cn } from "@/lib/utils"

// ─── Stage config ──────────────────────────────────────────────────────────────

export type PipelineStage =
  | "new_lead"
  | "contacted"
  | "meeting_booked"
  | "proposal"
  | "negotiating"
  | "closed_won"
  | "closed_lost"

interface StageConfig {
  id: PipelineStage
  label: string
  color: string          // Tailwind bg class for header
  textColor: string      // Tailwind text class
  borderColor: string    // Tailwind border class
  dotColor: string       // dot indicator
  defaultProb: number
}

export const STAGES: StageConfig[] = [
  {
    id: "new_lead",
    label: "New lead",
    color: "bg-slate-100 dark:bg-slate-800/60",
    textColor: "text-slate-700 dark:text-slate-300",
    borderColor: "border-slate-200 dark:border-slate-700",
    dotColor: "bg-slate-400",
    defaultProb: 10,
  },
  {
    id: "contacted",
    label: "Contacted",
    color: "bg-blue-50 dark:bg-blue-950/40",
    textColor: "text-blue-700 dark:text-blue-300",
    borderColor: "border-blue-200 dark:border-blue-800",
    dotColor: "bg-blue-400",
    defaultProb: 20,
  },
  {
    id: "meeting_booked",
    label: "Meeting booked",
    color: "bg-violet-50 dark:bg-violet-950/40",
    textColor: "text-violet-700 dark:text-violet-300",
    borderColor: "border-violet-200 dark:border-violet-800",
    dotColor: "bg-violet-400",
    defaultProb: 40,
  },
  {
    id: "proposal",
    label: "Proposal sent",
    color: "bg-amber-50 dark:bg-amber-950/40",
    textColor: "text-amber-700 dark:text-amber-300",
    borderColor: "border-amber-200 dark:border-amber-800",
    dotColor: "bg-amber-400",
    defaultProb: 60,
  },
  {
    id: "negotiating",
    label: "Negotiating",
    color: "bg-orange-50 dark:bg-orange-950/40",
    textColor: "text-orange-700 dark:text-orange-300",
    borderColor: "border-orange-200 dark:border-orange-800",
    dotColor: "bg-orange-400",
    defaultProb: 80,
  },
  {
    id: "closed_won",
    label: "Closed · Won",
    color: "bg-emerald-50 dark:bg-emerald-950/40",
    textColor: "text-emerald-700 dark:text-emerald-300",
    borderColor: "border-emerald-200 dark:border-emerald-800",
    dotColor: "bg-emerald-500",
    defaultProb: 100,
  },
  {
    id: "closed_lost",
    label: "Closed · Lost",
    color: "bg-rose-50 dark:bg-rose-950/40",
    textColor: "text-rose-700 dark:text-rose-300",
    borderColor: "border-rose-200 dark:border-rose-800",
    dotColor: "bg-rose-400",
    defaultProb: 0,
  },
]

const STAGE_ORDER: PipelineStage[] = [
  "new_lead",
  "contacted",
  "meeting_booked",
  "proposal",
  "negotiating",
  "closed_won",
]

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PipelineContact {
  id: string
  full_name: string
  email: string | null
  company: string | null
  role: string | null
  relationship_type: string
  pipeline_stage: PipelineStage
  deal_value: number | null
  close_probability: number | null
  stage_entered_at: string | null
  expected_close_date: string | null
  pipeline_notes: string | null
  linkedin_profile_url: string | null
  tags: string[]
  updated_at: string
}

interface EditDealDialogProps {
  contact: PipelineContact | null
  open: boolean
  onClose: () => void
  onSave: (id: string, updates: Partial<PipelineContact>) => Promise<void>
}

// ─── Edit deal dialog ─────────────────────────────────────────────────────────

function EditDealDialog({ contact, open, onClose, onSave }: EditDealDialogProps) {
  const [dealValue, setDealValue] = useState("")
  const [probability, setProbability] = useState("")
  const [closeDate, setCloseDate] = useState("")
  const [notes, setNotes] = useState("")
  const [stage, setStage] = useState<PipelineStage>("new_lead")
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (contact) {
      setDealValue(contact.deal_value ? String(contact.deal_value) : "")
      setProbability(contact.close_probability ? String(contact.close_probability) : "")
      setCloseDate(contact.expected_close_date ?? "")
      setNotes(contact.pipeline_notes ?? "")
      setStage(contact.pipeline_stage)
    }
  }, [contact])

  const handleSave = async () => {
    if (!contact) return
    setSaving(true)
    await onSave(contact.id, {
      deal_value: dealValue ? parseFloat(dealValue) : null,
      close_probability: probability ? parseInt(probability) : null,
      expected_close_date: closeDate || null,
      pipeline_notes: notes || null,
      pipeline_stage: stage,
    })
    setSaving(false)
    onClose()
  }

  if (!contact) return null

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base">
            Deal — {contact.full_name}
            {contact.company && (
              <span className="text-muted-foreground font-normal"> · {contact.company}</span>
            )}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="dp-stage" className="text-xs">Stage</Label>
            <Select value={stage} onValueChange={(v) => setStage(v as PipelineStage)}>
              <SelectTrigger id="dp-stage" className="h-8 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STAGES.map((s) => (
                  <SelectItem key={s.id} value={s.id} className="text-sm">
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="dp-value" className="text-xs">Deal value ($)</Label>
              <Input
                id="dp-value"
                type="number"
                min="0"
                placeholder="0"
                value={dealValue}
                onChange={(e) => setDealValue(e.target.value)}
                className="h-8 text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="dp-prob" className="text-xs">Close probability (%)</Label>
              <Input
                id="dp-prob"
                type="number"
                min="0"
                max="100"
                placeholder="50"
                value={probability}
                onChange={(e) => setProbability(e.target.value)}
                className="h-8 text-sm"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="dp-date" className="text-xs">Expected close date</Label>
            <Input
              id="dp-date"
              type="date"
              value={closeDate}
              onChange={(e) => setCloseDate(e.target.value)}
              className="h-8 text-sm"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="dp-notes" className="text-xs">Deal notes</Label>
            <Textarea
              id="dp-notes"
              placeholder="Key context, objections, next steps..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              className="text-sm resize-none"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" onClick={handleSave} disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─── Pipeline card ────────────────────────────────────────────────────────────

interface PipelineCardProps {
  contact: PipelineContact
  stageConfig: StageConfig
  allStages: StageConfig[]
  onMoveStage: (id: string, stage: PipelineStage) => Promise<void>
  onEditDeal: (contact: PipelineContact) => void
  onDragStart: (e: React.DragEvent, id: string) => void
}

function PipelineCard({
  contact,
  stageConfig,
  allStages,
  onMoveStage,
  onEditDeal,
  onDragStart,
}: PipelineCardProps) {
  const [expanded, setExpanded] = useState(false)

  const currentIdx = STAGE_ORDER.indexOf(contact.pipeline_stage)
  const canMoveBack = currentIdx > 0
  const canMoveForward =
    contact.pipeline_stage !== "closed_won" &&
    contact.pipeline_stage !== "closed_lost" &&
    currentIdx < STAGE_ORDER.length - 1

  const daysInStage = contact.stage_entered_at
    ? differenceInDays(new Date(), new Date(contact.stage_entered_at))
    : 0

  const weightedValue =
    contact.deal_value && contact.close_probability
      ? Math.round((contact.deal_value * contact.close_probability) / 100)
      : null

  const isStale = daysInStage > 14 && !["closed_won", "closed_lost"].includes(contact.pipeline_stage)

  return (
    <div
      draggable
      onDragStart={(e) => onDragStart(e, contact.id)}
      className={cn(
        "group relative bg-card border rounded-xl cursor-grab active:cursor-grabbing",
        "hover:shadow-md hover:border-primary/30 transition-all duration-150",
        isStale && "border-amber-200 dark:border-amber-800/60",
        expanded ? "p-3" : "px-3 py-2",
      )}
    >
      {/* ── Compact row (always visible) ─────────────────────────────── */}
      <div className="flex items-center gap-2">
        {/* Name + company */}
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-xs leading-tight truncate">{contact.full_name}</p>
          {contact.company && (
            <p className="text-[10px] text-muted-foreground truncate">{contact.company}</p>
          )}
        </div>

        {/* Right side: deal chip + stale + expand */}
        <div className="flex items-center gap-1.5 shrink-0">
          {contact.deal_value ? (
            <span className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded-full">
              ${contact.deal_value >= 1000 ? `${(contact.deal_value / 1000).toFixed(contact.deal_value % 1000 === 0 ? 0 : 1)}k` : contact.deal_value}
            </span>
          ) : null}

          {isStale && (
            <span className="text-[9px] font-medium text-amber-600 dark:text-amber-400 bg-amber-500/10 px-1 py-0.5 rounded-full">
              {daysInStage}d
            </span>
          )}

          <button
            onClick={(e) => { e.stopPropagation(); setExpanded(!expanded) }}
            className="p-0.5 rounded hover:bg-muted transition-colors"
            title={expanded ? "Collapse" : "Expand details"}
          >
            <ChevronRight
              size={12}
              className={cn(
                "text-muted-foreground/60 transition-transform duration-150",
                expanded && "rotate-90",
              )}
            />
          </button>
        </div>
      </div>

      {/* ── Expanded details ─────────────────────────────────────────── */}
      {expanded && (
        <div className="mt-2 space-y-2 animate-in fade-in slide-in-from-top-1 duration-150">
          {/* Role */}
          {contact.role && (
            <p className="text-[11px] text-muted-foreground/70 truncate">{contact.role}</p>
          )}

          {/* Email */}
          {contact.email && (
            <a
              href={`mailto:${contact.email}`}
              onClick={(e) => e.stopPropagation()}
              className="flex items-center gap-1 text-[11px] text-muted-foreground/70 hover:text-primary transition-colors truncate"
            >
              <Mail size={10} className="shrink-0" />
              {contact.email}
            </a>
          )}

          {/* Deal value detail */}
          {contact.deal_value ? (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1">
                <DollarSign size={11} className="text-emerald-500" />
                <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                  {contact.deal_value.toLocaleString()}
                </span>
              </div>
              {contact.close_probability !== null && (
                <span className="text-[10px] text-muted-foreground">
                  {contact.close_probability}% · ${weightedValue?.toLocaleString()}
                </span>
              )}
            </div>
          ) : (
            <button
              onClick={() => onEditDeal(contact)}
              className="flex items-center gap-1 text-[11px] text-muted-foreground/60 hover:text-primary transition-colors"
            >
              <Plus size={10} />
              Add deal value
            </button>
          )}

          {/* Tags */}
          {contact.tags && contact.tags.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {contact.tags.slice(0, 3).map((tag) => (
                <span
                  key={tag}
                  className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground"
                >
                  {tag}
                </span>
              ))}
              {contact.tags.length > 3 && (
                <span className="text-[10px] text-muted-foreground/60">+{contact.tags.length - 3}</span>
              )}
            </div>
          )}

          {/* Pipeline notes */}
          {contact.pipeline_notes && (
            <p className="text-[11px] text-muted-foreground/70 italic line-clamp-2 border-t border-border/50 pt-1.5">
              {contact.pipeline_notes}
            </p>
          )}

          {/* Actions row */}
          <div className="pt-1.5 border-t border-border/50 flex items-center justify-between">
            <div className="flex items-center gap-1">
              {canMoveBack && (
                <button
                  onClick={() => onMoveStage(contact.id, STAGE_ORDER[currentIdx - 1])}
                  className="p-1 rounded hover:bg-muted transition-colors"
                  title="Move back"
                >
                  <ChevronLeft size={13} className="text-muted-foreground" />
                </button>
              )}
              {canMoveForward && (
                <button
                  onClick={() => onMoveStage(contact.id, STAGE_ORDER[currentIdx + 1])}
                  className="p-1 rounded hover:bg-muted transition-colors"
                  title="Move forward"
                >
                  <ChevronRight size={13} className="text-muted-foreground" />
                </button>
              )}
            </div>
            <div className="flex items-center gap-1">
              {contact.linkedin_profile_url && (
                <button
                  onClick={() => window.open(contact.linkedin_profile_url!, "_blank")}
                  className="p-1 rounded hover:bg-muted transition-colors"
                  title="Open LinkedIn"
                >
                  <Linkedin size={12} className="text-muted-foreground" />
                </button>
              )}
              <button
                onClick={() => onEditDeal(contact)}
                className="p-1 rounded hover:bg-muted transition-colors"
                title="Edit deal"
              >
                <MoreHorizontal size={13} className="text-muted-foreground" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Collapsible card list ────────────────────────────────────────────────────

const COLLAPSED_LIMIT = 5

interface ColumnCardListProps {
  contacts: PipelineContact[]
  stageConfig: StageConfig
  allStages: StageConfig[]
  onMoveStage: (id: string, stage: PipelineStage) => Promise<void>
  onEditDeal: (contact: PipelineContact) => void
  onDragStart: (e: React.DragEvent, id: string) => void
  isDragOver: boolean
}

function ColumnCardList({
  contacts,
  stageConfig,
  allStages,
  onMoveStage,
  onEditDeal,
  onDragStart,
  isDragOver,
}: ColumnCardListProps) {
  const [expanded, setExpanded] = useState(false)

  const needsCollapse = contacts.length > COLLAPSED_LIMIT
  const visibleContacts = expanded ? contacts : contacts.slice(0, COLLAPSED_LIMIT)
  const hiddenCount = contacts.length - COLLAPSED_LIMIT

  return (
    <div className="flex-1 flex flex-col gap-2 p-2 min-h-[120px]">
      {visibleContacts.map((contact) => (
        <PipelineCard
          key={contact.id}
          contact={contact}
          stageConfig={stageConfig}
          allStages={allStages}
          onMoveStage={onMoveStage}
          onEditDeal={onEditDeal}
          onDragStart={onDragStart}
        />
      ))}

      {/* Collapse / expand toggle */}
      {needsCollapse && !expanded && (
        <button
          onClick={() => setExpanded(true)}
          className="flex items-center justify-center gap-1 py-2 px-3 rounded-lg border border-dashed border-border/60 text-[11px] font-medium text-muted-foreground hover:text-primary hover:border-primary/40 hover:bg-primary/5 transition-all"
        >
          <Plus size={11} />
          Show {hiddenCount} more
        </button>
      )}
      {needsCollapse && expanded && (
        <button
          onClick={() => setExpanded(false)}
          className="flex items-center justify-center gap-1 py-2 px-3 rounded-lg border border-dashed border-border/60 text-[11px] font-medium text-muted-foreground hover:text-primary hover:border-primary/40 hover:bg-primary/5 transition-all"
        >
          <X size={11} />
          Show less
        </button>
      )}

      {contacts.length === 0 && (
        <div className={cn(
          "flex-1 flex items-center justify-center text-[11px] text-muted-foreground/50 italic rounded-lg border-2 border-dashed min-h-[80px]",
          isDragOver ? "border-primary/40 text-primary/50" : "border-border/40",
        )}>
          {isDragOver ? "Drop here" : "Empty"}
        </div>
      )}
    </div>
  )
}

// ─── Column ───────────────────────────────────────────────────────────────────

interface ColumnProps {
  stage: StageConfig
  contacts: PipelineContact[]
  onMoveStage: (id: string, stage: PipelineStage) => Promise<void>
  onEditDeal: (contact: PipelineContact) => void
  onDragStart: (e: React.DragEvent, id: string) => void
  onDrop: (e: React.DragEvent, stage: PipelineStage) => void
  isDragOver: boolean
  onDragOver: (e: React.DragEvent) => void
  onDragLeave: () => void
}

function PipelineColumn({
  stage,
  contacts,
  onMoveStage,
  onEditDeal,
  onDragStart,
  onDrop,
  isDragOver,
  onDragOver,
  onDragLeave,
}: ColumnProps) {
  const totalValue = contacts.reduce((sum, c) => sum + (c.deal_value ?? 0), 0)
  const weightedValue = contacts.reduce((sum, c) => {
    if (!c.deal_value || c.close_probability === null) return sum
    return sum + (c.deal_value * c.close_probability) / 100
  }, 0)

  return (
    <div
      className={cn(
        "flex flex-col w-[220px] flex-shrink-0 rounded-xl border transition-all duration-150",
        stage.borderColor,
        isDragOver ? "ring-2 ring-primary/40 bg-primary/5" : "bg-muted/20 dark:bg-muted/10",
      )}
      onDragOver={onDragOver}
      onDrop={(e) => onDrop(e, stage.id)}
      onDragLeave={onDragLeave}
    >
      {/* Column header */}
      <div className={cn("px-3 pt-3 pb-2 rounded-t-xl", stage.color)}>
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-1.5">
            <div className={cn("size-2 rounded-full flex-shrink-0", stage.dotColor)} />
            <span className={cn("text-xs font-semibold tracking-tight", stage.textColor)}>
              {stage.label}
            </span>
          </div>
          <span className={cn(
            "text-[11px] font-bold px-1.5 py-0.5 rounded-full",
            stage.textColor,
            "bg-white/40 dark:bg-black/20"
          )}>
            {contacts.length}
          </span>
        </div>
        {totalValue > 0 && (
          <div className="flex items-center gap-1 mt-1">
            <DollarSign size={10} className={stage.textColor} />
            <span className={cn("text-[11px] font-medium", stage.textColor)}>
              {totalValue.toLocaleString()}
            </span>
            {weightedValue > 0 && weightedValue !== totalValue && (
              <span className={cn("text-[10px] opacity-70", stage.textColor)}>
                · ${Math.round(weightedValue).toLocaleString()} weighted
              </span>
            )}
          </div>
        )}
      </div>

      {/* Drop zone + cards */}
      <ColumnCardList
        contacts={contacts}
        stageConfig={stage}
        allStages={STAGES}
        onMoveStage={onMoveStage}
        onEditDeal={onEditDeal}
        onDragStart={onDragStart}
        isDragOver={isDragOver}
      />
    </div>
  )
}

// ─── Main pipeline view ───────────────────────────────────────────────────────

interface PipelineViewProps {
  contacts: PipelineContact[]
  onStageChange: (id: string, stage: PipelineStage) => Promise<void>
  onDealUpdate: (id: string, updates: Partial<PipelineContact>) => Promise<void>
  loading?: boolean
}

export function PipelineView({
  contacts,
  onStageChange,
  onDealUpdate,
  loading,
}: PipelineViewProps) {
  const [dragOverStage, setDragOverStage] = useState<PipelineStage | null>(null)
  const [editingContact, setEditingContact] = useState<PipelineContact | null>(null)
  const dragId = useRef<string | null>(null)

  // Group contacts by stage
  const byStage = STAGES.reduce((acc, s) => {
    acc[s.id] = contacts.filter((c) => c.pipeline_stage === s.id)
    return acc
  }, {} as Record<PipelineStage, PipelineContact[]>)

  // Pipeline totals
  const activeContacts = contacts.filter(
    (c) => c.pipeline_stage !== "closed_won" && c.pipeline_stage !== "closed_lost",
  )
  const totalPipelineValue = activeContacts.reduce((s, c) => s + (c.deal_value ?? 0), 0)
  const weightedPipelineValue = activeContacts.reduce((s, c) => {
    if (!c.deal_value || c.close_probability === null) return s
    return s + (c.deal_value * c.close_probability) / 100
  }, 0)
  const wonValue = byStage.closed_won.reduce((s, c) => s + (c.deal_value ?? 0), 0)
  const winRate =
    byStage.closed_won.length + byStage.closed_lost.length > 0
      ? Math.round(
          (byStage.closed_won.length /
            (byStage.closed_won.length + byStage.closed_lost.length)) *
            100,
        )
      : null

  // Drag handlers
  const handleDragStart = useCallback((e: React.DragEvent, id: string) => {
    dragId.current = id
    e.dataTransfer.effectAllowed = "move"
  }, [])

  const handleDragOver = useCallback((e: React.DragEvent, stage: PipelineStage) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = "move"
    setDragOverStage(stage)
  }, [])

  const handleDrop = useCallback(
    async (e: React.DragEvent, stage: PipelineStage) => {
      e.preventDefault()
      setDragOverStage(null)
      if (dragId.current) {
        const contact = contacts.find((c) => c.id === dragId.current)
        if (contact && contact.pipeline_stage !== stage) {
          await onStageChange(dragId.current, stage)
        }
        dragId.current = null
      }
    },
    [contacts, onStageChange],
  )

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground text-sm">
        Loading pipeline…
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Pipeline summary bar */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-card border rounded-xl p-3">
          <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">
            Pipeline value
          </p>
          <p className="text-xl font-bold">
            {totalPipelineValue > 0 ? `$${totalPipelineValue.toLocaleString()}` : "—"}
          </p>
        </div>
        <div className="bg-card border rounded-xl p-3">
          <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">
            Weighted value
          </p>
          <p className="text-xl font-bold text-primary">
            {weightedPipelineValue > 0 ? `$${Math.round(weightedPipelineValue).toLocaleString()}` : "—"}
          </p>
        </div>
        <div className="bg-card border rounded-xl p-3">
          <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">
            Won this pipeline
          </p>
          <p className="text-xl font-bold text-emerald-600 dark:text-emerald-400">
            {wonValue > 0 ? `$${wonValue.toLocaleString()}` : "—"}
          </p>
        </div>
        <div className="bg-card border rounded-xl p-3">
          <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">
            Win rate
          </p>
          <p className="text-xl font-bold">
            {winRate !== null ? `${winRate}%` : "—"}
          </p>
        </div>
      </div>

      {/* Board — horizontal scroll */}
      <div className="overflow-x-auto pb-4 -mx-1 px-1">
        <div className="flex gap-3" style={{ minWidth: "max-content" }}>
          {STAGES.map((stage) => (
            <PipelineColumn
              key={stage.id}
              stage={stage}
              contacts={byStage[stage.id] ?? []}
              onMoveStage={onStageChange}
              onEditDeal={setEditingContact}
              onDragStart={handleDragStart}
              onDrop={(e) => handleDrop(e, stage.id)}
              isDragOver={dragOverStage === stage.id}
              onDragOver={(e) => handleDragOver(e, stage.id)}
              onDragLeave={() => setDragOverStage(null)}
            />
          ))}
        </div>
      </div>

      {/* Edit deal dialog */}
      <EditDealDialog
        contact={editingContact}
        open={!!editingContact}
        onClose={() => setEditingContact(null)}
        onSave={onDealUpdate}
      />
    </div>
  )
}