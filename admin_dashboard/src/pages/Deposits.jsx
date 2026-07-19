import { useState, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import api from '../utils/api';
import { useAuth } from '../context/AuthContext';
import SavedFilterPresets from '../components/SavedFilterPresets';

// Skeleton components
function DepositCardSkeleton() {
  return (
    <div className="bg-white border rounded-lg p-4 animate-pulse">
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1">
          <div className="h-4 bg-gray-200 rounded w-24 mb-2"></div>
          <div className="h-3 bg-gray-200 rounded w-32"></div>
        </div>
        <div className="h-6 bg-gray-200 rounded w-20"></div>
      </div>
      <div className="grid grid-cols-2 gap-2 mb-3">
        <div className="h-3 bg-gray-200 rounded"></div>
        <div className="h-3 bg-gray-200 rounded"></div>
      </div>
      <div className="h-4 bg-gray-200 rounded w-full"></div>
    </div>
  );
}

function TableRowSkeleton() {
  return (
    <tr className="animate-pulse">
      <td className="px-4 py-3"><div className="h-3 bg-gray-200 rounded w-12"></div></td>
      <td className="px-4 py-3"><div className="h-3 bg-gray-200 rounded w-16"></div></td>
      <td className="px-4 py-3"><div className="h-3 bg-gray-200 rounded w-16"></div></td>
      <td className="px-4 py-3"><div className="h-3 bg-gray-200 rounded w-20"></div></td>
      <td className="px-4 py-3"><div className="h-3 bg-gray-200 rounded w-20"></div></td>
      <td className="px-4 py-3"><div className="h-3 bg-gray-200 rounded w-16 ml-auto"></div></td>
      <td className="px-4 py-3"><div className="h-3 bg-gray-200 rounded w-20"></div></td>
      <td className="px-4 py-3"><div className="h-3 bg-gray-200 rounded w-16"></div></td>
      <td className="px-4 py-3"><div className="h-5 bg-gray-200 rounded w-16 mx-auto"></div></td>
      <td className="px-4 py-3"><div className="h-3 bg-gray-200 rounded w-24"></div></td>
    </tr>
  );
}

// Status badge component
function StatusBadge({ status }) {
  const statusStyles = {
    completed: 'bg-green-100 text-green-700',
    pending: 'bg-yellow-100 text-yellow-700',
    failed: 'bg-red-100 text-red-700',
    cancelled: 'bg-gray-100 text-gray-700',
  };
  
  const statusIcons = {
    completed: '✓',
    pending: '⏳',
    failed: '✗',
    cancelled: '⊘',
  };
  
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-full ${statusStyles[status] || statusStyles.pending}`}>
      {statusIcons[status] || '•'} {status}
    </span>
  );
}

// Mobile Deposit Card Component
function DepositCard({ d, isAdmin, formatCurrency }) {
  return (
    <div className="bg-white border rounded-lg p-3 sm:p-4 hover:shadow-md transition-shadow">
      {/* Header */}
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="font-mono text-sm font-medium text-gray-600">#{d.id}</span>
            {d.order_id && <span className="text-xs text-gray-400">Order #{d.order_id}</span>}
          </div>
          <Link to={`/users/${d.user_id}`} className="font-semibold text-gray-800 hover:text-blue-600 truncate block">
            {d.user_name}
          </Link>
          <p className="text-sm text-gray-500">{d.user_phone}</p>
        </div>
        <StatusBadge status={d.status} />
      </div>

      {/* Amount */}
      <div className="bg-green-50 border border-green-100 rounded-lg p-3 mb-3">
        <p className="text-xs text-green-600 mb-0.5">Amount</p>
        <p className="text-xl font-bold text-green-700">{formatCurrency(d.amount)}</p>
      </div>

      {/* Details Grid */}
      <div className="grid grid-cols-2 gap-2 text-sm mb-3">
        <div>
          <p className="text-xs text-gray-500">UTR Number</p>
          <p className="font-mono text-gray-700 truncate">{d.utr_number || '-'}</p>
        </div>
        <div>
          <p className="text-xs text-gray-500">Payer</p>
          <p className="text-gray-700 truncate">{d.payer_name || '-'}</p>
        </div>
        {d.webhook_txn_id && (
          <div className="col-span-2">
            <p className="text-xs text-gray-500">Webhook TXN</p>
            <p className="font-mono text-xs text-gray-600">#{d.webhook_txn_id}</p>
          </div>
        )}
        {isAdmin && d.moderator_id && (
          <div className="col-span-2">
            <p className="text-xs text-gray-500">Moderator</p>
            <p className="text-gray-700">{d.moderator_name || `Mod #${d.moderator_id}`}</p>
          </div>
        )}
      </div>

      {/* Date */}
      <div className="flex items-center gap-1.5 text-xs text-gray-500 pt-2 border-t">
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
        {new Date(d.created_at).toLocaleString('en-IN', { 
          timeZone: 'Asia/Kolkata',
          month: 'short',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        })}
      </div>
    </div>
  );
}

function getDepositFiltersFromSearchParams(searchParams) {
  return {
    search: searchParams.get('search') || '',
    status: searchParams.get('status') || '',
    moderator_id: searchParams.get('moderator_id') || '',
    from_date: searchParams.get('from_date') || '',
    to_date: searchParams.get('to_date') || '',
  };
}

function formatCurrency(amount) {
  return `₹${Number(amount || 0).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export default function Deposits() {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const isAdmin = user?.role === 'admin';
  const [deposits, setDeposits] = useState([]);
  const [moderators, setModerators] = useState([]);
  const [pagination, setPagination] = useState({});
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filters, setFilters] = useState(() => getDepositFiltersFromSearchParams(searchParams));

  useEffect(() => {
    const nextFilters = getDepositFiltersFromSearchParams(searchParams);
    setFilters((current) => JSON.stringify(current) === JSON.stringify(nextFilters) ? current : nextFilters);
    setPage(1);
  }, [searchParams]);

  // Define loadDeposits before useEffects that reference it
  const loadDeposits = async () => {
    setLoading(true);
    setError('');
    try {
      const params = { page, limit: 20 };
      if (filters.search.trim()) params.search = filters.search.trim();
      if (filters.status) params.status = filters.status;
      if (isAdmin && filters.moderator_id) params.moderator_id = filters.moderator_id;
      if (filters.from_date) params.from_date = filters.from_date;
      if (filters.to_date) params.to_date = filters.to_date;

      const res = await api.get('/deposits/all', { params });
      setDeposits(Array.isArray(res.data.deposits) ? res.data.deposits : []);
      setPagination(res.data.pagination || {});
    } catch (err) {
      setError('Failed to load deposits.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!isAdmin) return;

    api.get('/moderators')
      .then((res) => setModerators(Array.isArray(res.data.moderators) ? res.data.moderators : []))
      .catch(console.error);
  }, [isAdmin]);

  useEffect(() => { loadDeposits(); }, [page, filters.search, filters.status, filters.moderator_id, filters.from_date, filters.to_date]);

  const updateFilter = (key, value) => {
    setPage(1);
    setFilters((current) => ({ ...current, [key]: value }));
  };

  const clearFilters = () => {
    setPage(1);
    setFilters({
      search: '',
      status: '',
      moderator_id: '',
      from_date: '',
      to_date: '',
    });
  };

  // Calculate stats
  const totalAmount = deposits.reduce((sum, d) => sum + (parseFloat(d.amount) || 0), 0);
  const completedCount = deposits.filter(d => d.status === 'completed').length;
  const pendingCount = deposits.filter(d => d.status === 'pending').length;

  return (
    <div className="space-y-4">
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg text-red-700 px-4 py-3 text-sm flex items-center gap-2">
          <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          {error}
        </div>
      )}

      {/* Header Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
        <div className="bg-white border rounded-lg p-3">
          <p className="text-xs text-gray-500">Total Deposits</p>
          <p className="text-lg sm:text-xl font-bold text-gray-800">{pagination.total || deposits.length}</p>
        </div>
        <div className="bg-green-50 border border-green-200 rounded-lg p-3">
          <p className="text-xs text-green-600">Total Amount</p>
          <p className="text-lg sm:text-xl font-bold text-green-700">{formatCurrency(totalAmount)}</p>
        </div>
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
          <p className="text-xs text-blue-600">Completed</p>
          <p className="text-lg sm:text-xl font-bold text-blue-700">{completedCount}</p>
        </div>
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
          <p className="text-xs text-yellow-600">Pending</p>
          <p className="text-lg sm:text-xl font-bold text-yellow-700">{pendingCount}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white border rounded-lg p-3 sm:p-4 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
          <div>
            <h3 className="text-lg sm:text-xl font-semibold text-gray-800">Deposits</h3>
            <p className="text-sm text-gray-500 mt-0.5 hidden sm:block">
              Search deposit credits by user, UTR, payer, date range, and moderator.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-2 sm:gap-3">
          <div className="relative sm:col-span-2">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              placeholder="Search user, phone, UTR, payer, order..."
              value={filters.search}
              onChange={(event) => updateFilter('search', event.target.value)}
              className="w-full pl-10 pr-4 py-2.5 border rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none transition-all"
            />
          </div>
          
          <select
            value={filters.status}
            onChange={(event) => updateFilter('status', event.target.value)}
            className="w-full px-3 py-2.5 border rounded-lg bg-white text-sm focus:ring-2 focus:ring-primary-500 outline-none transition-all"
          >
            <option value="">All Status</option>
            <option value="completed">✓ Completed</option>
            <option value="pending">⏳ Pending</option>
            <option value="failed">✗ Failed</option>
            <option value="cancelled">⊘ Cancelled</option>
          </select>
          
          {isAdmin && (
            <select
              value={filters.moderator_id}
              onChange={(event) => updateFilter('moderator_id', event.target.value)}
              className="w-full px-3 py-2.5 border rounded-lg bg-white text-sm focus:ring-2 focus:ring-primary-500 outline-none transition-all"
            >
              <option value="">All Moderators</option>
              {moderators.map((moderator) => (
                <option key={moderator.id} value={String(moderator.id)}>{moderator.name}</option>
              ))}
            </select>
          )}
          
          <input
            type="date"
            value={filters.from_date}
            onChange={(event) => updateFilter('from_date', event.target.value)}
            className="w-full px-3 py-2.5 border rounded-lg text-sm focus:ring-2 focus:ring-primary-500 outline-none transition-all"
            placeholder="From Date"
          />
          
          <div className="flex gap-2">
            <input
              type="date"
              value={filters.to_date}
              onChange={(event) => updateFilter('to_date', event.target.value)}
              className="w-full px-3 py-2.5 border rounded-lg text-sm focus:ring-2 focus:ring-primary-500 outline-none transition-all"
              placeholder="To Date"
            />
            <button
              type="button"
              onClick={clearFilters}
              className="px-4 py-2.5 border rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors flex items-center gap-1"
              title="Clear filters"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
              <span className="hidden sm:inline">Clear</span>
            </button>
          </div>
        </div>

        <SavedFilterPresets
          storageKey="deposits"
          currentFilters={filters}
          onApply={(nextFilters) => {
            setPage(1);
            setFilters((current) => ({ ...current, ...nextFilters }));
          }}
        />
      </div>

      {/* Mobile Card View */}
      <div className="lg:hidden space-y-3">
        {loading ? (
          <>
            <DepositCardSkeleton />
            <DepositCardSkeleton />
            <DepositCardSkeleton />
          </>
        ) : deposits.length === 0 ? (
          <div className="bg-white border rounded-lg p-8 text-center">
            <div className="text-4xl mb-3">💰</div>
            <p className="text-gray-500 mb-2">No deposits found</p>
            <p className="text-sm text-gray-400">Try adjusting your search or filters</p>
          </div>
        ) : (
          deposits.map((d) => (
            <DepositCard key={d.id} d={d} isAdmin={isAdmin} formatCurrency={formatCurrency} />
          ))
        )}
      </div>

      {/* Desktop Table View */}
      <div className="hidden lg:block bg-white border rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Deposit</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Order/Webhook</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">User</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">Amount</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">UTR / Payer</th>
                <th className="text-center px-4 py-3 font-medium text-gray-600">Status</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <>
                  <TableRowSkeleton />
                  <TableRowSkeleton />
                  <TableRowSkeleton />
                  <TableRowSkeleton />
                  <TableRowSkeleton />
                </>
              ) : deposits.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center">
                    <div className="text-4xl mb-3">💰</div>
                    <p className="text-gray-500">No deposits found</p>
                  </td>
                </tr>
              ) : (
                deposits.map((d) => (
                  <tr key={d.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3">
                      <span className="font-mono font-medium text-gray-700">#{d.id}</span>
                    </td>
                    <td className="px-4 py-3">
                      {d.order_id && <div className="text-xs text-gray-500">Order #{d.order_id}</div>}
                      {d.webhook_txn_id && <div className="text-xs text-gray-400 font-mono">Webhook #{d.webhook_txn_id}</div>}
                      {!d.order_id && !d.webhook_txn_id && <span className="text-gray-400">-</span>}
                    </td>
                    <td className="px-4 py-3">
                      <Link to={`/users/${d.user_id}`} className="text-blue-600 hover:underline font-medium">{d.user_name}</Link>
                      <div className="text-xs text-gray-500">{d.user_phone}</div>
                      {isAdmin && d.moderator_id && (
                        <div className="text-xs text-gray-400 mt-1">Mod: {d.moderator_name || `#${d.moderator_id}`}</div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className="font-semibold text-green-700">{formatCurrency(d.amount)}</span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-mono text-xs text-gray-700">{d.utr_number || '-'}</div>
                      <div className="text-xs text-gray-500">{d.payer_name || '-'}</div>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <StatusBadge status={d.status} />
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs">
                      {new Date(d.created_at).toLocaleString('en-IN', { 
                        timeZone: 'Asia/Kolkata',
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit'
                      })}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination */}
      {pagination.totalPages > 1 && (
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-white border rounded-lg p-3 sm:p-4">
          <div className="text-sm text-gray-500">
            Showing <span className="font-medium text-gray-800">{((page - 1) * 20) + 1}</span> to <span className="font-medium text-gray-800">{Math.min(page * 20, pagination.total)}</span> of <span className="font-medium text-gray-800">{pagination.total}</span> deposits
          </div>
          <div className="flex items-center gap-2">
            <button 
              disabled={page <= 1} 
              onClick={() => setPage(page - 1)}
              className="px-3 py-2 text-sm font-medium bg-white border rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-1"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              Previous
            </button>
            
            <div className="flex items-center gap-1">
              {Array.from({ length: Math.min(5, pagination.totalPages) }, (_, i) => {
                const pageNum = i + 1;
                return (
                  <button
                    key={pageNum}
                    onClick={() => setPage(pageNum)}
                    className={`w-8 h-8 text-sm font-medium rounded-lg transition-colors ${
                      page === pageNum 
                        ? 'bg-primary-600 text-white' 
                        : 'bg-white border hover:bg-gray-50 text-gray-700'
                    }`}
                  >
                    {pageNum}
                  </button>
                );
              })}
              {pagination.totalPages > 5 && <span className="px-2 text-gray-400">...</span>}
            </div>
            
            <button 
              disabled={page >= pagination.totalPages} 
              onClick={() => setPage(page + 1)}
              className="px-3 py-2 text-sm font-medium bg-white border rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-1"
            >
              Next
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

