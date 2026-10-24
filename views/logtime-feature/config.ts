import type { LogtimeSettings } from "../../data.ts";
import { resolveRainbowColors } from "./rainbow.ts";

export type CalendarViewId = "normal" | "compact" | "heatmap" | "carousel";

/** Same shape/field names as the extension's `LogtimeConfig`. */
export interface LogtimeConfig {
  goal_hours: number;
  show_average: boolean;
  show_goal: boolean;
  show_tacos: boolean;
  show_total_tacos: boolean;
  emoji: string;
  divisor: number;
  rate: number;
  max_earnings: number;
  show_days_mode: "date" | "days" | "both";
  calendar_color: string;
  labels_color: string;
  rainbow_colors: string;
  calendar_view: CalendarViewId;
  font_scale: number;
  disable_animations: boolean;
}

export const DEFAULT_LOGTIME_SETTINGS: LogtimeSettings = {
  goalHours: 140,
  showAverage: true,
  showGoal: true,
  showTacos: false,
  showTotalTacos: false,
  showStreak: true,
  emoji: "🌮",
  divisor: 8.7,
  rate: 2,
  maxEarnings: 500,
  showDaysMode: "date",
  calendarColor: "#00BCBA",
  labelsColor: "#26a641",
  rainbowPalette: "rainbow",
  calendarView: "normal",
  fontScale: 100,
  disableAnimations: false,
};

/** Maps the wire shape (worker) to the extension's config shape. */
export function toLogtimeConfig(
  raw: LogtimeSettings | null | undefined,
): LogtimeConfig {
  const s = { ...DEFAULT_LOGTIME_SETTINGS, ...(raw ?? {}) };
  return {
    goal_hours: s.goalHours,
    show_average: s.showAverage,
    show_goal: s.showGoal,
    show_tacos: s.showTacos,
    show_total_tacos: s.showTotalTacos,
    emoji: s.emoji,
    divisor: s.divisor,
    rate: s.rate,
    max_earnings: s.maxEarnings,
    show_days_mode: s.showDaysMode,
    calendar_color: s.calendarColor,
    labels_color: s.labelsColor,
    rainbow_colors: resolveRainbowColors(s.rainbowPalette),
    calendar_view: s.calendarView,
    font_scale: s.fontScale,
    disable_animations: s.disableAnimations,
  };
}

const num = (v: unknown, base: number, min: number, max: number): number => {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return base;
  return Math.min(max, Math.max(min, n));
};

const bool = (v: unknown, base: boolean): boolean =>
  typeof v === "boolean" ? v : base;

const color = (v: unknown, base: string): string =>
  typeof v === "string" && /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(v.trim())
    ? v.trim()
    : base;

const emoji = (v: unknown, base: string): string =>
  typeof v === "string" && v.trim()
    ? Array.from(v.trim()).slice(0, 3).join("")
    : base;

/**
 * Reads `LogtimeSettings` from the shared cloud settings blob (the extension's
 * `LOGTIME_*` keys). Missing/invalid values fall back to the defaults.
 */
export function logtimeSettingsFromBlob(
  settings: Record<string, unknown> | null | undefined,
): LogtimeSettings {
  const s = settings ?? {};
  const d = DEFAULT_LOGTIME_SETTINGS;
  const view = s.LOGTIME_CALENDAR_VIEW;
  const daysMode = s.LOGTIME_SHOW_DAYS_MODE;
  return {
    goalHours: num(s.LOGTIME_GOAL_HOURS, d.goalHours, 0, 10_000),
    showAverage: bool(s.LOGTIME_SHOW_AVERAGE, d.showAverage),
    showGoal: bool(s.LOGTIME_SHOW_GOAL, d.showGoal),
    showTacos: bool(s.LOGTIME_SHOW_TACOS, d.showTacos),
    showTotalTacos: bool(s.LOGTIME_SHOW_TOTAL_TACOS, d.showTotalTacos),
    showStreak: bool(s.LOGTIME_SHOW_STREAK, d.showStreak),
    emoji: emoji(s.LOGTIME_EMOJI, d.emoji),
    divisor: num(s.LOGTIME_EMOJI_DIVISOR, d.divisor, 0.01, 1_000_000),
    rate: num(s.LOGTIME_EMOJI_RATE, d.rate, 0, 1_000_000),
    maxEarnings: num(s.LOGTIME_MAX_EARNINGS, d.maxEarnings, 0, 1_000_000),
    showDaysMode:
      daysMode === "days" || daysMode === "both" || daysMode === "date"
        ? daysMode
        : d.showDaysMode,
    calendarColor: color(s.LOGTIME_CALENDAR_COLOR, d.calendarColor),
    labelsColor: color(s.LOGTIME_LABELS_COLOR, d.labelsColor),
    rainbowPalette:
      typeof s.LOGTIME_RAINBOW_PALETTE === "string" &&
      s.LOGTIME_RAINBOW_PALETTE.trim()
        ? s.LOGTIME_RAINBOW_PALETTE.trim().slice(0, 32)
        : d.rainbowPalette,
    calendarView:
      view === "compact" ||
      view === "heatmap" ||
      view === "carousel" ||
      view === "normal"
        ? view
        : d.calendarView,
    fontScale: num(s.GENERAL_FONT_SCALE, d.fontScale, 50, 200),
    disableAnimations: bool(s.DISABLE_ANIMATIONS, d.disableAnimations),
  };
}
