import { useState, useEffect } from 'react';
import api from '../utils/api';
import { useToast, ToastContainer } from '../components/ui';

const STATUS_COLORS = {
  pending:    'bg-yellow-100 text-yellow-700',
  processing: 'bg-blue-100 text-blue-700',
  done:       'bg-green-100 text-green-700',
  failed:     'bg-red-100 text-red-700',
};

export default function SettlementMonitor() {
  const [stats, setStats] = useState(null);
  const [queue, setQueue] = useState([]);
  const [statusFilter, setStatusFilter] = useState('pending,processing,failed');
  const [loading, setLoading] = useState(true);
  const { toasts, success, error: toastError, dismiss } = useToast();

  useEffect(() => {
    loadAll();
    const interval = setInterval(loadAll, 15000); // auto-refresh every 15 s
    return () => clearInterval(interval);
  }, [statusFilter]);

  const loadAll = async () => {
    setLoading(true);
    try {
      const [statsRes, queueRes] = await Promise.all([
        api.get('/settlement-monitor/stats'),
        api.get('/settlement-monitor/queue', { params: { status: statusFilter, limit: 50 } }),
      ]);
      setStats(statsRes.data.stats);
      setQueue(Array.isArray(queueRes.data.queue) ? queueRes.data.queue : []);
    } catch (err) {
      toastError(err.response?.data?.error || 'Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const retryJob = async (id) => {
    try {
      await api.post(`/settlement-monitor/retry/${id}`);
      success('Job re-queued.');
      loadAll();
    } catch (err) {
      toastError(err.response?.data?.error || 'Failed to retry job');
    }
  };

  return (
    <div className="space-y-4">
      <ToastContainer toasts={toasts} dismiss={dismiss} />

      {/* Stats row */}
      {stats && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          {[
            { label: 'Pending',    value: stats.pending,    color: 'text-yellow-600' },
            { label: 'Processing', value: stats.processing, color: 'text-blue-600' },
            { label: 'Done',       value: stats.done,       color: 'text-green-600' },
            { label: 'Failed',     value: stats.failed,     color: 'text-red-600' },
            { label: 'Stale',      value: stats.stale,      color: 'text-orange-600' },
          ].map(({ label, value, color }) => (
            <div key={label} className="bg-white border px-4 py-3 text-center">
              <div className={`text-2xl font-bold ${color}`}>{value}</div>
              <div className="text-xs text-gray-500 mt-1">{label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Filter tabs */}
      <div className="flex flex-wrap gap-2">
        {[
          { label: 'Active',  value: 'pending,processing,failed' },
          { label: 'Pending', value: 'pending' },
          { label: 'Failed',  value: 'failed' },
          { label: 'Done',    value: 'done' },
        ].map((f) => (
          <button
            key={f.value}
            onClick={() => setStatusFilter(f.value)}
            className={`px-4 py-2 text-sm font-medium ${
              statusFilter === f.value
                ? 'bg-primary-600 text-white'
                : 'bg-white border text-gray-600 hover:bg-gray-50'
            }`}
          >
            {f.label}
          </button>
        ))}
        <button
          onClick={loadAll}
          className="ml-auto px-3 py-2 text-xs bg-white border text-gray-500 hover:bg-gray-50"
        >
          ↻ Refresh
        </button>
      </div>

      {/* Queue table */}
      <div className="bg-white border overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="text-left px-4 py-3 font-medium text-gray-600">ID</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Game</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Result</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Date</th>
              <th className="text-center px-4 py-3 font-medium text-gray-600">Status</th>
              <th className="text-center px-4 py-3 font-medium text-gray-600">Attempts</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Error</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Created</th>
              <th className="text-center px-4 py-3 font-medium text-gray-600">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {queue.map((row) => (
              <tr key={row.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 font-mono text-xs">{row.id}</td>
                <td className="px-4 py-3 font-medium">{row.game_name}</td>
                <td className="px-4 py-3 font-mono font-bold">{row.result_number}</td>
                <td className="px-4 py-3 text-xs">{row.result_date}</td>
                <td className="px-4 py-3 text-center">
                  <span className={`px-2 py-1 text-xs font-medium ${STATUS_COLORS[row.status] || ''}`}>
                    {row.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-center">{row.attempts}</td>
                <td className="px-4 py-3 text-xs text-red-600 max-w-[200px] truncate">{row.error_message || '-'}</td>
                <td className="px-4 py-3 text-xs text-gray-400">
                  {new Date(row.created_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}
                </td>
                <td className="px-4 py-3 text-center">
                  {row.status === 'failed' && (
                    <button
                      onClick={() => retryJob(row.id)}
                      className="px-3 py-1 bg-orange-500 text-white text-xs hover:bg-orange-600"
                    >
                      Retry
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {queue.length === 0 && (
              <tr>
                <td colSpan={9} className="px-4 py-8 text-center text-gray-400">
                  {loading ? 'Loading…' : 'No jobs'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

