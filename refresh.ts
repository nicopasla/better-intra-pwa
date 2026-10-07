let rerender: () => void = () => {};

export function setRefresh(fn: () => void): void {
  rerender = fn;
}

/** Ask the app shell to repaint using cached view state. */
export function refresh(): void {
  rerender();
}