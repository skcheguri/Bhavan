import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import VerificationSteps from './components/VerificationSteps';
import FaqAccordion from './components/FaqAccordion';
import { useAuth } from '@/hooks/useAuth';
import { getSupabase } from '@/lib/supabase';
import { isValidAadhaarChecksum, isValidAadhaarFormat } from '@/lib/validation';

type Step = 1 | 2 | 3;

async function extractFunctionError(error: unknown): Promise<string> {
  if (error && typeof error === 'object' && 'context' in error) {
    const ctx = (error as { context?: Response }).context;
    if (ctx && typeof ctx.json === 'function') {
      try {
        const body = await ctx.json();
        if (body?.error) return body.error as string;
      } catch {
        // response body wasn't JSON -- fall through to the generic message below
      }
    }
  }
  if (error instanceof Error) return error.message;
  return 'Something went wrong. Please try again.';
}

type VerifyMode = 'otp' | 'ocr' | 'unconfigured' | 'loading';

export default function AadhaarVerify() {
  const { user, loading: authLoading, refreshProfile } = useAuth();

  const [mode, setMode] = useState<VerifyMode>('loading');
  const [otpTestMode, setOtpTestMode] = useState(false);
  const [step, setStep] = useState<Step>(1);
  const [aadhaar, setAadhaar] = useState('');
  const [name, setName] = useState('');
  const [dob, setDob] = useState('');
  const [consent, setConsent] = useState(false);
  const [sendingOtp, setSendingOtp] = useState(false);
  const [sendError, setSendError] = useState('');
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [otpTimer, setOtpTimer] = useState(0);
  const [verifying, setVerifying] = useState(false);
  const [verifyError, setVerifyError] = useState('');
  const [referenceId, setReferenceId] = useState('');
  const [maskedAadhaar, setMaskedAadhaar] = useState('');
  const [verifiedName, setVerifiedName] = useState('');

  // Document-OCR mode state. Front is required (carries name + number);
  // back is optional (address only, which we don't use). Files are held
  // locally for preview and uploaded to the private aadhaar-temp bucket
  // only on submit.
  const [frontFile, setFrontFile] = useState<File | null>(null);
  const [frontPreview, setFrontPreview] = useState('');
  const [backFile, setBackFile] = useState<File | null>(null);
  const [backPreview, setBackPreview] = useState('');
  const [uploadError, setUploadError] = useState('');

  useEffect(() => {
    if (user?.name) setName(user.name);
  }, [user?.name]);

  // Which flow to render is decided by the server (configuration), never
  // guessed here -- so the UI can't offer the weaker OCR path when real
  // OTP e-KYC is configured, or vice versa.
  useEffect(() => {
    const supabase = getSupabase();
    if (!supabase || !user) return;
    supabase.functions
      .invoke('aadhaar-verify', { body: { action: 'config' } })
      .then(({ data }) => {
        setMode((data?.mode as VerifyMode) ?? 'unconfigured');
        setOtpTestMode(Boolean(data?.otpTestMode));
      })
      .catch(() => setMode('unconfigured'));
  }, [user]);

  const formatAadhaar = (val: string) => {
    const digits = val.replace(/\D/g, '').slice(0, 12);
    return digits.replace(/(\d{4})(?=\d)/g, '$1 ').trim();
  };

  const handleAadhaarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setAadhaar(formatAadhaar(e.target.value));
  };

  const rawAadhaar = aadhaar.replace(/\s/g, '');
  const aadhaarValid = isValidAadhaarFormat(rawAadhaar) && isValidAadhaarChecksum(rawAadhaar);

  const startOtpTimer = () => {
    setOtpTimer(60);
    const interval = setInterval(() => {
      setOtpTimer((prev) => {
        if (prev <= 1) { clearInterval(interval); return 0; }
        return prev - 1;
      });
    }, 1000);
  };

  const handleSendOtp = async () => {
    setSendError('');
    if (!consent || !name.trim()) return;
    if (rawAadhaar.length !== 12) { setSendError('Enter your full 12-digit Aadhaar number.'); return; }
    if (!aadhaarValid) { setSendError("That Aadhaar number doesn't look valid — please double-check the digits."); return; }

    const supabase = getSupabase();
    if (!supabase || !user) { setSendError('You must be signed in to verify your Aadhaar.'); return; }

    setSendingOtp(true);
    const { data, error } = await supabase.functions.invoke('aadhaar-verify', {
      body: { action: 'send-otp', aadhaarNumber: rawAadhaar, name: name.trim(), dob },
    });
    setSendingOtp(false);

    if (error || !data || data.error) {
      setSendError(data?.error || (await extractFunctionError(error)));
      return;
    }

    setReferenceId(data.referenceId);
    setMaskedAadhaar(data.maskedAadhaar);
    setOtp(['', '', '', '', '', '']);
    setStep(2);
    startOtpTimer();
  };

  const handleOtpChange = (index: number, value: string) => {
    if (!/^\d*$/.test(value)) return;
    const next = [...otp];
    next[index] = value.slice(-1);
    setOtp(next);
    if (value && index < 5) {
      document.getElementById(`aotp-${index + 1}`)?.focus();
    }
  };

  const handleOtpKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !otp[index] && index > 0) {
      document.getElementById(`aotp-${index - 1}`)?.focus();
    }
  };

  const handleResendOtp = () => {
    handleSendOtp();
  };

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setVerifyError('');
    if (!otp.every((d) => d !== '')) return;

    const supabase = getSupabase();
    if (!supabase) { setVerifyError('Supabase not connected'); return; }

    setVerifying(true);
    const { data, error } = await supabase.functions.invoke('aadhaar-verify', {
      body: { action: 'verify-otp', referenceId, otp: otp.join('') },
    });

    if (error || !data || data.error || !data.success) {
      setVerifying(false);
      setVerifyError(data?.error || (await extractFunctionError(error)));
      return;
    }

    setVerifiedName(data.name || name);
    await refreshProfile();
    setVerifying(false);
    setStep(3);
  };

  const handleCardSelect = (side: 'front' | 'back') => (e: React.ChangeEvent<HTMLInputElement>) => {
    setUploadError('');
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setUploadError('Use a JPG, PNG or WebP photo of your Aadhaar card.');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setUploadError('That image is larger than 5MB. Retake or pick a smaller photo.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result);
      if (side === 'front') { setFrontFile(file); setFrontPreview(result); }
      else { setBackFile(file); setBackPreview(result); }
    };
    reader.readAsDataURL(file);
  };

  const handleVerifyDocument = async () => {
    setUploadError('');
    if (!consent || !name.trim() || !frontFile || !user) return;
    const supabase = getSupabase();
    if (!supabase) { setUploadError('You must be signed in to verify your Aadhaar.'); return; }

    setVerifying(true);

    // Upload to the private aadhaar-temp bucket under our own folder; the
    // function signs these paths for IDfy and deletes them right after.
    const ext = (f: File) => (f.type === 'image/png' ? 'png' : f.type === 'image/webp' ? 'webp' : 'jpg');
    const stamp = Date.now();
    const frontPath = `${user.id}/front-${stamp}.${ext(frontFile)}`;
    const backPath = backFile ? `${user.id}/back-${stamp}.${ext(backFile)}` : '';

    // No upsert: paths are timestamp-unique, and upsert would require an
    // UPDATE policy the bucket deliberately doesn't have.
    const up1 = await supabase.storage.from('aadhaar-temp').upload(frontPath, frontFile);
    if (up1.error) {
      setVerifying(false);
      setUploadError(`Could not upload the front image: ${up1.error.message}`);
      return;
    }
    if (backFile) {
      const up2 = await supabase.storage.from('aadhaar-temp').upload(backPath, backFile);
      if (up2.error) {
        setVerifying(false);
        setUploadError(`Could not upload the back image: ${up2.error.message}`);
        return;
      }
    }

    const { data, error } = await supabase.functions.invoke('aadhaar-verify', {
      body: { action: 'verify-document', frontPath, backPath, name: name.trim() },
    });
    setVerifying(false);

    if (error || !data || data.error || !data.success) {
      setUploadError(data?.error || (await extractFunctionError(error)));
      return;
    }

    setVerifiedName(data.name || name);
    setMaskedAadhaar(data.maskedAadhaar ?? '');
    await refreshProfile();
    setStep(3);
  };

  const otpFilled = otp.every((d) => d !== '');

  if (authLoading) {
    return (
      <div className="min-h-screen bg-offwhite flex items-center justify-center">
        <i className="ri-loader-4-line animate-spin text-3xl text-brand" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-offwhite flex items-center justify-center px-4">
        <div className="bg-white rounded-2xl p-8 border border-black/5 max-w-sm w-full text-center">
          <div className="w-14 h-14 flex items-center justify-center rounded-full bg-brand/10 mx-auto mb-4">
            <i className="ri-shield-user-line text-2xl text-brand" />
          </div>
          <h1 className="text-lg font-bold text-charcoal">Sign in to verify your Aadhaar</h1>
          <p className="mt-2 text-sm text-charcoal/60">Verification is tied to your account, so you'll need to sign in first.</p>
          <Link
            to="/login"
            className="mt-6 inline-flex items-center justify-center w-full bg-brand hover:bg-brand-dark text-white font-medium py-3 rounded-full transition-colors whitespace-nowrap"
          >
            Sign In
          </Link>
        </div>
      </div>
    );
  }

  if (user.verified) {
    return (
      <div className="min-h-screen bg-offwhite flex items-center justify-center px-4">
        <div className="bg-white rounded-2xl p-8 border border-black/5 max-w-sm w-full text-center">
          <div className="w-16 h-16 flex items-center justify-center rounded-full bg-green-50 mx-auto mb-4">
            <i className="ri-checkbox-circle-fill text-4xl text-green-500" />
          </div>
          <h1 className="text-lg font-bold text-charcoal">You're already Aadhaar Verified</h1>
          <p className="mt-2 text-sm text-charcoal/60">
            {user.name} · Aadhaar XXXX XXXX {user.aadhaarLast4 ?? '····'}
          </p>
          <Link
            to="/listings"
            className="mt-6 inline-flex items-center justify-center w-full bg-brand hover:bg-brand-dark text-white font-medium py-3 rounded-full transition-colors whitespace-nowrap"
          >
            Browse Listings
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-offwhite pb-16">
      {/* Breadcrumb */}
      <div className="w-full px-4 md:px-8 lg:px-12 pt-6">
        <div className="max-w-5xl mx-auto">
          <div className="flex items-center gap-2 mb-4">
            <Link to="/" className="text-sm text-charcoal/40 hover:text-brand transition-colors cursor-pointer">Home</Link>
            <i className="ri-arrow-right-s-line text-charcoal/30" />
            <span className="text-sm text-charcoal font-medium">Aadhaar Verification</span>
          </div>
        </div>
      </div>

      {/* Hero Banner */}
      <section className="relative bg-charcoal py-14 md:py-20 overflow-hidden">
        <div className="absolute inset-0">
          <img
            src="/placeholders/photo.svg"
            alt="Aadhaar verification"
            className="w-full h-full object-cover object-top opacity-30"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-charcoal/90 via-charcoal/70 to-charcoal/50" />
        </div>
        <div className="relative z-10 w-full px-4 md:px-8 lg:px-12">
          <div className="max-w-4xl mx-auto text-center">
            <div className="inline-flex items-center gap-2 bg-green-500/20 border border-green-400/40 text-green-300 text-xs font-semibold px-4 py-1.5 rounded-full mb-5">
              <div className="w-4 h-4 flex items-center justify-center">
                <i className="ri-shield-check-line" />
              </div>
              {mode === 'ocr' ? 'Secure document verification' : 'Powered by UIDAI Aadhaar OTP'}
            </div>
            <h1 className="text-3xl md:text-5xl font-bold text-white leading-tight">
              Aadhaar Verification
            </h1>
            <p className="mt-4 text-white/70 text-base md:text-lg max-w-2xl mx-auto leading-relaxed">
              Verify your identity with Aadhaar to list properties and build trust — your verified name appears on the rental agreements and receipts you generate.
            </p>
            <div className="mt-6 flex flex-wrap justify-center gap-6 text-sm text-white/60">
              <span className="flex items-center gap-1.5">
                <div className="w-4 h-4 flex items-center justify-center">
                  <i className="ri-lock-line text-green-400" />
                </div>
                No Aadhaar data stored
              </span>
              <span className="flex items-center gap-1.5">
                <div className="w-4 h-4 flex items-center justify-center">
                  <i className="ri-time-line text-green-400" />
                </div>
                Instant verification
              </span>
              <span className="flex items-center gap-1.5">
                <div className="w-4 h-4 flex items-center justify-center">
                  <i className="ri-forbid-line text-green-400" />
                </div>
                Brokers blocked
              </span>
            </div>
          </div>
        </div>
      </section>

      <div className="w-full px-4 md:px-8 lg:px-12 mt-10">
        <div className="max-w-5xl mx-auto grid grid-cols-1 lg:grid-cols-5 gap-8">

          {/* Left: Verification Form */}
          <div className="lg:col-span-3">
            <div className="bg-white rounded-3xl border border-black/5 p-6 md:p-8">
              <VerificationSteps currentStep={step} mode={mode === 'ocr' ? 'ocr' : 'otp'} />

              {step === 1 && mode === 'loading' && (
                <div className="py-10 text-center text-sm text-charcoal/40">
                  <i className="ri-loader-4-line animate-spin text-2xl text-brand" />
                  <p className="mt-3">Preparing verification…</p>
                </div>
              )}

              {step === 1 && mode === 'unconfigured' && (
                <div className="py-8 text-center">
                  <div className="w-14 h-14 rounded-full bg-amber-50 flex items-center justify-center mx-auto">
                    <i className="ri-tools-line text-amber-500 text-2xl" />
                  </div>
                  <h2 className="mt-4 text-lg font-bold text-charcoal">Verification is being set up</h2>
                  <p className="mt-2 text-sm text-charcoal/60 max-w-xs mx-auto">
                    Aadhaar verification isn&apos;t available just yet. Please check back shortly.
                  </p>
                </div>
              )}

              {/* Step 1 (OCR mode): Upload Aadhaar card */}
              {step === 1 && mode === 'ocr' && (
                <div>
                  <h2 className="text-xl font-bold text-charcoal mb-1">Verify with your Aadhaar card</h2>
                  <p className="text-sm text-charcoal/60 mb-6">
                    Upload a clear photo of the front of your Aadhaar card. We read the details, confirm the name
                    matches your profile, and keep only the last 4 digits.
                  </p>

                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-charcoal mb-1.5">Full Name (as on Aadhaar)</label>
                      <input
                        type="text"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        className="w-full px-4 py-3 bg-lightgray rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand/30"
                        placeholder="e.g. Rajesh Kumar"
                      />
                      <p className="mt-1 text-xs text-charcoal/40">Must match the name printed on the card.</p>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-charcoal mb-1.5">Aadhaar Card Photo</label>
                      <div className="grid grid-cols-2 gap-3">
                        {/* Front (required) */}
                        {frontPreview ? (
                          <div className="relative rounded-xl overflow-hidden border border-black/10">
                            <img src={frontPreview} alt="Aadhaar front" className="w-full h-32 object-contain bg-lightgray" />
                            <button
                              type="button"
                              onClick={() => { setFrontFile(null); setFrontPreview(''); }}
                              className="absolute top-1.5 right-1.5 w-7 h-7 rounded-full bg-black/60 text-white flex items-center justify-center cursor-pointer hover:bg-black/80"
                            >
                              <i className="ri-close-line text-sm" />
                            </button>
                            <span className="absolute bottom-1.5 left-1.5 text-[10px] font-semibold text-white bg-black/50 px-1.5 py-0.5 rounded">Front</span>
                          </div>
                        ) : (
                          <label className="flex flex-col items-center justify-center gap-1.5 border-2 border-dashed border-black/15 rounded-xl h-32 cursor-pointer hover:border-brand/40 transition-colors">
                            <i className="ri-camera-line text-xl text-charcoal/40" />
                            <span className="text-xs font-medium text-charcoal/70">Front <span className="text-red-500">*</span></span>
                            <span className="text-[10px] text-charcoal/40">Required</span>
                            <input type="file" accept="image/jpeg,image/png,image/webp" capture="environment" onChange={handleCardSelect('front')} className="hidden" />
                          </label>
                        )}

                        {/* Back (optional) */}
                        {backPreview ? (
                          <div className="relative rounded-xl overflow-hidden border border-black/10">
                            <img src={backPreview} alt="Aadhaar back" className="w-full h-32 object-contain bg-lightgray" />
                            <button
                              type="button"
                              onClick={() => { setBackFile(null); setBackPreview(''); }}
                              className="absolute top-1.5 right-1.5 w-7 h-7 rounded-full bg-black/60 text-white flex items-center justify-center cursor-pointer hover:bg-black/80"
                            >
                              <i className="ri-close-line text-sm" />
                            </button>
                            <span className="absolute bottom-1.5 left-1.5 text-[10px] font-semibold text-white bg-black/50 px-1.5 py-0.5 rounded">Back</span>
                          </div>
                        ) : (
                          <label className="flex flex-col items-center justify-center gap-1.5 border-2 border-dashed border-black/15 rounded-xl h-32 cursor-pointer hover:border-brand/40 transition-colors">
                            <i className="ri-camera-line text-xl text-charcoal/40" />
                            <span className="text-xs font-medium text-charcoal/70">Back</span>
                            <span className="text-[10px] text-charcoal/40">Optional</span>
                            <input type="file" accept="image/jpeg,image/png,image/webp" capture="environment" onChange={handleCardSelect('back')} className="hidden" />
                          </label>
                        )}
                      </div>
                      <p className="mt-1.5 text-xs text-charcoal/40">JPG, PNG or WebP · up to 5MB each. The front is enough — your name and Aadhaar number are read from it.</p>
                    </div>

                    <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                      <div className="flex items-start gap-3">
                        <i className="ri-information-line text-amber-600 mt-0.5" />
                        <p className="text-xs text-amber-700 leading-relaxed">
                          Your full Aadhaar number is <strong>never stored</strong> — only the last 4 digits are saved for display.
                          The photo is sent to our verification partner to read the card and is not retained by Bhavan.
                        </p>
                      </div>
                    </div>

                    <label className="flex items-start gap-2.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={consent}
                        onChange={(e) => setConsent(e.target.checked)}
                        className="w-4 h-4 mt-0.5 rounded border-black/15 text-brand focus:ring-brand"
                      />
                      <span className="text-sm text-charcoal/70 leading-relaxed">
                        I confirm this is my own Aadhaar card and consent to Bhavan verifying it. I am{' '}
                        <strong className="text-charcoal">not a real estate broker or agent</strong>.
                      </span>
                    </label>

                    {uploadError && <p className="text-xs text-red-500 font-medium">{uploadError}</p>}

                    <button
                      type="button"
                      onClick={handleVerifyDocument}
                      disabled={!frontFile || !consent || !name.trim() || verifying}
                      className="w-full bg-brand text-white font-medium py-3.5 rounded-full hover:bg-brand-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer whitespace-nowrap flex items-center justify-center gap-2"
                    >
                      {verifying ? (
                        <><i className="ri-loader-4-line animate-spin" /> Verifying your card…</>
                      ) : (
                        <><i className="ri-shield-check-line" /> Verify &amp; Activate Badge</>
                      )}
                    </button>
                  </div>
                </div>
              )}

              {/* Step 1 (OTP mode): Enter Aadhaar */}
              {step === 1 && mode === 'otp' && (
                <div>
                  <h2 className="text-xl font-bold text-charcoal mb-1">Enter Your Aadhaar Details</h2>
                  <p className="text-sm text-charcoal/60 mb-6">
                    An OTP will be sent to the mobile number linked with your Aadhaar card.
                  </p>

                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-charcoal mb-1.5">
                        Full Name (as on Aadhaar)
                      </label>
                      <input
                        type="text"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        className="w-full px-4 py-3 bg-lightgray rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand/30"
                        placeholder="e.g. Rajesh Kumar"
                      />
                      <p className="mt-1 text-xs text-charcoal/40">
                        This name will appear on your profile and rental agreements.
                      </p>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-charcoal mb-1.5">
                        Date of Birth
                      </label>
                      <input
                        type="date"
                        value={dob}
                        onChange={(e) => setDob(e.target.value)}
                        className="w-full px-4 py-3 bg-lightgray rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand/30"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-charcoal mb-1.5">
                        Aadhaar Number
                      </label>
                      <div className="relative">
                        <div className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 flex items-center justify-center">
                          <i className="ri-id-card-line text-charcoal/40" />
                        </div>
                        <input
                          type="text"
                          value={aadhaar}
                          onChange={handleAadhaarChange}
                          className="w-full pl-10 pr-4 py-3 bg-lightgray rounded-xl text-sm font-mono tracking-widest focus:outline-none focus:ring-2 focus:ring-brand/30"
                          placeholder="XXXX XXXX XXXX"
                          maxLength={14}
                        />
                      </div>
                      <p className="mt-1 text-xs text-charcoal/40">
                        12-digit Aadhaar number — spaces added automatically.
                      </p>
                    </div>

                    {/* Security Notice */}
                    <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                      <div className="flex items-start gap-3">
                        <div className="w-5 h-5 flex items-center justify-center flex-shrink-0 mt-0.5">
                          <i className="ri-information-line text-amber-600" />
                        </div>
                        <div>
                          <p className="text-xs font-semibold text-amber-800 mb-1">Why we need this</p>
                          <p className="text-xs text-amber-700 leading-relaxed">
                            Aadhaar verification ensures only genuine renters and owners use Bhavan. Your full Aadhaar number is <strong>never stored</strong> — only the last 4 digits are saved for display. Rental agreements will be executed in your Aadhaar-verified name to prevent broker misuse.
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Anti-broker notice */}
                    <div className="bg-red-50 border border-red-200 rounded-xl p-4">
                      <div className="flex items-start gap-3">
                        <div className="w-5 h-5 flex items-center justify-center flex-shrink-0 mt-0.5">
                          <i className="ri-forbid-2-line text-red-500" />
                        </div>
                        <div>
                          <p className="text-xs font-semibold text-red-700 mb-1">Strict Anti-Broker Policy</p>
                          <p className="text-xs text-red-600 leading-relaxed">
                            Rental agreements on Bhavan must be signed in the same name as the Aadhaar-verified account. Brokers, agents, and middlemen are permanently banned. Any attempt to misuse another person&apos;s identity will result in immediate account termination.
                          </p>
                        </div>
                      </div>
                    </div>

                    <label className="flex items-start gap-2.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={consent}
                        onChange={(e) => setConsent(e.target.checked)}
                        className="w-4 h-4 mt-0.5 rounded border-black/15 text-brand focus:ring-brand"
                      />
                      <span className="text-sm text-charcoal/70 leading-relaxed">
                        I consent to Aadhaar-based OTP verification as per UIDAI guidelines. I confirm I am the genuine owner of this Aadhaar number and am <strong className="text-charcoal">not a real estate broker or agent</strong>.
                      </span>
                    </label>

                    {sendError && <p className="text-xs text-red-500 font-medium">{sendError}</p>}

                    <button
                      type="button"
                      onClick={handleSendOtp}
                      disabled={rawAadhaar.length < 12 || !consent || !name.trim() || sendingOtp}
                      className="w-full bg-brand text-white font-medium py-3.5 rounded-full hover:bg-brand-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer whitespace-nowrap flex items-center justify-center gap-2"
                    >
                      {sendingOtp ? (
                        <>
                          <div className="w-4 h-4 flex items-center justify-center">
                            <i className="ri-loader-4-line animate-spin" />
                          </div>
                          Sending OTP to linked mobile...
                        </>
                      ) : (
                        <>
                          <div className="w-4 h-4 flex items-center justify-center">
                            <i className="ri-send-plane-line" />
                          </div>
                          Send OTP to Aadhaar-linked Mobile
                        </>
                      )}
                    </button>
                  </div>
                </div>
              )}

              {/* Step 2: OTP Verification */}
              {step === 2 && (
                <form onSubmit={handleVerify}>
                  <h2 className="text-xl font-bold text-charcoal mb-1">Enter OTP</h2>
                  <p className="text-sm text-charcoal/60 mb-2">
                    A 6-digit OTP has been sent to the mobile number linked with Aadhaar{' '}
                    <strong className="text-charcoal font-mono">{maskedAadhaar}</strong>
                  </p>
                  <button
                    type="button"
                    onClick={() => { setStep(1); setOtp(['', '', '', '', '', '']); }}
                    className="text-xs text-brand hover:text-brand-dark font-medium cursor-pointer mb-6"
                  >
                    Change Aadhaar number
                  </button>

                  <div className="space-y-5">
                    {otpTestMode && (
                      <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-2.5 flex items-center gap-2">
                        <i className="ri-flask-line text-amber-600" />
                        <p className="text-xs text-amber-700">
                          <strong>Test environment:</strong> no real OTP is sent — enter the test code your team configured (default <span className="font-mono font-semibold">123456</span>).
                        </p>
                      </div>
                    )}
                    <div>
                      <label className="block text-sm font-medium text-charcoal mb-3">6-Digit OTP</label>
                      <div className="flex gap-2 justify-between">
                        {otp.map((digit, i) => (
                          <input
                            key={i}
                            id={`aotp-${i}`}
                            type="text"
                            inputMode="numeric"
                            maxLength={1}
                            value={digit}
                            onChange={(e) => handleOtpChange(i, e.target.value)}
                            onKeyDown={(e) => handleOtpKeyDown(i, e)}
                            className="w-12 h-14 text-center bg-lightgray rounded-xl text-lg font-bold text-charcoal focus:outline-none focus:ring-2 focus:ring-brand/40"
                          />
                        ))}
                      </div>
                      <div className="mt-3 flex items-center justify-between">
                        <span className="text-xs text-charcoal/40">
                          {otpTimer > 0 ? `Resend OTP in ${otpTimer}s` : ''}
                        </span>
                        {otpTimer === 0 && (
                          <button
                            type="button"
                            onClick={handleResendOtp}
                            className="text-xs text-brand hover:text-brand-dark font-medium cursor-pointer"
                          >
                            Resend OTP
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="bg-green-50 border border-green-200 rounded-xl p-4">
                      <div className="flex items-start gap-3">
                        <div className="w-5 h-5 flex items-center justify-center flex-shrink-0 mt-0.5">
                          <i className="ri-shield-check-line text-green-600" />
                        </div>
                        <p className="text-xs text-green-700 leading-relaxed">
                          This OTP was sent by UIDAI to your Aadhaar-linked mobile. Bhavan does not have access to your mobile number — the OTP is generated directly by UIDAI servers.
                        </p>
                      </div>
                    </div>

                    {verifyError && <p className="text-xs text-red-500 font-medium">{verifyError}</p>}

                    <button
                      type="submit"
                      disabled={!otpFilled || verifying}
                      className="w-full bg-brand text-white font-medium py-3.5 rounded-full hover:bg-brand-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer whitespace-nowrap flex items-center justify-center gap-2"
                    >
                      {verifying ? (
                        <>
                          <div className="w-4 h-4 flex items-center justify-center">
                            <i className="ri-loader-4-line animate-spin" />
                          </div>
                          Verifying with UIDAI...
                        </>
                      ) : (
                        <>
                          <div className="w-4 h-4 flex items-center justify-center">
                            <i className="ri-shield-check-line" />
                          </div>
                          Verify &amp; Activate Badge
                        </>
                      )}
                    </button>
                  </div>
                </form>
              )}

              {/* Step 3: Success */}
              {step === 3 && (
                <div className="text-center py-4">
                  <div className="w-20 h-20 mx-auto rounded-full bg-green-100 flex items-center justify-center mb-5">
                    <div className="w-10 h-10 flex items-center justify-center">
                      <i className="ri-checkbox-circle-fill text-green-500 text-4xl" />
                    </div>
                  </div>
                  <h2 className="text-2xl font-bold text-charcoal">Aadhaar Verified!</h2>
                  <p className="mt-2 text-charcoal/60 text-sm max-w-xs mx-auto">
                    Your identity has been verified. Your profile now shows the{' '}
                    <strong className="text-green-600">Aadhaar Verified</strong> badge.
                  </p>

                  <div className="mt-6 bg-green-50 border border-green-200 rounded-2xl p-5 text-left">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="w-12 h-12 rounded-full bg-green-500 flex items-center justify-center flex-shrink-0">
                        <div className="w-6 h-6 flex items-center justify-center">
                          <i className="ri-user-line text-white text-lg" />
                        </div>
                      </div>
                      <div>
                        <p className="font-semibold text-charcoal">{verifiedName || name || 'Verified User'}</p>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <div className="w-4 h-4 flex items-center justify-center">
                            <i className="ri-shield-check-fill text-green-500 text-xs" />
                          </div>
                          <span className="text-xs font-semibold text-green-600">Aadhaar Verified</span>
                        </div>
                      </div>
                    </div>
                    <div className="space-y-2 text-sm text-charcoal/70">
                      <div className="flex items-center gap-2">
                        <div className="w-4 h-4 flex items-center justify-center">
                          <i className="ri-check-line text-green-500 text-xs" />
                        </div>
                        Can contact property owners directly
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="w-4 h-4 flex items-center justify-center">
                          <i className="ri-check-line text-green-500 text-xs" />
                        </div>
                        Rental agreements in your verified name
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="w-4 h-4 flex items-center justify-center">
                          <i className="ri-check-line text-green-500 text-xs" />
                        </div>
                        Trusted badge visible to all owners
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="w-4 h-4 flex items-center justify-center">
                          <i className="ri-check-line text-green-500 text-xs" />
                        </div>
                        Priority listing access
                      </div>
                    </div>
                  </div>

                  <div className="mt-6 flex flex-col sm:flex-row gap-3">
                    <Link
                      to="/listings"
                      className="flex-1 bg-brand text-white font-medium py-3 rounded-full hover:bg-brand-dark transition-colors text-center whitespace-nowrap"
                    >
                      Browse Listings
                    </Link>
                    <Link
                      to="/"
                      className="flex-1 bg-lightgray text-charcoal font-medium py-3 rounded-full hover:bg-gray-200 transition-colors text-center whitespace-nowrap"
                    >
                      Go to Home
                    </Link>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Right: Info Panel */}
          <div className="lg:col-span-2 space-y-5">
            {/* Why Verify */}
            <div className="bg-white rounded-3xl border border-black/5 p-6">
              <h3 className="font-bold text-charcoal mb-4 flex items-center gap-2">
                <div className="w-5 h-5 flex items-center justify-center">
                  <i className="ri-shield-star-line text-brand" />
                </div>
                Why Verify with Aadhaar?
              </h3>
              <div className="space-y-3">
                {[
                  { icon: 'ri-user-follow-line', color: 'text-green-600 bg-green-50', title: 'Real Identity', desc: 'Only genuine individuals — no fake accounts or brokers' },
                  { icon: 'ri-file-text-line', color: 'text-brand bg-brand/10', title: 'Agreement in Your Name', desc: 'Rental agreements must match your Aadhaar name — no middlemen' },
                  { icon: 'ri-lock-password-line', color: 'text-amber-600 bg-amber-50', title: 'Secure & Private', desc: 'Full Aadhaar number never stored — only last 4 digits shown' },
                  { icon: 'ri-forbid-2-line', color: 'text-red-500 bg-red-50', title: 'Brokers Blocked', desc: 'Verified users only — brokers and agents permanently banned' },
                ].map((item) => (
                  <div key={item.title} className="flex items-start gap-3">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${item.color}`}>
                      <div className="w-4 h-4 flex items-center justify-center">
                        <i className={`${item.icon} text-sm`} />
                      </div>
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-charcoal">{item.title}</p>
                      <p className="text-xs text-charcoal/60 mt-0.5">{item.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Verified Badge Preview */}
            <div className="bg-white rounded-3xl border border-black/5 p-6">
              <h3 className="font-bold text-charcoal mb-4 flex items-center gap-2">
                <div className="w-5 h-5 flex items-center justify-center">
                  <i className="ri-award-line text-brand" />
                </div>
                Your Verified Badge
              </h3>
              <div className="bg-gradient-to-br from-green-50 to-emerald-50 border border-green-200 rounded-xl p-4">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-full bg-green-500 flex items-center justify-center">
                    <div className="w-6 h-6 flex items-center justify-center">
                      <i className="ri-user-line text-white text-lg" />
                    </div>
                  </div>
                  <div>
                    <p className="font-semibold text-charcoal text-sm">{name || 'Your Name'}</p>
                    <div className="flex items-center gap-1 mt-0.5">
                      <div className="w-4 h-4 flex items-center justify-center">
                        <i className="ri-shield-check-fill text-green-500 text-xs" />
                      </div>
                      <span className="text-xs font-bold text-green-600">Aadhaar Verified</span>
                    </div>
                    <p className="text-xs text-charcoal/40 mt-0.5">Aadhaar: XXXX XXXX {rawAadhaar.length >= 12 ? rawAadhaar.slice(8, 12) : '????'}</p>
                  </div>
                </div>
              </div>
              <p className="mt-3 text-xs text-charcoal/60 leading-relaxed">
                This badge appears on your profile, listings, and all rental agreements — building trust with owners and renters.
              </p>
            </div>

            {/* FAQ */}
            <div className="bg-white rounded-3xl border border-black/5 p-6">
              <h3 className="font-bold text-charcoal mb-4 flex items-center gap-2">
                <div className="w-5 h-5 flex items-center justify-center">
                  <i className="ri-question-line text-brand" />
                </div>
                Frequently Asked Questions
              </h3>
              <FaqAccordion />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
