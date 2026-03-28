import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '../utils/api';
import { useToast, ToastContainer } from '../components/ui';

export default function Users() {
  const [users, setUsers] = useState([]);
  const [moderators, setModerators] = useState([]);
  const [pagination, setPagination] = useState({});
  const [search, setSearch] = useState('');
  const [moderatorFilter, setModeratorFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [selectedModerators, setSelectedModerators] = useState({});
  const [assigningUserId, setAssigningUserId] = useState(null);
  const [loading, setLoading] = useState(true);
  const { toasts, success, error: toastError, dismiss } = useToast();

  useEffect(() => {
    loadModerators();
  }, []);

  useEffect(() => {
    loadUsers();
  }, [page, search, moderatorFilter]);

  const loadModerators = async () => {
    try {
      const res = await api.get('/moderators');
      setModerators(Array.isArray(res.data.moderators) ? res.data.moderators : []);
    } catch (err) {
      console.error(err);
    }
  };

  const loadUsers = async () => {
    setLoading(true);
    try {
      const params = { search, page, limit: 15, role: 'user' };
      if (moderatorFilter !== 'all') {
        params.moderator_id = moderatorFilter;
      }

      const res = await api.get('/admin/users', { params });
      setUsers(Array.isArray(res.data.users) ? res.data.users : []);
      setPagination(res.data.pagination || {});
      setSelectedModerators((current) => {
        const next = { ...current };
        for (const user of res.data.users || []) {
          next[user.id] = user.moderator_id ? String(user.moderator_id) : '';
        }
        return next;
      });
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const toggleBlock = async (id, current) => {
    try {
      await api.put(`/admin/users/${id}/block`, { is_blocked: !current });
      loadUsers();
    } catch (err) {
      toastError(err.response?.data?.error || 'Failed');
    }
  };

  const assignModerator = async (userId) => {
    const moderatorId = selectedModerators[userId];
    if (!moderatorId) {
      toastError('Select a moderator first.');
      return;
    }

    setAssigningUserId(userId);
    try {
      await api.post('/moderators/assign-users', {
        moderator_id: Number(moderatorId),
        user_ids: [userId],
      });
      await loadUsers();
      await loadModerators();
    } catch (err) {
      toastError(err.response?.data?.error || 'Failed to assign moderator');
    } finally {
      setAssigningUserId(null);
    }
  };

  return (
    <div className="space-y-4">
      {/* Search */}
      <div className="flex flex-col sm:flex-row gap-3">
        <input
          type="text"
          placeholder="Search by name or phone..."
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          className="flex-1 px-4 py-2 border focus:ring-2 focus:ring-primary-500 outline-none"
        />
        <select
          value={moderatorFilter}
          onChange={(e) => { setModeratorFilter(e.target.value); setPage(1); }}
          className="px-4 py-2 border bg-white focus:ring-2 focus:ring-primary-500 outline-none"
        >
          <option value="all">All Users</option>
          <option value="unassigned">Without Moderator</option>
          {moderators.map((moderator) => (
            <option key={moderator.id} value={String(moderator.id)}>{moderator.name}</option>
          ))}
        </select>
      </div>

      <div className="bg-blue-50 border border-blue-100 p-4 text-sm text-blue-900">
        Users created with a moderator referral code are now auto-assigned to that moderator. This screen lets admin find unassigned users and assign them manually.
      </div>

      {/* Table */}
      <div className="bg-white border overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="text-left px-4 py-3 font-medium text-gray-600">ID</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Name</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Phone</th>
              <th className="text-right px-4 py-3 font-medium text-gray-600">Balance</th>
              <th className="text-right px-4 py-3 font-medium text-gray-600">Bonus</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Moderator</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Referral</th>
              <th className="text-center px-4 py-3 font-medium text-gray-600">Status</th>
              <th className="text-center px-4 py-3 font-medium text-gray-600">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {users.map((u) => (
              <tr key={u.id} className="hover:bg-gray-50">
                <td className="px-4 py-3">{u.id}</td>
                <td className="px-4 py-3 font-medium">{u.name}</td>
                <td className="px-4 py-3">{u.phone}</td>
                <td className="px-4 py-3 text-right">₹{parseFloat(u.balance || 0).toFixed(2)}</td>
                <td className="px-4 py-3 text-right">₹{parseFloat(u.bonus_balance || 0).toFixed(2)}</td>
                <td className="px-4 py-3">{u.moderator_name || '-'}</td>
                <td className="px-4 py-3 text-xs font-mono">{u.referral_code}</td>
                <td className="px-4 py-3 text-center">
                  <span className={`px-2 py-1 text-xs font-medium ${u.is_blocked ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
                    {u.is_blocked ? 'Blocked' : 'Active'}
                  </span>
                </td>
                <td className="px-4 py-3 text-center">
                  <div className="flex flex-col sm:flex-row items-center justify-center gap-2">
                    <Link
                      to={`/users/${u.id}`}
                      className="px-3 py-1  text-xs font-medium bg-blue-600 text-white hover:bg-blue-700"
                    >
                      Details
                    </Link>
                    <select
                      value={selectedModerators[u.id] || ''}
                      onChange={(e) => setSelectedModerators((current) => ({ ...current, [u.id]: e.target.value }))}
                      className="min-w-36 px-2 py-1 border  text-xs bg-white"
                    >
                      <option value="">Select Moderator</option>
                      {moderators.map((moderator) => (
                        <option key={moderator.id} value={String(moderator.id)}>{moderator.name}</option>
                      ))}
                    </select>
                    <button
                      onClick={() => assignModerator(u.id)}
                      disabled={!selectedModerators[u.id] || assigningUserId === u.id}
                      className="px-3 py-1  text-xs font-medium bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-50"
                    >
                      {assigningUserId === u.id ? 'Assigning...' : 'Assign'}
                    </button>
                    <button
                      onClick={() => toggleBlock(u.id, u.is_blocked)}
                      className={`px-3 py-1  text-xs font-medium ${u.is_blocked ? 'bg-green-600 text-white hover:bg-green-700' : 'bg-red-600 text-white hover:bg-red-700'}`}
                    >
                      {u.is_blocked ? 'Unblock' : 'Block'}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {users.length === 0 && (
              <tr><td colSpan={9} className="px-4 py-8 text-center text-gray-400">{loading ? 'Loading...' : 'No users found'}</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {pagination.totalPages > 1 && (
        <div className="flex justify-center gap-2">
          <button disabled={page <= 1} onClick={() => setPage(page - 1)}
            className="px-4 py-2 bg-white border text-sm disabled:opacity-50 hover:bg-gray-50">Prev</button>
          <span className="px-4 py-2 text-sm text-gray-600">Page {page} of {pagination.totalPages}</span>
          <button disabled={page >= pagination.totalPages} onClick={() => setPage(page + 1)}
            className="px-4 py-2 bg-white border text-sm disabled:opacity-50 hover:bg-gray-50">Next</button>
        </div>
      )}
      <ToastContainer toasts={toasts} dismiss={dismiss} />
    </div>
  );
}
