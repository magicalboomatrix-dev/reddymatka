'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import { customAdsAPI } from '../lib/api'

const API_BASE = process.env.NEXT_PUBLIC_API_URL || '/api'
const BACKEND_BASE = API_BASE.replace(/\/api\/?$/, '')

function adImageUrl(imageUrl) {
  if (!imageUrl) return ''
  return `${BACKEND_BASE}/uploads/${imageUrl}`
}

export default function CustomAds() {
  const [ads, setAds] = useState([])

  useEffect(() => {
    customAdsAPI.list().then(setAds).catch(() => {})
  }, [])

  if (!ads.length) return null

  return (
    <section className="w-full p-1">
      <div className="space-y-1 max-w-105 mx-auto">
        {ads.map((ad) => (
          <div
            key={ad.id}
            className="rounded-2xl border-2 border-dashed border-red-500 bg-gradient-to-b from-[#e0bc87] to-[#faf3e6]
p-2 text-center shadow-md"
          >
            {ad.title && (
              <p className="text-base font-black leading-snug text-[#1a0000] mb-2 line-through-none">
                {ad.title}
              </p>
            )}

            {ad.content && (
              <p className="text-sm font-semibold leading-relaxed text-[#2b0000] whitespace-pre-line">
                {ad.content}
              </p>
            )}

            {ad.extra_text && (
              <p className="mt-2 text-sm font-bold text-[#5a0000]">
                {ad.extra_text}
              </p>
            )}

            {ad.image_url && ad.button_link ? (
              <Link
                href={ad.button_link}
                target="_blank"
                rel="noopener noreferrer"
                className="block"
              >
                <img
                  src={adImageUrl(ad.image_url)}
                  alt={ad.title || 'Custom Ad'}
                  className="mx-auto h-10 w-full object-contain rounded-xl"
                />
              </Link>
            ) : ad.image_url ? (
              <img
                src={adImageUrl(ad.image_url)}
                alt={ad.title || 'Custom Ad'}
                className="mx-auto h-10 w-full object-contain rounded-xl"
              />
            ) : null}

            {!ad.image_url && ad.button_text && ad.button_link && (
              <Link
                href={ad.button_link}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-3 inline-block rounded-full bg-[#e9ca91e0] px-6 py-2 text-sm font-black uppercase tracking-wide text-white shadow"
              >
                {ad.button_text}
              </Link>
            )}
          </div>
        ))}
      </div>
    </section>
  )
}
