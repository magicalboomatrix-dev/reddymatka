import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import api from '../utils/api';
import { useToast, ToastContainer } from '../components/ui';
import PaginatedTable from '../components/PaginatedTable';
import {
  User,
  Users,
  Clock,
  CheckCircle,
  TrendingUp,
  QrCode,
  Copy,
  Check,
  Share2,
  Lock,
  ArrowLeft,
  Calendar,
  ExternalLink,
  Edit2,
  Info,
  Download,
  Send,
  Eye,
  EyeOff,
  AlertTriangle,
  Shield,
  FileText
} from 'lucide-react';

function formatCurrency(value) {
  return `₹${Number(value || 0).toLocaleString('en-IN')}`;
}

export default function ModeratorDetail() {
  const { id } = useParams();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('overview');
  const { toasts, success, error: toastError, dismiss } = useToast();
  
  const [pwForm, setPwForm] = useState({ newPassword: '', confirmPassword: '' });
  const [pwSaving, setPwSaving] = useState(false);
  const [pwShowNew, setPwShowNew] = useState(false);
  const [pwShowConfirm, setPwShowConfirm] = useState(false);
  
  const [refCodeEditing, setRefCodeEditing] = useState(false);
  const [refCodeValue, setRefCodeValue] = useState('');
  const [refCodeSaving, setRefCodeSaving] = useState(false);

  // Invitation Link state
  const [copied, setCopied] = useState(false);

  const loadDetail = async () => {
    setLoading(true);
    try {
      const res = await api.get(`/admin/moderators/${id}/detail`);
      setData(res.data || null);
    } catch (error) {
      console.error(error);
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDetail();
  }, [id]);

  const handleChangePassword = async (e) => {
    e.preventDefault();
    if (pwForm.newPassword.length < 6) {
      toastError('Password must be at least 6 characters.');
      return;
    }
    if (pwForm.newPassword !== pwForm.confirmPassword) {
      toastError('Passwords do not match.');
      return;
    }
    setPwSaving(true);
    try {
      await api.put(`/moderators/${id}`, { password: pwForm.newPassword });
      success('Password changed successfully.');
      setPwForm({ newPassword: '', confirmPassword: '' });
    } catch (err) {
      toastError(err.response?.data?.error || 'Failed to change password.');
    } finally {
      setPwSaving(false);
    }
  };

  const handleSaveReferralCode = async () => {
    const code = refCodeValue.trim();
    if (!/^M\d{5}$/.test(code)) {
      toastError('Referral code must be M followed by 5 digits (e.g. M55555).');
      return;
    }
    setRefCodeSaving(true);
    try {
      await api.put(`/moderators/${id}`, { referral_code: code });
      success('Referral code updated.');
      setRefCodeEditing(false);
      loadDetail();
    } catch (err) {
      toastError(err.response?.data?.error || 'Failed to update referral code.');
    } finally {
      setRefCodeSaving(false);
    }
  };

  const moderator = data?.moderator;
  const deposits = data?.deposit_transactions || [];
  const assignedUsers = data?.assigned_users || [];
  const notifications = data?.notifications || [];
  const referredUsers = data?.referred_users || [];

  // Dynamic APK sharing invite link
  const inviteLink = moderator?.referral_code
    ? `https://reddymatka.com/download?ref=${moderator.referral_code}`
    : '';

  const handleCopyLink = () => {
    if (!inviteLink) return;
    navigator.clipboard.writeText(inviteLink);
    setCopied(true);
    success('Invite APK link copied!');
    setTimeout(() => setCopied(false), 2000);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh] bg-gray-50/50 rounded-2xl">
        <div className="text-center p-8">
          <div className="relative inline-flex mb-4">
            <div className="w-12 h-12 rounded-full border-4 border-amber-200 border-t-amber-600 animate-spin"></div>
            <div className="absolute inset-0 flex items-center justify-center">
              <User size={18} className="text-amber-600 animate-pulse" />
            </div>
          </div>
          <div className="text-gray-700 font-semibold text-base">Loading Agent Details</div>
          <div className="text-gray-400 text-xs mt-1">Fetching metrics, audits and referral lists...</div>
        </div>
      </div>
    );
  }

  if (!moderator) {
    return (
      <div className="flex items-center justify-center min-h-[60vh] bg-red-50/40 border border-dashed border-red-200 rounded-2xl p-8">
        <div className="text-center max-w-sm">
          <AlertTriangle size={48} className="text-red-500 mx-auto mb-3" />
          <h3 className="text-lg font-bold text-gray-800">Agent Not Found</h3>
          <p className="text-gray-500 text-sm mt-1">The moderator/agent record you are looking for does not exist or has been deleted.</p>
          <Link to="/moderators" className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 bg-gray-800 text-white rounded-lg hover:bg-gray-700 transition-colors text-sm font-medium">
            <ArrowLeft size={16} /> Back to Moderators
          </Link>
        </div>
      </div>
    );
  }

  // Table column definitions
  const depositColumns = [
    { header: 'Date', accessor: 'created_at', className: 'text-left', cellClass: 'text-xs text-gray-600 font-medium whitespace-nowrap', render: (row) => new Date(row.created_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }) },
    { header: 'User', accessor: 'user_name', className: 'text-left', cellClass: 'text-xs text-gray-700', render: (row) => (
      <div className="flex items-center gap-2">
        <div className="w-7 h-7 rounded-full bg-slate-100 flex items-center justify-center text-[10px] font-bold text-slate-700 uppercase">
          {row.user_name?.slice(0, 2)}
        </div>
        <div>
          <Link to={`/users/${row.user_id}`} className="text-amber-600 hover:text-amber-700 font-semibold hover:underline block leading-tight">{row.user_name}</Link>
          <div className="text-gray-400 text-[10px] mt-0.5">{row.user_phone}</div>
        </div>
      </div>
    )},
    { header: 'Amount', accessor: 'amount', className: 'text-right', cellClass: 'font-bold text-right text-emerald-600 text-xs sm:text-sm', render: (row) => formatCurrency(row.amount) },
    { header: 'UTR', accessor: 'utr_number', className: 'text-left', cellClass: 'font-mono text-xs font-semibold text-slate-800', render: (row) => row.utr_number || '-' },
    { header: 'Payer', accessor: 'payer_name', className: 'text-left', cellClass: 'text-xs text-gray-600 font-medium', render: (row) => row.payer_name || '-' },
    { header: 'Status', accessor: 'status', className: 'text-center', cellClass: 'text-center', render: (row) => (
      <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-100 text-emerald-800">
        {row.status}
      </span>
    )},
  ];

  const assignedUserColumns = [
    { header: 'User', accessor: 'name', className: 'text-left', cellClass: 'text-xs text-gray-700', render: (row) => (
      <div className="flex items-center gap-2">
        <div className="w-7 h-7 rounded-full bg-indigo-50 flex items-center justify-center text-[10px] font-bold text-indigo-600 uppercase">
          {row.name?.slice(0, 2)}
        </div>
        <div>
          <div className="font-semibold text-gray-800 leading-tight">{row.name}</div>
          <div className="text-gray-400 text-[10px] mt-0.5">{row.phone}</div>
        </div>
      </div>
    )},
    { header: 'Balance', accessor: 'balance', className: 'text-right', cellClass: 'text-xs font-bold text-right text-slate-800', render: (row) => formatCurrency(row.balance) },
    { header: 'Deposits', accessor: 'deposit_count', className: 'text-right', cellClass: 'text-xs font-semibold text-right text-indigo-600', render: (row) => row.deposit_count },
    { header: 'Details', accessor: 'actions', className: 'text-center', cellClass: 'text-center', render: (row) => (
      <Link to={`/users/${row.id}`} className="inline-flex items-center justify-center px-2.5 py-1 bg-amber-500 text-white text-[11px] font-semibold hover:bg-amber-600 rounded transition-colors shadow-sm">View</Link>
    )},
  ];

  const referredUserColumns = [
    { header: 'User', accessor: 'user_name', className: 'text-left', cellClass: 'text-xs text-gray-700', render: (row) => (
      <div className="flex items-center gap-2">
        <div className="w-7 h-7 rounded-full bg-amber-50 flex items-center justify-center text-[10px] font-bold text-amber-600 uppercase">
          {row.user_name?.slice(0, 2)}
        </div>
        <div>
          <Link to={`/users/${row.referred_user_id}`} className="text-amber-600 hover:text-amber-700 font-semibold hover:underline block leading-tight">{row.user_name}</Link>
          <div className="text-gray-400 text-[10px] mt-0.5">{row.user_phone}</div>
        </div>
      </div>
    )},
    { header: 'Bonus', accessor: 'bonus_amount', className: 'text-right', cellClass: 'text-xs font-bold text-right text-emerald-600', render: (row) => formatCurrency(row.bonus_amount) },
    { header: 'Status', accessor: 'status', className: 'text-center', cellClass: 'text-center', render: (row) => (
      <span className={`inline-flex items-center px-2 py-0.5 text-[10px] font-semibold rounded ${row.status === 'credited' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>
        {row.status === 'credited' ? 'Credited' : 'Pending'}
      </span>
    )},
    { header: 'Date', accessor: 'created_at', className: 'text-left', cellClass: 'text-xs text-gray-500 font-medium', render: (row) => new Date(row.created_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }) },
  ];

  const tabs = [
    { id: 'overview', label: 'Overview', count: null },
    { id: 'deposits', label: 'Deposits', count: deposits.length },
    { id: 'users', label: 'Assigned Users', count: assignedUsers.length },
    { id: 'referrals', label: 'Referrals', count: referredUsers.length },
  ];

  const whatsappMessage = encodeURIComponent(`Hello! Click here to download the official REDDYMATKA APK and register using my direct agent link to get started: ${inviteLink}`);
  const whatsappUrl = `https://api.whatsapp.com/send?text=${whatsappMessage}`;
  const qrCodeUrl = inviteLink
    ? `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(inviteLink)}&color=d97706&bgcolor=ffffff&qzone=1`
    : '';

  return (
    <div className="space-y-6 pb-12">
      {/* ── Top Header Section ────────────────────────────────────────── */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 rounded-2xl p-4 sm:p-6 text-white shadow-lg border border-slate-700/50">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-center gap-3 sm:gap-4">
            <div className="w-12 h-12 sm:w-16 sm:h-16 rounded-2xl bg-amber-500/10 border-2 border-amber-500/30 flex items-center justify-center shadow-inner flex-shrink-0">
              <User size={24} className="text-amber-500 sm:w-8 sm:h-8" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-lg sm:text-2xl font-bold tracking-tight truncate max-w-[200px] sm:max-w-md">{moderator.name}</h3>
                <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] sm:text-xs font-semibold ${
                  moderator.is_blocked 
                    ? 'bg-red-500/10 text-red-400 border border-red-500/20' 
                    : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                }`}>
                  <span className={`w-2 h-2 rounded-full ${moderator.is_blocked ? 'bg-red-400' : 'bg-emerald-400 animate-pulse'}`} />
                  {moderator.is_blocked ? 'Blocked' : 'Active Moderator'}
                </span>
              </div>
              <p className="text-xs sm:text-sm text-slate-400 mt-1 flex items-center gap-1.5">
                <Calendar size={13} className="text-slate-500" />
                Registered: {new Date(moderator.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 self-end lg:self-auto">
            <Link 
              to={`/jantri?moderator_id=${id}`} 
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-amber-500 text-slate-900 hover:bg-amber-400 text-xs sm:text-sm font-bold rounded-xl transition-all shadow-md shadow-amber-500/10 hover:shadow-amber-500/25 active:scale-95"
            >
              <FileText size={16} /> View Jantri
            </Link>
            <Link 
              to="/moderators" 
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white text-xs sm:text-sm font-semibold rounded-xl border border-slate-700/50 transition-all active:scale-95"
            >
              <ArrowLeft size={16} /> Back
            </Link>
          </div>
        </div>
      </div>

      {/* ── Stats Cards Grid ─────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {/* Stat 1: Assigned Users */}
        <div className="bg-white border border-slate-100 rounded-2xl p-4 sm:p-5 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-300 flex items-start justify-between group border-l-4 border-l-blue-500">
          <div>
            <p className="text-xs sm:text-sm font-semibold text-slate-400 uppercase tracking-wider">Assigned Users</p>
            <p className="text-2xl sm:text-3xl font-extrabold text-slate-800 mt-1.5">{moderator.user_count}</p>
            <p className="text-[10px] text-blue-600 mt-1 font-medium flex items-center gap-1">
              Active accounts connected
            </p>
          </div>
          <div className="w-9 h-9 sm:w-11 sm:h-11 rounded-xl bg-blue-50 flex items-center justify-center text-blue-600 group-hover:scale-110 transition-transform flex-shrink-0">
            <Users size={18} className="sm:w-5 sm:h-5" />
          </div>
        </div>

        {/* Stat 2: Pending Deposits */}
        <div className="bg-white border border-slate-100 rounded-2xl p-4 sm:p-5 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-300 flex items-start justify-between group border-l-4 border-l-amber-500">
          <div>
            <p className="text-xs sm:text-sm font-semibold text-slate-400 uppercase tracking-wider">Pending Deposits</p>
            <p className="text-2xl sm:text-3xl font-extrabold text-slate-800 mt-1.5">{moderator.pending_deposits}</p>
            <p className="text-[10px] text-amber-600 mt-1 font-medium flex items-center gap-1">
              Awaiting verification
            </p>
          </div>
          <div className="w-9 h-9 sm:w-11 sm:h-11 rounded-xl bg-amber-50 flex items-center justify-center text-amber-600 group-hover:scale-110 transition-transform flex-shrink-0">
            <Clock size={18} className="sm:w-5 sm:h-5" />
          </div>
        </div>

        {/* Stat 3: Completed Deposits */}
        <div className="bg-white border border-slate-100 rounded-2xl p-4 sm:p-5 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-300 flex items-start justify-between group border-l-4 border-l-emerald-500">
          <div>
            <p className="text-xs sm:text-sm font-semibold text-slate-400 uppercase tracking-wider">Approved Deposits</p>
            <p className="text-xl sm:text-2xl font-extrabold text-slate-800 mt-1.5">{moderator.approved_deposit_count}</p>
            <p className="text-[10px] text-emerald-600 mt-1 font-bold tracking-tight truncate max-w-[120px] sm:max-w-none">
              Vol: {formatCurrency(moderator.approved_deposit_amount)}
            </p>
          </div>
          <div className="w-9 h-9 sm:w-11 sm:h-11 rounded-xl bg-emerald-50 flex items-center justify-center text-emerald-600 group-hover:scale-110 transition-transform flex-shrink-0">
            <CheckCircle size={18} className="sm:w-5 sm:h-5" />
          </div>
        </div>

        {/* Stat 4: Total Deposits */}
        <div className="bg-white border border-slate-100 rounded-2xl p-4 sm:p-5 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-300 flex items-start justify-between group border-l-4 border-l-indigo-500">
          <div>
            <p className="text-xs sm:text-sm font-semibold text-slate-400 uppercase tracking-wider">Total Actions</p>
            <p className="text-2xl sm:text-3xl font-extrabold text-slate-800 mt-1.5">{moderator.total_related_deposits}</p>
            <p className="text-[10px] text-indigo-600 mt-1 font-medium flex items-center gap-1">
              Overall transactions handled
            </p>
          </div>
          <div className="w-9 h-9 sm:w-11 sm:h-11 rounded-xl bg-indigo-50 flex items-center justify-center text-indigo-600 group-hover:scale-110 transition-transform flex-shrink-0">
            <TrendingUp size={18} className="sm:w-5 sm:h-5" />
          </div>
        </div>
      </div>

      {/* ── Desktop View Sidebar/Tab Control and Overview Grid ─────────────────── */}
      <div className={`grid grid-cols-1 lg:grid-cols-3 gap-6 ${activeTab !== 'overview' ? 'hidden lg:grid' : ''}`}>
        
        {/* Column 1 & 2: Main Profile and Scanner configuration */}
        <div className="lg:col-span-2 space-y-6">
          
          {/* Moderator Details Card */}
          <div className="bg-white border border-slate-100 rounded-2xl p-5 sm:p-6 shadow-sm space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-amber-500/10 flex items-center justify-center text-amber-600">
                  <User size={16} />
                </div>
                <h4 className="text-base sm:text-lg font-bold text-slate-800">Moderator Information</h4>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="border border-slate-50 bg-slate-50/30 rounded-xl p-3">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Moderator ID</span>
                <p className="text-sm font-semibold text-slate-800 mt-0.5">#{moderator.id}</p>
              </div>

              <div className="border border-slate-50 bg-slate-50/30 rounded-xl p-3">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Full Name</span>
                <p className="text-sm font-semibold text-slate-800 mt-0.5">{moderator.name}</p>
              </div>

              <div className="border border-slate-50 bg-slate-50/30 rounded-xl p-3">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Phone Number</span>
                <p className="text-sm font-semibold text-slate-800 mt-0.5">{moderator.phone}</p>
              </div>

              <div className="border border-slate-50 bg-slate-50/30 rounded-xl p-3 flex items-center justify-between">
                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Agent Referral Code</span>
                  {refCodeEditing ? (
                    <div className="inline-flex items-center gap-1 mt-1">
                      <input
                        type="text"
                        value={refCodeValue}
                        onChange={(e) => setRefCodeValue(e.target.value.toUpperCase())}
                        placeholder="M55555"
                        maxLength={6}
                        className="w-24 px-2 py-1 border border-slate-200 text-xs focus:outline-none focus:ring-2 focus:ring-amber-500 font-mono font-bold rounded-lg"
                      />
                      <button onClick={handleSaveReferralCode} disabled={refCodeSaving}
                        className="px-2 py-1 text-xs bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-md shadow-sm disabled:opacity-50 transition-colors">
                        {refCodeSaving ? '...' : 'Save'}
                      </button>
                      <button onClick={() => setRefCodeEditing(false)}
                        className="px-2 py-1 text-xs bg-slate-100 hover:bg-slate-200 text-slate-500 rounded-md transition-colors">
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <span className="font-mono font-bold text-sm text-slate-800 bg-amber-500/10 px-2 py-0.5 rounded mt-0.5 inline-block border border-amber-500/20">
                      {moderator.referral_code}
                    </span>
                  )}
                </div>
                {!refCodeEditing && (
                  <button 
                    onClick={() => { setRefCodeValue(moderator.referral_code || ''); setRefCodeEditing(true); }}
                    className="inline-flex items-center gap-1 px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-[11px] font-semibold text-slate-700 rounded-lg transition-colors"
                  >
                    <Edit2 size={11} /> Edit
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Column 3: The Premium Agent Link & APK Download QR Section */}
        <div className="space-y-6">
          
          <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm space-y-5 flex flex-col items-center">
            
            {/* Title Block */}
            <div className="w-full text-center border-b border-slate-100 pb-3">
              <h4 className="text-base font-bold text-slate-800 flex items-center justify-center gap-2">
                <Share2 size={16} className="text-amber-500" />
                Agent APK Share Center
              </h4>
              <p className="text-[11px] text-slate-400 mt-1">Players who register using this link will join under this Moderator.</p>
            </div>

            {/* Generated QR Code Card */}
            {inviteLink ? (
              <div className="relative group">
                <div className="absolute -inset-1.5 bg-gradient-to-r from-amber-500 to-amber-600 rounded-2xl blur opacity-10 group-hover:opacity-20 transition duration-300"></div>
                <div className="relative bg-white border border-slate-100 p-3 rounded-2xl shadow-inner">
                  <img 
                    src={qrCodeUrl} 
                    alt="Agent Registration QR" 
                    className="w-44 h-44 sm:w-48 sm:h-48 object-contain rounded"
                  />
                  <div className="absolute bottom-1 right-1 bg-amber-500 text-slate-900 w-6 h-6 rounded-lg flex items-center justify-center shadow">
                    <QrCode size={13} />
                  </div>
                </div>
              </div>
            ) : (
              <div className="w-44 h-44 bg-slate-50 border border-dashed border-slate-200 rounded-2xl flex flex-col items-center justify-center text-center p-4">
                <AlertTriangle size={32} className="text-slate-300 mb-2" />
                <span className="text-xs text-slate-400 font-medium leading-normal">Referral code required to generate link</span>
              </div>
            )}

            {/* Link Text Box */}
            <div className="w-full space-y-2">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Agent Shareable Link</label>
              <div className="flex items-center gap-1.5">
                <input
                  type="text"
                  readOnly
                  value={inviteLink || 'No referral code set'}
                  className="flex-1 bg-slate-50 border border-slate-200 text-slate-700 text-xs font-mono px-3 py-2.5 rounded-xl focus:outline-none text-ellipsis overflow-hidden"
                />
                
                {inviteLink && (
                  <button
                    onClick={handleCopyLink}
                    className={`p-2.5 rounded-xl border shadow-sm transition-all flex-shrink-0 active:scale-90 ${
                      copied 
                        ? 'bg-emerald-600 border-emerald-600 text-white' 
                        : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                    title="Copy invite URL"
                  >
                    {copied ? <Check size={15} /> : <Copy size={15} />}
                  </button>
                )}
              </div>
            </div>

            {/* Quick Actions (WhatsApp, Browser, Download QR) */}
            {inviteLink && (
              <div className="w-full grid grid-cols-2 gap-2 text-xs">
                
                {/* WhatsApp Action */}
                <a
                  href={whatsappUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-1.5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl transition-all shadow-sm shadow-emerald-500/10 hover:shadow-emerald-500/25 active:scale-95 text-center"
                >
                  <Send size={13} /> Share on WA
                </a>

                {/* Print/Download QR URL */}
                <a
                  href={qrCodeUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  download={`Agent_QR_${moderator.referral_code}.png`}
                  className="flex items-center justify-center gap-1.5 py-2.5 bg-slate-800 hover:bg-slate-700 text-white font-bold rounded-xl transition-all shadow-sm active:scale-95 text-center"
                >
                  <Download size={13} /> Save QR Code
                </a>

              </div>
            )}
            
          </div>

        </div>

      </div>

      {/* ── Tabs Navigation Section ────────────────────────────────────────── */}
      <div className="border-b border-slate-200">
        <div className="flex overflow-x-auto gap-1 pb-px -mx-4 px-4 sm:mx-0 sm:px-0 scrollbar-none">
          {tabs.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex-shrink-0 px-4 py-3 text-xs sm:text-sm font-semibold tracking-wide border-b-2 transition-all relative whitespace-nowrap ${
                  isActive
                    ? 'border-amber-500 text-amber-600 font-bold'
                    : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
                }`}
              >
                {tab.label}
                {tab.count !== null && (
                  <span className={`ml-1.5 px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
                    isActive 
                      ? 'bg-amber-500 text-slate-900' 
                      : 'bg-slate-100 text-slate-500'
                  }`}>
                    {tab.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Table Containers ────────────────────────────────────────────── */}
      
      {/* 1. Deposits Tab */}
      <div className={`bg-white border border-slate-100 rounded-2xl shadow-sm overflow-hidden ${
        activeTab !== 'overview' && activeTab !== 'deposits' ? 'hidden lg:block' : ''
      }`}>
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <TrendingUp size={16} className="text-amber-500" />
            <h4 className="text-sm sm:text-base font-bold text-slate-800">Deposit Transactions</h4>
          </div>
          <span className="bg-slate-100 text-slate-500 px-2 py-0.5 text-xs font-bold rounded-full">{deposits.length} records</span>
        </div>
        <PaginatedTable 
          data={deposits} 
          columns={depositColumns} 
          emptyMessage="No deposit transactions recorded for this moderator"
          rowsPerPage={10}
          maxHeight="400px"
        />
      </div>

      {/* 2. Assigned Users Grid & Referred Users */}
      <div className={`grid grid-cols-1 xl:grid-cols-2 gap-6 ${
        activeTab !== 'overview' && activeTab !== 'users' && activeTab !== 'referrals' ? 'hidden lg:grid' : ''
      }`}>
        {/* Assigned Users Card */}
        <div className={`bg-white border border-slate-100 rounded-2xl shadow-sm overflow-hidden ${
          activeTab !== 'overview' && activeTab !== 'users' ? 'hidden xl:block' : ''
        }`}>
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Users size={16} className="text-amber-500" />
              <h4 className="text-sm sm:text-base font-bold text-slate-800">Assigned Users</h4>
            </div>
            <span className="bg-slate-100 text-slate-500 px-2 py-0.5 text-xs font-bold rounded-full">{assignedUsers.length} active</span>
          </div>
          <PaginatedTable 
            data={assignedUsers} 
            columns={assignedUserColumns} 
            emptyMessage="No users are currently assigned directly under this agent"
            rowsPerPage={10}
            maxHeight="400px"
          />
        </div>

        {/* Referred Users Card */}
        <div className={`bg-white border border-slate-100 rounded-2xl shadow-sm overflow-hidden ${
          activeTab !== 'overview' && activeTab !== 'referrals' ? 'hidden xl:block' : ''
        }`}>
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ExternalLink size={16} className="text-amber-500" />
              <h4 className="text-sm sm:text-base font-bold text-slate-800">Referred Users</h4>
            </div>
            <span className="bg-slate-100 text-slate-500 px-2 py-0.5 text-xs font-bold rounded-full">{referredUsers.length} referrals</span>
          </div>
          <PaginatedTable 
            data={referredUsers} 
            columns={referredUserColumns} 
            emptyMessage="No referrals linked to this agent yet"
            rowsPerPage={10}
            maxHeight="400px"
          />
        </div>
      </div>



      {/* ── Bottom Section (Overview Only) ────────────────────────────── */}
      {activeTab === 'overview' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          
          {/* Recent Agent Notifications */}
          <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <Clock size={16} className="text-amber-500" />
                <h4 className="text-base font-bold text-slate-800">Recent Notifications</h4>
              </div>
              <span className="bg-slate-100 text-slate-500 px-2 py-0.5 text-xs font-bold rounded-full">{notifications.length} alerts</span>
            </div>
            
            <div className="space-y-3.5 max-h-[320px] overflow-y-auto pr-1">
              {notifications.slice(0, 10).map((notification) => (
                <div key={notification.id} className="border border-slate-100 bg-slate-50/20 px-4 py-3 rounded-xl flex items-start gap-3 hover:bg-slate-50/50 transition-colors">
                  <span className={`w-2.5 h-2.5 rounded-full mt-1.5 flex-shrink-0 ${notification.is_read ? 'bg-slate-300' : 'bg-amber-500 animate-pulse'}`} />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs sm:text-sm text-slate-700 leading-normal font-medium">{notification.message}</p>
                    <p className="text-[10px] text-slate-400 mt-1 font-medium">
                      {new Date(notification.created_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}
                    </p>
                  </div>
                </div>
              ))}
              {notifications.length === 0 && (
                <div className="text-center py-10 text-slate-400">
                  <div className="text-3xl mb-2">🔔</div>
                  <p className="text-xs font-semibold">No recent agent alerts</p>
                </div>
              )}
            </div>
          </div>

          {/* Change Password Card */}
          <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm space-y-4">
            <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
              <Lock size={16} className="text-amber-500" />
              <h4 className="text-base font-bold text-slate-800">Security & Credentials</h4>
            </div>

            <form onSubmit={handleChangePassword} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">New Password</label>
                  <div className="relative">
                    <input
                      type={pwShowNew ? 'text' : 'password'}
                      value={pwForm.newPassword}
                      onChange={(e) => setPwForm((p) => ({ ...p, newPassword: e.target.value }))}
                      placeholder="Min 6 characters"
                      className="w-full px-3.5 py-2.5 pr-10 border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 rounded-xl transition-all"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setPwShowNew((v) => !v)}
                      className="absolute inset-y-0 right-0 flex items-center px-3 text-slate-400 hover:text-slate-600"
                      tabIndex={-1}
                    >
                      {pwShowNew ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Confirm Password</label>
                  <div className="relative">
                    <input
                      type={pwShowConfirm ? 'text' : 'password'}
                      value={pwForm.confirmPassword}
                      onChange={(e) => setPwForm((p) => ({ ...p, confirmPassword: e.target.value }))}
                      placeholder="Repeat password"
                      className="w-full px-3.5 py-2.5 pr-10 border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 rounded-xl transition-all"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setPwShowConfirm((v) => !v)}
                      className="absolute inset-y-0 right-0 flex items-center px-3 text-slate-400 hover:text-slate-600"
                      tabIndex={-1}
                    >
                      {pwShowConfirm ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                  </div>
                </div>
              </div>

              <button
                type="submit"
                disabled={pwSaving}
                className="w-full sm:w-auto px-5 py-2.5 bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs uppercase tracking-wider rounded-xl shadow transition-all active:scale-95 disabled:opacity-50"
              >
                {pwSaving ? 'Updating...' : 'Update Agent Password'}
              </button>
            </form>
          </div>

        </div>
      )}

      <ToastContainer toasts={toasts} dismiss={dismiss} />
    </div>
  );
}
