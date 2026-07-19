import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../utils/api';
import { useAuth } from '../context/AuthContext';
import { cleanDisplayText } from '../utils/display';
import { getWalletTransactionLinks } from '../utils/wallet-links';
import SavedFilterPresets from '../components/SavedFilterPresets';

const TYPE_OPTIONS = ['deposit', 'bet', 'win', 'withdraw', 'adjustment', 'bonus', 'refund'];
const STATUS_OPTIONS = ['pending', 'completed', 'failed'];
const TYPE_COLORS = {
  deposit: 'text-green-700',
  bet: 'text-red-600',
  win: 'text-emerald-700',
  withdraw: 'text-red-700',
  adjustment: 'text-blue-700',
  bonus: 'text-amber-700',
  refund: 'text-teal-700',
};

function formatCurrency(value) {
  return `₹${Number(value || 0).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function escapeCsvValue(value) {
  const normalized = String(value ?? '');
  if (/[",\n]/.test(normalized)) {
    return `"${normalized.replace(/"/g, '""')}"`;
  }
  return normalized;
}

function downloadFile(fileName, content, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.URL.revokeObjectURL(url);
}

function buildWalletTransactionsCsv({ filters, summary, transactions, selectedModerator }) {
  const rows = [
    ['Wallet Transactions'],
    ['Search', filters.search || ''],
    ['User ID', filters.user_id || ''],
    ['Moderator', selectedModerator?.name || 'All Moderators'],
    ['Type', filters.type || 'All Types'],
    ['Reference Type', filters.reference_type || 'All References'],
    ['Status', filters.status || 'All Status'],
    ['Direction', filters.direction || 'All'],
    ['From Date', filters.from_date || ''],
    ['To Date', filters.to_date || ''],
    [],
    ['Summary'],
    ['Total Transactions', summary.total_transactions || 0],
    ['Credits', Number(summary.total_credits || 0).toLocaleString('en-IN')],
    ['Debits', Number(summary.total_debits || 0).toLocaleString('en-IN')],
    ['Net Flow', Number(summary.net_flow || 0).toLocaleString('en-IN')],
    ['Users', summary.unique_users || 0],
    ['Pending', summary.pending_transactions || 0],
    [],
    ['Ledger'],
    ['ID', 'Date', 'User ID', 'User', 'Phone', 'Moderator', 'Type', 'Amount', 'Balance After', 'Status', 'Reference Type', 'Reference ID', 'Remark'],
    ...transactions.map((transaction) => [
      transaction.id,
      transaction.created_at ? new Date(transaction.created_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }) : '',
      transaction.user_id,
      transaction.user_name,
      transaction.user_phone,
      cleanDisplayText(transaction.moderator_name, ''),
      transaction.type,
      Number(transaction.amount || 0).toLocaleString('en-IN'),
      Number(transaction.balance_after || 0).toLocaleString('en-IN'),
      transaction.status,
      cleanDisplayText(transaction.reference_type, ''),
      cleanDisplayText(transaction.reference_id, ''),
      cleanDisplayText(transaction.remark, ''),
    ]),
  ];

  return rows.map((row) => row.map(escapeCsvValue).join(',')).join('\n');
}

export default function WalletTransactions() {
  const { user } = useAuth();
  const [moderators, setModerators] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [typeBreakdown, setTypeBreakdown] = useState([]);
  const [pagination, setPagination] = useState({});
  const [summary, setSummary] = useState({});
  const [filters, setFilters] = useState({
    search: '',
    user_id: '',
    moderator_id: '',
    type: '',
    reference_type: '',
    status: '',
    direction: '',
    from_date: '',
    to_date: '',
  });
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (user?.role !== 'admin') return;

    api.get('/moderators')
      .then((res) => setModerators(Array.isArray(res.data.moderators) ? res.data.moderators : []))
      .catch(console.error);
  }, [user?.role]);

  useEffect(() => {
    if (user?.role !== 'admin') return;

    const loadTransactions = async () => {
      setLoading(true);
      setError('');
      try {
        const params = { page, limit: 25 };
        Object.entries(filters).forEach(([key, value]) => {
          if (String(value || '').trim()) params[key] = String(value).trim();
        });

        const res = await api.get('/wallet-audit/transactions', { params });
        setTransactions(Array.isArray(res.data.transactions) ? res.data.transactions : []);
        setPagination(res.data.pagination || {});
        setSummary(res.data.summary || {});
        setTypeBreakdown(Array.isArray(res.data.type_breakdown) ? res.data.type_breakdown : []);
      } catch (requestError) {
        console.error(requestError);
        setError('Failed to load wallet transactions.');
      } finally {
        setLoading(false);
      }
    };

    loadTransactions();
  }, [page, filters, user?.role]);

  if (user?.role !== 'admin') {
    return <div className="bg-white border p-6 text-sm text-gray-600">Wallet transaction reporting is available for admins only.</div>;
  }

  const updateFilter = (key, value) => {
    setPage(1);
    setFilters((current) => ({ ...current, [key]: value }));
  };

  const clearFilters = () => {
    setPage(1);
    setFilters({
      search: '',
      user_id: '',
      moderator_id: '',
      type: '',
      reference_type: '',
      status: '',
      direction: '',
      from_date: '',
      to_date: '',
    });
  };

  const handleExportCsv = () => {
    const selectedModerator = moderators.find((moderator) => String(moderator.id) === String(filters.moderator_id));
    const csv = buildWalletTransactionsCsv({
      filters,
      summary,
      transactions,
      selectedModerator,
    });
    downloadFile('wallet-transactions.csv', csv, 'text/csv;charset=utf-8;');
  };

  const selectedModerator = moderators.find((moderator) => String(moderator.id) === String(filters.moderator_id));

  return (
    <div className="space-y-4 print:space-y-3">
      <div className="bg-white border p-4 sm:p-5 space-y-4 print:border-0 print:p-0">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
          <div>
            <h3 className="text-xl font-semibold text-gray-800">Wallet Transactions</h3>
            <p className="text-sm text-gray-500 mt-1">
              Full wallet ledger across deposits, bets, wins, withdrawals, adjustments, refunds, and bonus-linked entries.
            </p>
          </div>
          <div className="flex flex-col items-start gap-3 lg:items-end">
            <div className="text-sm text-gray-500">Showing {pagination.total || 0} ledger rows</div>
            <div className="flex flex-wrap gap-2 print:hidden">
              <button type="button" onClick={handleExportCsv} disabled={loading} className="px-4 py-2 bg-emerald-600 text-white hover:bg-emerald-700 text-sm font-medium disabled:opacity-50">Export CSV</button>
              <button type="button" onClick={() => window.print()} disabled={loading} className="px-4 py-2 bg-slate-700 text-white hover:bg-slate-800 text-sm font-medium disabled:opacity-50">Print</button>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-3 print:hidden">
          <input type="text" placeholder="Search user, phone, reference, remark..." value={filters.search} onChange={(event) => updateFilter('search', event.target.value)} className="w-full px-3 py-2 border text-sm focus:ring-2 focus:ring-primary-500 outline-none" />
          <input type="number" placeholder="User ID" value={filters.user_id} onChange={(event) => updateFilter('user_id', event.target.value)} className="w-full px-3 py-2 border text-sm focus:ring-2 focus:ring-primary-500 outline-none" />
          <select value={filters.moderator_id} onChange={(event) => updateFilter('moderator_id', event.target.value)} className="w-full px-3 py-2 border bg-white text-sm focus:ring-2 focus:ring-primary-500 outline-none">
            <option value="">All Moderators</option>
            {moderators.map((moderator) => <option key={moderator.id} value={String(moderator.id)}>{moderator.name}</option>)}
          </select>
          <select value={filters.type} onChange={(event) => updateFilter('type', event.target.value)} className="w-full px-3 py-2 border bg-white text-sm focus:ring-2 focus:ring-primary-500 outline-none">
            <option value="">All Types</option>
            {TYPE_OPTIONS.map((type) => <option key={type} value={type}>{type}</option>)}
          </select>
          <input type="text" placeholder="Reference type" value={filters.reference_type} onChange={(event) => updateFilter('reference_type', event.target.value)} className="w-full px-3 py-2 border text-sm focus:ring-2 focus:ring-primary-500 outline-none" />
          <select value={filters.status} onChange={(event) => updateFilter('status', event.target.value)} className="w-full px-3 py-2 border bg-white text-sm focus:ring-2 focus:ring-primary-500 outline-none">
            <option value="">All Status</option>
            {STATUS_OPTIONS.map((status) => <option key={status} value={status}>{status}</option>)}
          </select>
          <select value={filters.direction} onChange={(event) => updateFilter('direction', event.target.value)} className="w-full px-3 py-2 border bg-white text-sm focus:ring-2 focus:ring-primary-500 outline-none">
            <option value="">All Directions</option>
            <option value="credit">Credits Only</option>
            <option value="debit">Debits Only</option>
          </select>
          <input type="date" value={filters.from_date} onChange={(event) => updateFilter('from_date', event.target.value)} className="w-full px-3 py-2 border text-sm focus:ring-2 focus:ring-primary-500 outline-none" />
          <div className="flex gap-3 md:col-span-2 xl:col-span-2">
            <input type="date" value={filters.to_date} onChange={(event) => updateFilter('to_date', event.target.value)} className="w-full px-3 py-2 border text-sm focus:ring-2 focus:ring-primary-500 outline-none" />
            <button type="button" onClick={clearFilters} className="px-4 py-2 border text-sm font-medium text-gray-600 hover:bg-gray-50">Clear</button>
          </div>
        </div>

        <SavedFilterPresets
          storageKey="wallet-transactions"
          currentFilters={filters}
          onApply={(nextFilters) => {
            setPage(1);
            setFilters((current) => ({ ...current, ...nextFilters }));
          }}
        />
      </div>

      {error ? <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 text-sm">{error}</div> : null}

      <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
        <div className="bg-white border p-4"><p className="text-xs text-gray-500">Transactions</p><p className="text-2xl font-bold text-gray-800">{summary.total_transactions || 0}</p></div>
        <div className="bg-white border p-4"><p className="text-xs text-gray-500">Credits</p><p className="text-2xl font-bold text-green-700">{formatCurrency(summary.total_credits)}</p></div>
        <div className="bg-white border p-4"><p className="text-xs text-gray-500">Debits</p><p className="text-2xl font-bold text-red-600">{formatCurrency(summary.total_debits)}</p></div>
        <div className="bg-white border p-4"><p className="text-xs text-gray-500">Net Flow</p><p className={`text-2xl font-bold ${Number(summary.net_flow || 0) >= 0 ? 'text-green-700' : 'text-red-600'}`}>{formatCurrency(summary.net_flow)}</p></div>
        <div className="bg-white border p-4"><p className="text-xs text-gray-500">Users</p><p className="text-2xl font-bold text-gray-800">{summary.unique_users || 0}</p></div>
        <div className="bg-white border p-4"><p className="text-xs text-gray-500">Pending Rows</p><p className="text-2xl font-bold text-amber-700">{summary.pending_transactions || 0}</p></div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <div className="bg-white border p-5">
          <h4 className="text-lg font-semibold text-gray-800">How The Wallet Ledger Works</h4>
          <div className="mt-3 space-y-2 text-sm text-gray-600">
            <p><span className="font-medium text-gray-800">Deposits</span> add withdrawable wallet balance.</p>
            <p><span className="font-medium text-gray-800">Bets</span> debit wallet balance, and bonus-backed bet usage appears under separate bonus-linked references.</p>
            <p><span className="font-medium text-gray-800">Wins</span> credit settled bet payouts back into wallet balance.</p>
            <p><span className="font-medium text-gray-800">Withdrawals</span> create pending debits first and later move to completed or failed.</p>
            <p><span className="font-medium text-gray-800">Bonuses</span> are shown in the ledger for visibility, but they primarily increase bonus balance rather than cash withdrawal balance.</p>
          </div>
        </div>
        <div className="bg-white border p-5">
          <h4 className="text-lg font-semibold text-gray-800">Current Filter Snapshot</h4>
          <div className="mt-3 grid grid-cols-2 gap-3 text-sm text-gray-600">
            <div><span className="font-medium text-gray-800">Moderator:</span> {selectedModerator?.name || 'All'}</div>
            <div><span className="font-medium text-gray-800">Type:</span> {filters.type || 'All'}</div>
            <div><span className="font-medium text-gray-800">Reference:</span> {filters.reference_type || 'All'}</div>
            <div><span className="font-medium text-gray-800">Status:</span> {filters.status || 'All'}</div>
            <div><span className="font-medium text-gray-800">Direction:</span> {filters.direction || 'All'}</div>
            <div><span className="font-medium text-gray-800">Dates:</span> {filters.from_date || 'Any'} to {filters.to_date || 'Any'}</div>
          </div>
        </div>
      </div>

      <div className="bg-white border overflow-x-auto print:border-0">
        <div className="px-5 py-4 border-b flex items-center justify-between">
          <h4 className="text-lg font-semibold text-gray-800">Type Breakdown</h4>
          <span className="text-sm text-gray-500">Grouped by wallet transaction type</span>
        </div>
        <table className="w-full text-sm min-w-[720px]">
          <thead className="bg-gray-50">
            <tr>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Type</th>
              <th className="text-right px-4 py-3 font-medium text-gray-600">Count</th>
              <th className="text-right px-4 py-3 font-medium text-gray-600">Credits</th>
              <th className="text-right px-4 py-3 font-medium text-gray-600">Debits</th>
              <th className="text-right px-4 py-3 font-medium text-gray-600">Net</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {typeBreakdown.map((row) => (
              <tr key={row.type} className="hover:bg-gray-50">
                <td className={`px-4 py-3 font-medium capitalize ${TYPE_COLORS[row.type] || 'text-gray-700'}`}>{row.type}</td>
                <td className="px-4 py-3 text-right text-gray-700">{row.transaction_count}</td>
                <td className="px-4 py-3 text-right text-green-700">{formatCurrency(row.credits)}</td>
                <td className="px-4 py-3 text-right text-red-600">{formatCurrency(row.debits)}</td>
                <td className={`px-4 py-3 text-right font-semibold ${Number(row.net_amount || 0) >= 0 ? 'text-green-700' : 'text-red-600'}`}>{formatCurrency(row.net_amount)}</td>
              </tr>
            ))}
            {typeBreakdown.length === 0 ? <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-400">No type breakdown available</td></tr> : null}
          </tbody>
        </table>
      </div>

      <div className="bg-white border overflow-x-auto print:border-0">
        <table className="w-full text-sm min-w-[1450px]">
          <thead className="bg-gray-50">
            <tr>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Date</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">User</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Type</th>
              <th className="text-right px-4 py-3 font-medium text-gray-600">Amount</th>
              <th className="text-right px-4 py-3 font-medium text-gray-600">Balance After</th>
              <th className="text-center px-4 py-3 font-medium text-gray-600">Status</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Reference Type</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Reference ID</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Remark</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {transactions.map((transaction) => (
              <tr key={transaction.id} className="hover:bg-gray-50 align-top">
                <td className="px-4 py-3 text-xs text-gray-600">
                  <div className="font-medium text-gray-800">#{transaction.id}</div>
                  <div>{new Date(transaction.created_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}</div>
                </td>
                <td className="px-4 py-3 text-xs text-gray-700">
                  <Link to={`/users/${transaction.user_id}`} className="text-blue-600 hover:underline font-medium">{transaction.user_name}</Link>
                  <div className="text-gray-500">#{transaction.user_id} • {transaction.user_phone}</div>
                  {transaction.moderator_id ? <div className="text-gray-400">Mod: <Link to={`/moderators/${transaction.moderator_id}`} className="text-blue-600 hover:underline">{cleanDisplayText(transaction.moderator_name, String(transaction.moderator_id))}</Link></div> : null}
                </td>
                <td className={`px-4 py-3 text-xs font-semibold uppercase tracking-wide ${TYPE_COLORS[transaction.type] || 'text-gray-700'}`}>{transaction.type}</td>
                <td className={`px-4 py-3 text-right text-xs font-semibold ${Number(transaction.amount || 0) >= 0 ? 'text-green-700' : 'text-red-600'}`}>{Number(transaction.amount || 0) >= 0 ? '+' : ''}{formatCurrency(transaction.amount)}</td>
                <td className="px-4 py-3 text-right text-xs text-gray-700">{formatCurrency(transaction.balance_after)}</td>
                <td className="px-4 py-3 text-center">
                  <span className={`px-2 py-1 text-xs font-medium ${transaction.status === 'completed' ? 'bg-green-100 text-green-700' : transaction.status === 'failed' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>{transaction.status}</span>
                </td>
                <td className="px-4 py-3 text-xs text-gray-700 font-mono">{cleanDisplayText(transaction.reference_type)}</td>
                <td className="px-4 py-3 text-xs text-gray-600 font-mono break-all">{cleanDisplayText(transaction.reference_id)}</td>
                <td className="px-4 py-3 text-xs text-gray-600 whitespace-normal break-words">{cleanDisplayText(transaction.remark)}</td>
                <td className="px-4 py-3 text-xs text-gray-600">
                  <div className="flex flex-wrap gap-2">
                    {getWalletTransactionLinks(transaction).map((link) => (
                      <Link key={`${transaction.id}-${link.label}`} to={link.to} className="text-blue-600 hover:underline">
                        {link.label}
                      </Link>
                    ))}
                  </div>
                </td>
              </tr>
            ))}
            {transactions.length === 0 ? <tr><td colSpan={10} className="px-4 py-8 text-center text-gray-400">{loading ? 'Loading...' : 'No wallet transactions found'}</td></tr> : null}
          </tbody>
        </table>
      </div>

      {pagination.totalPages > 1 ? (
        <div className="flex justify-center gap-2 print:hidden">
          <button disabled={page <= 1} onClick={() => setPage((current) => current - 1)} className="px-4 py-2 bg-white border text-sm disabled:opacity-50">Prev</button>
          <span className="px-4 py-2 text-sm text-gray-600">Page {page} of {pagination.totalPages}</span>
          <button disabled={page >= pagination.totalPages} onClick={() => setPage((current) => current + 1)} className="px-4 py-2 bg-white border text-sm disabled:opacity-50">Next</button>
        </div>
      ) : null}
    </div>
  );
}