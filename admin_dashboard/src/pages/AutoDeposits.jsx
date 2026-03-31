import { useState, useEffect, useCallback } from 'react';
import api from '../utils/api';
import { useToast, ToastContainer } from '../components/ui';

const STATUS_COLORS = {
  received: 'bg-blue-100 text-blue-800',
  matched: 'bg-green-100 text-green-800',
  unmatched: 'bg-yellow-100 text-yellow-800',
  duplicate: 'bg-red-100 text-red-800',
  parse_error: 'bg-gray-100 text-gray-800',
  pending: 'bg-yellow-100 text-yellow-800',
  expired: 'bg-gray-100 text-gray-600',
  cancelled: 'bg-red-100 text-red-700',
};

function Badge({ status }) {
  return (
    <span className={`px-2 py-0.5 rounded text-xs font-medium ${STATUS_COLORS[status] || 'bg-gray-100 text-gray-800'}`}>
      {status}
    </span>
  );
}

function StatCard({ label, value, color = 'text-dark-900' }) {
  return (
    <div className="bg-white rounded-lg shadow p-4">
      <div className="text-sm text-dark-500 mb-1">{label}</div>
      <div className={`text-2xl font-bold ${color}`}>{value}</div>
    </div>
  );
}

export default function AutoDeposits() {
  const [tab, setTab] = useState('stats');
  const [stats, setStats] = useState(null);
  const [webhookTxns, setWebhookTxns] = useState([]);
  const [pendingOrders, setPendingOrders] = useState([]);
  const [logs, setLogs] = useState([]);
  const [webhookFilter, setWebhookFilter] = useState('');
  const [orderFilter, setOrderFilter] = useState('pending');
  const [webhookPage, setWebhookPage] = useState(1);
  const [orderPage, setOrderPage] = useState(1);
  const [logPage, setLogPage] = useState(1);
  const [webhookPagination, setWebhookPagination] = useState({});
  const [orderPagination, setOrderPagination] = useState({});
  const [logPagination, setLogPagination] = useState({});
  const [loading, setLoading] = useState(false);
  const { toasts, success, error: toastError, dismiss } = useToast();

  const loadStats = useCallback(async () => {
    try {
      const res = await api.get('/auto-deposit/admin/stats');
      setStats(res.data);
    } catch (err) {
      console.error('Failed to load stats:', err);
    }
  }, []);

  const loadWebhookTxns = useCallback(async () => {
    setLoading(true);
    try {
      const params = { page: webhookPage, limit: 20 };
      if (webhookFilter) params.status = webhookFilter;
      const res = await api.get('/auto-deposit/admin/webhook-transactions', { params });
      setWebhookTxns(res.data.transactions || []);
      setWebhookPagination(res.data.pagination || {});
    } catch (err) {
      console.error('Failed to load webhook transactions:', err);
    } finally {
      setLoading(false);
    }
  }, [webhookPage, webhookFilter]);

  const loadPendingOrders = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/auto-deposit/admin/pending-orders', {
        params: { status: orderFilter, page: orderPage, limit: 20 },
      });
      setPendingOrders(res.data.orders || []);
      setOrderPagination(res.data.pagination || {});
    } catch (err) {
      console.error('Failed to load orders:', err);
    } finally {
      setLoading(false);
    }
  }, [orderPage, orderFilter]);

  const loadLogs = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/auto-deposit/admin/logs', { params: { page: logPage, limit: 30 } });
      setLogs(res.data.logs || []);
      setLogPagination(res.data.pagination || {});
    } catch (err) {
      console.error('Failed to load logs:', err);
    } finally {
      setLoading(false);
    }
  }, [logPage]);

  useEffect(() => { loadStats(); }, [loadStats]);
  useEffect(() => { if (tab === 'webhook') loadWebhookTxns(); }, [tab, loadWebhookTxns]);
  useEffect(() => { if (tab === 'orders') loadPendingOrders(); }, [tab, loadPendingOrders]);
  useEffect(() => { if (tab === 'logs') loadLogs(); }, [tab, loadLogs]);

  // Auto-refresh stats every 10s
  useEffect(() => {
    const interval = setInterval(loadStats, 10000);
    return () => clearInterval(interval);
  }, [loadStats]);

  const handleExpireOrders = async () => {
    try {
      const res = await api.post('/auto-deposit/admin/expire-orders');
      success(`Expired ${res.data.expired_count} orders.`);
      loadStats();
      if (tab === 'orders') loadPendingOrders();
    } catch (err) {
      toastError('Failed to expire orders.');
    }
  };

  const tabs = [
    { key: 'stats', label: 'Overview' },
    { key: 'webhook', label: 'UPI Messages' },
    { key: 'orders', label: 'Deposit Orders' },
    { key: 'logs', label: 'Audit Logs' },
  ];

  const fmt = (d) => d ? new Date(d).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }) : '-';

  return (
    <div className="space-y-4">
      <ToastContainer toasts={toasts} dismiss={dismiss} />

      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-dark-900">Auto Deposits</h1>
        <button onClick={handleExpireOrders} className="px-3 py-1.5 text-sm bg-yellow-600 text-white rounded hover:bg-yellow-700">
          Expire Stale Orders
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-dark-200">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              tab === t.key ? 'border-primary-500 text-primary-600' : 'border-transparent text-dark-500 hover:text-dark-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Stats Tab */}
      {tab === 'stats' && stats && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard label="Active Orders" value={stats.active_orders} color="text-blue-600" />
            <StatCard label="Matched Today" value={stats.matched_today} color="text-green-600" />
            <StatCard label="Expired Today" value={stats.expired_today} color="text-gray-500" />
            <StatCard label="Matched Amount Today" value={`₹${Number(stats.matched_amount_today).toLocaleString('en-IN')}`} color="text-green-700" />
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard label="Webhook Messages Today" value={stats.webhook_messages_today} />
            <StatCard label="Webhook Matched" value={stats.webhook_matched_today} color="text-green-600" />
            <StatCard label="Webhook Unmatched" value={stats.webhook_unmatched_today} color="text-yellow-600" />
            <StatCard label="Webhook Duplicates" value={stats.webhook_duplicate_today} color="text-red-600" />
          </div>
        </div>
      )}

      {/* Webhook Transactions Tab */}
      {tab === 'webhook' && (
        <div className="space-y-3">
          <div className="flex gap-2">
            {['', 'received', 'matched', 'unmatched', 'duplicate', 'parse_error'].map((s) => (
              <button
                key={s}
                onClick={() => { setWebhookFilter(s); setWebhookPage(1); }}
                className={`px-3 py-1 text-xs rounded ${webhookFilter === s ? 'bg-primary-600 text-white' : 'bg-dark-100 text-dark-600 hover:bg-dark-200'}`}
              >
                {s || 'All'}
              </button>
            ))}
          </div>

          <div className="bg-white rounded-lg shadow overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-dark-50 text-dark-600">
                <tr>
                  <th className="px-4 py-2 text-left">ID</th>
                  <th className="px-4 py-2 text-left">Amount</th>
                  <th className="px-4 py-2 text-left">Reference</th>
                  <th className="px-4 py-2 text-left">Payer</th>
                  <th className="px-4 py-2 text-left">Status</th>
                  <th className="px-4 py-2 text-left">Matched User</th>
                  <th className="px-4 py-2 text-left">Time</th>
                  <th className="px-4 py-2 text-left">Error</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-dark-100">
                {webhookTxns.map((txn) => (
                  <tr key={txn.id} className="hover:bg-dark-50">
                    <td className="px-4 py-2">{txn.id}</td>
                    <td className="px-4 py-2 font-medium">₹{txn.amount ? Number(txn.amount).toLocaleString('en-IN') : '-'}</td>
                    <td className="px-4 py-2 font-mono text-xs">{txn.reference_number || '-'}</td>
                    <td className="px-4 py-2">{txn.payer_name || '-'}</td>
                    <td className="px-4 py-2"><Badge status={txn.status} /></td>
                    <td className="px-4 py-2">{txn.matched_user_name ? `${txn.matched_user_name} (${txn.matched_user_phone})` : '-'}</td>
                    <td className="px-4 py-2 text-xs">{fmt(txn.created_at)}</td>
                    <td className="px-4 py-2 text-xs text-red-600 max-w-xs truncate">{txn.error_message || ''}</td>
                  </tr>
                ))}
                {webhookTxns.length === 0 && (
                  <tr><td colSpan="8" className="px-4 py-8 text-center text-dark-400">No webhook transactions found.</td></tr>
                )}
              </tbody>
            </table>
          </div>

          <Pagination pagination={webhookPagination} page={webhookPage} setPage={setWebhookPage} />
        </div>
      )}

      {/* Deposit Orders Tab */}
      {tab === 'orders' && (
        <div className="space-y-3">
          <div className="flex gap-2">
            {['pending', 'matched', 'expired', 'cancelled'].map((s) => (
              <button
                key={s}
                onClick={() => { setOrderFilter(s); setOrderPage(1); }}
                className={`px-3 py-1 text-xs rounded ${orderFilter === s ? 'bg-primary-600 text-white' : 'bg-dark-100 text-dark-600 hover:bg-dark-200'}`}
              >
                {s.charAt(0).toUpperCase() + s.slice(1)}
              </button>
            ))}
          </div>

          <div className="bg-white rounded-lg shadow overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-dark-50 text-dark-600">
                <tr>
                  <th className="px-4 py-2 text-left">ID</th>
                  <th className="px-4 py-2 text-left">User</th>
                  <th className="px-4 py-2 text-left">Amount</th>
                  <th className="px-4 py-2 text-left">Status</th>
                  <th className="px-4 py-2 text-left">Deposit ID</th>
                  <th className="px-4 py-2 text-left">Created</th>
                  <th className="px-4 py-2 text-left">Expires</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-dark-100">
                {pendingOrders.map((order) => (
                  <tr key={order.id} className="hover:bg-dark-50">
                    <td className="px-4 py-2">{order.id}</td>
                    <td className="px-4 py-2">{order.user_name} ({order.user_phone})</td>
                    <td className="px-4 py-2 font-medium">₹{Number(order.amount).toLocaleString('en-IN')}</td>
                    <td className="px-4 py-2"><Badge status={order.status} /></td>
                    <td className="px-4 py-2">{order.matched_deposit_id || '-'}</td>
                    <td className="px-4 py-2 text-xs">{fmt(order.created_at)}</td>
                    <td className="px-4 py-2 text-xs">{fmt(order.expires_at)}</td>
                  </tr>
                ))}
                {pendingOrders.length === 0 && (
                  <tr><td colSpan="7" className="px-4 py-8 text-center text-dark-400">No orders found.</td></tr>
                )}
              </tbody>
            </table>
          </div>

          <Pagination pagination={orderPagination} page={orderPage} setPage={setOrderPage} />
        </div>
      )}

      {/* Audit Logs Tab */}
      {tab === 'logs' && (
        <div className="space-y-3">
          <div className="bg-white rounded-lg shadow overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-dark-50 text-dark-600">
                <tr>
                  <th className="px-4 py-2 text-left">ID</th>
                  <th className="px-4 py-2 text-left">Action</th>
                  <th className="px-4 py-2 text-left">User</th>
                  <th className="px-4 py-2 text-left">Webhook #</th>
                  <th className="px-4 py-2 text-left">Order #</th>
                  <th className="px-4 py-2 text-left">Deposit #</th>
                  <th className="px-4 py-2 text-left">Details</th>
                  <th className="px-4 py-2 text-left">Time</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-dark-100">
                {logs.map((log) => (
                  <tr key={log.id} className="hover:bg-dark-50">
                    <td className="px-4 py-2">{log.id}</td>
                    <td className="px-4 py-2"><Badge status={log.action} /></td>
                    <td className="px-4 py-2">{log.user_name ? `${log.user_name} (${log.user_phone})` : log.user_id || '-'}</td>
                    <td className="px-4 py-2">{log.webhook_txn_id || '-'}</td>
                    <td className="px-4 py-2">{log.order_id || '-'}</td>
                    <td className="px-4 py-2">{log.deposit_id || '-'}</td>
                    <td className="px-4 py-2 text-xs max-w-xs truncate">{log.details || '-'}</td>
                    <td className="px-4 py-2 text-xs">{fmt(log.created_at)}</td>
                  </tr>
                ))}
                {logs.length === 0 && (
                  <tr><td colSpan="8" className="px-4 py-8 text-center text-dark-400">No logs found.</td></tr>
                )}
              </tbody>
            </table>
          </div>

          <Pagination pagination={logPagination} page={logPage} setPage={setLogPage} />
        </div>
      )}
    </div>
  );
}

function Pagination({ pagination, page, setPage }) {
  if (!pagination || !pagination.totalPages || pagination.totalPages <= 1) return null;

  return (
    <div className="flex items-center justify-between text-sm text-dark-500">
      <span>Page {page} of {pagination.totalPages} ({pagination.total} total)</span>
      <div className="flex gap-2">
        <button
          onClick={() => setPage((p) => Math.max(1, p - 1))}
          disabled={page <= 1}
          className="px-3 py-1 bg-dark-100 rounded disabled:opacity-40 hover:bg-dark-200"
        >
          Prev
        </button>
        <button
          onClick={() => setPage((p) => Math.min(pagination.totalPages, p + 1))}
          disabled={page >= pagination.totalPages}
          className="px-3 py-1 bg-dark-100 rounded disabled:opacity-40 hover:bg-dark-200"
        >
          Next
        </button>
      </div>
    </div>
  );
}
