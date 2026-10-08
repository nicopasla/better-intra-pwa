import { StudentEntry } from "../data.ts";

export function isBlackholed(e: StudentEntry): boolean {
  return (
    e.active === false &&
    typeof e.blackholed_at === "string" &&
    new Date(e.blackholed_at).getTime() < Date.now()
  );
}

export function isFrozen(e: StudentEntry): boolean {
  return (
    e.active === false &&
    typeof e.blackholed_at === "string" &&
    new Date(e.blackholed_at).getTime() >= Date.now()
  );
}

export function formatShortDate(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}/${d.getFullYear()}`;
}

export function formatMonthYear(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${String(d.getMonth() + 1).padStart(2, "0")}/${String(
    d.getFullYear(),
  ).slice(-2)}`;
}

export function formatLevel(level?: number): string {
  if (typeof level !== "number") return "";
  return `Lvl ${level.toFixed(2)}`;
}

const monthLabel = (value: number) =>
  new Date(Date.UTC(2000, value - 1, 1)).toLocaleDateString("en-US", {
    month: "long",
  });

export function formatPool(e: StudentEntry): string {
  if (!e.pool_month || !e.pool_year) return "";
  const d = new Date(Date.parse(`${e.pool_month} 1, 2000`));
  if (Number.isNaN(d.getTime())) return "";
  return `${String(d.getMonth() + 1).padStart(2, "0")}/${e.pool_year.slice(-2)}`;
}

export function formatPoolFull(e: StudentEntry): string {
  if (!e.pool_month || !e.pool_year) return "";
  const d = new Date(Date.parse(`${e.pool_month} 1, 2000`));
  if (Number.isNaN(d.getTime())) return "";
  return `${monthLabel(d.getMonth() + 1)} ${e.pool_year}`;
}

export function nextIntakes(now: Date): { month: number; year: number }[] {
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const april = month <= 4 ? { month: 4, year } : { month: 4, year: year + 1 };
  const october =
    month <= 10 ? { month: 10, year } : { month: 10, year: year + 1 };
  return [april, october].sort((a, b) => a.year - b.year || a.month - b.month);
}
