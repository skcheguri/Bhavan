-- ============================================================
-- Both counter RPCs accepted an arbitrary p_delta from any caller,
-- including anon: one curl could set a competitor's listing to zero
-- saves (delta -1000000) or fake 50,000 views on your own. And
-- saves_count / inquiries_count never needed a client-supplied counter
-- at all -- they mirror rows the database already holds.
--
--   * saves_count / inquiries_count become trigger-maintained from
--     saved_listings and connection_requests, the tables whose RLS
--     already decides who may create those rows. The RPC branches for
--     them become no-ops (not errors) so the currently-deployed
--     frontend, which still calls them, neither breaks nor
--     double-counts during the deploy window.
--   * views_count and the QR counters stay caller-reachable (a logged-
--     out visitor viewing a listing or scanning a QR code is the whole
--     point) but always move by exactly +1 per call, whatever delta the
--     caller claims.
-- ============================================================

-- ---- saves_count / inquiries_count from real rows ----

CREATE OR REPLACE FUNCTION sync_listing_saves_count()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE listings SET saves_count = COALESCE(saves_count, 0) + 1 WHERE id = NEW.listing_id;
    RETURN NEW;
  ELSE
    UPDATE listings SET saves_count = GREATEST(0, COALESCE(saves_count, 0) - 1) WHERE id = OLD.listing_id;
    RETURN OLD;
  END IF;
END;
$$;

DROP TRIGGER IF EXISTS trg_saved_listings_sync_count ON saved_listings;
CREATE TRIGGER trg_saved_listings_sync_count
  AFTER INSERT OR DELETE ON saved_listings
  FOR EACH ROW EXECUTE FUNCTION sync_listing_saves_count();

CREATE OR REPLACE FUNCTION sync_listing_inquiries_count()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE listings SET inquiries_count = COALESCE(inquiries_count, 0) + 1 WHERE id = NEW.listing_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_connection_requests_sync_count ON connection_requests;
CREATE TRIGGER trg_connection_requests_sync_count
  AFTER INSERT ON connection_requests
  FOR EACH ROW EXECUTE FUNCTION sync_listing_inquiries_count();

-- One-time true-up from the source tables, since the old client-driven
-- counters could legitimately have drifted (or been vandalized).
UPDATE listings l
SET saves_count = (SELECT count(*) FROM saved_listings s WHERE s.listing_id = l.id),
    inquiries_count = (SELECT count(*) FROM connection_requests cr WHERE cr.listing_id = l.id);

-- ---- Clamped RPCs ----
-- Signatures unchanged on purpose: the deployed frontend passes p_delta,
-- and PostgREST resolves RPCs by name + named arguments.

CREATE OR REPLACE FUNCTION public.increment_listing_counter(p_listing_id uuid, p_counter text, p_delta integer DEFAULT 1)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
    -- p_delta is deliberately ignored: a view is one view.
    IF p_counter = 'views_count' THEN
        UPDATE listings SET views_count = COALESCE(views_count, 0) + 1 WHERE id = p_listing_id;
    END IF;
    -- 'saves_count' and 'inquiries_count' are trigger-maintained now;
    -- calls from the older deployed client fall through as no-ops.
END;
$function$
;

CREATE OR REPLACE FUNCTION public.increment_qr_counter(p_listing_id uuid, p_field text, p_delta integer DEFAULT 1)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF p_field NOT IN ('scans_count', 'messages_sent') THEN
    RAISE EXCEPTION 'invalid field: %', p_field;
  END IF;

  -- p_delta is deliberately ignored: one scan, one message.
  INSERT INTO qr_analytics (listing_id, scan_date, scans_count, messages_sent)
  VALUES (
    p_listing_id,
    CURRENT_DATE,
    CASE WHEN p_field = 'scans_count' THEN 1 ELSE 0 END,
    CASE WHEN p_field = 'messages_sent' THEN 1 ELSE 0 END
  )
  ON CONFLICT (listing_id, scan_date) DO UPDATE SET
    scans_count = qr_analytics.scans_count + CASE WHEN p_field = 'scans_count' THEN 1 ELSE 0 END,
    messages_sent = qr_analytics.messages_sent + CASE WHEN p_field = 'messages_sent' THEN 1 ELSE 0 END;
END;
$function$
;
