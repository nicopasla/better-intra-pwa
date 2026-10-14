let count = 0;

/** Prevents the page behind a modal from scrolling while it's open. */
export function lockScroll(): void {
  if (count++ === 0) {
    document.documentElement.style.overflow = "hidden";
    document.body.style.overflow = "hidden";
  }
}

/** Releases the scroll lock; only the last holder actually unlocks. */
export function unlockScroll(): void {
  if (count === 0) return;
  if (--count === 0) {
    document.documentElement.style.overflow = "";
    document.body.style.overflow = "";
  }
}
