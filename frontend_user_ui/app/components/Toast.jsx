'use client'
import React from 'react'

const toneClasses = {
  success: 'bg-[#e0ffe0] text-[#065f46] border-[#9ae6b4]',
  error: 'bg-[#ffe0e0] text-[#b91c1c] border-[#fecaca]',
  info: 'bg-[#e5efff] text-[#1d4ed8] border-[#bfdbfe]',
};

export default function Toast({ message, type = 'info', onClose }) {
  if (!message) {
    return null;
  }

  return (
    <div className={`fixed left-1/2 top-4 z-100 w-[calc(100%-24px)] max-w-107.5 -translate-x-1/2 border px-3 py-2 text-sm shadow-md ${toneClasses[type] || toneClasses.info}`}>
      <div className="flex items-center justify-between gap-3">
        <p>{message}</p>
        <button type="button" className="text-xs font-semibold" onClick={onClose}>Close</button>
      </div>
    </div>
  )
}
