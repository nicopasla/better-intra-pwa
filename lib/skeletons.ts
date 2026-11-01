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

/** Profile hero (avatar, name, badges) plus a couple of cards. */
export function profileSkeleton(label = "Loading profile"): unknown {
  return html`
    <div class="flex flex-col gap-4" role="status" aria-label=${label}>
      <div class="flex flex-col items-center gap-2" aria-hidden="true">
        <span class="skeleton size-24 shrink-0 rounded-full"></span>
        <span class="skeleton h-5 w-40"></span>
        <span class="skeleton h-3 w-24"></span>
        <span class="mt-1 flex gap-1.5">
          <span class="skeleton h-9 w-20 rounded-full"></span>
          <span class="skeleton h-9 w-20 rounded-full"></span>
          <span class="skeleton h-9 w-20 rounded-full"></span>
        </span>
      </div>
      <div class="flex flex-col gap-3" aria-hidden="true">
        <span class="skeleton h-24 w-full rounded-box"></span>
        <span class="skeleton h-40 w-full rounded-box"></span>
      </div>
    </div>
  `;
}
