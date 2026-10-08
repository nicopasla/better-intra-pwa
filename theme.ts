const media = () => window.matchMedia("(prefers-color-scheme: dark)");

function themeColor(): string {
  const value = getComputedStyle(document.documentElement)
    .getPropertyValue("--color-base-200")
    .trim();
  return value || (media().matches ? "#1d232a" : "#e5e6e6");
}

function setMetaThemeColor(color: string): void {
  let meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (!meta) {
    meta = document.createElement("meta");
    meta.name = "theme-color";
    document.head.appendChild(meta);
  }
  meta.content = color;
}

function applyTheme(): void {
  document.documentElement.dataset.theme = media().matches ? "dark" : "light";
  setMetaThemeColor(themeColor());
}

export function initTheme(): void {
  applyTheme();
  media().addEventListener("change", applyTheme);
}