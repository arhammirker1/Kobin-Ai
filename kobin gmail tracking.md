# Kobin AI CRM Intelligence Layer

## Full System Documentation (v1)

---

# 1. Overview

Kobin AI CRM is not a traditional CRM. It is an **AI-driven relationship operating system** that:

* Ingests leads (CSV, manual, integrations)
* Tracks all communication (email-first)
* Understands intent, sentiment, and timing
* Triggers actions automatically via MCP (Model Context Protocol layer)
* Continuously updates a “relationship brain” for every contact

---

# 2. Core Architecture

## 2.1 System Layers

### 1. Data Layer (Supabase / SQL)

Stores:

* Contacts
* Companies
* Emails (threads + metadata)
* Activities (tasks, notes, meetings)
* Files (vault references)

---

### 2. AI Layer (Groq + LLaMA 3.1 70B)

Responsible for:

* Email parsing
* Intent classification
* Sentiment detection
* Lead scoring
* Action recommendations
* Memory summarization

---

### 3. MCP (Action Layer)

Executes:

* Task creation
* Follow-ups
* Notifications
* File attachments
* CRM updates

---

### 4. Integration Layer

Handles:

* Email providers (IMAP/SMTP, Gmail API later)
* CSV uploads
* Webhooks (future)

---

# 3. Feature Modules

---

# 3.1 Lead Import System

## Objective

Make importing leads frictionless and intelligent.

## Flow

1. User uploads CSV
2. System parses headers
3. AI suggests column mappings
4. User confirms (or auto-confirms)
5. Data normalized and stored

---

## Features

### Auto Column Detection

AI maps:

* email → email
* full_name → name
* company_name → company

### Smart Mapping Memory

* Save mappings per user/workspace
* Reuse automatically

### Data Cleaning

* Remove duplicates
* Normalize casing
* Validate emails

---

## Output Schema (contacts table)

```
id
name
email
company
phone
source
created_at
```

---

# 3.2 Email Tracking Engine

## Objective

Turn raw emails into structured intelligence.

---

## Email Ingestion

### Methods:

* IMAP polling
* Webhooks (future)
* SMTP send tracking

---

## Stored Data

```
email_id
contact_id
thread_id
subject
body
direction (inbound/outbound)
timestamp
```

---

## Threading Logic

* Group emails by:

  * subject similarity
  * reply headers
* Maintain conversation continuity

---

# 3.3 AI Email Intelligence

## Objective

Convert emails into actionable insights.

---

## 3.3.1 Intent Classification

Each email is classified into:

* Interested
* Not Interested
* Neutral
* Request Info
* Pricing Inquiry
* Meeting Intent
* Objection
* Spam/Irrelevant

---

## Prompt Structure

```
Analyze the following email and classify:

Email:
{{email_body}}

Return:
- intent
- confidence (0–100)
- reasoning (short)
```

---

## 3.3.2 Sentiment Analysis

Categories:

* Positive
* Neutral
* Negative

---

## 3.3.3 Key Signal Extraction

Extract:

* Mentions of budget
* Mentions of timeline
* Objections
* Buying signals

---

## Output Example

```
{
  intent: "meeting_intent",
  sentiment: "positive",
  confidence: 87,
  signals: ["wants demo", "available next week"]
}
```

---

# 3.4 Lead Scoring Engine

## Objective

Quantify likelihood of conversion.

---

## Inputs

* Reply frequency
* Sentiment trend
* Intent type
* Time since last reply
* Engagement depth

---

## Formula (example)

```
score =
+ (positive_sentiment * 20)
+ (meeting_intent * 30)
+ (reply_speed_factor * 15)
- (no_reply_days * 5)
```

---

## Output

```
lead_score: 78
status: "hot"
```

---

# 3.5 Relationship Timeline (Contact Brain)

## Objective

Give full context instantly.

---

## Timeline Includes

* Emails
* Notes
* Tasks
* Meetings
* Files

---

## AI Summary Generator

### Trigger:

* On new activity
* On contact open

---

## Prompt

```
Summarize this contact:

Emails:
{{emails}}

Tasks:
{{tasks}}

Notes:
{{notes}}

Return:
- summary (3–5 lines)
- current status
- next recommended action
```

---

## Example Output

```
Summary:
Cold outreach lead. Responded positively. Interested but asked about pricing.

Status:
Warm

Next Action:
Send pricing doc and follow up in 2 days
```

---

# 3.6 Ghosting Detection

## Objective

Detect when leads stop responding.

---

## Logic

```
if last_reply > X days:
  mark as "ghosting"
```

---

## AI Enhancement

AI determines:

* Likelihood of recovery
* Suggested follow-up tone

---

# 3.7 Auto Actions (MCP Integration)

## Objective

Move from insight → execution.

---

## Trigger Types

### 1. No Reply

Condition:

```
no reply for 3 days
```

Action:

* Generate follow-up email
* Create task

---

### 2. Positive Intent

Condition:

```
intent == meeting_intent
```

Action:

* Create meeting task
* Suggest calendar slot

---

### 3. Pricing Inquiry

Condition:

```
intent == pricing
```

Action:

* Attach pricing doc
* Draft response

---

## MCP Action Format

```
{
  action: "create_task",
  payload: {
    title: "Follow up with Ahmed",
    due_date: "2026-04-02"
  }
}
```

---

# 3.8 AI Email Drafting

## Objective

Reduce manual effort in communication.

---

## Types

* Follow-ups
* Replies
* Cold outreach
* Objection handling

---

## Prompt Example

```
Write a follow-up email:

Context:
{{contact_summary}}

Tone:
Professional, concise

Goal:
Get a response
```

---

# 3.9 Smart Notifications

## Objective

Surface only important signals.

---

## Examples

* “Lead turned hot”
* “No reply in 4 days”
* “Meeting requested”

---

# 4. Data Flow

---

## Step-by-Step

1. Email received
2. Stored in DB
3. AI processes:

   * intent
   * sentiment
   * signals
4. Lead score updated
5. Timeline updated
6. MCP evaluates triggers
7. Actions executed
8. UI updated

---

# 5. Performance Considerations

---

## AI Optimization

* Batch email processing
* Cache summaries
* Only reprocess new emails

---

## Cost Control

* Use lightweight models for:

  * sentiment
* Use LLaMA 70B for:

  * summaries
  * intent

---

# 6. Future Enhancements

---

## Short Term

* Gmail API integration
* Meeting detection → auto calendar sync
* Multi-thread understanding

---

## Mid Term

* Voice call summaries
* WhatsApp integration
* Multi-channel timeline

---

## Long Term

* Fully autonomous pipeline
* AI negotiating deals
* Revenue prediction engine

---

# 7. Positioning (Important)

You are NOT building:

* a CRM
* an email tracker

You are building:

**“An AI system that manages business relationships automatically.”**

---

# 8. Key Differentiator

Traditional CRM:

* Stores data

Kobin AI:

* Understands data
* Decides what matters
* Takes action

---

# Final Note

If you execute this properly, users won’t “use” your CRM.

They’ll rely on it.

That’s the shift that replaces entire stacks.
