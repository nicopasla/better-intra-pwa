import { html, TemplateResult } from "lit-html";
import { unsafeHTML } from "lit-html/directives/unsafe-html.js";
import SKULL_SVG from "../../assets/skull.svg?raw";
import GRADUATION_CAP_SVG from "../../assets/graduation-cap.svg?raw";
import POOL_SVG from "../../assets/pool.svg?raw";
import ENTRY_DATE_SVG from "../../assets/entry-date.svg?raw";
import FREEZE_SVG from "../../assets/freeze.svg?raw";
import SORT_AZ_SVG from "../../assets/sort-az.svg?raw";
import SORT_ZA_SVG from "../../assets/sort-za.svg?raw";
import CAL_DOWN_SVG from "../../assets/calendar-arrow-down.svg?raw";
import CAL_UP_SVG from "../../assets/calendar-arrow-up.svg?raw";
import FILTER_SVG from "../../assets/filter.svg?raw";
import FILTER_CLEAR_SVG from "../../assets/filter-clear.svg?raw";
import STAR_SVG from "../../assets/star-lucide.svg?raw";
import WALLET_SVG from "../../assets/wallet.svg?raw";
import EVAL_SVG from "../../assets/eval.svg?raw";
import CHECK_SVG from "../../assets/check.svg?raw";
import FORTY_TWO_SVG from "../../assets/42_Logo.svg?raw";
import { segmentedTabs } from "../../lib/segmented-tabs.ts";
import {
  formatAlumniDate,
  formatBlackholeDate,
  formatMonthYear,
  formatPool,
  formatPoolFull,
  formatShortDate,
  formatTimeAgo,
  isBlackholed,
  isFrozen,
  formatLevel,
  groupFutureIntakes,
  isFutureStudent,
  piscineMonthName,
  poolIntakes,
  poolMonthName,
  poolYearOptions,
} from "./data.ts";
import type {
  FilterKey,
  PiscineEntry,
  SortField,
  SortDir,
  StudentEntry,
  StudentsFilter,
  StudentsFilterOptions,
  StudentsTab,
  StudentsView,
} from "./data.ts";

export interface StudentsTemplateState {
  currentTheme: string;
  tab: StudentsTab;
  view: StudentsView;
  sortField: SortField;
  nameDir: SortDir;
  dateDir: SortDir;
  filter: StudentsFilter;
  poolIntake: { month: number; year: number } | null;
  poolYear: number | null;
  piscineList: PiscineEntry[];
  piscineListLoading: boolean;
  selectedPiscine: { year: number; month: number } | null;
  entries: StudentEntry[];
  loading: boolean;
  loadingMore: boolean;
  lastFetched: number;
  query: string;
  authError: boolean;
  visibleCount: number;
  baseTotal: number;
  filteredTotal: number;
  activeCount: number;
  filterOptions: StudentsFilterOptions | null;
  currentYear: number;
  isMaximized: boolean;
  tabsOverflowing: boolean;
}

export const STUDENTS_TAB_LABELS: Record<StudentsTab, string> = {
  students: "Students",
  new: "Future students",
  pisciners: "Pisciners",
};

const STUDENTS_TAB_ORDER: StudentsTab[] = ["students", "new", "pisciners"];

export interface StudentsTemplateHandlers {
  onSwitchTab: (tab: StudentsTab) => void;
  onSetView: (view: StudentsView) => void;
  onSetSort: (field: SortField) => void;
  onToggleFilter: (key: FilterKey) => void;
  onClose: () => void;
  onSearchInput: (value: string) => void;
  onSelectPiscine: (year: number, month: number) => void;
  onBackToPiscines: () => void;
  onPoolIntake: (value: number) => void;
  onPoolYear: (value: number) => void;
  onClearFilters: () => void;
  onLoadMore: () => void;
  onRowClick: (login: string) => void;
  onConnect: () => void;
  onToggleMaximize: () => void;
}

const STATUS_FILTERS: Array<{
  key: FilterKey;
  label: string;
  icon: string;
  color: string;
}> = [
  {
    key: "blackhole",
    label: "Blackholed",
    icon: SKULL_SVG,
    color: "btn-error",
  },
  {
    key: "alumni",
    label: "Alumni",
    icon: GRADUATION_CAP_SVG,
    color: "btn-secondary",
  },
  {
    key: "freeze",
    label: "Frozen",
    icon: FREEZE_SVG,
    color: "btn-info",
  },
];

const STATUS_BADGE: Record<
  FilterKey,
  { label: string; badgeClass: string; tip: string }
> = {
  blackhole: {
    label: "blackholed",
    badgeClass: "badge-error",
    tip: "Blackholed students",
  },
  alumni: {
    label: "alumni",
    badgeClass: "badge-secondary",
    tip: "Alumni students",
  },
  freeze: {
    label: "frozen",
    badgeClass: "badge-info",
    tip: "Frozen students",
  },
};

function renderFilterMenu(
  state: StudentsTemplateState,
  handlers: StudentsTemplateHandlers,
  poolEntries: StudentEntry[],
): TemplateResult {
  const { filter, poolIntake, poolYear, tab } = state;
  const useServerOptions = tab === "students" && state.filterOptions != null;
  const poolYears = useServerOptions
    ? state.filterOptions!.poolYears
    : poolYearOptions(poolEntries, state.currentYear);
  const intakes = useServerOptions
    ? state.filterOptions!.intakes
    : poolIntakes(poolEntries, state.currentYear);

  return html`
    <div
      class="dropdown-content students-filter-menu z-50 flex w-64 flex-col gap-1 rounded-box bg-base-100 p-2 shadow-2xl"
    >
      <span class="students-filter-menu__label">Piscine</span>
      <select
        class="select select-sm w-full"
        @change="${(e: Event) =>
          handlers.onPoolIntake(Number((e.target as HTMLSelectElement).value))}"
      >
        <option value="0" ?selected="${poolIntake === null}">
          All piscines
        </option>
        ${intakes.map(
          (i, idx) =>
            html`<option
              value="${idx + 1}"
              ?selected="${poolIntake?.month === i.month &&
              poolIntake?.year === i.year}"
            >
              ${i.label}
            </option>`,
        )}
      </select>
      <span class="students-filter-menu__label">Year</span>
      <select
        class="select select-sm w-full"
        @change="${(e: Event) =>
          handlers.onPoolYear(Number((e.target as HTMLSelectElement).value))}"
      >
        <option value="0" ?selected="${poolYear === null}">All years</option>
        ${poolYears.map(
          (y) =>
            html`<option value="${y}" ?selected="${poolYear === y}">
              ${y}
            </option>`,
        )}
      </select>
      <div class="divider my-1"></div>
      ${tab === "students"
        ? html`<span class="students-filter-menu__label">Status</span>
            ${STATUS_FILTERS.map(
              (f) => html`
                <button
                  class="btn btn-md justify-start ${f.color} ${filter !==
                    "none" && filter !== f.key
                    ? "opacity-40"
                    : ""}"
                  @click="${() => handlers.onToggleFilter(f.key)}"
                >
                  ${unsafeHTML(
                    f.icon.replace("<svg", '<svg width="16" height="16"'),
                  )}
                  ${f.label}
                  ${filter === f.key
                    ? html`<span class="ml-auto"
                        >${unsafeHTML(
                          CHECK_SVG.replace(
                            "<svg",
                            '<svg width="14" height="14"',
                          ),
                        )}</span
                      >`
                    : ""}
                </button>
              `,
            )}`
        : ""}
    </div>
  `;
}

function renderConnectBanner(onConnect: () => void): TemplateResult {
  return html`
    <div class="flex flex-col items-center gap-4 py-12 px-6 text-center">
      <p class="text-base-content/60">
        Students data requires a connected 42 account
      </p>
      <button
        type="button"
        class="btn bg-[#00babc] text-white border-none hover:bg-[#1fd2d4] flex items-center justify-center gap-3"
        style="height:3rem; min-width:15rem; font-size:1rem;"
        @click="${onConnect}"
      >
        <span class="font-bold tracking-wide">Connect with</span>
        <span
          class="size-8 flex items-center justify-center [&_polygon]:fill-current"
        >
          ${unsafeHTML(FORTY_TWO_SVG)}
        </span>
      </button>
    </div>
  `;
}

function renderPiscineCalendar(
  state: StudentsTemplateState,
  handlers: StudentsTemplateHandlers,
): TemplateResult {
  const { piscineList } = state;
  const years = [...new Set(piscineList.map((p) => p.year))].sort(
    (a, b) => b - a,
  );

  if (years.length === 0) {
    return html`<div class="text-center p-6 text-base-content/50">
      No piscine data
    </div>`;
  }

  return html`
    <div class="flex flex-col gap-5">
      ${years.map((year) => {
        const months = piscineList
          .filter((p) => p.year === year)
          .map((p) => p.month)
          .sort((a, b) => a - b);
        return html`<div>
          <div class="piscine-cal-head flex items-center gap-2 mb-2 px-1">
            <span
              class="piscine-cal-year badge badge-lg badge-primary font-mono font-bold"
            >
              ${year}
            </span>
            <span
              class="piscine-cal-count badge badge-lg badge-accent font-mono"
              >${months.length} piscines</span
            >
          </div>
          <div class="grid">
            ${months.map(
              (m) =>
                html`<div
                  class="row piscine-card"
                  @click="${() => handlers.onSelectPiscine(year, m)}"
                >
                  <span class="piscine-card__month"
                    >${piscineMonthName(m)}</span
                  >
                  <span class="piscine-card__year">${year}</span>
                </div>`,
            )}
          </div>
        </div>`;
      })}
    </div>
  `;
}

export function renderStudentsDialogTemplate(
  state: StudentsTemplateState,
  handlers: StudentsTemplateHandlers,
): TemplateResult {
  const { currentTheme, tab, view, sortField, nameDir, dateDir, filter } =
    state;
  const {
    piscineList,
    piscineListLoading,
    selectedPiscine,
    poolIntake,
    poolYear,
    entries,
    loading,
    loadingMore,
    lastFetched,
    query,
    authError,
    visibleCount,
    baseTotal,
    filteredTotal,
    activeCount,
    currentYear,
    isMaximized,
    tabsOverflowing,
  } = state;
  const isPaged = tab === "students";

  const hasActiveFilters =
    filter !== "none" || poolIntake != null || poolYear != null;
  const showPoolFilter = tab === "students" || tab === "new";
  const showRosterControls = tab !== "pisciners" || selectedPiscine != null;
  const ago = lastFetched ? formatTimeAgo(lastFetched) : "";
  const normalize = (s: string) =>
    s
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();
  const q = normalize(query.trim());
  const futureGroups = tab === "new" ? groupFutureIntakes(entries) : [];
  const intakeFiltered =
    tab === "new"
      ? entries.filter(isFutureStudent)
      : tab === "students"
        ? entries.filter((e) => !isFutureStudent(e))
        : entries;
  const localActiveCount = intakeFiltered.filter(
    (e) => e.active !== false,
  ).length;
  const filtered = isPaged
    ? entries
    : intakeFiltered.filter((e) => {
        if (filter === "blackhole" && !isBlackholed(e)) return false;
        if (filter === "alumni" && !e.alumni) return false;
        if (filter === "freeze" && !isFrozen(e)) return false;
        if (poolIntake != null) {
          if (
            e.pool_year !== String(poolIntake.year) ||
            e.pool_month?.toLowerCase() !== poolMonthName(poolIntake.month)
          )
            return false;
        } else if (poolYear != null && e.pool_year !== String(poolYear)) {
          return false;
        }
        return !q || normalize(`${e.login} ${e.displayname}`).includes(q);
      });
  const display = isPaged
    ? entries
    : filter === "blackhole"
      ? [...filtered].sort(
          (a, b) =>
            new Date(b.blackholed_at!).getTime() -
            new Date(a.blackholed_at!).getTime(),
        )
      : filter === "alumni"
        ? [...filtered].sort((a, b) => {
            const ta = a.alumnized_at ? new Date(a.alumnized_at).getTime() : 0;
            const tb = b.alumnized_at ? new Date(b.alumnized_at).getTime() : 0;
            return tb - ta;
          })
        : filtered;
  const windowed = isPaged ? entries : display.slice(0, visibleCount);
  const hasMore = isPaged
    ? entries.length < filteredTotal
    : display.length > windowed.length;
  const activeBadge = isPaged ? activeCount : localActiveCount;
  const statusBadge = filter !== "none" ? STATUS_BADGE[filter] : null;
  const activeBadgeValue = statusBadge ? filteredTotal : activeBadge;
  const activeBadgeLabel = statusBadge ? statusBadge.label : "active students";
  const activeBadgeClass = statusBadge
    ? statusBadge.badgeClass
    : "badge-success";
  const activeBadgeTip = statusBadge ? statusBadge.tip : "Active students";
  const showPiscineGrid = tab === "pisciners" && selectedPiscine == null;
  const piscineCount = showPiscineGrid ? piscineList.length : 0;
  const cursusLabel =
    tab === "pisciners"
      ? "Piscine Brussels"
      : tab === "new"
        ? "Future students"
        : "42 Cursus";
  const countLabel =
    tab === "pisciners"
      ? selectedPiscine
        ? "pisciners"
        : "piscines"
      : tab === "new"
        ? "future students"
        : "students";
  const countValue = showPiscineGrid
    ? piscineCount
    : isPaged
      ? baseTotal
      : intakeFiltered.length;
  const emptyBase = isPaged ? baseTotal === 0 : entries.length === 0;
  const dateLabel =
    tab === "pisciners"
      ? selectedPiscine
        ? `${piscineMonthName(selectedPiscine.month)} ${selectedPiscine.year}`
        : "all piscines"
      : tab === "new"
        ? futureGroups.length > 0
          ? futureGroups.map((i) => i.label).join(" · ")
          : "future students"
        : "all students";
  const renderAvatar = (r: StudentEntry) => html`
    <img class="avatar" src="${r.image_url}" alt="${r.login}" loading="lazy" />
  `;

  const renderStatusBadges = (r: StudentEntry) =>
    html`${isBlackholed(r) && tab !== "pisciners"
      ? html`<span
          class="blackhole-badge${view === "list" ? " with-text" : ""}"
          data-tip="${formatBlackholeDate(r.blackholed_at)}"
        >
          ${unsafeHTML(
            SKULL_SVG.replace("<svg", '<svg width="16" height="16"'),
          )}
          ${view === "list" ? formatShortDate(r.blackholed_at) : ""}
        </span>`
      : ""}${isFrozen(r) && tab !== "new" && tab !== "pisciners"
      ? html`<span
          class="freeze-badge${view === "list" ? " with-text" : ""}"
          data-tip="Frozen"
        >
          ${unsafeHTML(
            FREEZE_SVG.replace("<svg", '<svg width="16" height="16"'),
          )}
          ${view === "list" ? "Frozen" : ""}
        </span>`
      : ""}${r.alumni && tab !== "pisciners"
      ? html`<span
          class="alumni-badge${view === "list" ? " with-text" : ""}"
          data-tip="${formatAlumniDate(r.alumnized_at)}"
        >
          ${unsafeHTML(
            GRADUATION_CAP_SVG.replace("<svg", '<svg width="16" height="16"'),
          )}
          ${view === "list" ? formatShortDate(r.alumnized_at) : ""}
        </span>`
      : ""}`;

  const renderLogin = (r: StudentEntry) => html`
    <span class="login">${r.login}</span>
  `;

  const renderInfo = (r: StudentEntry) => html`
    <div class="info">
      <div class="displayname">
        <span class="displayname-name">${r.displayname || r.login}</span>
        ${renderStatusBadges(r)}
      </div>
      ${renderLogin(r)}
    </div>
  `;

  const renderLevelBadge = (r: StudentEntry) =>
    tab !== "new" && typeof r.level === "number"
      ? html`<span
          class="level-badge"
          data-tip="Level in ${tab === "pisciners" ? "piscine" : "42 cursus"}"
        >
          ${unsafeHTML(STAR_SVG.replace("<svg", '<svg width="12" height="12"'))}
          ${r.level.toFixed(2)}
        </span>`
      : "";

  const renderPoolBadge = (r: StudentEntry) =>
    tab !== "pisciners" && formatPool(r)
      ? html`<span class="pool-badge" data-tip="Pool in ${formatPoolFull(r)}">
          ${unsafeHTML(POOL_SVG.replace("<svg", '<svg width="14" height="14"'))}
          ${view === "list" ? formatPoolFull(r) : formatPool(r)}
        </span>`
      : "";

  const renderDateBadge = (r: StudentEntry) =>
    tab !== "pisciners" && formatMonthYear(r.begin_at)
      ? html`<span
          class="date-badge"
          data-tip="Entry on ${formatShortDate(r.begin_at)}"
        >
          ${unsafeHTML(
            ENTRY_DATE_SVG.replace("<svg", '<svg width="14" height="14"'),
          )}
          ${view === "list"
            ? formatShortDate(r.begin_at)
            : formatMonthYear(r.begin_at)}
        </span>`
      : "";

  const renderEvalBadge = (r: StudentEntry) =>
    isPaged && typeof r.correction_point === "number"
      ? html`<span class="eval-badge" data-tip="Evaluation points">
          ${unsafeHTML(EVAL_SVG.replace("<svg", '<svg width="14" height="14"'))}
          ${r.correction_point}
        </span>`
      : "";

  const renderWalletBadge = (r: StudentEntry) =>
    isPaged && typeof r.wallet === "number"
      ? html`<span class="wallet-badge" data-tip="Wallet">
          ${unsafeHTML(
            WALLET_SVG.replace("<svg", '<svg width="14" height="14"'),
          )}
          ${r.wallet}
        </span>`
      : "";

  const renderStackedRow = (r: StudentEntry) => {
    const pool = renderPoolBadge(r);
    const date = renderDateBadge(r);
    const level = renderLevelBadge(r);
    const evalBadge = renderEvalBadge(r);
    const wallet = renderWalletBadge(r);
    return html`
      <div
        class="row ${isPaged && r.active === false ? "inactive" : ""}"
        @click="${() => handlers.onRowClick(r.login)}"
      >
        <div class="row-head">${renderAvatar(r)} ${renderLogin(r)}</div>
        <div class="fullname">
          <span class="fullname-text">${r.displayname || r.login}</span>
          ${renderStatusBadges(r)}
        </div>
        ${pool || date ? html`<div class="row-line">${pool}${date}</div>` : ""}
        ${level || evalBadge || wallet
          ? html`<div class="row-line">${level}${evalBadge}${wallet}</div>`
          : ""}
      </div>
    `;
  };

  const renderDefaultRow = (r: StudentEntry) => html`
    <div
      class="row ${tab === "students" && r.active === false ? "inactive" : ""}"
      @click="${() => handlers.onRowClick(r.login)}"
    >
      ${renderAvatar(r)} ${renderInfo(r)}
      <div class="row-meta">
        ${renderPoolBadge(r)}${renderDateBadge(r)}${renderLevelBadge(r)}
        ${renderEvalBadge(r)}${renderWalletBadge(r)}
      </div>
    </div>
  `;

  const renderRows = (rows: StudentEntry[]) => html`
    <div class="grid roster-students">
      ${rows.map((r) => renderStackedRow(r))}
    </div>
  `;
  return html`
    <style>
      .students-feature {
        display: block;
      }
      .row {
        border-radius: 0.5rem;
        cursor: pointer;
        min-width: 0;
      }
      .row:hover {
        background: var(--color-base-200);
      }
      .grid .row {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 0.25rem;
        padding: 0.6rem;
        border: 1px solid var(--color-base-300);
        border-radius: 0.75rem;
      }
      .grid .row:hover {
        border-color: var(--color-primary);
      }
      .list .row {
        display: flex;
        align-items: center;
        gap: 0.75rem;
        padding: 0.5rem 1rem;
      }
      .avatar {
        width: 2.75rem;
        height: 2.75rem;
        border-radius: 50%;
        object-fit: cover;
        flex-shrink: 0;
      }
      .info {
        min-width: 0;
      }
      .grid .info {
        width: 100%;
        text-align: center;
      }
      .list .info {
        flex: 1;
        text-align: left;
      }
      .displayname {
        display: flex;
        align-items: center;
        gap: 0.45rem;
        font-weight: 600;
        font-size: 0.9rem;
        color: var(--color-base-content);
      }
      .displayname-name {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        min-width: 0;
      }
      .grid .displayname {
        justify-content: center;
      }
      .blackhole-badge,
      .freeze-badge,
      .alumni-badge {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
        border-radius: 9999px;
        padding: 0.3rem;
        line-height: 0;
      }
      .blackhole-badge {
        color: var(--color-error-content);
        background: var(--color-error);
      }
      .blackhole-badge.with-text,
      .freeze-badge.with-text,
      .alumni-badge.with-text {
        gap: 0.3rem;
        height: 1.6rem;
        padding: 0 0.5rem;
        line-height: normal;
        font-size: 0.7rem;
        font-weight: 600;
        font-family: var(--font-sans);
        white-space: nowrap;
      }
      .freeze-badge {
        color: var(--color-info-content);
        background: var(--color-info);
      }
      .alumni-badge {
        color: var(--color-secondary-content);
        background: var(--color-secondary);
      }
      .blackhole-badge svg,
      .freeze-badge svg,
      .alumni-badge svg {
        fill: currentColor;
      }
      .row.inactive {
        opacity: 0.45;
      }
      .login {
        font-size: 0.8rem;
        opacity: 0.5;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        border-radius: 0.25rem;
        display: inline-block;
        max-width: 100%;
        vertical-align: bottom;
      }
      .row-meta {
        display: flex;
        align-items: center;
        gap: 0.4rem;
        flex-shrink: 0;
      }
      .grid .row-meta {
        flex-direction: row;
        flex-wrap: wrap;
        justify-content: center;
        text-align: center;
        width: 100%;
      }
      .grid .row-meta .pool-badge,
      .grid .row-meta .date-badge,
      .grid .row-meta .level-badge {
        font-size: 0.7rem;
        height: 1.5rem;
        padding: 0 0.4rem;
      }
      .list .row-meta {
        margin-left: auto;
      }
      .pool-badge,
      .date-badge,
      .level-badge,
      .eval-badge,
      .wallet-badge {
        display: inline-flex;
        align-items: center;
        gap: 0.3rem;
        height: 1.8rem;
        font-size: 0.8rem;
        font-weight: 600;
        font-family: var(--font-sans);
        color: var(--color-base-content);
        background: var(--color-base-200);
        border-radius: var(--radius-field);
        padding: 0 0.6rem;
        white-space: nowrap;
        flex-shrink: 0;
      }
      .pool-badge {
        color: var(--color-info-content);
        background: color-mix(in oklch, var(--color-info) 60%, transparent);
      }
      .date-badge {
        background: color-mix(in oklch, var(--color-accent) 40%, transparent);
      }
      .level-badge {
        color: var(--color-primary-content);
        background: color-mix(in oklch, var(--color-primary) 45%, transparent);
      }
      .wallet-badge {
        color: var(--color-secondary-content);
        background: color-mix(
          in oklch,
          var(--color-secondary) 45%,
          transparent
        );
      }
      .eval-badge {
        color: var(--color-warning-content);
        background: color-mix(in oklch, var(--color-warning) 50%, transparent);
      }
      .pool-badge svg,
      .date-badge svg,
      .level-badge svg,
      .eval-badge svg,
      .wallet-badge svg {
        fill: currentColor;
        width: 0.875rem;
        height: 0.875rem;
        flex-shrink: 0;
      }
      .level-badge svg {
        fill: none;
        stroke: currentColor;
        width: 0.75rem;
        height: 0.75rem;
      }
      .grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
        gap: 0.5rem;
      }
      .grid.roster-students {
        grid-template-columns: repeat(auto-fill, minmax(170px, 1fr));
        align-items: start;
      }
      .grid.roster-students .row {
        align-items: stretch;
        gap: 0.2rem;
        text-align: center;
        padding: 0.4rem 0.25rem;
      }
      .grid.roster-students .login {
        font-size: 1.05rem;
        font-weight: 600;
        opacity: 1;
      }
      .grid.roster-students .fullname {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 0.35rem;
        width: 100%;
        min-width: 0;
        font-size: 0.9rem;
        font-weight: 500;
        opacity: 0.6;
      }
      .grid.roster-students .fullname-text {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        min-width: 0;
      }
      .row-head {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 0.5rem;
        width: 100%;
      }
      .row-line {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 0.3rem;
        flex-wrap: wrap;
        width: 100%;
      }

      .grid .piscine-card {
        padding: 0.9rem 0.5rem;
        gap: 0.15rem;
      }
      .piscine-cal-head .badge {
        border-radius: 0.75rem;
      }
      .piscine-card__month {
        font-size: 0.9rem;
        font-weight: 700;
      }
      .piscine-card__year {
        font-size: 0.8rem;
        font-family: var(--font-sans);
      }
      .list {
        display: flex;
        flex-direction: column;
        gap: 1px;
      }
      .updated-badge {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        font-size: 0.85rem;
        font-weight: 700;
        font-family: var(--font-sans);
        padding: 0.4rem 0.75rem;
        border-radius: var(--radius-field);
        background: var(--color-accent);
        color: var(--color-accent-content);
        white-space: nowrap;
        flex-shrink: 0;
        cursor: default;
      }
      .students-filter-menu {
        border: 1px solid
          color-mix(in oklch, var(--color-base-content) 30%, transparent);
      }
      .students-filter-menu__label {
        padding: 0.25rem 0.5rem 0;
        font-size: 0.7rem;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        opacity: 0.6;
      }
    </style>
    <div class="students-feature flex flex-col bg-base-100 rounded-xl pb-4 mb-4">
      <div
        class="sticky top-[env(safe-area-inset-top)] z-10 bg-base-100 rounded-t-xl"
      >
        <div class="px-3 pt-3 pb-3">
          <div class="flex flex-wrap items-center gap-2 justify-center">
            <input
              class="input input-sm w-44"
              type="search"
              placeholder="Search..."
              .value="${query}"
              @input="${(e: Event) =>
                handlers.onSearchInput((e.target as HTMLInputElement).value)}"
            />
            ${showRosterControls
              ? html`<div class="join">
                  <button
                    class="btn btn-sm join-item ${sortField === "name"
                      ? "btn-primary"
                      : "btn-outline border-base-content/20"}"
                    data-tip="${nameDir === "asc"
                      ? "Name A → Z (click to invert)"
                      : "Name Z → A (click to invert)"}"
                    @click="${() => handlers.onSetSort("name")}"
                  >
                    ${unsafeHTML(
                      (nameDir === "asc" ? SORT_AZ_SVG : SORT_ZA_SVG).replace(
                        "<svg",
                        '<svg width="16" height="16"',
                      ),
                    )}
                  </button>
                  ${tab !== "pisciners"
                    ? html`<button
                        class="btn btn-sm join-item ${sortField === "date"
                          ? "btn-primary"
                          : "btn-outline border-base-content/20"}"
                        data-tip="${dateDir === "desc"
                          ? "Date (newest first)"
                          : "Date (oldest first)"}"
                        @click="${() => handlers.onSetSort("date")}"
                      >
                        ${unsafeHTML(
                          (dateDir === "desc"
                            ? CAL_DOWN_SVG
                            : CAL_UP_SVG
                          ).replace("<svg", '<svg width="16" height="16"'),
                        )}
                      </button>`
                    : ""}
                </div> `
              : ""}
            ${showPoolFilter
              ? html`<div class="indicator">
                    ${hasActiveFilters
                      ? html`<span
                          class="indicator-item badge badge-xs ${filter ===
                          "blackhole"
                            ? "badge-error"
                            : filter === "alumni"
                              ? "badge-secondary"
                              : filter === "freeze"
                                ? "badge-info"
                                : "badge-error"}"
                          style="border-radius:var(--radius-field)"
                        ></span>`
                      : ""}
                    <details class="dropdown dropdown-end">
                      <summary
                        class="btn btn-sm list-none ${hasActiveFilters
                          ? "btn-primary"
                          : "btn-outline border-base-content/20"}"
                        data-tip="Filters"
                      >
                        ${unsafeHTML(
                          FILTER_SVG.replace(
                            "<svg",
                            '<svg width="16" height="16"',
                          ),
                        )}
                      </summary>
                      ${renderFilterMenu(
                        state,
                        handlers,
                        tab === "new" ? intakeFiltered : entries,
                      )}
                    </details>
                  </div>
                  ${hasActiveFilters
                    ? html`<button
                        class="btn btn-sm btn-outline"
                        data-tip="Clear filters"
                        @click="${handlers.onClearFilters}"
                      >
                        ${unsafeHTML(
                          FILTER_CLEAR_SVG.replace(
                            "<svg",
                            '<svg width="16" height="16"',
                          ),
                        )}
                        Clear
                      </button>`
                    : ""}`
              : ""}
            ${tab === "pisciners" && selectedPiscine
              ? html`<button
                  class="btn btn-sm btn-outline"
                  @click="${handlers.onBackToPiscines}"
                >
                  ← Piscines
                </button>`
              : ""}
          </div>
          <div class="mt-2 flex flex-wrap items-center gap-2 justify-center">
            <span
              class="badge badge-sm badge-accent h-8 flex-shrink-0 font-bold font-mono"
              style="white-space:nowrap;border-radius:var(--radius-field)"
              data-tip="${cursusLabel} — ${dateLabel}"
              >${countValue} ${countLabel}</span
            >
            ${tab === "students"
              ? html`<span
                  class="badge badge-sm ${activeBadgeClass} h-8 flex-shrink-0 font-bold font-mono"
                  style="white-space:nowrap;border-radius:var(--radius-field)"
                  data-tip="${activeBadgeTip}"
                  >${activeBadgeValue} ${activeBadgeLabel}</span
                >`
              : ""}
          </div>
        </div>
      </div>
      <div class="scroll-area flex-1 min-h-0 overflow-y-auto p-3">
        ${showPiscineGrid
          ? piscineListLoading
            ? html`<div class="flex items-center justify-center p-8">
                <span class="loading loading-spinner loading-lg"></span>
              </div>`
            : authError
              ? renderConnectBanner(handlers.onConnect)
              : renderPiscineCalendar(state, handlers)
          : loading
            ? html`<div class="flex items-center justify-center p-8">
                <span class="loading loading-spinner loading-lg"></span>
              </div>`
            : authError
              ? renderConnectBanner(handlers.onConnect)
              : filtered.length === 0
                ? html`<div class="text-center p-6 text-base-content/50">
                    ${emptyBase ? "No data" : "No results"}
                  </div>`
                : html`${tab === "new"
                    ? html`<div class="flex flex-col gap-5">
                        ${futureGroups.map((i) => {
                          const inGroup = (e: StudentEntry) => {
                            if (!isFutureStudent(e) || !e.begin_at)
                              return false;
                            const d = new Date(e.begin_at);
                            return (
                              d.getMonth() + 1 === i.month &&
                              d.getFullYear() === i.year
                            );
                          };
                          const groupCount = display.filter(inGroup).length;
                          const rows = windowed.filter(inGroup);
                          if (rows.length === 0) return html``;
                          return html`<div>
                            <div class="flex items-center gap-2 mb-2 px-1">
                              <span
                                class="badge badge-lg badge-primary font-mono font-bold"
                              >
                                ${piscineMonthName(i.month)} ${i.year}
                              </span>
                              <span
                                class="badge badge-lg badge-accent font-mono"
                                >${groupCount}
                                ${groupCount === 1 ? "student" : "students"}
                              </span>
                            </div>
                            ${renderRows(rows)}
                          </div>`;
                        })}
                      </div>`
                    : renderRows(windowed)}
                  ${hasMore
                    ? html`<div class="sentinel" aria-hidden="true"></div>`
                    : ""}
                  ${loadingMore
                    ? html`<div class="flex items-center justify-center p-4">
                        <span class="loading loading-spinner loading-md"></span>
                      </div>`
                    : ""}`}
      </div>
    </div>
  `;
}

/** The students sub-tab bar, rendered by the shell above the dock. */
export function renderStudentsBottomBar(
  state: StudentsTemplateState,
  handlers: StudentsTemplateHandlers,
): TemplateResult {
  return html`
    <div class="ft-subtabs px-4 pb-2">
      <div class="rounded-xl bg-base-100 p-1.5 shadow-lg">
        ${segmentedTabs({
          tabs: STUDENTS_TAB_ORDER.map((t) => ({
            id: t,
            label: STUDENTS_TAB_LABELS[t],
          })),
          active: state.tab,
          overflowing: state.tabsOverflowing,
          onSwitch: handlers.onSwitchTab,
        })}
      </div>
    </div>
  `;
}
