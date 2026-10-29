import { Link } from 'react-router';
import { useListings } from '@/hooks/useListings';
import { useAuth } from '@/hooks/useAuth';
import SmartImage from '@/components/feature/SmartImage';

export default function Home() {
  const { user } = useAuth();
  const isTenant = user?.role === 'tenant';
  // Two small scoped fetches (3 each) instead of pulling the whole active
  // table and slicing in the browser (Part D).
  const { listings: featuredListings, loading: loadingResidential } = useListings({ category: 'residential' }, { pageSize: 3 });
  const { listings: featuredVacation, loading: loadingVacation } = useListings({ category: 'vacation' }, { pageSize: 3 });
  const listingsLoading = loadingResidential || loadingVacation;

  return (
    <div className="min-h-screen bg-offwhite">
      {/* Hero Section */}
      <section className="relative h-[620px] md:h-[720px] flex items-center">
        <div className="absolute inset-0">
          <div className="w-full h-full bg-gradient-to-br from-brand via-brand-dark to-charcoal" />
          <div className="absolute inset-0 bg-gradient-to-r from-charcoal/85 via-charcoal/45 to-transparent" />
        </div>

        <div className="relative z-10 w-full px-5 md:px-10 lg:px-16">
          <div className="max-w-2xl">
            <span className="inline-flex items-center gap-2 px-4 py-1.5 bg-white/10 backdrop-blur-sm border border-white/20 text-white text-xs font-semibold rounded-full uppercase tracking-wider">
              India's broker-free rental platform
            </span>
            <h1 className="mt-5 text-[2.75rem] md:text-6xl lg:text-[4.5rem] font-bold text-white leading-[1.05] tracking-tight">
              Find your next<br />home with<br />confidence
            </h1>
            <p className="mt-6 text-base md:text-lg text-white/80 max-w-lg leading-relaxed">
              Connect with verified landlords across India, manage your rent seamlessly, and join a supportive renter community.
            </p>
            <div className="mt-9 flex flex-col sm:flex-row gap-3">
              <Link
                to="/listings"
                className="bg-brand text-white font-semibold px-8 py-4 rounded-full hover:bg-brand-dark transition-colors text-center whitespace-nowrap"
              >
                Browse listings
              </Link>
              <Link
                to="/signup"
                className="bg-white text-charcoal font-semibold px-8 py-4 rounded-full hover:bg-offwhite transition-colors text-center whitespace-nowrap"
              >
                Get started free
              </Link>
            </div>
          </div>
        </div>

        <div className="hidden lg:block absolute bottom-10 right-10 bg-white/95 backdrop-blur-sm rounded-3xl p-7 w-80">
          <div className="space-y-5">
            {[
              { icon: 'ri-shield-check-line', label: 'Verified listings' },
              { icon: 'ri-file-list-3-line', label: 'Digital rent agreement tools' },
              { icon: 'ri-group-line', label: 'Tenant community' },
            ].map((item) => (
              <div key={item.label} className="flex items-center gap-3.5">
                <div className="w-11 h-11 rounded-full bg-brand/10 flex items-center justify-center flex-shrink-0">
                  <i className={`${item.icon} text-brand text-lg`} />
                </div>
                <span className="text-base font-medium text-charcoal">{item.label}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Why Bhavan */}
      <section className="bg-lightgray py-16 md:py-24">
        <div className="w-full px-5 md:px-10 lg:px-16">
          <div className="max-w-6xl mx-auto">
            <span className="inline-block px-4 py-1.5 bg-white border border-brand/30 text-brand text-xs font-semibold rounded-full uppercase tracking-wider">
              Built for trust
            </span>
            <h2 className="mt-5 text-3xl md:text-[2.75rem] font-bold text-charcoal leading-[1.1] tracking-tight">
              Why renters and owners<br />choose our platform
            </h2>
            <p className="mt-4 text-charcoal/70 max-w-xl leading-relaxed">
              No brokers, no guesswork. Every account can complete Aadhaar e-KYC verification, and every listing is tied to a real,
              accountable owner — so both sides know exactly who they're dealing with.
            </p>

            <div className="mt-12 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              {[
                { icon: 'ri-shield-user-line', title: 'Aadhaar verification', description: 'Landlords and tenants can verify their identity through Aadhaar e-KYC before connecting.' },
                { icon: 'ri-hand-coin-line', title: 'Broker-free, always', description: 'Connect directly with owners and tenants — no middlemen, no brokerage fees for either side.' },
                { icon: 'ri-home-4-line', title: 'Verified listings', description: 'Every listing is tied to a real, verified owner account, not an anonymous ad.' },
                { icon: 'ri-file-shield-2-line', title: 'Digital rent tools', description: 'Both sides can track payments, generate receipts, and manage rental agreements online.' },
              ].map((item) => (
                <div key={item.title} className="bg-white rounded-2xl p-6">
                  <div className="w-12 h-12 rounded-full bg-brand/10 flex items-center justify-center mb-4">
                    <i className={`${item.icon} text-brand text-xl`} />
                  </div>
                  <h3 className="text-base font-semibold text-charcoal">{item.title}</h3>
                  <p className="mt-1.5 text-sm text-charcoal/60 leading-relaxed">{item.description}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Featured Listings */}
      <section className="bg-offwhite py-16 md:py-24">
        <div className="w-full px-5 md:px-10 lg:px-16">
          <div className="max-w-6xl mx-auto">
            <div className="text-center mb-12">
              <span className="text-xs font-semibold text-brand uppercase tracking-wider">Handpicked for you</span>
              <h2 className="mt-2 text-3xl md:text-[2.75rem] font-bold text-charcoal tracking-tight">Featured properties</h2>
              <p className="mt-3 text-charcoal/60 max-w-md mx-auto">Discover verified rental listings from trusted landlords</p>
            </div>

            {listingsLoading ? (
              <div className="text-center py-12">
                <i className="ri-loader-4-line animate-spin text-brand text-2xl" />
                <p className="mt-3 text-charcoal/50">Loading featured properties&hellip;</p>
              </div>
            ) : featuredListings.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-charcoal/50">No properties listed yet. Be the first to list one.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-7">
                {featuredListings.map((listing) => {
                  const images = listing.images && listing.images.length > 0 ? listing.images : ['/placeholders/photo.svg'];
                  const landlordName = listing.owner?.name ?? 'Bhavan Owner';
                  const landlordAvatar = listing.owner?.avatar_url ?? '/placeholders/avatar.svg';
                  const location = listing.location ?? listing.city ?? 'Unknown';
                  const bedrooms = listing.bedrooms ?? 0;
                  const bathrooms = listing.bathrooms ?? 1;
                  const area = listing.area_sqft ?? 0;
                  const propertyType = listing.property_type ?? 'apartment';
                  const verified = listing.verified ?? false;

                  return (
                    <Link
                      key={listing.id}
                      to={`/listings/${listing.id}`}
                      className="group bg-white rounded-3xl overflow-hidden border border-black/5 hover:border-brand/30 hover:-translate-y-0.5 transition duration-300"
                      data-product-shop
                    >
                      <div className="relative aspect-[4/3] overflow-hidden">
                        <SmartImage
                          src={images[0]}
                          alt={listing.title}
                          className="w-full h-full object-cover object-top group-hover:scale-105 transition-transform duration-500"
                        />
                        {verified && (
                          <span className="absolute top-3 left-3 bg-brand text-white text-xs font-semibold px-3 py-1 rounded-full">
                            Verified
                          </span>
                        )}
                        <span className="absolute top-3 right-3 bg-white/95 text-charcoal text-xs font-semibold px-3 py-1 rounded-full capitalize">
                          {propertyType}
                        </span>
                      </div>
                      <div className="p-5">
                        <div className="text-brand font-bold text-2xl">₹{listing.price.toLocaleString('en-IN')}<span className="text-sm font-medium text-charcoal/50">/mo</span></div>
                        <h3 className="mt-1.5 text-lg font-semibold text-charcoal leading-snug">{listing.title}</h3>
                        <div className="mt-2 flex items-center gap-1.5 text-charcoal/50 text-sm">
                          <i className="ri-map-pin-line text-sm" />
                          {location}
                        </div>
                        <div className="mt-3 flex items-center gap-4 text-sm text-charcoal/60">
                          <span className="flex items-center gap-1.5">
                            <i className="ri-hotel-bed-line text-sm" />
                            {bedrooms} {bedrooms === 1 ? 'bed' : 'beds'}
                          </span>
                          <span className="flex items-center gap-1.5">
                            <i className="ri-drop-line text-sm" />
                            {bathrooms} {bathrooms === 1 ? 'bath' : 'baths'}
                          </span>
                          <span className="flex items-center gap-1.5">
                            <i className="ri-ruler-line text-sm" />
                            {area} sq ft
                          </span>
                        </div>
                        <div className="mt-4 pt-4 border-t border-black/5 flex items-center gap-3">
                          <img
                            src={landlordAvatar}
                            alt={landlordName}
                            className="w-9 h-9 rounded-full object-cover"
                          />
                          <div>
                            <p className="text-sm font-medium text-charcoal">{landlordName}</p>
                            <p className="text-xs text-charcoal/50">Verified landlord</p>
                          </div>
                        </div>
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}

            <div className="mt-10 text-center">
              <Link
                to="/listings"
                className="inline-flex items-center gap-2 text-brand font-semibold hover:gap-3 transition-[gap]"
              >
                View all listings
                <i className="ri-arrow-right-line" />
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Vacation Rentals Section */}
      <section className="bg-sage-light py-16 md:py-24">
        <div className="w-full px-5 md:px-10 lg:px-16">
          <div className="max-w-6xl mx-auto">
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-12">
              <div>
                <span className="inline-flex items-center gap-2 px-4 py-1.5 bg-white text-sage-dark text-xs font-semibold rounded-full uppercase tracking-wider">
                  <i className="ri-sun-line" />
                  Holiday stays
                </span>
                <h2 className="mt-4 text-3xl md:text-[2.75rem] font-bold text-charcoal leading-[1.1] tracking-tight">
                  Vacation rentals<br />
                  <span className="text-sage-dark">across India</span>
                </h2>
                <p className="mt-3 text-charcoal/60 max-w-lg">
                  From Goa beach villas to Himalayan cottages — discover handpicked holiday homes listed directly by verified owners.
                </p>
              </div>
              <Link
                to="/listings?category=vacation"
                className="flex-shrink-0 inline-flex items-center gap-2 text-sage-dark font-semibold hover:gap-3 transition-[gap] whitespace-nowrap"
              >
                View all vacation rentals
                <i className="ri-arrow-right-line" />
              </Link>
            </div>

            {listingsLoading ? (
              <div className="text-center py-12">
                <i className="ri-loader-4-line animate-spin text-sage-dark text-2xl" />
                <p className="mt-3 text-charcoal/50">Loading vacation rentals&hellip;</p>
              </div>
            ) : featuredVacation.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-charcoal/50">No vacation rentals listed yet.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-7">
                {featuredVacation.map((listing) => {
                  const images = listing.images && listing.images.length > 0 ? listing.images : ['/placeholders/photo.svg'];
                  const landlordName = listing.owner?.name ?? 'Bhavan Owner';
                  const landlordAvatar = listing.owner?.avatar_url ?? '/placeholders/avatar.svg';
                  const location = listing.location ?? listing.city ?? 'Unknown';
                  const propertyType = listing.property_type ?? 'villa';
                  const verified = listing.verified ?? false;
                  const amenities = listing.amenities ?? [];

                  return (
                    <Link
                      key={listing.id}
                      to={`/listings/${listing.id}`}
                      className="group bg-white rounded-3xl overflow-hidden border border-black/5 hover:border-sage/40 hover:-translate-y-0.5 transition duration-300"
                      data-product-shop
                    >
                      <div className="relative h-52 overflow-hidden">
                        <SmartImage
                          src={images[0]}
                          alt={listing.title}
                          icon="ri-sun-line"
                          className="w-full h-full object-cover object-top group-hover:scale-105 transition-transform duration-500"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-charcoal/50 to-transparent" />
                        {verified && (
                          <span className="absolute top-3 left-3 bg-white/95 text-sage-dark text-xs font-semibold px-3 py-1 rounded-full flex items-center gap-1">
                            <i className="ri-shield-check-fill text-sm" />
                            Verified
                          </span>
                        )}
                        <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between">
                          <span className="bg-sage text-white text-xs font-semibold px-3 py-1 rounded-full capitalize">
                            {propertyType}
                          </span>
                        </div>
                      </div>
                      <div className="p-5">
                        <div className="flex items-baseline gap-1">
                          <span className="text-sage-dark font-bold text-2xl">₹{listing.price.toLocaleString('en-IN')}</span>
                          <span className="text-charcoal/40 text-sm">/night</span>
                        </div>
                        <h3 className="mt-1.5 text-base font-semibold text-charcoal leading-snug line-clamp-2">{listing.title}</h3>
                        <div className="mt-2 flex items-center gap-1.5 text-charcoal/50 text-sm">
                          <i className="ri-map-pin-line text-sm" />
                          {location}
                        </div>
                        {amenities.length > 0 && (
                          <div className="mt-3 flex flex-wrap gap-1.5">
                            {amenities.slice(0, 3).map((a) => (
                              <span key={a} className="text-xs bg-sage-light text-sage-dark px-2.5 py-1 rounded-full font-medium">{a}</span>
                            ))}
                            {amenities.length > 3 && (
                              <span className="text-xs bg-lightgray text-charcoal/50 px-2.5 py-1 rounded-full font-medium">+{amenities.length - 3} more</span>
                            )}
                          </div>
                        )}
                        <div className="mt-4 pt-4 border-t border-black/5 flex items-center gap-3">
                          <img
                            src={landlordAvatar}
                            alt={landlordName}
                            className="w-9 h-9 rounded-full object-cover"
                          />
                          <div>
                            <p className="text-sm font-medium text-charcoal">{landlordName}</p>
                            <p className="text-xs text-charcoal/50">Verified owner</p>
                          </div>
                        </div>
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}

            <div className="mt-10 grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { icon: 'ri-sun-line', label: 'Beach villas' },
                { icon: 'ri-landscape-line', label: 'Hill retreats' },
                { icon: 'ri-water-flash-line', label: 'Houseboats' },
                { icon: 'ri-plant-line', label: 'Farmhouses' },
              ].map((item) => (
                <Link
                  key={item.label}
                  to="/listings?category=vacation"
                  className="flex items-center gap-3.5 min-w-0 bg-white rounded-2xl p-5 border border-black/5 hover:border-sage/40 transition-colors"
                >
                  <div className="w-11 h-11 flex items-center justify-center rounded-xl bg-sage-light text-sage-dark flex-shrink-0">
                    <i className={`${item.icon} text-xl`} />
                  </div>
                  <span className="text-sm font-semibold text-charcoal truncate min-w-0 flex-1">{item.label}</span>
                  <i className="ri-arrow-right-line text-charcoal/30 text-sm ml-auto flex-shrink-0" />
                </Link>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Rent Management Preview */}
      <section className="bg-brand-light py-16 md:py-24">
        <div className="w-full px-5 md:px-10 lg:px-16">
          <div className="max-w-6xl mx-auto">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
              <div>
                <h2 className="text-3xl md:text-[2.75rem] font-bold text-charcoal leading-[1.1] tracking-tight">
                  Manage your rent<br />digitally
                </h2>
                <p className="mt-4 text-charcoal/60 leading-relaxed">
                  Say goodbye to paper clutter. Generate and share rental agreements and rent receipts digitally, submit maintenance
                  requests, and track every rent payment in one place.
                </p>
                <div className="mt-8 space-y-4">
                  <div className="flex items-start gap-4">
                    <div className="w-10 h-10 rounded-full bg-white flex items-center justify-center flex-shrink-0">
                      <i className="ri-check-line text-brand" />
                    </div>
                    <div>
                      <h4 className="font-semibold text-charcoal">Agreements & receipts</h4>
                      <p className="text-sm text-charcoal/60 mt-1">Generate, share, and access your rental agreement and rent receipts anytime — no paperwork needed</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-4">
                    <div className="w-10 h-10 rounded-full bg-white flex items-center justify-center flex-shrink-0">
                      <i className="ri-check-line text-brand" />
                    </div>
                    <div>
                      <h4 className="font-semibold text-charcoal">Payment history</h4>
                      <p className="text-sm text-charcoal/60 mt-1">Every rent payment — paid, pending, or failed — is tracked and visible to both sides</p>
                    </div>
                  </div>
                </div>
                <Link
                  to={
                    !user
                      ? '/signup'
                      : user.role === 'tenant'
                      ? '/tenant-profile?tab=rentManagement&sub=documents'
                      : '/owner-profile?tab=documents'
                  }
                  className="inline-block mt-8 bg-brand text-white font-semibold px-8 py-4 rounded-full hover:bg-brand-dark transition-colors"
                >
                  {user ? 'Go to dashboard' : 'Learn more'}
                </Link>
              </div>
              <div className="relative">
                <div
                  role="img"
                  aria-label="Rent management dashboard preview"
                  className="rounded-3xl w-full aspect-[4/3] bg-gradient-to-br from-brand/15 to-sage/15 border border-black/5 flex items-center justify-center"
                >
                  <i className="ri-file-list-3-line text-brand text-6xl" aria-hidden="true" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* List Property CTA */}
      {!isTenant && (
      <section className="bg-offwhite py-16 md:py-24">
        <div className="w-full px-5 md:px-10 lg:px-16">
          <div className="max-w-6xl mx-auto">
            <div className="rounded-[2rem] overflow-hidden relative">
              <div className="w-full h-[320px] md:h-[380px] bg-gradient-to-br from-brand-dark via-brand to-sage-dark" />
              <div className="absolute inset-0 bg-gradient-to-r from-charcoal/85 via-charcoal/55 to-charcoal/10" />
              <div className="absolute inset-0 flex flex-col md:flex-row items-center justify-between px-8 md:px-14 py-10 gap-8">
                <div className="text-white max-w-lg">
                  <span className="inline-block px-3 py-1 bg-brand text-white text-xs font-semibold rounded-full uppercase tracking-wider mb-4">
                    For property owners
                  </span>
                  <h2 className="text-2xl md:text-4xl font-bold leading-tight tracking-tight">
                    Have a property<br />to rent out?
                  </h2>
                  <p className="mt-3 text-white/80 text-sm md:text-base leading-relaxed">
                    List your property for free and connect with thousands of verified tenants across India. Only verified property owners can list — no subletting allowed.
                  </p>
                  <div className="mt-6 flex flex-wrap gap-4">
                    {['No broker fees', 'Verified tenants', 'Free listing'].map((tag) => (
                      <span key={tag} className="flex items-center gap-1.5 text-sm text-white/90">
                        <i className="ri-check-line text-brand text-sm" />
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="flex flex-col gap-3 flex-shrink-0">
                  <Link
                    to={user ? '/list-property' : '/signup'}
                    className="bg-brand text-white font-semibold px-8 py-3.5 rounded-full hover:bg-brand-dark transition-colors text-center whitespace-nowrap"
                  >
                    List as owner
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
      )}

      {/* CTA Section */}
      <section className="relative py-20 md:py-32">
        <div className="absolute inset-0">
          <div className="w-full h-full bg-gradient-to-br from-brand via-brand-dark to-charcoal" />
          <div className="absolute inset-0 bg-gradient-to-t from-charcoal/80 via-charcoal/50 to-charcoal/70" />
        </div>

        <div className="relative z-10 w-full px-5 md:px-10 lg:px-16 text-center">
          <h2 className="text-3xl md:text-5xl font-bold text-white tracking-tight">
            Start your rental journey today
          </h2>
          <p className="mt-4 text-lg text-white/80 max-w-xl mx-auto">
            Create your free account and access thousands of verified rental listings in minutes
          </p>
          <Link
            to="/signup"
            className="inline-flex items-center gap-3 mt-8 bg-brand text-white font-semibold px-8 py-4 rounded-full hover:bg-brand-dark transition-colors"
          >
            <i className="ri-home-5-line text-base" />
            Create free account
            <i className="ri-arrow-right-up-line" />
          </Link>
        </div>
      </section>
    </div>
  );
}
