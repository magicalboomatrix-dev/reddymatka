import axios from 'axios';

export const API_BASE = import.meta.env.VITE_API_URL || '/api';

const BACKEND_BASE = API_BASE.replace(/\/api\/?$/, '');

export function buildUploadUrl(fileName) {
  if (!fileName) {
    return '';
  }

  const normalizedPath = fileName.startsWith('/') ? fileName : `/uploads/${fileName}`;
  return `${BACKEND_BASE}${normalizedPath}`;
}

const api = axios.create({
  baseURL: API_BASE,
  headers: { 'Content-Type': 'application/json' },
  withCredentials: true, // send HttpOnly auth cookie automatically
});

// Authentication is handled exclusively via the HttpOnly cookie sent by
// withCredentials:true above. No localStorage token read to avoid XSS exposure.

// Handle 401 responses
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('admin_token');
      localStorage.removeItem('admin_user');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export default api;
