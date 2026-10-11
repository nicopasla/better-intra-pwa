export function isRetryableError(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e);
  if (msg === "not_authenticated") return false;
  if (/^HTTP 5\d\d$/.test(msg) || msg === "HTTP 429") return true;
  if (/^HTTP 4\d\d$/.test(msg)) return false;
  return e instanceof TypeError;
}

export function friendlyError(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  if (msg === "not_authenticated") return "Your session has expired.";
  if (/^HTTP 5\d\d$/.test(msg) || msg === "HTTP 429")
    return "The server is busy. We'll keep trying.";
  if (e instanceof TypeError) return "Network problem. We'll keep trying.";
  return msg;
}

const BASE_DELAY_MS = 3_000;
const MAX_DELAY_MS = 30_000;

export class Retrier {
  private timer: number | null = null;
  private attempts = 0;

  constructor(
    private readonly reload: () => void,
    private readonly isActive: () => boolean,
  ) {}

  reset(): void {
    this.attempts = 0;
    if (this.timer != null) {
      window.clearTimeout(this.timer);
      this.timer = null;
    }
  }

  schedule(): void {
    if (this.timer != null) return;
    const delay = Math.min(MAX_DELAY_MS, BASE_DELAY_MS * 2 ** this.attempts);
    this.attempts++;
    this.timer = window.setTimeout(() => {
      this.timer = null;
      if (this.isActive()) this.reload();
    }, delay);
  }
}
