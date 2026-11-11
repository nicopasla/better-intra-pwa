import { getSession, workerFetch } from "../../api.ts";
import {
  mockMode,
  mockRecordSeatReports,
  mockSeatHistory,
  mockSeatReports,
} from "../../mock.ts";
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
    replace(mockSeatReports());
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

/** Status-change history for a seat, newest first. */
export async function loadSeatHistory(
  host: string,
): Promise<SeatReportEvent[]> {
  const key = normalizeHost(host);
  if (mockMode) return mockSeatHistory(key);
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
    // Unknown keys are components removed from the catalog (e.g. the retired
    // "audio"); their stale rows must not count as issues.
    if (!def) continue;
    // A missing USB-C port is not a defect: presence answers never mark the
    // seat as broken.
    if (def.kind === "presence") continue;
    if (def.severity === "blocking") return "blocking";
    severity = "minor";
  }
  return severity;
}

/**
 * Broken components that do not cross the seat out: keyboard and mouse scroll.
 * Used for the map's warning glyph, so a crossed seat keeps its cross and only
 * the non-blocking issues get the triangle.
 */
export function getMinorSeatIssues(host: string): SeatComponentKey[] {
  const report = getSeatReport(host);
  if (!report) return [];
  const issues: SeatComponentKey[] = [];
  for (const component of report.components) {
    if (component.status !== "broken") continue;
    const def = SEAT_COMPONENT_MAP.get(component.component);
    if (!def || def.kind === "presence") continue;
    if (def.severity !== "minor") continue;
    issues.push(component.component);
  }
  return issues;
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
      reporter: getSession()?.login ?? null,
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
    mockRecordSeatReports(
      [...byHost.values()],
      key,
      entries,
      getSession()?.login ?? null,
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
