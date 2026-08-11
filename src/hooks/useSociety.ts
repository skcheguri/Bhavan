import { useState, useEffect, useCallback } from 'react';
import { getSupabase, isSupabaseConnected, functionErrorMessage } from '@/lib/supabase';
import { loadRazorpayScript } from '@/lib/razorpay';

/**
 * The apartment complex / villa community feature.
 *
 * Named "society" throughout the UI (the word "community" historically
 * belonged to the public discussion forum, removed as out of MVP scope
 * in migration 125). The database tables are still `communities` and
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
  /** pending | active | rejected | closed */
  status: string;
  rejection_reason: string | null;
  deletion_requested_at: string | null;
  deletion_reason: string | null;
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
  /** The society currently being viewed, if any. */
  society: Society | null;
  /** Their membership row in that society. May be pending or rejected. */
  membership: SocietyMember | null;
  /** Every society this user belongs to. One entry for most owners. */
  memberships: SocietyMembership[];
  /** Switch which society is being viewed. */
  selectSociety: (communityId: string) => void;
  /** Whether they have cleared Bhavan's owner verification. */
  verifiedOwner: boolean;
  /** Whether the SOCIETY has an active plan. Never about this user. */
  isPaid: boolean;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

/** A membership plus the society it is in, as the switcher needs them. */
export interface SocietyMembership {
  member: SocietyMember;
  society: Society;
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
  const [memberships, setMemberships] = useState<SocietyMembership[]>([]);
  const [verifiedOwner, setVerifiedOwner] = useState(false);
  const [isPaid, setIsPaid] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Which society is on screen. Null means "whichever is first".
  const [selectedId, setSelectedId] = useState<string | null>(null);

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
      // No limit. An owner with flats in two buildings has two
      // memberships, and capping this at one silently hid the second --
      // they could see only whichever they joined most recently, with no
      // indication the other existed.
      supabase
        .from('community_members')
        .select('*, community:communities(*)')
        .eq('user_id', userId)
        .order('created_at', { ascending: true }),
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

    const all = (rows ?? []) as (SocietyMember & { community: Society | null })[];
    const usable: SocietyMembership[] = all
      .filter((r) => r.community)
      .map(({ community, ...member }) => ({ member, society: community as Society }));
    setMemberships(usable);

    // Keep showing whichever society was selected if it is still there,
    // so a refresh after approving a member does not jump the admin back
    // to a different building.
    const current =
      usable.find((m) => m.society.id === selectedId) ?? usable[0] ?? null;

    if (current) {
      setMembership(current.member);
      setSociety(current.society);
      // Asked of the database, for the same reason as the verification
      // gate: the client is never the authority on what has been paid for.
      const { data: paid } = await supabase.rpc('community_is_paid', {
        p_community: current.society.id,
      });
      setIsPaid(paid === true);
    } else {
      // No membership: fall back to a society they registered and are
      // still waiting on. A society they created that has been approved
      // always has a membership row, so anything found here is unreviewed.
      setMembership(null);
      setSociety((created?.[0] as Society | undefined) ?? null);
      setIsPaid(false);
    }
    setLoading(false);
  }, [userId, selectedId]);

  useEffect(() => {
    void fetchAll();
  }, [fetchAll]);

  return {
    society,
    membership,
    memberships,
    selectSociety: setSelectedId,
    verifiedOwner,
    isPaid,
    loading,
    error,
    refresh: fetchAll,
  };
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

/**
 * Remove a membership: an admin removing someone, or a member leaving.
 *
 * The society keeps its history. Tickets, comments and contributions
 * reference the user rather than the membership row, so an issue does not
 * stop having been reported because the reporter moved out, and a
 * confirmed contribution stays in the ledger the treasurer reconciled.
 */
export async function removeMembership(memberId: string): Promise<{ error: string | null }> {
  const supabase = client();
  if (!supabase) return { error: NOT_CONNECTED };

  const { error } = await supabase.from('community_members').delete().eq('id', memberId);
  // Postgres phrases the only-admin refusal for a reader already.
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
  updated_at: string;
  author_name: string | null;
}

/** How many rows a "show more" list asks for at a time. */
const PAGE = 20;

export type TicketStatus = 'open' | 'assigned' | 'acknowledged' | 'in_progress' | 'resolved';

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
  assigned_vendor_id: string | null;
  assigned_vendor_name: string | null;
  assigned_vendor_phone: string | null;
  assigned_vendor_trade: string | null;
  assigned_at: string | null;
  vendor_would_use_again: boolean | null;
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
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetches one page. `append` distinguishes "show more" from a refresh:
  // after posting or editing, the list must be rebuilt from the top rather
  // than grown, or the new row appears twice.
  const fetchPage = useCallback(
    async (offset: number, append: boolean) => {
      const supabase = client();
      if (!supabase || !communityId) {
        setLoading(false);
        return;
      }
      if (append) setLoadingMore(true);
      else setLoading(true);

      const { data, error: dbError } = await supabase.rpc('get_community_announcements', {
        p_community: communityId,
        p_limit: PAGE,
        p_offset: offset,
      });

      if (dbError) {
        setError(dbError.message);
        if (!append) setAnnouncements([]);
      } else {
        setError(null);
        const rows = (data ?? []) as (Announcement & { total_count: number })[];
        setTotal(rows[0]?.total_count ?? (append ? total : 0));
        setAnnouncements((prev) => (append ? [...prev, ...rows] : rows));
      }
      setLoading(false);
      setLoadingMore(false);
    },
    [communityId, total]
  );

  const refresh = useCallback(() => fetchPage(0, false), [fetchPage]);
  const loadMore = useCallback(
    () => fetchPage(announcements.length, true),
    [fetchPage, announcements.length]
  );

  useEffect(() => {
    void fetchPage(0, false);
    // fetchPage depends on `total`, which it also sets -- including it here
    // would refetch page one every time a page lands.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [communityId]);

  return {
    announcements,
    total,
    hasMore: announcements.length < total,
    loading,
    loadingMore,
    error,
    refresh,
    loadMore,
  };
}

/**
 * Edit a notice in place.
 *
 * Deliberately does NOT re-notify. The notification trigger is on INSERT
 * only, so fixing a typo does not push another alert to every owner in the
 * building -- which is what made "delete and repost" the previous
 * workaround so unattractive.
 */
export async function updateAnnouncement(
  id: string,
  patch: { title: string; body: string; pinned: boolean }
): Promise<{ error: string | null }> {
  const supabase = client();
  if (!supabase) return { error: NOT_CONNECTED };

  const { error } = await supabase.from('community_announcements').update(patch).eq('id', id);
  if (!error) return { error: null };
  if (error.code === '42501') return { error: 'Only a society admin can edit a notice.' };
  return { error: error.message };
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

/* ------------------------------------------------------------------ */
/* Polls                                                              */
/* ------------------------------------------------------------------ */

export interface PollOption {
  id: string;
  label: string;
  position: number;
  /** Null until the member has voted or the poll has closed. */
  votes: number | null;
  /** Names, on a poll the admin marked non-anonymous. Null otherwise. */
  voters: string[] | null;
}

export interface Poll {
  id: string;
  community_id: string;
  author_id: string;
  question: string;
  allow_multiple: boolean;
  is_anonymous: boolean;
  closed_at: string | null;
  /** The deadline, if the admin set one. */
  closes_at: string | null;
  /**
   * Whether the poll is shut, worked out by the database from both dates
   * and its own clock. Deliberately not derived here: the browser's clock
   * is not the server's, and a card reading "open" beside a vote button
   * the server will refuse is the drift the single definition exists to
   * prevent.
   */
  is_closed: boolean;
  created_at: string;
  author_name: string | null;
  has_voted: boolean;
  voter_count: number;
  results_visible: boolean;
  /**
   * What the signed-in member chose. Always null on an anonymous poll --
   * nothing recorded it, which is the point. The panel says so rather
   * than leaving someone unsure their vote landed.
   */
  my_option_ids: string[] | null;
  options: PollOption[];
}

/** Polls for one society. Reading is free; only admins can create one. */
export function usePolls(communityId: string | undefined) {
  const [polls, setPolls] = useState<Poll[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchPage = useCallback(
    async (offset: number, append: boolean) => {
      const supabase = client();
      if (!supabase || !communityId) {
        setLoading(false);
        return;
      }
      if (append) setLoadingMore(true);
      else setLoading(true);

      const { data, error: dbError } = await supabase.rpc('get_community_polls', {
        p_community: communityId,
        p_limit: PAGE,
        p_offset: offset,
      });

      if (dbError) {
        setError(dbError.message);
        if (!append) setPolls([]);
      } else {
        setError(null);
        const rows = (data ?? []) as unknown as (Omit<Poll, 'options'> & {
          options: PollOption[];
          total_count: number;
        })[];
        setTotal(rows[0]?.total_count ?? (append ? total : 0));
        const mapped = rows.map((r) => ({ ...r, options: r.options ?? [] })) as Poll[];
        setPolls((prev) => (append ? [...prev, ...mapped] : mapped));
      }
      setLoading(false);
      setLoadingMore(false);
    },
    [communityId, total]
  );

  const refresh = useCallback(() => fetchPage(0, false), [fetchPage]);
  const loadMore = useCallback(() => fetchPage(polls.length, true), [fetchPage, polls.length]);

  useEffect(() => {
    void fetchPage(0, false);
    // fetchPage depends on `total`, which it also sets -- including it here
    // would refetch page one every time a page lands.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [communityId]);

  return {
    polls,
    total,
    hasMore: polls.length < total,
    loading,
    loadingMore,
    error,
    refresh,
    loadMore,
  };
}

/**
 * The poll and its answers are written by one function, so a member is
 * never notified about a poll that has nothing to click yet.
 */
export async function createPoll(
  communityId: string,
  question: string,
  allowMultiple: boolean,
  isAnonymous: boolean,
  options: string[],
  closesAt: string | null = null
): Promise<{ error: string | null }> {
  const supabase = client();
  if (!supabase) return { error: NOT_CONNECTED };

  const { error } = await supabase.rpc('create_community_poll', {
    p_community: communityId,
    p_question: question,
    p_allow_multiple: allowMultiple,
    p_is_anonymous: isAnonymous,
    p_options: options,
    p_closes_at: closesAt,
  });
  return { error: error ? error.message : null };
}

export async function castPollVote(
  pollId: string,
  optionIds: string[]
): Promise<{ error: string | null }> {
  const supabase = client();
  if (!supabase) return { error: NOT_CONNECTED };

  const { error } = await supabase.rpc('cast_poll_vote', {
    p_poll: pollId,
    p_option_ids: optionIds,
  });
  return { error: error ? error.message : null };
}

/**
 * Closing is the only edit a poll accepts -- a trigger pins the question,
 * the answer mode and the anonymity setting, so a poll cannot be reworded
 * under people who have already answered it.
 */
export async function closePoll(pollId: string): Promise<{ error: string | null }> {
  const supabase = client();
  if (!supabase) return { error: NOT_CONNECTED };

  const { error } = await supabase
    .from('community_polls')
    .update({ closed_at: new Date().toISOString() })
    .eq('id', pollId);

  if (!error) return { error: null };
  if (error.code === '42501') return { error: 'Only a society admin can close a poll.' };
  return { error: error.message };
}

export async function deletePoll(pollId: string): Promise<{ error: string | null }> {
  const supabase = client();
  if (!supabase) return { error: NOT_CONNECTED };
  const { error } = await supabase.from('community_polls').delete().eq('id', pollId);
  if (!error) return { error: null };
  if (error.code === '42501') return { error: 'Only a society admin can delete a poll.' };
  return { error: error.message };
}

/** Maintenance tickets for one society. Reading is free; raising needs a plan. */
export function useTickets(communityId: string | undefined) {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchPage = useCallback(
    async (offset: number, append: boolean) => {
      const supabase = client();
      if (!supabase || !communityId) {
        setLoading(false);
        return;
      }
      if (append) setLoadingMore(true);
      else setLoading(true);

      const { data, error: dbError } = await supabase.rpc('get_community_tickets', {
        p_community: communityId,
        p_limit: PAGE,
        p_offset: offset,
      });

      if (dbError) {
        setError(dbError.message);
        if (!append) setTickets([]);
      } else {
        setError(null);
        const rows = (data ?? []) as (Ticket & { total_count: number })[];
        setTotal(rows[0]?.total_count ?? (append ? total : 0));
        setTickets((prev) => (append ? [...prev, ...rows] : rows));
      }
      setLoading(false);
      setLoadingMore(false);
    },
    [communityId, total]
  );

  const refresh = useCallback(() => fetchPage(0, false), [fetchPage]);
  const loadMore = useCallback(() => fetchPage(tickets.length, true), [fetchPage, tickets.length]);

  useEffect(() => {
    void fetchPage(0, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [communityId]);

  return {
    tickets,
    total,
    hasMore: tickets.length < total,
    loading,
    loadingMore,
    error,
    refresh,
    loadMore,
  };
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

/* ------------------------------------------------------------------ */
/* Fund collections                                                    */
/*                                                                     */
/* Bhavan handles no money here. The society publishes its own UPI id,  */
/* owners pay it directly, and this records who says they paid and what */
/* the admin confirmed. See migration 085 before changing that.        */
/* ------------------------------------------------------------------ */

export interface Collection {
  id: string;
  community_id: string;
  created_by: string;
  title: string;
  purpose: string;
  target_rupees: number | null;
  mode: 'per_flat' | 'open';
  per_flat_rupees: number | null;
  upi_id: string | null;
  payee_name: string | null;
  deadline: string | null;
  status: 'open' | 'closed';
  created_at: string;
}

/** One approved member and their payment, or the absence of one. */
export interface CollectionRow {
  user_id: string;
  name: string | null;
  units: string[];
  contribution_id: string | null;
  amount_rupees: number | null;
  reference: string | null;
  note: string | null;
  status: 'none' | 'claimed' | 'confirmed' | 'rejected';
  created_at: string | null;
  confirmed_at: string | null;
  confirmed_by_name: string | null;
}

export function useCollections(communityId: string | undefined) {
  const [collections, setCollections] = useState<Collection[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    const supabase = client();
    if (!supabase || !communityId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data, error: dbError } = await supabase
      .from('community_collections')
      .select('*')
      .eq('community_id', communityId)
      .order('status', { ascending: true })
      .order('created_at', { ascending: false });

    if (dbError) {
      setError(dbError.message);
      setCollections([]);
    } else {
      setError(null);
      setCollections((data ?? []) as Collection[]);
    }
    setLoading(false);
  }, [communityId]);

  useEffect(() => {
    void fetchAll();
  }, [fetchAll]);

  return { collections, loading, error, refresh: fetchAll };
}

/**
 * Every approved member and what they have (or have not) paid.
 *
 * Deliberately keyed on members rather than contributions: the missing
 * payments are what a treasurer is chasing, and a list of contributions
 * cannot show an absence.
 */
export function useCollectionStatus(collectionId: string | undefined) {
  const [rows, setRows] = useState<CollectionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    const supabase = client();
    if (!supabase || !collectionId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data, error: dbError } = await supabase.rpc('get_collection_status', {
      p_collection: collectionId,
    });
    if (dbError) {
      setError(dbError.message);
      setRows([]);
    } else {
      setError(null);
      setRows((data ?? []) as CollectionRow[]);
    }
    setLoading(false);
  }, [collectionId]);

  useEffect(() => {
    void fetchAll();
  }, [fetchAll]);

  return { rows, loading, error, refresh: fetchAll };
}

export interface CreateCollectionInput {
  title: string;
  purpose: string;
  mode: 'per_flat' | 'open';
  perFlatRupees?: number;
  targetRupees?: number;
  upiId?: string;
  payeeName?: string;
  deadline?: string;
}

export async function createCollection(
  communityId: string,
  userId: string,
  input: CreateCollectionInput
): Promise<{ error: string | null }> {
  const supabase = client();
  if (!supabase) return { error: NOT_CONNECTED };

  const { error } = await supabase.from('community_collections').insert({
    community_id: communityId,
    created_by: userId,
    title: input.title,
    purpose: input.purpose,
    mode: input.mode,
    per_flat_rupees: input.perFlatRupees ?? null,
    target_rupees: input.targetRupees ?? null,
    upi_id: input.upiId ?? null,
    payee_name: input.payeeName ?? null,
    deadline: input.deadline ?? null,
  });

  if (!error) return { error: null };
  if (error.code === '42501') {
    return { error: 'Your society needs an active plan to start a collection.' };
  }
  return { error: error.message };
}

export async function closeCollection(
  id: string,
  status: 'open' | 'closed'
): Promise<{ error: string | null }> {
  const supabase = client();
  if (!supabase) return { error: NOT_CONNECTED };
  const { error } = await supabase.from('community_collections').update({ status }).eq('id', id);
  return { error: error ? error.message : null };
}

/**
 * Record that you have paid. Always lands as `claimed` whatever is sent --
 * a trigger rewrites it -- because a claim is not money until an admin
 * has found it in the account.
 */
export async function recordContribution(
  collectionId: string,
  userId: string,
  amountRupees: number,
  reference?: string,
  note?: string
): Promise<{ error: string | null }> {
  const supabase = client();
  if (!supabase) return { error: NOT_CONNECTED };

  const { error } = await supabase.from('community_contributions').upsert(
    {
      collection_id: collectionId,
      user_id: userId,
      amount_rupees: amountRupees,
      reference: reference ?? null,
      note: note ?? null,
    },
    { onConflict: 'collection_id,user_id' }
  );

  if (!error) return { error: null };
  if (error.code === '42501') return { error: 'Only members of this society can contribute.' };
  return { error: error.message };
}

/** Admin-only in practice: a trigger rejects a status change from anyone else. */
export async function decideContribution(
  contributionId: string,
  status: 'confirmed' | 'rejected',
  adminId: string
): Promise<{ error: string | null }> {
  const supabase = client();
  if (!supabase) return { error: NOT_CONNECTED };

  const { error } = await supabase
    .from('community_contributions')
    .update({ status, confirmed_by: adminId })
    .eq('id', contributionId);

  return { error: error ? error.message : null };
}

/* ------------------------------------------------------------------ */
/* Service vendors -- the people a society already calls               */
/*                                                                     */
/* No accounts, no login, no fourth role. A vendor is a name, a trade   */
/* and a phone number an admin keeps in a list; the app puts that name  */
/* on the ticket and offers to dial it.                                */
/* ------------------------------------------------------------------ */

export interface ServiceVendor {
  id: string;
  /** Exactly one of these is set -- a vendor belongs to a society or an owner. */
  community_id: string | null;
  owner_id: string | null;
  name: string;
  trade: string;
  phone: string;
  notes: string | null;
  active: boolean;
  created_at: string;
}

/**
 * A contractor list, scoped either to a society or to one owner.
 *
 * Most owners on Bhavan are not in a society, and their tenant's leaking
 * tap hangs for the same reason a society ticket did -- so the same list
 * has to serve both, keyed on whichever scope the caller has.
 */
export function useVendors(scope: { communityId?: string; ownerId?: string }) {
  const communityId = scope.communityId;
  const ownerId = scope.ownerId;
  const [vendors, setVendors] = useState<ServiceVendor[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    const supabase = client();
    if (!supabase || (!communityId && !ownerId)) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const query = supabase
      .from('service_vendors')
      .select('*')
      .order('active', { ascending: false })
      .order('name', { ascending: true });

    const { data, error: dbError } = communityId
      ? await query.eq('community_id', communityId)
      : await query.eq('owner_id', ownerId!);

    if (dbError) {
      setError(dbError.message);
      setVendors([]);
    } else {
      setError(null);
      setVendors((data ?? []) as ServiceVendor[]);
    }
    setLoading(false);
  }, [communityId, ownerId]);

  useEffect(() => {
    void fetchAll();
  }, [fetchAll]);

  return { vendors, loading, error, refresh: fetchAll };
}

export async function addVendor(
  scope: { communityId?: string; ownerId?: string },
  userId: string,
  input: { name: string; trade: string; phone: string; notes?: string }
): Promise<{ error: string | null }> {
  const supabase = client();
  if (!supabase) return { error: NOT_CONNECTED };

  const { error } = await supabase.from('service_vendors').insert({
    // Exactly one, enforced by a CHECK in the database too.
    community_id: scope.communityId ?? null,
    owner_id: scope.communityId ? null : (scope.ownerId ?? null),
    created_by: userId,
    name: input.name,
    trade: input.trade,
    phone: input.phone,
    notes: input.notes ?? null,
  });

  if (!error) return { error: null };
  if (error.code === '42501') {
    return { error: 'Your society needs an active plan to keep a contractor list.' };
  }
  return { error: error.message };
}

/**
 * Retire a vendor rather than delete them. Old tickets still name the
 * person who did the work, and history should not rewrite itself because
 * a society changed plumber.
 */
export async function setVendorActive(
  id: string,
  active: boolean
): Promise<{ error: string | null }> {
  const supabase = client();
  if (!supabase) return { error: NOT_CONNECTED };
  const { error } = await supabase.from('service_vendors').update({ active }).eq('id', id);
  return { error: error ? error.message : null };
}

/** Assign, or pass null to unassign. Admin-only, enforced by a trigger. */
export async function assignTicketVendor(
  ticketId: string,
  vendorId: string | null
): Promise<{ error: string | null }> {
  const supabase = client();
  if (!supabase) return { error: NOT_CONNECTED };

  const { error } = await supabase
    .from('community_tickets')
    .update({ assigned_vendor_id: vendorId })
    .eq('id', ticketId);

  return { error: error ? error.message : null };
}

/**
 * A wa.me link, not a tel: link.
 *
 * Indian trades run on WhatsApp, and this needs no SMS provider, no
 * template approval and no DLT registration -- it opens from the admin's
 * own phone. Digits only, with 91 assumed when no country code is given.
 */
export function whatsappLink(phone: string, message: string): string {
  const digits = phone.replace(/\D/g, '');
  const withCode = digits.length === 10 ? `91${digits}` : digits;
  return `https://wa.me/${withCode}?text=${encodeURIComponent(message)}`;
}

/**
 * Record whether the contractor would be used again.
 *
 * Asked of whoever engaged them -- the society admin or the landlord --
 * because that is the person deciding whether to ring them next time.
 * Nothing surfaces it yet; it is collected now so that neighbourhood
 * recommendations have history to work from when they arrive, rather
 * than launching empty and being useless for a year.
 */
export async function rateTicketVendor(
  ticketId: string,
  wouldUseAgain: boolean
): Promise<{ error: string | null }> {
  const supabase = client();
  if (!supabase) return { error: NOT_CONNECTED };
  const { error } = await supabase
    .from('community_tickets')
    .update({ vendor_would_use_again: wouldUseAgain })
    .eq('id', ticketId);
  return { error: error ? error.message : null };
}

/** The same question on a tenant's request, answered by the landlord. */
export async function rateRequestVendor(
  requestId: string,
  wouldUseAgain: boolean
): Promise<{ error: string | null }> {
  const supabase = client();
  if (!supabase) return { error: NOT_CONNECTED };
  const { error } = await supabase
    .from('maintenance_requests')
    .update({ vendor_would_use_again: wouldUseAgain })
    .eq('id', requestId);
  return { error: error ? error.message : null };
}

/** Assign a contractor to a tenant's request, or pass null to unassign. */
export async function assignRequestVendor(
  requestId: string,
  vendorId: string | null
): Promise<{ error: string | null }> {
  const supabase = client();
  if (!supabase) return { error: NOT_CONNECTED };
  const { error } = await supabase
    .from('maintenance_requests')
    .update({ assigned_vendor_id: vendorId })
    .eq('id', requestId);
  // "That contractor is not on your list" arrives already phrased.
  return { error: error ? error.message : null };
}

/* ------------------------------------------------------------------ */
/* Closing a society, and asking Bhavan to delete it                   */
/* ------------------------------------------------------------------ */

/**
 * Close or reopen. Self-service, reversible, and what most people mean
 * when they say they want to delete a society: the join code stops
 * resolving, nothing new can be posted, notifications stop, and members
 * keep their history.
 */
export async function setSocietyClosed(
  communityId: string,
  closed: boolean
): Promise<{ error: string | null }> {
  const supabase = client();
  if (!supabase) return { error: NOT_CONNECTED };

  const { error } = await supabase
    .from('communities')
    .update({ status: closed ? 'closed' : 'active' })
    .eq('id', communityId);

  // The status guard phrases its refusals for a reader already.
  return { error: error ? error.message : null };
}

/**
 * Ask Bhavan to delete the society for good.
 *
 * A request, not an action. A society's records belong to its members --
 * particularly the contribution ledger -- so one admin does not get to
 * destroy them alone.
 */
export async function requestSocietyDeletion(
  communityId: string,
  userId: string,
  reason: string
): Promise<{ error: string | null }> {
  const supabase = client();
  if (!supabase) return { error: NOT_CONNECTED };

  const { error } = await supabase
    .from('communities')
    .update({
      deletion_requested_at: new Date().toISOString(),
      deletion_requested_by: userId,
      deletion_reason: reason || null,
    })
    .eq('id', communityId);

  if (!error) return { error: null };
  if (error.code === '42501') return { error: 'Only a society admin can ask for this.' };
  return { error: error.message };
}

export async function cancelSocietyDeletion(
  communityId: string
): Promise<{ error: string | null }> {
  const supabase = client();
  if (!supabase) return { error: NOT_CONNECTED };
  const { error } = await supabase
    .from('communities')
    .update({ deletion_requested_at: null, deletion_requested_by: null, deletion_reason: null })
    .eq('id', communityId);
  return { error: error ? error.message : null };
}
