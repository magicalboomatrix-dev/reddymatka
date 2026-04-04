import { useState, useEffect } from 'react';
import api from '../utils/api';

function formatCurrency(amount) {
  return `₹${Number(amount || 0).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export default function Deposits() {
  const [deposits, setDeposits] = useState([]);
  const [pagination, setPagination] = useState({});
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => { loadDeposits(); }, [page]);

  const loadDeposits = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api.get('/deposits/all', { params: { page, limit: 20 } });
      setDeposits(Array.isArray(res.data.deposits) ? res.data.deposits : []);
      setPagination(res.data.pagination || {});
    } catch (err) {
      setError('Failed to load deposits.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded text-sm">
          {error}
        </div>
      )}

      <div className="text-sm text-gray-500">
        All deposits are auto-verified via UPI webhook. Showing completed credits only. Total: {pagination.total || 0}
      </div>

      <div className="bg-white border overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Deposit</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Order</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Webhook</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">User</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Phone</th>
              <th className="text-right px-4 py-3 font-medium text-gray-600">Amount</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">UTR</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Payer</th>
              <th className="text-center px-4 py-3 font-medium text-gray-600">Status</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Date</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {deposits.map((d) => (
              <tr key={d.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 font-medium">#{d.id}</td>
                <td className="px-4 py-3 text-xs text-gray-600">{d.order_id ? `#${d.order_id}` : '-'}</td>
                <td className="px-4 py-3 text-xs text-gray-600">{d.webhook_txn_id ? `#${d.webhook_txn_id}` : '-'}</td>
                <td className="px-4 py-3 font-medium">{d.user_name}</td>
                <td className="px-4 py-3">{d.user_phone}</td>
                <td className="px-4 py-3 text-right font-semibold text-green-700">
                  {formatCurrency(d.amount)}
                </td>
                <td className="px-4 py-3 font-mono text-xs">{d.utr_number || '-'}</td>
                <td className="px-4 py-3 text-xs text-gray-600">{d.payer_name || '-'}</td>
                <td className="px-4 py-3 text-center">
                  <span className="rounded px-2 py-1 text-xs font-medium bg-green-100 text-green-700">
                    {d.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-gray-500 text-xs">
                  {new Date(d.created_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}
                </td>
              </tr>
            ))}
            {deposits.length === 0 && (
              <tr>
                <td colSpan={10} className="px-4 py-8 text-center text-gray-400">
                  {loading ? 'Loading...' : 'No deposits'}
                </td>
              </tr>
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
