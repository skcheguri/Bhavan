// Free tier limits (generous -- unlimited on all counts)
export const FREE_TIER_LIMITS = {
  maxProperties: Infinity,
  maxListings: Infinity,
  maxInquiriesPerMonth: Infinity,
} as const;

// Feature matrix for gating
export const PRO_FEATURE_KEYS = [
  'analytics',
  'auto_reminders',
  'bulk_receipts',
  'priority_listing',
  'custom_url',
  'advanced_tax',
  'export_data',
  'priority_support',
] as const;
