import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../utils/api';
import { useAuth } from '../context/AuthContext';
import SavedFilterPresets from '../components/SavedFilterPresets';

function getIstDateInputValue(daysAgo = 0) {
  const date = new Date();
  date.setDate(date.getDate() - daysAgo);
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
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

function buildFinancialReportCsv({ filters, platform, moderators }) {
  const rows = [
    ['Financial Report'],
    ['Generated At', new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })],
    ['From Date', filters.from_date || ''],
    ['To Date', filters.to_date || ''],
    ['Game', filters.game_id || 'All Games'],
    ['Moderator', filters.moderator_id || 'All Moderators'],
    [],
    ['Platform Summary'],
    ['Total Deposits', platform.totalDeposits || 0],
    ['Total Deposit Amount', Number(platform.totalDepositAmount || 0).toLocaleString('en-IN')],
    ['Total Withdrawals', platform.totalWithdrawals || 0],
    ['Total Withdrawal Amount', Number(platform.totalWithdrawalAmount || 0).toLocaleString('en-IN')],
    ['Bonus Credited', Number(platform.bonusCredited || 0).toLocaleString('en-IN')],
    ['Bonus Used', Number(platform.bonusUsed || 0).toLocaleString('en-IN')],
    ['Total Bets', platform.totalBets || 0],
    ['Total Stake', Number(platform.totalStake || 0).toLocaleString('en-IN')],
    ['Total Win', Number(platform.totalWin || 0).toLocaleString('en-IN')],
    ['Gaming Revenue', Number(platform.gamingRevenue || 0).toLocaleString('en-IN')],
    ['Platform Net Profit/Loss', Number(platform.netProfitLoss || 0).toLocaleString('en-IN')],
    [],
    ['Moderator Breakdown'],
    ['Moderator', 'Users', 'Deposits', 'Deposit Amount', 'Withdrawals', 'Withdrawal Amount', 'Bets', 'Stake', 'Win', 'Gaming P/L', 'Net P/L'],
    ...moderators.map((mod) => [
      mod.moderator_name,
      mod.user_count || 0,
      mod.total_deposits || 0,
      Number(mod.total_deposit_amount || 0).toLocaleString('en-IN'),
      mod.total_withdrawals || 0,
      Number(mod.total_withdrawal_amount || 0).toLocaleString('en-IN'),
      mod.total_bets || 0,
      Number(mod.total_stake || 0).toLocaleString('en-IN'),
      Number(mod.total_win || 0).toLocaleString('en-IN'),
      Number(mod.gaming_profit_loss || 0).toLocaleString('en-IN'),
      Number(mod.net_profit_loss || 0).toLocaleString('en-IN'),
    ]),
  ];

  return rows.map((row) => row.map(escapeCsvValue).join(',')).join('\n');
}

export default function FinancialReport() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

  const [games, setGames] = useState([]);
  const [moderators, setModerators] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showGuide, setShowGuide] = useState(false);

  const [filters, setFilters] = useState({
    from_date: getIstDateInputValue(6), // Last 7 days default
    to_date: getIstDateInputValue(0),
    game_id: '',
    moderator_id: '',
  });

  const [platform, setPlatform] = useState({
    totalDeposits: 0,
    totalDepositAmount: 0,
    totalWithdrawals: 0,
    totalWithdrawalAmount: 0,
    bonusCredited: 0,
    bonusUsed: 0,
    totalBets: 0,
    totalStake: 0,
    totalWin: 0,
    gamingRevenue: 0,
    netProfitLoss: 0,
  });

  const [moderatorStats, setModeratorStats] = useState([]);

  // Load games and moderators
  useEffect(() => {
    api.get('/games')
      .then((res) => setGames(Array.isArray(res.data.games) ? res.data.games : []))
      .catch(console.error);

    if (isAdmin) {
      api.get('/moderators')
        .then((res) => setModerators(Array.isArray(res.data.moderators) ? res.data.moderators : []))
        .catch(console.error);
    }
  }, [isAdmin]);

  // Load financial data when filters change
  useEffect(() => {
    if (!isAdmin) return;

    const loadFinancialData = async () => {
      setLoading(true);
      setError('');
      try {
        const params = {};
        if (filters.from_date) params.from_date = filters.from_date;
        if (filters.to_date) params.to_date = filters.to_date;
        if (filters.game_id) params.game_id = filters.game_id;
        if (filters.moderator_id) params.moderator_id = filters.moderator_id;

        const res = await api.get('/admin/financial-report', { params });
        setPlatform(res.data.platform || {});
        setModeratorStats(Array.isArray(res.data.moderators) ? res.data.moderators : []);
      } catch (err) {
        console.error(err);
        setError('Failed to load financial report data.');
      } finally {
        setLoading(false);
      }
    };

    loadFinancialData();
  }, [filters, isAdmin]);

  if (!isAdmin) {
    return (
      <div className="bg-white border p-6 text-sm text-gray-600">
        Financial Report is available for admins only.
      </div>
    );
  }

  const updateFilter = (key, value) => {
    setFilters((current) => ({ ...current, [key]: value }));
  };

  const clearFilters = () => {
    setFilters({
      from_date: '',
      to_date: '',
      game_id: '',
      moderator_id: '',
    });
  };

  const selectedGame = games.find((game) => String(game.id) === String(filters.game_id));
  const selectedModerator = moderators.find((mod) => String(mod.id) === String(filters.moderator_id));

  const handleExportCsv = () => {
    const csv = buildFinancialReportCsv({ filters, platform, moderators: moderatorStats });
    const suffixParts = [filters.from_date || 'all', filters.to_date || 'all'];
    if (filters.game_id) suffixParts.push(`game-${filters.game_id}`);
    if (filters.moderator_id) suffixParts.push(`mod-${filters.moderator_id}`);
    downloadFile(`financial-report-${suffixParts.join('-')}.csv`, csv, 'text/csv;charset=utf-8;');
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="bg-white border p-4 sm:p-5 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
          <div>
            <h3 className="text-xl font-semibold text-gray-800">Financial Report</h3>
            <p className="text-sm text-gray-500 mt-1">
              Comprehensive view of platform finances including deposits, withdrawals, bonus, and betting profit/loss.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handleExportCsv}
              disabled={loading}
              className="px-4 py-2 bg-emerald-600 text-white hover:bg-emerald-700 text-sm font-medium disabled:opacity-50"
            >
              Export CSV
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-3">
          <input
            type="date"
            value={filters.from_date}
            onChange={(e) => updateFilter('from_date', e.target.value)}
            className="w-full px-3 py-2 border text-sm focus:ring-2 focus:ring-primary-500 outline-none"
            placeholder="From Date"
          />
          <input
            type="date"
            value={filters.to_date}
            onChange={(e) => updateFilter('to_date', e.target.value)}
            className="w-full px-3 py-2 border text-sm focus:ring-2 focus:ring-primary-500 outline-none"
            placeholder="To Date"
          />
          <select
            value={filters.game_id}
            onChange={(e) => updateFilter('game_id', e.target.value)}
            className="w-full px-3 py-2 border bg-white text-sm focus:ring-2 focus:ring-primary-500 outline-none"
          >
            <option value="">All Games</option>
            {games.map((game) => (
              <option key={game.id} value={String(game.id)}>{game.name}</option>
            ))}
          </select>
          <select
            value={filters.moderator_id}
            onChange={(e) => updateFilter('moderator_id', e.target.value)}
            className="w-full px-3 py-2 border bg-white text-sm focus:ring-2 focus:ring-primary-500 outline-none"
          >
            <option value="">All Moderators</option>
            {moderators.map((mod) => (
              <option key={mod.id} value={String(mod.id)}>{mod.name}</option>
            ))}
          </select>
          <button
            type="button"
            onClick={clearFilters}
            className="px-4 py-2 bg-gray-100 border text-sm text-gray-700 hover:bg-gray-200"
          >
            Clear Filters
          </button>
        </div>

        <SavedFilterPresets
          storageKey="financial-report"
          currentFilters={filters}
          onApply={(nextFilters) => setFilters((current) => ({ ...current, ...nextFilters }))}
        />
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 text-sm">
          {error}
        </div>
      )}

      {/* Calculation Guide / गणना मार्गदर्शिका */}
      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-100 rounded-lg shadow-sm">
        <button
          type="button"
          onClick={() => setShowGuide(!showGuide)}
          className="w-full flex items-center justify-between p-4 focus:outline-none"
        >
          <div className="flex items-center space-x-3 text-blue-900">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-blue-600 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <div className="text-left">
              <h4 className="font-semibold text-base">Calculation Guide & Formulas / गणना मार्गदर्शिका एवं सूत्र</h4>
              <p className="text-xs text-blue-700">Click to expand and view how financial stats are calculated (Hindi & English)</p>
            </div>
          </div>
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className={`h-5 w-5 text-blue-600 transform transition-transform duration-200 ${showGuide ? 'rotate-180' : ''}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {showGuide && (
          <div className="border-t border-blue-100 p-4 sm:p-5 bg-white rounded-b-lg">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* English Section */}
              <div className="space-y-4">
                <h5 className="font-bold text-blue-900 border-b pb-1 text-sm uppercase tracking-wider">English Explanation</h5>
                <ul className="space-y-3 text-sm text-gray-700">
                  <li>
                    <strong className="text-blue-950">1. Total Deposits:</strong> Total cash amount uploaded/deposited by players.
                  </li>
                  <li>
                    <strong className="text-blue-950">2. Total Withdrawals:</strong> Total cash amount withdrawn by or paid to players.
                  </li>
                  <li>
                    <strong className="text-blue-950">3. Net Cash Flow:</strong> <code className="bg-gray-100 px-1 py-0.5 rounded font-mono text-xs">Total Deposits - Total Withdrawals</code>. Shows actual net cash movement in/out of the platform.
                  </li>
                  <li>
                    <strong className="text-blue-950">4. Total Stake:</strong> Total value of all bets placed by players (includes stakes of both wins and losses).
                  </li>
                  <li>
                    <strong className="text-blue-950">5. Total Win Paid:</strong> Total payout amount credited to players for winning bets.
                  </li>
                  <li>
                    <strong className="text-blue-950">6. Gaming Revenue (Gaming P&L):</strong> <code className="bg-gray-100 px-1 py-0.5 rounded font-mono text-xs">Total Stake - Total Win Paid</code>. Platform's gross profit from wagering activities.
                  </li>
                  <li>
                    <strong className="text-blue-950">7. Net Business P&L:</strong> <code className="bg-gray-100 px-1 py-0.5 rounded font-mono text-xs">Gaming Revenue - Bonus Credited</code>. The ultimate business profit/loss after factoring in marketing/bonus costs.
                  </li>
                </ul>
              </div>

              {/* Hindi Section */}
              <div className="space-y-4">
                <h5 className="font-bold text-blue-900 border-b pb-1 text-sm uppercase tracking-wider">हिन्दी व्याख्या (Hindi Translation)</h5>
                <ul className="space-y-3 text-sm text-gray-700">
                  <li>
                    <strong className="text-blue-950">1. कुल डिपॉजिट (Total Deposits):</strong> खिलाड़ियों द्वारा गेम में जमा या अपलोड की गई कुल राशि।
                  </li>
                  <li>
                    <strong className="text-blue-950">2. कुल निकासी (Total Withdrawals):</strong> खिलाड़ियों को भुगतान की गई या उनके द्वारा निकाली गई कुल नकद राशि।
                  </li>
                  <li>
                    <strong className="text-blue-950">3. शुद्ध नकद प्रवाह (Net Cash Flow):</strong> <code className="bg-gray-100 px-1 py-0.5 rounded font-mono text-xs">कुल डिपॉजिट - कुल निकासी</code>। प्लेटफॉर्म में नकद के वास्तविक लेन-देन को दर्शाता है।
                  </li>
                  <li>
                    <strong className="text-blue-950">4. कुल दांव राशि (Total Stake):</strong> खिलाड़ियों द्वारा लगाए गए सभी दांवों का योग (जीतने और हारने वाले दोनों दांव शामिल हैं)।
                  </li>
                  <li>
                    <strong className="text-blue-950">5. कुल भुगतान जीत (Total Win Paid):</strong> जीतने वाले दांवों के लिए खिलाड़ियों के खातों में जमा की गई कुल राशि।
                  </li>
                  <li>
                    <strong className="text-blue-950">6. गेमिंग राजस्व (Gaming Revenue / Gaming P&L):</strong> <code className="bg-gray-100 px-1 py-0.5 rounded font-mono text-xs">कुल दांव राशि - कुल भुगतान जीत</code>। सट्टेबाजी गतिविधियों से प्लेटफॉर्म की सकल कमाई।
                  </li>
                  <li>
                    <strong className="text-blue-950">7. शुद्ध व्यावसायिक लाभ/हानि (Net Business P&L):</strong> <code className="bg-gray-100 px-1 py-0.5 rounded font-mono text-xs">गेमिंग राजस्व - दिया गया बोनस</code>। प्रचार बोनस (bonuses) के खर्चों को घटाने के बाद व्यापार का वास्तविक लाभ या हानि।
                  </li>
                </ul>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Platform Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-white border p-4 sm:p-5">
          <p className="text-xs sm:text-sm text-gray-500">Total Deposits</p>
          <p className="text-xl sm:text-2xl font-bold text-gray-800">{platform.totalDeposits?.toLocaleString('en-IN') || 0}</p>
          <p className="text-xs text-gray-500 mt-1">{formatCurrency(platform.totalDepositAmount)}</p>
        </div>
        <div className="bg-white border p-4 sm:p-5">
          <p className="text-xs sm:text-sm text-gray-500">Total Withdrawals</p>
          <p className="text-xl sm:text-2xl font-bold text-gray-800">{platform.totalWithdrawals?.toLocaleString('en-IN') || 0}</p>
          <p className="text-xs text-gray-500 mt-1">{formatCurrency(platform.totalWithdrawalAmount)}</p>
        </div>
        <div className="bg-white border p-4 sm:p-5">
          <p className="text-xs sm:text-sm text-gray-500">Bonus Credited</p>
          <p className="text-xl sm:text-2xl font-bold text-green-700">{formatCurrency(platform.bonusCredited)}</p>
          <p className="text-xs text-gray-500 mt-1">Used: {formatCurrency(platform.bonusUsed)}</p>
        </div>
        <div className="bg-white border p-4 sm:p-5">
          <p className="text-xs sm:text-sm text-gray-500">Net Cash Flow</p>
          <p className={`text-xl sm:text-2xl font-bold ${profitLossClass((platform.totalDepositAmount || 0) - (platform.totalWithdrawalAmount || 0))}`}>
            {formatCurrency((platform.totalDepositAmount || 0) - (platform.totalWithdrawalAmount || 0))}
          </p>
          <p className="text-xs text-gray-500 mt-1">Deposits - Withdrawals</p>
        </div>
      </div>

      {/* Betting Summary */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3">
        <div className="bg-white border p-4 sm:p-5">
          <p className="text-xs sm:text-sm text-gray-500">Total Bets</p>
          <p className="text-xl sm:text-2xl font-bold text-gray-800">{platform.totalBets?.toLocaleString('en-IN') || 0}</p>
        </div>
        <div className="bg-white border p-4 sm:p-5">
          <p className="text-xs sm:text-sm text-gray-500">Total Stake</p>
          <p className="text-xl sm:text-2xl font-bold text-primary-600">{formatCurrency(platform.totalStake)}</p>
        </div>
        <div className="bg-white border p-4 sm:p-5">
          <p className="text-xs sm:text-sm text-gray-500">Total Win Paid</p>
          <p className="text-xl sm:text-2xl font-bold text-green-700">{formatCurrency(platform.totalWin)}</p>
        </div>
        <div className="bg-white border p-4 sm:p-5">
          <p className="text-xs sm:text-sm text-gray-500">Gaming Revenue</p>
          <p className={`text-xl sm:text-2xl font-bold ${profitLossClass(platform.gamingRevenue)}`}>
            {formatCurrency(platform.gamingRevenue)}
          </p>
          <p className="text-xs text-gray-500 mt-1">Stake - Win</p>
        </div>
        <div className="bg-white border p-4 sm:p-5">
          <p className="text-xs sm:text-sm text-gray-500">Platform Net P/L</p>
          <p className={`text-xl sm:text-2xl font-bold ${profitLossClass(platform.netProfitLoss)}`}>
            {formatCurrency(platform.netProfitLoss)}
          </p>
          <p className="text-xs text-gray-500 mt-1">Gaming P/L - Bonus</p>
        </div>
      </div>

      {/* Active Filters */}
      <div className="bg-white border p-3 text-sm text-gray-600">
        <span className="font-medium">Filters:</span>{' '}
        {selectedGame ? selectedGame.name : 'All Games'} |{' '}
        {selectedModerator ? selectedModerator.name : 'All Moderators'} |{' '}
        {filters.from_date || 'Any start'} to {filters.to_date || 'Any end'}
      </div>

      {/* Moderator Breakdown Table */}
      <div className="bg-white border overflow-x-auto">
        <div className="px-4 py-3 border-b bg-gray-50">
          <h4 className="text-lg font-semibold text-gray-800">Per-Moderator Breakdown</h4>
          <p className="text-sm text-gray-500">Financial performance by moderator and their users</p>
        </div>
        <table className="w-full text-sm min-w-[1200px]">
          <thead className="bg-gray-50">
            <tr>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Moderator</th>
              <th className="text-center px-4 py-3 font-medium text-gray-600">Users</th>
              <th className="text-right px-4 py-3 font-medium text-gray-600">Deposits</th>
              <th className="text-right px-4 py-3 font-medium text-gray-600">Deposit Amount</th>
              <th className="text-right px-4 py-3 font-medium text-gray-600">Withdrawals</th>
              <th className="text-right px-4 py-3 font-medium text-gray-600">Withdrawal Amount</th>
              <th className="text-right px-4 py-3 font-medium text-gray-600">Bets</th>
              <th className="text-right px-4 py-3 font-medium text-gray-600">Stake</th>
              <th className="text-right px-4 py-3 font-medium text-gray-600">Win</th>
              <th className="text-right px-4 py-3 font-medium text-gray-600">Gaming P/L</th>
              <th className="text-right px-4 py-3 font-medium text-gray-600">Net P/L</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {moderatorStats.map((mod) => (
              <tr key={mod.moderator_id} className="hover:bg-gray-50">
                <td className="px-4 py-3">
                  {mod.moderator_id === 'admin' ? (
                    <span className="font-medium text-gray-800">{mod.moderator_name}</span>
                  ) : (
                    <Link to={`/moderators/${mod.moderator_id}`} className="text-blue-600 hover:underline font-medium">
                      {mod.moderator_name}
                    </Link>
                  )}
                </td>
                <td className="px-4 py-3 text-center">{mod.user_count || 0}</td>
                <td className="px-4 py-3 text-right">{mod.total_deposits || 0}</td>
                <td className="px-4 py-3 text-right font-medium text-green-700">{formatCurrency(mod.total_deposit_amount)}</td>
                <td className="px-4 py-3 text-right">{mod.total_withdrawals || 0}</td>
                <td className="px-4 py-3 text-right font-medium text-red-600">{formatCurrency(mod.total_withdrawal_amount)}</td>
                <td className="px-4 py-3 text-right">{mod.total_bets?.toLocaleString('en-IN') || 0}</td>
                <td className="px-4 py-3 text-right">{formatCurrency(mod.total_stake)}</td>
                <td className="px-4 py-3 text-right text-green-700">{formatCurrency(mod.total_win)}</td>
                <td className={`px-4 py-3 text-right font-semibold ${profitLossClass(mod.gaming_profit_loss)}`}>
                  {formatCurrency(mod.gaming_profit_loss)}
                </td>
                <td className={`px-4 py-3 text-right font-semibold ${profitLossClass(mod.net_profit_loss)}`}>
                  {formatCurrency(mod.net_profit_loss)}
                </td>
              </tr>
            ))}
            {moderatorStats.length === 0 && (
              <tr>
                <td colSpan={11} className="px-4 py-8 text-center text-gray-400">
                  {loading ? 'Loading...' : 'No data found for selected filters'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
