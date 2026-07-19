import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import api from '../utils/api';
import { cleanDisplayText } from '../utils/display';
import { getWalletTransactionLinks } from '../utils/wallet-links';
import PaginatedTable from '../components/PaginatedTable';

function formatCurrency(value) {
  return `₹${Number(value || 0).toLocaleString('en-IN')}`;
}

function renderWithdrawalDestination(withdrawal) {
  if (withdrawal.bank_name || withdrawal.account_number) {
    return (
      <>
        <div>{withdrawal.bank_name || 'Bank transfer'}</div>
        <div className="text-gray-500">{withdrawal.account_number || '-'}</div>
      </>
    );
  }

  if (withdrawal.withdraw_method === 'upi') {
    return (
      <>
        <div>UPI</div>
        <div className="text-gray-500">{withdrawal.upi_id || '-'}</div>
      </>
    );
  }

  if (withdrawal.withdraw_method === 'phone') {
    return (
      <>
        <div>Phone</div>
        <div className="text-gray-500">{withdrawal.phone_number || '-'}</div>
      </>
    );
  }

  return <div>-</div>;
}

export default function UserDetail() {
  const { id } = useParams();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('overview');

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
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-3"></div>
          <div className="text-gray-500 text-sm">Loading user details...</div>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="text-center text-red-600">User not found.</div>
      </div>
    );
  }

  // Table column definitions
  const depositColumns = [
    { header: 'Date', accessor: 'created_at', className: 'text-left', cellClass: 'text-xs text-gray-600 whitespace-nowrap', render: (row) => new Date(row.created_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }) },
    { header: 'Amount', accessor: 'amount', className: 'text-right', cellClass: 'font-semibold text-green-700', render: (row) => formatCurrency(row.amount) },
    { header: 'UTR', accessor: 'utr_number', className: 'text-left', cellClass: 'font-mono text-xs', render: (row) => row.utr_number || '-' },
    { header: 'Payer', accessor: 'payer_name', className: 'text-left', cellClass: 'text-xs text-gray-600', render: (row) => row.payer_name || '-' },
    { header: 'Status', accessor: 'status', className: 'text-center', cellClass: 'text-center', render: (row) => (
      <span className="px-2 py-1 text-xs font-medium bg-green-100 text-green-700 rounded">{row.status}</span>
    )},
  ];

  const walletColumns = [
    { header: 'Date', accessor: 'created_at', className: 'text-left', cellClass: 'text-xs text-gray-600 whitespace-nowrap', render: (row) => new Date(row.created_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }) },
    { header: 'Type', accessor: 'type', className: 'text-left', cellClass: 'text-xs text-gray-700' },
    { header: 'Amount', accessor: 'amount', className: 'text-right', cellClass: 'font-semibold', render: (row) => (
      <span className={Number(row.amount) >= 0 ? 'text-green-700' : 'text-red-700'}>{formatCurrency(row.amount)}</span>
    )},
    { header: 'Balance', accessor: 'balance_after', className: 'text-right', cellClass: 'text-xs text-gray-700', render: (row) => formatCurrency(row.balance_after) },
    { header: 'Reference', accessor: 'reference_type', className: 'text-left', cellClass: 'text-xs text-gray-600', render: (row) => (
      <div>
        <div>{cleanDisplayText(row.reference_type)}</div>
        <div className="text-gray-500">{cleanDisplayText(row.reference_id)}</div>
      </div>
    )},
    { header: 'Actions', accessor: 'actions', className: 'text-left', cellClass: 'text-xs', render: (row) => (
      <div className="flex flex-wrap gap-2">
        {getWalletTransactionLinks(row).filter((link) => link.label !== 'User').map((link) => (
          <Link key={`${row.id}-${link.label}`} to={link.to} className="text-blue-600 hover:underline">{link.label}</Link>
        ))}
      </div>
    )},
  ];

  const withdrawalColumns = [
    { header: 'Date', accessor: 'created_at', className: 'text-left', cellClass: 'text-xs text-gray-600 whitespace-nowrap', render: (row) => new Date(row.created_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }) },
    { header: 'Amount', accessor: 'amount', className: 'text-right', cellClass: 'font-semibold text-gray-800', render: (row) => formatCurrency(row.amount) },
    { header: 'Status', accessor: 'status', className: 'text-center', cellClass: 'text-center', render: (row) => (
      <span className={`px-2 py-1 text-xs font-medium rounded ${row.status === 'approved' ? 'bg-green-100 text-green-700' : row.status === 'rejected' ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700'}`}>
        {row.status}
      </span>
    )},
    { header: 'Bank', accessor: 'bank', className: 'text-left', cellClass: 'text-xs text-gray-600', render: (row) => renderWithdrawalDestination(row) },
    { header: 'Review', accessor: 'review', className: 'text-left', cellClass: 'text-xs text-gray-600', render: (row) => (
      <div>
        <div>{row.approved_by_name || '-'}</div>
        <div className="text-gray-500">{row.reject_reason || '-'}</div>
      </div>
    )},
  ];

  const betColumns = [
    { header: 'Date', accessor: 'created_at', className: 'text-left', cellClass: 'text-xs text-gray-600 whitespace-nowrap', render: (row) => new Date(row.created_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }) },
    { header: 'Game', accessor: 'game_name', className: 'text-left', cellClass: 'text-xs text-gray-700', render: (row) => (
      <div>
        <div>{row.game_name}</div>
        <div className="text-gray-500">{row.result_number || '-'}</div>
      </div>
    )},
    { header: 'Type', accessor: 'type', className: 'text-left', cellClass: 'text-xs text-gray-700' },
    { header: 'Stake', accessor: 'total_amount', className: 'text-right', cellClass: 'text-xs text-gray-700', render: (row) => formatCurrency(row.total_amount) },
    { header: 'Win', accessor: 'win_amount', className: 'text-right', cellClass: 'text-xs text-green-700', render: (row) => formatCurrency(row.win_amount) },
  ];

  const bonusColumns = [
    { header: 'Date', accessor: 'created_at', className: 'text-left', cellClass: 'text-xs text-gray-600 whitespace-nowrap', render: (row) => new Date(row.created_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }) },
    { header: 'Type', accessor: 'type', className: 'text-left', cellClass: 'text-xs text-gray-700' },
    { header: 'Amount', accessor: 'amount', className: 'text-right', cellClass: 'text-xs text-green-700', render: (row) => formatCurrency(row.amount) },
    { header: 'Reference', accessor: 'reference_id', className: 'text-left', cellClass: 'text-xs text-gray-600', render: (row) => cleanDisplayText(row.reference_id) },
  ];

  const bankAccountColumns = [
    { header: 'Bank', accessor: 'bank_name', className: 'text-left', cellClass: 'text-xs text-gray-700', render: (row) => (
      <div>
        <div className="font-medium">{row.bank_name}</div>
        <div className="text-gray-500">{row.account_holder}</div>
      </div>
    )},
    { header: 'Account', accessor: 'account_number', className: 'text-left', cellClass: 'text-xs text-gray-600 font-mono' },
    { header: 'IFSC', accessor: 'ifsc', className: 'text-left', cellClass: 'text-xs text-gray-600' },
    { header: 'Flag', accessor: 'is_flagged', className: 'text-center', cellClass: 'text-xs text-center', render: (row) => row.is_flagged ? (row.flag_reason || 'Flagged') : '-' },
  ];

  const tabs = [
    { id: 'overview', label: 'Overview', count: null },
    { id: 'deposits', label: 'Deposits', count: deposits.length },
    { id: 'withdrawals', label: 'Withdrawals', count: withdrawals.length },
    { id: 'wallet', label: 'Wallet', count: walletTransactions.length },
    { id: 'bets', label: 'Bets', count: bets.length },
    { id: 'bonuses', label: 'Bonuses', count: bonuses.length },
    { id: 'banks', label: 'Bank Accounts', count: bankAccounts.length },
  ];

  return (
    <div className="space-y-4 pb-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h3 className="text-lg sm:text-xl font-semibold text-gray-800">{user.name}</h3>
          <p className="text-xs sm:text-sm text-gray-500 mt-1">User ID: {user.id} • {user.phone}</p>
        </div>
        <div className="flex gap-2">
          {user.moderator_id ? (
            <Link to={`/moderators/${user.moderator_id}`} className="px-3 sm:px-4 py-2 bg-blue-600 text-white hover:bg-blue-700 text-xs sm:text-sm font-medium rounded">Moderator</Link>
          ) : null}
          <Link to="/users" className="px-3 sm:px-4 py-2 bg-white border hover:bg-gray-50 text-xs sm:text-sm font-medium text-gray-700 rounded">Back</Link>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <div className="bg-white border p-3 sm:p-5 rounded">
          <p className="text-xs sm:text-sm text-gray-500">Wallet Balance</p>
          <p className="text-lg sm:text-2xl font-bold text-green-700 mt-1">{formatCurrency(user.balance)}</p>
        </div>
        <div className="bg-white border p-3 sm:p-5 rounded">
          <p className="text-xs sm:text-sm text-gray-500">Bonus Balance</p>
          <p className="text-lg sm:text-2xl font-bold text-blue-700 mt-1">{formatCurrency(user.bonus_balance)}</p>
        </div>
        <div className="bg-white border p-3 sm:p-5 rounded">
          <p className="text-xs sm:text-sm text-gray-500">Deposits</p>
          <p className="text-lg sm:text-2xl font-bold text-gray-800 mt-1">{deposits.length}</p>
        </div>
        <div className="bg-white border p-3 sm:p-5 rounded">
          <p className="text-xs sm:text-sm text-gray-500">Bets</p>
          <p className="text-lg sm:text-2xl font-bold text-amber-700 mt-1">{bets.length}</p>
        </div>
      </div>

      {/* Mobile Tabs */}
      <div className="lg:hidden">
        <div className="flex overflow-x-auto gap-1 pb-2 -mx-2 px-2">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-shrink-0 px-3 py-2 text-xs font-medium rounded whitespace-nowrap ${
                activeTab === tab.id 
                  ? 'bg-blue-600 text-white' 
                  : 'bg-white border text-gray-700 hover:bg-gray-50'
              }`}
            >
              {tab.label}
              {tab.count !== null && (
                <span className={`ml-1 px-1.5 py-0.5 rounded text-xs ${activeTab === tab.id ? 'bg-white/20' : 'bg-gray-100'}`}>
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Desktop: Show all sections / Mobile: Show active tab */}
      <div className={`space-y-4 ${activeTab !== 'overview' && activeTab !== 'deposits' ? 'hidden lg:block' : ''}`}>
        {/* Overview Section */}
        {(activeTab === 'overview' || activeTab === 'deposits') && (
          <div className="bg-white border p-3 sm:p-5 rounded">
            <h4 className="text-base sm:text-lg font-semibold text-gray-800 mb-3">User Information</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs sm:text-sm text-gray-600">
              <div><span className="font-medium text-gray-800">Phone:</span> {user.phone}</div>
              <div><span className="font-medium text-gray-800">Referral:</span> {user.referral_code}</div>
              <div><span className="font-medium text-gray-800">Moderator:</span> {user.moderator_name || '-'}</div>
              <div><span className="font-medium text-gray-800">Status:</span> {user.is_blocked ? <span className="text-red-600">Blocked</span> : <span className="text-green-600">Active</span>}</div>
              <div><span className="font-medium text-gray-800">Created:</span> {new Date(user.created_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}</div>
              <div><span className="font-medium text-gray-800">Updated:</span> {new Date(user.updated_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}</div>
              <div><span className="font-medium text-gray-800">Withdrawals:</span> {withdrawals.length}</div>
              <div><span className="font-medium text-gray-800">Wallet Entries:</span> {walletTransactions.length}</div>
            </div>
          </div>
        )}

        {/* Deposits Section */}
        {(activeTab === 'overview' || activeTab === 'deposits') && (
          <div className="bg-white border rounded overflow-hidden">
            <div className="px-3 sm:px-4 py-3 sm:py-4 border-b border-gray-200 flex items-center justify-between">
              <h4 className="text-base sm:text-lg font-semibold text-gray-800">Deposits</h4>
              <span className="text-xs sm:text-sm text-gray-500">{deposits.length} records</span>
            </div>
            <PaginatedTable 
              data={deposits} 
              columns={depositColumns} 
              emptyMessage="No deposits"
              rowsPerPage={10}
              maxHeight="400px"
            />
          </div>
        )}
      </div>

      {/* Wallet & Withdrawals */}
      <div className={`grid grid-cols-1 xl:grid-cols-2 gap-4 ${activeTab !== 'overview' && activeTab !== 'wallet' && activeTab !== 'withdrawals' ? 'hidden lg:grid' : ''}`}>
        {(activeTab === 'overview' || activeTab === 'wallet') && (
          <div className="bg-white border rounded overflow-hidden">
            <div className="px-3 sm:px-4 py-3 sm:py-4 border-b border-gray-200 flex items-center justify-between">
              <h4 className="text-base sm:text-lg font-semibold text-gray-800">Wallet Transactions</h4>
              <span className="text-xs sm:text-sm text-gray-500">{walletTransactions.length} records</span>
            </div>
            <PaginatedTable 
              data={walletTransactions} 
              columns={walletColumns} 
              emptyMessage="No wallet transactions"
              rowsPerPage={10}
              maxHeight="400px"
            />
          </div>
        )}

        {(activeTab === 'overview' || activeTab === 'withdrawals') && (
          <div className="bg-white border rounded overflow-hidden">
            <div className="px-3 sm:px-4 py-3 sm:py-4 border-b border-gray-200 flex items-center justify-between">
              <h4 className="text-base sm:text-lg font-semibold text-gray-800">Withdrawals</h4>
              <span className="text-xs sm:text-sm text-gray-500">{withdrawals.length} records</span>
            </div>
            <PaginatedTable 
              data={withdrawals} 
              columns={withdrawalColumns} 
              emptyMessage="No withdrawals"
              rowsPerPage={10}
              maxHeight="400px"
            />
          </div>
        )}
      </div>

      {/* Bets & Bonuses/Banks */}
      <div className={`grid grid-cols-1 xl:grid-cols-2 gap-4 ${activeTab !== 'overview' && activeTab !== 'bets' && activeTab !== 'bonuses' && activeTab !== 'banks' ? 'hidden lg:grid' : ''}`}>
        {(activeTab === 'overview' || activeTab === 'bets') && (
          <div className="bg-white border rounded overflow-hidden">
            <div className="px-3 sm:px-4 py-3 sm:py-4 border-b border-gray-200 flex items-center justify-between">
              <h4 className="text-base sm:text-lg font-semibold text-gray-800">Bets</h4>
              <span className="text-xs sm:text-sm text-gray-500">{bets.length} records</span>
            </div>
            <PaginatedTable 
              data={bets} 
              columns={betColumns} 
              emptyMessage="No bets"
              rowsPerPage={10}
              maxHeight="400px"
            />
          </div>
        )}

        <div className={`space-y-4 ${activeTab !== 'overview' && activeTab !== 'bonuses' && activeTab !== 'banks' ? 'hidden lg:block' : ''}`}>
          {(activeTab === 'overview' || activeTab === 'bonuses') && (
            <div className="bg-white border rounded overflow-hidden">
              <div className="px-3 sm:px-4 py-3 sm:py-4 border-b border-gray-200 flex items-center justify-between">
                <h4 className="text-base sm:text-lg font-semibold text-gray-800">Bonuses</h4>
                <span className="text-xs sm:text-sm text-gray-500">{bonuses.length} records</span>
              </div>
              <PaginatedTable 
                data={bonuses} 
                columns={bonusColumns} 
                emptyMessage="No bonuses"
                rowsPerPage={5}
                maxHeight="250px"
              />
            </div>
          )}

          {(activeTab === 'overview' || activeTab === 'banks') && (
            <div className="bg-white border rounded overflow-hidden">
              <div className="px-3 sm:px-4 py-3 sm:py-4 border-b border-gray-200 flex items-center justify-between">
                <h4 className="text-base sm:text-lg font-semibold text-gray-800">Bank Accounts</h4>
                <span className="text-xs sm:text-sm text-gray-500">{bankAccounts.length} records</span>
              </div>
              <PaginatedTable 
                data={bankAccounts} 
                columns={bankAccountColumns} 
                emptyMessage="No bank accounts"
                rowsPerPage={5}
                maxHeight="250px"
              />
            </div>
          )}
        </div>
      </div>

      {/* Notifications */}
      {activeTab === 'overview' && (
        <div className="bg-white border p-3 sm:p-5 rounded">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-base sm:text-lg font-semibold text-gray-800">Recent Notifications</h4>
            <span className="text-xs sm:text-sm text-gray-500">{notifications.length} items</span>
          </div>
          <div className="space-y-2 max-h-[300px] overflow-y-auto">
            {notifications.slice(0, 10).map((notification) => (
              <div key={notification.id} className="border border-gray-200 px-3 sm:px-4 py-3 rounded">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-xs sm:text-sm text-gray-700 flex-1">{notification.message}</div>
                  <span className={`flex-shrink-0 px-2 py-1 text-xs font-medium rounded ${notification.is_read ? 'bg-gray-100 text-gray-600' : 'bg-blue-100 text-blue-700'}`}>
                    {notification.is_read ? 'Read' : 'Unread'}
                  </span>
                </div>
                <div className="text-xs text-gray-500 mt-1">{new Date(notification.created_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}</div>
              </div>
            ))}
            {notifications.length === 0 && <div className="text-xs sm:text-sm text-gray-400">No notifications</div>}
          </div>
        </div>
      )}
    </div>
  );
}
