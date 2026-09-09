import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import Layout from './components/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Users from './pages/Users';
import Moderators from './pages/Moderators';
import Deposits from './pages/Deposits';
import Withdrawals from './pages/Withdrawals';
import Bets from './pages/Bets';
import Games from './pages/Games';
import Settings from './pages/Settings';
import Jantri from './pages/Jantri';
import Notifications from './pages/Notifications';
import SystemAlerts from './pages/SystemAlerts';
import ModeratorDetail from './pages/ModeratorDetail';
import UserDetail from './pages/UserDetail';
import Results from './pages/Results';
import CustomAds from './pages/CustomAds';
import SettlementMonitor from './pages/SettlementMonitor';
import WalletTransactions from './pages/WalletTransactions';
import BonusTransactions from './pages/BonusTransactions';
import FinancialReport from './pages/FinancialReport';
import HowToPlay from './pages/HowToPlay';
import Referrals from './pages/Referrals';
import Support from './pages/Support';

const APP_ROUTES = [
  { index: true, element: <Dashboard /> },
  { path: 'users', element: <Users /> },
  { path: 'users/:id', element: <UserDetail /> },
  { path: 'moderators', element: <Moderators /> },
  { path: 'moderators/:id', element: <ModeratorDetail /> },
  { path: 'deposits', element: <Deposits /> },
  { path: 'withdrawals', element: <Withdrawals /> },
  { path: 'bets', element: <Bets /> },
  { path: 'games', element: <Games /> },
  { path: 'results', element: <Results /> },
  { path: 'settings', element: <Settings /> },
  { path: 'jantri', element: <Jantri /> },
  { path: 'notifications', element: <Notifications /> },
  { path: 'system-alerts', element: <SystemAlerts /> },
  { path: 'custom-ads', element: <CustomAds /> },
  { path: 'settlement-monitor', element: <SettlementMonitor /> },
  { path: 'wallet-transactions', element: <WalletTransactions /> },
  { path: 'financial-report', element: <FinancialReport /> },
  { path: 'bonus-transactions', element: <BonusTransactions /> },
  { path: 'how-to-play', element: <HowToPlay /> },
  { path: 'referrals', element: <Referrals /> },
  { path: 'support', element: <Support /> },
];

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="flex items-center justify-center h-screen">Loading...</div>;
  if (!user) return <Navigate to="/login" />;
  return children;
}

function AppRoutes() {
  const { user } = useAuth();

  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/" /> : <Login />} />
      <Route path="/" element={<ProtectedRoute><Layout /></ProtectedRoute>}>
        {APP_ROUTES.map((route) => (
          <Route
            key={route.path || 'index'}
            index={route.index}
            path={route.path}
            element={route.element}
          />
        ))}
      </Route>
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  );
}
