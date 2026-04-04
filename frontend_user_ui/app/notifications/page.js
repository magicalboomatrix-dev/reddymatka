'use client'
import React, { useState, useEffect } from 'react'
import Header from '../components/Header'
import DepositWithdrawBtns from '../components/DepositWithdrawBtns'
import { notificationAPI } from '../lib/api'

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    fetchNotifications()
  }, [])

  const fetchNotifications = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await notificationAPI.my()
      setNotifications(res.notifications || [])
    } catch (err) {
      console.error('[notifications] fetch error:', err)
      setError('Failed to load notifications.')
    } finally {
      setLoading(false)
    }
  }

  const markRead = async (id) => {
    try {
      await notificationAPI.markRead(id)
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, is_read: 1 } : n))
      )
    } catch (err) {
      console.error('[notifications] markRead error:', err)
    }
  }

  const typeIcon = (type) => {
    switch (type) {
      case 'win':     return '🏆'
      case 'deposit': return '💰'
      case 'withdraw': return '🏧'
      default:         return '🔔'
    }
  }

  return (
    <div>
      <Header />
      <div className="bg-white pb-6">
        <DepositWithdrawBtns />
        <div className="mx-auto w-full max-w-[430px]">
          <div className="bg-[linear-gradient(94deg,#b6842d,#ebda8d_55%,#b7862f)] px-4 py-2.5 text-center text-[#111]">
            <h2 className="text-sm font-semibold uppercase tracking-[0.08em]"><b>Notifications</b></h2>
          </div>

          <div className="border border-t-0 border-[#d6b774] bg-white shadow-[0_12px_28px_rgba(79,52,10,0.08)] min-h-[200px]">
            {loading && (
              <div className="flex items-center justify-center py-12 text-sm text-gray-400">Loading…</div>
            )}
            {error && (
              <div className="px-4 py-6 text-center text-sm text-red-600">{error}</div>
            )}
            {!loading && !error && notifications.length === 0 && (
              <div className="px-4 py-12 text-center text-sm text-gray-400">No notifications yet.</div>
            )}
            {!loading && notifications.map((n) => (
              <div
                key={n.id}
                onClick={() => !n.is_read && markRead(n.id)}
                className={`flex items-start gap-3 border-b border-[#f0e3c6] px-4 py-3 cursor-pointer ${
                  !n.is_read ? 'bg-[#fdf8ee]' : 'bg-white'
                }`}
              >
                <span className="mt-0.5 text-xl">{typeIcon(n.type)}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-[#111] leading-snug">{n.message}</p>
                  <p className="mt-1 text-xs text-gray-400">
                    {new Date(n.created_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}
                  </p>
                </div>
                {!n.is_read && (
                  <span className="mt-1 h-2 w-2 rounded-full bg-[#b6842d] shrink-0" />
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
