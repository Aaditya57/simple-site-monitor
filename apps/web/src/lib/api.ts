import axios, { AxiosError } from "axios";
import { useAuthStore } from "./authStore";

const api = axios.create({ withCredentials: true });

// Attach access token to every request
api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().accessToken;
  if (token) {
    config.headers["Authorization"] = `Bearer ${token}`;
  }
  return config;
});

// On 401, try to refresh; retry once
let isRefreshing = false;
let refreshQueue: Array<(token: string | null) => void> = [];

api.interceptors.response.use(
  (res) => res,
  async (error: AxiosError) => {
    const original = error.config as typeof error.config & { _retry?: boolean };

    if (error.response?.status === 401 && !original?._retry) {
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          refreshQueue.push((token) => {
            if (token && original) {
              original.headers!["Authorization"] = `Bearer ${token}`;
              resolve(api(original));
            } else {
              reject(error);
            }
          });
        });
      }

      isRefreshing = true;
      original!._retry = true;

      try {
        const resp = await axios.post<{ accessToken: string; user: User }>(
          "/api/auth/refresh",
          {},
          { withCredentials: true }
        );
        const { accessToken, user } = resp.data;
        useAuthStore.getState().setAuth(user, accessToken);
        refreshQueue.forEach((cb) => cb(accessToken));
        refreshQueue = [];
        original!.headers!["Authorization"] = `Bearer ${accessToken}`;
        return api(original!);
      } catch {
        useAuthStore.getState().clearAuth();
        refreshQueue.forEach((cb) => cb(null));
        refreshQueue = [];
        window.location.href = "/login";
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(error);
  }
);

export default api;

// ── Types ─────────────────────────────────────────────────────────────────────
export interface User {
  id: string;
  email: string;
  fullName: string;
  role: string;
  status: string;
  emailVerified: boolean;
  createdAt: string;
}

export interface Monitor {
  id: string;
  userId: string;
  name: string;
  url: string;
  intervalMinutes: number;
  timeoutSeconds: number;
  expectedStatus: string;
  keyword: string | null;
  keywordCaseInsensitive: boolean;
  tlsCheckEnabled: boolean;
  tlsWarnDays: number;
  dnsCheckEnabled: boolean;
  additionalEmails: string[];
  isPaused: boolean;
  currentStatus: "UP" | "DOWN" | "UNKNOWN";
  lastCheckedAt: string | null;
  lastLatencyMs: number | null;
  lastStatusChangedAt: string | null;
  createdAt: string;
}

export interface MonitorCheck {
  id: string;
  monitorId: string;
  checkedAt: string;
  status: "UP" | "DOWN";
  httpStatusCode: number | null;
  latencyMs: number | null;
  errorType: string | null;
  errorMessage: string | null;
  tlsDaysRemaining: number | null;
  tlsCertCn: string | null;
  keywordMatch: boolean | null;
  dnsResolvedIp: string | null;
}

export interface MonitorInput {
  name: string;
  url: string;
  intervalMinutes: number;
  timeoutSeconds?: number;
  expectedStatus?: string;
  keyword?: string;
  keywordCaseInsensitive?: boolean;
  tlsCheckEnabled?: boolean;
  tlsWarnDays?: number;
  dnsCheckEnabled?: boolean;
  additionalEmails?: string[];
}

// ── API calls ─────────────────────────────────────────────────────────────────
export const monitorsApi = {
  list: () => api.get<Monitor[]>("/api/monitors").then((r) => r.data),
  get: (id: string) => api.get<Monitor>(`/api/monitors/${id}`).then((r) => r.data),
  create: (data: MonitorInput) => api.post<Monitor>("/api/monitors", data).then((r) => r.data),
  update: (id: string, data: Partial<MonitorInput>) =>
    api.put<Monitor>(`/api/monitors/${id}`, data).then((r) => r.data),
  delete: (id: string) => api.delete(`/api/monitors/${id}`).then((r) => r.data),
  pause: (id: string) => api.post(`/api/monitors/${id}/pause`).then((r) => r.data),
  resume: (id: string) => api.post(`/api/monitors/${id}/resume`).then((r) => r.data),
  checks: (id: string, limit = 100) =>
    api.get<MonitorCheck[]>(`/api/monitors/${id}/checks?limit=${limit}`).then((r) => r.data),
};

export const adminApi = {
  users: (status?: string) =>
    api.get<User[]>(`/api/admin/users${status ? `?status=${status}` : ""}`).then((r) => r.data),
  approve: (id: string) => api.post(`/api/admin/users/${id}/approve`).then((r) => r.data),
  reject: (id: string, reason?: string) =>
    api.post(`/api/admin/users/${id}/reject`, { reason }).then((r) => r.data),
  suspend: (id: string, reason?: string) =>
    api.post(`/api/admin/users/${id}/suspend`, { reason }).then((r) => r.data),
  monitors: () => api.get<Monitor[]>("/api/admin/monitors").then((r) => r.data),
  health: () => api.get("/api/admin/health").then((r) => r.data),
  auditLog: () => api.get("/api/admin/audit-log").then((r) => r.data),
};
