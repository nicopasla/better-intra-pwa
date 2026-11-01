import { html } from "lit-html";

/**
 * Avatar + two text lines + chip, repeated. Used while a list of people loads
 * (online list, cluster connections, …).
 */
export function rowSkeleton(
  count = 6,
  avatar = "size-10",
  padding = "px-4",
): unknown {
  const widths = ["w-1/3", "w-2/5", "w-1/4", "w-1/2"];
  return html`
    <div role="status" aria-label="Loading">
      <ul
        class="flex flex-col divide-y divide-base-300 ${padding}"
        aria-hidden="true"
      >
        ${Array.from(
          { length: count },
          (_, i) => html`
            <li class="flex items-center gap-3 py-2">
              <span class="skeleton ${avatar} shrink-0 rounded-full"></span>
              <span class="flex min-w-0 flex-1 flex-col gap-1.5">
                <span class="skeleton h-3 ${widths[i % widths.length]}"></span>
                <span class="skeleton h-2.5 w-16"></span>
              </span>
              <span class="skeleton h-6 w-12 shrink-0 rounded-full"></span>
            </li>
          `,
        )}
      </ul>
    </div>
  `;
}

/** Mirrors the Profile tab's fixed evaluations + roulette cards. */
export function profileTabSkeleton(label = "Loading your profile"): unknown {
  return html`
    <div
      class="fixed left-0 right-0 z-10 flex flex-col gap-3 px-4"
      style="top: calc(env(safe-area-inset-top) + 1rem); bottom: calc(8.5rem + env(safe-area-inset-bottom));"
      role="status"
      aria-label=${label}
    >
      <div
        class="flex-60 min-h-0 flex flex-col card bg-base-100 shadow-xl overflow-hidden"
      >
        <div class="card-body min-h-0" aria-hidden="true">
          <span class="skeleton h-5 w-28"></span>
          <div class="flex items-stretch justify-center gap-2">
            <span class="skeleton h-9 w-16 rounded-xl"></span>
            <span class="skeleton h-9 flex-1 rounded-xl"></span>
            <span class="skeleton h-9 flex-1 rounded-xl"></span>
          </div>
          <div class="mt-2 flex min-h-0 flex-1 flex-col gap-2.5">
            ${Array.from(
              { length: 6 },
              (_, i) => html`
                <span
                  class="skeleton h-3 ${i % 3 === 2 ? "w-2/3" : "w-full"}"
                ></span>
              `,
            )}
          </div>
        </div>
      </div>
      <div
        class="flex-40 min-h-0 flex flex-col card bg-base-100 shadow-xl overflow-hidden"
      >
        <div class="card-body min-h-0" aria-hidden="true">
          <span class="skeleton h-5 w-36"></span>
          <div class="flex items-stretch justify-center gap-2">
            <span class="skeleton h-9 flex-1 rounded-xl"></span>
            <span class="skeleton h-9 flex-1 rounded-xl"></span>
          </div>
          <div class="mt-2 flex min-h-0 flex-1 flex-col gap-2.5">
            <span class="skeleton h-3 w-full"></span>
            <span class="skeleton h-3 w-5/6"></span>
            <span class="skeleton h-3 w-3/4"></span>
          </div>
        </div>
      </div>
    </div>
  `;
}
