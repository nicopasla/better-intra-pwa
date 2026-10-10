import type { TemplateResult } from "lit-html";
import { loginUrl } from "../../api.ts";
import { observeTabsOverflow } from "../../lib/segmented-tabs.ts";
import {
  INITIAL_VISIBLE_COUNT,
  WINDOW_STEP,
  fetchPiscines,
  fetchPisciners,
  fetchStudentsPage,
  fetchFutureStudents,
  poolIntakes,
  sortEntries,
} from "./data.ts";
import {
  STUDENTS_TAB_LABELS,
  renderStudentsBottomBar,
  renderStudentsDialogTemplate,
  StudentsTemplateHandlers,
  StudentsTemplateState,
} from "./template.ts";
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

let pendingView: TemplateResult | null = null;
let pendingBottomBar: TemplateResult | null = null;
let initialized = false;
let sentinelObserver: IntersectionObserver | null = null;
let tabsResizeObserver: ResizeObserver | null = null;
let syncObserversFn: (() => void) | null = null;

export function getStudentsView(): TemplateResult | null {
  return pendingView;
}

export function getStudentsBottomBar(): TemplateResult | null {
  return pendingBottomBar;
}

/** Re-attach sentinel/tabs observers after the PWA re-renders the tab. */
export function studentsSync(): void {
  const fn = syncObserversFn;
  if (fn) requestAnimationFrame(fn);
}

export function initStudentsFeature(onUpdate: () => void): void {
  if (initialized) return;
  initialized = true;

  const now = new Date();
  const currentYear = now.getFullYear();
  const currentTheme = "";

  let tab: StudentsTab = "students";
  let view: StudentsView = "grid";
  let sortField: SortField = "name";
  let nameDir: SortDir = "asc";
  let dateDir: SortDir = "desc";
  let filter: StudentsFilter = "none";
  let poolIntake: { month: number; year: number } | null = null;
  let poolYear: number | null = null;
  let selectedPiscine: { year: number; month: number } | null = null;

  const toggleFilter = (key: FilterKey) => {
    filter = filter === key ? "none" : key;
    visibleCount = INITIAL_VISIBLE_COUNT;
    if (tab === "students") {
      void loadStudentsPage(true);
      return;
    }
    rerender();
  };

  const savedView = localStorage.getItem("STUDENTS_VIEW");
  if (savedView === "grid" || savedView === "list") view = savedView;

  const setView = (v: StudentsView) => {
    if (view === v) return;
    view = v;
    localStorage.setItem("STUDENTS_VIEW", view);
    rerender();
  };

  let savedSortData: {
    field?: SortField;
    nameDir?: SortDir;
    dateDir?: SortDir;
  } | null = null;
  try {
    savedSortData = JSON.parse(localStorage.getItem("STUDENTS_SORT") || "null");
  } catch {
    /* ignore */
  }
  if (savedSortData) {
    if (savedSortData.field === "name" || savedSortData.field === "date")
      sortField = savedSortData.field;
    if (savedSortData.nameDir === "asc" || savedSortData.nameDir === "desc")
      nameDir = savedSortData.nameDir;
    if (savedSortData.dateDir === "asc" || savedSortData.dateDir === "desc")
      dateDir = savedSortData.dateDir;
  }

  const persistSort = () => {
    localStorage.setItem(
      "STUDENTS_SORT",
      JSON.stringify({ field: sortField, nameDir, dateDir }),
    );
  };

  const setSort = (field: SortField) => {
    if (sortField === field) {
      if (field === "name") nameDir = nameDir === "asc" ? "desc" : "asc";
      else dateDir = dateDir === "desc" ? "asc" : "desc";
    } else {
      sortField = field;
    }
    persistSort();
    if (tab === "students") {
      void loadStudentsPage(true);
      return;
    }
    entries = sortEntries(entries, tab, sortField, nameDir, dateDir);
    rerender();
  };

  let entries: StudentEntry[] = [];
  let piscineList: PiscineEntry[] = [];
  let piscineListLoading = false;
  let piscineListLoaded = false;
  let loading = true;
  let loadingMore = false;
  let lastFetched = 0;
  let query = "";
  let authError = false;
  let visibleCount = INITIAL_VISIBLE_COUNT;
  let baseTotal = 0;
  let filteredTotal = 0;
  let activeCount = 0;
  let filterOptions: StudentsFilterOptions | null = null;
  let searchTimeout: number | null = null;
  let isMaximized = false;
  let tabsOverflowing = false;
  let disposed = false;

  const loadStudentsPage = async (reset: boolean) => {
    if (reset) {
      loading = true;
      authError = false;
      rerender();
    } else {
      if (loadingMore || entries.length >= filteredTotal) return;
      loadingMore = true;
      rerender();
    }

    const res = await fetchStudentsPage({
      offset: reset ? 0 : entries.length,
      limit: INITIAL_VISIBLE_COUNT,
      sort: sortField,
      dir: sortField === "name" ? nameDir : dateDir,
      filter,
      poolIntake,
      poolYear,
      query,
    });
    if (disposed) return;

    if (res?.unauthorized) {
      entries = [];
      lastFetched = 0;
      authError = true;
      baseTotal = 0;
      filteredTotal = 0;
      activeCount = 0;
    } else if (res?.data) {
      const page = res.data.data || [];
      entries = reset ? page : [...entries, ...page];
      baseTotal = res.data.total ?? entries.length;
      filteredTotal = res.data.filtered ?? entries.length;
      activeCount = res.data.active ?? 0;
      if (res.data.options) filterOptions = res.data.options;
      lastFetched = res.data.cached_at || 0;
      if (reset) visibleCount = INITIAL_VISIBLE_COUNT;
    } else if (reset) {
      entries = [];
      lastFetched = 0;
      baseTotal = 0;
      filteredTotal = 0;
      activeCount = 0;
      filterOptions = null;
    } else {
      filteredTotal = entries.length;
    }

    loading = false;
    loadingMore = false;
    rerender();
  };

  const load = async () => {
    if (tab === "students") {
      await loadStudentsPage(true);
      return;
    }
    loading = true;
    authError = false;
    rerender();
    let res: Awaited<ReturnType<typeof fetchPisciners>>;
    if (tab === "pisciners" && selectedPiscine) {
      res = await fetchPisciners(selectedPiscine.year, selectedPiscine.month);
    } else if (tab === "pisciners") {
      res = null;
    } else {
      res = await fetchFutureStudents();
    }
    if (disposed) return;
    if (res?.unauthorized) {
      entries = [];
      lastFetched = 0;
      authError = true;
    } else if (res?.data) {
      entries = sortEntries(
        res.data.data || [],
        tab,
        sortField,
        nameDir,
        dateDir,
      );
      lastFetched = res.data.cached_at || 0;
      visibleCount = INITIAL_VISIBLE_COUNT;
    } else {
      entries = [];
      lastFetched = 0;
    }
    loading = false;
    rerender();
  };

  const loadPiscineList = async () => {
    if (piscineListLoaded) {
      rerender();
      return;
    }
    piscineListLoading = true;
    rerender();
    const res = await fetchPiscines();
    if (disposed) return;
    if (res?.unauthorized) {
      piscineList = [];
      authError = true;
    } else if (res?.data) {
      piscineList = res.data.data || [];
    } else {
      piscineList = [];
    }
    piscineListLoading = false;
    piscineListLoaded = true;
    rerender();
  };

  const switchTab = async (t: StudentsTab) => {
    if (tab === t) return;
    tab = t;
    query = "";
    filter = "none";
    poolIntake = null;
    poolYear = null;
    visibleCount = INITIAL_VISIBLE_COUNT;
    if (tab === "pisciners") {
      selectedPiscine = null;
      rerender();
      await loadPiscineList();
      return;
    }
    rerender();
    await load();
  };

  const openRow = (login: string) => {
    window.open(`https://profile.intra.42.fr/users/${login}`, "_blank");
  };

  const handlers: StudentsTemplateHandlers = {
    onSwitchTab: (t) => {
      void switchTab(t);
    },
    onSetView: setView,
    onSetSort: setSort,
    onToggleFilter: toggleFilter,
    onClose: () => {},
    onToggleMaximize: () => {
      isMaximized = !isMaximized;
      rerender();
    },
    onSearchInput: (value) => {
      query = value;
      visibleCount = INITIAL_VISIBLE_COUNT;
      if (searchTimeout !== null) window.clearTimeout(searchTimeout);
      searchTimeout = window.setTimeout(() => {
        if (tab === "students") {
          void loadStudentsPage(true);
          return;
        }
        rerender();
      }, 150);
    },
    onLoadMore: () => {
      if (tab === "students") void loadStudentsPage(false);
    },
    onSelectPiscine: (year, month) => {
      selectedPiscine = { year, month };
      visibleCount = INITIAL_VISIBLE_COUNT;
      void load();
    },
    onBackToPiscines: () => {
      selectedPiscine = null;
      visibleCount = INITIAL_VISIBLE_COUNT;
      rerender();
    },
    onPoolIntake: (value) => {
      const intakes =
        tab === "students"
          ? (filterOptions?.intakes ?? [])
          : poolIntakes(entries, currentYear);
      poolIntake = value === 0 ? null : (intakes[value - 1] ?? null);
      poolYear = null;
      visibleCount = INITIAL_VISIBLE_COUNT;
      if (tab === "students") {
        void loadStudentsPage(true);
        return;
      }
      rerender();
    },
    onPoolYear: (value) => {
      poolYear = value === 0 ? null : value;
      poolIntake = null;
      visibleCount = INITIAL_VISIBLE_COUNT;
      if (tab === "students") {
        void loadStudentsPage(true);
        return;
      }
      rerender();
    },
    onClearFilters: () => {
      filter = "none";
      poolIntake = null;
      poolYear = null;
      visibleCount = INITIAL_VISIBLE_COUNT;
      if (tab === "students") {
        void loadStudentsPage(true);
        return;
      }
      rerender();
    },
    onRowClick: openRow,
    onConnect: () => {
      window.location.href = loginUrl();
    },
  };

  const buildState = (): StudentsTemplateState => ({
    currentTheme,
    tab,
    view,
    sortField,
    nameDir,
    dateDir,
    filter,
    poolIntake,
    poolYear,
    piscineList,
    piscineListLoading,
    selectedPiscine,
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
    filterOptions,
    currentYear,
    isMaximized,
    tabsOverflowing,
  });

  const syncObservers = () => {
    if (disposed) return;
    if (sentinelObserver) {
      sentinelObserver.disconnect();
      sentinelObserver = null;
    }
    const sentinel = document.querySelector<HTMLElement>(
      ".students-feature .sentinel",
    );
    if (sentinel) {
      sentinelObserver = new IntersectionObserver(
        (observerEntries) => {
          if (!observerEntries.some((e) => e.isIntersecting)) return;
          if (tab === "students") {
            void loadStudentsPage(false);
            return;
          }
          visibleCount += WINDOW_STEP;
          rerender();
        },
        { root: null, rootMargin: "400px" },
      );
      sentinelObserver.observe(sentinel);
    }

    if (tabsResizeObserver) {
      tabsResizeObserver.disconnect();
      tabsResizeObserver = null;
    }
    tabsResizeObserver = observeTabsOverflow(
      ".ft-subtabs .segmented-tabs-host",
      Object.values(STUDENTS_TAB_LABELS),
      (overflowing) => {
        if (overflowing === tabsOverflowing) return;
        tabsOverflowing = overflowing;
        rerender();
      },
    );
  };

  const rerender = () => {
    if (disposed) return;
    const state = buildState();
    pendingView = renderStudentsDialogTemplate(state, handlers);
    pendingBottomBar = renderStudentsBottomBar(state, handlers);
    onUpdate();
    requestAnimationFrame(syncObservers);
  };

  syncObserversFn = syncObservers;
  rerender();
  onUpdate();
  void load();
}
