import { useState, useEffect, useCallback } from 'react';
import { getSupabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/useToast';
import { unblockUser } from '@/hooks/useBlocks';

interface BlockedPerson {
  id: string;
  name: string;
  avatar: string | null;
  since: string;
}

/**
 * The people you have blocked, and the only reliable way back.
 *
 * Blocking happens on someone's profile, and a profile is reached
 * through an enquiry or a society member list. Both of those can go
 * away -- an enquiry gets declined, a member leaves the building -- and
 * with them the only route to the Unblock button. Without this list a
 * block would quietly become permanent, which is not what anyone was
 * told when they made it.
 */
export default function BlockedList() {
  const { user } = useAuth();
  const { addToast } = useToast();
  const [people, setPeople] = useState<BlockedPerson[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const supabase = getSupabase();
    if (!supabase || !user) {
      setLoading(false);
      return;
    }
    setLoading(true);
    // users_public rather than users: this only ever needs the name and
    // picture, and the blocked person is not a connection.
    const { data } = await supabase
      .from('user_blocks')
      .select('blocked_id, created_at, blocked:users_public!user_blocks_blocked_id_fkey(name, avatar_url)')
      .eq('blocker_id', user.id)
      .order('created_at', { ascending: false });

    setPeople(
      ((data ?? []) as unknown as Record<string, unknown>[]).map((r) => {
        const who = r.blocked as { name?: string; avatar_url?: string } | null;
        return {
          id: String(r.blocked_id),
          name: who?.name ?? 'Someone',
          avatar: who?.avatar_url ?? null,
          since: String(r.created_at),
        };
      })
    );
    setLoading(false);
  }, [user]);

  useEffect(() => {
    void load();
  }, [load]);

  const undo = async (person: BlockedPerson) => {
    if (!user) return;
    setBusyId(person.id);
    const { error } = await unblockUser(user.id, person.id);
    setBusyId(null);
    if (error) addToast(error, 'error');
    else {
      addToast(`Unblocked ${person.name}.`, 'success');
      await load();
    }
  };

  if (loading) return <div className="h-16 bg-gray-100 rounded-xl animate-pulse" />;

  return (
    <div>
      <h3 className="text-sm font-bold text-charcoal">Blocked people</h3>
      <p className="text-xs text-charcoal/50 mt-1 mb-3">
        Neither of you can start an enquiry or send messages. Anything already sent stays
        readable to both of you.
      </p>

      {people.length === 0 ? (
        <p className="text-sm text-charcoal/40">You haven&apos;t blocked anyone.</p>
      ) : (
        <div className="space-y-2">
          {people.map((p) => (
            <div
              key={p.id}
              className="flex items-center gap-3 p-3 bg-offwhite rounded-xl"
            >
              <img
                src={p.avatar || '/placeholders/avatar.svg'}
                alt=""
                className="w-9 h-9 rounded-full object-cover flex-shrink-0 bg-lightgray"
              />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-charcoal truncate">{p.name}</p>
                <p className="text-xs text-charcoal/40">
                  Blocked{' '}
                  {new Date(p.since).toLocaleDateString('en-IN', {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                  })}
                </p>
              </div>
              <button
                onClick={() => void undo(p)}
                disabled={busyId === p.id}
                className="flex-shrink-0 px-3 py-1.5 border border-gray-200 text-charcoal rounded-lg text-xs font-semibold disabled:opacity-40"
              >
                {busyId === p.id ? 'Working…' : 'Unblock'}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
