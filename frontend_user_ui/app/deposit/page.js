'use client'
import React, { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import DepositWithdrawBtns from '../components/DepositWithdrawBtns'
import { depositAPI, userAPI } from '../lib/api'
import { useTranslation } from '../lib/LanguageContext'
import { translations } from '../lib/translations'

const QUICK_AMOUNTS = [200, 500, 1000, 2000, 5000, 10000]

function getStatusBadge(status) {
  switch (status) {
    case 'completed':
      return <span className="inline-block rounded bg-green-100 px-2 py-0.5 text-[10px] font-bold text-green-700">✓ Credited</span>
    case 'pending':
      return <span className="inline-block rounded bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-700">⏳ Pending</span>
    case 'failed':
      return <span className="inline-block rounded bg-red-100 px-2 py-0.5 text-[10px] font-bold text-red-700">✗ Failed</span>
    case 'cancelled':
      return <span className="inline-block rounded bg-gray-100 px-2 py-0.5 text-[10px] font-bold text-gray-700">Cancelled</span>
    default:
      return <span className="inline-block rounded bg-gray-100 px-2 py-0.5 text-[10px] font-semibold text-gray-700">{status}</span>
  }
}

const DepositPage = () => {
  const router = useRouter()
  const { t } = useTranslation()
  const [amount, setAmount] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [depositHistory, setDepositHistory] = useState([])
  const [depositLimits, setDepositLimits] = useState({ min: 100, max: 50000 })
  const [depositGuidelines, setDepositGuidelines] = useState([])
  const [limitModal, setLimitModal] = useState({
    isOpen: false,
    type: 'min',
    enteredAmount: 0,
  })

  const fetchHistory = async () => {
    try {
      const res = await depositAPI.getMyDeposits({ page: 1, limit: 15 })
      setDepositHistory(res.deposits || [])
    } catch {}
  }

  useEffect(() => {
    userAPI.getUiConfig().then((res) => {
      setDepositGuidelines(res.deposit_guidelines || [])
      if (res.settings) {
        setDepositLimits({
          min: Number(res.settings.min_deposit) || 100,
          max: Number(res.settings.max_deposit) || 50000,
        })
      }
    }).catch(() => {})

    fetchHistory()
  }, [])

  const handleQuickAdd = (value) => {
    setAmount(String(value))
    setError('')
    setLimitModal({ isOpen: false, type: 'min', enteredAmount: 0 })
  }

  const handleProceedToPay = async (e) => {
    if (e && e.preventDefault) e.preventDefault()
    setError('')

    const parsed = parseFloat(amount)
    if (!parsed || isNaN(parsed) || parsed <= 0) {
      setLimitModal({
        isOpen: true,
        type: 'invalid',
        enteredAmount: parsed || 0,
      })
      return
    }

    if (parsed < depositLimits.min) {
      setLimitModal({
        isOpen: true,
        type: 'min',
        enteredAmount: parsed,
      })
      return
    }

    if (parsed > depositLimits.max) {
      setLimitModal({
        isOpen: true,
        type: 'max',
        enteredAmount: parsed,
      })
      return
    }

    setLoading(true)
    try {
      const res = await depositAPI.createOrder(parsed)
      const payUrl = res.intentUrl || res.paymentUrl
      if (payUrl) {
        const isMobile = typeof navigator !== 'undefined' && /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)
        router.push(`/deposit/status?order_id=${encodeURIComponent(res.orderId)}&intent=${encodeURIComponent(payUrl)}`)

        // On mobile, trigger the UPI intent to launch installed UPI apps
        if (isMobile && payUrl.startsWith('upi://')) {
          setTimeout(() => {
            window.location.href = payUrl
          }, 200)
        }
      } else {
        throw new Error('No payment details received from gateway')
      }
    } catch (err) {
      setError(err.message || 'Failed to initialize payment. Please try again.')
      setLoading(false)
    }
  }

  return (
    <div>
      {/* Professional Deposit Limit Modal */}
      {limitModal.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-xs animate-fadeIn">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl border border-amber-300 text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-amber-100 border border-amber-300 text-amber-700 shadow-sm">
              <svg className="h-7 w-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>

            <h3 className="text-lg font-bold text-gray-900">
              {limitModal.type === 'min' ? 'Minimum Deposit Required' : limitModal.type === 'max' ? 'Maximum Limit Exceeded' : 'Invalid Amount'}
            </h3>

            <p className="mt-1.5 text-xs text-gray-500 leading-relaxed">
              {limitModal.type === 'min'
                ? `The deposit amount is below the minimum allowed limit.`
                : limitModal.type === 'max'
                ? `The deposit amount exceeds the maximum allowed transaction limit.`
                : 'Please enter a valid deposit amount to proceed.'}
            </p>

            {limitModal.type === 'min' && (
              <div className="my-4 rounded-xl bg-gradient-to-br from-amber-50 to-orange-50 border border-amber-200 p-3.5 text-xs space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-gray-600">You Entered:</span>
                  <span className="font-bold text-red-600">₹{Number(limitModal.enteredAmount || 0).toLocaleString('en-IN')}</span>
                </div>
                <div className="h-px bg-amber-200/70" />
                <div className="flex items-center justify-between">
                  <span className="text-gray-700 font-semibold">Minimum Required:</span>
                  <span className="text-sm font-black text-amber-900">₹{depositLimits.min.toLocaleString('en-IN')}</span>
                </div>
              </div>
            )}

            {limitModal.type === 'max' && (
              <div className="my-4 rounded-xl bg-gradient-to-br from-amber-50 to-orange-50 border border-amber-200 p-3.5 text-xs space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-gray-600">You Entered:</span>
                  <span className="font-bold text-red-600">₹{Number(limitModal.enteredAmount || 0).toLocaleString('en-IN')}</span>
                </div>
                <div className="h-px bg-amber-200/70" />
                <div className="flex items-center justify-between">
                  <span className="text-gray-700 font-semibold">Maximum Allowed:</span>
                  <span className="text-sm font-black text-amber-900">₹{depositLimits.max.toLocaleString('en-IN')}</span>
                </div>
              </div>
            )}

            <div className="mt-5 space-y-2">
              {limitModal.type === 'min' && (
                <button
                  type="button"
                  onClick={() => {
                    setAmount(String(depositLimits.min))
                    setLimitModal({ isOpen: false, type: 'min', enteredAmount: 0 })
                  }}
                  className="w-full rounded-xl bg-gradient-to-r from-amber-600 to-amber-700 py-3 text-sm font-bold text-white shadow-md hover:from-amber-700 hover:to-amber-800 active:scale-[0.98] transition-all cursor-pointer"
                >
                  Deposit ₹{depositLimits.min.toLocaleString('en-IN')} Instead
                </button>
              )}
              <button
                type="button"
                onClick={() => setLimitModal({ isOpen: false, type: 'min', enteredAmount: 0 })}
                className="w-full rounded-xl border border-gray-200 bg-gray-50 py-2.5 text-xs font-semibold text-gray-700 hover:bg-gray-100 active:scale-[0.98] transition-colors cursor-pointer"
              >
                Change Amount
              </button>
            </div>
          </div>
        </div>
      )}

      <header className="sticky top-0 z-40 mx-auto flex w-full max-w-107.5 items-center bg-white px-4 py-3 shadow-sm">
        <button type="button" onClick={() => router.push('/home')} className="mr-3 inline-flex">
          <img alt="back" src="/images/back-btn.png" className="h-5 w-5" />
        </button>
        <h3 className="flex-1 text-center text-sm font-semibold text-[#111]">
          {t(translations.deposit.title)}
        </h3>
      </header>

      <div className="bg-white pb-6">
        <DepositWithdrawBtns />

        <div className="mx-auto w-full max-w-107.5 px-3">
          <div className="border border-[#d6b774] bg-white p-4 shadow-[0_12px_28px_rgba(79,52,10,0.08)]">

            {error && (
              <div className="mb-3 rounded border border-red-200 bg-red-50 p-2.5 text-xs text-red-600">
                {error}
              </div>
            )}

            <form onSubmit={handleProceedToPay} noValidate>
              <label className="mb-1 block text-xs font-bold text-gray-700">
                {t(translations.deposit.enterAmount)} (₹)
              </label>

              <div className="relative mb-2">
                <span className="absolute left-3 top-2.5 text-base font-bold text-gray-500">₹</span>
                <input
                  className={`h-11 w-full rounded border bg-[#faf7f0] pl-8 pr-4 text-base font-semibold text-gray-800 transition-colors focus:outline-none ${
                    amount && Number(amount) > 0 && Number(amount) < depositLimits.min
                      ? 'border-amber-400 bg-amber-50/40 focus:border-amber-500'
                      : 'border-[#d8d1c4] focus:border-[#d6b774]'
                  }`}
                  type="number"
                  placeholder={`Min ₹${depositLimits.min} - Max ₹${depositLimits.max.toLocaleString('en-IN')}`}
                  value={amount}
                  onChange={(e) => {
                    setAmount(e.target.value)
                    if (error) setError('')
                  }}
                  disabled={loading}
                />
              </div>

              {/* Real-time minimum hint if entered amount is below min */}
              {amount && Number(amount) > 0 && Number(amount) < depositLimits.min && (
                <div className="mb-3 flex items-center justify-between rounded-md border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-[11px] text-amber-800">
                  <span className="font-medium">⚠️ Minimum required is ₹{depositLimits.min.toLocaleString('en-IN')}</span>
                  <button
                    type="button"
                    onClick={() => setAmount(String(depositLimits.min))}
                    className="font-bold underline text-amber-900 hover:text-black cursor-pointer"
                  >
                    Set to ₹{depositLimits.min}
                  </button>
                </div>
              )}

              {/* Quick Amount Selectors */}
              <div className="mb-4">
                <div className="mb-1.5 text-[11px] font-medium text-gray-500">Quick Select:</div>
                <div className="grid grid-cols-3 gap-2">
                  {QUICK_AMOUNTS.map((val) => (
                    <button
                      key={val}
                      type="button"
                      onClick={() => handleQuickAdd(val)}
                      disabled={loading}
                      className={`h-9 rounded border text-xs font-bold transition-all ${
                        Number(amount) === val
                          ? 'border-[#d6b774] bg-[#fef8ea] text-[#92400e]'
                          : 'border-gray-200 bg-gray-50 text-gray-700 hover:bg-gray-100'
                      }`}
                    >
                      +₹{val.toLocaleString('en-IN')}
                    </button>
                  ))}
                </div>
              </div>

              {/* Gateway Brand Badge */}
              <div className="mb-4 rounded-lg border border-amber-200 bg-gradient-to-r from-amber-50 to-orange-50 p-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">🔒</span>
                    <div>
                      <p className="text-xs font-bold text-gray-800">100% Secure Payment</p>
                      <p className="text-[10px] text-gray-500">Powered by Spark Pay Gateway</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 text-[11px] font-semibold text-green-700">
                    <span>⚡ Instant Credit</span>
                  </div>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-1.5 border-t border-amber-200/60 pt-2 text-[10px] text-gray-600">
                  <span className="rounded bg-white px-1.5 py-0.5 shadow-xs font-medium">GPay</span>
                  <span className="rounded bg-white px-1.5 py-0.5 shadow-xs font-medium">PhonePe</span>
                  <span className="rounded bg-white px-1.5 py-0.5 shadow-xs font-medium">Paytm</span>
                  <span className="rounded bg-white px-1.5 py-0.5 shadow-xs font-medium">CRED / UPI</span>
                  <span className="rounded bg-white px-1.5 py-0.5 shadow-xs font-medium">Net Banking</span>
                  <span className="rounded bg-white px-1.5 py-0.5 shadow-xs font-medium">Cards</span>
                </div>
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                disabled={loading}
                className="h-11 w-full rounded bg-[#111] text-sm font-bold text-white shadow-md transition-all hover:bg-black disabled:opacity-60"
              >
                {loading ? 'Connecting to Payment Gateway...' : `Proceed to Pay ₹${amount ? Number(amount).toLocaleString('en-IN') : ''}`}
              </button>
            </form>
          </div>

          {/* Deposit Guidelines */}
          <div className="mt-4 border border-[#d6b774] bg-white p-3 shadow-[0_12px_28px_rgba(79,52,10,0.08)]">
            <h4 className="mb-1 text-xs font-bold text-gray-800">Important Instructions:</h4>
            <div className="space-y-1 text-[11px] text-gray-600">
              {(depositGuidelines.length > 0 ? depositGuidelines : [
                `Minimum deposit amount is ₹${depositLimits.min}.`,
                `Maximum deposit amount is ₹${depositLimits.max.toLocaleString('en-IN')}.`,
                'You will be redirected to the secure payment page to complete your deposit.',
                'Supports all UPI apps (GPay, PhonePe, Paytm), Netbanking, and Debit Cards.',
                'Your wallet balance updates immediately upon successful payment confirmation.',
              ]).map((rule, idx) => (
                <p key={idx} className="flex items-start gap-1">
                  <span className="text-[#92400e] font-bold">{idx + 1}.</span>
                  <span>{rule}</span>
                </p>
              ))}
            </div>
          </div>

          {/* Deposit History */}
          <div className="mt-4">
            <h4 className="mb-2 text-xs font-bold text-gray-800">Deposit History</h4>
            <div className="overflow-x-auto border border-[#ead8ab] rounded bg-white">
              <table className="w-full border-collapse text-left text-xs text-[#111]">
                <thead>
                  <tr className="border-b border-[#ead8ab] bg-[#f7f0e3]">
                    <th className="px-3 py-2">Order ID</th>
                    <th className="px-3 py-2">Amount</th>
                    <th className="px-3 py-2">Mode</th>
                    <th className="px-3 py-2">Status</th>
                    <th className="px-3 py-2">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {depositHistory.map((order) => (
                    <tr
                      key={order.id}
                      onClick={() => {
                        if (order.order_id) {
                          router.push(`/deposit/status?order_id=${encodeURIComponent(order.order_id)}`)
                        }
                      }}
                      className="border-b border-[#f0e3c6] hover:bg-amber-50/60 cursor-pointer transition-colors"
                    >
                      <td className="px-3 py-2 font-mono text-[11px] text-gray-600 truncate max-w-[100px]">
                        {order.order_id || `#${order.id}`}
                      </td>
                      <td className="px-3 py-2 font-bold text-gray-800">
                        ₹{parseFloat(order.amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="px-3 py-2 text-[11px] text-gray-600">
                        {order.payment_method || 'UPI'}
                      </td>
                      <td className="px-3 py-2">
                        {getStatusBadge(order.status)}
                      </td>
                      <td className="px-3 py-2 text-[11px] text-gray-500 whitespace-nowrap">
                        {order.created_at ? new Date(order.created_at).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' }) : '-'}
                      </td>
                    </tr>
                  ))}
                  {depositHistory.length === 0 && (
                    <tr>
                      <td className="px-3 py-6 text-center text-gray-400" colSpan="5">
                        No deposits found.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

        </div>
      </div>
    </div>
  )
}

export default DepositPage
