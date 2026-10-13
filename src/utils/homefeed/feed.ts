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
export function extractFeedNodes(doc: Document): FeedNodes {
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

export function buildSection(): HTMLElement {
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
    for (const node of items) list.appendChild(importFeedNode(node));
    if (moreForm) form.replaceWith(importFeedNode(moreForm));
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

/**
 * Feed items are imported from the /feed page, so GitHub's own submit
 * handlers (Rails UJS / Turbo) are not attached to them on the home page.
 * Intercept form submissions inside the injected section and send them via
 * fetch with the same-origin session, then refresh the feed so the new
 * state (starred, following, …) is rendered.
 */
function bindFeedFormActions(
  onItems: ((root: HTMLElement) => void) | undefined,
) {
  document.addEventListener(
    "submit",
    (ev) => {
      const form = ev.target as Element | null;
      if (
        !form ||
        !form.matches ||
        !form.matches(`#${SECTION_ID} form:not(.ajax-pagination-form)`)
      )
        return;
      ev.preventDefault();
      ev.stopPropagation();
      void submitFeedForm(form as HTMLFormElement, onItems);
    },
    true,
  );
}

async function submitFeedForm(
  form: HTMLFormElement,
  onItems: ((root: HTMLElement) => void) | undefined,
): Promise<void> {
  const submitter = form.querySelector<HTMLButtonElement>(
    'button[type="submit"], input[type="submit"]',
  );
  if (submitter) submitter.disabled = true;
  try {
    const data = new FormData(form);
    const method = (data.get("_method") as string) || form.method || "POST";
    // Match the headers GitHub's own JS sends for js-social-form requests;
    // the server rejects other Accept values with "Sorry, something went wrong".
    const headers: Record<string, string> = {
      Accept: "application/json",
      "X-Requested-With": "XMLHttpRequest",
    };
    const nonceMeta = document.querySelector<HTMLMetaElement>(
      'meta[name="fetch-nonce"]',
    );
    if (nonceMeta?.content) headers["X-Fetch-Nonce"] = nonceMeta.content;
    const res = await fetch(form.action, {
      method: method.toUpperCase(),
      credentials: "same-origin",
      headers,
      body: data,
      redirect: "follow",
    });
    if (!res.ok) throw new Error(`feed form submit failed: ${res.status}`);
    await refreshFeed(onItems);
  } catch (e) {
    try {
      console.warn("[gh-utils] feed form submit failed", e, {
        action: form.action,
      });
    } catch {}
    if (submitter) submitter.disabled = false;
  }
}

/**
 * Imported nodes keep the data-catalyst marker from the /feed page, but the
 * Catalyst controller instances are not copied with the DOM. Strip the
 * marker so GitHub's Catalyst framework re-attaches controllers (e.g. the
 * user-list-menu behind the "Add to list" button) to the imported nodes.
 */
function reviveCatalystControllers(node: Element): void {
  try {
    if (node.hasAttribute("data-catalyst"))
      node.removeAttribute("data-catalyst");
    node
      .querySelectorAll("[data-catalyst]")
      .forEach((el) => el.removeAttribute("data-catalyst"));
  } catch {}
}

function importFeedNode(node: Element): Element {
  const imported = document.importNode(node, true);
  reviveCatalystControllers(imported);
  return imported;
}

/**
 * Re-fetch the first feed page and replace the injected items so state
 * changes (star, follow, list) are reflected without a full page reload.
 */
async function refreshFeed(
  onItems: ((root: HTMLElement) => void) | undefined,
): Promise<void> {
  const section = document.getElementById(SECTION_ID);
  if (!section) return;
  const list = section.querySelector(`.${LIST_CLASS}`) as HTMLElement | null;
  if (!list) return;
  try {
    const doc = await fetchFeedDocument(CONDUIT_URL);
    const { items, moreForm } = extractFeedNodes(doc);
    if (!items.length) return;
    while (list.firstChild) list.removeChild(list.firstChild);
    for (const node of items) list.appendChild(importFeedNode(node));
    const oldMore = section.querySelector("form.ajax-pagination-form");
    if (oldMore) oldMore.remove();
    if (moreForm) section.appendChild(importFeedNode(moreForm));
    notifyItems(onItems, section);
  } catch (e) {
    try {
      console.warn("[gh-utils] feed refresh failed", e);
    } catch {}
  }
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
    for (const node of items) list.appendChild(importFeedNode(node));
    if (moreForm) section.appendChild(importFeedNode(moreForm));
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
  bindFeedFormActions(onItems);
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
