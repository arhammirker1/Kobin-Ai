"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import * as d3 from "d3"

const NODES = [
  // Pages
  { id: "page-home", label: "app/page.tsx", group: "page", desc: "Main dashboard — auth, routing, CommandBar" },
  { id: "page-login", label: "app/login", group: "page", desc: "Login/signup form" },
  { id: "page-portal", label: "app/client-portal", group: "page", desc: "Client-facing portal" },
  { id: "page-team", label: "app/team-dashboard", group: "page", desc: "Team member dashboard" },

  // Core Components
  { id: "comp-command", label: "CommandBar", group: "component", desc: "Floating AI command bar — streams from /api/ai/command" },
  { id: "comp-inbox", label: "InboxView", group: "component", desc: "Real-time chat + Gmail tab with SSE streaming" },
  { id: "comp-task", label: "TaskView", group: "component", desc: "SWR-powered task board with analytics" },
  { id: "comp-crm", label: "CrmView", group: "component", desc: "Pipeline kanban + email intelligence panel" },
  { id: "comp-calendar", label: "CalendarView", group: "component", desc: "Week/day/month calendar with event scheduling" },
  { id: "comp-today", label: "TodayView", group: "component", desc: "SWR-cached founder home dashboard" },
  { id: "comp-vault", label: "VaultView", group: "component", desc: "Google Drive-backed file vault" },
  { id: "comp-pipeline", label: "PipelineView", group: "component", desc: "Drag-and-drop CRM kanban board" },
  { id: "comp-gmail", label: "GmailThreadView", group: "component", desc: "Inline Gmail viewer with AI draft + analyze" },
  { id: "comp-team", label: "TeamView", group: "component", desc: "Team management with permission presets" },
  { id: "comp-sidebar", label: "DashboardSidebar", group: "component", desc: "Collapsible nav sidebar with unread badges" },
  { id: "comp-meeting", label: "MeetingFormDialog", group: "component", desc: "Meeting scheduler with Google Meet integration" },
  { id: "comp-taskform", label: "TaskForm", group: "component", desc: "Multi-tab task creation with vault attachments" },

  // AI API Routes
  { id: "api-chat", label: "api/ai/chat", group: "api-ai", desc: "Multi-step chat loop with parallel read tools" },
  { id: "api-command", label: "api/ai/command", group: "api-ai", desc: "Agentic command loop — read + action tools" },
  { id: "api-analyze", label: "api/ai/analyze", group: "api-ai", desc: "Workspace intelligence analysis" },
  { id: "api-analyze-email", label: "api/ai/analyze-email", group: "api-ai", desc: "CRM email thread analysis" },
  { id: "api-draft", label: "api/ai/draft-reply", group: "api-ai", desc: "AI Gmail reply drafter" },
  { id: "api-extract", label: "api/ai/extract-task", group: "api-ai", desc: "Message intelligence task extraction" },
  { id: "api-proactive", label: "api/ai/proactive", group: "api-ai", desc: "Morning brief / EOD summary dispatcher" },
  { id: "api-warm", label: "api/ai/warm", group: "api-ai", desc: "Cache pre-warmer for AI context" },

  // Gmail API Routes
  { id: "api-gmail-threads", label: "api/gmail/threads", group: "api-gmail", desc: "Fetch inbox threads with CRM filter" },
  { id: "api-gmail-thread", label: "api/gmail/thread/[id]", group: "api-gmail", desc: "Fetch full thread with body decode" },
  { id: "api-gmail-reply", label: "api/gmail/reply", group: "api-gmail", desc: "Send reply via Gmail API" },
  { id: "api-gmail-sync", label: "api/gmail/sync-crm", group: "api-gmail", desc: "Sync all CRM contacts' threads" },
  { id: "api-gmail-webhook", label: "api/gmail/webhook", group: "api-gmail", desc: "Pub/Sub push handler — auto CRM + lead detection" },
  { id: "api-gmail-contact", label: "api/gmail/contact", group: "api-gmail", desc: "Email → CRM contact lookup" },

  // Cron Routes
  { id: "cron-digest", label: "cron/daily-digest", group: "cron", desc: "Morning AI briefing for all founders" },
  { id: "cron-gmail-watch", label: "cron/renew-gmail-watch", group: "cron", desc: "Renew 7-day Gmail push watches" },
  { id: "cron-revenue", label: "cron/revenue-intelligence", group: "cron", desc: "Closing deals + high-prob pipeline alerts" },
  { id: "cron-risk", label: "cron/risk-detection", group: "cron", desc: "Overdue + blocked task risk alerts" },
  { id: "cron-weekly", label: "cron/weekly-review", group: "cron", desc: "Weekly performance summary" },

  // Meeting Bot
  { id: "api-meeting-upload", label: "api/meeting-bot/upload", group: "api-meeting", desc: "Electron transcript upload endpoint" },
  { id: "api-meeting-process", label: "api/meeting-bot/process", group: "api-meeting", desc: "AI transcript processor — tasks + CRM" },
  { id: "api-meeting-transcribe", label: "api/meeting-bot/transcribe", group: "api-meeting", desc: "Groq Whisper proxy" },

  // Auth & Google
  { id: "api-auth-google", label: "api/auth/google", group: "api-auth", desc: "OAuth redirect to Google consent" },
  { id: "api-auth-callback", label: "api/auth/callback", group: "api-auth", desc: "Supabase email confirmation handler" },
  { id: "api-google-meet", label: "api/google/create-meet", group: "api-auth", desc: "Create Google Calendar + Meet link" },

  // Lib — AI
  { id: "lib-groq", label: "lib/ai/groq", group: "lib-ai", desc: "Three-tier model config: FAST / STD / STRONG" },
  { id: "lib-intelligence", label: "lib/ai/intelligence", group: "lib-ai", desc: "Risk detection, priority engine, bottleneck analysis" },
  { id: "lib-mini-ctx", label: "lib/ai/mini-context", group: "lib-ai", desc: "Redis-cached workspace context builder" },
  { id: "lib-memory", label: "lib/ai/memory", group: "lib-ai", desc: "Long-term pattern learning from actions" },
  { id: "lib-tools", label: "lib/ai/tools", group: "lib-ai", desc: "ALL_TOOLS: read + action tool definitions" },
  { id: "lib-mcp", label: "lib/ai/mcp-read-tools", group: "lib-ai", desc: "10 read tools: tasks, CRM, calendar, vault…" },
  { id: "lib-executor", label: "lib/ai/action-executor", group: "lib-ai", desc: "Fuzzy name resolution + task/project mutations" },
  { id: "lib-proactive", label: "lib/ai/proactive", group: "lib-ai", desc: "AI inbox messaging + morning/EOD brief gen" },

  // Lib — Infrastructure
  { id: "lib-supabase-admin", label: "lib/supabase/admin", group: "lib-infra", desc: "Service-role Supabase client" },
  { id: "lib-supabase-client", label: "lib/supabase/client", group: "lib-infra", desc: "Singleton browser Supabase client" },
  { id: "lib-redis", label: "lib/redis", group: "lib-infra", desc: "Upstash Redis cache-aside helper + bust()" },
  { id: "lib-gmail-analyze", label: "lib/gmail/analyze", group: "lib-infra", desc: "Core email analysis + lead relevance check" },
  { id: "lib-google-token", label: "lib/google/token", group: "lib-infra", desc: "Auto-refresh Google OAuth access token" },
  { id: "lib-google-drive", label: "lib/google/drive", group: "lib-infra", desc: "Vault folder creation in Google Drive" },
  { id: "lib-gmail-watch", label: "lib/google/gmail-watch", group: "lib-infra", desc: "Register/renew Gmail Pub/Sub watches" },
  { id: "lib-push", label: "lib/web-push/send", group: "lib-infra", desc: "VAPID push notification sender" },
  { id: "lib-inbox-dm", label: "lib/ai/inbox-dm", group: "lib-infra", desc: "AI room DM + founder broadcast helpers" },

  // Database Tables — Core & Profiles
  { id: "db-profiles", label: "profiles", group: "db-core", desc: "User profiles — auth ID, email, roles, ai_mode, settings" },
  { id: "db-clients", label: "clients", group: "db-core", desc: "Client organizations & portal access" },
  { id: "db-projects", label: "projects", group: "db-core", desc: "Workspace projects" },
  { id: "db-team-members", label: "team_members", group: "db-core", desc: "Team membership, access controls and permissions" },
  { id: "db-push-subs", label: "push_subscriptions", group: "db-core", desc: "Web Push tokens" },
  { id: "db-linkedin", label: "linkedin_posts", group: "db-core", desc: "LinkedIn post scheduler" },

  // Database Tables — CRM & Pipeline
  { id: "db-relationships", label: "relationships", group: "db-crm", desc: "CRM pipeline contacts, investors, leads" },
  { id: "db-email-analyses", label: "email_analyses", group: "db-crm", desc: "AI insights, intent & sentiment on emails" },
  { id: "db-crm-import", label: "crm_import_history", group: "db-crm", desc: "Bulk import logs and processing stats" },

  // Database Tables — Task Tracking
  { id: "db-tasks", label: "tasks", group: "db-task", desc: "Action items, due dates, project association" },
  { id: "db-task-comments", label: "task_comments", group: "db-task", desc: "Team discussions and notes on tasks" },

  // Database Tables — Chat Spaces
  { id: "db-chat-rooms", label: "chat_rooms", group: "db-chat", desc: "Organized team chat & project channels" },
  { id: "db-chat-members", label: "chat_room_members", group: "db-chat", desc: "Room participation" },
  { id: "db-chat-messages", label: "chat_messages", group: "db-chat", desc: "Rich messages, bot responses, mentions" },
  { id: "db-message-reactions", label: "message_reactions", group: "db-chat", desc: "Emoji reactions" },

  // Database Tables — Google Connect
  { id: "db-google-integ", label: "google_integrations", group: "db-gmail", desc: "OAuth tokens, Vault Drive ID, sync flags" },
  { id: "db-gmail-threads", label: "gmail_threads", group: "db-gmail", desc: "Local cache of important synced threads" },
  { id: "db-gmail-messages", label: "gmail_messages", group: "db-gmail", desc: "Raw parsed email storage" },

  // Database Tables — Meeting & Calendar
  { id: "db-events", label: "events", group: "db-meeting", desc: "Calendar events and generated meet links" },
  { id: "db-event-invites", label: "event_invites", group: "db-meeting", desc: "RSVP tracking for events" },
  { id: "db-meetings-raw", label: "meeting_recordings_raw", group: "db-meeting", desc: "Uploaded/Live audio transcript segments" },
  { id: "db-meeting-analyses", label: "meeting_analyses", group: "db-meeting", desc: "AI generated meeting summaries & extracted tasks" },
  { id: "db-team-meetings", label: "team_meetings", group: "db-meeting", desc: "Internal team 1on1 / standups" },
  { id: "db-team-meeting-participants", label: "team_meeting_participants", group: "db-meeting", desc: "Attendees for team meetings" },
  { id: "db-meeting-bot-config", label: "meeting_bot_config", group: "db-meeting", desc: "Bot recording capabilities & toggles" },

  // Database Tables — Intelligent Vault
  { id: "db-vault-folders", label: "vault_folders", group: "db-vault", desc: "Drive folders synchronized in-app" },
  { id: "db-vault-items", label: "vault_items", group: "db-vault", desc: "Files, Google Docs, URL Links" },
  { id: "db-vault-notes", label: "vault_notes", group: "db-vault", desc: "Actionable internal notes" },

  // Database Tables — AI Subsystem
  { id: "db-ai-chats", label: "ai_command_chats", group: "db-ai", desc: "Command bar memory for chat sessions" },
  { id: "db-ai-memories", label: "ai_memories", group: "db-ai", desc: "Long-term persistent context/facts memory" },
]

const EDGES = [
  // Pages → Components
  ["page-home", "comp-sidebar"], ["page-home", "comp-today"], ["page-home", "comp-command"],
  ["page-portal", "comp-inbox"], ["page-portal", "comp-calendar"], ["page-portal", "comp-vault"],
  ["page-team", "comp-task"], ["page-team", "comp-crm"], ["page-team", "comp-calendar"],

  // Components → API
  ["comp-command", "api-command"],
  ["comp-inbox", "api-gmail-threads"], ["comp-inbox", "api-gmail-thread"],
  ["comp-gmail", "api-gmail-reply"], ["comp-gmail", "api-analyze-email"], ["comp-gmail", "api-draft"],
  ["comp-crm", "api-gmail-sync"], ["comp-crm", "comp-pipeline"], ["comp-crm", "comp-gmail"],
  ["comp-today", "comp-meeting"],
  ["comp-vault", "lib-google-drive"],
  ["comp-meeting", "api-google-meet"],

  // AI API → Lib AI
  ["api-chat", "lib-groq"], ["api-chat", "lib-mcp"], ["api-chat", "lib-mini-ctx"],
  ["api-command", "lib-groq"], ["api-command", "lib-tools"], ["api-command", "lib-executor"],
  ["api-command", "lib-memory"], ["api-command", "lib-mini-ctx"],
  ["api-analyze", "lib-intelligence"],
  ["api-analyze-email", "lib-gmail-analyze"],
  ["api-proactive", "lib-proactive"], ["api-proactive", "lib-intelligence"],
  ["api-warm", "lib-mini-ctx"], ["api-warm", "lib-intelligence"],

  // AI Lib internal
  ["lib-tools", "lib-mcp"],
  ["lib-executor", "lib-supabase-admin"],
  ["lib-mcp", "lib-supabase-admin"], ["lib-mcp", "lib-redis"],
  ["lib-mini-ctx", "lib-supabase-admin"], ["lib-mini-ctx", "lib-redis"],
  ["lib-intelligence", "lib-supabase-admin"], ["lib-intelligence", "lib-redis"],
  ["lib-proactive", "lib-intelligence"], ["lib-proactive", "lib-inbox-dm"],
  ["lib-memory", "lib-supabase-admin"], ["lib-memory", "lib-redis"],

  // Gmail
  ["api-gmail-sync", "lib-gmail-analyze"],
  ["api-gmail-webhook", "lib-gmail-analyze"], ["api-gmail-webhook", "lib-gmail-watch"],
  ["lib-gmail-analyze", "lib-supabase-admin"], ["lib-gmail-analyze", "lib-groq"],
  ["lib-gmail-analyze", "lib-google-token"], ["lib-gmail-analyze", "lib-inbox-dm"],

  // Cron
  ["cron-digest", "lib-groq"], ["cron-digest", "lib-inbox-dm"],
  ["cron-risk", "lib-inbox-dm"],
  ["cron-revenue", "lib-inbox-dm"],
  ["cron-weekly", "lib-groq"], ["cron-weekly", "lib-inbox-dm"],
  ["cron-gmail-watch", "lib-gmail-watch"],

  // Meeting bot
  ["api-meeting-upload", "api-meeting-process"],
  ["api-meeting-process", "lib-groq"], ["api-meeting-process", "lib-inbox-dm"],
  ["api-meeting-transcribe", "lib-groq"],

  // Auth
  ["api-auth-google", "lib-google-token"],
  ["api-google-meet", "lib-google-token"],
  ["lib-google-drive", "lib-google-token"],
  ["lib-gmail-watch", "lib-google-token"],

  // --- DATABASE FK RELATIONS ---
  ["db-profiles", "db-projects"],
  ["db-profiles", "db-clients"],
  ["db-profiles", "db-team-members"],
  ["db-profiles", "db-google-integ"],
  ["db-projects", "db-clients"],

  ["db-chat-rooms", "db-chat-members"],
  ["db-chat-rooms", "db-chat-messages"],
  ["db-chat-rooms", "db-projects"],
  ["db-chat-messages", "db-message-reactions"],
  ["db-chat-messages", "db-tasks"],
  ["db-chat-messages", "db-event-invites"],

  ["db-relationships", "db-email-analyses"],
  ["db-relationships", "db-gmail-threads"],

  ["db-tasks", "db-task-comments"],
  ["db-tasks", "db-projects"],
  ["db-tasks", "db-vault-items"],
  
  ["db-gmail-threads", "db-gmail-messages"],

  ["db-events", "db-event-invites"],
  ["db-events", "db-clients"],
  ["db-meetings-raw", "db-meeting-analyses"],
  ["db-team-meetings", "db-team-meeting-participants"],

  ["db-vault-folders", "db-vault-items"],
  ["db-vault-folders", "db-projects"],
  ["db-vault-items", "db-projects"],

  // --- LOGIC TO DB CONNECTIONS ---
  ["api-command", "db-ai-chats"],
  ["lib-memory", "db-ai-memories"],
  ["lib-supabase-admin", "db-profiles"], ["lib-supabase-admin", "db-projects"], ["lib-supabase-admin", "db-tasks"], 
  ["lib-supabase-client", "db-tasks"], ["lib-supabase-client", "db-chat-messages"], ["lib-supabase-client", "db-chat-rooms"],

  ["api-gmail-sync", "db-gmail-threads"], ["api-gmail-sync", "db-gmail-messages"],
  ["lib-gmail-analyze", "db-email-analyses"], ["lib-gmail-analyze", "db-relationships"],
  ["api-gmail-contact", "db-relationships"],
  ["api-gmail-webhook", "db-relationships"],

  ["api-meeting-upload", "db-meetings-raw"],
  ["api-meeting-process", "db-meeting-analyses"], ["api-meeting-process", "db-meetings-raw"], ["api-meeting-process", "db-tasks"], ["api-meeting-process", "db-relationships"],

  ["lib-google-drive", "db-vault-folders"], ["lib-google-drive", "db-vault-items"],
  ["lib-google-token", "db-google-integ"],

  ["lib-push", "db-push-subs"],
]

const GROUP_META = {
  page:         { color: "#E8C547", label: "Pages", shape: "diamond" },
  component:    { color: "#5B4FE8", label: "Components", shape: "circle" },
  "api-ai":     { color: "#7C3AED", label: "AI API Routes", shape: "circle" },
  "api-gmail":  { color: "#E5534B", label: "Gmail Routes", shape: "circle" },
  cron:         { color: "#F5A623", label: "Cron Jobs", shape: "circle" },
  "api-meeting":{ color: "#3DD68C", label: "Meeting Bot", shape: "circle" },
  "api-auth":   { color: "#54B8F5", label: "Auth / Google", shape: "circle" },
  "lib-ai":     { color: "#A855F7", label: "Lib / AI", shape: "hexagon" },
  "lib-infra":  { color: "#6B7280", label: "Lib / Infra", shape: "hexagon" },
  "db-core":    { color: "#4B5563", label: "DB / Core", shape: "square" },
  "db-chat":    { color: "#10B981", label: "DB / Chat", shape: "square" },
  "db-crm":     { color: "#F59E0B", label: "DB / CRM", shape: "square" },
  "db-task":    { color: "#3B82F6", label: "DB / Task", shape: "square" },
  "db-gmail":   { color: "#EF4444", label: "DB / Gmail", shape: "square" },
  "db-meeting": { color: "#8B5CF6", label: "DB / Meeting", shape: "square" },
  "db-vault":   { color: "#14B8A6", label: "DB / Vault", shape: "square" },
  "db-ai":      { color: "#EC4899", label: "DB / AI", shape: "square" },
}

// Helper mappings
const NODE_RADIUS = { page: 14, component: 11, "api-ai": 9, "api-gmail": 8, cron: 8, "api-meeting": 8, "api-auth": 8, "lib-ai": 10, "lib-infra": 9 }
const DEFAULT_RADIUS = 9

export default function KobinKnowledgeGraph() {
  const svgRef = useRef(null)
  const simRef = useRef(null)
  const [selected, setSelected] = useState(null)
  const [hovered, setHovered] = useState(null)
  const [search, setSearch] = useState("")
  const [filter, setFilter] = useState("all")
  const [tooltip, setTooltip] = useState(null)
  
  // Interactive Controls
  const [spacing, setSpacing] = useState(100)
  const [charge, setCharge] = useState(-200)

  const filteredNodeIds = new Set(
    NODES.filter(n => {
      const matchSearch = !search || n.label.toLowerCase().includes(search.toLowerCase()) || n.desc.toLowerCase().includes(search.toLowerCase())
      const matchFilter = filter === "all" || n.group === filter || n.group.startsWith(filter + "-")
      return matchSearch && matchFilter
    }).map(n => n.id)
  )

  const getConnected = useCallback((nodeId) => {
    if (!nodeId) return new Set()
    const connected = new Set([nodeId])
    EDGES.forEach(([s, t]) => {
      if (s === nodeId) connected.add(t)
      if (t === nodeId) connected.add(s)
    })
    return connected
  }, [])

  // Update forces dynamically without resetting simulation fully
  useEffect(() => {
    if (!simRef.current) return
    const sim = simRef.current
    
    sim.force("link").distance(d => {
      const sg = d.source.group, tg = d.target.group
      if (sg === tg) return spacing * 0.6
      if (sg.startsWith("db") && tg.startsWith("db")) return spacing * 0.8
      return spacing
    })
    
    sim.force("charge").strength(charge)
    sim.alpha(0.3).restart()
  }, [spacing, charge])

  useEffect(() => {
    const svg = d3.select(svgRef.current)
    svg.selectAll("*").remove()

    const W = svgRef.current.clientWidth
    const H = svgRef.current.clientHeight

    const zoom = d3.zoom().scaleExtent([0.15, 4]).on("zoom", (e) => g.attr("transform", e.transform))
    svg.call(zoom)

    const g = svg.append("g")

    // Defs: glow filter + arrow
    const defs = svg.append("defs")
    const glow = defs.append("filter").attr("id", "glow").attr("x", "-50%").attr("y", "-50%").attr("width", "200%").attr("height", "200%")
    glow.append("feGaussianBlur").attr("stdDeviation", "3").attr("result", "coloredBlur")
    const feMerge = glow.append("feMerge")
    feMerge.append("feMergeNode").attr("in", "coloredBlur")
    feMerge.append("feMergeNode").attr("in", "SourceGraphic")

    defs.append("marker")
      .attr("id", "arrow")
      .attr("viewBox", "0 -4 8 8")
      .attr("refX", 18).attr("refY", 0)
      .attr("markerWidth", 5).attr("markerHeight", 5)
      .attr("orient", "auto")
      .append("path").attr("d", "M0,-4L8,0L0,4").attr("fill", "#444")

    const nodes = NODES.map(n => ({ ...n }))
    const nodeMap = Object.fromEntries(nodes.map(n => [n.id, n]))

    const links = EDGES
      .filter(([s, t]) => nodeMap[s] && nodeMap[t])
      .map(([s, t]) => ({ source: s, target: t }))

    const sim = d3.forceSimulation(nodes)
      .force("link", d3.forceLink(links).id(d => d.id).distance(spacing).strength(0.3))
      .force("charge", d3.forceManyBody().strength(charge))
      .force("center", d3.forceCenter(W / 2, H / 2))
      .force("collision", d3.forceCollide(d => (NODE_RADIUS[d.group] || DEFAULT_RADIUS) + 12))
      .force("x", d3.forceX(W / 2).strength(0.04))
      .force("y", d3.forceY(H / 2).strength(0.04))

    simRef.current = sim

    const link = g.append("g").selectAll("line")
      .data(links).join("line")
      .attr("stroke", "#2A2A28")
      .attr("stroke-width", 1.2)
      .attr("stroke-opacity", 0.7)
      .attr("marker-end", "url(#arrow)")

    const nodeG = g.append("g").selectAll("g")
      .data(nodes).join("g")
      .attr("cursor", "pointer")
      .call(d3.drag()
        .on("start", (e, d) => { if (!e.active) sim.alphaTarget(0.3).restart(); d.fx = d.x; d.fy = d.y })
        .on("drag", (e, d) => { d.fx = e.x; d.fy = e.y })
        .on("end", (e, d) => { if (!e.active) sim.alphaTarget(0); d.fx = null; d.fy = null })
      )
      .on("click", (e, d) => { e.stopPropagation(); setSelected(prev => prev === d.id ? null : d.id) })
      .on("mouseenter", (e, d) => {
        setHovered(d.id)
        const rect = svgRef.current.getBoundingClientRect()
        setTooltip({ x: e.clientX - rect.left + 12, y: e.clientY - rect.top - 10, node: d })
      })
      .on("mouseleave", () => { setHovered(null); setTooltip(null) })

    nodeG.append("circle")
      .attr("r", d => NODE_RADIUS[d.group] || DEFAULT_RADIUS)
      .attr("fill", d => GROUP_META[d.group]?.color || "#888")
      .attr("fill-opacity", 0.15)
      .attr("stroke", d => GROUP_META[d.group]?.color || "#888")
      .attr("stroke-width", 1.5)

    nodeG.append("circle")
      .attr("r", d => (NODE_RADIUS[d.group] || DEFAULT_RADIUS) * 0.45)
      .attr("fill", d => GROUP_META[d.group]?.color || "#888")
      .attr("fill-opacity", 0.9)

    nodeG.append("text")
      .text(d => d.label.split("/").pop().replace(".tsx", "").replace(".ts", ""))
      .attr("x", d => (NODE_RADIUS[d.group] || DEFAULT_RADIUS) + 4)
      .attr("y", 4)
      .attr("fill", "#C8C4B8")
      .attr("font-size", "9px")
      .attr("font-family", "monospace")
      .attr("pointer-events", "none")

    svg.on("click", () => setSelected(null))

    sim.on("tick", () => {
      link
        .attr("x1", d => d.source.x).attr("y1", d => d.source.y)
        .attr("x2", d => d.target.x).attr("y2", d => d.target.y)
      nodeG.attr("transform", d => `translate(${d.x},${d.y})`)
    })

    return () => sim.stop()
  }, []) // Initial mount

  // Update visual state based on selection/filter
  useEffect(() => {
    if (!svgRef.current) return
    const svg = d3.select(svgRef.current)
    const connected = getConnected(selected || hovered)

    svg.selectAll("g > g > g").each(function(d) {
      if (!d) return
      const inFilter = filteredNodeIds.has(d.id)
      const inConnected = !selected && !hovered ? true : connected.has(d.id)
      const opacity = (!inFilter || !inConnected) ? 0.08 : 1
      d3.select(this).attr("opacity", opacity)
        .select("circle:first-child").attr("filter", inConnected && (selected === d.id || hovered === d.id) ? "url(#glow)" : null)
    })

    svg.selectAll("g > g > line").each(function(d) {
      if (!d) return
      const inConnected = !selected && !hovered ? true : (connected.has(d.source.id || d.source) && connected.has(d.target.id || d.target))
      d3.select(this)
        .attr("stroke", inConnected ? "#5B4FE8" : "#2A2A28")
        .attr("stroke-opacity", inConnected ? 0.6 : 0.2)
        .attr("stroke-width", inConnected ? 1.5 : 1)
    })
  }, [selected, hovered, filteredNodeIds, getConnected])

  const selectedNode = selected ? NODES.find(n => n.id === selected) : null
  const connectedNodes = selected ? getConnected(selected) : null

  return (
    <div style={{ width: "100%", height: "100vh", background: "#111110", fontFamily: "monospace", color: "#C8C4B8", display: "flex", flexDirection: "column", overflow: "hidden" }}>
      {/* Header */}
      <div style={{ padding: "12px 16px", borderBottom: "1px solid #222", display: "flex", alignItems: "center", gap: 12, flexShrink: 0, background: "#0D0D0C" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ width: 24, height: 24, borderRadius: 6, background: "linear-gradient(135deg, #5B4FE8, #7C3AED)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </div>
          <span style={{ color: "#F0EFEC", fontSize: 13, fontWeight: 600, letterSpacing: "0.05em" }}>KOBIN AI — KNOWLEDGE GRAPH</span>
        </div>
        
        {/* Controls */}
        <div style={{ display: "flex", gap: 16, marginLeft: "auto", alignItems: "center" }}>
          
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 10, color: "#888" }}>Spacing</span>
            <input 
              type="range" min="30" max="250" value={spacing} 
              onChange={e => setSpacing(Number(e.target.value))}
              style={{ width: 80, accentColor: "#5B4FE8" }} 
            />
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 10, color: "#888" }}>Repulsion</span>
            <input 
              type="range" min="-500" max="-50" value={charge} 
              onChange={e => setCharge(Number(e.target.value))}
              style={{ width: 80, accentColor: "#5B4FE8" }} 
            />
          </div>
          
          <div style={{ height: 16, width: 1, background: "#333" }} />

          <input
            placeholder="search nodes…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ background: "#1C1C1A", border: "1px solid #333", borderRadius: 6, padding: "4px 10px", color: "#C8C4B8", fontSize: 11, outline: "none", width: 140 }}
          />
          <select
            value={filter}
            onChange={e => setFilter(e.target.value)}
            style={{ background: "#1C1C1A", border: "1px solid #333", borderRadius: 6, padding: "4px 8px", color: "#C8C4B8", fontSize: 11, outline: "none" }}
          >
            <option value="all">All layers</option>
            <option value="page">Pages</option>
            <option value="component">Components</option>
            <option value="api">API Routes</option>
            <option value="lib">Libraries</option>
            <option value="cron">Cron Jobs</option>
            <option value="db">Database Tables</option>
          </select>
          <span style={{ fontSize: 10, color: "#555", paddingLeft: 4 }}>{filteredNodeIds.size} nodes</span>
        </div>
      </div>

      {/* Graph */}
      <div style={{ flex: 1, position: "relative", overflow: "hidden" }}>
        <svg ref={svgRef} width="100%" height="100%" />

        {/* Tooltip */}
        {tooltip && (
          <div style={{
            position: "absolute", left: tooltip.x, top: tooltip.y,
            background: "#1C1C1A", border: `1px solid ${GROUP_META[tooltip.node.group]?.color || "#444"}40`,
            borderRadius: 8, padding: "8px 12px", maxWidth: 260, pointerEvents: "none", zIndex: 10,
            boxShadow: `0 0 20px ${GROUP_META[tooltip.node.group]?.color || "#5B4FE8"}20`
          }}>
            <div style={{ fontSize: 10, color: GROUP_META[tooltip.node.group]?.color, marginBottom: 3, textTransform: "uppercase", letterSpacing: "0.08em" }}>
              {GROUP_META[tooltip.node.group]?.label}
            </div>
            <div style={{ fontSize: 11, color: "#F0EFEC", fontWeight: 600, marginBottom: 4 }}>{tooltip.node.label}</div>
            <div style={{ fontSize: 10, color: "#888780", lineHeight: 1.4 }}>{tooltip.node.desc}</div>
          </div>
        )}

        {/* Selected node panel */}
        {selectedNode && (
          <div style={{
            position: "absolute", right: 12, top: 12, bottom: 12, width: 280,
            background: "#141413", border: "1px solid #2A2A28", borderRadius: 10, padding: 16,
            overflow: "auto", display: "flex", flexDirection: "column", gap: 12
          }}>
            <div>
              <div style={{ fontSize: 9, color: GROUP_META[selectedNode.group]?.color, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 6 }}>
                {GROUP_META[selectedNode.group]?.label}
              </div>
              <div style={{ fontSize: 14, color: "#F0EFEC", fontWeight: 600, marginBottom: 8, wordBreak: "break-all" }}>{selectedNode.label}</div>
              <div style={{ fontSize: 11, color: "#9ca3af", lineHeight: 1.6, background: "#1c1c1a", padding: "10px", borderRadius: "8px", border: "1px solid #2A2A28" }}>{selectedNode.desc}</div>
            </div>
            <div style={{ borderTop: "1px solid #2A2A28", paddingTop: 12 }}>
              <div style={{ fontSize: 9, color: "#555", marginBottom: 10, textTransform: "uppercase", letterSpacing: "0.08em" }}>Dependencies & Relationships</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {Array.from(connectedNodes)
                .filter(id => id !== selectedNode.id)
                .map(id => {
                  const n = NODES.find(x => x.id === id)
                  if (!n) return null
                  const isEdge = EDGES.some(([s, t]) => (s === selectedNode.id && t === id))
                  return (
                    <div
                      key={id}
                      onClick={() => setSelected(id)}
                      style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 8px", cursor: "pointer", borderRadius: "6px", background: hovered === id ? "#222" : "transparent" }}
                      onMouseEnter={() => setHovered(id)}
                      onMouseLeave={() => setHovered(null)}
                    >
                      <span style={{ fontSize: 10, color: "#666", width: 12 }}>{isEdge ? "→" : "←"}</span>
                      <div style={{ width: 8, height: 8, borderRadius: "50%", background: GROUP_META[n.group]?.color, flexShrink: 0 }} />
                      <span style={{ fontSize: 11, color: "#C8C4B8", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{n.label.split("/").pop()}</span>
                    </div>
                  )
                }).filter(Boolean)}
                </div>
            </div>
          </div>
        )}

        {/* Legend */}
        <div style={{
          position: "absolute", left: 12, bottom: 12,
          background: "#141413", border: "1px solid #2A2A28", borderRadius: 8, padding: "10px 14px",
          display: "flex", flexDirection: "column", gap: 6,
          maxHeight: "calc(100vh - 80px)", overflowY: "auto"
        }}>
          <div style={{ fontSize: 9, color: "#555", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4 }}>Layers</div>
          {Object.entries(GROUP_META).map(([key, meta]) => (
            <div key={key} style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ width: 8, height: 8, borderRadius: "50%", background: meta.color }} />
              <span style={{ fontSize: 10, color: "#888780" }}>{meta.label}</span>
            </div>
          ))}
          <div style={{ borderTop: "1px solid #2A2A28", marginTop: 6, paddingTop: 8, fontSize: 9, color: "#555", lineHeight: 1.4 }}>
            <b>Scroll</b> to zoom<br/><b>Drag</b> to pan<br/><b>Click</b> node to inspect
          </div>
        </div>
      </div>
    </div>
  )
}