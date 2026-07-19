'use client'
import React, { useCallback, useEffect, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { CheckCheck, ChevronLeft, Lock, MoreVertical, X } from 'lucide-react'
import { supportAPI } from '../../lib/api'

const STATUS_META = {
  open:        { label: 'Open',        bg: 'bg-blue-500' },
  in_progress: { label: 'In Progress', bg: 'bg-[#c8960c]' },
  closed:      { label: 'Closed',      bg: 'bg-gray-400' },
}

function formatTime(ts) {
  if (!ts) return ''
  return new Date(ts).toLocaleTimeString('en-IN', {
    timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: true,
  })
}

function formatDateDivider(ts) {
  const d = new Date(ts)
  const today     = new Date()
  const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1)
  if (d.toDateString() === today.toDateString())     return 'Today'
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday'
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' })
}

function groupByDate(messages) {
  const out = []; let lastDate = null
  for (const msg of messages) {
    const dk = new Date(msg.created_at).toDateString()
    if (dk !== lastDate) {
      out.push({ type: 'divider', label: formatDateDivider(msg.created_at), key: 'd-' + msg.id })
      lastDate = dk
    }
    out.push({ type: 'msg', ...msg })
  }
  return out
}

export default function SupportChatPage() {
  const { id }    = useParams()
  const router    = useRouter()
  const ticketId  = parseInt(id, 10)

  const [ticket,  setTicket]  = useState(null)
  const [items,   setItems]   = useState([])
  const [loading, setLoading] = useState(true)
  const [text,    setText]    = useState('')
  const [sending, setSending] = useState(false)
  const [error,   setError]   = useState('')
  const [menu,    setMenu]    = useState(false)

  const endRef      = useRef(null)
  const textareaRef = useRef(null)
  const pollRef     = useRef(null)

  const reload = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    try {
      const res = await supportAPI.getTicket(ticketId)
      setTicket(res.ticket)
      setItems(groupByDate(res.messages || []))
    } catch (err) {
      if (!silent) setError(err.message || 'Failed to load.')
    } finally {
      if (!silent) setLoading(false)
    }
  }, [ticketId])

  useEffect(() => {
    reload()
    pollRef.current = setInterval(() => reload(true), 6000)
    return () => clearInterval(pollRef.current)
  }, [reload])

  useEffect(() => {
    if (!loading) endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [items, loading])

  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 100) + 'px'
  }, [text])

  const send = async () => {
    if (!text.trim() || sending || ticket?.status === 'closed') return
    setSending(true); setError('')
    const body = text.trim()
    setItems(prev => {
      const now = new Date().toISOString()
      const dk  = new Date(now).toDateString()
      const lastMsg = [...prev].reverse().find(i => i.type === 'msg')
      const needsDivider = !lastMsg || new Date(lastMsg.created_at).toDateString() !== dk
      const opt = { type: 'msg', id: 'opt-' + Date.now(), sender_role: 'user', sender_name: 'You', message: body, created_at: now, optimistic: true }
      return needsDivider ? [...prev, { type: 'divider', label: 'Today', key: 'd-opt' }, opt] : [...prev, opt]
    })
    setText('')
    try {
      await supportAPI.addMessage(ticketId, body)
      await reload(true)
    } catch (err) {
      setError(err.message || 'Failed to send.')
      setItems(prev => prev.filter(i => !i.optimistic))
      setText(body)
    } finally {
      setSending(false)
    }
  }

  const onKey = (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }
  const meta  = STATUS_META[ticket?.status] || STATUS_META.open

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-white max-w-[430px] mx-auto" onClick={() => setMenu(false)}>

      {/* Header */}
      <header className="flex items-center gap-3 bg-[#111] px-4 pt-5 pb-4 shadow-xl flex-shrink-0">
        <button onClick={() => router.push('/support')} className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 flex-shrink-0">
          <ChevronLeft size={20} className="text-white" />
        </button>
        <div className="relative flex-shrink-0">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[#c8960c]">
            <span className="text-xl">🎧</span>
          </div>
          {ticket && <span className={"absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-[#111] " + meta.bg} />}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-black text-white truncate">{ticket?.subject || 'Support'}</p>
          <div className="flex items-center gap-1.5 mt-0.5">
            <span className={"inline-block h-1.5 w-1.5 rounded-full " + meta.bg} />
            <p className="text-[11px] text-white/50 font-semibold">{meta.label}</p>
            {ticket && <span className="text-[11px] text-white/30">· #{ticket.id}</span>}
          </div>
        </div>
        <div className="relative flex-shrink-0">
          <button onClick={(e) => { e.stopPropagation(); setMenu(v => !v) }} className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10">
            <MoreVertical size={18} className="text-white" />
          </button>
          {menu && ticket && (
            <div className="absolute right-0 top-11 z-30 w-52 rounded-2xl bg-white shadow-2xl border border-gray-100 overflow-hidden" onClick={e => e.stopPropagation()}>
              <div className="bg-[#111] px-4 py-3">
                <p className="text-xs font-black text-white">{ticket.subject}</p>
                <p className="text-[11px] text-white/50 mt-0.5">Ticket #{ticket.id}</p>
              </div>
              <div className="px-4 py-3 space-y-1.5 border-b border-gray-100">
                <p className="text-xs text-gray-500"><span className="font-semibold text-gray-700">Status: </span>{meta.label}</p>
                <p className="text-xs text-gray-500"><span className="font-semibold text-gray-700">Opened: </span>{new Date(ticket.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</p>
                {ticket.moderator_name && <p className="text-xs text-gray-500"><span className="font-semibold text-gray-700">Agent: </span>{ticket.moderator_name}</p>}
              </div>
              <button onClick={() => setMenu(false)} className="w-full px-4 py-3 text-left text-sm text-gray-400 hover:bg-gray-50 font-semibold">Close</button>
            </div>
          )}
        </div>
      </header>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-1" style={{ background: 'linear-gradient(160deg,#f6f7fa 0%,#eeeae3 100%)' }}>
        {loading ? (
          <div className="flex h-full items-center justify-center pt-16">
            <div className="flex flex-col items-center gap-3">
              <div className="h-8 w-8 rounded-full border-2 border-[#c8960c]/30 border-t-[#c8960c] animate-spin" />
              <p className="text-xs text-gray-400 font-semibold">Loading conversation…</p>
            </div>
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center pt-20 gap-3">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-[#fff8e1]">
              <span className="text-3xl">💬</span>
            </div>
            <p className="text-sm font-semibold text-gray-500">No messages yet</p>
            <p className="text-xs text-gray-400">Start the conversation below</p>
          </div>
        ) : items.map((item) => {
          if (item.type === 'divider') {
            return (
              <div key={item.key} className="flex items-center justify-center py-4">
                <span className="rounded-full bg-[#111]/10 px-3 py-1 text-[11px] font-bold text-[#111]/50">{item.label}</span>
              </div>
            )
          }
          const isUser  = item.sender_role === 'user'
          const isAdmin = item.sender_role === 'admin'
          return (
            <div key={item.id} className={"flex items-end gap-2 " + (isUser ? 'justify-end' : 'justify-start') + (item.optimistic ? ' opacity-60' : '')}>
              {!isUser && (
                <div className={"flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-white text-[10px] font-black mb-1 " + (isAdmin ? 'bg-[#111]' : 'bg-[#c8960c]')}>
                  {(item.sender_name || '?').charAt(0).toUpperCase()}
                </div>
              )}
              <div className={"max-w-[75%] flex flex-col " + (isUser ? 'items-end' : 'items-start')}>
                {!isUser && (
                  <div className="flex items-center gap-1.5 mb-1 ml-1">
                    <span className="text-[11px] font-black text-[#c8960c]">{item.sender_name}</span>
                    <span className={"text-[9px] font-black uppercase tracking-wide px-1.5 py-0.5 rounded-full " + (isAdmin ? 'bg-[#111] text-white' : 'bg-[#c8960c]/15 text-[#c8960c]')}>
                      {isAdmin ? 'Admin' : 'Support'}
                    </span>
                  </div>
                )}
                <div className={"relative px-4 py-3 shadow-sm " + (isUser ? 'bg-[#111] text-white rounded-t-2xl rounded-bl-2xl rounded-br-md' : 'bg-white text-[#111] rounded-t-2xl rounded-br-2xl rounded-bl-md border border-[#f0ece3]')}>
                  <p className="text-[13.5px] leading-relaxed whitespace-pre-wrap break-words">{item.message}</p>
                  <div className="flex items-center gap-1 justify-end mt-1.5">
                    <span className={"text-[10px] " + (isUser ? 'text-white/40' : 'text-gray-300')}>{formatTime(item.created_at)}</span>
                    {isUser && <CheckCheck size={12} className={item.optimistic ? 'text-white/30' : 'text-[#c8960c]'} />}
                  </div>
                </div>
              </div>
            </div>
          )
        })}
        <div ref={endRef} />
      </div>

      {/* Error */}
      {error && (
        <div className="mx-3 mb-1 flex items-center gap-2 rounded-2xl bg-red-50 border border-red-100 px-3 py-2 flex-shrink-0">
          <div className="h-1.5 w-1.5 rounded-full bg-red-400 flex-shrink-0" />
          <p className="text-xs text-red-500 flex-1">{error}</p>
          <button onClick={() => setError('')}><X size={13} className="text-red-400" /></button>
        </div>
      )}

      {/* Closed */}
      {ticket?.status === 'closed' && (
        <div className="flex items-center justify-center gap-2 bg-gray-50 border-t border-gray-200 px-4 py-3.5 flex-shrink-0">
          <Lock size={13} className="text-gray-400" />
          <p className="text-xs text-gray-400 font-semibold">This ticket is closed.</p>
        </div>
      )}

      {/* Compose */}
      {ticket?.status !== 'closed' && (
        <div className="flex items-end gap-3 bg-white border-t border-[#f0ece3] px-4 py-3 flex-shrink-0">
          <div className="flex-1 flex items-end rounded-3xl border border-[#e8e2d8] bg-[#f6f7fa] px-4 py-2.5 min-h-[44px] focus-within:border-[#c8960c] focus-within:bg-white transition-all">
            <textarea
              ref={textareaRef}
              rows={1}
              className="flex-1 resize-none bg-transparent text-sm text-[#111] outline-none placeholder:text-gray-400 max-h-[100px] leading-relaxed"
              placeholder="Type your message…"
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={onKey}
              disabled={sending}
            />
          </div>
          <button
            onClick={send}
            disabled={!text.trim() || sending}
            className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full bg-[#111] text-white shadow-lg active:scale-90 disabled:opacity-30 transition-all"
          >
            {sending ? (
              <span className="h-4 w-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
            ) : (
              <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5 translate-x-0.5">
                <path d="M2 21l21-9L2 3v7l15 2-15 2v7z" />
              </svg>
            )}
          </button>
        </div>
      )}
    </div>
  )
}