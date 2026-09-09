'use client'
import React, { useEffect, useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { depositAPI, userAPI } from '../../lib/api'

function StatusContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const orderId = searchParams.get('order_id') || searchParams.get('orderId')
  const isMock = searchParams.get('mock') === 'true'

  const [loading, setLoading] = useState(true)
  const [deposit, setDeposit] = useState(null)
  const [error, setError] = useState('')
  const [walletBalance, setWalletBalance] = useState(null)

  useEffect(() => {
    if (!orderId) {
      setError('Missing order ID. Unable to verify payment status.')
      setLoading(false)
      return
    }

    let isMounted = true
    const checkStatus = async () => {
      try {
        const res = await depositAPI.getOrderStatus(orderId, isMock ? { mock: 'true' } : {})
        if (isMounted) {
          setDeposit(res.deposit)
          setLoading(false)

          // Fetch updated wallet balance
          userAPI.getProfile().then((profile) => {
            if (isMounted && profile?.wallet) {
              setWalletBalance(profile.wallet.balance)
            }
          }).catch(() => {})
        }
      } catch (err) {
        if (isMounted) {
          setError(err.message || 'Failed to verify payment status')
          setLoading(false)
        }
      }
    }

    checkStatus()

    // Poll once more after 3 seconds if status is still pending
    const timer = setTimeout(() => {
      if (isMounted) checkStatus()
    }, 3000)

    return () => {
      isMounted = false
      clearTimeout(timer)
    }
  }, [orderId, isMock])

  if (loading) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center p-4 text-center">
        <div className="h-12 w-12 animate-spin rounded-full border-4 border-[#d6b774] border-t-transparent"></div>
        <h3 className="mt-4 text-base font-bold text-gray-800">Verifying Payment Status...</h3>
        <p className="mt-1 text-xs text-gray-500">Please wait while we confirm your transaction with Juspay.</p>
      </div>
    )
  }

  if (error || !deposit) {
    return (
      <div className="mx-auto max-w-md p-4 text-center">
        <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-full bg-red-100 text-3xl text-red-600">
          ✕
        </div>
        <h3 className="text-lg font-bold text-gray-800">Verification Error</h3>
        <p className="mt-1 text-xs text-red-600">{error || 'Unable to retrieve order details.'}</p>
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

  return (
    <div className="mx-auto w-full max-w-md p-4">
      <div className="rounded-xl border border-[#d6b774] bg-white p-6 text-center shadow-[0_12px_28px_rgba(79,52,10,0.08)]">
        {isCompleted && (
          <>
            <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-full bg-green-100 text-3xl text-green-600">
              ✓
            </div>
            <h2 className="text-lg font-bold text-green-700">Payment Successful!</h2>
            <p className="mt-1 text-xs text-gray-500">Your deposit has been credited to your wallet.</p>
            <div className="my-4 rounded-lg bg-green-50 border border-green-200 p-3">
              <span className="text-xs text-green-800">Amount Credited</span>
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

        {isPending && (
          <>
            <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-full bg-amber-100 text-3xl text-amber-600">
              ⏳
            </div>
            <h2 className="text-lg font-bold text-amber-700">Payment Processing</h2>
            <p className="mt-1 text-xs text-gray-600">
              We have received your request. Your bank is confirming the transaction and your wallet balance will be updated automatically.
            </p>
            <div className="my-4 rounded-lg bg-amber-50 border border-amber-200 p-3">
              <span className="text-xs text-amber-800">Amount</span>
              <div className="text-2xl font-black text-amber-700">
                ₹{parseFloat(deposit.amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </div>
            </div>
          </>
        )}

        {isFailed && (
          <>
            <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-full bg-red-100 text-3xl text-red-600">
              ✗
            </div>
            <h2 className="text-lg font-bold text-red-700">Payment Failed</h2>
            <p className="mt-1 text-xs text-gray-600">
              {deposit.failure_reason || 'The transaction was cancelled or declined by your bank.'}
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
            <span className="font-medium text-gray-800 uppercase">Juspay</span>
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
              className="w-full rounded bg-[#111] py-2.5 text-sm font-bold text-white shadow hover:bg-black"
            >
              Try Deposit Again
            </button>
          )}
          <button
            type="button"
            onClick={() => router.push('/account-statement')}
            className="w-full rounded border border-gray-300 bg-white py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50"
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
