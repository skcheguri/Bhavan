-- ============================================================
-- Minimal production error-logging safety net. No third-party account
-- needed (Sentry/etc would be a stronger long-term choice, but requires
-- signing up and wiring a DSN) -- this uses infrastructure already in
-- place: any client-side crash (React render error via ErrorBoundary, or
-- an uncaught exception/promise rejection anywhere in the app) gets
-- written here so it's actually visible instead of only living in a
-- browser console no one is watching.
-- ============================================================

CREATE TABLE IF NOT EXISTS client_error_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    message TEXT NOT NULL,
    stack TEXT,
    component_stack TEXT,
    source TEXT NOT NULL CHECK (source IN ('error_boundary', 'window_error', 'unhandled_rejection')),
    url TEXT,
    user_agent TEXT,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_client_error_logs_created_at ON client_error_logs(created_at DESC);

ALTER TABLE client_error_logs ENABLE ROW LEVEL SECURITY;

-- Anyone (including signed-out visitors, since a crash can happen before
-- login) can report an error about themselves. There's no UPDATE/DELETE
-- policy -- logs are append-only from the client.
CREATE POLICY "Anyone can report a client error" ON client_error_logs
    FOR INSERT WITH CHECK (user_id IS NULL OR user_id = auth.uid());

CREATE POLICY "Admins can read all client error logs" ON client_error_logs
    FOR SELECT USING (is_admin());

CREATE POLICY "Admins can delete client error logs" ON client_error_logs
    FOR DELETE USING (is_admin());

-- ============================================================
-- END OF MIGRATION
-- ============================================================
