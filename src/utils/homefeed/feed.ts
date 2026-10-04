/**
 * Restores the activity feed on the GitHub home page.
 *
 * GitHub moved the feed to /feed and turned the home page into a
 * productivity dashboard (Agent sessions / Pull requests / Issues lists).
 * This module fetches the feed items from the same conduit endpoint the
 * /feed page uses and renders them below those lists, including a working
 * "More" pagination button. It only relies on the logged-in GitHub session,
 * so it works without an extension token.
 */

const SECTION_ID = "gh-utils-home-feed";
const LIST_CLASS = "gh-utils-feed-list";
const CONDUIT_URL = "/conduit/for_you_feed?source=feed_page";
const FETCH_HEADERS = { Accept: "*/*", "X-Requested-With": "XMLHttpRequest" };

interface HomeFeedOptions {
  onItems?: (root: HTMLElement) => void;
}

interface FeedNodes {
  items: Element[];
  moreForm: HTMLFormElement | null;
}

let started = false;
let injecting = false;
let navWatchAt = 0;

function isHomePage(): boolean {
  const p = location.pathname;
  return p === "/" || p === "";
}

function hasNativeFeed(): boolean {
  // If GitHub ever serves the feed on home again, don't inject a second one.
  return !!document.querySelector("feed-container");
}

async function fetchFeedDocument(url: string): Promise<Document> {
  const resp = await fetch(url, {
    credentials: "same-origin",
    headers: FETCH_HEADERS,
  });
  if (!resp.ok) throw new Error(`feed fetch failed: ${resp.status}`);
  const text = await resp.text();
  return new DOMParser().parseFromString(text, "text/html");
}

/**
 * Split a conduit response into feed item nodes and the "More" pagination
 * form. The screen-reader live region is dropped; hidden dismissed-item
 * placeholders stay with the items (they belong to the "Show less activity"
 * UI inside the items).
 */
function extractFeedNodes(doc: Document): FeedNodes {
  const frame = doc.querySelector("turbo-frame");
  const items: Element[] = [];
  let moreForm: HTMLFormElement | null = null;
  if (frame) {
    for (const child of Array.from(frame.children)) {
      if (child.tagName === "FEED-LIVE-CONTAINER") continue;
      if (
        child.tagName === "FORM" &&
        child.classList.contains("ajax-pagination-form")
      ) {
        moreForm = child as HTMLFormElement;
        continue;
      }
      items.push(child);
    }
  }
  return { items, moreForm };
}

function documentHasFeedStyles(): boolean {
  return Array.from(document.querySelectorAll('link[rel="stylesheet"]')).some(
    (l) => /feed/i.test(l.getAttribute("href") || ""),
  );
}

/**
 * The home page normally already bundles the feed stylesheets; if GitHub
 * drops them, copy the feed-related ones from the /feed page.
 */
async function ensureFeedStyles(): Promise<void> {
  if (documentHasFeedStyles()) return;
  try {
    const resp = await fetch("/feed", { credentials: "same-origin" });
    if (!resp.ok) return;
    const doc = new DOMParser().parseFromString(await resp.text(), "text/html");
    const existing = new Set(
      Array.from(document.querySelectorAll('link[rel="stylesheet"]')).map((l) =>
        l.getAttribute("href"),
      ),
    );
    for (const link of Array.from(
      doc.querySelectorAll('link[rel="stylesheet"]'),
    )) {
      const href = link.getAttribute("href");
      if (!href || !/feed/i.test(href) || existing.has(href)) continue;
      const clone = document.createElement("link");
      clone.rel = "stylesheet";
      clone.href = href;
      clone.crossOrigin = "anonymous";
      document.head.appendChild(clone);
    }
  } catch {}
}

function buildSection(): HTMLElement {
  const section = document.createElement("div");
  section.id = SECTION_ID;

  const header = document.createElement("div");
  header.className = "gh-utils-feed-header";
  const title = document.createElement("h2");
  title.className = "gh-utils-feed-title";
  title.textContent = "Feed";
  const viewAll = document.createElement("a");
  viewAll.href = "/feed";
  viewAll.className = "gh-utils-feed-view-all";
  viewAll.textContent = "View all";
  header.append(title, viewAll);

  const list = document.createElement("div");
  list.className = LIST_CLASS;

  section.append(header, list);
  return section;
}

function notifyItems(
  onItems: ((root: HTMLElement) => void) | undefined,
  root: HTMLElement,
): void {
  if (!onItems) return;
  try {
    onItems(root);
  } catch {}
}

async function loadMore(
  section: HTMLElement,
  list: HTMLElement,
  form: HTMLFormElement,
  onItems: ((root: HTMLElement) => void) | undefined,
): Promise<void> {
  const url = form.getAttribute("action");
  if (!url) return;
  const btn = form.querySelector("button");
  if (btn) {
    btn.disabled = true;
    btn.textContent = btn.getAttribute("data-disable-with") || "Loading more…";
  }
  try {
    const doc = await fetchFeedDocument(url);
    const { items, moreForm } = extractFeedNodes(doc);
    for (const node of items) list.appendChild(document.importNode(node, true));
    if (moreForm) form.replaceWith(document.importNode(moreForm, true));
    else form.remove();
    if (items.length) notifyItems(onItems, section);
  } catch {
    if (btn) {
      btn.disabled = false;
      btn.textContent = "More";
    }
  }
}

// Document-level delegation survives Turbo navigation and cache restores,
// which drop listeners attached to swapped-out nodes.
function bindPagination(onItems: ((root: HTMLElement) => void) | undefined) {
  document.addEventListener(
    "click",
    (ev) => {
      const target = ev.target as Element | null;
      const btn =
        target && target.closest
          ? target.closest(`#${SECTION_ID} .ajax-pagination-btn`)
          : null;
      if (!btn) return;
      ev.preventDefault();
      ev.stopPropagation();
      const section = document.getElementById(SECTION_ID);
      const form = btn.closest("form.ajax-pagination-form");
      const list = section?.querySelector(`.${LIST_CLASS}`);
      if (!section || !form || !list) return;
      void loadMore(
        section,
        list as HTMLElement,
        form as HTMLFormElement,
        onItems,
      );
    },
    true,
  );
  document.addEventListener(
    "submit",
    (ev) => {
      const target = ev.target as Element | null;
      if (
        target &&
        target.matches &&
        target.matches(`#${SECTION_ID} form.ajax-pagination-form`)
      )
        ev.preventDefault();
    },
    true,
  );
}

function waitForDashboard(timeoutMs: number): Promise<HTMLElement | null> {
  return new Promise((resolve) => {
    const startedAt = Date.now();
    const check = () => {
      const dashboard = document.querySelector("#dashboard");
      if (dashboard) return resolve(dashboard as HTMLElement);
      if (!isHomePage() || Date.now() - startedAt > timeoutMs)
        return resolve(null);
      setTimeout(check, 300);
    };
    check();
  });
}

async function injectFeed(
  onItems: ((root: HTMLElement) => void) | undefined,
): Promise<void> {
  if (!isHomePage() || injecting) return;
  if (document.getElementById(SECTION_ID) || hasNativeFeed()) return;
  injecting = true;
  try {
    const dashboard = await waitForDashboard(15000);
    if (
      !dashboard ||
      !isHomePage() ||
      document.getElementById(SECTION_ID) ||
      hasNativeFeed()
    )
      return;
    await ensureFeedStyles();
    const doc = await fetchFeedDocument(CONDUIT_URL);
    const { items, moreForm } = extractFeedNodes(doc);
    if (!items.length) return;

    const section = buildSection();
    const list = section.querySelector(`.${LIST_CLASS}`) as HTMLElement;
    for (const node of items) list.appendChild(document.importNode(node, true));
    if (moreForm) section.appendChild(document.importNode(moreForm, true));
    dashboard.appendChild(section);
    notifyItems(onItems, section);
  } catch (e) {
    try {
      console.warn("[gh-utils] home feed injection failed", e);
    } catch {}
  } finally {
    injecting = false;
  }
}

/**
 * Start restoring the feed on the home page. Safe to call on any page;
 * injection only happens on github.com/ and re-runs after SPA navigation.
 * onItems(root) is called with the feed section whenever items are added.
 */
export function startHomeFeed({ onItems }: HomeFeedOptions = {}): void {
  if (started) return;
  started = true;
  bindPagination(onItems);
  void injectFeed(onItems);

  const onNav = () => {
    void injectFeed(onItems);
  };
  try {
    window.addEventListener("turbo:load", onNav);
  } catch {}
  try {
    window.addEventListener("pjax:end", onNav);
  } catch {}
  try {
    window.addEventListener("popstate", onNav);
  } catch {}

  // Turbo can swap the page without firing the events above; watch for the
  // dashboard reappearing without our section (throttled).
  const mo = new MutationObserver(() => {
    const now = Date.now();
    if (now - navWatchAt < 500) return;
    navWatchAt = now;
    if (
      isHomePage() &&
      !document.getElementById(SECTION_ID) &&
      document.querySelector("#dashboard")
    )
      void injectFeed(onItems);
  });
  try {
    mo.observe(document.documentElement, { childList: true, subtree: true });
  } catch {}
}
