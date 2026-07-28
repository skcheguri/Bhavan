import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
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

export default function AadhaarVerify() {
  const { user, loading: authLoading, refreshProfile } = useAuth();

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

  useEffect(() => {
    if (user?.name) setName(user.name);
  }, [user?.name]);

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
              Powered by UIDAI Aadhaar OTP
            </div>
            <h1 className="text-3xl md:text-5xl font-bold text-white leading-tight">
              Aadhaar Verification
            </h1>
            <p className="mt-4 text-white/70 text-base md:text-lg max-w-2xl mx-auto leading-relaxed">
              Verify your identity with Aadhaar to unlock full access — contact owners, list properties, and sign rental agreements in your verified name.
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
              <VerificationSteps currentStep={step} />

              {/* Step 1: Enter Aadhaar */}
              {step === 1 && (
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
