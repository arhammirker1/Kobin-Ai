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

**The founder's operating system.**  by arham mirkar 
One platform for tasks, clients, calendar, team, relationships, vault, and real-time communication.

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
| 🧠 **Tasks & Projects** | Kanban buckets, priority sorting, team assignment, project filter, real-time comments |
| 📅 **Calendar** | Day / Week / Month views, 5-min meeting reminders, smart notifications |
| 👥 **Team Management** | Granular permission system, team meetings, live task notifications |
| 🤝 **CRM / Relationships** | Leads, investors, partners, talent — with meeting outcomes |
| 🏢 **Client Portal** | White-label portal with tasks, vault, meetings, inbox, and calendar |
| 💬 **Real-Time Inbox** | Instagram-style messaging with reactions, forward, edit, file uploads, and pagination |
| 📝 **LinkedIn Studio** | Draft, schedule, and track personal branding content |
| 🗄️ **Vault** | Google Drive-backed project knowledge base with role-scoped access |

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
│   ┌──────────────────┐  ┌────────────────────────────────────────┐  │
│   │    Middleware     │  │             API Routes                 │  │
│   │  Session refresh  │  │  /api/create-team-member               │  │
│   │  + route guard   │  │  /api/create-client-credentials        │  │
│   └──────────────────┘  │  /api/delete-team-member               │  │
│                         │  /api/auth/google                      │  │
│                         │  /api/auth/google/callback             │  │
│                         │  /api/google/disconnect                │  │
│                         │  /api/vault/connect                    │  │
│                         │  /api/vault/create-project-folders     │  │
│                         │  /api/vault/upload-file                │  │
│                         └────────────────────────────────────────┘  │
│                      Vercel Edge / Node Runtime                     │
└──────────────────────────────┬──────────────────────────────────────┘
                               │ Supabase JS SDK
┌──────────────────────────────▼──────────────────────────────────────┐
│                         SUPABASE                                    │
│                                                                     │
│   ┌──────────────┐  ┌────────────────┐  ┌──────────┐  ┌─────────┐ │
│   │     Auth     │  │  PostgreSQL    │  │ Realtime │  │ Storage │ │
│   │  JWT·Cookies │  │ RLS · 17 tables│  │ WebSocket│  │  Files  │ │
│   └──────────────┘  └────────────────┘  └──────────┘  └─────────┘ │
│                                                                     │
└──────────────────────────────┬──────────────────────────────────────┘
                               │ Google APIs
┌──────────────────────────────▼──────────────────────────────────────┐
│                        GOOGLE SERVICES                              │
│                                                                     │
│   ┌──────────────────┐  ┌──────────────────┐                        │
│   │  Google Calendar  │  │   Google Drive   │                        │
│   │  Meet link gen    │  │  Vault storage   │                        │
│   └──────────────────┘  └──────────────────┘                        │
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
    │ position        │  │ status         │  │ founder_id (FK)   │
    │ is_active       │  │ priority       │  │ has_portal_access │
    │ can_view_tasks  │  └───────┬────────┘  │ can_create_tasks  │
    │ can_perform_tasks│         │           └────────┬──────────┘
    │ can_create_tasks│  ┌───────▼────────┐           │
    │ can_view_vault  │  │     tasks      │  ┌────────▼──────────┐
    │ can_view_cal    │  │────────────────│  │     events        │
    │ can_access_inbox│  │ user_id (FK)   │  │───────────────────│
    │ ... more        │  │ project_id(FK) │  │ user_id (FK)      │
    └─────────────────┘  │ assigned_to(FK)│  │ client_id (FK)    │
                         │ created_by(FK) │  │ type              │
                         │ bucket         │  │ meeting_link      │
                         │ priority       │  └───────────────────┘
                         │ resources(JSON)│
                         └───────┬────────┘
                                 │
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
    └─────────────────┘     │ reply_to_id (FK) │     │ linkedin_url    │
                            │ edited_at        │     │ meeting_link    │
                            └──────────────────┘     └─────────────────┘


    ┌──────────────────────┐     ┌──────────────────┐
    │   vault_folders      │     │   vault_items    │
    │──────────────────────│     │──────────────────│
    │ founder_id (FK)      │1──N▶│ folder_id (FK)   │
    │ project_id (FK)      │     │ founder_id (FK)  │
    │ name                 │     │ project_id (FK)  │
    │ drive_folder_id      │     │ item_type        │◄── file/link/note
    │ parent_folder_id(FK) │     │ title            │
    │ folder_type          │◄──  │ description      │
    └──────────────────────┘     │ document_type    │
      root/project/internal/     │ drive_file_id    │
      client_uploads/deliverables│ drive_file_url   │
                                 │ link_url         │
                                 │ note_content     │
                                 │ added_by_type    │◄── founder/team/client
                                 └──────────────────┘


    ┌──────────────────────┐     ┌──────────────────┐
    │  google_integrations │     │  linkedin_posts  │
    │──────────────────────│     │──────────────────│
    │ user_id (FK)         │     │ user_id (FK)     │
    │ access_token         │     │ content          │
    │ refresh_token        │     │ status           │
    │ is_connected         │     │ impressions      │
    │ drive_connected      │     │ engagement_count │
    │ drive_vault_folder_id│     └──────────────────┘
    └──────────────────────┘
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
 PROJECT CREATION → CHAT + VAULT AUTO-SETUP
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  INSERT projects
       │
       ├──▶ createProjectChatRoom() helper
       │      ├──▶ INSERT chat_rooms (type: "project")
       │      └──▶ INSERT chat_room_members
       │           for founder + all team members
       │
       └──▶ POST /api/vault/create-project-folders
              ├──▶ createDriveFolder() → project folder
              ├──▶ createDriveFolder() → Internal Documents
              ├──▶ createDriveFolder() → Client Uploads
              ├──▶ createDriveFolder() → Deliverables
              └──▶ INSERT vault_folders × 4

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 GRANT CLIENT PORTAL ACCESS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  POST /api/create-client-credentials
       │
       ├──▶ supabaseAdmin.auth.admin.createUser()
       │
       ├──▶ INSERT profiles (user_type: "client", full_name: client.name)
       │
       ├──▶ UPDATE clients
       │    portal_user_id, portal_email,
       │    has_portal_access: true
       │
       ├──▶ INSERT chat_room_members
       │    (auto-join project chat room)
       │
       └──▶ INSERT chat_rooms (type: "direct")
            + INSERT chat_room_members × 2
            (founder ↔ client DM created) ✓

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 VAULT FILE UPLOAD
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  User selects file + fills title/description
       │
       ▼
  POST /api/vault/upload-file
       │
       ├──▶ Resolve founder ID
       │    (team members + clients → lookup founder)
       │
       ├──▶ Fetch founder's Google token
       │    (all uploads go to founder's Drive)
       │
       ├──▶ Multipart upload to Google Drive API
       │    → file lands in correct vault subfolder
       │
       └──▶ INSERT vault_items (metadata + drive URLs)
            added_by_type: founder / team / client ✓

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 GOOGLE OAUTH + VAULT INIT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  Founder clicks "Connect Google"
       │
       ▼
  GET /api/auth/google
  → redirect to Google consent screen
  (scopes: calendar.events + drive.file + userinfo)
       │
       ▼
  GET /api/auth/google/callback
       │
       ├──▶ UPSERT google_integrations
       │    (tokens + drive_connected: true)
       │
       └──▶ initializeVaultForFounder()
              ├──▶ createDriveFolder("Vault")
              ├──▶ UPDATE google_integrations
              │    drive_vault_folder_id = vaultFolderId
              └──▶ INSERT vault_folders (type: "root")
```

<br/>

---

## ✦ User Roles & Permissions

```
┌─────────────────────────────────────────────────────────────────┐
│  FOUNDER                                             Full Access │
│  ─────────────────────────────────────────────────────────────  │
│  All modules · All data · Creates team members & clients        │
│  Owns Google Drive vault · Can connect Drive                    │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│  TEAM MEMBER                               Permission-gated      │
│  ─────────────────────────────────────────────────────────────  │
│                                                                  │
│  can_view_tasks         can_perform_tasks   can_create_tasks    │
│  can_view_calendar      can_view_projects   can_create_projects │
│  can_view_linkedin      can_view_vault      can_view_analytics  │
│  can_view_relationships can_access_clients  can_access_inbox    │
│                                                                  │
│  Task permissions:                                               │
│  · View Tasks      → see all workspace tasks, can comment       │
│  · Perform Tasks   → update status only on assigned tasks       │
│  · Manage Tasks    → create, edit, assign all tasks             │
│                                                                  │
│  Vault: reads from founder's Drive, uploads to founder's Drive  │
│  is_active = false  →  signed out on next page load             │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│  CLIENT                                         Portal-scoped    │
│  ─────────────────────────────────────────────────────────────  │
│  Sees own project tasks · Upcoming meetings · Inbox · Calendar  │
│  can_create_tasks (optional, set by founder)                    │
│                                                                  │
│  Vault: sees Client Uploads + Deliverables only                 │
│  Can upload to Client Uploads folder                            │
│  All uploads go to founder's connected Drive                    │
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
- Link tasks to projects (appears in client portal automatically)
- Resources: attach multiple URLs per task
- Inline comments with real-time thread (visible to all with task access)
- Project filter pill-bar across all buckets
- **3-tier permission model:**
  - View Tasks — see all workspace tasks, comment on any
  - Perform Tasks — update status only on tasks assigned to them
  - Manage Tasks — create, edit, delete, and assign any task
- Client-created tasks auto-appear in founder's workspace

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
- **Optimized loading** — N×4 queries reduced to 5 total; `loadRooms` + `loadPeople` run in parallel
- **Paginated messages** — last 20 loaded first, infinite scroll upward (older messages load on demand)
- **Instagram-style UI:**
  - Pill-shaped bubbles, own messages right-aligned in primary color
  - Timestamps always visible below bubble
  - Hover actions: Reply, Reaction (😊), More menu
  - More menu: Copy · Forward · Edit (own) · Unsend (own)
  - "Edited · h:mm a" label shown on edited messages
- **Forward** — pick any room to forward a message into
- **Edit** — prefills input with existing content, updates `edited_at`
- Reply · File attachments → Supabase Storage (`chat_attachment` bucket)
- Image lightbox with download
- Unread badge tracking via `last_read_at`
- **Client portal inbox** — clients can DM founder + team, and see their project room

</details>

<details>
<summary><strong>🤝 Clients</strong></summary>

- Link clients to projects → tasks auto-visible in portal
- Schedule meetings (sets `client_id` on events)
- One-click portal access creation:
  - Creates Supabase auth user via Admin API
  - Sets `full_name` from client record automatically
  - Auto-joins project chat room
  - Creates founder ↔ client DM pre-populated
- Optional: allow client to create tasks
- Client-created tasks assigned to founder's workspace, visible to founder + team with permissions

</details>

<details>
<summary><strong>👥 Team Management</strong></summary>

- Create members with pre-set credentials (no invite email needed)
- 12 granular permission toggles, updated live
- Updated task permission labels: View Tasks · Perform Tasks · Manage Tasks
- Deactivate account: `is_active=false` → signs out on next load
- Hard delete via Admin API
- Team meeting scheduler (individual or joint, adds events for all participants)

</details>

<details>
<summary><strong>🗄️ Vault</strong></summary>

- **Google Drive integration** — all files stored in founder's connected Drive
- On Google OAuth connect → "Vault" root folder auto-created in Drive
- On project creation → project subfolder + 3 default subfolders auto-created:
  - Internal Documents (founder + team only)
  - Client Uploads (clients + team can see)
  - Deliverables (clients + team can see)
- **3 item types:** File Upload · Link · Note
- Every item requires: Title · Description · Document Type
- **Role-scoped access:**
  - Founders/Team: see all folders including Internal Documents
  - Clients: see Client Uploads + Deliverables only, for their project only
- **Team member uploads** use founder's Drive token automatically
- **Client uploads** also route through founder's Drive token
- Search by title and description
- Filter by type: All · File · Link · Note
- Added-by badge: Founder / Team / Client
- Items displayed as cards with document type badge + date

</details>

<details>
<summary><strong>🏢 Client Portal</strong></summary>

- Fully isolated portal at `/client-portal`
- Tabs: Home · Inbox · Calendar · Tasks · Vault · Settings
- **Home** — top 3 priorities (meetings + tasks), execution pipeline, meeting hub
- **Inbox** — DMs with founder + team, project room; can start new DMs
- **Tasks** — full task form matching founder (minus Assign + Link to Project); task comments included
- **Vault** — Client Uploads + Deliverables folders; can upload files/links/notes to Client Uploads
- **Settings** — profile edit + Google Meet connection (Drive setup section hidden)

</details>

<br/>

---

## ✦ Google Integration

```
┌─────────────────────────────────────────────────────────────────┐
│  SCOPES REQUESTED                                               │
│  ─────────────────────────────────────────────────────────────  │
│  calendar.events  →  Create Google Meet links + Calendar events │
│  drive.file       →  Read/write only files created by the app   │
│  userinfo.email   →  Identify the connected account             │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│  VAULT DRIVE STRUCTURE                                          │
│  ─────────────────────────────────────────────────────────────  │
│                                                                  │
│  📁 Vault  (root — created on first OAuth connect)              │
│     └── 📁 Project Name                                         │
│            ├── 📁 Internal Documents                            │
│            ├── 📁 Client Uploads                                │
│            └── 📁 Deliverables                                  │
│                                                                  │
│  All uploads from founders, team members, and clients           │
│  land in the correct Drive subfolder using the founder's token. │
└─────────────────────────────────────────────────────────────────┘
```

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
| File Storage | Google Drive (via `drive.file` scope) |
| Calendar/Meet | Google Calendar API + Google Meet |
| Analytics | Vercel Analytics |

<br/>

---

## ✦ Quick Start

### Prerequisites

- Node.js 18+
- A [Supabase](https://supabase.com) project
- A [Vercel](https://vercel.com) account (optional, for deployment)
- A Google Cloud project with Calendar API + Drive API enabled

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
NEXT_PUBLIC_APP_URL=https://your-app.vercel.app

# Required — SERVER ONLY (never expose to browser)
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Google OAuth (server only)
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
```

> ⚠️ `SUPABASE_SERVICE_ROLE_KEY` is used exclusively in `/api/*` server routes. It bypasses Row Level Security — never include it in client-side code.

### 3. Database

Run the SQL migrations in your Supabase project to create all required tables with RLS policies. Tables needed:

```
profiles · team_members · clients · projects · tasks · task_comments
events · relationships · linkedin_posts
chat_rooms · chat_room_members · chat_messages
team_meetings · team_meeting_participants
google_integrations · vault_folders · vault_items
```

### 4. Storage

Create a **public** storage bucket named `chat_attachment` in your Supabase project.

### 5. Google Cloud Setup

1. Create a project at [console.cloud.google.com](https://console.cloud.google.com)
2. Enable **Google Calendar API** and **Google Drive API**
3. Create OAuth 2.0 credentials (Web application)
4. Add authorized redirect URI: `https://your-app.vercel.app/api/auth/google/callback`
5. Copy Client ID and Client Secret to `.env.local`

### 6. Run

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
| `NEXT_PUBLIC_APP_URL` | Client + Server | Your deployed app URL (used for OAuth redirect) |
| `SUPABASE_SERVICE_ROLE_KEY` | **Server only** | Service role key — bypasses RLS |
| `GOOGLE_CLIENT_ID` | **Server only** | Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | **Server only** | Google OAuth client secret |

<br/>

---

## ✦ Project Structure

```
command-center/
├── app/
│   ├── api/
│   │   ├── auth/
│   │   │   └── google/
│   │   │       ├── route.ts              # OAuth initiation (+ drive.file scope)
│   │   │       └── callback/route.ts     # Token exchange + vault init
│   │   ├── google/
│   │   │   └── disconnect/route.ts       # Disconnect Google account
│   │   ├── vault/
│   │   │   ├── connect/route.ts          # Initialize vault root folder in Drive
│   │   │   ├── create-project-folders/   # Auto-create project subfolders
│   │   │   └── upload-file/route.ts      # Multipart upload to Drive
│   │   ├── create-team-member/           # Admin API: create team user
│   │   ├── create-client-credentials/    # Admin API: create client user
│   │   └── delete-team-member/           # Admin API: delete team user
│   ├── client-portal/                    # Client dashboard
│   ├── login/                            # Auth page
│   ├── team-dashboard/                   # Team member dashboard
│   └── page.tsx                          # Founder dashboard (/)
│
├── components/
│   ├── ui/                               # Shadcn/UI primitives
│   ├── calendar-view.tsx                 # Full calendar (Day/Week/Month)
│   ├── client-home-view.tsx              # Client portal home
│   ├── client-portal-content.tsx         # Client content router
│   ├── client-portal-sidebar.tsx         # Client sidebar nav
│   ├── client-task-view.tsx              # Client task management
│   ├── client-vault-view.tsx             # Client vault (scoped view)
│   ├── clients-view.tsx                  # Client management (founder)
│   ├── crm-view.tsx                      # Relationships CRM
│   ├── dashboard-content.tsx             # Founder content router
│   ├── inbox-view.tsx                    # Real-time chat (all roles)
│   ├── meeting-reminder.tsx              # Background meeting alerts
│   ├── projects-view.tsx                 # Project management
│   ├── settings-view.tsx                 # Settings (isClient prop)
│   ├── task-view.tsx                     # Task kanban
│   ├── team-view.tsx                     # Team management
│   ├── today-view.tsx                    # Founder home dashboard
│   └── vault-view.tsx                    # Vault (founder/team view)
│
├── lib/
│   ├── supabase/
│   │   ├── admin.ts                      # Service role client
│   │   ├── client.ts                     # Browser client (singleton)
│   │   ├── server.ts                     # SSR server client
│   │   └── middleware.ts                 # Session refresh
│   ├── google/
│   │   ├── drive.ts                      # Drive folder creation + vault init
│   │   └── token.ts                      # Token refresh helper
│   └── create-project-room.ts            # Chat room auto-setup helper
│
└── middleware.ts                          # Route protection
```

<br/>

---

## ✦ API Routes

All API routes require authentication and use the **service role key** server-side to perform operations that bypass RLS.

| Route | Method | Auth Required | Description |
|-------|--------|---------------|-------------|
| `/api/create-team-member` | POST | Founder | Creates auth user + profile + team_members row |
| `/api/delete-team-member` | POST | Founder | Deletes team_members row + auth user |
| `/api/create-client-credentials` | POST | Founder / team | Creates auth user + client portal setup + DM + chat room |
| `/api/auth/google` | GET | Any | Initiates Google OAuth (calendar + drive.file scopes) |
| `/api/auth/google/callback` | GET | — | Exchanges code for tokens, auto-inits vault root folder |
| `/api/google/disconnect` | POST | Any | Clears Google tokens from google_integrations |
| `/api/vault/connect` | POST | Founder | Creates Vault root folder in Google Drive |
| `/api/vault/create-project-folders` | POST | Founder / team | Creates project + 3 subfolders in Drive + DB |
| `/api/vault/upload-file` | POST | Any | Multipart upload to founder's Drive, returns file URL |

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
            └─ Founders see their full workspace
            └─ Team members see founder's data (permission-gated)
            └─ Clients see only their project data
            └─ Chat room members can read each other's profiles
               (via shared chat_room_members policy)

Server API routes (service role key)
    └─▶ Bypasses RLS intentionally
    └─▶ Application-level checks first:
            └─ Verifies caller is authenticated
            └─ Resolves founder context for team/client callers
    └─▶ Then performs admin operations
            └─ Create / delete auth users
            └─ Cross-user inserts (DM rooms, vault uploads, etc.)

Google Drive
    └─▶ drive.file scope only (app-created files only)
    └─▶ All uploads authenticated with founder's token
    └─▶ Team members + clients upload via server route
        using founder's stored refresh token
```

<br/>

---

## ✦ RLS Policies Reference (Key Additions)

```sql
-- Profiles: chat room members can see each other
CREATE POLICY "chat_room_members_can_view_each_other_profiles"
ON profiles FOR SELECT
USING (
  id IN (
    SELECT DISTINCT crm2.user_id
    FROM chat_room_members crm1
    JOIN chat_room_members crm2 ON crm1.room_id = crm2.room_id
    WHERE crm1.user_id = auth.uid()
  )
);

-- Tasks: team members with view_tasks see all founder tasks
CREATE POLICY "Team members with view_tasks can see all founder tasks"
ON tasks FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM team_members
    WHERE user_id = auth.uid()
    AND founder_id = tasks.user_id
    AND can_view_tasks = true
    AND is_active = true
  )
);

-- Tasks: clients can create tasks for their project
CREATE POLICY "Clients can create tasks for their project"
ON tasks FOR INSERT
WITH CHECK (
  auth.uid() = created_by AND
  user_id IN (SELECT founder_id FROM clients WHERE portal_user_id = auth.uid())
);

-- Vault: team members can add items
CREATE POLICY "Team members can add vault items"
ON vault_items FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM team_members
    WHERE user_id = auth.uid()
    AND founder_id = vault_items.founder_id
    AND can_view_vault = true
    AND is_active = true
  )
);

-- Vault: clients see only permitted folders
CREATE POLICY "Clients view permitted vault items"
ON vault_items FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM clients c
    JOIN vault_folders vf ON vf.id = vault_items.folder_id
    WHERE c.portal_user_id = auth.uid()
    AND c.project_id = vault_items.project_id
    AND vf.folder_type IN ('client_uploads', 'deliverables')
  )
);
```

<br/>

---

<div align="center">

Built with precision for founders who move fast.

<br/>

**[⬆ Back to top](#)**

</div>
