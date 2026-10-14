/**
 * Replaces a broken avatar image with a letter placeholder. The replacement
 * reuses the <img>'s classes (sizing/rounding) so the layout doesn't shift.
 */
export function avatarErrorFallback(e: Event): void {
  const img = e.target as HTMLImageElement;
  if (!img.isConnected) return;
  const parent = img.parentElement;
  if (!parent) return;
  const letter = (img.alt || "?").trim().charAt(0).toUpperCase() || "?";
  const span = document.createElement("span");
  span.className =
    `${img.className} flex items-center justify-center font-bold select-none`.trim();
  span.textContent = letter;
  span.setAttribute("aria-hidden", "true");
  parent.replaceChild(span, img);
}
