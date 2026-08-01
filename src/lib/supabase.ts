import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database.types';

const supabaseUrl = (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_PUBLIC_SUPABASE_URL) || '';
const supabaseAnonKey = (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_PUBLIC_SUPABASE_ANON_KEY) || '';

// Regenerate src/types/database.types.ts after any migration with:
//   npm run gen:types
// Typing the client makes every .from()/.rpc() call schema-aware -- a
// renamed or dropped column becomes a compile error instead of silently
// rendering as '' in the UI (which previously reached even the legal
// documents via the hand-written mapRow casts).
let supabaseInstance: SupabaseClient<Database> | null = null;

export function getSupabase(): SupabaseClient<Database> | null {
  if (!supabaseInstance && supabaseUrl && supabaseAnonKey) {
    supabaseInstance = createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        autoRefreshToken: true,
        persistSession: true,
      },
    });
  }
  return supabaseInstance;
}

export function isSupabaseConnected(): boolean {
  return !!supabaseUrl && !!supabaseAnonKey;
}

// supabase-js's functions.invoke() only sets `error.message` to a generic
// "Edge Function returned a non-2xx status code" on failure -- the actual
// { error: "..." } body the function returned is on `error.context`, a
// Response object, and isn't parsed automatically. This reads it out.
export async function functionErrorMessage(error: unknown): Promise<string | undefined> {
  const context = (error as { context?: unknown } | null)?.context;
  if (context instanceof Response) {
    try {
      const body = await context.clone().json();
      if (typeof body?.error === 'string') return body.error;
    } catch {
      // response body wasn't JSON -- fall through to the generic message
    }
  }
  return error instanceof Error ? error.message : undefined;
}
