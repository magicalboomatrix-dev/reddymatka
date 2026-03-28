import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api, { buildUploadUrl } from '../utils/api';
import { useToast, ToastContainer, useConfirm, ConfirmModal } from '../components/ui';

function formatCurrency(value) {
  return `₹${Number(value || 0).toLocaleString('en-IN')}`;
}

export default function Moderators() {
  const [moderators, setModerators] = useState([]);
  const [stats, setStats] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', phone: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('moderators');
  const { toasts, success, error: toastError, dismiss } = useToast();
  const { confirmState, confirm, handleConfirm, handleCancel } = useConfirm();

  useEffect(() => {
    loadModerators();
    loadStats();
  }, []);

  const loadModerators = async () => {
    try {
      const res = await api.get('/moderators');
      setModerators(Array.isArray(res.data.moderators) ? res.data.moderators : []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const loadStats = async () => {
    try {
      const res = await api.get('/admin/moderator-stats');
      setStats(Array.isArray(res.data.stats) ? res.data.stats : []);
    } catch (err) {
      console.error(err);
    }
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    setError('');
    try {
      await api.post('/moderators', form);
      setShowForm(false);
      setForm({ name: '', phone: '', password: '' });
      loadModerators();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to create');
    }
  };

  const handleDelete = async (id) => {
    const ok = await confirm('Delete this moderator? Their users will be unassigned.', 'Delete Moderator', 'danger');
    if (!ok) return;
    try {
      await api.delete(`/moderators/${id}`);
      loadModerators();
    } catch (err) {
      toastError(err.response?.data?.error || 'Failed');
    }
  };

  const toggleBlock = async (id, current) => {
    try {
      await api.put(`/moderators/${id}`, { is_blocked: !current });
      loadModerators();
    } catch (err) {
      toastError(err.response?.data?.error || 'Failed');
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold text-gray-800">Moderators ({moderators.length})</h3>
        <div className="flex gap-2">
          <Link
            to="/moderator-scanners"
            className="px-4 py-2 bg-white border hover:bg-gray-50 text-sm font-medium text-gray-700"
          >
            Scanner View
          </Link>
          <Link
            to="/moderator-floats"
            className="px-4 py-2 bg-white border hover:bg-gray-50 text-sm font-medium text-gray-700"
          >
            Float Table
          </Link>
          <button
            onClick={() => setShowForm(!showForm)}
            className="px-4 py-2 bg-primary-600 text-white hover:bg-primary-700 text-sm font-medium"
          >
            {showForm ? 'Cancel' : '+ Add Moderator'}
          </button>
        </div>
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setActiveTab('moderators')}
          className={`px-4 py-2 text-sm font-medium ${activeTab === 'moderators' ? 'bg-primary-600 text-white' : 'bg-white border text-gray-600 hover:bg-gray-50'}`}
        >
          Moderators
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('analytics')}
          className={`px-4 py-2 text-sm font-medium ${activeTab === 'analytics' ? 'bg-primary-600 text-white' : 'bg-white border text-gray-600 hover:bg-gray-50'}`}
        >
          Deposit Analytics
        </button>
      </div>

      {showForm && activeTab === 'moderators' && (
        <form onSubmit={handleCreate} className="bg-white border p-6 space-y-4">
          {error && <div className="p-3 bg-red-50 text-red-700 text-sm">{error}</div>}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <input type="text" placeholder="Name" value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="px-4 py-2 border focus:ring-2 focus:ring-primary-500 outline-none" required />
            <input type="text" placeholder="Phone" value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
              className="px-4 py-2 border focus:ring-2 focus:ring-primary-500 outline-none" required />
            <input type="password" placeholder="Password" value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              className="px-4 py-2 border focus:ring-2 focus:ring-primary-500 outline-none" required />
          </div>
          <button type="submit" className="px-6 py-2 bg-green-600 text-white hover:bg-green-700 text-sm font-medium">
            Create Moderator
          </button>
        </form>
      )}

      {activeTab === 'moderators' && (
      <div className="bg-white border overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="text-left px-4 py-3 font-medium text-gray-600">ID</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Name</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Phone</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Referral Code</th>
              <th className="text-center px-4 py-3 font-medium text-gray-600">Users</th>
              <th className="text-center px-4 py-3 font-medium text-gray-600">Status</th>
              <th className="text-center px-4 py-3 font-medium text-gray-600">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {moderators.map((m) => (
              <tr key={m.id} className="hover:bg-gray-50">
                <td className="px-4 py-3">{m.id}</td>
                <td className="px-4 py-3 font-medium">{m.name}</td>
                <td className="px-4 py-3">{m.phone}</td>
                <td className="px-4 py-3 font-mono text-xs">{m.referral_code}</td>
                <td className="px-4 py-3 text-center">{m.user_count}</td>
                <td className="px-4 py-3 text-center">
                  <span className={`px-2 py-1 text-xs font-medium ${m.is_blocked ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
                    {m.is_blocked ? 'Blocked' : 'Active'}
                  </span>
                </td>
                <td className="px-4 py-3 text-center space-x-2">
                  <Link to={`/moderators/${m.id}`}
                    className="px-2 py-1 text-xs bg-blue-600 text-white hover:bg-blue-700 inline-block">
                    Details
                  </Link>
                  <button onClick={() => toggleBlock(m.id, m.is_blocked)}
                    className={`px-2 py-1 text-xs ${m.is_blocked ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
                    {m.is_blocked ? 'Unblock' : 'Block'}
                  </button>
                  <button onClick={() => handleDelete(m.id)}
                    className="px-2 py-1 text-xs bg-red-100 text-red-700 hover:bg-red-200">
                    Delete
                  </button>
                </td>
              </tr>
            ))}
            {moderators.length === 0 && (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-400">{loading ? 'Loading...' : 'No moderators'}</td></tr>
            )}
          </tbody>
        </table>
      </div>
      )}

      {activeTab === 'analytics' && (
        <div className="bg-white border overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Moderator</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">UPI ID</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">QR</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">Total Deposits</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">Total Amount</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Last Deposit</th>
                <th className="text-center px-4 py-3 font-medium text-gray-600">Transactions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {stats.map((stat) => (
                <tr key={stat.moderator_id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-800">{stat.moderator_name}</td>
                  <td className="px-4 py-3 text-xs text-gray-600">{stat.upi_id || '-'}</td>
                  <td className="px-4 py-3">
                    {stat.qr_code_image ? (
                      <img src={buildUploadUrl(stat.qr_code_image)} alt={`${stat.moderator_name} QR`} className="h-16 w-16 border object-contain bg-white p-1" />
                    ) : (
                      <span className="text-xs text-gray-400">No QR</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">{Number(stat.total_deposits || 0).toLocaleString('en-IN')}</td>
                  <td className="px-4 py-3 text-right font-semibold text-green-700">{formatCurrency(stat.total_amount)}</td>
                  <td className="px-4 py-3 text-xs text-gray-600">{stat.last_deposit_date ? new Date(stat.last_deposit_date).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }) : '-'}</td>
                  <td className="px-4 py-3 text-center">
                    <Link
                      to={`/moderators/${stat.moderator_id}`}
                      className="px-3 py-1 bg-blue-600 text-white text-xs hover:bg-blue-700 inline-block"
                    >
                      View Details
                    </Link>
                  </td>
                </tr>
              ))}
              {stats.length === 0 && (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-400">No moderator analytics yet</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      <ToastContainer toasts={toasts} dismiss={dismiss} />
      <ConfirmModal state={confirmState} onConfirm={handleConfirm} onCancel={handleCancel} />
    </div>
  );
}
