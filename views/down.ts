import { html } from "lit-html";

export function downView(
  status: number,
  onRetry: () => void,
  onBypass: () => void,
): unknown {
  return html`
    <div class="flex-1 flex flex-col items-center justify-center gap-4 p-4">
      <div class="w-full max-w-lg" style="aspect-ratio:3/2" aria-hidden="true">
        <img
          src="https://http.cat/${status}"
          alt=""
          referrerpolicy="no-referrer"
          class="h-full w-full object-contain"
          @error=${(e: Event) => {
            (e.currentTarget as HTMLImageElement).style.display = "none";
          }}
        />
      </div>
      <div class="flex w-full max-w-sm flex-col items-center gap-3 text-center">
        <div class="alert w-full justify-center">
          <span class="text-sm font-medium">
            Can't reach 42 Intra. Retrying automatically.
          </span>
        </div>
        <button class="btn btn-primary w-full" @click=${onRetry}>
          Try again
        </button>
        <button class="btn btn-ghost btn-sm" @click=${onBypass}>
          Show cached data
        </button>
      </div>
    </div>
  `;
}
