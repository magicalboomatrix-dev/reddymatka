'use client'
import React, { useCallback, useEffect, useState } from 'react'
import { ChevronRight, Plus, X, MessageCircle, Clock, CheckCircle, Circle } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { supportAPI } from '../lib/api'

const STATUS_META = {
  open:        { label: 'Open',        dot: 'bg-blue-500',  pill: 'bg-blue-50 text-blue-600 border border-blue-200' },
  in_progress: { label: 'In Progress', dot: 'bg-[#c8960c]', pill: 'bg-[#fff8e1] text-[#b88422] border border-[#f6d860]' },
  closed:      { label: 'Closed',      dot: 'bg-gray-300',  pill: 'bg-gray-50 text-gray-400 border border-gray-200' },
}

function formatTs(ts) {
  if (!ts) return ''
  const d = new Date(ts)
  const diff = (Date.now() - d) / 1000
  if (diff < 60)    return 'Just now'
  if (diff < 3600)  return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })
}

// ── New Ticket Bottom Sheet ──────────────────────────────────────────────────
function NewTicketSheet({ onClose, onCreated }) {
  const [subject, setSubject] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError]     = useState('')
  const [loading, setLoading] = useState(false)
  const [step, setStep]       = useState(1) // 1=subject, 2=message

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    if (!subject.trim()) return setError('Please enter a subject.')
    if (!message.trim()) return setError('Please describe your issue.')
    setLoading(true)
    try {
      const res = await supportAPI.createTicket({ subject: subject.trim(), message: message.trim() })
      onCreated(res.ticketId)
    } catch (err) {
      setError(err.message || 'Failed to submit. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const QUICK = ['Payment issue', 'Withdrawal problem', 'Account locked', 'Wrong result', 'Other']

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 backdrop-blur-sm">
      <div
        className="w-full max-w-[430px] bg-white shadow-2xl"
        style={{ borderRadius: '24px 24px 0 0' }}
      >
        {/* Drag Handle */}
        <div className="flex justify-center pt-3 pb-2">
          <div className="h-1 w-12 rounded-full bg-gray-200" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-5 pb-4">
          <div>
            <h2 className="text-base font-black text-[#111]">New Support Ticket</h2>
            <p className="text-xs text-gray-400 mt-0.5">We typically respond within 2–4 hours</p>
          </div>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-100 text-gray-400 hover:bg-gray-200 transition-colors"
          >
            <X size={15} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-5 pb-8 space-y-4">
          {/* Subject */}
          <div>
            <label className="mb-2 block text-[11px] font-black uppercase tracking-widest text-gray-400">Subject</label>
            {/* Quick picks */}
            <div className="flex flex-wrap gap-2 mb-3">
              {QUICK.map((q) => (
                <button
                  key={q}
                  type="button"
                  onClick={() => setSubject(q)}
                  className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
                    subject === q
                      ? 'bg-[#111] text-white'
                      : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                  }`}
                >
                  {q}
                </button>
              ))}
            </div>
            <input
              className="w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-[#111] outline-none transition focus:border-[#c8960c] focus:ring-2 focus:ring-[#c8960c]/20"
              placeholder="Or type your own subject…"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              maxLength={255}
              disabled={loading}
            />
          </div>

          {/* Message */}
          <div>
            <label className="mb-2 block text-[11px] font-black uppercase tracking-widest text-gray-400">Details</label>
            <textarea
              rows={4}
              className="w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-[#111] resize-none outline-none transition focus:border-[#c8960c] focus:ring-2 focus:ring-[#c8960c]/20"
              placeholder="Describe your issue in detail — transaction IDs, amounts, dates…"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              disabled={loading}
            />
          </div>

          {error && (
            <div className="flex items-center gap-2 rounded-2xl bg-red-50 border border-red-100 px-4 py-3">
              <div className="h-1.5 w-1.5 rounded-full bg-red-400 flex-shrink-0" />
              <p className="text-sm text-red-500">{error}</p>
            </div>
          )}

          <button
            type="submit"
            disabled={loading || !subject.trim() || !message.trim()}
            className="w-full rounded-2xl bg-[#111] py-4 text-sm font-black uppercase tracking-widest text-white transition active:scale-[0.98] disabled:opacity-40"
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <span className="h-4 w-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                Submitting…
              </span>
            ) : (
              'Submit Ticket'
            )}
          </button>
        </form>
      </div>
    </div>
  )
}

// ── Ticket Card ──────────────────────────────────────────────────────────────
function TicketCard({ t }) {
  const meta = STATUS_META[t.status] || STATUS_META.open
  return (
    <Link
      href={`/support/${t.id}`}
      className="group flex items-center gap-3.5 bg-white px-4 py-4 transition-all active:scale-[0.99]"
      style={{ borderBottom: '1px solid #f0ece3' }}
    >
      {/* Icon + status dot */}
      <div className="relative flex-shrink-0">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#fff8e1]">
          <MessageCircle size={22} className="text-[#c8960c]" />
        </div>
        <span className={`absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-2 border-white ${meta.dot}`} />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-bold text-[#111] truncate">{t.subject}</p>
          <span className="flex-shrink-0 text-[11px] text-gray-400 font-medium">{formatTs(t.updated_at)}</span>
        </div>
        <div className="flex items-center justify-between mt-1 gap-2">
          <p className="text-xs text-gray-400 truncate italic">
            {t.last_message || `${t.message_count} message${t.message_count !== 1 ? 's' : ''}`}
          </p>
          <span className={`flex-shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full ${meta.pill}`}>
            {meta.label}
          </span>
        </div>
        <p className="mt-1 text-[10px] text-gray-300">Ticket #{t.id}</p>
      </div>

      <ChevronRight size={15} className="flex-shrink-0 text-gray-300 group-hover:text-gray-400 transition-colors" />
    </Link>
  )
}

// ── Main Page ────────────────────────────────────────────────────────────────
export default function SupportPage() {
  const router       = useRouter()
  const [tickets, setTickets]       = useState([])
  const [loading, setLoading]       = useState(true)
  const [showNew, setShowNew]       = useState(false)
  const [statusFilter, setFilter]   = useState('')
  const [error, setError]           = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await supportAPI.myTickets({ status: statusFilter || undefined })
      setTickets(res.tickets || [])
    } catch (err) {
      setError(err.message || 'Failed to load.')
    } finally {
      setLoading(false)
    }
  }, [statusFilter])

  useEffect(() => { load() }, [load])

  const counts = tickets.reduce((acc, t) => { acc[t.status] = (acc[t.status] || 0) + 1; return acc }, {})

  return (
    <div className="mx-auto min-h-screen w-full max-w-[430px] bg-[#f6f7fa]">

      {/* ── Top Header ── */}
      <header className="sticky top-0 z-10 bg-[#111] px-4 pt-5 pb-4 shadow-lg">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/profile">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10">
                <img src="/images/back-btn.png" alt="Back" className="h-4 w-4 brightness-200" />
              </div>
            </Link>
            <div>
              <h1 className="text-base font-black text-white">Support Center</h1>
              <p className="text-[11px] text-white/50 mt-0.5">We're here to help</p>
            </div>
          </div>
          <button
            onClick={() => setShowNew(true)}
            className="flex items-center gap-1.5 rounded-full bg-[#c8960c] px-4 py-2 text-xs font-black text-white shadow-lg shadow-[#c8960c]/30 active:scale-95 transition-all"
          >
            <Plus size={13} strokeWidth={3} />
            New Ticket
          </button>
        </div>

        {/* Stats Row */}
        <div className="mt-4 grid grid-cols-3 gap-2">
          {[
            { key: 'open',        label: 'Open',        icon: Circle },
            { key: 'in_progress', label: 'In Progress', icon: Clock },
            { key: 'closed',      label: 'Resolved',    icon: CheckCircle },
          ].map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setFilter(statusFilter === key ? '' : key)}
              className={`flex flex-col items-center rounded-2xl py-2.5 transition-all ${
                statusFilter === key
                  ? 'bg-[#c8960c] shadow-lg shadow-[#c8960c]/30'
                  : 'bg-white/10'
              }`}
            >
              <Icon size={16} className={statusFilter === key ? 'text-white' : 'text-white/50'} />
              <span className={`text-lg font-black mt-0.5 ${statusFilter === key ? 'text-white' : 'text-white'}`}>
                {counts[key] || 0}
              </span>
              <span className={`text-[10px] font-semibold ${statusFilter === key ? 'text-white/90' : 'text-white/50'}`}>
                {label}
              </span>
            </button>
          ))}
        </div>
      </header>

      {/* ── Content ── */}
      <main className="pb-24">
        {/* Info Banner */}
        <div className="mx-4 mt-4 flex items-start gap-3 rounded-2xl bg-[#fff8e1] border border-[#f6d860]/60 px-4 py-3.5">
          <span className="text-lg mt-0.5">⚡</span>
          <div>
            <p className="text-xs font-black text-[#7a5c00]">Fast Support</p>
            <p className="text-xs text-[#a07820] mt-0.5 leading-relaxed">
              Deposit issues, withdrawals, account problems — tap <strong>New Ticket</strong> and our team will respond within 2–4 hours.
            </p>
          </div>
        </div>

        {error && (
          <div className="mx-4 mt-3 rounded-2xl bg-red-50 border border-red-100 px-4 py-3 text-sm text-red-500">{error}</div>
        )}

        {/* Section Label */}
        <div className="flex items-center justify-between px-4 pt-5 pb-2">
          <p className="text-xs font-black uppercase tracking-widest text-gray-400">
            {statusFilter ? STATUS_META[statusFilter]?.label : 'All Tickets'}
            {tickets.length > 0 && <span className="ml-2 text-gray-300">({tickets.length})</span>}
          </p>
          {statusFilter && (
            <button onClick={() => setFilter('')} className="text-[11px] text-[#c8960c] font-bold">
              Clear filter
            </button>
          )}
        </div>

        {loading ? (
          <div className="space-y-0.5 mx-0">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex items-center gap-3.5 bg-white px-4 py-4" style={{ borderBottom: '1px solid #f0ece3' }}>
                <div className="h-12 w-12 rounded-2xl bg-gray-100 animate-pulse flex-shrink-0" />
                <div className="flex-1 space-y-2">
                  <div className="h-3.5 bg-gray-100 rounded-full w-3/4 animate-pulse" />
                  <div className="h-3 bg-gray-100 rounded-full w-1/2 animate-pulse" />
                </div>
              </div>
            ))}
          </div>
        ) : tickets.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-4">
            <div className="flex h-24 w-24 items-center justify-center rounded-3xl bg-[#fff8e1]">
              <MessageCircle size={40} className="text-[#c8960c]" />
            </div>
            <div className="text-center px-8">
              <p className="font-black text-[#111] text-base">No tickets yet</p>
              <p className="text-sm text-gray-400 mt-1">Hit the button above to get help from our support team</p>
            </div>
            <button
              onClick={() => setShowNew(true)}
              className="mt-2 flex items-center gap-2 rounded-full bg-[#111] px-6 py-3 text-sm font-black text-white shadow-lg active:scale-95 transition-all"
            >
              <Plus size={15} strokeWidth={3} /> Raise a Ticket
            </button>
          </div>
        ) : (
          <div className="bg-white mx-0 rounded-none overflow-hidden">
            {tickets.map((t) => <TicketCard key={t.id} t={t} />)}
          </div>
        )}
      </main>

      {showNew && <NewTicketSheet onClose={() => setShowNew(false)} onCreated={(id) => { setShowNew(false); router.push(`/support/${id}`) }} />}
    </div>
  )
}
