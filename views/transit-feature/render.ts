import { html } from "lit-html";
import type {
  TransitBoard,
  TransitDeparture,
  TransitMode,
} from "../../data.ts";
import type { TransitFavorite } from "../../lib/prefs.ts";
import {
  arrivalLabel,
  boardAge,
  MODE_BADGE,
  MODE_LABELS,
} from "./format.ts";

/** Departures of one line towards one destination at a stop. */
export interface LineGroup {
  lineId: string;
  mode: TransitMode;
  color: string | null;
  textColor: string | null;
  destination: string;
  departures: TransitDeparture[];
}

/** A physical station: every platform point carrying the same name. */
export interface StopGroup {
  name: string;
  distanceM: number;
  lines: LineGroup[];
}

/** One selectable line + direction of the picker. */
export interface PickerLine {
  lineId: string;
  mode: TransitMode;
  color: string | null;
  textColor: string | null;
  destination: string;
  next: string;
}

export interface TransitViewProps {
  board: TransitBoard | null;
  favorites: TransitFavorite[];
  loading: boolean;
  error: string;
  preview?: boolean;
  /** The line picker replaced the board. */
  picking: boolean;
  onRefresh(): void;
  onTogglePicker(): void;
  onToggleLine(stopName: string, lineId: string, destination: string): void;
}

/** Line badge: official GTFS colour when known, mode colour otherwise. */
function lineBadge(line: {
  lineId: string;
  mode: TransitMode;
  color: string | null;
  textColor: string | null;
}): unknown {
  if (line.color) {
    return html`<span
      class="badge h-9 min-w-9 flex-none justify-center rounded-full px-2 text-sm font-bold tabular-nums"
      style="background:${line.color};border-color:${line.color};color:${line
        .textColor ?? "#ffffff"}"
      >${line.lineId}</span
    >`;
  }
  return html`<span
    class="badge h-9 min-w-9 flex-none justify-center rounded-full px-2 text-sm font-bold tabular-nums ${MODE_BADGE[
      line.mode
    ]}"
    >${line.lineId}</span
  >`;
}

const MODE_ORDER: Record<TransitMode, number> = { metro: 0, tram: 1, bus: 2 };

/** Merges the platform points of each station into one named stop, so
 *  `GARE CENTRALE` does not appear once per platform. */
export function groupStops(board: TransitBoard): StopGroup[] {
  const byName = new Map<string, StopGroup>();
  for (const stop of board.stops) {
    const key = stop.name.trim() || stop.id;
    let entry = byName.get(key);
    if (!entry) {
      entry = { name: key, distanceM: stop.distanceM, lines: [] };
      byName.set(key, entry);
    }
    entry.distanceM = Math.min(entry.distanceM, stop.distanceM);
    for (const departure of stop.departures) {
      const signature = `${departure.lineId}\u0000${departure.destination}`;
      let line = entry.lines.find(
        (item) => `${item.lineId}\u0000${item.destination}` === signature,
      );
      if (!line) {
        line = {
          lineId: departure.lineId,
          mode: departure.mode,
          color: departure.color,
          textColor: departure.textColor,
          destination: departure.destination,
          departures: [],
        };
        entry.lines.push(line);
      }
      line.departures.push(departure);
    }
  }
  return [...byName.values()]
    .map((entry) => ({
      ...entry,
      lines: entry.lines.map((line) => ({
        ...line,
        departures: line.departures.sort(
          (a, b) => Date.parse(a.at) - Date.parse(b.at),
        ),
      })),
    }))
    .sort((a, b) => a.distanceM - b.distanceM);
}

/** Every direction of every line at the station, one entry per destination. */
export function pickerLines(stops: StopGroup[]): PickerLine[] {
  const byDirection = new Map<string, PickerLine>();
  for (const stop of stops) {
    for (const line of stop.lines) {
      const key = `${line.lineId}\u0000${line.destination}`;
      const next = line.departures[0].at;
      const existing = byDirection.get(key);
      if (!existing) {
        byDirection.set(key, {
          lineId: line.lineId,
          mode: line.mode,
          color: line.color,
          textColor: line.textColor,
          destination: line.destination,
          next,
        });
        continue;
      }
      if (Date.parse(next) < Date.parse(existing.next)) existing.next = next;
    }
  }
  return [...byDirection.values()].sort((a, b) => {
    const mode = MODE_ORDER[a.mode] - MODE_ORDER[b.mode];
    if (mode !== 0) return mode;
    const line = a.lineId.localeCompare(b.lineId, undefined, { numeric: true });
    if (line !== 0) return line;
    return a.destination.localeCompare(b.destination);
  });
}

export function transitView(props: TransitViewProps): unknown {
  const { board, loading, error, preview, picking, onRefresh, onTogglePicker } =
    props;

  return html`<div class="card bg-base-100 shadow-xl mb-4">
    <div class="card-body px-3 py-3 gap-2">
      <div class="flex items-center gap-2">
        <h2 class="text-base font-semibold m-0">Transit</h2>
        <span class="badge badge-ghost badge-sm">Gare Centrale</span>
        ${loading
          ? html`<button
              type="button"
              class="btn btn-xs btn-primary btn-outline"
              aria-label="Refreshing"
              title="Refreshing"
              disabled
            >
              <span class="loading loading-dots loading-xs"></span>
            </button>`
          : board
            ? html`<button
                type="button"
                class="btn btn-xs btn-primary btn-outline"
                aria-label="Refresh departures — last update ${boardAge(
                  board.updatedAt,
                )}"
                title="Refresh departures"
                @click=${onRefresh}
              >
                ${boardAge(board.updatedAt)}
              </button>`
            : ""}
        ${board
          ? html`<button
              type="button"
              class="btn btn-xs ml-auto ${picking
                ? "btn-success"
                : "btn-primary"}"
              aria-pressed="${picking ? "true" : "false"}"
              @click=${onTogglePicker}
            >
              ${picking ? "Done" : "Edit"}
            </button>`
          : ""}
      </div>
      ${board
        ? boardContent(props)
        : loading || preview
          ? loadingRows()
          : emptyState(error, onRefresh)}
      <div class="flex items-center gap-1 text-[10px] opacity-40">
        <span>Data</span>
        <a
          class="link link-hover"
          href="https://mobilitytwin.brussels/"
          target="_blank"
          rel="noreferrer noopener"
          >MobilityTwin.Brussels</a
        >
        <span>· STIB</span>
      </div>
    </div>
  </div>`;
}

function boardContent(props: TransitViewProps): unknown {
  const { board, favorites, picking, onToggleLine, onTogglePicker } = props;
  if (!board) return "";
  const stops = groupStops(board);
  const lines = pickerLines(stops);
  if (lines.length === 0) {
    return html`<p class="text-sm opacity-60 py-2">
      No departures at the station right now.
    </p>`;
  }

  if (picking) return linePicker(stops, lines, favorites, onToggleLine);

  const selected = selectedRows(stops, favorites);
  if (selected.length === 0) {
    return html`<div class="flex flex-col items-start gap-2 py-1">
      <p class="text-sm opacity-60">
        Choose the lines you follow to see when they arrive.
      </p>
      <button class="btn btn-xs btn-outline" @click=${onTogglePicker}>
        Choose lines
      </button>
    </div>`;
  }

  return html`
    ${isOld(board)
      ? html`<p class="text-[11px] text-warning">
          Couldn't refresh — showing the last board.
        </p>`
      : ""}
    <ul class="list flex flex-col">
      ${selected.map(({ stop, line }) => lineRow(stop, line))}
    </ul>
  `;
}

/** The starred lines, soonest arrival first. */
function selectedRows(
  stops: StopGroup[],
  favorites: TransitFavorite[],
): { stop: StopGroup; line: LineGroup }[] {
  const rows: { stop: StopGroup; line: LineGroup }[] = [];
  for (const favorite of favorites) {
    for (const stop of stops) {
      if (stop.name !== favorite.stopName) continue;
      for (const line of stop.lines) {
        if (
          line.lineId !== favorite.lineId ||
          line.destination !== favorite.destination
        ) {
          continue;
        }
        rows.push({ stop, line });
      }
    }
  }
  return rows.sort(
    (a, b) => Date.parse(a.line.departures[0].at) - Date.parse(b.line.departures[0].at),
  );
}

function linePicker(
  stops: StopGroup[],
  lines: PickerLine[],
  favorites: TransitFavorite[],
  onToggleLine: (stopName: string, lineId: string, destination: string) => void,
): unknown {
  const station = stops[0];
  const chosen = new Set(
    favorites
      .filter((favorite) => favorite.stopName === station?.name)
      .map((favorite) => `${favorite.lineId}\u0000${favorite.destination}`),
  );

  return html`<div class="flex flex-col">
    <p class="text-[11px] uppercase tracking-wide opacity-50 px-1">
      Directions at ${station?.name ?? "the station"}
    </p>
    <div class="flex flex-col">
      ${lines.map(
        (line) => html`<label
          class="flex items-center gap-2 px-1 py-1 min-h-11 cursor-pointer rounded-box hover:bg-base-200"
        >
          ${lineBadge(line)}
          <span class="flex-1 min-w-0 truncate text-sm"
            >${line.destination || MODE_LABELS[line.mode]}</span
          >
          <input
            type="checkbox"
            class="toggle toggle-sm toggle-primary flex-none"
            .checked=${chosen.has(`${line.lineId}\u0000${line.destination}`)}
            @change=${() =>
              station &&
              onToggleLine(station.name, line.lineId, line.destination)}
          />
        </label>`,
      )}
    </div>
  </div>`;
}

/** Arrival time chip: the line's official colour, dimmed for later departures. */
function timeBadge(
  line: LineGroup,
  time: string,
  primary: boolean,
): unknown {
  const size = "badge h-8 flex-none justify-center rounded-full px-2.5 text-sm font-semibold tabular-nums";
  const dim = primary ? "" : "opacity-60";
  if (line.color) {
    return html`<span
      class="${size} ${dim}"
      style="background:${line.color};border-color:${line.color};color:${line
        .textColor ?? "#ffffff"}"
      >${time}</span
    >`;
  }
  return html`<span class="${size} ${dim} ${MODE_BADGE[line.mode]}"
    >${time}</span
  >`;
}

function lineRow(stop: StopGroup, line: LineGroup): unknown {
  const now = Date.now();
  const times = line.departures
    .slice(0, 2)
    .map((departure) => arrivalLabel(departure.at, now))
    .filter(Boolean);

  return html`<li
    class="flex items-center gap-2 px-1 py-1 min-h-11"
    aria-label="${line.lineId} towards ${line.destination} at ${stop.name}"
  >
    ${lineBadge(line)}
    <span class="flex-1 min-w-0 truncate text-sm"
      >${line.destination || MODE_LABELS[line.mode]}</span
    >
    <span class="flex-none flex items-center gap-1">
      ${times.map((time, index) => timeBadge(line, time, index === 0))}
    </span>
  </li>`;
}

function isOld(board: TransitBoard): boolean {
  return Date.now() - board.updatedAt > 5 * 60_000;
}

function loadingRows(): unknown {
  return html`<div class="flex flex-col gap-2 py-1">
    ${[0, 1, 2].map(
      () => html`<div class="flex items-center gap-2">
        <div class="skeleton size-6 rounded-full"></div>
        <div class="skeleton h-6 w-9"></div>
        <div class="skeleton h-4 flex-1"></div>
        <div class="skeleton h-4 w-14"></div>
      </div>`,
    )}
  </div>`;
}

function emptyState(error: string, onRefresh: () => void): unknown {
  return html`<div class="flex flex-col items-start gap-2 py-1">
    <p class="text-sm opacity-60">
      ${error
        ? "Couldn't load the departures."
        : "No departures at the station right now."}
    </p>
    ${error
      ? html`<p class="text-xs text-error">${error}</p>
          <button class="btn btn-xs btn-outline" @click=${onRefresh}>
            Retry
          </button>`
      : ""}
  </div>`;
}
