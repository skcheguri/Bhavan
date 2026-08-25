import { getBiometricStatus, type BiometricStatus } from '@/lib/biometricAuth';
import { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router';
import { useAuth } from '@/hooks/useAuth';
import { isValidRawIndianMobile } from '@/lib/validation';

type AuthTab = 'email' | 'mobile';
type ForgotStep = 'email' | 'sent';

export default function Login() {
  const [tab, setTab] = useState<AuthTab>('email');
  const { signIn, signInWithGoogle, sendPhoneOtp, verifyPhoneOtp, sendPasswordResetEmail, signInWithBiometrics, user } = useAuth();

  // Offered only when a token is actually stored on this device, so the
  // button never appears to someone it cannot help.
  const [biometric, setBiometric] = useState<BiometricStatus>({ available: false, enrolled: false, kind: 'biometric' });
  const [biometricBusy, setBiometricBusy] = useState(false);
  const [biometricError, setBiometricError] = useState('');

  useEffect(() => {
    getBiometricStatus().then(setBiometric);
  }, []);

  const handleBiometricUnlock = async () => {
    setBiometricError('');
    setBiometricBusy(true);
    const { error } = await signInWithBiometrics();
    setBiometricBusy(false);
    if (error) {
      setBiometricError(error);
      // A rejected token is deleted by the auth layer, so stop offering it.
      getBiometricStatus().then(setBiometric);
    }
  };
  const navigate = useNavigate();

  // Email login state
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loginError, setLoginError] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);

  // Mobile OTP state
  const [mobile, setMobile] = useState('');
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [otpSent, setOtpSent] = useState(false);
  const [otpTimer, setOtpTimer] = useState(0);
  const [sendingOtp, setSendingOtp] = useState(false);

  // Google sign-in state
  const [googleLoading, setGoogleLoading] = useState(false);
  const [googleError, setGoogleError] = useState('');

  // Countdown intervals, held in refs so they can be cleared if the
  // component unmounts mid-countdown (otherwise the timer keeps firing
  // setState on an unmounted component).
  const otpIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const forgotIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => () => {
    if (otpIntervalRef.current) clearInterval(otpIntervalRef.current);
    if (forgotIntervalRef.current) clearInterval(forgotIntervalRef.current);
  }, []);

  const handleGoogleSignIn = async () => {
    setGoogleError('');
    setGoogleLoading(true);
    const { error } = await signInWithGoogle();
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

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError('');
    setLoginLoading(true);
    const { error } = await signIn(email, password);
    setLoginLoading(false);
    if (error) setLoginError(error);
  };

  const handleSendOtp = async () => {
    if (mobile.length < 10) return;
    if (!isValidRawIndianMobile(mobile)) {
      setLoginError('Enter a valid 10-digit Indian mobile number.');
      return;
    }
    setLoginError('');
    setSendingOtp(true);
    const { error } = await sendPhoneOtp(`+91${mobile}`);
    setSendingOtp(false);
    if (error) {
      setLoginError(error);
      return;
    }
    setOtpSent(true);
    setOtpTimer(30);
    if (otpIntervalRef.current) clearInterval(otpIntervalRef.current);
    const interval = setInterval(() => {
      setOtpTimer((prev) => {
        if (prev <= 1) { clearInterval(interval); return 0; }
        return prev - 1;
      });
    }, 1000);
    otpIntervalRef.current = interval;
  };

  const handleOtpChange = (index: number, value: string) => {
    if (!/^\d*$/.test(value)) return;
    const next = [...otp];
    next[index] = value.slice(-1);
    setOtp(next);
    if (value && index < 5) {
      document.getElementById(`otp-${index + 1}`)?.focus();
    }
  };

  const handleOtpKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !otp[index] && index > 0) {
      document.getElementById(`otp-${index - 1}`)?.focus();
    }
  };

  const handleOtpSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError('');
    setLoginLoading(true);
    const { error } = await verifyPhoneOtp(`+91${mobile}`, otp.join(''));
    setLoginLoading(false);
    if (error) {
      setLoginError(error);
    }
  };

  const otpFilled = otp.every((d) => d !== '');

  // Forgot password handlers
  const openForgot = () => {
    setShowForgot(true);
    setForgotStep('email');
    setForgotEmail('');
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
    if (forgotIntervalRef.current) clearInterval(forgotIntervalRef.current);
    const interval = setInterval(() => {
      setForgotResendTimer((prev) => {
        if (prev <= 1) { clearInterval(interval); return 0; }
        return prev - 1;
      });
    }, 1000);
    forgotIntervalRef.current = interval;
  };

  return (
    <div className="min-h-screen bg-offwhite flex pb-10">
      {/* Left panel */}
      <div className="hidden lg:flex flex-col justify-between w-[420px] flex-shrink-0 bg-charcoal relative overflow-hidden p-10">
        <img
          src="/placeholders/photo.svg"
          alt=""
          className="absolute inset-0 w-full h-full object-cover object-top opacity-30"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-charcoal/60 via-charcoal/40 to-charcoal/80" />
        <div className="relative z-10">
          <Link to="/" className="flex items-center gap-2">
            <img
              src="/favicon.svg"
              alt="Bhavan"
              className="h-9 w-9 object-contain brightness-0 invert"
            />
            <span className="text-xl font-bold text-white">Bhavan</span>
          </Link>
        </div>
        <div className="relative z-10 space-y-6">
          <div>
            <h2 className="text-2xl font-bold text-white leading-snug">
              India's most trusted<br />broker-free rental platform
            </h2>
            <p className="mt-3 text-white/60 text-sm leading-relaxed">
              Verified owners. Verified tenants. Zero brokers. Direct connections that save you time and money.
            </p>
          </div>
          <div className="space-y-3">
            {[
              { icon: 'ri-shield-check-fill', text: 'Aadhaar-verified users only' },
              { icon: 'ri-forbid-2-fill', text: 'Strictly no brokers or agents' },
              { icon: 'ri-price-tag-3-line', text: 'Free to list, free to search' },
              { icon: 'ri-file-text-line', text: 'Digital rental agreements' },
            ].map((item) => (
              <div key={item.text} className="flex items-center gap-3">
                <div className="w-7 h-7 flex items-center justify-center rounded-lg bg-white/10 flex-shrink-0">
                  <i className={`${item.icon} text-sm text-brand`} />
                </div>
                <span className="text-sm text-white/70">{item.text}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Right panel */}
      <div className="flex-1 flex items-center justify-center px-4 py-8">
        <div className="w-full max-w-md">

          {/* Universal sign-in -- one email maps to one role, so the account
              already knows whether it's a tenant or an owner. New users pick
              a role in signup, not here. */}
          <div className="bg-white rounded-3xl p-8 border border-black/5">
              <div className="text-center mb-6">
                <img
                  src="/favicon.svg"
                  alt="Bhavan"
                  className="h-11 w-11 object-contain mx-auto"
                />
                <h2 className="mt-3 text-2xl font-bold text-charcoal">Welcome Back</h2>
                <p className="mt-1 text-sm text-charcoal/60">Sign in to your account</p>
              </div>

              {/* Google */}
              {biometric.enrolled && (
                <>
                  <button
                    type="button"
                    onClick={handleBiometricUnlock}
                    disabled={biometricBusy}
                    className="w-full flex items-center justify-center gap-3 border border-brand/30 bg-brand/5 hover:bg-brand/10 transition-colors py-3 rounded-xl text-sm font-semibold text-brand cursor-pointer whitespace-nowrap disabled:opacity-70 disabled:cursor-not-allowed"
                  >
                    <i className={biometricBusy ? 'ri-loader-4-line animate-spin text-base' : biometric.kind === 'face' ? 'ri-user-smile-line text-base' : 'ri-fingerprint-line text-base'} />
                    {biometricBusy
                      ? 'Waiting for confirmation...'
                      : biometric.kind === 'face'
                        ? 'Unlock with Face ID'
                        : 'Unlock with fingerprint'}
                  </button>
                  {biometricError && (
                    <p className="text-xs text-red-500 font-medium text-center -mt-1">{biometricError}</p>
                  )}
                </>
              )}

              <button
                type="button"
                onClick={handleGoogleSignIn}
                disabled={googleLoading}
                className="w-full flex items-center justify-center gap-3 border border-black/10 bg-white hover:bg-offwhite transition-colors py-3 rounded-xl text-sm font-medium text-charcoal cursor-pointer whitespace-nowrap disabled:opacity-70 disabled:cursor-not-allowed relative"
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
                <p className="text-xs text-red-500 font-medium text-center -mt-1">{googleError}</p>
              )}

              <div className="flex items-center gap-3 my-4">
                <div className="flex-1 h-px bg-gray-200" />
                <span className="text-xs text-charcoal/40 font-medium">or</span>
                <div className="flex-1 h-px bg-gray-200" />
              </div>

              {/* Email / Mobile tab */}
              <div className="flex bg-offwhite rounded-full p-1 mb-5">
                <button
                  type="button"
                  onClick={() => setTab('email')}
                  className={`flex-1 py-2 text-sm font-medium rounded-full transition-colors cursor-pointer whitespace-nowrap ${
                    tab === 'email' ? 'bg-white text-charcoal' : 'text-charcoal/60 hover:text-charcoal'
                  }`}
                >
                  <span className="flex items-center justify-center gap-1.5">
                    <i className="ri-mail-line text-sm" /> Email
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
                    <i className="ri-smartphone-line text-sm" /> Mobile OTP
                  </span>
                </button>
              </div>

              {/* Email Form */}
              {tab === 'email' && (
                <form onSubmit={handleEmailSubmit} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-charcoal mb-1.5">Email</label>
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      className="w-full px-4 py-3 bg-offwhite rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand/30"
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
                        className="w-full px-4 py-3 bg-offwhite rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand/30 pr-12"
                        placeholder="Enter your password"
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
                  <div className="flex items-center justify-end">
                    <button
                      type="button"
                      onClick={openForgot}
                      className="text-sm text-brand hover:text-brand-dark font-medium cursor-pointer"
                    >
                      Forgot password?
                    </button>
                  </div>
                  {loginError && (
                    <p className="text-xs text-red-500 font-medium">{loginError}</p>
                  )}
                  <button
                    type="submit"
                    disabled={loginLoading}
                    className="w-full text-white font-medium py-3.5 rounded-full transition-colors cursor-pointer whitespace-nowrap disabled:opacity-60 flex items-center justify-center gap-2 bg-brand hover:bg-brand-dark"
                  >
                    {loginLoading && <i className="ri-loader-4-line animate-spin" />}
                    Sign In
                  </button>
                </form>
              )}

              {/* Mobile OTP Form */}
              {tab === 'mobile' && (
                <form onSubmit={handleOtpSubmit} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-charcoal mb-1.5">Mobile Number</label>
                    <div className="flex gap-2">
                      <div className="flex items-center gap-1.5 px-3 py-3 bg-offwhite rounded-xl text-sm text-charcoal font-medium min-w-[64px]">
                        <i className="ri-flag-line text-sm" /> +91
                      </div>
                      <input
                        type="tel"
                        value={mobile}
                        onChange={(e) => setMobile(e.target.value.replace(/\D/g, '').slice(0, 10))}
                        required
                        disabled={otpSent}
                        className="flex-1 px-4 py-3 bg-offwhite rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand/30 disabled:opacity-60"
                        placeholder="10-digit mobile number"
                      />
                    </div>
                  </div>

                  {!otpSent ? (
                    <button
                      type="button"
                      onClick={handleSendOtp}
                      disabled={mobile.length < 10 || sendingOtp}
                      className={`w-full text-white font-medium py-3.5 rounded-full transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer whitespace-nowrap flex items-center justify-center gap-2 ${
                        'bg-brand hover:bg-brand-dark'
                      }`}
                    >
                      {sendingOtp ? <><i className="ri-loader-4-line animate-spin" /> Sending OTP...</> : <><i className="ri-send-plane-line" /> Send OTP</>}
                    </button>
                  ) : (
                    <>
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <label className="block text-sm font-medium text-charcoal">Enter OTP</label>
                          <span className="text-xs text-charcoal/60">
                            Sent to +91 {mobile}
                            <button type="button" onClick={() => { setOtpSent(false); setOtp(['', '', '', '', '', '']); }} className="ml-2 text-brand hover:text-brand-dark font-medium cursor-pointer">Change</button>
                          </span>
                        </div>
                        <div className="flex gap-2 justify-between">
                          {otp.map((digit, i) => (
                            <input
                              key={i}
                              id={`otp-${i}`}
                              type="text"
                              inputMode="numeric"
                              maxLength={1}
                              value={digit}
                              onChange={(e) => handleOtpChange(i, e.target.value)}
                              onKeyDown={(e) => handleOtpKeyDown(i, e)}
                              className="w-11 h-12 text-center bg-offwhite rounded-xl text-base font-semibold text-charcoal focus:outline-none focus:ring-2 focus:ring-brand/40"
                            />
                          ))}
                        </div>
                        <div className="mt-2 flex items-center justify-between">
                          <span className="text-xs text-charcoal/40">{otpTimer > 0 ? `Resend in ${otpTimer}s` : ''}</span>
                          {otpTimer === 0 && (
                            <button type="button" onClick={handleSendOtp} className="text-xs text-brand hover:text-brand-dark font-medium cursor-pointer">Resend OTP</button>
                          )}
                        </div>
                      </div>
                      <button
                        type="submit"
                        disabled={!otpFilled || loginLoading}
                        className={`w-full text-white font-medium py-3.5 rounded-full transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer whitespace-nowrap ${
                          'bg-brand hover:bg-brand-dark'
                        }`}
                      >
                        Verify &amp; Sign In
                      </button>
                    </>
                  )}
                </form>
              )}

              <p className="mt-6 text-center text-sm text-charcoal/60">
                New to Bhavan?{' '}
                <Link to="/signup" className="text-brand hover:text-brand-dark font-semibold">
                  Create an account
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

            {/* Close */}
            <button
              onClick={closeForgot}
              className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-full text-charcoal/40 hover:text-charcoal hover:bg-lightgray transition-colors cursor-pointer"
            >
              <i className="ri-close-line text-lg" />
            </button>

            {/* Step: Email */}
            {forgotStep === 'email' && (
              <div>
                <div className="w-12 h-12 flex items-center justify-center rounded-2xl bg-brand/10 mb-4">
                  <i className="ri-lock-password-line text-2xl text-brand" />
                </div>
                <h3 className="text-lg font-bold text-charcoal">Forgot Password?</h3>
                <p className="mt-1 text-sm text-charcoal/60 mb-5">
                  Enter your registered email and we'll send you a link to reset your password.
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

            {/* Step: Sent */}
            {forgotStep === 'sent' && (
              <div>
                <div className="w-12 h-12 flex items-center justify-center rounded-2xl bg-green-50 mb-4">
                  <i className="ri-mail-check-line text-2xl text-green-600" />
                </div>
                <h3 className="text-lg font-bold text-charcoal">Check Your Email</h3>
                <p className="mt-1 text-sm text-charcoal/60 mb-1">
                  We sent a password reset link to
                </p>
                <p className="text-sm font-semibold text-charcoal mb-5">{forgotEmail}</p>
                <p className="text-xs text-charcoal/60 mb-4">
                  Click the link in that email to choose a new password. It may take a minute to arrive -- check spam if you don't see it.
                </p>

                <div className="flex items-center justify-between mb-4">
                  <span className="text-xs text-charcoal/40">
                    {forgotResendTimer > 0 ? `Resend in ${forgotResendTimer}s` : ''}
                  </span>
                  {forgotResendTimer === 0 && (
                    <button
                      type="button"
                      onClick={handleForgotSendLink}
                      disabled={forgotSending}
                      className="text-xs text-brand hover:text-brand-dark font-medium cursor-pointer"
                    >
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