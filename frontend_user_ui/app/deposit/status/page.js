'use client'
import React, { useEffect, useState, useRef, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { depositAPI, userAPI } from '../../lib/api'

function StatusContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const orderId = searchParams.get('order_id') || searchParams.get('orderId')
  const paramIntent = searchParams.get('intent')
  const isMock = searchParams.get('mock') === 'true'

  const [loading, setLoading] = useState(true)
  const [checking, setChecking] = useState(false)
  const [deposit, setDeposit] = useState(null)
  const [error, setError] = useState('')
  const [walletBalance, setWalletBalance] = useState(null)
  const [copied, setCopied] = useState(false)
  const [isMobile, setIsMobile] = useState(false)
  const [showQr, setShowQr] = useState(false)
  const pollTimerRef = useRef(null)
  const pollCountRef = useRef(0)

  useEffect(() => {
    if (typeof navigator !== 'undefined') {
      const mobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)
      setIsMobile(mobile)
      setShowQr(!mobile) // Show QR by default on desktop, hide on mobile
    }
  }, [])

  const checkStatus = async (isManual = false) => {
    if (!orderId) return
    if (isManual) setChecking(true)

    try {
      const res = await depositAPI.getOrderStatus(orderId, isMock ? { mock: 'true' } : {})
      if (res && res.deposit) {
        setDeposit(res.deposit)
        setLoading(false)

        if (res.deposit.status === 'completed') {
          // Fetch updated balance on completion
          userAPI.getProfile().then((profile) => {
            if (profile?.wallet) {
              setWalletBalance(profile.wallet.balance)
            }
          }).catch(() => {})

          // Stop polling once completed
          if (pollTimerRef.current) {
            clearInterval(pollTimerRef.current)
            pollTimerRef.current = null
          }
        } else if (res.deposit.status === 'failed' || res.deposit.status === 'cancelled') {
          if (pollTimerRef.current) {
            clearInterval(pollTimerRef.current)
            pollTimerRef.current = null
          }
        }
      }
    } catch (err) {
      if (loading) {
        setError(err.message || 'Failed to verify payment status')
        setLoading(false)
      }
    } finally {
      if (isManual) setChecking(false)
    }
  }

  useEffect(() => {
    if (!orderId) {
      setError('Missing order ID. Unable to verify payment status.')
      setLoading(false)
      return
    }

    // Initial check
    checkStatus()

    // Poll every 3.5 seconds up to 60 times (~3.5 minutes) while pending
    pollCountRef.current = 0
    pollTimerRef.current = setInterval(() => {
      pollCountRef.current += 1
      if (pollCountRef.current > 60) {
        clearInterval(pollTimerRef.current)
        pollTimerRef.current = null
        return
      }
      checkStatus()
    }, 3500)

    return () => {
      if (pollTimerRef.current) {
        clearInterval(pollTimerRef.current)
      }
    }
  }, [orderId, isMock])

  if (loading) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center p-4 text-center">
        <div className="h-12 w-12 animate-spin rounded-full border-4 border-[#d6b774] border-t-transparent"></div>
        <h3 className="mt-4 text-base font-bold text-gray-800">Connecting to Spark Pay...</h3>
        <p className="mt-1 text-xs text-gray-500">Please wait while we initialize and verify your payment order.</p>
      </div>
    )
  }

  if (error || !deposit) {
    return (
      <div className="mx-auto max-w-md p-4 text-center">
        <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-full bg-red-100 text-3xl text-red-600">
          ✕
        </div>
        <h3 className="text-lg font-bold text-gray-800">Order Not Found</h3>
        <p className="mt-1 text-xs text-red-600">{error || 'Unable to retrieve payment details.'}</p>
        <button
          type="button"
          onClick={() => router.push('/deposit')}
          className="mt-6 w-full rounded bg-[#111] py-2.5 text-sm font-bold text-white shadow hover:bg-black"
        >
          Back to Deposit
        </button>
      </div>
    )
  }

  const isCompleted = deposit.status === 'completed'
  const isFailed = deposit.status === 'failed' || deposit.status === 'cancelled'
  const isPending = deposit.status === 'pending'
  const intentUrl = paramIntent || deposit.payment_url || ''

  const handleCopyUPI = () => {
    if (intentUrl && typeof navigator !== 'undefined') {
      navigator.clipboard.writeText(intentUrl).then(() => {
        setCopied(true)
        setTimeout(() => setCopied(false), 2500)
      }).catch(() => {})
    }
  }

  return (
    <div className="mx-auto w-full max-w-md p-4">
      <div className="rounded-xl border border-[#d6b774] bg-white p-6 text-center shadow-[0_12px_28px_rgba(79,52,10,0.08)]">
        
        {/* COMPLETED SUCCESS SCREEN */}
        {isCompleted && (
          <>
            <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-full bg-green-100 text-3xl text-green-600">
              ✓
            </div>
            <h2 className="text-lg font-bold text-green-700">Payment Successful!</h2>
            <p className="mt-1 text-xs text-gray-500">Your deposit has been credited to your wallet.</p>
            
            <div className="my-4 rounded-lg bg-green-50 border border-green-200 p-3">
              <span className="text-xs text-green-800 font-medium">Amount Credited</span>
              <div className="text-2xl font-black text-green-700">
                ₹{parseFloat(deposit.amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </div>
              {walletBalance !== null && (
                <div className="mt-1 text-xs font-semibold text-green-800">
                  New Wallet Balance: ₹{parseFloat(walletBalance).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </div>
              )}
            </div>
          </>
        )}

        {/* PENDING UPI PAYMENT SCREEN */}
        {isPending && (
          <>
            <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-amber-100 text-2xl text-amber-600">
              ₹
            </div>
            <h2 className="text-lg font-black text-gray-900">Complete Your UPI Payment</h2>
            <p className="mt-0.5 text-xs text-gray-500">
              Pay via any UPI app or scan the QR code below
            </p>

            {/* Amount Banner */}
            <div className="my-3 rounded-lg bg-gradient-to-r from-amber-50 to-orange-50 border border-[#d6b774] py-2.5 px-4">
              <div className="text-[11px] font-semibold text-amber-800 uppercase tracking-wider">Amount to Pay</div>
              <div className="text-2xl font-black text-[#111]">
                ₹{parseFloat(deposit.amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </div>
            </div>

            {/* Direct UPI App Buttons */}
            {intentUrl && (
              <div className="my-3 space-y-2">
                <a
                  href={intentUrl}
                  className="flex h-11 w-full items-center justify-center rounded-lg bg-[#111] text-sm font-bold text-white shadow hover:bg-black transition-colors"
                >
                  ⚡ Open in UPI App / Pay Now
                </a>

                <div className="grid grid-cols-3 gap-2 text-xs">
                  <a
                    href={intentUrl}
                    className="flex h-9 items-center justify-center rounded border border-gray-200 bg-gray-50 font-semibold text-gray-700 hover:bg-gray-100"
                  >
                    PhonePe
                  </a>
                  <a
                    href={intentUrl}
                    className="flex h-9 items-center justify-center rounded border border-gray-200 bg-gray-50 font-semibold text-gray-700 hover:bg-gray-100"
                  >
                    Google Pay
                  </a>
                  <a
                    href={intentUrl}
                    className="flex h-9 items-center justify-center rounded border border-gray-200 bg-gray-50 font-semibold text-gray-700 hover:bg-gray-100"
                  >
                    Paytm
                  </a>
                </div>

                <div className="flex items-center justify-between pt-1 px-1 text-[11px] text-gray-500">
                  <button
                    type="button"
                    onClick={handleCopyUPI}
                    className="font-medium hover:text-gray-800"
                  >
                    {copied ? '✓ UPI Link Copied!' : '📋 Copy UPI Link'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowQr(!showQr)}
                    className="font-medium text-[#92400e] hover:underline"
                  >
                    {showQr ? '▲ Hide QR Code' : '📷 Show QR Code'}
                  </button>
                </div>
              </div>
            )}

            {/* UPI QR Code (shown on desktop or when toggled on mobile) */}
            {intentUrl && showQr && (
              <div className="my-3 flex flex-col items-center justify-center rounded-lg border border-gray-200 bg-gray-50/50 p-3">
                <div className="rounded-xl border-2 border-[#d6b774] bg-white p-2.5 shadow-sm">
                  <img
                    src={`https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(intentUrl)}`}
                    alt="UPI Payment QR Code"
                    className="h-44 w-44 object-contain"
                  />
                </div>
                <span className="mt-2 text-[11px] font-medium text-gray-500">
                  Scan QR with PhonePe, GPay, Paytm, or CRED
                </span>
              </div>
            )}

            {/* Auto Check Indicator & Manual Button */}
            <div className="mt-4 rounded-lg bg-gray-50 border border-gray-200 p-3 text-xs text-gray-600">
              <div className="flex items-center justify-center gap-2">
                <span className="inline-block h-2.5 w-2.5 animate-ping rounded-full bg-green-500"></span>
                <span className="text-[11px] font-medium text-gray-700">Waiting for payment confirmation...</span>
              </div>
              <p className="mt-1 text-[10px] text-gray-500">
                Your wallet balance will update automatically within 10-30 seconds after completing payment in your UPI app.
              </p>

              <button
                type="button"
                onClick={() => checkStatus(true)}
                disabled={checking}
                className="mt-2.5 w-full rounded border border-[#d6b774] bg-[#fef8ea] py-1.5 text-xs font-bold text-[#92400e] hover:bg-[#faeed0] disabled:opacity-60"
              >
                {checking ? 'Checking Status...' : '🔄 I Have Paid (Check Status Now)'}
              </button>
            </div>
          </>
        )}

        {/* FAILED SCREEN */}
        {isFailed && (
          <>
            <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-full bg-red-100 text-3xl text-red-600">
              ✗
            </div>
            <h2 className="text-lg font-bold text-red-700">Payment Failed</h2>
            <p className="mt-1 text-xs text-gray-600">
              {deposit.failure_reason || 'The transaction was cancelled, expired, or declined by your bank.'}
            </p>
            <div className="my-4 rounded-lg bg-red-50 border border-red-200 p-3">
              <span className="text-xs text-red-800">Amount</span>
              <div className="text-2xl font-black text-red-700">
                ₹{parseFloat(deposit.amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </div>
            </div>
          </>
        )}

        {/* Transaction Summary Details */}
        <div className="mt-4 space-y-2 border-t border-gray-100 pt-3 text-left text-xs">
          <div className="flex justify-between">
            <span className="text-gray-500">Order Ref:</span>
            <span className="font-mono font-semibold text-gray-800">{deposit.order_id}</span>
          </div>
          {deposit.utr_number && (
            <div className="flex justify-between">
              <span className="text-gray-500">UTR / Ref:</span>
              <span className="font-mono font-semibold text-gray-800">{deposit.utr_number}</span>
            </div>
          )}
          <div className="flex justify-between">
            <span className="text-gray-500">Payment Gateway:</span>
            <span className="font-medium text-gray-800 uppercase">Spark Pay</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Date & Time:</span>
            <span className="text-gray-800">
              {deposit.created_at ? new Date(deposit.created_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }) : '-'}
            </span>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="mt-6 flex flex-col gap-2">
          {isCompleted ? (
            <button
              type="button"
              onClick={() => router.push('/home')}
              className="w-full rounded bg-[#111] py-2.5 text-sm font-bold text-white shadow hover:bg-black"
            >
              Play Games Now
            </button>
          ) : (
            <button
              type="button"
              onClick={() => router.push('/deposit')}
              className="w-full rounded border border-gray-300 bg-white py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50"
            >
              Cancel / Back to Deposit
            </button>
          )}
          <button
            type="button"
            onClick={() => router.push('/account-statement')}
            className="w-full rounded border border-gray-200 bg-gray-50 py-2 text-xs font-semibold text-gray-600 hover:bg-gray-100"
          >
            View Account Statement
          </button>
        </div>

      </div>
    </div>
  )
}

export default function DepositStatusPage() {
  return (
    <Suspense fallback={
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-[#d6b774] border-t-transparent"></div>
      </div>
    }>
      <StatusContent />
    </Suspense>
  )
}
