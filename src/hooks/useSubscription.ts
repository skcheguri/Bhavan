import { useState, useEffect, createContext, useContext, useCallback } from 'react';
import { getSupabase } from '@/lib/supabase';
import { PRO_FEATURE_KEYS } from '@/lib/subscriptionConfig';

export type SubscriptionPlan = 'free' | 'pro_monthly' | 'pro_annual';
export type SubscriptionStatus = 'trial' | 'active' | 'past_due' | 'cancelled' | 'expired';

export interface SubscriptionData {
  id: string;
  owner_id: string;
  plan: SubscriptionPlan;
  status: SubscriptionStatus;
  razorpay_subscription_id: string | null;
  razorpay_customer_id: string | null;
  current_period_start: string | null;
  current_period_end: string | null;
  trial_ends_at: string | null;
  cancel_at_period_end: boolean;
  created_at: string;
  updated_at: string;
}

export interface BillingInvoice {
  id: string;
  owner_id: string;
  subscription_id: string | null;
  invoice_number: string;
  plan: SubscriptionPlan;
  amount: number;
  gst_amount: number;
  total_amount: number;
  currency: string;
  status: 'paid' | 'failed' | 'refunded' | 'pending';
  razorpay_payment_id: string | null;
  razorpay_invoice_id: string | null;
  billing_period_start: string;
  billing_period_end: string;
  paid_at: string | null;
  created_at: string;
}

export interface SubscriptionFeature {
  id: string;
  owner_id: string;
  feature_key: string;
  enabled: boolean;
  source: 'plan' | 'addon' | 'trial';
  expires_at: string | null;
  created_at: string;
}

export interface SubscriptionContextValue {
  subscription: SubscriptionData | null;
  billingHistory: BillingInvoice[];
  features: SubscriptionFeature[];
  loading: boolean;
  isPro: boolean;
  plan: SubscriptionPlan;
  status: SubscriptionStatus | null;
  canUseFeature: (key: string) => boolean;
  hasReachedPropertyLimit: (currentCount: number) => boolean;
  hasReachedListingLimit: (currentCount: number) => boolean;
  hasReachedInquiryLimit: (currentCount: number) => boolean;
  currentPeriodEnd: string | null;
  nextBillingDate: string | null;
  totalSpent: number;
  isInGracePeriod: boolean;
  isInTrial: boolean;
  trialDaysLeft: number;
  upgradeToPro: (plan: 'pro_monthly' | 'pro_annual') => Promise<{ error: string | null }>;
  cancelSubscription: () => Promise<{ error: string | null }>;
  toggleAutoRenew: (enabled: boolean) => Promise<{ error: string | null }>;
  refresh: () => Promise<void>;
}

export const SubscriptionContext = createContext<SubscriptionContextValue>({
  subscription: null,
  billingHistory: [],
  features: [],
  loading: true,
  isPro: false,
  plan: 'free',
  status: null,
  canUseFeature: () => false,
  hasReachedPropertyLimit: () => false,
  hasReachedListingLimit: () => false,
  hasReachedInquiryLimit: () => false,
  currentPeriodEnd: null,
  nextBillingDate: null,
  totalSpent: 0,
  isInGracePeriod: false,
  isInTrial: false,
  trialDaysLeft: 0,
  upgradeToPro: async () => ({ error: null }),
  cancelSubscription: async () => ({ error: null }),
  toggleAutoRenew: async () => ({ error: null }),
  refresh: async () => {},
});

export function useSubscription() {
  return useContext(SubscriptionContext);
}

export function useSubscriptionProvider(ownerId: string | undefined): SubscriptionContextValue {
  const [subscription, setSubscription] = useState<SubscriptionData | null>(null);
  const [billingHistory, setBillingHistory] = useState<BillingInvoice[]>([]);
  const [features, setFeatures] = useState<SubscriptionFeature[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const supabase = getSupabase();
    if (!supabase || !ownerId) {
      setLoading(false);
      return;
    }
    setLoading(true);

    const [{ data: subData, error: subError }, { data: billingData }, { data: featuresData }] = await Promise.all([
      supabase.from('owner_subscriptions').select('*').eq('owner_id', ownerId).maybeSingle(),
      supabase.from('billing_history').select('*').eq('owner_id', ownerId).order('created_at', { ascending: false }),
      supabase.from('subscription_features').select('*').eq('owner_id', ownerId),
    ]);

    if (subError) {
      console.warn('Subscription fetch error:', subError.message);
    }

    setSubscription(subData ?? null);
    setBillingHistory(billingData ?? []);
    setFeatures(featuresData ?? []);
    setLoading(false);
  }, [ownerId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const isPro = subscription?.plan === 'pro_monthly' || subscription?.plan === 'pro_annual';
  const plan: SubscriptionPlan = subscription?.plan ?? 'free';
  const status: SubscriptionStatus | null = subscription?.status ?? null;

  const canUseFeature = useCallback(
    (key: string) => {
      if (isPro) return true;
      return features.some((f) => f.feature_key === key && f.enabled);
    },
    [isPro, features]
  );

  const hasReachedPropertyLimit = useCallback(() => false, []);
  const hasReachedListingLimit = useCallback(() => false, []);
  const hasReachedInquiryLimit = useCallback(() => false, []);

  const currentPeriodEnd = subscription?.current_period_end ?? null;
  const nextBillingDate = currentPeriodEnd;

  const totalSpent = billingHistory
    .filter((b) => b.status === 'paid')
    .reduce((sum, b) => sum + b.total_amount, 0);

  const isInGracePeriod = status === 'past_due';
  const isInTrial = status === 'trial' && subscription?.trial_ends_at != null;

  const trialDaysLeft = isInTrial && subscription?.trial_ends_at
    ? Math.max(0, Math.ceil((new Date(subscription.trial_ends_at).getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
    : 0;

  const upgradeToPro = async (selectedPlan: 'pro_monthly' | 'pro_annual'): Promise<{ error: string | null }> => {
    const supabase = getSupabase();
    if (!supabase || !ownerId) return { error: 'Not authenticated' };

    const { error } = await supabase.functions.invoke('create-razorpay-subscription', {
      body: { owner_id: ownerId, plan: selectedPlan },
    });
    if (error) return { error: error.message };
    await refresh();
    return { error: null };
  };

  const cancelSubscription = async (): Promise<{ error: string | null }> => {
    const supabase = getSupabase();
    if (!supabase || !ownerId || !subscription) return { error: 'No active subscription' };

    const { error } = await supabase.functions.invoke('cancel-razorpay-subscription', {
      body: { subscription_id: subscription.razorpay_subscription_id },
    });
    if (error) return { error: error.message };
    await refresh();
    return { error: null };
  };

  const toggleAutoRenew = async (enabled: boolean): Promise<{ error: string | null }> => {
    const supabase = getSupabase();
    if (!supabase || !ownerId || !subscription) return { error: 'No active subscription' };

    const { error } = await supabase
      .from('owner_subscriptions')
      .update({ cancel_at_period_end: !enabled })
      .eq('id', subscription.id);
    if (error) return { error: error.message };
    await refresh();
    return { error: null };
  };

  return {
    subscription,
    billingHistory,
    features,
    loading,
    isPro,
    plan,
    status,
    canUseFeature,
    hasReachedPropertyLimit,
    hasReachedListingLimit,
    hasReachedInquiryLimit,
    currentPeriodEnd,
    nextBillingDate,
    totalSpent,
    isInGracePeriod,
    isInTrial,
    trialDaysLeft,
    upgradeToPro,
    cancelSubscription,
    toggleAutoRenew,
    refresh,
  };
}

export { PRO_FEATURE_KEYS };
