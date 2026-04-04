import Link from 'next/link'
import React, { useState, useEffect } from 'react'
import { useAuth } from '../lib/AuthContext'
import { notificationAPI, walletAPI } from '../lib/api'
import { getSocket } from '../lib/socket'

const NOTICE_TEXT = 'महत्वपूर्ण सूचना: हम केवल संख्याओं के अनुमान/भविष्यवाणी प्रदान करते हैं। हमारा किसी भी प्रकार के जुआ या सट्टेबाजी से कोई संबंध नहीं है। किसी भी लाभ या हानि के लिए आप स्वयं पूरी तरह से जिम्मेदार होंगे।';

const Header = () => {
  
  const [openMenu, setOpenMenu] = useState(false);
  const [usopen, setusOpen] = useState(false);
  const { isLoggedIn, logout } = useAuth();
  const defaultWallet = { balance: 0, bonus_balance: 0, exposure: 0, available_withdrawal: 0, total: 0 };
  const [wallet, setWallet] = useState(defaultWallet);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);

  const unreadCount = notifications.filter((item) => !item.is_read).length;

  const applyWallet = (data) => {
    if (data && typeof data === 'object') {
      setWallet({ ...defaultWallet, ...data, balance: parseFloat(data.balance) || 0, bonus_balance: parseFloat(data.bonus_balance) || 0, exposure: parseFloat(data.exposure) || 0, available_withdrawal: parseFloat(data.available_withdrawal) || 0, total: parseFloat(data.total) || 0 });
    }
  };

  useEffect(() => {
    if (isLoggedIn) {
      walletAPI.getInfo().then(applyWallet).catch(() => {});
      notificationAPI.my().then((response) => setNotifications(response.notifications || [])).catch(() => {});
    }
  }, [isLoggedIn]);

  // Live wallet balance via socket — no polling needed
  useEffect(() => {
    if (!isLoggedIn) return;
    const sock = getSocket();
    const handleWalletUpdated = ({ balance }) => {
      setWallet((prev) => ({
        ...prev,
        balance: parseFloat(balance) || 0,
        available_withdrawal: parseFloat(balance) || 0,
        total: (parseFloat(balance) || 0) + (prev.bonus_balance || 0),
      }));
    };
    sock.on('wallet_updated', handleWalletUpdated);
    return () => { sock.off('wallet_updated', handleWalletUpdated); };
  }, [isLoggedIn]);

  const toggleDrawer = () => {
    setusOpen(!usopen);
    if (!usopen && isLoggedIn) {
      walletAPI.getInfo().then(applyWallet).catch(() => {});
    }
  };

  const handleLogout = () => {
    logout();
    window.location.href = '/login';
  };

  const toggleNotifications = () => {
    const next = !notificationsOpen;
    setNotificationsOpen(next);
    if (next && isLoggedIn) {
      notificationAPI.my().then((response) => setNotifications(response.notifications || [])).catch(() => {});
    }
  };

  const markNotificationRead = async (notificationId) => {
    try {
      await notificationAPI.markRead(notificationId);
      setNotifications((current) => current.map((item) => item.id === notificationId ? { ...item, is_read: 1 } : item));
    } catch {
      // no-op
    }
  };
  
  return (
    <div className="sticky top-0 z-40 mx-auto w-full max-w-107.5 bg-black text-white shadow-[0_8px_24px_rgba(0,0,0,0.24)]">
      <header>
        <div className="flex items-center justify-between px-2 py-1.5">
          <div className="flex items-center gap-4">
            <button type="button" className="text-white" onClick={() => setOpenMenu(true)} aria-label="Open menu">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" /></svg>
            </button>
            <div className="flex items-center">
              <Link href="/"><img src="/images/logo.png" alt="Winbuzz" className="h-8 w-auto" /></Link>
            </div>
          </div>
          <div className="flex items-center gap-2.5">
            <button type="button" className="relative bg-[#b88422] px-2.5 py-1.5" onClick={toggleNotifications} aria-label="Open notifications">
              <i className="fa fa-bell text-[13px] text-black" aria-hidden="true"></i>
              {unreadCount > 0 && (
                <span className="absolute -right-1 -top-1 inline-flex min-h-4 min-w-4 items-center justify-center rounded-full bg-[#b91c1c] px-1 text-[9px] font-bold text-white">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </button>
           
            <div className="flex min-w-20 flex-col bg-[#b88422] px-1 py-1 text-left leading-none text-black">
              <span className="text-[10px] font-bold">Bal: {wallet.balance.toFixed(2)}</span>
              <small className="mt-1 text-[8px] font-semibold text-[#00ff66]">Exp: {wallet.exposure}</small>
            </div>
            <button type="button" className="bg-[#b88422] px-2.5 py-1.5" onClick={toggleDrawer} aria-label="Open wallet drawer">
              <img src="/images/per-icon.png" className='h-4 w-4 object-contain' alt="Profile" />
            </button>
          </div>
        </div>
      <div className="notice-marquee bg-[linear-gradient(94deg,#b6842d,#ebda8d_55%,#b7862f)] px-3 py-1.5 text-[12px] text-black">
        <span className="notice-marquee-label bg-black px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.14em] text-[#ffd26a]">
          Notice
        </span>
        <div className="notice-marquee-body">
          <div className="notice-marquee-track">
            {[0, 1].map((itemIndex) => (
              <div key={itemIndex} className="notice-marquee-item">
                <span className="notice-marquee-text text-[12px] font-semibold">{NOTICE_TEXT}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

        <div className={`fixed inset-0 z-40 bg-black/40 transition ${openMenu ? 'visible opacity-100' : 'invisible opacity-0'}`} onClick={() => setOpenMenu(false)} />
        <aside className={`fixed left-0 top-0 z-50 h-full w-72 bg-black px-5 py-6 text-white shadow-[8px_0_24px_rgba(0,0,0,0.35)] transition-transform ${openMenu ? 'translate-x-0' : '-translate-x-full'}`}>
          <button type="button" className="absolute left-4 top-4 text-xl" onClick={() => setOpenMenu(false)}>✕</button>
          <div className="mt-8 text-center">
            <Link href="/"><img src="/images/logo.png" alt="Winbuzz" className="mx-auto h-10 w-auto" /></Link>
          </div>
          <ul className="mt-8 space-y-3 text-sm font-semibold text-white/90">
            {[
              { label: 'Home', href: '/home' },
              { label: 'Games', href: '/game-page' },
              { label: 'My Bets', href: '/my-bets' },
              { label: 'Wallet', href: '/wallet' },
              { label: 'Deposit', href: '/deposit' },
              { label: 'Withdraw', href: '/withdraw' },
              { label: 'Charts', href: '/chart' },
              { label: 'Notifications', href: '/notifications' },
              { label: 'Account Statement', href: '/account-statement' },
              { label: 'Profit / Loss', href: '/profit-loss' },
            ].map((item) => (
              <li key={item.href} className="border border-white/10 px-4 py-3">
                <Link href={item.href} onClick={() => setOpenMenu(false)}>{item.label}</Link>
              </li>
            ))}
          </ul>
        </aside>

        <div className={`fixed inset-0 z-40 bg-black/40 transition ${usopen ? 'visible opacity-100' : 'invisible opacity-0'}`} onClick={() => setusOpen(false)} />
        <div className={`absolute right-0 top-10 z-50  w-55 bg-[rgba(255,255,255,0.95)] p-3 text-black shadow-[0_16px_32px_rgba(0,0,0,0.25)] transition ${usopen ? 'visible translate-y-0 opacity-100' : 'invisible -translate-y-2 opacity-0'}`}>
          <div className="border border-[#b88831] bg-[#f1f1f1] px-3 py-2">
            <div className="mb-3 flex items-start justify-between gap-3 text-[13px] leading-4">
              <span>Wallet Amount <br/><small>(Inclusive bonus)</small></span>
              <strong>{wallet.total?.toFixed(2) || '0.00'}</strong>
            </div>
            <div className="mb-3 flex items-center justify-between text-[13px] leading-4"><span>Net Exposure</span><strong>{wallet.exposure?.toFixed(2) || '0.00'}</strong></div>
            <div className="mb-3 flex items-center justify-between text-[13px] leading-4"><span>Bonus</span><strong>{wallet.bonus_balance?.toFixed(2) || '0.00'}</strong></div>
            <div className="flex items-center justify-between text-[13px] leading-4"><span>Available Withdrawal</span><strong>{wallet.available_withdrawal?.toFixed(2) || '0.00'}</strong></div>
          </div>
          <button type="button" className="my-3 block w-full bg-[#c9972b] px-4 py-2 text-sm font-semibold text-white">Refer and Earn</button>
          <ul className="border-t border-[#b88831] pt-2 text-sm font-semibold">
            <li><Link href="/account-statement" className='flex items-center gap-2 border-b border-[#eee] px-2 py-2'><i className="fa fa-university"></i> Account Statement</Link></li>
            <li><Link href="/profit-loss" className='flex items-center gap-2 border-b border-[#eee] px-2 py-2'><i className="fa fa-cog"></i> Betting Profit & Loss</Link></li>
            <li><Link href="/bonus-rules" className='flex items-center gap-2 border-b border-[#eee] px-2 py-2'><i className="fa fa-gavel"></i> Bonus Rules</Link></li>
            {isLoggedIn ? (
              <li><button onClick={handleLogout} className='flex w-full items-center gap-2 px-2 py-2 text-left text-red-600 text-shadow-red-700 cursor-pointer'><i className="fa fa-sign-out"></i> Logout</button></li>
            ) : (
              <li><Link href="/login" className='flex items-center gap-2 px-2 py-2'><i className="fa fa-sign-out"></i> Login</Link></li>
            )}
          </ul>
        </div>

        {notificationsOpen && (
          <div className="fixed inset-0 z-40 bg-black/40" onClick={() => setNotificationsOpen(false)} />
        )}
        <div className={`absolute right-12 top-10 z-50 w-72 border border-[#d6b774] bg-white p-2 text-black shadow-[0_16px_32px_rgba(0,0,0,0.25)] transition ${notificationsOpen ? 'visible translate-y-0 opacity-100' : 'invisible -translate-y-2 opacity-0'}`}>
          <div className="border-b border-[#ead8ab] px-2 py-2 text-xs font-black uppercase tracking-[0.12em] text-[#6d4a08]">Notifications</div>
          <div className="max-h-64 overflow-y-auto">
            {notifications.slice(0, 8).map((item) => (
              <button
                type="button"
                key={item.id}
                className={`w-full border-b border-[#f0e3c6] px-2 py-2 text-left text-xs ${item.is_read ? 'bg-white text-[#4b5563]' : 'bg-[#fff8e7] text-[#111]'}`}
                onClick={() => markNotificationRead(item.id)}
              >
                <div className="font-semibold">{item.message}</div>
                <div className="mt-1 text-[10px] text-[#6b7280]">{new Date(item.created_at).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</div>
              </button>
            ))}
            {notifications.length === 0 && <p className="px-2 py-3 text-xs text-[#6b5a3a]">No notifications yet.</p>}
          </div>
        </div>
      </header>

    </div>

  
  )
}

export default Header
