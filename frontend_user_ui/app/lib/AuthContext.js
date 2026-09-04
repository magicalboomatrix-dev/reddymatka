'use client'
import { createContext, useContext, useState, useEffect } from 'react';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Token is no longer stored in localStorage (HttpOnly cookie handles auth).
    // Only the user object is persisted for UI display.
    const savedUser = localStorage.getItem('user');
    let currentUser = null;
    if (savedUser) {
      try {
        currentUser = JSON.parse(savedUser);
        setUser(currentUser);
      } catch {
        localStorage.removeItem('user');
      }
    }
    setLoading(false);

    // Sync latest user profile with backend to keep is_18_plus and state up-to-date
    if (currentUser) {
      fetch(`${process.env.NEXT_PUBLIC_API_URL}/users/profile`, {
        credentials: 'include',
      })
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (data?.user) {
            setUser((prev) => {
              if (!prev) return data.user;
              const merged = { ...prev, ...data.user };
              localStorage.setItem('user', JSON.stringify(merged));
              return merged;
            });
          }
        })
        .catch(() => {});
    }
  }, []);

  function login(tokenVal, userVal) {
    // Keep token in React state only (NOT localStorage) to avoid XSS exposure
    localStorage.setItem('user', JSON.stringify(userVal));
    setToken(tokenVal);
    setUser(userVal);
  }

  function updateUser(updatedFields) {
    setUser((prev) => {
      const nextUser = { ...(prev || {}), ...updatedFields };
      localStorage.setItem('user', JSON.stringify(nextUser));
      return nextUser;
    });
  }

  async function logout() {
    try {
      await fetch(`${process.env.NEXT_PUBLIC_API_URL}/auth/logout`, {
        method: 'POST',
        credentials: 'include',
      });
    } catch { /* no-op */ }
    localStorage.removeItem('user');
    setToken(null);
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, token, loading, login, logout, updateUser, isLoggedIn: !!user }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
