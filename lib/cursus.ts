import type { Me } from "../data.ts";

/**
 * The label shown on top of the level, e.g. "Cadet at 42cursus" — the grade
 * rank combined with the current cursus name.
 */
export function cursusLabel(m: Me): string {
  const cursusName = m.cursus?.name ?? "42cursus";
  const rank = m.grade?.split(" at ")[0]?.trim();
  return rank ? `${rank} at ${cursusName}` : cursusName;
}
