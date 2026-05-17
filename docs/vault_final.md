# Vault v3 — Full Implementation Guide

## What was built

### New files (copy directly into your project)
| File | Purpose |
|------|---------|
| `components/vault-view.tsx` | Full vault UI — replaces old component |
| `lib/ai/embeddings.ts` | OpenAI embedding generation + upsert |
| `lib/ai/vault-rag.ts` | Semantic search, related context, RAG |
| `app/api/vault/connect/route.ts` | Drive vault init (already existed, unchanged) |
| `app/api/vault/upload-file/route.ts` | File upload to Drive |
| `app/api/vault/search/route.ts` | Semantic search endpoint |
| `app/api/vault/embed/route.ts` | Trigger embedding for items |
| `app/api/vault/ai-write/route.ts` | RAG-powered AI writer (streaming) |
| `lib/ai/mcp-read-tools-vault-patch.ts` | Vault semantic search for the AI command agent |

---

## Step 1 — Run SQL in Supabase

Go to **Supabase → SQL Editor** and run the file:
`supabase/migrations/20250413_vault_embeddings.sql`

This will:
- Enable the `pgvector` extension
- Create the `vault_embeddings` table
- Create the `vault_semantic_search()` and `vault_related_items()` RPC functions
- Add an `embedding_status` column to `vault_items`
- Set up RLS policies

---

## Step 2 — Add OpenAI API key to environment

In your `.env.local`:
```
OPENAI_API_KEY=sk-...
```

The vault uses `text-embedding-3-small` (cheapest OpenAI embedding model, 1536 dims).
Cost: ~$0.00002 per item embedded — negligible.

---

## Step 3 — Enable pgvector in Supabase

In your Supabase dashboard:
1. Go to **Database → Extensions**
2. Search for `vector`
3. Enable it

Or it will be enabled automatically by the SQL migration (`create extension if not exists vector`).

---

## Step 4 — Patch mcp-read-tools.ts

Add vault semantic search to your AI agent's read tools.

### In `lib/ai/mcp-read-tools.ts`:

**4a. Add to READ_TOOLS array** (paste before the closing `] as const`):
```typescript
{
  type: "function" as const,
  function: {
    name: "vault_semantic_search",
    description:
      "Semantically search the founder's vault by meaning, not just keywords. Use when the user asks to 'find documents about X', 'what files do we have on Y', or needs vault context.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "Natural language search query" },
        project_name: { type: "string", description: "Optional: limit to a project" },
        limit: { type: "number", description: "Max results (default 5)" },
      },
      required: ["query"],
    },
  },
},
```

**4b. Add to ReadToolName type**:
```typescript
export type ReadToolName =
  | "get_workspace_overview"
  | "get_tasks"
  | "get_projects"
  | "get_team_workload"
  | "get_crm_pipeline"
  | "get_calendar"
  | "get_vault_files"
  | "get_task_creation_context"
  | "search_contacts"
  | "get_meeting_notes"
  | "vault_semantic_search"   // ← ADD THIS
```

**4c. Add to executeReadTool switch**:
```typescript
case "vault_semantic_search":
  return execVaultSemanticSearch(args, founderId)
```

**4d. Import and add the executor** — copy `execVaultSemanticSearch` from `lib/ai/mcp-read-tools-vault-patch.ts` and paste it at the bottom of `mcp-read-tools.ts`.

---

## Step 5 — Update ClientVaultView (if needed)

The `components/client-vault-view.tsx` remains unchanged — clients still only see `client_uploads` and `deliverables` folders. No vector search exposed to clients.

---

## Features delivered

### Core UI (from vault_v3.html)
- [x] 3-column layout: Projects | Folders | Items
- [x] Sidebar collapse toggles
- [x] Breadcrumb navigation
- [x] Drive connection status
- [x] AI strip showing embed count
- [x] Filter bar (All / File / Link / Note)
- [x] Card grid with type badges, approval status, embed indicator dots
- [x] ⌘K search overlay

### Inline Viewers
- [x] Doc editor with toolbar + AI Writer panel
- [x] Link viewer (external link open)
- [x] File/Approval viewer with approve/request-changes workflow
- [x] Image viewer (opens Drive)

### Right Context Panel
- [x] Context tab — vectorised status + AI Memory (related items via pgvector)
- [x] Approval tab — inline approval workflow
- [x] Comments tab
- [x] Activity tab

### AI Writer (RAG-powered)
- [x] Streaming AI completions via `/api/vault/ai-write`
- [x] Retrieves relevant vault context before writing
- [x] Quick suggestion prompts
- [x] Insert into document / Discard

### Vector Embeddings (pgvector)
- [x] Auto-embed on every item add (background, non-blocking)
- [x] Batch re-embed on vault load (catches any pending)
- [x] Semantic search in ⌘K overlay (hybrid: semantic + keyword)
- [x] Related items panel (finds connected documents automatically)
- [x] AI command agent can search vault semantically (`vault_semantic_search`)
- [x] Embedding status indicator on cards (violet dot = vectorised)
- [x] Content hash deduplication (won't re-embed unchanged items)

### Approval Workflow
- [x] Mark Approved / Request Changes
- [x] Status persists per-item in component state
- [x] Approval history section in right panel
- [x] "Send for Approval" action in viewer header

---

## Architecture

```
vault_items (Supabase)
    ↓ on add/edit
/api/vault/embed (background)
    ↓
lib/ai/embeddings.ts → OpenAI text-embedding-3-small
    ↓
vault_embeddings (pgvector table, 1536 dims)
    ↓
vault_semantic_search() RPC ← used by:
    - /api/vault/search  (⌘K overlay)
    - lib/ai/vault-rag.ts  (related items panel, AI writer context)
    - mcp-read-tools.ts  (AI command agent)
```