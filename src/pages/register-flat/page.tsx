import { useState, useRef } from 'react';
import { Link, useNavigate } from 'react-router';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/useToast';
import { useProperties } from '@/hooks/useProperties';
import { getSupabase } from '@/lib/supabase';
import { Shell, PageTitle, Notice, Field, inputCls } from '@/pages/society/ui';

/**
 * Registering a flat you live in.
 *
 * Until now every property record in Bhavan was born inside the listing
 * flow, which meant proving you own a flat and offering it for rent were
 * the same action. Since joining a society requires a verified property,
 * an owner who simply lives in their own flat had to advertise their
 * home to the whole platform to get into their building's group -- or
 * give up. Neither is a real choice, and it is why self_occupied was
 * mostly unreachable.
 *
 * So: the same ownership check, the same document queue, the same
 * reviewers, without a listing at the end of it. The property lands as
 * occupancy = 'self_occupied' rather than the vacant a listing implies.
 *
 * No photos, no rent, no amenities. Those exist to sell a flat to a
 * stranger, and there is no stranger here.
 */

const DOC_TYPES = [
  { icon: 'ri-file-text-line', label: 'Property Registration Deed', value: 'registration-deed' },
  { icon: 'ri-file-paper-2-line', label: 'Sale Deed / Title Deed', value: 'sale-deed' },
  { icon: 'ri-government-line', label: 'Municipal Tax Receipt', value: 'tax-receipt' },
  { icon: 'ri-flashlight-line', label: 'Electricity Bill (Owner Name)', value: 'electricity-bill' },
];

export default function RegisterFlat() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { addToast } = useToast();
  const { properties, refresh } = useProperties(user?.id);

  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [docType, setDocType] = useState('');
  const [docPath, setDocPath] = useState('');
  const [docName, setDocName] = useState('');
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  if (!user) {
    return (
      <Shell>
        <PageTitle title="Add a flat you own" />
        <Notice tone="info" icon="ri-user-line" title="Sign in first">
          <Link to="/login" className="font-semibold underline">
            Sign in
          </Link>{' '}
          to register a property.
        </Notice>
      </Shell>
    );
  }

  // Same bucket and path shape as the listing flow, so both kinds of
  // submission land in one place for the reviewer.
  const upload = async (file: File) => {
    const supabase = getSupabase();
    if (!supabase || !docType) return;

    setUploading(true);
    const path = `${user.id}/${docType}/${Date.now()}-${file.name}`;
    const { error } = await supabase.storage.from('ownership-documents').upload(path, file);
    setUploading(false);

    if (error) {
      addToast(`Upload failed: ${error.message}`, 'error');
      return;
    }
    setDocPath(path);
    setDocName(file.name);
  };

  const removeDoc = async () => {
    const supabase = getSupabase();
    if (supabase && docPath) await supabase.storage.from('ownership-documents').remove([docPath]);
    setDocPath('');
    setDocName('');
  };

  const submit = async () => {
    const supabase = getSupabase();
    if (!supabase) {
      addToast('Database connection unavailable', 'error');
      return;
    }

    setSaving(true);
    const { error } = await supabase.from('properties').insert({
      owner_id: user.id,
      name: name.trim(),
      address: address.trim(),
      city: city.trim() || null,
      state: state.trim() || null,
      verified: false,
      verification_doc_url: docPath,
      // The whole point of this entry point. A property created by the
      // listing flow is on the market; one created here is a home.
      occupancy: 'self_occupied',
    });
    setSaving(false);

    if (error) {
      addToast(error.message, 'error');
      return;
    }
    await refresh();
    setDone(true);
  };

  const ready = name.trim() && address.trim() && docType && docPath;

  if (done) {
    return (
      <Shell>
        <PageTitle title="Sent for review" />
        <Notice tone="success" icon="ri-check-line" title="We have your document">
          <p>
            Our team checks the name on it against your profile. This usually takes a day or two,
            and you will get a notification either way. Once it is approved you can join your
            society with its code.
          </p>
          <div className="flex flex-wrap gap-2 mt-3">
            <Link
              to="/society"
              className="px-4 py-2 bg-charcoal text-white rounded-lg text-sm font-semibold"
            >
              Go to My Society
            </Link>
            <button
              onClick={() => navigate('/owner-profile')}
              className="px-4 py-2 border border-gray-200 bg-white text-charcoal rounded-lg text-sm font-semibold"
            >
              Back to my profile
            </button>
          </div>
        </Notice>
      </Shell>
    );
  }

  const awaitingReview = properties.filter((p) => !p.verified);

  return (
    <Shell>
      <PageTitle
        title="Add a flat you own"
        subtitle="For a flat you live in. Nothing here is advertised or shown to anyone looking to rent."
      />

      {awaitingReview.length > 0 && (
        <div className="mb-6">
          <Notice tone="info" icon="ri-time-line" title="Already waiting on us">
            {awaitingReview.length === 1
              ? `${awaitingReview[0].name} is with our team for review.`
              : `${awaitingReview.length} of your properties are with our team for review.`}{' '}
            You can still add another.
          </Notice>
        </div>
      )}

      <div className="bg-white rounded-2xl border border-black/5 p-5 sm:p-6 space-y-5">
        <Field label="What do you call it?">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Flat 402, Satyam Towers"
            className={inputCls}
          />
        </Field>

        <Field label="Address">
          <textarea
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            rows={3}
            placeholder="Building, street, area"
            className={inputCls}
          />
        </Field>

        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="City">
            <input value={city} onChange={(e) => setCity(e.target.value)} className={inputCls} />
          </Field>
          <Field label="State">
            <input value={state} onChange={(e) => setState(e.target.value)} className={inputCls} />
          </Field>
        </div>

        <div className="pt-2 border-t border-black/5">
          <p className="text-sm font-semibold text-charcoal mb-1">Prove it is yours</p>
          <p className="text-xs text-charcoal/60 mb-3">
            The name on the document has to match the name on your profile. Only our review team
            sees it.
          </p>

          <div className="grid grid-cols-2 gap-2 mb-4">
            {DOC_TYPES.map((doc) => (
              <button
                key={doc.value}
                type="button"
                onClick={() => setDocType(doc.value)}
                className={`flex items-center gap-2 p-3 rounded-xl border text-left transition-colors ${
                  docType === doc.value
                    ? 'border-brand bg-brand/5'
                    : 'border-gray-200 hover:border-brand/40'
                }`}
              >
                <i className={`${doc.icon} text-lg flex-shrink-0 text-charcoal/60`} />
                <span className="text-xs font-medium text-charcoal">{doc.label}</span>
              </button>
            ))}
          </div>

          {docPath ? (
            <div className="flex items-center justify-between gap-3 p-3 bg-green-50 rounded-xl">
              <p className="text-sm text-green-900 truncate">
                <i className="ri-file-check-line mr-1.5" />
                {docName}
              </p>
              <button
                onClick={() => void removeDoc()}
                className="text-xs font-semibold text-green-900 underline flex-shrink-0"
              >
                Replace
              </button>
            </div>
          ) : (
            <button
              type="button"
              disabled={!docType || uploading}
              onClick={() => fileRef.current?.click()}
              className={`w-full p-5 rounded-xl border-2 border-dashed text-sm ${
                docType
                  ? 'border-gray-200 text-charcoal/60 hover:border-brand/40 hover:bg-brand/5'
                  : 'border-gray-100 text-charcoal/30 cursor-not-allowed'
              }`}
            >
              {uploading ? (
                <>
                  <i className="ri-loader-4-line animate-spin mr-1.5" />
                  Uploading…
                </>
              ) : docType ? (
                <>
                  <i className="ri-upload-2-line mr-1.5" />
                  Upload the document
                </>
              ) : (
                'Pick a document type first'
              )}
            </button>
          )}

          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,application/pdf"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (file) void upload(file);
            }}
          />
        </div>

        <button
          onClick={() => void submit()}
          disabled={!ready || saving}
          className="w-full py-3 bg-charcoal text-white rounded-lg text-sm font-semibold disabled:opacity-40"
        >
          {saving ? 'Sending…' : 'Send for review'}
        </button>
      </div>

      <p className="text-xs text-charcoal/50 mt-4">
        Renting this flat out instead?{' '}
        <Link to="/list-property" className="font-semibold underline">
          List it
        </Link>{' '}
        — that covers ownership at the same time.
      </p>
    </Shell>
  );
}
