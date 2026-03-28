import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import api, { buildUploadUrl } from '../utils/api';
import { useToast, ToastContainer } from '../components/ui';

function formatCurrency(value) {
  return `₹${Number(value || 0).toLocaleString('en-IN')}`;
}

function formatApprovedBy(transaction) {
  if (!transaction?.approved_by_name || !transaction?.approved_by_role) {
    return '-';
  }

  return `${transaction.approved_by_role.charAt(0).toUpperCase() + transaction.approved_by_role.slice(1)} ${transaction.approved_by_name}`;
}

function formatScannerAuditField(fieldName) {
  const labels = {
    scanner_label: 'Scanner Label',
    upi_id: 'UPI ID',
    scanner_enabled: 'Scanner Status',
    qr_code_image: 'QR Image',
  };

  return labels[fieldName] || fieldName || '-';
}

function formatScannerAuditValue(fieldName, value) {
  if (!value) {
    return '-';
  }

  if (fieldName === 'qr_code_image') {
    return String(value).split('/').pop() || value;
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

function getFileName(filePath) {
  if (!filePath) {
    return '';
  }

  return String(filePath).split('/').pop() || filePath;
}

export default function ModeratorDetail() {
  const { id } = useParams();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [adjustAmount, setAdjustAmount] = useState('');
  const [adjustNote, setAdjustNote] = useState('');
  const [saving, setSaving] = useState(false);
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

  const submitAdjustment = async () => {
    const amount = parseFloat(adjustAmount);

    if (!Number.isFinite(amount) || amount === 0) {
      toastError('Enter a non-zero amount.');
      return;
    }

    try {
      setSaving(true);
      await api.put(`/moderators/${id}/float`, { amount, note: adjustNote });
      setAdjustAmount('');
      setAdjustNote('');
      await loadDetail();
    } catch (error) {
      toastError(error.response?.data?.error || 'Failed to update float');
    } finally {
      setSaving(false);
    }
  };

  const moderator = data?.moderator;
  const deposits = data?.deposit_transactions || [];
  const floats = data?.float_transactions || [];
  const assignedUsers = data?.assigned_users || [];
  const notifications = data?.notifications || [];
  const scannerAuditHistory = data?.scanner_audit_history || [];
  const upiDetails = parseUpiDetails(moderator?.upi_id);
  const qrFileName = getFileName(moderator?.qr_code_image);

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
          <p className="text-sm text-gray-500 mt-1">Moderator detail, deposit audit, assigned users, and float history</p>
        </div>
        <div className="flex gap-2">
          <Link to="/moderator-scanners" className="px-4 py-2 bg-white border hover:bg-gray-50 text-sm font-medium text-gray-700">Scanner View</Link>
          <Link to="/moderator-floats" className="px-4 py-2 bg-white border hover:bg-gray-50 text-sm font-medium text-gray-700">Float Table</Link>
          <Link to="/moderators" className="px-4 py-2 bg-white border hover:bg-gray-50 text-sm font-medium text-gray-700">Back</Link>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border p-5">
          <p className="text-sm text-gray-500">Float Balance</p>
          <p className="text-2xl font-bold text-green-700 mt-1">{formatCurrency(moderator.float_balance)}</p>
        </div>
        <div className="bg-white border p-5">
          <p className="text-sm text-gray-500">Assigned Users</p>
          <p className="text-2xl font-bold text-blue-700 mt-1">{moderator.user_count}</p>
        </div>
        <div className="bg-white border p-5">
          <p className="text-sm text-gray-500">Approved Deposits</p>
          <p className="text-2xl font-bold text-gray-800 mt-1">{moderator.approved_deposit_count}</p>
          <p className="text-xs text-gray-500 mt-1">{formatCurrency(moderator.approved_deposit_amount)}</p>
        </div>
        <div className="bg-white border p-5">
          <p className="text-sm text-gray-500">Pending Deposits</p>
          <p className="text-2xl font-bold text-amber-700 mt-1">{moderator.pending_deposits}</p>
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
            <div className="sm:col-span-2 break-all"><span className="font-medium text-gray-800">QR File:</span> {qrFileName || '-'}</div>
            <div className="sm:col-span-2 break-all"><span className="font-medium text-gray-800">QR Path:</span> {moderator.qr_code_image || '-'}</div>
          </div>
          <div className="space-y-2">
            {moderator.qr_code_image ? (
              <>
                <img src={buildUploadUrl(moderator.qr_code_image)} alt={`${moderator.name} QR`} className="h-48 w-48 border object-contain bg-white p-2" />
                <a href={buildUploadUrl(moderator.qr_code_image)} target="_blank" rel="noreferrer" className="text-sm text-blue-600 hover:underline inline-block">
                  Open QR image
                </a>
              </>
            ) : (
              <div className="text-sm text-gray-400">No QR uploaded</div>
            )}
          </div>
        </div>

        <div className="bg-white border p-5 space-y-3 lg:col-span-2">
          <div className="flex items-center justify-between">
            <h4 className="text-lg font-semibold text-gray-800">Adjust Float</h4>
            <span className={`px-2 py-1 text-xs font-medium ${moderator.is_blocked ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
              {moderator.is_blocked ? 'Blocked' : 'Active'}
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <input
              type="number"
              step="0.01"
              value={adjustAmount}
              onChange={(event) => setAdjustAmount(event.target.value)}
              placeholder="+/- amount"
              className="px-4 py-2 border"
            />
            <input
              type="text"
              value={adjustNote}
              onChange={(event) => setAdjustNote(event.target.value)}
              placeholder="Note"
              className="px-4 py-2 border"
            />
          </div>
          <button
            type="button"
            disabled={saving}
            onClick={submitAdjustment}
            className="px-4 py-2 bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50 text-sm font-medium"
          >
            {saving ? 'Updating...' : 'Update Float'}
          </button>
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
              <th className="text-center px-4 py-3 font-medium text-gray-600">Status</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Review</th>
              <th className="text-center px-4 py-3 font-medium text-gray-600">Receipt</th>
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
                <td className="px-4 py-3 text-center">
                  <div className="space-y-1">
                    <span className={`px-2 py-1 text-xs font-medium ${transaction.status === 'approved' ? 'bg-green-100 text-green-700' : transaction.status === 'rejected' ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700'}`}>
                      {transaction.status}
                    </span>
                    {transaction.large_new_user_flag ? <div className="text-[11px] text-amber-700">Large new-user flag</div> : null}
                  </div>
                </td>
                <td className="px-4 py-3 text-xs text-gray-600">
                  <div>{formatApprovedBy(transaction)}</div>
                  <div className="text-gray-500">{transaction.reviewed_at ? new Date(transaction.reviewed_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }) : '-'}</div>
                </td>
                <td className="px-4 py-3 text-center text-xs">
                  {transaction.receipt_image ? <a href={buildUploadUrl(transaction.receipt_image)} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline">View</a> : '-'}
                </td>
              </tr>
            ))}
            {deposits.length === 0 && (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-400">No deposit transactions</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <div className="bg-white border overflow-x-auto">
          <div className="px-4 py-4 border-b border-gray-200 flex items-center justify-between">
            <h4 className="text-lg font-semibold text-gray-800">Float Transactions</h4>
            <span className="text-sm text-gray-500">{floats.length} records</span>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Date</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Type</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">Amount</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">Balance After</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Remark</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {floats.map((transaction) => (
                <tr key={transaction.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-xs text-gray-600">{new Date(transaction.created_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}</td>
                  <td className="px-4 py-3 text-xs text-gray-700">{transaction.type}</td>
                  <td className={`px-4 py-3 text-right font-semibold ${Number(transaction.amount) >= 0 ? 'text-green-700' : 'text-red-700'}`}>{formatCurrency(transaction.amount)}</td>
                  <td className="px-4 py-3 text-right text-xs text-gray-700">{formatCurrency(transaction.balance_after)}</td>
                  <td className="px-4 py-3 text-xs text-gray-600">
                    <div>{transaction.remark || '-'}</div>
                    <div className="text-gray-500">{transaction.actor_name ? `${transaction.actor_name} (${transaction.actor_role})` : '-'}</div>
                  </td>
                </tr>
              ))}
              {floats.length === 0 && (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-400">No float transactions</td></tr>
              )}
            </tbody>
          </table>
        </div>

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