import { html, render } from "lit-html";
import { unsafeHTML } from "lit-html/directives/unsafe-html.js";
import { relativeTime } from "../lib/format.ts";
import { lockScroll, unlockScroll } from "../lib/scroll-lock.ts";
import { refresh } from "../refresh.ts";
import {
  SEAT_COMPONENTS,
  SEAT_COMPONENT_MAP,
} from "./clusters-feature/components.ts";
import type {
  SeatComponentDef,
  SeatComponentKey,
} from "./clusters-feature/components.ts";
import { SEAT_COMPONENT_ICONS } from "./clusters-feature/seat-icons.ts";
import {
  getComponentStatus,
  getSeatReport,
  loadSeatHistory,
  submitSeatReports,
} from "./clusters-feature/reports.ts";
import type {
  SeatComponentStatus,
  SeatReportEvent,
} from "./clusters-feature/types.ts";
import CHECK_SVG from "../assets/check.svg?raw";
import X_SVG from "../assets/x.svg?raw";

const DIALOG_ID = "ft-seat-report-dialog";

export interface SeatReportDialogOptions {
  seat: string;
  cluster: string;
  occupant: string | null;
}

const icon = (raw: string, size = 12) =>
  unsafeHTML(raw.replace("<svg", `<svg width="${size}" height="${size}"`));

function componentCell(
  def: SeatComponentDef,
  status: SeatComponentStatus | undefined,
  disabled: boolean,
  onSelect: (component: SeatComponentKey, status: SeatComponentStatus) => void,
) {
  const icons = SEAT_COMPONENT_ICONS[def.key];
  const broken = status === "broken";
  const next: SeatComponentStatus = broken ? "works" : status === "works" ? "broken" : "works";
  const tone = broken
    ? "badge-error"
    : status === "works"
      ? "badge-success"
      : "badge-ghost";
  const hint = broken
    ? `${def.label}: broken — tap to mark working`
    : status === "works"
      ? `${def.label}: working — tap to mark broken`
      : `${def.label}: not reported — tap to mark working`;
  return html`<div
    class="flex flex-col items-center gap-1 rounded-lg bg-base-200/60 p-1"
  >
    <span class="text-center text-xs font-semibold leading-tight"
      >${def.label}</span
    >
    <button
      type="button"
      class="badge badge-lg h-10 w-full rounded-lg p-0 disabled:pointer-events-none disabled:opacity-50 ${tone}"
      title=${hint}
      aria-label=${hint}
      ?disabled=${disabled}
      @click=${() => onSelect(def.key, next)}
    >
      ${icon(broken ? icons.off : icons.on, 24)}
    </button>
  </div>`;
}

/** Opens the anonymous component-status sheet for a cluster seat. */
export function openSeatReportDialog(options: SeatReportDialogOptions): void {
  document.getElementById(DIALOG_ID)?.remove();
  const { seat, cluster, occupant } = options;

  const dialog = document.createElement("dialog");
  dialog.id = DIALOG_ID;
  dialog.className = "bg-transparent backdrop:bg-black/50";
  dialog.style.cssText =
    "margin:auto;padding:0;border:none;outline:none;max-width:28rem;width:calc(100dvw - 2rem);";

  let draft = new Map<SeatComponentKey, SeatComponentStatus>();
  let saving = false;
  let error = "";
  let history: SeatReportEvent[] | null = null;
  let historyError = "";
  let historyToken = 0;

  const close = () => {
    dialog.close();
    dialog.remove();
  };

  const currentStatus = (component: SeatComponentKey) =>
    getComponentStatus(seat, component)?.status;

  const effectiveStatus = (component: SeatComponentKey) => {
    const explicit = draft.get(component) ?? currentStatus(component);
    if (explicit) return explicit;
    // Everything is assumed working unless a component opts out (USB-C).
    return SEAT_COMPONENT_MAP.get(component)?.assumeWorking === false
      ? undefined
      : "works";
  };

  const loadHistory = async () => {
    const token = ++historyToken;
    try {
      const events = await loadSeatHistory(seat);
      if (token !== historyToken) return;
      history = events;
      historyError = "";
    } catch {
      if (token !== historyToken) return;
      historyError = "Couldn't load the history.";
    }
    draw();
  };

  const select = (
    component: SeatComponentKey,
    status: SeatComponentStatus,
  ) => {
    if (saving) return;
    if (effectiveStatus(component) === status || currentStatus(component) === status) {
      draft.delete(component);
    } else {
      draft.set(component, status);
    }
    error = "";
    draw();
  };

  const submitEntries = async (
    entries: { component: SeatComponentKey; status: SeatComponentStatus }[],
  ) => {
    saving = true;
    error = "";
    draw();
    try {
      await submitSeatReports(seat, cluster, entries);
      draft.clear();
      void loadHistory();
      refresh();
    } catch {
      error = "Couldn't save the report. Try again.";
    } finally {
      saving = false;
      draw();
    }
  };

  const save = async () => {
    if (saving || draft.size === 0) return;
    await submitEntries(
      [...draft].map(([component, status]) => ({ component, status })),
    );
  };

  /** Confirms the whole seat as working in one go. */
  const onEverythingWorks = async () => {
    if (saving) return;
    draft.clear();
    await submitEntries(
      SEAT_COMPONENTS.map((component) => ({
        component: component.key,
        status: "works" as const,
      })),
    );
  };

  /** First visit on an unreported seat: record the default working baseline. */
  const seedWorking = async () => {
    try {
      await submitSeatReports(
        seat,
        cluster,
        SEAT_COMPONENTS.filter(
          (component) => component.assumeWorking !== false,
        ).map((component) => ({
          component: component.key,
          status: "works" as const,
        })),
      );
      void loadHistory();
      refresh();
    } catch {
      /* the next open retries */
    }
  };

  const historyList = () => {
    if (history === null) {
      return html`<div class="flex justify-center py-2">
        <span class="loading loading-spinner loading-xs"></span>
      </div>`;
    }
    if (historyError) {
      return html`<p class="text-xs text-error">${historyError}</p>`;
    }
    const rows = history
      .filter((event) => SEAT_COMPONENT_MAP.has(event.component))
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, 30);
    if (rows.length === 0) {
      return html`<p class="text-xs opacity-60">No changes reported yet.</p>`;
    }
    return html`<div class="flex flex-col gap-1.5">
      ${rows.map((event) => {
        const def = SEAT_COMPONENT_MAP.get(event.component)!;
        const icons = SEAT_COMPONENT_ICONS[event.component];
        const works = event.status === "works";
        return html`<div
          class="flex items-center justify-between gap-2 rounded-lg bg-base-200/60 px-2 py-1.5"
        >
          <span class="flex min-w-0 items-center gap-1.5 text-xs font-medium">
            <span class="flex size-4 shrink-0 items-center justify-center opacity-70"
              >${icon(works ? icons.on : icons.off, 14)}</span
            >
            <span class="truncate">${def.label}</span>
          </span>
          <span class="flex shrink-0 items-center gap-2">
            <span class="text-[11px] opacity-60"
              >${relativeTime(event.createdAt)}</span
            >
            <span
              class="badge badge-sm ${works ? "badge-success" : "badge-error"}"
              >${works ? "Working" : "Broken"}</span
            >
          </span>
        </div>`;
      })}
    </div>`;
  };

  const body = () => html`
    ${occupant
      ? html`<div class="alert alert-info alert-soft py-2 text-xs">
          <span>In use by <strong>${occupant}</strong> right now.</span>
        </div>`
      : ""}
    <div class="grid grid-cols-3 gap-1.5">
      ${SEAT_COMPONENTS.map((def) =>
        componentCell(def, effectiveStatus(def.key), saving, select),
      )}
    </div>
    <div class="flex flex-wrap items-center gap-2">
      <button
        type="button"
        class="badge badge-lg badge-success gap-1 px-3 font-semibold disabled:pointer-events-none disabled:opacity-50"
        ?disabled=${saving}
        @click=${onEverythingWorks}
      >
        ${icon(CHECK_SVG, 12)} Everything works
      </button>
      <button
        type="button"
        class="btn btn-sm btn-primary flex-1"
        ?disabled=${saving || draft.size === 0}
        @click=${save}
      >
        ${saving
          ? html`<span class="loading loading-spinner loading-xs"></span>`
          : `Save changes${draft.size ? ` (${draft.size})` : ""}`}
      </button>
    </div>
    ${error ? html`<p class="text-xs text-error">${error}</p>` : ""}
    <details class="collapse collapse-arrow rounded-box bg-base-200/60">
      <summary class="collapse-title text-sm font-medium">History</summary>
      <div class="collapse-content">${historyList()}</div>
    </details>
    <p class="text-center text-xs opacity-60">Reports are anonymous</p>
  `;

  const draw = () => {
    render(
      html`
        <div
          class="bg-base-100 text-base-content flex max-h-[85vh] flex-col overflow-hidden rounded-2xl shadow-2xl"
        >
          <div
            class="flex items-center justify-between gap-3 border-b border-base-300 px-4 py-3"
          >
            <div class="min-w-0">
              <div class="truncate font-bold">${seat.toUpperCase()}</div>
            </div>
            <button
              type="button"
              class="btn btn-ghost btn-sm shrink-0"
              aria-label="Close"
              @click=${close}
            >
              ${unsafeHTML(
                X_SVG.replace("<svg", '<svg width="18" height="18"'),
              )}
            </button>
          </div>
          <div class="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 py-4">
            ${body()}
          </div>
        </div>
      `,
      dialog,
    );
  };

  dialog.addEventListener("click", (ev) => {
    if (ev.target === dialog) close();
  });
  dialog.addEventListener("close", () => {
    unlockScroll();
    dialog.remove();
  });

  document.body.appendChild(dialog);
  lockScroll();
  dialog.showModal();
  draw();
  void loadHistory();
  // Unreported seat: store the "everything works" baseline on first open.
  if (!getSeatReport(seat)?.components.length) void seedWorking();
}
