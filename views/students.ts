import {
  getStudentsBottomBar,
  getStudentsView,
  initStudentsFeature,
  studentsSync,
} from "./students-feature/controller.ts";
import { refresh } from "../refresh.ts";
import { rowSkeleton } from "../lib/skeletons.ts";

let started = false;

export function studentsView(): unknown {
  const v = getStudentsView();
  if (v) return v;
  return rowSkeleton(7);
}

export function studentsBottomBar(): unknown {
  return getStudentsBottomBar() ?? "";
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
