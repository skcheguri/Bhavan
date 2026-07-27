import { useMemo } from 'react';
import { useOwnerConnectionRequests, useTenantConnectionRequests } from '@/hooks/useConnectionRequests';

export interface EligibleContact {
  id: string;
  name: string;
  avatar: string | null;
}

// People an owner has an approved connection with (i.e. actual prospective/
// current tenants) -- the only people they're allowed to view/review.
export function useOwnerEligibleTenants(ownerId: string | undefined) {
  const { requests, loading } = useOwnerConnectionRequests(ownerId);

  const contacts = useMemo<EligibleContact[]>(() => {
    const approved = requests.filter((r) => r.status === 'approved');
    const byId = new Map<string, EligibleContact>();
    for (const r of approved) {
      if (!byId.has(r.prospectId)) {
        byId.set(r.prospectId, { id: r.prospectId, name: r.prospectName, avatar: r.prospectAvatar });
      }
    }
    return Array.from(byId.values());
  }, [requests]);

  return { contacts, loading };
}

// People a tenant has an approved connection with (i.e. owners they've
// actually been approved to rent from).
export function useTenantEligibleOwners(tenantId: string | undefined) {
  const { requests, loading } = useTenantConnectionRequests(tenantId);

  const contacts = useMemo<EligibleContact[]>(() => {
    const approved = requests.filter((r) => r.status === 'approved');
    const byId = new Map<string, EligibleContact>();
    for (const r of approved) {
      if (!byId.has(r.ownerId)) {
        byId.set(r.ownerId, { id: r.ownerId, name: r.ownerName, avatar: r.ownerAvatar });
      }
    }
    return Array.from(byId.values());
  }, [requests]);

  return { contacts, loading };
}
