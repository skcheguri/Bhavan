import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAdminCommunityModeration } from '@/hooks/useCommunity';
import { useToast } from '@/hooks/useToast';

export default function AdminCommunityPage() {
  const { addToast } = useToast();
  const { posts, loading, toggleHide, dismissReports } = useAdminCommunityModeration();
  const [filter, setFilter] = useState<'all' | 'flagged' | 'hidden'>('all');

  const filtered = posts.filter((p) => {
    if (filter === 'flagged') return p.report_count > 0 && !p.hidden;
    if (filter === 'hidden') return p.hidden;
    return true;
  });

  const handleToggleHide = async (postId: string, currentlyHidden: boolean) => {
    const ok = await toggleHide(postId, !currentlyHidden);
    addToast(ok ? (currentlyHidden ? 'Post restored' : 'Post hidden') : 'Failed to update post', ok ? 'success' : 'error');
  };

  const handleDismiss = async (postId: string) => {
    const ok = await dismissReports(postId);
    addToast(ok ? 'Reports dismissed' : 'Failed to dismiss reports', ok ? 'success' : 'error');
  };

  return (
    <div className="min-h-screen bg-offwhite pt-20 pb-16">
      <div className="max-w-5xl mx-auto px-4 md:px-8">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 pt-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Link to="/admin" className="text-xs text-charcoal/40 hover:text-charcoal transition-colors">← Admin Dashboard</Link>
            </div>
            <h1 className="text-2xl md:text-3xl font-bold text-charcoal">Community Moderation</h1>
            <p className="text-sm text-charcoal/60 mt-1">Review flagged posts and enforce community guidelines.</p>
          </div>
        </div>

        {/* Filters */}
        <div className="flex gap-2 mb-6 overflow-x-auto pb-1">
          {(['all', 'flagged', 'hidden'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-4 py-2 rounded-full text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap flex-shrink-0 ${
                filter === f ? 'bg-amber-500 text-white' : 'bg-white text-charcoal/60 hover:text-charcoal border border-black/5'
              }`}
            >
              {f.charAt(0).toUpperCase() + f.slice(1)}
              {f !== 'all' && (
                <span className={`ml-1.5 text-[10px] px-1.5 py-0.5 rounded-full font-bold ${filter === f ? 'bg-white/20 text-white' : 'bg-lightgray text-charcoal/40'}`}>
                  {posts.filter((p) => (f === 'flagged' ? p.report_count > 0 && !p.hidden : p.hidden)).length}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Posts list */}
        <div className="space-y-4">
          {loading ? (
            <div className="bg-white rounded-3xl border border-black/5 p-12 text-center text-sm text-charcoal/40">
              Loading posts…
            </div>
          ) : filtered.length === 0 ? (
            <div className="bg-white rounded-3xl border border-black/5 p-12 text-center">
              <div className="w-14 h-14 flex items-center justify-center mx-auto mb-4 bg-lightgray rounded-full">
                <i className="ri-discuss-line text-2xl text-charcoal/40" />
              </div>
              <h3 className="text-base font-bold text-charcoal mb-2">Nothing to moderate</h3>
              <p className="text-sm text-charcoal/60">All community content is clean for this filter.</p>
            </div>
          ) : (
            filtered.map((p) => (
              <div key={p.id} className={`bg-white rounded-2xl border overflow-hidden ${p.hidden ? 'border-red-100 opacity-70' : 'border-black/5'}`}>
                <div className="p-5">
                  <div className="flex items-start gap-3 mb-3">
                    <img src={p.author?.avatar_url ?? '/placeholders/avatar.svg'} alt={p.author?.name ?? 'Author'} className="w-10 h-10 rounded-full object-cover flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-bold text-charcoal">{p.author?.name ?? 'Unknown'}</p>
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-lightgray text-charcoal/60 uppercase">{p.category}</span>
                        {p.report_count > 0 && (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-50 text-red-600">
                            <i className="ri-flag-line text-[10px]" /> {p.report_count} reports
                          </span>
                        )}
                        {p.hidden && (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-600">Hidden</span>
                        )}
                      </div>
                      <p className="text-xs text-charcoal/40 mt-0.5">{new Date(p.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
                    </div>
                  </div>

                  <h3 className="text-sm font-bold text-charcoal mb-1">{p.title}</h3>
                  <p className="text-xs text-charcoal/60 leading-relaxed line-clamp-3">{p.content}</p>

                  {p.report_reasons.length > 0 && (
                    <div className="mt-3 bg-red-50 rounded-lg px-3 py-2">
                      <p className="text-xs text-red-600">
                        <span className="font-semibold">Report reasons:</span> {p.report_reasons.join('; ')}
                      </p>
                    </div>
                  )}

                  <div className="flex items-center gap-2 mt-4">
                    <button
                      onClick={() => handleToggleHide(p.id, p.hidden)}
                      className={`px-4 py-2 rounded-full text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                        p.hidden
                          ? 'bg-green-500 text-white hover:bg-green-600'
                          : 'bg-red-100 text-red-600 hover:bg-red-200'
                      }`}
                    >
                      {p.hidden ? 'Restore Post' : 'Hide Post'}
                    </button>
                    {!p.hidden && p.report_count > 0 && (
                      <button
                        onClick={() => handleDismiss(p.id)}
                        className="px-4 py-2 rounded-full text-xs font-semibold bg-lightgray text-charcoal/60 hover:bg-gray-200 transition-colors cursor-pointer whitespace-nowrap"
                      >
                        Dismiss Reports
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
