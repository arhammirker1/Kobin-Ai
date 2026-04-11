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

  // Database Tables — Profiles & Auth
  { id: "db-profiles", label: "profiles", group: "db", desc: "User profiles — id (FK auth.users), email, full_name, avatar_url, user_type [founder|team_member|client], ai_mode [quiet|balanced|aggressive], settings JSONB" },
  { id: "db-team-members", label: "team_members", group: "db", desc: "Team membership — user_id FK, founder_id FK, position, permissions (can_view_tasks, can_create_tasks, can_view_calendar, can_view_linkedin, can_view_relationships, can_view_vault, can_view_analytics, can_access_inbox, can_perform_tasks)" },
  { id: "db-push-subscriptions", label: "push_subscriptions", group: "db", desc: "Web Push subscriptions — user_id FK, endpoint UNIQUE, p256dh, auth, last_notified_at" },

  // Database Tables — CRM & Relationships
  { id: "db-relationships", label: "relationships", group: "db", desc: "CRM contacts — user_id FK, full_name, company, role, relationship_type [lead|client|investor|partner|talent], pipeline_stage [new_lead|contacted|meeting_booked|proposal|negotiating|closed_won|closed_lost], deal_value, close_probability (0-100), lead_score, lead_status [cold], ghosting detection, tags[]" },
  { id: "db-clients", label: "clients", group: "db", desc: "Client records — founder_id FK, name, company, email, phone, status, portal_email, has_portal_access, can_create_tasks, contract_value, contract_start/end, project_id FK, portal_user_id FK, tags[], industry, website, address" },
  { id: "db-email-analyses", label: "email_analyses", group: "db", desc: "AI email analysis results — user_id FK, gmail_message_id, contact_id FK, sender_email, direction [inbound|outbound], intent, intent_confidence (0-100), sentiment [positive|neutral|negative], signals JSONB, reasoning, thread_subject" },
  { id: "db-crm-import-history", label: "crm_import_history", group: "db", desc: "CSV import audit log — user_id FK, file_name, rows_imported, rows_skipped" },

  // Database Tables — Tasks & Projects
  { id: "db-projects", label: "projects", group: "db", desc: "Projects — user_id FK, name, description, status [active|completed|archived|on-hold], color, priority [low|medium|high|urgent], start_date, end_date, due_date, created_by FK" },
  { id: "db-tasks", label: "tasks", group: "db", desc: "Tasks — user_id FK, created_by FK, assigned_to FK, title, bucket [today], status, priority, deadline, due_date, project_id FK, is_completed, notes, resources JSONB, deliverable_required, deliverable_description, source_message_id FK (chat_messages), vault_attachments JSONB" },
  { id: "db-task-comments", label: "task_comments", group: "db", desc: "Task comments — task_id FK, user_id FK (profiles), content, created_at, updated_at" },

  // Database Tables — Chat & Messaging
  { id: "db-chat-rooms", label: "chat_rooms", group: "db", desc: "Chat rooms — type [direct|group|project], project_id FK, founder_id FK, created_by FK, dm_key UNIQUE (for direct messages)" },
  { id: "db-chat-room-members", label: "chat_room_members", group: "db", desc: "Room membership — room_id FK, user_id FK (profiles), joined_at, last_read_at" },
  { id: "db-chat-messages", label: "chat_messages", group: "db", desc: "Chat messages — room_id FK, sender_id FK (profiles), content, file attachments (file_url, file_name, file_type, file_size), reply_to_id FK, message_type [text|event_invite|task_ref|ai_response], is_ai, ai_model, task_id FK, invite_id FK, extracted_task_id FK" },
  { id: "db-message-reactions", label: "message_reactions", group: "db", desc: "Message emoji reactions — message_id FK, user_id FK (profiles), emoji" },
  { id: "db-ai-command-chats", label: "ai_command_chats", group: "db", desc: "AI command chat sessions — user_id FK, title, messages JSONB (array of messages)" },

  // Database Tables — Calendar & Events
  { id: "db-events", label: "events", group: "db", desc: "Calendar events — user_id FK, title, description, start_time, end_time, type, meeting_link, purpose, outcome, relationship_id FK, client_id FK, google_event_id, google_meet_link, attendee_emails[], meeting_id" },
  { id: "db-event-invites", label: "event_invites", group: "db", desc: "Event invitations — event_id FK, invitee_user_id FK (profiles), inviter_user_id FK (profiles), status [pending|accepted|declined], responded_at" },
  { id: "db-team-meetings", label: "team_meetings", group: "db", desc: "Team meetings — founder_id FK, team_member_id FK, title, description, start_time, end_time, meeting_type [individual|joint], meeting_link" },
  { id: "db-team-meeting-participants", label: "team_meeting_participants", group: "db", desc: "Team meeting participants — meeting_id FK, participant_id FK (auth.users)" },

  // Database Tables — Meetings & Recording
  { id: "db-meeting-recordings-raw", label: "meeting_recordings_raw", group: "db", desc: "Raw meeting recordings — user_id FK, meeting_title, meeting_url, calendar_event_id, participant_emails[], participant_names[], host_segments JSONB, participant_segments JSONB, combined_transcript, duration_seconds, started_at, ended_at, processing_status [pending|processing|completed|failed], processing_error" },
  { id: "db-meeting-analyses", label: "meeting_analyses", group: "db", desc: "AI meeting analysis — user_id FK, recording_id FK (meeting_recordings_raw) UNIQUE, summary, key_decisions JSONB, action_items JSONB, sentiment, topics[], crm_matches JSONB, tasks_created UUID[], notes_created UUID[]" },
  { id: "db-meeting-bot-config", label: "meeting_bot_config", group: "db", desc: "Meeting bot settings — user_id FK UNIQUE, bot_name (default 'Kobin AI'), auto_record, groq_whisper_enabled" },

  // Database Tables — Gmail & Google Integration
  { id: "db-gmail-threads", label: "gmail_threads", group: "db", desc: "Cached Gmail threads — id (text), user_id FK, subject, snippet, sender_email, sender_name, is_unread, has_attachment, received_at, last_message_at, message_count, relationship_id FK, labels[], synced from Gmail API" },
  { id: "db-gmail-messages", label: "gmail_messages", group: "db", desc: "Cached Gmail messages — id (text), thread_id, user_id FK, from_email, from_name, to_emails[], subject, body_text, body_html, is_unread, sent_at" },
  { id: "db-google-integrations", label: "google_integrations", group: "db", desc: "Google OAuth tokens — user_id FK UNIQUE, google_email, access_token, refresh_token, token_expires_at, is_connected, drive_vault_folder_id, drive_connected, gmail_connected, gmail_sync_token, gmail_last_synced_at, gmail_history_id, gmail_watch_expiration" },

  // Database Tables — Vault & Files
  { id: "db-vault-folders", label: "vault_folders", group: "db", desc: "Drive folders — founder_id FK, project_id FK, name, drive_folder_id, parent_folder_id FK (self-ref), folder_type [root|project|internal|client_uploads|deliverables|custom]" },
  { id: "db-vault-items", label: "vault_items", group: "db", desc: "Vault files/links — founder_id FK, project_id FK, folder_id FK, item_type [file|link|note], title, description, document_type, drive_file_id, drive_file_url, link_url, note_content, added_by FK, added_by_type [founder|team|client]" },
  { id: "db-vault-notes", label: "vault_notes", group: "db", desc: "Quick notes — user_id FK, title, content, tags[], is_decision boolean" },

  // Database Tables — LinkedIn
  { id: "db-linkedin-posts", label: "linkedin_posts", group: "db", desc: "LinkedIn posts — user_id FK, content, status [Draft], scheduled_for, published_at" },

  // Database Tables — AI Memory
  { id: "db-ai-memories", label: "ai_memories", group: "db", desc: "AI long-term memory — founder_id FK, memory_type [preference|pattern|workflow|fact], key, value, confidence (0-1), times_observed, last_seen_at" },
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

  // Profiles & Auth → DB
  ["lib-supabase-admin", "db-profiles"],
  ["lib-supabase-admin", "db-team-members"],
  ["lib-supabase-admin", "db-push-subscriptions"],
  ["lib-supabase-admin", "db-google-integrations"],

  // CRM → DB
  ["lib-supabase-admin", "db-relationships"],
  ["lib-supabase-admin", "db-clients"],
  ["lib-supabase-admin", "db-email-analyses"],
  ["lib-supabase-admin", "db-crm-import-history"],
  ["comp-crm", "db-relationships"],
  ["comp-crm", "db-clients"],
  ["comp-crm", "db-email-analyses"],
  ["api-gmail-sync", "db-relationships"],
  ["api-gmail-sync", "db-gmail-threads"],
  ["api-gmail-sync", "db-gmail-messages"],
  ["api-analyze-email", "db-email-analyses"],
  ["api-analyze-email", "db-relationships"],
  ["api-draft", "db-relationships"],

  // Tasks & Projects → DB
  ["lib-supabase-admin", "db-projects"],
  ["lib-supabase-admin", "db-tasks"],
  ["lib-supabase-admin", "db-task-comments"],
  ["comp-task", "db-tasks"],
  ["comp-task", "db-projects"],
  ["comp-taskform", "db-tasks"],
  ["lib-executor", "db-tasks"],
  ["lib-executor", "db-projects"],

  // Chat → DB
  ["lib-supabase-admin", "db-chat-rooms"],
  ["lib-supabase-admin", "db-chat-room-members"],
  ["lib-supabase-admin", "db-chat-messages"],
  ["lib-supabase-admin", "db-message-reactions"],
  ["lib-supabase-admin", "db-ai-command-chats"],
  ["comp-inbox", "db-chat-rooms"],
  ["comp-inbox", "db-chat-messages"],
  ["comp-inbox", "db-chat-room-members"],
  ["api-chat", "db-ai-command-chats"],
  ["api-command", "db-chat-rooms"],
  ["api-command", "db-chat-messages"],

  // Calendar & Events → DB
  ["lib-supabase-admin", "db-events"],
  ["lib-supabase-admin", "db-event-invites"],
  ["lib-supabase-admin", "db-team-meetings"],
  ["lib-supabase-admin", "db-team-meeting-participants"],
  ["comp-calendar", "db-events"],
  ["comp-calendar", "db-event-invites"],
  ["comp-meeting", "db-events"],
  ["comp-meeting", "db-event-invites"],
  ["api-google-meet", "db-events"],
  ["api-proactive", "db-events"],

  // Meeting Recording → DB
  ["lib-supabase-admin", "db-meeting-recordings-raw"],
  ["lib-supabase-admin", "db-meeting-analyses"],
  ["lib-supabase-admin", "db-meeting-bot-config"],
  ["api-meeting-upload", "db-meeting-recordings-raw"],
  ["api-meeting-process", "db-meeting-recordings-raw"],
  ["api-meeting-process", "db-meeting-analyses"],
  ["api-meeting-process", "db-tasks"],
  ["api-meeting-transcribe", "db-meeting-recordings-raw"],
  ["cron-digest", "db-meeting-analyses"],

  // Gmail & Google → DB
  ["lib-supabase-admin", "db-gmail-threads"],
  ["lib-supabase-admin", "db-gmail-messages"],
  ["lib-gmail-analyze", "db-gmail-threads"],
  ["lib-gmail-analyze", "db-gmail-messages"],
  ["lib-gmail-analyze", "db-email-analyses"],
  ["lib-gmail-watch", "db-google-integrations"],
  ["api-gmail-threads", "db-gmail-threads"],
  ["api-gmail-thread", "db-gmail-messages"],
  ["api-gmail-reply", "db-gmail-messages"],
  ["api-gmail-webhook", "db-gmail-threads"],
  ["api-gmail-webhook", "db-gmail-messages"],
  ["api-gmail-contact", "db-relationships"],

  // Vault → DB
  ["lib-supabase-admin", "db-vault-folders"],
  ["lib-supabase-admin", "db-vault-items"],
  ["lib-supabase-admin", "db-vault-notes"],
  ["lib-google-drive", "db-vault-folders"],
  ["comp-vault", "db-vault-folders"],
  ["comp-vault", "db-vault-items"],
  ["comp-vault", "db-vault-notes"],

  // LinkedIn → DB
  ["lib-supabase-admin", "db-linkedin-posts"],

  // AI Memory → DB
  ["lib-supabase-admin", "db-ai-memories"],
  ["lib-memory", "db-ai-memories"],
  ["api-warm", "db-ai-memories"],

  // AI Chat → DB
  ["lib-memory", "db-ai-memories"],
  ["api-warm", "db-ai-memories"],
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
  db:           { color: "#EC4899", label: "Database Tables", shape: "square" },
}

const NODE_RADIUS = { page: 14, component: 11, "api-ai": 9, "api-gmail": 8, cron: 8, "api-meeting": 8, "api-auth": 8, "lib-ai": 10, "lib-infra": 9, db: 9 }

export default function KobinKnowledgeGraph() {
  const svgRef = useRef(null)
  const simRef = useRef(null)
  const [selected, setSelected] = useState(null)
  const [hovered, setHovered] = useState(null)
  const [search, setSearch] = useState("")
  const [filter, setFilter] = useState("all")
  const [tooltip, setTooltip] = useState(null)

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
      .force("link", d3.forceLink(links).id(d => d.id).distance(d => {
        const sg = d.source.group, tg = d.target.group
        if (sg === tg) return 60
        return 100
      }).strength(0.3))
      .force("charge", d3.forceManyBody().strength(-180))
      .force("center", d3.forceCenter(W / 2, H / 2))
      .force("collision", d3.forceCollide(d => (NODE_RADIUS[d.group] || 9) + 8))
      .force("x", d3.forceX(W / 2).strength(0.03))
      .force("y", d3.forceY(H / 2).strength(0.03))

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
      .attr("r", d => NODE_RADIUS[d.group] || 9)
      .attr("fill", d => GROUP_META[d.group]?.color || "#888")
      .attr("fill-opacity", 0.15)
      .attr("stroke", d => GROUP_META[d.group]?.color || "#888")
      .attr("stroke-width", 1.5)

    nodeG.append("circle")
      .attr("r", d => (NODE_RADIUS[d.group] || 9) * 0.45)
      .attr("fill", d => GROUP_META[d.group]?.color || "#888")
      .attr("fill-opacity", 0.9)

    nodeG.append("text")
      .text(d => d.label.split("/").pop().replace(".tsx", "").replace(".ts", ""))
      .attr("x", d => (NODE_RADIUS[d.group] || 9) + 4)
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
  }, [])

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
        <div style={{ display: "flex", gap: 8, marginLeft: "auto", alignItems: "center" }}>
          <input
            placeholder="search nodes…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ background: "#1C1C1A", border: "1px solid #333", borderRadius: 6, padding: "4px 10px", color: "#C8C4B8", fontSize: 11, outline: "none", width: 160 }}
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
          <span style={{ fontSize: 10, color: "#555", borderLeft: "1px solid #333", paddingLeft: 8 }}>{filteredNodeIds.size} nodes visible</span>
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
            borderRadius: 8, padding: "8px 12px", maxWidth: 240, pointerEvents: "none", zIndex: 10,
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
            position: "absolute", right: 12, top: 12, bottom: 12, width: 240,
            background: "#141413", border: "1px solid #2A2A28", borderRadius: 10, padding: 16,
            overflow: "auto", display: "flex", flexDirection: "column", gap: 12
          }}>
            <div>
              <div style={{ fontSize: 9, color: GROUP_META[selectedNode.group]?.color, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 6 }}>
                {GROUP_META[selectedNode.group]?.label}
              </div>
              <div style={{ fontSize: 12, color: "#F0EFEC", fontWeight: 600, marginBottom: 6 }}>{selectedNode.label}</div>
              <div style={{ fontSize: 10, color: "#888780", lineHeight: 1.5 }}>{selectedNode.desc}</div>
            </div>
            <div style={{ borderTop: "1px solid #2A2A28", paddingTop: 10 }}>
              <div style={{ fontSize: 9, color: "#555", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.08em" }}>Connected nodes</div>
              {Array.from(connectedNodes)
                .filter(id => id !== selectedNode.id)
                .map(id => {
                  const n = NODES.find(x => x.id === id)
                  if (!n) return null
                  const isEdge = EDGES.some(([s, t]) => (s === selectedNode.id && t === id))
                  const isIncoming = EDGES.some(([s, t]) => (s === id && t === selectedNode.id))
                  return (
                    <div
                      key={id}
                      onClick={() => setSelected(id)}
                      style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 0", cursor: "pointer", borderBottom: "1px solid #1C1C1A" }}
                    >
                      <span style={{ fontSize: 8, color: "#555" }}>{isEdge ? "→" : "←"}</span>
                      <div style={{ width: 6, height: 6, borderRadius: "50%", background: GROUP_META[n.group]?.color, flexShrink: 0 }} />
                      <span style={{ fontSize: 10, color: "#C8C4B8" }}>{n.label.split("/").pop()}</span>
                    </div>
                  )
                }).filter(Boolean)}
            </div>
          </div>
        )}

        {/* Legend */}
        <div style={{
          position: "absolute", left: 12, bottom: 12,
          background: "#141413", border: "1px solid #2A2A28", borderRadius: 8, padding: "10px 12px",
          display: "flex", flexDirection: "column", gap: 5
        }}>
          <div style={{ fontSize: 9, color: "#555", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 2 }}>Layers</div>
          {Object.entries(GROUP_META).map(([key, meta]) => (
            <div key={key} style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <div style={{ width: 7, height: 7, borderRadius: "50%", background: meta.color }} />
              <span style={{ fontSize: 9, color: "#888780" }}>{meta.label}</span>
            </div>
          ))}
          <div style={{ borderTop: "1px solid #2A2A28", marginTop: 4, paddingTop: 6, fontSize: 9, color: "#444" }}>
            scroll to zoom · drag to pan<br />click node to inspect
          </div>
        </div>
      </div>
    </div>
  )
}