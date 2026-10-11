import type { ActiveSortMode, OccupancyEntry } from "./types";

export function sortActiveUsers(
  list: OccupancyEntry[],
  mode: ActiveSortMode,
  nameDir: "asc" | "desc",
  sinceDir: "asc" | "desc",
): OccupancyEntry[] {
  return [...list].sort((a, b) => {
    if (mode === "since") {
      const at = new Date(a.begin_at).getTime();
      const bt = new Date(b.begin_at).getTime();
      const diff = at - bt;
      const result = sinceDir === "asc" ? diff : -diff;
      return result || a.login.localeCompare(b.login);
    }
    const cmp = a.login.localeCompare(b.login);
    return nameDir === "asc" ? cmp : -cmp;
  });
}

export function formatTimeAgo(ts: number): string {
  const secs = (Date.now() - ts) / 1000;
  if (secs < 3) return "now";
  const mins = Math.round(secs / 60);
  if (mins < 60) return `${mins}m`;
  return `${Math.round(mins / 60)}h`;
}
