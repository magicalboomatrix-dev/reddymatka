import { useState } from 'react';
import { Outlet, Link, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const navItems = [
  { path: '/', label: 'Dashboard', icon: '📊' },
  { path: '/users', label: 'Users', icon: '👥' },
  { path: '/moderators', label: 'Moderators', icon: '🛡️' },
  { path: '/moderator-scanners', label: 'Moderator Scanners', icon: '📷' },
  { path: '/moderator-floats', label: 'Moderator Floats', icon: '🏦' },
  { path: '/payment-scanner', label: 'Payment Scanner', icon: '📱' },
  { path: '/deposits', label: 'Deposits', icon: '💰' },
  { path: '/withdrawals', label: 'Withdrawals', icon: '🏧' },
  { path: '/games', label: 'Games', icon: '🎮' },
  { path: '/results', label: 'Results', icon: '🧾' },
  { path: '/analytics', label: 'Analytics', icon: '📈' },
  { path: '/notifications', label: 'Notifications', icon: '🔔' },
  { path: '/fraud-alerts', label: 'Fraud Alerts', icon: '🚨' },
  { path: '/custom-ads', label: 'Custom Ads', icon: '📢' },
  { path: '/settings', label: 'Settings', icon: '⚙️' },
];

export default function Layout() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 bg-black bg-opacity-50 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Sidebar */}
      <aside className={`fixed top-0 left-0 z-50 h-full w-64 bg-dark-900 text-white transform transition-transform duration-200 lg:translate-x-0 flex flex-col ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="p-6 border-b border-dark-700">
          <h1 className="text-xl font-bold text-primary-400">REDDYMATKA</h1>
          <p className="text-sm text-dark-400 mt-1">Admin Panel</p>
        </div>

        <nav className="mt-4 px-3 pb-4 flex-1 overflow-y-auto min-h-0">
          {navItems.map((item) => {
            // Filter moderator-only visible items
            if (user?.role === 'moderator' && ['Moderators', 'Moderator Scanners', 'Moderator Floats', 'Games', 'Results', 'Settings', 'Fraud Alerts'].includes(item.label)) {
              return null;
            }
            if (user?.role !== 'moderator' && item.label === 'Payment Scanner') {
              return null;
            }
            const isActive = location.pathname === item.path || (item.path !== '/' && location.pathname.startsWith(`${item.path}/`));
            return (
              <Link
                key={item.path}
                to={item.path}
                onClick={() => setSidebarOpen(false)}
                className={`flex items-center gap-3 px-4 py-3 mb-px transition-colors border-l-2 ${
                  isActive
                    ? 'border-primary-400 bg-primary-600 text-white'
                    : 'border-transparent text-dark-300 hover:bg-dark-800 hover:text-white'
                }`}
              >
                <span className="text-lg">{item.icon}</span>
                <span className="font-medium">{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t border-dark-700 shrink-0 bg-dark-900">
          <div className="text-sm text-dark-400 mb-2">
            {user?.name} ({user?.role})
          </div>
          <button
            onClick={logout}
            className="w-full px-4 py-2 text-sm bg-red-600 hover:bg-red-700 transition-colors"
          >
            Logout
          </button>
        </div>
      </aside>

      {/* Main content */}
      <div className="lg:ml-64 min-h-screen">
        {/* Top bar */}
        <header className="bg-white border-b border-gray-300 px-6 py-4 flex items-center justify-between">
          <button
            onClick={() => setSidebarOpen(true)}
            className="lg:hidden text-gray-600 hover:text-gray-800"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>

          <h2 className="text-lg font-semibold text-gray-800">
            {navItems.find((item) => location.pathname === item.path)
              ?.label || navItems.find((item) => item.path !== '/' && location.pathname.startsWith(`${item.path}/`))?.label || 'Dashboard'}
          </h2>

          <div className="text-sm text-gray-500">
            {new Date().toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
          </div>
        </header>

        {/* Page content */}
        <main className="p-6 overflow-x-hidden bg-gray-100 min-h-[calc(100vh-65px)]">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
