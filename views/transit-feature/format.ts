import type { TransitMode } from "../../data.ts";

export const MODE_LABELS: Record<TransitMode, string> = {
  metro: "Metro",
  tram: "Tram",
  bus: "Bus",
};

/** daisyUI badge classes per mode, readable in both themes. */
export const MODE_BADGE: Record<TransitMode, string> = {
  metro: "badge-primary",
  tram: "badge-secondary",
  bus: "badge-neutral",
};

const pad2 = (n: number): string => String(n).padStart(2, "0");

/** Expected arrival as `now` / `3 min` / a clock time past the hour. */
export function arrivalLabel(at: string, now = Date.now()): string {
  const instant = Date.parse(at);
  if (!Number.isFinite(instant)) return "";
  const minutes = Math.round((instant - now) / 60_000);
  if (minutes <= 0) return "now";
  if (minutes < 60) return `${minutes} min`;
  const date = new Date(instant);
  return `${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
}

/** Age of the board as shown in the card header. */
export function boardAge(updatedAt: number, now = Date.now()): string {
  if (!Number.isFinite(updatedAt) || updatedAt <= 0) return "";
  const seconds = Math.max(0, Math.round((now - updatedAt) / 1000));
  if (seconds < 45) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  return `${hours} h ago`;
}
