import axios from 'axios';

export const API_BASE = import.meta.env.VITE_API_URL || '/api';

const BACKEND_BASE = API_BASE.replace(/\/api\/?$/, '');

export function buildUploadUrl(fileName) {
  if (!fileName) {
    return '';
  }

  const normalizedPath = fileName.startsWith('/') ? fileName : `/uploads/${fileName}`;
  let baseUrl = BACKEND_BASE;
  if (baseUrl && !baseUrl.startsWith('http') && !baseUrl.startsWith('//') && !baseUrl.startsWith('/')) {
    baseUrl = `https://${baseUrl}`;
  }
  return `${baseUrl}${normalizedPath}`;
}

const api = axios.create({
  baseURL: API_BASE,
  headers: { 'Content-Type': 'application/json' },
  withCredentials: true, // send HttpOnly auth cookie automatically
});

// Authentication is handled exclusively via the HttpOnly cookie sent by
// withCredentials:true above. No localStorage token read to avoid XSS exposure.

// Handle 401 responses — but only redirect when NOT already on the login page
// to avoid an infinite refresh loop (e.g. the /auth/me session-check on mount
// returns 401 before the user has logged in).
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (
      error.response?.status === 401 &&
      window.location.pathname !== '/login'
    ) {
      localStorage.removeItem('admin_token');
      localStorage.removeItem('admin_user');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export default api;
