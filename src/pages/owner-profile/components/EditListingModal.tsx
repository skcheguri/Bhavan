import { useDismissableLayer } from '@/hooks/useDismissableLayer';
import { useState, useEffect, useRef } from 'react';
import { getSupabase } from '@/lib/supabase';
import type { ListingFromDB } from '@/hooks/useListings';
import { uploadListingImages, deleteListingImage } from '@/hooks/useListingImages';
import { hasNativeCamera, capturePhoto, pickPhotos } from '@/lib/photoCapture';
import { useToast } from '@/hooks/useToast';
import { geocodeAddress } from '@/lib/geocode';

interface EditListingModalProps {
  listing: ListingFromDB | null;
  onClose: () => void;
  onSave: (updated: ListingFromDB) => void;
}

const cities = [
  'Mumbai', 'Bangalore', 'New Delhi', 'Hyderabad', 'Chennai',
  'Pune', 'Kolkata', 'Ahmedabad', 'Jaipur', 'Surat',
];

const amenitiesList = [
  { key: 'WiFi', icon: 'ri-wifi-line' },
  { key: 'AC', icon: 'ri-temp-cold-line' },
  { key: 'Gym', icon: 'ri-run-line' },
  { key: 'Security', icon: 'ri-shield-check-line' },
  { key: 'Lift', icon: 'ri-arrow-up-down-line' },
  { key: 'Power Backup', icon: 'ri-flashlight-line' },
  { key: '24/7 Water', icon: 'ri-drop-line' },
  { key: 'Pet Friendly', icon: 'ri-bear-smile-line' },
  { key: 'Balcony', icon: 'ri-building-line' },
  { key: 'Parking', icon: 'ri-car-line' },
];

export default function EditListingModal({ listing, onClose, onSave }: EditListingModalProps) {
  useDismissableLayer(onClose);
  const { addToast } = useToast();
  const [saving, setSaving] = useState(false);
  const [charCount, setCharCount] = useState(0);
  const [images, setImages] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [removingUrl, setRemovingUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const MAX_NEARBY_PLACES = 6;

  const [form, setForm] = useState({
    title: '',
    price: '',
    bedrooms: '',
    bathrooms: '',
    area: '',
    location: '',
    locality: '',
    fullAddress: '',
    description: '',
    furnished: false,
    parking: 'none',
    amenities: [] as string[],
    nearbyPlaces: [] as { label: string; distance: string }[],
  });

  useEffect(() => {
    if (listing) {
      setForm({
        title: listing.title,
        price: String(listing.price),
        bedrooms: String(listing.bedrooms ?? 0),
        bathrooms: String(listing.bathrooms ?? 1),
        area: String(listing.area_sqft ?? 0),
        location: listing.city ?? '',
        locality: listing.location ?? '',
        fullAddress: listing.property?.address ?? '',
        description: listing.description ?? '',
        furnished: listing.furnished ?? false,
        parking: listing.parking ?? 'none',
        amenities: listing.amenities ?? [],
        nearbyPlaces: listing.nearby_places ?? [],
      });
      setCharCount((listing.description ?? '').length);
      setImages(listing.images ?? []);
    }
  }, [listing]);

  const addNearbyPlace = () => {
    setForm((prev) =>
      prev.nearbyPlaces.length >= MAX_NEARBY_PLACES ? prev : { ...prev, nearbyPlaces: [...prev.nearbyPlaces, { label: '', distance: '' }] }
    );
  };

  const updateNearbyPlace = (index: number, field: 'label' | 'distance', value: string) => {
    setForm((prev) => ({
      ...prev,
      nearbyPlaces: prev.nearbyPlaces.map((p, i) => (i === index ? { ...p, [field]: value } : p)),
    }));
  };

  const removeNearbyPlace = (index: number) => {
    setForm((prev) => ({ ...prev, nearbyPlaces: prev.nearbyPlaces.filter((_, i) => i !== index) }));
  };

  /**
   * On a phone the hidden file inputs open a system chooser rather than
   * the camera, and upload the sensor's full-size output -- often past the
   * uploader's 5MB limit. The native path resizes first. Web keeps the
   * inputs, which is the right control there.
   */
  const addFromCamera = async () => {
    const { files, error } = await capturePhoto();
    if (error) addToast(error, 'error');
    if (files.length) await uploadFiles(files);
  };

  const addFromGallery = async () => {
    const { files, error } = await pickPhotos();
    if (error) addToast(error, 'error');
    if (files.length) await uploadFiles(files);
  };

  const uploadFiles = async (files: FileList | File[]) => {
    if (!listing) return;
    setUploading(true);
    const { urls, errors } = await uploadListingImages(listing.owner_id, listing.id, files);
    if (urls.length > 0) setImages((prev) => [...prev, ...urls]);
    if (errors.length > 0) addToast(errors.join('; '), 'error');
    setUploading(false);
  };

  const handleFilesSelected = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0 || !listing) return;
    setUploading(true);
    const { urls, errors } = await uploadListingImages(listing.owner_id, listing.id, fileList);
    if (urls.length > 0) {
      setImages((prev) => [...prev, ...urls]);
    }
    if (errors.length > 0) {
      addToast(errors.join('; '), 'error');
    }
    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (cameraInputRef.current) cameraInputRef.current.value = '';
  };

  const handleRemoveImage = async (url: string) => {
    setRemovingUrl(url);
    const { error } = await deleteListingImage(url);
    setRemovingUrl(null);
    if (error) {
      addToast(`Failed to remove photo: ${error}`, 'error');
      return;
    }
    setImages((prev) => prev.filter((u) => u !== url));
  };

  const handleChange = (field: string, value: string | boolean | string[]) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const toggleAmenity = (key: string) => {
    setForm((prev) => ({
      ...prev,
      amenities: prev.amenities.includes(key)
        ? prev.amenities.filter((a) => a !== key)
        : [...prev.amenities, key],
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!listing) return;

    setSaving(true);
    const supabase = getSupabase();
    if (!supabase) {
      addToast('Database connection unavailable', 'error');
      setSaving(false);
      return;
    }

    const addressChanged =
      form.locality !== (listing.location ?? '') ||
      form.fullAddress !== (listing.property?.address ?? '') ||
      form.location !== (listing.city ?? '');

    // Re-resolve coordinates whenever the address changed, so "nearby"
    // and current-location search stay accurate -- best-effort, a failed
    // lookup shouldn't block saving the rest of the listing. Locality-level
    // only: Nominatim reliably resolves "Kompally, Hyderabad" but returns
    // zero matches once a flat/building number is mixed into the query.
    const coords = addressChanged
      ? await geocodeAddress(`${form.locality}, ${form.location}, India`)
      : null;

    if (listing.property_id && form.fullAddress !== (listing.property?.address ?? '')) {
      const { error: propError } = await supabase
        .from('properties')
        .update({ address: form.fullAddress })
        .eq('id', listing.property_id);
      if (propError) {
        addToast(`Failed to update address: ${propError.message}`, 'error');
        setSaving(false);
        return;
      }
    }

    const updates = {
      title: form.title,
      price: Number(form.price) || listing.price,
      bedrooms: Number(form.bedrooms),
      bathrooms: Number(form.bathrooms),
      area_sqft: Number(form.area),
      city: form.location,
      location: form.locality,
      description: form.description,
      furnished: form.furnished,
      parking: form.parking,
      amenities: form.amenities,
      nearby_places: form.nearbyPlaces.filter((p) => p.label.trim() && p.distance.trim()),
      images,
      ...(addressChanged ? { latitude: coords?.latitude ?? null, longitude: coords?.longitude ?? null } : {}),
    };

    const { data, error } = await supabase
      .from('listings')
      .update(updates)
      .eq('id', listing.id)
      .select('*, owner:users_public!listings_owner_id_fkey(name, avatar_url, verified_aadhaar), property:properties(address)')
      .single();

    setSaving(false);

    if (error) {
      addToast(`Failed to update listing: ${error.message}`, 'error');
      return;
    }

    // Same single-point narrowing as useListings' toListings: the row is
    // fully schema-checked except nearby_places (json in the DB).
    onSave({ ...data, nearby_places: data.nearby_places as unknown as ListingFromDB['nearby_places'] });
    addToast('Listing updated successfully', 'success');
    onClose();
  };

  if (!listing) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-2xl max-w-lg w-full shadow-xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-white rounded-t-2xl border-b border-black/5 px-6 py-4 flex items-center justify-between z-10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center flex-shrink-0">
              <i className="ri-edit-line text-amber-600" />
            </div>
            <div>
              <h3 className="text-base font-bold text-charcoal">Edit Listing</h3>
              <p className="text-xs text-charcoal/40">Update your property details</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-lightgray transition-colors cursor-pointer"
          >
            <i className="ri-close-line text-charcoal/40" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {/* Title */}
          <div>
            <label className="block text-xs font-semibold text-charcoal/60 uppercase tracking-wide mb-1.5">Property Title</label>
            <input
              type="text"
              required
              value={form.title}
              onChange={(e) => handleChange('title', e.target.value)}
              className="w-full px-4 py-3 bg-offwhite rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-300"
            />
          </div>

          {/* Photos */}
          <div>
            <label className="block text-xs font-semibold text-charcoal/60 uppercase tracking-wide mb-2">Photos</label>
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
              {images.map((url) => (
                <div key={url} className="relative aspect-square rounded-xl overflow-hidden border border-black/10 group">
                  <img src={url} alt="Listing" className="w-full h-full object-cover" />
                  <button
                    type="button"
                    onClick={() => handleRemoveImage(url)}
                    disabled={removingUrl === url}
                    className="absolute top-1 right-1 w-6 h-6 flex items-center justify-center rounded-full bg-black/60 text-white hover:bg-red-500 transition-colors cursor-pointer disabled:opacity-50"
                  >
                    <i className={removingUrl === url ? 'ri-loader-4-line animate-spin text-xs' : 'ri-close-line text-xs'} />
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={() => (hasNativeCamera() ? addFromGallery() : fileInputRef.current?.click())}
                disabled={uploading}
                className="aspect-square rounded-xl border-2 border-dashed border-black/10 flex flex-col items-center justify-center gap-1 text-charcoal/40 hover:border-amber-300 hover:text-amber-600 transition-colors cursor-pointer disabled:opacity-50"
              >
                {uploading ? (
                  <i className="ri-loader-4-line animate-spin text-lg" />
                ) : (
                  <>
                    <i className="ri-image-add-line text-lg" />
                    <span className="text-[10px] font-medium">Add Photos</span>
                  </>
                )}
              </button>
              <button
                type="button"
                onClick={() => (hasNativeCamera() ? addFromCamera() : cameraInputRef.current?.click())}
                disabled={uploading}
                className="aspect-square rounded-xl border-2 border-dashed border-black/10 flex flex-col items-center justify-center gap-1 text-charcoal/40 hover:border-amber-300 hover:text-amber-600 transition-colors cursor-pointer disabled:opacity-50"
              >
                {uploading ? (
                  <i className="ri-loader-4-line animate-spin text-lg" />
                ) : (
                  <>
                    <i className="ri-camera-line text-lg" />
                    <span className="text-[10px] font-medium">Take Photo</span>
                  </>
                )}
              </button>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              multiple
              className="hidden"
              onChange={(e) => handleFilesSelected(e.target.files)}
            />
            <input
              ref={cameraInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              capture="environment"
              className="hidden"
              onChange={(e) => handleFilesSelected(e.target.files)}
            />
            <p className="text-xs text-charcoal/40 mt-1.5">JPG, PNG or WEBP, up to 5MB each</p>
          </div>

          {/* Price + Location */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-charcoal/60 uppercase tracking-wide mb-1.5">Monthly Rent (₹)</label>
              <input
                type="number"
                required
                min={1000}
                value={form.price}
                onChange={(e) => handleChange('price', e.target.value)}
                className="w-full px-4 py-3 bg-offwhite rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-300"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-charcoal/60 uppercase tracking-wide mb-1.5">City</label>
              <select
                required
                value={form.location}
                onChange={(e) => handleChange('location', e.target.value)}
                className="w-full px-4 py-3 bg-offwhite rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-300 cursor-pointer"
              >
                <option value="">Select city</option>
                {cities.map((c) => (
                  <option key={c} value={`${c}`}>{c}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Locality + Full address -- shown here so an owner can actually
              see and correct what they entered at listing creation, which
              previously wasn't displayed anywhere after submission. */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-charcoal/60 uppercase tracking-wide mb-1.5">Locality / Area</label>
              <input
                type="text"
                required
                placeholder="e.g. Koramangala, HSR Layout"
                value={form.locality}
                onChange={(e) => handleChange('locality', e.target.value)}
                className="w-full px-4 py-3 bg-offwhite rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-300"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-charcoal/60 uppercase tracking-wide mb-1.5">Full Address</label>
            <textarea
              required
              rows={3}
              placeholder="Flat/House no., building or society name, street, landmark"
              value={form.fullAddress}
              onChange={(e) => handleChange('fullAddress', e.target.value)}
              className="w-full px-4 py-3 bg-offwhite rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-300 resize-none"
            />
            <p className="text-xs text-charcoal/40 mt-1.5">
              Private to you — never shown to tenants or in search results, only your locality and city are public.
            </p>
          </div>

          {/* Bedrooms + Bathrooms + Area */}
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-charcoal/60 uppercase tracking-wide mb-1.5">BHK</label>
              <select
                required
                value={form.bedrooms}
                onChange={(e) => handleChange('bedrooms', e.target.value)}
                className="w-full px-4 py-3 bg-offwhite rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-300 cursor-pointer"
              >
                <option value="0">Studio</option>
                <option value="1">1 BHK</option>
                <option value="2">2 BHK</option>
                <option value="3">3 BHK</option>
                <option value="4">4 BHK</option>
                <option value="5">5+ BHK</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-charcoal/60 uppercase tracking-wide mb-1.5">Bath</label>
              <select
                required
                value={form.bathrooms}
                onChange={(e) => handleChange('bathrooms', e.target.value)}
                className="w-full px-4 py-3 bg-offwhite rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-300 cursor-pointer"
              >
                <option value="1">1</option>
                <option value="2">2</option>
                <option value="3">3</option>
                <option value="4">4+</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-charcoal/60 uppercase tracking-wide mb-1.5">Area (sqft)</label>
              <input
                type="number"
                required
                min={50}
                value={form.area}
                onChange={(e) => handleChange('area', e.target.value)}
                className="w-full px-4 py-3 bg-offwhite rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-300"
              />
            </div>
          </div>

          {/* Parking */}
          <div>
            <label className="block text-xs font-semibold text-charcoal/60 uppercase tracking-wide mb-1.5">Parking</label>
            <select
              value={form.parking}
              onChange={(e) => handleChange('parking', e.target.value)}
              className="w-full px-4 py-3 bg-offwhite rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-300 cursor-pointer"
            >
              <option value="none">No Parking</option>
              <option value="2-wheeler">2-Wheeler Only</option>
              <option value="4-wheeler">4-Wheeler Only</option>
              <option value="both">Both 2W &amp; 4W</option>
            </select>
          </div>

          {/* Furnished toggle */}
          <div className="flex items-center justify-between p-3 bg-offwhite rounded-xl">
            <div className="flex items-center gap-2">
              <i className="ri-sofa-line text-amber-600 text-sm" />
              <span className="text-sm font-medium text-charcoal">Furnished</span>
            </div>
            <button
              type="button"
              onClick={() => handleChange('furnished', !form.furnished)}
              className={`relative w-11 h-6 rounded-full transition-colors cursor-pointer flex-shrink-0 ${form.furnished ? 'bg-amber-500' : 'bg-gray-200'}`}
            >
              <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform ${form.furnished ? 'translate-x-5' : 'translate-x-0'}`} />
            </button>
          </div>

          {/* Amenities */}
          <div>
            <label className="block text-xs font-semibold text-charcoal/60 uppercase tracking-wide mb-2">Amenities</label>
            <div className="flex flex-wrap gap-2">
              {amenitiesList.map((a) => {
                const active = form.amenities.includes(a.key);
                return (
                  <button
                    key={a.key}
                    type="button"
                    onClick={() => toggleAmenity(a.key)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition cursor-pointer ${
                      active
                        ? 'bg-amber-500 text-white'
                        : 'bg-lightgray text-charcoal/60 hover:bg-gray-200'
                    }`}
                  >
                    <i className={`${a.icon} text-xs`} />
                    {a.key}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Nearby Places */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-xs font-semibold text-charcoal/60 uppercase tracking-wide">Nearby Places <span className="normal-case font-normal text-charcoal/40">(optional)</span></label>
              {form.nearbyPlaces.length < MAX_NEARBY_PLACES && (
                <button
                  type="button"
                  onClick={addNearbyPlace}
                  className="text-xs font-semibold text-brand hover:text-brand-dark cursor-pointer whitespace-nowrap"
                >
                  + Add landmark
                </button>
              )}
            </div>
            {form.nearbyPlaces.length > 0 && (
              <div className="space-y-2">
                {form.nearbyPlaces.map((place, i) => (
                  <div key={i} className="flex gap-2 items-center">
                    <input
                      type="text"
                      value={place.label}
                      onChange={(e) => updateNearbyPlace(i, 'label', e.target.value)}
                      placeholder="e.g. City Hospital"
                      aria-label={`Nearby place ${i + 1} name`}
                      maxLength={60}
                      className="flex-1 border border-black/10 rounded-lg px-3 py-2 text-sm text-charcoal placeholder-charcoal/40 focus:outline-none focus:border-brand transition-colors"
                    />
                    <input
                      type="text"
                      value={place.distance}
                      onChange={(e) => updateNearbyPlace(i, 'distance', e.target.value)}
                      placeholder="e.g. 1.2 km"
                      aria-label={`Nearby place ${i + 1} distance`}
                      maxLength={20}
                      className="w-24 border border-black/10 rounded-lg px-3 py-2 text-sm text-charcoal placeholder-charcoal/40 focus:outline-none focus:border-brand transition-colors"
                    />
                    <button
                      type="button"
                      onClick={() => removeNearbyPlace(i)}
                      aria-label={`Remove nearby place ${i + 1}`}
                      className="w-8 h-8 flex-shrink-0 flex items-center justify-center rounded-lg text-charcoal/40 hover:text-red-500 hover:bg-red-50 transition-colors cursor-pointer"
                    >
                      <i className="ri-close-line" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs font-semibold text-charcoal/60 uppercase tracking-wide mb-1.5">Description</label>
            <textarea
              required
              rows={4}
              maxLength={500}
              value={form.description}
              onChange={(e) => {
                handleChange('description', e.target.value);
                setCharCount(e.target.value.length);
              }}
              className="w-full px-4 py-3 bg-offwhite rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-300 resize-none"
            />
            <p className={`text-xs mt-1 text-right ${charCount >= 500 ? 'text-red-500' : 'text-charcoal/40'}`}>
              {charCount}/500
            </p>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-3 rounded-full border border-black/10 text-sm font-medium text-charcoal/60 hover:bg-lightgray transition-colors cursor-pointer whitespace-nowrap"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || uploading}
              className="flex-1 px-4 py-3 rounded-full bg-amber-500 text-white text-sm font-semibold hover:bg-amber-600 transition-colors cursor-pointer whitespace-nowrap disabled:opacity-50"
            >
              {saving ? (
                <span className="flex items-center justify-center gap-1.5">
                  <i className="ri-loader-4-line animate-spin" /> Saving...
                </span>
              ) : (
                'Save Changes'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
