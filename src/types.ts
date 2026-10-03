// Shared types across the extension.

// Result of a follow-status check (background -> content script).
export interface FollowStatus {
  viewerFollowsTarget: boolean | null;
  targetFollowsViewer: boolean;
}

// Messages from the content script to the background service worker.
export type BackgroundMessage =
  | { type: "checkFollow"; viewer: string; target: string }
  | { type: "getLists"; viewer: string };

// Follower list snapshot for a user. Sets are serialized to arrays when
// messaged or persisted.
export interface UserLists {
  followers: string[];
  following?: string[];
  fetchedAt: number;
  error?: boolean;
}

// Timestamped cache entry persisted in chrome.storage.local.
export interface CacheEntry<T> {
  ts: number;
  data: T;
}
