// Add a button to trigger matching all unmatched UPI webhook transactions for today
import { useState } from 'react';
import api from '../utils/api';

export function MatchAllUnmatchedButton({ onMatched }) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);

  const handleMatchAll = async () => {
    setLoading(true);
    setResult(null);
    try {
      const res = await api.post('/auto-deposit/admin/match-today-unmatched');
      setResult(res.data);
      if (onMatched) onMatched();
    } catch (err) {
      setResult({ error: err.response?.data?.error || 'Failed to match.' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="inline-block">
      <button
        onClick={handleMatchAll}
        disabled={loading}
        className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-60"
      >
        {loading ? 'Matching…' : 'Match All Unmatched (Today)'}
      </button>
      {result && (
        <div className="mt-2 text-xs text-dark-700">
          {result.error ? (
            <span className="text-red-600">{result.error}</span>
          ) : (
            <pre className="bg-gray-100 p-2 rounded whitespace-pre-wrap max-w-md overflow-x-auto">{JSON.stringify(result, null, 2)}</pre>
          )}
        </div>
      )}
    </div>
  );
}
