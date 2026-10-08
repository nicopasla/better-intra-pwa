import { workerFetch, getSession } from "../../api.ts";
import { updateBlob } from "../../data.ts";
import { mock, mockMode } from "../../mock.ts";

export interface FriendData {
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

const LIST_KEY = "FRIENDS_LIST";

export async function getFriendsList(): Promise<string[]> {
  if (mockMode) {
    const list = mock.blob.settings.FRIENDS_LIST;
    return Array.isArray(list) ? (list as string[]) : [];
  }
  try {
    const raw = localStorage.getItem(LIST_KEY);
    const val = raw ? JSON.parse(raw) : [];
    return Array.isArray(val) ? val : [];
  } catch {
    return [];
  }
}

export async function saveFriendsList(logins: string[]): Promise<void> {
  localStorage.setItem(LIST_KEY, JSON.stringify(logins));
  void updateBlob({ FRIENDS_LIST: logins }).catch(() => undefined);
}

export async function addFriend(login: string): Promise<void> {
  const list = await getFriendsList();
  const normalized = login.trim().toLowerCase();
  if (list.includes(normalized)) return;
  await saveFriendsList([...list, normalized]);
}

export async function removeFriend(login: string): Promise<void> {
  const list = await getFriendsList();
  await saveFriendsList(list.filter((l) => l !== login.toLowerCase()));
}

export async function isFriend(login: string): Promise<boolean> {
  const list = await getFriendsList();
  return list.includes(login.trim().toLowerCase());
}

const CACHE_KEY = "FRIENDS_DATA_CACHE";
const CACHE_TTL = 5 * 60_000;

async function getCachedData(): Promise<{
  data: FriendData[];
  timestamp: number;
} | null> {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    const val = raw ? JSON.parse(raw) : null;
    if (val && Array.isArray(val.data) && typeof val.timestamp === "number")
      return val;
    return null;
  } catch {
    return null;
  }
}

function setCachedData(data: FriendData[]): void {
  try {
    localStorage.setItem(
      CACHE_KEY,
      JSON.stringify({ data, timestamp: Date.now() }),
    );
  } catch {
    /* ignore */
  }
}

export async function clearFriendsCache(): Promise<void> {
  localStorage.removeItem(CACHE_KEY);
}

export async function fetchFriendsData(
  logins: string[],
): Promise<FriendData[]> {
  if (logins.length === 0) return [];

  if (mockMode) {
    const all = mock.friends as unknown as FriendData[];
    if (logins.length === 1) {
      const match = all.filter((f) => f.login === logins[0]);
      return match.length > 0 ? match : all.slice(0, 1);
    }
    return all;
  }

  const session = getSession();
  if (!session) return [];

  // Single-login fetches (add friend validation) always go to the API.
  if (logins.length === 1) {
    try {
      const res = await workerFetch(
        `/api/v1/private/friends/data?logins=${encodeURIComponent(logins[0])}`,
      );
      return res.ok
        ? (((await res.json()) as { friends?: FriendData[] }).friends ?? [])
        : [];
    } catch {
      return [];
    }
  }

  const cached = await getCachedData();
  if (
    cached &&
    cached.data.length > 0 &&
    Date.now() - cached.timestamp < CACHE_TTL
  ) {
    return cached.data;
  }

  try {
    const res = await workerFetch(
      `/api/v1/private/friends/data?logins=${encodeURIComponent(logins.join(","))}`,
    );
    if (res.ok) {
      const data = (await res.json()) as { friends?: FriendData[] };
      const friends = data.friends ?? [];
      if (friends.length > 0) {
        setCachedData(friends);
        return friends;
      }
      if (cached && cached.data.length > 0) return cached.data;
      return [];
    }
  } catch {
    /* ignore */
  }

  if (cached && cached.data.length > 0) return cached.data;
  return [];
}
