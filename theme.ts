const media = () => window.matchMedia("(prefers-color-scheme: dark)");

function applyTheme(): void {
  document.documentElement.dataset.theme = media().matches ? "dark" : "light";
}

export function initTheme(): void {
  applyTheme();
  media().addEventListener("change", applyTheme);
}