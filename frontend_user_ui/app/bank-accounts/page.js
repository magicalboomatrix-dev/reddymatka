'use client'
import React, { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { bankAccountAPI } from '../lib/api'
import Toast from '../components/Toast'
import SkeletonBlock from '../components/SkeletonBlock'

const emptyForm = {
  account_number: '',
  ifsc: '',
  bank_name: '',
  account_holder: '',
}

export default function BankAccountsPage() {
  const [accounts, setAccounts] = useState([])
  const [loading, setLoading] = useState(true)
  const [editingId, setEditingId] = useState(null)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState({ message: '', type: 'info' })

  const hasAccounts = accounts.length > 0

  const editingAccount = useMemo(() => accounts.find((account) => account.id === editingId) || null, [accounts, editingId])

  const loadAccounts = async () => {
    setLoading(true)
    try {
      const response = await bankAccountAPI.list()
      setAccounts(response.accounts || [])
    } catch (error) {
      setToast({ message: error.message || 'Failed to load bank accounts.', type: 'error' })
      setAccounts([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadAccounts()
  }, [])

  const startEdit = (account) => {
    setEditingId(account.id)
    setForm({
      account_number: account.account_number || '',
      ifsc: account.ifsc || '',
      bank_name: account.bank_name || '',
      account_holder: account.account_holder || '',
    })
  }

  const cancelEdit = () => {
    setEditingId(null)
    setForm(emptyForm)
  }

  const saveEdit = async () => {
    if (!editingId) {
      return
    }

    if (!form.account_number || !form.ifsc || !form.bank_name || !form.account_holder) {
      setToast({ message: 'All fields are required.', type: 'error' })
      return
    }

    setSaving(true)
    try {
      await bankAccountAPI.update(editingId, {
        account_number: form.account_number.trim(),
        ifsc: form.ifsc.trim().toUpperCase(),
        bank_name: form.bank_name.trim(),
        account_holder: form.account_holder.trim(),
      })
      setToast({ message: 'Bank account updated successfully.', type: 'success' })
      cancelEdit()
      await loadAccounts()
    } catch (error) {
      setToast({ message: error.message || 'Failed to update bank account.', type: 'error' })
    } finally {
      setSaving(false)
    }
  }

  const removeAccount = async (account) => {
    const confirmed = window.confirm(`Delete bank account ending ${String(account.account_number || '').slice(-4)}?`)
    if (!confirmed) {
      return
    }

    try {
      await bankAccountAPI.remove(account.id)
      if (editingId === account.id) {
        cancelEdit()
      }
      setToast({ message: 'Bank account deleted.', type: 'success' })
      await loadAccounts()
    } catch (error) {
      setToast({ message: error.message || 'Failed to delete bank account.', type: 'error' })
    }
  }

  const setDefaultAccount = async (account) => {
    try {
      await bankAccountAPI.setDefault(account.id)
      setAccounts((current) => current.map((item) => ({ ...item, is_default: Number(item.id) === Number(account.id) ? 1 : 0 })))
      setToast({ message: 'Default bank account updated.', type: 'success' })
    } catch (error) {
      setToast({ message: error.message || 'Failed to set default bank account.', type: 'error' })
    }
  }

  return (
    <div className="mx-auto min-h-screen w-full max-w-107.5 bg-white pb-6">
      <Toast message={toast.message} type={toast.type} onClose={() => setToast({ message: '', type: 'info' })} />

      <header className="sticky top-0 z-40 mx-auto flex w-full max-w-107.5 items-center bg-white px-4 py-3 shadow-sm">
        <Link href="/withdraw" className="mr-3 inline-flex">
          <img alt="back" src="/images/back-btn.png" className="h-5 w-5" />
        </Link>
        <h3 className="flex-1 text-center text-sm font-semibold text-[#111]">Bank Accounts</h3>
      </header>

      <div className="px-4 pt-4">
        <Link href="/bind-bank-card" className="inline-flex w-full items-center border border-[#d8d1c4] justify-center gap-2 bg-[#fff] px-4 py-3 text-sm font-semibold text-[#111]">
          <img alt="Add Bank" className="h-4 w-4" src="/images/addicon.png" /> Add Bank Account
        </Link>

        {loading && (
          <div className="mt-4 space-y-3 border border-[#d6b774] bg-white p-4 shadow-[0_12px_28px_rgba(79,52,10,0.08)]">
            <SkeletonBlock className="h-5 w-2/5" />
            <SkeletonBlock className="h-10 w-full" />
            <SkeletonBlock className="h-10 w-full" />
            <SkeletonBlock className="h-10 w-4/5" />
          </div>
        )}

        {!loading && !hasAccounts && (
          <div className="mt-4 border border-[#d6b774] bg-white p-4 text-sm text-[#6d6659] shadow-[0_12px_28px_rgba(79,52,10,0.08)]">
            No bank accounts found. Add one to request withdrawals.
          </div>
        )}

        {!loading && hasAccounts && (
          <div className="mt-4 overflow-hidden border border-[#ead8ab] bg-white">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left text-xs text-[#111]">
                <thead>
                  <tr>
                    <th className="border-b border-r border-[#ead8ab] bg-[#f7f0e3] px-3 py-2">Bank Name</th>
                    <th className="border-b border-r border-[#ead8ab] bg-[#f7f0e3] px-3 py-2">Account Holder</th>
                    <th className="border-b border-r border-[#ead8ab] bg-[#f7f0e3] px-3 py-2">Account Number</th>
                    <th className="border-b border-r border-[#ead8ab] bg-[#f7f0e3] px-3 py-2">IFSC</th>
                    <th className="border-b border-[#ead8ab] bg-[#f7f0e3] px-3 py-2">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {accounts.map((account) => (
                    <tr key={account.id}>
                      <td className="border-r border-[#f0e3c6] px-3 py-2">
                        <div className="flex items-center gap-2">
                          <span>{account.bank_name}</span>
                          {Number(account.is_default) === 1 && <span className="text-[#b88422]">★</span>}
                        </div>
                      </td>
                      <td className="border-r border-[#f0e3c6] px-3 py-2">{account.account_holder}</td>
                      <td className="border-r border-[#f0e3c6] px-3 py-2">{account.account_number}</td>
                      <td className="border-r border-[#f0e3c6] px-3 py-2">{account.ifsc}</td>
                      <td className="px-3 py-2">
                        <div className="flex gap-2">
                          <button type="button" className="bg-[#111] px-3 py-1 text-[11px] font-semibold text-white" onClick={() => startEdit(account)}>Edit</button>
                          <button type="button" className="bg-[#b88422] px-3 py-1 text-[11px] font-semibold text-white" onClick={() => setDefaultAccount(account)}>Set Default</button>
                          <button type="button" className="bg-[#b91c1c] px-3 py-1 text-[11px] font-semibold text-white" onClick={() => removeAccount(account)}>Delete</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {editingAccount && (
          <div className="mt-4 border border-[#d6b774] bg-white p-4 shadow-[0_12px_28px_rgba(79,52,10,0.08)]">
            <h4 className="text-sm font-semibold text-[#111]">Edit Bank Account</h4>
            <div className="mt-3 space-y-3">
              <input
                className="h-11 w-full border border-[#d8d1c4] bg-[#faf7f0] px-4 text-sm"
                placeholder="Bank Name"
                value={form.bank_name}
                onChange={(event) => setForm((prev) => ({ ...prev, bank_name: event.target.value }))}
              />
              <input
                className="h-11 w-full border border-[#d8d1c4] bg-[#faf7f0] px-4 text-sm"
                placeholder="Account Holder"
                value={form.account_holder}
                onChange={(event) => setForm((prev) => ({ ...prev, account_holder: event.target.value }))}
              />
              <input
                className="h-11 w-full border border-[#d8d1c4] bg-[#faf7f0] px-4 text-sm"
                placeholder="Account Number"
                value={form.account_number}
                onChange={(event) => setForm((prev) => ({ ...prev, account_number: event.target.value }))}
              />
              <input
                className="h-11 w-full border border-[#d8d1c4] bg-[#faf7f0] px-4 text-sm"
                placeholder="IFSC"
                maxLength={11}
                value={form.ifsc}
                onChange={(event) => setForm((prev) => ({ ...prev, ifsc: event.target.value.toUpperCase() }))}
              />
            </div>

            <div className="mt-4 flex gap-2">
              <button type="button" className="h-11 flex-1 bg-[#111] text-sm font-semibold text-white" onClick={saveEdit} disabled={saving}>
                {saving ? 'Saving...' : 'Save'}
              </button>
              <button type="button" className="h-11 flex-1 border border-[#d8d1c4] bg-white text-sm font-semibold text-[#333]" onClick={cancelEdit} disabled={saving}>
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
