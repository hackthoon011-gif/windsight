

/**
 * API client for the WindSight FastAPI backend.
 * Set VITE_API_BASE_URL in .env.local to configure the backend URL.
 */

export const API_BASE_URL: string | undefined =
  (import.meta.env['VITE_API_BASE_URL'] as string | undefined)?.replace(/\/+$/, "") || undefined;

export function isApiConfigured(): boolean {
  return Boolean(API_BASE_URL);
}

export async function apiGet<T>(path: string, init?: RequestInit): Promise<T> {
  if (!API_BASE_URL) {
    throw new Error("VITE_API_BASE_URL is not set; backend is not connected yet.");
  }
  const res = await fetch(`${API_BASE_URL}${path.startsWith("/") ? path : `/${path}`}`, {
    ...init,
    headers: { Accept: "application/json", ...(init?.headers ?? {}) },
  });
  if (!res.ok) throw new Error(`API request failed: ${res.status} ${res.statusText}`);
  return (await res.json()) as T;
}
