import React from 'react'

export default function SkeletonBlock({ className = '' }) {
  return <div className={`animate-pulse bg-[#efe8d8] ${className}`} />
}
