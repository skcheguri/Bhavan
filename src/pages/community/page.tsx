import { useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useOwnerRateLimit } from '@/hooks/useOwnerRateLimit';
import { useToast } from '@/hooks/useToast';
import { useCommunity, createCommunityPost } from '@/hooks/useCommunity';

export default function Community() {
  const [activeCategory, setActiveCategory] = useState('all');
  const { posts: dbPosts, loading: postsLoading, refresh: refreshPosts } = useCommunity(activeCategory === 'all' ? undefined : activeCategory);

  const posts = dbPosts.map((p) => ({
    id: p.id,
    title: p.title,
    content: p.content,
    author_name: p.author?.name ?? 'Community Member',
    author_avatar: p.author?.avatar_url ?? '/placeholders/avatar.svg',
    category: p.category,
    created_at: new Date(p.created_at).toLocaleDateString('en-IN', { year: 'numeric', month: 'short', day: 'numeric' }),
  }));

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [posting, setPosting] = useState(false);
  const [newPostTitle, setNewPostTitle] = useState('');
  const [newPostContent, setNewPostContent] = useState('');
  const [newPostCategory, setNewPostCategory] = useState<'discussion' | 'advice' | 'review'>('discussion');
  const { user } = useAuth();
  const { community: communityLimit, recordCommunity } = useOwnerRateLimit(user?.id);
  const { addToast } = useToast();

  const categories = [
    { value: 'all', label: 'All Topics' },
    { value: 'discussion', label: 'Discussions' },
    { value: 'advice', label: 'Advice' },
    { value: 'review', label: 'Reviews' },
  ];

  const filteredPosts = activeCategory === 'all'
    ? posts
    : posts.filter((post) => post.category === activeCategory);

  const getCategoryColor = (category: string) => {
    switch (category) {
      case 'discussion': return 'bg-blue-100 text-blue-700';
      case 'advice': return 'bg-green-100 text-green-700';
      case 'review': return 'bg-purple-100 text-purple-700';
      default: return 'bg-lightgray text-charcoal/80';
    }
  };

  const handleCreatePost = async () => {
    if (!newPostTitle.trim() || !newPostContent.trim() || !user) return;

    if (!communityLimit.canSend) {
      addToast(communityLimit.limitReason || 'Rate limit reached. Please try again later.', 'error');
      return;
    }

    const ok = recordCommunity();
    if (!ok) {
      addToast(communityLimit.limitReason || 'Rate limit reached. Please try again later.', 'error');
      return;
    }

    setPosting(true);
    const { error } = await createCommunityPost({
      author_id: user.id,
      title: newPostTitle.trim(),
      content: newPostContent.trim(),
      category: newPostCategory,
    });
    setPosting(false);

    if (error) {
      addToast(error, 'error');
      return;
    }

    refreshPosts();
    setNewPostTitle('');
    setNewPostContent('');
    setNewPostCategory('discussion');
    setShowCreateModal(false);
    addToast('Post published successfully!', 'success');
  };

  return (
    <div className="min-h-screen bg-offwhite">
      {/* Header */}
      <section className="bg-white py-12 md:py-16 border-b">
        <div className="w-full px-4 md:px-8 lg:px-12">
          <div className="max-w-6xl mx-auto flex flex-col sm:flex-row sm:items-center sm:justify-between gap-6">
            <div>
              <h1 className="text-3xl md:text-4xl font-bold text-charcoal">Community</h1>
              <p className="mt-2 text-charcoal/70 max-w-2xl">
                Connect with fellow renters, share experiences, ask questions, and get advice from our supportive community.
              </p>
            </div>
            <button
              onClick={() => setShowCreateModal(true)}
              disabled={!communityLimit.canSend || !user}
              className="flex items-center gap-2 px-5 py-2.5 rounded-full bg-brand text-white text-sm font-semibold hover:bg-brand-dark transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap flex-shrink-0"
            >
              <i className="ri-add-line" /> New Post
            </button>
          </div>
        </div>
      </section>

      {/* Rate limit banner */}
      {!communityLimit.canSend && communityLimit.limitReason && (
        <section className="bg-red-50 border-b border-red-100">
          <div className="w-full px-4 md:px-8 lg:px-12">
            <div className="max-w-6xl mx-auto py-3 flex items-start gap-2">
              <i className="ri-error-warning-line text-red-500 text-sm flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-red-700">Community Post Limit Reached</p>
                <p className="text-xs text-red-500">{communityLimit.limitReason}</p>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Main Content */}
      <section className="py-8 md:py-12">
        <div className="w-full px-4 md:px-8 lg:px-12">
          <div className="max-w-6xl mx-auto">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              {/* Posts Column */}
              <div className="lg:col-span-2">
                {/* Category Filter */}
                <div className="flex flex-wrap gap-2 mb-6">
                  {categories.map((cat) => (
                    <button
                      key={cat.value}
                      onClick={() => setActiveCategory(cat.value)}
                      className={`px-4 py-2 rounded-full text-sm font-medium transition-colors whitespace-nowrap ${
                        activeCategory === cat.value
                          ? 'bg-brand text-white'
                          : 'bg-white text-charcoal border border-black/10 hover:border-brand'
                      }`}
                    >
                      {cat.label}
                    </button>
                  ))}
                </div>

                {/* Posts List */}
                <div className="space-y-4">
                  {postsLoading && (
                    <div className="text-center py-12 text-sm text-charcoal/40">Loading discussions...</div>
                  )}
                  {!postsLoading && filteredPosts.length === 0 && (
                    <div className="text-center py-12 bg-white rounded-2xl border border-black/5">
                      <p className="text-sm text-charcoal/60">No posts yet. Be the first to start a discussion.</p>
                    </div>
                  )}
                  {filteredPosts.map((post) => (
                    <div
                      key={post.id}
                      className="bg-white rounded-2xl p-6 border border-black/5 hover:shadow-md transition-all duration-300"
                    >
                      <div className="flex items-start gap-4">
                        <img
                          src={post.author_avatar}
                          alt={post.author_name}
                          className="w-10 h-10 rounded-full object-cover flex-shrink-0"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-semibold text-charcoal text-sm">{post.author_name}</span>
                            <span className={`text-xs font-medium px-2 py-0.5 rounded-full capitalize ${getCategoryColor(post.category)}`}>
                              {post.category}
                            </span>
                            <span className="text-xs text-charcoal/40">{post.created_at}</span>
                          </div>
                          <h3 className="mt-2 text-lg font-semibold text-charcoal">{post.title}</h3>
                          <p className="mt-1 text-sm text-charcoal/70 line-clamp-2">{post.content}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Sidebar */}
              <div className="space-y-6">
                {/* Guidelines */}
                <div className="bg-brand-light rounded-2xl p-6">
                  <h3 className="font-semibold text-charcoal mb-3">Community Guidelines</h3>
                  <ul className="space-y-2 text-sm text-charcoal/70">
                    <li className="flex items-start gap-2">
                      <div className="w-4 h-4 flex items-center justify-center mt-0.5">
                        <i className="ri-check-line text-brand text-xs" />
                      </div>
                      Be respectful and supportive
                    </li>
                    <li className="flex items-start gap-2">
                      <div className="w-4 h-4 flex items-center justify-center mt-0.5">
                        <i className="ri-check-line text-brand text-xs" />
                      </div>
                      Share accurate information
                    </li>
                    <li className="flex items-start gap-2">
                      <div className="w-4 h-4 flex items-center justify-center mt-0.5">
                        <i className="ri-check-line text-brand text-xs" />
                      </div>
                      No spam or self-promotion
                    </li>
                    <li className="flex items-start gap-2">
                      <div className="w-4 h-4 flex items-center justify-center mt-0.5">
                        <i className="ri-check-line text-brand text-xs" />
                      </div>
                      Protect personal privacy
                    </li>
                  </ul>
                </div>

                {/* Rate limit info */}
                <div className="bg-white rounded-2xl p-6 border border-black/5">
                  <h3 className="font-semibold text-charcoal mb-3">Posting Limits</h3>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-charcoal/70">Daily remaining</span>
                      <span className={`font-semibold ${communityLimit.dailyRemaining === 0 ? 'text-red-500' : 'text-charcoal'}`}>
                        {communityLimit.dailyRemaining} / {communityLimit.dailyRemaining + communityLimit.dailyCount}
                      </span>
                    </div>
                    <div className="w-full bg-lightgray rounded-full h-2">
                      <div
                        className={`h-2 rounded-full transition-all ${communityLimit.dailyRemaining === 0 ? 'bg-red-500' : 'bg-brand'}`}
                        style={{ width: `${communityLimit.dailyCount + communityLimit.dailyRemaining > 0 ? (communityLimit.dailyRemaining / (communityLimit.dailyRemaining + communityLimit.dailyCount)) * 100 : 0}%` }}
                      />
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-charcoal/70">Weekly remaining</span>
                      <span className={`font-semibold ${communityLimit.weeklyRemaining === 0 ? 'text-red-500' : 'text-charcoal'}`}>
                        {communityLimit.weeklyRemaining} / {communityLimit.weeklyRemaining + communityLimit.weeklyCount}
                      </span>
                    </div>
                    <div className="w-full bg-lightgray rounded-full h-2">
                      <div
                        className={`h-2 rounded-full transition-all ${communityLimit.weeklyRemaining === 0 ? 'bg-red-500' : 'bg-brand'}`}
                        style={{ width: `${communityLimit.weeklyCount + communityLimit.weeklyRemaining > 0 ? (communityLimit.weeklyRemaining / (communityLimit.weeklyRemaining + communityLimit.weeklyCount)) * 100 : 0}%` }}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Create Post Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowCreateModal(false)} />
          <div className="relative bg-white rounded-2xl p-6 max-w-lg w-full max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-bold text-charcoal">Create New Post</h3>
              <button
                onClick={() => setShowCreateModal(false)}
                className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-lightgray transition-colors cursor-pointer"
              >
                <i className="ri-close-line text-charcoal/60" />
              </button>
            </div>

            {!communityLimit.canSend && communityLimit.limitReason && (
              <div className="bg-red-50 border border-red-100 rounded-lg p-3 mb-4 flex items-start gap-2">
                <i className="ri-error-warning-line text-red-500 text-sm flex-shrink-0 mt-0.5" />
                <p className="text-xs text-red-600">{communityLimit.limitReason}</p>
              </div>
            )}

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-charcoal mb-1.5">Category</label>
                <div className="flex gap-2">
                  {(['discussion', 'advice', 'review'] as const).map((cat) => (
                    <button
                      key={cat}
                      onClick={() => setNewPostCategory(cat)}
                      className={`px-4 py-2 rounded-full text-xs font-semibold transition-colors whitespace-nowrap ${
                        newPostCategory === cat
                          ? 'bg-brand text-white'
                          : 'bg-lightgray text-charcoal/70 hover:bg-gray-200'
                      }`}
                    >
                      {cat.charAt(0).toUpperCase() + cat.slice(1)}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-charcoal mb-1.5">Title</label>
                <input
                  value={newPostTitle}
                  onChange={(e) => setNewPostTitle(e.target.value)}
                  placeholder="What do you want to talk about?"
                  maxLength={120}
                  className="w-full px-4 py-3 bg-offwhite rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand/30 border border-black/5"
                />
                <p className="text-[11px] text-charcoal/40 mt-1 text-right">{newPostTitle.length}/120</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-charcoal mb-1.5">Content</label>
                <textarea
                  value={newPostContent}
                  onChange={(e) => setNewPostContent(e.target.value)}
                  placeholder="Share your thoughts, questions, or experience..."
                  rows={5}
                  maxLength={1000}
                  className="w-full px-4 py-3 bg-offwhite rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand/30 border border-black/5 resize-none"
                />
                <p className="text-[11px] text-charcoal/40 mt-1 text-right">{newPostContent.length}/1000</p>
              </div>

              <div className="flex items-center justify-between pt-2">
                <p className="text-[11px] text-charcoal/40">
                  {communityLimit.dailyRemaining} posts remaining today
                </p>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setShowCreateModal(false)}
                    className="px-4 py-2 rounded-full border border-black/10 text-sm font-medium text-charcoal/60 hover:bg-lightgray transition-colors cursor-pointer whitespace-nowrap"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleCreatePost}
                    disabled={!newPostTitle.trim() || !newPostContent.trim() || !communityLimit.canSend || posting}
                    className="px-5 py-2 rounded-full bg-brand text-white text-sm font-semibold hover:bg-brand-dark transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap flex items-center gap-2"
                  >
                    {posting && <i className="ri-loader-4-line animate-spin" />}
                    {posting ? 'Publishing...' : 'Publish Post'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}