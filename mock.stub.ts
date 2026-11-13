/**
 * Production stand-in for `mock.ts` (wired up in `vite.config.ts`).
 * Fixtures are a dev-only tool: `npm run dev` renders them, and production
 * builds resolve every `mock.ts` import to this stub instead.
 */
export const mockMode = false;
export const mock: Record<string, unknown> = {};
export const mockTransitBoard = (): Record<string, unknown> => ({
  area: "gare-centrale",
  label: "Gare Centrale",
  updatedAt: Date.now(),
  sourceUpdatedAt: null,
  stops: [],
  meta: { nearbyStops: 0, stops: 0, departures: 0, upstreamRows: 0 },
});
export const mockOccupancy = (): unknown[] => [];
export const mockSeatReports = (): unknown[] => [];
export const mockSeatHistory = (): unknown[] => [];
export const mockRecordSeatReports = (): void => {};
