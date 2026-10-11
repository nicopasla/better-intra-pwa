import { workerFetch } from "../../api.ts";
import { mockMode } from "../../mock.ts";
import type { OccupancyEntry, OccupancyResponse } from "./types";

/** Better Intra's clusters feature only targets Belgium for now. */
export const CAMPUS_ID = "12";

const MOCK_OCCUPANCY: OccupancyEntry[] = [
  {
    host: "shi-r1-p1",
    login: "mock.user",
    cdn_uri: "https://cdn.intra.42.fr/users/mock.user.jpg",
    begin_at: new Date(Date.now() - 30 * 60_000).toISOString(),
    end_at: null,
  },
];

/** Active (online) students for the campus, keyed by host. */
export async function fetchOccupancy(
  signal?: AbortSignal,
): Promise<Map<string, OccupancyEntry>> {
  const map = new Map<string, OccupancyEntry>();
  if (mockMode) {
    for (const entry of MOCK_OCCUPANCY) map.set(entry.host, entry);
    return map;
  }
  try {
    const res = await workerFetch(
      `/api/v1/private/cluster/occupancy?campus=${CAMPUS_ID}`,
      { signal },
    );
    if (!res.ok) return map;
    const data = (await res.json()) as OccupancyResponse;
    for (const entry of data.entries ?? []) {
      if (entry.host && entry.login) map.set(entry.host, entry);
    }
  } catch {
    /* offline / aborted */
  }
  return map;
}
