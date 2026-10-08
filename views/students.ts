import { html } from "lit-html";
import { unsafeHTML } from "lit-html/directives/unsafe-html.js";
import { ref } from "lit-html/directives/ref.js";
import { Intake, StudentEntry, studentsPage } from "../data.ts";
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
import BLACKHOLE_SVG from "../assets/skull.svg?raw";
import FREEZE_SVG from "../assets/freeze.svg?raw";
import GRADUATION_SVG from "../assets/graduation-cap.svg?raw";
import X_SVG from "../assets/x.svg?raw";

const PAGE = 60;
const TEAL = "#00babc";
const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

type SortField = "name" | "date";
type SortDir = "asc" | "desc";
type Filter = "none" | "blackhole" | "alumni" | "freeze";

let allEntries: StudentEntry[] = [];
let total = 0;
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
let sentinelObserver: IntersectionObserver | null = null;

const svg16 = (raw: string) =>
  unsafeHTML(raw.replace("<svg", '<svg width="16" height="16"'));

const monthNumber = (name?: string | null): number | null => {
  if (!name) return null;
  const idx = MONTHS.findIndex((l) => l.toLowerCase() === name.toLowerCase());
  return idx === -1 ? null : idx + 1;
};

const beginTimestamp = (e: StudentEntry): number =>
  e.begin_at ? new Date(e.begin_at).getTime() : 0;

/** Client-side search + filters over everything already lazily loaded. */
function filteredSorted(): StudentEntry[] {
  const q = query.trim().toLowerCase();
  let list = allEntries;
  if (q) {
    list = list.filter((e) =>
      `${e.login} ${e.displayname || ""}`.toLowerCase().includes(q),
    );
  }
  if (filter === "blackhole") list = list.filter((e) => isBlackholed(e));
  else if (filter === "alumni") list = list.filter((e) => e.alumni === true);
  else if (filter === "freeze") list = list.filter((e) => isFrozen(e));
  const pi = poolIntake;
  if (pi) {
    list = list.filter(
      (e) =>
        monthNumber(e.pool_month) === pi.month &&
        Number(e.pool_year) === pi.year,
    );
  } else if (poolYear != null) {
    list = list.filter((e) => Number(e.pool_year) === poolYear);
  }

  const nameMul = nameDir === "asc" ? 1 : -1;
  const dateMul = dateDir === "desc" ? 1 : -1;
  return [...list].sort((a, b) => {
    if (sort === "date") {
      const cmp = (beginTimestamp(b) - beginTimestamp(a)) * dateMul;
      if (cmp !== 0) return cmp;
    }
    const an = `${a.displayname || a.login}`.toLowerCase();
    const bn = `${b.displayname || b.login}`.toLowerCase();
    const nameCmp = an.localeCompare(bn) || a.login.localeCompare(b.login);
    return sort === "name" ? nameCmp * nameMul : nameCmp;
  });
}

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

  const results = filteredSorted();
  const hasMore = allEntries.length < total;

  return html`
    ${searchCard(results.length)}
    ${results.length === 0
      ? html`<p class="text-sm opacity-60 text-center py-8">
          ${query || filter !== "none" || poolIntake || poolYear
            ? "No results"
            : "No data"}
        </p>`
      : html`<div class="grid grid-cols-1 gap-2">
          ${results.map((e) => renderRow(e))}
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
      : allEntries.length > 0
        ? html`<p class="text-center text-xs opacity-40 py-3">End of list</p>`
        : ""}

    <div class="h-28"></div>
    ${filtersBar(results.length)}
  `;
}

function searchCard(count: number) {
  return html`
    <div class="card bg-base-100 shadow-xl mb-3">
      <div class="card-body gap-2 p-3">
        <div class="flex items-center gap-2">
          <input
            class="input input-bordered input-sm flex-1"
            type="search"
            placeholder="Search students…"
            .value=${query}
            @input=${(e: Event) => {
              query = (e.target as HTMLInputElement).value;
              refresh();
            }}
          />
          <span class="badge badge-accent badge-sm shrink-0"
            >${count}${count < allEntries.length
              ? ` / ${allEntries.length}`
              : ""}</span
          >
        </div>
      </div>
    </div>
  `;
}

function filtersBar(count: number) {
  return html`
    <div
      class="fixed inset-x-0 z-10 border-t border-base-300 bg-base-100 px-3 py-2 flex flex-col gap-2"
      style="bottom: calc(4rem + env(safe-area-inset-bottom));"
    >
      <div class="flex items-center gap-1.5 overflow-x-auto">
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
            refresh();
          }}
        >
          ${svg16(
            sort === "name" && nameDir === "asc" ? SORT_AZ_SVG : SORT_ZA_SVG,
          )}
        </button>

        <button
          class="btn btn-sm join-item ${sort === "date"
            ? "btn-primary"
            : "btn-outline"}"
          title="Sort by start date"
          @click=${() => {
            if (sort === "date") dateDir = dateDir === "asc" ? "desc" : "asc";
            else {
              sort = "date";
              dateDir = "desc";
            }
            refresh();
          }}
        >
          ${svg16(
            sort === "date" && dateDir === "asc" ? CAL_UP_SVG : CAL_DOWN_SVG,
          )}
        </button>

        ${(["blackhole", "alumni", "freeze"] as const).map((f) => {
          const icon =
            f === "blackhole"
              ? BLACKHOLE_SVG
              : f === "alumni"
                ? GRADUATION_SVG
                : FREEZE_SVG;
          return html`<button
            class="btn btn-sm btn-square ${filter === f
              ? "btn-primary"
              : "btn-ghost"}"
            title="${f} (toggle)"
            @click=${() => {
              filter = filter === f ? "none" : f;
              refresh();
            }}
          >
            ${svg16(icon)}
          </button>`;
        })}
      </div>

      <div class="flex items-center gap-1.5 overflow-x-auto">
        <select
          class="select select-sm select-bordered"
          @change=${(e: Event) => {
            const value = (e.target as HTMLSelectElement).value;
            poolIntake =
              options.intakes.find((i) => `${i.month}-${i.year}` === value) ??
              null;
            poolYear = null;
            refresh();
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
            refresh();
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
              class="btn btn-sm btn-ghost gap-1 whitespace-nowrap"
              @click=${() => {
                filter = "none";
                poolIntake = null;
                poolYear = null;
                refresh();
              }}
            >
              ${svg16(X_SVG)} Clear
            </button>`
          : ""}
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
      html`<span class="badge badge-error badge-sm gap-1" title="Blackholed"
        >${svg16(BLACKHOLE_SVG)}</span
      >`,
    );
  if (isFrozen(e))
    parts.push(
      html`<span class="badge badge-info badge-sm gap-1" title="Frozen"
        >${svg16(FREEZE_SVG)}</span
      >`,
    );
  if (e.alumni)
    parts.push(
      html`<span class="badge badge-secondary badge-sm gap-1" title="Alumni"
        >${svg16(GRADUATION_SVG)}</span
      >`,
    );
  return parts.length
    ? html`<span class="flex gap-1 shrink-0">${parts}</span>`
    : "";
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

export async function loadStudents(force = false): Promise<void> {
  if (loaded && !force) return;
  if (force) allEntries = [];
  await loadFirst();
}

async function loadFirst(): Promise<void> {
  if (allEntries.length === 0) loading = true;
  error = "";
  refresh();
  try {
    const page = await studentsPage({
      offset: 0,
      limit: PAGE,
      sort,
      dir: sort === "name" ? nameDir : dateDir,
      filter: "none",
      poolIntake: null,
      poolYear: null,
      query: "",
    });
    unauthorized = false;
    allEntries = page.data ?? [];
    total = page.total ?? allEntries.length;
    if (page.options?.intakes?.length || page.options?.poolYears?.length) {
      options = page.options;
    }
    if (options.intakes.length === 0) {
      options = {
        intakes: nextIntakes(new Date()).map((i) => ({
          ...i,
          label: `${MONTHS[i.month - 1]} ${i.year}`,
        })),
        poolYears: [],
      };
    }
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  } finally {
    loading = false;
    loaded = true;
    refresh();
  }
}

async function loadMore(): Promise<void> {
  if (loadingMore || loading || allEntries.length >= total) return;
  loadingMore = true;
  refresh();
  try {
    const page = await studentsPage({
      offset: allEntries.length,
      limit: PAGE,
      sort,
      dir: sort === "name" ? nameDir : dateDir,
      filter: "none",
      poolIntake: null,
      poolYear: null,
      query: "",
    });
    const fresh = (page.data ?? []).filter(
      (e) => !allEntries.some((x) => x.login === e.login),
    );
    if (allEntries.length > 0 && fresh.length === 0) {
      // Nothing new to append — stop the lazy loader.
      total = allEntries.length;
    } else {
      allEntries = [...allEntries, ...fresh];
      total = page.total ?? allEntries.length;
    }
  } catch {
    /* keep existing rows */
  } finally {
    loadingMore = false;
    refresh();
  }
}
