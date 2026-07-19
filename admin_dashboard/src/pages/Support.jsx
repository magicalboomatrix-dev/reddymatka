import { useEffect, useRef, useState, useCallback } from 'react';
import api from '../utils/api';
import { useAuth } from '../context/AuthContext';
import { 
  MessageCircle, 
  Clock, 
  CheckCircle2, 
  AlertCircle, 
  Mail, 
  RefreshCw, 
  Search, 
  ArrowLeft, 
  Send, 
  Loader2,
  Inbox,
  MessageSquare,
  FileText,
  ChevronDown,
  Zap,
  X,
  Volume2,
  VolumeX,
  Bell
} from 'lucide-react';

const STATUS_CONFIG = {
  open: {
    label: 'Open',
    bg: 'bg-blue-50',
    border: 'border-blue-200',
    text: 'text-blue-700',
    badge: 'bg-blue-500',
    Icon: MessageCircle,
    gradient: 'from-blue-500 to-blue-600',
  },
  in_progress: {
    label: 'In Progress',
    bg: 'bg-amber-50',
    border: 'border-amber-200',
    text: 'text-amber-700',
    badge: 'bg-amber-500',
    Icon: Clock,
    gradient: 'from-amber-500 to-orange-500',
  },
  closed: {
    label: 'Resolved',
    bg: 'bg-emerald-50',
    border: 'border-emerald-200',
    text: 'text-emerald-700',
    badge: 'bg-emerald-500',
    Icon: CheckCircle2,
    gradient: 'from-emerald-500 to-green-600',
  },
};

// Quick reply templates
const QUICK_REPLIES = [
  { label: 'Welcome', message: 'Hello! Thank you for reaching out. How can I assist you today?' },
  { label: 'Investigating', message: 'I am looking into this issue for you. I will update you shortly with more information.' },
  { label: 'Need Info', message: 'To help you better, could you please provide more details or a screenshot of the issue?' },
  { label: 'Resolved', message: 'Great news! This issue has been resolved. Is there anything else I can help you with?' },
  { label: 'Follow Up', message: 'I wanted to follow up on your request. Are you still experiencing this issue?' },
  { label: 'Closing', message: 'As we haven\'t heard back, I will close this ticket. Feel free to reopen it if you need further assistance.' },
];

const PRIORITY_CONFIG = {
  low: { color: 'bg-gray-100 text-gray-600', label: 'Low' },
  medium: { color: 'bg-blue-100 text-blue-600', label: 'Medium' },
  high: { color: 'bg-orange-100 text-orange-600', label: 'High' },
  urgent: { color: 'bg-red-100 text-red-600', label: 'Urgent' },
};

function formatTimeAgo(ts) {
  if (!ts) return '-';
  const now = new Date();
  const date = new Date(ts);
  const seconds = Math.floor((now - date) / 1000);
  
  if (seconds < 60) return 'Just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
  return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

function formatTs(ts) {
  if (!ts) return '-';
  return new Date(ts).toLocaleString('en-IN', { 
    timeZone: 'Asia/Kolkata', 
    day: '2-digit', 
    month: 'short', 
    year: 'numeric', 
    hour: '2-digit', 
    minute: '2-digit' 
  });
}

function StatusBadge({ status, count }) {
  const config = STATUS_CONFIG[status] || STATUS_CONFIG.open;
  const Icon = config.Icon;
  return (
    <div className={`flex items-center gap-2 px-3 py-2 rounded-xl ${config.bg} border ${config.border} transition-all duration-200 hover:shadow-md`}>
      <Icon className={`w-5 h-5 ${config.text}`} />
      <div className="text-left">
        <div className={`text-lg font-bold leading-none ${config.text}`}>{count || 0}</div>
        <div className={`text-[10px] font-medium ${config.text} opacity-80`}>{config.label}</div>
      </div>
    </div>
  );
}

function PriorityBadge({ priority }) {
  const config = PRIORITY_CONFIG[priority] || PRIORITY_CONFIG.medium;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-bold ${config.color}`}>
      <AlertCircle className="w-3 h-3" />
      {config.label}
    </span>
  );
}

function SkeletonCard() {
  return (
    <div className="p-4 animate-pulse">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-full bg-gray-200" />
        <div className="flex-1 space-y-2">
          <div className="h-4 bg-gray-200 rounded w-3/4" />
          <div className="h-3 bg-gray-200 rounded w-1/2" />
          <div className="h-3 bg-gray-200 rounded w-2/3" />
        </div>
      </div>
    </div>
  );
}

function EmptyState({ Icon, title, subtitle }) {
  return (
    <div className="flex flex-col items-center justify-center h-full min-h-[300px] text-center p-6">
      <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-gray-100 to-gray-200 flex items-center justify-center mb-4 shadow-inner">
        {Icon && <Icon className="w-10 h-10 text-gray-400" />}
      </div>
      <h3 className="text-lg font-bold text-gray-700 mb-1">{title}</h3>
      <p className="text-sm text-gray-400 max-w-xs">{subtitle}</p>
    </div>
  );
}

export default function Support() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const isModerator = user?.role === 'moderator';

  const [tickets, setTickets] = useState([]);
  const [stats, setStats] = useState(null);
  const [activeTicket, setActiveTicket] = useState(null);
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [chatLoading, setChatLoading] = useState(false);
  const [newMessage, setNewMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [statusFilter, setStatusFilter] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('');
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [lastRefresh, setLastRefresh] = useState(Date.now());
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [showQuickReplies, setShowQuickReplies] = useState(false);
  const [previousMessageCount, setPreviousMessageCount] = useState(0);
  const messagesEndRef = useRef(null);
  const pollRef = useRef(null);
  const textareaRef = useRef(null);

  // Sound notification using Web Audio API
  const playNotificationSound = useCallback(() => {
    if (!soundEnabled) return;
    try {
      const audioContext = new (window.AudioContext || window.webkitAudioContext)();
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();
      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);
      oscillator.frequency.value = 800;
      oscillator.type = 'sine';
      gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);
      oscillator.start(audioContext.currentTime);
      oscillator.stop(audioContext.currentTime + 0.5);
    } catch (_) {}
  }, [soundEnabled]);

  const loadTickets = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const params = { 
        status: statusFilter || undefined, 
        priority: priorityFilter || undefined,
        search: search || undefined, 
        limit: 100 
      };
      const res = await api.get('/support/tickets', { params });
      setTickets(res.data.tickets || []);
      setLastRefresh(Date.now());
    } catch (err) {
      if (!silent) setError(err.response?.data?.error || err.message);
    } finally {
      if (!silent) setLoading(false);
    }
  }, [statusFilter, priorityFilter, search]);

  const loadStats = useCallback(async () => {
    try {
      const res = await api.get('/support/tickets/stats');
      setStats(res.data);
    } catch (_) {}
  }, []);

  // Initial load and auto-refresh
  useEffect(() => {
    loadTickets();
    loadStats();
  }, [loadTickets, loadStats]);

  // Auto-refresh every 30 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      loadTickets(true);
      loadStats();
    }, 30000);
    return () => clearInterval(interval);
  }, [loadTickets, loadStats]);

  const openTicket = async (ticket) => {
    setActiveTicket(ticket);
    setMessages([]);
    setChatLoading(true);
    setError('');
    clearInterval(pollRef.current);
    
    try {
      const res = await api.get(`/support/tickets/${ticket.id}`);
      setActiveTicket(res.data.ticket);
      const msgs = res.data.messages || [];
      setMessages(msgs);
      setPreviousMessageCount(msgs.length);
      
      // Mark messages as read
      if (msgs.some(m => m.sender_role === 'user' && !m.is_read)) {
        loadStats();
      }
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setChatLoading(false);
    }
    
    // Poll for new messages every 5s when chat is open
    pollRef.current = setInterval(async () => {
      try {
        const res = await api.get(`/support/tickets/${ticket.id}`);
        const newMessages = res.data.messages || [];
        
        // Check for new user messages and play sound
        if (newMessages.length > previousMessageCount) {
          const newUserMessages = newMessages.slice(previousMessageCount).filter(m => m.sender_role === 'user');
          if (newUserMessages.length > 0) {
            playNotificationSound();
          }
        }
        setPreviousMessageCount(newMessages.length);
        setMessages(newMessages);
        setActiveTicket(prev => ({ ...prev, ...res.data.ticket }));
      } catch (_) {}
    }, 5000);
  };

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping]);

  useEffect(() => () => clearInterval(pollRef.current), []);

  const sendMessage = async (e) => {
    e?.preventDefault();
    if (!newMessage.trim() || !activeTicket) return;
    
    setSending(true);
    setError('');
    setIsTyping(false);
    
    try {
      await api.post(`/support/tickets/${activeTicket.id}/messages`, { 
        message: newMessage.trim() 
      });
      setNewMessage('');
      
      // Optimistically add message
      const tempMsg = {
        id: Date.now(),
        message: newMessage.trim(),
        sender_name: user.name,
        sender_role: user.role,
        created_at: new Date().toISOString(),
        is_temp: true,
      };
      setMessages(prev => [...prev, tempMsg]);
      
      // Fetch actual data
      const res = await api.get(`/support/tickets/${activeTicket.id}`);
      setMessages(res.data.messages || []);
      setActiveTicket(res.data.ticket);
      loadTickets(true);
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setSending(false);
    }
  };

  const changeStatus = async (ticketId, newStatus) => {
    setError('');
    setSuccessMsg('');
    try {
      await api.put(`/support/tickets/${ticketId}/status`, { status: newStatus });
      setSuccessMsg(`Ticket ${newStatus === 'closed' ? 'resolved' : 'reopened'} successfully`);
      
      const res = await api.get(`/support/tickets/${ticketId}`);
      setActiveTicket(res.data.ticket);
      setMessages(res.data.messages || []);
      loadTickets(true);
      loadStats();
      
      setTimeout(() => setSuccessMsg(''), 3000);
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    }
  };

  const roleBadge = (role) => {
    const styles = {
      admin: 'bg-gradient-to-r from-red-500 to-rose-500 text-white',
      moderator: 'bg-gradient-to-r from-violet-500 to-purple-500 text-white',
      user: 'bg-gradient-to-r from-blue-400 to-cyan-400 text-white',
    };
    const labels = { admin: 'ADMIN', moderator: 'MOD', user: 'USER' };
    
    return (
      <span className={`ml-2 px-2 py-0.5 rounded-md text-[9px] font-bold tracking-wider ${styles[role] || styles.user}`}>
        {labels[role] || role.toUpperCase()}
      </span>
    );
  };

  const filteredTickets = tickets.filter(t => {
    const matchesSearch = !search || 
      t.subject?.toLowerCase().includes(search.toLowerCase()) ||
      t.user_name?.toLowerCase().includes(search.toLowerCase()) ||
      t.user_phone?.includes(search);
    const matchesStatus = !statusFilter || t.status === statusFilter;
    const matchesPriority = !priorityFilter || t.priority === priorityFilter;
    return matchesSearch && matchesStatus && matchesPriority;
  });

  const unreadCount = tickets.filter(t => t.unread_count > 0 && t.status !== 'closed').length;

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-slate-100 p-3 md:p-6">
      {/* Header Stats Cards */}
      <div className="max-w-7xl mx-auto mb-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          <StatusBadge status="open" count={stats?.open_count || 0} />
          <StatusBadge status="in_progress" count={stats?.in_progress_count || 0} />
          <StatusBadge status="closed" count={stats?.closed_count || 0} />
          <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-gradient-to-r from-indigo-500 to-purple-600 text-white shadow-lg shadow-indigo-200">
            <Bell className="w-5 h-5" />
            <div className="text-left">
              <div className="text-lg font-bold leading-none">{unreadCount}</div>
              <div className="text-[10px] opacity-90">Unread</div>
            </div>
          </div>
        </div>

        {/* Main Content Grid */}
        <div className="grid lg:grid-cols-3 gap-4 h-[calc(100vh-200px)] min-h-[600px]">
          {/* LEFT: Ticket List */}
          <div className={`lg:col-span-1 bg-white/80 backdrop-blur-sm rounded-2xl shadow-xl shadow-gray-200/50 border border-white overflow-hidden flex flex-col ${activeTicket ? 'hidden lg:flex' : 'flex'}`}>
            {/* Toolbar */}
            <div className="p-4 border-b border-gray-100 bg-white/50">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                  <MessageCircle className="w-5 h-5 text-primary-500" />
                  Support Tickets
                  <span className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full text-xs font-bold">{filteredTickets.length}</span>
                </h2>
                <button 
                  onClick={() => { loadTickets(); loadStats(); }}
                  className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
                  title="Refresh"
                >
                  <RefreshCw className="w-4 h-4 text-gray-500" />
                </button>
              </div>

              {/* Search */}
              <div className="relative mb-3">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-400 focus:bg-white transition-all"
                  placeholder="Search tickets, users, phone..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>

              {/* Filters */}
              <div className="flex gap-2">
                <select
                  className="flex-1 px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-400"
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                >
                  <option value="">All Status</option>
                  <option value="open">Open</option>
                  <option value="in_progress">In Progress</option>
                  <option value="closed">Resolved</option>
                </select>
                <select
                  className="flex-1 px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-400"
                  value={priorityFilter}
                  onChange={(e) => setPriorityFilter(e.target.value)}
                >
                  <option value="">All Priority</option>
                  <option value="urgent">Urgent</option>
                  <option value="high">High</option>
                  <option value="medium">Medium</option>
                  <option value="low">Low</option>
                </select>
              </div>
            </div>

            {/* Ticket List */}
            <div className="flex-1 overflow-y-auto">
              {loading ? (
                <div className="space-y-1">
                  {[...Array(5)].map((_, i) => <SkeletonCard key={i} />)}
                </div>
              ) : filteredTickets.length === 0 ? (
                <EmptyState 
                  Icon={Inbox}
                  title="No tickets found"
                  subtitle="Try adjusting your filters or search criteria"
                />
              ) : (
                <div className="divide-y divide-gray-100">
                  {filteredTickets.map((t) => {
                    const statusConfig = STATUS_CONFIG[t.status] || STATUS_CONFIG.open;
                    const isActive = activeTicket?.id === t.id;
                    const hasUnread = t.unread_count > 0;
                    
                    return (
                      <button
                        key={t.id}
                        onClick={() => openTicket(t)}
                        className={`w-full text-left p-4 transition-all duration-200 group ${
                          isActive 
                            ? 'bg-gradient-to-r from-primary-50 to-blue-50 border-l-4 border-primary-500' 
                            : 'hover:bg-gray-50 border-l-4 border-transparent'
                        }`}
                      >
                        <div className="flex items-start gap-3">
                          {/* Avatar */}
                          <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 ${
                            isActive 
                              ? 'bg-primary-500 text-white' 
                              : 'bg-gradient-to-br from-gray-100 to-gray-200 text-gray-600'
                          }`}>
                            {(t.user_name || t.user_phone || '?').charAt(0).toUpperCase()}
                          </div>
                          
                          <div className="flex-1 min-w-0">
                            {/* Header */}
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-xs font-mono text-gray-400">#{t.id}</span>
                              {t.priority && <PriorityBadge priority={t.priority} />}
                              {hasUnread && (
                                <span className="px-1.5 py-0.5 bg-red-500 text-white rounded-full text-[10px] font-bold">
                                  {t.unread_count}
                                </span>
                              )}
                              <span className={`w-2 h-2 rounded-full ${statusConfig.badge}`} />
                            </div>
                            
                            {/* Subject */}
                            <h3 className={`text-sm font-semibold truncate mt-1 ${
                              hasUnread ? 'text-gray-900' : 'text-gray-700'
                            }`}>
                              {t.subject}
                            </h3>
                            
                            {/* User Info */}
                            <p className="text-xs text-gray-500 mt-0.5 flex items-center gap-1">
                              <span className="font-medium text-gray-600">{t.user_name || t.user_phone}</span>
                              {t.moderator_name && (
                                <span className="text-gray-400">→ {t.moderator_name}</span>
                              )}
                            </p>
                            
                            {/* Last Message Preview */}
                            {t.last_message && (
                              <p className="text-xs text-gray-400 mt-1.5 truncate italic">
                                {t.last_message}
                              </p>
                            )}
                            
                            {/* Time */}
                            <div className="flex items-center justify-between mt-2">
                              <span className="text-[10px] text-gray-400 font-medium">
                                {formatTimeAgo(t.updated_at)}
                              </span>
                              {isActive && (
                                <span className="text-[10px] text-primary-500 font-semibold">Active</span>
                              )}
                            </div>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* RIGHT: Chat Panel */}
          <div className={`lg:col-span-2 bg-white/80 backdrop-blur-sm rounded-2xl shadow-xl shadow-gray-200/50 border border-white overflow-hidden flex flex-col ${activeTicket ? 'flex' : 'hidden lg:flex'}`}>
            {!activeTicket ? (
              <EmptyState 
                Icon={MessageSquare}
                title="Select a conversation"
                subtitle="Choose a ticket from the list to view messages and respond"
              />
            ) : (
              <>
                {/* Chat Header */}
                <div className="p-4 border-b border-gray-100 bg-white/80 backdrop-blur-sm">
                  <div className="flex items-start gap-3">
                    {/* Back Button (mobile) */}
                    <button
                      className="lg:hidden p-2 -ml-2 rounded-lg hover:bg-gray-100 transition-colors"
                      onClick={() => { setActiveTicket(null); clearInterval(pollRef.current); }}
                    >
                      <ArrowLeft className="w-5 h-5 text-gray-600" />
                    </button>

                    {/* User Avatar */}
                    <div className="w-12 h-12 rounded-full bg-gradient-to-br from-primary-400 to-primary-600 text-white flex items-center justify-center text-lg font-bold flex-shrink-0">
                      {(activeTicket.user_name || activeTicket.user_phone || '?').charAt(0).toUpperCase()}
                    </div>

                    {/* Ticket Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-mono text-gray-400">#{activeTicket.id}</span>
                        <PriorityBadge priority={activeTicket.priority} />
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${STATUS_CONFIG[activeTicket.status]?.bg} ${STATUS_CONFIG[activeTicket.status]?.text}`}>
                          {STATUS_CONFIG[activeTicket.status]?.label}
                        </span>
                      </div>
                      <h2 className="text-base font-bold text-gray-800 truncate mt-1">
                        {activeTicket.subject}
                      </h2>
                      <p className="text-xs text-gray-500 mt-0.5">
                        <span className="font-medium">{activeTicket.user_name}</span>
                        {activeTicket.user_phone && (
                          <span className="text-gray-400 ml-1">{activeTicket.user_phone}</span>
                        )}
                        {activeTicket.moderator_name && (
                          <span className="text-gray-400 ml-2">→ {activeTicket.moderator_name}</span>
                        )}
                      </p>
                    </div>

                    {/* Actions */}
                    <div className="flex gap-2">
                      {activeTicket.status === 'closed' ? (
                        <button
                          onClick={() => changeStatus(activeTicket.id, 'open')}
                          className="px-4 py-2 bg-gradient-to-r from-emerald-500 to-green-600 text-white rounded-xl text-sm font-semibold hover:shadow-lg hover:shadow-green-200 transition-all"
                        >
                          Reopen
                        </button>
                      ) : (
                        <>
                          <button
                            onClick={() => changeStatus(activeTicket.id, 'closed')}
                            className="px-4 py-2 bg-gradient-to-r from-emerald-500 to-green-600 text-white rounded-xl text-sm font-semibold hover:shadow-lg hover:shadow-green-200 transition-all"
                          >
                            Resolve
                          </button>
                          {activeTicket.status === 'open' && (
                            <button
                              onClick={() => changeStatus(activeTicket.id, 'in_progress')}
                              className="px-3 py-2 bg-amber-100 text-amber-700 rounded-xl text-sm font-semibold hover:bg-amber-200 transition-all"
                            >
                              Start
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                </div>

                {/* Messages Area */}
                <div className="flex-1 overflow-y-auto px-4 py-6 bg-gradient-to-b from-gray-50 to-white">
                  {chatLoading ? (
                    <div className="flex items-center justify-center h-full">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-500" />
                    </div>
                  ) : messages.length === 0 ? (
                    <div className="text-center py-12">
                      <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-gray-100 to-gray-200 flex items-center justify-center mx-auto mb-4">
                        <span className="text-2xl">📝</span>
                      </div>
                      <p className="text-gray-400 text-sm">No messages yet. Start the conversation!</p>
                    </div>
                  ) : (
                    <div className="space-y-4 max-w-4xl mx-auto">
                      {messages.map((msg, idx) => {
                        const isOwn = msg.sender_role !== 'user';
                        const showAvatar = idx === 0 || messages[idx - 1].sender_role !== msg.sender_role;
                        
                        return (
                          <div key={msg.id} className={`flex ${isOwn ? 'justify-end' : 'justify-start'}`}>
                            <div className={`flex gap-2 max-w-[85%] sm:max-w-[75%] ${isOwn ? 'flex-row-reverse' : ''}`}>
                              {/* Avatar */}
                              {showAvatar && (
                                <div className={`w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center text-xs font-bold ${
                                  isOwn 
                                    ? 'bg-gradient-to-br from-primary-500 to-primary-600 text-white' 
                                    : 'bg-gradient-to-br from-gray-200 to-gray-300 text-gray-600'
                                }`}>
                                  {(msg.sender_name || '?').charAt(0).toUpperCase()}
                                </div>
                              )}
                              {!showAvatar && <div className="w-8" />}
                              
                              {/* Message Bubble */}
                              <div className={`relative px-4 py-3 rounded-2xl shadow-sm ${
                                isOwn 
                                  ? 'bg-gradient-to-br from-primary-500 to-primary-600 text-white rounded-br-md' 
                                  : 'bg-white text-gray-800 rounded-bl-md border border-gray-100'
                              }`}>
                                {/* Sender Name */}
                                <div className="flex items-center gap-1 mb-1">
                                  <span className={`text-xs font-bold ${isOwn ? 'text-white/90' : 'text-gray-600'}`}>
                                    {msg.sender_name}
                                  </span>
                                  {roleBadge(msg.sender_role)}
                                </div>
                                
                                {/* Message Content */}
                                <p className="text-sm whitespace-pre-wrap break-words leading-relaxed">
                                  {msg.message}
                                </p>
                                
                                {/* Timestamp */}
                                <div className={`flex items-center gap-1 mt-1.5 ${isOwn ? 'justify-end' : ''}`}>
                                  <span className={`text-[10px] ${isOwn ? 'text-white/60' : 'text-gray-400'}`}>
                                    {formatTs(msg.created_at)}
                                  </span>
                                  {isOwn && msg.is_temp && (
                                    <span className="text-[10px] text-white/40">Sending...</span>
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                      
                      {/* Typing Indicator */}
                      {isTyping && (
                        <div className="flex justify-start">
                          <div className="flex gap-2">
                            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary-400 to-primary-600 flex items-center justify-center">
                              <span className="text-xs text-white">{user.name?.charAt(0)}</span>
                            </div>
                            <div className="bg-gray-100 rounded-2xl rounded-bl-md px-4 py-3">
                              <div className="flex gap-1">
                                <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                                <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                                <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                              </div>
                            </div>
                          </div>
                        </div>
                      )}
                      
                      <div ref={messagesEndRef} />
                    </div>
                  )}
                </div>

                {/* Alerts */}
                {error && (
                  <div className="mx-4 mb-2 rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-600 flex items-center gap-2">
                    <AlertCircle className="w-4 h-4" />
                    {error}
                  </div>
                )}
                {successMsg && (
                  <div className="mx-4 mb-2 rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-3 text-sm text-emerald-600 flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4" />
                    {successMsg}
                  </div>
                )}

                {/* Compose Area */}
                {activeTicket.status !== 'closed' ? (
                  <form onSubmit={sendMessage} className="p-4 bg-white/80 backdrop-blur-sm border-t border-gray-100">
                    {/* Quick Replies Dropdown */}
                    {showQuickReplies && (
                      <div className="max-w-4xl mx-auto mb-3">
                        <div className="bg-white border border-gray-200 rounded-xl shadow-lg p-2">
                          <div className="flex items-center justify-between mb-2 px-2">
                            <span className="text-xs font-semibold text-gray-500">Quick Replies</span>
                            <button
                              type="button"
                              onClick={() => setShowQuickReplies(false)}
                              className="p-1 hover:bg-gray-100 rounded"
                            >
                              <X className="w-4 h-4 text-gray-400" />
                            </button>
                          </div>
                          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                            {QUICK_REPLIES.map((reply, idx) => (
                              <button
                                key={idx}
                                type="button"
                                onClick={() => {
                                  setNewMessage(reply.message);
                                  setShowQuickReplies(false);
                                  textareaRef.current?.focus();
                                }}
                                className="text-left px-3 py-2 text-xs bg-gray-50 hover:bg-primary-50 hover:text-primary-600 rounded-lg transition-colors"
                              >
                                <span className="font-semibold">{reply.label}:</span>
                                <span className="text-gray-500 truncate block">{reply.message.slice(0, 30)}...</span>
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}
                    
                    <div className="flex gap-3 max-w-4xl mx-auto">
                      <div className="flex-1 relative">
                        <textarea
                          ref={textareaRef}
                          rows={1}
                          className="w-full px-4 py-3 pr-20 bg-gray-50 border border-gray-200 rounded-xl text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary-400 focus:bg-white transition-all min-h-[48px] max-h-32"
                          placeholder="Type your message..."
                          value={newMessage}
                          onChange={(e) => {
                            setNewMessage(e.target.value);
                            setIsTyping(true);
                          }}
                          onKeyDown={(e) => { 
                            if (e.key === 'Enter' && !e.shiftKey) { 
                              e.preventDefault(); 
                              sendMessage(e); 
                            } 
                          }}
                          disabled={sending}
                        />
                        {/* Quick reply toggle button inside textarea */}
                        <button
                          type="button"
                          onClick={() => setShowQuickReplies(!showQuickReplies)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 text-gray-400 hover:text-primary-500 hover:bg-primary-50 rounded-lg transition-colors"
                          title="Quick Replies"
                        >
                          <Zap className="w-4 h-4" />
                        </button>
                      </div>
                      
                      {/* Sound Toggle */}
                      <button
                        type="button"
                        onClick={() => setSoundEnabled(!soundEnabled)}
                        className={`self-center p-3 rounded-xl transition-colors ${soundEnabled ? 'bg-primary-100 text-primary-600' : 'bg-gray-100 text-gray-400'}`}
                        title={soundEnabled ? 'Sound On' : 'Sound Off'}
                      >
                        {soundEnabled ? <Volume2 className="w-5 h-5" /> : <VolumeX className="w-5 h-5" />}
                      </button>
                      
                      <button
                        type="submit"
                        disabled={sending || !newMessage.trim()}
                        className="self-center px-6 py-3 bg-gradient-to-r from-primary-500 to-primary-600 text-white rounded-xl font-semibold hover:shadow-lg hover:shadow-primary-200 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center gap-2 flex-shrink-0"
                      >
                        {sending ? (
                          <Loader2 className="animate-spin h-5 w-5" />
                        ) : (
                          <>
                            <span className="hidden sm:inline">Send</span>
                            <Send className="w-5 h-5" />
                          </>
                        )}
                      </button>
                    </div>
                    <p className="text-[10px] text-gray-400 mt-2 text-center max-w-4xl mx-auto">
                      Press Enter to send, Shift+Enter for new line • Click <Zap className="w-3 h-3 inline" /> for quick replies
                    </p>
                  </form>
                ) : (
                  <div className="p-4 bg-gray-50 border-t border-gray-100 text-center">
                    <p className="text-sm text-gray-500">
                      This ticket has been resolved.{' '}
                      <button 
                        onClick={() => changeStatus(activeTicket.id, 'open')} 
                        className="text-primary-500 font-semibold hover:underline"
                      >
                        Reopen to continue
                      </button>
                    </p>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
