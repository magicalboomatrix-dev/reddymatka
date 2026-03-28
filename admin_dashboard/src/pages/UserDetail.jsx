import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import api, { buildUploadUrl } from '../utils/api';

function formatCurrency(value) {
  return `₹${Number(value || 0).toLocaleString('en-IN')}`;
}

function formatApprovedBy(item) {
  if (!item?.approved_by_name) {
    return '-';
  }

  const role = item.approved_by_role ? `${item.approved_by_role.charAt(0).toUpperCase() + item.approved_by_role.slice(1)} ` : '';
  return `${role}${item.approved_by_name}`;
}

export default function UserDetail() {
  const { id } = useParams();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const loadDetail = async () => {
    setLoading(true);
    try {
      const res = await api.get(`/admin/users/${id}/detail`);
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

  const user = data?.user;
  const deposits = data?.deposits || [];
  const withdrawals = data?.withdrawals || [];
  const walletTransactions = data?.wallet_transactions || [];
  const bets = data?.bets || [];
  const bonuses = data?.bonuses || [];
  const bankAccounts = data?.bank_accounts || [];
  const notifications = data?.notifications || [];

  if (loading) {
    return <div className="text-center py-10 text-gray-500">Loading user details...</div>;
  }

  if (!user) {
    return <div className="text-center py-10 text-red-600">User not found.</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h3 className="text-xl font-semibold text-gray-800">{user.name}</h3>
          <p className="text-sm text-gray-500 mt-1">User detail with deposits, wallet ledger, withdrawals, bets, bank accounts, and notifications</p>
        </div>
        <div className="flex gap-2">
          <Link to="/users" className="px-4 py-2 bg-white border hover:bg-gray-50 text-sm font-medium text-gray-700">Back</Link>
          {user.moderator_id ? (
            <Link to={`/moderators/${user.moderator_id}`} className="px-4 py-2 bg-blue-600 text-white hover:bg-blue-700 text-sm font-medium">Moderator</Link>
          ) : null}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border p-5">
          <p className="text-sm text-gray-500">Wallet Balance</p>
          <p className="text-2xl font-bold text-green-700 mt-1">{formatCurrency(user.balance)}</p>
        </div>
        <div className="bg-white border p-5">
          <p className="text-sm text-gray-500">Bonus Balance</p>
          <p className="text-2xl font-bold text-blue-700 mt-1">{formatCurrency(user.bonus_balance)}</p>
        </div>
        <div className="bg-white border p-5">
          <p className="text-sm text-gray-500">Deposits</p>
          <p className="text-2xl font-bold text-gray-800 mt-1">{deposits.length}</p>
        </div>
        <div className="bg-white border p-5">
          <p className="text-sm text-gray-500">Bets</p>
          <p className="text-2xl font-bold text-amber-700 mt-1">{bets.length}</p>
        </div>
      </div>

      <div className="bg-white border p-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-sm text-gray-600">
          <div><span className="font-medium text-gray-800">Phone:</span> {user.phone}</div>
          <div><span className="font-medium text-gray-800">Referral:</span> {user.referral_code}</div>
          <div><span className="font-medium text-gray-800">Moderator:</span> {user.moderator_name || '-'}</div>
          <div><span className="font-medium text-gray-800">Status:</span> {user.is_blocked ? 'Blocked' : 'Active'}</div>
          <div><span className="font-medium text-gray-800">Created:</span> {new Date(user.created_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}</div>
          <div><span className="font-medium text-gray-800">Updated:</span> {new Date(user.updated_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}</div>
          <div><span className="font-medium text-gray-800">Withdrawals:</span> {withdrawals.length}</div>
          <div><span className="font-medium text-gray-800">Wallet Entries:</span> {walletTransactions.length}</div>
        </div>
      </div>

      <div className="bg-white border overflow-x-auto">
        <div className="px-4 py-4 border-b border-gray-200"><h4 className="text-lg font-semibold text-gray-800">Deposits</h4></div>
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Date</th>
              <th className="text-right px-4 py-3 font-medium text-gray-600">Amount</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">UTR</th>
              <th className="text-center px-4 py-3 font-medium text-gray-600">Status</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Review</th>
              <th className="text-center px-4 py-3 font-medium text-gray-600">Receipt</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {deposits.map((deposit) => (
              <tr key={deposit.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 text-xs text-gray-600">{new Date(deposit.created_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}</td>
                <td className="px-4 py-3 text-right font-semibold text-green-700">{formatCurrency(deposit.amount)}</td>
                <td className="px-4 py-3 font-mono text-xs">{deposit.utr_number}</td>
                <td className="px-4 py-3 text-center">
                  <span className={`px-2 py-1 text-xs font-medium ${deposit.status === 'approved' ? 'bg-green-100 text-green-700' : deposit.status === 'rejected' ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700'}`}>
                    {deposit.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-xs text-gray-600">
                  <div>{formatApprovedBy(deposit)}</div>
                  <div className="text-gray-500">{deposit.reviewed_at ? new Date(deposit.reviewed_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }) : '-'}</div>
                </td>
                <td className="px-4 py-3 text-center text-xs">
                  {deposit.receipt_image ? <a href={buildUploadUrl(deposit.receipt_image)} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline">View</a> : '-'}
                </td>
              </tr>
            ))}
            {deposits.length === 0 && <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400">No deposits</td></tr>}
          </tbody>
        </table>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <div className="bg-white border overflow-x-auto">
          <div className="px-4 py-4 border-b border-gray-200"><h4 className="text-lg font-semibold text-gray-800">Wallet Transactions</h4></div>
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Date</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Type</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">Amount</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">Balance After</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Reference</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {walletTransactions.map((transaction) => (
                <tr key={transaction.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-xs text-gray-600">{new Date(transaction.created_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}</td>
                  <td className="px-4 py-3 text-xs text-gray-700">{transaction.type}</td>
                  <td className={`px-4 py-3 text-right font-semibold ${Number(transaction.amount) >= 0 ? 'text-green-700' : 'text-red-700'}`}>{formatCurrency(transaction.amount)}</td>
                  <td className="px-4 py-3 text-right text-xs text-gray-700">{formatCurrency(transaction.balance_after)}</td>
                  <td className="px-4 py-3 text-xs text-gray-600">
                    <div>{transaction.reference_type || '-'}</div>
                    <div className="text-gray-500">{transaction.reference_id || '-'}</div>
                  </td>
                </tr>
              ))}
              {walletTransactions.length === 0 && <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-400">No wallet transactions</td></tr>}
            </tbody>
          </table>
        </div>

        <div className="bg-white border overflow-x-auto">
          <div className="px-4 py-4 border-b border-gray-200"><h4 className="text-lg font-semibold text-gray-800">Withdrawals</h4></div>
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Date</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">Amount</th>
                <th className="text-center px-4 py-3 font-medium text-gray-600">Status</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Bank</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Review</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {withdrawals.map((withdrawal) => (
                <tr key={withdrawal.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-xs text-gray-600">{new Date(withdrawal.created_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}</td>
                  <td className="px-4 py-3 text-right font-semibold text-gray-800">{formatCurrency(withdrawal.amount)}</td>
                  <td className="px-4 py-3 text-center">
                    <span className={`px-2 py-1 text-xs font-medium ${withdrawal.status === 'approved' ? 'bg-green-100 text-green-700' : withdrawal.status === 'rejected' ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700'}`}>
                      {withdrawal.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-600">
                    <div>{withdrawal.bank_name}</div>
                    <div className="text-gray-500">{withdrawal.account_number}</div>
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-600">
                    <div>{withdrawal.approved_by_name || '-'}</div>
                    <div className="text-gray-500">{withdrawal.reject_reason || '-'}</div>
                  </td>
                </tr>
              ))}
              {withdrawals.length === 0 && <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-400">No withdrawals</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <div className="bg-white border overflow-x-auto">
          <div className="px-4 py-4 border-b border-gray-200"><h4 className="text-lg font-semibold text-gray-800">Bets</h4></div>
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Date</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Game</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Type</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">Stake</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">Win</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {bets.map((bet) => (
                <tr key={bet.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-xs text-gray-600">{new Date(bet.created_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}</td>
                  <td className="px-4 py-3 text-xs text-gray-700">
                    <div>{bet.game_name}</div>
                    <div className="text-gray-500">{bet.result_number || '-'}</div>
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-700">{bet.type}</td>
                  <td className="px-4 py-3 text-right text-xs text-gray-700">{formatCurrency(bet.total_amount)}</td>
                  <td className="px-4 py-3 text-right text-xs text-green-700">{formatCurrency(bet.win_amount)}</td>
                </tr>
              ))}
              {bets.length === 0 && <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-400">No bets</td></tr>}
            </tbody>
          </table>
        </div>

        <div className="space-y-4">
          <div className="bg-white border overflow-x-auto">
            <div className="px-4 py-4 border-b border-gray-200"><h4 className="text-lg font-semibold text-gray-800">Bonuses</h4></div>
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Date</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Type</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">Amount</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Reference</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {bonuses.map((bonus) => (
                  <tr key={bonus.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-xs text-gray-600">{new Date(bonus.created_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}</td>
                    <td className="px-4 py-3 text-xs text-gray-700">{bonus.type}</td>
                    <td className="px-4 py-3 text-right text-xs text-green-700">{formatCurrency(bonus.amount)}</td>
                    <td className="px-4 py-3 text-xs text-gray-600">{bonus.reference_id || '-'}</td>
                  </tr>
                ))}
                {bonuses.length === 0 && <tr><td colSpan={4} className="px-4 py-8 text-center text-gray-400">No bonuses</td></tr>}
              </tbody>
            </table>
          </div>

          <div className="bg-white border overflow-x-auto">
            <div className="px-4 py-4 border-b border-gray-200"><h4 className="text-lg font-semibold text-gray-800">Bank Accounts</h4></div>
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Bank</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Account</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">IFSC</th>
                  <th className="text-center px-4 py-3 font-medium text-gray-600">Flag</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {bankAccounts.map((account) => (
                  <tr key={account.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-xs text-gray-700">
                      <div>{account.bank_name}</div>
                      <div className="text-gray-500">{account.account_holder}</div>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-600">{account.account_number}</td>
                    <td className="px-4 py-3 text-xs text-gray-600">{account.ifsc}</td>
                    <td className="px-4 py-3 text-center text-xs text-gray-600">{account.is_flagged ? (account.flag_reason || 'Flagged') : '-'}</td>
                  </tr>
                ))}
                {bankAccounts.length === 0 && <tr><td colSpan={4} className="px-4 py-8 text-center text-gray-400">No bank accounts</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="bg-white border p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h4 className="text-lg font-semibold text-gray-800">Recent Notifications</h4>
          <span className="text-sm text-gray-500">{notifications.length} items</span>
        </div>
        <div className="space-y-3">
          {notifications.map((notification) => (
            <div key={notification.id} className="border border-gray-200 px-4 py-3">
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
    </div>
  );
}