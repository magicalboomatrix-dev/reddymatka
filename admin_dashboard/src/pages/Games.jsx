import { useState, useEffect } from 'react';
import api from '../utils/api';
import { useToast, ToastContainer, useConfirm, ConfirmModal } from '../components/ui';

function getLocalDateInputValue(referenceDate = new Date()) {
  const year = referenceDate.getFullYear();
  const month = String(referenceDate.getMonth() + 1).padStart(2, '0');
  const day = String(referenceDate.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatResultDate(dateVal) {
  if (!dateVal) return '';
  if (typeof dateVal === 'string') return dateVal.slice(0, 10);
  return new Date(dateVal).toISOString().slice(0, 10);
}

function getResultLabel(game) {
  if (!game.result_number || !game.result_date) return null;
  return `Result (${formatResultDate(game.result_date)})`;
}

export default function Games() {
  const [games, setGames] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [showResult, setShowResult] = useState(null);
  const [form, setForm] = useState({ name: '', open_time: '', close_time: '' });
  const [editingGameId, setEditingGameId] = useState(null);
  const [resultForm, setResultForm] = useState({ result_number: '', result_date: getLocalDateInputValue() });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [settling, setSettling] = useState(null);
  const [pendingBetsModal, setPendingBetsModal] = useState(null);
  const [pendingBetsData, setPendingBetsData] = useState(null);
  const [loadingPending, setLoadingPending] = useState(false);
  const { toasts, success, error: toastError, dismiss } = useToast();
  const { confirmState, confirm, handleConfirm, handleCancel } = useConfirm();

  useEffect(() => { loadGames(); }, []);

  const loadGames = async () => {
    try {
      const res = await api.get('/games');
      setGames(Array.isArray(res.data.games) ? res.data.games : []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    setError('');
    try {
      await api.post('/games', form);
      setShowForm(false);
      setForm({ name: '', open_time: '', close_time: '' });
      loadGames();
    } catch (err) {
      if (err.response?.status === 409) {
        setError('Game already exists � try a different name.');
      } else {
        setError(err.response?.data?.error || 'Failed');
      }
    }
  };

  const handleUpdate = async (e) => {
    e.preventDefault();
    setError('');
    try {
      await api.put(`/games/${editingGameId}`, form);
      setShowForm(false);
      setEditingGameId(null);
      setForm({ name: '', open_time: '', close_time: '' });
      loadGames();
    } catch (err) {
      if (err.response?.status === 409) {
        setError('Game already exists � try a different name.');
      } else {
        setError(err.response?.data?.error || 'Failed');
      }
    }
  };

  const startCreate = () => {
    setShowForm((prev) => {
      const next = !prev;
      if (!next) {
        setEditingGameId(null);
        setForm({ name: '', open_time: '', close_time: '' });
        setError('');
      }
      return next;
    });
    if (!showForm) {
      setEditingGameId(null);
      setForm({ name: '', open_time: '', close_time: '' });
      setError('');
    }
  };

  const startEdit = (game) => {
    setEditingGameId(game.id);
    setForm({
      name: game.name || '',
      open_time: game.open_time || '',
      close_time: game.close_time || '',
    });
    setError('');
    setShowForm(true);
  };

  const cancelForm = () => {
    setShowForm(false);
    setEditingGameId(null);
    setForm({ name: '', open_time: '', close_time: '' });
    setError('');
  };

  const handleDelete = async (game) => {
    const confirmed = await confirm({
      title: 'Delete Game',
      message: `Delete game "${game.name}"? This action cannot be undone.`,
      confirmText: 'Delete',
      variant: 'danger',
    });
    if (!confirmed) return;

    try {
      await api.delete(`/games/${game.id}`);
      if (editingGameId === game.id) {
        cancelForm();
      }
      loadGames();
      success('Game deleted successfully.');
    } catch (err) {
      toastError(err.response?.data?.error || 'Failed to delete game');
    }
  };

  const toggleActive = async (id, current) => {
    try {
      await api.put(`/games/${id}`, { is_active: current ? 0 : 1 });
      loadGames();
    } catch (err) {
      toastError(err.response?.data?.error || 'Failed');
    }
  };

  const declareResult = async (e) => {
    e.preventDefault();
    setError('');
    try {
      const res = await api.post(`/games/${showResult}/result`, resultForm);
      setShowResult(null);
      setResultForm({ result_number: '', result_date: getLocalDateInputValue() });
      loadGames();
      success(res.data?.message || 'Result declared successfully!');
    } catch (err) {
      setError(err.response?.data?.error || 'Failed');
    }
  };

  const handleSettle = async (gameId) => {
    setSettling(gameId);
    try {
      const res = await api.post(`/games/${gameId}/settle`);
      success(res.data?.message || 'Bets settled!');
      loadGames();
    } catch (err) {
      toastError(err.response?.data?.error || 'Failed to settle bets');
    } finally {
      setSettling(null);
    }
  };

  const openPendingBetsModal = async (game, sessionDate = null) => {
    setPendingBetsModal(game);
    setLoadingPending(true);
    try {
      const url = sessionDate
        ? `/games/${game.id}/pending-bets?session_date=${sessionDate}`
        : `/games/${game.id}/pending-bets`;
      const res = await api.get(url);
      setPendingBetsData(res.data);
    } catch (err) {
      toastError(err.response?.data?.error || 'Failed to load pending bets');
    } finally {
      setLoadingPending(false);
    }
  };

  const closePendingBetsModal = () => {
    setPendingBetsModal(null);
    setPendingBetsData(null);
  };

  return (
    <div className="space-y-4">
      <ToastContainer toasts={toasts} dismiss={dismiss} />
      <ConfirmModal state={confirmState} onConfirm={handleConfirm} onCancel={handleCancel} />
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold text-gray-800">Games ({games.length})</h3>
        <button onClick={startCreate}
          className="px-4 py-2 bg-primary-600 text-white hover:bg-primary-700 text-sm font-medium">
          {showForm && editingGameId === null ? 'Cancel' : '+ Add Game'}
        </button>
      </div>

      {showForm && (
        <form onSubmit={editingGameId ? handleUpdate : handleCreate} className="bg-white border p-6 space-y-4">
          {error && <div className="p-3 bg-red-50 text-red-700 text-sm">{error}</div>}
          <h4 className="font-semibold text-gray-800">{editingGameId ? 'Edit Game' : 'Add Game'}</h4>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <input type="text" placeholder="Game Name (e.g., DISAWAR)" value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="px-4 py-2 border focus:ring-2 focus:ring-primary-500 outline-none" required />
            <div>
              <label className="block text-xs text-gray-500 mb-1">Open Time</label>
              <input type="time" value={form.open_time}
                onChange={(e) => setForm({ ...form, open_time: e.target.value })}
                className="w-full px-4 py-2 border focus:ring-2 focus:ring-primary-500 outline-none" required />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Close Time</label>
              <input type="time" value={form.close_time}
                onChange={(e) => setForm({ ...form, close_time: e.target.value })}
                className="w-full px-4 py-2 border focus:ring-2 focus:ring-primary-500 outline-none" required />
            </div>
          </div>
          <div className="flex gap-2">
            <button type="submit" className="px-6 py-2 bg-green-600 text-white hover:bg-green-700 text-sm font-medium">
              {editingGameId ? 'Update Game' : 'Create Game'}
            </button>
            <button type="button" onClick={cancelForm} className="px-4 py-2 bg-gray-200 text-sm">Cancel</button>
          </div>
        </form>
      )}

      {/* Declare Result Modal */}
      {showResult && (
        <form onSubmit={declareResult} className="bg-white border p-6 space-y-4 border-primary-300">
          <h4 className="font-semibold text-gray-800">Declare Result for Game #{showResult}</h4>
          {error && <div className="p-3 bg-red-50 text-red-700 text-sm">{error}</div>}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <input type="text" placeholder="Result Number (e.g., 57)" value={resultForm.result_number}
              onChange={(e) => setResultForm({ ...resultForm, result_number: e.target.value })}
              className="px-4 py-2 border focus:ring-2 focus:ring-primary-500 outline-none" required />
            <input type="date" value={resultForm.result_date}
              onChange={(e) => setResultForm({ ...resultForm, result_date: e.target.value })}
              className="px-4 py-2 border focus:ring-2 focus:ring-primary-500 outline-none" required />
          </div>
          <div className="flex gap-2">
            <button type="submit" className="px-6 py-2 bg-primary-600 text-white hover:bg-primary-700 text-sm font-medium">Declare & Settle Bets</button>
            <button type="button" onClick={() => setShowResult(null)} className="px-4 py-2 bg-gray-200 text-sm">Cancel</button>
          </div>
        </form>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {games.map((g) => (
          <div key={g.id} className={`bg-white border p-5 ${!g.is_active ? 'opacity-60' : ''}`}>
            <div className="flex justify-between items-start mb-3">
              <h4 className="font-bold text-lg text-gray-800">{g.name}</h4>
              <div className="flex gap-1">
                {g.is_overnight ? (
                  <span className="px-2 py-1 text-xs font-medium bg-purple-100 text-purple-700">Overnight</span>
                ) : null}
                <span className={`px-2 py-1 text-xs font-medium ${g.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                  {g.is_active ? 'Active' : 'Inactive'}
                </span>
              </div>
            </div>
            <div className="text-sm text-gray-600 space-y-1">
              <p>Open: <span className="font-medium">{g.open_time}</span></p>
              <p>Close: <span className="font-medium">{g.close_time}</span></p>
              <p className="text-xs text-gray-500">Session Date: {g.current_session_date || formatResultDate(g.result_date)}</p>
              {g.result_number && (() => {
                const label = getResultLabel(g);
                return (
                  <>
                    <p className="text-primary-600 font-bold">{label}: {g.result_number}</p>
                    <span className={`inline-block mt-0.5 px-2 py-0.5 text-xs font-medium rounded ${g.is_result_settled ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
                      {g.is_result_settled ? 'Settled' : 'Pending settlement'}
                    </span>
                  </>
                );
              })()}
              {!g.result_number && g.last_result_number && (() => {
                return (
                  <>
                    <p className="text-primary-600 font-bold">Last Result ({formatResultDate(g.last_result_date)}): {g.last_result_number}</p>
                    <span className={`inline-block mt-0.5 px-2 py-0.5 text-xs font-medium rounded ${g.is_last_result_settled ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
                      {g.is_last_result_settled ? 'Settled' : 'Pending settlement'}
                    </span>
                  </>
                );
              })()}
              {g.declared_at && (
                <p className="text-xs text-gray-400">Declared: {new Date(g.declared_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}</p>
              )}
              {g.pending_by_date && g.pending_by_date.length > 0 && (
                <div className="mt-2 space-y-1">
                  <p className="text-orange-600 font-semibold text-xs">Pending Bets by Date:</p>
                  {g.pending_by_date.map((pd) => (
                    <button
                      key={pd.session_date}
                      onClick={() => openPendingBetsModal(g, pd.session_date)}
                      className="block w-full text-left text-xs bg-orange-50 hover:bg-orange-100 px-2 py-1 rounded text-orange-700 transition-colors"
                    >
                      {new Date(pd.session_date).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' })}: {pd.count} bet(s)
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="flex gap-2 mt-4">
              <button onClick={() => { setShowResult(g.id); setResultForm({ result_number: '', result_date: g.current_session_date || getLocalDateInputValue() }); setError(''); }}
                className="flex-1 px-3 py-2 bg-primary-600 text-white text-xs font-medium hover:bg-primary-700">
                Declare Result
              </button>
              {g.pending_bets_count > 0 && (
                <>
                  <button
                    onClick={() => handleSettle(g.id)}
                    disabled={settling === g.id}
                    className="px-3 py-2 bg-orange-500 text-white text-xs font-medium hover:bg-orange-600 disabled:opacity-50"
                  >
                    {settling === g.id ? 'Settling...' : 'Settle'}
                  </button>
                  <button
                    onClick={() => openPendingBetsModal(g)}
                    className="px-3 py-2 bg-blue-500 text-white text-xs font-medium hover:bg-blue-600"
                  >
                    View All
                  </button>
                </>
              )}
              <button onClick={() => toggleActive(g.id, g.is_active)}
                className={`px-3 py-2 text-xs font-medium ${g.is_active ? 'bg-gray-200 text-gray-600' : 'bg-green-100 text-green-700'}`}>
                {g.is_active ? 'Disable' : 'Enable'}
              </button>
            </div>
            <div className="flex gap-2 mt-2">
              <button onClick={() => startEdit(g)}
                className="flex-1 px-3 py-2 bg-yellow-100 text-yellow-800 text-xs font-medium hover:bg-yellow-200">
                Edit
              </button>
              <button onClick={() => handleDelete(g)}
                className="px-3 py-2 bg-red-100 text-red-700 text-xs font-medium hover:bg-red-200">
                Delete
              </button>
            </div>
          </div>
        ))}
      </div>

      {games.length === 0 && !loading && (
        <div className="text-center py-10 text-gray-400">No games configured</div>
      )}

      {/* Pending Bets Modal */}
      {pendingBetsModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
            <div className="p-4 border-b flex justify-between items-center bg-gray-50">
              <div>
                <h3 className="font-semibold text-lg text-gray-800">
                  Pending Bets - {pendingBetsModal.name}
                </h3>
                {pendingBetsData?.filtered_by_date && (
                  <p className="text-sm text-gray-600">Filtered by: {new Date(pendingBetsData.filtered_by_date).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' })}</p>
                )}
              </div>
              <button
                onClick={closePendingBetsModal}
                className="text-gray-500 hover:text-gray-700 text-2xl font-bold"
              >
                ×
              </button>
            </div>

            <div className="p-4 overflow-y-auto flex-1">
              {loadingPending ? (
                <div className="text-center py-8 text-gray-500">Loading...</div>
              ) : pendingBetsData ? (
                <>
                  {/* Summary Section */}
                  {pendingBetsData.summary && pendingBetsData.summary.length > 0 && (
                    <div className="mb-4">
                      <h4 className="font-semibold text-sm text-gray-700 mb-2">Summary by Date:</h4>
                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                        {pendingBetsData.summary.map((s) => (
                          <button
                            key={s.session_date}
                            onClick={() => openPendingBetsModal(pendingBetsModal, s.session_date)}
                            className={`p-2 rounded text-left text-sm transition-colors ${
                              pendingBetsData.filtered_by_date === s.session_date
                                ? 'bg-blue-100 border-2 border-blue-500'
                                : 'bg-gray-50 hover:bg-gray-100 border border-gray-200'
                            }`}
                          >
                            <div className="font-medium">{new Date(s.session_date).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' })}</div>
                            <div className="text-xs text-gray-600">
                              {s.count} bets · ₹{parseFloat(s.total_amount).toLocaleString('en-IN')}
                            </div>
                          </button>
                        ))}
                        {pendingBetsData.filtered_by_date && (
                          <button
                            onClick={() => openPendingBetsModal(pendingBetsModal)}
                            className="p-2 rounded text-center text-sm bg-gray-100 hover:bg-gray-200 border border-gray-200"
                          >
                            Show All Dates
                          </button>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Bets List */}
                  <div>
                    <h4 className="font-semibold text-sm text-gray-700 mb-2">
                      Bet Details ({pendingBetsData.bets?.length || 0} bets)
                    </h4>
                    {pendingBetsData.bets && pendingBetsData.bets.length > 0 ? (
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead className="bg-gray-50">
                            <tr>
                              <th className="px-3 py-2 text-left">ID</th>
                              <th className="px-3 py-2 text-left">User</th>
                              <th className="px-3 py-2 text-left">Type</th>
                              <th className="px-3 py-2 text-left">Numbers</th>
                              <th className="px-3 py-2 text-right">Amount</th>
                              <th className="px-3 py-2 text-left">Session Date</th>
                              <th className="px-3 py-2 text-left">Placed At</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y">
                            {pendingBetsData.bets.map((bet) => (
                              <tr key={bet.id} className="hover:bg-gray-50">
                                <td className="px-3 py-2">#{bet.id}</td>
                                <td className="px-3 py-2">
                                  <div className="font-medium">{bet.user_name}</div>
                                  <div className="text-xs text-gray-500">{bet.user_phone}</div>
                                </td>
                                <td className="px-3 py-2">
                                  <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs">
                                    {bet.type}
                                  </span>
                                </td>
                                <td className="px-3 py-2 font-mono text-xs">{bet.numbers}</td>
                                <td className="px-3 py-2 text-right font-medium">
                                  ₹{parseFloat(bet.total_amount).toLocaleString('en-IN')}
                                </td>
                                <td className="px-3 py-2">{new Date(bet.session_date).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' })}</td>
                                <td className="px-3 py-2 text-xs text-gray-500">
                                  {new Date(bet.created_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <div className="text-center py-8 text-gray-500">
                        No pending bets found for this filter.
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <div className="text-center py-8 text-gray-500">Failed to load data</div>
              )}
            </div>

            <div className="p-4 border-t bg-gray-50 flex justify-end gap-2">
              <button
                onClick={closePendingBetsModal}
                className="px-4 py-2 bg-gray-200 text-gray-700 rounded hover:bg-gray-300"
              >
                Close
              </button>
              {pendingBetsData?.bets?.length > 0 && (
                <button
                  onClick={() => {
                    handleSettle(pendingBetsModal.id);
                    closePendingBetsModal();
                  }}
                  className="px-4 py-2 bg-orange-500 text-white rounded hover:bg-orange-600"
                >
                  Settle All Pending
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

