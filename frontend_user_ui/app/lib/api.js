const API_BASE = process.env.NEXT_PUBLIC_API_URL || '/api';

function buildQuery(params = {}) {
  const searchParams = new URLSearchParams();

  Object.entries(params || {}).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') {
      return;
    }
    searchParams.append(key, value);
  });

  const queryString = searchParams.toString();
  return queryString ? `?${queryString}` : '';
}

async function request(endpoint, options = {}) {
  const headers = { ...options.headers };

  if (!(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }

  // Authentication is handled exclusively via the HttpOnly `token` cookie
  // sent automatically by credentials:'include'. No localStorage token read.

  const res = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers,
    credentials: 'include', // always send HttpOnly cookie
  });

  const data = await res.json();

  if (!res.ok) {
    if (res.status === 401) {
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
  getAccountStatement: (params) => request(`/users/account-statement${buildQuery(params)}`),
  getProfitLoss: (params) => request(`/users/profit-loss${buildQuery(params)}`),
  getUiConfig: () => request('/users/ui-config'),
};

export const bankAccountAPI = {
  list: () => request('/users/bank-accounts'),
  create: (data) => request('/users/bank-accounts', { method: 'POST', body: JSON.stringify(data) }),
  update: (id, data) => request(`/users/bank-accounts/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  setDefault: (id) => request(`/users/bank-accounts/${id}/default`, { method: 'PUT' }),
  remove: (id) => request(`/users/bank-accounts/${id}`, { method: 'DELETE' }),
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
  myBets: (params) => request(`/bets/my-bets${buildQuery(params)}`),
  recentWinners: (params = {}) => request(`/bets/recent-winners${buildQuery(params)}`),
};

// Auto Deposits (UPI auto-detection)
export const autoDepositAPI = {
  createOrder: (amount) => request('/auto-deposit/order', { method: 'POST', body: JSON.stringify({ amount }) }),
  getOrderStatus: (id) => request(`/auto-deposit/order/status/${id}`),
  getMyOrders: (params) => request(`/auto-deposit/orders${buildQuery(params)}`),
  cancelOrder: (id) => request(`/auto-deposit/order/${id}/cancel`, { method: 'POST' }),
};

// Withdrawals
export const withdrawAPI = {
  request: (data) => request('/withdraw/request', { method: 'POST', body: JSON.stringify(data) }),
  history: (params) => request(`/withdraw/history${buildQuery(params)}`),
};

// Bonus
export const bonusAPI = {
  referrals: () => request('/bonus/referrals'),
  rules: () => request('/bonus/rules'),
  claimDaily: () => request('/bonus/claim-daily', { method: 'POST' }),
};

// Results
export const resultAPI = {
  monthly: (params) => request(`/results/monthly${buildQuery(params)}`),
  yearly: (params) => request(`/results/yearly${buildQuery(params)}`),
  live: () => request('/results/live'),
};

// Custom Ads
export const customAdsAPI = {
  list: () => request('/custom-ads'),
};

// Notifications
export const notificationAPI = {
  my: () => request('/notifications/my'),
  markRead: (id) => request(`/notifications/${id}/read`, { method: 'PUT' }),
};
