import { useState, useEffect, useCallback } from 'react';
import { getSupabase, isSupabaseConnected, functionErrorMessage } from '@/lib/supabase';
import { loadRazorpayScript } from '@/lib/razorpay';

/**
 * The apartment complex / villa community feature.
 *
 * Named "society" throughout the UI because /community is already the
 * public discussion forum and reusing the word would make two unrelated
 * things share a name. The database tables are still `communities` and
 * `community_members` -- that mapping is deliberate, not an oversight.
 *
 * Every rule this file appears to enforce is really enforced in Postgres
 * (migrations 074-076). The client checks exist to explain, not to guard:
 * showing "get your property verified first" is kinder than letting the
 * insert fail with a row-level security error. Anyone bypassing the UI
 * still hits the same wall.
 */

export interface Society {
  id: string;
  name: string;
  kind: string;
  address: string;
  city: string | null;
  state: string | null;
  join_code: string;
  status: string;
  rejection_reason: string | null;
  created_by: string;
  created_at: string;
}

/** What a non-member is allowed to see before joining. */
export interface SocietyPreview {
  id: string;
  name: string;
  kind: string;
  city: string | null;
}

export interface SocietyMember {
  id: string;
  community_id: string;
  user_id: string;
  unit_numbers: string[];
  role: string;
  status: string;
  rejection_reason: string | null;
  approved_at: string | null;
  created_at: string;
  user?: {
    name: string | null;
    email: string | null;
    avatar_url: string | null;
    phone: string | null;
  };
}

interface UseSocietyReturn {
  /** The society this user belongs to, if any. */
  society: Society | null;
  /** Their membership row. May be pending or rejected. */
  membership: SocietyMember | null;
  /** Whether they have cleared Bhavan's owner verification. */
  verifiedOwner: boolean;
  /** Whether the SOCIETY has an active plan. Never about this user. */
  isPaid: boolean;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

const NOT_CONNECTED = 'Not connected to the database.';

function client() {
  if (!isSupabaseConnected()) return null;
  return getSupabase();
}

/**
 * Everything the current user needs to render the society page: their
 * membership, the society itself, and whether they are even eligible to
 * ask to join one.
 */
export function useSociety(userId: string | undefined): UseSocietyReturn {
  const [society, setSociety] = useState<Society | null>(null);
  const [membership, setMembership] = useState<SocietyMember | null>(null);
  const [verifiedOwner, setVerifiedOwner] = useState(false);
  const [isPaid, setIsPaid] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    const supabase = client();
    if (!supabase || !userId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    // Ask the database whether this user clears the verification gate
    // rather than reimplementing the rule here. If the two ever disagree,
    // the database is right and the client is stale.
    //
    // The third query is not redundant. Registering a society does NOT
    // create a membership row -- the founder's admin row is only seeded
    // when Bhavan approves it -- so between submitting and approval the
    // creator has a society and no membership. Without this they would be
    // sent back to the "register a society" form as though the submission
    // had silently failed, and would file it again.
    const [{ data: gate }, { data: rows, error: dbError }, { data: created }] = await Promise.all([
      supabase.rpc('is_verified_owner', { p_user: userId }),
      supabase
        .from('community_members')
        .select('*, community:communities(*)')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(1),
      supabase
        .from('communities')
        .select('*')
        .eq('created_by', userId)
        .order('created_at', { ascending: false })
        .limit(1),
    ]);

    setVerifiedOwner(gate === true);

    if (dbError) {
      setError(dbError.message);
      setSociety(null);
      setMembership(null);
      setLoading(false);
      return;
    }

    const row = rows?.[0] as (SocietyMember & { community: Society | null }) | undefined;
    if (row) {
      const { community, ...member } = row;
      setMembership(member);
      setSociety(community);
      // Asked of the database, for the same reason as the verification
      // gate: the client is never the authority on what has been paid for.
      if (community) {
        const { data: paid } = await supabase.rpc('community_is_paid', {
          p_community: community.id,
        });
        setIsPaid(paid === true);
      }
    } else {
      // No membership: fall back to a society they registered and are
      // still waiting on. A society they created that has been approved
      // always has a membership row, so anything found here is unreviewed.
      setMembership(null);
      setSociety((created?.[0] as Society | undefined) ?? null);
    }
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    void fetchAll();
  }, [fetchAll]);

  return { society, membership, verifiedOwner, isPaid, loading, error, refresh: fetchAll };
}

/**
 * Look up a society by its join code.
 *
 * Goes through an RPC rather than a table read so the codes cannot be
 * enumerated: it matches one exact code and returns four harmless columns.
 * Selecting from `communities` directly would need a policy that lets any
 * signed-in user read rows they have no relationship to.
 */
export async function findSocietyByCode(
  code: string
): Promise<{ society: SocietyPreview | null; error: string | null }> {
  const supabase = client();
  if (!supabase) return { society: null, error: NOT_CONNECTED };

  const { data, error } = await supabase.rpc('find_community_by_code', {
    p_code: code,
  });

  if (error) return { society: null, error: error.message };

  const found = (data as SocietyPreview[] | null)?.[0] ?? null;
  return {
    society: found,
    error: found ? null : 'No society found with that code. Check it with your society admin.',
  };
}

/**
 * Ask to join. Always lands as a pending member regardless of what is sent
 * here -- a trigger rewrites role and status on the way in.
 */
export async function requestToJoinSociety(
  communityId: string,
  userId: string,
  unitNumbers: string[]
): Promise<{ error: string | null }> {
  const supabase = client();
  if (!supabase) return { error: NOT_CONNECTED };

  const { error } = await supabase.from('community_members').insert({
    community_id: communityId,
    user_id: userId,
    unit_numbers: unitNumbers,
  });

  if (!error) return { error: null };

  // 23505 is a duplicate on (community_id, user_id): they already applied.
  if (error.code === '23505') {
    return { error: 'You have already applied to this society.' };
  }
  // 42501 is the RLS refusal, which here means the verification gate.
  if (error.code === '42501') {
    return {
      error:
        'Only verified owners can join a society. Get a property verified first, then try again.',
    };
  }
  return { error: error.message };
}

export interface CreateSocietyInput {
  name: string;
  kind: string;
  address: string;
  city: string;
  state: string;
}

/**
 * Register a new society. It arrives pending and stays invisible -- its
 * code will not resolve for anyone -- until Bhavan reviews it. The creator
 * becomes its first admin at the moment of approval.
 */
export async function createSociety(
  input: CreateSocietyInput,
  userId: string
): Promise<{ error: string | null }> {
  const supabase = client();
  if (!supabase) return { error: NOT_CONNECTED };

  const { error } = await supabase.from('communities').insert({
    ...input,
    created_by: userId,
    status: 'pending',
  });

  if (!error) return { error: null };
  if (error.code === '42501') {
    return {
      error:
        'Only verified owners can register a society. Get a property verified first, then try again.',
    };
  }
  return { error: error.message };
}

/** One row as get_community_members returns it: user fields inlined. */
type FlatMemberRow = Omit<SocietyMember, 'user'> & {
  name: string | null;
  email: string | null;
  avatar_url: string | null;
  phone: string | null;
};

interface UseSocietyMembersReturn {
  members: SocietyMember[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

/**
 * The member list, for the admin screen. RLS returns only the societies
 * the caller belongs to, so this cannot be pointed at someone else's
 * building by changing the id in the URL.
 */
export function useSocietyMembers(communityId: string | undefined): UseSocietyMembersReturn {
  const [members, setMembers] = useState<SocietyMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchMembers = useCallback(async () => {
    const supabase = client();
    if (!supabase || !communityId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    // Goes through an RPC, not a join. Selecting community_members with an
    // embedded users(...) fails on the users RLS policy, and the fix is not
    // to widen that policy -- see migration 078. The function returns a
    // named set of columns and blanks contact details for non-admins.
    const { data, error: dbError } = await supabase.rpc('get_community_members', {
      p_community: communityId,
    });

    if (dbError) {
      setError(dbError.message);
      setMembers([]);
    } else {
      setError(null);
      // The function returns a flat row; the UI wants the user fields nested.
      setMembers(
        ((data ?? []) as FlatMemberRow[]).map(({ name, email, avatar_url, phone, ...m }) => ({
          ...m,
          user: { name, email, avatar_url, phone },
        }))
      );
    }
    setLoading(false);
  }, [communityId]);

  useEffect(() => {
    void fetchMembers();
  }, [fetchMembers]);

  return { members, loading, error, refresh: fetchMembers };
}

/**
 * Set your own flat numbers.
 *
 * The founder of a society needs this: their admin row is created by a
 * trigger at approval time, and a trigger has no idea which flat they own,
 * so it starts empty. Members who joined by code set theirs on the way in.
 */
export async function updateMyUnits(
  memberId: string,
  unitNumbers: string[]
): Promise<{ error: string | null }> {
  const supabase = client();
  if (!supabase) return { error: NOT_CONNECTED };

  const { error } = await supabase
    .from('community_members')
    .update({ unit_numbers: unitNumbers })
    .eq('id', memberId);

  return { error: error ? error.message : null };
}

/** Approve or reject a pending join request. Admins only, enforced in Postgres. */
export async function decideMembership(
  memberId: string,
  decision: 'approved' | 'rejected',
  adminId: string,
  reason?: string
): Promise<{ error: string | null }> {
  const supabase = client();
  if (!supabase) return { error: NOT_CONNECTED };

  const { error } = await supabase
    .from('community_members')
    .update({
      status: decision,
      approved_by: adminId,
      approved_at: new Date().toISOString(),
      rejection_reason: decision === 'rejected' ? (reason ?? null) : null,
    })
    .eq('id', memberId);

  return { error: error ? error.message : null };
}

/**
 * Promote a member to admin, or demote one back.
 *
 * Demoting the last remaining admin raises in Postgres, so a society can
 * never be left with nobody able to run it. That message is worth showing
 * verbatim -- it already says what to do about it.
 */
export async function setMemberRole(
  memberId: string,
  role: 'admin' | 'member'
): Promise<{ error: string | null }> {
  const supabase = client();
  if (!supabase) return { error: NOT_CONNECTED };

  const { error } = await supabase
    .from('community_members')
    .update({ role })
    .eq('id', memberId);

  return { error: error ? error.message : null };
}

/* ------------------------------------------------------------------ */
/* Announcements (free) and maintenance tickets (paid)                 */
/* ------------------------------------------------------------------ */

export interface Announcement {
  id: string;
  community_id: string;
  author_id: string;
  title: string;
  body: string;
  pinned: boolean;
  created_at: string;
  author_name: string | null;
}

export type TicketStatus = 'open' | 'acknowledged' | 'in_progress' | 'resolved';

export interface Ticket {
  id: string;
  community_id: string;
  raised_by: string;
  category: string;
  title: string;
  description: string;
  location: string | null;
  priority: 'low' | 'medium' | 'high';
  status: TicketStatus;
  images: string[];
  admin_notes: string | null;
  resolved_at: string | null;
  created_at: string;
  raised_by_name: string | null;
  raised_by_units: string[];
}

export const TICKET_CATEGORIES = [
  { value: 'lift', label: 'Lift', icon: 'ri-riding-line' },
  { value: 'water', label: 'Water', icon: 'ri-drop-line' },
  { value: 'electricity', label: 'Electricity', icon: 'ri-flashlight-line' },
  { value: 'security', label: 'Security', icon: 'ri-shield-check-line' },
  { value: 'parking', label: 'Parking', icon: 'ri-car-line' },
  { value: 'cleaning', label: 'Cleaning', icon: 'ri-brush-line' },
  { value: 'common_area', label: 'Common area', icon: 'ri-community-line' },
  { value: 'other', label: 'Other', icon: 'ri-more-line' },
] as const;

/** Announcements for one society. Reading is free; only admins can post. */
export function useAnnouncements(communityId: string | undefined) {
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    const supabase = client();
    if (!supabase || !communityId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data, error: dbError } = await supabase.rpc('get_community_announcements', {
      p_community: communityId,
    });
    if (dbError) {
      setError(dbError.message);
      setAnnouncements([]);
    } else {
      setError(null);
      setAnnouncements((data ?? []) as Announcement[]);
    }
    setLoading(false);
  }, [communityId]);

  useEffect(() => {
    void fetchAll();
  }, [fetchAll]);

  return { announcements, loading, error, refresh: fetchAll };
}

export async function postAnnouncement(
  communityId: string,
  authorId: string,
  title: string,
  body: string,
  pinned = false
): Promise<{ error: string | null }> {
  const supabase = client();
  if (!supabase) return { error: NOT_CONNECTED };

  const { error } = await supabase.from('community_announcements').insert({
    community_id: communityId,
    author_id: authorId,
    title,
    body,
    pinned,
  });

  if (!error) return { error: null };
  if (error.code === '42501') return { error: 'Only a society admin can post a notice.' };
  return { error: error.message };
}

export async function deleteAnnouncement(id: string): Promise<{ error: string | null }> {
  const supabase = client();
  if (!supabase) return { error: NOT_CONNECTED };
  const { error } = await supabase.from('community_announcements').delete().eq('id', id);
  return { error: error ? error.message : null };
}

/** Maintenance tickets for one society. Reading is free; raising needs a plan. */
export function useTickets(communityId: string | undefined) {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    const supabase = client();
    if (!supabase || !communityId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data, error: dbError } = await supabase.rpc('get_community_tickets', {
      p_community: communityId,
    });
    if (dbError) {
      setError(dbError.message);
      setTickets([]);
    } else {
      setError(null);
      setTickets((data ?? []) as Ticket[]);
    }
    setLoading(false);
  }, [communityId]);

  useEffect(() => {
    void fetchAll();
  }, [fetchAll]);

  return { tickets, loading, error, refresh: fetchAll };
}

export interface CreateTicketInput {
  category: string;
  title: string;
  description: string;
  location?: string;
  priority: 'low' | 'medium' | 'high';
}

export async function createTicket(
  communityId: string,
  userId: string,
  input: CreateTicketInput
): Promise<{ error: string | null }> {
  const supabase = client();
  if (!supabase) return { error: NOT_CONNECTED };

  const { error } = await supabase.from('community_tickets').insert({
    community_id: communityId,
    raised_by: userId,
    ...input,
  });

  if (!error) return { error: null };
  // The only RLS refusal on this path that a member can actually hit is
  // the entitlement -- membership was already proven to load this screen.
  if (error.code === '42501') {
    return { error: 'Your society needs an active plan before issues can be raised.' };
  }
  return { error: error.message };
}

/** Admin-only in practice: a trigger rejects a status change from anyone else. */
export async function setTicketStatus(
  ticketId: string,
  status: TicketStatus,
  adminNotes?: string
): Promise<{ error: string | null }> {
  const supabase = client();
  if (!supabase) return { error: NOT_CONNECTED };

  const patch: Record<string, unknown> = { status };
  if (adminNotes !== undefined) patch.admin_notes = adminNotes;

  const { error } = await supabase.from('community_tickets').update(patch).eq('id', ticketId);
  return { error: error ? error.message : null };
}

/* ------------------------------------------------------------------ */
/* Society plan checkout                                               */
/* ------------------------------------------------------------------ */

export const SOCIETY_PLAN = {
  id: 'society_annual' as const,
  baseRupees: 4999,
  gstRupees: 900,
  totalRupees: 5899,
  period: 'a year',
};

/**
 * Buy or renew the society plan.
 *
 * Deliberately a copy of the Pro flow's shape rather than a shared
 * abstraction: the two differ in who is authorised (an admin of one
 * building, not an owner), what is credited (a community, not a user),
 * and what the recovery text should say. Merging them would mean a
 * function with two of everything, on the one code path where a subtle
 * mistake costs somebody real money.
 *
 * Resolves { cancelled: true } when the admin closes the Razorpay window
 * without paying -- nothing happened, and that is not an error.
 */
export async function startSocietyPlanCheckout(
  communityId: string
): Promise<{ error: string | null; cancelled?: boolean }> {
  const supabase = client();
  if (!supabase) return { error: NOT_CONNECTED };

  const { data: orderData, error: orderError } = await supabase.functions.invoke(
    'create-society-subscription-order',
    { body: { plan: SOCIETY_PLAN.id, communityId } }
  );
  if (orderError || !orderData?.orderId) {
    return {
      error:
        (await functionErrorMessage(orderError)) ||
        'Could not start this purchase. Please try again.',
    };
  }

  // Recovery: a previous attempt was paid but never verified because the
  // browser closed mid-checkout. Reopening Razorpay would fail -- it
  // refuses an already-paid order -- so finish the activation instead.
  // The order id is present on this response too, which is why the guard
  // above lets it through.
  if (orderData.alreadyPaid) {
    const { data: recovered, error: recoverError } = await supabase.functions.invoke(
      'verify-society-subscription',
      {
        body: {
          billingRowId: orderData.billingRowId,
          razorpay_order_id: orderData.orderId,
          razorpay_payment_id: orderData.paymentId,
          recoverPaidOrder: true,
        },
      }
    );
    if (recoverError || !recovered?.success) {
      return {
        error:
          (await functionErrorMessage(recoverError)) ||
          'This society plan has already been paid for but we could not activate it automatically. Please contact support.',
      };
    }
    return { error: null };
  }

  const scriptLoaded = await loadRazorpayScript();
  if (!scriptLoaded || !window.Razorpay) {
    return { error: 'Could not load the payment window. Check your connection and try again.' };
  }

  return new Promise((resolve) => {
    const razorpay = new window.Razorpay!({
      key: orderData.keyId,
      amount: orderData.amount,
      currency: orderData.currency,
      order_id: orderData.orderId,
      name: 'Bhavan',
      description: orderData.planLabel,
      prefill: { name: orderData.ownerName, email: orderData.ownerEmail },
      theme: { color: '#f59e0b' },
      handler: async (response: {
        razorpay_order_id: string;
        razorpay_payment_id: string;
        razorpay_signature: string;
      }) => {
        const { data: verifyData, error: verifyError } = await supabase.functions.invoke(
          'verify-society-subscription',
          {
            body: {
              billingRowId: orderData.billingRowId,
              razorpay_order_id: response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature: response.razorpay_signature,
            },
          }
        );
        if (verifyError || !verifyData?.success) {
          resolve({
            error:
              (await functionErrorMessage(verifyError)) ||
              'We could not confirm this payment. If money was deducted, contact support and your society plan will be activated manually.',
          });
          return;
        }
        resolve({ error: null });
      },
      modal: { ondismiss: () => resolve({ error: null, cancelled: true }) },
    });
    razorpay.open();
  });
}

/* ------------------------------------------------------------------ */
/* Ticket comments                                                     */
/* ------------------------------------------------------------------ */

export interface TicketComment {
  id: string;
  ticket_id: string;
  author_id: string;
  body: string;
  created_at: string;
  author_name: string | null;
  author_avatar: string | null;
  author_units: string[];
}

/**
 * The discussion on one issue. Loaded per ticket rather than with the
 * list -- a society with forty open issues should not fetch every thread
 * to render a page where most are collapsed.
 */
export function useTicketComments(ticketId: string | undefined) {
  const [comments, setComments] = useState<TicketComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    const supabase = client();
    if (!supabase || !ticketId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data, error: dbError } = await supabase.rpc('get_ticket_comments', {
      p_ticket: ticketId,
    });
    if (dbError) {
      setError(dbError.message);
      setComments([]);
    } else {
      setError(null);
      setComments((data ?? []) as TicketComment[]);
    }
    setLoading(false);
  }, [ticketId]);

  useEffect(() => {
    void fetchAll();
  }, [fetchAll]);

  return { comments, loading, error, refresh: fetchAll };
}

export async function postTicketComment(
  ticketId: string,
  userId: string,
  body: string
): Promise<{ error: string | null }> {
  const supabase = client();
  if (!supabase) return { error: NOT_CONNECTED };

  const { error } = await supabase
    .from('community_ticket_comments')
    .insert({ ticket_id: ticketId, author_id: userId, body });

  if (!error) return { error: null };
  // Membership was already proven to see the thread, so an RLS refusal
  // here means the society's plan has lapsed.
  if (error.code === '42501') {
    return { error: 'Your society needs an active plan to add comments.' };
  }
  return { error: error.message };
}

export async function deleteTicketComment(id: string): Promise<{ error: string | null }> {
  const supabase = client();
  if (!supabase) return { error: NOT_CONNECTED };
  const { error } = await supabase.from('community_ticket_comments').delete().eq('id', id);
  return { error: error ? error.message : null };
}
