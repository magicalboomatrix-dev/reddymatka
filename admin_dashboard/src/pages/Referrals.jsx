import { useState, useEffect, useCallback } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import api from '../utils/api';
import SavedFilterPresets from '../components/SavedFilterPresets';

function getReferralFiltersFromSearchParams(searchParams) {
  return {
    search: searchParams.get('search') || '',
    status: searchParams.get('status') || '',
    referrerType: searchParams.get('referrer_type') || '',
  };
}

export default function Referrals() {
  const [searchParams] = useSearchParams();
  const [referrals, setReferrals] = useState([]);
  const [stats, setStats] = useState({});
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [limit] = useState(20);
  const [search, setSearch] = useState(() => getReferralFiltersFromSearchParams(searchParams).search);
  const [status, setStatus] = useState(() => getReferralFiltersFromSearchParams(searchParams).status);
  const [referrerType, setReferrerType] = useState(() => getReferralFiltersFromSearchParams(searchParams).referrerType);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const next = getReferralFiltersFromSearchParams(searchParams);
    setSearch(next.search);
    setStatus(next.status);
    setReferrerType(next.referrerType);
    setPage(1);
  }, [searchParams]);

  const fetchReferrals = useCallback(async () => {
    setLoading(true);
    try {
      const params = { page, limit };
      if (search) params.search = search;
      if (status) params.status = status;
      if (referrerType) params.referrer_type = referrerType;
      const { data } = await api.get('/admin/referrals', { params });
      setReferrals(data.referrals || []);
      setTotal(data.total || 0);
      setStats(data.stats || {});
    } catch (err) {
      console.error('Failed to load referrals', err);
    } finally {
      setLoading(false);
    }
  }, [page, limit, search, status, referrerType]);

  useEffect(() => { fetchReferrals(); }, [fetchReferrals]);

  const totalPages = Math.ceil(total / limit) || 1;

  const fmt = (v) => `₹${parseFloat(v || 0).toLocaleString('en-IN')}`;

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Referrals</h1>

      {/* Stats cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Total Referrals" value={stats.total_referrals ?? '-'} />
        <StatCard label="Total Bonus" value={fmt(stats.total_bonus)} color="text-blue-700" />
        <StatCard label="Credited" value={`${stats.credited_count ?? 0} (${fmt(stats.credited_bonus)})`} color="text-green-700" />
        <StatCard label="Pending" value={`${stats.pending_count ?? 0} (${fmt(stats.pending_bonus)})`} color="text-amber-700" />
        <StatCard label="Moderator Bonus" value={fmt(stats.moderator_bonus)} color="text-purple-700" />
        <StatCard label="User Bonus" value={fmt(stats.user_bonus)} color="text-indigo-700" />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <input
          type="text"
          placeholder="Search name or phone…"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          className="border px-3 py-2 text-sm w-56"
        />
        <select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} className="border px-3 py-2 text-sm">
          <option value="">All Status</option>
          <option value="pending">Pending</option>
          <option value="credited">Credited</option>
        </select>
        <select value={referrerType} onChange={(e) => { setReferrerType(e.target.value); setPage(1); }} className="border px-3 py-2 text-sm">
          <option value="">All Referrer Types</option>
          <option value="moderator">Moderator</option>
          <option value="user">User</option>
        </select>
      </div>

      <SavedFilterPresets
        storageKey="referrals"
        currentFilters={{ search, status, referrerType }}
        onApply={(nextFilters) => {
          setPage(1);
          setSearch(nextFilters.search || '');
          setStatus(nextFilters.status || '');
          setReferrerType(nextFilters.referrerType || '');
        }}
      />

      {/* Table */}
      <div className="bg-white border overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="text-left px-4 py-3 font-medium text-gray-600">ID</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Referrer</th>
              <th className="text-center px-4 py-3 font-medium text-gray-600">Type</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Referred User</th>
              <th className="text-right px-4 py-3 font-medium text-gray-600">Bonus</th>
              <th className="text-center px-4 py-3 font-medium text-gray-600">Status</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Date</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Credited At</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {referrals.map((r) => (
              <tr key={r.id} className="hover:bg-gray-50">
                <td className="px-4 py-3">{r.id}</td>
                <td className="px-4 py-3">
                  <Link
                    to={r.referrer_role === 'moderator' ? `/moderators/${r.referrer_id}` : `/users/${r.referrer_id}`}
                    className="text-blue-600 hover:underline font-medium"
                  >
                    {r.referrer_name || r.referrer_phone}
                  </Link>
                </td>
                <td className="px-4 py-3 text-center">
                  <span className={`px-2 py-0.5 text-xs font-semibold rounded ${r.referrer_role === 'moderator' ? 'bg-purple-100 text-purple-700' : 'bg-indigo-100 text-indigo-700'}`}>
                    {r.referrer_role === 'moderator' ? 'Moderator' : 'User'}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <Link to={`/users/${r.referred_id}`} className="text-blue-600 hover:underline">
                    {r.referred_name || r.referred_phone}
                  </Link>
                </td>
                <td className="px-4 py-3 text-right font-semibold text-green-700">{fmt(r.bonus_amount)}</td>
                <td className="px-4 py-3 text-center">
                  <span className={`px-2 py-0.5 text-xs font-semibold rounded ${r.status === 'credited' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
                    {r.status === 'credited' ? 'Credited' : 'Pending'}
                  </span>
                </td>
                <td className="px-4 py-3 text-gray-500 text-xs">
                  {new Date(r.created_at).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' })}
                </td>
                <td className="px-4 py-3 text-gray-500 text-xs">
                  {r.credited_at ? new Date(r.credited_at).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' }) : '—'}
                </td>
              </tr>
            ))}
            {referrals.length === 0 && (
              <tr><td colSpan={8} className="px-4 py-8 text-center text-gray-400">{loading ? 'Loading…' : 'No referrals found'}</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-500">Page {page} of {totalPages} ({total} total)</span>
          <div className="flex gap-2">
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="px-3 py-1 border disabled:opacity-40">Prev</button>
            <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="px-3 py-1 border disabled:opacity-40">Next</button>
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, color = 'text-gray-900' }) {
  return (
    <div className="bg-white border p-3">
      <div className="text-xs text-gray-500 font-medium">{label}</div>
      <div className={`text-lg font-bold mt-1 ${color}`}>{value}</div>
    </div>
  );
}
