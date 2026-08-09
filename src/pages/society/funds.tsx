import { useState } from 'react';
import { useToast } from '@/hooks/useToast';
import {
  useCollectionStatus,
  createCollection,
  closeCollection,
  recordContribution,
  decideContribution,
  type useCollections,
  type Collection,
  type CollectionRow,
} from '@/hooks/useSociety';
import { Notice, Field, EmptyState, inputCls } from './ui';
import { buildContributionReceiptHtml } from '@/lib/documents/societyContributionReceipt';
import { viewDocument } from '@/lib/viewDocument';

const rupees = (n: number) => `₹${n.toLocaleString('en-IN')}`;

/**
 * Fund collections -- festival funds, painting, a new pump.
 *
 * Bhavan is not in the payment path. The society publishes its own UPI id,
 * owners pay it from their own app, and this is the ledger of who says
 * they paid and what the admin confirmed. The screen is written to make
 * that obvious rather than implying money moves through Bhavan, because a
 * user who thinks otherwise will blame the wrong party when a transfer
 * goes missing.
 */
export function Funds({
  list,
  communityId,
  userId,
  isAdmin,
  isPaid,
  societyName,
  societyAddress,
}: {
  list: ReturnType<typeof useCollections>;
  communityId: string;
  userId: string;
  isAdmin: boolean;
  isPaid: boolean;
  societyName: string;
  societyAddress: string;
}) {
  const { collections, loading, error, refresh } = list;
  const [composing, setComposing] = useState(false);

  if (loading) return <div className="h-32 bg-gray-100 rounded-xl animate-pulse" />;
  if (error) {
    return (
      <Notice tone="error" icon="ri-error-warning-line" title="Couldn't load collections">
        {error}
      </Notice>
    );
  }

  return (
    <div className="space-y-4">
      {!isPaid && isAdmin && (
        <Notice tone="warn" icon="ri-lock-line" title="Collections need a society plan">
          Starting a collection is part of the society plan.
        </Notice>
      )}

      {isAdmin && isPaid && !composing && (
        <button
          onClick={() => setComposing(true)}
          className="w-full sm:w-auto px-5 py-2.5 bg-brand text-white rounded-lg text-sm font-semibold"
        >
          <i className="ri-add-line mr-1.5" />
          Start a collection
        </button>
      )}

      {composing && (
        <NewCollection
          communityId={communityId}
          userId={userId}
          onDone={async () => {
            setComposing(false);
            await refresh();
          }}
          onCancel={() => setComposing(false)}
        />
      )}

      {collections.length === 0 ? (
        <EmptyState icon="ri-hand-coin-line">
          {isAdmin
            ? 'No collections yet. Start one for a festival, repair or event.'
            : 'No collections running in your society.'}
        </EmptyState>
      ) : (
        collections.map((c) => (
          <CollectionCard
            key={c.id}
            collection={c}
            userId={userId}
            isAdmin={isAdmin}
            onChanged={refresh}
            societyName={societyName}
            societyAddress={societyAddress}
          />
        ))
      )}
    </div>
  );
}

function NewCollection({
  communityId,
  userId,
  onDone,
  onCancel,
}: {
  communityId: string;
  userId: string;
  onDone: () => Promise<void>;
  onCancel: () => void;
}) {
  const { addToast } = useToast();
  const [form, setForm] = useState({
    title: '',
    purpose: '',
    mode: 'per_flat' as 'per_flat' | 'open',
    perFlat: '',
    target: '',
    upiId: '',
    payeeName: '',
    deadline: '',
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async () => {
    if (!form.title.trim() || !form.purpose.trim()) {
      setErr('Give it a name and say what it is for.');
      return;
    }
    if (form.mode === 'per_flat' && !form.perFlat.trim()) {
      setErr('Enter the amount each flat should pay.');
      return;
    }
    setBusy(true);
    const { error } = await createCollection(communityId, userId, {
      title: form.title.trim(),
      purpose: form.purpose.trim(),
      mode: form.mode,
      perFlatRupees: form.perFlat ? Number(form.perFlat) : undefined,
      targetRupees: form.target ? Number(form.target) : undefined,
      upiId: form.upiId.trim() || undefined,
      payeeName: form.payeeName.trim() || undefined,
      deadline: form.deadline || undefined,
    });
    setBusy(false);
    if (error) {
      setErr(error);
      return;
    }
    addToast('Collection started. Every owner has been notified.', 'success');
    await onDone();
  };

  return (
    <div className="bg-white rounded-2xl border border-black/5 p-6 sm:p-7">
      <Notice tone="info" icon="ri-information-line" title="Money goes straight to your society">
        Owners pay the UPI id you enter here from their own app. Bhavan does not hold or handle
        the money — this page keeps the record of who has paid.
      </Notice>

      <div className="mt-5 space-y-4">
        <Field label="What is it for?">
          <input
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            placeholder="Diwali celebration 2026"
            className={inputCls}
          />
        </Field>

        <Field label="Details">
          <textarea
            value={form.purpose}
            onChange={(e) => setForm({ ...form, purpose: e.target.value })}
            rows={3}
            placeholder="Decorations, sound system, snacks for the children's event on the 8th."
            className={inputCls}
          />
        </Field>

        <Field label="How much?">
          <div className="flex gap-1 p-1 bg-lightgray rounded-lg w-full sm:w-auto sm:inline-flex mb-3">
            {(['per_flat', 'open'] as const).map((m) => (
              <button
                key={m}
                onClick={() => setForm({ ...form, mode: m })}
                className={`flex-1 sm:flex-none px-4 py-1.5 rounded-md text-xs font-semibold transition-colors ${
                  form.mode === m ? 'bg-white text-charcoal shadow-sm' : 'text-charcoal/50'
                }`}
              >
                {m === 'per_flat' ? 'Same for every flat' : 'Give what you like'}
              </button>
            ))}
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            {form.mode === 'per_flat' && (
              <input
                type="number"
                value={form.perFlat}
                onChange={(e) => setForm({ ...form, perFlat: e.target.value })}
                placeholder="Per flat (₹)"
                className={inputCls}
              />
            )}
            <input
              type="number"
              value={form.target}
              onChange={(e) => setForm({ ...form, target: e.target.value })}
              placeholder="Target total (₹, optional)"
              className={inputCls}
            />
          </div>
        </Field>

        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="Society UPI id">
            <input
              value={form.upiId}
              onChange={(e) => setForm({ ...form, upiId: e.target.value })}
              placeholder="society@upi"
              className={inputCls}
            />
          </Field>
          <Field label="Account name">
            <input
              value={form.payeeName}
              onChange={(e) => setForm({ ...form, payeeName: e.target.value })}
              placeholder="Satyam Towers Owners Association"
              className={inputCls}
            />
          </Field>
        </div>
        <p className="text-xs text-gray-400 -mt-2">
          Use the society's account, not a personal one — owners can see this and it is what they
          will pay.
        </p>

        <Field label="Pay by (optional)">
          <input
            type="date"
            value={form.deadline}
            onChange={(e) => setForm({ ...form, deadline: e.target.value })}
            className={inputCls}
          />
        </Field>
      </div>

      {err && <p className="text-sm text-red-600 mt-4">{err}</p>}

      <div className="flex gap-2 mt-5">
        <button
          onClick={() => void submit()}
          disabled={busy}
          className="px-5 py-2.5 bg-brand text-white rounded-lg text-sm font-semibold disabled:opacity-40"
        >
          {busy ? 'Starting…' : 'Start collection'}
        </button>
        <button
          onClick={onCancel}
          className="px-5 py-2.5 border border-gray-200 text-charcoal rounded-lg text-sm font-semibold"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

function CollectionCard({
  collection: c,
  userId,
  isAdmin,
  onChanged,
  societyName,
  societyAddress,
}: {
  collection: Collection;
  userId: string;
  isAdmin: boolean;
  onChanged: () => Promise<void>;
  societyName: string;
  societyAddress: string;
}) {
  const { addToast } = useToast();
  const { rows, loading, refresh } = useCollectionStatus(c.id);
  const [showAll, setShowAll] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const confirmed = rows.filter((r) => r.status === 'confirmed');
  const claimed = rows.filter((r) => r.status === 'claimed');
  const unpaid = rows.filter((r) => r.status === 'none' || r.status === 'rejected');
  // Only confirmed money counts toward the total. A claim is not money.
  const collected = confirmed.reduce((sum, r) => sum + (r.amount_rupees ?? 0), 0);
  const pct = c.target_rupees ? Math.min(100, Math.round((collected / c.target_rupees) * 100)) : null;

  const mine = rows.find((r) => r.user_id === userId);

  /**
   * Only ever offered for a CONFIRMED contribution. A receipt for a claim
   * would be a lie with a reference number on it -- nobody has checked
   * that the money arrived yet.
   */
  const openReceipt = async (r: CollectionRow) => {
    if (r.status !== 'confirmed' || !r.contribution_id) return;
    const html = buildContributionReceiptHtml({
      // Short and stable: the same contribution always yields the same
      // number, so two copies of the receipt cannot disagree.
      receiptNumber: `SC-${r.contribution_id.slice(0, 8).toUpperCase()}`,
      societyName,
      societyAddress,
      collectionTitle: c.title,
      collectionPurpose: c.purpose,
      payerName: r.name ?? 'Owner',
      payerUnits: r.units,
      amountRupees: r.amount_rupees ?? 0,
      reference: r.reference ?? '',
      paidOn: r.created_at ?? '',
      confirmedOn: r.confirmed_at ?? '',
      confirmedByName: r.confirmed_by_name ?? '',
    });
    const failure = await viewDocument(html, `Receipt ${c.title}`);
    if (failure) addToast(failure, 'error');
  };

  const decide = async (r: CollectionRow, status: 'confirmed' | 'rejected') => {
    if (!r.contribution_id) return;
    setBusyId(r.contribution_id);
    const { error } = await decideContribution(r.contribution_id, status, userId);
    setBusyId(null);
    if (error) addToast(error, 'error');
    else await refresh();
  };

  const toggleOpen = async () => {
    const { error } = await closeCollection(c.id, c.status === 'open' ? 'closed' : 'open');
    if (error) addToast(error, 'error');
    else await onChanged();
  };

  return (
    <div className="bg-white rounded-2xl border border-black/5 p-6 sm:p-7">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-semibold text-charcoal">{c.title}</h3>
            {c.status === 'closed' && (
              <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-lightgray text-charcoal/50">
                closed
              </span>
            )}
          </div>
          <p className="text-xs text-gray-400 mt-0.5">
            {c.mode === 'per_flat' && c.per_flat_rupees
              ? `${rupees(c.per_flat_rupees)} per flat`
              : 'Give what you like'}
            {c.deadline &&
              ` · by ${new Date(c.deadline).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}`}
          </p>
        </div>
        {isAdmin && (
          <button
            onClick={() => void toggleOpen()}
            className="text-xs font-semibold text-charcoal/50 hover:text-charcoal flex-shrink-0"
          >
            {c.status === 'open' ? 'Close' : 'Reopen'}
          </button>
        )}
      </div>

      <p className="text-sm text-gray-600 mt-3 whitespace-pre-wrap">{c.purpose}</p>

      {/* Progress. Confirmed money only. */}
      <div className="mt-4">
        <div className="flex items-baseline justify-between mb-1.5">
          <span className="text-lg font-bold text-charcoal">{rupees(collected)}</span>
          {c.target_rupees && (
            <span className="text-xs text-gray-400">of {rupees(c.target_rupees)}</span>
          )}
        </div>
        {pct !== null && (
          <div className="h-2 bg-lightgray rounded-full overflow-hidden">
            <div className="h-full bg-brand rounded-full transition-all" style={{ width: `${pct}%` }} />
          </div>
        )}
        <p className="text-xs text-gray-400 mt-1.5">
          {confirmed.length} paid
          {claimed.length > 0 && ` · ${claimed.length} awaiting check`}
          {unpaid.length > 0 && ` · ${unpaid.length} not yet`}
        </p>
      </div>

      {c.upi_id && c.status === 'open' && (
        <div className="mt-4 p-3 bg-lightgray rounded-lg">
          <p className="text-xs text-charcoal/50">Pay to</p>
          <p className="text-sm font-mono font-semibold text-charcoal">{c.upi_id}</p>
          {c.payee_name && <p className="text-xs text-charcoal/60">{c.payee_name}</p>}
        </div>
      )}

      {loading ? (
        <div className="h-10 bg-lightgray rounded-lg animate-pulse mt-4" />
      ) : (
        <>
          {c.status === 'open' && (
            <MyContribution
              collection={c}
              mine={mine}
              userId={userId}
              onSaved={refresh}
              onReceipt={openReceipt}
            />
          )}

          {/* Admins get the queue first: claims are what need a decision. */}
          {isAdmin && claimed.length > 0 && (
            <div className="mt-4 pt-4 border-t border-gray-100">
              <p className="text-xs font-bold text-charcoal mb-2">
                Awaiting your check ({claimed.length})
              </p>
              <ul className="space-y-2">
                {claimed.map((r) => (
                  <li
                    key={r.user_id}
                    className={`flex items-center gap-2 ${busyId === r.contribution_id ? 'opacity-50' : ''}`}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-charcoal truncate">
                        <span className="font-semibold">{r.name ?? 'An owner'}</span>
                        {r.units.length > 0 && ` · ${r.units.join(', ')}`} ·{' '}
                        {rupees(r.amount_rupees ?? 0)}
                      </p>
                      {r.reference && (
                        <p className="text-xs text-gray-400 font-mono truncate">{r.reference}</p>
                      )}
                    </div>
                    <button
                      onClick={() => void decide(r, 'confirmed')}
                      disabled={busyId === r.contribution_id}
                      className="px-3 py-1.5 bg-brand text-white rounded-lg text-xs font-semibold disabled:opacity-40"
                    >
                      Confirm
                    </button>
                    <button
                      onClick={() => void decide(r, 'rejected')}
                      disabled={busyId === r.contribution_id}
                      className="px-3 py-1.5 border border-gray-200 text-charcoal rounded-lg text-xs font-semibold disabled:opacity-40"
                    >
                      Not found
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <button
            onClick={() => setShowAll(!showAll)}
            className="mt-4 text-xs font-semibold text-charcoal/60 hover:text-charcoal flex items-center gap-1.5"
          >
            <i className={showAll ? 'ri-arrow-down-s-line' : 'ri-arrow-right-s-line'} />
            {showAll ? 'Hide' : 'Who has paid'}
          </button>

          {showAll && (
            <ul className="mt-3 space-y-1.5">
              {rows.map((r) => (
                <li key={r.user_id} className="flex items-center gap-2 text-sm">
                  <span
                    className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                      r.status === 'confirmed'
                        ? 'bg-green-500'
                        : r.status === 'claimed'
                          ? 'bg-amber-400'
                          : r.status === 'rejected'
                            ? 'bg-red-400'
                            : 'bg-gray-200'
                    }`}
                  />
                  <span className="text-charcoal/70 truncate flex-1">
                    {r.name ?? 'An owner'}
                    {r.units.length > 0 && (
                      <span className="text-charcoal/40"> · {r.units.join(', ')}</span>
                    )}
                  </span>
                  <span className="text-charcoal/50 text-xs flex-shrink-0">
                    {r.status === 'none'
                      ? '—'
                      : r.status === 'rejected'
                        ? 'not found'
                        : rupees(r.amount_rupees ?? 0)}
                  </span>
                  {isAdmin && r.status === 'confirmed' && (
                    <button
                      onClick={() => void openReceipt(r)}
                      className="text-gray-300 hover:text-charcoal flex-shrink-0"
                      title="Receipt"
                    >
                      <i className="ri-file-text-line text-sm" />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}

/** Your own line: record a payment, or see where yours stands. */
function MyContribution({
  collection: c,
  mine,
  userId,
  onSaved,
  onReceipt,
}: {
  collection: Collection;
  mine: CollectionRow | undefined;
  userId: string;
  onSaved: () => Promise<void>;
  onReceipt: (r: CollectionRow) => Promise<void>;
}) {
  const { addToast } = useToast();
  const [editing, setEditing] = useState(false);
  const [amount, setAmount] = useState(
    String(mine?.amount_rupees ?? c.per_flat_rupees ?? '')
  );
  const [reference, setReference] = useState(mine?.reference ?? '');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const save = async () => {
    const n = Number(amount);
    if (!n || n <= 0) {
      setErr('Enter the amount you paid.');
      return;
    }
    setBusy(true);
    const { error } = await recordContribution(c.id, userId, n, reference.trim() || undefined);
    setBusy(false);
    if (error) {
      setErr(error);
      return;
    }
    setEditing(false);
    addToast('Recorded. Your admin will confirm it against the account.', 'success');
    await onSaved();
  };

  if (mine?.status === 'confirmed') {
    return (
      <div className="mt-4 p-3 bg-green-50 rounded-lg flex items-center gap-2">
        <i className="ri-checkbox-circle-fill text-green-600" />
        <span className="text-sm text-green-900 flex-1">
          Your {rupees(mine.amount_rupees ?? 0)} is confirmed.
        </span>
        <button
          onClick={() => void onReceipt(mine)}
          className="text-xs font-semibold text-green-800 underline flex-shrink-0"
        >
          Receipt
        </button>
      </div>
    );
  }

  if (mine?.status === 'claimed' && !editing) {
    return (
      <div className="mt-4 p-3 bg-amber-50 rounded-lg flex items-center gap-2">
        <i className="ri-time-line text-amber-600" />
        <span className="text-sm text-amber-900 flex-1">
          {rupees(mine.amount_rupees ?? 0)} recorded, waiting for your admin to check it.
        </span>
        <button
          onClick={() => setEditing(true)}
          className="text-xs font-semibold text-amber-700 underline flex-shrink-0"
        >
          Edit
        </button>
      </div>
    );
  }

  if (!editing) {
    return (
      <button
        onClick={() => setEditing(true)}
        className="mt-4 px-4 py-2 bg-charcoal text-white rounded-lg text-sm font-semibold"
      >
        {mine?.status === 'rejected' ? "I've paid again" : "I've paid"}
      </button>
    );
  }

  return (
    <div className="mt-4 p-4 bg-lightgray/60 rounded-lg">
      <p className="text-xs text-charcoal/60 mb-3">
        Pay {c.upi_id ? <span className="font-mono font-semibold">{c.upi_id}</span> : 'your society'}{' '}
        from your UPI app first, then record it here.
      </p>
      <div className="grid sm:grid-cols-2 gap-3">
        <input
          type="number"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="Amount (₹)"
          className={inputCls}
        />
        <input
          value={reference}
          onChange={(e) => setReference(e.target.value)}
          placeholder="UPI reference (helps your admin)"
          className={inputCls}
        />
      </div>
      {err && <p className="text-sm text-red-600 mt-2">{err}</p>}
      <div className="flex gap-2 mt-3">
        <button
          onClick={() => void save()}
          disabled={busy}
          className="px-4 py-2 bg-brand text-white rounded-lg text-sm font-semibold disabled:opacity-40"
        >
          {busy ? 'Saving…' : 'Record my payment'}
        </button>
        <button
          onClick={() => {
            setEditing(false);
            setErr(null);
          }}
          className="px-4 py-2 border border-gray-200 text-charcoal rounded-lg text-sm font-semibold"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
