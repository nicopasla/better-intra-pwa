/** Locale-aware Date/Time formatting helpers (Intl). Always English. */

const LOCALE = "en-GB";

const REL = new Intl.RelativeTimeFormat(LOCALE, { numeric: "auto" });

const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["year", 365 * 24 * 60 * 60],
  ["month", 30 * 24 * 60 * 60],
  ["day", 24 * 60 * 60],
  ["hour", 60 * 60],
  ["minute", 60],
  ["second", 1],
];

/** "now", "5 minutes ago", "in 2 hours" — supports past and future timestamps. */
export function relativeTime(tsMs: number, baseMs: number = Date.now()): string {
  const diffSec = Math.round((tsMs - baseMs) / 1000);
  if (diffSec === 0) return "now";
  const abs = Math.abs(diffSec);
  for (const [unit, size] of UNITS) {
    if (abs >= size) {
      const value = Math.round(diffSec / size);
      return REL.format(value, unit);
    }
  }
  return REL.format(diffSec, "second");
}

/** Compact "5m"/"3h"/"2d" style for times in the past. */
export function relativeTimeCompact(tsMs: number, baseMs: number = Date.now()): string {
  const sec = Math.max(0, Math.round((baseMs - tsMs) / 1000));
  if (sec < 3) return "now";
  if (sec < 60) return `${sec}s`;
  const mins = Math.round(sec / 60);
  if (mins < 60) return `${mins}m`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.round(hours / 24)}d`;
}

const fmtClock = new Intl.DateTimeFormat(LOCALE, {
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

/** "14:05" in the device locale/tz. */
export function clockTime(iso: string | number | Date): string {
  return fmtClock.format(new Date(iso));
}

/** "Mon", "Jan", etc. */
export function shortDatePart(date: Date, parts: Intl.DateTimeFormatOptions): string {
  return date.toLocaleDateString(LOCALE, parts);
}

const fmtDay = new Intl.DateTimeFormat(LOCALE, {
  weekday: "short",
  day: "2-digit",
  month: "short",
  year: "numeric",
});

/** "Mon, 05 Jan 2026". */
export function fullDate(date: Date): string {
  return fmtDay.format(date);
}

const fmtDateTime = new Intl.DateTimeFormat(LOCALE, {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

/** "05/01/2026, 14:05" in the device locale. */
export function dateTime(iso: string | number | Date): string {
  return fmtDateTime.format(new Date(iso));
}

const fmtTimeShort = new Intl.DateTimeFormat(LOCALE, {
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

const fmtDateShort = new Intl.DateTimeFormat(LOCALE, {
  day: "2-digit",
  month: "2-digit",
  year: "2-digit",
});

/** "14:05" when today, else "05/01/26 14:05" (device locale/tz). */
export function dateTimeShort(iso: string | number | Date): string {
  const date = new Date(iso);
  const now = new Date();
  const sameDay =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();
  return sameDay
    ? fmtTimeShort.format(date)
    : `${fmtDateShort.format(date)} ${fmtTimeShort.format(date)}`;
}
