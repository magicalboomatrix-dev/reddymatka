import { useState, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import api, { buildUploadUrl } from '../utils/api';
import { useToast, ToastContainer, useConfirm, ConfirmModal } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import SavedFilterPresets from '../components/SavedFilterPresets';

function getWithdrawalFiltersFromSearchParams(searchParams) {
  return {
    status: searchParams.get('status') || 'pending',
    search: searchParams.get('search') || '',
    method: searchParams.get('method') || '',
    moderator_id: searchParams.get('moderator_id') || '',
    from_date: searchParams.get('from_date') || '',
    to_date: searchParams.get('to_date') || '',
  };
}

export default function Withdrawals() {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const isAdmin = user?.role === 'admin';
  const [withdrawals, setWithdrawals] = useState([]);
  const [moderators, setModerators] = useState([]);
  const [pagination, setPagination] = useState({});
  const [filter, setFilter] = useState(() => getWithdrawalFiltersFromSearchParams(searchParams).status);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [previewImage, setPreviewImage] = useState(null);
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState(() => {
    const next = getWithdrawalFiltersFromSearchParams(searchParams);
    return {
      search: next.search,
      method: next.method,
      moderator_id: next.moderator_id,
      from_date: next.from_date,
      to_date: next.to_date,
    };
  });

  useEffect(() => {
    const next = getWithdrawalFiltersFromSearchParams(searchParams);
    setFilter(next.status);
    setFilters((current) => {
      const nextFilters = {
        search: next.search,
        method: next.method,
        moderator_id: next.moderator_id,
        from_date: next.from_date,
        to_date: next.to_date,
      };
      return JSON.stringify(current) === JSON.stringify(nextFilters) ? current : nextFilters;
    });
    setPage(1);
  }, [searchParams]);
  const { toasts, success, error: toastError, dismiss } = useToast();
  const { confirmState, confirm, handleConfirm, handleCancel } = useConfirm();
  const [rejectModal, setRejectModal] = useState({ open: false, id: null, reason: '' });

  // Define loadData before useEffect that references it
  const loadData = async () => {
    setLoading(true);
    try {
      const params = { status: filter, page, limit: 15 };
      if (filters.search.trim()) params.search = filters.search.trim();
      if (filters.method) params.method = filters.method;
      if (isAdmin && filters.moderator_id) params.moderator_id = filters.moderator_id;
      if (filters.from_date) params.from_date = filters.from_date;
      if (filters.to_date) params.to_date = filters.to_date;

      const res = await api.get('/withdraw/all', { params });
      setWithdrawals(Array.isArray(res.data.withdrawals) ? res.data.withdrawals : []);
      setPagination(res.data.pagination || {});
    } catch (err) {
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

  useEffect(() => { loadData(); }, [page, filter, filters.search, filters.method, filters.moderator_id, filters.from_date, filters.to_date]);

  const approve = async (id) => {
    const confirmed = await confirm({
      title: 'Approve Withdrawal',
      message: 'Approve this withdrawal?',
      confirmText: 'Approve',
      variant: 'primary',
    });
    if (!confirmed) return;
    try {
      await api.put(`/withdraw/${id}/approve`);
      loadData();
      success('Withdrawal approved.');
    } catch (err) {
      toastError(err.response?.data?.error || 'Failed');
    }
  };

  const reject = async (id) => {
    setRejectModal({ open: true, id, reason: '' });
  };

  const submitReject = async () => {
    const { id, reason } = rejectModal;
    if (!reason.trim()) return;
    setRejectModal({ open: false, id: null, reason: '' });
    try {
      await api.put(`/withdraw/${id}/reject`, { reason });
      loadData();
      success('Withdrawal rejected.');
    } catch (err) {
      toastError(err.response?.data?.error || 'Failed');
    }
  };

  const updateFilter = (key, value) => {
    setPage(1);
    setFilters((current) => ({ ...current, [key]: value }));
  };

  const clearFilters = () => {
    setPage(1);
    setFilters({
      search: '',
      method: '',
      moderator_id: '',
      from_date: '',
      to_date: '',
    });
  };

  return (
    <div className="space-y-4">
      <ToastContainer toasts={toasts} dismiss={dismiss} />
      <ConfirmModal state={confirmState} onConfirm={handleConfirm} onCancel={handleCancel} />

      {/* Image Preview Modal */}
      {previewImage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-70 p-4" onClick={() => setPreviewImage(null)}>
          <div className="relative max-w-full max-h-full">
            <button
              onClick={() => setPreviewImage(null)}
              className="absolute -top-10 right-0 text-white hover:text-gray-300 text-3xl font-bold p-2"
            >
              &times;
            </button>
            <img src={previewImage} alt="Scanner QR" className="max-w-full max-h-[80vh] object-contain rounded bg-white" onClick={e => e.stopPropagation()} />
          </div>
        </div>
      )}

      {/* Rejection reason modal */}
      {rejectModal.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
          <div className="bg-white w-full max-w-sm mx-4 p-6 space-y-4">
            <h3 className="text-base font-semibold text-gray-800">Reject Withdrawal</h3>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Rejection Reason</label>
              <textarea
                className="w-full border border-gray-300 px-3 py-2 text-sm resize-none"
                rows={3}
                placeholder="Enter rejection reason�"
                value={rejectModal.reason}
                onChange={(e) => setRejectModal((m) => ({ ...m, reason: e.target.value }))}
              />
            </div>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setRejectModal({ open: false, id: null, reason: '' })}
                className="px-4 py-2 text-sm border text-gray-600 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={submitReject}
                disabled={!rejectModal.reason.trim()}
                className="px-4 py-2 text-sm bg-red-600 text-white hover:bg-red-700 disabled:opacity-50"
              >
                Reject
              </button>
            </div>
          </div>
        </div>
      )}
      <div className="flex gap-2">
        {['pending', 'approved', 'rejected'].map((s) => (
          <button key={s} onClick={() => { setFilter(s); setPage(1); }}
            className={`px-4 py-2 text-sm font-medium capitalize ${filter === s ? 'bg-primary-600 text-white' : 'bg-white border text-gray-600 hover:bg-gray-50'}`}>
            {s}
          </button>
        ))}
      </div>

      <div className="bg-white border p-4 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
          <div>
            <h3 className="text-xl font-semibold text-gray-800">Withdrawals</h3>
            <p className="text-sm text-gray-500 mt-1 hidden md:block">
              Filter withdrawal requests by user, payment details, date range, method, and moderator assignment.
            </p>
          </div>
          <div className="flex items-center justify-between lg:justify-end gap-4 w-full lg:w-auto">
            <div className="text-sm text-gray-500 font-medium">
              Total: {pagination.total || 0}
            </div>
            <button
              onClick={() => setShowFilters(!showFilters)}
              className="lg:hidden px-3 py-1.5 border border-gray-300 rounded text-sm text-gray-700 bg-gray-50"
            >
              {showFilters ? 'Hide Filters' : 'Show Filters'}
            </button>
          </div>
        </div>

        <div className={`${showFilters ? 'block' : 'hidden'} lg:block space-y-4 pt-2`}>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-3">
          <input
            type="text"
            placeholder="Search user, phone, bank, UPI, request id..."
            value={filters.search}
            onChange={(event) => updateFilter('search', event.target.value)}
            className="w-full px-3 py-2 border text-sm focus:ring-2 focus:ring-primary-500 outline-none"
          />
          <select
            value={filters.method}
            onChange={(event) => updateFilter('method', event.target.value)}
            className="w-full px-3 py-2 border bg-white text-sm focus:ring-2 focus:ring-primary-500 outline-none"
          >
            <option value="">All Methods</option>
            <option value="bank">Bank</option>
            <option value="upi">UPI</option>
            <option value="phone">Phone</option>
            <option value="scanner">Scanner</option>
          </select>
          {isAdmin ? (
            <select
              value={filters.moderator_id}
              onChange={(event) => updateFilter('moderator_id', event.target.value)}
              className="w-full px-3 py-2 border bg-white text-sm focus:ring-2 focus:ring-primary-500 outline-none"
            >
              <option value="">All Moderators</option>
              {moderators.map((moderator) => (
                <option key={moderator.id} value={String(moderator.id)}>{moderator.name}</option>
              ))}
            </select>
          ) : null}
          <input
            type="date"
            value={filters.from_date}
            onChange={(event) => updateFilter('from_date', event.target.value)}
            className="w-full px-3 py-2 border text-sm focus:ring-2 focus:ring-primary-500 outline-none"
          />
          <div className="flex gap-3">
            <input
              type="date"
              value={filters.to_date}
              onChange={(event) => updateFilter('to_date', event.target.value)}
              className="w-full px-3 py-2 border text-sm focus:ring-2 focus:ring-primary-500 outline-none"
            />
            <button
              type="button"
              onClick={clearFilters}
              className="px-4 py-2 border text-sm font-medium text-gray-600 hover:bg-gray-50"
            >
              Clear
            </button>
          </div>
        </div>

        <SavedFilterPresets
          storageKey="withdrawals"
          currentFilters={{ status: filter, ...filters }}
          onApply={(nextFilters) => {
            setPage(1);
            setFilter(nextFilters.status || 'pending');
            setFilters((current) => ({
              ...current,
              search: nextFilters.search || '',
              method: nextFilters.method || '',
              moderator_id: nextFilters.moderator_id || '',
              from_date: nextFilters.from_date || '',
              to_date: nextFilters.to_date || '',
            }));
          }}
        />
        </div>
      </div>

      <div className="bg-white border overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="text-left px-4 py-3 font-medium text-gray-600">ID</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">User</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Phone</th>
              <th className="text-right px-4 py-3 font-medium text-gray-600">Amount</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Method</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Payment Info</th>
              <th className="text-center px-4 py-3 font-medium text-gray-600">Flagged</th>
              <th className="text-center px-4 py-3 font-medium text-gray-600">Status</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Date</th>
              {filter === 'pending' && <th className="text-center px-4 py-3 font-medium text-gray-600">Actions</th>}
            </tr>
          </thead>
          <tbody className="divide-y">
            {withdrawals.map((w) => {
              const method = w.withdraw_method || 'bank';
              const isBankFlagged = method === 'bank' && w.is_flagged;
              let paymentInfo = null;
              let methodBadge = null;
              if (method === 'upi') {
                methodBadge = <span className="px-2 py-0.5 bg-purple-100 text-purple-700 text-xs font-medium">UPI</span>;
                paymentInfo = <span className="font-mono text-xs">{w.upi_id || '-'}</span>;
              } else if (method === 'phone') {
                methodBadge = <span className="px-2 py-0.5 bg-blue-100 text-blue-700 text-xs font-medium">Phone</span>;
                paymentInfo = <span className="font-mono text-xs">{w.phone_number || '-'}</span>;
              } else if (method === 'scanner') {
                methodBadge = <span className="px-2 py-0.5 bg-teal-100 text-teal-700 text-xs font-medium">Scanner</span>;
                paymentInfo = w.scanner_image ? (
                  <button onClick={() => setPreviewImage(buildUploadUrl(w.scanner_image))} className="text-blue-600 hover:underline text-xs">View Image</button>
                ) : <span className="text-gray-500 text-xs">-</span>;
              } else {
                methodBadge = <span className="px-2 py-0.5 bg-gray-100 text-gray-700 text-xs font-medium">Bank</span>;
                paymentInfo = (
                  <div className="text-xs leading-5">
                    <div className="font-medium text-gray-800">{w.bank_name || '-'}</div>
                    <div className="text-gray-600">{w.account_holder || '-'}</div>
                    <div className="font-mono text-gray-700">{w.account_number || '-'}</div>
                    {w.ifsc ? <div className="text-gray-400">IFSC: {w.ifsc}</div> : null}
                  </div>
                );
              }
              return (
                <tr key={w.id} className={`hover:bg-gray-50 ${isBankFlagged ? 'bg-red-50' : ''}`}>
                  <td className="px-4 py-3">{w.id}</td>
                  <td className="px-4 py-3 text-xs text-gray-700">
                    <Link to={`/users/${w.user_id}`} className="text-blue-600 hover:underline font-medium">{w.user_name}</Link>
                    {w.moderator_id ? <div className="text-gray-400 mt-1">Mod: {w.moderator_name || `#${w.moderator_id}`}</div> : null}
                  </td>
                  <td className="px-4 py-3">{w.user_phone}</td>
                  <td className="px-4 py-3 text-right font-semibold text-red-700">₹{parseFloat(w.amount).toLocaleString()}</td>
                  <td className="px-4 py-3">{methodBadge}</td>
                  <td className="px-4 py-3">{paymentInfo}</td>
                  <td className="px-4 py-3 text-center">
                    {isBankFlagged ? <span className="px-2 py-1 bg-red-100 text-red-700 text-xs font-medium">⚑ Flagged</span> : '-'}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className={`px-2 py-1 text-xs font-medium ${
                      w.status === 'approved' ? 'bg-green-100 text-green-700'
                        : w.status === 'rejected' ? 'bg-red-100 text-red-700'
                        : 'bg-yellow-100 text-yellow-700'
                    }`}>{w.status}</span>
                  </td>
                  <td className="px-4 py-3 text-gray-500 text-xs">{new Date(w.created_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}</td>
                  {filter === 'pending' && (
                    <td className="px-4 py-3 text-center space-x-2">
                      <button onClick={() => approve(w.id)} className="px-3 py-1 bg-green-600 text-white text-xs hover:bg-green-700">Approve</button>
                      <button onClick={() => reject(w.id)} className="px-3 py-1 bg-red-600 text-white text-xs hover:bg-red-700">Reject</button>
                    </td>
                  )}
                </tr>
              );
            })}
            {withdrawals.length === 0 && (
              <tr><td colSpan={10} className="px-4 py-8 text-center text-gray-400">{loading ? 'Loading...' : 'No withdrawals'}</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {pagination.totalPages > 1 && (
        <div className="flex justify-center gap-2">
          <button disabled={page <= 1} onClick={() => setPage(page - 1)} className="px-4 py-2 bg-white border text-sm disabled:opacity-50">Prev</button>
          <span className="px-4 py-2 text-sm text-gray-600">Page {page} of {pagination.totalPages}</span>
          <button disabled={page >= pagination.totalPages} onClick={() => setPage(page + 1)} className="px-4 py-2 bg-white border text-sm disabled:opacity-50">Next</button>
        </div>
      )}
    </div>
  );
}

