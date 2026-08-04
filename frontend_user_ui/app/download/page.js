'use client';

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { Shield, Star, Download, Share2, ChevronRight, ArrowLeft, Search, MoreVertical } from 'lucide-react';

/* ------------------------------------------------------------------ */
/*  Fake Play Store screenshots (use real paths if you have them)     */
/* ------------------------------------------------------------------ */
const SCREENSHOTS = [
  '/images/banner-img2.jpg',
];

/* ------------------------------------------------------------------ */
/*  Main component                                                     */
/* ------------------------------------------------------------------ */
export default function PlayStoreDownload() {
  const [downloading, setDownloading] = useState(false);
  const [moderatorRef, setModeratorRef] = useState(null);
  const searchParams = useSearchParams();

  // Capture moderator referral code from URL
  useEffect(() => {
    const ref = searchParams.get('ref');
    if (ref && /^M\d{5}$/i.test(ref)) {
      const normalizedRef = ref.toUpperCase();
      localStorage.setItem('moderator_ref', normalizedRef);
      setModeratorRef(normalizedRef);
    }
  }, [searchParams]);

  const handleInstall = () => {
    setDownloading(true);

    // Create a hidden link to trigger APK download
    const link = document.createElement('a');
    link.href = '/reddymatka.apk';
    link.download = 'reddymatka.apk';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    setTimeout(() => setDownloading(false), 3000);
  };

  return (
    <div className="flex min-h-screen flex-col bg-white font-[system-ui,sans-serif] text-[#202124]">

      {/* ── Top bar ─────────────────────────────────────────────── */}
      <header className="sticky top-0 z-30 flex items-center gap-3 bg-white px-4 py-2.5 shadow-[0_1px_3px_rgba(0,0,0,0.08)]">
        <ArrowLeft size={22} className="text-[#5f6368] cursor-pointer" onClick={() => window.history.back()} />
        <PlayStoreLogo />
        <div className="ml-auto flex items-center gap-4">
          <Search size={20} className="text-[#5f6368]" />
          <MoreVertical size={20} className="text-[#5f6368]" />
        </div>
      </header>

      {/* ── Category tabs ───────────────────────────────────────── */}
      <nav className="flex gap-6 border-b border-[#dadce0] px-5 text-sm font-medium">
        <span className="py-3 text-[#5f6368]">Games</span>
        <span className="border-b-2 border-[#01875f] py-3 text-[#01875f]">Apps</span>
        <span className="py-3 text-[#5f6368]">Books</span>
        <span className="py-3 text-[#5f6368]">Kids</span>
      </nav>

      {/* ── Referral banner (if via moderator) ─────────────────── */}
      {moderatorRef && (
        <div className="mx-5 mt-4 rounded-lg bg-gradient-to-r from-[#01875f] to-[#016d4d] px-4 py-3 text-white">
          <p className="text-sm font-medium">
            Referred by Agent : <span className="font-bold">{moderatorRef}</span>
          </p>
          <p className="text-xs opacity-90 mt-1">
            Your account will be linked to this Agent when you register.
          </p>
        </div>
      )}

      {/* ── App header ──────────────────────────────────────────── */}
      <section className="flex gap-4 px-5 pt-6 pb-4">
        <img
          src="/icons/download_page_logo.png"
          alt="REDDYMATKA"
          className="h-[72px] w-[72px] rounded-2xl shadow-md"
        />
        <div className="flex flex-col justify-center">
          <h1 className="text-[22px] font-medium leading-tight">REDDYMATKA</h1>
          <p className="mt-0.5 text-sm font-medium text-[#01875f]">PLAY THE MARKET • WIN THE GAME</p>
          <p className="mt-0.5 text-xs text-[#5f6368]">Contains ads&nbsp;&middot;&nbsp;In-app purchases</p>
        </div>
      </section>

      {/* ── Stats row ───────────────────────────────────────────── */}
      <div className="flex items-center justify-around border-y border-[#dadce0] py-3 mx-5">
        <Stat top="4.5★" bottom="2.1K reviews" />
        <Divider />
        <Stat top="50K+" bottom="Downloads" />
        <Divider />
        <Stat top={<RatingBadge />} bottom="Rated for 18+" />
      </div>

      {/* ── Install button ──────────────────────────────────────── */}
      <div className="px-5 pt-5">
        <button
          onClick={handleInstall}
          disabled={downloading}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#01875f] py-3.5 text-[15px] font-semibold text-white shadow transition-colors active:bg-[#016d4d] disabled:opacity-70"
        >
          {downloading ? (
            <>
              <span className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent" />
              Downloading…
            </>
          ) : (
            'Install'
          )}
        </button>
      </div>

      {/* ── Share / Wishlist ────────────────────────────────────── */}
      <div className="flex items-center gap-8 px-5 pt-4 text-sm text-[#01875f]">
        <button className="flex items-center gap-1.5 font-medium">
          <Share2 size={16} /> Share
        </button>
        <button className="flex items-center gap-1.5 font-medium">
          <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2z"/></svg>
          Add to wishlist
        </button>
      </div>

      {/* ── Device compatibility ─────────────────────────────────── */}
      <p className="flex items-center gap-1.5 px-5 pt-4 text-xs text-[#5f6368]">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="5" y="2" width="14" height="20" rx="2"/><line x1="12" y1="18" x2="12.01" y2="18"/></svg>
        This app is available for all of your devices
      </p>

      {/* ── Screenshots ──────────────────────────────────────────── */}
      {SCREENSHOTS.length > 0 && (
        <section className="mt-5 px-5">
          <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide">
            {SCREENSHOTS.map((src, i) => (
              <img
                key={i}
                src={src}
                alt={`Screenshot ${i + 1}`}
                className="h-[200px] w-auto rounded-xl border border-[#dadce0] object-cover"
              />
            ))}
          </div>
        </section>
      )}

      {/* ── About section ────────────────────────────────────────── */}
      <section className="px-5 pt-6">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-medium">About this app</h2>
          <ChevronRight size={20} className="text-[#5f6368]" />
        </div>
        <p className="mt-2 text-sm leading-relaxed text-[#5f6368]">
          ReddyMatka  is the most trusted and fastest platform for  Matka results, live updates, and charts. Get instant notifications, play responsibly, and track your game history — everything in one place.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {['Entertainment', 'Games', 'Results'].map((tag) => (
            <span key={tag} className="rounded-full border border-[#dadce0] px-3 py-1 text-xs text-[#5f6368]">
              {tag}
            </span>
          ))}
        </div>
      </section>

      {/* ── Data safety ──────────────────────────────────────────── */}
      <section className="mx-5 mt-6 rounded-xl border border-[#dadce0] p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-medium">Data safety</h2>
          <ChevronRight size={20} className="text-[#5f6368]" />
        </div>
        <p className="mt-1.5 text-xs leading-relaxed text-[#5f6368]">
          Safety starts with understanding how developers collect and share your data.
        </p>
        <div className="mt-3 flex items-start gap-3 rounded-lg bg-[#f8f9fa] p-3">
          <Shield size={20} className="mt-0.5 shrink-0 text-[#5f6368]" />
          <div className="text-xs leading-relaxed text-[#5f6368]">
            <p className="font-medium text-[#202124]">No data shared with third parties</p>
            <p className="mt-1">Data is encrypted in transit</p>
          </div>
        </div>
      </section>

      {/* ── Ratings & reviews ────────────────────────────────────── */}
      <section className="px-5 pt-6 pb-10">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-medium">Ratings and reviews</h2>
          <ChevronRight size={20} className="text-[#5f6368]" />
        </div>

        <div className="mt-4 flex gap-6">
          {/* Big number */}
          <div className="text-center">
            <p className="text-5xl font-light">4.5</p>
            <div className="mt-1 flex justify-center gap-0.5">
              {[1,2,3,4].map(i => <Star key={i} size={12} fill="#01875f" color="#01875f" />)}
              <Star size={12} fill="#01875f" color="#01875f" strokeWidth={0} className="[clip-path:inset(0_50%_0_0)]" />
            </div>
            <p className="mt-1 text-xs text-[#5f6368]">2,103</p>
          </div>

          {/* Bars */}
          <div className="flex flex-1 flex-col justify-center gap-1.5">
            {[
              { stars: 5, pct: 62 },
              { stars: 4, pct: 22 },
              { stars: 3, pct: 8 },
              { stars: 2, pct: 4 },
              { stars: 1, pct: 4 },
            ].map(({ stars, pct }) => (
              <div key={stars} className="flex items-center gap-2 text-xs text-[#5f6368]">
                <span className="w-2 text-right">{stars}</span>
                <div className="h-[8px] flex-1 overflow-hidden rounded-full bg-[#e8eaed]">
                  <div className="h-full rounded-full bg-[#01875f]" style={{ width: `${pct}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Sample review */}
        <div className="mt-5 rounded-xl border border-[#dadce0] p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#01875f] text-xs font-bold text-white">R</div>
            <span className="text-sm font-medium">Rahul Kumar</span>
          </div>
          <div className="mt-2 flex items-center gap-2">
            <div className="flex gap-0.5">
              {[1,2,3,4,5].map(i => <Star key={i} size={11} fill="#01875f" color="#01875f" />)}
            </div>
            <span className="text-xs text-[#5f6368]">March 28, 2026</span>
          </div>
          <p className="mt-2 text-sm leading-relaxed text-[#5f6368]">
            Best app for satta results. Fast, reliable and easy to use. The live updates feature is amazing!
          </p>
        </div>
      </section>
    </div>
  );
}

/* ================================================================== */
/*  Sub-components                                                     */
/* ================================================================== */

function PlayStoreLogo() {
  return (
    <div className="flex items-center gap-1.5">
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
        <path d="M3.609 1.814L13.792 12 3.61 22.186a.996.996 0 01-.61-.92V2.734c0-.382.218-.72.609-.92z" fill="#4285F4"/>
        <path d="M17.194 8.598L14.5 10.17l.003.002L13.792 12l.711 1.828 3.401 1.97.71.413 3.08-1.78c.86-.5.86-1.32 0-1.82l-4.5-4.013z" fill="#FBBC04"/>
        <path d="M3.609 1.814L14.503 10.17l2.691-1.572L3.609 1.814z" fill="#34A853"/>
        <path d="M14.503 13.83L3.609 22.186l13.585-6.928-2.691-1.428z" fill="#EA4335"/>
      </svg>
      <span className="text-lg font-normal text-[#5f6368]">Google Play</span>
    </div>
  );
}

function Stat({ top, bottom }) {
  return (
    <div className="flex flex-col items-center gap-0.5">
      <span className="text-sm font-semibold">{top}</span>
      <span className="text-[11px] text-[#5f6368]">{bottom}</span>
    </div>
  );
}

function Divider() {
  return <div className="h-6 w-px bg-[#dadce0]" />;
}

function RatingBadge() {
  return (
    <div className="flex items-center justify-center">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#202124" strokeWidth="2">
        <path d="M16 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/>
        <circle cx="8.5" cy="7" r="4"/>
        <line x1="18" y1="8" x2="18" y2="14"/>
        <line x1="21" y1="11" x2="15" y2="11"/>
      </svg>
    </div>
  );
}
