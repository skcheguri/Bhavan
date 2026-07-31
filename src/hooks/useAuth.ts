import { useState, useEffect, createContext, useContext, useCallback } from 'react';
import { getSupabase, isSupabaseConnected } from '@/lib/supabase';
import { User } from '@supabase/supabase-js';

export type UserRole = 'tenant' | 'owner' | 'admin' | null;

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  verified: boolean;
  verifiedEmail: boolean;
  verifiedPhone: boolean;
  avatar: string | null;
  phone: string | null;
  joinedAt: string;
  aadhaarLast4?: string;
  // Tenant-specific
  currentFlat?: string;
  landlordName?: string;
  leaseEnd?: string;
  dateOfBirth?: string;
  occupation?: string;
  emergencyContact?: string;
  moveInDate?: string;
  // Owner-specific
  totalProperties?: number;
  totalTenants?: number;
  ownedListings?: string[];
}

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  signIn: (email: string, password: string, role: 'tenant' | 'owner') => Promise<{ error: string | null }>;
  signUp: (email: string, password: string, name: string, role: 'tenant' | 'owner') => Promise<{ error: string | null }>;
  signInWithGoogle: (role: 'tenant' | 'owner') => Promise<{ error: string | null }>;
  sendPhoneOtp: (phone: string, name?: string, role?: 'tenant' | 'owner') => Promise<{ error: string | null }>;
  verifyPhoneOtp: (phone: string, token: string) => Promise<{ error: string | null }>;
  sendPhoneVerificationOtp: (phone: string) => Promise<{ error: string | null }>;
  confirmPhoneVerificationOtp: (phone: string, token: string) => Promise<{ error: string | null }>;
  sendPasswordResetEmail: (email: string, redirectTo: string) => Promise<{ error: string | null }>;
  updatePassword: (newPassword: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  updateProfile: (updates: Partial<AuthUser>) => Promise<{ error: string | null; emailVerificationSent?: boolean }>;
  refreshProfile: () => Promise<void>;
  mfaEnrollTotp: () => Promise<{ error: string | null; factorId?: string; qrCode?: string; secret?: string }>;
  mfaChallengeAndVerify: (factorId: string, code: string) => Promise<{ error: string | null }>;
  mfaUnenroll: (factorId: string) => Promise<{ error: string | null }>;
  mfaListFactors: () => Promise<{ error: string | null; verifiedTotpFactorId?: string; unverifiedTotpFactorId?: string }>;
  mfaGetAssuranceLevel: () => Promise<{ currentLevel: string | null; nextLevel: string | null }>;
}

// Role picked on the Login/Signup screen before a Google OAuth redirect,
// applied to the profile row in /auth/callback ONLY if the account turns
// out to be brand new -- an existing user's real role must never be
// overwritten just because they clicked the wrong role card on the way in.
export const GOOGLE_PENDING_ROLE_KEY = 'bhavan_pending_oauth_role';

// ── Helpers ────────────────────────────────────────────────────────────────

function dbRoleToAppRole(role: string | null): UserRole {
  if (role === 'tenant') return 'tenant';
  if (role === 'owner' || role === 'landlord') return 'owner';
  if (role === 'admin') return 'admin';
  return null;
}

function appRoleToDbRole(role: 'tenant' | 'owner' | 'admin'): string {
  return role;
}

async function buildAuthUser(supabaseUser: User): Promise<AuthUser | null> {
  const supabase = getSupabase();
  if (!supabase) return null;

  // The users table only grants anon/authenticated the safe public
  // columns (name, avatar_url, role, verified_aadhaar) -- get_my_profile()
  // is a SECURITY DEFINER RPC that returns the full row, scoped to the
  // caller's own auth.uid() by construction. See migration 015.
  const { data: rows, error } = await supabase.rpc('get_my_profile');
  const profile = rows?.[0];

  if (error || !profile) {
    // Fallback when profile hasn't synced yet
    return {
      id: supabaseUser.id,
      name: supabaseUser.user_metadata?.name || supabaseUser.email?.split('@')[0] || 'User',
      email: supabaseUser.email || '',
      role: dbRoleToAppRole(supabaseUser.user_metadata?.role) || 'tenant',
      verified: false,
      verifiedEmail: !!supabaseUser.email_confirmed_at,
      verifiedPhone: !!supabaseUser.phone_confirmed_at,
      avatar: supabaseUser.user_metadata?.avatar_url || null,
      phone: supabaseUser.phone || null,
      joinedAt: new Date(supabaseUser.created_at).toLocaleDateString('en-IN', {
        month: 'long',
        year: 'numeric',
      }),
    };
  }

  return {
    id: profile.id,
    name: profile.name || 'User',
    email: profile.email || '',
    role: dbRoleToAppRole(profile.role),
    verified: profile.verified_aadhaar || false,
    verifiedEmail: profile.verified_email || false,
    verifiedPhone: profile.verified_phone || false,
    avatar: profile.avatar_url || null,
    phone: profile.phone || null,
    aadhaarLast4: profile.aadhaar_last4 || undefined,
    dateOfBirth: profile.date_of_birth || undefined,
    occupation: profile.occupation || undefined,
    emergencyContact: profile.emergency_contact || undefined,
    moveInDate: profile.move_in_date || undefined,
    currentFlat: profile.current_flat || undefined,
    joinedAt: new Date(profile.created_at).toLocaleDateString('en-IN', {
      month: 'long',
      year: 'numeric',
    }),
  };
}

// ── Context ────────────────────────────────────────────────────────────────

export const AuthContext = createContext<AuthContextValue>({
  user: null,
  loading: false,
  signIn: async () => ({ error: null }),
  signUp: async () => ({ error: null }),
  signInWithGoogle: async () => ({ error: null }),
  sendPhoneOtp: async () => ({ error: null }),
  verifyPhoneOtp: async () => ({ error: null }),
  sendPhoneVerificationOtp: async () => ({ error: null }),
  confirmPhoneVerificationOtp: async () => ({ error: null }),
  sendPasswordResetEmail: async () => ({ error: null }),
  updatePassword: async () => ({ error: null }),
  signOut: async () => {},
  updateProfile: async () => ({ error: null }),
  refreshProfile: async () => {},
  mfaEnrollTotp: async () => ({ error: null }),
  mfaChallengeAndVerify: async () => ({ error: null }),
  mfaUnenroll: async () => ({ error: null }),
  mfaListFactors: async () => ({ error: null }),
  mfaGetAssuranceLevel: async () => ({ currentLevel: null, nextLevel: null }),
});

export function useAuth() {
  return useContext(AuthContext);
}

// ── Provider ─────────────────────────────────────────────────────────────

export function useAuthProvider(): AuthContextValue {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshUser = useCallback(async (sessionUser: User | null) => {
    if (!sessionUser) {
      setUser(null);
      setLoading(false);
      return;
    }
    const authUser = await buildAuthUser(sessionUser);
    setUser(authUser);
    setLoading(false);
  }, []);

  // Session check + auth listener
  useEffect(() => {
    if (!isSupabaseConnected()) {
      setLoading(false);
      return;
    }

    const supabase = getSupabase();
    if (!supabase) {
      setLoading(false);
      return;
    }

    let mounted = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      refreshUser(data.session?.user ?? null);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!mounted) return;
      refreshUser(session?.user ?? null);
    });

    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
    };
  }, [refreshUser]);

  const signIn = async (email: string, password: string, _role: 'tenant' | 'owner'): Promise<{ error: string | null }> => {
    const supabase = getSupabase();
    if (!supabase) return { error: 'Supabase not connected' };
    if (!password) return { error: 'Password is required for email sign in' };

    setLoading(true);

    const { data, error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      setLoading(false);
      return { error: error.message };
    }

    if (data.user) {
      const authUser = await buildAuthUser(data.user);
      setUser(authUser);
    }
    setLoading(false);
    return { error: null };
  };

  const signUp = async (
    email: string,
    password: string,
    name: string,
    role: 'tenant' | 'owner'
  ): Promise<{ error: string | null }> => {
    const supabase = getSupabase();
    if (!supabase) return { error: 'Supabase not connected' };
    if (!password) return { error: 'Password is required for email sign up' };

    setLoading(true);

    const dbRole = appRoleToDbRole(role);

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { name, role: dbRole },
      },
    });

    if (error) {
      setLoading(false);
      return { error: error.message };
    }

    if (!data.session) {
      // No active session means email confirmation is still required --
      // data.user exists but auth.uid() is null until they confirm, so
      // treating them as logged in here would show a UI that looks
      // signed-in while every Supabase request runs unauthenticated.
      setLoading(false);
      return { error: 'Check your email to confirm your account before signing in.' };
    }

    if (data.user) {
      const authUser = await buildAuthUser(data.user);
      setUser(authUser);
    }
    setLoading(false);
    return { error: null };
  };

  const signInWithGoogle = async (role: 'tenant' | 'owner'): Promise<{ error: string | null }> => {
    const supabase = getSupabase();
    if (!supabase) return { error: 'Supabase not connected' };

    try {
      window.localStorage.setItem(GOOGLE_PENDING_ROLE_KEY, role);
    } catch {
      // localStorage unavailable (e.g. private browsing) -- role intent is best-effort only
    }

    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });

    if (error) return { error: error.message };
    return { error: null };
  };

  const signOut = async () => {
    const supabase = getSupabase();
    if (supabase) {
      await supabase.auth.signOut();
    }
    setUser(null);
  };

  const updateProfile = async (updates: Partial<AuthUser>): Promise<{ error: string | null; emailVerificationSent?: boolean }> => {
    const supabase = getSupabase();
    if (!supabase || !user) return { error: 'Not authenticated' };

    // Email changes go through Supabase Auth's own confirmation flow --
    // the address doesn't take effect (and public.users.email doesn't
    // change) until the user clicks the link sent to the new address.
    let emailVerificationSent = false;
    if (updates.email !== undefined && updates.email !== user.email) {
      const { error: authError } = await supabase.auth.updateUser({ email: updates.email });
      if (authError) return { error: authError.message };
      emailVerificationSent = true;
    }

    const { email: _email, ...rest } = updates;
    void _email;

    const dbUpdates: Record<string, unknown> = {};
    if (rest.name !== undefined) dbUpdates.name = rest.name;
    if (rest.phone !== undefined) dbUpdates.phone = rest.phone;
    if (rest.avatar !== undefined) dbUpdates.avatar_url = rest.avatar;
    if (rest.role !== undefined) dbUpdates.role = appRoleToDbRole(rest.role as 'tenant' | 'owner' | 'admin');
    if (rest.dateOfBirth !== undefined) dbUpdates.date_of_birth = rest.dateOfBirth || null;
    if (rest.occupation !== undefined) dbUpdates.occupation = rest.occupation;
    if (rest.emergencyContact !== undefined) dbUpdates.emergency_contact = rest.emergencyContact;
    if (rest.moveInDate !== undefined) dbUpdates.move_in_date = rest.moveInDate || null;
    if (rest.currentFlat !== undefined) dbUpdates.current_flat = rest.currentFlat;

    if (Object.keys(dbUpdates).length > 0) {
      const { error } = await supabase.from('users').update(dbUpdates).eq('id', user.id);
      if (error) return { error: error.message };
    }

    setUser((prev) => (prev ? { ...prev, ...rest } : prev));
    return { error: null, emailVerificationSent };
  };

  const sendPhoneOtp = async (
    phone: string,
    name?: string,
    role?: 'tenant' | 'owner'
  ): Promise<{ error: string | null }> => {
    const supabase = getSupabase();
    if (!supabase) return { error: 'Supabase not connected' };

    const metadata: Record<string, unknown> = {};
    if (name) metadata.name = name;
    if (role) metadata.role = appRoleToDbRole(role);

    const { error } = await supabase.auth.signInWithOtp({
      phone,
      options: Object.keys(metadata).length > 0 ? { data: metadata } : undefined,
    });

    if (error) return { error: error.message };
    return { error: null };
  };

  const verifyPhoneOtp = async (phone: string, token: string): Promise<{ error: string | null }> => {
    const supabase = getSupabase();
    if (!supabase) return { error: 'Supabase not connected' };

    setLoading(true);
    const { data, error } = await supabase.auth.verifyOtp({ phone, token, type: 'sms' });

    if (error) {
      setLoading(false);
      return { error: error.message };
    }

    if (data.user) {
      const authUser = await buildAuthUser(data.user);
      setUser(authUser);
    }
    setLoading(false);
    return { error: null };
  };

  // Sends a password-reset email with a link to `redirectTo`. Supabase's
  // JS client auto-detects the recovery token when that page loads
  // (detectSessionInUrl, on by default) and fires a PASSWORD_RECOVERY
  // auth event with a real session -- the /reset-password page listens
  // for that and then calls updatePassword() below. (Not using the
  // email-OTP-code variant of this flow: it requires the project's
  // "Reset Password" email template to include {{ .Token }}, which
  // this project's template doesn't -- confirmed by testing.)
  const sendPasswordResetEmail = async (email: string, redirectTo: string): Promise<{ error: string | null }> => {
    const supabase = getSupabase();
    if (!supabase) return { error: 'Supabase not connected' };

    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
    if (error) return { error: error.message };
    return { error: null };
  };

  const updatePassword = async (newPasswordValue: string): Promise<{ error: string | null }> => {
    const supabase = getSupabase();
    if (!supabase) return { error: 'Supabase not connected' };

    const { error } = await supabase.auth.updateUser({ password: newPasswordValue });
    if (error) return { error: error.message };

    // Sign out of the temporary recovery session so the user logs back
    // in fresh with their new password, rather than silently landing
    // in an authenticated app state from the reset modal.
    await supabase.auth.signOut();
    setUser(null);
    return { error: null };
  };

  const refreshProfile = async () => {
    const supabase = getSupabase();
    if (!supabase) return;
    const { data } = await supabase.auth.getUser();
    if (data.user) {
      const authUser = await buildAuthUser(data.user);
      setUser(authUser);
    }
  };

  // Verifying (or re-verifying) the contact phone number shown on an
  // already-logged-in profile -- distinct from sendPhoneOtp/verifyPhoneOtp
  // above, which are the phone-as-login-identity flow used at signup.
  // updateUser({ phone }) sends an OTP to the new number without touching
  // the current session/identity; verifyOtp's 'phone_change' type confirms
  // it against that same session. Once auth.users.phone_confirmed_at is
  // set, the on_auth_user_phone_confirmed trigger (migration 042) syncs
  // public.users.phone/verified_phone -- refreshProfile() below just pulls
  // that synced row back into app state.
  // The profile's displayed phone is formatted "+91 98765 43210" for
  // readability (see formatIndianPhoneInput); GoTrue's phone-change hook
  // payload requires a bare E.164 string with no internal spaces, or it
  // fails with "Invalid payload sent to hook" before an OTP is even sent.
  const sendPhoneVerificationOtp = async (phone: string): Promise<{ error: string | null }> => {
    const supabase = getSupabase();
    if (!supabase) return { error: 'Supabase not connected' };

    const { error } = await supabase.auth.updateUser({ phone: phone.replace(/\s+/g, '') });
    if (error) return { error: error.message };
    return { error: null };
  };

  const confirmPhoneVerificationOtp = async (phone: string, token: string): Promise<{ error: string | null }> => {
    const supabase = getSupabase();
    if (!supabase) return { error: 'Supabase not connected' };

    const { error } = await supabase.auth.verifyOtp({ phone: phone.replace(/\s+/g, ''), token, type: 'phone_change' });
    if (error) return { error: error.message };

    await refreshProfile();
    return { error: null };
  };

  // Starts TOTP enrollment. The returned factor is unverified until
  // mfaChallengeAndVerify() confirms a real code from the authenticator
  // app -- an unverified factor doesn't count toward AAL and won't show
  // up as "enrolled" to RequireAdmin's gate. Supabase returns the QR as
  // a ready-to-render SVG data URI (totp.qr_code), so no client-side QR
  // library is needed here.
  const mfaEnrollTotp = async (): Promise<{ error: string | null; factorId?: string; qrCode?: string; secret?: string }> => {
    const supabase = getSupabase();
    if (!supabase) return { error: 'Supabase not connected' };

    const { data, error } = await supabase.auth.mfa.enroll({ factorType: 'totp' });
    if (error) return { error: error.message };

    return {
      error: null,
      factorId: data.id,
      qrCode: data.totp.qr_code,
      secret: data.totp.secret,
    };
  };

  // Combines challenge+verify into one call since the UI never needs the
  // intermediate challengeId for anything else -- enter a factor + the
  // 6-digit code, get back either a confirmed factor (first-time
  // enrollment) or an aal2 session (a returning admin's per-session
  // challenge).
  const mfaChallengeAndVerify = async (factorId: string, code: string): Promise<{ error: string | null }> => {
    const supabase = getSupabase();
    if (!supabase) return { error: 'Supabase not connected' };

    const { data: challengeData, error: challengeError } = await supabase.auth.mfa.challenge({ factorId });
    if (challengeError) return { error: challengeError.message };

    const { error: verifyError } = await supabase.auth.mfa.verify({
      factorId,
      challengeId: challengeData.id,
      code,
    });
    if (verifyError) return { error: verifyError.message };

    return { error: null };
  };

  const mfaUnenroll = async (factorId: string): Promise<{ error: string | null }> => {
    const supabase = getSupabase();
    if (!supabase) return { error: 'Supabase not connected' };

    const { error } = await supabase.auth.mfa.unenroll({ factorId });
    if (error) return { error: error.message };
    return { error: null };
  };

  const mfaListFactors = async (): Promise<{ error: string | null; verifiedTotpFactorId?: string; unverifiedTotpFactorId?: string }> => {
    const supabase = getSupabase();
    if (!supabase) return { error: 'Supabase not connected' };

    const { data, error } = await supabase.auth.mfa.listFactors();
    if (error) return { error: error.message };

    const verified = data.totp.find((f) => f.status === 'verified');
    const unverified = data.totp.find((f) => f.status === 'unverified');
    return { error: null, verifiedTotpFactorId: verified?.id, unverifiedTotpFactorId: unverified?.id };
  };

  const mfaGetAssuranceLevel = async (): Promise<{ currentLevel: string | null; nextLevel: string | null }> => {
    const supabase = getSupabase();
    if (!supabase) return { currentLevel: null, nextLevel: null };

    const { data, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (error || !data) return { currentLevel: null, nextLevel: null };
    return { currentLevel: data.currentLevel, nextLevel: data.nextLevel };
  };

  return {
    user,
    loading,
    signIn,
    signUp,
    signInWithGoogle,
    sendPhoneOtp,
    verifyPhoneOtp,
    sendPhoneVerificationOtp,
    confirmPhoneVerificationOtp,
    sendPasswordResetEmail,
    updatePassword,
    signOut,
    updateProfile,
    refreshProfile,
    mfaEnrollTotp,
    mfaChallengeAndVerify,
    mfaUnenroll,
    mfaListFactors,
    mfaGetAssuranceLevel,
  };
}