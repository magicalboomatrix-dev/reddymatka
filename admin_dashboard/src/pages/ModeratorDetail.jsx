import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import api from '../utils/api';
import { useToast, ToastContainer } from '../components/ui';

function formatCurrency(value) {
  return `₹${Number(value || 0).toLocaleString('en-IN')}`;
}

function formatScannerAuditField(fieldName) {
  const labels = {
    scanner_label: 'Scanner Label',
    upi_id: 'UPI ID',
    scanner_enabled: 'Scanner Status',
  };

  return labels[fieldName] || fieldName || '-';
}

function formatScannerAuditValue(fieldName, value) {
  if (!value) {
    return '-';
  }

  return value;
}

function parseUpiDetails(upiId) {
  const value = String(upiId || '').trim();

  if (!value) {
    return {
      full: '',
      username: '',
      handle: '',
      isValid: false,
    };
  }

  const [username = '', handle = ''] = value.split('@');

  return {
    full: value,
    username,
    handle,
    isValid: Boolean(username && handle),
  };
}

export default function ModeratorDetail() {
  const { id } = useParams();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const { toasts, success, error: toastError, dismiss } = useToast();

  const loadDetail = async () => {
    setLoading(true);
    try {
      const res = await api.get(`/admin/moderators/${id}/detail`);
      setData(res.data || null);
    } catch (error) {
      console.error(error);
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDetail();
  }, [id]);

  const moderator = data?.moderator;
  const deposits = data?.deposit_transactions || [];
  const assignedUsers = data?.assigned_users || [];
  const notifications = data?.notifications || [];
  const scannerAuditHistory = data?.scanner_audit_history || [];
  const upiDetails = parseUpiDetails(moderator?.upi_id);


  if (loading) {
    return <div className="text-center py-10 text-gray-500">Loading moderator details...</div>;
  }

  if (!moderator) {
    return <div className="text-center py-10 text-red-600">Moderator not found.</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h3 className="text-xl font-semibold text-gray-800">{moderator.name}</h3>
          <p className="text-sm text-gray-500 mt-1">Moderator detail, deposit audit, and assigned users</p>
        </div>
        <div className="flex gap-2">
          <Link to="/moderators" className="px-4 py-2 bg-white border hover:bg-gray-50 text-sm font-medium text-gray-700">Back</Link>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border p-5">
          <p className="text-sm text-gray-500">Assigned Users</p>
          <p className="text-2xl font-bold text-blue-700 mt-1">{moderator.user_count}</p>
        </div>
        <div className="bg-white border p-5">
          <p className="text-sm text-gray-500">Pending Deposits</p>
          <p className="text-2xl font-bold text-orange-600 mt-1">{moderator.pending_deposits}</p>
        </div>
        <div className="bg-white border p-5">
          <p className="text-sm text-gray-500">Completed Deposits</p>
          <p className="text-2xl font-bold text-gray-800 mt-1">{moderator.approved_deposit_count}</p>
          <p className="text-xs text-gray-500 mt-1">{formatCurrency(moderator.approved_deposit_amount)}</p>
        </div>
        <div className="bg-white border p-5">
          <p className="text-sm text-gray-500">Total Deposits</p>
          <p className="text-2xl font-bold text-gray-800 mt-1">{moderator.total_related_deposits}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="bg-white border p-5 space-y-4">
          <h4 className="text-lg font-semibold text-gray-800">Scanner</h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm text-gray-600">
            <div><span className="font-medium text-gray-800">Phone:</span> {moderator.phone}</div>
            <div><span className="font-medium text-gray-800">Referral:</span> {moderator.referral_code}</div>
            <div><span className="font-medium text-gray-800">Label:</span> {moderator.scanner_label || '-'}</div>
            <div><span className="font-medium text-gray-800">Status:</span> {moderator.scanner_enabled ? 'Enabled' : 'Disabled'}</div>
            <div className="sm:col-span-2 break-all"><span className="font-medium text-gray-800">UPI ID:</span> {upiDetails.full || '-'}</div>
            <div><span className="font-medium text-gray-800">UPI User:</span> {upiDetails.username || '-'}</div>
            <div><span className="font-medium text-gray-800">UPI Handle:</span> {upiDetails.handle || '-'}</div>
            <div><span className="font-medium text-gray-800">UPI Format:</span> {upiDetails.full ? (upiDetails.isValid ? 'Valid' : 'Check format') : '-'}</div>
            <div><span className="font-medium text-gray-800">Created:</span> {new Date(moderator.created_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}</div>
          </div>
        </div>

        <div className="bg-white border p-5 space-y-3 lg:col-span-2">
          <div className="flex items-center justify-between">
            <h4 className="text-lg font-semibold text-gray-800">Moderator Info</h4>
            <span className={`px-2 py-1 text-xs font-medium ${moderator.is_blocked ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
              {moderator.is_blocked ? 'Blocked' : 'Active'}
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm text-gray-600">
            <div><span className="font-medium text-gray-800">Name:</span> {moderator.name}</div>
            <div><span className="font-medium text-gray-800">Phone:</span> {moderator.phone}</div>
            <div><span className="font-medium text-gray-800">Referral Code:</span> {moderator.referral_code}</div>
            <div><span className="font-medium text-gray-800">Assigned Users:</span> {moderator.user_count}</div>
            <div><span className="font-medium text-gray-800">Completed Deposits:</span> {moderator.approved_deposit_count} ({formatCurrency(moderator.approved_deposit_amount)})</div>
            <div><span className="font-medium text-gray-800">Total Deposits:</span> {moderator.total_related_deposits}</div>
            <div><span className="font-medium text-gray-800">Created:</span> {new Date(moderator.created_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}</div>
          </div>
        </div>
      </div>

      <div className="bg-white border overflow-x-auto">
        <div className="px-4 py-4 border-b border-gray-200 flex items-center justify-between">
          <h4 className="text-lg font-semibold text-gray-800">Deposit Transactions</h4>
          <span className="text-sm text-gray-500">{deposits.length} records</span>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Date</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">User</th>
              <th className="text-right px-4 py-3 font-medium text-gray-600">Amount</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">UTR</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Payer</th>
              <th className="text-center px-4 py-3 font-medium text-gray-600">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {deposits.map((transaction) => (
              <tr key={transaction.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 text-xs text-gray-600">{new Date(transaction.created_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}</td>
                <td className="px-4 py-3 text-xs text-gray-700">
                  <Link to={`/users/${transaction.user_id}`} className="text-blue-600 hover:underline">{transaction.user_name}</Link>
                  <div className="text-gray-500">{transaction.user_phone}</div>
                </td>
                <td className="px-4 py-3 text-right font-semibold text-green-700">{formatCurrency(transaction.amount)}</td>
                <td className="px-4 py-3 font-mono text-xs">{transaction.utr_number}</td>
                <td className="px-4 py-3 text-xs text-gray-600">{transaction.payer_name || '-'}</td>
                <td className="px-4 py-3 text-center">
                  <span className="px-2 py-1 text-xs font-medium bg-green-100 text-green-700">
                    {transaction.status}
                  </span>
                </td>
              </tr>
            ))}
            {deposits.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400">No deposit transactions</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <div className="bg-white border overflow-x-auto">
          <div className="px-4 py-4 border-b border-gray-200 flex items-center justify-between">
            <h4 className="text-lg font-semibold text-gray-800">Assigned Users</h4>
            <span className="text-sm text-gray-500">{assignedUsers.length} users</span>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-600">User</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">Balance</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">Deposits</th>
                <th className="text-center px-4 py-3 font-medium text-gray-600">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {assignedUsers.map((user) => (
                <tr key={user.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-xs text-gray-700">
                    <div className="font-medium text-gray-800">{user.name}</div>
                    <div className="text-gray-500">{user.phone}</div>
                  </td>
                  <td className="px-4 py-3 text-right text-xs text-gray-700">{formatCurrency(user.balance)}</td>
                  <td className="px-4 py-3 text-right text-xs text-gray-700">{user.deposit_count}</td>
                  <td className="px-4 py-3 text-center">
                    <Link to={`/users/${user.id}`} className="px-3 py-1 bg-blue-600 text-white text-xs hover:bg-blue-700 inline-block">View</Link>
                  </td>
                </tr>
              ))}
              {assignedUsers.length === 0 && (
                <tr><td colSpan={4} className="px-4 py-8 text-center text-gray-400">No assigned users</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="bg-white border overflow-x-auto">
        <div className="px-4 py-4 border-b border-gray-200 flex items-center justify-between">
          <h4 className="text-lg font-semibold text-gray-800">Scanner Change History</h4>
          <span className="text-sm text-gray-500">{scannerAuditHistory.length} entries</span>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Date</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Changed By</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Field</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">From</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">To</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {scannerAuditHistory.map((entry) => (
              <tr key={entry.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 text-xs text-gray-600">{new Date(entry.created_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}</td>
                <td className="px-4 py-3 text-xs text-gray-700">
                  <div>{entry.actor_name || 'System'}</div>
                  <div className="text-gray-500">{entry.actor_role || '-'}</div>
                </td>
                <td className="px-4 py-3 text-xs text-gray-700">{formatScannerAuditField(entry.field_name)}</td>
                <td className="px-4 py-3 text-xs text-gray-600 break-all">{formatScannerAuditValue(entry.field_name, entry.old_value)}</td>
                <td className="px-4 py-3 text-xs text-gray-700 break-all">{formatScannerAuditValue(entry.field_name, entry.new_value)}</td>
              </tr>
            ))}
            {scannerAuditHistory.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-400">No scanner changes recorded</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="bg-white border p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h4 className="text-lg font-semibold text-gray-800">Recent Notifications</h4>
          <span className="text-sm text-gray-500">{notifications.length} items</span>
        </div>
        <div className="space-y-3">
          {notifications.map((notification) => (
            <div key={notification.id} className=" border border-gray-200 px-4 py-3">
              <div className="flex items-center justify-between gap-3">
                <div className="text-sm text-gray-700">{notification.message}</div>
                <span className={`px-2 py-1 text-xs font-medium ${notification.is_read ? 'bg-gray-100 text-gray-600' : 'bg-blue-100 text-blue-700'}`}>
                  {notification.is_read ? 'Read' : 'Unread'}
                </span>
              </div>
              <div className="text-xs text-gray-500 mt-1">{new Date(notification.created_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}</div>
            </div>
          ))}
          {notifications.length === 0 && <div className="text-sm text-gray-400">No notifications</div>}
        </div>
      </div>
      <ToastContainer toasts={toasts} dismiss={dismiss} />
    </div>
  );
}