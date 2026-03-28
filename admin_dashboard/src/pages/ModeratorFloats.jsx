import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../utils/api';
import { useToast, ToastContainer } from '../components/ui';

function formatCurrency(value) {
  return `₹${Number(value || 0).toLocaleString('en-IN')}`;
}

export default function ModeratorFloats() {
  const [moderators, setModerators] = useState([]);
  const [adjustments, setAdjustments] = useState({});
  const [savingId, setSavingId] = useState(null);
  const [loading, setLoading] = useState(true);
  const { toasts, success, error: toastError, dismiss } = useToast();

  const loadRows = async () => {
    setLoading(true);
    try {
      const res = await api.get('/admin/moderator-floats');
      setModerators(Array.isArray(res.data.moderators) ? res.data.moderators : []);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRows();
  }, []);

  const summary = useMemo(() => ({
    totalFloat: moderators.reduce((sum, moderator) => sum + Number(moderator.float_balance || 0), 0),
    lowFloatCount: moderators.filter((moderator) => Number(moderator.float_balance || 0) <= 1000).length,
    enabledCount: moderators.filter((moderator) => moderator.scanner_enabled).length,
  }), [moderators]);

  const updateField = (moderatorId, field, value) => {
    setAdjustments((current) => ({
      ...current,
      [moderatorId]: {
        ...(current[moderatorId] || {}),
        [field]: value,
      },
    }));
  };

  const submitAdjustment = async (moderatorId) => {
    const entry = adjustments[moderatorId] || {};
    const amount = parseFloat(entry.amount);

    if (!Number.isFinite(amount) || amount === 0) {
      toastError('Enter a non-zero amount.');
      return;
    }

    try {
      setSavingId(moderatorId);
      await api.put(`/moderators/${moderatorId}/float`, {
        amount,
        note: entry.note || '',
      });
      setAdjustments((current) => ({
        ...current,
        [moderatorId]: { amount: '', note: '' },
      }));
      await loadRows();
    } catch (error) {
      toastError(error.response?.data?.error || 'Failed to update moderator float');
    } finally {
      setSavingId(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white border p-5">
          <p className="text-sm text-gray-500">Total Float</p>
          <p className="text-2xl font-bold text-green-700 mt-1">{formatCurrency(summary.totalFloat)}</p>
        </div>
        <div className="bg-white border p-5">
          <p className="text-sm text-gray-500">Low Float Moderators</p>
          <p className="text-2xl font-bold text-red-700 mt-1">{summary.lowFloatCount}</p>
        </div>
        <div className="bg-white border p-5">
          <p className="text-sm text-gray-500">Active Scanners</p>
          <p className="text-2xl font-bold text-blue-700 mt-1">{summary.enabledCount}</p>
        </div>
      </div>

      <div className="bg-white border overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Moderator</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Phone</th>
              <th className="text-center px-4 py-3 font-medium text-gray-600">Scanner</th>
              <th className="text-right px-4 py-3 font-medium text-gray-600">Float Balance</th>
              <th className="text-right px-4 py-3 font-medium text-gray-600">Total Topups</th>
              <th className="text-right px-4 py-3 font-medium text-gray-600">Total Deductions</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Last Transaction</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Adjust Float</th>
              <th className="text-center px-4 py-3 font-medium text-gray-600">Details</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {moderators.map((moderator) => (
              <tr key={moderator.moderator_id} className="hover:bg-gray-50">
                <td className="px-4 py-3 font-medium text-gray-800">{moderator.moderator_name}</td>
                <td className="px-4 py-3 text-gray-600">{moderator.phone}</td>
                <td className="px-4 py-3 text-center">
                  <span className={`px-2 py-1 text-xs font-medium ${moderator.scanner_enabled ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                    {moderator.scanner_enabled ? 'Enabled' : 'Disabled'}
                  </span>
                </td>
                <td className="px-4 py-3 text-right font-semibold text-green-700">{formatCurrency(moderator.float_balance)}</td>
                <td className="px-4 py-3 text-right">{formatCurrency(moderator.total_topups)}</td>
                <td className="px-4 py-3 text-right">{formatCurrency(moderator.total_deductions)}</td>
                <td className="px-4 py-3 text-xs text-gray-600">{moderator.last_transaction_at ? new Date(moderator.last_transaction_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }) : '-'}</td>
                <td className="px-4 py-3 min-w-[240px]">
                  <div className="space-y-2">
                    <input
                      type="number"
                      step="0.01"
                      value={adjustments[moderator.moderator_id]?.amount || ''}
                      onChange={(event) => updateField(moderator.moderator_id, 'amount', event.target.value)}
                      placeholder="+/- amount"
                      className="w-full px-3 py-2 border text-xs"
                    />
                    <input
                      type="text"
                      value={adjustments[moderator.moderator_id]?.note || ''}
                      onChange={(event) => updateField(moderator.moderator_id, 'note', event.target.value)}
                      placeholder="Note"
                      className="w-full px-3 py-2 border text-xs"
                    />
                    <button
                      type="button"
                      disabled={savingId === moderator.moderator_id}
                      onClick={() => submitAdjustment(moderator.moderator_id)}
                      className="px-3 py-1 bg-emerald-600 text-white text-xs hover:bg-emerald-700 disabled:opacity-50"
                    >
                      {savingId === moderator.moderator_id ? 'Saving...' : 'Update Float'}
                    </button>
                  </div>
                </td>
                <td className="px-4 py-3 text-center">
                  <Link
                    to={`/moderators/${moderator.moderator_id}`}
                    className="px-3 py-1 bg-blue-600 text-white text-xs hover:bg-blue-700 inline-block"
                  >
                    View
                  </Link>
                </td>
              </tr>
            ))}
            {moderators.length === 0 && (
              <tr><td colSpan={9} className="px-4 py-8 text-center text-gray-400">{loading ? 'Loading...' : 'No moderators found'}</td></tr>
            )}
          </tbody>
        </table>
      </div>
      <ToastContainer toasts={toasts} dismiss={dismiss} />
    </div>
  );
}