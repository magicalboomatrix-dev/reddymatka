import { useState, useEffect } from 'react';
import { Outlet, Link, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import AdminCommandBar from './AdminCommandBar';

const navItems = [
  { path: '/', label: 'Dashboard', icon: '📊' },
  { path: '/users', label: 'Users', icon: '👥' },
  { path: '/moderators', label: 'Moderators', icon: '🛡️' },
  { path: '/deposits', label: 'Deposits', icon: '💰' },
  { path: '/auto-deposits', label: 'Auto Deposits', icon: '⚡' },
  { path: '/upi-management', label: 'UPI Management', icon: '🏦' },
  { path: '/withdrawals', label: 'Withdrawals', icon: '🏧' },
  { path: '/bets', label: 'Bets', icon: '🎯' },
  { path: '/games', label: 'Games', icon: '🎮' },
  { path: '/results', label: 'Results', icon: '🧾' },
  { path: '/jantri', label: 'Jantri', icon: '🔢' },
  { path: '/notifications', label: 'Notifications', icon: '🔔' },
  { path: '/fraud-logs', label: 'Fraud Alerts', icon: '🚨' },
  { path: '/system-alerts', label: 'System Alerts', icon: '⚠️' },
  { path: '/settlement-monitor', label: 'Settlement Monitor', icon: '⚙️' },
  { path: '/wallet-transactions', label: 'Wallet Transactions', icon: '🔍' },
  { path: '/bonus-transactions', label: 'Bonus Transactions', icon: '🎁' },
  { path: '/financial-report', label: 'Financial Report', icon: '📈' },
  { path: '/custom-ads', label: 'Custom Ads', icon: '📢' },
  { path: '/settings', label: 'Settings', icon: '🛠️' },
  { path: '/my-scanner', label: 'My UPI / Scanner', icon: '📲' },
  { path: '/how-to-play', label: 'How To Play', icon: '🎬' },
  { path: '/referrals', label: 'Referrals', icon: '🎁' },
  { path: '/support', label: 'Support', icon: '🎫' },
];

const MODERATOR_HIDDEN_LABELS = new Set(['Moderators', 'Games', 'Results', 'Settings', 'Fraud Alerts', 'System Alerts', 'UPI Management', 'Settlement Monitor', 'Wallet Transactions', 'Bonus Transactions', 'Financial Report', 'Wallet Audit', 'Custom Ads', 'How To Play', 'Referrals']);
const ADMIN_HIDDEN_LABELS = new Set(['My UPI / Scanner']);

function isNavItemActive(locationPathname, itemPath) {
  return locationPathname === itemPath || (itemPath !== '/' && locationPathname.startsWith(`${itemPath}/`));
}

function getCurrentPageLabel(locationPathname) {
  return navItems.find((item) => isNavItemActive(locationPathname, item.path))?.label || 'Dashboard';
}

export default function Layout() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  // Handle scroll for sticky header effect
  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 10);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Close sidebar on route change on mobile
  useEffect(() => {
    setSidebarOpen(false);
  }, [location.pathname]);

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Mobile sidebar overlay with blur effect */}
      {sidebarOpen && (
        <div 
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm lg:hidden transition-opacity duration-300" 
          onClick={() => setSidebarOpen(false)} 
        />
      )}

      {/* Sidebar */}
      <aside 
        className={`fixed top-0 left-0 z-50 h-full w-64 bg-dark-900 text-white transform transition-transform duration-300 ease-out lg:translate-x-0 flex flex-col shadow-2xl ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Logo Section */}
        <div className="p-4 sm:p-6 border-b border-dark-700 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-primary-400">REDDYMATKA</h1>
            <p className="text-xs sm:text-sm text-dark-400 mt-0.5">Admin Panel</p>
          </div>
          <button 
            onClick={() => setSidebarOpen(false)}
            className="lg:hidden p-1 text-dark-400 hover:text-white"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Navigation */}
        <nav className="mt-2 px-2 pb-4 flex-1 overflow-y-auto scrollbar-none">
          <div className="text-xs font-medium text-dark-500 uppercase tracking-wider px-3 py-2">Menu</div>
          {navItems.map((item) => {
            if (user?.role === 'moderator' && MODERATOR_HIDDEN_LABELS.has(item.label)) return null;
            if (user?.role === 'admin' && ADMIN_HIDDEN_LABELS.has(item.label)) return null;
            const isActive = isNavItemActive(location.pathname, item.path);
            return (
              <Link
                key={item.path}
                to={item.path}
                onClick={() => setSidebarOpen(false)}
                className={`flex items-center gap-3 px-3 py-2.5 mb-0.5 rounded-lg transition-all duration-200 ${
                  isActive
                    ? 'bg-primary-600 text-white shadow-md'
                    : 'text-dark-300 hover:bg-dark-800 hover:text-white'
                }`}
              >
                <span className="text-lg sm:text-xl flex-shrink-0">{item.icon}</span>
                <span className="font-medium text-sm truncate">{item.label}</span>
                {isActive && (
                  <svg className="w-4 h-4 ml-auto flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                )}
              </Link>
            );
          })}
        </nav>

        {/* User Section */}
        <div className="p-3 sm:p-4 border-t border-dark-700 shrink-0 bg-dark-900">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-8 h-8 rounded-full bg-primary-600 flex items-center justify-center text-sm font-bold flex-shrink-0">
              {user?.name?.charAt(0)?.toUpperCase() || '?'}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-white truncate">{user?.name}</div>
              <div className="text-xs text-dark-400 capitalize">{user?.role}</div>
            </div>
          </div>
          <button
            onClick={logout}
            className="w-full px-4 py-2 text-sm bg-red-600/90 hover:bg-red-700 text-white rounded-lg transition-colors flex items-center justify-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
            Logout
          </button>
        </div>
      </aside>

      {/* Main content */}
      <div className="lg:ml-64 flex flex-col min-h-screen">
        {/* Top bar - Sticky with shadow on scroll */}
        <header 
          className={`sticky top-0 z-20 bg-white border-b border-gray-200 px-3 sm:px-4 lg:px-6 py-2.5 sm:py-3 flex items-center gap-3 transition-shadow duration-200 ${
            scrolled ? 'shadow-md' : ''
          }`}
        >
          <button
            onClick={() => setSidebarOpen(true)}
            className="lg:hidden p-2 -ml-2 text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition-colors shrink-0"
            aria-label="Open menu"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>

          <div className="flex items-center gap-2 min-w-0">
            <h2 className="text-base sm:text-lg font-semibold text-gray-800 truncate">
              {getCurrentPageLabel(location.pathname)}
            </h2>
          </div>

          <div className="flex-1" />

          {user?.role === 'admin' && <AdminCommandBar />}

          {/* Date Display */}
          <div className="hidden md:block text-sm text-gray-500 shrink-0">
            {new Date().toLocaleDateString('en-IN', { 
              weekday: 'short', 
              year: 'numeric', 
              month: 'short', 
              day: 'numeric' 
            })}
          </div>
          
          {/* Mobile Date - Compact */}
          <div className="md:hidden text-xs text-gray-400 shrink-0">
            {new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 p-3 sm:p-4 lg:p-6 bg-gray-100">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
