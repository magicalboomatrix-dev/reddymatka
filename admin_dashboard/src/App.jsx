import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import Layout from './components/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Users from './pages/Users';
import Moderators from './pages/Moderators';
import Deposits from './pages/Deposits';
import Withdrawals from './pages/Withdrawals';
import Games from './pages/Games';
import Settings from './pages/Settings';
import Analytics from './pages/Analytics';
import Notifications from './pages/Notifications';
import FraudLogs from './pages/FraudLogs';
import ModeratorDetail from './pages/ModeratorDetail';
import UserDetail from './pages/UserDetail';
import Results from './pages/Results';
import CustomAds from './pages/CustomAds';
import AutoDeposits from './pages/AutoDeposits';
import UpiManagement from './pages/UpiManagement';
import SettlementMonitor from './pages/SettlementMonitor';
import WalletAudit from './pages/WalletAudit';

const APP_ROUTES = [
  { index: true, element: <Dashboard /> },
  { path: 'users', element: <Users /> },
  { path: 'users/:id', element: <UserDetail /> },
  { path: 'moderators', element: <Moderators /> },
  { path: 'moderators/:id', element: <ModeratorDetail /> },
  { path: 'deposits', element: <Deposits /> },
  { path: 'auto-deposits', element: <AutoDeposits /> },
  { path: 'upi-management', element: <UpiManagement /> },
  { path: 'withdrawals', element: <Withdrawals /> },
  { path: 'games', element: <Games /> },
  { path: 'results', element: <Results /> },
  { path: 'settings', element: <Settings /> },
  { path: 'analytics', element: <Analytics /> },
  { path: 'notifications', element: <Notifications /> },
  { path: 'fraud-logs', element: <FraudLogs /> },
  { path: 'custom-ads', element: <CustomAds /> },
  { path: 'settlement-monitor', element: <SettlementMonitor /> },
  { path: 'wallet-audit', element: <WalletAudit /> },
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
        <Route path="fraud-alerts" element={<Navigate to="/fraud-logs" replace />} />
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
