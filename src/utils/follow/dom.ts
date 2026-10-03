export function createBadge(
  statusKey: string,
  cls: string = "github-utils-follow-badge",
): HTMLSpanElement {
  const LABELS: Record<string, string> = {
    followed: "Followed you",
    not_followed: "Not followed you",
    unknown: "Status unavailable",
  };
  const el = document.createElement("span");
  el.className = cls;
  el.dataset.status = statusKey;
  el.setAttribute("role", "status");
  el.setAttribute("aria-label", LABELS[statusKey] || statusKey);
  el.textContent = LABELS[statusKey] || statusKey;
  return el;
}

export function getOrCreateCheckerContainer(
  btn: HTMLElement | null,
): HTMLElement | null {
  try {
    const row =
      btn!.closest(".d-table") || btn!.closest("li") || btn!.closest("div");
    if (!row) return null;

    let cell: Element | null = row.querySelector(".user-following-container");
    if (!cell) {
      const cells = row.querySelectorAll(".d-table-cell");
      cell = cells && cells.length ? cells[cells.length - 1] : row;
    }
    if (!cell) return null;
    let root: HTMLElement | null = cell.querySelector<HTMLElement>(
      ".github-utils-checker",
    );
    if (!root) {
      root = document.createElement("div");
      root.className = "github-utils-checker";
      root.style.display = "inline-block";
      root.style.marginLeft = "8px";

      cell.appendChild(root);
    }
    return root;
  } catch {
    return null;
  }
}

export function insertPlaceholderInChecker(
  btn: HTMLElement | null,
  className: string = "github-utils-list-badge",
): HTMLElement {
  // If a badge already exists adjacent to the button, reuse it to avoid duplicates
  try {
    const after = btn && btn.nextElementSibling;
    if (
      after &&
      after.classList &&
      (after.classList.contains("github-utils-list-badge") ||
        after.classList.contains("github-utils-follow-badge"))
    ) {
      return after as HTMLElement;
    }
  } catch {}

  const root = getOrCreateCheckerContainer(btn);
  // If root already contains a badge, reuse the first one
  try {
    if (root) {
      const existing = root.querySelector<HTMLElement>(
        ".github-utils-list-badge, .github-utils-follow-badge",
      );
      if (existing) return existing;
    }
  } catch {}

  const p = document.createElement("span");
  p.className = className;
  p.textContent = "...";

  // Prefer to insert the placeholder into the checker container (separate from the button's form)
  // This ensures the badge is not removed when the follow/unfollow form is replaced.
  try {
    if (root) {
      try {
        // mark the checker to show badges below when used for button-associated badges
        if (btn && btn.nodeType === 1)
          root.classList.add("github-utils-checker-below");
      } catch {}
      try {
        root.appendChild(p);
        return p;
      } catch {}
    }
  } catch {}

  // Fallback: insert after button (legacy behavior)
  try {
    if (btn && btn.insertAdjacentElement) {
      try {
        p.style.display = "block";
        p.style.marginTop = "6px";
        p.style.fontSize = "12px";
        btn.insertAdjacentElement("afterend", p);
        return p;
      } catch {}
    }
  } catch {}

  return p;
}

export function appendBadgeToChecker(
  btn: HTMLElement,
  badge: HTMLElement,
): HTMLElement {
  const root = getOrCreateCheckerContainer(btn);
  if (root) {
    const existing = root.querySelector<HTMLElement>(
      ".github-utils-list-badge, .github-utils-follow-badge",
    );
    if (existing) {
      try {
        existing.replaceWith(badge);
      } catch {}
      return badge;
    }
    root.appendChild(badge);
  }
  return badge;
}

// Insert a badge element directly after an anchor (typically a username link).
// If `block` is true, the badge will be shown on its own line below the anchor.
export function insertBadgeBelowAnchor(
  anchor: HTMLElement | null,
  badge: HTMLElement | null,
  { block = true }: { block?: boolean } = {},
): HTMLElement | null {
  try {
    if (!anchor || !badge) return badge;
    if (block) {
      try {
        badge.style.display = "block";
        badge.style.marginTop = "2px";
        badge.style.fontSize = "12px";
      } catch {}
    }
    if (anchor.insertAdjacentElement) {
      anchor.insertAdjacentElement("afterend", badge);
      return badge;
    }
    const parent = anchor.parentElement;
    if (parent) parent.appendChild(badge);
    return badge;
  } catch {
    return badge;
  }
}

export function replaceWithBadge(
  el: HTMLElement | null,
  statusKey: string,
  cls?: string,
): HTMLSpanElement {
  const b = createBadge(statusKey, cls);
  if (!el) return b;
  el.replaceWith(b);
  return b;
}

export function extractUsernameFromButton(
  btn: HTMLButtonElement,
): string | null {
  const title = (
    btn.getAttribute("title") ||
    btn.getAttribute("aria-label") ||
    btn.value ||
    btn.textContent ||
    btn.innerText ||
    ""
  ).trim();
  const m = title.match(/Follow\s+(.*)|Unfollow\s+(.*)/i);
  if (m) return (m[1] || m[2]).trim();
  const form = btn.closest<HTMLFormElement>("form");
  if (form)
    try {
      const action = form.getAttribute("action") || form.action || "";
      const q = action.split("?")[1] || "";
      const p = new URLSearchParams(q);
      if (p.get("target")) return p.get("target");
    } catch {}
  const anchor = btn.closest("div")?.querySelector('a[href^="/"]');
  if (anchor)
    return anchor.getAttribute("href")!.replace(/^\//, "").replace(/\/$/, "");
  return null;
}
