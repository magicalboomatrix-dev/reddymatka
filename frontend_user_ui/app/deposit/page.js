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
  }

  const handleProceedToPay = async (e) => {
    e.preventDefault()
    setError('')

    const parsed = parseFloat(amount)
    if (!parsed || isNaN(parsed) || parsed <= 0) {
      setError('Please enter a valid deposit amount')
      return
    }

    if (parsed < depositLimits.min) {
      setError(`Minimum deposit amount is ₹${depositLimits.min}`)
      return
    }

    if (parsed > depositLimits.max) {
      setError(`Maximum deposit amount is ₹${depositLimits.max.toLocaleString('en-IN')}`)
      return
    }

    setLoading(true)
    try {
      const res = await depositAPI.createOrder(parsed)
      if (res.paymentUrl) {
        // Redirect user to the secure Juspay payment checkout
        window.location.href = res.paymentUrl
      } else {
        throw new Error('No payment URL received from gateway')
      }
    } catch (err) {
      setError(err.message || 'Failed to initialize payment. Please try again.')
      setLoading(false)
    }
  }

  return (
    <div>
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

            <form onSubmit={handleProceedToPay}>
              <label className="mb-1 block text-xs font-bold text-gray-700">
                {t(translations.deposit.enterAmount)} (₹)
              </label>

              <div className="relative mb-3">
                <span className="absolute left-3 top-2.5 text-base font-bold text-gray-500">₹</span>
                <input
                  className="h-11 w-full rounded border border-[#d8d1c4] bg-[#faf7f0] pl-8 pr-4 text-base font-semibold text-gray-800 focus:border-[#d6b774] focus:outline-none"
                  type="number"
                  placeholder={`Min ₹${depositLimits.min} - Max ₹${depositLimits.max}`}
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  min={depositLimits.min}
                  max={depositLimits.max}
                  disabled={loading}
                  required
                />
              </div>

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
                      <p className="text-[10px] text-gray-500">Powered by Juspay Payment Gateway</p>
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
                    <tr key={order.id} className="border-b border-[#f0e3c6] hover:bg-amber-50/40">
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
