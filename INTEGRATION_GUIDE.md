# Founder Kobin Ai - Integration & Customization Guide

## Table of Contents
1. [Project Overview](#project-overview)
2. [Database Schema](#database-schema)
3. [How to Update Components](#how-to-update-components)
4. [LinkedIn Integration](#linkedin-integration)
5. [Google Calendar Integration](#google-calendar-integration)
6. [Authentication](#authentication)
7. [Debugging](#debugging)

---

## Project Overview

The Founder Kobin Ai is a comprehensive dashboard for founders to manage:
- **Tasks** - Organize work by buckets (Today, This Week, Delegated, Backlog)
- **Calendar** - Schedule and manage events
- **LinkedIn** - Draft and schedule posts
- **Relationships (CRM)** - Track business relationships
- **Vault** - Store notes and decisions
- **Home (Today)** - Overview of key metrics

### Tech Stack
- **Frontend**: Next.js 16 (App Router) with React 19
- **Database**: Supabase PostgreSQL
- **Authentication**: Supabase Auth
- **UI Components**: shadcn/ui with Tailwind CSS

---

## Database Schema

### Tables Overview

#### 1. **profiles** (User Data)
Stores user account information synced from Supabase Auth.
\`\`\`sql
- id (UUID) - Primary key, references auth.users
- email (text) - User's email
- full_name (text) - User's full name (displayed in sidebar)
- avatar_url (text) - Profile picture URL
- linkedin_token (text) - OAuth token for LinkedIn (encrypted)
- updated_at (timestamp) - Last update time
\`\`\`

#### 2. **tasks**
Stores user's tasks organized by buckets.
\`\`\`sql
- id (UUID) - Primary key
- user_id (UUID) - Links to profiles
- title (text) - Task description
- bucket (text) - One of: 'Today', 'This Week', 'Delegated', 'Backlog'
- is_completed (boolean) - Task status
- priority (text) - 'Low', 'Medium', 'High'
- due_date (timestamp) - Optional due date
- created_at (timestamp) - Creation time
\`\`\`

#### 3. **events**
Stores calendar events (NOT `calendar_events`).
\`\`\`sql
- id (UUID) - Primary key
- user_id (UUID) - Links to profiles
- title (text) - Event name
- description (text) - Event details
- start_time (timestamp) - Event start
- end_time (timestamp) - Event end
- type (text) - 'Meeting', 'Call', 'Deal', etc.
- created_at (timestamp) - Creation time
\`\`\`

#### 4. **linkedin_posts**
Stores LinkedIn content drafts and posts.
\`\`\`sql
- id (UUID) - Primary key
- user_id (UUID) - Links to profiles
- content (text) - Post content
- status (text) - 'Draft', 'Scheduled', 'Published'
- scheduled_for (timestamp) - When to publish
- published_at (timestamp) - When it was published
- created_at (timestamp) - Creation time
\`\`\`

#### 5. **relationships**
CRM table for tracking business contacts.
\`\`\`sql
- id (UUID) - Primary key
- user_id (UUID) - Links to profiles
- name (text) - Contact name
- company (text) - Company name
- status (text) - 'New', 'Conversation', 'Proposal', 'Closed'
- last_contact (timestamp) - Last interaction
- created_at (timestamp) - Creation time
\`\`\`

#### 6. **vault_notes**
Stores personal notes and decisions.
\`\`\`sql
- id (UUID) - Primary key
- user_id (UUID) - Links to profiles
- title (text) - Note title
- content (text) - Note content
- tags (text[]) - Array of tags
- is_decision (boolean) - Whether it's a decision log
- created_at (timestamp) - Creation time
\`\`\`

### Row Level Security (RLS)
All tables have RLS enabled. Users can only access their own data:
\`\`\`sql
-- Example policy
CREATE POLICY "Users can manage own tasks" ON tasks 
  FOR ALL USING (auth.uid() = user_id);
\`\`\`

---

## How to Update Components

### File Structure
\`\`\`
app/
  page.tsx              # Main dashboard (protected)
  login/
    page.tsx            # Login/signup page
  api/
    auth/
      callback/         # Email confirmation handler
        route.ts

components/
  dashboard-sidebar.tsx # Left sidebar with navigation
  dashboard-content.tsx # Main content area router
  header.tsx            # Top header with user name
  today-view.tsx        # Home dashboard overview
  task-view.tsx         # Tasks management
  calendar-view.tsx     # Calendar events
  linkedin-view.tsx     # LinkedIn drafts
  crm-view.tsx          # Relationships (CRM)
  vault-view.tsx        # Notes & decisions
  login-form.tsx        # Authentication form

lib/
  supabase/
    client.ts           # Browser client
    server.ts           # Server-side client
    middleware.ts       # Auth middleware
\`\`\`

### Example: Adding a New Data Field to a Component

**Scenario**: Add a "location" field to calendar events.

1. **Update Database Schema** (run in Supabase SQL editor):
\`\`\`sql
ALTER TABLE public.events ADD COLUMN location text;
\`\`\`

2. **Update the component** (`components/calendar-view.tsx`):
\`\`\`tsx
// Add to the newEvent state
const [newEvent, setNewEvent] = useState({
  title: "",
  date: format(new Date(), "yyyy-MM-dd"),
  startTime: "09:00",
  endTime: "10:00",
  type: "internal",
  location: "", // NEW FIELD
})

// Add to the dialog form
<div className="grid gap-2">
  <Label htmlFor="location">Location</Label>
  <Input
    id="location"
    value={newEvent.location}
    onChange={(e) => setNewEvent({ ...newEvent, location: e.target.value })}
    placeholder="Room or URL"
  />
</div>

// Add to the insert query
const { error } = await supabase.from("events").insert({
  user_id: user.id,
  title: newEvent.title,
  start_time: start.toISOString(),
  end_time: end.toISOString(),
  type: newEvent.type,
  location: newEvent.location, // NEW FIELD
})
\`\`\`

3. **Display the field** in the calendar event:
\`\`\`tsx
<div className="truncate font-bold">{event.title}</div>
<div className="text-[9px]">{event.location}</div>
\`\`\`

### Example: Adding a New Component

**Scenario**: Create a new "Notes" view.

1. **Create component file** (`components/notes-view.tsx`):
\`\`\`tsx
"use client"
import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"

export function NotesView() {
  const [notes, setNotes] = useState<any[]>([])
  const supabase = createClient()

  useEffect(() => {
    const fetchNotes = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data, error } = await supabase
        .from("vault_notes")
        .select("*")
        .eq("user_id", user.id)

      if (!error) setNotes(data || [])
    }

    fetchNotes()
  }, [supabase])

  return (
    <div>
      <h2 className="text-2xl font-bold">Notes</h2>
      {notes.map((note) => (
        <div key={note.id} className="p-4 border rounded">
          <h3>{note.title}</h3>
          <p>{note.content}</p>
        </div>
      ))}
    </div>
  )
}
\`\`\`

2. **Import in dashboard content** (`components/dashboard-content.tsx`):
\`\`\`tsx
import { NotesView } from "@/components/notes-view"

export function DashboardContent({ activeTab }: { activeTab: string }) {
  return (
    <div>
      {activeTab === "Notes" && <NotesView />}
    </div>
  )
}
\`\`\`

3. **Add to sidebar** (`components/dashboard-sidebar.tsx`):
\`\`\`tsx
const mainNav = [
  { title: "Home", icon: Home },
  { title: "Calendar", icon: Calendar },
  { title: "Tasks", icon: CheckSquare },
  { title: "Notes", icon: FileText }, // NEW
  // ...
]
\`\`\`

---

## LinkedIn Integration

### Overview
LinkedIn integration requires OAuth authentication to allow users to:
- Post content to their LinkedIn timeline
- Schedule posts for later
- Track engagement

### Setup Steps

1. **Create LinkedIn App**
   - Go to [LinkedIn Developers](https://www.linkedin.com/developers/apps)
   - Create a new app
   - Get your **Client ID** and **Client Secret**
   - Set Authorized redirect URI to: `https://yourdomain.com/api/auth/linkedin/callback`

2. **Store Credentials in Supabase**
   - Add to your environment variables (not in code):
   \`\`\`
   NEXT_PUBLIC_LINKEDIN_CLIENT_ID=your_client_id
   LINKEDIN_CLIENT_SECRET=your_client_secret
   \`\`\`

3. **Create API Route for LinkedIn OAuth** (`app/api/auth/linkedin/callback/route.ts`):
\`\`\`tsx
import { createClient } from "@/lib/supabase/server"
import { NextRequest, NextResponse } from "next/server"

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code")
  const supabase = createClient()

  if (!code) {
    return NextResponse.redirect(new URL("/login", request.url))
  }

  // Exchange code for token
  const tokenResponse = await fetch("https://www.linkedin.com/oauth/v2/accessToken", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      client_id: process.env.NEXT_PUBLIC_LINKEDIN_CLIENT_ID!,
      client_secret: process.env.LINKEDIN_CLIENT_SECRET!,
      redirect_uri: `${request.nextUrl.origin}/api/auth/linkedin/callback`,
    }),
  })

  const { access_token } = await tokenResponse.json()

  // Save token to user profile
  const { data: { user } } = await supabase.auth.getUser()
  if (user) {
    await supabase
      .from("profiles")
      .update({ linkedin_token: access_token })
      .eq("id", user.id)
  }

  return NextResponse.redirect(new URL("/", request.url))
}
\`\`\`

4. **Add LinkedIn Login Button** (in login form):
\`\`\`tsx
<Button
  variant="outline"
  className="w-full bg-transparent"
  onClick={() => {
    window.location.href = `https://www.linkedin.com/oauth/v2/authorization?response_type=code&client_id=${process.env.NEXT_PUBLIC_LINKEDIN_CLIENT_ID}&redirect_uri=${window.location.origin}/api/auth/linkedin/callback&scope=w_member_social`
  }}
>
  Connect LinkedIn
</Button>
\`\`\`

5. **Use LinkedIn Token in linkedin-view.tsx**:
\`\`\`tsx
const postToLinkedIn = async (content: string) => {
  const { data: { user } } = await supabase.auth.getUser()
  const { data: profile } = await supabase
    .from("profiles")
    .select("linkedin_token")
    .eq("id", user?.id)
    .single()

  if (!profile?.linkedin_token) {
    toast.error("LinkedIn not connected")
    return
  }

  const response = await fetch("https://api.linkedin.com/v2/posts", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${profile.linkedin_token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      content: { text: content },
    }),
  })
}
\`\`\`

---

## Google Calendar Integration

### Overview
Integrate Google Calendar to:
- Sync events from Google Calendar
- Create events in both calendars
- Show availability

### Setup Steps

1. **Create Google OAuth App**
   - Go to [Google Cloud Console](https://console.cloud.google.com)
   - Create a new project
   - Enable Google Calendar API
   - Create OAuth 2.0 credentials (Web application)
   - Add redirect URI: `https://yourdomain.com/api/auth/google/callback`

2. **Store Credentials**
   \`\`\`
   NEXT_PUBLIC_GOOGLE_CLIENT_ID=your_client_id
   GOOGLE_CLIENT_SECRET=your_client_secret
   \`\`\`

3. **Create API Route for Google OAuth** (`app/api/auth/google/callback/route.ts`):
\`\`\`tsx
import { createClient } from "@/lib/supabase/server"
import { NextRequest, NextResponse } from "next/server"

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code")
  const supabase = createClient()

  if (!code) {
    return NextResponse.redirect(new URL("/login", request.url))
  }

  // Exchange code for token
  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      client_id: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      redirect_uri: `${request.nextUrl.origin}/api/auth/google/callback`,
    }),
  })

  const { access_token } = await tokenResponse.json()

  // Save token to user profile
  const { data: { user } } = await supabase.auth.getUser()
  if (user) {
    await supabase
      .from("profiles")
      .update({ google_calendar_token: access_token })
      .eq("id", user.id)
  }

  return NextResponse.redirect(new URL("/", request.url))
}
\`\`\`

4. **Fetch Google Calendar Events**:
\`\`\`tsx
const syncGoogleCalendarEvents = async () => {
  const { data: { user } } = await supabase.auth.getUser()
  const { data: profile } = await supabase
    .from("profiles")
    .select("google_calendar_token")
    .eq("id", user?.id)
    .single()

  if (!profile?.google_calendar_token) {
    toast.error("Google Calendar not connected")
    return
  }

  const response = await fetch("https://www.googleapis.com/calendar/v3/calendars/primary/events", {
    headers: {
      Authorization: `Bearer ${profile.google_calendar_token}`,
    },
  })

  const data = await response.json()
  
  // Sync events to local database
  for (const event of data.items) {
    await supabase.from("events").insert({
      user_id: user?.id,
      title: event.summary,
      start_time: event.start.dateTime,
      end_time: event.end.dateTime,
      type: "Google Calendar",
    })
  }
}
\`\`\`

5. **Add sync button in calendar**:
\`\`\`tsx
<Button onClick={syncGoogleCalendarEvents}>
  Sync Google Calendar
</Button>
\`\`\`

---

## Authentication

### User Signup Flow
1. User enters email, password, and full name
2. Supabase Auth creates auth user
3. Trigger creates profile record with user data
4. User is auto-signed in and redirected to dashboard

### User Data Flow
- **Headers display**: User name fetched from `profiles.full_name`
- **Sidebar display**: User initials and name from `profiles.full_name`
- **RLS policies**: Ensures users only see their own data

### Disabling Email Confirmation (for development)
In Supabase Dashboard:
1. Go to **Authentication → Providers → Email**
2. Toggle OFF **"Confirm email"**
3. Users can now sign up and sign in immediately

---

## Debugging

### Common Issues & Solutions

**Issue**: "Could not find the table 'public.X'" error
- **Cause**: Table name mismatch in component
- **Fix**: Check component queries match your table names
- **Example**: Calendar component uses `events` not `calendar_events`

**Issue**: Demo data showing instead of real user data
- **Cause**: Component uses hardcoded demo data
- **Fix**: Fetch from Supabase with `supabase.auth.getUser()` and the user's tables
- **Example**: See dashboard-sidebar.tsx for fetching real user name

**Issue**: User name not updating in sidebar
- **Cause**: Component not re-fetching when user changes
- **Fix**: Add dependency to useEffect or refetch on profile update
- **Solution**: Use `useEffect` with proper dependencies

### Debug Logging
The app includes debug logs using `console.log("[v0] ...")` patterns.
Check browser console (F12) for logs showing:
- Authentication status
- Data fetching
- Component errors
- User interactions

---

## Best Practices

1. **Always use RLS policies** - Never expose user data across boundaries
2. **Fetch user from auth first** - Use `supabase.auth.getUser()` before database queries
3. **Handle loading states** - Show loading indicator while fetching data
4. **Error handling** - Always catch and log errors for debugging
5. **Type safety** - Define TypeScript interfaces for database queries
6. **Environment variables** - Use `.env.local` for sensitive data (not committed to git)

---

## Resources

- [Supabase Documentation](https://supabase.com/docs)
- [Next.js Documentation](https://nextjs.org/docs)
- [LinkedIn Developers](https://www.linkedin.com/developers)
- [Google Calendar API](https://developers.google.com/calendar)
- [shadcn/ui Components](https://ui.shadcn.com)
