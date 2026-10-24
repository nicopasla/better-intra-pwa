import type { LogtimeSettings } from "../../data.ts";
import { toLogtimeConfig } from "./config.ts";
import { getLastSeenFormatted } from "./format.ts";
import {
  renderContainer,
  renderHeaderContent,
  renderMonthCard,
  renderSyncMoreCard,
  renderYearLabel,
} from "./render.ts";

export interface LogtimeSectionProps {
  days: Record<string, number>;
  settings?: LogtimeSettings | null;
  /** The worker capped the sync: older months are available on demand. */
  partial?: boolean;
  syncing?: boolean;
  /** Render the section header (title + last-active badge). Cards that show
   *  their own header (collapsible logtime) pass false. */
  showHeader?: boolean;
  onSyncMore(): void;
  /** Called with the horizontal slider element after each render. */
  onSliderRendered?(el: HTMLElement): void;
}

function groupByMonth(days: Record<string, number>) {
  const byMonth: Record<string, Record<string, number>> = {};
  for (const date of Object.keys(days).sort()) {
    const ym = date.slice(0, 7);
    if (!byMonth[ym]) byMonth[ym] = {};
    byMonth[ym][date] = days[date] ?? 0;
  }
  return byMonth;
}

/**
 * The extension's basic logtime calendar: months in a horizontal slider
 * (oldest → newest), auto-scrolled to the current month by the profile view.
 */
export function logtimeSection(props: LogtimeSectionProps) {
  const config = toLogtimeConfig(props.settings);
  const byMonth = groupByMonth(props.days);
  const monthKeys = Object.keys(byMonth).sort();

  const header =
    props.showHeader === false
      ? ""
      : renderHeaderContent(
          getLastSeenFormatted(props.days, config.show_days_mode),
          byMonth,
          config,
        );

  const cards: unknown[] = [];
  let prevYear = "";
  for (const ym of monthKeys) {
    const year = ym.slice(0, 4);
    if (year !== prevYear && prevYear !== "") cards.push(renderYearLabel(year));
    prevYear = year;
    cards.push(
      renderMonthCard(
        ym,
        byMonth[ym],
        ym === monthKeys[monthKeys.length - 1],
        config,
      ),
    );
  }
  if (props.partial) {
    cards.unshift(renderSyncMoreCard(props.onSyncMore, props.syncing));
  }

  return renderContainer(header, cards, config, props.onSliderRendered);
}

/** "Active 23/10" (or "" when there is no recorded day yet). Online users
 *  read "Active now": their current session is still open, so 42 has no
 *  completed day for today yet. */
export function lastActiveLabel(
  days: Record<string, number> | null | undefined,
  settings?: LogtimeSettings | null,
  online = false,
): string {
  if (online) return "Active now";
  if (!days) return "";
  const config = toLogtimeConfig(settings);
  const value = getLastSeenFormatted(days, config.show_days_mode);
  return value === "N/A" ? "" : `Active ${value}`;
}
