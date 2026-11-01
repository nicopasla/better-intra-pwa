import {
  friendsListEmpty,
  getFriendsView,
  getFriendsBottomBar,
  initFriendsFeature,
  refreshFriends,
} from "./friends-feature/widget.ts";
import { refresh } from "../refresh.ts";
import { rowSkeleton } from "../lib/skeletons.ts";

export { friendsListEmpty };

let started = false;

export function friendsView(): unknown {
  const v = getFriendsView();
  if (v) return v;
  return rowSkeleton(7);
}

export function friendsBottomBar(): unknown {
  return getFriendsBottomBar() ?? "";
}

export async function loadFriends(force = false): Promise<void> {
  if (!started) {
    started = true;
    void initFriendsFeature(refresh);
    return;
  }
  if (force) refreshFriends();
}
