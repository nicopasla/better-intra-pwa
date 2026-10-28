import { getSession, workerFetch } from "./api.ts";
import { mock, mockMode } from "./mock.ts";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface MeCursus {
  name: string | null;
  slug: string | null;
  kind: string | null;
  beginAt: string | null;
  endAt: string | null;
}

export interface MeProject {
  id: number | null;
  name: string;
  slug: string | null;
  occurrence: number;
}

export interface MeRecentProject extends MeProject {
  finalMark: number | null;
  validated: boolean;
  markedAt: string | null;
  outstanding: number;
}

export interface MeProjects {
  total: number;
  validated: number;
  failed: number;
  inProgress: number;
  active: MeProject[];
  recent: MeRecentProject[];
}

export interface MeAchievement {
  name: string;
  description: string;
  tier: string | null;
  kind: string | null;
  nbrOfSuccess: number | null;
  image: string | null;
}

export interface UserGroup {
  name: string;
  /** 42's own group colour, when it has one. */
  color: string | null;
}

export interface Me {
  login: string;
  displayName: string;
  usualFullName: string;
  image: string | null;
  kind: string | null;
  staff: boolean;
  alumni: boolean;
  active: boolean;
  memberSince: string | null;
  wallet: number;
  correctionPoints: number;
  level: number;
  grade: string | null;
  location: string | null;
  campusId: number | null;
  campusName: string | null;
  poolMonth: string | null;
  poolYear: string | null;
  poolLabel: string | null;
  groups: UserGroup[];
  cursus: MeCursus | null;
  blackholedAt: string | null;
  projects: MeProjects;
  achievements: MeAchievement[];
  achievementsCount: number;
  customAvatar: string | null;
  avatarBg: string;
  avatarShape?: "round" | "square";
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
  role: "evaluator" | "corrected";
  correcteds?: string[];
  corrector?: string | null;
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
  avatarShape?: "round" | "square";
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
}

export interface SessionItem {
  id: string;
  label: string;
  name?: string;
  country?: string;
  createdAt: number;
  lastUsedAt?: number;
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

export const profileStatsFor = (login: string) => {
  if (mockMode) return Promise.resolve(mock.profileStats);
  return json<ProfileStats>(
    `/api/v1/private/profile-stats?target=${encodeURIComponent(login)}`,
  );
};

export const profileStats = () => {
  if (mockMode) return Promise.resolve(mock.profileStats);
  const session = getSession();
  if (!session) throw new Error("not_authenticated");
  return profileStatsFor(session.login);
};

export interface UserLookup {
  login: string;
  displayName: string;
  avatar: string | null;
  level: number;
  grade: string | null;
  location: string | null;
}

/** Minimal 42 user lookup (name, avatar, level, location) for the eval dialog. */
export const userLookup = (login: string) =>
  mockMode
    ? Promise.resolve(mock.userLookup(login))
    : json<UserLookup>(
        `/api/v1/private/user?target=${encodeURIComponent(login)}`,
      );

export interface UserVisuals {
  profileColor: string | null;
  customAvatar: string | null;
  avatarBg: string;
  avatarShape?: "round" | "square";
  avatarPosX: number;
  avatarPosY: number;
  avatarScale: number;
  banner: string | null;
  bannerMode: string;
  bannerColor: string | null;
  background: string | null;
  backgroundMode: string;
  backgroundColor: string | null;
  /** Group-name → 42 colour, captured by the extension. */
  groupColors?: Record<string, string>;
}

/** The owner's LOGTIME_* preferences, so their calendar renders as they see it. */
export interface LogtimeSettings {
  goalHours: number;
  showAverage: boolean;
  showGoal: boolean;
  showTacos: boolean;
  showTotalTacos: boolean;
  showStreak: boolean;
  emoji: string;
  divisor: number;
  rate: number;
  maxEarnings: number;
  showDaysMode: "date" | "days" | "both";
  calendarColor: string;
  labelsColor: string;
  rainbowPalette: string;
  calendarView: "normal" | "compact" | "heatmap" | "carousel";
  fontScale: number;
  disableAnimations: boolean;
}

export interface UserRecentProject extends MeProject {
  finalMark: number | null;
  validated: boolean;
  markedAt: string | null;
}

export interface UserProjects {
  total: number;
  validated: number;
  failed: number;
  inProgress: number;
  active: MeProject[];
  recent: UserRecentProject[];
}

/** Full profile of any 42 user, as rendered by the PWA profile view. */
export interface UserProfile {
  login: string;
  displayName: string;
  usualFullName: string;
  avatar: string | null;
  kind: string | null;
  staff: boolean;
  alumni: boolean;
  active: boolean;
  memberSince: string | null;
  alumnizedAt: string | null;
  wallet: number;
  correctionPoints: number;
  level: number;
  grade: string | null;
  location: string | null;
  campusId: number | null;
  campusName: string | null;
  poolMonth: string | null;
  poolYear: string | null;
  poolLabel: string | null;
  groups: UserGroup[];
  cursus: MeCursus | null;
  blackholedAt: string | null;
  projects: UserProjects;
  visuals: UserVisuals;
  logtime: LogtimeSettings;
}

export const userProfile = (login: string) =>
  mockMode
    ? Promise.resolve(mock.userProfile(login))
    : json<UserProfile>(
        `/api/v1/private/profile?target=${encodeURIComponent(login)}`,
      );

export interface LogtimeHistory {
  days: Record<string, number>;
  /** Older months are still available: another call continues the sync. */
  partial?: boolean;
}

/**
 * Logtime (seconds per UTC day) collected by the worker from 42 locations.
 * `back=1` loads the most recent days first, so the calendar shows current
 * months immediately; older months stream in on demand.
 */
export const logtimeHistory = (login: string): Promise<LogtimeHistory> =>
  mockMode
    ? Promise.resolve({ days: mock.logtime(login).days })
    : json<LogtimeHistory>(
        `/api/v1/private/logtime/history?user=${encodeURIComponent(login)}&back=1`,
      );

/** Outstanding-corrector counts keyed by projects_user id. Triggers a sync. */
export async function outstandingIds(
  count: number,
): Promise<Record<number, number>> {
  if (mockMode) return mock.outstanding;
  const session = getSession();
  if (!session) return {};
  const res = await workerFetch(
    `/api/v1/private/outstanding?target=${encodeURIComponent(session.login)}&count=${count}`,
    { cache: "no-store" },
  );
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = (await res.json()) as { ids?: Record<string, number> };
  const ids: Record<number, number> = {};
  for (const [k, v] of Object.entries(data.ids ?? {})) ids[Number(k)] = v;
  return ids;
}

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
  description?: string | null;
  subscribers?: number | null;
  maxSubscribers?: number | null;
  url: string | null;
}

export const events = () =>
  mockMode
    ? Promise.resolve(mock.events)
    : json<{ events: CalendarEvent[] }>("/api/v1/private/events").then(
        (d) => d.events,
      );

const CALENDAR_TOKEN_KEY = "ft_pwa_calendar_token";

/** The calendar subscription token generated on this device, if any. Scoped to
 *  the signed-in login so a different account can't inherit the old link. */
export function getCalendarToken(): string | null {
  try {
    const raw = localStorage.getItem(CALENDAR_TOKEN_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { login?: string; token?: string };
    const login = getSession()?.login;
    if (!parsed?.token) return null;
    if (parsed.login && login && parsed.login !== login) return null;
    return parsed.token;
  } catch {
    return null;
  }
}

export function setCalendarToken(token: string | null): void {
  try {
    if (token) {
      localStorage.setItem(
        CALENDAR_TOKEN_KEY,
        JSON.stringify({ login: getSession()?.login ?? "", token }),
      );
    } else {
      localStorage.removeItem(CALENDAR_TOKEN_KEY);
    }
  } catch {
    /* ignore */
  }
}

/** Registers a publication token so `…/calendar/<token>.ics` resolves. */
export async function createCalendarToken(token: string): Promise<void> {
  if (mockMode) return;
  const res = await workerFetch("/api/v1/private/calendar/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token }),
  });
  if (!res.ok) throw new Error("HTTP " + res.status);
}

export interface EventSubscriber {
  login: string;
  displayName: string;
  avatar: string | null;
  location: string | null;
}

/** Users subscribed to a 42 event (live from the API via the worker). */
export const eventSubscribers = (id: number): Promise<EventSubscriber[]> =>
  mockMode
    ? Promise.resolve(mock.eventSubscribers(id))
    : json<{ users?: EventSubscriber[] }>(
        `/api/v1/private/event-subscribers?event=${id}`,
      ).then((d) => d.users ?? []);

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
