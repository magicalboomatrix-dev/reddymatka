import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '../utils/api';
import { useAuth } from '../context/AuthContext';
import { useToast, ToastContainer } from '../components/ui';
import SavedFilterPresets from '../components/SavedFilterPresets';

// Skeleton components
function UserCardSkeleton() {
  return (
    <div className="bg-white border rounded-lg p-4 animate-pulse">
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1">
          <div className="h-4 bg-gray-200 rounded w-3/4 mb-2"></div>
          <div className="h-3 bg-gray-200 rounded w-1/2"></div>
        </div>
        <div className="h-6 bg-gray-200 rounded w-16"></div>
      </div>
      <div className="grid grid-cols-2 gap-2 mb-3">
        <div className="h-3 bg-gray-200 rounded"></div>
        <div className="h-3 bg-gray-200 rounded"></div>
      </div>
      <div className="h-8 bg-gray-200 rounded"></div>
    </div>
  );
}

function TableRowSkeleton() {
  return (
    <tr className="animate-pulse">
      <td className="px-2 py-2"><div className="h-3 bg-gray-200 rounded w-8"></div></td>
      <td className="px-2 py-2"><div className="h-3 bg-gray-200 rounded w-20"></div></td>
      <td className="px-2 py-2"><div className="h-3 bg-gray-200 rounded w-16"></div></td>
      <td className="px-2 py-2"><div className="h-3 bg-gray-200 rounded w-12 ml-auto"></div></td>
      <td className="px-2 py-2"><div className="h-3 bg-gray-200 rounded w-12 ml-auto"></div></td>
      <td className="px-2 py-2"><div className="h-3 bg-gray-200 rounded w-16"></div></td>
      <td className="px-2 py-2"><div className="h-3 bg-gray-200 rounded w-12"></div></td>
      <td className="px-2 py-2"><div className="h-5 bg-gray-200 rounded w-14 mx-auto"></div></td>
      <td className="px-2 py-2"><div className="h-6 bg-gray-200 rounded w-20 mx-auto"></div></td>
    </tr>
  );
}

// Mobile User Card Component
function UserCard({ u, isAdmin, selectedModerators, setSelectedModerators, assignModerator, toggleBlock, assigningUserId, moderators }) {
  return (
    <div className="bg-white border rounded-lg p-3 sm:p-4 hover:shadow-md transition-shadow">
      {/* Header */}
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="flex-1 min-w-0">
          <Link to={`/users/${u.id}`} className="font-semibold text-gray-800 hover:text-blue-600 truncate block">
            {u.name}
          </Link>
          <p className="text-sm text-gray-500">{u.phone}</p>
        </div>
        <span className={`flex-shrink-0 px-2 py-0.5 text-xs font-medium rounded-full ${
          u.is_blocked ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'
        }`}>
          {u.is_blocked ? '🔒 Blocked' : '✓ Active'}
        </span>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 gap-2 mb-3">
        <div className="bg-gray-50 rounded-lg p-2">
          <p className="text-xs text-gray-500">Balance</p>
          <p className="text-sm font-semibold text-gray-800">₹{parseFloat(u.balance || 0).toLocaleString('en-IN')}</p>
        </div>
        <div className="bg-gray-50 rounded-lg p-2">
          <p className="text-xs text-gray-500">Bonus</p>
          <p className="text-sm font-semibold text-gray-800">₹{parseFloat(u.bonus_balance || 0).toLocaleString('en-IN')}</p>
        </div>
      </div>

      {/* Moderator Info */}
      <div className="flex items-center justify-between text-sm mb-3">
        <div>
          <span className="text-gray-500">Mod: </span>
          <span className="font-medium text-gray-700">{u.moderator_name || <span className="text-amber-600">Unassigned</span>}</span>
        </div>
        <div className="font-mono text-xs text-gray-500">{u.referral_code}</div>
      </div>

      {/* Actions */}
      {isAdmin && (
        <div className="space-y-2">
          <select
            value={selectedModerators[u.id] || ''}
            onChange={(e) => setSelectedModerators((current) => ({ ...current, [u.id]: e.target.value }))}
            className="w-full px-3 py-2 border rounded-lg text-sm bg-white focus:ring-2 focus:ring-primary-500"
          >
            <option value="">Select Moderator...</option>
            {moderators.map((moderator) => (
              <option key={moderator.id} value={String(moderator.id)}>{moderator.name}</option>
            ))}
          </select>
          <div className="flex gap-2">
            <button
              onClick={() => assignModerator(u.id)}
              disabled={!selectedModerators[u.id] || assigningUserId === u.id}
              className="flex-1 px-3 py-2 text-sm font-medium bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {assigningUserId === u.id ? (
                <span className="flex items-center justify-center gap-1">
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Assigning...
                </span>
              ) : (
                'Assign'
              )}
            </button>
            <button
              onClick={() => toggleBlock(u.id, u.is_blocked)}
              className={`px-3 py-2 text-sm font-medium rounded-lg transition-colors ${
                u.is_blocked 
                  ? 'bg-green-600 text-white hover:bg-green-700' 
                  : 'bg-red-600 text-white hover:bg-red-700'
              }`}
            >
              {u.is_blocked ? 'Unblock' : 'Block'}
            </button>
          </div>
        </div>
      )}

      {!isAdmin && (
        <Link 
          to={`/users/${u.id}`}
          className="block w-full text-center px-3 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          View Details
        </Link>
      )}
    </div>
  );
}

export default function Users() {
  const { user: authUser } = useAuth();
  const isAdmin = authUser?.role === 'admin';
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
    if (isAdmin) loadModerators();
  }, [isAdmin]);

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
      if (isAdmin && moderatorFilter !== 'all') {
        params.moderator_id = moderatorFilter;
      }

      const res = await api.get('/admin/users', { params });
      setUsers(Array.isArray(res.data.users) ? res.data.users : []);
      setPagination(res.data.pagination || {});
      if (isAdmin) {
        setSelectedModerators((current) => {
          const next = { ...current };
          for (const user of res.data.users || []) {
            next[user.id] = user.moderator_id ? String(user.moderator_id) : '';
          }
          return next;
        });
      }
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

  // Stats for header
  const activeUsers = users.filter(u => !u.is_blocked).length;
  const blockedUsers = users.filter(u => u.is_blocked).length;
  const unassignedUsers = users.filter(u => !u.moderator_id).length;

  return (
    <div className="space-y-4">
      {/* Header Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
        <div className="bg-white border rounded-lg p-3">
          <p className="text-xs text-gray-500">Total Users</p>
          <p className="text-lg sm:text-xl font-bold text-gray-800">{pagination.total || users.length}</p>
        </div>
        <div className="bg-green-50 border border-green-200 rounded-lg p-3">
          <p className="text-xs text-green-600">Active</p>
          <p className="text-lg sm:text-xl font-bold text-green-700">{activeUsers}</p>
        </div>
        <div className="bg-red-50 border border-red-200 rounded-lg p-3">
          <p className="text-xs text-red-600">Blocked</p>
          <p className="text-lg sm:text-xl font-bold text-red-700">{blockedUsers}</p>
        </div>
        {isAdmin && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
            <p className="text-xs text-amber-600">Unassigned</p>
            <p className="text-lg sm:text-xl font-bold text-amber-700">{unassignedUsers}</p>
          </div>
        )}
      </div>

      {/* Search & Filters */}
      <div className="bg-white border rounded-lg p-3 sm:p-4 space-y-3">
        <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
          <div className="relative flex-1">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              placeholder="Search by name or phone..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              className="w-full pl-10 pr-4 py-2.5 border rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none transition-all"
            />
          </div>
          {isAdmin && (
            <select
              value={moderatorFilter}
              onChange={(e) => { setModeratorFilter(e.target.value); setPage(1); }}
              className="w-full sm:w-48 px-3 py-2.5 border rounded-lg bg-white text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none transition-all"
            >
              <option value="all">All Users</option>
              <option value="unassigned">⚠️ No Moderator</option>
              {moderators.map((moderator) => (
                <option key={moderator.id} value={String(moderator.id)}>{moderator.name}</option>
              ))}
            </select>
          )}
        </div>

        <SavedFilterPresets
          storageKey="users"
          currentFilters={{ search, moderatorFilter }}
          onApply={(nextFilters) => {
            setPage(1);
            setSearch(nextFilters.search || '');
            setModeratorFilter(nextFilters.moderatorFilter || 'all');
          }}
        />
      </div>

      {isAdmin && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 sm:p-4">
          <div className="flex items-start gap-2">
            <svg className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p className="text-sm text-blue-800">
              Users created with a moderator referral code are auto-assigned. Use this screen to find and assign unassigned users manually.
            </p>
          </div>
        </div>
      )}

      {/* Mobile Card View (hidden on lg screens) */}
      <div className="lg:hidden space-y-3">
        {loading ? (
          <>
            <UserCardSkeleton />
            <UserCardSkeleton />
            <UserCardSkeleton />
          </>
        ) : users.length === 0 ? (
          <div className="bg-white border rounded-lg p-8 text-center">
            <div className="text-4xl mb-3">👤</div>
            <p className="text-gray-500 mb-2">No users found</p>
            <p className="text-sm text-gray-400">Try adjusting your search or filters</p>
          </div>
        ) : (
          users.map((u) => (
            <UserCard
              key={u.id}
              u={u}
              isAdmin={isAdmin}
              selectedModerators={selectedModerators}
              setSelectedModerators={setSelectedModerators}
              assignModerator={assignModerator}
              toggleBlock={toggleBlock}
              assigningUserId={assigningUserId}
              moderators={moderators}
            />
          ))
        )}
      </div>

      {/* Desktop Table View (hidden on mobile) */}
      <div className="hidden lg:block bg-white border rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left px-3 py-3 font-medium text-gray-600">User</th>
                <th className="text-left px-3 py-3 font-medium text-gray-600">Contact</th>
                <th className="text-right px-3 py-3 font-medium text-gray-600">Balance</th>
                <th className="text-right px-3 py-3 font-medium text-gray-600">Bonus</th>
                <th className="text-left px-3 py-3 font-medium text-gray-600">Moderator</th>
                <th className="text-center px-3 py-3 font-medium text-gray-600">Status</th>
                <th className="text-center px-3 py-3 font-medium text-gray-600">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <>
                  <TableRowSkeleton />
                  <TableRowSkeleton />
                  <TableRowSkeleton />
                  <TableRowSkeleton />
                  <TableRowSkeleton />
                </>
              ) : users.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center">
                    <div className="text-4xl mb-3">👤</div>
                    <p className="text-gray-500">No users found</p>
                  </td>
                </tr>
              ) : (
                users.map((u) => (
                  <tr key={u.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-3 py-3">
                      <div className="font-medium text-gray-800">{u.name}</div>
                      <div className="text-xs text-gray-500 font-mono">ID: {u.id} • {u.referral_code}</div>
                    </td>
                    <td className="px-3 py-3 text-sm text-gray-600">{u.phone}</td>
                    <td className="px-3 py-3 text-right font-medium text-gray-800">₹{parseFloat(u.balance || 0).toLocaleString('en-IN')}</td>
                    <td className="px-3 py-3 text-right text-sm text-gray-600">₹{parseFloat(u.bonus_balance || 0).toLocaleString('en-IN')}</td>
                    <td className="px-3 py-3">
                      {u.moderator_name ? (
                        <span className="text-sm text-gray-700">{u.moderator_name}</span>
                      ) : (
                        <span className="text-xs text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">Unassigned</span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-center">
                      <span className={`inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full ${
                        u.is_blocked ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'
                      }`}>
                        {u.is_blocked ? '🔒 Blocked' : '✓ Active'}
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex items-center justify-center gap-2">
                        <Link
                          to={`/users/${u.id}`}
                          className="px-3 py-1.5 text-xs font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                        >
                          View
                        </Link>
                        {isAdmin && (
                          <>
                            <select
                              value={selectedModerators[u.id] || ''}
                              onChange={(e) => setSelectedModerators((current) => ({ ...current, [u.id]: e.target.value }))}
                              className="px-2 py-1.5 border rounded-lg text-xs bg-white focus:ring-2 focus:ring-primary-500"
                            >
                              <option value="">Assign...</option>
                              {moderators.map((moderator) => (
                                <option key={moderator.id} value={String(moderator.id)}>{moderator.name}</option>
                              ))}
                            </select>
                            <button
                              onClick={() => assignModerator(u.id)}
                              disabled={!selectedModerators[u.id] || assigningUserId === u.id}
                              className="px-3 py-1.5 text-xs font-medium bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 transition-colors"
                            >
                              {assigningUserId === u.id ? '...' : 'Assign'}
                            </button>
                            <button
                              onClick={() => toggleBlock(u.id, u.is_blocked)}
                              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                                u.is_blocked ? 'bg-green-600 text-white hover:bg-green-700' : 'bg-red-600 text-white hover:bg-red-700'
                              }`}
                            >
                              {u.is_blocked ? 'Unblock' : 'Block'}
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination */}
      {pagination.totalPages > 1 && (
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-white border rounded-lg p-3 sm:p-4">
          <div className="text-sm text-gray-500">
            Showing <span className="font-medium text-gray-800">{((page - 1) * 15) + 1}</span> to <span className="font-medium text-gray-800">{Math.min(page * 15, pagination.total)}</span> of <span className="font-medium text-gray-800">{pagination.total}</span> users
          </div>
          <div className="flex items-center gap-2">
            <button 
              disabled={page <= 1} 
              onClick={() => setPage(page - 1)}
              className="px-3 py-2 text-sm font-medium bg-white border rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-1"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              Previous
            </button>
            
            <div className="flex items-center gap-1">
              {Array.from({ length: Math.min(5, pagination.totalPages) }, (_, i) => {
                const pageNum = i + 1;
                return (
                  <button
                    key={pageNum}
                    onClick={() => setPage(pageNum)}
                    className={`w-8 h-8 text-sm font-medium rounded-lg transition-colors ${
                      page === pageNum 
                        ? 'bg-primary-600 text-white' 
                        : 'bg-white border hover:bg-gray-50 text-gray-700'
                    }`}
                  >
                    {pageNum}
                  </button>
                );
              })}
              {pagination.totalPages > 5 && (
                <span className="px-2 text-gray-400">...</span>
              )}
            </div>
            
            <button 
              disabled={page >= pagination.totalPages} 
              onClick={() => setPage(page + 1)}
              className="px-3 py-2 text-sm font-medium bg-white border rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-1"
            >
              Next
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>
        </div>
      )}
      
      <ToastContainer toasts={toasts} dismiss={dismiss} />
    </div>
  );
}

