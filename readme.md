# Founder Control Center - Complete Documentation

## Table of Contents
1. [Overview](#overview)
2. [System Architecture](#system-architecture)
3. [Features & Capabilities](#features--capabilities)
4. [Database Schema](#database-schema)
5. [User Guide](#user-guide)
6. [Technical Stack](#technical-stack)
7. [Setup & Installation](#setup--installation)
8. [Security & Privacy](#security--privacy)

---

## Overview

**Founder Control Center** is a comprehensive productivity and management dashboard designed specifically for founders and entrepreneurs. It serves as your command center for managing all aspects of running a startup - from daily priorities and task execution to relationship management, content creation, and knowledge capture.

### Philosophy
The application is built on the principle that **"the calendar is the source of truth"** - meaning all activities, meetings, and commitments flow through a central calendar system that drives priorities and execution.

### Core Purpose
- **Reduce Mental Load**: Capture decisions, tasks, and relationships in one organized system
- **Increase Execution Velocity**: Focus on what matters today with smart prioritization
- **Build in Public**: Manage LinkedIn content and personal branding effectively
- **Maintain Relationships**: CRM designed for founder-investor-partner dynamics
- **Preserve Knowledge**: Second-brain system for decisions and insights

---

## System Architecture

### Frontend Architecture
- **Framework**: Next.js 16 with App Router
- **Language**: TypeScript
- **Styling**: Tailwind CSS v4 with custom design tokens
- **UI Components**: shadcn/ui component library
- **State Management**: React Hooks with SWR for data fetching
- **Authentication**: Supabase Auth with session management

### Backend Architecture
- **Database**: PostgreSQL (via Supabase)
- **Authentication**: Supabase Auth with Row Level Security (RLS)
- **API**: Next.js Server Actions and Route Handlers
- **Real-time**: Supabase real-time subscriptions (future enhancement)

### Key Design Patterns
- **Server Components**: Default to RSC for data fetching
- **Client Components**: Only for interactive UI elements
- **Optimistic Updates**: Immediate UI feedback with background sync
- **Protected Routes**: Authentication middleware on all app routes

---

## Features & Capabilities

### 1. Home / Today View
The command center dashboard that shows what matters most **today**.

#### Features:
- **Top 3 Priorities**: AI-selected or manually overridden daily focus items
  - Automatically populated from urgent meetings and high-priority tasks
  - Visual emphasis with numbering and progress tracking
  - One-click status updates

- **Engagement & Leads Cards**: Quick metrics display
  - Real-time engagement statistics
  - Active leads counter
  - Performance indicators with percentage changes

- **Quick Actions**: One-click access to common tasks
  - Capture Note
  - Schedule LinkedIn Post
  - Log Follow-up

- **Meetings Hub**: Today's calendar at a glance
  - Chronological meeting list with time formatting
  - Meeting type badges (Internal, Deal, etc.)
  - Quick access to meeting links
  - Participant information from CRM integration

- **Recent Activities**: Activity feed
  - Latest LinkedIn engagements
  - Follow-up reminders
  - System notifications

- **Execution Center**: Active task tracking
  - In-progress tasks with completion percentages
  - Priority badges (Urgent, High, Medium)
  - Visual progress bars
  - Quick navigation to full task view

#### Use Case:
Start every day by checking Today View to understand your priorities, meetings, and active work. Use it as your morning briefing and throughout the day for quick status checks.

---

### 2. Calendar View
Full weekly calendar interface with drag-and-drop scheduling.

#### Features:
- **Week View**: 7-day grid layout
  - All 24 hours visible with scrolling (12:00 AM - 11:00 PM)
  - Hour-based time slots
  - Current time indicator
  - Day/date headers with navigation

- **Event Management**:
  - Create new events with title, time, type
  - Drag events to reschedule (future enhancement)
  - Resize events to adjust duration
  - Color-coded event types
  - Meeting link integration

- **Event Types**:
  - Meetings (default blue)
  - Deals (amber/gold)
  - Internal (gray)
  - Personal (future)

- **Calendar Integration**:
  - Syncs with database-stored events
  - Links to CRM relationships
  - Displays participant details
  - Outcome/notes capture post-meeting

#### Use Case:
Manage all time-based commitments. Schedule investor meetings, team check-ins, and deep work blocks. The calendar becomes your single source of truth for time allocation.

---

### 3. Tasks & Execution
Founder-focused task management with smart categorization.

#### Features:
- **Task Buckets**: Organized task views
  - **Today**: Tasks due today or marked urgent
  - **This Week**: Tasks due within 7 days
  - **Delegated**: Tasks assigned to team members
  - **Backlog**: Future tasks and ideas

- **Task Properties**:
  - Title and description
  - Priority levels (Low, Medium, High, Urgent)
  - Status tracking (Todo, In Progress, Blocked, Completed)
  - Due dates with deadline warnings
  - Assignee (for delegated tasks)
  - Linked relationships (connect tasks to CRM contacts)

- **Task Management**:
  - Quick add from any bucket
  - Check/uncheck to complete
  - Status dropdowns for workflow tracking
  - Priority badges with color coding
  - Overdue notifications

- **Smart Features**:
  - **Smart Nudges**: Alerts for overdue tasks with "Start Now" CTA
  - **Execution Velocity**: Completion rate tracking with visual chart
  - **Search & Filter**: Find tasks by title or priority
  - **This Week Counter**: Badge showing weekly task count

#### Priority Colors:
- **Urgent**: Red background, high visibility
- **High**: Orange/amber
- **Medium**: Blue/default
- **Low**: Gray/muted

#### Use Case:
Manage execution across strategic initiatives. Use "Today" for focused work, "Delegated" to track team accountability, and "Backlog" for strategic planning. The execution velocity tracker keeps you honest about completion rates.

---

### 4. LinkedIn Content
Personal branding hub for founders building in public.

#### Features:
- **Analytics Dashboard**: Four key metrics
  - **Profile Visits**: Track profile discovery
  - **Post Impressions**: Measure content reach
  - **Engagements**: Monitor likes, comments, shares
  - **New Leads**: Track inbound interest

- **Content Editor**:
  - **Editor Tab**: Full-featured text editor
  - **Formatting Preview Tab**: See how posts will look
  - Draft saving (auto-save every 30 seconds)
  - Character counter
  - Estimated read time

- **Content Inbox**: Draft management
  - **0 Drafts** indicator when empty
  - List view of all saved drafts
  - Quick edit and schedule from list

- **Smart Reminders**: Engagement prompts
  - "Reply to 12 comments on latest post"
  - "New DMs from 3 potential leads"
  - Clickable reminders that open relevant content

- **Scheduling**:
  - **Save to Inbox**: Save draft for later
  - **Schedule**: Pick date/time for auto-publish
  - Timezone-aware scheduling
  - Confirmation notifications

#### Use Case:
Build your founder brand consistently. Draft posts in batches, schedule throughout the week, and monitor engagement. Use analytics to understand what content resonates with your audience.

---

### 5. Relationships (CRM)
Founder-focused CRM for managing your network.

#### Features:
- **Relationship Types**:
  - **Lead**: Potential customers or partners
  - **Client**: Active customers
  - **Investor**: Current and prospective investors
  - **Partner**: Strategic partners and collaborators
  - **Talent**: Potential hires and advisors

- **Contact Management**:
  - Full name, company, role
  - LinkedIn profile URL
  - Default meeting link (Zoom, Google Meet, etc.)
  - Tags (follow-up, urgent, hot-lead, etc.)
  - Custom fields for context

- **Meeting Integration**:
  - **Schedule Meeting**: One-click meeting creation
  - Auto-populates calendar with relationship context
  - Shows "Next Meeting" in relationship cards
  - Meeting purpose and type tracking

- **Follow-up System**:
  - **Last Contact** timestamp
  - **Tags** for priority (follow-up, urgent)
  - Visual indicators for overdue follow-ups
  - Quick meeting scheduling from relationship card

- **Pipeline Views**:
  - Filter by relationship type
  - Search by name or company
  - Sort by last contact date
  - Active/Archived status management

- **Post-Meeting Actions**:
  - **Log Outcome**: Capture meeting notes and next steps
  - Link outcomes to relationship history
  - Create follow-up tasks automatically

#### Use Case:
Never lose track of important relationships. Track investor conversations, manage customer pipelines, and ensure timely follow-ups. The calendar integration means every meeting has context, and every relationship has a clear next action.

---

### 6. Knowledge Vault
Second-brain system for decisions and insights.

#### Features:
- **Note Types**:
  - **Regular Notes**: General knowledge capture
  - **Decision Log**: Strategic decisions with context

- **Note Properties**:
  - Title and rich text content
  - Tags for organization
  - Creation timestamp
  - Decision impact level (High, Medium, Low)
  - Searchable content

- **Note Management**:
  - **Capture Note**: Quick note creation
  - **Decision Log**: Specific decision tracking
  - Edit existing notes
  - Delete notes
  - Tag-based organization

- **Search & Discovery**:
  - Full-text search across titles and content
  - Filter by tags (future enhancement)
  - Sort by creation date
  - Grid and list views

- **Decision Log Sidebar**:
  - Chronological decision history
  - Impact level badges
  - Quick access to decision context
  - "Why was this decided?" reference

- **Knowledge Stats**:
  - Total knowledge points counter
  - Visual health indicators
  - Usage analytics

#### Decision Log Use Case:
Capture **why** decisions were made, not just what was decided. Six months later, when questioning a strategic choice, your vault has the context: market conditions, alternatives considered, and rationale.

#### Note Use Case:
Brain dump meeting insights, product ideas, customer feedback, and learnings. Build your personal knowledge base that grows more valuable over time.

---

### 7. Team Management
Workspace collaboration features (future expansion).

#### Planned Features:
- Team member profiles
- Role-based permissions
- Shared calendars
- Task delegation
- Communication tools

---

### 8. Financials
Financial dashboard for founders (future expansion).

#### Planned Features:
- Revenue tracking
- Expense management
- Runway calculator
- Investor reporting
- Metrics dashboard (MRR, ARR, CAC, LTV)

---

### 9. Settings
User preferences and account management.

#### Current Features:
- **Theme Toggle**: Light/Dark mode switcher
- **Profile Management**:
  - View email (read-only)
  - Edit full name
  - Profile picture upload (future)

- **Account Settings**:
  - Password change (via Supabase Auth)
  - Email change (via Supabase Auth)
  - Account deletion (future)

#### Future Settings:
- Notification preferences
- Integration management (calendar sync, LinkedIn API)
- Timezone settings
- Language preferences
- Data export

---

## Database Schema

### Tables Overview

#### 1. `profiles`
User profile information and preferences.

```sql
- id (uuid, PK): Links to auth.users
- email (text): User's email address
- full_name (text): Display name
- avatar_url (text): Profile picture URL
- linkedin_token (text): OAuth token for LinkedIn integration
- updated_at (timestamp): Last profile update
```

**Policies**: Users can view and update their own profile only.

---

#### 2. `tasks`
Task management and execution tracking.

```sql
- id (uuid, PK): Unique task identifier
- user_id (uuid, FK): Owner of the task
- title (text): Task description
- bucket (text): Category (Today, This Week, Delegated, Backlog)
- is_completed (boolean): Completion status
- priority (text): Urgency level (Low, Medium, High, Urgent)
- due_date (timestamp): Deadline
- status (text): Workflow state (Todo, In Progress, Blocked, Completed)
- assignee (text): Person responsible
- linked (text): Connected relationship or project
- created_at (timestamp): Creation date
```

**Policies**: Users can manage their own tasks only.

---

#### 3. `events`
Calendar events and meetings.

```sql
- id (uuid, PK): Unique event identifier
- user_id (uuid, FK): Event owner
- title (text): Event name
- description (text): Event details
- start_time (timestamp): Start date/time
- end_time (timestamp): End date/time
- type (text): Event category (Meeting, Deal, Internal)
- meeting_link (text): Video call URL
- purpose (text): Meeting objective
- relationship_id (uuid, FK): Linked CRM contact
- outcome (text): Post-meeting notes
- created_at (timestamp): Creation date
```

**Policies**: Users can manage their own events only.

**Relationships**: Links to `relationships` table for participant info.

---

#### 4. `linkedin_posts`
LinkedIn content drafts and scheduled posts.

```sql
- id (uuid, PK): Unique post identifier
- user_id (uuid, FK): Author
- content (text): Post text
- status (text): Draft, Scheduled, or Published
- scheduled_for (timestamp): Publication time
- published_at (timestamp): Actual publish time
- created_at (timestamp): Draft creation date
```

**Policies**: Users can manage their own posts only.

---

#### 5. `relationships`
CRM contact database.

```sql
- id (uuid, PK): Unique relationship identifier
- user_id (uuid, FK): Relationship owner
- full_name (text): Contact name
- company (text): Contact's company
- role (text): Contact's position
- relationship_type (text): Lead, Client, Investor, Partner, Talent
- linkedin_profile_url (text): LinkedIn URL
- meeting_link (text): Default meeting URL for this contact
- status (text): Active or Archived
- tags (text[]): Labels for organization (follow-up, urgent, etc.)
- created_at (timestamp): First contact date
- updated_at (timestamp): Last modification
```

**Policies**: Users can manage their own relationships only.

---

#### 6. `vault_notes`
Knowledge capture and decision logging.

```sql
- id (uuid, PK): Unique note identifier
- user_id (uuid, FK): Note author
- title (text): Note headline
- content (text): Full note text
- tags (text[]): Organization labels
- is_decision (boolean): Decision log flag
- created_at (timestamp): Capture date
```

**Policies**: Users can manage their own notes only.

---

### Row Level Security (RLS)

All tables implement RLS policies that ensure:
- Users can only view their own data
- Users can only modify their own data
- No cross-user data access
- Authentication required for all operations

---

## User Guide

### Getting Started

#### 1. Account Creation
1. Navigate to the login page
2. Click "Sign up" 
3. Enter email and password
4. Verify email (Supabase sends confirmation)
5. Complete profile setup

#### 2. First-Time Setup
1. Go to **Settings** → Update your full name
2. Navigate to **Calendar** → Add your first meeting
3. Go to **Tasks** → Create 3 priorities for today
4. Visit **Relationships** → Add your first contact
5. Check **LinkedIn** → Draft your first post
6. Open **Vault** → Capture your first note

---

### Daily Workflow

#### Morning Routine (5 minutes)
1. **Open Today View**
2. Review Top 3 Priorities
3. Check Meetings Hub for today's schedule
4. Scan Execution Center for active tasks
5. Note any urgent follow-ups in Recent Activities

#### Throughout the Day
- **Complete tasks** as you work (check them off)
- **Log meeting outcomes** immediately after calls
- **Capture notes** when insights strike
- **Update task status** (In Progress → Completed)
- **Schedule follow-ups** from conversations

#### End of Day (5 minutes)
1. Mark completed tasks as done
2. Move incomplete tasks to appropriate buckets
3. Log any decisions made today in Vault
4. Schedule tomorrow's priorities
5. Draft LinkedIn content if applicable

---

### Best Practices

#### Task Management
- **Today bucket**: Only 3-5 highest-priority items
- **This Week**: Strategic work that moves the needle
- **Delegated**: Check daily for accountability
- **Backlog**: Weekly review and grooming

#### CRM Usage
- **Log every meeting** the same day it happens
- **Add tags** immediately (follow-up, urgent, hot-lead)
- **Schedule next meeting** before ending current one
- **Use relationship types** to segment your network

#### LinkedIn Strategy
- **Batch content creation**: Draft 5 posts at once
- **Schedule consistently**: 3-5x per week
- **Engage first**: Spend 15 min on others' content before posting
- **Track metrics**: Review analytics weekly

#### Knowledge Capture
- **Decision logs**: Capture the "why" not just the "what"
- **Tag everything**: Makes search exponentially better
- **Weekly reviews**: Read old notes for insights
- **Brain dump**: Don't overthink note formatting

---

## Technical Stack

### Core Technologies
- **Next.js 16**: React framework with App Router
- **React 19.2**: UI library with latest features
- **TypeScript 5.x**: Type safety and developer experience
- **Tailwind CSS v4**: Utility-first styling with design tokens
- **Supabase**: Backend-as-a-Service (PostgreSQL + Auth)

### UI & Components
- **shadcn/ui**: Accessible component library
- **Radix UI**: Headless component primitives
- **Lucide React**: Icon library
- **Sonner**: Toast notifications
- **date-fns**: Date manipulation and formatting

### Data & State
- **SWR**: Client-side data fetching and caching
- **React Hooks**: State management (useState, useEffect)
- **Supabase Client**: Real-time database client

### Development Tools
- **ESLint**: Code linting
- **Prettier**: Code formatting (implied)
- **Vercel**: Deployment platform
- **Git**: Version control

---

## Setup & Installation

### Prerequisites
- Node.js 18+ installed
- Supabase account
- Git (for version control)
- Vercel account (for deployment)

### Local Development

#### 1. Clone Repository
```bash
git clone <repository-url>
cd founder-control-center
```

#### 2. Install Dependencies
```bash
npm install
# or
yarn install
# or
pnpm install
```

#### 3. Environment Variables
Create `.env.local` in project root:

```env
# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=your-project-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key

# Optional: Redirect URL for development
NEXT_PUBLIC_DEV_SUPABASE_REDIRECT_URL=http://localhost:3000
```

Get these values from your Supabase project settings.

#### 4. Database Setup
```bash
# Run the initial schema script in Supabase SQL Editor
# File: scripts/001_initial_schema.sql
```

This creates all tables, policies, and triggers.

#### 5. Start Development Server
```bash
npm run dev
```

Navigate to `http://localhost:3000`

---

### Production Deployment

#### Deploy to Vercel
1. Push code to GitHub repository
2. Connect repository to Vercel
3. Add environment variables in Vercel dashboard
4. Deploy

Vercel auto-detects Next.js and configures build settings.

---

## Security & Privacy

### Authentication
- **Supabase Auth**: Industry-standard JWT-based auth
- **Password Requirements**: Minimum 8 characters (configurable)
- **Email Verification**: Required for new accounts
- **Session Management**: HTTP-only cookies for security

### Data Protection
- **Row Level Security**: Database-level access control
- **User Isolation**: Zero cross-user data visibility
- **Encrypted Storage**: Supabase encrypts data at rest
- **HTTPS Only**: All connections encrypted in transit

### Privacy Principles
- **Data Ownership**: Users own all their data
- **No Data Selling**: Your data is never sold or shared
- **Export Capability**: Export all data (future feature)
- **Account Deletion**: Permanent data deletion on request

### Best Practices
- **Use Strong Passwords**: Unique password for this application
- **Enable 2FA**: Supabase supports TOTP (future integration)
- **Regular Backups**: Supabase handles automated backups
- **Access Logging**: Monitor sign-in activity (future feature)

---

## Future Roadmap

### Phase 2: Enhanced Features
- [ ] Drag-and-drop calendar rescheduling
- [ ] LinkedIn API integration for auto-posting
- [ ] Email integration (Gmail, Outlook)
- [ ] Mobile app (React Native)
- [ ] Browser extension for quick capture

### Phase 3: Team Collaboration
- [ ] Multi-user workspaces
- [ ] Shared calendars and tasks
- [ ] Comments and mentions
- [ ] Activity feeds
- [ ] Role-based permissions

### Phase 4: Intelligence Layer
- [ ] AI-powered priority suggestions
- [ ] Smart meeting summaries (transcription + notes)
- [ ] Automated follow-up reminders
- [ ] Content generation assistance
- [ ] Relationship insights

### Phase 5: Integrations
- [ ] Slack integration
- [ ] Linear/Jira sync
- [ ] Stripe financial integration
- [ ] Google Calendar 2-way sync
- [ ] Notion knowledge base sync

---

## Support & Contribution

### Getting Help
- **Documentation**: You're reading it!
- **GitHub Issues**: Report bugs and request features
- **Email Support**: [support email] (configure later)

### Contributing
Contributions welcome! Please:
1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request with clear description

---

## License

[Add your license here - MIT, Apache 2.0, etc.]

---

## Version History

### v1.0.0 (Current)
- Initial release
- Core features: Calendar, Tasks, CRM, LinkedIn, Vault
- Supabase authentication and database
- Dark mode support
- Responsive design

---

**Built for founders, by founders. Execute with clarity.**
