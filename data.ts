import { getSession, workerFetch } from "./api.ts";
import { mock, mockMode } from "./mock.ts";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Me {
  login: string;
  displayName: string;
  image: string | null;
  wallet: number;
  correctionPoints: number;
  level: number;
  grade: string | null;
  location: string | null;
  campusId: number | null;
  campusName: string | null;
  poolLabel: string | null;
  customAvatar: string | null;
  avatarBg: string;
  avatarPosX: number;
  avatarPosY: number;
  avatarScale: number;
}

export interface UpcomingEval {
  id: number;
  beginAt: string;
  state: "booked" | "revealed";
  project: string | null;
  slug: string | null;
}

export interface UpcomingResponse {
  items: UpcomingEval[];
  tracked: boolean;
}

export interface EvalStats {
  byMonth: Record<
    string,
    { total: number; failed: number; successPercentage: number | null }
  >;
  global: { total: number; failed: number; successPercentage: number | null };
}

export interface ProfileStats {
  roulette: {
    entries: {
      historic_id: number;
      sum: number;
      total: number;
      created_at: string;
    }[];
  };
  evalStats: EvalStats;
}

export interface Friend {
  login: string;
  displayName: string;
  avatar: string | null;
  customAvatar: string | null;
  avatarBg?: string;
  avatarPosX?: number;
  avatarPosY?: number;
  avatarScale?: number;
  level: number;
  grade: string | null;
  isOnline: boolean;
  lastSeen: string | null;
  poolLabel: string | null;
  wallet: number;
  correctionPoints: number;
  lastOnlineTimestamp: number | null;
}

export interface BlobSettings {
  settings: Record<string, unknown>;
  revision: string | null;
  discordId?: string | null;
  discordUsername?: string | null;
}

export interface SessionItem {
  id: string;
  label: string;
  name?: string;
  country?: string;
  createdAt: number;
  current: boolean;
}

// ---------------------------------------------------------------------------
// Fetchers
// ---------------------------------------------------------------------------

async function json<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await workerFetch(path, { cache: "no-store", ...init });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as T;
}

export const me = () =>
  mockMode ? Promise.resolve(mock.me) : json<Me>("/api/v1/private/me");

export const upcomingEvals = () =>
  mockMode
    ? Promise.resolve(mock.upcoming)
    : json<UpcomingResponse>("/api/v1/private/evaluations?action=upcoming");

export const profileStats = () => {
  if (mockMode) return Promise.resolve(mock.profileStats);
  const session = getSession();
  if (!session) throw new Error("not_authenticated");
  return json<ProfileStats>(
    `/api/v1/private/profile-stats?target=${encodeURIComponent(session.login)}`,
  );
};

export async function friendsData(logins: string[]): Promise<Friend[]> {
  if (mockMode) return Promise.resolve(mock.friends);
  if (logins.length === 0) return [];
  const res = await workerFetch(
    `/api/v1/private/friends/data?logins=${encodeURIComponent(logins.join(","))}`,
    { cache: "no-store" },
  );
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = (await res.json()) as { friends?: Friend[] };
  return data.friends ?? [];
}

export const getBlob = () =>
  mockMode
    ? Promise.resolve(mock.blob)
    : json<BlobSettings>("/api/v1/private/settings");

/** Patches the cloud settings blob. Throws "conflict" on 409. */
export async function updateBlob(
  patch: Record<string, unknown>,
): Promise<void> {
  if (mockMode) return;
  const blob = await getBlob();
  const res = await workerFetch("/api/v1/private/settings", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ settings: patch, baseRevision: blob.revision }),
  });
  if (res.status === 409) throw new Error("conflict");
  if (!res.ok) throw new Error("HTTP " + res.status);
}

export const sessionsList = () =>
  mockMode
    ? Promise.resolve(mock.sessions)
    : json<{ sessions: SessionItem[]; max: number }>(
        "/api/v1/private/sessions",
      );

export async function revokeSession(id: string): Promise<void> {
  if (mockMode) return;
  const res = await workerFetch(
    `/api/v1/private/sessions?id=${encodeURIComponent(id)}`,
    { method: "DELETE" },
  );
  if (!res.ok) throw new Error("HTTP " + res.status);
}

/** Logs out the current PWA session server-side. */
export async function logout(): Promise<void> {
  if (mockMode) return;
  const res = await workerFetch("/api/v1/private/settings", {
    method: "DELETE",
  });
  if (!res.ok) throw new Error("HTTP " + res.status);
}

export interface CalendarEvent {
  id: number | null;
  name: string;
  beginAt: string;
  endAt: string;
  location: string | null;
  url: string | null;
}

export const events = () =>
  mockMode
    ? Promise.resolve(mock.events)
    : json<{ events: CalendarEvent[] }>("/api/v1/private/events").then(
        (d) => d.events,
      );

export interface StudentEntry {
  login: string;
  displayname: string;
  image_url: string;
  begin_at?: string | null;
  blackholed_at?: string | null;
  active?: boolean;
  alumni?: boolean;
  pool_month?: string | null;
  pool_year?: string | null;
  alumnized_at?: string;
  level?: number;
  correction_point?: number;
  wallet?: number;
}

export interface Intake {
  month: number;
  year: number;
  label: string;
}

export interface StudentsPageResponse {
  cached_at?: number;
  total?: number;
  active?: number;
  filtered?: number;
  offset?: number;
  limit?: number;
  options?: { intakes: Intake[]; poolYears: number[] };
  data?: StudentEntry[];
}

export interface StudentsPageParams {
  offset: number;
  limit: number;
  sort: "name" | "date";
  dir: "asc" | "desc";
  filter: "none" | "blackhole" | "alumni" | "freeze";
  poolIntake: Intake | null;
  poolYear: number | null;
  query: string;
}

export async function studentsPage(
  params: StudentsPageParams,
): Promise<StudentsPageResponse> {
  if (mockMode) return mock.studentsPage(params.offset);
  const search = new URLSearchParams({
    limit: String(params.limit),
    offset: String(params.offset),
    sort: params.sort,
    dir: params.dir,
    filter: params.filter,
  });
  if (params.poolIntake) {
    search.set("pool_month", String(params.poolIntake.month));
    search.set("pool_year", String(params.poolIntake.year));
  } else if (params.poolYear != null) {
    search.set("pool_year", String(params.poolYear));
  }
  if (params.query.trim()) search.set("q", params.query.trim());
  const res = await workerFetch(`/api/v1/students?${search.toString()}`);
  if (!res.ok) throw new Error("HTTP " + res.status);
  return (await res.json()) as StudentsPageResponse;
}
