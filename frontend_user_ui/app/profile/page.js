'use client'
import React, { useState, useEffect } from 'react'
import { User, BarChart2, CreditCard, ChevronRight, Bell, Shield, FileText, Info } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { userAPI, notificationAPI } from '../lib/api'
import { useAuth } from '../lib/AuthContext'

const Profile = () => {
  const { user, logout } = useAuth();
  const router = useRouter();
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
        <h1 className="absolute left-1/2 -translate-x-1/2 text-lg font-black text-[#333]">Profile</h1>
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
              <p className="text-[11px] font-black uppercase tracking-[0.14em] text-[#ffd26a]">Notifications</p>
              <p className="truncate text-xs text-white/90" aria-live="polite" key={tickerIndex}>{tickerItems[tickerIndex]}</p>
            </div>
          </div>
        </div>

       

        {/* My Account */}
        <section>
          <h3 className="mb-2 px-1 text-xs font-black uppercase tracking-[0.12em] text-[#777]">My Account</h3>
          <div className="divide-y divide-[#f0ece3]">
            <Link href="/account-statement" className={menuItemClass}>
              <div className="flex items-center gap-3 text-sm font-semibold text-[#111]">
                <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-[#f7f6f3]">
                  <User size={28} strokeWidth={2.2} className="text-[#b88422]" />
                </span>
                <span>Account Statement</span>
              </div>
              <ChevronRight size={20} className="text-[#b88422]" />
            </Link>
            <Link href="/profit-loss" className={menuItemClass}>
              <div className="flex items-center gap-3 text-sm font-semibold text-[#111]">
                <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-[#f7f6f3]">
                  <BarChart2 size={28} strokeWidth={2.2} className="text-[#b88422]" />
                </span>
                <span>Betting Profit &amp; Loss</span>
              </div>
              <ChevronRight size={20} className="text-[#b88422]" />
            </Link>
            <Link href="/bank-accounts" className={menuItemClass}>
              <div className="flex items-center gap-3 text-sm font-semibold text-[#111]">
                <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-[#f7f6f3]">
                  <CreditCard size={28} strokeWidth={2.2} className="text-[#b88422]" />
                </span>
                <span>Bank Account</span>
              </div>
              <ChevronRight size={20} className="text-[#b88422]" />
            </Link>
          </div>
        </section>

        {/* Information */}
        <section>
          <h3 className="mb-2 px-1 text-xs font-black uppercase tracking-[0.12em] text-[#777]">Information</h3>
          <div className="divide-y divide-[#f0ece3]">
            <Link href="/privacy-policy" className={menuItemClass}>
              <div className="flex items-center gap-3 text-sm font-semibold text-[#111]">
                <div className="flex h-9 w-9 items-center justify-center bg-[#fff4d6]">
                  <Shield size={20} className="text-[#c8960c]" />
                </div>
                <span>Privacy Policy</span>
              </div>
            </Link>
            <Link href="/terms-and-conditions" className={menuItemClass}>
              <div className="flex items-center gap-3 text-sm font-semibold text-[#111]">
                <div className="flex h-9 w-9 items-center justify-center bg-[#fff4d6]">
                  <FileText size={20} className="text-[#c8960c]" />
                </div>
                <span>Terms &amp; Conditions</span>
              </div>
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

        {/* Logout */}
        <button
          className="w-full bg-red-600 px-4 py-3 text-sm font-black uppercase tracking-[0.14em] text-white"
          onClick={handleLogout}
        >
          Logout
        </button>
      </main>
    </div>
  );
};

export default Profile