import { Link } from 'react-router';
import { useSociety, useTickets } from '@/hooks/useSociety';

/**
 * Open maintenance issues in this owner's society, on their dashboard.
 *
 * Deliberately read-only, and deliberately not a second "raise an issue"
 * form. Owners already see a maintenance list on this page -- requests
 * their TENANTS have raised about individual flats -- and two similar
 * forms on one screen would leave them guessing which audience each one
 * reaches. This card exists only so the society is reachable from the
 * dashboard; the single place to report anything is /society.
 *
 * Renders nothing at all for an owner who is not an approved member of a
 * society, which is most owners. A card explaining a feature you cannot
 * use is clutter on the screen people visit most.
 */
export default function SocietyIssuesCard({ userId }: { userId: string | undefined }) {
  const { society, membership } = useSociety(userId);

  // Only an approved member can read the ticket list -- get_community_tickets
  // raises for anyone else, so asking would turn a pending membership into
  // an error box on the dashboard.
  const approved = membership?.status === 'approved';
  const { tickets, loading } = useTickets(approved && society ? society.id : undefined);

  if (!society || !approved) return null;

  const open = tickets.filter((t) => t.status !== 'resolved');
  const urgent = open.filter((t) => t.priority === 'high').length;

  return (
    <div className="bg-white rounded-3xl border border-black/5 p-6">
      <h2 className="text-base font-bold text-charcoal mb-1 flex items-center gap-2">
        <div className="w-6 h-6 flex items-center justify-center">
          <i className="ri-building-2-line text-amber-600" />
        </div>
        {society.name}
      </h2>
      <p className="text-xs text-charcoal/50 mb-4">Shared maintenance in your society</p>

      {loading ? (
        <div className="h-16 bg-lightgray rounded-xl animate-pulse" />
      ) : open.length === 0 ? (
        <p className="text-sm text-charcoal/50">Nothing open right now.</p>
      ) : (
        <>
          <div className="flex items-baseline gap-2 mb-3">
            <span className="text-2xl font-bold text-charcoal">{open.length}</span>
            <span className="text-sm text-charcoal/60">
              open issue{open.length === 1 ? '' : 's'}
              {urgent > 0 && <span className="text-red-500 font-semibold"> · {urgent} urgent</span>}
            </span>
          </div>

          <ul className="space-y-2 mb-4">
            {open.slice(0, 3).map((t) => (
              <li key={t.id} className="flex items-start gap-2">
                <span
                  className={`mt-1.5 w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                    t.priority === 'high' ? 'bg-red-500' : 'bg-amber-400'
                  }`}
                />
                <span className="text-sm text-charcoal/70 truncate">{t.title}</span>
              </li>
            ))}
          </ul>

          {open.length > 3 && (
            <p className="text-xs text-charcoal/40 -mt-2 mb-3">
              and {open.length - 3} more
            </p>
          )}
        </>
      )}

      <Link
        to="/society"
        className="inline-flex items-center gap-1.5 text-sm font-semibold text-amber-600 hover:text-amber-700"
      >
        Open My Society
        <i className="ri-arrow-right-line" />
      </Link>
    </div>
  );
}
