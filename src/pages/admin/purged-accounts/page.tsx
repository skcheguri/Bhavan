import { Link } from 'react-router-dom';
import { useAdminPurgedAccounts } from '@/hooks/useAdminPurgedAccounts';

const roleBadge: Record<string, string> = {
  tenant: 'bg-blue-50 text-blue-600',
  owner: 'bg-amber-50 text-amber-600',
  admin: 'bg-purple-50 text-purple-600',
};

export default function AdminPurgedAccountsPage() {
  const { accounts, loading } = useAdminPurgedAccounts();

  return (
    <div className="min-h-screen bg-offwhite pt-20 pb-16">
      <div className="max-w-5xl mx-auto px-4 md:px-8">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 pt-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Link to="/admin" className="text-xs text-charcoal/40 hover:text-charcoal transition-colors">← Admin Dashboard</Link>
            </div>
            <h1 className="text-2xl md:text-3xl font-bold text-charcoal">Purged Unconfirmed Accounts</h1>
            <p className="text-sm text-charcoal/60 mt-1">
              A daily job removes signups that never confirmed an email or phone number after 30 days. This is a
              read-only record of what's been removed — nothing here can be undone.
            </p>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-black/5 p-4 mb-6 flex items-center gap-3">
          <div className="w-10 h-10 flex items-center justify-center rounded-xl bg-lightgray flex-shrink-0">
            <i className="ri-delete-bin-line text-charcoal/60 text-lg" />
          </div>
          <div>
            <p className="text-sm font-bold text-charcoal">{accounts.length} account{accounts.length !== 1 ? 's' : ''} purged to date</p>
            <p className="text-xs text-charcoal/60">Runs daily at 3:00 AM UTC · never confirmed email or phone, older than 30 days</p>
          </div>
        </div>

        <div className="space-y-3">
          {loading ? (
            <div className="bg-white rounded-3xl border border-black/5 p-12 text-center text-sm text-charcoal/40">
              Loading…
            </div>
          ) : accounts.length === 0 ? (
            <div className="bg-white rounded-3xl border border-black/5 p-12 text-center">
              <div className="w-14 h-14 flex items-center justify-center mx-auto mb-4 bg-lightgray rounded-full">
                <i className="ri-shield-check-line text-2xl text-charcoal/40" />
              </div>
              <h3 className="text-base font-bold text-charcoal mb-2">Nothing purged yet</h3>
              <p className="text-sm text-charcoal/60">Unconfirmed signups older than 30 days will appear here once the daily job removes them.</p>
            </div>
          ) : (
            accounts.map((a) => (
              <div key={a.id} className="bg-white rounded-2xl border border-black/5 p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                      <span className="text-sm font-bold text-charcoal">{a.name || 'Unnamed'}</span>
                      {a.role && (
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${roleBadge[a.role] ?? 'bg-lightgray text-charcoal/60'}`}>
                          {a.role}
                        </span>
                      )}
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-0.5 text-xs text-charcoal/60">
                      <p>{a.email || 'No email on file'}</p>
                      <p>{a.phone || 'No phone on file'}</p>
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-xs text-charcoal/40">Signed up</p>
                    <p className="text-xs font-medium text-charcoal">
                      {a.accountCreatedAt ? new Date(a.accountCreatedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}
                    </p>
                    <p className="text-xs text-charcoal/40 mt-1.5">Purged</p>
                    <p className="text-xs font-medium text-charcoal">
                      {new Date(a.purgedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </p>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
