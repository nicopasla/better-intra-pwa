import type { TransitBoard } from "../../data.ts";
import { transitBoard } from "../../data.ts";
import { getSession } from "../../api.ts";
import { readScopedCache, writeCache } from "../../lib/cache.ts";
import {
  getTransitFavorites,
  toggleTransitFavorite,
} from "../../lib/prefs.ts";
import { refresh } from "../../refresh.ts";
import { currentTab } from "../../shell.ts";
import { transitView } from "./render.ts";

/**
 * Home card state for the STIB departures around Gare Centrale.
 *
 * The board is built by the worker (MobilityTwin.Brussels proxy), cached per
 * login so a cold open paints the previous minute, and polled while the
 * dashboard is visible.
 */

const CACHE_KEY = "transit_gare_centrale";
const POLL_MS = 60_000;

/** The board plus the login it was cached for. */
type CachedTransitBoard = TransitBoard & { login: string };

let board: TransitBoard | null = null;
let hydrated = false;
let loading = false;
let error = "";
let lastAttempt = 0;
let pollTimer: ReturnType<typeof setInterval> | null = null;
/** The line picker replaced the departure list. */
let picking = false;

function hydrate(): void {
  if (hydrated) return;
  hydrated = true;
  const cached = readScopedCache<CachedTransitBoard>(CACHE_KEY);
  if (cached && Array.isArray(cached.stops)) board = cached;
}

/** Fetches the current board; `silent` skips the immediate repaint. */
export function loadTransit(silent = false): void {
  if (loading) return;
  loading = true;
  lastAttempt = Date.now();
  if (!silent) refresh();

  void transitBoard()
    .then((next) => {
      board = next;
      error = "";
      const session = getSession();
      if (session) writeCache(CACHE_KEY, { ...next, login: session.login });
    })
    .catch((e: unknown) => {
      error = e instanceof Error ? e.message : String(e);
    })
    .finally(() => {
      loading = false;
      refresh();
    });
}

/** Loads the board at most once per refresh window (used on each render). */
export function ensureTransitFresh(): void {
  hydrate();
  if (loading) return;
  if (!board || Date.now() - lastAttempt >= POLL_MS) loadTransit(true);
}

export function startTransitPoll(): void {
  ensureTransitFresh();
  if (pollTimer !== null) clearInterval(pollTimer);
  pollTimer = setInterval(() => {
    if (document.hidden || currentTab() !== "dashboard") return;
    ensureTransitFresh();
  }, POLL_MS);
}

export function stopTransitPoll(): void {
  if (pollTimer === null) return;
  clearInterval(pollTimer);
  pollTimer = null;
}

function toggleLine(
  stopName: string,
  lineId: string,
  destination: string,
): void {
  toggleTransitFavorite(stopName, lineId, destination);
  refresh();
}

function togglePicker(): void {
  picking = !picking;
  refresh();
}

export function transitCard(options: { preview?: boolean } = {}): unknown {
  hydrate();
  return transitView({
    board: board ?? (options.preview ? previewBoard() : null),
    favorites: getTransitFavorites(),
    loading,
    error,
    preview: options.preview === true,
    picking,
    onRefresh: () => loadTransit(),
    onTogglePicker: togglePicker,
    onToggleLine: toggleLine,
  });
}

const PREVIEW_MINUTES = [2, 5, 9, 14, 21];

/** Sample board for the home editor when nothing has loaded yet. */
function previewBoard(): TransitBoard {
  const now = Date.now();
  const at = (index: number): string =>
    new Date(now + (PREVIEW_MINUTES[index] ?? 12) * 60_000).toISOString();

  return {
    area: "gare-centrale",
    label: "Gare Centrale",
    updatedAt: now,
    sourceUpdatedAt: null,
    stops: [
      {
        id: "preview-centrale",
        name: "GARE CENTRALE",
        lat: 50.8457,
        lon: 4.3569,
        distanceM: 20,
        departures: [
          {
            lineId: "1",
            mode: "metro",
            color: "#b5378c",
            textColor: "#ffffff",
            destination: "STOCKEL",
            at: at(0),
          },
          {
            lineId: "1",
            mode: "metro",
            color: "#b5378c",
            textColor: "#ffffff",
            destination: "STOCKEL",
            at: at(3),
          },
          {
            lineId: "5",
            mode: "metro",
            color: "#f6a90b",
            textColor: "#ffffff",
            destination: "HERRMANN-DEBROUX",
            at: at(1),
          },
          {
            lineId: "5",
            mode: "metro",
            color: "#f6a90b",
            textColor: "#ffffff",
            destination: "HERRMANN-DEBROUX",
            at: at(4),
          },
          {
            lineId: "38",
            mode: "bus",
            color: null,
            textColor: null,
            destination: "HEROS",
            at: at(0),
          },
          {
            lineId: "38",
            mode: "bus",
            color: null,
            textColor: null,
            destination: "HEROS",
            at: at(2),
          },
          {
            lineId: "71",
            mode: "bus",
            color: "#4c8b33",
            textColor: "#ffffff",
            destination: "DELTA",
            at: at(1),
          },
          {
            lineId: "95",
            mode: "bus",
            color: null,
            textColor: null,
            destination: "WIENER",
            at: at(4),
          },
        ],
      },
    ],
    meta: {
      nearbyStops: 1,
      stops: 1,
      departures: 8,
      upstreamRows: 0,
    },
  };
}
