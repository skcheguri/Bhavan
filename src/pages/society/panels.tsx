import { useState } from 'react';
import { useToast } from '@/hooks/useToast';
import {
  postAnnouncement,
  deleteAnnouncement,
  createTicket,
  setTicketStatus,
  useTicketComments,
  postTicketComment,
  deleteTicketComment,
  TICKET_CATEGORIES,
  type useAnnouncements,
  type useTickets,
  type Announcement,
  type Ticket,
  type TicketStatus,
  type TicketComment,
} from '@/hooks/useSociety';
import { Notice, Field, EmptyState, inputCls } from './ui';

/* ------------------------------------------------------------------ */
/* Notices -- free                                                     */
/* ------------------------------------------------------------------ */

export function Notices({
  list,
  communityId,
  userId,
  isAdmin,
}: {
  list: ReturnType<typeof useAnnouncements>;
  communityId: string;
  userId: string;
  isAdmin: boolean;
}) {
  const { announcements, loading, error, refresh } = list;
  const { addToast } = useToast();
  const [composing, setComposing] = useState(false);
  const [form, setForm] = useState({ title: '', body: '', pinned: false });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async () => {
    if (!form.title.trim() || !form.body.trim()) {
      setErr('A notice needs a title and something to say.');
      return;
    }
    setBusy(true);
    const { error: e } = await postAnnouncement(
      communityId,
      userId,
      form.title.trim(),
      form.body.trim(),
      form.pinned
    );
    setBusy(false);
    if (e) {
      setErr(e);
      return;
    }
    setForm({ title: '', body: '', pinned: false });
    setComposing(false);
    addToast('Notice posted. Every owner has been notified.', 'success');
    await refresh();
  };

  const remove = async (a: Announcement) => {
    // Deleting a notice cannot unsend the notifications it already
    // produced, and pretending otherwise would be worse than saying so.
    if (!window.confirm(`Delete "${a.title}"? Owners already notified keep the notification.`)) {
      return;
    }
    const { error: e } = await deleteAnnouncement(a.id);
    if (e) addToast(e, 'error');
    else await refresh();
  };

  if (loading) return <div className="h-32 bg-gray-100 rounded-xl animate-pulse" />;
  if (error) {
    return (
      <Notice tone="error" icon="ri-error-warning-line" title="Couldn't load notices">
        {error}
      </Notice>
    );
  }

  return (
    <div className="space-y-4">
      {isAdmin && !composing && (
        <button
          onClick={() => setComposing(true)}
          className="w-full sm:w-auto px-5 py-2.5 bg-brand text-white rounded-lg text-sm font-semibold"
        >
          <i className="ri-add-line mr-1.5" />
          Post a notice
        </button>
      )}

      {composing && (
        <div className="bg-white rounded-xl border border-black/5 p-5">
          <Field label="Title">
            <input
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder="Water tank cleaning on Sunday"
              className={inputCls}
            />
          </Field>
          <div className="mt-4">
            <Field label="Details">
              <textarea
                value={form.body}
                onChange={(e) => setForm({ ...form, body: e.target.value })}
                rows={4}
                placeholder="Supply will be off from 10am to 2pm. Please store water in advance."
                className={inputCls}
              />
            </Field>
          </div>
          <label className="flex items-center gap-2 mt-3 text-sm text-charcoal cursor-pointer">
            <input
              type="checkbox"
              checked={form.pinned}
              onChange={(e) => setForm({ ...form, pinned: e.target.checked })}
              className="rounded"
            />
            Pin to the top
          </label>
          {err && <p className="text-sm text-red-600 mt-3">{err}</p>}
          <div className="flex gap-2 mt-4">
            <button
              onClick={() => void submit()}
              disabled={busy}
              className="px-5 py-2.5 bg-brand text-white rounded-lg text-sm font-semibold disabled:opacity-40"
            >
              {busy ? 'Posting…' : 'Post notice'}
            </button>
            <button
              onClick={() => {
                setComposing(false);
                setErr(null);
              }}
              className="px-5 py-2.5 border border-gray-200 text-charcoal rounded-lg text-sm font-semibold"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {announcements.length === 0 ? (
        <EmptyState icon="ri-megaphone-line">
          {isAdmin
            ? 'No notices yet. Post one and every owner is notified.'
            : 'No notices from your society admin yet.'}
        </EmptyState>
      ) : (
        announcements.map((a) => (
          <div key={a.id} className="bg-white rounded-xl border border-black/5 p-5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  {a.pinned && <i className="ri-pushpin-fill text-brand text-sm" title="Pinned" />}
                  <h3 className="font-semibold text-charcoal">{a.title}</h3>
                </div>
                <p className="text-xs text-gray-400 mt-0.5">
                  {a.author_name ?? 'Society admin'} ·{' '}
                  {new Date(a.created_at).toLocaleDateString('en-IN', {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                  })}
                </p>
              </div>
              {isAdmin && (
                <button
                  onClick={() => void remove(a)}
                  className="text-gray-300 hover:text-red-500 flex-shrink-0"
                  title="Delete"
                >
                  <i className="ri-delete-bin-line" />
                </button>
              )}
            </div>
            <p className="text-sm text-gray-600 mt-3 whitespace-pre-wrap">{a.body}</p>
          </div>
        ))
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Maintenance -- reading is free, reporting needs the society plan    */
/* ------------------------------------------------------------------ */

const STATUS_STYLE: Record<TicketStatus, string> = {
  open: 'bg-red-50 text-red-600',
  acknowledged: 'bg-amber-50 text-amber-600',
  in_progress: 'bg-blue-50 text-blue-600',
  resolved: 'bg-green-50 text-green-600',
};

const ALL_STATUSES: { value: TicketStatus; label: string }[] = [
  { value: 'open', label: 'open' },
  { value: 'acknowledged', label: 'acknowledged' },
  { value: 'in_progress', label: 'in progress' },
  { value: 'resolved', label: 'resolved' },
];

export function Maintenance({
  list,
  communityId,
  userId,
  isAdmin,
  isPaid,
}: {
  list: ReturnType<typeof useTickets>;
  communityId: string;
  userId: string;
  isAdmin: boolean;
  isPaid: boolean;
}) {
  const { tickets, loading, error, refresh } = list;
  const { addToast } = useToast();
  const [composing, setComposing] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [form, setForm] = useState<{
    category: string;
    title: string;
    description: string;
    location: string;
    priority: 'low' | 'medium' | 'high';
  }>({ category: 'lift', title: '', description: '', location: '', priority: 'medium' });

  const submit = async () => {
    if (!form.title.trim() || !form.description.trim()) {
      setErr('Say what is wrong, and where.');
      return;
    }
    setBusy(true);
    const { error: e } = await createTicket(communityId, userId, {
      category: form.category,
      title: form.title.trim(),
      description: form.description.trim(),
      location: form.location.trim() || undefined,
      priority: form.priority,
    });
    setBusy(false);
    if (e) {
      setErr(e);
      return;
    }
    setForm({ category: 'lift', title: '', description: '', location: '', priority: 'medium' });
    setComposing(false);
    addToast('Reported. Your society admins have been notified.', 'success');
    await refresh();
  };

  const changeStatus = async (t: Ticket, status: TicketStatus) => {
    setBusyId(t.id);
    const { error: e } = await setTicketStatus(t.id, status);
    setBusyId(null);
    // Postgres already phrases its refusals for a reader.
    if (e) addToast(e, 'error');
    else await refresh();
  };

  if (loading) return <div className="h-32 bg-gray-100 rounded-xl animate-pulse" />;
  if (error) {
    return (
      <Notice tone="error" icon="ri-error-warning-line" title="Couldn't load maintenance">
        {error}
      </Notice>
    );
  }

  return (
    <div className="space-y-4">
      {!isPaid && (
        <Notice tone="warn" icon="ri-lock-line" title="Reporting needs a society plan">
          Everyone can see what has been reported. Raising a new issue is part of the society plan
          {isAdmin ? ' — one subscription covers every owner here.' : '; ask a society admin.'}
        </Notice>
      )}

      {isPaid && !composing && (
        <button
          onClick={() => setComposing(true)}
          className="w-full sm:w-auto px-5 py-2.5 bg-brand text-white rounded-lg text-sm font-semibold"
        >
          <i className="ri-add-line mr-1.5" />
          Report an issue
        </button>
      )}

      {composing && (
        <div className="bg-white rounded-xl border border-black/5 p-5">
          <Field label="What kind of issue?">
            <div className="flex flex-wrap gap-1.5">
              {TICKET_CATEGORIES.map((c) => (
                <button
                  key={c.value}
                  onClick={() => setForm({ ...form, category: c.value })}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                    form.category === c.value
                      ? 'bg-charcoal text-white'
                      : 'bg-lightgray text-charcoal/70 hover:bg-gray-200'
                  }`}
                >
                  <i className={`${c.icon} mr-1`} />
                  {c.label}
                </button>
              ))}
            </div>
          </Field>

          <div className="mt-4">
            <Field label="Summary">
              <input
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="Block A lift stuck on the 3rd floor"
                className={inputCls}
              />
            </Field>
          </div>

          <div className="mt-4">
            <Field label="Details">
              <textarea
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                rows={3}
                placeholder="Doors are not opening. Like this since morning."
                className={inputCls}
              />
            </Field>
          </div>

          <div className="grid sm:grid-cols-2 gap-4 mt-4">
            <Field label="Where (optional)">
              <input
                value={form.location}
                onChange={(e) => setForm({ ...form, location: e.target.value })}
                placeholder="Block A, near the lobby"
                className={inputCls}
              />
            </Field>
            <Field label="Priority">
              <select
                value={form.priority}
                onChange={(e) =>
                  setForm({ ...form, priority: e.target.value as 'low' | 'medium' | 'high' })
                }
                className={inputCls}
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High — unsafe or urgent</option>
              </select>
            </Field>
          </div>

          {err && <p className="text-sm text-red-600 mt-3">{err}</p>}
          <div className="flex gap-2 mt-4">
            <button
              onClick={() => void submit()}
              disabled={busy}
              className="px-5 py-2.5 bg-brand text-white rounded-lg text-sm font-semibold disabled:opacity-40"
            >
              {busy ? 'Reporting…' : 'Report issue'}
            </button>
            <button
              onClick={() => {
                setComposing(false);
                setErr(null);
              }}
              className="px-5 py-2.5 border border-gray-200 text-charcoal rounded-lg text-sm font-semibold"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {tickets.length === 0 ? (
        <EmptyState icon="ri-tools-line">Nothing reported. That is a good sign.</EmptyState>
      ) : (
        tickets.map((t) => {
          const cat = TICKET_CATEGORIES.find((c) => c.value === t.category);
          return (
            <div
              key={t.id}
              className={`bg-white rounded-xl border border-black/5 p-5 ${
                busyId === t.id ? 'opacity-50' : ''
              }`}
            >
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="font-semibold text-charcoal">{t.title}</h3>
                <span
                  className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${STATUS_STYLE[t.status]}`}
                >
                  {t.status.replace('_', ' ')}
                </span>
                {t.priority === 'high' && t.status !== 'resolved' && (
                  <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-red-50 text-red-600">
                    urgent
                  </span>
                )}
              </div>

              <p className="text-xs text-gray-400 mt-0.5">
                <i className={`${cat?.icon ?? 'ri-more-line'} mr-1`} />
                {cat?.label ?? t.category}
                {t.location ? ` · ${t.location}` : ''} · {t.raised_by_name ?? 'An owner'}
                {t.raised_by_units.length > 0 ? ` (${t.raised_by_units.join(', ')})` : ''} ·{' '}
                {new Date(t.created_at).toLocaleDateString('en-IN', {
                  day: 'numeric',
                  month: 'short',
                })}
              </p>

              <p className="text-sm text-gray-600 mt-3 whitespace-pre-wrap">{t.description}</p>

              {t.admin_notes && (
                <div className="mt-3 pl-3 border-l-2 border-brand/30">
                  <p className="text-xs font-semibold text-charcoal">From your admin</p>
                  <p className="text-sm text-gray-600">{t.admin_notes}</p>
                </div>
              )}

              {isAdmin && (
                <div className="flex flex-wrap gap-1.5 mt-4 pt-3 border-t border-gray-100">
                  {ALL_STATUSES.filter((s) => s.value !== t.status).map((s) => (
                    <button
                      key={s.value}
                      onClick={() => void changeStatus(t, s.value)}
                      disabled={busyId === t.id}
                      className="px-3 py-1.5 border border-gray-200 text-charcoal rounded-lg text-xs font-semibold disabled:opacity-40 hover:bg-lightgray"
                    >
                      Mark {s.label}
                    </button>
                  ))}
                </div>
              )}

              <TicketThread
                ticketId={t.id}
                userId={userId}
                isAdmin={isAdmin}
                canComment={isPaid}
              />
            </div>
          );
        })
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Ticket discussion                                                   */
/* ------------------------------------------------------------------ */

/**
 * The thread on one issue, collapsed until asked for.
 *
 * Collapsed by default because the maintenance tab is a list you scan to
 * find what is still broken -- expanding every discussion inline turns
 * that into a wall. The count on the toggle is what tells you a thread is
 * worth opening.
 */
export function TicketThread({
  ticketId,
  userId,
  isAdmin,
  canComment,
}: {
  ticketId: string;
  userId: string;
  isAdmin: boolean;
  canComment: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const { addToast } = useToast();

  // Only fetched once opened, so a list of forty issues does not pull
  // forty threads to render a page.
  const { comments, loading, error, refresh } = useTicketComments(open ? ticketId : undefined);

  const submit = async () => {
    const body = draft.trim();
    if (!body) return;
    setBusy(true);
    const { error: e } = await postTicketComment(ticketId, userId, body);
    setBusy(false);
    if (e) {
      setErr(e);
      return;
    }
    setDraft('');
    setErr(null);
    await refresh();
  };

  const remove = async (c: TicketComment) => {
    const { error: e } = await deleteTicketComment(c.id);
    if (e) addToast(e, 'error');
    else await refresh();
  };

  return (
    <div className="mt-3 pt-3 border-t border-gray-100">
      <button
        onClick={() => setOpen(!open)}
        className="text-xs font-semibold text-charcoal/60 hover:text-charcoal flex items-center gap-1.5"
      >
        <i className={open ? 'ri-arrow-down-s-line' : 'ri-arrow-right-s-line'} />
        {open ? 'Hide discussion' : 'Discussion'}
        {open && comments.length > 0 && ` (${comments.length})`}
      </button>

      {open && (
        <div className="mt-3">
          {loading ? (
            <div className="h-10 bg-lightgray rounded-lg animate-pulse" />
          ) : error ? (
            <p className="text-sm text-red-600">{error}</p>
          ) : (
            <>
              {comments.length === 0 && (
                <p className="text-xs text-gray-400 mb-3">
                  Nothing yet. Add what you know — whether it affects your block, or what a
                  contractor said.
                </p>
              )}

              <ul className="space-y-3 mb-3">
                {comments.map((c) => (
                  <li key={c.id} className="flex items-start gap-2.5">
                    <img
                      src={c.author_avatar || '/placeholders/avatar.svg'}
                      alt=""
                      className="w-7 h-7 rounded-full object-cover flex-shrink-0 bg-lightgray mt-0.5"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs text-charcoal/50">
                        <span className="font-semibold text-charcoal/80">
                          {c.author_name ?? 'An owner'}
                        </span>
                        {c.author_units.length > 0 && ` · ${c.author_units.join(', ')}`}
                        {' · '}
                        {new Date(c.created_at).toLocaleDateString('en-IN', {
                          day: 'numeric',
                          month: 'short',
                        })}
                      </p>
                      <p className="text-sm text-charcoal/80 whitespace-pre-wrap">{c.body}</p>
                    </div>
                    {(c.author_id === userId || isAdmin) && (
                      <button
                        onClick={() => void remove(c)}
                        className="text-gray-300 hover:text-red-500 flex-shrink-0"
                        title="Delete"
                      >
                        <i className="ri-delete-bin-line text-sm" />
                      </button>
                    )}
                  </li>
                ))}
              </ul>

              {canComment ? (
                <div className="flex gap-2">
                  <input
                    value={draft}
                    onChange={(e) => {
                      setDraft(e.target.value);
                      setErr(null);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        void submit();
                      }
                    }}
                    placeholder="Add what you know…"
                    className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand/30"
                  />
                  <button
                    onClick={() => void submit()}
                    disabled={busy || !draft.trim()}
                    className="px-4 py-2 bg-charcoal text-white rounded-lg text-sm font-semibold disabled:opacity-30"
                  >
                    {busy ? '…' : 'Send'}
                  </button>
                </div>
              ) : (
                <p className="text-xs text-gray-400">
                  Your society needs an active plan to add comments.
                </p>
              )}

              {err && <p className="text-sm text-red-600 mt-2">{err}</p>}
            </>
          )}
        </div>
      )}
    </div>
  );
}
