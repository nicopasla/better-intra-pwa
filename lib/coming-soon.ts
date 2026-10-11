import { html } from "lit-html";
import type { TemplateResult } from "lit-html";
import { unsafeHTML } from "lit-html/directives/unsafe-html.js";

export interface ComingSoonOptions {
  /** Raw SVG string for the feature icon. */
  icon: string;
  description: string;
}

/** Placeholder shown for features that aren't available to the user yet. */
export function comingSoonView(opts: ComingSoonOptions): TemplateResult {
  return html`
    <div
      class="flex min-h-[calc(100dvh-10rem)] items-center justify-center px-4"
    >
      <div class="card bg-base-100 shadow-xl w-full max-w-sm">
        <div class="card-body items-center gap-3 text-center">
          <span class="size-12 flex items-center justify-center opacity-40"
            >${unsafeHTML(
              opts.icon.replace("<svg", '<svg width="48" height="48"'),
            )}</span
          >
          <h2 class="text-lg font-bold">Coming soon</h2>
          <p class="text-sm opacity-60 max-w-xs">${opts.description}</p>
        </div>
      </div>
    </div>
  `;
}
