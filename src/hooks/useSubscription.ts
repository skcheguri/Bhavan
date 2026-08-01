import { useState, useEffect, createContext, useContext, useCallback } from 'react';
import { getSupabase, functionErrorMessage } from '@/lib/supabase';
import { loadRazorpayScript } from '@/lib/razorpay';
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
  upgradeToPro: (plan: 'pro_monthly' | 'pro_annual') => Promise<{ error: string | null; cancelled?: boolean }>;
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

    // The plan/status/source columns are plain text in the database
    // (constrained by CHECK, not enums), so the generated types say
    // `string` -- these casts narrow them to the app unions the CHECK
    // constraints actually enforce.
    setSubscription(subData ? { ...subData, plan: subData.plan as SubscriptionPlan, status: subData.status as SubscriptionStatus } : null);
    setBillingHistory((billingData ?? []).map((b) => ({ ...b, plan: b.plan as SubscriptionPlan, status: b.status as BillingInvoice['status'] })));
    setFeatures((featuresData ?? []).map((f) => ({ ...f, source: f.source as SubscriptionFeature['source'] })));
    setLoading(false);
  }, [ownerId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Pro is one-time-paid (no auto-renewal exists in this stack), so a
  // plan past its period end has lapsed even if the nightly
  // expire_lapsed_subscriptions job hasn't flipped the status row yet.
  const hasProPlan = subscription?.plan === 'pro_monthly' || subscription?.plan === 'pro_annual';
  const notLapsed =
    subscription?.status === 'active' &&
    (!subscription.current_period_end || new Date(subscription.current_period_end).getTime() > Date.now());
  const isPro = hasProPlan && notLapsed;
  const plan: SubscriptionPlan = isPro ? subscription!.plan : 'free';
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

  // Full purchase flow: server-priced order -> Razorpay Checkout ->
  // server-side HMAC verification -> subscription activated. Resolves
  // with { cancelled: true } if the owner closes the checkout window
  // without paying (not an error, just nothing happened).
  const upgradeToPro = async (
    selectedPlan: 'pro_monthly' | 'pro_annual'
  ): Promise<{ error: string | null; cancelled?: boolean }> => {
    const supabase = getSupabase();
    if (!supabase || !ownerId) return { error: 'Not authenticated' };

    const { data: orderData, error: orderError } = await supabase.functions.invoke('create-subscription-order', {
      body: { plan: selectedPlan },
    });
    if (orderError || !orderData?.orderId) {
      return { error: (await functionErrorMessage(orderError)) || 'Could not start this purchase. Please try again.' };
    }

    // Recovery path: a previous attempt was actually paid but never
    // verified (browser closed during checkout). Don't reopen Checkout --
    // Razorpay refuses an already-paid order, which previously left the
    // user permanently unable to buy this plan. Finish the activation.
    if (orderData.alreadyPaid) {
      const { data: recovered, error: recoverError } = await supabase.functions.invoke('verify-subscription-payment', {
        body: {
          billingRowId: orderData.billingRowId,
          razorpay_order_id: orderData.orderId,
          razorpay_payment_id: orderData.paymentId,
          recoverPaidOrder: true,
        },
      });
      if (recoverError || !recovered?.success) {
        return {
          error:
            (await functionErrorMessage(recoverError)) ||
            'You have already paid for this plan but we could not activate it automatically. Please contact support.',
        };
      }
      await refresh();
      return { error: null };
    }

    const scriptLoaded = await loadRazorpayScript();
    if (!scriptLoaded || !window.Razorpay) {
      return { error: 'Could not load the payment window. Check your connection and try again.' };
    }

    return new Promise((resolve) => {
      const razorpay = new window.Razorpay!({
        key: orderData.keyId,
        amount: orderData.amount,
        currency: orderData.currency,
        order_id: orderData.orderId,
        name: 'Bhavan',
        description: `${orderData.planLabel} subscription`,
        prefill: {
          name: orderData.ownerName,
          email: orderData.ownerEmail,
        },
        theme: { color: '#f59e0b' },
        handler: async (response: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }) => {
          const { data: verifyData, error: verifyError } = await supabase.functions.invoke('verify-subscription-payment', {
            body: {
              billingRowId: orderData.billingRowId,
              razorpay_order_id: response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature: response.razorpay_signature,
            },
          });
          if (verifyError || !verifyData?.success) {
            resolve({
              error:
                (await functionErrorMessage(verifyError)) ||
                'We could not confirm this payment. If money was deducted, contact support — your Pro access will be activated manually.',
            });
            return;
          }
          await refresh();
          resolve({ error: null });
        },
        modal: {
          ondismiss: () => resolve({ error: null, cancelled: true }),
        },
      });
      razorpay.open();
    });
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
    refresh,
  };
}

export { PRO_FEATURE_KEYS };
