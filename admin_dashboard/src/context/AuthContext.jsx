import { createContext, useContext, useState, useEffect } from 'react';
import api from '../utils/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Verify the actual server session (HttpOnly cookie) on every mount.
    // This prevents stale localStorage data from granting access when the
    // cookie has expired, been replaced by a user-role token, or been cleared.
    api.get('/auth/me')
      .then((res) => {
        const u = res.data.user;
        if (u.role === 'admin' || u.role === 'moderator') {
          localStorage.setItem('admin_user', JSON.stringify(u));
          setUser(u);
        } else {
          // Cookie belongs to a regular user — force re-login
          localStorage.removeItem('admin_user');
          setUser(null);
        }
      })
      .catch(() => {
        // 401/403 or network error — clear any stale state
        localStorage.removeItem('admin_user');
        setUser(null);
      })
      .finally(() => setLoading(false));
  }, []);

  const login = async (phone, password) => {
    const res = await api.post('/auth/admin-login', { phone, password });
    // Token is stored in HttpOnly cookie by the server — only user info saved locally
    localStorage.setItem('admin_user', JSON.stringify(res.data.user));
    setUser(res.data.user);
    return res.data;
  };

  const logout = async () => {
    try { await api.post('/auth/logout'); } catch { /* no-op */ }
    localStorage.removeItem('admin_user');
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, login, logout, loading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}
