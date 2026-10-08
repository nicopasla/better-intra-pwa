import { html } from "lit-html";
import { unsafeHTML } from "lit-html/directives/unsafe-html.js";
import { CalendarEvent, events } from "../data.ts";
import { refresh } from "../refresh.ts";
import CALENDAR_SVG from "../assets/calendar.svg?raw";
import CLOCK_SVG from "../assets/clock.svg?raw";

const TEAL = "rgb(0,186,188)";

let items: CalendarEvent[] = [];
let loading = true;
let error = "";
let loaded = false;

const svg16 = (raw: string) =>
  unsafeHTML(raw.replace("<svg", '<svg width="16" height="16"'));

export function eventsView(): unknown {
  if (loading)
    return html`<div class="flex justify-center py-10"><span class="loading loading-spinner loading-lg"></span></div>`;
  if (error)
    return html`<div class="card bg-base-100 shadow-xl"><div class="card-body items-center gap-3">
      <p class="text-sm opacity-70">Couldn't load your events.</p>
      <p class="text-xs text-error">${error}</p>
      <button class="btn btn-sm btn-outline" @click=${() => loadEvents(true)}>Retry</button>
    </div></div>`;
  if (items.length === 0)
    return html`<div class="card bg-base-100 shadow-xl">
      <div class="card-body items-center text-center gap-2">
        <p class="font-bold text-lg" style="color:${TEAL};">Calendar</p>
        <p class="text-sm opacity-70">No subscribed events yet. Open the extension hub → Calendar to sync your events.</p>
      </div>
    </div>`;
  return html`<div class="flex flex-col gap-3">${items.map(eventCard)}</div>`;
}

function eventCard(e: CalendarEvent) {
  const start = new Date(e.beginAt);
  const end = new Date(e.endAt);
  const weekday = start.toLocaleDateString(undefined, { weekday: "short" });
  const day = String(start.getDate());
  const month = start.toLocaleDateString(undefined, { month: "short" });
  const href =
    e.url ??
    (e.id ? `https://events.intra.42.fr/events/${e.id}` : undefined);

  const card = html`
    <div class="flex w-full h-24 rounded-2xl overflow-hidden border border-base-300 bg-base-100 shadow-sm">
      <div
        class="w-20 flex-none flex flex-col items-center justify-center gap-0.5 text-white font-thin"
        style="background-color:${TEAL};"
      >
        <span class="text-xs">${weekday}</span>
        <span class="font-bold text-xl leading-none">${day}</span>
        <span class="text-xs">${month}</span>
      </div>
      <div class="flex-1 px-3 py-2 min-w-0 flex flex-col">
        <div class="font-bold text-base leading-snug line-clamp-2" style="color:${TEAL};">${e.name}</div>
        <div class="flex flex-row gap-4 flex-wrap items-center text-sm mt-auto" style="color:${TEAL};">
          <span class="flex items-center gap-0.5">${svg16(CALENDAR_SVG)}${formatDuration(start, end)}</span>
          <span class="flex items-center gap-0.5">${svg16(CLOCK_SVG)}${relativeTime(start)}</span>
          ${e.location ? html`<span class="flex items-center gap-0.5">📍 ${e.location}</span>` : ""}
        </div>
      </div>
    </div>
  `;

  return href
    ? html`<a href="${href}" target="_blank" rel="noopener noreferrer" class="no-underline">${card}</a>`
    : card;
}

function formatDuration(start: Date, end: Date): string {
  const min = Math.round((end.getTime() - start.getTime()) / 60000);
  if (min < 60) return `${min}m`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h}h${m}m` : `${h}h`;
}

function relativeTime(d: Date): string {
  const diff = d.getTime() - Date.now();
  if (diff < 0) return "started";
  const days = Math.floor(diff / 86400000);
  if (days === 0) {
    const h = Math.floor(diff / 3600000);
    if (h === 0) {
      const m = Math.max(1, Math.floor(diff / 60000));
      return `in ${m}m`;
    }
    return `in ${h}h`;
  }
  if (days === 1) return "tomorrow";
  return `in ${days} days`;
}

export async function loadEvents(force = false): Promise<void> {
  if (loaded && !force && !error) return;
  loading = true;
  error = "";
  refresh();
  try {
    items = await events();
    loaded = true;
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
    loaded = false;
  } finally {
    loading = false;
    refresh();
  }
}