import { useState, useEffect } from 'react';
import api from '../utils/api';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';

const COLORS = ['#eb950e', '#22c55e', '#3b82f6', '#ef4444', '#8b5cf6', '#f59e0b', '#ec4899', '#06b6d4'];

export default function Analytics() {
  const [games, setGames] = useState([]);
  const [selectedGame, setSelectedGame] = useState('');
  const [selectedType, setSelectedType] = useState('');
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api.get('/games').then(res => setGames(Array.isArray(res.data.games) ? res.data.games : [])).catch(console.error);
  }, []);

  const loadAnalytics = async () => {
    setLoading(true);
    try {
      const params = {};
      if (selectedGame) params.game_id = selectedGame;
      if (selectedType) params.type = selectedType;
      const res = await api.get('/analytics/bets', { params });
      setAnalytics(res.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadAnalytics(); }, [selectedGame, selectedType]);

  return (
    <div className="space-y-6">
      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <select value={selectedGame} onChange={(e) => setSelectedGame(e.target.value)}
          className="px-4 py-2 border focus:ring-2 focus:ring-primary-500 outline-none">
          <option value="">All Games</option>
          {games.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
        </select>
        <select value={selectedType} onChange={(e) => setSelectedType(e.target.value)}
          className="px-4 py-2 border focus:ring-2 focus:ring-primary-500 outline-none">
          <option value="">All Types</option>
          <option value="jodi">Jodi</option>
          <option value="haruf_andar">Haruf Andar</option>
          <option value="haruf_bahar">Haruf Bahar</option>
          <option value="crossing">Crossing</option>
        </select>
      </div>

      {loading && <div className="text-center py-10 text-gray-500">Loading analytics...</div>}

      {analytics && !loading && (() => {
          const items = Array.isArray(analytics.analytics) ? analytics.analytics : [];
          const summary = analytics.summary || {};
          const noBetNumbers = Array.isArray(summary.no_bet_numbers) ? summary.no_bet_numbers : [];
          return (
        <>
          {/* Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white border p-5">
              <p className="text-sm text-gray-500">Numbers with Bets</p>
              <p className="text-2xl font-bold text-primary-600">{summary.total_numbers_with_bets || 0}</p>
            </div>
            <div className="bg-white border p-5">
              <p className="text-sm text-gray-500">Numbers with No Bets</p>
              <p className="text-2xl font-bold text-gray-600">{noBetNumbers.length}</p>
            </div>
            {summary.highest_bet && (
              <div className="bg-green-50 border border-green-200 p-5">
                <p className="text-sm text-green-600">Highest Bet Number</p>
                <p className="text-2xl font-bold text-green-700">#{summary.highest_bet.number}</p>
                <p className="text-xs text-green-500">₹{parseFloat(summary.highest_bet.total_amount || 0).toLocaleString()} ({summary.highest_bet.bet_count} bets)</p>
              </div>
            )}
            {summary.lowest_bet && (
              <div className="bg-red-50 border border-red-200 p-5">
                <p className="text-sm text-red-600">Lowest Bet Number</p>
                <p className="text-2xl font-bold text-red-700">#{summary.lowest_bet.number}</p>
                <p className="text-xs text-red-500">₹{parseFloat(summary.lowest_bet.total_amount || 0).toLocaleString()} ({summary.lowest_bet.bet_count} bets)</p>
              </div>
            )}
          </div>

          {/* Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Bar chart - top 20 numbers */}
            {items.length > 0 && (
            <div className="bg-white border p-6">
              <h3 className="text-lg font-semibold text-gray-800 mb-4">Top 20 Numbers by Bet Amount</h3>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={items.slice(0, 20)}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="number" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip formatter={(val) => `₹${parseFloat(val).toLocaleString()}`} />
                  <Bar dataKey="total_amount" fill="#eb950e" radius={[4, 4, 0, 0]} name="Total Amount" />
                </BarChart>
              </ResponsiveContainer>
            </div>
            )}

            {/* Pie chart - top 10 */}
            {items.length > 0 && (
            <div className="bg-white border p-6">
              <h3 className="text-lg font-semibold text-gray-800 mb-4">Bet Distribution (Top 10)</h3>
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={items.slice(0, 10).map(a => ({ ...a, total_amount: parseFloat(a.total_amount) || 0 }))}
                    dataKey="total_amount"
                    nameKey="number"
                    cx="50%"
                    cy="50%"
                    outerRadius={100}
                    label={({ number }) => `#${number}`}
                  >
                    {items.slice(0, 10).map((_, i) => (
                      <Cell key={i} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(val) => `₹${val.toLocaleString()}`} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            )}
          </div>

          {/* Full table */}
          <div className="bg-white border">
            <div className="p-5 border-b">
              <h3 className="text-lg font-semibold text-gray-800">All Numbers Breakdown</h3>
            </div>
            <div className="overflow-x-auto max-h-96">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 sticky top-0">
                  <tr>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Number</th>
                    <th className="text-right px-4 py-3 font-medium text-gray-600">Total Amount</th>
                    <th className="text-right px-4 py-3 font-medium text-gray-600">Bet Count</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {items.map((a) => (
                    <tr key={a.number} className="hover:bg-gray-50">
                      <td className="px-4 py-2 font-mono font-bold">{a.number}</td>
                      <td className="px-4 py-2 text-right font-medium">₹{parseFloat(a.total_amount || 0).toLocaleString()}</td>
                      <td className="px-4 py-2 text-right text-gray-500">{a.bet_count}</td>
                    </tr>
                  ))}
                  {items.length === 0 && (
                    <tr><td colSpan={3} className="px-4 py-8 text-center text-gray-400">No bet data</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* No-bet numbers */}
          {noBetNumbers.length > 0 && (
            <div className="bg-white border p-6">
              <h3 className="text-lg font-semibold text-gray-800 mb-3">Numbers with No Bets</h3>
              <div className="flex flex-wrap gap-2">
                {noBetNumbers.map(n => (
                  <span key={n} className="px-3 py-1 bg-gray-100 text-gray-600 text-sm font-mono">{n}</span>
                ))}
              </div>
            </div>
          )}
        </>
          );
        })()}
    </div>
  );
}
