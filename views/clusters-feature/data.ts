import { workerFetch } from "../../api.ts";
import { mockMode } from "../../mock.ts";
import type { OccupancyEntry, OccupancyResponse } from "./types";

/** Better Intra's clusters feature only targets Belgium for now. */
export const CAMPUS_ID = "12";

const MOCK_PEOPLE: { login: string; name: string }[] = [
  { login: "nponchon", name: "Nicolas Ponchon" },
  { login: "arobion", name: "Alice Robion" },
  { login: "clemarche", name: "Clément Le Marchand" },
  { login: "mferreir", name: "Marco Ferreira" },
  { login: "jdupont", name: "Julien Dupont" },
  { login: "svandenb", name: "Sophie Van Den Berg" },
  { login: "akadri", name: "Amina Kadri" },
  { login: "lmoreau", name: "Louis Moreau" },
  { login: "tlecoq", name: "Théo Lecocq" },
  { login: "ebastien", name: "Emma Bastien" },
  { login: "ghubert", name: "Gaëtan Hubert" },
  { login: "vmarquet", name: "Victor Marquet" },
];

const MOCK_HOSTS = [
  "fu-r1-p1",
  "fu-r1-p2",
  "fu-r2-p3",
  "fu-r5-p5",
  "fu-r10-p1",
  "fu-c1-p1",
  "fu-c2-p2",
  "fu-c3-p1",
  "fu-c4-p1",
];

const MOCK_OCCUPANCY: OccupancyEntry[] = MOCK_PEOPLE.map((p, i) => ({
  host: i % 4 === 3 ? `wifi-${i + 1}` : MOCK_HOSTS[i % MOCK_HOSTS.length],
  login: p.login,
  name: p.name,
  cdn_uri: `https://cataas.com/cat?width=80&height=80&r=${i}`,
  begin_at: new Date(Date.now() - (i * 17 + 4) * 60_000).toISOString(),
  end_at: null,
}));

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
