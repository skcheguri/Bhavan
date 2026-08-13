import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router';
import { useAuth } from '@/hooks/useAuth';
import { isValidName, isValidRawIndianMobile } from '@/lib/validation';

type AuthTab = 'email' | 'mobile';
type ForgotStep = 'email' | 'sent';

export default function Signup() {
  const [tab, setTab] = useState<AuthTab>('email');
  const { signUp, signInWithGoogle, sendPhoneOtp, verifyPhoneOtp, sendPasswordResetEmail, user } = useAuth();
  const navigate = useNavigate();

  // Email signup state
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('renter');
  const [showPassword, setShowPassword] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [notBroker, setNotBroker] = useState(false);
  const [signupLoading, setSignupLoading] = useState(false);
  const [signupError, setSignupError] = useState('');
  const [nameError, setNameError] = useState('');

  // Google sign-up state
  const [googleError, setGoogleError] = useState('');
  const [googleLoading, setGoogleLoading] = useState(false);

  const handleGoogleSignUp = async () => {
    setGoogleError('');
    setGoogleLoading(true);
    const mappedRole = role === 'renter' ? 'tenant' : 'owner';
    const { error } = await signInWithGoogle(mappedRole);
    if (error) {
      setGoogleError(error);
      setGoogleLoading(false);
    }
    // On success: on web the page redirects to Google immediately; on native
    // the consent opens in a Custom Tab and /auth/callback picks up the
    // session via a deep link. Either way nothing more to do here.
  };

  // Native only: if the user dismisses the Google Custom Tab without
  // finishing, no deep link arrives, so reset the button rather than leave
  // it spinning "Connecting to Google..." forever.
  useEffect(() => {
    const reset = () => setGoogleLoading(false);
    window.addEventListener('bhavan:oauth-browser-closed', reset);
    return () => window.removeEventListener('bhavan:oauth-browser-closed', reset);
  }, []);

  // Mobile OTP state
  const [mobileName, setMobileName] = useState('');
  const [mobileRole, setMobileRole] = useState('renter');
  const [mobile, setMobile] = useState('');
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [otpSent, setOtpSent] = useState(false);
  const [otpTimer, setOtpTimer] = useState(0);
  const [sendingOtp, setSendingOtp] = useState(false);
  const [mobileAgreed, setMobileAgreed] = useState(false);
  const [mobileNotBroker, setMobileNotBroker] = useState(false);

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSignupError('');
    if (!isValidName(name)) {
      setNameError('Name can only contain letters and spaces.');
      return;
    }
    setNameError('');
    setSignupLoading(true);
    const mappedRole = role === 'renter' ? 'tenant' : 'owner';
    const { error } = await signUp(email, password, name.trim(), mappedRole as 'tenant' | 'owner');
    setSignupLoading(false);
    if (error) {
      setSignupError(error);
    }
  };

  const handleSendOtp = async () => {
    if (mobile.length < 10 || !mobileName.trim()) return;
    if (!isValidRawIndianMobile(mobile)) {
      setSignupError('Enter a valid 10-digit Indian mobile number.');
      return;
    }
    setSignupError('');
    setSendingOtp(true);
    const mappedRole = role === 'renter' ? 'tenant' : 'owner';
    const { error } = await sendPhoneOtp(`+91${mobile}`, mobileName.trim(), mappedRole);
    setSendingOtp(false);
    if (error) {
      setSignupError(error);
      return;
    }
    setOtpSent(true);
    setOtpTimer(30);
    const interval = setInterval(() => {
      setOtpTimer((prev) => {
        if (prev <= 1) { clearInterval(interval); return 0; }
        return prev - 1;
      });
    }, 1000);
  };

  const handleOtpChange = (index: number, value: string) => {
    if (!/^\d*$/.test(value)) return;
    const next = [...otp];
    next[index] = value.slice(-1);
    setOtp(next);
    if (value && index < 5) {
      document.getElementById(`sotp-${index + 1}`)?.focus();
    }
  };

  const handleOtpKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !otp[index] && index > 0) {
      document.getElementById(`sotp-${index - 1}`)?.focus();
    }
  };

  const handleOtpSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSignupError('');
    setSignupLoading(true);
    const { error } = await verifyPhoneOtp(`+91${mobile}`, otp.join(''));
    setSignupLoading(false);
    if (error) {
      setSignupError(error);
    }
  };

  const otpFilled = otp.every((d) => d !== '');

  // Forgot password modal state
  const [showForgot, setShowForgot] = useState(false);
  const [forgotStep, setForgotStep] = useState<ForgotStep>('email');
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotResendTimer, setForgotResendTimer] = useState(0);
  const [forgotSending, setForgotSending] = useState(false);
  const [forgotError, setForgotError] = useState('');

  // Redirect when logged in
  useEffect(() => {
    if (user) {
      navigate(user.role === 'admin' ? '/admin' : '/listings');
    }
  }, [user, navigate]);

  const openForgot = () => {
    setShowForgot(true);
    setForgotStep('email');
    setForgotEmail(email);
    setForgotError('');
  };

  const closeForgot = () => {
    setShowForgot(false);
    setForgotStep('email');
    setForgotError('');
  };

  const handleForgotSendLink = async () => {
    if (!forgotEmail.includes('@')) { setForgotError('Enter a valid email address'); return; }
    setForgotError('');
    setForgotSending(true);
    const { error } = await sendPasswordResetEmail(forgotEmail, `${window.location.origin}/reset-password`);
    setForgotSending(false);
    if (error) {
      setForgotError(error);
      return;
    }
    setForgotStep('sent');
    setForgotResendTimer(30);
    const interval = setInterval(() => {
      setForgotResendTimer((prev) => {
        if (prev <= 1) { clearInterval(interval); return 0; }
        return prev - 1;
      });
    }, 1000);
  };

  return (
    <div className="min-h-screen bg-offwhite flex items-center justify-center pb-10">
      <div className="w-full max-w-md px-4">
        <div className="bg-white rounded-3xl p-8 border border-black/5">
          {/* Header */}
          <div className="text-center mb-6">
            <img
              src="/favicon.svg"
              alt="Bhavan"
              className="h-12 w-12 object-contain mx-auto"
            />
            <h1 className="mt-4 text-2xl font-bold text-charcoal">Create Account</h1>
            <p className="mt-1 text-sm text-charcoal/60">Join thousands of happy renters &amp; owners</p>
          </div>

          {/* Role selector */}
          <div className="mb-5">
            <p className="text-sm font-semibold text-charcoal mb-3">I am signing up as a</p>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setRole('renter')}
                className={`flex flex-col items-center gap-2.5 p-4 rounded-xl border-2 transition cursor-pointer ${
                  role === 'renter'
                    ? 'border-brand bg-brand/5'
                    : 'border-black/5 hover:border-brand/30 bg-lightgray'
                }`}
              >
                <div className={`w-10 h-10 flex items-center justify-center rounded-xl ${role === 'renter' ? 'bg-brand/20' : 'bg-white'}`}>
                  <i className={`ri-home-heart-line text-xl ${role === 'renter' ? 'text-brand' : 'text-charcoal/40'}`} />
                </div>
                <div className="text-center">
                  <p className={`text-sm font-bold ${role === 'renter' ? 'text-brand' : 'text-charcoal'}`}>Tenant</p>
                  <p className="text-[11px] text-charcoal/40 mt-0.5">Looking to rent</p>
                </div>
                {role === 'renter' && (
                  <div className="w-4 h-4 flex items-center justify-center rounded-full bg-brand flex-shrink-0">
                    <i className="ri-check-line text-white text-[10px]" />
                  </div>
                )}
              </button>
              <button
                type="button"
                onClick={() => setRole('landlord')}
                className={`flex flex-col items-center gap-2.5 p-4 rounded-xl border-2 transition cursor-pointer ${
                  role === 'landlord'
                    ? 'border-amber-400 bg-amber-50'
                    : 'border-black/5 hover:border-amber-200 bg-lightgray'
                }`}
              >
                <div className={`w-10 h-10 flex items-center justify-center rounded-xl ${role === 'landlord' ? 'bg-amber-100' : 'bg-white'}`}>
                  <i className={`ri-building-4-line text-xl ${role === 'landlord' ? 'text-amber-600' : 'text-charcoal/40'}`} />
                </div>
                <div className="text-center">
                  <p className={`text-sm font-bold ${role === 'landlord' ? 'text-amber-700' : 'text-charcoal'}`}>Property Owner</p>
                  <p className="text-[11px] text-charcoal/40 mt-0.5">Listing my property</p>
                </div>
                {role === 'landlord' && (
                  <div className="w-4 h-4 flex items-center justify-center rounded-full bg-amber-500 flex-shrink-0">
                    <i className="ri-check-line text-white text-[10px]" />
                  </div>
                )}
              </button>
            </div>
            <p className="mt-2.5 text-xs text-red-500 font-medium flex items-center gap-1">
              <i className="ri-forbid-line text-sm" />
              Brokers &amp; real estate agents are strictly not allowed.
            </p>
          </div>

          {/* Google Sign Up */}
          <button
            type="button"
            onClick={handleGoogleSignUp}
            disabled={googleLoading}
            className="w-full flex items-center justify-center gap-3 border border-black/10 bg-white hover:bg-lightgray transition-colors py-3 rounded-xl text-sm font-medium text-charcoal cursor-pointer whitespace-nowrap disabled:opacity-70 disabled:cursor-not-allowed"
          >
            {googleLoading ? (
              <>
                <i className="ri-loader-4-line animate-spin text-base text-charcoal/40" />
                <span>Connecting to Google...</span>
              </>
            ) : (
              <>
                <img
                  src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg"
                  alt="Google"
                  className="w-5 h-5"
                />
                Continue with Google
              </>
            )}
          </button>
          {googleError && (
            <p className="text-xs text-red-500 font-medium text-center mt-2">{googleError}</p>
          )}
          <p className="text-[11px] text-charcoal/40 text-center mt-1.5">
            You'll be signed up as {role === 'renter' ? 'a Tenant' : 'a Property Owner'} — change that above before continuing with Google.
          </p>

          <div className="flex items-center gap-3 my-4">
            <div className="flex-1 h-px bg-gray-200" />
            <span className="text-xs text-charcoal/40 font-medium">or</span>
            <div className="flex-1 h-px bg-gray-200" />
          </div>

          {/* Tab Switcher */}
          <div className="flex bg-lightgray rounded-full p-1 mb-5">
            <button
              type="button"
              onClick={() => setTab('email')}
              className={`flex-1 py-2 text-sm font-medium rounded-full transition-colors cursor-pointer whitespace-nowrap ${
                tab === 'email' ? 'bg-white text-charcoal' : 'text-charcoal/60 hover:text-charcoal'
              }`}
            >
              <span className="flex items-center justify-center gap-1.5">
                <div className="w-4 h-4 flex items-center justify-center">
                  <i className="ri-mail-line text-sm" />
                </div>
                Email
              </span>
            </button>
            <button
              type="button"
              onClick={() => { setTab('mobile'); setOtpSent(false); setOtp(['', '', '', '', '', '']); }}
              className={`flex-1 py-2 text-sm font-medium rounded-full transition-colors cursor-pointer whitespace-nowrap ${
                tab === 'mobile' ? 'bg-white text-charcoal' : 'text-charcoal/60 hover:text-charcoal'
              }`}
            >
              <span className="flex items-center justify-center gap-1.5">
                <div className="w-4 h-4 flex items-center justify-center">
                  <i className="ri-smartphone-line text-sm" />
                </div>
                Mobile OTP
              </span>
            </button>
          </div>

          {/* Email Signup Form */}
          {tab === 'email' && (
            <form onSubmit={handleEmailSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-charcoal mb-1.5">Full Name</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => { setName(e.target.value.replace(/[^A-Za-z\s]/g, '')); setNameError(''); }}
                  required
                  className={`w-full px-4 py-3 bg-lightgray rounded-xl text-sm focus:outline-none focus:ring-2 ${nameError ? 'ring-2 ring-red-300' : 'focus:ring-brand/30'}`}
                  placeholder="John Doe"
                />
                {nameError && <p className="text-xs text-red-500 mt-1">{nameError}</p>}
              </div>
              <div>
                <label className="block text-sm font-medium text-charcoal mb-1.5">Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="w-full px-4 py-3 bg-lightgray rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand/30"
                  placeholder="your@email.com"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-charcoal mb-1.5">Password</label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    minLength={8}
                    className="w-full px-4 py-3 bg-lightgray rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand/30 pr-12"
                    placeholder="Min. 8 characters"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-charcoal/40 hover:text-charcoal cursor-pointer"
                  >
                    <div className="w-5 h-5 flex items-center justify-center">
                      <i className={`ri-${showPassword ? 'eye-off' : 'eye'}-line`} />
                    </div>
                  </button>
                </div>
              </div>
              <label className="flex items-start gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={notBroker}
                  onChange={(e) => setNotBroker(e.target.checked)}
                  required
                  className="w-4 h-4 mt-0.5 rounded border-black/15 text-brand focus:ring-brand"
                />
                <span className="text-sm text-charcoal/70">
                  I confirm I am <strong className="text-charcoal">not a real estate broker or agent</strong>. I am signing up as a genuine renter or property owner only.
                </span>
              </label>
              <label className="flex items-start gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={agreed}
                  onChange={(e) => setAgreed(e.target.checked)}
                  required
                  className="w-4 h-4 mt-0.5 rounded border-black/15 text-brand focus:ring-brand"
                />
                <span className="text-sm text-charcoal/70">
                  I agree to the{' '}
                  <a href="/terms" target="_blank" rel="noopener noreferrer" className="text-brand hover:text-brand-dark font-medium">Terms of Service</a>
                  {' '}and{' '}
                  <a href="/privacy" target="_blank" rel="noopener noreferrer" className="text-brand hover:text-brand-dark font-medium">Privacy Policy</a>
                </span>
              </label>
              {signupError && <p className="text-xs text-red-500 font-medium">{signupError}</p>}
              <button
                type="submit"
                disabled={!agreed || !notBroker || signupLoading}
                className="w-full bg-brand text-white font-medium py-3.5 rounded-full hover:bg-brand-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer whitespace-nowrap flex items-center justify-center gap-2"
              >
                {signupLoading && <i className="ri-loader-4-line animate-spin" />}
                Create Account
              </button>
            </form>
          )}

          {/* Mobile OTP Signup Form */}
          {tab === 'mobile' && (
            <form onSubmit={handleOtpSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-charcoal mb-1.5">Full Name</label>
                <input
                  type="text"
                  value={mobileName}
                  onChange={(e) => setMobileName(e.target.value.replace(/[^A-Za-z\s]/g, ''))}
                  required
                  disabled={otpSent}
                  className="w-full px-4 py-3 bg-lightgray rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand/30 disabled:opacity-60"
                  placeholder="John Doe"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-charcoal mb-1.5">Mobile Number</label>
                <div className="flex gap-2">
                  <div className="flex items-center gap-1.5 px-3 py-3 bg-lightgray rounded-xl text-sm text-charcoal font-medium min-w-[64px]">
                    <div className="w-4 h-4 flex items-center justify-center">
                      <i className="ri-flag-line text-sm" />
                    </div>
                    +91
                  </div>
                  <input
                    type="tel"
                    value={mobile}
                    onChange={(e) => setMobile(e.target.value.replace(/\D/g, '').slice(0, 10))}
                    required
                    disabled={otpSent}
                    className="flex-1 px-4 py-3 bg-lightgray rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand/30 disabled:opacity-60"
                    placeholder="10-digit mobile number"
                  />
                </div>
              </div>
              {!otpSent ? (
                <>
                  <label className="flex items-start gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={mobileNotBroker}
                      onChange={(e) => setMobileNotBroker(e.target.checked)}
                      required
                      className="w-4 h-4 mt-0.5 rounded border-black/15 text-brand focus:ring-brand"
                    />
                    <span className="text-sm text-charcoal/70">
                      I confirm I am <strong className="text-charcoal">not a real estate broker or agent</strong>. I am signing up as a genuine renter or property owner only.
                    </span>
                  </label>
                  <label className="flex items-start gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={mobileAgreed}
                      onChange={(e) => setMobileAgreed(e.target.checked)}
                      required
                      className="w-4 h-4 mt-0.5 rounded border-black/15 text-brand focus:ring-brand"
                    />
                    <span className="text-sm text-charcoal/70">
                      I agree to the{' '}
                      <a href="/terms" target="_blank" rel="noopener noreferrer" className="text-brand hover:text-brand-dark font-medium">Terms of Service</a>
                      {' '}and{' '}
                      <a href="/privacy" target="_blank" rel="noopener noreferrer" className="text-brand hover:text-brand-dark font-medium">Privacy Policy</a>
                    </span>
                  </label>
                  {signupError && <p className="text-xs text-red-500 font-medium">{signupError}</p>}
                  <button
                    type="button"
                    onClick={handleSendOtp}
                    disabled={mobile.length < 10 || sendingOtp || !mobileAgreed || !mobileNotBroker || !mobileName}
                    className="w-full bg-brand text-white font-medium py-3.5 rounded-full hover:bg-brand-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer whitespace-nowrap flex items-center justify-center gap-2"
                  >
                    {sendingOtp ? (
                      <><i className="ri-loader-4-line animate-spin" /> Sending OTP...</>
                    ) : (
                      <><i className="ri-send-plane-line" /> Send OTP</>
                    )}
                  </button>
                </>
              ) : (
                <>
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="block text-sm font-medium text-charcoal">Enter OTP</label>
                      <span className="text-xs text-charcoal/60">
                        Sent to +91 {mobile}
                        <button
                          type="button"
                          onClick={() => { setOtpSent(false); setOtp(['', '', '', '', '', '']); }}
                          className="ml-2 text-brand hover:text-brand-dark font-medium cursor-pointer"
                        >
                          Change
                        </button>
                      </span>
                    </div>
                    <div className="flex gap-2 justify-between">
                      {otp.map((digit, i) => (
                        <input
                          key={i}
                          id={`sotp-${i}`}
                          type="text"
                          inputMode="numeric"
                          maxLength={1}
                          value={digit}
                          onChange={(e) => handleOtpChange(i, e.target.value)}
                          onKeyDown={(e) => handleOtpKeyDown(i, e)}
                          className="w-11 h-12 text-center bg-lightgray rounded-xl text-base font-semibold text-charcoal focus:outline-none focus:ring-2 focus:ring-brand/40"
                        />
                      ))}
                    </div>
                    <div className="mt-2 flex items-center justify-between">
                      <span className="text-xs text-charcoal/40">{otpTimer > 0 ? `Resend in ${otpTimer}s` : ''}</span>
                      {otpTimer === 0 && (
                        <button type="button" onClick={handleSendOtp} className="text-xs text-brand hover:text-brand-dark font-medium cursor-pointer">
                          Resend OTP
                        </button>
                      )}
                    </div>
                  </div>
                  {signupError && <p className="text-xs text-red-500 font-medium">{signupError}</p>}
                  <button
                    type="submit"
                    disabled={!otpFilled || signupLoading}
                    className="w-full bg-brand text-white font-medium py-3.5 rounded-full hover:bg-brand-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer whitespace-nowrap flex items-center justify-center gap-2"
                  >
                    {signupLoading && <i className="ri-loader-4-line animate-spin" />}
                    Verify &amp; Create Account
                  </button>
                </>
              )}
            </form>
          )}

          {/* Forgot password hint */}
          {tab === 'email' && (
            <div className="mt-3 text-center">
              <button
                type="button"
                onClick={openForgot}
                className="text-sm text-charcoal/40 hover:text-brand transition-colors cursor-pointer"
              >
                Already have an account?{' '}
                <span className="text-brand font-medium">Forgot your password?</span>
              </button>
            </div>
          )}

          {/* Aadhaar Verification Nudge */}
          <div className="mt-5 bg-green-50 border border-green-200 rounded-xl p-4">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0">
                <i className="ri-shield-check-line text-green-600 text-sm" />
              </div>
              <div>
                <p className="text-sm font-semibold text-green-800">Verify with Aadhaar after signing up</p>
                <p className="text-xs text-green-700 mt-0.5 leading-relaxed">
                  Owners need Aadhaar verification to list a property. For tenants it's optional but recommended — it builds trust and puts your verified name on any agreement you sign. It takes under 60 seconds.
                </p>
                <Link
                  to="/aadhaar-verify"
                  className="inline-flex items-center gap-1 mt-2 text-xs font-semibold text-green-700 hover:text-green-800 cursor-pointer"
                >
                  Verify Now <i className="ri-arrow-right-line" />
                </Link>
              </div>
            </div>
          </div>

          <div className="mt-4 text-center">
            <p className="text-sm text-charcoal/70">
              Already have an account?{' '}
              <Link to="/login" className="text-brand hover:text-brand-dark font-medium">
                Sign in
              </Link>
            </p>
          </div>
        </div>
      </div>

      {/* ── Forgot Password Modal ── */}
      {showForgot && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div className="absolute inset-0 bg-black/40" onClick={closeForgot} />
          <div className="relative bg-white rounded-2xl w-full max-w-sm p-7 border border-black/5">
            <button
              onClick={closeForgot}
              className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-full text-charcoal/40 hover:text-charcoal hover:bg-lightgray transition-colors cursor-pointer"
            >
              <i className="ri-close-line text-lg" />
            </button>

            {forgotStep === 'email' && (
              <div>
                <div className="w-12 h-12 flex items-center justify-center rounded-2xl bg-brand/10 mb-4">
                  <i className="ri-lock-password-line text-2xl text-brand" />
                </div>
                <h3 className="text-lg font-bold text-charcoal">Forgot Password?</h3>
                <p className="mt-1 text-sm text-charcoal/60 mb-5">
                  Enter your registered email and we&apos;ll send you a link to reset your password.
                </p>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-charcoal mb-1.5">Email Address</label>
                    <input
                      type="email"
                      value={forgotEmail}
                      onChange={(e) => { setForgotEmail(e.target.value); setForgotError(''); }}
                      className="w-full px-4 py-3 bg-offwhite rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand/30"
                      placeholder="your@email.com"
                      autoFocus
                    />
                  </div>
                  {forgotError && <p className="text-xs text-red-500 font-medium">{forgotError}</p>}
                  <button
                    type="button"
                    onClick={handleForgotSendLink}
                    disabled={forgotSending || !forgotEmail}
                    className="w-full bg-brand hover:bg-brand-dark text-white font-medium py-3 rounded-full transition-colors cursor-pointer whitespace-nowrap disabled:opacity-60 flex items-center justify-center gap-2"
                  >
                    {forgotSending ? <><i className="ri-loader-4-line animate-spin" /> Sending...</> : <><i className="ri-send-plane-line" /> Send Reset Link</>}
                  </button>
                </div>
              </div>
            )}

            {forgotStep === 'sent' && (
              <div>
                <div className="w-12 h-12 flex items-center justify-center rounded-2xl bg-green-50 mb-4">
                  <i className="ri-mail-check-line text-2xl text-green-600" />
                </div>
                <h3 className="text-lg font-bold text-charcoal">Check Your Email</h3>
                <p className="mt-1 text-sm text-charcoal/60 mb-1">We sent a password reset link to</p>
                <p className="text-sm font-semibold text-charcoal mb-5">{forgotEmail}</p>
                <p className="text-xs text-charcoal/60 mb-4">
                  Click the link in that email to choose a new password. It may take a minute to arrive -- check spam if you don&apos;t see it.
                </p>
                <div className="flex items-center justify-between mb-4">
                  <span className="text-xs text-charcoal/40">{forgotResendTimer > 0 ? `Resend in ${forgotResendTimer}s` : ''}</span>
                  {forgotResendTimer === 0 && (
                    <button type="button" onClick={handleForgotSendLink} disabled={forgotSending} className="text-xs text-brand hover:text-brand-dark font-medium cursor-pointer">
                      {forgotSending ? 'Sending...' : 'Resend link'}
                    </button>
                  )}
                </div>
                {forgotError && <p className="text-xs text-red-500 font-medium mb-3">{forgotError}</p>}
                <button
                  type="button"
                  onClick={() => { setForgotStep('email'); setForgotError(''); }}
                  className="w-full text-sm text-charcoal/40 hover:text-charcoal transition-colors cursor-pointer py-2"
                >
                  ← Use a different email
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}