'use client'
import React, { useState, useEffect } from 'react'
import { User, BarChart2, CreditCard, ChevronRight, Bell, Shield, FileText, Info, PlayCircle, Gift, Headphones, Languages } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { userAPI, notificationAPI } from '../lib/api'
import { useAuth } from '../lib/AuthContext'
import { useLanguage } from '../lib/LanguageContext'
import { translations } from '../lib/translations'

const Profile = () => {
  const { user, logout } = useAuth();
  const router = useRouter();
  const { t, language, setLanguage } = useLanguage();
  const [profile, setProfile] = useState(null);
  const [notifications, setNotifications] = useState([]);
  const [tickerIndex, setTickerIndex] = useState(0);

  useEffect(() => {
    userAPI.getProfile().then(res => setProfile(res.user || res)).catch(() => {});
    notificationAPI.recent().then(res => setNotifications(res.notifications || [])).catch(() => {});
  }, []);

  useEffect(() => {
    if (notifications.length <= 1) {
      setTickerIndex(0);
      return;
    }
    const intervalId = window.setInterval(() => {
      setTickerIndex((current) => (current + 1) % notifications.length);
    }, 3000);
    return () => window.clearInterval(intervalId);
  }, [notifications]);

  const phone = profile?.phone || user?.phone || '';
  const displayName = profile?.name || phone;

  const tickerItems = notifications.length > 0
    ? notifications.map((item) => item.message || item.title || 'Notification')
    : ['No recent notifications'];

  const menuItemClass = 'flex items-center justify-between border border-[#ebe3d2] bg-white px-4 py-3';

  const handleLogout = () => {
    logout();
    router.push('/login');
  };

  return (
    <div className="mx-auto min-h-screen w-full max-w-107.5 bg-[#f6f7fa] pb-8">
      {/* Header */}
      <header className="relative flex items-center justify-between bg-white px-4 py-3 shadow-sm">
        <Link href="/home">
          <img src="/images/back-btn.png" alt="Back" className="h-5 w-5" />
        </Link>
        <h1 className="absolute left-1/2 -translate-x-1/2 text-lg font-black text-[#333]">{t(translations.profile.title)}</h1>
        <div className="h-5 w-5" />
      </header>

      <main className="mx-auto w-full max-w-107.5 space-y-4 px-4 pt-4">
        {/* Profile Header Card */}
        <section className="flex items-center bg-white px-4 py-6 shadow-sm gap-4 rounded-xl">
  
          <div className="flex h-20 w-20 items-center justify-center overflow-hidden">
            <img
              src="/images/user-pic.jpg"
              alt="User"
              className="h-full w-full object-contain"
            />
          </div>

          <div className="flex flex-col">
            <h2 className="font-black text-[#111] text-xl">{displayName}</h2>
            <h3 className="text-sm font-bold text-gray-800"> {phone}</h3>
          </div>

        </section>

        {/* Notifications Ticker */}
        <div className="flex items-center justify-between gap-3 bg-[#111] px-4 py-3 text-white">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center bg-[#1f1f1f]">
              <Bell size={18} className="text-[#ffd26a]" />
            </div>
            <div className="min-w-0">
              <p className="text-[11px] font-black uppercase tracking-[0.14em] text-[#ffd26a]">{t(translations.header.notifications)}</p>
              <p className="truncate text-xs text-white/90" aria-live="polite" key={tickerIndex}>{tickerItems[tickerIndex]}</p>
            </div>
          </div>
        </div>

        {/* My Account */}
        <section>
          <h3 className="mb-2 px-1 text-xs font-black uppercase tracking-[0.12em] text-[#777]">{t(translations.profile.personalInfo)}</h3>
          <div className="divide-y divide-[#f0ece3]">
            <Link href="/account-statement" className={menuItemClass}>
              <div className="flex items-center gap-3 text-sm font-semibold text-[#111]">
                <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-[#f7f6f3]">
                  <User size={28} strokeWidth={2.2} className="text-[#b88422]" />
                </span>
                <span>{t(translations.header.accountStatement)}</span>
              </div>
              <ChevronRight size={20} className="text-[#b88422]" />
            </Link>
            <Link href="/profit-loss" className={menuItemClass}>
              <div className="flex items-center gap-3 text-sm font-semibold text-[#111]">
                <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-[#f7f6f3]">
                  <BarChart2 size={28} strokeWidth={2.2} className="text-[#b88422]" />
                </span>
                <span>{t(translations.header.bettingProfitLoss)}</span>
              </div>
              <ChevronRight size={20} className="text-[#b88422]" />
            </Link>
            <Link href="/bank-accounts" className={menuItemClass}>
              <div className="flex items-center gap-3 text-sm font-semibold text-[#111]">
                <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-[#f7f6f3]">
                  <CreditCard size={28} strokeWidth={2.2} className="text-[#b88422]" />
                </span>
                <span>{t(translations.bankAccounts.title)}</span>
              </div>
              <ChevronRight size={20} className="text-[#b88422]" />
            </Link>
            <Link href="/referrals" className={menuItemClass}>
              <div className="flex items-center gap-3 text-sm font-semibold text-[#111]">
                <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-[#f7f6f3]">
                  <Gift size={28} strokeWidth={2.2} className="text-[#b88422]" />
                </span>
                <span>{t(translations.header.referAndEarn)}</span>
              </div>
              <ChevronRight size={20} className="text-[#b88422]" />
            </Link>
          </div>
        </section>

        {/* Support */}
        <section>
          <h3 className="mb-2 px-1 text-xs font-black uppercase tracking-[0.12em] text-[#777]">{t(translations.support.title)}</h3>
          <div className="divide-y divide-[#f0ece3]">
            <Link href="/support" className={menuItemClass}>
              <div className="flex items-center gap-3 text-sm font-semibold text-[#111]">
                <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-[#fff4d6]">
                  <Headphones size={20} className="text-[#c8960c]" />
                </span>
                <span>{t(translations.support.contactUs)}</span>
              </div>
              <ChevronRight size={20} className="text-[#b88422]" />
            </Link>
          </div>
        </section>

        {/* Settings */}
        <section>
          <h3 className="mb-2 px-1 text-xs font-black uppercase tracking-[0.12em] text-[#777]">{t(translations.settings.title)}</h3>
          <div className="divide-y divide-[#f0ece3]">
            <div className={menuItemClass}>
              <div className="flex items-center gap-3 text-sm font-semibold text-[#111]">
                <div className="flex h-9 w-9 items-center justify-center bg-[#fff4d6]">
                  <Languages size={20} className="text-[#c8960c]" />
                </div>
                <span>{t(translations.settings.language)}</span>
              </div>
              <button
                onClick={() => setLanguage(language === 'en' ? 'hi' : 'en')}
                className="relative inline-flex h-7 w-16 items-center rounded-full bg-[#e5e7eb] transition-colors duration-300 focus:outline-none"
                style={{ backgroundColor: language === 'hi' ? '#b88422' : '#e5e7eb' }}
              >
                <span className="absolute left-2 text-[10px] font-bold text-white transition-opacity duration-300" style={{ opacity: language === 'hi' ? 1 : 0 }}>HI</span>
                <span className="absolute right-2 text-[10px] font-bold text-gray-500 transition-opacity duration-300" style={{ opacity: language === 'en' ? 1 : 0 }}>EN</span>
                <span
                  className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-sm transition-transform duration-300 ${
                    language === 'hi' ? 'translate-x-10' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>
          </div>
        </section>

        {/* Information */}
        <section>
          <h3 className="mb-2 px-1 text-xs font-black uppercase tracking-[0.12em] text-[#777]">{t(translations.settings.about)}</h3>
          <div className="divide-y divide-[#f0ece3]">
            <Link href="/how-to-play" className={menuItemClass}>
              <div className="flex items-center gap-3 text-sm font-semibold text-[#111]">
                <div className="flex h-9 w-9 items-center justify-center bg-[#fff4d6]">
                  <PlayCircle size={20} className="text-[#c8960c]" />
                </div>
                <span>{t(translations.howToPlay.title)}</span>
              </div>
              <ChevronRight size={20} className="text-[#b88422]" />
            </Link>
            <Link href="/privacy-policy" className={menuItemClass}>
              <div className="flex items-center gap-3 text-sm font-semibold text-[#111]">
                <div className="flex h-9 w-9 items-center justify-center bg-[#fff4d6]">
                  <Shield size={20} className="text-[#c8960c]" />
                </div>
                <span>{t(translations.settings.privacy)}</span>
              </div>
            </Link>
            <Link href="/terms-and-conditions" className={menuItemClass}>
              <div className="flex items-center gap-3 text-sm font-semibold text-[#111]">
                <div className="flex h-9 w-9 items-center justify-center bg-[#fff4d6]">
                  <FileText size={20} className="text-[#c8960c]" />
                </div>
                <span>{t(translations.settings.terms)}</span>
              </div>
              <ChevronRight size={20} className="text-[#b88422]" />
            </Link>
            <Link href="/disclaimer" className={menuItemClass}>
              <div className="flex items-center gap-3 text-sm font-semibold text-[#111]">
                <div className="flex h-9 w-9 items-center justify-center bg-[#fff4d6]">
                  <Info size={20} className="text-[#c8960c]" />
                </div>
                <span>Disclaimer</span>
              </div>
              <ChevronRight size={20} className="text-[#b88422]" />
            </Link>
          </div>
        </section>

        {/* Important Announcement */}
        <section className="mb-4 border border-red-200 bg-[#fffdfd] shadow-[0_4px_12px_rgba(220,38,38,0.08)]">
          <div className="flex items-center gap-2 border-b border-red-100 bg-red-50 px-4 py-2.5">
            <Info size={18} className="text-red-600" />
            <h3 className="text-[11px] font-black uppercase tracking-[0.14em] text-red-700">Important Notice</h3>
          </div>
          <div className="px-4 py-3 space-y-2.5">
            <div className="flex items-start gap-2">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-red-500"></span>
              <p className="text-sm font-bold text-[#b91c1c]">क्वाड की पेमेंट नहीं मिलेगी</p>
            </div>
            <div className="flex items-start gap-2">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-red-500"></span>
              <p className="text-sm font-bold text-[#b91c1c]">डबल जोड़ी मान्य नहीं होगी लास्ट टाइम</p>
            </div>
          </div>
        </section>

        {/* Logout */}
        <button
          className="w-full bg-red-600 px-4 py-3 text-sm font-black uppercase tracking-[0.14em] text-white"
          onClick={handleLogout}
        >
          {t(translations.header.logout)}
        </button>
      </main>
    </div>
  );
};

export default Profile