import { useState, useEffect, useCallback } from 'react';
import api from '../utils/api';
import PaginatedTable from '../components/PaginatedTable';
import { useToast, ToastContainer } from '../components/ui';

export default function SystemAlerts() {
  const { toasts, success, error: toastError, dismiss } = useToast();
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('open'); // 'open', 'resolved', 'all'
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ page: 1, limit: 50, total: 0, totalPages: 0 });

  const loadAlerts = useCallback(async () => {
    try {
      setLoading(true);
      const res = await api.get('/admin/system-alerts', {
        params: { status: statusFilter, page, limit: 50 },
      });
      setAlerts(res.data.alerts);
      setPagination(res.data.pagination);
    } catch (err) {
      toastError(err.response?.data?.error || 'Failed to load system alerts');
    } finally {
      setLoading(false);
    }
  }, [statusFilter, page, toastError]);

  useEffect(() => {
    loadAlerts();
  }, [loadAlerts]);

  const handleResolve = async (id) => {
    try {
      const res = await api.put(`/admin/system-alerts/${id}/resolve`);
      success(res.data.message || 'Alert resolved');
      loadAlerts();
    } catch (err) {
      toastError(err.response?.data?.error || 'Failed to resolve alert');
    }
  };

  const getLevelColor = (level) => {
    switch (level) {
      case 'error': return 'bg-red-100 text-red-800 border-red-200';
      case 'warn': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'info': return 'bg-blue-100 text-blue-800 border-blue-200';
      default: return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 animate-fade-in">
      <ToastContainer toasts={toasts} dismiss={dismiss} />
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-8 gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <span className="text-2xl">⚠️</span> System Alerts
          </h1>
          <p className="text-sm text-gray-500 mt-1">Watchdog and system-level alerts</p>
        </div>
        
        <div className="flex gap-2">
          {['open', 'resolved', 'all'].map(s => (
            <button
              key={s}
              onClick={() => { setStatusFilter(s); setPage(1); }}
              className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors capitalize ${
                statusFilter === s
                  ? 'bg-primary-600 text-white shadow-md'
                  : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-gray-500 animate-pulse">Loading alerts...</div>
        ) : (
          <PaginatedTable
            headers={['ID', 'Level', 'Context', 'Message', 'Data', 'Status', 'Actions']}
            data={alerts}
            renderRow={(alert) => (
              <tr key={alert.id} className="hover:bg-gray-50 transition-colors">
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">#{alert.id}</td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full border ${getLevelColor(alert.level)} uppercase`}>
                    {alert.level}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 font-medium">
                  {alert.context}
                </td>
                <td className="px-6 py-4 text-sm text-gray-900 max-w-xs break-words">
                  {alert.message}
                  <div className="text-xs text-gray-500 mt-1">
                    {new Date(alert.created_at).toLocaleString()}
                  </div>
                </td>
                <td className="px-6 py-4 text-sm text-gray-500">
                  {alert.data ? (
                    <pre className="text-xs bg-gray-50 p-2 rounded border border-gray-100 overflow-x-auto max-w-sm max-h-32 overflow-y-auto">
                      {typeof alert.data === 'string' ? JSON.stringify(JSON.parse(alert.data), null, 2) : JSON.stringify(alert.data, null, 2)}
                    </pre>
                  ) : (
                    '-'
                  )}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm">
                  {alert.status === 'open' ? (
                    <span className="text-yellow-600 font-medium flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full bg-yellow-500 animate-pulse"></span>
                      Open
                    </span>
                  ) : (
                    <div className="flex flex-col">
                      <span className="text-green-600 font-medium flex items-center gap-1">
                        <span className="w-2 h-2 rounded-full bg-green-500"></span>
                        Resolved
                      </span>
                      <span className="text-xs text-gray-500 mt-1">
                        by {alert.resolved_by_name || 'Admin'}
                      </span>
                    </div>
                  )}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                  {alert.status === 'open' && (
                    <button
                      onClick={() => handleResolve(alert.id)}
                      className="text-white bg-green-600 hover:bg-green-700 px-3 py-1.5 rounded-lg transition-colors shadow-sm"
                    >
                      Resolve
                    </button>
                  )}
                </td>
              </tr>
            )}
            pagination={pagination}
            onPageChange={setPage}
            emptyMessage={statusFilter === 'open' ? '🎉 All good! No open system alerts.' : 'No alerts found.'}
          />
        )}
      </div>
    </div>
  );
}
