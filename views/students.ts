import { html } from "lit-html";
import {
  getStudentsView,
  initStudentsFeature,
  studentsSync,
} from "./students-feature/controller.ts";
import { refresh } from "../refresh.ts";

let started = false;

export function studentsView(): unknown {
  const v = getStudentsView();
  if (v) return v;
  return html`<div class="flex justify-center py-10">
    <span class="loading loading-spinner loading-lg"></span>
  </div>`;
}

export async function loadStudents(force = false): Promise<void> {
  if (!started || force) {
    started = true;
    initStudentsFeature(refresh);
  }
  studentsSync();
}

/** Called by the app after it re-renders the tab, to re-attach observers. */
export function studentsAttachObservers(): void {
  studentsSync();
}