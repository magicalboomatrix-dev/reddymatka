import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../utils/api';

function formatCurrency(value) {
  return `₹${Number(value || 0).toLocaleString('en-IN')}`;
}

function formatDate(value) {
  if (!value) return '-';
  return new Date(value).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
}

function relativeTime(value) {
  if (!value) return '-';
  const diff = Date.now() - new Date(value).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

function detectUpiProvider(upiId) {
  if (!upiId) return '';
  const handle = String(upiId).split('@')[1]?.toLowerCase() || '';
  if (!handle) return '';
  const map = {
    ybl: 'PhonePe', ibl: 'PhonePe', ppay: 'PhonePe',
    paytm: 'Paytm',
    axl: 'Amazon Pay', apl: 'Amazon Pay',
    oksbi: 'GPay SBI', okaxis: 'GPay Axis', okhdfcbank: 'GPay HDFC', okicici: 'GPay ICICI',
    yescred: 'Yes Cred', yesbank: 'Yes Bank',
    sbi: 'SBI', hdfcbank: 'HDFC', icici: 'ICICI', axisbank: 'Axis',
    kotak: 'Kotak', indus: 'IndusInd', federal: 'Federal',
  };
  if (map[handle]) return map[handle];
  if (handle.startsWith('ok')) return 'Google Pay';
  if (handle.includes('paytm')) return 'Paytm';
  return handle.toUpperCase();
}

function validateUpiId(upiId) {
  const value = String(upiId || '').trim();
  if (!value) return { isValid: true, message: '' };
  if (!value.includes('@')) return { isValid: false, message: 'Must include @handle' };
  const [username, handle, ...extra] = value.split('@');
  if (!username || !handle || extra.length > 0) return { isValid: false, message: 'Format: name@provider' };
  if (!/^[a-zA-Z0-9._-]{2,}$/.test(username)) return { isValid: false, message: 'Invalid username chars' };
  if (!/^[a-zA-Z0-9.-]{2,}$/.test(handle)) return { isValid: false, message: 'Invalid handle chars' };
  return { isValid: true, message: '' };
}

export default function UpiManagement() {
  const [data, setData] = useState({ moderators: [], admins: [], audit_logs: [] });
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all'); // all, active, inactive, no-upi, blocked
  const [search, setSearch] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [savingId, setSavingId] = useState(null);
  const [feedback, setFeedback] = useState({});
  const [tab, setTab] = useState('upis'); // upis, audit
  const [adminEdit, setAdminEdit] = useState(null);
  const [adminSaving, setAdminSaving] = useState(false);

  const loadData = async () => {
    setLoading(true);
    try {
      const res = await api.get('/admin/upi-management');
      setData(res.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, []);

  const filtered = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    return data.moderators.filter(mod => {
      if (keyword && ![mod.name, mod.phone, mod.upi_id, mod.referral_code, mod.scanner_label]
        .some(v => String(v || '').toLowerCase().includes(keyword))) return false;
      if (filter === 'active') return mod.scanner_enabled && mod.upi_id;
      if (filter === 'inactive') return !mod.scanner_enabled;
      if (filter === 'no-upi') return !mod.upi_id;
      if (filter === 'blocked') return mod.is_blocked;
      return true;
    });
  }, [data.moderators, filter, search]);

  const summary = useMemo(() => {
    const mods = data.moderators;
    return {
      total: mods.length,
      active: mods.filter(m => m.scanner_enabled && m.upi_id).length,
      inactive: mods.filter(m => !m.scanner_enabled).length,
      noUpi: mods.filter(m => !m.upi_id).length,
      blocked: mods.filter(m => m.is_blocked).length,
      totalCollected: mods.reduce((s, m) => s + m.total_collected, 0),
      collectedToday: mods.reduce((s, m) => s + m.collected_today, 0),
      collected7d: mods.reduce((s, m) => s + m.collected_7d, 0),
    };
  }, [data.moderators]);

  const startEdit = (mod) => {
    setEditingId(mod.id);
    setEditForm({
      upi_id: mod.upi_id || '',
      scanner_label: mod.scanner_label || '',
      scanner_enabled: Boolean(mod.scanner_enabled),
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditForm({});
  };

  const saveEdit = async (modId) => {
    const validation = validateUpiId(editForm.upi_id);
    if (!validation.isValid) {
      setFeedback({ ...feedback, [modId]: validation.message });
      return;
    }
    if (editForm.scanner_enabled && !editForm.upi_id?.trim()) {
      setFeedback({ ...feedback, [modId]: 'UPI ID required when scanner is enabled' });
      return;
    }
    try {
      setSavingId(modId);
      await api.put(`/moderators/${modId}/scanner`, {
        upi_id: editForm.upi_id || '',
        scanner_label: editForm.scanner_label || '',
        scanner_enabled: editForm.scanner_enabled ? '1' : '0',
      });
      setFeedback({ ...feedback, [modId]: 'Updated successfully' });
      setEditingId(null);
      await loadData();
    } catch (err) {
      setFeedback({ ...feedback, [modId]: err.response?.data?.error || 'Failed to update' });
    } finally {
      setSavingId(null);
    }
  };

  const quickToggle = async (mod) => {
    if (!mod.scanner_enabled && !mod.upi_id) {
      setFeedback({ ...feedback, [mod.id]: 'Set UPI ID first before enabling' });
      return;
    }
    try {
      setSavingId(mod.id);
      await api.put(`/moderators/${mod.id}/scanner`, {
        upi_id: mod.upi_id || '',
        scanner_label: mod.scanner_label || '',
        scanner_enabled: mod.scanner_enabled ? '0' : '1',
      });
      await loadData();
    } catch (err) {
      setFeedback({ ...feedback, [mod.id]: err.response?.data?.error || 'Toggle failed' });
    } finally {
      setSavingId(null);
    }
  };

  const saveAdminUpi = async () => {
    if (!adminEdit) return;
    const validation = validateUpiId(adminEdit.upi_id);
    if (!validation.isValid) {
      setFeedback({ ...feedback, admin: validation.message });
      return;
    }
    try {
      setAdminSaving(true);
      await api.put('/admin/upi-management/admin-upi', { upi_id: adminEdit.upi_id || '' });
      setFeedback({ ...feedback, admin: 'Admin UPI updated' });
      setAdminEdit(null);
      await loadData();
    } catch (err) {
      setFeedback({ ...feedback, admin: err.response?.data?.error || 'Failed to update admin UPI' });
    } finally {
      setAdminSaving(false);
    }
  };

  const filterChips = [
    { key: 'all', label: 'All', count: summary.total },
    { key: 'active', label: 'Active', count: summary.active },
    { key: 'inactive', label: 'Inactive', count: summary.inactive },
    { key: 'no-upi', label: 'No UPI', count: summary.noUpi },
    { key: 'blocked', label: 'Blocked', count: summary.blocked },
  ];

  const fieldLabels = {
    upi_id: 'UPI ID',
    scanner_label: 'Scanner Label',
    scanner_enabled: 'Scanner Status',
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h3 className="text-xl font-semibold text-gray-800">UPI Management</h3>
          <p className="text-sm text-gray-500 mt-1">All UPI handles, collection stats, change history, and inline editing.</p>
        </div>
        <div className="flex gap-2">
          <Link to="/moderators" className="px-4 py-2 bg-white border hover:bg-gray-50 text-sm font-medium text-gray-700">Moderators</Link>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="bg-white border p-4">
          <p className="text-xs text-gray-500">Total Handles</p>
          <p className="text-xl font-bold text-gray-800 mt-1">{summary.total}</p>
        </div>
        <div className="bg-white border p-4">
          <p className="text-xs text-gray-500">Active</p>
          <p className="text-xl font-bold text-green-700 mt-1">{summary.active}</p>
        </div>
        <div className="bg-white border p-4">
          <p className="text-xs text-gray-500">No UPI Set</p>
          <p className="text-xl font-bold text-red-700 mt-1">{summary.noUpi}</p>
        </div>
        <div className="bg-white border p-4">
          <p className="text-xs text-gray-500">Today</p>
          <p className="text-xl font-bold text-blue-700 mt-1">{formatCurrency(summary.collectedToday)}</p>
        </div>
        <div className="bg-white border p-4">
          <p className="text-xs text-gray-500">7-Day</p>
          <p className="text-xl font-bold text-blue-700 mt-1">{formatCurrency(summary.collected7d)}</p>
        </div>
        <div className="bg-white border p-4">
          <p className="text-xs text-gray-500">All Time</p>
          <p className="text-xl font-bold text-gray-800 mt-1">{formatCurrency(summary.totalCollected)}</p>
        </div>
      </div>

      {/* Admin UPI Section */}
      <div className="bg-white border p-4">
        <h4 className="text-sm font-semibold text-gray-800 mb-3">Admin UPI (Fallback)</h4>
        <div className="space-y-2">
          {data.admins.map(admin => (
            <div key={admin.id} className="flex flex-col sm:flex-row sm:items-center gap-2 p-3 bg-gray-50 border">
              <div className="flex-1 min-w-0">
                <div className="font-medium text-gray-800 text-sm">{admin.name}</div>
                <div className="text-xs text-gray-500">{admin.phone}</div>
              </div>
              {adminEdit?.id === admin.id ? (
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={adminEdit.upi_id}
                    onChange={e => setAdminEdit({ ...adminEdit, upi_id: e.target.value })}
                    className="px-3 py-1.5 border text-xs w-56"
                    placeholder="admin@upihandle"
                  />
                  <button onClick={saveAdminUpi} disabled={adminSaving} className="px-3 py-1.5 bg-emerald-600 text-white text-xs hover:bg-emerald-700 disabled:opacity-50">
                    {adminSaving ? '...' : 'Save'}
                  </button>
                  <button onClick={() => setAdminEdit(null)} className="px-3 py-1.5 border text-xs text-gray-700 hover:bg-gray-50">Cancel</button>
                </div>
              ) : (
                <div className="flex items-center gap-3">
                  <span className="font-mono text-sm text-gray-700">{admin.upi_id || <span className="text-red-500 text-xs">Not set</span>}</span>
                  {admin.upi_id && <span className="text-xs text-gray-500">{detectUpiProvider(admin.upi_id)}</span>}
                  <button onClick={() => setAdminEdit({ id: admin.id, upi_id: admin.upi_id || '' })} className="px-3 py-1.5 border text-xs text-gray-700 hover:bg-gray-100">Edit</button>
                </div>
              )}
              {feedback.admin && adminEdit?.id === admin.id ? <div className="text-xs text-gray-600">{feedback.admin}</div> : null}
            </div>
          ))}
        </div>
        <p className="text-[11px] text-gray-400 mt-2">Admin UPI is used as fallback when no active moderator scanner is available for a user.</p>
      </div>

      {/* Tabs */}
      <div className="flex border-b">
        <button onClick={() => setTab('upis')} className={`px-4 py-2 text-sm font-medium border-b-2 ${tab === 'upis' ? 'border-gray-900 text-gray-900' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
          UPI Handles ({summary.total})
        </button>
        <button onClick={() => setTab('audit')} className={`px-4 py-2 text-sm font-medium border-b-2 ${tab === 'audit' ? 'border-gray-900 text-gray-900' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
          Change History ({data.audit_logs.length})
        </button>
      </div>

      {tab === 'upis' && (
        <>
          {/* Search & Filters */}
          <div className="bg-white border p-4 space-y-3">
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search by name, phone, UPI, referral code, or label"
              className="w-full px-4 py-2 border text-sm"
            />
            <div className="flex flex-wrap gap-2">
              {filterChips.map(chip => (
                <button
                  key={chip.key}
                  onClick={() => setFilter(chip.key)}
                  className={`px-3 py-1.5 text-xs font-medium border ${filter === chip.key ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'}`}
                >
                  {chip.label} ({chip.count})
                </button>
              ))}
            </div>
          </div>

          {/* UPI Table */}
          <div className="bg-white border overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Moderator</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">UPI Handle</th>
                  <th className="text-center px-4 py-3 font-medium text-gray-600">Status</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">Today</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">7-Day</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">All Time</th>
                  <th className="text-center px-4 py-3 font-medium text-gray-600">Last Deposit</th>
                  <th className="text-center px-4 py-3 font-medium text-gray-600">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {filtered.map(mod => {
                  const isEditing = editingId === mod.id;
                  const provider = detectUpiProvider(mod.upi_id);
                  return (
                    <tr key={mod.id} className="hover:bg-gray-50 align-top">
                      <td className="px-4 py-3">
                        <Link to={`/moderators/${mod.id}`} className="font-medium text-blue-600 hover:underline">{mod.name}</Link>
                        <div className="text-xs text-gray-500">{mod.phone}</div>
                        <div className="text-xs text-gray-400">{mod.referral_code} · {mod.user_count} users</div>
                        {mod.is_blocked ? <span className="mt-1 inline-block px-2 py-0.5 text-[11px] font-medium bg-red-100 text-red-800">Blocked</span> : null}
                      </td>
                      <td className="px-4 py-3 min-w-[200px]">
                        {isEditing ? (
                          <div className="space-y-2">
                            <input
                              type="text"
                              value={editForm.upi_id}
                              onChange={e => setEditForm({ ...editForm, upi_id: e.target.value })}
                              placeholder="user@handle"
                              className="w-full px-2 py-1.5 border text-xs font-mono"
                            />
                            <input
                              type="text"
                              value={editForm.scanner_label}
                              onChange={e => setEditForm({ ...editForm, scanner_label: e.target.value })}
                              placeholder="Scanner label"
                              className="w-full px-2 py-1.5 border text-xs"
                            />
                            <label className="flex items-center gap-2 text-xs">
                              <input
                                type="checkbox"
                                checked={editForm.scanner_enabled}
                                onChange={e => setEditForm({ ...editForm, scanner_enabled: e.target.checked })}
                              />
                              Enabled
                            </label>
                            {feedback[mod.id] ? <div className="text-[11px] text-red-600">{feedback[mod.id]}</div> : null}
                          </div>
                        ) : (
                          <div>
                            {mod.upi_id ? (
                              <>
                                <div className="font-mono text-gray-800 break-all">{mod.upi_id}</div>
                                {provider && <div className="text-xs text-gray-500 mt-0.5">{provider}</div>}
                              </>
                            ) : (
                              <span className="text-xs text-red-500">Not configured</span>
                            )}
                            {mod.scanner_label && <div className="text-xs text-gray-400 mt-1">{mod.scanner_label}</div>}
                            {feedback[mod.id] ? <div className="text-[11px] text-green-600 mt-1">{feedback[mod.id]}</div> : null}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <button
                          onClick={() => quickToggle(mod)}
                          disabled={savingId === mod.id}
                          className={`px-2 py-1 text-xs font-medium ${mod.scanner_enabled ? 'bg-green-100 text-green-700 hover:bg-green-200' : 'bg-red-100 text-red-700 hover:bg-red-200'} disabled:opacity-50`}
                        >
                          {savingId === mod.id ? '...' : mod.scanner_enabled ? 'Active' : 'Inactive'}
                        </button>
                      </td>
                      <td className="px-4 py-3 text-right text-xs">
                        {mod.collected_today > 0 ? <span className="font-semibold text-green-700">{formatCurrency(mod.collected_today)}</span> : <span className="text-gray-400">-</span>}
                      </td>
                      <td className="px-4 py-3 text-right text-xs">
                        {mod.collected_7d > 0 ? <span className="font-semibold text-gray-700">{formatCurrency(mod.collected_7d)}</span> : <span className="text-gray-400">-</span>}
                      </td>
                      <td className="px-4 py-3 text-right text-xs">
                        <div className="font-semibold text-gray-800">{formatCurrency(mod.total_collected)}</div>
                        <div className="text-gray-400">{mod.total_deposits} txns</div>
                      </td>
                      <td className="px-4 py-3 text-center text-xs text-gray-500">
                        {relativeTime(mod.last_deposit_at)}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {isEditing ? (
                          <div className="flex flex-col gap-1">
                            <button
                              onClick={() => saveEdit(mod.id)}
                              disabled={savingId === mod.id}
                              className="px-3 py-1 bg-emerald-600 text-white text-xs hover:bg-emerald-700 disabled:opacity-50"
                            >
                              {savingId === mod.id ? 'Saving...' : 'Save'}
                            </button>
                            <button onClick={cancelEdit} className="px-3 py-1 border text-xs text-gray-700 hover:bg-gray-50">Cancel</button>
                          </div>
                        ) : (
                          <button onClick={() => startEdit(mod)} className="px-3 py-1 border text-xs text-gray-700 hover:bg-gray-50">Edit</button>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-4 py-8 text-center text-gray-400">{loading ? 'Loading...' : 'No UPI handles found'}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      {tab === 'audit' && (
        <div className="bg-white border overflow-x-auto">
          <div className="px-4 py-3 border-b flex items-center justify-between">
            <h4 className="text-sm font-semibold text-gray-800">Scanner Change History</h4>
            <span className="text-xs text-gray-500">{data.audit_logs.length} entries (last 200)</span>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-600">When</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Moderator</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Changed By</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Field</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Old Value</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">New Value</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {data.audit_logs.map(log => (
                <tr key={log.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-xs text-gray-600 whitespace-nowrap">
                    <div>{formatDate(log.created_at)}</div>
                    <div className="text-gray-400">{relativeTime(log.created_at)}</div>
                  </td>
                  <td className="px-4 py-3 text-xs">
                    <Link to={`/moderators/${log.moderator_id}`} className="text-blue-600 hover:underline">{log.moderator_name || `#${log.moderator_id}`}</Link>
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-700">
                    <div>{log.actor_name || 'System'}</div>
                    <div className="text-gray-400">{log.actor_role || '-'}</div>
                  </td>
                  <td className="px-4 py-3 text-xs">
                    <span className={`px-2 py-0.5 font-medium ${log.field_name === 'upi_id' ? 'bg-blue-100 text-blue-800' : log.field_name === 'scanner_enabled' ? 'bg-amber-100 text-amber-800' : 'bg-gray-100 text-gray-800'}`}>
                      {fieldLabels[log.field_name] || log.field_name}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-500 font-mono break-all max-w-[200px]">{log.old_value || <span className="text-gray-300">empty</span>}</td>
                  <td className="px-4 py-3 text-xs text-gray-800 font-mono break-all max-w-[200px]">{log.new_value || <span className="text-gray-300">empty</span>}</td>
                </tr>
              ))}
              {data.audit_logs.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-gray-400">No change history recorded</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
