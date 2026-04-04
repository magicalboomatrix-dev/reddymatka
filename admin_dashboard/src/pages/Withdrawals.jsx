import { useState, useEffect } from 'react';
import api from '../utils/api';
import { useToast, ToastContainer, useConfirm, ConfirmModal } from '../components/ui';

export default function Withdrawals() {
  const [withdrawals, setWithdrawals] = useState([]);
  const [pagination, setPagination] = useState({});
  const [filter, setFilter] = useState('pending');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const { toasts, success, error: toastError, dismiss } = useToast();
  const { confirmState, confirm, handleConfirm, handleCancel } = useConfirm();
  const [rejectModal, setRejectModal] = useState({ open: false, id: null, reason: '' });

  useEffect(() => { loadData(); }, [page, filter]);

  const loadData = async () => {
    setLoading(true);
    try {
      const res = await api.get('/withdraw/all', { params: { status: filter, page, limit: 15 } });
      setWithdrawals(Array.isArray(res.data.withdrawals) ? res.data.withdrawals : []);
      setPagination(res.data.pagination || {});
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

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

  return (
    <div className="space-y-4">
      <ToastContainer toasts={toasts} dismiss={dismiss} />
      <ConfirmModal state={confirmState} onConfirm={handleConfirm} onCancel={handleCancel} />

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
                placeholder="Enter rejection reason…"
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

      <div className="bg-white border overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="text-left px-4 py-3 font-medium text-gray-600">ID</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">User</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Phone</th>
              <th className="text-right px-4 py-3 font-medium text-gray-600">Amount</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Bank</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Account</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">IFSC</th>
              <th className="text-center px-4 py-3 font-medium text-gray-600">Flagged</th>
              <th className="text-center px-4 py-3 font-medium text-gray-600">Status</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Date</th>
              {filter === 'pending' && <th className="text-center px-4 py-3 font-medium text-gray-600">Actions</th>}
            </tr>
          </thead>
          <tbody className="divide-y">
            {withdrawals.map((w) => (
              <tr key={w.id} className={`hover:bg-gray-50 ${w.is_flagged ? 'bg-red-50' : ''}`}>
                <td className="px-4 py-3">{w.id}</td>
                <td className="px-4 py-3 font-medium">{w.user_name}</td>
                <td className="px-4 py-3">{w.user_phone}</td>
                <td className="px-4 py-3 text-right font-semibold text-red-700">₹{parseFloat(w.amount).toLocaleString()}</td>
                <td className="px-4 py-3">{w.bank_name}</td>
                <td className="px-4 py-3 font-mono text-xs">{w.account_number}</td>
                <td className="px-4 py-3 font-mono text-xs">{w.ifsc}</td>
                <td className="px-4 py-3 text-center">
                  {w.is_flagged ? <span className="px-2 py-1 bg-red-100 text-red-700 text-xs font-medium">⚠ Flagged</span> : '-'}
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
                    <button onClick={() => approve(w.id)} className="px-3 py-1 bg-green-600 text-white  text-xs hover:bg-green-700">Approve</button>
                    <button onClick={() => reject(w.id)} className="px-3 py-1 bg-red-600 text-white  text-xs hover:bg-red-700">Reject</button>
                  </td>
                )}
              </tr>
            ))}
            {withdrawals.length === 0 && (
              <tr><td colSpan={11} className="px-4 py-8 text-center text-gray-400">{loading ? 'Loading...' : 'No withdrawals'}</td></tr>
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
