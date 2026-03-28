import { useEffect, useState } from 'react';
import api from '../utils/api';
import { useToast, ToastContainer } from '../components/ui';

function getNotificationTone(notification) {
  if (notification.type === 'system') {
    return notification.is_read
      ? 'bg-gray-50 border-gray-200'
      : 'bg-amber-50 border-amber-200';
  }

  if (notification.type === 'deposit') {
    return notification.is_read
      ? 'bg-gray-50 border-gray-200'
      : 'bg-green-50 border-green-200';
  }

  if (notification.type === 'withdraw') {
    return notification.is_read
      ? 'bg-gray-50 border-gray-200'
      : 'bg-red-50 border-red-200';
  }

  return notification.is_read
    ? 'bg-gray-50 border-gray-200'
    : 'bg-blue-50 border-blue-200';
}

export default function Notifications() {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const { toasts, error: toastError, dismiss } = useToast();

  useEffect(() => {
    loadNotifications();
  }, []);

  const loadNotifications = async () => {
    setLoading(true);
    try {
      const res = await api.get('/notifications/my');
      setNotifications(Array.isArray(res.data.notifications) ? res.data.notifications : []);
    } catch (err) {
      console.error('Failed to load notifications:', err);
    } finally {
      setLoading(false);
    }
  };

  const markRead = async (id) => {
    try {
      await api.put(`/notifications/${id}/read`);
      setNotifications((current) => current.map((item) => (
        item.id === id ? { ...item, is_read: 1 } : item
      )));
    } catch (err) {
      toastError(err.response?.data?.error || 'Failed to mark notification as read');
    }
  };

  const visibleNotifications = notifications.filter((notification) => {
    if (filter === 'all') return true;
    if (filter === 'unread') return !notification.is_read;
    return notification.type === filter;
  });

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-gray-800">Notifications</h1>
          <p className="text-sm text-gray-500 mt-1">Staff-visible alerts for duplicate UTR attempts, deposits, withdrawals, and other system events.</p>
        </div>
        <button
          onClick={loadNotifications}
          className="px-4 py-2 bg-primary-600 text-white text-sm font-medium hover:bg-primary-700"
        >
          Refresh
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        {['all', 'unread', 'system', 'deposit', 'withdraw', 'win'].map((item) => (
          <button
            key={item}
            onClick={() => setFilter(item)}
            className={`px-4 py-2 text-sm font-medium capitalize ${filter === item ? 'bg-primary-600 text-white' : 'bg-white border text-gray-600 hover:bg-gray-50'}`}
          >
            {item}
          </button>
        ))}
      </div>

      <div className="space-y-3">
        {visibleNotifications.map((notification) => (
          <div key={notification.id} className={`border p-5 ${getNotificationTone(notification)}`}>
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <span className="px-2 py-1 text-xs font-medium bg-white/80 border border-gray-200 uppercase tracking-wide text-gray-600">
                    {notification.type}
                  </span>
                  {!notification.is_read && (
                    <span className="px-2 py-1 text-xs font-medium bg-amber-100 text-amber-700">
                      Unread
                    </span>
                  )}
                </div>
                <p className="text-sm font-medium text-gray-800 leading-6">{notification.message}</p>
                <p className="text-xs text-gray-500 mt-2">{new Date(notification.created_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}</p>
              </div>

              {!notification.is_read && (
                <button
                  onClick={() => markRead(notification.id)}
                  className="px-3 py-2 bg-white border text-sm text-gray-700 hover:bg-gray-50"
                >
                  Mark read
                </button>
              )}
            </div>
          </div>
        ))}

        {visibleNotifications.length === 0 && (
          <div className="bg-white border p-10 text-center text-gray-400">
            {loading ? 'Loading notifications...' : 'No notifications match this filter.'}
          </div>
        )}
      </div>
      <ToastContainer toasts={toasts} dismiss={dismiss} />
    </div>
  );
}