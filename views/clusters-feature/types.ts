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
