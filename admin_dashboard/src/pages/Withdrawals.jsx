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
  const [checkModal, setCheckModal] = useState({ open: false, id: null, item: null, notes: '' });

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

  const openCheck = (item) => {
    setCheckModal({ open: true, id: item.id, item, notes: '' });
  };

  const submitCheck = async () => {
    const { id, notes } = checkModal;
    try {
      await api.put(`/withdraw/${id}/check`, { notes });
      setCheckModal({ open: false, id: null, item: null, notes: '' });
      loadData();
      success('Withdrawal verified by checker and moved to Checked status.');
    } catch (err) {
      toastError(err.response?.data?.error || 'Failed to verify withdrawal');
    }
  };

  const approve = async (id) => {
    const confirmed = await confirm({
      title: 'Approve Payout',
      message: 'Confirm payout and approve this checked withdrawal request?',
      confirmText: 'Approve Payout',
      variant: 'primary',
    });
    if (!confirmed) return;
    try {
      await api.put(`/withdraw/${id}/approve`);
      loadData();
      success('Withdrawal payout approved.');
    } catch (err) {
      toastError(err.response?.data?.error || 'Failed to approve');
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

      {/* Checker verification modal */}
      {checkModal.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
          <div className="bg-white w-full max-w-md p-6 space-y-4 rounded-lg shadow-xl">
            <div className="flex items-center justify-between border-b pb-2">
              <div className="flex items-center gap-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-blue-100 text-blue-700 font-bold text-xs">
                  ✓
                </span>
                <h3 className="text-base font-bold text-gray-800">Checker Verification</h3>
              </div>
              <button
                onClick={() => setCheckModal({ open: false, id: null, item: null, notes: '' })}
                className="text-gray-400 hover:text-gray-600 text-xl font-bold leading-none p-1"
              >
                &times;
              </button>
            </div>

            {checkModal.item && (
              <div className="bg-gray-50 border p-3 rounded text-xs space-y-1.5 text-gray-700">
                <div className="flex justify-between">
                  <span className="text-gray-500">User:</span>
                  <span className="font-semibold text-gray-900">{checkModal.item.user_name} ({checkModal.item.user_phone})</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Amount:</span>
                  <span className="font-bold text-red-700 text-sm">₹{parseFloat(checkModal.item.amount).toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Method:</span>
                  <span className="font-semibold uppercase">{checkModal.item.withdraw_method}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">OTP Status:</span>
                  <span className={checkModal.item.otp_verified ? 'text-green-700 font-bold' : 'text-amber-600 font-medium'}>
                    {checkModal.item.otp_verified ? '✓ Verified (OTP Confirmed)' : 'Unverified'}
                  </span>
                </div>
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                Checker Notes / Remarks (Optional)
              </label>
              <textarea
                className="w-full border border-gray-300 px-3 py-2 text-sm resize-none rounded focus:ring-1 focus:ring-blue-500 outline-none"
                rows={3}
                placeholder="e.g. Verified bank IFSC, betting history clean, recommended for payout..."
                value={checkModal.notes}
                onChange={(e) => setCheckModal((m) => ({ ...m, notes: e.target.value }))}
              />
            </div>

            <div className="flex gap-2 justify-end pt-2 border-t">
              <button
                onClick={() => setCheckModal({ open: false, id: null, item: null, notes: '' })}
                className="px-4 py-2 text-xs border text-gray-600 hover:bg-gray-50 rounded"
              >
                Cancel
              </button>
              <button
                onClick={submitCheck}
                className="px-4 py-2 text-xs bg-blue-600 text-white hover:bg-blue-700 font-semibold rounded"
              >
                Mark Verified & Move to Checked
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Maker-Checker Info Banner */}
      <div className="bg-blue-50 border-l-4 border-blue-600 p-3 text-xs text-blue-900 flex items-center justify-between gap-3 rounded-r">
        <div className="flex items-center gap-2">
          <span className="font-bold uppercase text-[10px] bg-blue-200 text-blue-900 px-2 py-0.5 rounded">
            Maker-Checker
          </span>
          <span>
            Direct payout is disabled. Review & verify requests in <strong>Pending</strong>, then approve payout in <strong>Checked</strong>.
          </span>
        </div>
      </div>

      <div className="flex gap-2">
        {['pending', 'checked', 'approved', 'rejected'].map((s) => (
          <button key={s} onClick={() => { setFilter(s); setPage(1); }}
            className={`px-4 py-2 text-sm font-medium capitalize rounded ${
              filter === s
                ? (s === 'checked' ? 'bg-blue-600 text-white' : 'bg-primary-600 text-white')
                : 'bg-white border text-gray-600 hover:bg-gray-50'
            }`}>
            {s === 'checked' ? 'Checked (Ready for Payout)' : s}
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
              <th className="text-center px-4 py-3 font-medium text-gray-600">OTP</th>
              <th className="text-center px-4 py-3 font-medium text-gray-600">Flagged</th>
              <th className="text-center px-4 py-3 font-medium text-gray-600">Status</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Checker</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Date</th>
              {(filter === 'pending' || filter === 'checked') && (
                <th className="text-center px-4 py-3 font-medium text-gray-600">Actions</th>
              )}
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
                    {w.otp_verified ? (
                      <span className="px-2 py-0.5 bg-green-100 text-green-800 text-[11px] font-bold rounded">
                        ✓ Verified
                      </span>
                    ) : (
                      <span className="text-gray-400 text-xs">-</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {isBankFlagged ? <span className="px-2 py-1 bg-red-100 text-red-700 text-xs font-medium">⚑ Flagged</span> : '-'}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className={`px-2 py-1 text-xs font-medium rounded ${
                      w.status === 'approved' ? 'bg-green-100 text-green-700'
                        : w.status === 'rejected' ? 'bg-red-100 text-red-700'
                        : w.status === 'checked' ? 'bg-blue-100 text-blue-700 font-semibold'
                        : 'bg-yellow-100 text-yellow-700'
                    }`}>{w.status === 'checked' ? 'Checked' : w.status}</span>
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-700">
                    {w.checked_by_name ? (
                      <div>
                        <span className="font-semibold text-blue-900">{w.checked_by_name}</span>
                        {w.checker_notes && (
                          <div className="text-[10px] text-gray-500 italic max-w-[130px] truncate" title={w.checker_notes}>
                            "{w.checker_notes}"
                          </div>
                        )}
                      </div>
                    ) : <span className="text-gray-400">-</span>}
                  </td>
                  <td className="px-4 py-3 text-gray-500 text-xs">{new Date(w.created_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}</td>
                  {filter === 'pending' && (
                    <td className="px-4 py-3 text-center space-x-1.5 whitespace-nowrap">
                      <button
                        onClick={() => openCheck(w)}
                        className="px-2.5 py-1 bg-blue-600 text-white text-xs hover:bg-blue-700 font-semibold rounded shadow-sm"
                        title="Verify details and move to Checked queue"
                      >
                        Check / Verify
                      </button>
                      <button
                        onClick={() => reject(w.id)}
                        className="px-2.5 py-1 bg-red-600 text-white text-xs hover:bg-red-700 font-medium rounded shadow-sm"
                      >
                        Reject
                      </button>
                    </td>
                  )}
                  {filter === 'checked' && (
                    <td className="px-4 py-3 text-center space-x-1.5 whitespace-nowrap">
                      <button
                        onClick={() => approve(w.id)}
                        className="px-2.5 py-1 bg-green-600 text-white text-xs hover:bg-green-700 font-semibold rounded shadow-sm"
                        title="Authorize payout for checked withdrawal"
                      >
                        Approve Payout
                      </button>
                      <button
                        onClick={() => reject(w.id)}
                        className="px-2.5 py-1 bg-red-600 text-white text-xs hover:bg-red-700 font-medium rounded shadow-sm"
                      >
                        Reject
                      </button>
                    </td>
                  )}
                </tr>
              );
            })}
            {withdrawals.length === 0 && (
              <tr><td colSpan={12} className="px-4 py-8 text-center text-gray-400">{loading ? 'Loading...' : 'No withdrawals'}</td></tr>
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

