import { useState } from 'react';
import { Link } from 'react-router';
import { useAdminUsers, type AdminUserRow } from '@/hooks/useAdminUsers';
import { useToast } from '@/hooks/useToast';
import AdminUserDetailModal from './components/AdminUserDetailModal';

type RoleFilter = 'all' | 'tenant' | 'owner' | 'admin';

export default function AdminUsersPage() {
  const { addToast } = useToast();
  const { users, loading, search, setSearch, setSuspended } = useAdminUsers();
  const [roleFilter, setRoleFilter] = useState<RoleFilter>('all');
  const [selectedUser, setSelectedUser] = useState<AdminUserRow | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const filtered = users.filter((u) => (roleFilter === 'all' ? true : u.role === roleFilter));

  const handleSuspend = async (id: string, reason: string) => {
    if (!reason.trim()) {
      addToast('Please provide a reason for suspension', 'error');
      return;
    }
    setBusyId(id);
    const { error } = await setSuspended(id, true, reason.trim());
    setBusyId(null);
    setSelectedUser(null);
    if (error) addToast(error, 'error');
    else addToast('Account suspended', 'success');
  };

  const handleReactivate = async (id: string) => {
    setBusyId(id);
    const { error } = await setSuspended(id, false);
    setBusyId(null);
    setSelectedUser(null);
    if (error) addToast(error, 'error');
    else addToast('Account reactivated', 'success');
  };

  const roleBadge: Record<string, string> = {
    tenant: 'bg-blue-50 text-blue-600',
    owner: 'bg-amber-50 text-amber-600',
    admin: 'bg-purple-50 text-purple-600',
  };

  return (
    <div className="min-h-screen bg-offwhite pt-20 pb-16">
      <div className="max-w-5xl mx-auto px-4 md:px-8">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 pt-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Link to="/admin" className="text-xs text-charcoal/40 hover:text-charcoal transition-colors">← Admin Dashboard</Link>
            </div>
            <h1 className="text-2xl md:text-3xl font-bold text-charcoal">User Management</h1>
            <p className="text-sm text-charcoal/60 mt-1">Search accounts, review verification status, and suspend accounts when needed.</p>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 mb-6">
          <div className="relative flex-1">
            <div className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 flex items-center justify-center">
              <i className="ri-search-line text-charcoal/40 text-sm" />
            </div>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name, email, or phone"
              aria-label="Search users"
              className="w-full pl-9 pr-4 py-2.5 bg-white rounded-full border border-black/10 text-sm focus:outline-none focus:ring-2 focus:ring-amber-300"
            />
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {(['all', 'tenant', 'owner', 'admin'] as RoleFilter[]).map((f) => (
              <button
                key={f}
                onClick={() => setRoleFilter(f)}
                className={`px-4 py-2 rounded-full text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap flex-shrink-0 ${
                  roleFilter === f ? 'bg-amber-500 text-white' : 'bg-white text-charcoal/60 hover:text-charcoal border border-black/5'
                }`}
              >
                {f.charAt(0).toUpperCase() + f.slice(1)}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-3">
          {loading ? (
            <div className="bg-white rounded-3xl border border-black/5 p-12 text-center text-sm text-charcoal/40">Loading users…</div>
          ) : filtered.length === 0 ? (
            <div className="bg-white rounded-3xl border border-black/5 p-12 text-center">
              <div className="w-14 h-14 flex items-center justify-center mx-auto mb-4 bg-lightgray rounded-full">
                <i className="ri-user-search-line text-2xl text-charcoal/40" />
              </div>
              <h3 className="text-base font-bold text-charcoal mb-2">No users found</h3>
              <p className="text-sm text-charcoal/60">Try a different search term or filter.</p>
            </div>
          ) : (
            filtered.map((u) => (
              <div key={u.id} className="bg-white rounded-2xl border border-black/5 overflow-hidden">
                <div className="p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                        <button
                          onClick={() => setSelectedUser(u)}
                          className="text-sm font-bold text-charcoal hover:text-amber-600 transition-colors cursor-pointer underline decoration-transparent hover:decoration-current underline-offset-2"
                        >
                          {u.name}
                        </button>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${roleBadge[u.role] ?? 'bg-lightgray text-charcoal/60'}`}>
                          {u.role}
                        </span>
                        {u.suspended && (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-50 text-red-600">Suspended</span>
                        )}
                        {!u.verifiedEmail && (
                          <span
                            className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-lightgray text-charcoal/50"
                            title="Never confirmed their email -- likely an abandoned or unreachable signup"
                          >
                            Unconfirmed
                          </span>
                        )}
                        {u.verifiedAadhaar && (
                          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-green-50 text-green-600 flex items-center gap-0.5">
                            <i className="ri-shield-check-fill text-[10px]" /> Aadhaar
                          </span>
                        )}
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-0.5 text-xs text-charcoal/60">
                        <p>{u.email}</p>
                        <p>{u.phone || 'No phone on file'}</p>
                      </div>
                      {u.suspended && u.suspendedReason && (
                        <p className="text-xs text-red-500 mt-1.5">Reason: {u.suspendedReason}</p>
                      )}
                    </div>
                    {u.role !== 'admin' && (
                      <button
                        onClick={() => setSelectedUser(u)}
                        className="flex-shrink-0 text-xs font-semibold text-amber-600 hover:text-amber-700 cursor-pointer whitespace-nowrap"
                      >
                        Review
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {selectedUser && (
        <AdminUserDetailModal
          user={selectedUser}
          onClose={() => setSelectedUser(null)}
          onSuspend={(reason) => handleSuspend(selectedUser.id, reason)}
          onReactivate={() => handleReactivate(selectedUser.id)}
          busy={busyId === selectedUser.id}
        />
      )}
    </div>
  );
}
