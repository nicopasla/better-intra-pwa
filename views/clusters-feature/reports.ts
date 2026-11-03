import { workerFetch } from "../../api.ts";
import { mockMode } from "../../mock.ts";
import type {
  SeatComponentKey,
  SeatSeverity,
} from "./components";
import { SEAT_COMPONENT_MAP } from "./components";
import type {
  SeatComponentReport,
  SeatComponentStatus,
  SeatHistoryResponse,
  SeatReport,
  SeatReportEvent,
  SeatReportsResponse,
} from "./types";

export interface SeatReportInput {
  component: SeatComponentKey;
  status: SeatComponentStatus;
}

const byHost = new Map<string, SeatReport>();

const MOCK_REPORTS: SeatReport[] = [
  {
    host: "fu-r1-p2",
    cluster: "fu",
    components: [
      {
        component: "boot",
        status: "broken",
        updatedAt: Date.now() - 5 * 60_000,
        confirmations: 2,
      },
    ],
  },
  {
    host: "fu-r2-p3",
    cluster: "fu",
    components: [
      {
        component: "keyboard",
        status: "broken",
        updatedAt: Date.now() - 20 * 60_000,
        confirmations: 1,
      },
      {
        component: "audio",
        status: "works",
        updatedAt: Date.now() - 20 * 60_000,
        confirmations: 1,
      },
    ],
  },
];

let mockReports: SeatReport[] = MOCK_REPORTS.map((seat) => ({
  ...seat,
  components: seat.components.map((component) => ({ ...component })),
}));

type MockHistoryEvent = SeatReportEvent & { host: string };

let mockHistory: MockHistoryEvent[] = MOCK_REPORTS.flatMap((seat) =>
  seat.components.map((component) => ({
    host: seat.host,
    component: component.component,
    status: component.status,
    createdAt: component.updatedAt,
  })),
);

function normalizeHost(host: string): string {
  return host.trim().toLowerCase();
}

function replace(seats: SeatReport[]): void {
  byHost.clear();
  for (const seat of seats) {
    if (!seat?.host) continue;
    byHost.set(normalizeHost(seat.host), seat);
  }
}

/** Loads the current reports. Failures keep the previous map (offline). */
export async function loadSeatReports(): Promise<void> {
  if (mockMode) {
    replace(mockReports);
    return;
  }
  try {
    const res = await workerFetch("/api/v1/private/cluster/reports");
    if (!res.ok) return;
    const data = (await res.json()) as SeatReportsResponse;
    replace(data.seats ?? []);
  } catch {
    /* offline / aborted: keep the last known reports */
  }
}

export function getSeatReport(host: string): SeatReport | undefined {
  return byHost.get(normalizeHost(host));
}

/** Anonymous status-change history for a seat, newest first. */
export async function loadSeatHistory(
  host: string,
): Promise<SeatReportEvent[]> {
  const key = normalizeHost(host);
  if (mockMode) {
    return mockHistory
      .filter((event) => event.host === key)
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, 50)
      .map(({ host: _host, ...event }) => event);
  }
  const res = await workerFetch(
    `/api/v1/private/cluster/reports/history?host=${encodeURIComponent(key)}`,
  );
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = (await res.json()) as SeatHistoryResponse;
  return (data.events ?? []).sort((a, b) => b.createdAt - a.createdAt);
}

/** Worst active issue on a seat, or null when nothing is broken. */
export function getSeatSeverity(host: string): SeatSeverity | null {
  const report = getSeatReport(host);
  if (!report) return null;
  let severity: SeatSeverity | null = null;
  for (const component of report.components) {
    if (component.status !== "broken") continue;
    const def = SEAT_COMPONENT_MAP.get(component.component);
    if (def?.severity === "blocking") return "blocking";
    severity = "minor";
  }
  return severity;
}

/** Current status for one component, or null when it was never reported. */
export function getComponentStatus(
  host: string,
  component: SeatComponentKey,
): SeatComponentReport | undefined {
  return getSeatReport(host)?.components.find(
    (entry) => entry.component === component,
  );
}

function applyLocally(
  host: string,
  cluster: string | null,
  entries: SeatReportInput[],
): SeatReport {
  const key = normalizeHost(host);
  const previous = byHost.get(key);
  const components = new Map<SeatComponentKey, SeatComponentReport>();
  for (const component of previous?.components ?? []) {
    components.set(component.component, { ...component });
  }
  const now = Date.now();
  for (const entry of entries) {
    const existing = components.get(entry.component);
    components.set(entry.component, {
      component: entry.component,
      status: entry.status,
      updatedAt: now,
      confirmations:
        existing?.status === entry.status
          ? (existing.confirmations ?? 1) + 1
          : 1,
    });
  }
  const seat: SeatReport = {
    host: key,
    cluster: cluster ?? previous?.cluster ?? null,
    components: [...components.values()],
  };
  byHost.set(key, seat);
  return seat;
}

/**
 * Sends a batch of component statuses. The UI is updated optimistically and
 * rolled back if the worker rejects the request.
 */
export async function submitSeatReports(
  host: string,
  cluster: string | null,
  entries: SeatReportInput[],
): Promise<void> {
  const key = normalizeHost(host);
  const previous = byHost.get(key);
  applyLocally(key, cluster, entries);

  if (mockMode) {
    mockReports = [...byHost.values()].map((seat) => ({
      ...seat,
      components: seat.components.map((component) => ({ ...component })),
    }));
    const now = Date.now();
    mockHistory.push(
      ...entries.map((entry) => ({
        host: key,
        component: entry.component,
        status: entry.status,
        createdAt: now,
      })),
    );
    return;
  }

  try {
    const res = await workerFetch("/api/v1/private/cluster/reports", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        host: key,
        cluster: cluster ?? undefined,
        reports: entries,
      }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = (await res.json()) as { seat: SeatReport | null };
    if (data.seat) byHost.set(key, data.seat);
  } catch (error) {
    if (previous) byHost.set(key, previous);
    else byHost.delete(key);
    throw error;
  }
}

/** Number of seats with a blocking issue and with only minor issues. */
export function reportedSeatCounts(seatIds: Iterable<string>): {
  blocking: number;
  minor: number;
} {
  let blocking = 0;
  let minor = 0;
  for (const host of seatIds) {
    const severity = getSeatSeverity(host);
    if (severity === "blocking") blocking++;
    else if (severity === "minor") minor++;
  }
  return { blocking, minor };
}
