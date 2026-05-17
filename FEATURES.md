# Founder Assistant - Complete Feature List

This document provides a comprehensive breakdown of all features in the Founder Assistant application.

---

## 1. Authentication & User Management
- **Google OAuth Login**: Sign in with Google account
- **User Type System**: founder, team_member, client
- **Profile Management**: Full name storage and retrieval
- **Authentication Timeout**: 8-second timeout with error handling
- **Automatic Redirect**: Redirects to login page for unauthenticated users
- **Team Member Routing**: Team members redirected to separate dashboard at `/team-dashboard`

---

## 2. Dashboard (Home / Today View)
- **Time-Based Greeting**: "Good morning/afternoon/evening" based on current hour
- **Live Clock**: Real-time clock display with date (e.g., "Thu, 2 April 2026")
- **Pulse Cards Section**:
  - Tasks due today with overdue count
  - Meetings today with next meeting countdown
  - Pipeline value in thousands (e.g., "$150k")
  - Stale contacts (14+ days inactive)
- **Action Items**: Tasks requiring immediate attention with urgency indicators (overdue/today/soon)
- **Today's Meetings**: List of scheduled meetings with join buttons for Google Meet
- **Pipeline Snapshot**: Visual bar chart of deal stages (New Lead, Contacted, Meeting Booked, Proposal, Negotiating)
- **Follow Up Needed**: Contacts not moved in 14+ days with color-coded urgency (21d=red, 14d=orange, 14d+=gray)
- **Quick Actions**: Buttons to navigate to Add Task, Schedule Meeting, Add Contact, Log Note

---

## 3. Task Management

### Task Organization
- **Buckets**: today, this-week, delegated, backlog
- **Priority Levels**: urgent (red #E24B4A), high (orange #EF9F27), medium (gray #888780), low (light gray #B4B2A9)
- **Status Types**: todo, in-progress, blocked, completed

### Task Creation & Editing
- **Task Form Fields**: Title, notes, resources (external links), priority, status, deadline, assignee, project
- **Team Assignment**: Assign tasks to team members
- **Project Linking**: Link tasks to projects
- **Deliverables**: Mark tasks as requiring deliverables (file/link) to complete
- **Vault Attachments**: Attach existing vault files to tasks

### Task Display
- **Due Date Pills**: Visual indicators showing Overdue, Today, Soon, or specific date
- **Priority Dots**: Color-coded priority indicators
- **Status Badges**: Color-coded status badges (completed=green, in-progress=blue, blocked=red, todo=gray)
- **Comment Count**: Show number of comments on each task

### Task Comments
- **Inline Comments**: Add comments directly on tasks
- **User Avatars**: Display commenter initials
- **Comment Display**: Show commenter name and timestamp
- **Delete Comments**: Remove own comments

### Task Analytics Bar
- **Completion Rate**: Percentage of completed tasks
- **Volume Stats**: Tasks created vs completed this week
- **Overdue Tasks**: Clickable list of overdue tasks with days overdue
- **Blocked Tasks**: Count of blocked tasks
- **Status Distribution**: Visual bar showing todo/in-progress/completed/blocked breakdown
- **Team Workload**: Visual bar chart of tasks assigned per team member
- **Priority Breakdown**: Count of tasks per priority level

### Task Actions
- **Complete Task**: Toggle task completion with checkbox
- **Quick Status Change**: Click status badges to change status
- **Edit Task**: Open edit dialog with all fields
- **Delete Task**: Remove tasks with confirmation
- **Filter & Search**: Search by title, filter by project, filter by priority

---

## 4. Calendar

### Views
- **Week View**: 7-day grid with hourly time slots
- **Month View**: Monthly calendar grid
- **Day View**: Single day detailed view

### Event Features
- **Event Types**: internal (blue), deal (green), hiring (violet)
- **Current Time Indicator**: Red line showing current time position
- **Event Chips**: Color-coded event cards with title and time
- **Event Details**: View full event info on click

### Event Management
- **Create Event**: Dialog with title, date/time, type, meeting link, purpose
- **Click to Schedule**: Click on empty time slots to create new events
- **Google Meet Integration**: One-click join buttons for events with meeting links

---

## 5. Projects

### Project Properties
- **Status Options**: active, on-hold, completed, archived
- **Priority Levels**: low, medium, high, urgent
- **Date Management**: Start date and end date
- **Description**: Optional project description

### Project Features
- **CRUD Operations**: Create, read, update, delete projects
- **Task Association**: View and manage tasks per project
- **Project Chat Room**: Auto-created inbox room for each project
- **Filtering**: Filter tasks by project in task view
- **Task Progress**: Show completed vs total tasks count

---

## 6. LinkedIn Integration

### Post Management
- **Drafts**: Create and save post drafts
- **Content Editor**: Text area for post content
- **Publish**: Publish drafts to LinkedIn
- **Post List**: View all published posts

### Analytics Dashboard
- **Post Impressions**: Total impressions for published posts
- **Engagement Count**: Total likes, comments, shares
- **New Leads**: Count of leads from last 30 days

---

## 7. CRM (Relationships)

### Contact Management
- **Contact Types**: lead, investor, partner, talent
- **Contact Fields**: Name, email, company, role, LinkedIn URL, status, tags

### Pipeline System
- **Stages**: new_lead (gray), contacted (blue), meeting_booked (purple), proposal (orange), negotiating (red), closed_won (green), closed_lost (gray)
- **Stage Tracking**: Track when contact entered each stage
- **Deal Value**: Track potential deal amounts
- **Close Probability**: Percentage probability of closing
- **Expected Close Date**: Forecast closing date
- **Pipeline Notes**: Internal notes per contact

### Views
- **List View**: Table with pagination (12 per page)
- **Kanban/Pipeline View**: Visual drag-and-drop board
- **Search & Filter**: Search by name/company, filter by type

### Meeting Features
- **Schedule Meeting**: Create meetings directly with contacts
- **Upcoming Meetings**: Show next scheduled meeting per contact
- **Meeting Dialog**: Form with title, date, time, meeting link, purpose

### Import Features
- **CSV Import**: Import leads from CSV files
- **Import History**: Track imported files, rows imported, rows skipped
- **Leads Import Dialog**: UI for selecting and importing CSV files

---

## 8. Team Management

### Team Members
- **Member List**: View all active team members
- **Member Profile**: Show name, email, position

### Role Presets
- **Admin**: Full permissions
- **PM (Project Manager)**: Tasks, projects, calendar, vault, inbox
- **Executor**: Tasks, calendar
- **Sales**: Tasks, relationships, LinkedIn
- **Analyst**: Analytics, tasks
- **Custom**: Manual permission selection

### Permission System
- `can_view_tasks` - View tasks
- `can_update_task_status` - Update task status
- `can_perform_tasks` - Perform tasks
- `can_create_tasks` - Create new tasks
- `can_view_calendar` - View calendar
- `can_view_linkedin` - View LinkedIn
- `can_view_relationships` - View CRM
- `can_view_vault` - View vault
- `can_view_analytics` - View analytics
- `can_view_projects` - View projects
- `can_create_projects` - Create projects
- `can_access_clients` - Access client list
- `can_access_inbox` - Access inbox

### Team Actions
- **Add Member**: Create new team member with email, password, position, permissions
- **Edit Member**: Modify existing member's position and permissions
- **Delete Member**: Remove team member with confirmation
- **Team Meetings Dialog**: View meetings for each team member

---

## 9. Client Management

### Client Properties
- **Fields**: Name, email, phone, company, role, project, status, notes, tags
- **Status Options**: active, inactive, archived

### Portal Access
- **Generate Credentials**: Create portal login for client
- **Portal Email**: Custom email for client login
- **Password**: Set password for client access
- **Task Permissions**: Allow clients to create tasks
- **Project Association**: Link client to project

### Client Actions
- **CRUD Operations**: Create, edit, delete clients
- **Schedule Meeting**: Create meetings with clients
- **Credentials Dialog**: Manage portal access credentials

---

## 10. Client Portal

### Portal Features
- **Separate Interface**: Dedicated portal at `/client-portal`
- **Client Sidebar**: Limited navigation (Home, Tasks, Calendar, Settings, Vault)
- **Authentication**: Login with generated credentials

### Client Views
- **Home**: Client dashboard showing project overview
- **Tasks**: View tasks assigned to client
- **Calendar**: View scheduled meetings
- **Settings**: Client-specific settings
- **Vault**: Access deliverables folder

---

## 11. Vault (Document Management)

### Google Drive Integration
- **OAuth Connection**: Connect Google account
- **Drive Connection**: Connect Google Drive specifically for vault
- **Folder Sync**: Sync with Drive folder structure

### Folder Structure
- **Folder Types**: root, project, internal, client_uploads, deliverables, custom
- **Project Folders**: Auto-created per project
- **Client Uploads**: Visible to clients
- **Deliverables**: Client-accessible folder for completed work

### Item Management
- **Item Types**: file, link, note
- **Document Types**: Content, Deliverable, Report, Contract, Brief, Design Asset, Spreadsheet, Presentation, Reference, Other
- **File Upload**: Upload files to Drive
- **Link Addition**: Add external URLs
- **Note Creation**: Create text notes

### Vault Features
- **Search**: Search vault items by title
- **Filter**: Filter by item type (all/file/link/note)
- **Project Filter**: Filter by project
- **Open in Drive**: Open files in Google Drive
- **Delete Items**: Remove vault items

---

## 12. Inbox (Messaging)

### Room Types
- **Direct Messages**: 1:1 conversations
- **Group Chats**: Multi-person groups
- **Project Rooms**: Auto-created per project

### Messaging Features
- **Real-time Messages**: Send and receive instantly
- **Message Content**: Text with timestamps
- **File Attachments**: Upload and share files
- **Emoji Reactions**: React to messages with emoji
- **Timestamps**: Relative time display (e.g., "2 hours ago")
- **Unread Count**: Badge showing unread messages
- **Message Search**: Search within conversations

### Room Management
- **Create Group**: Create new group conversations
- **Delete Room**: Remove chat rooms
- **Leave Room**: Exit from groups

### Gmail Integration (Inbox)
- **Thread Viewing**: Read Gmail email threads
- **Email Replies**: Reply to emails from within the app
- **Contact Creation**: Create CRM contacts from email senders

---

## 13. AI Command Bar

### Activation
- **Keyboard Shortcut**: Cmd+K (Mac) or Ctrl+K (Windows)
- **Floating Button**: Fixed button in bottom-right corner
- **AI Label**: "Ask AI" with keyboard shortcut hint

### Capabilities
- **Natural Language**: Process natural language commands
- **Real-time Stats**: Pull current data before answering
- **Smart Resolution**: Resolve team member names, project names, vault files

### AI Tools (Action Functions)
- **create_task**: Create tasks with all details from natural language
- **update_task**: Update existing tasks by title (fuzzy match)
- **delete_task**: Remove tasks
- **create_project**: Create new projects

### Features
- **Suggested Queries**: Pre-defined quick actions ("Show me overdue", "Who needs follow-up")
- **Message Compression**: Efficient message encoding (Base64)
- **Markdown Rendering**: Display formatted AI responses
- **Action Confirmation**: Confirm before destructive actions

---

## 14. Settings

### Google Integration
- **Connect Account**: OAuth flow for Google account
- **Disconnect**: Revoke Google connection
- **Connection Status**: Show connected email

### Drive Integration
- **Connect Drive**: Link Google Drive for vault
- **Drive Status**: Show if Drive is connected

### Theme
- **Dark/Light Toggle**: Switch between themes
- **Theme Persistence**: Remember user preference

### Profile
- **View Profile**: See user information
- **Update Profile**: Edit user details

---

## 15. Push Notifications

### Web Push
- **Subscribe**: Allow users to subscribe to push notifications
- **Browser Notifications**: Send notifications via web push
- **Notification Types**: Task assignments, messages, reminders

### API Endpoints
- **Subscribe**: `/api/push/subscribe` - Store push subscription
- **Send**: `/api/push/send` - Send push notification
- **Send to User**: `/api/push/send-to-user` - Target specific user
- **Send Self**: `/api/push/send-self` - Send to current user

---

## 16. Gmail Integration

### Features
- **Thread List**: View email threads
- **Thread View**: Read full email conversations
- **Reply**: Send email replies
- **Contact Sync**: Create CRM relationships from email contacts

### API Endpoints
- **Threads**: `/api/gmail/threads` - List threads
- **Thread Detail**: `/api/gmail/thread/[id]` - Get specific thread
- **Reply**: `/api/gmail/reply` - Send reply
- **Contact**: `/api/gmail/contact` - Create contact from email

---

## 17. Team Dashboard

### Features
- **Separate Route**: `/team-dashboard`
- **Role-Based Access**: Only accessible to team_member users
- **Limited Permissions**: Access based on assigned permissions
- **Task View**: View assigned tasks
- **Inbox Access**: Depending on can_access_inbox permission

---

## 18. UI/UX Features

### Design System
- **Component Library**: Shadcn UI components
- **Dark Theme**: Dark mode as default
- **Responsive**: Mobile, tablet, desktop support
- **Custom Styling**: DM Sans font, custom colors

### Interactions
- **Loading States**: Spinners, skeleton loaders
- **Toast Notifications**: Success/error messages (react-hot-toast, sonner)
- **Optimistic Updates**: Immediate UI feedback
- **Transitions**: Smooth animations and transitions

### Navigation
- **Sidebar**: Collapsible sidebar with icons
- **Breadcrumbs**: Show current location
- **Quick Navigation**: Navigate via custom events

---

## 19. Database Tables

- **profiles**: User profiles (id, full_name, user_type, etc.)
- **tasks**: Task management (title, bucket, priority, status, etc.)
- **projects**: Projects (name, status, priority, dates)
- **relationships**: CRM contacts (full_name, email, pipeline_stage, deal_value)
- **events**: Calendar events (title, start_time, type, meeting_link)
- **team_members**: Team member data (user_id, position, permissions)
- **clients**: Client management (name, email, portal credentials)
- **vault_folders**: Folder structure (name, folder_type, drive_folder_id)
- **vault_items**: Files, links, notes (item_type, title, drive_file_id)
- **chat_rooms**: Messaging rooms (type, project_id, name)
- **chat_messages**: Messages (content, room_id, user_id)
- **google_integrations**: OAuth state (google_email, is_connected, drive_connected)
- **linkedin_posts**: Post drafts (content, status, impressions)
- **push_subscriptions**: Push notification subscriptions (endpoint, keys)
- **task_comments**: Task discussions (content, task_id, user_id)
- **invite_tokens**: Team invitation tokens

---

## 20. API Endpoints Summary

### AI Endpoints
- `/api/ai/chat` - AI chat interface
- `/api/ai/send-message` - Send message to AI
- `/api/ai/command` - Execute AI command
- `/api/ai/proactive` - Proactive AI suggestions
- `/api/ai/analyze` - AI analysis
- `/api/ai/extract-task` - Extract task from text
- `/api/ai/warm` - Warm up AI service

### Vault Endpoints
- `/api/vault/upload-file` - Upload file to vault
- `/api/vault/create-project-folders` - Create project folders
- `/api/vault/connect` - Connect Google Drive

### Task Endpoints
- `/api/tasks/submit-deliverable` - Submit task deliverable
- `/api/tasks/attach-client-file` - Attach client file

### Push Endpoints
- `/api/push/subscribe` - Subscribe to notifications
- `/api/push/send` - Send notification
- `/api/push/send-to-user` - Send to specific user
- `/api/push/send-self` - Send to self

### Google/Gmail Endpoints
- `/api/google/disconnect` - Disconnect Google
- `/api/google/create-meet` - Create Google Meet
- `/api/gmail/threads` - List email threads
- `/api/gmail/thread/[id]` - Get thread
- `/api/gmail/reply` - Reply to email
- `/api/gmail/contact` - Create contact

### Auth Endpoints
- `/api/auth/google` - Google OAuth
- `/api/auth/google/callback` - OAuth callback
- `/api/auth/callback` - Auth callback

### Other Endpoints
- `/api/crm/import-leads` - Import CRM leads
- `/api/create-team-member` - Create team member
- `/api/delete-team-member` - Delete team member
- `/api/create-client-credentials` - Generate client login
- `/api/inbox/delete-room` - Delete chat room
- `/api/event-invites/respond` - Respond to event invite