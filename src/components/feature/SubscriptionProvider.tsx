import { SubscriptionContext, useSubscriptionProvider } from '@/hooks/useSubscription';
import { useAuth } from '@/hooks/useAuth';

interface SubscriptionProviderProps {
  children: React.ReactNode;
}

export default function SubscriptionProvider({ children }: SubscriptionProviderProps) {
  const { user } = useAuth();
  const subscription = useSubscriptionProvider(user?.id);

  return (
    <SubscriptionContext.Provider value={subscription}>
      {children}
    </SubscriptionContext.Provider>
  );
}