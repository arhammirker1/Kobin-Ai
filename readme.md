<div align="center">

<br/>

```
╔═══════════════════════════════════════════════════════════╗
║                                                           ║
║          ██████╗ ██████╗ ███╗   ███╗███╗   ███╗          ║
║         ██╔════╝██╔═══██╗████╗ ████║████╗ ████║          ║
║         ██║     ██║   ██║██╔████╔██║██╔████╔██║          ║
║         ██║     ██║   ██║██║╚██╔╝██║██║╚██╔╝██║          ║
║         ╚██████╗╚██████╔╝██║ ╚═╝ ██║██║ ╚═╝ ██║          ║
║          ╚═════╝ ╚═════╝ ╚═╝     ╚═╝╚═╝     ╚═╝          ║
║                                                           ║
║              C E N T E R                                  ║
║                                                           ║
╚═══════════════════════════════════════════════════════════╝
```

**The founder's operating system.**  
One platform for tasks, clients, calendar, team, relationships, and real-time communication.

<br/>

[![Next.js](https://img.shields.io/badge/Next.js_15-000000?style=for-the-badge&logo=nextdotjs&logoColor=white)](https://nextjs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![Supabase](https://img.shields.io/badge/Supabase-3ECF8E?style=for-the-badge&logo=supabase&logoColor=white)](https://supabase.com)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-06B6D4?style=for-the-badge&logo=tailwindcss&logoColor=white)](https://tailwindcss.com)
[![Vercel](https://img.shields.io/badge/Vercel-000000?style=for-the-badge&logo=vercel&logoColor=white)](https://vercel.com)

<br/>

---

</div>

<br/>

## ✦ What is Command Center?

Command Center is a **full-stack founder productivity platform** — a single workspace that replaces five different tools. Built for founders who need clarity, not complexity.

| | |
|---|---|
| 🧠 **Tasks & Projects** | Kanban buckets, priority sorting, team assignment, real-time comments |
| 📅 **Calendar** | Day / Week / Month views, 5-min meeting reminders, smart notifications |
| 👥 **Team Management** | Granular permission system, team meetings, live task notifications |
| 🤝 **CRM / Relationships** | Leads, investors, partners, talent — with meeting outcomes |
| 🏢 **Client Portal** | White-label portal with task visibility, meetings, and live chat |
| 💬 **Real-Time Inbox** | Slack-style messaging with file uploads, threads, and reactions |
| 📝 **LinkedIn Studio** | Draft, schedule, and track personal branding content |
| 🔐 **Knowledge Vault** | Second brain — notes, decisions, and strategic logs |

<br/>

---

## ✦ Architecture

### System Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                         CLIENT TIER                                 │
│                                                                     │
│   ┌─────────────────┐  ┌──────────────────┐  ┌───────────────────┐ │
│   │  Founder  ( / ) │  │ Team (/team-dash) │  │ Client (/portal)  │ │
│   └─────────────────┘  └──────────────────┘  └───────────────────┘ │
│           Next.js 15 App Router · TypeScript · Tailwind CSS         │
└──────────────────────────────┬──────────────────────────────────────┘
                               │ HTTPS
┌──────────────────────────────▼──────────────────────────────────────┐
│                       NEXT.JS SERVER                                │
│                                                                     │
│   ┌──────────────────┐  ┌────────────────┐  ┌────────────────────┐ │
│   │    Middleware     │  │  API Routes    │  │ Server Components  │ │
│   │  Session refresh  │  │  /api/create-  │  │  SSR page shells   │ │
│   │  + route guard   │  │  team-member   │  │                    │ │
│   └──────────────────┘  │  /api/create-  │  └────────────────────┘ │
│                         │  client-creds  │                          │
│                         │  /api/delete-  │                          │
│                         │  team-member   │                          │
│                         └────────────────┘                          │
│                      Vercel Edge / Node Runtime                     │
└──────────────────────────────┬──────────────────────────────────────┘
                               │ Supabase JS SDK
┌──────────────────────────────▼──────────────────────────────────────┐
│                         SUPABASE                                    │
│                                                                     │
│   ┌──────────────┐  ┌────────────────┐  ┌──────────┐  ┌─────────┐ │
│   │     Auth     │  │  PostgreSQL    │  │ Realtime │  │ Storage │ │
│   │  JWT·Cookies │  │ RLS · 14 tables│  │ WebSocket│  │  Files  │ │
│   └──────────────┘  └────────────────┘  └──────────┘  └─────────┘ │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

<br/>

### Database Schema

```
                        ┌─────────────────┐
                        │    profiles     │
                        │─────────────────│
                        │ id (PK)         │
                        │ user_type       │◄── founder / team_member / client
                        │ full_name       │
                        │ email           │
                        │ created_by (FK) │
                        └────────┬────────┘
               ┌─────────────────┼──────────────────┐
               │                 │                  │
    ┌──────────▼──────┐  ┌───────▼────────┐  ┌──────▼────────────┐
    │  team_members   │  │    projects    │  │     clients       │
    │─────────────────│  │────────────────│  │───────────────────│
    │ user_id (FK)    │  │ founder_id(FK) │  │ portal_user_id(FK)│
    │ founder_id (FK) │  │ name           │  │ project_id (FK)   │
    │ position        │  │ status         │  │ has_portal_access │
    │ is_active       │  │ priority       │  │ can_create_tasks  │
    │ can_view_tasks  │  └───────┬────────┘  └────────┬──────────┘
    │ can_create_tasks│          │                    │
    │ can_view_cal    │  ┌───────▼────────┐  ┌────────▼──────────┐
    │ can_access_inbox│  │     tasks      │  │     events        │
    │ ... 8 more      │  │────────────────│  │───────────────────│
    └─────────────────┘  │ user_id (FK)   │  │ user_id (FK)      │
                         │ project_id(FK) │  │ client_id (FK)    │
                         │ assigned_to(FK)│  │ relationship_id   │
                         │ bucket         │◄── today/this-week/  │
                         │ priority       │   delegated/backlog  │
                         │ resources(JSON)│  │ type              │
                         └───────┬────────┘  │ meeting_link      │
                                 │           └───────────────────┘
                    ┌────────────▼────────┐
                    │   task_comments     │
                    │─────────────────────│
                    │ task_id (FK)        │
                    │ user_id (FK)        │
                    │ content             │
                    └─────────────────────┘


    ┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
    │   chat_rooms    │     │  chat_messages   │     │  relationships  │
    │─────────────────│     │──────────────────│     │─────────────────│
    │ type            │1──N▶│ room_id (FK)     │     │ user_id (FK)    │
    │ project_id (FK) │     │ sender_id (FK)   │     │ relationship_   │
    │ dm_key          │     │ content          │     │ type            │
    │ founder_id (FK) │     │ file_url         │     │ tags[]          │
    └─────────────────┘     │ reply_to_id (FK) │◄──┐ │ linkedin_url    │
                            │ edited_at        │   └─│ meeting_link    │
                            └──────────────────┘     └─────────────────┘


    ┌─────────────────┐     ┌──────────────────┐
    │  vault_notes    │     │  linkedin_posts  │
    │─────────────────│     │──────────────────│
    │ user_id (FK)    │     │ user_id (FK)     │
    │ title           │     │ content          │
    │ content         │     │ status           │
    │ is_decision     │     │ impressions      │
    │ tags[]          │     │ engagement_count │
    └─────────────────┘     └──────────────────┘
```

<br/>

### Key Data Flows

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 LOGIN + ROLE REDIRECT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  User submits credentials
       │
       ▼
  supabase.auth.signInWithPassword()
       │
       ▼
  Fetch profile.user_type
       │
       ├─ "founder"      ──▶  /
       ├─ "team_member"  ──▶  /team-dashboard
       └─ "client"       ──▶  /client-portal

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 CREATE TEAM MEMBER  (Admin API path)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  Founder fills form
       │
       ▼
  POST /api/create-team-member
  (server-side · service role key)
       │
       ├──▶ supabaseAdmin.auth.admin.createUser()
       │    email_confirm: true
       │
       ├──▶ INSERT profiles  (user_type: "team_member")
       │
       └──▶ INSERT team_members  (all permission flags)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 REAL-TIME CHAT MESSAGE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  User presses Enter
       │
       ▼
  INSERT chat_messages  (Supabase client)
       │
       ▼
  Supabase Realtime broadcasts
  postgres_changes INSERT event
  to channel "room:{room_id}"
       │
       ▼
  All connected clients receive
  the event via WebSocket
       │
       ▼
  Secondary SELECT for sender profile
       │
       ▼
  Message appended to local state ✓

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 PROJECT CREATION → CHAT ROOM AUTO-SETUP
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  INSERT projects
       │
       ▼
  createProjectChatRoom() helper
       │
       ├──▶ INSERT chat_rooms  (type: "project")
       │
       ├──▶ Fetch all active team_members
       │    WHERE founder_id = founder
       │
       └──▶ INSERT chat_room_members
            for founder + all team members
            ── room visible in everyone's Inbox ✓

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 GRANT CLIENT PORTAL ACCESS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  POST /api/create-client-credentials
       │
       ├──▶ supabaseAdmin.auth.admin.createUser()
       │
       ├──▶ INSERT profiles  (user_type: "client")
       │
       ├──▶ UPDATE clients
       │    portal_user_id, portal_email,
       │    has_portal_access: true
       │
       ├──▶ INSERT chat_room_members
       │    (auto-join project chat room)
       │
       └──▶ INSERT chat_rooms  (type: "direct")
            + INSERT chat_room_members x2
            (founder ↔ client DM created) ✓
```

<br/>

---

## ✦ User Roles & Permissions

```
┌─────────────────────────────────────────────────────────────────┐
│  FOUNDER                                             Full Access │
│  ─────────────────────────────────────────────────────────────  │
│  All modules · All data · Creates team members & clients        │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│  TEAM MEMBER                               Permission-gated      │
│  ─────────────────────────────────────────────────────────────  │
│                                                                  │
│  can_view_tasks         can_create_tasks    can_update_status   │
│  can_view_calendar      can_view_projects   can_create_projects │
│  can_view_linkedin      can_view_vault      can_view_analytics  │
│  can_view_relationships can_access_clients  can_access_inbox    │
│                                                                  │
│  is_active = false  →  signed out on next page load             │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│  CLIENT                                         Portal-scoped    │
│  ─────────────────────────────────────────────────────────────  │
│  Sees own project tasks · Upcoming meetings · Inbox · Calendar  │
│  can_create_tasks (optional, set by founder)                    │
└─────────────────────────────────────────────────────────────────┘
```

<br/>

---

## ✦ Feature Modules

<details>
<summary><strong>📋 Tasks & Execution</strong></summary>

- **4 time-horizon buckets** — Today · This Week · Delegated · Backlog
- Priority sorting: Urgent → High → Medium → Low, then by due date
- Assign to team members (triggers browser notification within 10s)
- Link tasks to projects (appears in client portal)
- Resources: attach multiple URLs per task
- Inline comments with real-time thread
- Project filter pill-bar across all buckets

</details>

<details>
<summary><strong>📅 Calendar</strong></summary>

- Day / Week / Month view with smooth navigation
- Click any time slot to create a pre-filled event
- Current time indicator (red line)
- Event types: Internal · Deal · Hiring (color-coded)
- **Meeting Reminders** — background polling every 30s:
  - 5 min before → slide-in toast (top-right)
  - 1 min before → full-screen modal + Browser Notification API

</details>

<details>
<summary><strong>💬 Real-Time Inbox</strong></summary>

- Supabase Realtime WebSocket channels per room
- Room types: Project (auto-created) · Group · Direct Message
- Paginated messages (20 per load), infinite scroll upward
- Reply · Edit · Delete (unsend) · Forward · Copy
- File attachments → Supabase Storage (`chat_attachment` bucket)
- Image lightbox with download
- Unread badge tracking via `last_read_at`

</details>

<details>
<summary><strong>🤝 Clients</strong></summary>

- Link clients to projects → tasks auto-visible in portal
- Schedule meetings (sets `client_id` on events)
- One-click portal access creation:
  - Creates Supabase auth user via Admin API
  - Auto-joins project chat room
  - Creates founder ↔ client DM
- Optional: allow client to create tasks

</details>

<details>
<summary><strong>👥 Team Management</strong></summary>

- Create members with pre-set credentials (no invite email needed)
- 12 granular permission toggles, updated live
- Deactivate account: `is_active=false` → signs out on next load
- Hard delete via Admin API
- Team meeting scheduler (individual or joint, adds events for all participants)

</details>

<br/>

---

## ✦ Tech Stack

| Layer | Technology |
|-------|------------|
| Framework | Next.js 15 (App Router) |
| Language | TypeScript |
| Styling | Tailwind CSS v4 + Shadcn/UI |
| Backend | Supabase (PostgreSQL + Auth + Realtime + Storage) |
| ORM / Queries | Supabase JS SDK (`@supabase/ssr`) |
| Data Fetching | SWR (client) + Server Components (server) |
| Deployment | Vercel |
| Fonts | Geist + Geist Mono |
| Notifications | Browser Notification API + Sonner toasts |
| Analytics | Vercel Analytics |

<br/>

---

## ✦ Quick Start

### Prerequisites

- Node.js 18+
- A [Supabase](https://supabase.com) project
- A [Vercel](https://vercel.com) account (optional, for deployment)

### 1. Clone

```bash
git clone https://github.com/your-username/command-center.git
cd command-center
npm install
```

### 2. Environment Variables

Create a `.env.local` file in the project root:

```env
# Required — public (safe to expose to browser)
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key

# Required — SERVER ONLY (never expose to browser)
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

> ⚠️ `SUPABASE_SERVICE_ROLE_KEY` is used exclusively in `/api/*` server routes. It bypasses Row Level Security — never include it in client-side code.

### 3. Database

Run the SQL migrations in your Supabase project to create all required tables with RLS policies. Tables needed:

```
profiles · team_members · clients · projects · tasks · task_comments
events · relationships · linkedin_posts · vault_notes
chat_rooms · chat_room_members · chat_messages
team_meetings · team_meeting_participants
```

### 4. Storage

Create a **public** storage bucket named `chat_attachment` in your Supabase project.

### 5. Run

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Sign up — your first account is automatically a **Founder**.

<br/>

---

## ✦ Environment Variables Reference

| Variable | Scope | Description |
|----------|-------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Client + Server | Your Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Client + Server | Public anon key (safe for browser) |
| `SUPABASE_SERVICE_ROLE_KEY` | **Server only** | Service role key — bypasses RLS |

<br/>

---

## ✦ Project Structure

```
command-center/
├── app/
│   ├── api/
│   │   ├── auth/callback/          # OAuth callback handler
│   │   ├── create-team-member/     # Admin API: create team user
│   │   ├── create-client-credentials/ # Admin API: create client user
│   │   └── delete-team-member/     # Admin API: delete team user
│   ├── client-portal/              # Client dashboard
│   ├── login/                      # Auth page
│   ├── team-dashboard/             # Team member dashboard
│   └── page.tsx                    # Founder dashboard (/)
│
├── components/
│   ├── ui/                         # Shadcn/UI primitives
│   ├── calendar-view.tsx           # Full calendar (Day/Week/Month)
│   ├── clients-view.tsx            # Client management
│   ├── crm-view.tsx                # Relationships CRM
│   ├── dashboard-content.tsx       # Founder content router
│   ├── inbox-view.tsx              # Real-time chat
│   ├── meeting-reminder.tsx        # Background meeting alerts
│   ├── projects-view.tsx           # Project management
│   ├── task-view.tsx               # Task kanban
│   ├── team-view.tsx               # Team management
│   ├── today-view.tsx              # Founder home dashboard
│   └── vault-view.tsx              # Knowledge vault
│
├── lib/
│   ├── supabase/
│   │   ├── admin.ts                # Service role client
│   │   ├── client.ts               # Browser client (singleton)
│   │   ├── server.ts               # SSR server client
│   │   ├── middleware.ts           # Session refresh
│   │   └── queries/                # Typed query helpers
│   └── create-project-room.ts     # Chat room auto-setup helper
│
└── middleware.ts                   # Route protection
```

<br/>

---

## ✦ API Routes

All API routes require authentication and use the **service role key** server-side to perform operations that bypass RLS.

| Route | Method | Auth Required | Description |
|-------|--------|---------------|-------------|
| `/api/create-team-member` | POST | Founder | Creates auth user + profile + team_members row |
| `/api/delete-team-member` | POST | Founder | Deletes team_members row + auth user |
| `/api/create-client-credentials` | POST | Founder / team (with client access) | Creates auth user + client portal setup |
| `/api/auth/callback` | GET | — | OAuth callback, exchanges code for session |

<br/>

---

## ✦ Notification Systems

```
MeetingReminder (global, in layout.tsx)
├── Polls events every 30s for meetings within 20 min
├── Checks timing every 10s
├── 5 min before  →  slide-in toast (top-right)
└── 1 min before  →  full-screen modal + Browser Notification API

TaskAssignmentNotification (global, in layout.tsx)
├── Polls tasks every 10s for newly assigned tasks (last 60s)
├── Shows slide-in toast with priority badge
└── Fires Browser Notification API alert
    └── Deduplication via localStorage (persists across refreshes)
```

<br/>

---

## ✦ Security Model

```
Browser (anon key)
    └─▶ Supabase RLS policies
            └─ Every query scoped to auth.uid()
            └─ Founders see their workspace
            └─ Team members see founder's data
            └─ Clients see only their project

Server API routes (service role key)
    └─▶ Bypasses RLS intentionally
    └─▶ Application-level checks first:
            └─ Verifies caller is founder
            └─ Verifies caller has required permission
    └─▶ Then performs admin operations
            └─ Create / delete auth users
            └─ Cross-user inserts (DM rooms, etc.)
```

<br/>

---

<div align="center">

Built with precision for founders who move fast.

<br/>

**[⬆ Back to top](#)**

</div>
