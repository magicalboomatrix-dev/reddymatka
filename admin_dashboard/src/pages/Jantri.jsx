import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import api from '../utils/api';
import { useAuth } from '../context/AuthContext';

function getIstDateInputValue() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

function formatAmount(value) {
  return `₹${(parseFloat(value) || 0).toLocaleString('en-IN')}`;
}

function getFiltersFromSearchParams(searchParams) {
  return {
    date: searchParams.get('date') || getIstDateInputValue(),
    game_id: searchParams.get('game_id') || '',
    moderator_id: searchParams.get('moderator_id') || '',
    type: searchParams.get('type') || '',
  };
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

function buildJantriCsv({ filters, summary, items, noBetNumbers, selectedGame, selectedModerator, userRole }) {
  const rows = [
    ['Jantri Report'],
    ['Date', filters.date],
    ['Game', selectedGame?.name || 'All Games'],
    ['Moderator', userRole === 'admin' ? (selectedModerator?.name || 'All Moderators') : 'My Users'],
    ['Type', filters.type || 'All Types'],
    [],
    ['Summary'],
    ['Total Amount', parseFloat(summary.total_amount || 0).toLocaleString('en-IN')],
    ['Bet Count', summary.total_bet_count || 0],
    ['Numbers With Bets', summary.total_numbers_with_bets || 0],
    ['Jodi With No Bets', noBetNumbers.length],
    ['Highest Bet Number', summary.highest_bet?.number || ''],
    ['Highest Bet Type', summary.highest_bet?.type || ''],
    ['Highest Bet Amount', parseFloat(summary.highest_bet?.total_amount || 0).toLocaleString('en-IN')],
    ['Highest Bet Count', summary.highest_bet?.bet_count || 0],
    [],
    ['Breakdown'],
    ['Number', 'Type', 'Total Amount', 'Bet Count'],
    ...items.map((item) => [
      /^\d{2}$/.test(String(item.number)) ? String(item.number).padStart(2, '0') : String(item.number),
      item.type,
      parseFloat(item.total_amount || 0).toLocaleString('en-IN'),
      item.bet_count,
    ]),
  ];

  if (noBetNumbers.length > 0) {
    rows.push([]);
    rows.push(['No Bet Jodi Numbers', noBetNumbers.join(' ')]);
  }

  return rows.map((row) => row.map(escapeCsvValue).join(',')).join('\n');
}

function renderHarufSection(items, selectedType) {
  const harufItems = items.filter((item) => /^\d$/.test(String(item.number)));
  if (harufItems.length === 0) return null;

  const andarLookup = {};
  const baharLookup = {};

  harufItems.forEach((item) => {
    const digit = String(item.number);
    const amount = parseFloat(item.total_amount) || 0;

    if (item.type === 'haruf_andar') andarLookup[digit] = (andarLookup[digit] || 0) + amount;
    else if (item.type === 'haruf_bahar') baharLookup[digit] = (baharLookup[digit] || 0) + amount;
    else if (!selectedType || selectedType === 'crossing' || selectedType === 'jodi') {
      andarLookup[digit] = (andarLookup[digit] || 0) + amount;
    }
  });

  const digits = Array.from({ length: 10 }, (_, index) => String(index));
  const andarTotal = digits.reduce((sum, digit) => sum + (andarLookup[digit] || 0), 0);
  const baharTotal = digits.reduce((sum, digit) => sum + (baharLookup[digit] || 0), 0);
  const grandTotal = andarTotal + baharTotal;

  const renderRow = (label, lookup, rowTotal) => (
    <tr className="bg-white">
      <td className="border border-gray-200 p-0 text-center" style={{ width: '7.14%' }}>
        <div className="text-[9px] font-black text-blue-700 leading-tight py-[3px]">{label}</div>
      </td>
      {digits.map((digit) => {
        const amount = lookup[digit] || 0;
        return (
          <td key={digit} className="border border-gray-200 p-0 text-center" style={{ width: '7.14%' }}>
            <div className="text-[9px] font-bold text-gray-900 leading-tight py-[3px]">{digit}</div>
            <div className={`text-[8px] font-semibold leading-tight pb-[3px] ${amount > 0 ? 'text-green-700' : 'text-transparent select-none'}`}>
              {amount > 0 ? amount.toLocaleString('en-IN') : '0'}
            </div>
          </td>
        );
      })}
      <td className="border border-gray-200 p-0 text-right" style={{ width: '7.14%' }}>
        <div className="text-[8px] font-bold text-red-500 leading-tight py-[3px] pr-0.5">
          {rowTotal > 0 ? rowTotal.toLocaleString('en-IN') : ''}
        </div>
      </td>
    </tr>
  );

  return (
    <div className="bg-white border">
      <div className="bg-[#0a1628] text-white px-2 py-2 flex items-center justify-between">
        <h3 className="text-xs font-bold tracking-wide">Haruf (0→9)</h3>
        <span className="text-[10px] font-semibold text-yellow-400">TOTAL: ₹{grandTotal.toLocaleString('en-IN')}</span>
      </div>
      <table className="w-full border-collapse table-fixed">
        <tbody>
          {renderRow('A', andarLookup, andarTotal)}
          {renderRow('B', baharLookup, baharTotal)}
        </tbody>
      </table>
    </div>
  );
}

function renderJantriSection(items, selectedType) {
  const jodiItems = items.filter((item) => /^\d{2}$/.test(String(item.number)));
  if (jodiItems.length === 0 && (selectedType === 'haruf_andar' || selectedType === 'haruf_bahar')) return null;

  const lookup = {};
  jodiItems.forEach((item) => {
    const key = String(item.number).padStart(2, '0');
    lookup[key] = (lookup[key] || 0) + (parseFloat(item.total_amount) || 0);
  });

  const rows = Array.from({ length: 10 }, (_, rowIndex) => {
    const cells = Array.from({ length: 10 }, (_, columnIndex) => {
      const number = String(rowIndex * 10 + columnIndex).padStart(2, '0');
      return { num: number, amount: lookup[number] || 0 };
    });
    return {
      cells,
      total: cells.reduce((sum, cell) => sum + cell.amount, 0),
    };
  });

  const colTotals = Array(10).fill(0);
  rows.forEach((row) => row.cells.forEach((cell, columnIndex) => {
    colTotals[columnIndex] += cell.amount;
  }));
  const grandTotal = colTotals.reduce((sum, value) => sum + value, 0);

  return (
    <div className="bg-white border">
      <div className="bg-[#0a1628] text-white px-2 py-2 flex items-center justify-between">
        <h3 className="text-xs font-bold tracking-wide">Jantri (00→99)</h3>
        <span className="text-[10px] font-semibold text-yellow-400">TOTAL: ₹{grandTotal.toLocaleString('en-IN')}</span>
      </div>
      <table className="w-full border-collapse table-fixed">
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr key={rowIndex} className={rowIndex % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
              {row.cells.map((cell) => (
                <td key={cell.num} className="border border-gray-200 p-0 text-center" style={{ width: '8.33%' }}>
                  <div className="text-[9px] font-bold text-gray-900 leading-tight py-[3px]">{cell.num}</div>
                  <div className={`text-[8px] font-semibold leading-tight pb-[3px] ${cell.amount > 0 ? 'text-green-700' : 'text-transparent select-none'}`}>
                    {cell.amount > 0 ? cell.amount.toLocaleString('en-IN') : '0'}
                  </div>
                </td>
              ))}
              <td className="border border-gray-200 p-0 text-right" style={{ width: '8.33%' }}>
                <div className="text-[8px] font-bold text-red-500 leading-tight py-[3px] pr-0.5">
                  {row.total > 0 ? row.total.toLocaleString('en-IN') : ''}
                </div>
              </td>
            </tr>
          ))}
          <tr className="border-t-2 border-gray-400 bg-gray-100">
            {colTotals.map((total, columnIndex) => (
              <td key={columnIndex} className="border border-gray-200 p-0 text-center">
                <div className={`text-[8px] font-bold leading-tight py-[3px] ${total > 0 ? 'text-red-500' : 'text-transparent select-none'}`}>
                  {total > 0 ? total.toLocaleString('en-IN') : '0'}
                </div>
              </td>
            ))}
            <td className="border border-gray-200 p-0 text-right">
              <div className="text-[8px] font-bold text-red-600 leading-tight py-[3px] pr-0.5">
                {grandTotal > 0 ? grandTotal.toLocaleString('en-IN') : ''}
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

export default function Jantri() {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const [games, setGames] = useState([]);
  const [moderators, setModerators] = useState([]);
  const [filters, setFilters] = useState(() => getFiltersFromSearchParams(searchParams));
  const [jantri, setJantri] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const nextFilters = getFiltersFromSearchParams(searchParams);
    setFilters((current) => {
      if (
        current.date === nextFilters.date &&
        current.game_id === nextFilters.game_id &&
        current.moderator_id === nextFilters.moderator_id &&
        current.type === nextFilters.type
      ) {
        return current;
      }

      return nextFilters;
    });
  }, [searchParams]);

  useEffect(() => {
    api.get('/games')
      .then((res) => setGames(Array.isArray(res.data.games) ? res.data.games : []))
      .catch(console.error);
  }, []);

  useEffect(() => {
    if (user?.role !== 'admin') return;

    api.get('/moderators')
      .then((res) => setModerators(Array.isArray(res.data.moderators) ? res.data.moderators : []))
      .catch(console.error);
  }, [user?.role]);

  useEffect(() => {
    const loadJantri = async () => {
      setLoading(true);
      try {
        const params = { date: filters.date };
        if (filters.game_id) params.game_id = filters.game_id;
        if (filters.type) params.type = filters.type;
        if (user?.role === 'admin' && filters.moderator_id) params.moderator_id = filters.moderator_id;

        const res = await api.get('/jantri', { params });
        setJantri(res.data);
      } catch (error) {
        console.error(error);
        setJantri(null);
      } finally {
        setLoading(false);
      }
    };

    loadJantri();
  }, [filters.date, filters.game_id, filters.moderator_id, filters.type, user?.role]);

  const items = Array.isArray(jantri?.entries) ? jantri.entries : [];
  const summary = jantri?.summary || {};
  const noBetNumbers = Array.isArray(summary.no_bet_numbers) ? summary.no_bet_numbers : [];
  const selectedModerator = moderators.find((moderator) => String(moderator.id) === String(filters.moderator_id));
  const selectedGame = games.find((game) => String(game.id) === String(filters.game_id));
  const harufSection = jantri ? renderHarufSection(items, filters.type) : null;
  const jantriSection = jantri ? renderJantriSection(items, filters.type) : null;

  const handleExportCsv = () => {
    if (!jantri) return;

    const csv = buildJantriCsv({
      filters,
      summary,
      items,
      noBetNumbers,
      selectedGame,
      selectedModerator,
      userRole: user?.role,
    });

    const suffixParts = [filters.date || getIstDateInputValue()];
    if (filters.game_id) suffixParts.push(`game-${filters.game_id}`);
    if (user?.role === 'admin' && filters.moderator_id) suffixParts.push(`moderator-${filters.moderator_id}`);
    if (filters.type) suffixParts.push(filters.type);

    downloadFile(`jantri-${suffixParts.join('-')}.csv`, csv, 'text/csv;charset=utf-8;');
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="space-y-6 print:space-y-4">
      <div className="bg-white border p-4 sm:p-5 space-y-4 print:border-0 print:p-0">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
          <div>
            <h3 className="text-xl font-semibold text-gray-800">Jantri</h3>
            <p className="text-sm text-gray-500 mt-1">
              {user?.role === 'admin'
                ? 'Daily jantri across all users with date, game, and moderator filters.'
                : 'Daily jantri for your assigned users only.'}
            </p>
          </div>
          <div className="flex flex-col items-start gap-3 lg:items-end">
            <div className="text-sm text-gray-600">
              <span className="font-medium">Date:</span> {filters.date || getIstDateInputValue()}
              {selectedGame ? <span className="ml-3"><span className="font-medium">Game:</span> {selectedGame.name}</span> : null}
              {user?.role === 'admin' && selectedModerator ? <span className="ml-3"><span className="font-medium">Moderator:</span> {selectedModerator.name}</span> : null}
            </div>
            <div className="flex flex-wrap gap-2 print:hidden">
              <button
                type="button"
                onClick={handleExportCsv}
                disabled={!jantri || loading}
                className="px-4 py-2 bg-emerald-600 text-white hover:bg-emerald-700 text-sm font-medium disabled:opacity-50"
              >
                Export CSV
              </button>
              <button
                type="button"
                onClick={handlePrint}
                disabled={!jantri || loading}
                className="px-4 py-2 bg-slate-700 text-white hover:bg-slate-800 text-sm font-medium disabled:opacity-50"
              >
                Print
              </button>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3 print:hidden">
          <input
            type="date"
            value={filters.date}
            onChange={(event) => setFilters((current) => ({ ...current, date: event.target.value }))}
            className="w-full px-3 py-2 border focus:ring-2 focus:ring-primary-500 outline-none text-sm"
          />
          <select
            value={filters.game_id}
            onChange={(event) => setFilters((current) => ({ ...current, game_id: event.target.value }))}
            className="w-full px-3 py-2 border focus:ring-2 focus:ring-primary-500 outline-none text-sm"
          >
            <option value="">All Games</option>
            {games.map((game) => <option key={game.id} value={game.id}>{game.name}</option>)}
          </select>
          {user?.role === 'admin' ? (
            <select
              value={filters.moderator_id}
              onChange={(event) => setFilters((current) => ({ ...current, moderator_id: event.target.value }))}
              className="w-full px-3 py-2 border focus:ring-2 focus:ring-primary-500 outline-none text-sm"
            >
              <option value="">All Moderators</option>
              {moderators.map((moderator) => <option key={moderator.id} value={moderator.id}>{moderator.name}</option>)}
            </select>
          ) : (
            <div className="w-full px-3 py-2 border bg-gray-50 text-sm text-gray-600 flex items-center">
              Scoped to your users
            </div>
          )}
          <select
            value={filters.type}
            onChange={(event) => setFilters((current) => ({ ...current, type: event.target.value }))}
            className="w-full px-3 py-2 border focus:ring-2 focus:ring-primary-500 outline-none text-sm"
          >
            <option value="">All Types</option>
            <option value="jodi">Jodi</option>
            <option value="haruf_andar">Haruf Andar</option>
            <option value="haruf_bahar">Haruf Bahar</option>
            <option value="crossing">Crossing</option>
          </select>
        </div>
      </div>

      {loading ? <div className="text-center py-10 text-gray-500">Loading jantri...</div> : null}

      {!loading && jantri ? (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="bg-white border p-4 sm:p-5">
              <p className="text-xs sm:text-sm text-gray-500">Total Amount</p>
              <p className="text-xl sm:text-2xl font-bold text-primary-600">{formatAmount(summary.total_amount)}</p>
            </div>
            <div className="bg-white border p-4 sm:p-5">
              <p className="text-xs sm:text-sm text-gray-500">Bet Count</p>
              <p className="text-xl sm:text-2xl font-bold text-gray-800">{summary.total_bet_count || 0}</p>
            </div>
            <div className="bg-white border p-4 sm:p-5">
              <p className="text-xs sm:text-sm text-gray-500">Numbers With Bets</p>
              <p className="text-xl sm:text-2xl font-bold text-gray-800">{summary.total_numbers_with_bets || 0}</p>
            </div>
            <div className="bg-white border p-4 sm:p-5">
              <p className="text-xs sm:text-sm text-gray-500">Jodi With No Bets</p>
              <p className="text-xl sm:text-2xl font-bold text-gray-800">{noBetNumbers.length}</p>
            </div>
          </div>

          {summary.highest_bet ? (
            <div className="bg-green-50 border border-green-200 p-4 sm:p-5">
              <p className="text-sm text-green-700 font-medium">Highest Bet</p>
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mt-1">
                <div className="text-lg font-semibold text-green-800">
                  {summary.highest_bet.number} <span className="text-sm font-medium uppercase">{summary.highest_bet.type}</span>
                </div>
                <div className="text-sm text-green-700">
                  {formatAmount(summary.highest_bet.total_amount)} in {summary.highest_bet.bet_count} bets
                </div>
              </div>
            </div>
          ) : null}

          {!harufSection && !jantriSection ? (
            <div className="bg-white border p-8 text-center text-sm text-gray-400">No jantri data for the selected filters.</div>
          ) : (
            <div className="space-y-4">
              {harufSection}
              {jantriSection}
            </div>
          )}

          <div className="bg-white border print:border-0">
            <div className="p-5 border-b">
              <h3 className="text-lg font-semibold text-gray-800">Number Breakdown</h3>
            </div>
            <div className="overflow-x-auto overflow-y-auto max-h-[32rem]">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 sticky top-0">
                  <tr>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Number</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Type</th>
                    <th className="text-right px-4 py-3 font-medium text-gray-600">Total Amount</th>
                    <th className="text-right px-4 py-3 font-medium text-gray-600">Bet Count</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {items.map((item) => (
                    <tr key={`${item.type}-${item.number}`} className="hover:bg-gray-50">
                      <td className="px-4 py-2 font-mono font-bold text-gray-900">{String(item.number).padStart(/^\d{2}$/.test(String(item.number)) ? 2 : 1, '0')}</td>
                      <td className="px-4 py-2 text-gray-600 uppercase text-xs tracking-wide">{item.type}</td>
                      <td className="px-4 py-2 text-right font-medium">{formatAmount(item.total_amount)}</td>
                      <td className="px-4 py-2 text-right text-gray-500">{item.bet_count}</td>
                    </tr>
                  ))}
                  {items.length === 0 ? (
                    <tr><td colSpan={4} className="px-4 py-8 text-center text-gray-400">No bet data</td></tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>

          {noBetNumbers.length > 0 ? (
            <div className="bg-white border p-5">
              <h3 className="text-lg font-semibold text-gray-800 mb-3">Jodi Numbers With No Bets</h3>
              <div className="flex flex-wrap gap-2">
                {noBetNumbers.map((number) => (
                  <span key={number} className="px-3 py-1 bg-gray-100 text-gray-600 text-sm font-mono">{number}</span>
                ))}
              </div>
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}