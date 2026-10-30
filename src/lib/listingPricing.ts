// The rent billing unit shown next to a listing's price is derived from the
// listing's category -- vacation rentals are priced per night, every other
// category per month. This is the single source for that label so a listing
// can never show "/mo" in one place and "/night" in another (the mismatch the
// dashboards used to have by hardcoding "/mo").

/** Short price-unit suffix, e.g. `₹15,000/mo` or `₹3,000/night`. */
export function rentUnitLabel(category?: string | null): string {
  return category === 'vacation' ? '/night' : '/mo';
}

/** Long price-unit phrase, e.g. "per month" / "per night". */
export function rentUnitWord(category?: string | null): string {
  return category === 'vacation' ? 'per night' : 'per month';
}
