import { html } from "lit-html";
import { ref } from "lit-html/directives/ref.js";
import {
  AVG_ONLY_ACTIVE_DAYS,
  CELL_RADIUS,
  PAST_MONTHS_OPACITY,
} from "./constants.ts";
import type { LogtimeConfig } from "./config.ts";
import { toRgba } from "./color.ts";
import { fmtHours, pad2 } from "./format.ts";
import { goalProgress } from "./goal.ts";
import LOGTIME_CSS from "./logtime.css?inline";

const MAX_INTENSITY_SECS = 3600 * 12;

function renderDayCell(
  day: number,
  dKey: string,
  secs: number,
  hasData: boolean,
  todayStr: string,
  config: LogtimeConfig,
) {
  const alpha = Math.min(secs / MAX_INTENSITY_SECS, 1);
  const bgColor =
    secs > 0 ? toRgba(config.calendar_color, alpha) : "var(--muted)";
  const textColor =
    secs > MAX_INTENSITY_SECS / 2
      ? "var(--primary-foreground)"
      : "var(--muted-foreground)";

  const [year, month, dayOfMonth] = dKey.split("-");
  const dateLabel = `${dayOfMonth}/${month}/${year}`;

  return html`<div
    class="day-cell aspect-square flex items-center justify-center text-[11px] font-bold font-mono ${dKey ===
    todayStr
      ? "today-highlight"
      : ""}"
    style="border-radius: ${CELL_RADIUS}; background: ${bgColor}; color: ${textColor};"
    data-tip="${dateLabel} · ${hasData ? fmtHours(secs) : "no logtime"}"
  >
    ${String(day)}
  </div>`;
}

function renderCalendarGrid(
  year: number,
  mon: number,
  data: Record<string, number>,
  lastDayDate: number,
  config: LogtimeConfig,
) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayStr = `${today.getFullYear()}-${pad2(today.getMonth() + 1)}-${pad2(
    today.getDate(),
  )}`;

  const headerRow = ["M", "T", "W", "T", "F", "S", "S", "Total"].map(
    (day, idx) =>
      html`<div
        class="text-[11px] font-extrabold text-center"
        style="color: var(--muted-foreground); ${idx === 7
          ? `border-left: 1px solid var(--color-base-300); color: var(--labels-color);`
          : ""}"
      >
        ${day}
      </div>`,
  );

  const offset = (new Date(year, mon - 1, 1).getDay() + 6) % 7;
  const emptyCells = Array.from({ length: offset }, () => html`<div></div>`);
  const dayRows: ReturnType<typeof html>[] = [];
  let weekSecs = 0;
  let cellCount = offset;

  for (let day = 1; day <= lastDayDate; day++) {
    const dKey = `${year}-${pad2(mon)}-${pad2(day)}`;
    const hasData = dKey in data;
    const secs = hasData ? data[dKey] : 0;
    weekSecs += secs;

    dayRows.push(renderDayCell(day, dKey, secs, hasData, todayStr, config));
    cellCount++;

    if ((cellCount % 7 === 0 && cellCount > 0) || day === lastDayDate) {
      if (day === lastDayDate && cellCount % 7 !== 0) {
        const fillCount = 7 - (cellCount % 7);
        for (let j = 0; j < fillCount; j++) dayRows.push(html`<div></div>`);
      }

      dayRows.push(
        html`<div
          style="font-size: 14px; font-weight: 700; text-align: right; color: var(--labels-color); padding-right: 4px; display: flex; align-items: center; justify-content: flex-end;"
        >
          ${weekSecs > 0 ? fmtHours(weekSecs) : ""}
        </div>`,
      );
      weekSecs = 0;
    }
  }

  return html`<div
    class="grid gap-x-1.25 gap-y-2"
    style="grid-template-columns: repeat(7, 1fr) 58px;"
  >
    ${headerRow} ${emptyCells} ${dayRows}
  </div>`;
}

export function renderMonthCard(
  ym: string,
  data: Record<string, number>,
  isCurrent: boolean,
  config: LogtimeConfig,
) {
  const [year, mon] = ym.split("-").map(Number);
  const total = Object.values(data).reduce((a, b) => a + b, 0);
  const lastDayDate = new Date(year, mon, 0).getDate();
  const divisor = AVG_ONLY_ACTIVE_DAYS
    ? Object.values(data).filter((s) => s > 0).length || 1
    : isCurrent
      ? new Date().getDate()
      : lastDayDate;
  const avg = total / divisor;

  const monthDate = new Date(year, mon - 1);
  const monthName = new Intl.DateTimeFormat("en-US", {
    month: "long",
  }).format(monthDate);
  const monthShort = new Intl.DateTimeFormat("en-US", {
    month: "short",
  }).format(monthDate);
  const forceShort = (config.font_scale ?? 100) > 100;
  const goalSecs = config.goal_hours * 3600;
  const goal = goalProgress(total, config.goal_hours);
  const goalPercent = goal.percent;
  const isGoalMet = goal.met;
  const isPast = !isCurrent;
  const fillClass = isGoalMet ? "liquid-fill-full" : "liquid-fill";

  const monthEarnings = (total / 3600) * config.rate;
  const isMonthCapped =
    config.max_earnings > 0 && monthEarnings >= config.max_earnings;
  const cappedMonthEarnings =
    config.max_earnings > 0 && monthEarnings > config.max_earnings
      ? config.max_earnings
      : monthEarnings;
  const monthTacos = Math.round(cappedMonthEarnings / config.divisor);

  return html`<div
    class="month-card ${isCurrent ? "current-month" : ""}"
    style="${!isCurrent ? `opacity: ${PAST_MONTHS_OPACITY};` : ""}"
    data-month="${ym}"
  >
    <div class="lt-month-header flex justify-between items-center mb-3">
      <span
        class="lt-month-name text-xl font-bold text-base-content"
        data-month-full="${monthName}"
        data-month-short="${monthShort}"
        >${forceShort ? monthShort : monthName}</span
      >
      <span
        class="lt-month-badge badge badge-lg font-bold font-mono transition-all duration-200 ${isGoalMet
          ? "badge-rainbow"
          : "badge-outline badge-success"}"
      >
        ${fmtHours(total)}${config.show_goal ? ` / ${config.goal_hours}h` : ""}
      </span>
    </div>

    <div
      class="flex justify-between items-center text-sm"
      style="color: var(--labels-color); margin-bottom: 10px;"
    >
      <div style="cursor: help">
        ${config.show_goal ? html`<b>${goalPercent}%</b>` : ""}
        ${config.show_goal && config.show_tacos
          ? html`<span class="mx-1.5 text-base-content/30 text-lg leading-none"
              >•</span
            >`
          : ""}
        ${config.show_tacos
          ? html`${monthTacos}${isMonthCapped ? "+" : ""} ${config.emoji}`
          : ""}
      </div>
      ${config.show_average
        ? html`<span>Avg: <b class="font-mono">${fmtHours(avg)}</b></span>`
        : ""}
    </div>

    ${config.show_goal
      ? html`<div
          class="w-full h-2 rounded-full overflow-hidden mb-3"
          style="background: var(--color-base-300);"
        >
          <div
            class="h-full transition-all duration-500 ${fillClass} ${isPast
              ? "is-past"
              : ""}"
            style="width: ${Math.min(goalPercent, 100)}%;"
          ></div>
        </div>`
      : ""}
    ${renderCalendarGrid(year, mon, data, lastDayDate, config)}
  </div>`;
}

/** Vertical year marker that sits between month cards, like the extension. */
export function renderYearLabel(year: string) {
  return html`<div class="logtime-year-label"><span>${year}</span></div>`;
}

/** "Load older" card: continues the capped worker sync. */
export function renderSyncMoreCard(onClick: () => void, loading = false) {
  return html`<div
    class="month-card logtime-load-older"
    style="cursor: ${loading ? "default" : "pointer"}"
    @click=${loading ? undefined : onClick}
  >
    <div class="flex flex-col items-center gap-2 py-6">
      ${loading
        ? html`<span class="loading loading-spinner loading-md"></span>`
        : html`<span class="text-sm font-bold text-base-content"
            >Load older months</span
          >`}
      <span class="text-xs" style="color: var(--muted-foreground);">
        ${loading ? "Fetching data..." : "Tap to fetch older logtime"}
      </span>
    </div>
  </div>`;
}

export function renderHeaderContent(
  lastSeenValue: string,
  monthsData: Record<string, Record<string, number>>,
  config: LogtimeConfig,
): ReturnType<typeof html> {
  const showTotalTacos = config.show_tacos && config.show_total_tacos;
  let totalTacos = 0;
  if (showTotalTacos) {
    let totalCappedEarnings = 0;
    for (const data of Object.values(monthsData)) {
      const monthSecs = Object.values(data).reduce((a, b) => a + b, 0);
      const monthEarnings = (monthSecs / 3600) * config.rate;
      const cappedMonthEarnings = config.max_earnings
        ? Math.min(monthEarnings, config.max_earnings)
        : monthEarnings;
      totalCappedEarnings += cappedMonthEarnings;
    }
    totalTacos = Math.floor(totalCappedEarnings / config.divisor);
  }

  return html`<div class="lt-header flex items-center gap-2 pb-3 flex-wrap">
    <span class="lt-title font-bold uppercase text-sm tracking-tight"
      >Logtime</span
    >
    ${showTotalTacos
      ? html`<span
          class="badge badge-dash badge-success badge-lg font-bold font-mono lt-tacos-badge"
          >${totalTacos} ${config.emoji}</span
        >`
      : ""}
    <span class="ml-auto flex items-center gap-2">
      ${lastSeenValue !== "N/A"
        ? html`<span
            class="badge badge-success font-bold font-mono tracking-tight lt-active-badge"
            >Active ${lastSeenValue}</span
          >`
        : ""}
    </span>
  </div>`;
}

export function renderContainer(
  header: unknown,
  monthCards: unknown[],
  config: LogtimeConfig,
  onSlider?: (el: HTMLElement) => void,
) {
  const disableAnimCss = config.disable_animations
    ? `.ft-logtime-root *, .ft-logtime-root *::after { animation: none !important; transition: none !important; }
       .liquid-fill::after { display: none !important; }
       .liquid-fill { border-radius: 0 4px 4px 0; }`
    : "";

  return html`<style>
      ${LOGTIME_CSS}
      .ft-logtime-root {
        --intra-font: var(--font-sans);
        --border-color: var(--labels-color);
        --calendar-color: ${config.calendar_color};
        --rainbow-colors: ${config.rainbow_colors};
        --labels-color: ${config.labels_color};
        --muted: color-mix(in srgb, var(--color-base-300) 70%, transparent);
        --muted-foreground: var(--color-base-content);
        --card-surface: color-mix(in srgb, var(--color-base-content) 3%, transparent);
        --card-surface-strong: color-mix(in srgb, var(--color-base-content) 6%, transparent);
        --card-hairline: color-mix(in srgb, var(--color-base-content) 8%, transparent);
        --card-hairline-strong: color-mix(in srgb, var(--color-base-content) 16%, transparent);
        display: block;
        width: 100%;
      }
      ${disableAnimCss}
    </style>
    <div class="ft-logtime-root">
      <div class="lt-box-container">
        ${header}
        <div
          class="logtime-slider"
          data-no-swipe
          ${ref((el) => {
            if (el) onSlider?.(el as HTMLElement);
          })}
        >
          ${monthCards}
        </div>
      </div>
    </div>`;
}
