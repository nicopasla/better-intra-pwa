export interface OccupancyEntry {
  host: string;
  login: string;
  name?: string;
  cdn_uri: string;
  custom_avatar?: string | null;
  begin_at: string;
  end_at: string | null;
}

export type ActiveSortMode = "name" | "since";

export type SortDir = "asc" | "desc";

export interface OccupancyResponse {
  campus: string;
  entries: OccupancyEntry[];
  updatedAt: number;
}
