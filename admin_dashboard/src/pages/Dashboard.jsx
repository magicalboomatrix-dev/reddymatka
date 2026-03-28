import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '../utils/api';
import { useAuth } from '../context/AuthContext';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line } from 'recharts';

function StatCard({ title, value, sub, color = 'primary' }) {
  const colors = {
    primary: 'bg-primary-50 border-primary-200 text-primary-700',
    green: 'bg-green-50 border-green-200 text-green-700',
    red: 'bg-red-50 border-red-200 text-red-700',
    blue: 'bg-blue-50 border-blue-200 text-blue-700',
    yellow: 'bg-yellow-50 border-yellow-200 text-yellow-700',
    purple: 'bg-purple-50 border-purple-200 text-purple-700',
  };

  return (
    <div className={` border p-5 ${colors[color]}`}>
      <p className="text-sm font-medium opacity-75">{title}</p>
      <p className="text-2xl font-bold mt-1">{value}</p>
      {sub && <p className="text-xs mt-1 opacity-60">{sub}</p>}
    </div>
  );
}

export default function Dashboard() {
  const { user } = useAuth();
  const [stats, setStats] = useState(null);
  const [adminStats, setAdminStats] = useState(null);
  const [recentBets, setRecentBets] = useState([]);
  const [revenue, setRevenue] = useState(null);
  const [notifications, setNotifications] = useState([]);
  const [unassignedUsers, setUnassignedUsers] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const requests = [
        api.get('/analytics/dashboard'),
        api.get('/notifications/my'),
      ];

      if (user?.role === 'admin') {
        requests.push(api.get('/analytics/revenue?period=7d'));
        requests.push(api.get('/admin/users', { params: { role: 'user', moderator_id: 'unassigned', page: 1, limit: 6 } }));
        requests.push(api.get('/admin/dashboard-stats'));
      }

      const [dashRes, notificationsRes, revRes, unassignedRes, adminStatsRes] = await Promise.all(requests);
      setStats(dashRes.data.stats || null);
      setRecentBets(Array.isArray(dashRes.data.recent_bets) ? dashRes.data.recent_bets : []);
      setNotifications(Array.isArray(notificationsRes.data.notifications) ? notificationsRes.data.notifications.slice(0, 6) : []);
      setRevenue(revRes?.data || null);
      setUnassignedUsers(Array.isArray(unassignedRes?.data?.users) ? unassignedRes.data.users : []);
      setAdminStats(adminStatsRes?.data || null);
    } catch (err) {
      console.error('Failed to load dashboard:', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <div className="text-center py-10 text-gray-500">Loading dashboard...</div>;

  return (
    <div className="space-y-6">
      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="Total Users" value={stats?.total_users || 0} color="blue" />
        <StatCard title="Deposits Today" value={`₹${stats?.deposits_today?.total?.toLocaleString() || 0}`} sub={`${stats?.deposits_today?.count || 0} transactions`} color="green" />
        <StatCard title="Withdrawals Today" value={`₹${stats?.withdrawals_today?.total?.toLocaleString() || 0}`} sub={`${stats?.withdrawals_today?.count || 0} transactions`} color="red" />
        <StatCard title="Bets Today" value={`₹${stats?.bets_today?.total?.toLocaleString() || 0}`} sub={`${stats?.bets_today?.count || 0} bets`} color="primary" />
      </div>

      {user?.role === 'admin' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard title="Approved Deposits Today" value={adminStats?.total_deposits_today || 0} color="green" />
          <StatCard title="Approved Amount Today" value={`₹${Number(adminStats?.total_amount_today || 0).toLocaleString('en-IN')}`} color="blue" />
          <StatCard title="Fraud Attempts Today" value={adminStats?.fraud_attempts_today || 0} color="red" />
          <StatCard title="Active Moderators" value={adminStats?.active_moderators || 0} color="purple" />
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard title="Pending Deposits" value={stats?.pending_deposits || 0} color="yellow" />
        <StatCard title="Pending Withdrawals" value={stats?.pending_withdrawals || 0} color="yellow" />
        <StatCard title="Total Wallet Balance" value={`₹${stats?.total_wallet_balance?.toLocaleString() || 0}`} color="purple" />
      </div>

      {user?.role === 'admin' && (
        <div className="bg-white border p-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
            <div>
              <h3 className="text-lg font-semibold text-gray-800">Unassigned Users</h3>
              <p className="text-sm text-gray-500 mt-1">Users without a moderator so deposits, withdrawals, and support flows are not yet owned.</p>
            </div>
            <Link
              to="/users"
              className="inline-flex items-center justify-center px-4 py-2 bg-primary-600 text-white text-sm font-medium hover:bg-primary-700"
            >
              Manage Assignments
            </Link>
          </div>

          <div className="space-y-3">
            {unassignedUsers.map((userRow) => (
              <div key={userRow.id} className=" border border-amber-200 bg-amber-50 px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-gray-800">{userRow.name}</p>
                  <p className="text-xs text-gray-600 mt-1">{userRow.phone} • Joined {new Date(userRow.created_at).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' })}</p>
                </div>
                <div className="text-xs font-medium text-amber-700 uppercase tracking-wide">Needs Moderator</div>
              </div>
            ))}
            {unassignedUsers.length === 0 && (
              <div className=" border border-dashed border-gray-200 px-4 py-6 text-sm text-gray-400 text-center">
                All current users are assigned to moderators.
              </div>
            )}
          </div>
        </div>
      )}

      {/* Charts + notifications */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {Array.isArray(revenue?.deposits) && revenue.deposits.length > 0 && (
          <div className="bg-white border p-6">
            <h3 className="text-lg font-semibold text-gray-800 mb-4">Deposits (Last 7 Days)</h3>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={revenue.deposits}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip />
                <Bar dataKey="total" fill="#22c55e" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {Array.isArray(revenue?.bets) && revenue.bets.length > 0 && (
          <div className="bg-white border p-6">
            <h3 className="text-lg font-semibold text-gray-800 mb-4">Bets vs Wins (Last 7 Days)</h3>
            <ResponsiveContainer width="100%" height={250}>
              <LineChart data={revenue.bets}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip />
                <Line type="monotone" dataKey="total_bet" stroke="#eb950e" strokeWidth={2} name="Total Bets" />
                <Line type="monotone" dataKey="total_win" stroke="#ef4444" strokeWidth={2} name="Total Wins" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}

        <div className="bg-white border p-6 lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-800">Staff Notifications</h3>
            <span className="text-xs text-gray-500">Recent finance and system alerts</span>
          </div>
          <div className="space-y-3">
            {notifications.map((notification) => (
              <div
                key={notification.id}
                className={` border p-4 ${notification.is_read ? 'bg-gray-50 border-gray-200' : 'bg-amber-50 border-amber-200'}`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-sm font-medium text-gray-800">{notification.message}</p>
                    <p className="text-xs text-gray-500 mt-1">
                      {notification.type} • {new Date(notification.created_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}
                    </p>
                  </div>
                  {!notification.is_read && (
                    <span className="px-2 py-1 text-xs font-medium bg-amber-100 text-amber-700">
                      New
                    </span>
                  )}
                </div>
              </div>
            ))}
            {notifications.length === 0 && (
              <div className="text-sm text-gray-400 py-4">No notifications yet.</div>
            )}
          </div>
        </div>
      </div>

      {/* Recent Bets */}
      <div className="bg-white border">
        <div className="p-5 border-b">
          <h3 className="text-lg font-semibold text-gray-800">Recent Bets</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left px-5 py-3 font-medium text-gray-600">User</th>
                <th className="text-left px-5 py-3 font-medium text-gray-600">Game</th>
                <th className="text-left px-5 py-3 font-medium text-gray-600">Type</th>
                <th className="text-right px-5 py-3 font-medium text-gray-600">Amount</th>
                <th className="text-center px-5 py-3 font-medium text-gray-600">Status</th>
                <th className="text-left px-5 py-3 font-medium text-gray-600">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {recentBets.map((bet) => (
                <tr key={bet.id} className="hover:bg-gray-50">
                  <td className="px-5 py-3">{bet.user_name}</td>
                  <td className="px-5 py-3">{bet.game_name}</td>
                  <td className="px-5 py-3 capitalize">{bet.type}</td>
                  <td className="px-5 py-3 text-right font-medium">₹{parseFloat(bet.total_amount).toLocaleString()}</td>
                  <td className="px-5 py-3 text-center">
                    <span className={`px-2 py-1 text-xs font-medium ${
                      bet.status === 'win' ? 'bg-green-100 text-green-700'
                        : bet.status === 'loss' ? 'bg-red-100 text-red-700'
                        : 'bg-yellow-100 text-yellow-700'
                    }`}>
                      {bet.status}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-gray-500">{new Date(bet.created_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}</td>
                </tr>
              ))}
              {recentBets.length === 0 && (
                <tr><td colSpan={6} className="px-5 py-8 text-center text-gray-400">No recent bets</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
