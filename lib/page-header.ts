import { html } from "lit-html";
import type { TemplateResult } from "lit-html";

export interface PageHeaderOptions {
  /** Content on the left (usually a count badge). */
  leading?: unknown;
  /** Controls on the right. */
  trailing?: unknown;
  /** Give the leading group its own full-width row (e.g. a full-width search). */
  stack?: boolean;
  /** Center the trailing group on its own full-width row. */
  trailingCenter?: boolean;
}

/**
 * Sticky page header bar shared by Friends, Students and Clusters: a leading
 * group (count badge) on the left and controls on the right.
 */
export function pageHeader(opts: PageHeaderOptions): TemplateResult {
  return html`
    <div
      class="flex flex-wrap items-center gap-2 px-0 pt-4 pb-4 border-b border-base-300 bg-base-200 shrink-0 sticky top-[env(safe-area-inset-top)] z-10"
    >
      <div
        class="flex items-center gap-2.5 min-w-0 flex-wrap ${opts.stack
          ? "basis-full"
          : ""}"
      >
        ${opts.leading ?? ""}
      </div>
      ${opts.trailing
        ? html`<div
            class="flex items-center gap-2 min-w-0 flex-wrap ${opts.trailingCenter
              ? "basis-full justify-center"
              : "ml-auto justify-end"}"
          >
            ${opts.trailing}
          </div>`
        : ""}
    </div>
  `;
}

export interface HeaderBadgeOptions {
  tip?: string;
  /** daisyUI `badge-*` colour class (default `badge-primary`). */
  class?: string;
  /** Draw the thicker coloured ring around the badge (default true). */
  ring?: boolean;
}

/** The standard count badge used in the shared header's leading group. */
export function headerBadge(
  content: unknown,
  opts: HeaderBadgeOptions = {},
): TemplateResult {
  const border =
    opts.ring === false
      ? ""
      : "border:3px solid color-mix(in oklab, var(--color-primary) 55%, transparent);";
  return html`
    <span
      class="badge ${opts.class ?? "badge-primary"} font-bold font-mono"
      style="${border}border-radius:var(--radius-field);height:2.5rem;padding-block:0;font-weight:600;min-width:2.5rem;justify-content:center;"
      data-tip="${opts.tip ?? ""}"
      >${content}</span
    >
  `;
}
