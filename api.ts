import { hashLogin } from "./lib/crypto.ts";
import { mockMode } from "./mock.ts";
import { refresh } from "./refresh.ts";

export const WORKER_URL = "https://api.betterintra.com";

const TOKEN_KEY = "ft_pwa_token";
const LOGIN_KEY = "ft_pwa_login";

export interface Session {
  token: string;
  login: string;
}

export function getSession(): Session | null {
  if (mockMode) return { token: "mock", login: "mock.user" };
  try {
    const token = localStorage.getItem(TOKEN_KEY) || "";
    const login = localStorage.getItem(LOGIN_KEY) || "";
    return token && login ? { token, login } : null;
  } catch {
    return null;
  }
}

export function setSession(token: string, login: string): void {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(LOGIN_KEY, login);
}

export function clearSession(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(LOGIN_KEY);
  refresh();
}

/** Full-page OAuth entry point on the worker. */
export function loginUrl(): string {
  const redirect = `${location.origin}/`;
  return `${WORKER_URL}/login?redirect_uri=${encodeURIComponent(redirect)}`;
}

export async function exchangeCode(
  code: string,
): Promise<{ token: string; login: string }> {
  const res = await fetch(`${WORKER_URL}/api/v1/public/auth/exchange`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code }),
  });
  if (!res.ok) throw new Error("exchange_failed");
  return (await res.json()) as { token: string; login: string };
}

/**
 * Calls a worker route with the session bearer + hashed-login query param.
 * Throws `not_authenticated` when there is no local session.
 */
export async function workerFetch(
  path: string,
  init: RequestInit = {},
  withAuth = true,
): Promise<Response> {
  const headers = new Headers(init.headers);
  let url = `${WORKER_URL}${path}`;

  if (withAuth) {
    const session = getSession();
    if (!session) throw new Error("not_authenticated");
    headers.set("Authorization", `Bearer ${session.token}`);
    const hash = await hashLogin(session.login);
    url += `${path.includes("?") ? "&" : "?"}login=${encodeURIComponent(hash)}`;
  }

  return fetch(url, { ...init, headers });
}
