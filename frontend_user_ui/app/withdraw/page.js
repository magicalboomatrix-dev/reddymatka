'use client'
import React, { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import DepositWithdrawBtns from '../components/DepositWithdrawBtns'
import SkeletonBlock from '../components/SkeletonBlock'
import Toast from '../components/Toast'
import { userAPI, walletAPI, withdrawAPI } from '../lib/api'
import { formatStatusLabel } from '../lib/formatters'

const WithDrawPage = () => {
  const router = useRouter()
  const [bankAccounts, setBankAccounts] = useState([])
  const [history, setHistory] = useState([])
  const [selectedAccountId, setSelectedAccountId] = useState('')
  const [amount, setAmount] = useState('')
  const [withdrawableAmount, setWithdrawableAmount] = useState(0)
  const [loadingData, setLoadingData] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [toast, setToast] = useState({ message: '', type: 'info' })
  const [withdrawGuidelines, setWithdrawGuidelines] = useState([])

  const formatDateTime = (value) => {
    if (!value) return '-'
    return new Date(value).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
  }

  const fetchData = async () => {
    setLoadingData(true)
    try {
      const [banksRes, histRes, walletRes, profileRes] = await Promise.all([
        userAPI.getBankAccounts(),
        withdrawAPI.history({}),
        walletAPI.getInfo(),
        userAPI.getProfile(),
      ])

      const accounts = banksRes.accounts || []
      setBankAccounts(accounts)
      const profileDefaultBankId = Number(profileRes?.user?.default_bank_account_id || 0)
      const accountMarkedDefault = accounts.find((account) => Number(account.is_default) === 1)
      const fallbackDefault = profileDefaultBankId || accountMarkedDefault?.id || accounts[0]?.id || ''
      if (accounts.length > 0) {
        setSelectedAccountId((prev) => prev || String(fallbackDefault))
      } else {
        setSelectedAccountId('')
      }

      setHistory(histRes.withdrawals || [])
      setWithdrawableAmount(Number(walletRes.available_withdrawal || walletRes.balance || 0))
    } catch (error) {
      setToast({ message: error.message || 'Failed to load withdrawal data.', type: 'error' })
    } finally {
      setLoadingData(false)
    }
  }

  useEffect(() => {
    fetchData()
    userAPI.getUiConfig().then((res) => setWithdrawGuidelines(res.withdraw_guidelines || [])).catch(() => setWithdrawGuidelines([]))
  }, [])

  const setDefaultAccount = async (accountId) => {
    try {
      await userAPI.setDefaultBankAccount(accountId)
      setBankAccounts((current) => current.map((account) => ({ ...account, is_default: Number(account.id) === Number(accountId) ? 1 : 0 })))
      setSelectedAccountId(String(accountId))
      setToast({ message: 'Default bank account updated.', type: 'success' })
    } catch (error) {
      setToast({ message: error.message || 'Failed to set default account.', type: 'error' })
    }
  }

  const handleWithdraw = async (event) => {
    event.preventDefault()

    const parsedAmount = Number(amount)
    if (!selectedAccountId) {
      setToast({ message: 'Please select one bank account.', type: 'error' })
      return
    }

    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      setToast({ message: 'Withdrawal amount must be greater than 0.', type: 'error' })
      return
    }

    if (parsedAmount > withdrawableAmount) {
      setToast({ message: 'Withdrawal amount cannot exceed withdrawable amount.', type: 'error' })
      return
    }

    setSubmitting(true)
    try {
      const response = await withdrawAPI.request({ bank_account_id: Number(selectedAccountId), amount: parsedAmount })
      const selectedBank = bankAccounts.find((account) => String(account.id) === String(selectedAccountId))
      const txId = response?.withdraw?.id
        ? `TXN_WR_${response.withdraw.id}_${Date.now()}`
        : `TXN_WR_${Date.now()}`

      setAmount('')
      await fetchData()
      const params = new URLSearchParams({
        type: 'withdraw',
        amount: String(parsedAmount),
        bank: selectedBank ? formatBankOption(selectedBank) : '-',
        tx: txId,
        primary: '/withdraw',
        secondary: '/wallet',
      })
      router.push(`/success?${params.toString()}`)
    } catch (error) {
      setToast({ message: error.message || 'Failed to submit withdrawal request.', type: 'error' })
    } finally {
      setSubmitting(false)
    }
  }

  const formatBankOption = (account) => {
    const accountNumber = String(account.account_number || '')
    const masked = accountNumber.length >= 4 ? `****${accountNumber.slice(-4)}` : accountNumber
    const defaultLabel = Number(account.is_default) === 1 ? ' ★' : ''
    return `${account.bank_name} - ${masked}${defaultLabel}`
  }

  return (
    <div className="mx-auto min-h-screen w-full max-w-107.5 bg-white pb-6">
      <Toast message={toast.message} type={toast.type} onClose={() => setToast({ message: '', type: 'info' })} />

      <header className="sticky top-0 z-40 mx-auto flex w-full max-w-107.5 items-center bg-white px-4 py-3 shadow-sm">
        <a href="/home" className="mr-3 inline-flex"><img alt="back" src="/images/back-btn.png" className="h-5 w-5" /></a>
        <h3 className="flex-1 text-center text-sm font-semibold text-[#111]">Withdraw</h3>
      </header>

      <div className="bg-white pb-6">
        <DepositWithdrawBtns></DepositWithdrawBtns>

        <div className="mx-auto w-full max-w-107.5 px-4">
          <section className="mt-4 border border-[#d6b774] bg-white p-4 shadow-[0_12px_28px_rgba(79,52,10,0.08)]">
            {loadingData ? (
              <div className="space-y-3">
                <SkeletonBlock className="h-5 w-1/2" />
                <SkeletonBlock className="h-11 w-full" />
                <SkeletonBlock className="h-11 w-full" />
                <SkeletonBlock className="h-11 w-full" />
              </div>
            ) : (
              <form onSubmit={handleWithdraw} className="space-y-3">
                <div className="rounded border border-[#ead8ab] bg-[#f7f0e3] px-3 py-2 text-sm font-medium text-[#3f2b03]">
                  Withdrawable Amount: ₹{withdrawableAmount.toFixed(2)}
                </div>

                <p className="text-xs text-[#6b5a3a]">Only main wallet balance is withdrawable. Bonus wallet balance cannot be withdrawn directly.</p>

                <input
                  className="h-11 w-full border border-[#d8d1c4] bg-[#faf7f0] px-4 text-sm"
                  type="number"
                  min="1"
                  step="0.01"
                  placeholder="Withdrawal Amount"
                  value={amount}
                  onChange={(event) => setAmount(event.target.value)}
                  required
                />

                <select
                  className="h-11 w-full border border-[#d8d1c4] bg-[#faf7f0] px-4 text-sm"
                  value={selectedAccountId}
                  onChange={(event) => setSelectedAccountId(event.target.value)}
                  required
                >
                  <option value="">Select Bank Account</option>
                  {bankAccounts.map((account) => (
                    <option key={account.id} value={account.id}>
                      {formatBankOption(account)}
                    </option>
                  ))}
                </select>

                {selectedAccountId && (
                  <button
                    type="button"
                    className="h-10 w-full border border-[#d8d1c4] bg-white text-xs font-semibold text-[#111]"
                    onClick={() => setDefaultAccount(Number(selectedAccountId))}
                  >
                    Set Selected Account as Default ★
                  </button>
                )}

                <button className="h-11 w-full bg-[#111] text-sm font-semibold text-white" type="submit" disabled={submitting || bankAccounts.length === 0}>
                  {submitting ? 'Submitting...' : 'Submit Withdrawal Request'}
                </button>
              </form>
            )}

            {!loadingData && bankAccounts.length === 0 && (
              <p className="pt-2.5 text-center text-sm text-[#666]">No bank accounts added yet.</p>
            )}

            <div className="mt-3 flex gap-2">
              <Link className="inline-flex flex-1 border border-[#d8d1c4] items-center justify-center gap-2 bg-[#ffffff] px-4 py-3 text-sm font-semibold text-[#111]" href="/bind-bank-card">
                <img alt="Add Bank" className="h-4 w-4" src="/images/addicon.png" /> Add Bank Account
              </Link>
              <Link className="inline-flex flex-1 items-center justify-center border border-[#d8d1c4] bg-white px-4 py-3 text-sm font-semibold text-[#111]" href="/bank-accounts">
                Manage Accounts
              </Link>
            </div>
          </section>

          <div className="mt-4 border border-[#d6b774] bg-white shadow-[0_12px_28px_rgba(79,52,10,0.08)]">
            <div className="px-3 py-3 text-left text-[10px] font-medium text-red-600">
              {(withdrawGuidelines.length > 0 ? withdrawGuidelines : ['Withdrawal instructions are currently unavailable.']).map((rule, index) => (
                <p key={`${rule}-${index}`}>{index + 1}. {rule}</p>
              ))}
            </div>
          </div>

          <div className="mt-4 border border-[#ead8ab] bg-white p-3">
            <h4 className="text-xs font-black uppercase tracking-[0.14em] text-[#6d4a08]">Withdrawal Timeline</h4>

            <div className="mt-3 space-y-3">
              {history.map((withdrawItem, index) => {
                const isApproved = withdrawItem.status === 'approved'
                const isRejected = withdrawItem.status === 'rejected'
                return (
                  <div key={withdrawItem.id || index} className="border border-[#f0e3c6] bg-[#fffdf7] p-3">
                    <div className="flex items-center justify-between">
                      <div className="text-sm font-bold text-[#111]">Withdrawal ₹{Number(withdrawItem.amount || 0).toLocaleString('en-IN')}</div>
                      <span className={`px-2 py-1 text-[10px] font-bold uppercase ${isApproved ? 'bg-[#dcfce7] text-[#166534]' : isRejected ? 'bg-[#fee2e2] text-[#991b1b]' : 'bg-[#fef3c7] text-[#92400e]'}`}>
                        {formatStatusLabel(withdrawItem.status)}
                      </span>
                    </div>
                    <div className="mt-1 text-[11px] text-[#6b5a3a]">{withdrawItem.bank_name || 'Bank'} • {withdrawItem.account_number || '-'}</div>

                    <div className="mt-3 space-y-2 text-xs">
                      <div className="flex items-center gap-2">
                        <span className="h-2 w-2 bg-[#111]"></span>
                        <span className="font-semibold text-[#111]">Requested</span>
                        <span className="text-[#6b5a3a]">{formatDateTime(withdrawItem.created_at)}</span>
                      </div>
                      <div className="ml-0.75 h-3 w-px bg-[#d6b774]"></div>
                      <div className="flex items-center gap-2">
                        <span className={`h-2 w-2 ${isApproved ? 'bg-[#15803d]' : isRejected ? 'bg-[#b91c1c]' : 'bg-[#b88422]'}`}></span>
                        <span className="font-semibold text-[#111]">{isApproved ? 'Approved' : isRejected ? 'Rejected' : 'Pending'}</span>
                        <span className="text-[#6b5a3a]">{formatDateTime(withdrawItem.updated_at || withdrawItem.created_at)}</span>
                      </div>
                      {isApproved && (
                        <>
                          <div className="ml-0.75 h-3 w-px bg-[#d6b774]"></div>
                          <div className="flex items-center gap-2">
                            <span className="h-2 w-2 bg-[#15803d]"></span>
                            <span className="font-semibold text-[#111]">Paid</span>
                            <span className="text-[#6b5a3a]">{formatDateTime(withdrawItem.updated_at || withdrawItem.created_at)}</span>
                          </div>
                        </>
                      )}
                    </div>

                    {withdrawItem.reject_reason && <div className="mt-2 text-[11px] text-[#b91c1c]">Reason: {withdrawItem.reject_reason}</div>}
                  </div>
                )
              })}
              {history.length === 0 && <p className="py-6 text-center text-sm text-[#6b5a3a]">No withdrawals yet</p>}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default WithDrawPage