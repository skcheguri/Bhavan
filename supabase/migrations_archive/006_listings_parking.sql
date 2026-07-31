-- ============================================================
-- Bhavan Platform -- add listings.parking
-- ============================================================
-- The listing edit form and listing cards throughout the app show
-- a parking selector/badge, but the base schema never had a column
-- for it -- every page hardcoded parking: 'none'. Adding the real
-- column so editing a listing's parking option actually persists.
-- ============================================================

ALTER TABLE listings ADD COLUMN IF NOT EXISTS parking TEXT CHECK (parking IN ('none', '2-wheeler', '4-wheeler', 'both')) DEFAULT 'none';

-- ============================================================
-- Enable realtime push for chat_messages (owner <-> tenant chat).
-- Without this, messages still work via fetch/refetch, but the other
-- party won't see new messages appear live -- only on next reload.
-- ============================================================
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime' AND tablename = 'chat_messages'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE chat_messages;
    END IF;
END $$;

-- ============================================================
-- END OF MIGRATION
-- ============================================================
