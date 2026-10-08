import { html } from "lit-html";
import { unsafeHTML } from "lit-html/directives/unsafe-html.js";
import { ref } from "lit-html/directives/ref.js";
import {
  Intake,
  StudentEntry,
  studentsPage,
  StudentsPageResponse,
} from "../data.ts";
import { loginUrl } from "../api.ts";
import { refresh } from "../refresh.ts";
import {
  formatLevel,
  formatPool,
  isBlackholed,
  isFrozen,
  nextIntakes,
} from "./students-utils.ts";
import SORT_AZ_SVG from "../assets/sort-az.svg?raw";
import SORT_ZA_SVG from "../assets/sort-za.svg?raw";
import CAL_UP_SVG from "../assets/calendar-arrow-up.svg?raw";
import CAL_DOWN_SVG from "../assets/calendar-arrow-down.svg?raw";
import RELOAD_SVG from "../assets/reload.svg?raw";
import X_SVG from "../assets/x.svg?raw";

const PAGE = 60;
const TEAL = "#00babc";

type SortField = "name" | "date";
type SortDir = "asc" | "desc";
type Filter = "none" | "blackhole" | "alumni" | "freeze";

let entries: StudentEntry[] = [];
let total = 0;
let active = 0;
let filtered = 0;
let options: { intakes: Intake[]; poolYears: number[] } = {
  intakes: [],
  poolYears: [],
};
let loading = true;
let loadingMore = false;
let error = "";
let unauthorized = false;
let loaded = false;

let sort: SortField = "name";
let nameDir: SortDir = "asc";
let dateDir: SortDir = "desc";
let filter: Filter = "none";
let query = "";
let poolIntake: Intake | null = null;
let poolYear: number | null = null;
let searchTimer: number | null = null;
let sentinelObserver: IntersectionObserver | null = null;
let copiedLogin = "";

const svg16 = (raw: string) =>
  unsafeHTML(raw.replace("<svg", '<svg width="16" height="16"'));

const dir = (): SortDir => (sort === "name" ? nameDir : dateDir);

export function studentsView(): unknown {
  if (loading) {
    return html`<div class="flex justify-center py-10">
      <span class="loading loading-spinner loading-lg"></span>
    </div>`;
  }
  if (unauthorized) return connectCard();
  if (error) {
    return html`<div class="card bg-base-100 shadow-xl">
      <div class="card-body items-center gap-3">
        <p class="text-sm opacity-70">Couldn't load students.</p>
        <p class="text-xs text-error">${error}</p>
        <button class="btn btn-sm btn-outline" @click=${() => loadFirst()}>
          Retry
        </button>
      </div>
    </div>`;
  }

  const hasMore = entries.length < filtered;
  const statusActive = filter !== "none";

  return html`
    ${controls()}

    <div class="flex items-center gap-2 mb-2 text-sm">
      <span class="badge badge-accent"
        >${filtered}${statusActive ? "" : ` / ${total}`}</span
      >
      ${statusActive
        ? html`<span class="badge badge-ghost">${filter}</span>`
        : ""}
    </div>

    ${entries.length === 0
      ? html`<p class="text-sm opacity-60 text-center py-8">
          ${query || filter !== "none" || poolIntake || poolYear
            ? "No results"
            : "No data"}
        </p>`
      : html`<div class="grid grid-cols-1 gap-2">
          ${entries.map((e) => renderRow(e))}
        </div>`}
    ${hasMore
      ? html`<div
          ref=${(el: Element | undefined) => observeSentinel(el)}
          class="flex justify-center py-3"
        >
          ${loadingMore
            ? html`<span class="loading loading-spinner loading-sm"></span>`
            : html`<span class="text-xs opacity-40">loading…</span>`}
        </div>`
      : entries.length > 0
        ? html`<p class="text-center text-xs opacity-40 py-3">End of list</p>`
        : ""}
  `;
}

function controls() {
  return html`
    <div class="card bg-base-100 shadow-xl mb-3">
      <div class="card-body gap-2.5 p-3">
        <input
          class="input input-bordered input-sm w-full"
          type="search"
          placeholder="Search students…"
          .value=${query}
          @input=${(e: Event) => {
            query = (e.target as HTMLInputElement).value;
            debounceSearch();
          }}
        />

        <div class="flex items-center gap-1.5 flex-wrap">
          <button
            class="btn btn-sm join-item ${sort === "name"
              ? "btn-primary"
              : "btn-outline"}"
            title="Sort by name"
            @click=${() => {
              if (sort === "name") nameDir = nameDir === "asc" ? "desc" : "asc";
              else {
                sort = "name";
                nameDir = "asc";
              }
              void loadFirst();
            }}
          >
            ${svg16(
              sort === "name" && dir() === "asc" ? SORT_AZ_SVG : SORT_ZA_SVG,
            )}
          </button>
          <button
            class="btn btn-sm join-item ${sort === "date"
              ? "btn-primary"
              : "btn-outline"}"
            title="Sort by date"
            @click=${() => {
              if (sort === "date") dateDir = dateDir === "asc" ? "desc" : "asc";
              else {
                sort = "date";
                dateDir = "desc";
              }
              void loadFirst();
            }}
          >
            ${svg16(
              sort === "date" && dir() === "asc" ? CAL_UP_SVG : CAL_DOWN_SVG,
            )}
          </button>

          ${(["none", "blackhole", "alumni", "freeze"] as Filter[]).map(
            (f) =>
              html`<button
                class="btn btn-xs ${filter === f ? "btn-primary" : "btn-ghost"}"
                @click=${() => {
                  filter = f;
                  void loadFirst();
                }}
              >
                ${f.charAt(0).toUpperCase() + f.slice(1)}
              </button>`,
          )}
        </div>

        <div class="flex items-center gap-2 flex-wrap">
          <select
            class="select select-sm select-bordered"
            @change=${(e: Event) => {
              const value = (e.target as HTMLSelectElement).value;
              poolIntake =
                options.intakes.find((i) => `${i.month}-${i.year}` === value) ??
                null;
              poolYear = null;
              void loadFirst();
            }}
          >
            <option value="">All intakes</option>
            ${options.intakes.map(
              (i) =>
                html`<option
                  value="${i.month}-${i.year}"
                  ?selected=${poolIntake?.month === i.month &&
                  poolIntake?.year === i.year}
                >
                  ${i.label}
                </option>`,
            )}
          </select>
          <select
            class="select select-sm select-bordered"
            @change=${(e: Event) => {
              const value = (e.target as HTMLSelectElement).value;
              poolYear = value ? Number(value) : null;
              poolIntake = null;
              void loadFirst();
            }}
          >
            <option value="">All years</option>
            ${options.poolYears.map(
              (y) =>
                html`<option value="${y}" ?selected=${poolYear === y}>
                  ${y}
                </option>`,
            )}
          </select>
          ${filter !== "none" || poolIntake || poolYear
            ? html`<button
                class="btn btn-xs btn-ghost gap-1"
                @click=${() => {
                  filter = "none";
                  poolIntake = null;
                  poolYear = null;
                  void loadFirst();
                }}
              >
                ${svg16(X_SVG)} Clear
              </button>`
            : ""}
        </div>
      </div>
    </div>
  `;
}

function connectCard() {
  return html`<div class="card bg-base-100 shadow-xl">
    <div class="card-body items-center text-center gap-3">
      <p class="text-sm opacity-70">
        Students data requires a connected 42 account.
      </p>
      <a
        class="btn w-full"
        style="background:${TEAL};border-color:${TEAL};color:white;"
        href=${loginUrl()}
        >Connect with 42</a
      >
    </div>
  </div>`;
}

function statusBadges(e: StudentEntry) {
  const parts = [];
  if (isBlackholed(e))
    parts.push(
      html`<span class="badge badge-error badge-sm">Blackholed</span>`,
    );
  if (isFrozen(e))
    parts.push(html`<span class="badge badge-info badge-sm">Frozen</span>`);
  if (e.alumni)
    parts.push(
      html`<span class="badge badge-secondary badge-sm">Alumni</span>`,
    );
  return parts.length ? html`<span class="flex gap-1">${parts}</span>` : "";
}

function accentBadge(text: string) {
  return html`<span
    class="badge badge-outline badge-sm"
    style="color:var(--color-accent);border-color:var(--color-accent);"
    >${text}</span
  >`;
}

function renderRow(e: StudentEntry) {
  return html`<button
    class="card bg-base-100 border border-base-300 shadow-sm p-3 text-left w-full flex flex-col gap-2 ${e.active ===
    false
      ? "opacity-45"
      : ""}"
    @click=${() =>
      window.open(`https://profile.intra.42.fr/users/${e.login}`, "_blank")}
  >
    <div class="flex items-center gap-3">
      <img
        src="${e.image_url}"
        onerror="this.onerror=null;this.src='/icons/icon-192.png'"
        class="w-10 h-10 rounded-full object-cover"
        alt=""
      />
      <div class="min-w-0 flex-1">
        <div class="font-bold truncate">${e.displayname || e.login}</div>
        <div class="text-xs opacity-60 truncate">@${e.login}</div>
      </div>
      ${statusBadges(e)}
    </div>
    <div class="flex gap-1.5 flex-nowrap overflow-hidden text-xs">
      ${formatPool(e) ? accentBadge(formatPool(e)) : ""}
      ${formatLevel(e.level) ? accentBadge(formatLevel(e.level)) : ""}
      ${typeof e.wallet === "number" ? accentBadge(`Wallet ${e.wallet}`) : ""}
      ${typeof e.correction_point === "number"
        ? accentBadge(`Eval ${e.correction_point}`)
        : ""}
    </div>
  </button>`;
}

function observeSentinel(el: Element | undefined): void {
  if (sentinelObserver) {
    sentinelObserver.disconnect();
    sentinelObserver = null;
  }
  if (!el) return;
  sentinelObserver = new IntersectionObserver(
    (obs) => {
      if (obs.some((o) => o.isIntersecting)) void loadMore();
    },
    { rootMargin: "300px" },
  );
  sentinelObserver.observe(el);
}

function debounceSearch(): void {
  if (searchTimer !== null) window.clearTimeout(searchTimer);
  searchTimer = window.setTimeout(() => void loadFirst(), 150);
}

export async function loadStudents(force = false): Promise<void> {
  if (loaded && !force) return;
  await loadFirst(false);
}

async function loadFirst(reload = true): Promise<void> {
  if (reload) {
    loading = true;
    error = "";
  }
  refresh();
  try {
    const page = await studentsPage({
      offset: 0,
      limit: PAGE,
      sort,
      dir: dir(),
      filter,
      poolIntake,
      poolYear,
      query,
    });
    apply(page, true);
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  } finally {
    loading = false;
    refresh();
  }
}

async function loadMore(): Promise<void> {
  if (loadingMore || loading || entries.length >= filtered) return;
  loadingMore = true;
  refresh();
  try {
    const page = await studentsPage({
      offset: entries.length,
      limit: PAGE,
      sort,
      dir: dir(),
      filter,
      poolIntake,
      poolYear,
      query,
    });
    apply(page, false);
  } catch {
    /* keep existing rows */
  } finally {
    loadingMore = false;
    refresh();
  }
}

function apply(page: StudentsPageResponse, replace: boolean): void {
  const data = page.data ?? [];
  entries = replace ? data : [...entries, ...data];
  total = page.total ?? entries.length;
  active = page.active ?? 0;
  filtered = page.filtered ?? entries.length;
  if (page.options) options = page.options;
  else if (options.intakes.length === 0) {
    options = {
      intakes: nextIntakes(new Date()).map((i) => ({
        ...i,
        label: `${["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"][i.month - 1]} ${i.year}`,
      })),
      poolYears: [],
    };
  }
  loaded = true;
  unauthorized = false;
}
