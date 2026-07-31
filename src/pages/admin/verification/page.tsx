import { useState } from 'react';
import { Link } from 'react-router';
import { useAdminVerification, type AadhaarAttemptStatus } from '@/hooks/useAdminVerification';

type StatusFilter = 'all' | AadhaarAttemptStatus;

export default function AdminVerificationPage() {
  const { entries, verifiedUsers, loading } = useAdminVerification();
  const [filter, setFilter] = useState<StatusFilter>('all');

  const filtered = entries.filter((e) => (filter === 'all' ? true : e.status === filter));

  const statusBadge: Record<AadhaarAttemptStatus, string> = {
    otp_sent: 'bg-amber-50 text-amber-600',
    verified: 'bg-green-50 text-green-600',
    failed: 'bg-red-50 text-red-600',
    expired: 'bg-lightgray text-charcoal/60',
  };

  return (
    <div className="min-h-screen bg-offwhite pt-20 pb-16">
      <div className="max-w-5xl mx-auto px-4 md:px-8">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 pt-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Link to="/admin" className="text-xs text-charcoal/40 hover:text-charcoal transition-colors">← Admin Dashboard</Link>
            </div>
            <h1 className="text-2xl md:text-3xl font-bold text-charcoal">Aadhaar Verification</h1>
            <p className="text-sm text-charcoal/60 mt-1">
              Read-only audit log. Aadhaar identity is verified automatically via OTP through a licensed KYC provider — there's no pending action here, this is visibility into who attempted it and the outcome.
            </p>
          </div>
        </div>

        {/* Verified users summary */}
        <div className="bg-white rounded-3xl border border-black/5 p-5 mb-6">
          <p className="text-sm font-bold text-charcoal mb-3">Verified Users</p>
          <div className="flex flex-wrap gap-3">
            {verifiedUsers.length === 0 ? (
              <p className="text-xs text-charcoal/40">No verified users yet.</p>
            ) : (
              verifiedUsers.map((u) => (
                <div key={u.id} className="flex items-center gap-2 bg-offwhite rounded-full px-3 py-1.5">
                  <img src={u.avatar_url ?? '/placeholders/avatar.svg'} alt={u.name} className="w-6 h-6 rounded-full object-cover" />
                  <span className="text-xs font-medium text-charcoal">{u.name}</span>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Filters */}
        <div className="flex gap-2 mb-6 overflow-x-auto pb-1">
          {(['all', 'otp_sent', 'verified', 'failed', 'expired'] as StatusFilter[]).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-4 py-2 rounded-full text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap flex-shrink-0 ${
                filter === f ? 'bg-amber-500 text-white' : 'bg-white text-charcoal/60 hover:text-charcoal border border-black/5'
              }`}
            >
              {f === 'otp_sent' ? 'OTP Sent' : f.charAt(0).toUpperCase() + f.slice(1)}
              {f !== 'all' && (
                <span className={`ml-1.5 text-[10px] px-1.5 py-0.5 rounded-full font-bold ${filter === f ? 'bg-white/20 text-white' : 'bg-lightgray text-charcoal/40'}`}>
                  {entries.filter((e) => e.status === f).length}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Audit log */}
        <div className="space-y-3">
          {loading ? (
            <div className="bg-white rounded-3xl border border-black/5 p-12 text-center text-sm text-charcoal/40">
              Loading attempts…
            </div>
          ) : filtered.length === 0 ? (
            <div className="bg-white rounded-3xl border border-black/5 p-12 text-center">
              <div className="w-14 h-14 flex items-center justify-center mx-auto mb-4 bg-lightgray rounded-full">
                <i className="ri-shield-user-line text-2xl text-charcoal/40" />
              </div>
              <h3 className="text-base font-bold text-charcoal mb-2">No attempts</h3>
              <p className="text-sm text-charcoal/60">No Aadhaar verification attempts match this filter.</p>
            </div>
          ) : (
            filtered.map((e) => (
              <div key={e.id} className="bg-white rounded-2xl border border-black/5 p-4">
                <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                  <p className="text-sm font-bold text-charcoal">{e.userName}</p>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${e.userRole === 'owner' ? 'bg-amber-50 text-amber-600' : 'bg-blue-50 text-blue-600'}`}>
                    {e.userRole === 'owner' ? 'Landlord' : 'Tenant'}
                  </span>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${statusBadge[e.status]}`}>
                    {e.status === 'otp_sent' ? 'OTP Sent' : e.status.charAt(0).toUpperCase() + e.status.slice(1)}
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-0.5 text-xs text-charcoal/60">
                  <p>Aadhaar: <span className="font-medium text-charcoal">{e.aadhaarLast4 ? `**** **** ${e.aadhaarLast4}` : 'N/A'}</span></p>
                  <p>Requested: <span className="font-medium text-charcoal">{new Date(e.requestedAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span></p>
                  {e.verifiedAt && (
                    <p>Verified: <span className="font-medium text-charcoal">{new Date(e.verifiedAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span></p>
                  )}
                </div>
                {e.failureReason && <p className="text-xs text-red-500 mt-2">Reason: {e.failureReason}</p>}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
