import type { SeatComponentKey } from "./components";

export interface OccupancyEntry {
  host: string;
  login: string;
  name?: string;
  cdn_uri: string;
  custom_avatar?: string | null;
  avatar_url?: string | null;
  begin_at: string;
  end_at: string | null;
}

export type SeatComponentStatus = "broken" | "works";

export interface SeatComponentReport {
  component: SeatComponentKey;
  status: SeatComponentStatus;
  updatedAt: number;
  confirmations: number;
  /** 42 login of the last reporter (absent on pre-tracking reports). */
  reporter: string | null;
}

export interface SeatReport {
  host: string;
  cluster: string | null;
  components: SeatComponentReport[];
}

export interface SeatReportsResponse {
  seats: SeatReport[];
  updatedAt: number;
}

export interface SeatReportEvent {
  component: SeatComponentKey;
  status: SeatComponentStatus;
  createdAt: number;
  /** 42 login of the reporter (absent on pre-tracking events). */
  reporter: string | null;
}

export interface SeatHistoryResponse {
  events: SeatReportEvent[];
}

export type ActiveSortMode = "name" | "since";

export type SortDir = "asc" | "desc";

export interface OccupancyResponse {
  campus: string;
  entries: OccupancyEntry[];
  updatedAt: number;
}
