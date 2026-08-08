import { useState } from 'react';
import { Link } from 'react-router';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/useToast';
import { Shell, PageTitle, Notice, Field, Pip, inputCls } from './ui';
import { Notices, Maintenance } from './panels';
import { Funds } from './funds';
import {
  useSociety,
  useSocietyMembers,
  findSocietyByCode,
  requestToJoinSociety,
  createSociety,
  decideMembership,
  setMemberRole,
  removeMembership,
  updateMyUnits,
  startSocietyPlanCheckout,
  SOCIETY_PLAN,
  useAnnouncements,
  useTickets,
  useCollections,
  postAnnouncement,
  deleteAnnouncement,
  createTicket,
  setTicketStatus,
  TICKET_CATEGORIES,
  type Society,
  type SocietyPreview,
  type SocietyMember,
  type SocietyMembership,
  type Announcement,
  type Ticket,
  type TicketStatus,
} from '@/hooks/useSociety';

/**
 * "My Society" -- the apartment complex / villa community screen.
 *
 * There are six states a signed-in user can be in here and each one is a
 * different screen: not eligible, eligible but unaffiliated, pending,
 * rejected, member, admin. Collapsing any of them into a generic empty
 * state is what makes this kind of feature feel broken, because the user
 * cannot tell "we're waiting on your admin" apart from "this didn't work".
 */
export default function SocietyPage() {
  const { user } = useAuth();
  const { society, membership, memberships, selectSociety, verifiedOwner, isPaid, loading, error, refresh } =
    useSociety(user?.id);

  if (!user) return <SignedOut />;

  if (loading) {
    return (
      <Shell>
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 rounded w-56" />
          <div className="h-32 bg-gray-100 rounded-xl" />
          <div className="h-32 bg-gray-100 rounded-xl" />
        </div>
      </Shell>
    );
  }

  if (error) {
    return (
      <Shell>
        <Notice tone="error" icon="ri-error-warning-line" title="Couldn't load your society">
          {error}
          <button onClick={() => void refresh()} className="block mt-3 text-sm font-semibold underline">
            Try again
          </button>
        </Notice>
      </Shell>
    );
  }

  if (society && !membership) {
    // Registered and awaiting Bhavan's review -- there is no membership row
    // until it is approved. See the comment in useSociety.
    return <SocietyUnderReview society={society} />;
  }

  if (membership && society) {
    if (membership.status === 'pending') return <Pending society={society} membership={membership} />;
    if (membership.status === 'rejected') return <Rejected society={society} membership={membership} />;
    return (
      <SocietyHome
        society={society}
        membership={membership}
        memberships={memberships}
        onSwitch={selectSociety}
        userId={user.id}
        isPaid={isPaid}
        onRefresh={refresh}
      />
    );
  }

  if (!verifiedOwner) return <NotEligible />;

  return <JoinOrCreate userId={user.id} onDone={refresh} />;
}

/* ------------------------------------------------------------------ */
/* Layout helpers                                                      */
/* ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ */
/* Entry states                                                        */
/* ------------------------------------------------------------------ */

function SignedOut() {
  return (
    <Shell>
      <PageTitle title="My Society" />
      <Notice tone="info" icon="ri-lock-line" title="Sign in to continue">
        Societies are for verified property owners.{' '}
        <Link to="/login" className="font-semibold underline">
          Sign in
        </Link>{' '}
        to join yours.
      </Notice>
    </Shell>
  );
}

/**
 * The verification gate, explained rather than enforced.
 *
 * This screen exists because the alternative is a row-level security
 * error, which tells the user nothing they can act on.
 */
function NotEligible() {
  return (
    <Shell>
      <PageTitle
        title="My Society"
        subtitle="Manage your apartment complex or villa community in one place."
      />
      <Notice tone="warn" icon="ri-shield-check-line" title="Verify a property first">
        <p>
          A society is a group of verified owners, so we check ownership before anyone can join
          one. Add a property and upload your sale deed or tax receipt — once our team approves it,
          this page will let you join your society with a code.
        </p>
        <Link
          to="/owner-profile"
          className="inline-flex items-center gap-2 mt-3 px-4 py-2 bg-charcoal text-white rounded-lg text-sm font-semibold"
        >
          <i className="ri-home-4-line" />
          Go to my properties
        </Link>
      </Notice>

      <div className="mt-6 grid sm:grid-cols-3 gap-4">
        <Perk icon="ri-group-line" title="One owners' group" body="Every verified owner in your complex, in one place." />
        <Perk icon="ri-tools-line" title="Building maintenance" body="Raise issues about shared areas, not just your own flat." />
        <Perk icon="ri-megaphone-line" title="Announcements" body="Notices that reach every owner, without a WhatsApp group." />
      </div>
    </Shell>
  );
}

function Perk({ icon, title, body }: { icon: string; title: string; body: string }) {
  return (
    <div className="bg-white rounded-xl p-4 border border-black/5">
      <div className="w-9 h-9 rounded-lg bg-brand/10 flex items-center justify-center mb-2.5">
        <i className={`${icon} text-brand`} />
      </div>
      <p className="text-sm font-semibold text-charcoal">{title}</p>
      <p className="text-xs text-gray-500 mt-1 leading-relaxed">{body}</p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Join / create                                                       */
/* ------------------------------------------------------------------ */

function JoinOrCreate({ userId, onDone }: { userId: string; onDone: () => Promise<void> }) {
  const [tab, setTab] = useState<'join' | 'create'>('join');

  return (
    <Shell>
      <PageTitle
        title="My Society"
        subtitle="Join your apartment complex with a code, or register it if it isn't on Bhavan yet."
      />

      <div className="flex gap-1 p-1 bg-white rounded-xl border border-black/5 mb-6 w-full sm:w-auto sm:inline-flex">
        {(['join', 'create'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 sm:flex-none px-5 py-2 rounded-lg text-sm font-semibold transition-colors ${
              tab === t ? 'bg-charcoal text-white' : 'text-gray-500 hover:text-charcoal'
            }`}
          >
            {t === 'join' ? 'Join with a code' : 'Register a society'}
          </button>
        ))}
      </div>

      {tab === 'join' ? <JoinForm userId={userId} onDone={onDone} /> : <CreateForm userId={userId} onDone={onDone} />}
    </Shell>
  );
}

function JoinForm({ userId, onDone }: { userId: string; onDone: () => Promise<void> }) {
  const { addToast } = useToast();
  const [code, setCode] = useState('');
  const [found, setFound] = useState<SocietyPreview | null>(null);
  const [units, setUnits] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const lookup = async () => {
    setBusy(true);
    setErr(null);
    const { society, error } = await findSocietyByCode(code);
    setFound(society);
    setErr(error);
    setBusy(false);
  };

  const join = async () => {
    if (!found) return;
    // Owners of more than one flat are common, so accept a list.
    const list = units
      .split(',')
      .map((u) => u.trim())
      .filter(Boolean);
    if (list.length === 0) {
      setErr('Enter at least one flat or villa number.');
      return;
    }
    setBusy(true);
    const { error } = await requestToJoinSociety(found.id, userId, list);
    setBusy(false);
    if (error) {
      setErr(error);
      return;
    }
    addToast('Request sent. Your society admin will review it.', 'success');
    await onDone();
  };

  return (
    <div className="bg-white rounded-xl border border-black/5 p-6">
      <label className="block text-sm font-semibold text-charcoal mb-2">Society join code</label>
      <div className="flex gap-2">
        <input
          value={code}
          onChange={(e) => {
            setCode(e.target.value.toUpperCase());
            setFound(null);
            setErr(null);
          }}
          placeholder="e.g. CY9G6V"
          maxLength={12}
          className="flex-1 px-4 py-2.5 border border-gray-200 rounded-lg text-sm font-mono tracking-widest uppercase focus:outline-none focus:ring-2 focus:ring-brand/30"
        />
        <button
          onClick={() => void lookup()}
          disabled={busy || code.trim().length < 4}
          className="px-5 py-2.5 bg-charcoal text-white rounded-lg text-sm font-semibold disabled:opacity-40"
        >
          {busy ? '…' : 'Find'}
        </button>
      </div>
      <p className="text-xs text-gray-400 mt-2">Ask your society admin for the code.</p>

      {err && !found && (
        <p className="text-sm text-red-600 mt-3 flex items-start gap-1.5">
          <i className="ri-error-warning-line mt-0.5" />
          {err}
        </p>
      )}

      {found && (
        <div className="mt-5 pt-5 border-t border-gray-100">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-lg bg-brand/10 flex items-center justify-center flex-shrink-0">
              <i className={`${found.kind === 'villa' ? 'ri-home-8-line' : 'ri-building-2-line'} text-brand`} />
            </div>
            <div>
              <p className="font-semibold text-charcoal">{found.name}</p>
              <p className="text-xs text-gray-500 capitalize">
                {found.kind}
                {found.city ? ` · ${found.city}` : ''}
              </p>
            </div>
          </div>

          <label className="block text-sm font-semibold text-charcoal mb-2">
            Your flat / villa number
          </label>
          <input
            value={units}
            onChange={(e) => setUnits(e.target.value)}
            placeholder="A-402  (separate with commas if you own more than one)"
            className="w-full px-4 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand/30"
          />

          {err && <p className="text-sm text-red-600 mt-3">{err}</p>}

          <button
            onClick={() => void join()}
            disabled={busy}
            className="w-full mt-4 py-3 bg-brand text-white rounded-lg text-sm font-semibold disabled:opacity-40"
          >
            {busy ? 'Sending…' : 'Request to join'}
          </button>
          <p className="text-xs text-gray-400 mt-2 text-center">
            Your society admin approves new members.
          </p>
        </div>
      )}
    </div>
  );
}

function CreateForm({ userId, onDone }: { userId: string; onDone: () => Promise<void> }) {
  const { addToast } = useToast();
  const [form, setForm] = useState({ name: '', kind: 'apartment', address: '', city: '', state: '' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm({ ...form, [k]: e.target.value });

  const submit = async () => {
    if (!form.name.trim() || !form.address.trim() || !form.city.trim()) {
      setErr('Name, address and city are required.');
      return;
    }
    setBusy(true);
    const { error } = await createSociety(form, userId);
    setBusy(false);
    if (error) {
      setErr(error);
      return;
    }
    addToast('Submitted. We’ll review your society shortly.', 'success');
    await onDone();
  };

  return (
    <div className="bg-white rounded-xl border border-black/5 p-6">
      <Notice tone="info" icon="ri-information-line" title="We review new societies">
        To stop anyone claiming a building they don't live in, our team checks new societies before
        they go live. You'll become its first admin once it's approved.
      </Notice>

      <div className="grid sm:grid-cols-2 gap-4 mt-5">
        <Field label="Society name" className="sm:col-span-2">
          <input value={form.name} onChange={set('name')} placeholder="Green Meadows Phase 2" className={inputCls} />
        </Field>
        <Field label="Type">
          <select value={form.kind} onChange={set('kind')} className={inputCls}>
            <option value="apartment">Apartment complex</option>
            <option value="villa">Villa community</option>
            <option value="gated">Gated community</option>
          </select>
        </Field>
        <Field label="City">
          <input value={form.city} onChange={set('city')} placeholder="Hyderabad" className={inputCls} />
        </Field>
        <Field label="Address" className="sm:col-span-2">
          <input value={form.address} onChange={set('address')} placeholder="Street, locality, PIN" className={inputCls} />
        </Field>
        <Field label="State">
          <input value={form.state} onChange={set('state')} placeholder="Telangana" className={inputCls} />
        </Field>
      </div>

      {err && <p className="text-sm text-red-600 mt-4">{err}</p>}

      <button
        onClick={() => void submit()}
        disabled={busy}
        className="w-full mt-5 py-3 bg-brand text-white rounded-lg text-sm font-semibold disabled:opacity-40"
      >
        {busy ? 'Submitting…' : 'Submit for review'}
      </button>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Waiting states                                                      */
/* ------------------------------------------------------------------ */

/** You registered this society and Bhavan hasn't reviewed it yet. */
function SocietyUnderReview({ society }: { society: Society }) {
  if (society.status === 'rejected') {
    return (
      <Shell>
        <PageTitle title={society.name} />
        <Notice tone="error" icon="ri-close-circle-line" title="We couldn't approve this society">
          {society.rejection_reason ? <>Reason given: “{society.rejection_reason}”</> : <>No reason was given.</>}
          <p className="mt-2">
            <Link to="/contact" className="font-semibold underline">
              Contact us
            </Link>{' '}
            if you'd like this looked at again.
          </p>
        </Notice>
      </Shell>
    );
  }

  return (
    <Shell>
      <PageTitle title={society.name} />
      <Notice tone="warn" icon="ri-time-line" title="Your society is being reviewed">
        Our team is checking the details you submitted. We'll let you know once it's live, and
        you'll become its first admin — then you can share the join code with other owners.
      </Notice>
      <div className="mt-4 bg-white rounded-xl border border-black/5 p-5">
        <p className="text-sm font-semibold text-charcoal mb-1">Submitted</p>
        <p className="text-sm text-gray-600 capitalize">
          {society.kind} · {society.address}
          {society.city ? `, ${society.city}` : ''}
        </p>
      </div>
    </Shell>
  );
}

/** Your join request is waiting on a society admin. */
function Pending({ society, membership }: { society: Society; membership: SocietyMember }) {
  return (
    <Shell>
      <PageTitle title={society.name} />
      <Notice tone="warn" icon="ri-time-line" title="Waiting for approval">
        You asked to join as{' '}
        <span className="font-semibold">{membership.unit_numbers.join(', ')}</span>. An admin of{' '}
        {society.name} needs to approve it.
      </Notice>
    </Shell>
  );
}

function Rejected({ society, membership }: { society: Society; membership: SocietyMember }) {
  return (
    <Shell>
      <PageTitle title={society.name} />
      <Notice tone="error" icon="ri-close-circle-line" title="Your request wasn't approved">
        {membership.rejection_reason ? (
          <>Reason given: “{membership.rejection_reason}”</>
        ) : (
          <>No reason was given.</>
        )}
        <p className="mt-2">Contact your society admin if you think this is a mistake.</p>
      </Notice>
    </Shell>
  );
}

/* ------------------------------------------------------------------ */
/* The society itself                                                  */
/* ------------------------------------------------------------------ */

function SocietyHome({
  society,
  membership,
  memberships,
  onSwitch,
  userId,
  isPaid,
  onRefresh,
}: {
  society: Society;
  membership: SocietyMember;
  memberships: SocietyMembership[];
  onSwitch: (communityId: string) => void;
  userId: string;
  isPaid: boolean;
  onRefresh: () => Promise<void>;
}) {
  const isAdmin = membership.role === 'admin';
  const [tab, setTab] = useState<SocietyTab>('overview');
  const [units, setUnits] = useState(membership.unit_numbers);
  const { addToast } = useToast();

  // Loaded here rather than inside the members tab so the pending count is
  // known before the tab is opened -- that count is the only thing telling
  // an admin there is anything to do.
  const memberList = useSocietyMembers(isAdmin ? society.id : undefined);
  const pendingCount = memberList.members.filter((m) => m.status === 'pending').length;

  const ticketList = useTickets(society.id);
  const openTickets = ticketList.tickets.filter((t) => t.status !== 'resolved').length;
  const noticeList = useAnnouncements(society.id);
  const collectionList = useCollections(society.id);
  const openCollections = collectionList.collections.filter((c) => c.status === 'open').length;

  const tabs: SocietyTab[] = isAdmin
    ? ['overview', 'notices', 'maintenance', 'funds', 'members']
    : ['overview', 'notices', 'maintenance', 'funds'];

  const copyCode = () => {
    void navigator.clipboard?.writeText(society.join_code);
    addToast('Join code copied.', 'success');
  };

  // Only the parts that exist, or the header reads "Apartment · Hyderabad ·"
  // for a founder whose row was seeded by a trigger with no flat number.
  const subtitle = [society.kind, society.city, units.join(', ')].filter(Boolean).join(' · ');

  return (
    <Shell>
      {/* Only rendered when the owner actually has more than one building.
          A picker with a single entry is furniture. */}
      {memberships.length > 1 && (
        <div className="flex gap-1 p-1 bg-white rounded-xl border border-black/5 mb-4 overflow-x-auto sm:inline-flex">
          {memberships.map((m) => (
            <button
              key={m.society.id}
              onClick={() => onSwitch(m.society.id)}
              className={`flex-shrink-0 px-4 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                m.society.id === society.id
                  ? 'bg-charcoal text-white'
                  : 'text-gray-500 hover:text-charcoal'
              }`}
            >
              {m.society.name}
            </button>
          ))}
        </div>
      )}

      <div className="flex items-start justify-between gap-4 mb-6">
        <div className="min-w-0">
          <h1 className="text-2xl sm:text-3xl font-bold text-charcoal truncate">{society.name}</h1>
          <p className="text-sm text-gray-500 mt-1.5 capitalize">{subtitle}</p>
        </div>
        {isAdmin && (
          <span className="flex-shrink-0 px-3 py-1 rounded-full bg-amber-50 text-amber-700 text-xs font-semibold">
            <i className="ri-shield-star-line mr-1" />
            Admin
          </span>
        )}
      </div>

      {/* Wraps rather than scrolls. On a phone five tabs do not fit, and
          horizontal scroll gave no hint that Funds and Members existed --
          verified on a Pixel, where an admin could not see a waiting join
          request because its tab was off-screen. Two rows show everything. */}
      <div className="flex flex-wrap gap-1 p-1 bg-white rounded-xl border border-black/5 mb-6 sm:inline-flex sm:flex-nowrap">
        {tabs.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-shrink-0 px-4 sm:px-5 py-2 rounded-lg text-sm font-semibold capitalize transition-colors ${
              tab === t ? 'bg-charcoal text-white' : 'text-gray-500 hover:text-charcoal'
            }`}
          >
            {t === 'notices' ? 'Notices' : t === 'maintenance' ? 'Maintenance' : t === 'funds' ? 'Funds' : t}
            {/* Counts are the only thing telling anyone there is something
                to do here. Without them these tabs never get opened. */}
            {t === 'members' && pendingCount > 0 && (
              <Pip active={tab === t}>{pendingCount}</Pip>
            )}
            {t === 'maintenance' && openTickets > 0 && (
              <Pip active={tab === t}>{openTickets}</Pip>
            )}
            {t === 'funds' && openCollections > 0 && (
              <Pip active={tab === t}>{openCollections}</Pip>
            )}
          </button>
        ))}
      </div>

      {tab === 'notices' ? (
        <Notices
          list={noticeList}
          communityId={society.id}
          userId={userId}
          isAdmin={isAdmin}
        />
      ) : tab === 'maintenance' ? (
        <Maintenance
          list={ticketList}
          communityId={society.id}
          userId={userId}
          isAdmin={isAdmin}
          isPaid={isPaid}
        />
      ) : tab === 'funds' ? (
        <Funds
          list={collectionList}
          communityId={society.id}
          userId={userId}
          isAdmin={isAdmin}
          isPaid={isPaid}
        />
      ) : tab === 'members' ? (
        <Members list={memberList} adminId={userId} myMemberId={membership.id} />
      ) : (
        <div className="space-y-4">
          {units.length === 0 && (
            <SetMyUnits
              memberId={membership.id}
              onSaved={(next) => {
                setUnits(next);
                addToast('Flat number saved.', 'success');
              }}
            />
          )}

          {isAdmin && (
            <div className="bg-white rounded-xl border border-black/5 p-5">
              <p className="text-sm font-semibold text-charcoal mb-1">Join code</p>
              <p className="text-xs text-gray-500 mb-3">
                Share this with owners in your society. Only verified owners can use it.
              </p>
              <div className="flex items-center gap-2">
                <code className="px-4 py-2.5 bg-lightgray rounded-lg font-mono tracking-[0.3em] text-lg font-semibold text-charcoal">
                  {society.join_code}
                </code>
                <button
                  onClick={copyCode}
                  className="px-4 py-2.5 border border-gray-200 rounded-lg text-sm font-semibold text-charcoal hover:bg-lightgray"
                >
                  <i className="ri-file-copy-line mr-1.5" />
                  Copy
                </button>
              </div>
            </div>
          )}

          <div className="bg-white rounded-xl border border-black/5 p-5">
            <p className="text-sm font-semibold text-charcoal mb-1">Address</p>
            <p className="text-sm text-gray-600">
              {society.address}
              {society.city ? `, ${society.city}` : ''}
              {society.state ? `, ${society.state}` : ''}
            </p>
          </div>

          <PlanCard
            isPaid={isPaid}
            isAdmin={isAdmin}
            communityId={society.id}
            onPaid={onRefresh}
          />
        </div>
      )}
    </Shell>
  );
}

type SocietyTab = 'overview' | 'notices' | 'maintenance' | 'funds' | 'members';


/** What the building is on, what that unlocks, and how to buy it. */
function PlanCard({
  isPaid,
  isAdmin,
  communityId,
  onPaid,
}: {
  isPaid: boolean;
  isAdmin: boolean;
  communityId: string;
  onPaid: () => Promise<void>;
}) {
  const { addToast } = useToast();
  const [busy, setBusy] = useState(false);

  const buy = async () => {
    setBusy(true);
    const { error, cancelled } = await startSocietyPlanCheckout(communityId);
    setBusy(false);
    // Closing the Razorpay window is not a failure -- nothing happened,
    // and saying "something went wrong" would be a lie.
    if (cancelled) return;
    if (error) {
      addToast(error, 'error');
      return;
    }
    addToast('Society plan active. Every owner here can now report issues.', 'success');
    await onPaid();
  };

  if (isPaid) {
    return (
      <Notice tone="success" icon="ri-checkbox-circle-line" title="Society plan active">
        Maintenance tickets are open to every verified owner here, at no extra cost to them.
      </Notice>
    );
  }

  return (
    <Notice tone="info" icon="ri-vip-crown-line" title="Notices are free. Maintenance needs a plan.">
      <p>
        Your owners' group, the join code and notices all work as they are. A society plan adds
        shared maintenance tickets — one record of what's broken, who's on it, and when it was
        fixed — for every verified owner in the building.
      </p>
      {isAdmin ? (
        <>
          <p className="mt-2 font-semibold">
            ₹{SOCIETY_PLAN.totalRupees.toLocaleString('en-IN')} for {SOCIETY_PLAN.period}, whatever
            the size of your society — ₹{SOCIETY_PLAN.baseRupees.toLocaleString('en-IN')} plus ₹
            {SOCIETY_PLAN.gstRupees} GST. One subscription covers everyone; members pay nothing
            extra.
          </p>
          <button
            onClick={() => void buy()}
            disabled={busy}
            className="mt-3 px-5 py-2.5 bg-charcoal text-white rounded-lg text-sm font-semibold disabled:opacity-40"
          >
            {busy ? 'Opening payment…' : 'Start the society plan'}
          </button>
        </>
      ) : (
        <p className="mt-2">Ask a society admin to start one.</p>
      )}
    </Notice>
  );
}

/**
 * Prompt shown to anyone whose membership has no flat number on it. In
 * practice that is the society's founder, whose row is created by a
 * trigger that cannot know which flat they own.
 */
function SetMyUnits({
  memberId,
  onSaved,
}: {
  memberId: string;
  onSaved: (units: string[]) => void;
}) {
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const save = async () => {
    const list = value
      .split(',')
      .map((u) => u.trim())
      .filter(Boolean);
    if (list.length === 0) {
      setErr('Enter at least one flat or villa number.');
      return;
    }
    setBusy(true);
    const { error } = await updateMyUnits(memberId, list);
    setBusy(false);
    if (error) setErr(error);
    else onSaved(list);
  };

  return (
    <div className="bg-white rounded-xl border border-black/5 p-5">
      <p className="text-sm font-semibold text-charcoal mb-1">Which flat is yours?</p>
      <p className="text-xs text-gray-500 mb-3">
        Other owners will see this next to your name.
      </p>
      <div className="flex gap-2">
        <input
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setErr(null);
          }}
          placeholder="A-402  (separate with commas if you own more than one)"
          className={inputCls}
        />
        <button
          onClick={() => void save()}
          disabled={busy}
          className="px-5 py-2.5 bg-charcoal text-white rounded-lg text-sm font-semibold disabled:opacity-40 flex-shrink-0"
        >
          {busy ? 'Saving…' : 'Save'}
        </button>
      </div>
      {err && <p className="text-sm text-red-600 mt-2">{err}</p>}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Admin: members                                                      */
/* ------------------------------------------------------------------ */

function Members({
  list,
  adminId,
  myMemberId,
}: {
  list: ReturnType<typeof useSocietyMembers>;
  adminId: string;
  myMemberId: string;
}) {
  const { members, loading, error, refresh } = list;
  const { addToast } = useToast();
  const [busyId, setBusyId] = useState<string | null>(null);

  const act = async (id: string, fn: () => Promise<{ error: string | null }>) => {
    setBusyId(id);
    const { error: e } = await fn();
    setBusyId(null);
    // Postgres messages here are already user-facing ("This is the only
    // admin. Appoint another admin first.") so they are shown as-is.
    if (e) addToast(e, 'error');
    else await refresh();
  };

  const reject = async (m: SocietyMember) => {
    const reason = window.prompt(`Why are you rejecting ${m.user?.name ?? 'this request'}? (optional)`);
    if (reason === null) return;
    await act(m.id, () => decideMembership(m.id, 'rejected', adminId, reason || undefined));
  };

  // Both destructive and both irreversible from the app, so both confirm.
  // The wording says what survives, because "remove" reads like it erases
  // the person's history and it does not.
  const removeMember = async (m: SocietyMember) => {
    const who = m.user?.name ?? 'this owner';
    if (
      !window.confirm(
        `Remove ${who} from the society? They lose access to notices, issues and collections. Anything they reported or paid stays on the record.`
      )
    ) {
      return;
    }
    await act(m.id, () => removeMembership(m.id));
  };


  if (loading) return <div className="h-32 bg-gray-100 rounded-xl animate-pulse" />;
  if (error) return <Notice tone="error" icon="ri-error-warning-line" title="Couldn't load members">{error}</Notice>;

  const pending = members.filter((m) => m.status === 'pending');
  const approved = members.filter((m) => m.status === 'approved');

  return (
    <div className="space-y-6">
      <section>
        <h2 className="text-sm font-bold text-charcoal mb-3">
          Pending requests {pending.length > 0 && <span className="text-brand">({pending.length})</span>}
        </h2>
        {pending.length === 0 ? (
          <p className="text-sm text-gray-400 bg-white rounded-xl border border-black/5 p-5">
            Nothing waiting on you.
          </p>
        ) : (
          <div className="space-y-2">
            {pending.map((m) => (
              <MemberRow key={m.id} member={m} busy={busyId === m.id}>
                <button
                  onClick={() => void act(m.id, () => decideMembership(m.id, 'approved', adminId))}
                  disabled={busyId === m.id}
                  className="px-3 py-1.5 bg-brand text-white rounded-lg text-xs font-semibold disabled:opacity-40"
                >
                  Approve
                </button>
                <button
                  onClick={() => void reject(m)}
                  disabled={busyId === m.id}
                  className="px-3 py-1.5 border border-gray-200 text-charcoal rounded-lg text-xs font-semibold disabled:opacity-40"
                >
                  Reject
                </button>
              </MemberRow>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="text-sm font-bold text-charcoal mb-3">Members ({approved.length})</h2>
        <div className="space-y-2">
          {approved.map((m) => (
            <MemberRow key={m.id} member={m} busy={busyId === m.id}>
              {m.id === myMemberId ? (
                // Leaving lives on Overview, which every member can reach.
                <span className="text-xs text-gray-400 px-2">You</span>
              ) : (
                <>
                  <button
                    onClick={() =>
                      void act(m.id, () => setMemberRole(m.id, m.role === 'admin' ? 'member' : 'admin'))
                    }
                    disabled={busyId === m.id}
                    className="px-3 py-1.5 border border-gray-200 text-charcoal rounded-lg text-xs font-semibold disabled:opacity-40"
                  >
                    {m.role === 'admin' ? 'Remove admin' : 'Make admin'}
                  </button>
                  <button
                    onClick={() => void removeMember(m)}
                    disabled={busyId === m.id}
                    className="px-3 py-1.5 border border-gray-200 text-charcoal/60 rounded-lg text-xs font-semibold disabled:opacity-40 hover:border-red-300 hover:text-red-600"
                  >
                    Remove
                  </button>
                </>
              )}
            </MemberRow>
          ))}
        </div>
      </section>
    </div>
  );
}

function MemberRow({
  member,
  busy,
  children,
}: {
  member: SocietyMember;
  busy: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`bg-white rounded-xl border border-black/5 p-4 flex items-center gap-3 ${
        busy ? 'opacity-50' : ''
      }`}
    >
      <img
        src={member.user?.avatar_url || '/placeholders/avatar.svg'}
        alt=""
        className="w-9 h-9 rounded-full object-cover flex-shrink-0 bg-lightgray"
      />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-charcoal truncate">
          {member.user?.name || 'Owner'}
          {member.role === 'admin' && (
            <i className="ri-shield-star-fill text-amber-500 ml-1.5 text-xs" title="Admin" />
          )}
        </p>
        <p className="text-xs text-gray-500 truncate">
          {member.unit_numbers.join(', ')}
          {member.user?.email ? ` · ${member.user.email}` : ''}
        </p>
      </div>
      <div className="flex gap-2 flex-shrink-0">{children}</div>
    </div>
  );
}
