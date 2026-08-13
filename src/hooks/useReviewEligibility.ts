import { useMemo } from 'react';
import { useOwnerConnectionRequests } from '@/hooks/useConnectionRequests';

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
    // Only contacts the owner has explicitly confirmed as their tenant --
    // not every approved chat. The confirm step lives on the approved
    // inquiry (owner Inquiries tab). Manual entry covers anyone not here.
    const approved = requests.filter((r) => r.status === 'approved' && r.tenantConfirmedAt);
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

// useTenantEligibleOwners lived here too, listing the owners a tenant had
// an approved connection with. Its only caller was MyReviewsTab, which
// offered "Write Review" for anyone who had approved an enquiry -- the
// premise migration 106 removed, since an approved enquiry is permission
// to make contact, not evidence of a tenancy. Reviewable people now come
// from useReviewableTenancies, off rental_agreements.
