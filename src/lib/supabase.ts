import { createClient, SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_PUBLIC_SUPABASE_URL) || '';
const supabaseAnonKey = (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_PUBLIC_SUPABASE_ANON_KEY) || '';

let supabaseInstance: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient | null {
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
