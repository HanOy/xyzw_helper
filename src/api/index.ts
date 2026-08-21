import axios from 'axios';

export const TOKEN_KEY = 'xyzw.auth.token';

export function getStoredToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setStoredToken(token: string | null): void {
  if (token === null) {
    localStorage.removeItem(TOKEN_KEY);
  } else {
    localStorage.setItem(TOKEN_KEY, token);
  }
}

export const request = axios.create({
  baseURL: '/api',
  timeout: 15000,
  headers: { 'Content-Type': 'application/json' },
});

request.interceptors.request.use((config) => {
  const t = getStoredToken();
  if (t) config.headers.Authorization = `Bearer ${t}`;
  return config;
});

request.interceptors.response.use(
  (resp) => {
    const data = resp.data;
    if (data && typeof data === 'object' && 'success' in data) {
      if (data.success) return data;
      return Promise.reject(data);
    }
    return { success: true, data, message: 'success' };
  },
  (error) => {
    if (error.response?.status === 401) {
      setStoredToken(null);
      if (typeof window !== 'undefined' && window.location.pathname !== '/login') {
        window.location.href = '/login';
      }
    }
    const msg =
      error.response?.data?.message ?? error.message ?? '请求失败';
    return Promise.reject({ success: false, message: msg });
  },
);

export interface ApiToken {
  id: string;
  name: string;
  server: string | null;
  remark: string | null;
  avatar: string | null;
  importMethod: string | null;
  sourceUrl: string | null;
  wsUrl: string | null;
  upgraded: boolean;
  upgradedAt: string | null;
  createdAt: string;
  updatedAt: string;
  status?: 'connecting' | 'connected' | 'disconnected' | 'error';
}

export const api = {
  auth: {
    login: (password: string) => request.post('/auth/login', { password }),
    me: () => request.get('/auth/me'),
  },
  tokens: {
    list: () => request.get('/tokens'),
    create: (payload: unknown) => request.post('/tokens', payload),
    get: (id: string) => request.get(`/tokens/${id}`),
    update: (id: string, patch: unknown) => request.patch(`/tokens/${id}`, patch),
    delete: (id: string) => request.delete(`/tokens/${id}`),
    refresh: (id: string) => request.post(`/tokens/${id}/refresh`),
    connect: (id: string) => request.post(`/tokens/${id}/connect`),
    disconnect: (id: string) => request.post(`/tokens/${id}/disconnect`),
    status: (id: string) => request.get(`/tokens/${id}/status`),
    cache: (id: string) => request.get(`/tokens/${id}/cache`),
    command: (id: string, cmd: string, params: unknown, timeoutMs?: number) =>
      request.post(`/tokens/${id}/command`, { cmd, params, timeoutMs }),
    serverList: (id: string) => request.post(`/tokens/${id}/serverlist`),
    dailyTask: (id: string, settings?: unknown) =>
      request.post(`/tokens/${id}/tasks/daily`, { settings }),
  },
  tasks: {
    get: (runId: string) => request.get(`/tasks/${runId}`),
    cancel: (runId: string) => request.post(`/tasks/${runId}/cancel`),
    list: (tokenId?: string) =>
      request.get('/tasks', { params: tokenId ? { tokenId } : {} }),
  },
  batch: {
    daily: (tokenIds: string[], settings?: unknown) =>
      request.post('/batch/daily-tasks', { tokenIds, settings }),
    stop: (batchId: string) => request.post(`/batch/${batchId}/stop`),
  },
  logs: {
    list: (params: { tokenId?: string; runId?: string; page?: number; limit?: number } = {}) =>
      request.get('/logs', { params }),
  },
  weixin: {
    login: (code: string) => request.post('/weixin/login', { code }),
  },
  scheduled: {
    list: () => request.get('/scheduled-tasks'),
    create: (payload: unknown) => request.post('/scheduled-tasks', payload),
    get: (id: string) => request.get(`/scheduled-tasks/${id}`),
    update: (id: string, payload: unknown) => request.put(`/scheduled-tasks/${id}`, payload),
    remove: (id: string) => request.delete(`/scheduled-tasks/${id}`),
    toggle: (id: string, enabled: boolean) =>
      request.post(`/scheduled-tasks/${id}/toggle`, { enabled }),
    run: (id: string) => request.post(`/scheduled-tasks/${id}/run`),
  },
  settings: {
    get: (key: string) => request.get(`/settings/${encodeURIComponent(key)}`),
    list: (prefix?: string) =>
      request.get('/settings', { params: prefix ? { prefix } : {} }),
    set: (key: string, value: unknown) =>
      request.put(`/settings/${encodeURIComponent(key)}`, { value }),
    remove: (key: string) => request.delete(`/settings/${encodeURIComponent(key)}`),
  },
};

export default api;