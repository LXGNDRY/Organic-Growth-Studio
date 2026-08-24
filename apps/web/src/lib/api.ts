const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";

function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("access_token");
}

function setTokens(a: string, r: string) {
  localStorage.setItem("access_token", a);
  localStorage.setItem("refresh_token", r);
}

export function clearAuthTokens() {
  localStorage.removeItem("access_token");
  localStorage.removeItem("refresh_token");
}

export async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const url = `${API_BASE_URL}${path}`;
  const token = getToken();
  const headers: Record<string, string> = { "Content-Type": "application/json", ...(options.headers as Record<string, string>) };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const res = await fetch(url, { ...options, headers });
  if (res.status === 401) { clearAuthTokens(); if (typeof window !== "undefined") window.location.href = "/auth/signin"; throw new Error("Unauthorized"); }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error?.message || "Request failed");
  return data as T;
}

export async function signIn(data: { email: string; password: string }) {
  const res = await apiFetch<{ user: any; tokens: { access_token: string; refresh_token: string }; tenant: any }>("/auth/signin", { method: "POST", body: JSON.stringify(data) });
  setTokens(res.tokens.access_token, res.tokens.refresh_token);
  return res;
}

export async function signUp(data: any) {
  const res = await apiFetch<{ user: any; tokens: { access_token: string; refresh_token: string }; tenant: any }>("/auth/signup", { method: "POST", body: JSON.stringify(data) });
  setTokens(res.tokens.access_token, res.tokens.refresh_token);
  return res;
}

export async function signOut(refreshToken: string) {
  try { await apiFetch("/auth/logout", { method: "POST", body: JSON.stringify({ refresh_token: refreshToken }) }); }
  finally { clearAuthTokens(); }
}

export async function getAccounts() { const r = await apiFetch<{ data: any[] }>("/accounts"); return r.data; }
export async function getConnectUrl() { const r = await apiFetch<{ data: { auth_url: string } }>("/accounts/connect/url"); return r.data; }
export async function pauseAccount(id: string) { const r = await apiFetch<{ data: any }>(`/accounts/${id}/pause`, { method: "POST" }); return r.data; }
export async function resumeAccount(id: string) { const r = await apiFetch<{ data: any }>(`/accounts/${id}/resume`, { method: "POST" }); return r.data; }
export async function getTargetingConfig(id: string) { const r = await apiFetch<{ data: any }>(`/targeting/${id}`); return r.data; }
export async function updateTargetingConfig(id: string, data: any) { const r = await apiFetch<{ data: any }>(`/targeting/${id}`, { method: "PUT", body: JSON.stringify(data) }); return r.data; }
export async function getEngagementActions(id: string, params?: Record<string, any>) {
  const q = new URLSearchParams(params).toString();
  const r = await apiFetch<{ data: { items: any[]; total: number; has_more: boolean } }>(`/engagements/${id}/actions${q ? `?${q}` : ""}`);
  return r.data;
}
export async function getEngagementStats(id: string, period = "day") { const r = await apiFetch<{ data: any }>(`/engagements/${id}/stats?period=${period}`); return r.data; }
export async function getSubscription() { const r = await apiFetch<{ data: any }>("/billing/subscription"); return r.data; }
export async function createPortalSession(returnUrl: string) { const r = await apiFetch<{ data: { url: string } }>("/billing/portal", { method: "POST", body: JSON.stringify({ return_url: returnUrl }) }); return r.data; }
