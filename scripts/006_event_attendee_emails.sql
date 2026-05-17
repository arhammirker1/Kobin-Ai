-- ============================================================================
-- 006: Add attendee_emails to events table
-- 
-- Stores external participant emails when creating meetings.
-- Used by the meeting recorder to map participants to CRM contacts.
-- ============================================================================

-- Add attendee_emails column to events table
ALTER TABLE public.events 
ADD COLUMN IF NOT EXISTS attendee_emails text[] DEFAULT '{}'::text[];

-- Add comment for documentation
COMMENT ON COLUMN public.events.attendee_emails IS 
  'External participant email addresses added when creating the meeting. Used by meeting recorder to map participants to CRM contacts.';

-- Backfill: Update existing events that have a relationship_id with the contact email
UPDATE public.events e
SET attendee_emails = ARRAY[r.email]
FROM public.relationships r
WHERE e.relationship_id = r.id
  AND r.email IS NOT NULL
  AND r.email != ''
  AND (e.attendee_emails IS NULL OR e.attendee_emails = '{}');

-- Backfill: Update existing events that have a client_id with the client email
UPDATE public.events e
SET attendee_emails = ARRAY[c.email]
FROM public.clients c
WHERE e.client_id = c.id
  AND c.email IS NOT NULL
  AND c.email != ''
  AND (e.attendee_emails IS NULL OR e.attendee_emails = '{}');
