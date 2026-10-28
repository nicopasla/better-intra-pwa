import { getSession } from "./api.ts";
import { getBlob } from "./data.ts";
import { presetLabel, THEME_PRESETS } from "./lib/theme-presets.ts";

/**
 * Theme preference.
 *
 * `system` / `light` / `dark` are local to this device, exactly like before.
 * `extension` mirrors the colours chosen in the Better Intra extension, read
 * from the cloud settings blob (`BETTER_INTRA_THEME` + `PROFILE_THEME_PRESET`).
 * It is intentionally read-only: the phone never writes the theme back, so a
 * scheduled/dark setup on desktop can't be clobbered from here.
 */
export type ThemeMode = "system" | "light" | "dark" | "extension";
/** @deprecated kept for older imports. */
export type ThemePreference = ThemeMode;

export interface ResolvedTheme {
  /** daisyUI theme name put on `data-theme`. */
  preset: string;
  /** Effective colour mode, used by custom CSS that needs to know. */
  mode: "light" | "dark";
}

/** The subset of the cloud settings blob that drives the theme. */
export interface ThemeSettings {
  mode?: unknown;
  preset?: unknown;
  scheduleDark?: unknown;
  scheduleLight?: unknown;
}

const THEME_KEY = "ft_theme";
const RESOLVED_KEY = "ft_theme_resolved";

const media = () => window.matchMedia("(prefers-color-scheme: dark)");

/** Cloud theme settings, once the blob has been loaded this session. */
let cloudSettings: ThemeSettings | null = null;
let cloudFetch: Promise<void> | null = null;

function readResolvedCache(): ResolvedTheme | null {
  try {
    const raw = localStorage.getItem(RESOLVED_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<ResolvedTheme>;
    if (
      typeof parsed?.preset !== "string" ||
      !THEME_PRESETS.has(parsed.preset) ||
      (parsed.mode !== "dark" && parsed.mode !== "light")
    ) {
      return null;
    }
    return { preset: parsed.preset, mode: parsed.mode };
  } catch {
    return null;
  }
}

export function getThemePreference(): ThemeMode {
  try {
    const stored = localStorage.getItem(THEME_KEY);
    return stored === "dark" ||
      stored === "light" ||
      stored === "system" ||
      stored === "extension"
      ? stored
      : "system";
  } catch {
    return "system";
  }
}

export function setThemePreference(mode: ThemeMode): void {
  localStorage.setItem(THEME_KEY, mode);
  applyTheme();
  // Entering "Extension" may need the blob that isn't loaded yet.
  if (mode === "extension" && !cloudSettings) void syncThemeFromCloud();
}

function presetOrNull(value: unknown): string | null {
  return typeof value === "string" && THEME_PRESETS.has(value) ? value : null;
}

function settingsMode(settings: ThemeSettings): "light" | "dark" {
  if (settings.mode === "dark") return "dark";
  if (settings.mode === "light") return "light";
  // `system`, `schedule` and unknown values follow the phone's appearance.
  return media().matches ? "dark" : "light";
}

/** Port of the extension's `resolveDaisyTheme()` for built-in presets only. */
function resolveExtensionTheme(settings: ThemeSettings): ResolvedTheme {
  const mode = settingsMode(settings);

  if (settings.mode === "schedule") {
    const scheduled = presetOrNull(
      mode === "dark" ? settings.scheduleDark : settings.scheduleLight,
    );
    return { preset: scheduled ?? mode, mode };
  }

  const preset = presetOrNull(settings.preset);
  // A named preset wins over the plain mode; "dark"/"light" defer to the mode.
  const resolved =
    preset && preset !== "dark" && preset !== "light" ? preset : mode;
  return { preset: resolved, mode };
}

export function resolveTheme(
  pref: ThemeMode,
  settings: ThemeSettings | null,
): ResolvedTheme {
  if (pref === "extension" && settings) return resolveExtensionTheme(settings);
  if (pref === "light") return { preset: "light", mode: "light" };
  if (pref === "dark") return { preset: "dark", mode: "dark" };
  const mode = media().matches ? "dark" : "light";
  return { preset: mode, mode };
}

/** What the app is showing right now (used by Settings to name the theme). */
export function currentResolvedTheme(): ResolvedTheme {
  const pref = getThemePreference();
  if (pref === "extension") {
    if (cloudSettings) return resolveExtensionTheme(cloudSettings);
    return readResolvedCache() ?? resolveTheme("system", null);
  }
  return resolveTheme(pref, null);
}

export function currentThemeLabel(): string {
  const resolved = currentResolvedTheme();
  return `${presetLabel(resolved.preset)} · ${resolved.mode}`;
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

function applyTheme(): void {
  const resolved = currentResolvedTheme();
  const root = document.documentElement;
  root.dataset.theme = resolved.preset;
  root.dataset.mode = resolved.mode;
  setMetaThemeColor(themeColor());
  // Cache for the pre-paint script in index.html.
  try {
    localStorage.setItem(RESOLVED_KEY, JSON.stringify(resolved));
  } catch {
    /* storage full or disabled */
  }
}

/** Applies theme keys from the cloud settings blob. */
export function applyThemeSettings(settings: Record<string, unknown>): void {
  cloudSettings = {
    mode: settings.BETTER_INTRA_THEME,
    preset: settings.PROFILE_THEME_PRESET,
    scheduleDark: settings.THEME_SCHEDULE_DARK_PRESET,
    scheduleLight: settings.THEME_SCHEDULE_LIGHT_PRESET,
  };
  if (getThemePreference() === "extension") applyTheme();
}

/**
 * Pulls the cloud settings blob so "Extension" can mirror the desktop theme.
 * Failures keep the cached theme; offline is not an error here.
 */
export function syncThemeFromCloud(): Promise<void> {
  // Only the mirror mode needs the blob; the other modes are device-local.
  if (getThemePreference() !== "extension") return Promise.resolve();
  if (!getSession()) return Promise.resolve();
  if (cloudFetch) return cloudFetch;
  cloudFetch = (async () => {
    try {
      const blob = await getBlob();
      applyThemeSettings(blob.settings as Record<string, unknown>);
    } catch {
      /* keep the cached theme */
    } finally {
      cloudFetch = null;
    }
  })();
  return cloudFetch;
}

export function initTheme(): void {
  applyTheme();
  media().addEventListener("change", () => {
    const pref = getThemePreference();
    // Only appearance-driven modes need a repaint.
    if (pref === "system" || pref === "extension") applyTheme();
  });
}
