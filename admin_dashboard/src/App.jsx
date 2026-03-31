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
        <Route index element={<Dashboard />} />
        <Route path="users" element={<Users />} />
        <Route path="users/:id" element={<UserDetail />} />
        <Route path="moderators" element={<Moderators />} />
        <Route path="moderators/:id" element={<ModeratorDetail />} />
        <Route path="deposits" element={<Deposits />} />
        <Route path="withdrawals" element={<Withdrawals />} />
        <Route path="games" element={<Games />} />
        <Route path="results" element={<Results />} />
        <Route path="settings" element={<Settings />} />
        <Route path="analytics" element={<Analytics />} />
        <Route path="notifications" element={<Notifications />} />
        <Route path="fraud-alerts" element={<FraudLogs />} />
        <Route path="fraud-logs" element={<FraudLogs />} />
        <Route path="custom-ads" element={<CustomAds />} />
        <Route path="auto-deposits" element={<AutoDeposits />} />
        <Route path="upi-management" element={<UpiManagement />} />
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
