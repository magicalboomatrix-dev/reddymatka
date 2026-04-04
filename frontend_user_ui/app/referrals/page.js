'use client'
import React, { useState, useEffect } from 'react'
import Header from '../components/Header'
import DepositWithdrawBtns from '../components/DepositWithdrawBtns'
import { bonusAPI } from '../lib/api'

export default function ReferralsPage() {
  const [referrals, setReferrals] = useState([])
  const [referralCode, setReferralCode] = useState('')
  const [loading, setLoading] = useState(true)
  const [claiming, setClaiming] = useState(false)
  const [claimMsg, setClaimMsg] = useState(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    fetchReferrals()
  }, [])

  const fetchReferrals = async () => {
    setLoading(true)
    try {
      const res = await bonusAPI.referrals()
      setReferrals(res.referrals || [])
      setReferralCode(res.referral_code || '')
    } catch (err) {
      console.error('[referrals] fetch error:', err)
    } finally {
      setLoading(false)
    }
  }

  const claimDaily = async () => {
    setClaiming(true)
    setClaimMsg(null)
    try {
      const res = await bonusAPI.claimDaily()
      setClaimMsg({ type: 'success', text: res.message || `₹${res.bonus_amount} credited!` })
    } catch (err) {
      const msg = err?.message || 'Could not claim bonus.'
      setClaimMsg({ type: 'error', text: msg })
    } finally {
      setClaiming(false)
    }
  }

  const copyCode = () => {
    if (!referralCode) return
    navigator.clipboard.writeText(referralCode).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  return (
    <div>
      <Header />
      <div className="bg-white pb-6">
        <DepositWithdrawBtns />
        <div className="mx-auto w-full max-w-[430px] space-y-0">

          {/* Daily bonus card */}
          <div className="bg-[linear-gradient(94deg,#b6842d,#ebda8d_55%,#b7862f)] px-4 py-2.5 text-center text-[#111]">
            <h2 className="text-sm font-semibold uppercase tracking-[0.08em]"><b>Daily Bonus</b></h2>
          </div>
          <div className="border border-t-0 border-[#d6b774] bg-white px-4 py-4 text-center shadow-[0_12px_28px_rgba(79,52,10,0.08)]">
            <p className="mb-3 text-xs text-gray-500">Claim your free daily bonus once every 24 hours.</p>
            <button
              onClick={claimDaily}
              disabled={claiming}
              className="h-10 w-full bg-[#111] text-sm font-semibold text-[#ebda8d] disabled:opacity-50"
            >
              {claiming ? 'Claiming…' : 'Claim Daily Bonus'}
            </button>
            {claimMsg && (
              <p className={`mt-2 text-xs font-medium ${claimMsg.type === 'success' ? 'text-green-600' : 'text-red-600'}`}>
                {claimMsg.text}
              </p>
            )}
          </div>

          {/* Referral code */}
          <div className="mt-4 bg-[linear-gradient(94deg,#b6842d,#ebda8d_55%,#b7862f)] px-4 py-2.5 text-center text-[#111]">
            <h2 className="text-sm font-semibold uppercase tracking-[0.08em]"><b>Refer &amp; Earn</b></h2>
          </div>
          <div className="border border-t-0 border-[#d6b774] bg-white px-4 py-4 shadow-[0_12px_28px_rgba(79,52,10,0.08)]">
            {referralCode && (
              <div className="mb-4 flex items-center gap-2">
                <span className="flex-1 font-mono text-sm font-semibold border border-[#d8d1c4] bg-[#faf7f0] px-3 py-2 text-center tracking-widest">
                  {referralCode}
                </span>
                <button
                  onClick={copyCode}
                  className="shrink-0 px-4 py-2 text-xs font-semibold bg-[#111] text-[#ebda8d]"
                >
                  {copied ? 'Copied!' : 'Copy'}
                </button>
              </div>
            )}
            <p className="text-xs text-gray-500 text-center">
              Share your code and earn a bonus when your friend makes their first deposit.
            </p>
          </div>

          {/* Referral history */}
          {referrals.length > 0 && (
            <>
              <div className="mt-4 bg-[linear-gradient(94deg,#b6842d,#ebda8d_55%,#b7862f)] px-4 py-2.5 text-center text-[#111]">
                <h2 className="text-sm font-semibold uppercase tracking-[0.08em]"><b>Referral History</b></h2>
              </div>
              <div className="border border-t-0 border-[#d6b774] bg-white shadow-[0_12px_28px_rgba(79,52,10,0.08)]">
                <table className="w-full text-xs text-[#111]">
                  <thead>
                    <tr>
                      <th className="border-b border-[#ead8ab] bg-[#f7f0e3] px-3 py-2 text-left">User</th>
                      <th className="border-b border-[#ead8ab] bg-[#f7f0e3] px-3 py-2 text-right">Bonus</th>
                      <th className="border-b border-[#ead8ab] bg-[#f7f0e3] px-3 py-2 text-left">Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {referrals.map((r) => (
                      <tr key={r.id} className="border-b border-[#f0e3c6]">
                        <td className="px-3 py-2">{r.referred_name || r.referred_phone}</td>
                        <td className="px-3 py-2 text-right text-green-700 font-semibold">₹{parseFloat(r.bonus_amount || 0).toLocaleString()}</td>
                        <td className="px-3 py-2 text-gray-400">
                          {new Date(r.created_at).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {loading && (
            <div className="py-8 text-center text-sm text-gray-400">Loading…</div>
          )}
        </div>
      </div>
    </div>
  )
}
