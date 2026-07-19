import { useEffect, useState } from 'react';
import api from '../utils/api';
import { useToast, ToastContainer } from '../components/ui';

export default function MyScanner() {
  const { toasts, success, error, dismiss } = useToast();

  const [scanner, setScanner] = useState(null);
  const [moderator, setModerator] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);

  const [form, setForm] = useState({
    scanner_label: '',
    upi_id: '',
    scanner_enabled: false,
  });

  const load = async () => {
    setLoading(true);
    try {
      // Load scanner details
      const res = await api.get('/moderator/scanner');
      const s = res.data.scanner;
      setScanner(s);
      setForm({
        scanner_label: s.scanner_label || '',
        upi_id: s.upi_id || '',
        scanner_enabled: !!s.scanner_enabled,
      });

      // Load moderator profile for referral code
      const profileRes = await api.get('/auth/me');
      setModerator(profileRes.data.user);
    } catch (err) {
      error(err.response?.data?.error || 'Failed to load details.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleCopyReferralLink = () => {
    if (!moderator?.referral_code) return;
    // Use main website domain, not admin panel
    const mainDomain = window.location.origin.replace('admin.', '');
    const link = `${mainDomain}/download?ref=${moderator.referral_code}`;
    navigator.clipboard.writeText(link).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      success('Referral link copied to clipboard!');
    }).catch(() => {
      error('Failed to copy link.');
    });
  };

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setForm((prev) => ({ ...prev, [name]: type === 'checkbox' ? checked : value }));
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await api.put('/moderator/scanner', {
        scanner_label: form.scanner_label.trim(),
        upi_id: form.upi_id.trim(),
        scanner_enabled: form.scanner_enabled,
      });
      setScanner(res.data.scanner ?? form);
      success('Scanner / UPI updated successfully.');
    } catch (err) {
      error(err.response?.data?.error || 'Failed to save.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-500">Loading…</div>
    );
  }

  return (
    <div className="max-w-lg mx-auto p-6">
      <ToastContainer toasts={toasts} dismiss={dismiss} />

      <h1 className="text-2xl font-bold text-gray-900 mb-6">My UPI / Scanner</h1>

      {/* Referral Link Section */}
      {moderator?.referral_code && (
        <div className="bg-white rounded-xl shadow p-6 mb-6 space-y-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Your Referral Link</h2>
            <p className="text-sm text-gray-500 mt-1">
              Share this link with users. When they download and register, they'll be assigned to you.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex-1 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2.5 text-sm font-mono text-gray-700 truncate">
              {`${window.location.origin.replace('admin.', '')}/download?ref=${moderator.referral_code}`}
            </div>
            <button
              type="button"
              onClick={handleCopyReferralLink}
              className="px-4 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
            >
              {copied ? 'Copied!' : 'Copy'}
            </button>
          </div>

          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-600">Referral Code:</span>
            <span className="font-bold text-blue-600">{moderator.referral_code}</span>
          </div>
        </div>
      )}

      <form onSubmit={handleSave} className="bg-white rounded-xl shadow p-6 space-y-5">

        {/* Scanner Label */}
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1">
            Scanner Label <span className="text-gray-400 font-normal">(display name shown to users)</span>
          </label>
          <input
            type="text"
            name="scanner_label"
            value={form.scanner_label}
            onChange={handleChange}
            placeholder="e.g. Ravi Pay"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {/* UPI ID */}
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1">UPI ID</label>
          <input
            type="text"
            name="upi_id"
            value={form.upi_id}
            onChange={handleChange}
            placeholder="e.g. yourname@ybl"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          {form.upi_id && !form.upi_id.includes('@') && (
            <p className="text-xs text-red-500 mt-1">UPI ID must contain @handle (e.g. name@ybl)</p>
          )}
        </div>

        {/* Enable toggle */}
        <div className="flex items-center gap-3">
          <input
            type="checkbox"
            id="scanner_enabled"
            name="scanner_enabled"
            checked={form.scanner_enabled}
            onChange={handleChange}
            className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          />
          <label htmlFor="scanner_enabled" className="text-sm font-semibold text-gray-700 cursor-pointer">
            Enable scanner (visible to your assigned users for deposits)
          </label>
        </div>

        {/* Current status pill */}
        {scanner && (
          <div className="rounded-lg bg-gray-50 border border-gray-200 px-4 py-3 text-sm text-gray-600 space-y-1">
            <div><span className="font-semibold">Current UPI:</span> {scanner.upi_id || <span className="text-gray-400 italic">not set</span>}</div>
            <div><span className="font-semibold">Status:</span>{' '}
              {scanner.scanner_enabled
                ? <span className="text-green-600 font-semibold">Active</span>
                : <span className="text-red-500 font-semibold">Inactive</span>}
            </div>
          </div>
        )}

        <button
          type="submit"
          disabled={saving}
          className="w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
        >
          {saving ? 'Saving…' : 'Save Changes'}
        </button>
      </form>
    </div>
  );
}

