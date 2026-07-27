import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAdminListings, type AdminListingStatus, type AdminListingSort } from '@/hooks/useAdminListings';
import { useToast } from '@/hooks/useToast';

type StatusFilter = 'all' | AdminListingStatus;

export default function AdminListingsPage() {
  const { addToast } = useToast();
  const { listings, loading, search, setSearch, sort, setSort, setStatus } = useAdminListings();
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [busyId, setBusyId] = useState<string | null>(null);

  const filtered = listings.filter((l) => (statusFilter === 'all' ? true : l.status === statusFilter));

  const handleSetStatus = async (id: string, status: AdminListingStatus) => {
    setBusyId(id);
    const ok = await setStatus(id, status);
    setBusyId(null);
    if (ok) addToast(status === 'inactive' ? 'Listing taken down' : 'Listing reactivated', 'success');
    else addToast('Failed to update listing', 'error');
  };

  const statusBadge: Record<AdminListingStatus, string> = {
    active: 'bg-green-50 text-green-600',
    inactive: 'bg-red-50 text-red-600',
    draft: 'bg-lightgray text-charcoal/60',
  };

  return (
    <div className="min-h-screen bg-offwhite pt-20 pb-16">
      <div className="max-w-5xl mx-auto px-4 md:px-8">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 pt-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Link to="/admin" className="text-xs text-charcoal/40 hover:text-charcoal transition-colors">← Admin Dashboard</Link>
            </div>
            <h1 className="text-2xl md:text-3xl font-bold text-charcoal">Listings Oversight</h1>
            <p className="text-sm text-charcoal/60 mt-1">Search all listings on the platform and take down anything that violates policy.</p>
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
              placeholder="Search by title, location, city, or owner name/email/phone"
              aria-label="Search listings"
              className="w-full pl-9 pr-4 py-2.5 bg-white rounded-full border border-black/10 text-sm focus:outline-none focus:ring-2 focus:ring-amber-300"
            />
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {(['all', 'active', 'inactive', 'draft'] as StatusFilter[]).map((f) => (
              <button
                key={f}
                onClick={() => setStatusFilter(f)}
                className={`px-4 py-2 rounded-full text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap flex-shrink-0 ${
                  statusFilter === f ? 'bg-amber-500 text-white' : 'bg-white text-charcoal/60 hover:text-charcoal border border-black/5'
                }`}
              >
                {f.charAt(0).toUpperCase() + f.slice(1)}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2 mb-4">
          <label htmlFor="listings-sort" className="text-xs text-charcoal/60">Sort by</label>
          <select
            id="listings-sort"
            value={sort}
            onChange={(e) => setSort(e.target.value as AdminListingSort)}
            className="px-3 py-1.5 rounded-full text-xs border border-black/10 bg-white focus:outline-none focus:ring-2 focus:ring-amber-300 cursor-pointer"
          >
            <option value="newest">Newest first</option>
            <option value="oldest_updated">Longest untouched by owner</option>
          </select>
        </div>

        <div className="space-y-3">
          {loading ? (
            <div className="bg-white rounded-3xl border border-black/5 p-12 text-center text-sm text-charcoal/40">Loading listings…</div>
          ) : filtered.length === 0 ? (
            <div className="bg-white rounded-3xl border border-black/5 p-12 text-center">
              <div className="w-14 h-14 flex items-center justify-center mx-auto mb-4 bg-lightgray rounded-full">
                <i className="ri-home-search-line text-2xl text-charcoal/40" />
              </div>
              <h3 className="text-base font-bold text-charcoal mb-2">No listings found</h3>
              <p className="text-sm text-charcoal/60">Try a different search term or filter.</p>
            </div>
          ) : (
            filtered.map((l) => (
              <div key={l.id} className="bg-white rounded-2xl border border-black/5 p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                      <p className="text-sm font-bold text-charcoal">{l.title}</p>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${statusBadge[l.status]}`}>{l.status}</span>
                      {l.verified && (
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-green-50 text-green-600">Verified</span>
                      )}
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-0.5 text-xs text-charcoal/60">
                      <p>{l.location}{l.city ? `, ${l.city}` : ''}</p>
                      <p>Owner: <span className="font-medium text-charcoal">{l.ownerName}</span></p>
                      <p>₹{l.price.toLocaleString('en-IN')}</p>
                      <p>Listed: {new Date(l.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
                      <p>Last updated: {new Date(l.updatedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
                    </div>
                  </div>
                  <div className="flex-shrink-0">
                    {l.status === 'inactive' ? (
                      <button
                        onClick={() => handleSetStatus(l.id, 'active')}
                        disabled={busyId === l.id}
                        className="px-3 py-2 rounded-full text-xs font-semibold bg-green-500 text-white hover:bg-green-600 transition-colors cursor-pointer whitespace-nowrap disabled:opacity-60"
                      >
                        {busyId === l.id ? 'Restoring…' : 'Restore'}
                      </button>
                    ) : (
                      <button
                        onClick={() => handleSetStatus(l.id, 'inactive')}
                        disabled={busyId === l.id}
                        className="px-3 py-2 rounded-full text-xs font-semibold bg-red-100 text-red-600 hover:bg-red-200 transition-colors cursor-pointer whitespace-nowrap disabled:opacity-60"
                      >
                        {busyId === l.id ? 'Taking down…' : 'Take Down'}
                      </button>
                    )}
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
