'use client'

import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { useState, useEffect, useCallback } from 'react'
import Header from '../components/Header'
import Footer from '../components/Footer'
import { withdrawAPI } from '../lib/api'


function formatCurrency(value) {
  return `₹${Number(value || 0).toLocaleString('en-IN')}`
}

export default function SuccessPage() {
  const searchParams = useSearchParams()

  const type = searchParams.get('type') || 'bet'
  const market = searchParams.get('market') || '-'
  const betType = searchParams.get('betType') || '-'
  const number = searchParams.get('number') || '-'
  const amount = searchParams.get('amount') || '0'
  const bank = searchParams.get('bank') || '-'
  const txId = searchParams.get('tx') || 'TXN_PENDING'
  const primaryOverride = searchParams.get('primary')
  const secondaryOverride = searchParams.get('secondary')

  const isWithdraw = type === 'withdraw'

  // Extract withdrawal ID from txId format: TXN_WR_{id}_{timestamp}
  const withdrawId = isWithdraw ? (() => {
    const match = txId.match(/^TXN_WR_(\d+)_/)
    return match ? match[1] : null
  })() : null

  // Live status polling for withdrawal requests
  const [liveStatus, setLiveStatus] = useState(null)

  const fetchWithdrawStatus = useCallback(async () => {
    if (!withdrawId) return
    try {
      const res = await withdrawAPI.history({ page: 1, limit: 20 })
      const withdrawals = res.withdrawals || []
      const match = withdrawals.find(w => String(w.id) === withdrawId)
      if (match) {
        setLiveStatus(match.status)
      }
    } catch {
      // ignore — will retry on next poll
    }
  }, [withdrawId])

  useEffect(() => {
    if (!isWithdraw || !withdrawId) return
    fetchWithdrawStatus()
    const interval = setInterval(fetchWithdrawStatus, 10000) // poll every 10s
    return () => clearInterval(interval)
  }, [isWithdraw, withdrawId, fetchWithdrawStatus])

  const displayStatus = liveStatus || 'pending'
  const isApproved = displayStatus === 'approved'
  const isRejected = displayStatus === 'rejected'
  const isPending = !isApproved && !isRejected

  const title = isWithdraw
    ? (isApproved ? 'Withdrawal Approved!' : isRejected ? 'Withdrawal Rejected' : 'Withdrawal Request Submitted!')
    : 'Bet Placed Successfully!'
  const subtitle = isWithdraw
    ? (isApproved ? 'Your withdrawal has been approved and is being processed.'
      : isRejected ? 'Your withdrawal request was rejected by admin.'
      : 'Your withdrawal request has been registered and is awaiting admin approval.')
    : 'Your ticket has been registered in our system.'

  const summaryTitle = isWithdraw ? 'REQUEST SUMMARY' : 'BET SUMMARY'
  const badge = isWithdraw ? (isApproved ? 'APPROVED' : isRejected ? 'REJECTED' : 'PENDING') : 'CONFIRMED'
  const badgeColor = isApproved ? 'bg-[#dcfce7] text-[#166534]' : isRejected ? 'bg-[#fee2e2] text-[#991b1b]' : 'bg-[#ffe082] text-[#6b5a3a]'

  const primaryLabel = isWithdraw ? 'GO TO WITHDRAW' : 'PLAY ANOTHER'
  const primaryHref = primaryOverride || (isWithdraw ? '/withdraw' : '/home')
  const secondaryLabel = isWithdraw ? 'GO TO WALLET' : 'GO TO MY BETS'
  const secondaryHref = secondaryOverride || (isWithdraw ? '/wallet' : '/my-bets')

  return (
    <div className="bg-[#f7f6f3]">
      <Header />
      <div className="flex flex-1 items-center justify-center">
        <div className="relative w-full overflow-hidden border border-[#eadcc0] bg-white shadow-[0_8px_24px_rgba(15,23,42,0.08)]">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_0%,rgba(247,197,45,0.07),transparent_40%),radial-gradient(circle_at_90%_90%,rgba(247,197,45,0.04),transparent_38%)]" />

        <div className="relative px-5 py-6 text-center text-[#6b5a3a]">
          <div className={`mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-full shadow-[0_0_0_10px_rgba(245,190,36,0.10)] ${isWithdraw && isApproved ? 'bg-[#dcfce7]' : isWithdraw && isRejected ? 'bg-[#fee2e2]' : 'bg-[#ffe082]'}`}>
            <i className={`fa ${isWithdraw && isRejected ? 'fa-times' : 'fa-check'} text-2xl ${isWithdraw && isApproved ? 'text-[#166534]' : isWithdraw && isRejected ? 'text-[#991b1b]' : 'text-[#6b5a3a]'}`} aria-hidden="true"></i>
          </div>

          <h1 className="text-[30px] font-black leading-[1.05] text-[#2f2410]">{title}</h1>
          <p className="mx-auto mt-2 max-w-70 text-sm font-medium text-[#b88422]">{subtitle}</p>

          <div className="mt-6 border border-[#eadcc0] bg-[#fff8e7] px-4 py-4 text-left">
            <div className="mb-3 flex items-center justify-between border-b border-[#f1e7d3] pb-2 text-[11px] font-bold uppercase tracking-[0.14em] text-[#b88422]">
              <span>{summaryTitle}</span>
              <span className={`px-2 py-1 text-[10px] ${isWithdraw ? badgeColor : 'bg-[#ffe082] text-[#6b5a3a]'}`}>{badge}</span>
            </div>

            {!isWithdraw && (
              <div className="space-y-2 text-sm text-[#6b5a3a]">
                <div className="flex items-center justify-between"><span className="text-[#b88422]">Market</span><strong className="text-[#2f2410]">{market}</strong></div>
                <div className="flex items-center justify-between"><span className="text-[#b88422]">Bet Type</span><strong className="text-[#2f2410]">{betType}</strong></div>
                <div className="flex items-center justify-between"><span className="text-[#b88422]">Number</span><span className="bg-[#ffe082] px-3 py-1 text-base font-black text-[#6b5a3a]">{number}</span></div>
                <div className="mt-3 border-t border-[#f1e7d3] pt-3 flex items-center justify-between"><span className="text-[#b88422]">Total Amount</span><strong className="text-2xl font-black text-[#b88422]">{formatCurrency(amount)}</strong></div>
              </div>
            )}

            {isWithdraw && (
              <div className="space-y-2 text-sm text-[#6b5a3a]">
                <div className="flex items-center justify-between"><span className="text-[#b88422]">Bank</span><strong className="text-right text-[#2f2410]">{bank}</strong></div>
                <div className="flex items-center justify-between"><span className="text-[#b88422]">Status</span><span className={`px-3 py-1 text-xs font-black ${badgeColor}`}>{badge}</span></div>
                <div className="mt-3 border-t border-[#f1e7d3] pt-3 flex items-center justify-between"><span className="text-[#b88422]">Requested Amount</span><strong className="text-2xl font-black text-[#b88422]">{formatCurrency(amount)}</strong></div>
              </div>
            )}
          </div>

          <div className="mt-5 space-y-3">
            <Link href={primaryHref} className="flex w-full items-center justify-center gap-2 bg-[#ffe082] px-4 py-3 text-sm font-black uppercase text-[#6b5a3a] shadow-[0_4px_12px_rgba(245,190,36,0.10)]">
              <i className={`fa ${isWithdraw ? 'fa-bank' : 'fa-gamepad'}`} aria-hidden="true"></i>
              <span>{primaryLabel}</span>
            </Link>
            <Link href={secondaryHref} className="flex w-full items-center justify-center gap-2 border border-[#ffe082] bg-transparent px-4 py-3 text-sm font-black uppercase text-[#b88422]">
              <i className={`fa ${isWithdraw ? 'fa-wallet' : 'fa-list-alt'}`} aria-hidden="true"></i>
              <span>{secondaryLabel}</span>
            </Link>
          </div>
        </div>

        <div className="relative border-t border-[#eadcc0] bg-[#fff8e7] px-4 py-3 text-center text-[10px] text-[#b88422]">
          <i className="fa fa-circle mr-1 text-[7px]" aria-hidden="true"></i>
          Transaction ID: {txId}
        </div>
        </div>
      </div>
      <Footer />
    </div>
  )
}
