/** Date/duration helpers shared by the ported logtime feature. */

export const pad2 = (n: number): string => String(n).padStart(2, "0");

/** "7h", "7h30". */
export function fmtHours(secs: number): string {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  return m > 0 ? `${h}h${pad2(m)}` : `${h}h`;
}

export function localDay(key: string): Date {
  return new Date(`${key}T00:00:00`);
}

/** "Last seen" badge text (`LOGTIME_SHOW_DAYS_MODE`). */
export function getLastSeenFormatted(
  days: Record<string, number>,
  mode: "date" | "days" | "both" = "date",
): string {
  const active = Object.entries(days)
    .filter(([, secs]) => secs > 0)
    .map(([date]) => date)
    .sort();

  if (active.length === 0) return "N/A";
  const lastDateStr = active[active.length - 1];
  if (mode === "date") {
    const [, m, d] = lastDateStr.split("-");
    return `${d}/${m}`;
  }

  const lastDate = localDay(lastDateStr);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  lastDate.setHours(0, 0, 0, 0);
  const diffDays = Math.floor(
    (today.getTime() - lastDate.getTime()) / 86400000,
  );

  const relative =
    diffDays === 0
      ? "today"
      : diffDays === 1
        ? "yesterday"
        : diffDays > 1
          ? `${diffDays} days ago`
          : "today";
  if (mode === "days") return relative;

  const [, m, d] = lastDateStr.split("-");
  return `${d}/${m} (${relative})`;
}
