import * as followDom from "./utils/follow/dom.js";
import * as followClient from "./utils/follow/client.js";
import * as autocompleteDom from "./utils/autocomplete/dom.js";
import * as autocompleteActions from "./utils/autocomplete/actions.js";
import { startHomeFeed } from "./utils/homefeed/feed.js";
import type { FollowStatus } from "./types.js";

type ContentElement = HTMLElement & {
  value?: string;
  title?: string;
  hidden?: boolean;
  offsetParent?: Element | null;
  disabled?: boolean;
  checked?: boolean;
};

type ContentContainer = Document | HTMLElement;

function asContentElement(element: Element): ContentElement {
  return element as ContentElement;
}

function asButtonElement(element: Element): HTMLButtonElement {
  return element as HTMLButtonElement;
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

declare global {
  interface Window {
    __gh_last_location?: string;
  }
}

(async function () {
  "use strict";
  // If no token is set in storage, follow-related behavior is disabled.
  // (The home feed restore still works — it only needs the GitHub session.)
  let hasToken = true;
  try {
    const token = await new Promise<string | null>((resolve) =>
      chrome.storage.sync.get(["github_utils_token"], (items) =>
        resolve(
          (items as Record<string, unknown>).github_utils_token as
            string | null,
        ),
      ),
    );
    if (!token) {
      hasToken = false;
      try {
        console.debug(
          "[gh-utils] content: token missing — follow features disabled",
        );
      } catch (e) {}
    }
  } catch (e) {
    hasToken = false;
  }

  function getCurrentUser() {
    const m = document.querySelector<ContentElement>('meta[name="user-login"]');
    return m ? (m as HTMLMetaElement).content : null;
  }

  try {
    window.addEventListener("unhandledrejection", (ev) => {
      try {
        const r = ev.reason;
        const msg = (r && r.message) || (typeof r === "string" ? r : null);
        if (
          msg &&
          msg.indexOf &&
          msg.indexOf("Extension context invalidated") !== -1
        ) {
          console.warn("[gh-utils] suppressed unhandledrejection:", msg);
          ev.preventDefault && ev.preventDefault();
        }
      } catch (e) {}
    });
  } catch (e) {}
  // Reserved paths that are not user accounts
  const IGNORED_PATHS = [
    // Navigation & features
    "notifications",
    "settings",
    "explore",
    "marketplace",
    "features",
    "pricing",
    "pulls",
    "issues",
    "feed",
    "codespaces",
    "copilot",
    // Account & auth
    "account",
    "login",
    "logout",
    "signup",
    "join",
    "sessions",
    "password_reset",
    // Sponsorship & billing
    "sponsors",
    "sponsorships",
    "billing",
    // Resources & docs
    "about",
    "security",
    "enterprise",
    "team",
    "customer-stories",
    "readme",
    "resources",
    "events",
    "collections",
    "topics",
    "trending",
    "search",
    // Orgs & special pages
    "orgs",
    "organizations",
    "new",
    "apps",
    "integrations",
    "site",
    "contact",
    "support",
    "status",
    "education",
  ];

  function getProfileFromPath() {
    const m = location.pathname.match(/^\/([^/]+)(?:\/.*)?$/);
    if (!m) return null;
    const u = m[1];
    return IGNORED_PATHS.includes(u.toLowerCase()) ? null : u;
  }
  function isOwnFollowers() {
    try {
      const qs = new URLSearchParams(location.search);
      return (
        qs.get("tab") === "followers" &&
        getCurrentUser() === getProfileFromPath()
      );
    } catch (e) {
      return false;
    }
  }

  /**
   * Determine whether follow logic should be active on the current page.
   * Allowed pages:
   *   - github.com (Home)
   *   - github.com/feed (Feed)
   *   - github.com/[username] (profile)
   *   - github.com/[username]?tab=following
   *   - github.com/[username]?tab=followers
   * Disallowed:
   *   - github.com/[user]/[repo] or deeper paths
   */
  function shouldRunFollowLogic() {
    try {
      const path = location.pathname;
      // Home / Feed pages
      if (path === "/" || path === "" || path === "/feed" || path === "/feed/")
        return true;
      // Match /username or /username/ (no further segments)
      const match = path.match(/^\/([^/]+)\/?$/);
      if (match) {
        const segment = match[1];
        // Exclude reserved paths (already defined in IGNORED_PATHS)
        if (IGNORED_PATHS.includes(segment.toLowerCase())) return false;
        return true;
      }
      // Any deeper path like /user/repo is not allowed
      return false;
    } catch (e) {
      return false;
    }
  }

  function shouldUseBulkChecks() {
    const profile = getProfileFromPath();
    const viewer = getCurrentUser();
    if (!profile || !viewer) return false;
    return profile !== viewer;
  }

  async function resolveFollowStatus(
    viewer: string,
    name: string,
  ): Promise<FollowStatus | null> {
    const client = followClient;
    const useBulk = shouldUseBulkChecks();
    if (useBulk && client) {
      return client.getFollowStatusOnce(viewer, name).catch(() => null);
    }
    return new Promise((resolve) => {
      chrome.runtime.sendMessage(
        { type: "checkFollow", viewer, target: name },
        (r) => {
          if (chrome.runtime.lastError) {
            console.warn(
              "[gh-utils] checkFollow msg failed",
              chrome.runtime.lastError,
            );
            resolve(null);
            return;
          }
          resolve(r || null);
        },
      );
    });
  }

  async function handleButton(btn: ContentElement): Promise<void> {
    const dom = followDom;

    const viewer = getCurrentUser();
    if (!viewer) return;
    const name = dom.extractUsernameFromButton(asButtonElement(btn));
    if (!name) return;
    // Skip if the extracted name is a non-user path (e.g., /explore, /settings)
    if (IGNORED_PATHS.includes(name.toLowerCase())) return;
    if (isOwnFollowers()) {
      const badge = dom.createBadge("followed", "github-utils-list-badge");
      dom.appendBadgeToChecker(btn, badge);
      return;
    }
    const placeholder = dom.insertPlaceholderInChecker(
      btn,
      "github-utils-list-badge",
    );

    const resp = await resolveFollowStatus(viewer, name);

    if (!resp) {
      dom.replaceWithBadge(placeholder, "unknown", "github-utils-list-badge");
      return;
    }
    const badge = dom.createBadge(
      resp.targetFollowsViewer ? "followed" : "not_followed",
      "github-utils-list-badge",
    );
    if (placeholder && placeholder.replaceWith) placeholder.replaceWith(badge);
    else dom.appendBadgeToChecker(btn, badge);
  }

  function scan(root: ContentContainer = document): void {
    const buttons = Array.from(
      root.querySelectorAll<ContentElement>('input[type="submit"],button'),
    ).filter((b) =>
      /(^|\s)(follow|unfollow)($|\s)/i.test(
        (
          b.title ||
          b.getAttribute("aria-label") ||
          b.value ||
          b.textContent ||
          b.innerText ||
          ""
        ).toLowerCase(),
      ),
    );
    buttons.forEach((b) => {
      try {
        if (b.hidden || b.hasAttribute("hidden") || b.offsetParent === null)
          return;
        // Skip buttons inside feed items (articles) — scanFeed handles those
        if (b.closest("article")) return;
        // Skip buttons inside hovercards/popups — scanHover handles those
        if (b.closest("[data-hovercard-url], .Popover, .Popover-message"))
          return;
        // scope the duplicate check to the button's own row/container so multiple users in the same broader item can each get badges
        const row =
          b.closest(".d-table") || b.closest("li") || b.closest("div");
        if (
          row &&
          row.querySelector<ContentElement>(
            ".github-utils-list-badge, .github-utils-follow-badge",
          )
        )
          return;
        handleButton(asContentElement(b));
      } catch (e) {}
    });
  }

  function scanFeed(root: ContentContainer = document): void {
    try {
      const viewer = getCurrentUser();
      if (!viewer) return;

      // process per feed item/article to avoid cross-binding badges
      const items = Array.from(
        root.querySelectorAll<ContentElement>(
          "article, .js-feed-item-component, .news, .TimelineItem, .js-timeline-item, .news-item",
        ),
      );

      items.forEach((item) => {
        try {
          // track usernames we've already added badges for in this article
          const namesSeen = new Set();

          // detect event type early (used to special-case STARRED_REPOSITORY)
          const hv = item.getAttribute && item.getAttribute("data-hydro-view");
          const isFollowEvent = hv && hv.indexOf('"card_type":"FOLLOW"') !== -1;
          const isStarredEvent =
            hv && hv.indexOf('"card_type":"STARRED_REPOSITORY"') !== -1;
          const isTrendingEvent =
            hv && hv.indexOf('"card_type":"TRENDING_REPOSITORY"') !== -1;
          const isRecommendationEvent =
            hv && hv.indexOf('"card_type":"REPOSITORY_RECOMMENDATION"') !== -1;
          const isAddedToListEvent =
            hv && hv.indexOf('"card_type":"ADDED_TO_LIST"') !== -1;
          // Sponsor-related cards (e.g. NEAR_SPONSORS_GOAL) should not show badges
          const isSponsorEvent = hv && hv.indexOf("SPONSOR") !== -1;
          if (isSponsorEvent) return;

          // collect all anchors and identify repo links (owner/repo)
          const allAnchors = Array.from(
            (item.querySelectorAll &&
              item.querySelectorAll<ContentElement>('a[href^="/"]')) ||
              [],
          );
          if (!allAnchors.length) return;
          const repoAnchors = allAnchors.filter((a) => {
            try {
              const n = (a.getAttribute("href") || "")
                .replace(/^\//, "")
                .replace(/\/$/, "");
              return n.indexOf("/") !== -1;
            } catch (e) {
              return false;
            }
          });

          // consolidate existing badges in this article: keep one badge per username and remove duplicates
          try {
            // helper: attempt to find the closest username anchor for a badge element
            const findClosestAnchorName = (el: HTMLElement) => {
              try {
                const isValidAnchor = (a: Element) => {
                  const href = (a.getAttribute("href") || "")
                    .replace(/^\//, "")
                    .replace(/\/$/, "");
                  return href && href.indexOf("/") === -1;
                };

                // scan previous siblings for anchors
                let prev = el.previousElementSibling;
                for (
                  let i = 0;
                  prev && i < 8;
                  i++, prev = prev.previousElementSibling
                ) {
                  try {
                    if (
                      prev.matches &&
                      prev.matches('a[href^="/"]') &&
                      isValidAnchor(prev)
                    )
                      return (prev.getAttribute("href") || "")
                        .replace(/^\//, "")
                        .replace(/\/$/, "");
                    const inner =
                      prev.querySelector &&
                      prev.querySelector<ContentElement>('a[href^="/"]');
                    if (inner && isValidAnchor(inner))
                      return (inner.getAttribute("href") || "")
                        .replace(/^\//, "")
                        .replace(/\/$/, "");
                  } catch (e) {}
                }

                // search up the ancestor chain for anchors in local containers
                let anc: HTMLElement | null = el;
                for (let i = 0; anc && i < 8; i++) {
                  anc = anc.parentElement;
                  if (!anc) break;
                  try {
                    const a =
                      anc.querySelector &&
                      anc.querySelector<ContentElement>('a[href^="/"]');
                    if (a && isValidAnchor(a))
                      return (a.getAttribute("href") || "")
                        .replace(/^\//, "")
                        .replace(/\/$/, "");
                  } catch (e) {}
                }

                // fallback: choose the nearest anchor in the article by bounding rect distance
                const anchors = Array.from(
                  item.querySelectorAll<ContentElement>('a[href^="/"]'),
                ).filter((a) => {
                  try {
                    return isValidAnchor(a);
                  } catch (e) {
                    return false;
                  }
                });
                if (!anchors.length) return null;
                const elRect = el.getBoundingClientRect
                  ? el.getBoundingClientRect()
                  : { top: 0, left: 0 };
                let best: Element | null = null;
                let bestDist = Number.MAX_VALUE;
                anchors.forEach((a) => {
                  try {
                    const r = a.getBoundingClientRect();
                    const dist =
                      Math.abs(r.top - elRect.top) +
                      Math.abs(r.left - elRect.left);
                    if (dist < bestDist) {
                      bestDist = dist;
                      best = a;
                    }
                  } catch (e) {}
                });
                if (best)
                  return ((best as Element).getAttribute("href") || "")
                    .replace(/^\//, "")
                    .replace(/\/$/, "");
              } catch (e) {}
              return null;
            };

            // helper: if badge sits inside a form or user-following container, derive username from the form or button
            const getNameFromFormOrButton = (el: HTMLElement) => {
              try {
                const f =
                  el.closest("form") ||
                  el.closest(".user-following-container") ||
                  el.closest("div");
                if (!f) return null;
                // try action target
                try {
                  const action =
                    (f.getAttribute &&
                      (f.getAttribute("action") ||
                        (f instanceof HTMLFormElement ? f.action : "") ||
                        "")) ||
                    "";
                  const q = action.split("?")[1] || "";
                  const p = new URLSearchParams(q);
                  if (p.get("target")) return p.get("target");
                } catch (e) {}
                // look for follow button in the same form/container
                try {
                  const btns = Array.from(
                    (f.querySelectorAll &&
                      f.querySelectorAll<ContentElement>(
                        'input[type="submit"],button',
                      )) ||
                      [],
                  );
                  for (const b of btns) {
                    try {
                      const s = (
                        b.getAttribute("aria-label") ||
                        b.title ||
                        b.value ||
                        b.textContent ||
                        b.innerText ||
                        ""
                      ).trim();
                      const m = s.match(/Follow\s+(.*)|Unfollow\s+(.*)/i);
                      if (m) return (m[1] || m[2]).trim();
                    } catch (e) {}
                  }
                } catch (e) {}
                // fallback: anchor inside the form/container
                try {
                  const a =
                    f.querySelector &&
                    f.querySelector<ContentElement>('a[href^="/"]');
                  if (a)
                    return (a.getAttribute("href") || "")
                      .replace(/^\//, "")
                      .replace(/\/$/, "");
                } catch (e) {}
              } catch (e) {}
              return null;
            };

            const existingBadges = Array.from(
              item.querySelectorAll<ContentElement>(
                ".github-utils-list-badge, .github-utils-follow-badge",
              ),
            );
            const kept = new Set();

            // Move any badges that live inside forms or follow button containers into the persistent checker container
            try {
              Promise.resolve(followDom)
                .then((dom) => {
                  try {
                    existingBadges.forEach((b) => {
                      try {
                        const form =
                          b.closest("form") ||
                          b.closest(".user-following-container");
                        if (!form) return;
                        // find the follow/unfollow button in this form
                        const followBtn = Array.from(
                          (form.querySelectorAll &&
                            form.querySelectorAll(
                              'input[type="submit"],button',
                            )) ||
                            [],
                        ).find((bn) => {
                          try {
                            const s = (
                              bn.getAttribute("aria-label") ||
                              (bn as ContentElement).title ||
                              bn.textContent ||
                              (bn as ContentElement).innerText ||
                              ""
                            ).toLowerCase();
                            return /(^|\s)(follow|unfollow)($|\s)/i.test(s);
                          } catch (e) {
                            return false;
                          }
                        });
                        if (followBtn) {
                          try {
                            dom.appendBadgeToChecker(
                              asContentElement(followBtn),
                              b,
                            );
                          } catch (e) {}
                        }
                      } catch (e) {}
                    });
                  } catch (e) {}
                })
                .catch(() => {});
            } catch (e) {}

            existingBadges.forEach((b) => {
              try {
                let name = b.dataset.ghName || null;
                const prev = b.previousElementSibling;
                if (!name) {
                  if (prev && prev.matches && prev.matches('a[href^="/"]')) {
                    name = (prev.getAttribute("href") || "")
                      .replace(/^\//, "")
                      .replace(/\/$/, "");
                  } else if (b.parentElement) {
                    const anchors =
                      Array.from(
                        b.parentElement.querySelectorAll<ContentElement>(
                          'a[href^="/"]',
                        ),
                      ) || [];
                    if (anchors.length)
                      name = (anchors[0].getAttribute("href") || "")
                        .replace(/^\//, "")
                        .replace(/\/$/, "");
                  }
                }

                // try deriving name from nearby form/button if still missing
                if (!name) name = getNameFromFormOrButton(b);

                // attempt to find a nearby anchor if we still don't have a name
                if (!name) name = findClosestAnchorName(b);
                if (!name) return;

                // If this is a repository-type card that shows a repo (starred/trending/recommended/added-to-list) and this badge appears
                // to be attached to the repository's owner area, remove it (we don't want badges for the owner in these cards).
                if (
                  (isStarredEvent ||
                    isTrendingEvent ||
                    isRecommendationEvent ||
                    isAddedToListEvent) &&
                  repoAnchors.length
                ) {
                  const ownerAnchor =
                    prev && prev.matches && prev.matches('a[href^="/"]')
                      ? prev
                      : (b.parentElement &&
                          b.parentElement.querySelector<ContentElement>(
                            'a[href^="/"]',
                          )) ||
                        null;
                  if (ownerAnchor) {
                    const isOwnerNearRepo = repoAnchors.some((ra) => {
                      try {
                        return (
                          ra.closest("section") ===
                            ownerAnchor.closest("section") ||
                          ra.closest("div") === ownerAnchor.closest("div") ||
                          ra.parentElement === ownerAnchor.parentElement ||
                          ra.closest(".color-bg-subtle") ===
                            ownerAnchor.closest(".color-bg-subtle")
                        );
                      } catch (e) {
                        return false;
                      }
                    });
                    if (isOwnerNearRepo) {
                      try {
                        b.remove();
                      } catch (e) {}
                      return;
                    }
                  }
                }

                if (kept.has(name)) {
                  try {
                    b.remove();
                  } catch (e) {}
                } else {
                  kept.add(name);
                  namesSeen.add(name);
                  try {
                    b.dataset.ghName = name;
                  } catch (e) {}
                }
              } catch (e) {}
            });
          } catch (e) {}

          // determine if this feed item is a FOLLOW card (already detected above)

          // header anchor (top actor) - for follow and ADDED_TO_LIST events, show a badge for the actor
          let headerAnchor = null;
          if (isFollowEvent || isAddedToListEvent) {
            try {
              headerAnchor = item.querySelector<ContentElement>(
                'header a[href^="/"]',
              );
            } catch (e) {}
            if (headerAnchor) {
              const headerName = (headerAnchor.getAttribute("href") || "")
                .replace(/^\//, "")
                .replace(/\/$/, "");
              // skip invalid names / viewer / already-handled usernames / non-user paths
              if (
                !headerName ||
                headerName === viewer ||
                namesSeen.has(headerName) ||
                IGNORED_PATHS.includes(headerName.toLowerCase())
              ) {
                // nothing to do here
              } else {
                // if a badge for this name already exists elsewhere in the article, mark handled and skip
                try {
                  if (
                    item.querySelector<ContentElement>(
                      '.github-utils-list-badge[data-gh-name="' +
                        headerName +
                        '"] , .github-utils-follow-badge[data-gh-name="' +
                        headerName +
                        '"]',
                    )
                  ) {
                    namesSeen.add(headerName);
                  } else {
                    // ensure not already present immediately adjacent
                    const next = headerAnchor.nextElementSibling;
                    if (!(
                      next &&
                      next.classList &&
                      (next.classList.contains("github-utils-list-badge") ||
                        next.classList.contains("github-utils-follow-badge"))
                    )) {
                      const placeholder = document.createElement("span");
                      placeholder.className = "github-utils-list-badge";
                      placeholder.textContent = "...";
                      placeholder.dataset.ghName = headerName;
                      // Prefer placing the badge to the left of the action button/menu if present; otherwise fall back to name-side inline
                      try {
                        const header =
                          headerAnchor.closest("header") ||
                          headerAnchor.parentElement;
                        const actionBtn =
                          header &&
                          header.querySelector<ContentElement>(
                            ".feed-item-heading-menu-button, button[aria-haspopup], .user-following-container, .github-utils-checker",
                          );
                        if (actionBtn) {
                          try {
                            placeholder.style.display = "inline-block";
                            placeholder.style.marginRight = "6px";
                            placeholder.style.marginTop = "0";
                            actionBtn.insertAdjacentElement(
                              "beforebegin",
                              placeholder,
                            );
                          } catch (e) {
                            try {
                              actionBtn.parentElement &&
                                actionBtn.parentElement.insertBefore(
                                  placeholder,
                                  actionBtn,
                                );
                            } catch (e2) {}
                          }
                        } else {
                          try {
                            placeholder.style.display = "inline-flex";
                            placeholder.style.marginLeft = "6px";
                            placeholder.style.marginTop = "0";
                            placeholder.style.verticalAlign = "middle";
                          } catch (e) {}
                          try {
                            headerAnchor.insertAdjacentElement(
                              "afterend",
                              placeholder,
                            );
                          } catch (e) {
                            try {
                              headerAnchor.parentElement &&
                                headerAnchor.parentElement.appendChild(
                                  placeholder,
                                );
                            } catch (e2) {}
                          }
                        }
                      } catch (e) {}
                      // mark as handled for this article so other occurrences won't get duplicates
                      namesSeen.add(headerName);

                      // resolve status for header anchor (uses headerName)
                      (async () => {
                        try {
                          const dom = followDom;
                          const resp = await resolveFollowStatus(
                            viewer,
                            headerName,
                          );
                          if (!resp)
                            dom.replaceWithBadge(
                              placeholder,
                              "unknown",
                              "github-utils-list-badge name-side",
                            );
                          else
                            dom.replaceWithBadge(
                              placeholder,
                              resp.targetFollowsViewer
                                ? "followed"
                                : "not_followed",
                              "github-utils-list-badge name-side",
                            );
                        } catch (e) {
                          try {
                            placeholder &&
                              placeholder.replaceWith &&
                              placeholder.replaceWith(
                                document.createElement("span"),
                              );
                          } catch (e2) {}
                        }
                      })();
                    }
                  }
                } catch (e) {}
              }
            }
          }

          // For other anchors in the item, prefer per-row follow buttons
          allAnchors.forEach((a) => {
            try {
              if (isFollowEvent && headerAnchor && a === headerAnchor) return; // skip header anchor already handled
              // For ADDED_TO_LIST events, only show badge for the actor (header anchor); skip other anchors
              if (isAddedToListEvent && headerAnchor && a !== headerAnchor)
                return;
              const href = a.getAttribute("href") || "";
              const name = href.replace(/^\//, "").replace(/\/$/, "");
              if (!name || name.indexOf("/") !== -1) return;
              if (name === viewer) return;
              // Skip anchors that are not user profiles (e.g., /explore, /settings)
              if (IGNORED_PATHS.includes(name.toLowerCase())) return;
              // Skip anchors inside hovercards/popups — scanHover handles those
              if (a.closest("[data-hovercard-url], .Popover, .Popover-message"))
                return;
              // In repo-showing cards (STARRED/TRENDING/RECOMMENDATION/ADDED_TO_LIST), skip anchors that are part of the repo area entirely
              if (
                (isStarredEvent ||
                  isTrendingEvent ||
                  isRecommendationEvent ||
                  isAddedToListEvent) &&
                repoAnchors.length
              ) {
                // Check if this anchor's user is the owner of any repo in the card
                const isRepoOwner = repoAnchors.some((ra) => {
                  try {
                    const repoHref = ra.getAttribute("href") || "";
                    const repoParts = repoHref.replace(/^\//, "").split("/");
                    return (
                      repoParts[0] &&
                      repoParts[0].toLowerCase() === name.toLowerCase()
                    );
                  } catch (e) {
                    return false;
                  }
                });
                if (isRepoOwner) return;
              }
              if (namesSeen.has(name)) return;

              // find the nearest row/container for this user
              const userRow =
                a.closest("section") ||
                a.closest(".d-flex") ||
                a.closest(".feed-item-content") ||
                a.closest(".js-feed-item-view") ||
                item;
              if (!userRow) return;

              // skip if this userRow already has a badge
              if (
                userRow.querySelector &&
                userRow.querySelector<ContentElement>(
                  ".github-utils-list-badge, .github-utils-follow-badge",
                )
              )
                return;

              // find follow button in the same row
              const followBtn = Array.from(
                (userRow.querySelectorAll &&
                  userRow.querySelectorAll<ContentElement>(
                    'input[type="submit"],button',
                  )) ||
                  [],
              ).find((b) => {
                try {
                  const s = (
                    b.getAttribute("aria-label") ||
                    b.title ||
                    b.textContent ||
                    b.innerText ||
                    ""
                  ).toLowerCase();
                  return /(^|\s)(follow|unfollow)($|\s)/i.test(s);
                } catch (e) {
                  return false;
                }
              });

              // For non-follow events, only show badge when a follow button exists nearby
              // This prevents badges on incidental references (e.g., repo owners, commenters)
              if (!isFollowEvent && !followBtn) return;

              // avoid duplicating adjacent badges
              if (followBtn) {
                const after = followBtn.nextElementSibling;
                if (
                  after &&
                  after.classList &&
                  (after.classList.contains("github-utils-list-badge") ||
                    after.classList.contains("github-utils-follow-badge"))
                )
                  return;
              } else {
                const next = a.nextElementSibling;
                if (
                  next &&
                  next.classList &&
                  (next.classList.contains("github-utils-list-badge") ||
                    next.classList.contains("github-utils-follow-badge"))
                )
                  return;
              }

              const placeholder = document.createElement("span");
              placeholder.className = "github-utils-list-badge";
              placeholder.textContent = "...";

              try {
                if (followBtn) {
                  try {
                    // insert immediately for visual responsiveness, then migrate into checker container when possible
                    placeholder.style.display = "block";
                    placeholder.style.marginTop = "6px";
                    placeholder.style.marginLeft = "0";
                    placeholder.style.fontSize = "12px";
                  } catch (e) {}
                  try {
                    followBtn.insertAdjacentElement("afterend", placeholder);
                  } catch (e) {
                    try {
                      followBtn.parentElement &&
                        followBtn.parentElement.insertBefore(
                          placeholder,
                          followBtn.nextSibling,
                        );
                    } catch (e2) {}
                  }

                  // attempt to move placeholder into the persistent checker container (separate from the form)
                  try {
                    Promise.resolve(followDom)
                      .then((dom) => {
                        try {
                          const moved = dom.insertPlaceholderInChecker(
                            followBtn,
                            "github-utils-list-badge",
                          );
                          if (moved && moved !== placeholder) {
                            try {
                              moved.dataset.ghFb = "1";
                              moved.dataset.ghName = name;
                              placeholder.replaceWith(moved);
                            } catch (e) {
                              try {
                                placeholder.remove();
                              } catch (e2) {}
                            }
                          } else if (moved) {
                            moved.dataset.ghName = name;
                          }
                        } catch (e) {}
                      })
                      .catch(() => {});
                  } catch (e) {}
                } else {
                  // Prefer placing the badge to the left of the action button/menu in the user's row when possible
                  let placed = false;
                  try {
                    const actionBtn = userRow.querySelector<ContentElement>(
                      ".user-following-container, .feed-item-heading-menu-button, button[aria-haspopup], .github-utils-checker",
                    );
                    if (actionBtn) {
                      try {
                        placeholder.style.display = "inline-block";
                        placeholder.style.marginRight = "6px";
                        placeholder.style.marginTop = "0";
                        actionBtn.insertAdjacentElement(
                          "beforebegin",
                          placeholder,
                        );
                        placed = true;
                      } catch (e) {
                        try {
                          actionBtn.parentElement &&
                            actionBtn.parentElement.insertBefore(
                              placeholder,
                              actionBtn,
                            );
                          placed = true;
                        } catch (e2) {}
                      }
                    }
                  } catch (e) {}
                  if (!placed) {
                    try {
                      placeholder.style.display = "inline-flex";
                      placeholder.style.marginLeft = "6px";
                      placeholder.style.marginTop = "0";
                      placeholder.style.verticalAlign = "middle";
                    } catch (e) {}
                    a.insertAdjacentElement("afterend", placeholder);
                  }
                }
              } catch (e) {
                try {
                  const parent =
                    (followBtn && followBtn.parentElement) || a.parentElement;
                  if (parent) parent.appendChild(placeholder);
                } catch (e2) {}
              }

              placeholder.dataset.ghFb = "1";
              placeholder.dataset.ghName = name;
              namesSeen.add(name);

              (async () => {
                try {
                  const dom = followDom;
                  const resp = await resolveFollowStatus(viewer, name);
                  if (!resp)
                    dom.replaceWithBadge(
                      placeholder,
                      "unknown",
                      followBtn
                        ? "github-utils-list-badge"
                        : "github-utils-list-badge name-side",
                    );
                  else
                    dom.replaceWithBadge(
                      placeholder,
                      resp.targetFollowsViewer ? "followed" : "not_followed",
                      followBtn
                        ? "github-utils-list-badge"
                        : "github-utils-list-badge name-side",
                    );
                } catch (e) {
                  try {
                    placeholder &&
                      placeholder.replaceWith &&
                      placeholder.replaceWith(document.createElement("span"));
                  } catch (e2) {}
                }
              })();
            } catch (e) {}
          });
        } catch (e) {}
      });
    } catch (e) {}
  }

  function scanHover(root: HTMLElement): void {
    const card =
      root.querySelector &&
      (root.querySelector<ContentElement>("[data-hovercard-url]") ||
        root.querySelector<ContentElement>(".Popover-message") ||
        root);
    if (!card) return;
    Promise.resolve(followDom)
      .then(async (dom) => {
        const anchor = card.querySelector<ContentElement>('a[href^="/"]');
        if (!anchor) return;
        const href = anchor.getAttribute("href");
        if (!href) return;
        const name = href.replace(/^\//, "").replace(/\/$/, "");
        const viewer = getCurrentUser();
        if (!name || name === viewer) return;
        if (IGNORED_PATHS.includes(name.toLowerCase())) return;
        if (
          card.querySelector<ContentElement>(
            ".github-utils-hover-badge, .github-utils-list-badge",
          )
        )
          return;
        const followBtn = Array.from(
          card.querySelectorAll<ContentElement>('input[type="submit"],button'),
        ).find((b) => {
          try {
            const s = (
              b.getAttribute("aria-label") ||
              b.title ||
              b.textContent ||
              b.innerText ||
              ""
            ).toLowerCase();
            return /(^|\s)(follow|unfollow)($|\s)/i.test(s);
          } catch (e) {
            return false;
          }
        });
        const placeholder = document.createElement("div");
        placeholder.className = "github-utils-hover-badge";
        placeholder.textContent = "...";
        const targetEl =
          followBtn ||
          card.querySelector<ContentElement>(".Popover-message") ||
          card;
        if (!targetEl) return;
        if (followBtn) {
          followBtn.insertAdjacentElement("afterend", placeholder);
        } else targetEl.appendChild(placeholder);
        (async () => {
          try {
            const viewer = getCurrentUser();
            if (!viewer) return;
            const resp = await resolveFollowStatus(viewer, name);
            if (!resp)
              dom.replaceWithBadge(
                placeholder,
                "unknown",
                "github-utils-hover-badge",
              );
            else
              dom.replaceWithBadge(
                placeholder,
                resp.targetFollowsViewer ? "followed" : "not_followed",
                "github-utils-hover-badge",
              );
          } catch (e) {}
        })();
      })
      .catch(() => {});
  }

  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  function schedule() {
    if (retryTimer) clearTimeout(retryTimer);
    // Skip follow logic on disallowed pages (e.g., repo pages)
    if (!shouldRunFollowLogic()) return;
    let attempt = 0;
    const max = 6;
    const tryRun = () => {
      attempt++;
      try {
        scan(document);
        scanFeed(document);
        const pop = document.querySelectorAll<ContentElement>(
          "[data-hovercard-url], .Popover-message",
        );
        pop.forEach((p) => scanHover(p));
      } catch (e) {}
      if (
        document.querySelector<ContentElement>(
          ".h-card, .vcard, .d-table, .user-following-container",
        ) ||
        attempt >= max
      )
        return;
      retryTimer = setTimeout(tryRun, 100 * Math.pow(2, attempt - 1));
    };
    retryTimer = setTimeout(tryRun, 80);
  }

  // Restore the activity feed on the home page (below the Pull requests /
  // Issues lists). This only needs the logged-in GitHub session, so it is
  // booted before the token gate; follow badges inside the injected feed
  // still require a token.
  try {
    Promise.resolve({ startHomeFeed }).then((feedMod) => {
      try {
        if (feedMod && feedMod.startHomeFeed) {
          feedMod.startHomeFeed({
            onItems: (root) => {
              if (!hasToken) return;
              try {
                scanFeed(root);
              } catch (e) {}
            },
          });
        }
      } catch (e) {}
    });
  } catch (e) {}

  if (!hasToken) return;

  // Ensure badges inside follow forms are moved to checker container when a follow/unfollow action occurs
  (function attachFollowProtectionHandlers() {
    function isFollowButton(el: Element): boolean {
      try {
        const button = el as ContentElement;
        const s = (
          el.getAttribute("aria-label") ||
          button.title ||
          el.textContent ||
          button.innerText ||
          ""
        )
          .toString()
          .toLowerCase();
        return /(^|\s)(follow|unfollow)($|\s)/i.test(s);
      } catch (e) {
        return false;
      }
    }

    function moveBadgesForButton(btn: ContentElement): void {
      try {
        Promise.resolve(followDom)
          .then((dom) => {
            try {
              // Move badges inside the same form/container
              const form =
                btn.closest("form") || btn.closest(".user-following-container");
              if (form) {
                const badges = Array.from(
                  (form.querySelectorAll &&
                    form.querySelectorAll(
                      ".github-utils-list-badge, .github-utils-follow-badge",
                    )) ||
                    [],
                );
                badges.forEach((b) => {
                  try {
                    dom.appendBadgeToChecker(
                      asContentElement(btn),
                      asContentElement(b),
                    );
                  } catch (e) {}
                });
              }
              // Also move any immediate adjacent badge
              const after = btn.nextElementSibling;
              if (
                after &&
                after.classList &&
                (after.classList.contains("github-utils-list-badge") ||
                  after.classList.contains("github-utils-follow-badge"))
              ) {
                try {
                  dom.appendBadgeToChecker(btn, asContentElement(after));
                } catch (e) {}
              }
            } catch (e) {}
          })
          .catch(() => {});
      } catch (e) {}
    }

    document.addEventListener(
      "click",
      (ev) => {
        try {
          const target = ev.target as Element | null;
          const btn = target?.closest('input[type="submit"],button');
          if (!btn) return;
          if (!isFollowButton(btn)) return;
          // move badges immediately (before DOM mutations) and again shortly after
          moveBadgesForButton(asContentElement(btn));
          setTimeout(() => moveBadgesForButton(asContentElement(btn)), 120);
        } catch (e) {}
      },
      true,
    );

    document.addEventListener(
      "submit",
      (ev) => {
        try {
          const target = ev.target as Element | null;
          const btn = target?.querySelector<ContentElement>(
            'input[type="submit"],button',
          );
          if (!btn) return;
          if (!isFollowButton(btn)) return;
          moveBadgesForButton(asContentElement(btn));
        } catch (e) {}
      },
      true,
    );
  })();

  let __gh_last_inject_at = 0;
  const mo = new MutationObserver((_mutations) => {
    if (location.href !== window.__gh_last_location) {
      try {
        Promise.resolve(followClient)
          .then((m) => {
            try {
              if (m && m.clearCache) m.clearCache();
            } catch (e) {}
          })
          .catch(() => {});
      } catch (e) {}
      window.__gh_last_location = location.href;
      schedule();
    }

    const now = Date.now();
    if (now - __gh_last_inject_at < 200) return;
    __gh_last_inject_at = now;

    for (const m of _mutations) {
      for (const n of m.addedNodes) {
        if (!(n instanceof HTMLElement)) continue;
        if (n.matches && n.matches(".h-card, .vcard, #js-pjax-container")) {
          schedule();
        }

        // If the added node contains feed items (e.g., after "Load more"), scan them immediately.
        try {
          if (
            (n.matches &&
              n.matches(
                "article, .js-feed-item-component, .news, .TimelineItem, .js-timeline-item, .news-item",
              )) ||
            (n.querySelector &&
              n.querySelector<ContentElement>(
                "article, .js-feed-item-component, .news, .TimelineItem, .js-timeline-item, .news-item",
              ))
          ) {
            try {
              scanFeed(n);
            } catch (e) {}
          }
        } catch (e) {}

        if (
          n.querySelector &&
          n.querySelector<ContentElement>(
            "[data-hovercard-url], .Popover-message",
          )
        ) {
          const popup =
            n.querySelector<ContentElement>("[data-hovercard-url]") ||
            n.querySelector<ContentElement>(".Popover-message") ||
            n;
          scanHover(popup);
        }
        try {
          const path = location.pathname;
          if (/^\/[^/]+\/[^/]+\/settings/.test(path)) {
            if (
              !document.querySelector<ContentElement>(".gh-autocomplete-panel")
            ) {
              (async () => {
                try {
                  console.debug(
                    "[gh-utils] attempting to inject autocomplete panel",
                  );
                  const dom = autocompleteDom;
                  const actions = autocompleteActions;
                  let target = dom.findDangerZone();
                  if (!target) {
                    console.debug(
                      "[gh-utils] findDangerZone returned null, trying fallbacks",
                    );
                    target = document.querySelector<ContentElement>(
                      "#options_bucket, .repository-content, main, #repo-content-pjax-container",
                    );
                  }
                  if (target) {
                    console.debug("[gh-utils] injecting panel into", target);
                    const headingContainer =
                      document
                        .querySelector<ContentElement>("#danger-zone")
                        ?.closest(".Subhead") ||
                      document.querySelector<ContentElement>("#danger-zone")
                        ?.parentElement ||
                      target;
                    if (headingContainer) {
                      headingContainer
                        .querySelectorAll<ContentElement>(
                          ".gh-autocomplete-panel",
                        )
                        .forEach((n) => n.remove());
                    }

                    const box = target;
                    if (!box.dataset.ghAutocInjected) {
                      dom.insertInlinePanels();
                      chrome.storage.sync.get(
                        ["github_utils_token"],
                        (items) => {
                          const token = (items as Record<string, unknown>)
                            .github_utils_token as string | null;
                          document
                            .querySelectorAll<ContentElement>(
                              ".gh-autoc-autoexec",
                            )
                            .forEach((cb) => {
                              cb.disabled = !token;
                              if (!token)
                                cb.title =
                                  "Auto execute requires a GitHub token (set in extension popup)";
                            });
                        },
                      );
                      box.dataset.ghAutocInjected = "1";
                    } else {
                      console.debug(
                        "[gh-utils] inline panels already injected",
                      );
                    }

                    async function performAutoAction(
                      btn: ContentElement,
                      inline: HTMLElement,
                      statusEl: HTMLElement | null,
                    ): Promise<void> {
                      try {
                        if (inline.dataset.ghAutocHandled) return;
                        inline.dataset.ghAutocHandled = "1";
                        const token = await new Promise<string | null>(
                          (resolve) =>
                            chrome.storage.sync.get(
                              ["github_utils_token"],
                              (items) =>
                                resolve(
                                  (items as Record<string, unknown>)
                                    .github_utils_token as string | null,
                                ),
                            ),
                        );
                        if (!token) {
                          statusEl &&
                            (statusEl.textContent =
                              "Token required for Auto (set it in extension popup)");
                          delete inline.dataset.ghAutocHandled;
                          return;
                        }
                        const repo = dom.getRepoFullName();
                        if (!repo) {
                          statusEl &&
                            (statusEl.textContent =
                              "Cannot determine repository");
                          delete inline.dataset.ghAutocHandled;
                          return;
                        }
                        statusEl &&
                          (statusEl.textContent = "Executing via API...");
                        const act = btn.dataset.action;
                        let apiRes = null;
                        if (act === "archive") {
                          const info = await actions.apiGetRepo(repo, token);
                          const currentlyArchived =
                            info &&
                            info.ok &&
                            typeof info.json === "object" &&
                            info.json !== null &&
                            "archived" in info.json &&
                            info.json.archived === true;
                          const newArchived = !currentlyArchived;
                          apiRes = await actions.apiSetArchived(
                            repo,
                            newArchived,
                            token,
                          );
                          if (apiRes && apiRes.ok) {
                            statusEl &&
                              (statusEl.textContent = newArchived
                                ? "Repository archived via API"
                                : "Repository unarchived via API");
                            try {
                              const pageBtn = dom.findArchiveButton();
                              const newLabel = newArchived
                                ? "Unarchive this repository"
                                : "Archive this repository";
                              if (pageBtn) {
                                const lbl =
                                  pageBtn.querySelector<ContentElement>(
                                    ".Button-label",
                                  ) ||
                                  pageBtn.querySelector<ContentElement>(
                                    ".Button-content",
                                  ) ||
                                  pageBtn;
                                if (lbl) lbl.textContent = newLabel;
                              }
                              if (btn && btn.textContent)
                                btn.textContent = newLabel;
                            } catch (e) {}
                            setTimeout(() => location.reload(), 800);
                          } else
                            statusEl &&
                              (statusEl.textContent = `API failed: ${apiRes?.status || "unknown"}`);
                        } else if (act === "delete") {
                          const confirmInput =
                            inline.querySelector<ContentElement>(
                              ".gh-autoc-confirm-delete-input",
                            );
                          if (!confirmInput) {
                            const lbl = document.createElement("label");
                            lbl.className =
                              "gh-autoc-opt gh-autoc-confirm-delete";
                            lbl.innerHTML =
                              '<input type="checkbox" class="gh-autoc-confirm-delete-input"> Confirm auto-delete (required)';
                            inline.appendChild(lbl);
                            statusEl &&
                              (statusEl.textContent =
                                "Please check the Confirm auto-delete box to proceed");
                            delete inline.dataset.ghAutocHandled;
                            return;
                          }
                          if (!confirmInput.checked) {
                            statusEl &&
                              (statusEl.textContent =
                                "Please check the Confirm auto-delete box to proceed");
                            delete inline.dataset.ghAutocHandled;
                            return;
                          }
                          apiRes = await actions.apiDeleteRepo(repo, token);
                          if (apiRes && apiRes.ok) {
                            statusEl &&
                              (statusEl.textContent =
                                "Repository deleted via API");
                            setTimeout(() => location.reload(), 800);
                          } else
                            statusEl &&
                              (statusEl.textContent = `API failed: ${apiRes?.status || "unknown"}`);
                        }
                        setTimeout(
                          () => delete inline.dataset.ghAutocHandled,
                          1500,
                        );
                      } catch (e) {
                        statusEl &&
                          (statusEl.textContent = `API error: ${describeError(e)}`);
                        delete inline.dataset.ghAutocHandled;
                      }
                    }

                    Array.from(
                      document.querySelectorAll<ContentElement>(
                        ".gh-autoc-btn",
                      ),
                    ).forEach((btn) => {
                      if (btn.dataset.ghAutocBound) return;
                      btn.dataset.ghAutocBound = "1";

                      ["pointerdown", "mousedown", "touchstart"].forEach(
                        (evName) => {
                          btn.addEventListener(
                            evName,
                            (ev) => {
                              try {
                                ev.preventDefault();
                                ev.stopImmediatePropagation();
                                ev.stopPropagation();
                              } catch (e) {}
                            },
                            { capture: true },
                          );
                        },
                      );

                      btn.addEventListener(
                        "click",
                        async function captureAutoHandler(ev) {
                          try {
                            const inline = btn.closest(
                              ".gh-autoc-inline",
                            ) as HTMLElement | null;
                            if (!inline) return;
                            ev.preventDefault();
                            ev.stopImmediatePropagation();
                            ev.stopPropagation();
                            const statusEl =
                              inline?.querySelector<ContentElement>(
                                ".gh-autoc-inline-status",
                              );
                            const autoOn =
                              inline?.querySelector<ContentElement>(
                                ".gh-autoc-autoexec",
                              )?.checked || false;
                            if (autoOn) {
                              await performAutoAction(btn, inline, statusEl);
                              return;
                            }

                            statusEl && (statusEl.textContent = "Preparing...");
                            try {
                              let res;
                              const act = btn.dataset.action;
                              if (act === "delete")
                                res = await actions.prepareDelete(
                                  {},
                                  { canceled: false },
                                );
                              else if (act === "archive")
                                res = await actions.prepareArchive(
                                  {},
                                  { canceled: false },
                                );
                              else res = { ok: false, reason: "unknown" };

                              if (res && res.ok)
                                statusEl &&
                                  (statusEl.textContent =
                                    "Prepared — confirm manually.");
                              else
                                statusEl &&
                                  (statusEl.textContent = `Failed: ${res?.reason || "unknown"}`);
                            } catch (e) {
                              statusEl &&
                                (statusEl.textContent = `Error: ${describeError(e)}`);
                            }
                          } catch (e) {}
                        },
                        { capture: true },
                      );

                      btn.addEventListener("click", async (ev) => {
                        try {
                          ev.preventDefault();
                          ev.stopPropagation();
                          ev.stopImmediatePropagation();
                        } catch (e) {}
                        const act = btn.dataset.action;
                        const inline = btn.closest(
                          ".gh-autoc-inline",
                        ) as HTMLElement | null;
                        if (!inline) return;

                        if (inline?.dataset.ghAutocHandled) {
                          return;
                        }

                        const autoexec =
                          inline?.querySelector<ContentElement>(
                            ".gh-autoc-autoexec",
                          )?.checked || false;
                        const statusEl = inline?.querySelector<ContentElement>(
                          ".gh-autoc-inline-status",
                        );
                        if (autoexec) {
                          const token = await new Promise<string | null>(
                            (resolve) =>
                              chrome.storage.sync.get(
                                ["github_utils_token"],
                                (items) =>
                                  resolve(
                                    (items as Record<string, unknown>)
                                      .github_utils_token as string | null,
                                  ),
                              ),
                          );
                          if (!token) {
                            statusEl &&
                              (statusEl.textContent =
                                "Token required for Auto (set it in extension popup)");
                            return;
                          }

                          const repo = dom.getRepoFullName();
                          if (!repo) {
                            statusEl &&
                              (statusEl.textContent =
                                "Cannot determine repository");
                            return;
                          }

                          try {
                            statusEl &&
                              (statusEl.textContent = "Executing via API...");
                            let apiRes = null;

                            if (act === "archive") {
                              apiRes = await actions.apiArchiveRepo(
                                repo,
                                token,
                              );
                              if (apiRes && apiRes.ok) {
                                statusEl &&
                                  (statusEl.textContent =
                                    "Repository archived via API");
                                setTimeout(() => location.reload(), 800);
                              } else
                                statusEl &&
                                  (statusEl.textContent = `API failed: ${apiRes?.status || "unknown"}`);
                            } else if (act === "delete") {
                              const confirmInput =
                                inline.querySelector<ContentElement>(
                                  ".gh-autoc-confirm-delete-input",
                                );
                              if (!confirmInput) {
                                const lbl = document.createElement("label");
                                lbl.className =
                                  "gh-autoc-opt gh-autoc-confirm-delete";
                                lbl.innerHTML =
                                  '<input type="checkbox" class="gh-autoc-confirm-delete-input"> Confirm auto-delete (required)';
                                inline.appendChild(lbl);
                                statusEl &&
                                  (statusEl.textContent =
                                    "Please check the Confirm auto-delete box to proceed");
                                return;
                              }
                              if (!confirmInput.checked) {
                                statusEl &&
                                  (statusEl.textContent =
                                    "Please check the Confirm auto-delete box to proceed");
                                return;
                              }
                              apiRes = await actions.apiDeleteRepo(repo, token);
                              if (apiRes && apiRes.ok) {
                                statusEl &&
                                  (statusEl.textContent =
                                    "Repository deleted via API");
                                setTimeout(() => location.reload(), 800);
                              } else
                                statusEl &&
                                  (statusEl.textContent = `API failed: ${apiRes?.status || "unknown"}`);
                            } else {
                              statusEl &&
                                (statusEl.textContent = "Unknown action");
                            }
                          } catch (e) {
                            statusEl &&
                              (statusEl.textContent = `API error: ${describeError(e)}`);
                          }

                          return;
                        }

                        const signal = { canceled: false };
                        const options = {
                          autoEnable: true,
                          autoClick: false,
                          countdown: 3,
                        };

                        statusEl && (statusEl.textContent = "Preparing...");
                        try {
                          let res;
                          if (act === "delete")
                            res = await actions.prepareDelete(options, signal);
                          else if (act === "archive")
                            res = await actions.prepareArchive(options, signal);
                          else res = { ok: false, reason: "unknown" };

                          if (res && res.ok) {
                            statusEl &&
                              (statusEl.textContent =
                                "Prepared — confirm manually.");
                          } else {
                            statusEl &&
                              (statusEl.textContent = `Failed: ${res?.reason || "unknown"}`);
                          }
                        } catch (e) {
                          statusEl &&
                            (statusEl.textContent = `Error: ${describeError(e)}`);
                        }
                      });
                    });
                  } else {
                    console.debug(
                      "[gh-utils] failed to find a target to inject panel",
                    );
                  }
                } catch (e) {
                  console.warn(
                    "[gh-utils] error injecting autocomplete panel:",
                    e,
                  );
                }
              })();
            }
          }
        } catch (e) {}
      }
    }
  });
  mo.observe(document.body, { childList: true, subtree: true });

  if (chrome && chrome.storage && chrome.storage.onChanged) {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== "sync") return;
      if (!changes || !changes.github_utils_token) return;
      const token = changes.github_utils_token.newValue;
      document
        .querySelectorAll<ContentElement>(".gh-autoc-autoexec")
        .forEach((cb) => {
          cb.disabled = !token;
          if (!token)
            cb.title =
              "Auto execute requires a GitHub token (set in extension popup)";
          else cb.title = "";
        });
    });
  }

  function isFollowButtonElement(el: Element): boolean {
    try {
      if (!el || !(el instanceof HTMLElement)) return false;
      if (!/input|button/i.test(el.tagName)) return false;
      const s =
        (el.getAttribute && (el.getAttribute("aria-label") || el.title)) ||
        (el as ContentElement).value ||
        el.textContent ||
        el.innerText ||
        "";
      return /(^|\s)(follow|unfollow)($|\s)/i.test(s);
    } catch (e) {
      return false;
    }
  }

  function rescanContainer(container: ContentContainer, maxAttempts = 4): void {
    let attempt = 0;
    const tryRun = () => {
      attempt++;
      try {
        scan(container || document);
      } catch (e) {}
      if (attempt < maxAttempts) setTimeout(tryRun, 150 * attempt);
    };
    setTimeout(tryRun, 120);

    try {
      const el =
        container && container instanceof HTMLElement ? container : document;
      const obs = new MutationObserver((_mutations) => {
        try {
          if (
            el.querySelector &&
            el.querySelector<ContentElement>(
              ".github-utils-list-badge, .github-utils-follow-badge",
            )
          ) {
            obs.disconnect();
            return;
          }
          if (
            Array.from(
              el.querySelectorAll<ContentElement>(
                'input[type="submit"],button',
              ),
            ).some(isFollowButtonElement)
          ) {
            try {
              scan(el);
            } catch (e) {}
          }
        } catch (e) {}
      });
      obs.observe(el, { childList: true, subtree: true });
      setTimeout(
        () => {
          try {
            obs.disconnect();
          } catch (e) {}
        },
        Math.max(2000, maxAttempts * 150 * 2),
      );
    } catch (e) {}
  }

  async function attemptQuickBadgeUpdate(
    btn: ContentElement,
    _container: ContentContainer,
  ): Promise<boolean> {
    try {
      const dom = followDom;
      const client = followClient;
      if (!dom || !client) return false;
      const viewer = getCurrentUser();
      if (!viewer) return false;
      const name = dom.extractUsernameFromButton(asButtonElement(btn));
      if (!name) return false;
      const row =
        btn.closest(".d-table") || btn.closest("li") || btn.closest("div");
      if (
        row &&
        row.querySelector &&
        row.querySelector<ContentElement>(
          ".github-utils-list-badge, .github-utils-follow-badge",
        )
      )
        return true;

      if (isOwnFollowers()) {
        const b = dom.createBadge("followed", "github-utils-list-badge");
        dom.appendBadgeToChecker(btn, b);
        return true;
      }

      try {
        const cached = client.getCachedFollowStatus
          ? client.getCachedFollowStatus(viewer, name)
          : undefined;
        if (typeof cached !== "undefined") {
          const status =
            cached === null
              ? "unknown"
              : cached.targetFollowsViewer
                ? "followed"
                : "not_followed";
          console.debug("[gh-utils] attemptQuickBadgeUpdate: using cache", {
            viewer,
            name,
            status,
          });
          const badge = dom.createBadge(status, "github-utils-list-badge");
          dom.appendBadgeToChecker(btn, badge);
          return true;
        }
      } catch (e) {}

      return false;
    } catch (e) {
      return false;
    }
  }

  document.addEventListener(
    "click",
    (ev) => {
      try {
        const target = ev.target as Element | null;
        const btn = target?.closest('input[type="submit"],button');
        if (!btn) return;
        if (!isFollowButtonElement(btn)) return;
        const container = (btn.closest(".d-table") ||
          btn.closest("li") ||
          btn.closest("div") ||
          document) as ContentContainer;
        attemptQuickBadgeUpdate(asContentElement(btn), container).catch(
          () => {},
        );
        setTimeout(() => rescanContainer(container), 200);
      } catch (e) {}
    },
    true,
  );

  document.addEventListener(
    "submit",
    (ev) => {
      try {
        const form = ev.target as Element | null;
        if (!form) return;
        const submitBtn = form.querySelector<ContentElement>(
          'input[type="submit"],button',
        );
        if (!submitBtn || !isFollowButtonElement(submitBtn)) return;
        const container = (submitBtn.closest(".d-table") ||
          submitBtn.closest("li") ||
          submitBtn.closest("div") ||
          document) as ContentContainer;
        attemptQuickBadgeUpdate(asContentElement(submitBtn), container).catch(
          () => {},
        );
        setTimeout(() => rescanContainer(container), 250);
      } catch (e) {}
    },
    true,
  );

  try {
    window.addEventListener("pjax:end", () => schedule());
    document.addEventListener("turbo:frame-load", () => schedule());
  } catch (e) {}

  schedule();
  if (shouldRunFollowLogic()) {
    document
      .querySelectorAll<ContentElement>(
        "[data-hovercard-url], .Popover-message",
      )
      .forEach((p) => scanHover(p));
    try {
      // initial feed scan
      scanFeed(document);
    } catch (e) {}
  }
})();
