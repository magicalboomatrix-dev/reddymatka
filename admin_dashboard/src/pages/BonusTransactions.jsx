import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../utils/api';
import { useAuth } from '../context/AuthContext';
import { cleanDisplayText } from '../utils/display';
import SavedFilterPresets from '../components/SavedFilterPresets';

const BONUS_TYPE_OPTIONS = ['first_deposit', 'slab', 'referral', 'daily', 'usage'];

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

function buildBonusTransactionsCsv({ filters, summary, entries, selectedModerator }) {
  const rows = [
    ['Bonus Transactions'],
    ['Search', filters.search || ''],
    ['User ID', filters.user_id || ''],
    ['Moderator', selectedModerator?.name || 'All Moderators'],
    ['Entry Kind', filters.entry_kind || 'All'],
    ['Bonus Type', filters.bonus_type || 'All'],
    ['From Date', filters.from_date || ''],
    ['To Date', filters.to_date || ''],
    [],
    ['Summary'],
    ['Entries', summary.total_entries || 0],
    ['Total Credited', Number(summary.total_credited || 0).toLocaleString('en-IN')],
    ['Total Used', Number(summary.total_used || 0).toLocaleString('en-IN')],
    ['Net Bonus Flow', Number(summary.net_bonus_flow || 0).toLocaleString('en-IN')],
    ['Current Bonus Balance', Number(summary.current_bonus_balance || 0).toLocaleString('en-IN')],
    ['Pending Referral Count', summary.pending_referral_count || 0],
    ['Pending Referral Amount', Number(summary.pending_referral_amount || 0).toLocaleString('en-IN')],
    [],
    ['Ledger'],
    ['ID', 'Date', 'User ID', 'User', 'Phone', 'Moderator', 'Entry Kind', 'Bonus Type', 'Amount', 'Reference Type', 'Reference ID', 'Detail'],
    ...entries.map((entry) => [
      entry.source_id,
      entry.created_at ? new Date(entry.created_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }) : '',
      entry.user_id,
      entry.user_name,
      entry.user_phone,
      cleanDisplayText(entry.moderator_name, ''),
      entry.entry_kind,
      entry.bonus_type,
      Number(entry.amount || 0).toLocaleString('en-IN'),
      cleanDisplayText(entry.reference_type, ''),
      cleanDisplayText(entry.reference_id, ''),
      cleanDisplayText(entry.detail, ''),
    ]),
  ];

  return rows.map((row) => row.map(escapeCsvValue).join(',')).join('\n');
}

export default function BonusTransactions() {
  const { user } = useAuth();
  const [moderators, setModerators] = useState([]);
  const [entries, setEntries] = useState([]);
  const [typeBreakdown, setTypeBreakdown] = useState([]);
  const [pagination, setPagination] = useState({});
  const [summary, setSummary] = useState({});
  const [filters, setFilters] = useState({
    search: '',
    user_id: '',
    moderator_id: '',
    entry_kind: '',
    bonus_type: '',
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

    const loadEntries = async () => {
      setLoading(true);
      setError('');
      try {
        const params = { page, limit: 25 };
        Object.entries(filters).forEach(([key, value]) => {
          if (String(value || '').trim()) params[key] = String(value).trim();
        });

        const res = await api.get('/wallet-audit/bonus-transactions', { params });
        setEntries(Array.isArray(res.data.entries) ? res.data.entries : []);
        setPagination(res.data.pagination || {});
        setSummary(res.data.summary || {});
        setTypeBreakdown(Array.isArray(res.data.type_breakdown) ? res.data.type_breakdown : []);
      } catch (requestError) {
        console.error(requestError);
        setError('Failed to load bonus transactions.');
      } finally {
        setLoading(false);
      }
    };

    loadEntries();
  }, [page, filters, user?.role]);

  if (user?.role !== 'admin') {
    return <div className="bg-white border p-6 text-sm text-gray-600">Bonus transaction reporting is available for admins only.</div>;
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
      entry_kind: '',
      bonus_type: '',
      from_date: '',
      to_date: '',
    });
  };

  const selectedModerator = moderators.find((moderator) => String(moderator.id) === String(filters.moderator_id));

  const handleExportCsv = () => {
    const csv = buildBonusTransactionsCsv({ filters, summary, entries, selectedModerator });
    downloadFile('bonus-transactions.csv', csv, 'text/csv;charset=utf-8;');
  };

  return (
    <div className="space-y-4 print:space-y-3">
      <div className="bg-white border p-4 sm:p-5 space-y-4 print:border-0 print:p-0">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
          <div>
            <h3 className="text-xl font-semibold text-gray-800">Bonus Transactions</h3>
            <p className="text-sm text-gray-500 mt-1">
              Full bonus ledger showing bonus credits and the later bonus usage recorded when bets consume bonus balance.
            </p>
          </div>
          <div className="flex flex-col items-start gap-3 lg:items-end">
            <div className="text-sm text-gray-500">Showing {pagination.total || 0} bonus ledger rows</div>
            <div className="flex flex-wrap gap-2 print:hidden">
              <button type="button" onClick={handleExportCsv} disabled={loading} className="px-4 py-2 bg-emerald-600 text-white hover:bg-emerald-700 text-sm font-medium disabled:opacity-50">Export CSV</button>
              <button type="button" onClick={() => window.print()} disabled={loading} className="px-4 py-2 bg-slate-700 text-white hover:bg-slate-800 text-sm font-medium disabled:opacity-50">Print</button>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-3 print:hidden">
          <input type="text" placeholder="Search user, phone, reference, detail..." value={filters.search} onChange={(event) => updateFilter('search', event.target.value)} className="w-full px-3 py-2 border text-sm focus:ring-2 focus:ring-primary-500 outline-none" />
          <input type="number" placeholder="User ID" value={filters.user_id} onChange={(event) => updateFilter('user_id', event.target.value)} className="w-full px-3 py-2 border text-sm focus:ring-2 focus:ring-primary-500 outline-none" />
          <select value={filters.moderator_id} onChange={(event) => updateFilter('moderator_id', event.target.value)} className="w-full px-3 py-2 border bg-white text-sm focus:ring-2 focus:ring-primary-500 outline-none">
            <option value="">All Moderators</option>
            {moderators.map((moderator) => <option key={moderator.id} value={String(moderator.id)}>{moderator.name}</option>)}
          </select>
          <select value={filters.entry_kind} onChange={(event) => updateFilter('entry_kind', event.target.value)} className="w-full px-3 py-2 border bg-white text-sm focus:ring-2 focus:ring-primary-500 outline-none">
            <option value="">All Entry Kinds</option>
            <option value="credit">Credits</option>
            <option value="usage">Usage</option>
          </select>
          <select value={filters.bonus_type} onChange={(event) => updateFilter('bonus_type', event.target.value)} className="w-full px-3 py-2 border bg-white text-sm focus:ring-2 focus:ring-primary-500 outline-none">
            <option value="">All Bonus Types</option>
            {BONUS_TYPE_OPTIONS.map((bonusType) => <option key={bonusType} value={bonusType}>{bonusType}</option>)}
          </select>
          <input type="date" value={filters.from_date} onChange={(event) => updateFilter('from_date', event.target.value)} className="w-full px-3 py-2 border text-sm focus:ring-2 focus:ring-primary-500 outline-none" />
          <div className="flex gap-3 md:col-span-2 xl:col-span-2">
            <input type="date" value={filters.to_date} onChange={(event) => updateFilter('to_date', event.target.value)} className="w-full px-3 py-2 border text-sm focus:ring-2 focus:ring-primary-500 outline-none" />
            <button type="button" onClick={clearFilters} className="px-4 py-2 border text-sm font-medium text-gray-600 hover:bg-gray-50">Clear</button>
          </div>
        </div>

        <SavedFilterPresets
          storageKey="bonus-transactions"
          currentFilters={filters}
          onApply={(nextFilters) => {
            setPage(1);
            setFilters((current) => ({ ...current, ...nextFilters }));
          }}
        />
      </div>

      {error ? <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 text-sm">{error}</div> : null}

      <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
        <div className="bg-white border p-4"><p className="text-xs text-gray-500">Entries</p><p className="text-2xl font-bold text-gray-800">{summary.total_entries || 0}</p></div>
        <div className="bg-white border p-4"><p className="text-xs text-gray-500">Bonus Credited</p><p className="text-2xl font-bold text-green-700">{formatCurrency(summary.total_credited)}</p></div>
        <div className="bg-white border p-4"><p className="text-xs text-gray-500">Bonus Used</p><p className="text-2xl font-bold text-red-600">{formatCurrency(summary.total_used)}</p></div>
        <div className="bg-white border p-4"><p className="text-xs text-gray-500">Net Bonus Flow</p><p className={`text-2xl font-bold ${Number(summary.net_bonus_flow || 0) >= 0 ? 'text-green-700' : 'text-red-600'}`}>{formatCurrency(summary.net_bonus_flow)}</p></div>
        <div className="bg-white border p-4"><p className="text-xs text-gray-500">Current Bonus Balance</p><p className="text-2xl font-bold text-amber-700">{formatCurrency(summary.current_bonus_balance)}</p></div>
        <div className="bg-white border p-4"><p className="text-xs text-gray-500">Pending Referral Bonus</p><p className="text-2xl font-bold text-indigo-700">{summary.pending_referral_count || 0}</p><p className="text-xs text-gray-500 mt-1">{formatCurrency(summary.pending_referral_amount)}</p></div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <div className="bg-white border p-5">
          <h4 className="text-lg font-semibold text-gray-800">How Bonus Balance Is Used</h4>
          <div className="mt-3 space-y-2 text-sm text-gray-600">
            <p><span className="font-medium text-gray-800">Credit side:</span> first deposit, slab, referral, and daily bonuses are credited into <span className="font-mono">bonus_balance</span>.</p>
            <p><span className="font-medium text-gray-800">Withdrawal rule:</span> bonus balance is not direct cash withdrawal balance.</p>
            <p><span className="font-medium text-gray-800">Usage side:</span> while placing bets, up to 10% of the stake can be consumed from bonus balance.</p>
            <p><span className="font-medium text-gray-800">Audit trace:</span> bonus usage is logged in the wallet ledger with <span className="font-mono">reference_type = bet_bonus</span>.</p>
          </div>
        </div>
        <div className="bg-white border p-5">
          <h4 className="text-lg font-semibold text-gray-800">Current Filter Snapshot</h4>
          <div className="mt-3 grid grid-cols-2 gap-3 text-sm text-gray-600">
            <div><span className="font-medium text-gray-800">Moderator:</span> {selectedModerator?.name || 'All'}</div>
            <div><span className="font-medium text-gray-800">Entry Kind:</span> {filters.entry_kind || 'All'}</div>
            <div><span className="font-medium text-gray-800">Bonus Type:</span> {filters.bonus_type || 'All'}</div>
            <div><span className="font-medium text-gray-800">User ID:</span> {filters.user_id || 'Any'}</div>
            <div className="col-span-2"><span className="font-medium text-gray-800">Dates:</span> {filters.from_date || 'Any'} to {filters.to_date || 'Any'}</div>
          </div>
        </div>
      </div>

      <div className="bg-white border overflow-x-auto print:border-0">
        <div className="px-5 py-4 border-b flex items-center justify-between">
          <h4 className="text-lg font-semibold text-gray-800">Type Breakdown</h4>
          <span className="text-sm text-gray-500">Credits vs usage by bonus category</span>
        </div>
        <table className="w-full text-sm min-w-[720px]">
          <thead className="bg-gray-50">
            <tr>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Entry Kind</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Bonus Type</th>
              <th className="text-right px-4 py-3 font-medium text-gray-600">Count</th>
              <th className="text-right px-4 py-3 font-medium text-gray-600">Amount</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {typeBreakdown.map((row) => (
              <tr key={`${row.entry_kind}-${row.bonus_type}`} className="hover:bg-gray-50">
                <td className="px-4 py-3 text-gray-700 capitalize">{row.entry_kind}</td>
                <td className="px-4 py-3 text-gray-700">{row.bonus_type}</td>
                <td className="px-4 py-3 text-right text-gray-700">{row.entry_count}</td>
                <td className="px-4 py-3 text-right font-semibold text-gray-800">{formatCurrency(row.total_amount)}</td>
              </tr>
            ))}
            {typeBreakdown.length === 0 ? <tr><td colSpan={4} className="px-4 py-8 text-center text-gray-400">No bonus breakdown available</td></tr> : null}
          </tbody>
        </table>
      </div>

      <div className="bg-white border overflow-x-auto print:border-0">
        <table className="w-full text-sm min-w-[1350px]">
          <thead className="bg-gray-50">
            <tr>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Date</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">User</th>
              <th className="text-center px-4 py-3 font-medium text-gray-600">Kind</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Type</th>
              <th className="text-right px-4 py-3 font-medium text-gray-600">Amount</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Reference</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Detail</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {entries.map((entry) => (
              <tr key={entry.row_key} className="hover:bg-gray-50 align-top">
                <td className="px-4 py-3 text-xs text-gray-600">
                  <div className="font-medium text-gray-800">#{entry.source_id}</div>
                  <div>{new Date(entry.created_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}</div>
                </td>
                <td className="px-4 py-3 text-xs text-gray-700">
                  <Link to={`/users/${entry.user_id}`} className="text-blue-600 hover:underline font-medium">{entry.user_name}</Link>
                  <div className="text-gray-500">#{entry.user_id} • {entry.user_phone}</div>
                  {entry.moderator_id ? <div className="text-gray-400">Mod: <Link to={`/moderators/${entry.moderator_id}`} className="text-blue-600 hover:underline">{cleanDisplayText(entry.moderator_name, String(entry.moderator_id))}</Link></div> : null}
                </td>
                <td className="px-4 py-3 text-center">
                  <span className={`px-2 py-1 text-xs font-medium ${entry.entry_kind === 'credit' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>{entry.entry_kind}</span>
                </td>
                <td className="px-4 py-3 text-xs text-gray-700 uppercase tracking-wide">{entry.bonus_type}</td>
                <td className={`px-4 py-3 text-right text-xs font-semibold ${entry.entry_kind === 'credit' ? 'text-green-700' : 'text-red-600'}`}>{entry.entry_kind === 'credit' ? '+' : ''}{formatCurrency(entry.amount)}</td>
                <td className="px-4 py-3 text-xs text-gray-600">
                  <div className="font-mono text-gray-700">{cleanDisplayText(entry.reference_type)}</div>
                  <div className="font-mono break-all">{cleanDisplayText(entry.reference_id)}</div>
                </td>
                <td className="px-4 py-3 text-xs text-gray-600 whitespace-normal break-words">{cleanDisplayText(entry.detail)}</td>
              </tr>
            ))}
            {entries.length === 0 ? <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-400">{loading ? 'Loading...' : 'No bonus transactions found'}</td></tr> : null}
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