import { useEffect, useState } from 'react';
import api from '../utils/api';

export default function FraudLogs() {
  const [logs, setLogs] = useState([]);
  const [alerts, setAlerts] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadLogs = async () => {
      try {
        const [logsRes, alertsRes] = await Promise.all([
          api.get('/admin/fraud-logs'),
          api.get('/admin/fraud-alerts'),
        ]);
        setLogs(Array.isArray(logsRes.data.logs) ? logsRes.data.logs : []);
        setAlerts(alertsRes.data || null);
      } catch (error) {
        console.error(error);
      } finally {
        setLoading(false);
      }
    };

    loadLogs();
  }, []);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border p-5">
          <p className="text-sm text-gray-500">Fraud Attempts Today</p>
          <p className="text-2xl font-bold text-red-700 mt-1">{alerts?.summary?.fraud_attempts_today || 0}</p>
        </div>
        <div className="bg-white border p-5">
          <p className="text-sm text-gray-500">Reused Receipt Groups</p>
          <p className="text-2xl font-bold text-amber-700 mt-1">{alerts?.summary?.reused_receipt_groups || 0}</p>
        </div>
        <div className="bg-white border p-5">
          <p className="text-sm text-gray-500">High Approver Alerts</p>
          <p className="text-2xl font-bold text-blue-700 mt-1">{alerts?.summary?.excessive_approver_count || 0}</p>
        </div>
        <div className="bg-white border p-5">
          <p className="text-sm text-gray-500">Large New User Deposits</p>
          <p className="text-2xl font-bold text-purple-700 mt-1">{alerts?.summary?.large_new_user_deposit_count || 0}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <div className="bg-white border p-5">
          <h3 className="text-lg font-semibold text-gray-800 mb-3">Reused Receipt Alerts</h3>
          <div className="space-y-3">
            {alerts?.reused_receipts?.map((item, index) => (
              <div key={`${item.receipt_image_hash}-${index}`} className=" border border-amber-200 bg-amber-50 px-4 py-3">
                <p className="text-sm font-medium text-gray-800">{item.duplicate_count} deposits share the same receipt hash.</p>
                <p className="text-xs text-gray-600 mt-1">Users: {item.users}</p>
                <p className="text-xs text-gray-500 mt-1">UTRs: {item.utrs}</p>
              </div>
            ))}
            {!alerts?.reused_receipts?.length && <div className="text-sm text-gray-400">No reused receipt alerts.</div>}
          </div>
        </div>

        <div className="bg-white border p-5">
          <h3 className="text-lg font-semibold text-gray-800 mb-3">Approval Velocity Alerts</h3>
          <div className="space-y-3">
            {alerts?.excessive_approvals?.map((item) => (
              <div key={item.approver_id} className=" border border-blue-200 bg-blue-50 px-4 py-3">
                <p className="text-sm font-medium text-gray-800">{item.approver_name} approved {item.approval_count} deposits today.</p>
                <p className="text-xs text-gray-500 mt-1">Role: {item.approver_role}</p>
              </div>
            ))}
            {!alerts?.excessive_approvals?.length && <div className="text-sm text-gray-400">No high-volume approval alerts.</div>}
          </div>
        </div>
      </div>

      <div className="bg-white border p-5">
        <h3 className="text-lg font-semibold text-gray-800 mb-3">Large Deposits From New Users</h3>
        <div className="space-y-3">
          {alerts?.large_new_user_deposits?.map((item) => (
            <div key={item.id} className=" border border-purple-200 bg-purple-50 px-4 py-3">
              <p className="text-sm font-medium text-gray-800">{item.user_name} ({item.user_phone}) deposited ₹{Number(item.amount).toLocaleString('en-IN')}</p>
              <p className="text-xs text-gray-500 mt-1">Account age: {item.account_age_hours} hours � {new Date(item.created_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}</p>
            </div>
          ))}
          {!alerts?.large_new_user_deposits?.length && <div className="text-sm text-gray-400">No large new-user deposit alerts.</div>}
        </div>
      </div>

      <div className="bg-white border overflow-x-auto">
        <div className="px-4 py-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-800">Duplicate UTR Logs</h3>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="text-left px-4 py-3 font-medium text-gray-600">User</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Attempted UTR</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Original User</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Date</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {logs.map((log) => (
              <tr key={log.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 text-xs text-gray-700">{log.attempt_user_name} ({log.attempt_user_phone})</td>
                <td className="px-4 py-3 font-mono text-xs">{log.utr}</td>
                <td className="px-4 py-3 text-xs text-gray-700">
                  {log.original_user_name ? `${log.original_user_name} (${log.original_user_phone})` : '-'}
                </td>
                <td className="px-4 py-3 text-xs text-gray-600">{new Date(log.created_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}</td>
              </tr>
            ))}
            {logs.length === 0 && (
              <tr><td colSpan={4} className="px-4 py-8 text-center text-gray-400">{loading ? 'Loading...' : 'No fraud logs found'}</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
