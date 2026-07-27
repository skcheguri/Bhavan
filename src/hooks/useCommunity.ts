import { useState, useEffect, useCallback } from 'react';
import { getSupabase, isSupabaseConnected } from '@/lib/supabase';

export interface CommunityPostFromDB {
  id: string;
  author_id: string;
  title: string;
  content: string;
  category: 'discussion' | 'advice' | 'review' | 'event' | 'general';
  created_at: string;
  updated_at: string;
  author?: {
    name: string | null;
    avatar_url: string | null;
  };
}

export interface CommunityCommentFromDB {
  id: string;
  post_id: string;
  author_id: string;
  content: string;
  created_at: string;
  author?: {
    name: string | null;
    avatar_url: string | null;
  };
}

interface UseCommunityReturn {
  posts: CommunityPostFromDB[];
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

export function useCommunity(category?: string): UseCommunityReturn {
  const [posts, setPosts] = useState<CommunityPostFromDB[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchPosts = useCallback(async () => {
    if (!isSupabaseConnected()) {
      setLoading(false);
      return;
    }
    const supabase = getSupabase();
    if (!supabase) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    let query = supabase
      .from('community_posts')
      .select('*, author:users_public!community_posts_author_id_fkey(name, avatar_url)')
      .order('created_at', { ascending: false });

    if (category && category !== 'all') {
      query = query.eq('category', category);
    }

    const { data, error: dbError } = await query;

    if (dbError) {
      setError(dbError.message);
      setPosts([]);
    } else {
      setPosts((data as CommunityPostFromDB[]) ?? []);
    }
    setLoading(false);
  }, [category]);

  useEffect(() => {
    fetchPosts();
  }, [fetchPosts]);

  return { posts, loading, error, refresh: fetchPosts };
}

export interface AdminCommunityPost extends CommunityPostFromDB {
  hidden: boolean;
  report_count: number;
  report_reasons: string[];
}

export function useAdminCommunityModeration() {
  const [posts, setPosts] = useState<AdminCommunityPost[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const supabase = getSupabase();
    if (!supabase) {
      setLoading(false);
      return;
    }
    setLoading(true);

    const [{ data: postRows, error: postsError }, { data: reportRows, error: reportsError }] = await Promise.all([
      supabase
        .from('community_posts')
        .select('*, author:users_public!community_posts_author_id_fkey(name, avatar_url)')
        .order('created_at', { ascending: false }),
      supabase.from('community_post_reports').select('post_id, reason'),
    ]);

    if (postsError) {
      console.warn('Supabase admin community_posts fetch error:', postsError.message);
      setPosts([]);
      setLoading(false);
      return;
    }
    if (reportsError) {
      console.warn('Supabase community_post_reports fetch error:', reportsError.message);
    }

    const reportsByPost = new Map<string, string[]>();
    for (const r of (reportRows ?? []) as { post_id: string; reason: string | null }[]) {
      const list = reportsByPost.get(r.post_id) ?? [];
      if (r.reason) list.push(r.reason);
      reportsByPost.set(r.post_id, list);
    }

    setPosts(
      ((postRows ?? []) as CommunityPostFromDB[]).map((p) => ({
        ...p,
        hidden: Boolean((p as unknown as { hidden?: boolean }).hidden),
        report_count: reportsByPost.get(p.id)?.length ?? 0,
        report_reasons: reportsByPost.get(p.id) ?? [],
      }))
    );
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const toggleHide = useCallback(async (postId: string, hidden: boolean) => {
    const supabase = getSupabase();
    if (!supabase) return false;
    const { error } = await supabase.from('community_posts').update({ hidden }).eq('id', postId);
    if (error) {
      console.warn('Supabase community_posts hide update error:', error.message);
      return false;
    }
    setPosts((prev) => prev.map((p) => (p.id === postId ? { ...p, hidden } : p)));
    return true;
  }, []);

  const dismissReports = useCallback(async (postId: string) => {
    const supabase = getSupabase();
    if (!supabase) return false;
    const { error } = await supabase.from('community_post_reports').delete().eq('post_id', postId);
    if (error) {
      console.warn('Supabase community_post_reports delete error:', error.message);
      return false;
    }
    setPosts((prev) => prev.map((p) => (p.id === postId ? { ...p, report_count: 0, report_reasons: [] } : p)));
    return true;
  }, []);

  return { posts, loading, toggleHide, dismissReports, refresh: load };
}

export async function createCommunityPost(postData: {
  author_id: string;
  title: string;
  content: string;
  category: string;
}): Promise<{ data: CommunityPostFromDB | null; error: string | null }> {
  const supabase = getSupabase();
  if (!supabase) return { data: null, error: 'Supabase not connected' };

  const { data, error } = await supabase
    .from('community_posts')
    .insert(postData)
    .select()
    .single();

  if (error) {
    return { data: null, error: error.message };
  }
  return { data: data as CommunityPostFromDB, error: null };
}