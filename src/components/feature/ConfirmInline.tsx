/**
 * "Are you sure?" asked on the page instead of through window.confirm().
 *
 * A browser is allowed to stop showing native dialogs. Chromium offers
 * "don't allow this page to prompt you again" once a page has thrown a
 * few, and this app threw one for every destructive action -- delete a
 * notice, close a poll, remove a member, leave a society. Tick it once
 * and every confirm() on that page returns false for good, silently. The
 * button still highlights on hover and still does nothing, which is how
 * the poll buttons were reported: not as an error, as dead controls.
 *
 * This cannot be suppressed. It also has room for a sentence explaining
 * what actually happens, which a one-line dialog discourages -- and for
 * these actions the surprising part is usually what survives, not what
 * goes.
 */
export function ConfirmInline({
  message,
  confirmLabel,
  tone = 'danger',
  busy = false,
  onConfirm,
  onCancel,
}: {
  message: string;
  confirmLabel: string;
  /** `danger` destroys data; `caution` is reversible or merely disruptive. */
  tone?: 'danger' | 'caution';
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="mt-3 rounded-xl border border-amber-100 bg-amber-50 p-4">
      <p className="text-sm text-amber-900">{message}</p>
      <div className="flex gap-2 mt-3">
        <button
          type="button"
          onClick={onConfirm}
          disabled={busy}
          className={`px-4 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-40 ${
            tone === 'danger' ? 'bg-red-600' : 'bg-charcoal'
          }`}
        >
          {busy ? 'Working…' : confirmLabel}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 rounded-lg border border-amber-200 text-amber-900 text-sm font-semibold"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

export default ConfirmInline;
