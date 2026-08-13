import { useState, useEffect, useCallback } from 'react';
import { getSupabase } from '@/lib/supabase';
import { getDeviceFingerprint } from '@/lib/fingerprint';

export type ContactInquiryStatus = 'new' | 'in_progress' | 'resolved';

export interface ContactInquiry {
  id: string;
  name: string;
  email: string;
  subject: string;
  message: string;
  status: ContactInquiryStatus;
  adminNotes: string | null;
  createdAt: string;
  resolvedAt: string | null;
}

function mapRow(r: Record<string, unknown>): ContactInquiry {
  return {
    id: String(r.id),
    name: String(r.name ?? ''),
    email: String(r.email ?? ''),
    subject: String(r.subject ?? ''),
    message: String(r.message ?? ''),
    status: (r.status as ContactInquiryStatus) ?? 'new',
    adminNotes: (r.admin_notes as string | null) ?? null,
    createdAt: String(r.created_at ?? ''),
    resolvedAt: (r.resolved_at as string | null) ?? null,
  };
}

// Public: used by the Contact Us page. No auth required -- anyone can submit.
export function useSubmitContactInquiry() {
  const [submitting, setSubmitting] = useState(false);

  const submit = useCallback(
    async (input: { name: string; email: string; subject: string; message: string }): Promise<{ error: string | null }> => {
      const supabase = getSupabase();
      if (!supabase) return { error: 'Database connection unavailable' };
      setSubmitting(true);
      const { error } = await supabase.from('contact_inquiries').insert({
        name: input.name,
        email: input.email,
        subject: input.subject,
        message: input.message,
        device_fingerprint: getDeviceFingerprint(),
      });
      setSubmitting(false);
      if (error) {
        // The rate-limit trigger raises a plain message, not a generic
        // Postgres constraint error -- surface it as-is rather than a
        // confusing raw error code.
        return { error: error.message };
      }
      return { error: null };
    },
    []
  );

  return { submit, submitting };
}

// Admin: queue of every inquiry, with status triage.
export function useAdminContactInquiries() {
  const [inquiries, setInquiries] = useState<ContactInquiry[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const supabase = getSupabase();
    if (!supabase) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data, error } = await supabase
      .from('contact_inquiries')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.warn('Supabase contact_inquiries fetch error:', error.message);
      setInquiries([]);
    } else {
      setInquiries(((data ?? []) as Record<string, unknown>[]).map(mapRow));
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const updateStatus = useCallback(
    async (id: string, status: ContactInquiryStatus, adminNotes?: string): Promise<boolean> => {
      const supabase = getSupabase();
      if (!supabase) return false;
      // adminNotes === undefined means "leave the note untouched". Only an
      // explicit value is written -- previously `?? null` turned an omitted
      // note into an overwrite, so flipping status to resolved without
      // retyping wiped the triage notes.
      const patch: {
        status: ContactInquiryStatus;
        resolved_at: string | null;
        admin_notes?: string;
      } = {
        status,
        resolved_at: status === 'resolved' ? new Date().toISOString() : null,
      };
      if (adminNotes !== undefined) patch.admin_notes = adminNotes;

      const { data, error } = await supabase
        .from('contact_inquiries')
        .update(patch)
        .eq('id', id)
        .select('id');
      if (error) {
        console.warn('Supabase contact_inquiries update error:', error.message);
        return false;
      }
      if (!data || data.length === 0) {
        // RLS filtered the row out, or it's gone -- report failure rather
        // than a false success (PostgREST returns 204 for a zero-row update).
        console.warn('Supabase contact_inquiries update affected no rows');
        return false;
      }
      await load();
      return true;
    },
    [load]
  );

  return { inquiries, loading, updateStatus, refresh: load };
}
