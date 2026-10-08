import { html } from "lit-html";
import {
  getFriendsView,
  initFriendsFeature,
  refreshFriends,
} from "./friends-feature/widget.ts";
import { refresh } from "../refresh.ts";

let started = false;

export function friendsView(): unknown {
  const v = getFriendsView();
  if (v) return v;
  return html`<div class="flex justify-center py-10">
    <span class="loading loading-spinner loading-lg"></span>
  </div>`;
}

export async function loadFriends(force = false): Promise<void> {
  if (!started) {
    started = true;
    void initFriendsFeature(refresh);
    return;
  }
  if (force) refreshFriends();
}
