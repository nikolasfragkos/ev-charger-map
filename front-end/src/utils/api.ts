// utils/api.ts
import type { CarApi } from "../types/ownership";

function getBaseUrl() {
  const rawBaseUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:9876/api/v1";
  const baseUrl = rawBaseUrl.replace(/\/$/, "");

  if (baseUrl.startsWith("http://localhost:4000")) {
    return "http://localhost:9876/api/v1";
  }

  return baseUrl;
}

async function parseJsonSafe(res: Response) {
  const text = await res.text().catch(() => "");
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return { raw: text };
  }
}

function getErrorMessage(body: unknown, fallback: string) {
  if (!body) return fallback;
  if (typeof body === "string" && body.trim().length > 0) return body.trim();
  if (typeof body === "object" && body !== null) {
    const maybeMsg =
      (body as { error?: unknown; message?: unknown }).error ??
      (body as { message?: unknown }).message;
    if (typeof maybeMsg === "string" && maybeMsg.trim().length > 0) return maybeMsg.trim();
  }
  return fallback;
}

/** ---------------------------
 *  Auth token utilities
 *  --------------------------*/

export class AuthError extends Error {
  name = "AuthError";
}

export const AUTH_CHANGED_EVENT = "auth-changed";
export const AUTH_TOKEN_KEY = "authToken";

/**
 * Reads token from sessionStorage first (non-remember),
 * then localStorage (remember me).
 */
export function getAuthToken(): string | null {
  if (typeof window === "undefined") return null;

  const sessionToken = window.sessionStorage.getItem(AUTH_TOKEN_KEY);
  if (sessionToken && sessionToken.trim().length > 0) return sessionToken;

  const localToken = window.localStorage.getItem(AUTH_TOKEN_KEY);
  if (localToken && localToken.trim().length > 0) return localToken;

  return null;
}

export function isLoggedIn(): boolean {
  return !!getAuthToken();
}

/**
 * Store token consistently with SignInScreen behavior.
 */
export function setAuthToken(token: string, rememberMe: boolean) {
  if (typeof window === "undefined") return;

  const storage = rememberMe ? window.localStorage : window.sessionStorage;
  const other = rememberMe ? window.sessionStorage : window.localStorage;

  storage.setItem(AUTH_TOKEN_KEY, token);
  other.removeItem(AUTH_TOKEN_KEY);

  window.dispatchEvent(new Event(AUTH_CHANGED_EVENT));
}

export function clearAuthToken() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(AUTH_TOKEN_KEY);
  window.sessionStorage.removeItem(AUTH_TOKEN_KEY);
  window.dispatchEvent(new Event(AUTH_CHANGED_EVENT));
}

/** ---------------------------
 *  Internal fetch helper (supports auth)
 *  --------------------------*/

async function fetchJson(path: string, init?: RequestInit & { auth?: boolean }) {
  const baseUrl = getBaseUrl();
  const auth = init?.auth ?? false;

  const headers: Record<string, string> = {
    ...(init?.headers as Record<string, string> | undefined),
    Accept: "application/json",
  };

  if (auth) {
    const token = getAuthToken();
    if (!token) throw new AuthError("You must be signed in to do that.");
    headers.Authorization = `Bearer ${token}`;
  }

  const res = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers,
    cache: "no-store",
  });

  if (!res.ok) {
    if (res.status === 401) {
      throw new AuthError("Your session expired. Please sign in again.");
    }
    const body = await parseJsonSafe(res);
    const message = getErrorMessage(body, `API request failed (${res.status})`);
    throw new Error(message);
  }

  return res.json();
}

/** ---------------------------
 *  Public (no-auth) endpoints
 *  --------------------------*/

export async function fetchChargers() {
  // Attach token if present so backend can mark `reserved_by_me`
  const token = getAuthToken();
  const headers: Record<string, string> = { Accept: "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;

  const baseUrl = getBaseUrl();
  const res = await fetch(`${baseUrl}/points`, { cache: "no-store", headers });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`API Error: ${res.status} ${text}`);
  }

  return res.json();
}

export async function signIn(credentials: { email: string; password: string }) {
  const baseUrl = getBaseUrl();
  const res = await fetch(`${baseUrl}/auth/signin`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(credentials),
    cache: "no-store",
  });

  if (!res.ok) {
    const body = await parseJsonSafe(res);
    const message = getErrorMessage(body, `Sign-in failed (${res.status})`);
    throw new Error(message);
  }

  const data = (await res.json()) as { token?: string };
  if (!data.token || typeof data.token !== "string") {
    throw new Error("Sign-in succeeded but token is missing in the response");
  }

  return data; // { token }
}

export async function signUp(payload: { email: string; password: string; firstName?: string; lastName?: string; phone?: string }) {
  const baseUrl = getBaseUrl();
  const res = await fetch(`${baseUrl}/auth/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    cache: "no-store",
  });

  if (!res.ok) {
    const body = await parseJsonSafe(res);
    const message = getErrorMessage(body, `Sign-up failed (${res.status})`);
    throw new Error(message);
  }

  return res.json();
}

/** ---------------------------
 *  Reservation endpoints (auth)
 *  --------------------------*/

export async function reserveCharger(chargerId: string, minutes?: number) {
  const token = getAuthToken();
  if (!token) throw new AuthError("You must be signed in to reserve a charger.");

  const baseUrl = getBaseUrl();
  const endpoint = minutes
    ? `${baseUrl}/reserve/${chargerId}/${minutes}`
    : `${baseUrl}/reserve/${chargerId}`;

  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    cache: "no-store",
  });

  if (!res.ok) {
    const body = await parseJsonSafe(res);
    const message = getErrorMessage(body, `Reservation failed (${res.status})`);
    throw new Error(message);
  }

  return res.json();
}

export async function cancelReservation(chargerId: string) {
  const token = getAuthToken();
  if (!token) throw new AuthError("You must be signed in to cancel a reservation.");

  return fetchJson(`/reserve/${chargerId}/cancel`, {
    method: "POST",
    auth: true,
  });
}

export async function fetchCharger(id: string) {
  // include auth if present so you can see reservationendtime if backend restricts it
  const token = getAuthToken();
  const headers: Record<string, string> = { Accept: "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;

  const baseUrl = getBaseUrl();
  const res = await fetch(`${baseUrl}/points/${id}`, { cache: "no-store", headers });

  if (!res.ok) {
    const body = await parseJsonSafe(res);
    const message = getErrorMessage(body, `Failed to fetch charger (${res.status})`);
    throw new Error(message);
  }

  return res.json();
}

/** ---------------------------
 * Authenticated endpoints
 * --------------------------*/

export async function fetchCarOwnerships() {
  // adjust if your backend is /api/v1/car-ownership etc.
  return fetchJson(`/car-ownership`, { auth: true });
}

export async function searchCars(query: string): Promise<CarApi[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const params = new URLSearchParams({ q: trimmed });
  const result = await fetchJson(`/cars/search?${params.toString()}`);
  return result as CarApi[];
}

export async function createCarOwnership(carId: number, color: string) {
  return fetchJson(`/car-ownership/${carId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ color }),
    auth: true,
  });
}

export async function deleteCarOwnership(ownershipId: number) {
  return fetchJson(`/car-ownership/${ownershipId}`, {
    method: "DELETE",
    auth: true,
  });
}

export async function fetchPaymentMethods() {
  return fetchJson(`/me/payment-methods`, { auth: true });
}

export async function deletePaymentMethod(methodId: number) {
  return fetchJson(`/me/payment-methods/${methodId}`, {
    method: "DELETE",
    auth: true,
  });
}

export async function fetchUserProfile() {
  return fetchJson(`/me`, { auth: true });
}

export async function updateUserProfile(data: {
  email?: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  address?: string;
  city?: string;
  state?: string;
  zipCode?: string;
  preferences?: Record<string, unknown>;
}) {
  return fetchJson(`/me`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
    auth: true,
  });
}

export async function fetchBillingHistory() {
  return fetchJson(`/payments/history`, { auth: true });
}

export async function createPaymentSetupIntent() {
  return fetchJson(`/payments/create-setup-intent`, {
    method: "POST",
    auth: true,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
}

export async function savePaymentMethodToken(paymentMethodId: string) {
  return fetchJson(`/payments/save-method`, {
    method: "POST",
    auth: true,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ paymentMethodId }),
  });
}

export async function runMockCharge(payload?: {
  chargerId?: number;
  amountEur?: number;
  kWh?: number;
  durationMinutes?: number;
}) {
  return fetchJson(`/mock/session`, {
    method: "POST",
    auth: true,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload ?? {}),
  });
}

/** ---------------------------
 *  Charging session endpoints
 *  --------------------------*/

export async function startCharging(reservationId: number, battery?: { batteryCapacityKWh: number; currentBatteryLevel: number }) {
  return fetchJson(`/charging/start`, {
    method: "POST",
    auth: true,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ reservationId, ...battery }),
  });
}

export async function stopCharging(sessionId: number) {
  return fetchJson(`/charging/stop`, {
    method: "POST",
    auth: true,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sessionId }),
  });
}

export async function getChargingStatus(sessionId: number) {
  return fetchJson(`/charging/status/${sessionId}`, { auth: true });
}

export async function getActiveSession() {
  return fetchJson(`/charging/active`, { auth: true });
}