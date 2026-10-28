/**
 * Built-in themes available to the app.
 *
 * Mirrors the extension's preset list (`src/features/profile/theme/themes.json`
 * in the better-intra repo): the 31 stock daisyUI themes plus the five custom
 * ones declared in `style.css`. Custom user themes are not supported on mobile
 * yet; an unknown preset id falls back to the plain dark/light mode.
 */

export const THEME_PRESETS: ReadonlySet<string> = new Set([
  "light",
  "dark",
  "cupcake",
  "bumblebee",
  "emerald",
  "corporate",
  "synthwave",
  "retro",
  "cyberpunk",
  "valentine",
  "halloween",
  "garden",
  "forest",
  "aqua",
  "lofi",
  "pastel",
  "fantasy",
  "wireframe",
  "black",
  "luxury",
  "dracula",
  "cmyk",
  "autumn",
  "acid",
  "lemonade",
  "night",
  "coffee",
  "winter",
  "dim",
  "nord",
  "sunset",
  "caramellatte",
  "silk",
  "soap",
  "citrus",
  "neon",
  "seishin",
  "twilight",
]);

const LABELS: Record<string, string> = {
  caramellatte: "Caramel latte",
  cmyk: "CMYK",
};

/** Human name for a preset id ("synthwave" → "Synthwave"). */
export function presetLabel(id: string): string {
  const known = LABELS[id];
  if (known) return known;
  return id.charAt(0).toUpperCase() + id.slice(1);
}
