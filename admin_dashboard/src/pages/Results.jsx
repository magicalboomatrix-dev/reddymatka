import { useEffect, useMemo, useState } from 'react';
import api from '../utils/api';
import { useConfirm, ConfirmModal } from '../components/ui';

function formatDayLabel(day, month) {
  return `${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}`;
}

function formatTimestamp(value) {
  return value ? new Date(value).toLocaleString('en-IN') : '-';
}

function AdminMonthlyChart({ data }) {
  const gameNames = useMemo(() => {
    const names = new Set();
    Object.values(data?.chart || {}).forEach((gameMap) => {
      Object.keys(gameMap || {}).forEach((name) => names.add(name));
    });
    return [...names];
  }, [data]);

  const year = Number(data?.year) || new Date().getFullYear();
  const month = Number(data?.month) || (new Date().getMonth() + 1);
  const now = new Date();
  const isCurrentMonth = year === now.getFullYear() && month === (now.getMonth() + 1);
  const maxDay = isCurrentMonth ? now.getDate() : new Date(year, month, 0).getDate();
  const today = isCurrentMonth ? now.getDate() : null;

  return (
    <div>
      <div className="head-title topround text-center"><h2 className="title-text"><b> KING MONTHLY CHART</b></h2></div>
      <div className="table-inner">
        <table className="chart-table">
          <thead>
            <tr>
              <th>Date</th>
              {gameNames.map((name) => <th key={name}>{name}</th>)}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: maxDay }, (_, index) => index + 1).map((day) => (
              <tr key={day}>
                <td className={today === day ? 'today-highlight' : ''}>{formatDayLabel(day, month)}</td>
                {gameNames.map((name) => (
                  <td key={`${day}-${name}`} className={today === day ? 'today-highlight' : ''}>
                    {data?.chart?.[day]?.[name]?.result_number || '-'}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function AdminYearlyChart({ data, year }) {
  const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

  return (
    <div>
      <div className="head-title topround text-center"><h2 className="title-text"><b>YEARLY CHART {year}</b></h2></div>
      <div className="table-inner">
        <table className="chart-table chart-table-oth">
          <thead>
            <tr>
              <th>{year}</th>
              {months.map((month) => <th key={month}>{month}</th>)}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: 31 }, (_, index) => index + 1).map((day) => (
              <tr key={day}>
                <td>{day}</td>
                {months.map((_, monthIndex) => (
                  <td key={`${day}-${monthIndex + 1}`}>
                    {data?.chart?.[day]?.[monthIndex]?.result_number || '-'}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function Results() {
  const [games, setGames] = useState([]);
  const [history, setHistory] = useState([]);
  const [historyFilters, setHistoryFilters] = useState({ game_id: '', from_date: '', to_date: '', search: '' });
  const [monthlyFilters, setMonthlyFilters] = useState({ month: String(new Date().getMonth() + 1), year: String(new Date().getFullYear()) });
  const [yearlyFilters, setYearlyFilters] = useState({ game_name: '', year: String(new Date().getFullYear()) });
  const [resultForm, setResultForm] = useState({ game_id: '', result_number: '', result_date: new Date().toISOString().slice(0, 10) });
  const [importForm, setImportForm] = useState({ game_id: '', year: String(new Date().getFullYear()), file: null });
  const [editingResultId, setEditingResultId] = useState(null);
  const [selectedResultIds, setSelectedResultIds] = useState([]);
  const [monthlyData, setMonthlyData] = useState(null);
  const [yearlyData, setYearlyData] = useState(null);
  const [pagination, setPagination] = useState({ total: 0 });
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [importSummary, setImportSummary] = useState(null);
  const { confirmState, confirm, handleConfirm, handleCancel } = useConfirm();

  useEffect(() => {
    initialize();
  }, []);

  const initialize = async () => {
    try {
      const gamesRes = await api.get('/games');
      const gameRows = Array.isArray(gamesRes.data.games) ? gamesRes.data.games : [];
      setGames(gameRows);
      const firstGame = gameRows[0]?.name || '';
      const firstGameId = gameRows[0]?.id ? String(gameRows[0].id) : '';
      setYearlyFilters((current) => ({ ...current, game_name: current.game_name || firstGame }));
      setResultForm((current) => ({ ...current, game_id: current.game_id || firstGameId }));
      setImportForm((current) => ({ ...current, game_id: current.game_id || firstGameId }));
      await Promise.all([
        loadHistory({ ...historyFilters, game_id: historyFilters.game_id || '' }),
        loadMonthlyChart(monthlyFilters.year, monthlyFilters.month),
        firstGame ? loadYearlyChart(yearlyFilters.year, firstGame) : Promise.resolve(),
      ]);
    } catch (requestError) {
      setError(requestError.response?.data?.error || requestError.message || 'Failed to load results data.');
    } finally {
      setLoading(false);
    }
  };

  const loadHistory = async (filters = historyFilters) => {
    const response = await api.get('/results/history', { params: { ...filters, page: 1, limit: 200 } });
    setHistory(Array.isArray(response.data.results) ? response.data.results : []);
    setPagination(response.data.pagination || { total: 0 });
    setSelectedResultIds([]);
  };

  const loadMonthlyChart = async (year, month) => {
    const response = await api.get('/results/admin/monthly', { params: { year, month } });
    setMonthlyData(response.data);
  };

  const loadYearlyChart = async (year, gameName) => {
    if (!gameName) {
      setYearlyData(null);
      return;
    }
    const response = await api.get('/results/admin/yearly', { params: { year, city: gameName } });
    setYearlyData(response.data);
  };

  const handleHistorySubmit = async (event) => {
    event.preventDefault();
    setError('');
    await loadHistory(historyFilters);
  };

  const handleResultSave = async (event) => {
    event.preventDefault();
    setError('');
    setMessage('');
    try {
      const response = editingResultId
        ? await api.put(`/results/${editingResultId}`, resultForm)
        : await api.post('/results/manage', resultForm);
      setMessage(response.data.message || (editingResultId ? 'Result updated successfully.' : 'Result saved successfully.'));
      setEditingResultId(null);
      setResultForm((current) => ({ ...current, result_number: '' }));
      await Promise.all([
        loadHistory(historyFilters),
        loadMonthlyChart(monthlyFilters.year, monthlyFilters.month),
        loadYearlyChart(yearlyFilters.year, yearlyFilters.game_name),
      ]);
    } catch (requestError) {
      setError(requestError.response?.data?.error || requestError.message || 'Failed to save result.');
    }
  };

  const handleImport = async (event) => {
    event.preventDefault();
    setError('');
    setMessage('');
    if (!importForm.file) {
      setError('Choose a CSV/XLS/XLSX file first.');
      return;
    }

    const formData = new FormData();
    formData.append('game_id', importForm.game_id);
    formData.append('year', importForm.year);
    formData.append('file', importForm.file);

    try {
      const response = await api.post('/results/import/yearly', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setImportSummary(response.data);
      setMessage(response.data.message || 'Import completed.');
      await Promise.all([
        loadHistory(historyFilters),
        loadMonthlyChart(monthlyFilters.year, monthlyFilters.month),
        loadYearlyChart(yearlyFilters.year, yearlyFilters.game_name),
      ]);
    } catch (requestError) {
      setError(requestError.response?.data?.error || requestError.message || 'Import failed.');
    }
  };

  const downloadTemplate = async (format) => {
    setError('');
    try {
      const response = await api.get('/results/template/yearly', {
        params: { format },
        responseType: 'blob',
      });

      const blobUrl = window.URL.createObjectURL(new Blob([response.data]));
      const anchor = document.createElement('a');
      anchor.href = blobUrl;
      anchor.download = `yearly-result-template.${format === 'xlsx' ? 'xlsx' : 'csv'}`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.URL.revokeObjectURL(blobUrl);
    } catch (requestError) {
      setError(requestError.response?.data?.error || requestError.message || 'Failed to download template.');
    }
  };

  const startEdit = (row) => {
    setEditingResultId(row.id);
    setMessage('');
    setError('');
    setResultForm({
      game_id: String(row.game_id),
      result_number: row.result_number || '',
      result_date: row.result_date?.slice(0, 10) || new Date().toISOString().slice(0, 10),
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const resetEditor = () => {
    setEditingResultId(null);
    setResultForm({
      game_id: games[0]?.id ? String(games[0].id) : '',
      result_number: '',
      result_date: new Date().toISOString().slice(0, 10),
    });
    setError('');
    setMessage('');
  };

  const deleteSingle = async (row) => {
    const confirmed = await confirm({
      title: 'Delete Result',
      message: `Delete result ${row.result_number} for ${row.game_name} on ${row.result_date?.slice(0, 10)}?`,
      confirmText: 'Delete',
      variant: 'danger',
    });
    if (!confirmed) return;

    setError('');
    setMessage('');
    try {
      const response = await api.delete(`/results/${row.id}`);
      setMessage(response.data.message || 'Result deleted successfully.');
      if (editingResultId === row.id) {
        resetEditor();
      }
      await Promise.all([
        loadHistory(historyFilters),
        loadMonthlyChart(monthlyFilters.year, monthlyFilters.month),
        loadYearlyChart(yearlyFilters.year, yearlyFilters.game_name),
      ]);
    } catch (requestError) {
      setError(requestError.response?.data?.error || requestError.message || 'Failed to delete result.');
    }
  };

  const toggleSelection = (resultId) => {
    setSelectedResultIds((current) => (
      current.includes(resultId)
        ? current.filter((id) => id !== resultId)
        : [...current, resultId]
    ));
  };

  const toggleSelectAll = () => {
    const selectableIds = history.filter((row) => Number(row.linked_bet_count) === 0).map((row) => row.id);
    setSelectedResultIds((current) => (
      current.length === selectableIds.length ? [] : selectableIds
    ));
  };

  const handleBulkDelete = async () => {
    if (selectedResultIds.length === 0) {
      setError('Select at least one unlocked result to delete.');
      return;
    }

    const confirmed = await confirm({
      title: 'Bulk Delete',
      message: `Delete ${selectedResultIds.length} selected results?`,
      confirmText: 'Delete All',
      variant: 'danger',
    });
    if (!confirmed) return;

    setError('');
    setMessage('');
    try {
      const response = await api.post('/results/bulk-delete', { result_ids: selectedResultIds });
      const blockedCount = Array.isArray(response.data.blocked) ? response.data.blocked.length : 0;
      setMessage(`${response.data.deleted_count || 0} results deleted.${blockedCount ? ` ${blockedCount} locked results were skipped.` : ''}`);
      await Promise.all([
        loadHistory(historyFilters),
        loadMonthlyChart(monthlyFilters.year, monthlyFilters.month),
        loadYearlyChart(yearlyFilters.year, yearlyFilters.game_name),
      ]);
    } catch (requestError) {
      setError(requestError.response?.data?.error || requestError.message || 'Bulk delete failed.');
    }
  };

  const selectableIds = history.filter((row) => Number(row.linked_bet_count) === 0).map((row) => row.id);
  const allSelected = selectableIds.length > 0 && selectedResultIds.length === selectableIds.length;

  if (loading) {
    return <div className="py-10 text-center text-gray-500">Loading results management...</div>;
  }

  return (
    <div className="results-admin-page space-y-6">
      <ConfirmModal state={confirmState} onConfirm={handleConfirm} onCancel={handleCancel} />
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <form onSubmit={handleResultSave} className="bg-white border p-5 space-y-4">
          <div>
            <h3 className="text-lg font-semibold text-gray-800">{editingResultId ? 'Edit Result' : 'Add Or Update Result'}</h3>
            <p className="text-sm text-gray-500 mt-1">Use game, date, and result number. Existing rows are updated in place.</p>
          </div>
          <select className="results-input w-full" value={resultForm.game_id} onChange={(event) => setResultForm((current) => ({ ...current, game_id: event.target.value }))}>
            <option value="">Select game</option>
            {games.map((game) => <option key={game.id} value={game.id}>{game.name}</option>)}
          </select>
          <input className="results-input w-full" type="date" value={resultForm.result_date} onChange={(event) => setResultForm((current) => ({ ...current, result_date: event.target.value }))} />
          <input className="results-input w-full" type="text" maxLength={2} placeholder="Result number e.g. 57" value={resultForm.result_number} onChange={(event) => setResultForm((current) => ({ ...current, result_number: event.target.value.replace(/[^0-9]/g, '').slice(0, 2) }))} />
          <div className="flex flex-wrap gap-3">
            <button className="header_btn" type="submit">{editingResultId ? 'Update Result' : 'Save Result'}</button>
            {editingResultId && (
              <button className="px-4 py-2 border border-gray-300 text-sm font-medium text-gray-700" type="button" onClick={resetEditor}>Cancel Edit</button>
            )}
          </div>
        </form>

        <form onSubmit={handleImport} className="bg-white border p-5 space-y-4 xl:col-span-2">
          <div>
            <h3 className="text-lg font-semibold text-gray-800">Import Yearly Chart File</h3>
            <p className="text-sm text-gray-500 mt-1">Upload one game at a time. File format: first column is day, next columns are JAN to DEC exactly like the yearly frontend chart.</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <button className="px-4 py-2 border border-amber-300 bg-amber-50 text-sm font-semibold text-amber-800" type="button" onClick={() => downloadTemplate('csv')}>Download CSV Template</button>
            <button className="px-4 py-2 border border-amber-300 bg-amber-50 text-sm font-semibold text-amber-800" type="button" onClick={() => downloadTemplate('xlsx')}>Download XLSX Template</button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <select className="results-input" value={importForm.game_id} onChange={(event) => setImportForm((current) => ({ ...current, game_id: event.target.value }))}>
              <option value="">Select game</option>
              {games.map((game) => <option key={game.id} value={game.id}>{game.name}</option>)}
            </select>
            <input className="results-input" type="number" min="2024" max="2100" value={importForm.year} onChange={(event) => setImportForm((current) => ({ ...current, year: event.target.value }))} />
            <input className="results-input md:col-span-2" type="file" accept=".csv,.xls,.xlsx" onChange={(event) => setImportForm((current) => ({ ...current, file: event.target.files?.[0] || null }))} />
          </div>
          <button className="header_btn" type="submit">Import Year File</button>
          {importSummary && (
            <div className="border border-amber-200 bg-amber-50 p-4 text-sm text-gray-700">
              <p><strong>Processed:</strong> {importSummary.processed} cells</p>
              <p><strong>Skipped:</strong> {importSummary.skipped_count}</p>
              {importSummary.skipped?.length > 0 && (
                <div className="mt-2 max-h-32 overflow-auto text-xs text-gray-600">
                  {importSummary.skipped.map((entry) => <div key={entry}>{entry}</div>)}
                </div>
              )}
            </div>
          )}
        </form>
      </div>

      {(message || error) && (
        <div className={`border p-4 text-sm ${error ? 'border-red-200 bg-red-50 text-red-700' : 'border-green-200 bg-green-50 text-green-700'}`}>
          {error || message}
        </div>
      )}

      <div className="bg-white border p-5 space-y-4">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold text-gray-800">Result History</h3>
            <p className="text-sm text-gray-500 mt-1">Filter past results by game, free text, and any date range. Locked rows already tied to settled bets cannot be changed here.</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-sm text-gray-500">{pagination.total || 0} results</div>
            <button className="px-4 py-2 border border-red-200 bg-red-50 text-sm font-semibold text-red-700 disabled:opacity-50" type="button" onClick={handleBulkDelete} disabled={selectedResultIds.length === 0}>Delete Selected</button>
          </div>
        </div>

        <form onSubmit={handleHistorySubmit} className="grid grid-cols-1 md:grid-cols-5 gap-3">
          <select className="results-input" value={historyFilters.game_id} onChange={(event) => setHistoryFilters((current) => ({ ...current, game_id: event.target.value }))}>
            <option value="">All games</option>
            {games.map((game) => <option key={game.id} value={game.id}>{game.name}</option>)}
          </select>
          <input className="results-input" type="date" value={historyFilters.from_date} onChange={(event) => setHistoryFilters((current) => ({ ...current, from_date: event.target.value }))} />
          <input className="results-input" type="date" value={historyFilters.to_date} onChange={(event) => setHistoryFilters((current) => ({ ...current, to_date: event.target.value }))} />
          <input className="results-input" type="text" placeholder="Search game or result" value={historyFilters.search} onChange={(event) => setHistoryFilters((current) => ({ ...current, search: event.target.value }))} />
          <button className="header_btn" type="submit">Apply Filters</button>
        </form>

        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-center px-4 py-3 font-medium text-gray-600">
                  <input type="checkbox" checked={allSelected} onChange={toggleSelectAll} />
                </th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Game</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Result</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Result Date</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Declared At</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Status</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {history.map((row) => (
                <tr key={row.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-center">
                    <input type="checkbox" checked={selectedResultIds.includes(row.id)} disabled={Number(row.linked_bet_count) > 0} onChange={() => toggleSelection(row.id)} />
                  </td>
                  <td className="px-4 py-3 font-medium text-gray-800">{row.game_name}</td>
                  <td className="px-4 py-3">{row.result_number}</td>
                  <td className="px-4 py-3">{row.result_date?.slice(0, 10)}</td>
                  <td className="px-4 py-3">{formatTimestamp(row.declared_at)}</td>
                  <td className="px-4 py-3">
                    {Number(row.linked_bet_count) > 0 ? (
                      <span className="inline-flex px-2 py-1 text-xs font-semibold bg-amber-100 text-amber-800">Locked</span>
                    ) : (
                      <span className="inline-flex px-2 py-1 text-xs font-semibold bg-green-100 text-green-700">Editable</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-2">
                      <button className="px-3 py-1.5 border border-blue-200 bg-blue-50 text-xs font-semibold text-blue-700 disabled:opacity-50" type="button" onClick={() => startEdit(row)} disabled={Number(row.linked_bet_count) > 0}>Edit</button>
                      <button className="px-3 py-1.5 border border-red-200 bg-red-50 text-xs font-semibold text-red-700 disabled:opacity-50" type="button" onClick={() => deleteSingle(row)} disabled={Number(row.linked_bet_count) > 0}>Delete</button>
                    </div>
                  </td>
                </tr>
              ))}
              {history.length === 0 && (
                <tr>
                  <td colSpan="7" className="px-4 py-8 text-center text-gray-400">No results found for the current filters.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <div className="bg-white border p-5">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-3">
            <div>
              <h3 className="text-lg font-semibold text-gray-800">Monthly Chart View</h3>
              <p className="text-sm text-gray-500 mt-1">Same multi-game chart structure as the user frontend.</p>
            </div>
          </div>
          <div className="select-opts">
            <select className="select-dropdown" value={monthlyFilters.month} onChange={(event) => setMonthlyFilters((current) => ({ ...current, month: event.target.value }))}>
              {Array.from({ length: 12 }, (_, index) => index + 1).map((monthValue) => <option key={monthValue} value={String(monthValue)}>{new Date(2000, monthValue - 1, 1).toLocaleString('en-IN', { month: 'long' })}</option>)}
            </select>
            <input className="results-input" type="number" min="2024" max="2100" value={monthlyFilters.year} onChange={(event) => setMonthlyFilters((current) => ({ ...current, year: event.target.value }))} />
            <button className="header_btn" type="button" onClick={() => loadMonthlyChart(monthlyFilters.year, monthlyFilters.month)}>Check</button>
          </div>
          <AdminMonthlyChart data={monthlyData} />
        </div>

        <div className="bg-white border p-5">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-3">
            <div>
              <h3 className="text-lg font-semibold text-gray-800">Yearly Chart View</h3>
              <p className="text-sm text-gray-500 mt-1">Single-game yearly chart in the same matrix format as the user frontend.</p>
            </div>
          </div>
          <div className="select-opts">
            <select className="select-dropdown" value={yearlyFilters.game_name} onChange={(event) => setYearlyFilters((current) => ({ ...current, game_name: event.target.value }))}>
              {games.map((game) => <option key={game.id} value={game.name}>{game.name}</option>)}
            </select>
            <input className="results-input" type="number" min="2024" max="2100" value={yearlyFilters.year} onChange={(event) => setYearlyFilters((current) => ({ ...current, year: event.target.value }))} />
            <button className="header_btn" type="button" onClick={() => loadYearlyChart(yearlyFilters.year, yearlyFilters.game_name)}>Check</button>
          </div>
          <AdminYearlyChart data={yearlyData} year={yearlyFilters.year} />
        </div>
      </div>
    </div>
  );
}