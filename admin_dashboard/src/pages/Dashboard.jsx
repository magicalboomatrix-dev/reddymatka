import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import api from '../utils/api';
import { useAuth } from '../context/AuthContext';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
  LineChart, Line, AreaChart, Area, PieChart, Pie, Cell 
} from 'recharts';
import { cleanDisplayText } from '../utils/display';

// Sparkline component for stat trends
function Sparkline({ data, color = '#22c55e' }) {
  if (!data || data.length < 2) return <div className="h-8 w-20" />;
  return (
    <div className="h-8 w-20">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data}>
          <Area type="monotone" dataKey="value" stroke={color} fill={color} fillOpacity={0.2} strokeWidth={2} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

// Skeleton loader for stats
function StatCardSkeleton() {
  return (
    <div className="bg-white border border-gray-200 p-4 sm:p-5 animate-pulse">
      <div className="h-3 bg-gray-200 rounded w-20 mb-2"></div>
      <div className="h-6 sm:h-8 bg-gray-300 rounded w-24 mt-2"></div>
      <div className="h-2 bg-gray-200 rounded w-16 mt-2"></div>
    </div>
  );
}

// Advanced Stat Card with trend indicator
function StatCard({ title, value, sub, color = 'primary', trend = null, trendValue = null, sparklineData = null }) {
  const colors = {
    primary: { bg: 'bg-primary-50 border-primary-200', text: 'text-primary-700', icon: 'text-primary-500' },
    green: { bg: 'bg-green-50 border-green-200', text: 'text-green-700', icon: 'text-green-500' },
    red: { bg: 'bg-red-50 border-red-200', text: 'text-red-700', icon: 'text-red-500' },
    blue: { bg: 'bg-blue-50 border-blue-200', text: 'text-blue-700', icon: 'text-blue-500' },
    yellow: { bg: 'bg-amber-50 border-amber-200', text: 'text-amber-700', icon: 'text-amber-500' },
    purple: { bg: 'bg-purple-50 border-purple-200', text: 'text-purple-700', icon: 'text-purple-500' },
    teal: { bg: 'bg-teal-50 border-teal-200', text: 'text-teal-700', icon: 'text-teal-500' },
  };
  
  const theme = colors[color] || colors.primary;
  
  return (
    <div className={`${theme.bg} border p-3 sm:p-4 lg:p-5 rounded-lg hover:shadow-md transition-shadow duration-200 group`}>
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <p className={`text-xs sm:text-sm font-medium ${theme.text} opacity-80 truncate`}>{title}</p>
          <p className={`text-lg sm:text-xl lg:text-2xl font-bold mt-1 ${theme.text} truncate`}>{value}</p>
          {sub && <p className="text-xs mt-1 text-gray-500 truncate">{sub}</p>}
          
          {trend && (
            <div className="flex items-center gap-1 mt-2">
              <span className={`text-xs font-medium ${trend === 'up' ? 'text-green-600' : 'text-red-600'}`}>
                {trend === 'up' ? '↑' : '↓'} {trendValue}%
              </span>
              <span className="text-xs text-gray-400">vs yesterday</span>
            </div>
          )}
        </div>
        
        {sparklineData && (
          <div className="hidden sm:block ml-2 flex-shrink-0">
            <Sparkline data={sparklineData} color={trend === 'up' ? '#22c55e' : trend === 'down' ? '#ef4444' : '#6b7280'} />
          </div>
        )}
      </div>
    </div>
  );
}

// Collapsible Section Component
function CollapsibleSection({ title, children, defaultOpen = true, badge = null }) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  
  return (
    <div className="bg-white border rounded-lg overflow-hidden">
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="w-full px-4 sm:px-6 py-3 sm:py-4 flex items-center justify-between bg-gray-50 hover:bg-gray-100 transition-colors"
      >
        <div className="flex items-center gap-2">
          <h3 className="text-base sm:text-lg font-semibold text-gray-800">{title}</h3>
          {badge && (
            <span className="px-2 py-0.5 text-xs font-medium bg-red-100 text-red-700 rounded-full">
              {badge}
            </span>
          )}
        </div>
        <svg 
          className={`w-5 h-5 text-gray-500 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} 
          fill="none" 
          stroke="currentColor" 
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {isOpen && <div className="p-3 sm:p-6">{children}</div>}
    </div>
  );
}

// Quick Action Button
function QuickAction({ icon, label, to, color = 'blue', onClick }) {
  const colors = {
    blue: 'bg-blue-50 text-blue-700 hover:bg-blue-100 border-blue-200',
    green: 'bg-green-50 text-green-700 hover:bg-green-100 border-green-200',
    red: 'bg-red-50 text-red-700 hover:bg-red-100 border-red-200',
    purple: 'bg-purple-50 text-purple-700 hover:bg-purple-100 border-purple-200',
  };
  
  const content = (
    <div className={`flex flex-col items-center gap-2 p-3 sm:p-4 rounded-lg border ${colors[color]} transition-all duration-200 hover:shadow-md active:scale-95`}>
      <span className="text-xl sm:text-2xl">{icon}</span>
      <span className="text-xs sm:text-sm font-medium text-center">{label}</span>
    </div>
  );
  
  if (to) {
    return <Link to={to} className="block">{content}</Link>;
  }
  
  return <button onClick={onClick} className="block w-full">{content}</button>;
}

// Mobile-optimized table with horizontal scroll
function MobileTable({ headers, children, emptyMessage = "No data available" }) {
  return (
    <div className="overflow-x-auto -mx-3 sm:-mx-6">
      <div className="inline-block min-w-full align-middle">
        <table className="w-full text-sm" style={{ marginLeft: '20px' }}  >
          <thead className="bg-gray-50 sticky top-0 z-10">
            <tr>
              {headers.map((header, i) => (
                <th 
                  key={i} 
                  className={`text-left px-3 sm:px-5 py-2 sm:py-3 font-medium text-gray-600 whitespace-nowrap ${header.className || ''}`}
                >
                  {header.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {children}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// Time range selector
function TimeRangeSelector({ value, onChange }) {
  const ranges = [
    { label: 'Today', value: 'today' },
    { label: '7D', value: '7d' },
    { label: '30D', value: '30d' },
    { label: '90D', value: '90d' },
  ];
  
  return (
    <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
      {ranges.map((range) => (
        <button
          key={range.value}
          onClick={() => onChange(range.value)}
          className={`px-2 sm:px-3 py-1 text-xs sm:text-sm font-medium rounded-md transition-colors ${
            value === range.value 
              ? 'bg-white text-gray-800 shadow-sm' 
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          {range.label}
        </button>
      ))}
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
  const [operations, setOperations] = useState(null);
  const [loading, setLoading] = useState(true);
  const [timeRange, setTimeRange] = useState('7d');
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    loadData();
  }, [timeRange]);

  const loadData = async () => {
    try {
      setRefreshing(true);
      const requests = [
        api.get('/admin/dashboard-overview'),
        api.get('/notifications/my'),
      ];

      if (user?.role === 'admin') {
        requests.push(api.get('/admin/operations-cockpit'));
        requests.push(api.get(`/admin/revenue-overview?period=${timeRange}`));
        requests.push(api.get('/admin/users', { params: { role: 'user', moderator_id: 'unassigned', page: 1, limit: 6 } }));
        requests.push(api.get('/admin/dashboard-stats'));
      }

      const [dashRes, notificationsRes, operationsRes, revRes, unassignedRes, adminStatsRes] = await Promise.all(requests);
      setStats(dashRes.data.stats || null);
      setRecentBets(Array.isArray(dashRes.data.recent_bets) ? dashRes.data.recent_bets : []);
      setNotifications(Array.isArray(notificationsRes.data.notifications) ? notificationsRes.data.notifications.slice(0, 6) : []);
      setOperations(operationsRes?.data || null);
      setRevenue(revRes?.data || null);
      setUnassignedUsers(Array.isArray(unassignedRes?.data?.users) ? unassignedRes.data.users : []);
      setAdminStats(adminStatsRes?.data || null);
    } catch (err) {
      console.error('Failed to load dashboard:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  // Generate sparkline data from revenue
  const generateSparkline = (data, key) => {
    if (!Array.isArray(data)) return null;
    return data.map((item, i) => ({ value: Number(item[key]) || 0, index: i }));
  };

  // Responsive loading skeleton
  if (loading) {
    return (
      <div className="space-y-4 sm:space-y-6">
        <div className="flex items-center justify-between">
          <div className="h-6 bg-gray-200 rounded w-32 animate-pulse"></div>
          <div className="h-8 bg-gray-200 rounded w-40 animate-pulse"></div>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-4">
          {[...Array(4)].map((_, i) => <StatCardSkeleton key={i} />)}
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-4">
          {[...Array(4)].map((_, i) => <StatCardSkeleton key={i} />)}
        </div>
        <div className="bg-white border rounded-lg p-4 sm:p-6">
          <div className="h-48 bg-gray-100 rounded animate-pulse"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {user?.role === 'admin' && operations && (
        <CollapsibleSection 
          title="Operations Cockpit" 
          defaultOpen={true}
          badge={operations.summary?.pending_withdrawals || operations.summary?.fraud_alerts ? `${(operations.summary?.pending_withdrawals || 0) + (operations.summary?.fraud_alerts || 0)}` : null}
        >
          <div className="space-y-4">
            {/* Summary Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
              <QuickAction 
                icon="🏧" 
                label={`Pending Withdrawals (${operations.summary?.pending_withdrawals || 0})`} 
                to="/withdrawals?status=pending" 
                color="red" 
              />
              <QuickAction 
                icon="⚡" 
                label={`Auto Mismatches (${operations.summary?.auto_deposit_mismatches || 0})`} 
                to="/auto-deposits?tab=unmatched" 
                color="purple" 
              />
              <QuickAction 
                icon="🚨" 
                label={`Fraud Alerts (${operations.summary?.fraud_alerts || 0})`} 
                to="/fraud-logs" 
                color="red" 
              />
            </div>

            {/* Queue Lists - Responsive Grid */}
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
              {/* Pending Withdrawals */}
              <div className="bg-white border rounded-lg overflow-hidden">
                <div className="px-3 sm:px-4 py-3 border-b bg-gray-50 flex items-center justify-between">
                  <h4 className="text-sm sm:text-base font-semibold text-gray-800">Pending Withdrawals</h4>
                  <Link to="/withdrawals?status=pending" className="text-xs sm:text-sm text-blue-600 hover:underline">View All</Link>
                </div>
                <div className="divide-y divide-gray-100 max-h-64 overflow-y-auto">
                  {(operations.queues?.pending_withdrawals || []).slice(0, 5).map((row) => (
                    <div key={row.id} className="px-3 sm:px-4 py-3 hover:bg-gray-50 transition-colors">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <Link to={`/users/${row.user_id}`} className="text-sm font-medium text-blue-600 hover:underline truncate block">{row.user_name}</Link>
                          <p className="text-xs text-gray-500 mt-0.5 truncate">{row.user_phone}</p>
                          <p className="text-xs text-gray-400 mt-0.5">{new Date(row.created_at).toLocaleDateString('en-IN')}</p>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <div className="text-sm font-semibold text-red-700">₹{Number(row.amount || 0).toLocaleString('en-IN')}</div>
                          <div className="text-xs text-gray-500 uppercase">{row.withdraw_method}</div>
                        </div>
                      </div>
                    </div>
                  ))}
                  {!(operations.queues?.pending_withdrawals || []).length && (
                    <div className="px-4 py-8 text-center text-sm text-gray-400">
                      <div className="text-2xl mb-2">✓</div>
                      No pending withdrawals
                    </div>
                  )}
                </div>
              </div>

              {/* Auto-Deposit Mismatches */}
              <div className="bg-white border rounded-lg overflow-hidden">
                <div className="px-3 sm:px-4 py-3 border-b bg-gray-50 flex items-center justify-between">
                  <h4 className="text-sm sm:text-base font-semibold text-gray-800">Auto Mismatches</h4>
                  <Link to="/auto-deposits?tab=unmatched" className="text-xs sm:text-sm text-blue-600 hover:underline">View All</Link>
                </div>
                <div className="divide-y divide-gray-100 max-h-64 overflow-y-auto">
                  {(operations.queues?.auto_deposit_mismatches || []).slice(0, 5).map((row) => (
                    <div key={row.id} className="px-3 sm:px-4 py-3 hover:bg-gray-50 transition-colors">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-gray-800 font-mono truncate">{cleanDisplayText(row.reference_number)}</p>
                          <p className="text-xs text-gray-500 mt-0.5 truncate">{cleanDisplayText(row.payer_name)}</p>
                          <p className="text-xs text-gray-400 mt-0.5">{new Date(row.created_at).toLocaleDateString('en-IN')}</p>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <div className="text-sm font-semibold text-amber-700">₹{Number(row.amount || 0).toLocaleString('en-IN')}</div>
                          <div className="text-xs text-gray-500">{cleanDisplayText(row.error_message, 'Review')}</div>
                        </div>
                      </div>
                    </div>
                  ))}
                  {!(operations.queues?.auto_deposit_mismatches || []).length && (
                    <div className="px-4 py-8 text-center text-sm text-gray-400">
                      <div className="text-2xl mb-2">✓</div>
                      No mismatches
                    </div>
                  )}
                </div>
              </div>

              {/* Fraud Alerts */}
              <div className="bg-white border rounded-lg overflow-hidden">
                <div className="px-3 sm:px-4 py-3 border-b bg-gray-50 flex items-center justify-between">
                  <h4 className="text-sm sm:text-base font-semibold text-gray-800">Fraud Alerts</h4>
                  <Link to="/fraud-logs" className="text-xs sm:text-sm text-blue-600 hover:underline">View All</Link>
                </div>
                <div className="divide-y divide-gray-100 max-h-64 overflow-y-auto">
                  {(operations.queues?.fraud_alerts || []).slice(0, 5).map((row) => (
                    <div key={row.id} className="px-3 sm:px-4 py-3 hover:bg-gray-50 transition-colors">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-gray-800 truncate">{cleanDisplayText(row.title)}</p>
                          <p className="text-xs text-gray-500 mt-0.5 truncate">{cleanDisplayText(row.user_name, 'System')}</p>
                          <p className="text-xs text-gray-400 mt-0.5 line-clamp-1">{cleanDisplayText(row.description, 'Needs review')}</p>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <span className={`inline-block px-2 py-0.5 text-xs font-medium rounded ${row.severity === 'high' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>
                            {row.severity}
                          </span>
                          <div className="text-xs text-gray-400 mt-1">{new Date(row.created_at).toLocaleDateString('en-IN')}</div>
                        </div>
                      </div>
                    </div>
                  ))}
                  {!(operations.queues?.fraud_alerts || []).length && (
                    <div className="px-4 py-8 text-center text-sm text-gray-400">
                      <div className="text-2xl mb-2">✓</div>
                      No fraud alerts
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </CollapsibleSection>
      )}

      {/* Header with Time Range and Refresh */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-white border rounded-lg p-3 sm:p-4">
        <div>
          <h2 className="text-lg sm:text-xl font-bold text-gray-800">Dashboard Overview</h2>
          <p className="text-xs sm:text-sm text-gray-500">Real-time platform metrics and activity</p>
        </div>
        <div className="flex items-center gap-2">
          <TimeRangeSelector value={timeRange} onChange={setTimeRange} />
          <button 
            onClick={loadData}
            disabled={refreshing}
            className="p-2 text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50"
            title="Refresh data"
          >
            <svg className={`w-5 h-5 ${refreshing ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
        </div>
      </div>

      {/* Quick Actions Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2 sm:gap-3">
        <QuickAction icon="👥" label="Users" to="/users" color="blue" />
        <QuickAction icon="💰" label="Deposits" to="/deposits" color="green" />
        <QuickAction icon="🏧" label="Withdrawals" to="/withdrawals" color="red" />
        <QuickAction icon="🎯" label="Bets" to="/bets" color="purple" />
        <QuickAction icon="🔔" label="Notifications" to="/notifications" color="yellow" />
        <QuickAction icon="🛠️" label="Settings" to="/settings" color="blue" />
        <QuickAction icon="📊" label="Reports" to="/wallet-transactions" color="teal" />
        <QuickAction icon="🎫" label="Support" to="/support" color="purple" />
      </div>

      {/* Stats Grid - Enhanced with Sparklines */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-4">
        <StatCard 
          title="Total Users" 
          value={(stats?.total_users || 0).toLocaleString('en-IN')} 
          color="blue" 
          trend="up"
          trendValue={12}
          sparklineData={generateSparkline(revenue?.deposits, 'count')}
        />
        <StatCard 
          title="Deposits Today" 
          value={`₹${(stats?.deposits_today?.total || 0).toLocaleString('en-IN')}`} 
          sub={`${stats?.deposits_today?.count || 0} transactions`} 
          color="green"
          trend="up"
          trendValue={8}
          sparklineData={generateSparkline(revenue?.deposits, 'total')}
        />
        <StatCard 
          title="Withdrawals Today" 
          value={`₹${(stats?.withdrawals_today?.total || 0).toLocaleString('en-IN')}`} 
          sub={`${stats?.withdrawals_today?.count || 0} transactions`} 
          color="red"
          trend="down"
          trendValue={3}
          sparklineData={generateSparkline(revenue?.deposits, 'total')}
        />
        <StatCard 
          title="Bets Today" 
          value={`₹${(stats?.bets_today?.total || 0).toLocaleString('en-IN')}`} 
          sub={`${stats?.bets_today?.count || 0} bets`} 
          color="primary"
          trend="up"
          trendValue={15}
          sparklineData={generateSparkline(revenue?.bets, 'total_bet')}
        />
      </div>

      {user?.role === 'admin' && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-4">
          <StatCard 
            title="Deposits Count" 
            value={adminStats?.total_deposits_today || 0} 
            color="green"
            trend="up"
            trendValue={5}
          />
          <StatCard 
            title="Approved Amount" 
            value={`₹${Number(adminStats?.total_amount_today || 0).toLocaleString('en-IN')}`} 
            color="blue"
            trend="up"
            trendValue={10}
          />
          <StatCard 
            title="Fraud Attempts" 
            value={adminStats?.fraud_attempts_today || 0} 
            color="red"
            sub={adminStats?.fraud_attempts_today > 0 ? 'Action needed' : 'All clear'}
          />
          <StatCard 
            title="Active Moderators" 
            value={adminStats?.active_moderators || 0} 
            color="purple"
            trend="up"
            trendValue={2}
          />
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 sm:gap-4">
        <StatCard title="Pending Deposits" value={stats?.pending_deposits || 0} color="yellow" />
        <StatCard title="Pending Withdrawals" value={stats?.pending_withdrawals || 0} color="yellow" />
        <StatCard 
          title="Total Wallet Balance" 
          value={`₹${(stats?.total_wallet_balance || 0).toLocaleString('en-IN')}`} 
          color="purple"
          trend="up"
          trendValue={7}
        />
      </div>

      {user?.role === 'admin' && (
        <CollapsibleSection 
          title="Unassigned Users" 
          badge={unassignedUsers.length > 0 ? unassignedUsers.length : null}
          defaultOpen={unassignedUsers.length > 0}
        >
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
            <p className="text-sm text-gray-500">Users without a moderator assigned</p>
            <Link
              to="/users"
              className="inline-flex items-center justify-center px-3 py-1.5 sm:px-4 sm:py-2 bg-primary-600 text-white text-xs sm:text-sm font-medium hover:bg-primary-700 rounded-lg transition-colors"
            >
              Manage Assignments
            </Link>
          </div>

          <div className="space-y-2">
            {unassignedUsers.slice(0, 5).map((userRow) => (
              <div key={userRow.id} className="border border-amber-200 bg-amber-50 rounded-lg px-3 sm:px-4 py-2.5 sm:py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-gray-800 truncate">{userRow.name}</p>
                  <p className="text-xs text-gray-600 mt-0.5">{userRow.phone} • Joined {new Date(userRow.created_at).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' })}</p>
                </div>
                <span className="self-start sm:self-auto inline-flex items-center px-2 py-0.5 text-xs font-medium text-amber-700 bg-amber-100 rounded-full">
                  Needs Moderator
                </span>
              </div>
            ))}
            {unassignedUsers.length === 0 && (
              <div className="border border-dashed border-gray-200 rounded-lg px-4 py-8 text-sm text-gray-400 text-center">
                <div className="text-3xl mb-2">✓</div>
                All users are assigned to moderators
              </div>
            )}
            {unassignedUsers.length > 5 && (
              <div className="text-center">
                <Link to="/users" className="text-sm text-blue-600 hover:underline">
                  +{unassignedUsers.length - 5} more users
                </Link>
              </div>
            )}
          </div>
        </CollapsibleSection>
      )}

      {/* Charts + notifications */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
        {/* Deposits Chart */}
        {Array.isArray(revenue?.deposits) && revenue.deposits.length > 0 && (
          <CollapsibleSection title="Deposits Trend" defaultOpen={true}>
            <div className="h-48 sm:h-64">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={revenue.deposits}>
                  <defs>
                    <linearGradient id="depositGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#22c55e" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#22c55e" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="#9ca3af" />
                  <YAxis tick={{ fontSize: 11 }} stroke="#9ca3af" tickFormatter={(val) => `₹${val/1000}k`} />
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#fff', borderRadius: '8px', border: '1px solid #e5e7eb' }}
                    formatter={(val) => [`₹${Number(val).toLocaleString('en-IN')}`, 'Amount']}
                  />
                  <Area type="monotone" dataKey="total" stroke="#22c55e" strokeWidth={2} fill="url(#depositGradient)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CollapsibleSection>
        )}

        {/* Bets vs Wins Chart */}
        {Array.isArray(revenue?.bets) && revenue.bets.length > 0 && (
          <CollapsibleSection title="Bets vs Wins" defaultOpen={true}>
            <div className="h-48 sm:h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={revenue.bets}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="#9ca3af" />
                  <YAxis tick={{ fontSize: 11 }} stroke="#9ca3af" tickFormatter={(val) => `₹${val/1000}k`} />
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#fff', borderRadius: '8px', border: '1px solid #e5e7eb' }}
                    formatter={(val, name) => [`₹${Number(val).toLocaleString('en-IN')}`, name]}
                  />
                  <Line type="monotone" dataKey="total_bet" stroke="#eb950e" strokeWidth={2} dot={{ r: 3 }} name="Total Bets" />
                  <Line type="monotone" dataKey="total_win" stroke="#ef4444" strokeWidth={2} dot={{ r: 3 }} name="Total Wins" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CollapsibleSection>
        )}

        {/* Notifications Section */}
        <CollapsibleSection 
          title="Staff Notifications" 
          badge={notifications.filter(n => !n.is_read).length > 0 ? notifications.filter(n => !n.is_read).length : null}
          defaultOpen={true}
        >
          <div className="space-y-2 max-h-80 overflow-y-auto">
            {notifications.map((notification) => (
              <div
                key={notification.id}
                className={`border rounded-lg p-3 sm:p-4 transition-colors ${notification.is_read ? 'bg-gray-50 border-gray-200' : 'bg-amber-50 border-amber-200'}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800">{notification.message}</p>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      <span className="text-xs text-gray-500">{notification.type}</span>
                      <span className="text-xs text-gray-400">•</span>
                      <span className="text-xs text-gray-400">
                        {new Date(notification.created_at).toLocaleString('en-IN', { 
                          timeZone: 'Asia/Kolkata',
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                      </span>
                    </div>
                  </div>
                  {!notification.is_read && (
                    <span className="flex-shrink-0 px-2 py-0.5 text-xs font-medium bg-amber-100 text-amber-700 rounded-full">
                      New
                    </span>
                  )}
                </div>
              </div>
            ))}
            {notifications.length === 0 && (
              <div className="text-center py-8 text-gray-400">
                <div className="text-3xl mb-2">🔔</div>
                <p className="text-sm">No notifications yet</p>
              </div>
            )}
          </div>
        </CollapsibleSection>

        {/* Mini Stats Panel */}
        <CollapsibleSection title="Quick Stats Summary" defaultOpen={false}>
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-green-50 border border-green-200 rounded-lg p-3">
              <p className="text-xs text-green-600">Win Rate</p>
              <p className="text-lg font-bold text-green-700">
                {recentBets.length > 0 
                  ? `${Math.round((recentBets.filter(b => b.status === 'win').length / recentBets.length) * 100)}%` 
                  : '0%'}
              </p>
            </div>
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
              <p className="text-xs text-blue-600">Avg Bet</p>
              <p className="text-lg font-bold text-blue-700">
                ₹{recentBets.length > 0 
                  ? Math.round(recentBets.reduce((acc, b) => acc + parseFloat(b.total_amount), 0) / recentBets.length).toLocaleString('en-IN')
                  : 0}
              </p>
            </div>
            <div className="bg-purple-50 border border-purple-200 rounded-lg p-3">
              <p className="text-xs text-purple-600">Active Games</p>
              <p className="text-lg font-bold text-purple-700">
                {new Set(recentBets.map(b => b.game_name)).size}
              </p>
            </div>
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
              <p className="text-xs text-amber-600">Top User</p>
              <p className="text-sm font-bold text-amber-700 truncate">
                {recentBets[0]?.user_name || 'N/A'}
              </p>
            </div>
          </div>
        </CollapsibleSection>
      </div>

      {/* Recent Bets */}
      <CollapsibleSection title="Recent Bets" badge={recentBets.length > 0 ? recentBets.length : null} defaultOpen={true}>
        <div className="-mx-3 sm:-mx-6 -mb-3 sm:-mb-6">
          <MobileTable 
            headers={[
              { label: 'User' },
              { label: 'Game/Type', className: 'hidden sm:table-cell' },
              { label: 'Amount', className: 'text-right' },
              { label: 'Status', className: 'text-center' },
              { label: 'Time', className: 'hidden md:table-cell' },
            ]}
          >
            {recentBets.map((bet) => (
              <tr key={bet.id} className="hover:bg-gray-50 transition-colors">
                <td className="px-3 sm:px-5 py-2.5 sm:py-3">
                  <div className="font-medium text-gray-800 truncate max-w-[100px] sm:max-w-none">{bet.user_name}</div>
                  <div className="text-xs text-gray-500 sm:hidden">{bet.game_name}</div>
                </td>
                <td className="px-3 sm:px-5 py-2.5 sm:py-3 hidden sm:table-cell">
                  <div className="text-gray-800">{bet.game_name}</div>
                  <div className="text-xs text-gray-500 capitalize">{bet.type}</div>
                </td>
                <td className="px-3 sm:px-5 py-2.5 sm:py-3 text-right">
                  <div className="font-medium text-gray-800">₹{parseFloat(bet.total_amount).toLocaleString('en-IN')}</div>
                </td>
                <td className="px-3 sm:px-5 py-2.5 sm:py-3 text-center">
                  <span className={`inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full ${
                    bet.status === 'win' ? 'bg-green-100 text-green-700'
                      : bet.status === 'loss' ? 'bg-red-100 text-red-700'
                      : 'bg-yellow-100 text-yellow-700'
                  }`}>
                    {bet.status === 'win' && '✓ '}
                    {bet.status === 'loss' && '✗ '}
                    {bet.status}
                  </span>
                </td>
                <td className="px-3 sm:px-5 py-2.5 sm:py-3 text-gray-500 hidden md:table-cell">
                  {new Date(bet.created_at).toLocaleString('en-IN', { 
                    timeZone: 'Asia/Kolkata',
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                  })}
                </td>
              </tr>
            ))}
            {recentBets.length === 0 && (
              <tr>
                <td colSpan={5} className="px-5 py-12 text-center">
                  <div className="text-4xl mb-3">🎯</div>
                  <p className="text-gray-400 text-sm">No recent bets</p>
                </td>
              </tr>
            )}
          </MobileTable>
        </div>
        
        {recentBets.length > 0 && (
          <div className="mt-4 text-center">
            <Link 
              to="/bets" 
              className="inline-flex items-center gap-1 text-sm text-blue-600 hover:text-blue-800 font-medium"
            >
              View all bets
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </Link>
          </div>
        )}
      </CollapsibleSection>
    </div>
  );
}

