const API_BASE = process.env.NEXT_PUBLIC_API_URL || '/api';

function getToken() {
  if (typeof window !== 'undefined') {
    return localStorage.getItem('token');
  }
  return null;
}

async function request(endpoint, options = {}) {
  const token = getToken();
  const headers = { ...options.headers };

  if (!(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }

  if (token && !headers['Authorization']) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers,
  });

  const data = await res.json();

  if (!res.ok) {
    if (res.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/login')) {
        window.location.href = '/login';
      }
    }
    throw new Error(data.error || 'Request failed');
  }

  return data;
}

// Auth
export const authAPI = {
  checkUser: (phone) => request('/auth/check-user', { method: 'POST', body: JSON.stringify({ phone }) }),
  sendOTP: (phone, purpose) => request('/auth/send-otp', { method: 'POST', body: JSON.stringify({ phone, purpose }) }),
  verifyOTP: (phone, otp, purpose) => request('/auth/verify-otp', { method: 'POST', body: JSON.stringify({ phone, otp, purpose }) }),
  completeProfile: (name, referralCode, mpin, tempToken) => request('/auth/complete-profile', {
    method: 'POST',
    body: JSON.stringify({ name, referralCode, mpin }),
    headers: { 'Authorization': `Bearer ${tempToken}` },
  }),
  setMpin: (mpin) => request('/auth/set-mpin', { method: 'POST', body: JSON.stringify({ mpin }) }),
  resetMpin: (mpin, tempToken) => request('/auth/reset-mpin', {
    method: 'POST',
    body: JSON.stringify({ mpin }),
    headers: { 'Authorization': `Bearer ${tempToken}` },
  }),
  loginMpin: (phone, mpin) => request('/auth/login-mpin', { method: 'POST', body: JSON.stringify({ phone, mpin }) }),
};

// User
export const userAPI = {
  getProfile: () => request('/users/profile'),
  getBankAccounts: () => request('/users/bank-accounts'),
  addBankAccount: (data) => request('/users/bank-accounts', { method: 'POST', body: JSON.stringify(data) }),
  updateBankAccount: (id, data) => request(`/users/bank-accounts/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  setDefaultBankAccount: (id) => request(`/users/bank-accounts/${id}/default`, { method: 'PUT' }),
  deleteBankAccount: (id) => request(`/users/bank-accounts/${id}`, { method: 'DELETE' }),
  getAccountStatement: (params) => request(`/users/account-statement?${new URLSearchParams(params)}`),
  getProfitLoss: (params) => request(`/users/profit-loss?${new URLSearchParams(params)}`),
  getUiConfig: () => request('/users/ui-config'),
};

export const bankAccountAPI = {
  list: () => request('/bank-accounts'),
  create: (data) => request('/bank-accounts', { method: 'POST', body: JSON.stringify(data) }),
  update: (id, data) => request(`/bank-accounts/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  setDefault: (id) => request(`/bank-accounts/${id}/default`, { method: 'PUT' }),
  remove: (id) => request(`/bank-accounts/${id}`, { method: 'DELETE' }),
};

// Wallet
export const walletAPI = {
  getInfo: () => request('/wallet/info'),
};

// Games
export const gameAPI = {
  list: () => request('/games'),
  getInfo: (id) => request(`/games/${id}`),
};

// Bets
export const betAPI = {
  place: (data) => request('/bets/place', { method: 'POST', body: JSON.stringify(data) }),
  myBets: (params) => request(`/bets/my-bets?${new URLSearchParams(params)}`),
  history: (params) => request(`/bets/history?${new URLSearchParams(params)}`),
  recentWinners: (params = {}) => request(`/bets/recent-winners?${new URLSearchParams(params)}`),
};

// Deposits (read-only history)
export const depositAPI = {
  history: (params) => request(`/deposits/history?${new URLSearchParams(params)}`),
};

// Auto Deposits (UPI auto-detection)
export const autoDepositAPI = {
  createOrder: (amount) => request('/auto-deposit/order', { method: 'POST', body: JSON.stringify({ amount }) }),
  getOrderStatus: (id) => request(`/auto-deposit/order/status/${id}`),
  getMyOrders: (params) => request(`/auto-deposit/orders?${new URLSearchParams(params)}`),
  cancelOrder: (id) => request(`/auto-deposit/order/${id}/cancel`, { method: 'POST' }),
};

// Withdrawals
export const withdrawAPI = {
  request: (data) => request('/withdraw/request', { method: 'POST', body: JSON.stringify(data) }),
  history: (params) => request(`/withdraw/history?${new URLSearchParams(params)}`),
};

// Bonus
export const bonusAPI = {
  history: () => request('/bonus/history'),
  referrals: () => request('/bonus/referrals'),
  rules: () => request('/bonus/rules'),
};

// Results
export const resultAPI = {
  monthly: (params) => request(`/results/monthly?${new URLSearchParams(params)}`),
  yearly: (params) => request(`/results/yearly?${new URLSearchParams(params)}`),
  live: () => request('/results/live'),
};

// Custom Ads
export const customAdsAPI = {
  list: () => request('/custom-ads'),
};

// Notifications
export const notificationAPI = {
  recent: () => request('/notifications/recent'),
  my: () => request('/notifications/my'),
  markRead: (id) => request(`/notifications/${id}/read`, { method: 'PUT' }),
};
