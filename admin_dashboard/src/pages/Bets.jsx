import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import api from '../utils/api';
import { useAuth } from '../context/AuthContext';
import SavedFilterPresets from '../components/SavedFilterPresets';

function getIstDateInputValue() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

function formatCurrency(value) {
  return `₹${Number(value || 0).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function profitLossClass(value) {
  if (value > 0) return 'text-green-700';
  if (value < 0) return 'text-red-600';
  return 'text-gray-600';
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

function buildBetsCsv({ filters, summary, bets, selectedGame, selectedModerator, userRole }) {
  const rows = [
    ['Bets Report'],
    ['From Date', filters.from_date || ''],
    ['To Date', filters.to_date || ''],
    ['Game', selectedGame?.name || 'All Games'],
    ['Moderator', userRole === 'admin' ? (selectedModerator?.name || 'All Moderators') : 'My Users'],
    ['Status', filters.status || 'All Status'],
    ['Search', filters.search || ''],
    [],
    ['Summary'],
    ['Total Bets', summary.totalBets || 0],
    ['Total Stake', Number(summary.totalStake || 0).toLocaleString('en-IN')],
    ['Total Win', Number(summary.totalWin || 0).toLocaleString('en-IN')],
    ['Net Profit/Loss', Number(summary.netProfitLoss || 0).toLocaleString('en-IN')],
    [],
    ['Breakdown'],
    ['Session Date', 'Placed At', 'User', 'Phone', 'Moderator', 'Game', 'Result', 'Type', 'Numbers', 'Stake', 'Win', 'Loss', 'Profit/Loss', 'Status'],
    ...bets.map((bet) => [
      bet.session_date || '',
      bet.created_at ? new Date(bet.created_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }) : '',
      bet.user_name,
      bet.user_phone,
      bet.moderator_name || '',
      bet.game_name,
      bet.result_number || 'WAIT',
      bet.type,
      bet.bet_numbers || '',
      Number(bet.total_amount || 0).toLocaleString('en-IN'),
      Number(bet.win_amount || 0).toLocaleString('en-IN'),
      Number(bet.loss_amount || 0).toLocaleString('en-IN'),
      Number(bet.profit_loss || 0).toLocaleString('en-IN'),
      bet.status,
    ]),
  ];

  return rows.map((row) => row.map(escapeCsvValue).join(',')).join('\n');
}

function getBetsFiltersFromSearchParams(searchParams) {
  return {
    search: searchParams.get('search') || '',
    game_id: searchParams.get('game_id') || '',
    moderator_id: searchParams.get('moderator_id') || '',
    from_date: searchParams.get('from_date') || getIstDateInputValue(),
    to_date: searchParams.get('to_date') || getIstDateInputValue(),
    status: searchParams.get('status') || '',
  };
}

export default function Bets() {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const isAdmin = user?.role === 'admin';
  const [games, setGames] = useState([]);
  const [moderators, setModerators] = useState([]);
  const [bets, setBets] = useState([]);
  const [pagination, setPagination] = useState({});
  const [summary, setSummary] = useState({ totalBets: 0, totalStake: 0, totalWin: 0, netProfitLoss: 0 });
  const [filters, setFilters] = useState(() => getBetsFiltersFromSearchParams(searchParams));
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get('/games')
      .then((res) => setGames(Array.isArray(res.data.games) ? res.data.games : []))
      .catch(console.error);
  }, []);

  useEffect(() => {
    if (!isAdmin) return;
    api.get('/moderators')
      .then((res) => setModerators(Array.isArray(res.data.moderators) ? res.data.moderators : []))
      .catch(console.error);
  }, [isAdmin]);

  useEffect(() => {
    const nextFilters = getBetsFiltersFromSearchParams(searchParams);
    setFilters((current) => JSON.stringify(current) === JSON.stringify(nextFilters) ? current : nextFilters);
    setPage(1);
  }, [searchParams]);

  useEffect(() => {
    const loadBets = async () => {
      setLoading(true);
      setError('');
      try {
        const params = { page, limit: 20 };
        if (filters.search.trim()) params.search = filters.search.trim();
        if (filters.game_id) params.game_id = filters.game_id;
        if (isAdmin && filters.moderator_id) params.moderator_id = filters.moderator_id;
        if (filters.from_date) params.from_date = filters.from_date;
        if (filters.to_date) params.to_date = filters.to_date;
        if (filters.status) params.status = filters.status;

        const res = await api.get('/bets/all', { params });
        setBets(Array.isArray(res.data.bets) ? res.data.bets : []);
        setPagination(res.data.pagination || {});
        setSummary(res.data.summary || { totalBets: 0, totalStake: 0, totalWin: 0, netProfitLoss: 0 });
      } catch (requestError) {
        console.error(requestError);
        setError('Failed to load bets.');
      } finally {
        setLoading(false);
      }
    };

    loadBets();
  }, [page, filters.search, filters.game_id, filters.moderator_id, filters.from_date, filters.to_date, filters.status, isAdmin]);

  const updateFilter = (key, value) => {
    setPage(1);
    setFilters((current) => ({ ...current, [key]: value }));
  };

  const clearDates = () => {
    setPage(1);
    setFilters((current) => ({
      ...current,
      from_date: '',
      to_date: '',
    }));
  };

  const selectedGame = games.find((game) => String(game.id) === String(filters.game_id));
  const selectedModerator = moderators.find((moderator) => String(moderator.id) === String(filters.moderator_id));

  const handleExportCsv = () => {
    const csv = buildBetsCsv({
      filters,
      summary,
      bets,
      selectedGame,
      selectedModerator,
      userRole: user?.role,
    });

    const suffixParts = [filters.from_date || 'all', filters.to_date || 'all'];
    if (filters.game_id) suffixParts.push(`game-${filters.game_id}`);
    if (isAdmin && filters.moderator_id) suffixParts.push(`moderator-${filters.moderator_id}`);
    if (filters.status) suffixParts.push(filters.status);
    downloadFile(`bets-${suffixParts.join('-')}.csv`, csv, 'text/csv;charset=utf-8;');
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="space-y-4 print:space-y-3">
      <div className="bg-white border p-4 sm:p-5 space-y-4 print:border-0 print:p-0">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
          <div>
            <h3 className="text-xl font-semibold text-gray-800">Bets</h3>
            <p className="text-sm text-gray-500 mt-1">
              {isAdmin
                ? 'Track which users placed bets on which numbers, with result, win, and loss by date and game.'
                : 'Track bets placed by your assigned users with result, win, and loss by date and game.'}
            </p>
          </div>
          <div className="flex flex-col items-start gap-3 lg:items-end">
            <div className="text-sm text-gray-500">
              Showing {pagination.total || 0} bets
            </div>
            <div className="flex flex-wrap gap-2 print:hidden">
              <button
                type="button"
                onClick={handleExportCsv}
                disabled={loading}
                className="px-4 py-2 bg-emerald-600 text-white hover:bg-emerald-700 text-sm font-medium disabled:opacity-50"
              >
                Export CSV
              </button>
              <button
                type="button"
                onClick={handlePrint}
                disabled={loading}
                className="px-4 py-2 bg-slate-700 text-white hover:bg-slate-800 text-sm font-medium disabled:opacity-50"
              >
                Print
              </button>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-6 gap-3 print:hidden">
          <input
            type="text"
            placeholder="Search user, phone, number, result..."
            value={filters.search}
            onChange={(event) => updateFilter('search', event.target.value)}
            className="w-full px-3 py-2 border text-sm focus:ring-2 focus:ring-primary-500 outline-none"
          />
          <select
            value={filters.game_id}
            onChange={(event) => updateFilter('game_id', event.target.value)}
            className="w-full px-3 py-2 border bg-white text-sm focus:ring-2 focus:ring-primary-500 outline-none"
          >
            <option value="">All Games</option>
            {games.map((game) => (
              <option key={game.id} value={String(game.id)}>{game.name}</option>
            ))}
          </select>
          {isAdmin ? (
            <select
              value={filters.moderator_id}
              onChange={(event) => updateFilter('moderator_id', event.target.value)}
              className="w-full px-3 py-2 border bg-white text-sm focus:ring-2 focus:ring-primary-500 outline-none"
            >
              <option value="">All Moderators</option>
              {moderators.map((moderator) => (
                <option key={moderator.id} value={String(moderator.id)}>{moderator.name}</option>
              ))}
            </select>
          ) : null}
          <input
            type="date"
            value={filters.from_date}
            onChange={(event) => updateFilter('from_date', event.target.value)}
            className="w-full px-3 py-2 border text-sm focus:ring-2 focus:ring-primary-500 outline-none"
          />
          <input
            type="date"
            value={filters.to_date}
            onChange={(event) => updateFilter('to_date', event.target.value)}
            className="w-full px-3 py-2 border text-sm focus:ring-2 focus:ring-primary-500 outline-none"
          />
          <div className="flex gap-2">
            <select
              value={filters.status}
              onChange={(event) => updateFilter('status', event.target.value)}
              className="flex-1 px-3 py-2 border bg-white text-sm focus:ring-2 focus:ring-primary-500 outline-none"
            >
              <option value="">All Status</option>
              <option value="pending">Pending</option>
              <option value="win">Win</option>
              <option value="loss">Loss</option>
            </select>
            <button
              type="button"
              onClick={clearDates}
              className="px-3 py-2 bg-gray-100 border text-sm text-gray-700 hover:bg-gray-200"
            >
              Clear Dates
            </button>
          </div>
        </div>

        <SavedFilterPresets
          storageKey="bets"
          currentFilters={filters}
          onApply={(nextFilters) => {
            setPage(1);
            setFilters((current) => ({ ...current, ...nextFilters }));
          }}
        />
      </div>

      {error ? (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 text-sm">
          {error}
        </div>
      ) : null}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-white border p-4 sm:p-5">
          <p className="text-xs sm:text-sm text-gray-500">Total Bets</p>
          <p className="text-xl sm:text-2xl font-bold text-gray-800">{summary.totalBets || 0}</p>
        </div>
        <div className="bg-white border p-4 sm:p-5">
          <p className="text-xs sm:text-sm text-gray-500">Total Stake</p>
          <p className="text-xl sm:text-2xl font-bold text-primary-600">{formatCurrency(summary.totalStake)}</p>
        </div>
        <div className="bg-white border p-4 sm:p-5">
          <p className="text-xs sm:text-sm text-gray-500">Total Win</p>
          <p className="text-xl sm:text-2xl font-bold text-green-700">{formatCurrency(summary.totalWin)}</p>
        </div>
        <div className="bg-white border p-4 sm:p-5">
          <p className="text-xs sm:text-sm text-gray-500">Net Profit/Loss</p>
          <p className={`text-xl sm:text-2xl font-bold ${profitLossClass(summary.netProfitLoss || 0)}`}>
            {formatCurrency(summary.netProfitLoss)}
          </p>
        </div>
      </div>

      <div className="bg-white border p-3 text-sm text-gray-600 print:border-0 print:p-0">
        <span className="font-medium">Filters:</span> {selectedGame ? selectedGame.name : 'All Games'} | {isAdmin ? (selectedModerator?.name || 'All Moderators') : 'My Users'} | {filters.from_date || 'Any start'} to {filters.to_date || 'Any end'} | {filters.status || 'All Status'}
      </div>

      <div className="bg-white border overflow-x-auto print:border-0">
        <table className="w-full text-sm min-w-[1200px]">
          <thead className="bg-gray-50">
            <tr>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Date</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">User</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Game</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Result</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Type</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Numbers</th>
              <th className="text-right px-4 py-3 font-medium text-gray-600">Stake</th>
              <th className="text-right px-4 py-3 font-medium text-gray-600">Win</th>
              <th className="text-right px-4 py-3 font-medium text-gray-600">Loss</th>
              <th className="text-right px-4 py-3 font-medium text-gray-600">P/L</th>
              <th className="text-center px-4 py-3 font-medium text-gray-600">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {bets.map((bet) => (
              <tr key={bet.id} className="hover:bg-gray-50 align-top">
                <td className="px-4 py-3 text-xs text-gray-600">
                  <div className="font-medium text-gray-800">{bet.session_date || '-'}</div>
                  <div>{new Date(bet.created_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}</div>
                </td>
                <td className="px-4 py-3 text-xs text-gray-700">
                  <Link to={`/users/${bet.user_id}`} className="text-blue-600 hover:underline font-medium">{bet.user_name}</Link>
                  <div className="text-gray-500">{bet.user_phone}</div>
                  {bet.moderator_name ? (
                    <div className="text-gray-400 flex flex-wrap items-center gap-2">
                      <span>Mod: {bet.moderator_name}</span>
                      {bet.moderator_id ? <Link to={`/moderators/${bet.moderator_id}`} className="text-blue-600 hover:underline print:hidden">Moderator</Link> : null}
                    </div>
                  ) : null}
                </td>
                <td className="px-4 py-3 text-xs text-gray-700">
                  <div className="font-medium">{bet.game_name}</div>
                  <div className="print:hidden">
                    <Link to={`/results?game_id=${bet.game_id}`} className="text-blue-600 hover:underline">Game Results</Link>
                  </div>
                </td>
                <td className="px-4 py-3 text-xs text-gray-700">
                  <div className="font-mono font-bold">{bet.result_number || 'WAIT'}</div>
                  <div className="text-gray-500">{bet.result_date || '-'}</div>
                </td>
                <td className="px-4 py-3 text-xs text-gray-700 uppercase tracking-wide">{bet.type}</td>
                <td className="px-4 py-3 text-xs text-gray-700 max-w-sm">
                  <div className="whitespace-normal break-words">{bet.bet_numbers || '-'}</div>
                </td>
                <td className="px-4 py-3 text-right text-xs font-semibold text-gray-800">{formatCurrency(bet.total_amount)}</td>
                <td className="px-4 py-3 text-right text-xs font-semibold text-green-700">{formatCurrency(bet.win_amount)}</td>
                <td className="px-4 py-3 text-right text-xs font-semibold text-red-600">{formatCurrency(bet.loss_amount)}</td>
                <td className={`px-4 py-3 text-right text-xs font-semibold ${profitLossClass(bet.profit_loss)}`}>{formatCurrency(bet.profit_loss)}</td>
                <td className="px-4 py-3 text-center">
                  <span className={`px-2 py-1 text-xs font-medium ${bet.status === 'win' ? 'bg-green-100 text-green-700' : bet.status === 'loss' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>
                    {bet.status}
                  </span>
                </td>
              </tr>
            ))}
            {bets.length === 0 ? (
              <tr>
                <td colSpan={11} className="px-4 py-8 text-center text-gray-400">
                  {loading ? 'Loading...' : 'No bets found'}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      {pagination.totalPages > 1 ? (
        <div className="flex justify-center gap-2 print:hidden">
          <button
            disabled={page <= 1}
            onClick={() => setPage((current) => current - 1)}
            className="px-4 py-2 bg-white border text-sm disabled:opacity-50"
          >
            Prev
          </button>
          <span className="px-4 py-2 text-sm text-gray-600">Page {page} of {pagination.totalPages}</span>
          <button
            disabled={page >= pagination.totalPages}
            onClick={() => setPage((current) => current + 1)}
            className="px-4 py-2 bg-white border text-sm disabled:opacity-50"
          >
            Next
          </button>
        </div>
      ) : null}
    </div>
  );
}