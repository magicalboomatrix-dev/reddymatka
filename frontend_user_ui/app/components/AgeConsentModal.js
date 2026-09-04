'use client';

import React, { useState } from 'react';
import { useAuth } from '../lib/AuthContext';
import { userAPI } from '../lib/api';

export default function AgeConsentModal() {
  const { user, isLoggedIn, updateUser } = useAuth();
  const [agreed, setAgreed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  // Only display if user is logged in AND has not yet confirmed 18+ consent
  if (!isLoggedIn || !user) return null;
  if (user.is_18_plus === true || user.is_18_plus === 1 || user.is_18_plus === '1') {
    return null;
  }

  const handleConfirm = async () => {
    if (!agreed) {
      setError('You must check the box to confirm you are 18+ years of age.');
      return;
    }

    setError('');
    setSubmitting(true);

    try {
      await userAPI.confirmAgeConsent(true);
      updateUser({ is_18_plus: true });
    } catch (err) {
      setError(err?.message || 'Failed to record age consent. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/85 p-4 backdrop-blur-sm animate-fadeIn">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl border border-amber-300">
        <div className="flex items-center justify-center mb-4">
          <div className="w-14 h-14 rounded-full bg-amber-100 border border-amber-300 flex items-center justify-center text-amber-700">
            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
          </div>
        </div>

        <h3 className="text-xl font-bold text-center text-gray-900 mb-1">
          Compliance & Age Verification
        </h3>
        <p className="text-xs text-center text-gray-500 mb-4">
          Action required to continue using REDDYMATKA
        </p>

        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-xs text-amber-950 space-y-2 mb-4 leading-relaxed">
          <div className="font-bold flex items-center gap-1.5 text-amber-900 text-sm">
            <span>⚠️</span> Educational Purpose Disclaimer
          </div>
          <p>
            This platform is strictly for <strong>educational and entertainment purposes</strong> only.
          </p>
          <p>
            <strong>No real money is involved.</strong> All games, odds, points, and balances on this platform are virtual simulations.
          </p>
        </div>

        {error && (
          <div className="mb-3 p-2.5 bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg font-medium text-center">
            {error}
          </div>
        )}

        <label className="flex items-start gap-3 p-3 bg-gray-50 border border-gray-200 rounded-xl cursor-pointer hover:bg-gray-100 transition-colors mb-5">
          <input
            type="checkbox"
            checked={agreed}
            onChange={(e) => {
              setAgreed(e.target.checked);
              if (e.target.checked) setError('');
            }}
            className="mt-0.5 w-4 h-4 text-amber-600 rounded border-gray-300 focus:ring-amber-500 cursor-pointer"
          />
          <span className="text-xs text-gray-800 font-medium leading-normal">
            I confirm that I am <strong>18 years of age or older (18+ Age Consent)</strong> and accept the educational disclaimer and platform terms.
          </span>
        </label>

        <button
          onClick={handleConfirm}
          disabled={!agreed || submitting}
          className={`w-full py-3 px-4 rounded-xl text-sm font-bold text-white transition-all shadow-md flex items-center justify-center gap-2 ${
            agreed && !submitting
              ? 'bg-gradient-to-r from-amber-600 to-amber-700 hover:from-amber-700 hover:to-amber-800 cursor-pointer active:scale-[0.98]'
              : 'bg-gray-300 cursor-not-allowed opacity-60'
          }`}
        >
          {submitting ? (
            <>
              <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              Recording Verification...
            </>
          ) : (
            'Agree & Continue'
          )}
        </button>

        <p className="text-[11px] text-gray-400 text-center mt-3">
          Verification is mandatory under platform compliance rules.
        </p>
      </div>
    </div>
  );
}
