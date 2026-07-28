'use client'
import React, { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import DepositWithdrawBtns from '../components/DepositWithdrawBtns'
import SkeletonBlock from '../components/SkeletonBlock'
import Toast from '../components/Toast'
import { userAPI, walletAPI, withdrawAPI, buildUploadUrl } from '../lib/api'
import { formatStatusLabel } from '../lib/formatters'
import { useTranslation } from '../lib/LanguageContext'
import { translations } from '../lib/translations'

const getMethods = (t) => [
  { key: 'bank', label: t(translations.bankAccounts.title) },
  { key: 'upi', label: 'UPI ID' },
  { key: 'phone', label: 'Mobile Number' },
  { key: 'scanner', label: 'Scanner' },
]

const WithDrawPage = () => {
  const router = useRouter()
  const { t } = useTranslation()
  const [bankAccounts, setBankAccounts] = useState([])
  const [history, setHistory] = useState([])
  const [selectedAccountId, setSelectedAccountId] = useState('')
  const [withdrawMethod, setWithdrawMethod] = useState('bank')
  const [upiId, setUpiId] = useState('')
  const [phoneNumber, setPhoneNumber] = useState('')
  const [scannerImageFile, setScannerImageFile] = useState(null)
  const [amount, setAmount] = useState('')
  const [withdrawableAmount, setWithdrawableAmount] = useState(0)
  const [loadingData, setLoadingData] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [toast, setToast] = useState({ message: '', type: 'info' })
  const [withdrawGuidelines, setWithdrawGuidelines] = useState([])
  const [withdrawalTimeWindows, setWithdrawalTimeWindows] = useState([])
  const [previewImage, setPreviewImage] = useState(null)

  const formatDateTime = (value) => {
    if (!value) return '-'
    return new Date(value).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
  }

  const isWithinWithdrawalWindow = () => {
    if (!withdrawalTimeWindows || withdrawalTimeWindows.length === 0) return true
    const now = new Date()
    // IST = UTC + 5:30
    const istOffset = 5 * 60 + 30
    const istNow = new Date(now.getTime() + istOffset * 60 * 1000)
    const currentMinutes = istNow.getUTCHours() * 60 + istNow.getUTCMinutes()
    const parseHHMM = (str) => {
      const [h, m] = String(str).split(':').map(Number)
      return (h || 0) * 60 + (m || 0)
    }
    return withdrawalTimeWindows.some((w) => {
      const start = parseHHMM(w.start)
      const end = parseHHMM(w.end)
      return currentMinutes >= start && currentMinutes <= end
    })
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
    userAPI.getUiConfig().then((res) => {
      setWithdrawGuidelines(res.withdraw_guidelines || [])
      setWithdrawalTimeWindows(res.withdrawal_time_windows || [])
    }).catch(() => {
      setWithdrawGuidelines([])
    })
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

    // Check withdrawal time window before anything else
    if (!isWithinWithdrawalWindow()) {
      const windowList = withdrawalTimeWindows.map((w) => `${w.start} – ${w.end}`).join(', ')
      setToast({
        message: `Withdrawals are only allowed during: ${windowList}. Please try again in the next withdrawal window.`,
        type: 'error',
      })
      return
    }

    const parsedAmount = Number(amount)

    if (withdrawMethod === 'bank' && !selectedAccountId) {
      setToast({ message: 'Please select a bank account.', type: 'error' })
      return
    }
    if (withdrawMethod === 'upi' && !upiId.trim()) {
      setToast({ message: 'Please enter your UPI ID.', type: 'error' })
      return
    }
    if (withdrawMethod === 'upi' && !/^[a-zA-Z0-9._-]+@[a-zA-Z0-9]+$/.test(upiId.trim())) {
      setToast({ message: 'Invalid UPI ID format (e.g. name@upi).', type: 'error' })
      return
    }
    if (withdrawMethod === 'phone' && !phoneNumber.replace(/\D/g, '')) {
      setToast({ message: 'Please enter your phone number.', type: 'error' })
      return
    }
    if (withdrawMethod === 'phone' && phoneNumber.replace(/\D/g, '').length < 10) {
      setToast({ message: 'Phone number must be at least 10 digits.', type: 'error' })
      return
    }
    if (withdrawMethod === 'scanner' && !scannerImageFile) {
      setToast({ message: 'Please upload a scanner image.', type: 'error' })
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
      let payload
      let methodLabel = '-'

      if (withdrawMethod === 'scanner') {
        payload = new FormData()
        payload.append('amount', parsedAmount)
        payload.append('withdraw_method', withdrawMethod)
        payload.append('scanner_image', scannerImageFile)
        methodLabel = 'Scanner'
      } else {
        payload = { amount: parsedAmount, withdraw_method: withdrawMethod }
        if (withdrawMethod === 'bank') {
          payload.bank_account_id = Number(selectedAccountId)
          const selectedBank = bankAccounts.find((account) => String(account.id) === String(selectedAccountId))
          methodLabel = selectedBank ? formatBankOption(selectedBank) : '-'
        } else if (withdrawMethod === 'upi') {
          payload.upi_id = upiId.trim()
          methodLabel = `UPI: ${upiId.trim()}`
        } else if (withdrawMethod === 'phone') {
          payload.phone_number = phoneNumber.replace(/\D/g, '')
          methodLabel = `Phone: ${phoneNumber.replace(/\D/g, '')}`
        }
      }

      const response = await withdrawAPI.request(payload)
      const txId = response?.withdraw?.id
        ? `TXN_WR_${response.withdraw.id}_${Date.now()}`
        : `TXN_WR_${Date.now()}`

      setAmount('')
      setUpiId('')
      setPhoneNumber('')
      setScannerImageFile(null)
      await fetchData()
      const params = new URLSearchParams({
        type: 'withdraw',
        amount: String(parsedAmount),
        bank: methodLabel,
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
    <div className="mx-auto min-h-screen w-full max-w-[430px] bg-[#f6f7fa] pb-24">
      {toast.message && <Toast message={toast.message} type={toast.type} onClose={() => setToast({ message: '', type: 'info' })} />}

      {/* Image Preview Modal */}
      {previewImage && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 p-4" onClick={() => setPreviewImage(null)}>
          <div className="relative max-w-full max-h-full flex items-center justify-center flex-col">
            <button
              onClick={() => setPreviewImage(null)}
              className="absolute -top-12 right-0 text-white hover:text-gray-300 text-3xl font-bold p-2 leading-none"
            >
              &times;
            </button>
            <img src={previewImage} alt="Scanner QR" className="max-w-[90vw] max-h-[70vh] object-contain rounded bg-white p-2" onClick={e => e.stopPropagation()} />
          </div>
        </div>
      )}

      <header className="sticky top-0 z-40 mx-auto flex w-full max-w-107.5 items-center bg-white px-4 py-3 shadow-sm">
        <a href="/home" className="mr-3 inline-flex"><img alt="back" src="/images/back-btn.png" className="h-5 w-5" /></a>
        <h3 className="flex-1 text-center text-sm font-semibold text-[#111]">{t(translations.withdraw.title)}</h3>
      </header>

      <div className="bg-white pb-6">
        <DepositWithdrawBtns></DepositWithdrawBtns>

        <div className="mx-auto w-full max-w-107.5 px-4">

          {/* Withdrawal Time Windows Banner */}
          {withdrawalTimeWindows.length > 0 && (
            <div className={`mt-4 border px-3 py-3 text-xs font-medium ${isWithinWithdrawalWindow() ? 'border-green-300 bg-green-50 text-green-800' : 'border-red-300 bg-red-50 text-red-700'}`}>
              <p className="font-bold mb-1">{isWithinWithdrawalWindow() ? '✓ Withdrawals are open now' : '✕ Withdrawals are currently closed'}</p>
              <p>Withdrawal timings: {withdrawalTimeWindows.map((w) => `${w.start} – ${w.end}`).join('  |  ')}</p>
            </div>
          )}

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
                  {t(translations.wallet.totalBalance)}: ₹{withdrawableAmount.toFixed(2)}
                </div>

                <p className="text-xs text-[#6b5a3a]">Only main wallet balance is withdrawable. Bonus wallet balance cannot be withdrawn directly.</p>

                {/* Withdrawal Method Tabs */}
                <div className="flex border border-[#d8d1c4] overflow-hidden">
                  {getMethods(t).map((m) => (
                    <button
                      key={m.key}
                      type="button"
                      onClick={() => setWithdrawMethod(m.key)}
                      className={`flex-1 py-2 text-xs font-semibold transition-colors ${
                        withdrawMethod === m.key
                          ? 'bg-[#111] text-white'
                          : 'bg-[#faf7f0] text-[#6b5a3a] hover:bg-[#f0e8d8]'
                      }`}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>

                <input
                  className="h-11 w-full border border-[#d8d1c4] bg-[#faf7f0] px-4 text-sm"
                  type="number"
                  min="1"
                  step="0.01"
                  placeholder={t(translations.withdraw.enterAmount)}
                  value={amount}
                  onChange={(event) => setAmount(event.target.value)}
                  required
                />

                {/* Bank Account */}
                {withdrawMethod === 'bank' && (
                  <>
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
                  </>
                )}

                {/* UPI ID */}
                {withdrawMethod === 'upi' && (
                  <input
                    className="h-11 w-full border border-[#d8d1c4] bg-[#faf7f0] px-4 text-sm"
                    type="text"
                    placeholder="Enter UPI ID (e.g. name@upi)"
                    value={upiId}
                    onChange={(e) => setUpiId(e.target.value)}
                    required
                  />
                )}

                {/* Phone */}
                {withdrawMethod === 'phone' && (
                  <input
                    className="h-11 w-full border border-[#d8d1c4] bg-[#faf7f0] px-4 text-sm"
                    type="tel"
                    placeholder="Enter 10-digit Mobile Number"
                    value={phoneNumber}
                    onChange={(e) => setPhoneNumber(e.target.value.replace(/\D/g, '').slice(0, 13))}
                    required
                  />
                )}

                {/* Scanner */}
                {withdrawMethod === 'scanner' && (
                  <input
                    className="h-11 w-full border border-[#d8d1c4] bg-[#faf7f0] px-4 py-2.5 text-sm"
                    type="file"
                    accept="image/*"
                    onChange={(e) => setScannerImageFile(e.target.files[0])}
                    required
                  />
                )}

                <button
                  className="h-11 w-full bg-[#111] text-sm font-semibold text-white disabled:opacity-60"
                  type="submit"
                  disabled={submitting || (withdrawMethod === 'bank' && bankAccounts.length === 0)}
                >
                  {submitting ? t(translations.common.loading) : t(translations.withdraw.requestWithdraw)}
                </button>
              </form>
            )}

            {!loadingData && withdrawMethod === 'bank' && bankAccounts.length === 0 && (
              <p className="pt-2.5 text-center text-sm text-[#666]">{t(translations.bankAccounts.noAccounts)}</p>
            )}

            <div className="mt-3 flex gap-2">
              <Link className="inline-flex flex-1 border border-[#d8d1c4] items-center justify-center gap-2 bg-[#ffffff] px-4 py-3 text-sm font-semibold text-[#111]" href="/bind-bank-card">
                <img alt="Add Bank" className="h-4 w-4" src="/images/addicon.png" /> {t(translations.bankAccounts.addAccount)}
              </Link>
              <Link className="inline-flex flex-1 items-center justify-center border border-[#d8d1c4] bg-white px-4 py-3 text-sm font-semibold text-[#111]" href="/bank-accounts">
                {t(translations.common.manage)}
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
                    {/* Payment method info */}
                    {(!withdrawItem.withdraw_method || withdrawItem.withdraw_method === 'bank') && (
                      <div className="mt-1 text-[11px] text-[#6b5a3a]">{withdrawItem.bank_name || 'Bank'} • {withdrawItem.account_number || '-'}</div>
                    )}
                    {withdrawItem.withdraw_method === 'upi' && (
                      <div className="mt-1 text-[11px] text-[#6b5a3a]">UPI • {withdrawItem.upi_id || '-'}</div>
                    )}
                    {withdrawItem.withdraw_method === 'phone' && (
                      <div className="mt-1 text-[11px] text-[#6b5a3a]">Phone • {withdrawItem.phone_number || '-'}</div>
                    )}
                    {withdrawItem.withdraw_method === 'scanner' && (
                      <div className="mt-1 text-[11px] text-[#6b5a3a]">
                        Scanner • {withdrawItem.scanner_image ? <button onClick={() => setPreviewImage(buildUploadUrl(withdrawItem.scanner_image))} className="text-blue-600 underline">View Image</button> : '-'}
                      </div>
                    )}

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
              {history.length === 0 && <p className="py-6 text-center text-sm text-[#6b5a3a]">{t(translations.wallet.pendingWithdrawals)}</p>}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default WithDrawPage