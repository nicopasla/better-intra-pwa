import { html } from "lit-html";
import type { TemplateResult } from "lit-html";
import { unsafeHTML } from "lit-html/directives/unsafe-html.js";
import CHEVRON_DOWN_SVG from "../assets/chevron-down.svg?raw";

const OVERFLOW_TOLERANCE = 1;

export interface SegmentedTab<T extends string> {
  id: T;
  label: string;
  /** Shorter label used for the collapsed dropdown summary. */
  shortLabel?: string;
}

export interface SegmentedTabsOptions<T extends string> {
  tabs: SegmentedTab<T>[];
  active: T;
  /** When true, render a dropdown menu instead of the pill (set by the observer). */
  overflowing: boolean;
  /** Always render the dropdown, even when the labels would fit. */
  asDropdown?: boolean;
  onSwitch: (tab: T) => void;
}

/**
 * Students-style segmented tab control: a `bg-base-200` pill of `.tab-btn`s,
 * collapsing into a `details.dropdown` menu when the labels overflow.
 */
export function segmentedTabs<T extends string>(
  opts: SegmentedTabsOptions<T>,
): TemplateResult {
  const { tabs, active, overflowing, onSwitch } = opts;
  const activeTab = tabs.find((t) => t.id === active);
  const activeLabel = activeTab?.shortLabel ?? activeTab?.label ?? "";
  const dropdown = overflowing || opts.asDropdown === true;

  return html`
    <div
      class="segmented-tabs-host"
      style="${dropdown ? "flex:0 0 auto;min-width:0;" : ""}"
    >
      ${dropdown
        ? html`
            <details class="dropdown dropdown-start dropdown-top">
              <summary
                class="btn btn-sm btn-outline border-base-content/20 gap-1.5 list-none"
                data-tip="Select tab"
                data-tip-size="14px"
              >
                <span
                  class="text-xs font-semibold uppercase tracking-wide whitespace-nowrap"
                  >${activeLabel}</span
                >
                <span class="size-3 shrink-0 flex items-center justify-center">
                  ${unsafeHTML(
                    CHEVRON_DOWN_SVG.replace(
                      "<svg",
                      '<svg width="12" height="12"',
                    ),
                  )}
                </span>
              </summary>
              <ul
                class="menu menu-md dropdown-content z-40 mb-2 max-h-72 overflow-auto rounded-box bg-base-100 p-2 shadow-xl"
                style="width:max-content;min-width:14rem;max-width:calc(100vw - 2rem);"
              >
                ${tabs.map(
                  (t) => html`
                    <li>
                      <button
                        type="button"
                        class="${t.id === active
                          ? "menu-active"
                          : ""} whitespace-nowrap py-2 text-sm"
                        @click="${() => onSwitch(t.id)}"
                      >
                        ${t.label}
                      </button>
                    </li>
                  `,
                )}
              </ul>
            </details>
          `
        : html`
            <div
              class="flex flex-1 gap-1 rounded-lg bg-base-200 p-1"
              style="border-radius:var(--radius-field)"
            >
              ${tabs.map(
                (t) => html`
                  <button
                    class="tab-btn ${t.id === active ? "active" : ""}"
                    @click="${() => onSwitch(t.id)}"
                  >
                    ${t.label}
                  </button>
                `,
              )}
            </div>
          `}
    </div>
  `;
}

/** Measures whether the labels would overflow the host at its current width. */
export function measureTabsOverflow(
  host: HTMLElement,
  labels: string[],
): boolean {
  if (host.clientWidth === 0) return false;
  const probe = document.createElement("div");
  probe.style.cssText =
    "position:absolute;top:0;left:-9999px;visibility:hidden;display:flex;gap:4px;padding:4px;width:max-content;white-space:nowrap;";
  for (const label of labels) {
    const item = document.createElement("span");
    item.className = "tab-btn";
    item.style.cssText = "flex:0 0 auto;white-space:nowrap;";
    item.textContent = label;
    probe.appendChild(item);
  }
  host.appendChild(probe);
  const overflows = probe.scrollWidth - host.clientWidth > OVERFLOW_TOLERANCE;
  probe.remove();
  return overflows;
}

/**
 * Observes a `.segmented-tabs-host` (matched by `selector`) and reports overflow
 * changes. Re-create after each render; disconnect the previous one first.
 */
export function observeTabsOverflow(
  selector: string,
  labels: string[],
  onChange: (overflowing: boolean) => void,
): ResizeObserver {
  const ro = new ResizeObserver(() => {
    requestAnimationFrame(() => {
      const host = document.querySelector<HTMLElement>(selector);
      if (!host) return;
      onChange(measureTabsOverflow(host, labels));
    });
  });
  const host = document.querySelector<HTMLElement>(selector);
  if (host) ro.observe(host);
  return ro;
}
