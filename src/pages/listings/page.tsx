import { useState, useEffect } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useListings, type ListingCategory } from '@/hooks/useListings';
import { useToast } from '@/hooks/useToast';
import { geocodeAddress } from '@/lib/geocode';
import { haversineDistanceKm, matchesSearchTerms, type Coordinates } from '@/lib/geo';

// How far a "nearby" text search (e.g. "Suchitra, Hyderabad") or a
// current-location search reaches before a listing is excluded, in km.
// Wide enough to cover neighboring suburbs within the same metro.
const NEARBY_RADIUS_KM = 20;

interface SearchFilters {
  searchQuery: string;
  propertyType: string;
  priceRange: string;
  bedrooms: string;
  furnished: string;
  parking: string;
  maxGuests: string;
  verifiedOnly: string;
}

const DEFAULT_FILTERS: SearchFilters = {
  searchQuery: '',
  propertyType: 'all',
  priceRange: 'all',
  bedrooms: 'all',
  furnished: 'all',
  parking: 'all',
  maxGuests: 'all',
  verifiedOnly: 'all',
};

export default function Listings() {
  const [searchParams] = useSearchParams();
  const [activeCategory, setActiveCategory] = useState<ListingCategory | 'all'>('all');

  // Draft values are what the search bar's inputs are bound to -- they
  // only take effect once "Update Search" is clicked (or Enter is
  // pressed), matching a standard hotel-search-style search bar rather
  // than filtering live on every keystroke/selection.
  const [draft, setDraft] = useState<SearchFilters>(DEFAULT_FILTERS);
  const [applied, setApplied] = useState<SearchFilters>(DEFAULT_FILTERS);

  // Coordinates a "nearby" or current-location search is centered on --
  // independent of the text query so a listing whose locality doesn't
  // literally match the typed text can still surface if it's physically
  // close by (e.g. searching "Suchitra" should also find a "Kompally"
  // listing a few km away, the way Google Maps does).
  const [searchOrigin, setSearchOrigin] = useState<Coordinates | null>(null);
  const [searchOriginLabel, setSearchOriginLabel] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);

  const { searchQuery, propertyType, priceRange, bedrooms, furnished, parking, maxGuests, verifiedOnly } = applied;

  const navigate = useNavigate();
  const { user } = useAuth();
  const { addToast } = useToast();
  const { listings: dbListings, loading: dbLoading } = useListings(
    activeCategory === 'all' ? undefined : activeCategory
  );
  const isAadhaarVerified = user?.verified ?? false;

  const applySearch = (e?: React.FormEvent) => {
    e?.preventDefault();
    setApplied(draft);

    const query = draft.searchQuery.trim();
    if (!query) {
      setSearchOrigin(null);
      setSearchOriginLabel(null);
      return;
    }
    // Fire-and-forget: text-only matches already show immediately from
    // setApplied above, this just adds nearby-by-distance results in once
    // the geocode resolves, without blocking the search submit.
    geocodeAddress(`${query}, India`).then((coords) => {
      setSearchOrigin(coords);
      setSearchOriginLabel(coords ? query : null);
    });
  };

  const useCurrentLocation = () => {
    if (!navigator.geolocation) {
      addToast('Your browser does not support location search', 'error');
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setSearchOrigin({ latitude: pos.coords.latitude, longitude: pos.coords.longitude });
        setSearchOriginLabel('your current location');
        setLocating(false);
      },
      (err) => {
        setLocating(false);
        addToast(
          err.code === err.PERMISSION_DENIED
            ? 'Location access was denied — enable it in your browser settings to search nearby'
            : 'Could not determine your location',
          'error'
        );
      },
      { enableHighAccuracy: false, timeout: 10000 }
    );
  };

  const clearSearchOrigin = () => {
    setSearchOrigin(null);
    setSearchOriginLabel(null);
  };

  useEffect(() => {
    const cat = searchParams.get('category');
    if (cat === 'vacation' || cat === 'residential' || cat === 'commercial') {
      setActiveCategory(cat as ListingCategory);
    }
  }, [searchParams]);

  const isVacation = activeCategory === 'vacation';

  const displayListings = dbListings.map((l) => ({
    id: l.id,
    category: (l.category ?? 'residential') as ListingCategory,
    title: l.title,
    description: l.description ?? '',
    price: l.price,
    location: l.location && l.city ? `${l.location}, ${l.city}` : l.location ?? l.city ?? 'Unknown',
    latitude: l.latitude,
    longitude: l.longitude,
    bedrooms: l.bedrooms ?? 0,
    bathrooms: l.bathrooms ?? 1,
    area: l.area_sqft ?? 0,
    property_type: l.property_type ?? 'apartment',
    images: l.images && l.images.length > 0 ? l.images : ['/placeholders/photo.svg'],
    landlord_name: l.owner?.name ?? 'Bhavan Owner',
    landlord_avatar: l.owner?.avatar_url ?? '/placeholders/avatar.svg',
    furnished: l.furnished ?? false,
    parking: 'none',
    verified: l.verified ?? false,
    amenities: l.amenities ?? [],
    owner_id: l.owner_id,
    price_unit: l.category === 'vacation' ? 'night' : undefined,
    max_guests: undefined as number | undefined,
    created_at: l.created_at,
  }));

  // Distance from the active search origin (typed place, once geocoded, or
  // "current location") -- null when there's no origin yet or this listing
  // has no coordinates on file.
  const listingsWithDistance = displayListings.map((listing) => ({
    ...listing,
    distanceKm:
      searchOrigin && listing.latitude != null && listing.longitude != null
        ? haversineDistanceKm(searchOrigin, { latitude: listing.latitude, longitude: listing.longitude })
        : null,
  }));

  const filteredListings = listingsWithDistance.filter((listing) => {
    const matchesCategory = activeCategory === 'all' || listing.category === activeCategory;

    const hasTextQuery = searchQuery.trim() !== '';
    const matchesText = !hasTextQuery || matchesSearchTerms(searchQuery, `${listing.title} ${listing.location}`);
    const withinRadius = listing.distanceKm !== null && listing.distanceKm <= NEARBY_RADIUS_KM;
    // With text typed: a literal match OR a nearby listing (covers "Suchitra"
    // finding a Kompally listing a few km away). With no text: only the
    // radius filter applies when a "near me"-style origin is active.
    const matchesSearch = hasTextQuery ? matchesText || withinRadius : !searchOrigin || withinRadius;

    const matchesType = propertyType === 'all' || listing.property_type === propertyType;

    const matchesPrice = isVacation
      ? priceRange === 'all' ||
        (priceRange === 'under1000' && listing.price < 3000) ||
        (priceRange === '1000-1500' && listing.price >= 3000 && listing.price <= 6000) ||
        (priceRange === 'over2500' && listing.price > 6000)
      : priceRange === 'all' ||
        (priceRange === 'under1000' && listing.price < 15000) ||
        (priceRange === '1000-1500' && listing.price >= 15000 && listing.price <= 30000) ||
        (priceRange === '1500-2500' && listing.price > 30000 && listing.price <= 50000) ||
        (priceRange === 'over2500' && listing.price > 50000);

    const matchesBedrooms =
      bedrooms === 'all' ||
      (bedrooms === '0' && listing.bedrooms === 0) ||
      (bedrooms === '1' && listing.bedrooms === 1) ||
      (bedrooms === '2' && listing.bedrooms === 2) ||
      (bedrooms === '3+' && listing.bedrooms >= 3);

    const matchesFurnished =
      furnished === 'all' ||
      (furnished === 'yes' && listing.furnished === true) ||
      (furnished === 'no' && listing.furnished === false);

    const matchesParking =
      parking === 'all' ||
      (parking === '2-wheeler' && (listing.parking === '2-wheeler' || listing.parking === 'both')) ||
      (parking === '4-wheeler' && (listing.parking === '4-wheeler' || listing.parking === 'both')) ||
      (parking === 'both' && listing.parking === 'both');

    const matchesGuests =
      !isVacation ||
      maxGuests === 'all' ||
      (listing.max_guests &&
        ((maxGuests === '2' && listing.max_guests <= 2) ||
         (maxGuests === '4' && listing.max_guests <= 4) ||
         (maxGuests === '6' && listing.max_guests <= 6) ||
         (maxGuests === '8+' && listing.max_guests >= 8)));

    const matchesVerified = verifiedOnly === 'all' || listing.verified;

    return matchesCategory && matchesSearch && matchesType && matchesPrice && matchesBedrooms && matchesFurnished && matchesParking && matchesGuests && matchesVerified;
  }).sort((a, b) => {
    // Stable no-op when there's no active origin (both sides null).
    if (a.distanceKm === null && b.distanceKm === null) return 0;
    if (a.distanceKm === null) return 1;
    if (b.distanceKm === null) return -1;
    return a.distanceKm - b.distanceKm;
  });

  return (
    <div className="min-h-screen bg-offwhite">
      {/* Category Tabs */}
      <div className="bg-white border-b border-black/5">
        <div className="w-full px-4 md:px-8 lg:px-12">
          <div className="max-w-6xl mx-auto flex items-center gap-2 overflow-x-auto py-4">
            {([
              { key: 'all', label: 'All Properties', icon: 'ri-building-line' },
              { key: 'residential', label: 'Residential', icon: 'ri-home-5-line' },
              { key: 'commercial', label: 'Commercial', icon: 'ri-building-4-line' },
              { key: 'vacation', label: 'Vacation Rentals', icon: 'ri-sun-line' },
            ] as { key: ListingCategory | 'all'; label: string; icon: string }[]).map((tab) => (
              <button
                key={tab.key}
                onClick={() => {
                  setActiveCategory(tab.key);
                  const reset = { ...DEFAULT_FILTERS, searchQuery: draft.searchQuery };
                  setDraft(reset);
                  setApplied(reset);
                }}
                className={`flex items-center gap-2.5 px-5 py-3 rounded-full text-sm font-semibold whitespace-nowrap transition cursor-pointer ${
                  activeCategory === tab.key
                    ? tab.key === 'vacation'
                      ? 'bg-sage text-white'
                      : 'bg-brand text-white'
                    : 'text-charcoal/60 hover:text-charcoal hover:bg-lightgray'
                }`}
              >
                <i className={`${tab.icon} text-base`} />
                {tab.label}
                <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${
                  activeCategory === tab.key ? 'bg-white/20 text-white' : 'bg-lightgray text-charcoal/50'
                }`}>
                  {displayListings.filter((l) => tab.key === 'all' || l.category === tab.key).length}
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Aadhaar Verification Banner */}
      {user && !isAadhaarVerified && (
        <div className="bg-amber-50 border-b border-amber-200">
          <div className="w-full px-4 md:px-8 lg:px-12 py-3">
            <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-amber-800">
                <div className="w-5 h-5 flex items-center justify-center">
                  <i className="ri-shield-keyhole-line text-amber-600" />
                </div>
                <p className="text-sm font-medium">
                  <strong>Aadhaar verification required</strong> to book property visits and sign rental agreements.
                </p>
              </div>
              <Link
                to="/aadhaar-verify"
                className="flex-shrink-0 bg-amber-600 text-white text-xs font-semibold px-4 py-2 rounded-full hover:bg-amber-700 transition-colors whitespace-nowrap"
              >
                Verify Now — It&apos;s Free
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <section className="bg-white py-8 md:py-10 border-b border-black/5">
        <div className="w-full px-4 md:px-8 lg:px-12">
          <div className="max-w-6xl mx-auto">
            <h1 className="text-3xl md:text-[2.5rem] font-bold text-charcoal tracking-tight">
              {activeCategory === 'vacation' ? 'Vacation rentals' : activeCategory === 'commercial' ? 'Commercial properties' : activeCategory === 'residential' ? 'Residential listings' : 'Browse listings'}
            </h1>
            <p className="mt-2 text-charcoal/60">
              {activeCategory === 'vacation'
                ? 'Discover handpicked holiday homes across India — listed directly by verified owners'
                : 'Find your perfect rental from our verified properties'}
            </p>
          </div>
        </div>
      </section>

      {/* Search + filters -- sticky so it stays reachable while scrolling
          through results, with changes only taking effect on "Update
          Search" (or Enter) rather than live per-keystroke/selection. */}
      <form
        onSubmit={applySearch}
        className="sticky top-0 z-30 bg-white border-b border-black/5 shadow-sm py-4"
      >
        <div className="w-full px-4 md:px-8 lg:px-12">
          <div className="max-w-6xl mx-auto space-y-3">
            <div className="relative">
              <div className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 flex items-center justify-center">
                <i className="ri-search-line text-charcoal/40" />
              </div>
              <input
                type="text"
                aria-label={isVacation ? 'Search by destination or property name' : 'Search by location or property name'}
                placeholder={isVacation ? 'Search by destination or property name...' : 'Search by location or property name...'}
                value={draft.searchQuery}
                onChange={(e) => setDraft({ ...draft, searchQuery: e.target.value })}
                className={`w-full pl-10 pr-12 py-2.5 sm:py-3 bg-lightgray rounded-xl text-sm focus:outline-none transition-colors ${
                  isVacation ? 'focus:ring-2 focus:ring-sage/40' : 'focus:ring-2 focus:ring-brand/30'
                }`}
              />
              <button
                type="button"
                onClick={useCurrentLocation}
                disabled={locating}
                aria-label="Search near my current location"
                title="Search near my current location"
                className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 flex items-center justify-center rounded-full text-charcoal/40 hover:text-brand hover:bg-white transition-colors cursor-pointer disabled:opacity-50"
              >
                <i className={locating ? 'ri-loader-4-line animate-spin' : 'ri-crosshair-2-line'} />
              </button>
            </div>

            {searchOriginLabel && (
              <div className="flex items-center gap-2">
                <span className={`inline-flex items-center gap-1.5 pl-3 pr-2 py-1.5 rounded-full text-xs font-medium ${
                  isVacation ? 'bg-sage/10 text-sage-dark' : 'bg-brand/10 text-brand-dark'
                }`}>
                  <i className="ri-map-pin-2-line" />
                  Showing results near {searchOriginLabel}
                  <button
                    type="button"
                    onClick={clearSearchOrigin}
                    aria-label="Clear location search"
                    className="w-4 h-4 flex items-center justify-center rounded-full hover:bg-black/10 cursor-pointer"
                  >
                    <i className="ri-close-line text-[10px]" />
                  </button>
                </span>
              </div>
            )}

            <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:gap-3">
              <select
                value={draft.propertyType}
                onChange={(e) => setDraft({ ...draft, propertyType: e.target.value })}
                className="px-3 py-2 text-xs sm:px-4 sm:py-2.5 sm:text-sm bg-white border border-black/10 rounded-xl focus:outline-none cursor-pointer min-w-0"
              >
                <option value="all">All Types</option>
                {isVacation ? (
                  <>
                    <option value="villa">Villa / Bhavan</option>
                    <option value="cottage">Cottage / Cabin</option>
                    <option value="beach-house">Beach House</option>
                    <option value="farmhouse">Farmhouse</option>
                  </>
                ) : (
                  <>
                    <option value="apartment">Apartment</option>
                    <option value="house">House</option>
                    <option value="room">Room</option>
                  </>
                )}
              </select>

              <select
                value={draft.priceRange}
                onChange={(e) => setDraft({ ...draft, priceRange: e.target.value })}
                className="px-3 py-2 text-xs sm:px-4 sm:py-2.5 sm:text-sm bg-white border border-black/10 rounded-xl focus:outline-none cursor-pointer min-w-0"
              >
                <option value="all">{isVacation ? 'Any Nightly Rate' : 'Any Price'}</option>
                {isVacation ? (
                  <>
                    <option value="under1000">Under ₹3,000/night</option>
                    <option value="1000-1500">₹3,000 – ₹6,000/night</option>
                    <option value="over2500">Over ₹6,000/night</option>
                  </>
                ) : (
                  <>
                    <option value="under1000">Under ₹15,000</option>
                    <option value="1000-1500">₹15,000 – ₹30,000</option>
                    <option value="1500-2500">₹30,000 – ₹50,000</option>
                    <option value="over2500">Over ₹50,000</option>
                  </>
                )}
              </select>

              {isVacation ? (
                <select
                  value={draft.maxGuests}
                  onChange={(e) => setDraft({ ...draft, maxGuests: e.target.value })}
                  className="px-3 py-2 text-xs sm:px-4 sm:py-2.5 sm:text-sm bg-white border border-black/10 rounded-xl focus:outline-none cursor-pointer min-w-0"
                >
                  <option value="all">Any Guests</option>
                  <option value="2">Up to 2 Guests</option>
                  <option value="4">Up to 4 Guests</option>
                  <option value="6">Up to 6 Guests</option>
                  <option value="8+">8+ Guests</option>
                </select>
              ) : (
                <select
                  value={draft.bedrooms}
                  onChange={(e) => setDraft({ ...draft, bedrooms: e.target.value })}
                  className="px-3 py-2 text-xs sm:px-4 sm:py-2.5 sm:text-sm bg-white border border-black/10 rounded-xl focus:outline-none cursor-pointer min-w-0"
                >
                  <option value="all">Any Beds</option>
                  <option value="0">Studio</option>
                  <option value="1">1 Bed</option>
                  <option value="2">2 Beds</option>
                  <option value="3+">3+ Beds</option>
                </select>
              )}

              {!isVacation && (
                <select
                  value={draft.furnished}
                  onChange={(e) => setDraft({ ...draft, furnished: e.target.value })}
                  className="px-3 py-2 text-xs sm:px-4 sm:py-2.5 sm:text-sm bg-white border border-black/10 rounded-xl focus:outline-none cursor-pointer min-w-0"
                >
                  <option value="all">Furnishing</option>
                  <option value="yes">Furnished</option>
                  <option value="no">Unfurnished</option>
                </select>
              )}

              {!isVacation && (
                <select
                  value={draft.parking}
                  onChange={(e) => setDraft({ ...draft, parking: e.target.value })}
                  className="px-3 py-2 text-xs sm:px-4 sm:py-2.5 sm:text-sm bg-white border border-black/10 rounded-xl focus:outline-none cursor-pointer min-w-0"
                >
                  <option value="all">Parking</option>
                  <option value="2-wheeler">2-Wheeler</option>
                  <option value="4-wheeler">4-Wheeler</option>
                  <option value="both">Both (2W + 4W)</option>
                </select>
              )}

              <select
                value={draft.verifiedOnly}
                onChange={(e) => setDraft({ ...draft, verifiedOnly: e.target.value })}
                className="px-3 py-2 text-xs sm:px-4 sm:py-2.5 sm:text-sm bg-white border border-black/10 rounded-xl focus:outline-none cursor-pointer min-w-0"
              >
                <option value="all">All Verification</option>
                <option value="verified">Verified Only</option>
              </select>

              <button
                type="submit"
                className={`col-span-2 sm:col-span-1 sm:ml-auto flex items-center justify-center gap-2 px-4 py-2 text-xs sm:px-6 sm:py-2.5 sm:text-sm rounded-xl font-semibold text-white transition-colors cursor-pointer whitespace-nowrap ${
                  isVacation ? 'bg-sage hover:bg-sage-dark' : 'bg-brand hover:bg-brand-dark'
                }`}
              >
                <i className="ri-search-line" /> Update Search
              </button>
            </div>
          </div>
        </div>
      </form>

      {/* Listings Grid */}
      <section className="py-8 md:py-12">
        <div className="w-full px-4 md:px-8 lg:px-12">
          <div className="max-w-6xl mx-auto">
            <p className="text-sm text-charcoal/50 mb-6">
              {filteredListings.length} {filteredListings.length === 1 ? 'property' : 'properties'} found
            </p>

            {dbLoading ? (
              <div className="text-center py-16">
                <i className="ri-loader-4-line animate-spin text-brand text-2xl" />
                <p className="mt-4 text-charcoal/50">Loading listings&hellip;</p>
              </div>
            ) : filteredListings.length === 0 ? (
              <div className="text-center py-16">
                <div className="w-16 h-16 mx-auto flex items-center justify-center bg-lightgray rounded-full mb-4">
                  <i className="ri-search-line text-2xl text-charcoal/30" />
                </div>
                <h3 className="text-lg font-semibold text-charcoal">No properties found</h3>
                <p className="text-charcoal/50 mt-1">Try adjusting your filters</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-7">
                {filteredListings.map((listing) => (
                  <div
                    key={listing.id}
                    onClick={() => navigate(`/listings/${listing.id}`)}
                    className={`group bg-white rounded-2xl sm:rounded-3xl overflow-hidden border border-black/5 hover:-translate-y-0.5 transition duration-300 cursor-pointer ${
                      listing.category === 'vacation' ? 'hover:border-sage/40' : 'hover:border-brand/30'
                    }`}
                    data-product-shop
                  >
                    <div className="relative aspect-[4/3] overflow-hidden">
                      <img
                        src={listing.images[0]}
                        alt={listing.title}
                        className="w-full h-full object-cover object-top group-hover:scale-105 transition-transform duration-500"
                      />
                      {listing.verified && (
                        <span className="absolute top-3 left-3 bg-brand text-white text-xs font-semibold px-3 py-1 rounded-full">
                          Verified
                        </span>
                      )}
                      <span className="absolute top-3 right-3 bg-white/90 text-charcoal text-xs font-semibold px-3 py-1 rounded-full capitalize">
                        {listing.property_type}
                      </span>
                    </div>
                    <div className="p-3 sm:p-4">
                      {listing.category === 'vacation' ? (
                        <div className="flex items-baseline gap-1">
                          <span className="text-sage-dark font-bold text-lg sm:text-xl">₹{listing.price.toLocaleString('en-IN')}</span>
                          <span className="text-charcoal/40 text-xs">/night</span>
                        </div>
                      ) : (
                        <div className="text-brand font-bold text-lg sm:text-xl">₹{listing.price.toLocaleString('en-IN')}<span className="text-xs font-medium text-charcoal/50">/mo</span></div>
                      )}
                      <h3 className="mt-1 text-sm font-semibold text-charcoal line-clamp-1">{listing.title}</h3>
                      <div className="mt-1 flex items-center gap-1 text-charcoal/50 text-xs">
                        <i className="ri-map-pin-line text-xs" />
                        {listing.location}
                        {listing.distanceKm !== null && (
                          <span className="ml-1 text-charcoal/40">&middot; {listing.distanceKm < 1 ? '<1' : Math.round(listing.distanceKm)} km away</span>
                        )}
                      </div>

                      {listing.category === 'vacation' ? (
                        <div className="mt-2 flex items-center gap-3 text-xs text-charcoal/60">
                          <span className="flex items-center gap-1">
                            <i className="ri-group-line text-xs" />
                            {'max_guests' in listing && listing.max_guests ? `Up to ${listing.max_guests} guests` : ''}
                          </span>
                          <span className="flex items-center gap-1">
                            <i className="ri-hotel-bed-line text-xs" />
                            {listing.bedrooms} {listing.bedrooms === 1 ? 'Bed' : 'Beds'}
                          </span>
                          <span className="flex items-center gap-1">
                            <i className="ri-drop-line text-xs" />
                            {listing.bathrooms} Bath{listing.bathrooms > 1 ? 's' : ''}
                          </span>
                        </div>
                      ) : (
                        <div className="mt-2 flex items-center gap-3 text-xs text-charcoal/60">
                          <span className="flex items-center gap-1">
                            <i className="ri-hotel-bed-line text-xs" />
                            {listing.bedrooms} {listing.bedrooms === 1 ? 'Bed' : 'Beds'}
                          </span>
                          <span className="flex items-center gap-1">
                            <i className="ri-drop-line text-xs" />
                            {listing.bathrooms} {listing.bathrooms === 1 ? 'Bath' : 'Baths'}
                          </span>
                          <span className="flex items-center gap-1">
                            <i className="ri-ruler-line text-xs" />
                            {listing.area} sq ft
                          </span>
                        </div>
                      )}
                      <div className="mt-3 pt-3 border-t border-black/5">
                        {user ? (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              navigate(`/listings/${listing.id}`);
                            }}
                            className={`w-full text-white text-xs font-semibold px-4 py-2.5 rounded-full transition-colors whitespace-nowrap cursor-pointer ${
                              listing.category === 'vacation'
                                ? 'bg-sage hover:bg-sage-dark'
                                : 'bg-brand hover:bg-brand-dark'
                            }`}
                          >
                            {listing.category === 'vacation' ? 'View stay' : 'View details'}
                          </button>
                        ) : (
                          <Link
                            to="/login"
                            onClick={(e) => e.stopPropagation()}
                            className={`w-full flex items-center justify-center gap-1.5 text-white text-xs font-semibold px-4 py-2.5 rounded-full transition-colors whitespace-nowrap ${
                              listing.category === 'vacation'
                                ? 'bg-sage hover:bg-sage-dark'
                                : 'bg-brand hover:bg-brand-dark'
                            }`}
                          >
                            <i className="ri-login-circle-line" />
                            Sign in to connect
                          </Link>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
