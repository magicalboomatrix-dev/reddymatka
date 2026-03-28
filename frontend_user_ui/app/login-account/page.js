'use client'
import React, { useState, useRef, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { authAPI } from '../lib/api';
import { useAuth } from '../lib/AuthContext';

// Steps: phone → otp → profile → setMpin → mpin → forgotMpin → resetOtp → resetMpin
const STEPS = {
  PHONE: 'phone',
  OTP: 'otp',
  PROFILE: 'profile',
  SET_MPIN: 'setMpin',
  MPIN: 'mpin',
  FORGOT_MPIN: 'forgotMpin',
  RESET_OTP: 'resetOtp',
  RESET_MPIN: 'resetMpin',
};

function sanitizePhoneInput(rawValue) {
  const compact = String(rawValue || '').replace(/[\s()-]/g, '');
  const normalized = compact.replace(/(?!^)\+/g, '');

  if (normalized.startsWith('+')) {
    return `+${normalized.slice(1).replace(/\D/g, '').slice(0, 15)}`;
  }

  return normalized.replace(/\D/g, '').slice(0, 15);
}

function isValidPhone(phoneValue) {
  return /^\+[1-9]\d{7,14}$/.test(phoneValue) || /^\d{10}$/.test(phoneValue) || /^91\d{10}$/.test(phoneValue);
}

function PinInput({ length, value, onChange, autoFocus }) {
  const refs = useRef([]);

  useEffect(() => {
    if (autoFocus && refs.current[0]) refs.current[0].focus();
  }, [autoFocus]);

  const handleChange = useCallback((idx, e) => {
    const val = e.target.value.replace(/\D/g, '');
    if (!val) return;
    const char = val[val.length - 1];
    const arr = (value || '').split('');
    arr[idx] = char;
    const newVal = arr.join('').slice(0, length);
    onChange(newVal);
    if (idx < length - 1 && refs.current[idx + 1]) {
      refs.current[idx + 1].focus();
    }
  }, [value, onChange, length]);

  const handleKeyDown = useCallback((idx, e) => {
    if (e.key === 'Backspace') {
      e.preventDefault();
      const arr = (value || '').split('');
      if (arr[idx]) {
        arr[idx] = '';
        onChange(arr.join(''));
      } else if (idx > 0) {
        arr[idx - 1] = '';
        onChange(arr.join(''));
        refs.current[idx - 1]?.focus();
      }
    }
  }, [value, onChange]);

  const handlePaste = useCallback((e) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, length);
    onChange(pasted);
    const focusIdx = Math.min(pasted.length, length - 1);
    refs.current[focusIdx]?.focus();
  }, [onChange, length]);

  return (
    <div className="my-4 flex justify-center gap-2">
      {Array.from({ length }).map((_, i) => (
        <input
          key={i}
          ref={el => refs.current[i] = el}
          type="tel"
          inputMode="numeric"
          maxLength={1}
          value={(value || '')[i] || ''}
          onChange={e => handleChange(i, e)}
          onKeyDown={e => handleKeyDown(i, e)}
          onPaste={handlePaste}
          className={`${length === 4 ? 'h-14 w-[52px]' : 'h-12 w-11'} border-2 border-[#ccc] bg-[#fafafa] text-center text-[22px] font-bold outline-none transition focus:border-[#1d1c20]`}
        />
      ))}
    </div>
  );
}

const LoginAccountPage = () => {
  const router = useRouter();
  const { login } = useAuth();

  const [step, setStep] = useState(STEPS.PHONE);
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [mpin, setMpin] = useState('');
  const [mpinConfirm, setMpinConfirm] = useState('');
  const [name, setName] = useState('');
  const [referralCode, setReferralCode] = useState('');
  const [tempToken, setTempToken] = useState(null);
  const [otpPurpose, setOtpPurpose] = useState(null);
  const [authFlow, setAuthFlow] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Step 1: Check user after phone entry
  const handleCheckUser = async () => {
    if (!isValidPhone(phone)) {
      setError('Enter a valid phone number');
      return;
    }
    setError('');
    setLoading(true);
    try {
      const data = await authAPI.checkUser(phone);
      if (!data.exists) {
        await authAPI.sendOTP(phone, 'register');
        setOtpPurpose('register');
        setAuthFlow('register');
        setOtp('');
        setStep(STEPS.OTP);
      } else if (!data.mpinSet) {
        await authAPI.sendOTP(phone, 'reset_mpin');
        setOtpPurpose('reset_mpin');
        setAuthFlow('firstMpinSetup');
        setOtp('');
        setStep(STEPS.OTP);
      } else {
        setAuthFlow('mpinLogin');
        setStep(STEPS.MPIN);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Step 2: Verify OTP (registration or reset)
  const handleVerifyOTP = async () => {
    if (!otp || otp.length !== 6) {
      setError('Enter a valid 6-digit OTP');
      return;
    }
    setError('');
    setLoading(true);
    try {
      const data = await authAPI.verifyOTP(phone, otp, otpPurpose);
      setTempToken(data.tempToken);
      setOtp('');

      if (authFlow === 'register' && data.isNewUser) {
        setStep(STEPS.PROFILE);
      } else if (authFlow === 'firstMpinSetup' && data.resetMpin) {
        setMpin('');
        setMpinConfirm('');
        setStep(STEPS.SET_MPIN);
      } else if (data.resetMpin) {
        setStep(STEPS.RESET_MPIN);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Step 3: Complete profile (new user)
  const handleCompleteProfile = async () => {
    if (!name || name.trim().length < 2) {
      setError('Name must be at least 2 characters');
      return;
    }
    setError('');
    setStep(STEPS.SET_MPIN);
  };

  // Step 4: Set MPIN during registration
  const handleSetMpinRegister = async () => {
    if (!mpin || !/^\d{4}$/.test(mpin)) {
      setError('MPIN must be exactly 4 digits');
      return;
    }
    if (mpin !== mpinConfirm) {
      setError('MPINs do not match');
      return;
    }
    setError('');
    setLoading(true);
    try {
      let data;

      if (authFlow === 'register') {
        data = await authAPI.completeProfile(name.trim(), referralCode, mpin, tempToken);
      } else {
        await authAPI.resetMpin(mpin, tempToken);
        data = await authAPI.loginMpin(phone, mpin);
      }

      login(data.token, data.user);
      router.push('/home');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // MPIN Login
  const handleMpinLogin = async () => {
    if (!mpin || !/^\d{4}$/.test(mpin)) {
      setError('Enter your 4-digit MPIN');
      return;
    }
    setError('');
    setLoading(true);
    try {
      const data = await authAPI.loginMpin(phone, mpin);
      setAuthFlow('mpinLogin');
      login(data.token, data.user);
      router.push('/home');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Forgot MPIN → send OTP for reset
  const handleForgotMpin = async () => {
    setError('');
    setLoading(true);
    try {
      await authAPI.sendOTP(phone, 'reset_mpin');
      setOtpPurpose('reset_mpin');
      setAuthFlow('forgotMpinReset');
      setOtp('');
      setStep(STEPS.RESET_OTP);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Verify OTP for MPIN reset
  const handleVerifyResetOTP = async () => {
    if (!otp || otp.length !== 6) {
      setError('Enter a valid 6-digit OTP');
      return;
    }
    setError('');
    setLoading(true);
    try {
      const data = await authAPI.verifyOTP(phone, otp, 'reset_mpin');
      setTempToken(data.tempToken);
      setAuthFlow('forgotMpinReset');
      setOtp('');
      setMpin('');
      setMpinConfirm('');
      setStep(STEPS.RESET_MPIN);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Reset MPIN
  const handleResetMpin = async () => {
    if (!mpin || !/^\d{4}$/.test(mpin)) {
      setError('MPIN must be exactly 4 digits');
      return;
    }
    if (mpin !== mpinConfirm) {
      setError('MPINs do not match');
      return;
    }
    setError('');
    setLoading(true);
    try {
      await authAPI.resetMpin(mpin, tempToken);
      // Now login with the new MPIN
      const data = await authAPI.loginMpin(phone, mpin);
      login(data.token, data.user);
      router.push('/home');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const getTitle = () => {
    switch (step) {
      case STEPS.PHONE: return 'Login to REDDYMATKA ';
      case STEPS.OTP: return authFlow === 'firstMpinSetup' ? 'Verify Mobile Number' : 'Verify OTP';
      case STEPS.PROFILE: return 'Complete Your Profile';
      case STEPS.SET_MPIN: return authFlow === 'firstMpinSetup' ? 'Set Your MPIN' : 'Create Your MPIN';
      case STEPS.MPIN: return 'Enter MPIN';
      case STEPS.FORGOT_MPIN: return 'Forgot MPIN';
      case STEPS.RESET_OTP: return 'Verify OTP';
      case STEPS.RESET_MPIN: return 'Set New MPIN';
      default: return 'Login to REDDYMATKA ';
    }
  };

  const getSubtitle = () => {
    switch (step) {
      case STEPS.PHONE: return 'Enter your phone number to continue.';
      case STEPS.OTP:
        return authFlow === 'firstMpinSetup'
          ? `Verify ${phone} once to create your MPIN.`
          : `We sent a 6-digit code to ${phone}`;
      case STEPS.PROFILE: return 'Tell us your name to get started.';
      case STEPS.SET_MPIN:
        return authFlow === 'firstMpinSetup'
          ? 'Create your 4-digit MPIN. You will use it for future logins.'
          : 'Create a 4-digit MPIN for quick login.';
      case STEPS.MPIN: return `Welcome back! Enter your MPIN for ${phone}`;
      case STEPS.RESET_OTP: return `We sent a verification code to ${phone}`;
      case STEPS.RESET_MPIN: return 'Create a new 4-digit MPIN.';
      default: return '';
    }
  };

  const handleBack = () => {
    setError('');
    setMpin('');
    setMpinConfirm('');
    switch (step) {
      case STEPS.OTP: setOtp(''); setOtpPurpose(null); setAuthFlow(null); setStep(STEPS.PHONE); break;
      case STEPS.PROFILE: setStep(STEPS.OTP); break;
      case STEPS.SET_MPIN: setStep(authFlow === 'register' ? STEPS.PROFILE : STEPS.OTP); break;
      case STEPS.MPIN: setAuthFlow(null); setStep(STEPS.PHONE); break;
      case STEPS.RESET_OTP: setOtp(''); setOtpPurpose(null); setAuthFlow('mpinLogin'); setStep(STEPS.MPIN); break;
      case STEPS.RESET_MPIN: setStep(STEPS.RESET_OTP); break;
      default: break;
    }
  };

  const fieldWrapClass = 'relative mt-4 w-full border border-[#d6d6d6] bg-white px-4 pb-3 pt-5';
  const labelClass = 'absolute left-3 top-[-10px] bg-white px-2 text-[13px] font-medium text-[#4b5563]';
  const inputClass = 'w-full border-0 bg-transparent text-[15px] font-medium text-[#111] outline-none placeholder:text-[#9ca3af]';
  const buttonClass = 'mt-4 inline-block w-full bg-[#1d1c20] px-4 py-3 text-center text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60';
  const helperLabelClass = 'mt-3 block text-center text-sm font-medium text-[#444]';
  const messageClass = 'mb-3 bg-[#fdecea] px-3 py-2 text-[13px] text-[#d32f2f]';

  return (
    <div className="mx-auto min-h-screen w-full max-w-[430px] mt-6">
      <main className="flex min-h-screen justify-center ">
        <div className="w-full max-w-105">
          <div className="back-btn mb-4">
            {step === STEPS.PHONE ? (
              <Link href="/login"><img src="/images/back-btn.png" alt="Back" className="h-5 w-5" /></Link>
            ) : (
              <button type="button" onClick={handleBack} className="cursor-pointer"><img src="/images/back-btn.png" alt="Back" className="h-5 w-5" /></button>
            )}
          </div>

          <section className="bg-white px-5 py-6 ">
            <h3 className="text-[24px] font-black text-[#111]"><b>{getTitle()}</b></h3>
            <h4 className="pb-2 pt-1 text-sm font-normal text-[#696969]">
              {getSubtitle()}
            </h4>

            {error && (
              <p className={messageClass}>{error}</p>
            )}

            <div>

              {/* STEP: PHONE */}
              {step === STEPS.PHONE && (
                <>
                  <div className={fieldWrapClass}>
                    <label className={labelClass}>Mobile Number</label>
                    <input
                      className={inputClass}
                      placeholder="Enter your number"
                      type="tel"
                      inputMode="tel"
                      maxLength={16}
                      value={phone}
                      onChange={e => setPhone(sanitizePhoneInput(e.target.value))}
                    />
                  </div>
                  <div className="px-1 pt-2 text-left">
                    <p className="text-[13px] font-medium text-[#ff0036]">
                      OTP is only needed the first time. After setup, login uses your MPIN.
                    </p>
                  </div>
                  <button type="button" className={buttonClass} onClick={handleCheckUser} disabled={loading}>
                    {loading ? 'Checking...' : 'Continue'}
                  </button>
                </>
              )}

              {/* STEP: OTP (registration) */}
              {step === STEPS.OTP && (
                <>
                  <label className={helperLabelClass}>
                    Enter 6-digit OTP
                  </label>
                  <PinInput length={6} value={otp} onChange={setOtp} autoFocus />
                  <button type="button" className={buttonClass} onClick={handleVerifyOTP} disabled={loading}>
                    {loading ? 'Verifying...' : 'Verify OTP'}
                  </button>
                </>
              )}

              {/* STEP: PROFILE (new user) */}
              {step === STEPS.PROFILE && (
                <>
                  <div className={fieldWrapClass}>
                    <label className={labelClass}>Full Name</label>
                    <input className={inputClass} placeholder="Enter your name" type="text" value={name} onChange={e => setName(e.target.value)} />
                  </div>
                  <div className={fieldWrapClass}>
                    <label className={labelClass}>Referral Code (Optional)</label>
                    <input className={inputClass} placeholder="Enter referral code" type="text" value={referralCode} onChange={e => setReferralCode(e.target.value)} />
                  </div>
                  <button type="button" className={buttonClass} onClick={handleCompleteProfile} disabled={loading}>
                    {loading ? 'Please wait...' : 'Continue'}
                  </button>
                </>
              )}

              {/* STEP: SET MPIN (new user registration) */}
              {step === STEPS.SET_MPIN && (
                <>
                  <label className={helperLabelClass}>
                    {authFlow === 'firstMpinSetup' ? 'Set 4-Digit MPIN' : 'Create 4-Digit MPIN'}
                  </label>
                  <PinInput length={4} value={mpin} onChange={setMpin} autoFocus />
                  <label className={helperLabelClass}>
                    Confirm MPIN
                  </label>
                  <PinInput length={4} value={mpinConfirm} onChange={setMpinConfirm} />
                  <button type="button" className={buttonClass} onClick={handleSetMpinRegister} disabled={loading}>
                    {loading ? (authFlow === 'register' ? 'Creating Account...' : 'Saving MPIN...') : (authFlow === 'register' ? 'Create Account' : 'Save MPIN & Login')}
                  </button>
                </>
              )}

              {/* STEP: MPIN LOGIN */}
              {step === STEPS.MPIN && (
                <>
                  <label className={helperLabelClass}>
                    Enter 4-Digit MPIN
                  </label>
                  <PinInput length={4} value={mpin} onChange={setMpin} autoFocus />
                  <button type="button" className={buttonClass} onClick={handleMpinLogin} disabled={loading}>
                    {loading ? 'Logging in...' : 'Login'}
                  </button>
                  <p onClick={handleForgotMpin} className="mt-4 cursor-pointer text-center text-[13px] font-medium text-[#1d1c20] underline">
                    Forgot MPIN?
                  </p>
                </>
              )}

              {/* STEP: RESET OTP (forgot MPIN) */}
              {step === STEPS.RESET_OTP && (
                <>
                  <label className={helperLabelClass}>
                    Enter 6-digit OTP
                  </label>
                  <PinInput length={6} value={otp} onChange={setOtp} autoFocus />
                  <button type="button" className={buttonClass} onClick={handleVerifyResetOTP} disabled={loading}>
                    {loading ? 'Verifying...' : 'Verify OTP'}
                  </button>
                </>
              )}

              {/* STEP: RESET MPIN (after OTP verification) */}
              {step === STEPS.RESET_MPIN && (
                <>
                  <label className={helperLabelClass}>
                    New 4-Digit MPIN
                  </label>
                  <PinInput length={4} value={mpin} onChange={setMpin} autoFocus />
                  <label className={helperLabelClass}>
                    Confirm MPIN
                  </label>
                  <PinInput length={4} value={mpinConfirm} onChange={setMpinConfirm} />
                  <button type="button" className={buttonClass} onClick={handleResetMpin} disabled={loading}>
                    {loading ? 'Resetting...' : 'Reset MPIN & Login'}
                  </button>
                </>
              )}

            </div>
          </section>
        </div>
      </main>
    </div>
  )
}

export default LoginAccountPage
