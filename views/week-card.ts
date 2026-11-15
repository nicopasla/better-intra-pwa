import { html } from "lit-html";
import { getWeekStart } from "../lib/prefs.ts";
import { contrastText, toRgba } from "./logtime-feature/color.ts";
import { MAX_INTENSITY_SECS } from "./logtime-feature/constants.ts";
import { fmtHours } from "./logtime-feature/format.ts";

/** One week of logtime as seven cells, shared by Home and the profiles. */

const pad2 = (n: number): string => String(n).padStart(2, "0");

export const dayKey = (date: Date): string =>
  `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;

/** First day of the current week, honouring the "week starts Saturday" pref. */
export function weekKey(date = new Date()): string {
  const startDow = getWeekStart() === "saturday" ? 6 : 1;
  const day = new Date(date);
  day.setHours(0, 0, 0, 0);
  const offset = (day.getDay() - startDow + 7) % 7;
  day.setDate(day.getDate() - offset);
  return dayKey(day);
}

export function shiftDay(key: string, days: number): string {
  const date = new Date(`${key}T00:00:00`);
  date.setDate(date.getDate() + days);
  return dayKey(date);
}

export interface WeekViewProps {
  /** First day of the requested week (`YYYY-MM-DD`). */
  start: string;
  /** Null while the week is still loading. */
  days: Record<string, number> | null;
  total: number;
  /** Accent colour of the bars. */
  color: string;
  error?: string;
  stale?: boolean;
  onRetry?(): void;
}

function card(content: unknown) {
  return html`
    <div class="card bg-base-100 shadow-xl mb-4">
      <div class="card-body">${content}</div>
    </div>
  `;
}

function heading(props: WeekViewProps) {
  const { days, total, color, stale } = props;
  return html`<div class="flex items-center justify-between gap-2 -mt-1">
    <h2 class="card-title text-base">This week</h2>
    ${days === null
      ? ""
      : html`<span
          class="badge badge-lg border-2 tabular-nums"
          style="border-color:${color};background:color-mix(in oklab, ${color} 12%, transparent);"
          data-tip=${stale ? "Couldn't refresh · showing cached data" : ""}
          >${fmtHours(total)}</span
        >`}
  </div>`;
}

export function weekCard(props: WeekViewProps): unknown {
  const { start, days, color, error, stale, onRetry } = props;

  if (days === null) {
    if (error) {
      return card(
        html`${heading(props)}
          <div class="flex items-center justify-between gap-3">
            <p class="text-sm opacity-70">Couldn't load this week.</p>
            ${onRetry
              ? html`<button class="btn btn-xs btn-outline" @click=${onRetry}>
                  Retry
                </button>`
              : ""}
          </div>`,
      );
    }
    return card(
      html`${heading(props)}
        <div class="grid grid-cols-7 gap-1.5">
          ${Array.from(
            { length: 7 },
            () => html`<div class="skeleton aspect-square rounded-md"></div>`,
          )}
        </div>`,
    );
  }

  const today = dayKey(new Date());
  const cells = Array.from({ length: 7 }, (_, i) => {
    const key = shiftDay(start, i);
    const date = new Date(`${key}T00:00:00`);
    const secs = days[key] ?? 0;
    const future = key > today;
    const isToday = key === today;
    const alpha = Math.min(secs / MAX_INTENSITY_SECS, 1);
    const bg = secs > 0 ? toRgba(color, alpha) : "";
    const fg = secs > 0 && alpha > 0.45 ? contrastText(color) : "";
    const weekday = date.toLocaleDateString("en-GB", { weekday: "short" });
    const tooltip = `${weekday} ${date.getDate()} ${date.toLocaleDateString(
      "en-GB",
      { month: "short" },
    )} · ${secs > 0 ? fmtHours(secs) : "no logtime"}`;
    return html`<div
      class="aspect-square rounded-md flex flex-col items-center justify-center leading-none ${future
        ? "opacity-40"
        : ""} ${secs > 0 ? "" : "bg-base-300/40"} ${isToday
        ? "outline outline-2 outline-primary -outline-offset-2"
        : ""}"
      style=${bg ? `background:${bg};${fg ? `color:${fg};` : ""}` : ""}
      data-tip=${tooltip}
    >
      <span class="text-[10px] uppercase tracking-wide opacity-70"
        >${date.toLocaleDateString("en-GB", { weekday: "narrow" })}</span
      >
      <span class="text-sm font-bold tabular-nums mt-0.5"
        >${date.getDate()}</span
      >
    </div>`;
  });

  return card(html`${heading(props)}
    <div class="grid grid-cols-7 gap-1.5">${cells}</div>
    ${stale
      ? html`<p class="text-[11px] text-warning mt-1">
          Couldn't refresh · showing cached data
        </p>`
      : ""}`);
}
