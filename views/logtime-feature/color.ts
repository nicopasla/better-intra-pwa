/** Minimal colour helpers for the ported logtime feature (hex in, CSS out). */

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

export function parseHex(color: string): Rgb | null {
  const match = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(color.trim());
  if (!match) return null;
  let hex = match[1];
  if (hex.length === 3) {
    hex = hex
      .split("")
      .map((c) => c + c)
      .join("");
  }
  return {
    r: parseInt(hex.slice(0, 2), 16),
    g: parseInt(hex.slice(2, 4), 16),
    b: parseInt(hex.slice(4, 6), 16),
  };
}

const rgbaCache = new Map<string, string>();

export function toRgba(color: string, opacity: number): string {
  const key = `${color}|${opacity}`;
  const cached = rgbaCache.get(key);
  if (cached) return cached;
  const rgb = parseHex(color);
  const value = rgb ? `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${opacity})` : color;
  rgbaCache.set(key, value);
  return value;
}

export function perceptualLuminance(color: string): number {
  const rgb = parseHex(color);
  if (!rgb) return 128;
  return (rgb.r * 299 + rgb.g * 587 + rgb.b * 114) / 1000;
}

export function contrastText(color: string): "#000000" | "#ffffff" {
  return perceptualLuminance(color) >= 180 ? "#000000" : "#ffffff";
}

export function mixToward(
  color: string,
  target: "#ffffff" | "#000000",
  amount = 0.5,
): string {
  const rgb = parseHex(color);
  if (!rgb) return color;
  const to = target === "#ffffff" ? 255 : 0;
  const blend = (c: number) => Math.round(c + (to - c) * amount);
  return `rgb(${blend(rgb.r)}, ${blend(rgb.g)}, ${blend(rgb.b)})`;
}

/** Keeps label text readable on the active theme. */
export function safeLabelsColor(color: string, isDark: boolean): string {
  const luminance = perceptualLuminance(color);
  if (isDark && luminance < 100) return mixToward(color, "#ffffff", 0.5);
  if (!isDark && luminance > 200) return mixToward(color, "#000000", 0.5);
  return color;
}

export function isDarkTheme(): boolean {
  const mode = document.documentElement.dataset.mode;
  if (mode === "dark") return true;
  if (mode === "light") return false;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}
