import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { useAuth } from '@/hooks/useAuth';
import { getSupabase } from '@/lib/supabase';
import { useToast } from '@/hooks/useToast';
import { INDIA_STATES, CITIES_BY_STATE, OTHER_CITY_OPTION } from '@/content/indiaLocations';
import { geocodeAddress } from '@/lib/geocode';

type Step = 'gate' | 'ownership' | 'landing' | 'property-type' | 'form';
type PropertyCategory = 'residential' | 'commercial' | 'vacation' | '';

const AMENITY_OPTIONS = [
  { name: 'amenity_wifi', label: 'WiFi Included', icon: 'ri-wifi-line' },
  { name: 'amenity_ac', label: 'Air Conditioning', icon: 'ri-temp-cold-line' },
  { name: 'amenity_gym', label: 'Gym / Fitness', icon: 'ri-run-line' },
  { name: 'amenity_security', label: '24/7 Security', icon: 'ri-shield-check-line' },
  { name: 'amenity_lift', label: 'Lift / Elevator', icon: 'ri-arrow-up-down-line' },
  { name: 'amenity_power', label: 'Power Backup', icon: 'ri-flashlight-line' },
  { name: 'amenity_water', label: '24/7 Water', icon: 'ri-drop-line' },
  { name: 'amenity_pets', label: 'Pet Friendly', icon: 'ri-bear-smile-line' },
  { name: 'amenity_balcony', label: 'Balcony', icon: 'ri-building-line' },
];

function generateImageUrl(category: PropertyCategory, city: string) {
  const citySlug = city.toLowerCase().replace(/\s+/g, '-');
  if (category === 'vacation') {
    return '/placeholders/photo.svg';
  }
  if (category === 'commercial') {
    return '/placeholders/photo.svg';
  }
  return '/placeholders/photo.svg';
}

export default function ListProperty() {
  const { user } = useAuth();
  const { addToast } = useToast();
  const navigate = useNavigate();
  const isAadhaarVerified = user?.verified ?? false;
  const isTenant = user?.role === 'tenant';

  const [step, setStep] = useState<Step>(isAadhaarVerified ? 'ownership' : 'gate');

  // Every step past the gate assumes a signed-in owner (ownership-document
  // upload writes to storage under user.id, and the final submit needs
  // user.id for the listing). The "Already verified? Continue to listing"
  // link on the gate screen is the one place that can move past it without
  // an auth check -- this is a defensive backstop for that and any other
  // path that might land here signed out.
  useEffect(() => {
    if (!user && step !== 'gate') {
      navigate('/login');
    }
  }, [user, step, navigate]);
  const [propertyCategory, setPropertyCategory] = useState<PropertyCategory>('');
  const [selectedState, setSelectedState] = useState('');
  const [selectedCity, setSelectedCity] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [charCount, setCharCount] = useState(0);

  const MAX_NEARBY_PLACES = 6;
  const [nearbyPlaces, setNearbyPlaces] = useState<{ label: string; distance: string }[]>([]);

  const addNearbyPlace = () => {
    if (nearbyPlaces.length >= MAX_NEARBY_PLACES) return;
    setNearbyPlaces((prev) => [...prev, { label: '', distance: '' }]);
  };

  const updateNearbyPlace = (index: number, field: 'label' | 'distance', value: string) => {
    setNearbyPlaces((prev) => prev.map((p, i) => (i === index ? { ...p, [field]: value } : p)));
  };

  const removeNearbyPlace = (index: number) => {
    setNearbyPlaces((prev) => prev.filter((_, i) => i !== index));
  };

  const [ownershipDocType, setOwnershipDocType] = useState('');
  const [ownershipDocName, setOwnershipDocName] = useState('');
  const [ownershipDocPath, setOwnershipDocPath] = useState('');
  const [ownershipUploading, setOwnershipUploading] = useState(false);
  const ownershipUploaded = !!ownershipDocPath;

  const handleOwnershipFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !user || !ownershipDocType) return;

    setOwnershipUploading(true);
    const supabase = getSupabase();
    if (!supabase) {
      addToast('Database connection unavailable', 'error');
      setOwnershipUploading(false);
      return;
    }

    const path = `${user.id}/${ownershipDocType}/${Date.now()}-${file.name}`;
    const { error } = await supabase.storage.from('ownership-documents').upload(path, file);
    setOwnershipUploading(false);

    if (error) {
      addToast(`Upload failed: ${error.message}`, 'error');
      return;
    }

    setOwnershipDocPath(path);
    setOwnershipDocName(file.name);
  };

  const handleOwnershipRemove = async () => {
    const supabase = getSupabase();
    if (supabase && ownershipDocPath) {
      await supabase.storage.from('ownership-documents').remove([ownershipDocPath]);
    }
    setOwnershipDocPath('');
    setOwnershipDocName('');
  };

  const handleOwnershipContinue = () => {
    if (!ownershipDocType || !ownershipDocPath) return;
    setStep('landing');
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!user) {
      addToast('Please sign in to list a property', 'error');
      return;
    }

    const form = e.currentTarget;
    const fd = new FormData(form);

    const title = String(fd.get('property_title') ?? '');
    const description = String(fd.get('description') ?? '');
    const state = String(fd.get('state') ?? '');
    const cityRaw = String(fd.get('city') ?? selectedCity);
    const city = cityRaw === OTHER_CITY_OPTION ? String(fd.get('city_other') ?? '').trim() : cityRaw;
    const location = String(fd.get('locality') ?? '');
    const fullAddress = String(fd.get('full_address') ?? '');
    const price = parseInt(String(fd.get('monthly_rent') ?? '0'), 10) || parseInt(String(fd.get('nightly_rate') ?? '0'), 10) || 0;
    const deposit = parseInt(String(fd.get('security_deposit') ?? '0'), 10) || 0;
    const maintenance = parseInt(String(fd.get('maintenance_charge') ?? '0'), 10) || 0;
    const bedrooms = parseInt(String(fd.get('bedrooms') ?? '0'), 10) || 0;
    const bathrooms = parseInt(String(fd.get('bathrooms') ?? '1'), 10) || 1;
    const area = parseInt(String(fd.get('area_sqft') ?? '0'), 10) || 0;
    const furnished = fd.get('furnishing') === 'fully-furnished' || fd.get('furnishing') === 'semi-furnished';
    const propType = String(fd.get('property_type') ?? 'apartment');

    const amenityFields = Array.from(form.querySelectorAll('input[type="checkbox"][name^="amenity_"]'))
      .filter((el) => (el as HTMLInputElement).checked)
      .map((el) => AMENITY_OPTIONS.find((a) => a.name === (el as HTMLInputElement).name)?.label ?? (el as HTMLInputElement).name);

    const imageUrl = generateImageUrl(propertyCategory, city);

    setSubmitting(true);

    // Best-effort geocode so the listing can show up in "nearby" and
    // current-location searches -- a failed/slow lookup should never block
    // listing creation, so the listing still saves with null coordinates.
    // Deliberately locality-level, not the full street address: Nominatim's
    // free-text parser reliably resolves "Kompally, Hyderabad" but returns
    // zero matches once a flat/building number is mixed into the query.
    const coords = await geocodeAddress(`${location}, ${city}, ${state}, India`);

    const supabase = getSupabase();
    if (!supabase) {
      addToast('Database connection unavailable', 'error');
      setSubmitting(false);
      return;
    }

    // 1. Create property
    const { data: property, error: propError } = await supabase
      .from('properties')
      .insert({
        owner_id: user.id,
        name: title,
        address: fullAddress || location,
        city: city,
        state: state || null,
        verified: false,
        verification_doc_url: ownershipDocPath || null,
      })
      .select('id')
      .single();

    if (propError) {
      addToast(`Error creating property: ${propError.message}`, 'error');
      setSubmitting(false);
      return;
    }

    // 2. Create listing
    const { error: listingError } = await supabase
      .from('listings')
      .insert({
        property_id: property.id,
        owner_id: user.id,
        title,
        description,
        price,
        deposit: deposit || null,
        maintenance_charge: maintenance || null,
        location: location || fullAddress,
        city,
        state: state || null,
        bedrooms: bedrooms || null,
        bathrooms: bathrooms || null,
        area_sqft: area || null,
        furnished,
        property_type: propType,
        images: [imageUrl],
        amenities: amenityFields,
        nearby_places: nearbyPlaces.filter((p) => p.label.trim() && p.distance.trim()),
        status: 'active',
        verified: false,
        category: propertyCategory || 'residential',
        latitude: coords?.latitude ?? null,
        longitude: coords?.longitude ?? null,
      });

    if (listingError) {
      // The property row went in first because listings.property_id
      // needs it. If the listing then fails, leaving the property behind
      // means the owner sees a flat they never finished creating -- and
      // pressing submit again makes another one. Three identical
      // "Commercial space" rows in this database came from exactly that.
      //
      // Best effort: if this delete also fails there is nothing further
      // to try from here, and the listing error is the one worth showing.
      await supabase.from('properties').delete().eq('id', property.id);
      setSubmitting(false);
      addToast(`Error creating listing: ${listingError.message}`, 'error');
      return;
    }

    setSubmitting(false);

    setSubmitted(true);
    addToast('Property listed successfully!', 'success');
  };

  if (isTenant) {
    return (
      <div className="min-h-screen bg-offwhite flex items-center justify-center px-4">
        <div className="bg-white rounded-2xl p-10 max-w-md w-full text-center border border-black/5">
          <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-6">
            <div className="w-8 h-8 flex items-center justify-center">
              <i className="ri-forbid-line text-red-600 text-2xl" />
            </div>
          </div>
          <h2 className="text-2xl font-bold text-charcoal">Only Property Owners Can List</h2>
          <p className="mt-3 text-charcoal/70 text-sm leading-relaxed">
            Your account is registered as a tenant. Listing a property on Bhavan is only available to verified property owners.
          </p>
          <div className="mt-8 flex flex-col sm:flex-row gap-3 justify-center">
            <Link
              to="/tenant-profile"
              className="bg-brand text-white font-medium px-6 py-3 rounded-full hover:bg-brand-dark transition-colors text-sm whitespace-nowrap"
            >
              Go to My Dashboard
            </Link>
            <Link
              to="/listings"
              className="border border-black/10 text-charcoal font-medium px-6 py-3 rounded-full hover:bg-lightgray transition-colors text-sm whitespace-nowrap"
            >
              Browse Listings
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="min-h-screen bg-offwhite flex items-center justify-center px-4">
        <div className="bg-white rounded-2xl p-10 max-w-md w-full text-center border border-black/5">
          <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-6">
            <div className="w-8 h-8 flex items-center justify-center">
              <i className="ri-check-line text-green-600 text-2xl" />
            </div>
          </div>
          <h2 className="text-2xl font-bold text-charcoal">Listing Submitted!</h2>
          <p className="mt-3 text-charcoal/70 text-sm leading-relaxed">
            Your property has been listed on Bhavan. It is now live and visible to verified tenants across India.
          </p>
          <div className="mt-8 flex flex-col sm:flex-row gap-3 justify-center">
            <Link
              to="/listings"
              className="bg-brand text-white font-medium px-6 py-3 rounded-full hover:bg-brand-dark transition-colors text-sm whitespace-nowrap"
            >
              Browse Listings
            </Link>
            <button
              onClick={() => { setSubmitted(false); setStep('landing'); setPropertyCategory(''); }}
              className="border border-black/10 text-charcoal font-medium px-6 py-3 rounded-full hover:bg-lightgray transition-colors text-sm whitespace-nowrap cursor-pointer"
            >
              List Another Property
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-offwhite">
      {/* Breadcrumb */}
      <div className="w-full px-4 md:px-8 lg:px-12 pt-6">
        <div className="max-w-3xl mx-auto">
          <div className="flex items-center gap-2 mb-2">
            <Link to="/" className="text-sm text-charcoal/40 hover:text-brand transition-colors cursor-pointer">Home</Link>
            <i className="ri-arrow-right-s-line text-charcoal/30" />
            <span className="text-sm text-charcoal font-medium">List Property</span>
          </div>
        </div>
      </div>

      {/* Header */}
      <section className="bg-white border-b py-12 md:py-16">
        <div className="w-full px-4 md:px-8 lg:px-12">
          <div className="max-w-3xl mx-auto text-center">
            <span className="inline-block px-4 py-1.5 border border-brand text-brand text-xs font-semibold rounded-full uppercase tracking-wide">
              Free Listing
            </span>
            <h1 className="mt-4 text-3xl md:text-4xl font-bold text-charcoal">List Your Property</h1>
            <p className="mt-3 text-charcoal/70 max-w-xl mx-auto">
              List your property directly to verified tenants across India — no brokers, no middlemen, completely free.
            </p>
            {step !== 'gate' && (
              <>
                <div className="mt-8 flex items-center justify-center gap-2">
                  {(['ownership', 'landing', 'property-type', 'form'] as Step[]).map((s, i) => {
                    const stepIndex = ['ownership', 'landing', 'property-type', 'form'].indexOf(step);
                    const isActive = i === stepIndex;
                    const isDone = i < stepIndex;
                    return (
                      <div key={s} className="flex items-center gap-2">
                        <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition ${
                          isDone ? 'bg-brand text-white' : isActive ? 'bg-brand text-white ring-4 ring-brand/20' : 'bg-gray-200 text-charcoal/40'
                        }`}>
                          {isDone ? <i className="ri-check-line text-sm" /> : i + 1}
                        </div>
                        {i < 3 && <div className={`w-8 h-0.5 ${isDone ? 'bg-brand' : 'bg-gray-200'}`} />}
                      </div>
                    );
                  })}
                </div>
                <div className="mt-2 flex items-center justify-center gap-1 flex-wrap">
                  {['Ownership Proof', 'Confirm Role', 'Property Type', 'Fill Details'].map((label, i) => {
                    const stepIndex = ['ownership', 'landing', 'property-type', 'form'].indexOf(step);
                    return (
                      <div key={label} className="flex items-center gap-1">
                        <span className={`text-xs ${i === stepIndex ? 'text-brand font-semibold' : 'text-charcoal/40'}`}>{label}</span>
                        {i < 3 && <span className="text-gray-200 text-xs mx-0.5">·</span>}
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        </div>
      </section>

      {/* Gate: Aadhaar not verified */}
      {step === 'gate' && (
        <section className="py-16 md:py-24">
          <div className="w-full px-4 md:px-8 lg:px-12">
            <div className="max-w-2xl mx-auto">
              <div className="bg-white rounded-2xl border-2 border-amber-200 p-10 text-center">
                <div className="w-16 h-16 rounded-2xl bg-amber-50 flex items-center justify-center mx-auto mb-6">
                  <i className="ri-shield-keyhole-line text-amber-500 text-3xl" />
                </div>
                <h2 className="text-2xl font-bold text-charcoal">Aadhaar Verification Required</h2>
                <p className="mt-3 text-charcoal/60 text-sm leading-relaxed max-w-md mx-auto">
                  Only <strong className="text-charcoal">Aadhaar-verified property owners</strong> can list on Bhavan. This ensures zero broker listings and protects tenants from fraud.
                </p>

                <div className="mt-8 grid grid-cols-1 sm:grid-cols-3 gap-4 text-left">
                  {[
                    { icon: 'ri-forbid-2-line', color: 'bg-red-50 text-red-500', title: 'Brokers Blocked', desc: 'Aadhaar verification permanently bans broker accounts' },
                    { icon: 'ri-shield-check-line', color: 'bg-green-50 text-green-600', title: 'Real Identity', desc: 'Your name on agreements matches your Aadhaar exactly' },
                    { icon: 'ri-time-line', color: 'bg-brand/10 text-brand', title: '2 Minutes', desc: 'Quick OTP-based verification — free and instant' },
                  ].map((item) => (
                    <div key={item.title} className="bg-offwhite rounded-xl p-4">
                      <div className={`w-9 h-9 flex items-center justify-center rounded-lg mb-3 ${item.color}`}>
                        <i className={`${item.icon} text-lg`} />
                      </div>
                      <p className="text-xs font-bold text-charcoal mb-1">{item.title}</p>
                      <p className="text-xs text-charcoal/60 leading-relaxed">{item.desc}</p>
                    </div>
                  ))}
                </div>

                <Link
                  to="/aadhaar-verify"
                  className="mt-8 w-full flex items-center justify-center gap-2 bg-green-600 text-white font-semibold py-4 rounded-full hover:bg-green-700 transition-colors text-sm whitespace-nowrap cursor-pointer"
                >
                  <i className="ri-shield-check-line" />
                  Verify Aadhaar to Continue
                </Link>
                <p className="mt-3 text-xs text-charcoal/40">Free · Instant · Powered by UIDAI</p>

                <div className="mt-6 pt-6 border-t border-black/5">
                  <p className="text-xs text-charcoal/40 mb-3">
                    Already verified?{' '}
                    <span
                      className="text-brand font-medium cursor-pointer"
                      onClick={() => (user ? setStep('ownership') : navigate('/login'))}
                    >
                      Continue to listing
                    </span>
                  </p>
                  <Link to="/how-it-works" className="text-xs text-charcoal/40 hover:text-brand transition-colors">
                    Learn how the listing process works <i className="ri-arrow-right-line text-sm" />
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Ownership Verification Step */}
      {step === 'ownership' && (
        <section className="py-16 md:py-24">
          <div className="w-full px-4 md:px-8 lg:px-12">
            <div className="max-w-2xl mx-auto">
              <div className="bg-white rounded-2xl border-2 border-black/5 p-10">
                <div className="text-center mb-8">
                  <div className="w-16 h-16 rounded-2xl bg-amber-50 flex items-center justify-center mx-auto mb-5">
                    <i className="ri-file-shield-2-line text-amber-500 text-3xl" />
                  </div>
                  <h2 className="text-2xl font-bold text-charcoal">Prove Property Ownership</h2>
                  <p className="mt-3 text-charcoal/60 text-sm leading-relaxed max-w-md mx-auto">
                    Upload a document that proves you own this property. The name on the document must match your Aadhaar-verified name.
                  </p>
                </div>

                <div className="mb-6">
                  <p className="text-xs font-semibold text-charcoal/60 uppercase tracking-wide mb-3">Accepted Documents</p>
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      { icon: 'ri-file-text-line', label: 'Property Registration Deed', value: 'registration-deed' },
                      { icon: 'ri-file-paper-2-line', label: 'Sale Deed / Title Deed', value: 'sale-deed' },
                      { icon: 'ri-government-line', label: 'Municipal Tax Receipt', value: 'tax-receipt' },
                      { icon: 'ri-flashlight-line', label: 'Electricity Bill (Owner Name)', value: 'electricity-bill' },
                    ].map((doc) => (
                      <button
                        key={doc.value}
                        type="button"
                        onClick={() => setOwnershipDocType(doc.value)}
                        className={`flex items-center gap-3 p-3.5 rounded-xl border-2 text-left transition cursor-pointer ${
                          ownershipDocType === doc.value
                            ? 'border-brand bg-brand/5'
                            : 'border-black/5 hover:border-brand/30 hover:bg-lightgray'
                        }`}
                      >
                        <div className={`w-8 h-8 flex items-center justify-center rounded-lg flex-shrink-0 ${
                          ownershipDocType === doc.value ? 'bg-brand text-white' : 'bg-lightgray text-charcoal/60'
                        }`}>
                          <i className={`${doc.icon} text-sm`} />
                        </div>
                        <span className={`text-xs font-medium leading-snug ${
                          ownershipDocType === doc.value ? 'text-brand' : 'text-charcoal'
                        }`}>{doc.label}</span>
                        {ownershipDocType === doc.value && (
                          <div className="ml-auto w-4 h-4 flex items-center justify-center flex-shrink-0">
                            <i className="ri-check-line text-brand text-xs" />
                          </div>
                        )}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="mb-6">
                  <p className="text-xs font-semibold text-charcoal/60 uppercase tracking-wide mb-3">Upload Document</p>
                  {ownershipUploading ? (
                    <div className="flex flex-col items-center justify-center gap-3 p-8 border-2 border-dashed border-black/10 rounded-xl">
                      <i className="ri-loader-4-line animate-spin text-2xl text-brand" />
                      <p className="text-sm font-semibold text-charcoal">Uploading...</p>
                    </div>
                  ) : !ownershipUploaded ? (
                    <label className={`flex flex-col items-center justify-center gap-3 p-8 border-2 border-dashed border-black/10 rounded-xl transition ${
                      ownershipDocType ? 'cursor-pointer hover:border-brand/40 hover:bg-brand/5' : 'opacity-50 cursor-not-allowed'
                    }`}>
                      <div className="w-12 h-12 flex items-center justify-center rounded-xl bg-lightgray">
                        <i className="ri-upload-cloud-2-line text-2xl text-charcoal/40" />
                      </div>
                      <div className="text-center">
                        <p className="text-sm font-semibold text-charcoal">
                          {ownershipDocType ? 'Click to upload document' : 'Select a document type above first'}
                        </p>
                        <p className="text-xs text-charcoal/40 mt-1">PDF, JPG, PNG · Max 10MB</p>
                      </div>
                      <input
                        type="file"
                        accept=".pdf,.jpg,.jpeg,.png"
                        className="hidden"
                        disabled={!ownershipDocType}
                        onChange={handleOwnershipFileChange}
                      />
                    </label>
                  ) : (
                    <div className="flex items-center gap-3 p-4 bg-green-50 border border-green-200 rounded-xl">
                      <div className="w-10 h-10 flex items-center justify-center rounded-lg bg-green-100 flex-shrink-0">
                        <i className="ri-file-check-line text-green-600 text-lg" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-green-700 truncate">{ownershipDocName}</p>
                        <p className="text-xs text-green-600 mt-0.5">Document uploaded successfully</p>
                      </div>
                      <button
                        type="button"
                        onClick={handleOwnershipRemove}
                        className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-green-100 transition-colors cursor-pointer flex-shrink-0"
                      >
                        <i className="ri-close-line text-green-600 text-sm" />
                      </button>
                    </div>
                  )}
                </div>

                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-6">
                  <div className="flex items-start gap-3">
                    <div className="w-5 h-5 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <i className="ri-information-line text-amber-600" />
                    </div>
                    <p className="text-xs text-amber-700 leading-relaxed">
                      The name on your document must match your <strong>Aadhaar-verified name</strong>. Our team reviews documents within 24 hours. Your listing will go live after approval.
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleOwnershipContinue}
                  disabled={!ownershipDocType || !ownershipUploaded}
                  className="w-full flex items-center justify-center gap-2 bg-brand text-white font-semibold py-4 rounded-full hover:bg-brand-dark transition-colors text-sm whitespace-nowrap cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <i className="ri-arrow-right-line" /> Continue to Listing Form
                </button>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Step 1: Landing */}
      {step === 'landing' && (
        <section className="py-16 md:py-24">
          <div className="w-full px-4 md:px-8 lg:px-12">
            <div className="max-w-2xl mx-auto">
              <div className="bg-white rounded-2xl border-2 border-black/5 p-10 text-center">
                <div className="w-16 h-16 rounded-2xl bg-brand/10 flex items-center justify-center mx-auto mb-6">
                  <div className="w-8 h-8 flex items-center justify-center">
                    <i className="ri-home-4-line text-brand text-3xl" />
                  </div>
                </div>
                <h2 className="text-2xl font-bold text-charcoal">Who are you?</h2>
                <p className="mt-3 text-charcoal/60 text-sm leading-relaxed max-w-md mx-auto">
                  Select your role to continue. Only verified property owners are allowed to list on Bhavan.
                </p>

                <div className="mt-8 bg-brand/5 border-2 border-brand rounded-xl p-5 text-left">
                  <div className="flex items-start gap-4">
                    <div className="mt-0.5 w-5 h-5 flex-shrink-0 rounded-full border-2 border-brand bg-brand flex items-center justify-center">
                      <div className="w-2 h-2 rounded-full bg-white" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-charcoal">I am a Property Owner</p>
                      <p className="text-xs text-charcoal/60 mt-0.5">I own this property and want to list it for rent directly to tenants — no broker involved.</p>
                    </div>
                  </div>
                </div>

                <div className="mt-3 bg-lightgray rounded-xl p-5 text-left opacity-50 cursor-not-allowed select-none">
                  <div className="flex items-start gap-4">
                    <div className="mt-0.5 w-5 h-5 flex-shrink-0 rounded-full border-2 border-black/15 bg-white" />
                    <div>
                      <p className="text-sm font-semibold text-charcoal/40 flex items-center gap-2">
                        Broker / Agent
                        <span className="text-xs bg-red-100 text-red-500 px-2 py-0.5 rounded-full font-medium">Not Allowed</span>
                      </p>
                      <p className="text-xs text-charcoal/40 mt-0.5">Bhavan is strictly for direct property owners only. Broker listings are prohibited and will be removed.</p>
                    </div>
                  </div>
                </div>

                <button
                  onClick={() => setStep('property-type')}
                  className="mt-8 w-full bg-brand text-white font-semibold py-4 rounded-full hover:bg-brand-dark transition-colors text-sm whitespace-nowrap cursor-pointer flex items-center justify-center gap-2"
                >
                  Continue as Property Owner
                  <div className="w-4 h-4 flex items-center justify-center">
                    <i className="ri-arrow-right-line" />
                  </div>
                </button>
              </div>

              <div className="mt-8 bg-white rounded-3xl border border-black/5 p-6">
                <p className="text-xs font-semibold text-charcoal/40 uppercase tracking-widest mb-5 text-center">Why list on Bhavan?</p>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-6 text-center">
                  {[
                    { icon: 'ri-hand-coin-line', label: 'No Broker Fees' },
                    { icon: 'ri-shield-user-line', label: 'Aadhaar Verification Available' },
                    { icon: 'ri-price-tag-3-line', label: '100% Free Listing' },
                    { icon: 'ri-chat-3-line', label: 'Direct Tenant Messages' },
                  ].map((b) => (
                    <div key={b.label}>
                      <div className="w-10 h-10 rounded-full bg-brand/10 flex items-center justify-center mx-auto mb-2">
                        <div className="w-5 h-5 flex items-center justify-center">
                          <i className={`${b.icon} text-brand`} />
                        </div>
                      </div>
                      <p className="text-xs font-medium text-charcoal">{b.label}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Step 2: Property Type */}
      {step === 'property-type' && (
        <section className="py-16 md:py-24">
          <div className="w-full px-4 md:px-8 lg:px-12">
            <div className="max-w-2xl mx-auto">
              <button
                onClick={() => setStep('landing')}
                className="flex items-center gap-2 text-sm text-charcoal/60 hover:text-brand transition-colors cursor-pointer mb-8"
              >
                <div className="w-4 h-4 flex items-center justify-center">
                  <i className="ri-arrow-left-line" />
                </div>
                Back
              </button>

              <div className="bg-white rounded-2xl border-2 border-black/5 p-10">
                <div className="text-center mb-10">
                  <div className="w-16 h-16 rounded-2xl bg-brand/10 flex items-center justify-center mx-auto mb-6">
                    <div className="w-8 h-8 flex items-center justify-center">
                      <i className="ri-building-2-line text-brand text-3xl" />
                    </div>
                  </div>
                  <h2 className="text-2xl font-bold text-charcoal">What type of property?</h2>
                  <p className="mt-3 text-charcoal/60 text-sm max-w-md mx-auto">
                    Choose the category that best describes your property. This helps us show it to the right audience.
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
                  <button
                    type="button"
                    onClick={() => setPropertyCategory('residential')}
                    className={`group relative rounded-2xl border-2 p-7 text-left transition cursor-pointer ${
                      propertyCategory === 'residential'
                        ? 'border-brand bg-brand/5'
                        : 'border-black/10 hover:border-brand/40 hover:bg-lightgray'
                    }`}
                  >
                    {propertyCategory === 'residential' && (
                      <div className="absolute top-4 right-4 w-5 h-5 rounded-full bg-brand flex items-center justify-center">
                        <i className="ri-check-line text-white text-xs" />
                      </div>
                    )}
                    <div className={`w-14 h-14 rounded-xl flex items-center justify-center mb-5 transition-colors ${
                      propertyCategory === 'residential' ? 'bg-brand text-white' : 'bg-lightgray text-charcoal/60 group-hover:bg-brand/10 group-hover:text-brand'
                    }`}>
                      <div className="w-7 h-7 flex items-center justify-center">
                        <i className="ri-home-5-line text-2xl" />
                      </div>
                    </div>
                    <h3 className="text-base font-bold text-charcoal mb-2">Residential</h3>
                    <p className="text-xs text-charcoal/60 leading-relaxed">
                      Apartments, houses, villas, PG rooms, studio flats — any property meant for living.
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={() => setPropertyCategory('commercial')}
                    className={`group relative rounded-2xl border-2 p-7 text-left transition cursor-pointer ${
                      propertyCategory === 'commercial'
                        ? 'border-brand bg-brand/5'
                        : 'border-black/10 hover:border-brand/40 hover:bg-lightgray'
                    }`}
                  >
                    {propertyCategory === 'commercial' && (
                      <div className="absolute top-4 right-4 w-5 h-5 rounded-full bg-brand flex items-center justify-center">
                        <i className="ri-check-line text-white text-xs" />
                      </div>
                    )}
                    <div className={`w-14 h-14 rounded-xl flex items-center justify-center mb-5 transition-colors ${
                      propertyCategory === 'commercial' ? 'bg-brand text-white' : 'bg-lightgray text-charcoal/60 group-hover:bg-brand/10 group-hover:text-brand'
                    }`}>
                      <div className="w-7 h-7 flex items-center justify-center">
                        <i className="ri-building-4-line text-2xl" />
                      </div>
                    </div>
                    <h3 className="text-base font-bold text-charcoal mb-2">Commercial</h3>
                    <p className="text-xs text-charcoal/60 leading-relaxed">
                      Office spaces, shops, showrooms, warehouses, co-working spaces — for business use.
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={() => setPropertyCategory('vacation')}
                    className={`group relative rounded-2xl border-2 p-7 text-left transition cursor-pointer ${
                      propertyCategory === 'vacation'
                        ? 'border-rose-400 bg-sage-light/50'
                        : 'border-black/10 hover:border-sage/40 hover:bg-sage-light/30'
                    }`}
                  >
                    {propertyCategory === 'vacation' && (
                      <div className="absolute top-4 right-4 w-5 h-5 rounded-full bg-sage flex items-center justify-center">
                        <i className="ri-check-line text-white text-xs" />
                      </div>
                    )}
                    <div className={`w-14 h-14 rounded-xl flex items-center justify-center mb-5 transition-colors ${
                      propertyCategory === 'vacation' ? 'bg-sage text-white' : 'bg-lightgray text-charcoal/60 group-hover:bg-sage-light group-hover:text-sage'
                    }`}>
                      <div className="w-7 h-7 flex items-center justify-center">
                        <i className="ri-sun-line text-2xl" />
                      </div>
                    </div>
                    <h3 className="text-base font-bold text-charcoal mb-2">Vacation Rental</h3>
                    <p className="text-xs text-charcoal/60 leading-relaxed">
                      Holiday homes, beach houses, hill retreats, farmhouses — short-stay rentals.
                    </p>
                  </button>
                </div>

                <button
                  disabled={!propertyCategory}
                  onClick={() => setStep('form')}
                  className="mt-8 w-full bg-brand text-white font-semibold py-4 rounded-full hover:bg-brand-dark transition-colors text-sm whitespace-nowrap cursor-pointer flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Continue with {propertyCategory === 'residential' ? 'Residential' : propertyCategory === 'commercial' ? 'Commercial' : propertyCategory === 'vacation' ? 'Vacation Rental' : '...'}
                  <div className="w-4 h-4 flex items-center justify-center">
                    <i className="ri-arrow-right-line" />
                  </div>
                </button>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Step 3: Listing Form */}
      {step === 'form' && (
        <section className="py-12 md:py-20">
          <div className="w-full px-4 md:px-8 lg:px-12">
            <div className="max-w-3xl mx-auto">
              <div className="flex items-center justify-between mb-8">
                <button
                  onClick={() => setStep('property-type')}
                  className="flex items-center gap-2 text-sm text-charcoal/60 hover:text-brand transition-colors cursor-pointer"
                >
                  <div className="w-4 h-4 flex items-center justify-center">
                    <i className="ri-arrow-left-line" />
                  </div>
                  Back
                </button>
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-2 bg-brand/10 text-brand text-xs font-semibold px-3 py-1.5 rounded-full">
                    <div className="w-3 h-3 flex items-center justify-center">
                      <i className="ri-home-4-line" />
                    </div>
                    Property Owner
                  </div>
                  <div className={`flex items-center gap-2 text-xs font-semibold px-3 py-1.5 rounded-full ${
                    propertyCategory === 'residential' ? 'bg-green-100 text-green-700' : propertyCategory === 'vacation' ? 'bg-sage-light text-sage-dark' : 'bg-amber-100 text-amber-700'
                  }`}>
                    <div className="w-3 h-3 flex items-center justify-center">
                      <i className={propertyCategory === 'residential' ? 'ri-home-5-line' : propertyCategory === 'vacation' ? 'ri-sun-line' : 'ri-building-4-line'} />
                    </div>
                    {propertyCategory === 'residential' ? 'Residential' : propertyCategory === 'vacation' ? 'Vacation Rental' : 'Commercial'}
                  </div>
                </div>
              </div>

              <form
                id="list-property-form"
                onSubmit={handleSubmit}
                className="space-y-8"
              >
                <input type="hidden" name="listing_role" value="owner" />
                <input type="hidden" name="property_category" value={propertyCategory} />

                {/* Basic Info */}
                <div className="bg-white rounded-3xl border border-black/5 p-6 md:p-8">
                  <h3 className="text-base font-bold text-charcoal mb-6 flex items-center gap-2">
                    <div className="w-6 h-6 rounded-full bg-brand text-white text-xs flex items-center justify-center font-bold">1</div>
                    Basic Information
                  </h3>
                  <div className="space-y-5">
                    <div>
                      <label className="block text-sm font-medium text-charcoal mb-1.5">Property Title <span className="text-red-500">*</span></label>
                      <input
                        type="text"
                        name="property_title"
                        required
                        placeholder="e.g. Sunny 2BHK in Bandra West"
                        className="w-full border border-black/10 rounded-lg px-4 py-3 text-sm text-charcoal placeholder-charcoal/40 focus:outline-none focus:border-brand transition-colors"
                      />
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                      <div>
                        <label className="block text-sm font-medium text-charcoal mb-1.5">Property Type <span className="text-red-500">*</span></label>
                        <select
                          name="property_type"
                          required
                          className="w-full border border-black/10 rounded-lg px-4 py-3 text-sm text-charcoal focus:outline-none focus:border-brand transition-colors cursor-pointer"
                        >
                          <option value="">Select type</option>
                          {propertyCategory === 'residential' && (
                            <>
                              <option value="apartment">Apartment / Flat</option>
                              <option value="house">Independent House / Villa</option>
                              <option value="room">Single Room / PG</option>
                              <option value="studio">Studio Apartment</option>
                            </>
                          )}
                          {propertyCategory === 'commercial' && (
                            <>
                              <option value="office">Office Space</option>
                              <option value="shop">Shop / Retail Store</option>
                              <option value="showroom">Showroom</option>
                              <option value="warehouse">Warehouse / Godown</option>
                              <option value="coworking">Co-working Space</option>
                            </>
                          )}
                          {propertyCategory === 'vacation' && (
                            <>
                              <option value="villa">Villa / Bhavan</option>
                              <option value="cottage">Cottage / Cabin</option>
                              <option value="beach-house">Beach House</option>
                              <option value="farmhouse">Farmhouse</option>
                            </>
                          )}
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-charcoal mb-1.5">
                          {propertyCategory === 'vacation' ? 'Nightly Rate (₹)' : 'Monthly Rent (₹)'} <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="number"
                          name={propertyCategory === 'vacation' ? 'nightly_rate' : 'monthly_rent'}
                          required
                          min={propertyCategory === 'vacation' ? 500 : 1000}
                          placeholder={propertyCategory === 'vacation' ? 'e.g. 4500' : 'e.g. 25000'}
                          className="w-full border border-black/10 rounded-lg px-4 py-3 text-sm text-charcoal placeholder-charcoal/40 focus:outline-none focus:border-brand transition-colors"
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
                      <div>
                        <label className="block text-sm font-medium text-charcoal mb-1.5">
                          Bedrooms {propertyCategory === 'commercial' ? <span className="text-charcoal/40 font-normal">(optional)</span> : <span className="text-red-500">*</span>}
                        </label>
                        <select
                          name="bedrooms"
                          required={propertyCategory !== 'commercial'}
                          className="w-full border border-black/10 rounded-lg px-4 py-3 text-sm text-charcoal focus:outline-none focus:border-brand transition-colors cursor-pointer"
                        >
                          <option value="">Select</option>
                          <option value="0">Studio / 1RK</option>
                          <option value="1">1 BHK</option>
                          <option value="2">2 BHK</option>
                          <option value="3">3 BHK</option>
                          <option value="4">4 BHK</option>
                          <option value="5">5+ BHK</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-charcoal mb-1.5">
                          Bathrooms {propertyCategory === 'commercial' ? <span className="text-charcoal/40 font-normal">(optional)</span> : <span className="text-red-500">*</span>}
                        </label>
                        <select
                          name="bathrooms"
                          required={propertyCategory !== 'commercial'}
                          className="w-full border border-black/10 rounded-lg px-4 py-3 text-sm text-charcoal focus:outline-none focus:border-brand transition-colors cursor-pointer"
                        >
                          <option value="">Select</option>
                          <option value="1">1</option>
                          <option value="2">2</option>
                          <option value="3">3</option>
                          <option value="4">4+</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-charcoal mb-1.5">Area (sq ft)</label>
                        <input
                          type="number"
                          name="area_sqft"
                          min={50}
                          placeholder="e.g. 850"
                          className="w-full border border-black/10 rounded-lg px-4 py-3 text-sm text-charcoal placeholder-charcoal/40 focus:outline-none focus:border-brand transition-colors"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Location */}
                <div className="bg-white rounded-3xl border border-black/5 p-6 md:p-8">
                  <h3 className="text-base font-bold text-charcoal mb-6 flex items-center gap-2">
                    <div className="w-6 h-6 rounded-full bg-brand text-white text-xs flex items-center justify-center font-bold">2</div>
                    Location
                  </h3>
                  <div className="space-y-5">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                      <div>
                        <label className="block text-sm font-medium text-charcoal mb-1.5">State <span className="text-red-500">*</span></label>
                        <select
                          name="state"
                          required
                          value={selectedState}
                          onChange={(e) => {
                            setSelectedState(e.target.value);
                            setSelectedCity('');
                          }}
                          className="w-full border border-black/10 rounded-lg px-4 py-3 text-sm text-charcoal focus:outline-none focus:border-brand transition-colors cursor-pointer"
                        >
                          <option value="">Select state</option>
                          {INDIA_STATES.map((s) => (
                            <option key={s} value={s}>{s}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-charcoal mb-1.5">City <span className="text-red-500">*</span></label>
                        <select
                          name="city"
                          required
                          disabled={!selectedState}
                          value={selectedCity}
                          onChange={(e) => setSelectedCity(e.target.value)}
                          className="w-full border border-black/10 rounded-lg px-4 py-3 text-sm text-charcoal focus:outline-none focus:border-brand transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          <option value="">{selectedState ? 'Select city' : 'Select a state first'}</option>
                          {(CITIES_BY_STATE[selectedState] ?? []).map((c) => (
                            <option key={c} value={c}>{c}</option>
                          ))}
                          {selectedState && <option value={OTHER_CITY_OPTION}>{OTHER_CITY_OPTION}</option>}
                        </select>
                      </div>
                    </div>
                    {selectedCity === OTHER_CITY_OPTION && (
                      <div>
                        <label className="block text-sm font-medium text-charcoal mb-1.5">City Name <span className="text-red-500">*</span></label>
                        <input
                          type="text"
                          name="city_other"
                          required
                          placeholder="Enter your city"
                          className="w-full border border-black/10 rounded-lg px-4 py-3 text-sm text-charcoal placeholder-charcoal/40 focus:outline-none focus:border-brand transition-colors"
                        />
                      </div>
                    )}
                    <div>
                      <label className="block text-sm font-medium text-charcoal mb-1.5">Locality / Area <span className="text-red-500">*</span></label>
                      <input
                        type="text"
                        name="locality"
                        required
                        placeholder="e.g. Koramangala, HSR Layout"
                        className="w-full border border-black/10 rounded-lg px-4 py-3 text-sm text-charcoal placeholder-charcoal/40 focus:outline-none focus:border-brand transition-colors"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-charcoal mb-1.5">Full Address <span className="text-red-500">*</span></label>
                      <textarea
                        name="full_address"
                        required
                        rows={3}
                        placeholder="Flat/House no., building or society name, street, landmark — Indian addresses usually need all of these to be found easily"
                        className="w-full border border-black/10 rounded-lg px-4 py-3 text-sm text-charcoal placeholder-charcoal/40 focus:outline-none focus:border-brand transition-colors resize-none"
                      />
                    </div>
                  </div>
                </div>

                {/* Amenities */}
                <div className="bg-white rounded-3xl border border-black/5 p-6 md:p-8">
                  <h3 className="text-base font-bold text-charcoal mb-6 flex items-center gap-2">
                    <div className="w-6 h-6 rounded-full bg-brand text-white text-xs flex items-center justify-center font-bold">3</div>
                    Amenities &amp; Features
                  </h3>
                  <div className="space-y-5">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                      <div>
                        <label className="block text-sm font-medium text-charcoal mb-1.5">Furnishing Status</label>
                        <select
                          name="furnishing"
                          className="w-full border border-black/10 rounded-lg px-4 py-3 text-sm text-charcoal focus:outline-none focus:border-brand transition-colors cursor-pointer"
                        >
                          <option value="unfurnished">Unfurnished</option>
                          <option value="semi-furnished">Semi-Furnished</option>
                          <option value="fully-furnished">Fully Furnished</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-charcoal mb-1.5">Security Deposit (₹)</label>
                        <input
                          type="number"
                          name="security_deposit"
                          min={0}
                          placeholder="e.g. 100000"
                          className="w-full border border-black/10 rounded-lg px-4 py-3 text-sm text-charcoal placeholder-charcoal/40 focus:outline-none focus:border-brand transition-colors"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-charcoal mb-3">Additional Amenities</label>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                        {AMENITY_OPTIONS.map((a) => (
                          <label key={a.name} className="flex items-center gap-2.5 cursor-pointer group">
                            <input
                              type="checkbox"
                              name={a.name}
                              id={a.name}
                              className="w-4 h-4 accent-brand cursor-pointer"
                            />
                            <div className="w-4 h-4 flex items-center justify-center">
                              <i className={`${a.icon} text-charcoal/40 group-hover:text-brand transition-colors text-sm`} />
                            </div>
                            <span className="text-sm text-charcoal/70 group-hover:text-charcoal transition-colors">{a.label}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Nearby Places (optional) */}
                <div className="bg-white rounded-3xl border border-black/5 p-6 md:p-8">
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-sm font-medium text-charcoal">Nearby Places <span className="text-charcoal/40 font-normal">(optional)</span></label>
                    {nearbyPlaces.length < MAX_NEARBY_PLACES && (
                      <button
                        type="button"
                        onClick={addNearbyPlace}
                        className="text-xs font-semibold text-brand hover:text-brand-dark cursor-pointer whitespace-nowrap"
                      >
                        + Add landmark
                      </button>
                    )}
                  </div>
                  <p className="text-xs text-charcoal/40 mb-3">Help tenants understand the neighborhood — e.g. nearest school, hospital, metro station.</p>
                  {nearbyPlaces.length > 0 && (
                    <div className="space-y-2">
                      {nearbyPlaces.map((place, i) => (
                        <div key={i} className="flex gap-2 items-center">
                          <input
                            type="text"
                            value={place.label}
                            onChange={(e) => updateNearbyPlace(i, 'label', e.target.value)}
                            placeholder="e.g. City Hospital"
                            aria-label={`Nearby place ${i + 1} name`}
                            maxLength={60}
                            className="flex-1 border border-black/10 rounded-lg px-3 py-2.5 text-sm text-charcoal placeholder-charcoal/40 focus:outline-none focus:border-brand transition-colors"
                          />
                          <input
                            type="text"
                            value={place.distance}
                            onChange={(e) => updateNearbyPlace(i, 'distance', e.target.value)}
                            placeholder="e.g. 1.2 km"
                            aria-label={`Nearby place ${i + 1} distance`}
                            maxLength={20}
                            className="w-28 border border-black/10 rounded-lg px-3 py-2.5 text-sm text-charcoal placeholder-charcoal/40 focus:outline-none focus:border-brand transition-colors"
                          />
                          <button
                            type="button"
                            onClick={() => removeNearbyPlace(i)}
                            aria-label={`Remove nearby place ${i + 1}`}
                            className="w-9 h-9 flex-shrink-0 flex items-center justify-center rounded-lg text-charcoal/40 hover:text-red-500 hover:bg-red-50 transition-colors cursor-pointer"
                          >
                            <i className="ri-close-line" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Description */}
                <div className="bg-white rounded-3xl border border-black/5 p-6 md:p-8">
                  <h3 className="text-base font-bold text-charcoal mb-6 flex items-center gap-2">
                    <div className="w-6 h-6 rounded-full bg-brand text-white text-xs flex items-center justify-center font-bold">4</div>
                    Description
                  </h3>
                  <div>
                    <label className="block text-sm font-medium text-charcoal mb-1.5">
                      Property Description <span className="text-red-500">*</span>
                    </label>
                    <textarea
                      name="description"
                      required
                      rows={5}
                      maxLength={500}
                      placeholder="Describe your property — highlights, nearby landmarks, what makes it special..."
                      onChange={(e) => setCharCount(e.target.value.length)}
                      className="w-full border border-black/10 rounded-lg px-4 py-3 text-sm text-charcoal placeholder-charcoal/40 focus:outline-none focus:border-brand transition-colors resize-none"
                    />
                    <p className={`text-xs mt-1 text-right ${charCount >= 500 ? 'text-red-500' : 'text-charcoal/40'}`}>
                      {charCount}/500
                    </p>
                  </div>
                </div>

                {/* Submit */}
                <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pb-8">
                  <p className="text-xs text-charcoal/60 max-w-sm">
                    By submitting, you agree to our Terms of Service. Your listing will go live immediately and be visible to verified tenants.
                  </p>
                  <button
                    type="submit"
                    disabled={submitting || !user}
                    className="bg-brand text-white font-semibold px-10 py-3.5 rounded-full hover:bg-brand-dark transition-colors disabled:opacity-60 whitespace-nowrap cursor-pointer"
                  >
                    {submitting ? 'Submitting...' : !user ? 'Sign In Required' : 'Submit Listing'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}