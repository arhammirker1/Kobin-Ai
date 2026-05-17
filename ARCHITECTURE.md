# Founder Assistant - System Architecture

This document outlines the high-level system architecture, data models, and critical workflows for the Founder Assistant platform.

## High-Level Architecture

The application is built on a modern Next.js stack, leveraging Supabase for backend services, Groq for AI processing, and various external APIs for integrations.

```mermaid
graph TD
    %% Client Layer
    subgraph "Client Layer"
        Web[Next.js App / React 19]
        TeamDash[Team Dashboard Route]
        ClientPortal[Client Portal UI]
        CommandBar[AI Command Bar / Ctrl+K]
    end

    %% Web Server Layer
    subgraph "Server Layer (Next.js App Router)"
        API_Routes[API Routes / Server Actions]
        Auth[Auth Controllers]
        Agent[Kobin AI Engine]
    end

    %% Data & Infrastructure
    subgraph "Data & Storage (Supabase)"
        DB[(PostgreSQL Database)]
        RLS[Row Level Security]
    end

    %% External Services
    subgraph "External Integrations"
        Groq[Groq LLM API]
        Google[Google OAuth / Workspace]
        Gmail[Gmail API]
        Drive[Google Drive API]
        LinkedIn[LinkedIn API]
        WebPush[Web Push Service]
        Upstash[Upstash Redis / Rate Limiting]
    end

    %% Connections
    Web -->|Next.js Routing| API_Routes
    TeamDash --> API_Routes
    ClientPortal --> Auth
    CommandBar --> Agent

    API_Routes --> Auth
    API_Routes --> DB
    
    Agent --> Groq
    Agent --> DB
    Agent --> Upstash
    
    Auth --> Google
    
    API_Routes --> Gmail
    API_Routes --> Drive
    API_Routes --> LinkedIn
    API_Routes --> WebPush
    
    DB --- RLS
```

## AI Agent Architecture (Kobin)

The Kobin AI Operating Layer uses an MCP-style tool architecture for proactive workspace management.

```mermaid
sequenceDiagram
    participant User
    participant CommandBar as Command Bar (Client)
    participant NextRoute as API Route (/api/ai/chat)
    participant Groq as Groq (LLM)
    participant DB as Supabase DB

    User->>CommandBar: "Schedule a meeting with Acme Corp"
    CommandBar->>NextRoute: Send Message (incl. context)
    NextRoute->>DB: Fetch Active Workspace Data & Tools
    NextRoute->>Groq: Generate Response (System Prompt + Tools)
    Groq->>NextRoute: Tool Call: `search_contacts("Acme Corp")`
    NextRoute->>DB: Execute Search
    DB-->>NextRoute: Return Contact Data
    NextRoute->>Groq: Tool Result
    Groq->>NextRoute: Tool Call: `create_event(...)`
    NextRoute->>DB: Create Event Record
    DB-->>NextRoute: Success Response
    NextRoute->>Groq: Tool Result
    Groq->>NextRoute: User Message: "Meeting scheduled."
    NextRoute-->>CommandBar: Return Streamed Response
    CommandBar-->>User: Display AI Message & Action Confirmation
```

## Core Data Model

The application uses Supabase (PostgreSQL) with Row Level Security for multi-tenancy and permissions.

```mermaid
erDiagram
    PROFILES ||--o{ TASKS : "assigned to"
    PROFILES ||--o{ PROJECTS : manages
    PROFILES ||--o{ RELATIONSHIPS : manages
    PROFILES ||--o{ TEAM_MEMBERS : "has role"
    
    PROJECTS ||--o{ TASKS : contains
    PROJECTS ||--o{ VAULT_FOLDERS : has
    PROJECTS ||--o{ CHAT_ROOMS : has
    
    CLIENTS ||--o{ PROJECTS : "has access to"
    
    VAULT_FOLDERS ||--o{ VAULT_ITEMS : contains
    
    CHAT_ROOMS ||--o{ CHAT_MESSAGES : contains
    PROFILES ||--o{ CHAT_MESSAGES : sends
    
    RELATIONSHIPS ||--o{ EVENTS : involves
    
    PROFILES {
        uuid id
        string full_name
        string user_type
    }
    
    TASKS {
        uuid id
        string title
        string status
        string priority
        string bucket
    }
    
    PROJECTS {
        uuid id
        string name
        string status
    }
    
    RELATIONSHIPS {
        uuid id
        string full_name
        string email
        string pipeline_stage
        integer deal_value
    }
```

## Integration Data Flow

```mermaid
graph LR
    subgraph "Inbox & Comms Pipeline"
        Gmail[Gmail Inbox] -->|/api/gmail/threads| InboxView[App Inbox UI]
        InboxView -->|Reply| GmailAPI[Gmail API]
        InboxView -->|Extract| CRM[CRM / Contacts]
    end

    subgraph "Vault & Files Pipeline"
        UserUpload[User File] -->|/api/vault/upload| DriveAPI[Google Drive]
        DriveAPI -->|Sync| VaultView[Vault UI]
    end
```
