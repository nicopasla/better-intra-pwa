export type ThemePreference = "system" | "dark" | "light";

const THEME_KEY = "ft_theme";
const media = () => window.matchMedia("(prefers-color-scheme: dark)");

export function getThemePreference(): ThemePreference {
  const stored = localStorage.getItem(THEME_KEY);
  return stored === "dark" || stored === "light" || stored === "system"
    ? stored
    : "system";
}

export function setThemePreference(mode: ThemePreference): void {
  localStorage.setItem(THEME_KEY, mode);
  applyTheme();
}

function themeColor(): string {
  const value = getComputedStyle(document.documentElement)
    .getPropertyValue("--color-base-200")
    .trim();
  return value || (media().matches ? "#1d232a" : "#e5e6e6");
}

function setMetaThemeColor(color: string): void {
  let meta = document.querySelector<HTMLMetaElement>(
    'meta[name="theme-color"]',
  );
  if (!meta) {
    meta = document.createElement("meta");
    meta.name = "theme-color";
    document.head.appendChild(meta);
  }
  meta.content = color;
}

function effectiveDark(pref: ThemePreference): boolean {
  return pref === "dark" || (pref === "system" && media().matches);
}

function applyTheme(): void {
  const pref = getThemePreference();
  document.documentElement.dataset.theme = effectiveDark(pref)
    ? "dark"
    : "light";
  setMetaThemeColor(themeColor());
}

export function initTheme(): void {
  applyTheme();
  media().addEventListener("change", applyTheme);
}
