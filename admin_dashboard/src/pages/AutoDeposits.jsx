import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import api from '../utils/api';
import { useToast, ToastContainer } from '../components/ui';
import { cleanDisplayText } from '../utils/display';
import { MatchAllUnmatchedButton } from '../components/MatchAllUnmatchedButton';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../hooks/useSocket';
import { Copy, MessageSquareText, RefreshCw, Trash2, X } from 'lucide-react';

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

function SortIcon({ field, currentSort }) {
  if (currentSort.field !== field) return <span className="text-dark-300 ml-1">↕</span>;
  return <span className="text-primary-600 ml-1">{currentSort.direction === 'desc' ? '↓' : '↑'}</span>;
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
  const { user } = useAuth();
  const isModerator = user?.role === 'moderator';
  const isAdmin = user?.role === 'admin';
  const socket = useSocket();
  const isConnected = !!socket?.connected;

  const [searchParams, setSearchParams] = useSearchParams();
  const [tab, setTab] = useState(searchParams.get('tab') || 'stats');
    useEffect(() => {
      const nextTab = searchParams.get('tab') || 'stats';
      setTab((current) => current === nextTab ? current : nextTab);
    }, [searchParams]);

    const selectTab = (nextTab) => {
      setTab(nextTab);
      setSearchParams((current) => {
        const next = new URLSearchParams(current);
        next.set('tab', nextTab);
        return next;
      });
    };

  // Define tabs early since keyboard shortcuts useEffect references it
  const tabs = [
    { key: 'stats', label: 'Overview' },
    ...(isAdmin ? [{ key: 'webhook', label: 'UPI Messages' }] : []),
    { key: 'orders', label: 'Deposit Orders' },
    ...(isAdmin ? [{ key: 'unmatched', label: 'Unmatched' }] : []),
    { key: 'utr-search', label: 'UTR Search' },
    ...(isAdmin ? [{ key: 'logs', label: 'Audit Logs' }] : []),
  ];

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
  const [clearWebhookLoading, setClearWebhookLoading] = useState(false);
  const [clearClosedOrdersLoading, setClearClosedOrdersLoading] = useState(false);
  const [clearLogsLoading, setClearLogsLoading] = useState(false);
  const [rawSmsModal, setRawSmsModal] = useState(null);
  const { toasts, success, error: toastError, dismiss } = useToast();

  // UTR Search state
  const [utrSearchQuery, setUtrSearchQuery] = useState('');
  const [utrSearchResults, setUtrSearchResults] = useState(null);
  const [utrSearchLoading, setUtrSearchLoading] = useState(false);

  // Order search/filter state
  const [orderSearch, setOrderSearch] = useState('');

  // Unmatched transactions state
  const [unmatchedTxns, setUnmatchedTxns] = useState([]);
  const [unmatchedPage, setUnmatchedPage] = useState(1);
  const [unmatchedPagination, setUnmatchedPagination] = useState({});

  // Credit-by-UTR modal state
  const [creditModal, setCreditModal] = useState(null); // { txn }
  const [creditUserId, setCreditUserId] = useState('');
  const [creditLoading, setCreditLoading] = useState(false);

  // New improvements state
  const [orderPageSize, setOrderPageSize] = useState(20);
  const [orderSort, setOrderSort] = useState({ field: 'created_at', direction: 'desc' });
  const [selectedOrders, setSelectedOrders] = useState(new Set());
  const [orderDetailsModal, setOrderDetailsModal] = useState(null);
  const [staleDataWarning, setStaleDataWarning] = useState(false);
  const [newOrderIds, setNewOrderIds] = useState(new Set());
  const [lastRefreshTime, setLastRefreshTime] = useState(Date.now());

  const loadStats = useCallback(async () => {
    try {
      const endpoint = isModerator ? '/auto-deposit/moderator/stats' : '/auto-deposit/admin/stats';
      const res = await api.get(endpoint);
      setStats(res.data);
    } catch (err) {
      console.error('Failed to load stats:', err);
    }
  }, [isModerator]);

  const loadWebhookTxns = useCallback(async () => {
    setLoading(true);
    try {
      const params = { page: webhookPage, limit: 20 };
      if (webhookFilter) params.status = webhookFilter;
      const endpoint = isModerator ? '/auto-deposit/moderator/webhook-transactions' : '/auto-deposit/admin/webhook-transactions';
      const res = await api.get(endpoint, { params });
      setWebhookTxns(res.data.transactions || []);
      setWebhookPagination(res.data.pagination || {});
    } catch (err) {
      console.error('Failed to load webhook transactions:', err);
    } finally {
      setLoading(false);
    }
  }, [webhookPage, webhookFilter, isModerator]);

  const loadPendingOrders = useCallback(async () => {
    setLoading(true);
    try {
      const endpoint = isModerator ? '/auto-deposit/moderator/pending-orders' : '/auto-deposit/admin/pending-orders';
      const res = await api.get(endpoint, {
        params: { status: orderFilter, page: orderPage, limit: orderPageSize, sort: orderSort.field, order: orderSort.direction },
      });
      const orders = res.data.orders || [];
      
      // Track new orders (created in last 60 seconds)
      const now = Date.now();
      const newIds = new Set();
      orders.forEach(o => {
        if (now - new Date(o.created_at).getTime() < 60000) {
          newIds.add(o.id);
        }
      });
      if (newIds.size > 0) {
        setNewOrderIds(prev => new Set([...prev, ...newIds]));
        // Clear "NEW" badge after 30 seconds
        setTimeout(() => {
          setNewOrderIds(prev => {
            const next = new Set(prev);
            newIds.forEach(id => next.delete(id));
            return next;
          });
        }, 30000);
      }
      
      setPendingOrders(orders);
      setOrderPagination(res.data.pagination || {});
      setLastRefreshTime(Date.now());
      setStaleDataWarning(false);
    } catch (err) {
      console.error('Failed to load orders:', err);
    } finally {
      setLoading(false);
    }
  }, [orderPage, orderFilter, isModerator, orderPageSize, orderSort]);

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

  const handleUtrSearch = useCallback(async () => {
    if (!utrSearchQuery.trim() || utrSearchQuery.trim().length < 6) {
      toastError('Enter at least 6 characters to search.');
      return;
    }
    setUtrSearchLoading(true);
    try {
      const endpoint = isModerator ? `/auto-deposit/moderator/search-utr/${encodeURIComponent(utrSearchQuery.trim())}` : `/auto-deposit/admin/search-utr/${encodeURIComponent(utrSearchQuery.trim())}`;
      const res = await api.get(endpoint);
      setUtrSearchResults(res.data);
    } catch (err) {
      toastError(err.response?.data?.error || 'Search failed.');
    } finally {
      setUtrSearchLoading(false);
    }
  }, [utrSearchQuery, toastError, isModerator]);

  const loadUnmatchedTxns = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/auto-deposit/admin/unmatched-transactions', { params: { page: unmatchedPage, limit: 20 } });
      setUnmatchedTxns(res.data.transactions || []);
      setUnmatchedPagination({ total: res.data.total, totalPages: Math.ceil(res.data.total / res.data.limit) });
    } catch (err) {
      console.error('Failed to load unmatched transactions:', err);
    } finally {
      setLoading(false);
    }
  }, [unmatchedPage]);

  useEffect(() => { loadStats(); }, [loadStats]);
  useEffect(() => { if (tab === 'webhook') loadWebhookTxns(); }, [tab, loadWebhookTxns]);
  useEffect(() => { if (tab === 'orders') loadPendingOrders(); }, [tab, loadPendingOrders, orderFilter, orderPage, orderPageSize, orderSort]);
  useEffect(() => { if (tab === 'logs') loadLogs(); }, [tab, loadLogs]);
  useEffect(() => { if (tab === 'unmatched') loadUnmatchedTxns(); }, [tab, loadUnmatchedTxns]);

  // Auto-refresh stats every 10s
  useEffect(() => {
    const interval = setInterval(loadStats, 10000);
    return () => clearInterval(interval);
  }, [loadStats]);

  // Auto-refresh orders every 10s when on orders tab
  useEffect(() => {
    if (tab !== 'orders') return;
    const interval = setInterval(loadPendingOrders, 10000);
    return () => clearInterval(interval);
  }, [tab, loadPendingOrders]);

  // Stale data warning (warn if data older than 5 minutes)
  useEffect(() => {
    const interval = setInterval(() => {
      if (Date.now() - lastRefreshTime > 300000) {
        setStaleDataWarning(true);
      }
    }, 30000);
    return () => clearInterval(interval);
  }, [lastRefreshTime]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      
      switch(e.key.toLowerCase()) {
        case 'r':
          if (tab === 'orders') loadPendingOrders();
          else if (tab === 'webhook') loadWebhookTxns();
          else if (tab === 'logs') loadLogs();
          else if (tab === 'unmatched') loadUnmatchedTxns();
          break;
        case 'escape':
          setActionModal(null);
          setCreditModal(null);
          setOrderDetailsModal(null);
          setRawSmsModal(null);
          break;
        case '1':
          selectTab('stats');
          break;
        case '2':
          if (isAdmin || tabs.find(t => t.key === 'webhook')) selectTab('webhook');
          break;
        case '3':
          selectTab('orders');
          break;
        case '4':
          if (isAdmin) selectTab('unmatched');
          break;
        case '5':
          selectTab('utr-search');
          break;
        case '6':
          if (isAdmin) selectTab('logs');
          break;
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [tab, loadPendingOrders, loadWebhookTxns, loadLogs, loadUnmatchedTxns, selectTab, isAdmin, tabs]);

  // WebSocket real-time event listeners
  useEffect(() => {
    if (!socket) return;

    // New order created
    const handleOrderCreated = (data) => {
      success(`New order #${data.orderId} - ₹${Number(data.amount).toLocaleString('en-IN')} from ${data.userName || 'User'}`);
      setNewOrderIds(prev => new Set([...prev, data.orderId]));
      if (tab === 'orders' && orderFilter === 'pending') loadPendingOrders();
      loadStats();
      setTimeout(() => {
        setNewOrderIds(prev => {
          const next = new Set(prev);
          next.delete(data.orderId);
          return next;
        });
      }, 30000);
    };

    // Order matched
    const handleOrderMatched = (data) => {
      success(`Order #${data.orderId} auto-matched! ₹${Number(data.amount).toLocaleString('en-IN')} credited`);
      if (tab === 'orders') loadPendingOrders();
      if (tab === 'webhook') loadWebhookTxns();
      loadStats();
    };

    // Order expired
    const handleOrderExpired = (data) => {
      if (tab === 'orders' && orderFilter === 'expired') loadPendingOrders();
      loadStats();
    };

    // Order cancelled
    const handleOrderCancelled = (data) => {
      toastError(`Order #${data.orderId} cancelled`);
      if (tab === 'orders') loadPendingOrders();
      loadStats();
    };

    // Order credited manually
    const handleOrderCredited = (data) => {
      success(`Order #${data.orderId} credited manually! ₹${Number(data.amount).toLocaleString('en-IN')}`);
      if (tab === 'orders') loadPendingOrders();
      loadStats();
    };

    // Webhook transaction received
    const handleWebhookReceived = (data) => {
      if (tab === 'webhook') loadWebhookTxns();
      loadStats();
    };

    // Register listeners
    socket.on('deposit_order_created', handleOrderCreated);
    socket.on('deposit_order_matched', handleOrderMatched);
    socket.on('deposit_order_expired', handleOrderExpired);
    socket.on('deposit_order_cancelled', handleOrderCancelled);
    socket.on('deposit_order_credited', handleOrderCredited);
    socket.on('webhook_transaction_received', handleWebhookReceived);

    return () => {
      socket.off('deposit_order_created', handleOrderCreated);
      socket.off('deposit_order_matched', handleOrderMatched);
      socket.off('deposit_order_expired', handleOrderExpired);
      socket.off('deposit_order_cancelled', handleOrderCancelled);
      socket.off('deposit_order_credited', handleOrderCredited);
      socket.off('webhook_transaction_received', handleWebhookReceived);
    };
  }, [socket, tab, orderFilter, loadPendingOrders, loadWebhookTxns, loadStats, success, toastError]);

  // Update lastUpdated timestamp
  const [lastUpdated, setLastUpdated] = useState(null);
  useEffect(() => {
    const interval = setInterval(() => setLastUpdated(new Date()), 10000);
    setLastUpdated(new Date());
    return () => clearInterval(interval);
  }, []);

  const [actionModal, setActionModal] = useState(null); // { type: 'cancel'|'credit', order }
  const [utrInput, setUtrInput] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  const handleAdminCancel = async () => {
    setActionLoading(true);
    try {
      const endpoint = isModerator ? `/auto-deposit/moderator/orders/${actionModal.order.id}/cancel` : `/auto-deposit/admin/orders/${actionModal.order.id}/cancel`;
      await api.post(endpoint);
      success('Order cancelled successfully.');
      setActionModal(null);
      loadPendingOrders();
      loadStats();
    } catch (err) {
      toastError(err.response?.data?.error || 'Failed to cancel order.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleAdminCredit = async () => {
    if (!utrInput.trim()) { toastError('UTR / reference number is required.'); return; }
    setActionLoading(true);
    try {
      const endpoint = isModerator ? `/auto-deposit/moderator/orders/${actionModal.order.id}/credit` : `/auto-deposit/admin/orders/${actionModal.order.id}/credit`;
      const res = await api.post(endpoint, { utr_number: utrInput.trim() });
      success(res.data.message || 'Deposit credited successfully.');
      setActionModal(null);
      setUtrInput('');
      loadPendingOrders();
      loadStats();
    } catch (err) {
      toastError(err.response?.data?.error || 'Failed to credit deposit.');
    } finally {
      setActionLoading(false);
    }
  };

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

  const handleClearOldWebhookMessages = async () => {
    if (!window.confirm('Clear UPI messages older than 24 hours? Related deposit, order, and audit references will stay, but the old SMS rows will be removed.')) return;

    setClearWebhookLoading(true);
    try {
      const res = await api.delete('/auto-deposit/admin/webhook-transactions/older-than-24h');
      success(res.data.message || `Cleared ${res.data.deleted_count || 0} old messages.`);
      setRawSmsModal(null);
      setWebhookPage(1);
      await Promise.all([loadStats(), loadWebhookTxns()]);
    } catch (err) {
      toastError(err.response?.data?.error || 'Failed to clear old UPI messages.');
    } finally {
      setClearWebhookLoading(false);
    }
  };

  const handleClearOldClosedOrders = async () => {
    if (!window.confirm('Clear cancelled and expired deposit orders older than 24 hours? Deposit records and audit logs will stay, but old order queue rows will be removed.')) return;

    setClearClosedOrdersLoading(true);
    try {
      const res = await api.delete('/auto-deposit/admin/closed-orders/older-than-24h');
      success(res.data.message || `Cleared ${res.data.deleted_count || 0} old orders.`);
      setOrderPage(1);
      await Promise.all([loadStats(), loadPendingOrders()]);
    } catch (err) {
      toastError(err.response?.data?.error || 'Failed to clear old cancelled/expired orders.');
    } finally {
      setClearClosedOrdersLoading(false);
    }
  };

  const handleClearOldLogs = async () => {
    if (!window.confirm('Clear audit logs older than 24 hours?')) return;

    setClearLogsLoading(true);
    try {
      const res = await api.delete('/auto-deposit/admin/logs/older-than-24h');
      success(res.data.message || `Cleared ${res.data.deleted_count || 0} old audit logs.`);
      setLogPage(1);
      await loadLogs();
    } catch (err) {
      toastError(err.response?.data?.error || 'Failed to clear old audit logs.');
    } finally {
      setClearLogsLoading(false);
    }
  };

  const handleCreditByUtr = async () => {
    if (!creditUserId.trim()) { toastError('User ID is required.'); return; }
    setCreditLoading(true);
    try {
      const res = await api.post('/auto-deposit/admin/credit-by-utr', {
        webhook_transaction_id: creditModal.txn.id,
        user_id: Number(creditUserId.trim()),
      });
      success(res.data.message || 'Credited successfully.');
      setCreditModal(null);
      setCreditUserId('');
      loadUnmatchedTxns();
      loadStats();
    } catch (err) {
      toastError(err.response?.data?.error || 'Failed to credit.');
    } finally {
      setCreditLoading(false);
    }
  };

  // Helper: Copy to clipboard
  const copyToClipboard = async (text, label) => {
    try {
      await navigator.clipboard.writeText(text);
      success(`${label} copied!`);
    } catch {
      toastError('Failed to copy');
    }
  };

  // Helper: Export orders to CSV
  const exportToCSV = () => {
    const filtered = pendingOrders.filter(o => !orderSearch || 
      o.user_name?.toLowerCase().includes(orderSearch.toLowerCase()) ||
      o.user_phone?.includes(orderSearch));
    
    const headers = ['ID', 'User Name', 'Phone', 'Amount', 'QR Amount', 'Status', 'Deposit ID', 'Created', 'Expires'];
    const rows = filtered.map(o => [
      o.id,
      o.user_name,
      o.user_phone,
      o.amount,
      o.pay_amount || o.amount,
      o.status,
      o.matched_deposit_id || '',
      new Date(o.created_at).toLocaleString('en-IN'),
      new Date(o.expires_at).toLocaleString('en-IN')
    ]);
    
    const csv = [headers.join(','), ...rows.map(r => r.map(v => `"${v}"`).join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `orders-${orderFilter}-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    success('CSV exported!');
  };

  // Helper: Toggle order selection for bulk actions
  const toggleOrderSelection = (orderId) => {
    setSelectedOrders(prev => {
      const next = new Set(prev);
      if (next.has(orderId)) next.delete(orderId);
      else next.add(orderId);
      return next;
    });
  };

  // Helper: Select/deselect all
  const selectAllOrders = () => {
    const filtered = pendingOrders.filter(o => !orderSearch || 
      o.user_name?.toLowerCase().includes(orderSearch.toLowerCase()) ||
      o.user_phone?.includes(orderSearch));
    if (selectedOrders.size === filtered.length) {
      setSelectedOrders(new Set());
    } else {
      setSelectedOrders(new Set(filtered.map(o => o.id)));
    }
  };

  // Helper: Bulk cancel selected orders
  const handleBulkCancel = async () => {
    if (selectedOrders.size === 0) return;
    if (!window.confirm(`Cancel ${selectedOrders.size} orders?`)) return;
    
    let cancelled = 0;
    let failed = 0;
    
    for (const orderId of selectedOrders) {
      try {
        const endpoint = isModerator 
          ? `/auto-deposit/moderator/orders/${orderId}/cancel` 
          : `/auto-deposit/admin/orders/${orderId}/cancel`;
        await api.post(endpoint);
        cancelled++;
      } catch {
        failed++;
      }
    }
    
    setSelectedOrders(new Set());
    loadPendingOrders();
    loadStats();
    success(`Cancelled ${cancelled} orders${failed > 0 ? `, ${failed} failed` : ''}`);
  };

  // Helper: Handle sort
  const handleSort = (field) => {
    setOrderSort(prev => ({
      field,
      direction: prev.field === field && prev.direction === 'desc' ? 'asc' : 'desc'
    }));
  };

  const fmt = (d) => d ? new Date(d).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }) : '-';

  const fmtTimeAgo = (d) => {
    if (!d) return '-';
    const diff = Math.floor((new Date() - new Date(d)) / 60000);
    if (diff < 1) return 'Just now';
    if (diff < 60) return `${diff}m ago`;
    if (diff < 1440) return `${Math.floor(diff / 60)}h ago`;
    return `${Math.floor(diff / 1440)}d ago`;
  };

  const isNearExpiry = (expiresAt, status) => {
    if (status !== 'pending') return false;
    const minsLeft = (new Date(expiresAt) - new Date()) / 60000;
    return minsLeft > 0 && minsLeft < 5;
  };

  const isExpired = (expiresAt) => new Date(expiresAt) < new Date();

  return (
    <div className="space-y-4">
      <ToastContainer toasts={toasts} dismiss={dismiss} />


      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="text-xl sm:text-2xl font-bold text-dark-900">Auto Deposits</h1>
          {lastUpdated && (
            <span className="text-xs text-dark-400 hidden sm:inline">
              Updated {fmtTimeAgo(lastUpdated)}
            </span>
          )}
        </div>
        {isAdmin && (
          <div className="flex gap-2 flex-wrap">
            <MatchAllUnmatchedButton onMatched={() => { loadStats(); loadUnmatchedTxns(); loadLogs(); }} />
            <button onClick={handleExpireOrders} className="px-3 py-1.5 text-sm bg-yellow-600 text-white rounded hover:bg-yellow-700 whitespace-nowrap">
              Expire Stale
            </button>
          </div>
        )}
        {/* Connection Status */}
        <div className="flex items-center gap-2 text-xs">
          <span className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`}></span>
          <span className={`${isConnected ? 'text-green-600' : 'text-red-600'} hidden sm:inline`}>
            {isConnected ? 'Live' : 'Offline'}
          </span>
          {lastUpdated && (
            <span className="text-dark-400 sm:hidden">
              {fmtTimeAgo(lastUpdated)}
            </span>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-1 border-b border-dark-200">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => selectTab(t.key)}
            className={`px-3 py-2 text-xs sm:text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
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
          
          {/* Keyboard shortcuts hint */}
          <div className="text-xs text-dark-400 flex flex-wrap gap-3 pt-4">
            <span>Shortcuts:</span>
            <span><kbd className="px-1 bg-dark-100 rounded">1-6</kbd> Tabs</span>
            <span><kbd className="px-1 bg-dark-100 rounded">Esc</kbd> Close</span>
          </div>
        </div>
      )}

      {/* Webhook Transactions Tab */}
      {tab === 'webhook' && (
        <div className="space-y-3">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex gap-2 flex-wrap">
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
            <div className="flex flex-wrap gap-2">
              <button
                onClick={handleClearOldWebhookMessages}
                disabled={clearWebhookLoading}
                className="inline-flex items-center justify-center gap-2 rounded bg-red-600 px-3 py-2 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-60 sm:text-sm"
              >
                <Trash2 size={15} />
                {clearWebhookLoading ? 'Clearing...' : 'Clear Messages 24h'}
              </button>
              <button
                onClick={loadWebhookTxns}
                title="Refresh (R)"
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-dark-500 transition-colors hover:bg-dark-100 hover:text-primary-600"
              >
                <RefreshCw size={17} />
              </button>
            </div>
          </div>

          <div className="grid gap-3 md:hidden">
            {webhookTxns.map((txn) => (
              <div key={txn.id} className="rounded-lg border border-dark-100 bg-white p-3 shadow-sm">
                <div className="mb-3 flex items-start justify-between gap-3">
                  <div>
                    <div className="text-xs text-dark-400">#{txn.id}</div>
                    <div className="text-lg font-semibold text-dark-900">₹{txn.amount ? Number(txn.amount).toLocaleString('en-IN') : '-'}</div>
                  </div>
                  <Badge status={txn.status} />
                </div>
                <div className="space-y-2 text-sm">
                  <div className="grid grid-cols-[88px_1fr] gap-2">
                    <span className="text-dark-500">Reference</span>
                    <span className="break-all font-mono text-xs">{txn.reference_number || '-'}</span>
                  </div>
                  <div className="grid grid-cols-[88px_1fr] gap-2">
                    <span className="text-dark-500">Payer</span>
                    <span>{txn.payer_name || '-'}</span>
                  </div>
                  <div className="grid grid-cols-[88px_1fr] gap-2">
                    <span className="text-dark-500">User</span>
                    <span>{txn.matched_user_name ? `${txn.matched_user_name} (${txn.matched_user_phone})` : '-'}</span>
                  </div>
                  <div className="grid grid-cols-[88px_1fr] gap-2">
                    <span className="text-dark-500">Time</span>
                    <span className="text-xs">{fmt(txn.created_at)}</span>
                  </div>
                  {(txn.error_message || txn.raw_message) && (
                    <div className="border-t border-dark-100 pt-2">
                      {txn.error_message && <div className="mb-2 text-xs text-red-600">{txn.error_message}</div>}
                      {txn.raw_message && (
                        <button
                          onClick={() => setRawSmsModal(txn)}
                          className="inline-flex items-center gap-1.5 text-xs font-medium text-blue-600 hover:text-blue-700"
                        >
                          <MessageSquareText size={14} />
                          View raw SMS
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))}
            {webhookTxns.length === 0 && (
              <div className="rounded-lg bg-white px-4 py-12 text-center shadow">
                <div className="text-4xl mb-2">📨</div>
                <div className="text-dark-400 text-sm">No webhook transactions found</div>
                <div className="text-dark-300 text-xs mt-1">Try changing filters or refreshing</div>
              </div>
            )}
          </div>

          <div className="hidden bg-white rounded-lg shadow overflow-x-auto md:block">
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
                    <td className="px-4 py-2 font-mono text-xs">
                      <div className="flex items-center gap-1">
                        <span>{txn.reference_number || '-'}</span>
                        {txn.reference_number && (
                          <button
                            onClick={() => copyToClipboard(txn.reference_number, 'UTR')}
                            className="text-dark-400 hover:text-primary-600"
                            title="Copy UTR"
                          >
                            <Copy size={14} />
                          </button>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-2">{txn.payer_name || '-'}</td>
                    <td className="px-4 py-2"><Badge status={txn.status} /></td>
                    <td className="px-4 py-2">{txn.matched_user_name ? `${txn.matched_user_name} (${txn.matched_user_phone})` : '-'}</td>
                    <td className="px-4 py-2 text-xs">{fmt(txn.created_at)}</td>
                    <td className="px-4 py-2 text-xs text-red-600 max-w-xs">
                      {txn.error_message || ''}
                      {txn.raw_message && (
                        <button
                          onClick={() => setRawSmsModal(txn)}
                          className="mt-1 inline-flex items-center gap-1.5 text-blue-600 hover:text-blue-700"
                        >
                          <MessageSquareText size={14} />
                          View raw SMS
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
                {webhookTxns.length === 0 && (
                  <tr>
                    <td colSpan="8" className="px-4 py-12 text-center">
                      <div className="text-4xl mb-2">📨</div>
                      <div className="text-dark-400 text-sm">No webhook transactions found</div>
                      <div className="text-dark-300 text-xs mt-1">Try changing filters or refreshing</div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <Pagination pagination={webhookPagination} page={webhookPage} setPage={setWebhookPage} />
          
          {/* Keyboard shortcuts hint */}
          <div className="text-xs text-dark-400 flex flex-wrap gap-3 pt-2">
            <span>Shortcuts:</span>
            <span><kbd className="px-1 bg-dark-100 rounded">R</kbd> Refresh</span>
            <span><kbd className="px-1 bg-dark-100 rounded">1-6</kbd> Tabs</span>
            <span><kbd className="px-1 bg-dark-100 rounded">Esc</kbd> Close</span>
          </div>
        </div>
      )}

      {/* Deposit Orders Tab */}
      {tab === 'orders' && (
        <div className="space-y-3">
          {/* Stale data warning */}
          {staleDataWarning && (
            <div className="bg-yellow-50 border border-yellow-200 text-yellow-800 px-4 py-2 rounded-lg text-sm flex items-center gap-2">
              <span>⚠️</span>
              <span>Data is stale (last updated {fmtTimeAgo(lastRefreshTime)}). Press <kbd className="px-1 bg-yellow-200 rounded">R</kbd> to refresh.</span>
            </div>
          )}

          {/* Filter buttons with count badges */}
          <div className="flex flex-wrap gap-2 items-center justify-between">
            <div className="flex flex-wrap gap-2 items-center">
            {['pending', 'matched', 'expired', 'cancelled'].map((s) => {
              const count = stats?.[`${s}_orders`] ?? (orderFilter === s ? orderPagination.total : '-');
              return (
                <button
                  key={s}
                  onClick={() => { setOrderFilter(s); setOrderPage(1); setSelectedOrders(new Set()); }}
                  className={`px-3 py-1.5 text-xs rounded flex items-center gap-1.5 ${
                    orderFilter === s 
                      ? 'bg-primary-600 text-white' 
                      : 'bg-dark-100 text-dark-600 hover:bg-dark-200'
                  }`}
                >
                  <span>{s.charAt(0).toUpperCase() + s.slice(1)}</span>
                  <span className={`px-1.5 py-0.5 rounded text-[10px] ${
                    orderFilter === s ? 'bg-white/20' : 'bg-dark-200'
                  }`}>
                    {count}
                  </span>
                </button>
              );
            })}
            </div>
          </div>

          {/* Toolbar: Search, Refresh, Page Size, Export */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 flex-1 min-w-[200px] max-w-md">
              <input
                type="text"
                value={orderSearch}
                onChange={(e) => setOrderSearch(e.target.value)}
                placeholder="Search by user name or phone..."
                className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
              <button
                onClick={loadPendingOrders}
                title="Refresh (R)"
                className="p-2 text-dark-500 hover:text-primary-600 hover:bg-dark-100 rounded-lg transition-colors"
              >
                🔄
              </button>
            </div>
            
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={handleClearOldClosedOrders}
                disabled={clearClosedOrdersLoading}
                className="inline-flex items-center justify-center gap-2 rounded bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-60"
              >
                <Trash2 size={15} />
                {clearClosedOrdersLoading ? 'Clearing...' : 'Clear Closed 24h'}
              </button>

              {/* Page size selector */}
              <select
                value={orderPageSize}
                onChange={(e) => { setOrderPageSize(Number(e.target.value)); setOrderPage(1); }}
                className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
              >
                <option value={20}>20/page</option>
                <option value={50}>50/page</option>
                <option value={100}>100/page</option>
              </select>
              
              {/* Export CSV */}
              <button
                onClick={exportToCSV}
                className="px-3 py-1.5 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 flex items-center gap-1"
              >
                📥 CSV
              </button>
              
              {/* Total amount */}
              <div className="text-sm font-medium text-dark-700 px-2">
                Total: <span className="text-primary-600">
                  ₹{pendingOrders
                    .filter(o => !orderSearch || 
                      o.user_name?.toLowerCase().includes(orderSearch.toLowerCase()) ||
                      o.user_phone?.includes(orderSearch))
                    .reduce((sum, o) => sum + Number(o.amount), 0)
                    .toLocaleString('en-IN')}
                </span>
              </div>
            </div>
          </div>

          {/* Bulk actions bar */}
          {orderFilter === 'pending' && selectedOrders.size > 0 && (
            <div className="flex items-center justify-between bg-dark-50 px-3 py-2 rounded-lg">
              <span className="text-sm text-dark-600">{selectedOrders.size} selected</span>
              <button
                onClick={handleBulkCancel}
                className="px-3 py-1 text-xs bg-red-600 text-white rounded hover:bg-red-700"
              >
                Bulk Cancel
              </button>
            </div>
          )}
          <div className="bg-white rounded-lg shadow overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-dark-50 text-dark-600">
                <tr>
                  {orderFilter === 'pending' && (
                    <th className="px-2 py-2 text-left">
                      <input
                        type="checkbox"
                        checked={selectedOrders.size === pendingOrders.length && pendingOrders.length > 0}
                        onChange={selectAllOrders}
                        className="rounded border-gray-300"
                      />
                    </th>
                  )}
                  <th className="px-4 py-2 text-left cursor-pointer hover:bg-dark-100" onClick={() => handleSort('id')}>
                    ID <SortIcon field="id" currentSort={orderSort} />
                  </th>
                  <th className="px-4 py-2 text-left cursor-pointer hover:bg-dark-100" onClick={() => handleSort('user_name')}>
                    User <SortIcon field="user_name" currentSort={orderSort} />
                  </th>
                  <th className="px-4 py-2 text-left cursor-pointer hover:bg-dark-100" onClick={() => handleSort('amount')}>
                    Amount <SortIcon field="amount" currentSort={orderSort} />
                  </th>
                  <th className="px-4 py-2 text-left">Status</th>
                  <th className="px-4 py-2 text-left">Deposit ID</th>
                  <th className="px-4 py-2 text-left cursor-pointer hover:bg-dark-100" onClick={() => handleSort('created_at')}>
                    Created <SortIcon field="created_at" currentSort={orderSort} />
                  </th>
                  <th className="px-4 py-2 text-left">Time Left</th>
                  <th className="px-4 py-2 text-left">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-dark-100">
                {pendingOrders
                  .filter(o => !orderSearch || 
                    o.user_name?.toLowerCase().includes(orderSearch.toLowerCase()) ||
                    o.user_phone?.includes(orderSearch))
                  .map((order) => (
                  <tr 
                    key={order.id} 
                    onClick={() => setOrderDetailsModal(order)}
                    className={`hover:bg-dark-50 cursor-pointer ${
                      isNearExpiry(order.expires_at, order.status) ? 'bg-red-50' : ''
                    } ${order.status === 'expired' ? 'bg-gray-50' : ''} ${
                      order.status === 'cancelled' ? 'bg-red-50/50' : ''
                    }`}
                  >
                    {orderFilter === 'pending' && (
                      <td className="px-2 py-2" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={selectedOrders.has(order.id)}
                          onChange={() => toggleOrderSelection(order.id)}
                          className="rounded border-gray-300"
                        />
                      </td>
                    )}
                    <td className="px-4 py-2">
                      <div className="flex items-center gap-1">
                        <span>#{order.id}</span>
                        <button
                          onClick={(e) => { e.stopPropagation(); copyToClipboard(order.id.toString(), 'Order ID'); }}
                          className="text-dark-400 hover:text-primary-600"
                          title="Copy Order ID"
                        >
                          📋
                        </button>
                        {newOrderIds.has(order.id) && (
                          <span className="animate-pulse bg-red-500 text-white text-[10px] px-1 rounded">NEW</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-2">
                      <div className="font-medium">{order.user_name}</div>
                      <div className="text-xs text-dark-500">{order.user_phone}</div>
                    </td>
                    <td className="px-4 py-2">
                      <div className="font-medium">₹{Number(order.amount).toLocaleString('en-IN')}</div>
                      {order.pay_amount && order.pay_amount !== order.amount && (
                        <div className="text-xs text-primary-600 font-medium">QR: ₹{Number(order.pay_amount).toLocaleString('en-IN')}</div>
                      )}
                    </td>
                    <td className="px-4 py-2">
                      <Badge status={order.status} />
                      {isNearExpiry(order.expires_at, order.status) && (
                        <div className="text-xs text-red-600 font-medium mt-1">⚠️ Expires soon!</div>
                      )}
                    </td>
                    <td className="px-4 py-2">
                      {order.matched_deposit_id ? (
                        <span className="font-mono text-xs">#{order.matched_deposit_id}</span>
                      ) : (
                        '-'
                      )}
                    </td>
                    <td className="px-4 py-2 text-xs">{fmt(order.created_at)}</td>
                    <td className="px-4 py-2 text-xs">
                      {order.status === 'pending' ? (
                        isExpired(order.expires_at) ? (
                          <span className="text-red-600 font-medium">Expired {fmtTimeAgo(order.expires_at)}</span>
                        ) : (
                          <span className={isNearExpiry(order.expires_at, order.status) ? 'text-red-600 font-medium' : 'text-dark-500'}>
                            Expires {fmtTimeAgo(order.expires_at)}
                          </span>
                        )
                      ) : (
                        <span className="text-dark-400">-</span>
                      )}
                    </td>
                    <td className="px-4 py-2" onClick={(e) => e.stopPropagation()}>
                      {(order.status === 'pending' || order.status === 'expired') && (
                        <div className="flex gap-1">
                          <button
                            onClick={() => { setActionModal({ type: 'credit', order }); setUtrInput(''); }}
                            className="px-2 py-1 text-xs bg-green-600 text-white rounded hover:bg-green-700"
                          >
                            Credit
                          </button>
                          {order.status === 'pending' && (
                            <button
                              onClick={() => setActionModal({ type: 'cancel', order })}
                              className="px-2 py-1 text-xs bg-red-600 text-white rounded hover:bg-red-700"
                            >
                              Cancel
                            </button>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
                {pendingOrders.length === 0 && (
                  <tr>
                    <td colSpan={orderFilter === 'pending' ? 9 : 8} className="px-4 py-12 text-center">
                      <div className="text-4xl mb-2">📭</div>
                      <div className="text-dark-400 text-sm">No {orderFilter} orders found</div>
                      <div className="text-dark-300 text-xs mt-1">Try changing filters or refreshing</div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <Pagination pagination={orderPagination} page={orderPage} setPage={setOrderPage} />
          
          {/* Keyboard shortcuts hint */}
          <div className="text-xs text-dark-400 flex flex-wrap gap-3 pt-2">
            <span>Shortcuts:</span>
            <span><kbd className="px-1 bg-dark-100 rounded">R</kbd> Refresh</span>
            <span><kbd className="px-1 bg-dark-100 rounded">1-6</kbd> Tabs</span>
            <span><kbd className="px-1 bg-dark-100 rounded">Esc</kbd> Close</span>
            <span><kbd className="px-1 bg-dark-100 rounded">Click row</kbd> Details</span>
          </div>
        </div>
      )}

      {/* Audit Logs Tab */}
      {tab === 'logs' && (
        <div className="space-y-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-sm text-dark-500">Audit trail of all auto-deposit actions</div>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={handleClearOldLogs}
                disabled={clearLogsLoading}
                className="inline-flex items-center justify-center gap-2 rounded bg-red-600 px-3 py-2 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-60 sm:text-sm"
              >
                <Trash2 size={15} />
                {clearLogsLoading ? 'Clearing...' : 'Clear Logs 24h'}
              </button>
            <button
              onClick={loadLogs}
              title="Refresh (R)"
              className="p-2 text-dark-500 hover:text-primary-600 hover:bg-dark-100 rounded-lg transition-colors"
            >
              🔄
            </button>
          </div>
          </div>
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
                    <td className="px-4 py-2 text-xs max-w-xs truncate" title={log.details}>{cleanDisplayText(log.details)}</td>
                    <td className="px-4 py-2 text-xs">{fmt(log.created_at)}</td>
                  </tr>
                ))}
                {logs.length === 0 && (
                  <tr>
                    <td colSpan="8" className="px-4 py-12 text-center">
                      <div className="text-4xl mb-2">📋</div>
                      <div className="text-dark-400 text-sm">No audit logs found</div>
                      <div className="text-dark-300 text-xs mt-1">Logs will appear when actions are taken</div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <Pagination pagination={logPagination} page={logPage} setPage={setLogPage} />
          
          {/* Keyboard shortcuts hint */}
          <div className="text-xs text-dark-400 flex flex-wrap gap-3 pt-2">
            <span>Shortcuts:</span>
            <span><kbd className="px-1 bg-dark-100 rounded">R</kbd> Refresh</span>
            <span><kbd className="px-1 bg-dark-100 rounded">1-6</kbd> Tabs</span>
            <span><kbd className="px-1 bg-dark-100 rounded">Esc</kbd> Close</span>
          </div>
        </div>
      )}

      {/* Unmatched Transactions Tab */}
      {tab === 'unmatched' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm text-dark-500">UPI payments received via Telegram that haven't been matched to any deposit order.</p>
            <button
              onClick={loadUnmatchedTxns}
              title="Refresh (R)"
              className="p-2 text-dark-500 hover:text-primary-600 hover:bg-dark-100 rounded-lg transition-colors"
            >
              🔄
            </button>
          </div>
          <div className="bg-white rounded-lg shadow overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-dark-50 text-dark-600">
                <tr>
                  <th className="px-4 py-2 text-left">ID</th>
                  <th className="px-4 py-2 text-left">Amount</th>
                  <th className="px-4 py-2 text-left">UTR / Reference</th>
                  <th className="px-4 py-2 text-left">Payer</th>
                  <th className="px-4 py-2 text-left">Status</th>
                  <th className="px-4 py-2 text-left">Order Ref</th>
                  <th className="px-4 py-2 text-left">Received</th>
                  <th className="px-4 py-2 text-left">Raw Message</th>
                  <th className="px-4 py-2 text-left">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-dark-100">
                {unmatchedTxns.map((txn) => (
                  <tr key={txn.id} className="hover:bg-dark-50">
                    <td className="px-4 py-2">{txn.id}</td>
                    <td className="px-4 py-2 font-medium">₹{txn.amount ? Number(txn.amount).toLocaleString('en-IN') : '-'}</td>
                    <td className="px-4 py-2 font-mono text-xs">
                      <div className="flex items-center gap-1">
                        <span>{txn.reference_number || '-'}</span>
                        {txn.reference_number && (
                          <button
                            onClick={() => copyToClipboard(txn.reference_number, 'UTR')}
                            className="text-dark-400 hover:text-primary-600"
                            title="Copy UTR"
                          >
                            📋
                          </button>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-2">{txn.payer_name || '-'}</td>
                    <td className="px-4 py-2"><Badge status={txn.status} /></td>
                    <td className="px-4 py-2 font-mono text-xs">{txn.order_ref || '-'}</td>
                    <td className="px-4 py-2 text-xs">{fmt(txn.created_at)}</td>
                    <td className="px-4 py-2 text-xs max-w-[200px]">
                      {txn.raw_message && (
                        <details>
                          <summary className="cursor-pointer text-blue-600 hover:underline">View</summary>
                          <pre className="mt-1 text-xs bg-gray-100 p-2 rounded whitespace-pre-wrap break-all text-gray-800">{txn.raw_message}</pre>
                        </details>
                      )}
                    </td>
                    <td className="px-4 py-2">
                      <button
                        onClick={() => { setCreditModal({ txn }); setCreditUserId(''); }}
                        className="px-2 py-1 text-xs bg-green-600 text-white rounded hover:bg-green-700"
                      >
                        Credit User
                      </button>
                    </td>
                  </tr>
                ))}
                {unmatchedTxns.length === 0 && (
                  <tr>
                    <td colSpan="9" className="px-4 py-12 text-center">
                      <div className="text-4xl mb-2">✅</div>
                      <div className="text-dark-400 text-sm">No unmatched transactions</div>
                      <div className="text-dark-300 text-xs mt-1">All payments have been matched!</div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <Pagination pagination={unmatchedPagination} page={unmatchedPage} setPage={setUnmatchedPage} />
          
          {/* Keyboard shortcuts hint */}
          <div className="text-xs text-dark-400 flex flex-wrap gap-3 pt-2">
            <span>Shortcuts:</span>
            <span><kbd className="px-1 bg-dark-100 rounded">R</kbd> Refresh</span>
            <span><kbd className="px-1 bg-dark-100 rounded">1-6</kbd> Tabs</span>
            <span><kbd className="px-1 bg-dark-100 rounded">Esc</kbd> Close</span>
          </div>
        </div>
      )}

      {/* UTR Search Tab */}
      {tab === 'utr-search' && (
        <div className="space-y-4">
          <div className="flex gap-2">
            <input
              type="text"
              value={utrSearchQuery}
              onChange={(e) => setUtrSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleUtrSearch()}
              placeholder="Enter UTR / reference number (min 6 chars)"
              className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
            <button
              onClick={handleUtrSearch}
              disabled={utrSearchLoading || utrSearchQuery.trim().length < 6}
              className="px-4 py-2 text-sm bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-60"
            >
              {utrSearchLoading ? 'Searching…' : 'Search'}
            </button>
          </div>

          {utrSearchResults && (
            <div className="space-y-4">
              {/* Webhook transactions matching this UTR */}
              <div>
                <h3 className="text-sm font-semibold text-dark-700 mb-2">Webhook Transactions ({utrSearchResults.webhook_transactions?.length || 0})</h3>
                <div className="bg-white rounded-lg shadow overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-dark-50 text-dark-600">
                      <tr>
                        <th className="px-4 py-2 text-left">ID</th>
                        <th className="px-4 py-2 text-left">Amount</th>
                        <th className="px-4 py-2 text-left">Reference</th>
                        <th className="px-4 py-2 text-left">Payer</th>
                        <th className="px-4 py-2 text-left">Status</th>
                        <th className="px-4 py-2 text-left">Order Ref</th>
                        <th className="px-4 py-2 text-left">Time</th>
                        <th className="px-4 py-2 text-left">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-dark-100">
                      {(utrSearchResults.webhook_transactions || []).map((txn) => (
                        <tr key={txn.id} className="hover:bg-dark-50">
                          <td className="px-4 py-2">{txn.id}</td>
                          <td className="px-4 py-2 font-medium">₹{txn.amount ? Number(txn.amount).toLocaleString('en-IN') : '-'}</td>
                          <td className="px-4 py-2 font-mono text-xs">
                            <div className="flex items-center gap-1">
                              <span>{txn.reference_number || '-'}</span>
                              {txn.reference_number && (
                                <button
                                  onClick={() => copyToClipboard(txn.reference_number, 'UTR')}
                                  className="text-dark-400 hover:text-primary-600"
                                  title="Copy UTR"
                                >
                                  📋
                                </button>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-2">{txn.payer_name || '-'}</td>
                          <td className="px-4 py-2"><Badge status={txn.status} /></td>
                          <td className="px-4 py-2 font-mono text-xs">{txn.order_ref || '-'}</td>
                          <td className="px-4 py-2 text-xs">{fmt(txn.created_at)}</td>
                          <td className="px-4 py-2">
                            {txn.status !== 'matched' && (
                              <button
                                onClick={() => { setCreditModal({ txn }); setCreditUserId(''); }}
                                className="px-2 py-1 text-xs bg-green-600 text-white rounded hover:bg-green-700"
                              >
                                Credit User
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                      {(utrSearchResults.webhook_transactions || []).length === 0 && (
                        <tr>
                          <td colSpan="8" className="px-4 py-12 text-center">
                            <div className="text-4xl mb-2">🔍</div>
                            <div className="text-dark-400 text-sm">No webhook transactions found</div>
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Deposits matching this UTR */}
              <div>
                <h3 className="text-sm font-semibold text-dark-700 mb-2">Deposits ({utrSearchResults.deposits?.length || 0})</h3>
                <div className="bg-white rounded-lg shadow overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-dark-50 text-dark-600">
                      <tr>
                        <th className="px-4 py-2 text-left">Deposit ID</th>
                        <th className="px-4 py-2 text-left">User</th>
                        <th className="px-4 py-2 text-left">Amount</th>
                        <th className="px-4 py-2 text-left">UTR</th>
                        <th className="px-4 py-2 text-left">Status</th>
                        <th className="px-4 py-2 text-left">Time</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-dark-100">
                      {(utrSearchResults.deposits || []).map((d) => (
                        <tr key={d.id} className="hover:bg-dark-50">
                          <td className="px-4 py-2">{d.id}</td>
                          <td className="px-4 py-2">{d.username || d.phone || `#${d.user_id}`}</td>
                          <td className="px-4 py-2 font-medium">₹{Number(d.amount).toLocaleString('en-IN')}</td>
                          <td className="px-4 py-2 font-mono text-xs">
                            <div className="flex items-center gap-1">
                              <span>{d.utr_number}</span>
                              <button
                                onClick={() => copyToClipboard(d.utr_number, 'UTR')}
                                className="text-dark-400 hover:text-primary-600"
                                title="Copy UTR"
                              >
                                📋
                              </button>
                            </div>
                          </td>
                          <td className="px-4 py-2"><Badge status={d.status} /></td>
                          <td className="px-4 py-2 text-xs">{fmt(d.created_at)}</td>
                        </tr>
                      ))}
                      {(utrSearchResults.deposits || []).length === 0 && (
                        <tr>
                          <td colSpan="6" className="px-4 py-12 text-center">
                            <div className="text-4xl mb-2">💰</div>
                            <div className="text-dark-400 text-sm">No deposits found for this UTR</div>
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
          
          {/* Keyboard shortcuts hint */}
          <div className="text-xs text-dark-400 flex flex-wrap gap-3 pt-2">
            <span>Shortcuts:</span>
            <span><kbd className="px-1 bg-dark-100 rounded">Enter</kbd> Search</span>
            <span><kbd className="px-1 bg-dark-100 rounded">1-6</kbd> Tabs</span>
            <span><kbd className="px-1 bg-dark-100 rounded">Esc</kbd> Close</span>
          </div>
        </div>
      )}

      {/* Cancel / Credit confirmation modal */}
      {actionModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-sm mx-4">
            {actionModal.type === 'cancel' ? (
              <>
                <h2 className="text-lg font-bold text-gray-900 mb-2">Cancel Order #{actionModal.order.id}?</h2>
                <p className="text-sm text-gray-600 mb-4">
                  This will cancel the pending ₹{Number(actionModal.order.amount).toLocaleString('en-IN')} deposit order for <strong>{actionModal.order.user_name}</strong>. The user will need to create a new order.
                </p>
                <div className="flex gap-3">
                  <button onClick={() => setActionModal(null)} className="flex-1 px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">Back</button>
                  <button onClick={handleAdminCancel} disabled={actionLoading} className="flex-1 px-4 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-60">
                    {actionLoading ? 'Cancelling…' : 'Yes, Cancel'}
                  </button>
                </div>
              </>
            ) : (
              <>
                <h2 className="text-lg font-bold text-gray-900 mb-2">Manual Credit — Order #{actionModal.order.id}</h2>
                <p className="text-sm text-gray-600 mb-3">
                  Manually credit ₹{Number(actionModal.order.amount).toLocaleString('en-IN')} to <strong>{actionModal.order.user_name}</strong> ({actionModal.order.user_phone}).
                </p>
                <label className="block text-sm font-semibold text-gray-700 mb-1">UTR / Reference Number <span className="text-red-500">*</span></label>
                <input
                  type="text"
                  value={utrInput}
                  onChange={(e) => setUtrInput(e.target.value)}
                  placeholder="e.g. 412345678901"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm mb-4 focus:outline-none focus:ring-2 focus:ring-green-500"
                />
                <div className="flex gap-3">
                  <button onClick={() => setActionModal(null)} className="flex-1 px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">Back</button>
                  <button onClick={handleAdminCredit} disabled={actionLoading || !utrInput.trim()} className="flex-1 px-4 py-2 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-60">
                    {actionLoading ? 'Crediting…' : 'Credit Wallet'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Credit by UTR modal (for unmatched transactions) */}
      {creditModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-sm mx-4">
            <h2 className="text-lg font-bold text-gray-900 mb-2">Credit Unmatched Payment</h2>
            <div className="text-sm text-gray-600 mb-3 space-y-1">
              <p>Amount: <strong>₹{Number(creditModal.txn.amount).toLocaleString('en-IN')}</strong></p>
              <p>UTR: <span className="font-mono">{creditModal.txn.reference_number || '-'}</span></p>
              <p>Payer: {creditModal.txn.payer_name || '-'}</p>
            </div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">User ID <span className="text-red-500">*</span></label>
            <input
              type="number"
              value={creditUserId}
              onChange={(e) => setCreditUserId(e.target.value)}
              placeholder="Enter user ID to credit"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm mb-4 focus:outline-none focus:ring-2 focus:ring-green-500"
            />
            <div className="flex gap-3">
              <button onClick={() => setCreditModal(null)} className="flex-1 px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">Cancel</button>
              <button onClick={handleCreditByUtr} disabled={creditLoading || !creditUserId.trim()} className="flex-1 px-4 py-2 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-60">
                {creditLoading ? 'Crediting…' : 'Credit Wallet'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Raw SMS modal */}
      {rawSmsModal && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4">
          <div className="flex max-h-[92vh] w-full flex-col rounded-t-xl bg-white shadow-xl sm:max-w-2xl sm:rounded-xl">
            <div className="flex items-start justify-between gap-3 border-b border-gray-200 px-4 py-3 sm:px-5">
              <div className="min-w-0">
                <h2 className="text-base font-bold text-gray-900 sm:text-lg">Raw SMS #{rawSmsModal.id}</h2>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-gray-500">
                  <span>{fmt(rawSmsModal.created_at)}</span>
                  <Badge status={rawSmsModal.status} />
                </div>
              </div>
              <button
                onClick={() => setRawSmsModal(null)}
                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-800"
                title="Close"
              >
                <X size={18} />
              </button>
            </div>

            <div className="overflow-y-auto px-4 py-4 sm:px-5">
              <div className="grid gap-3 text-sm sm:grid-cols-2">
                <div>
                  <div className="text-xs font-medium uppercase text-gray-500">Amount</div>
                  <div className="mt-1 font-semibold text-gray-900">₹{rawSmsModal.amount ? Number(rawSmsModal.amount).toLocaleString('en-IN') : '-'}</div>
                </div>
                <div>
                  <div className="text-xs font-medium uppercase text-gray-500">Reference</div>
                  <div className="mt-1 break-all font-mono text-xs text-gray-900">{rawSmsModal.reference_number || '-'}</div>
                </div>
                <div>
                  <div className="text-xs font-medium uppercase text-gray-500">Payer</div>
                  <div className="mt-1 text-gray-900">{rawSmsModal.payer_name || '-'}</div>
                </div>
                <div>
                  <div className="text-xs font-medium uppercase text-gray-500">Matched User</div>
                  <div className="mt-1 text-gray-900">{rawSmsModal.matched_user_name ? `${rawSmsModal.matched_user_name} (${rawSmsModal.matched_user_phone})` : '-'}</div>
                </div>
              </div>

              {rawSmsModal.error_message && (
                <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                  {rawSmsModal.error_message}
                </div>
              )}

              <pre className="mt-4 max-h-[42vh] overflow-auto whitespace-pre-wrap break-words rounded-lg border border-gray-200 bg-gray-50 p-3 font-mono text-sm leading-6 text-gray-900">{rawSmsModal.raw_message}</pre>
            </div>

            <div className="flex flex-col-reverse gap-2 border-t border-gray-200 px-4 py-3 sm:flex-row sm:justify-end sm:px-5">
              <button
                onClick={() => setRawSmsModal(null)}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Close
              </button>
              <button
                onClick={() => copyToClipboard(rawSmsModal.raw_message || '', 'Raw SMS')}
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700"
              >
                <Copy size={16} />
                Copy SMS
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Order Details Modal */}
      {orderDetailsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold text-gray-900">Order #{orderDetailsModal.id}</h2>
                <button onClick={() => setOrderDetailsModal(null)} className="text-dark-400 hover:text-dark-600 text-2xl">&times;</button>
              </div>
              
              <div className="space-y-4">
                {/* Status badge */}
                <div className="flex items-center gap-2">
                  <Badge status={orderDetailsModal.status} />
                  {isNearExpiry(orderDetailsModal.expires_at, orderDetailsModal.status) && (
                    <span className="text-xs text-red-600 font-medium">⚠️ Expires soon!</span>
                  )}
                </div>

                {/* User info */}
                <div className="bg-dark-50 rounded-lg p-4">
                  <h3 className="text-sm font-semibold text-dark-700 mb-2">User Information</h3>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div className="text-dark-500">Name:</div>
                    <div className="font-medium">{orderDetailsModal.user_name}</div>
                    <div className="text-dark-500">Phone:</div>
                    <div className="font-medium">{orderDetailsModal.user_phone}</div>
                  </div>
                </div>

                {/* Amount info */}
                <div className="bg-dark-50 rounded-lg p-4">
                  <h3 className="text-sm font-semibold text-dark-700 mb-2">Amount Details</h3>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div className="text-dark-500">Base Amount:</div>
                    <div className="font-medium">₹{Number(orderDetailsModal.amount).toLocaleString('en-IN')}</div>
                    {orderDetailsModal.pay_amount && orderDetailsModal.pay_amount !== orderDetailsModal.amount && (
                      <>
                        <div className="text-dark-500">QR Amount:</div>
                        <div className="font-medium text-primary-600">₹{Number(orderDetailsModal.pay_amount).toLocaleString('en-IN')}</div>
                      </>
                    )}
                  </div>
                </div>

                {/* Timeline */}
                <div className="bg-dark-50 rounded-lg p-4">
                  <h3 className="text-sm font-semibold text-dark-700 mb-2">Order Timeline</h3>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-dark-500">Created:</span>
                      <span>{fmt(orderDetailsModal.created_at)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-dark-500">Expires:</span>
                      <span>{fmt(orderDetailsModal.expires_at)}</span>
                    </div>
                    {orderDetailsModal.matched_deposit_id && (
                      <div className="flex justify-between">
                        <span className="text-dark-500">Deposit ID:</span>
                        <span className="font-mono">#{orderDetailsModal.matched_deposit_id}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Time remaining for pending orders */}
                {orderDetailsModal.status === 'pending' && (
                  <div className={`rounded-lg p-3 text-center ${isNearExpiry(orderDetailsModal.expires_at, orderDetailsModal.status) ? 'bg-red-100 text-red-800' : 'bg-blue-50 text-blue-800'}`}>
                    {isExpired(orderDetailsModal.expires_at) ? (
                      <span className="font-medium">Order has expired</span>
                    ) : (
                      <span className="font-medium">Expires in {fmtTimeAgo(orderDetailsModal.expires_at)}</span>
                    )}
                  </div>
                )}

                {/* Actions */}
                {(orderDetailsModal.status === 'pending' || orderDetailsModal.status === 'expired') && (
                  <div className="flex gap-3 pt-2">
                    <button
                      onClick={() => { setOrderDetailsModal(null); setActionModal({ type: 'credit', order: orderDetailsModal }); setUtrInput(''); }}
                      className="flex-1 px-4 py-2 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700"
                    >
                      Credit Order
                    </button>
                    {orderDetailsModal.status === 'pending' && (
                      <button
                        onClick={() => { setOrderDetailsModal(null); setActionModal({ type: 'cancel', order: orderDetailsModal }); }}
                        className="flex-1 px-4 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700"
                      >
                        Cancel Order
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Pagination({ pagination, page, setPage }) {
  if (!pagination || !pagination.totalPages || pagination.totalPages <= 1) return null;

  return (
    <div className="flex flex-col sm:flex-row items-center justify-between gap-2 text-sm text-dark-500">
      <span className="text-xs sm:text-sm">Page {page} of {pagination.totalPages} ({pagination.total} total)</span>
      <div className="flex gap-2">
        <button
          onClick={() => setPage((p) => Math.max(1, p - 1))}
          disabled={page <= 1}
          className="px-3 py-1.5 text-sm bg-dark-100 rounded disabled:opacity-40 hover:bg-dark-200"
        >
          ← Prev
        </button>
        <button
          onClick={() => setPage((p) => Math.min(pagination.totalPages, p + 1))}
          disabled={page >= pagination.totalPages}
          className="px-3 py-1.5 text-sm bg-dark-100 rounded disabled:opacity-40 hover:bg-dark-200"
        >
          Next →
        </button>
      </div>
    </div>
  );
}

