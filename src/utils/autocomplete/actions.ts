import * as dom from "./dom.js";

export interface ApiResult {
  ok: boolean;
  status: number;
  json: unknown;
  text: string;
}

export interface PrepareOptions {
  autoEnable?: boolean;
  autoClick?: boolean;
  countdown?: number;
  openDialog?: boolean;
}

export interface CancelSignal {
  canceled?: boolean;
}

export interface PrepareResult {
  ok: boolean;
  reason?: string;
  info?: string;
  target?: HTMLElement;
}

function wait(ms: number): Promise<void> {
  return new Promise<void>((r) => setTimeout(r, ms));
}

export async function apiRequest(
  path: string,
  method: string = "GET",
  token?: string,
  body: Record<string, unknown> | null = null,
): Promise<ApiResult> {
  if (!token) throw new Error("no_token");
  const headers: Record<string, string> = {
    Accept: "application/vnd.github.v3+json",
    Authorization: `token ${token}`,
  };
  if (body) headers["Content-Type"] = "application/json";
  const res = await fetch(`https://api.github.com${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });
  const txt = await res.text();
  let json: unknown = null;
  try {
    json = txt ? JSON.parse(txt) : null;
  } catch {}
  return { ok: res.ok, status: res.status, json, text: txt };
}

export async function apiDeleteRepo(
  repoFullName: string,
  token?: string,
): Promise<ApiResult> {
  return await apiRequest(`/repos/${repoFullName}`, "DELETE", token);
}

export async function apiArchiveRepo(
  repoFullName: string,
  token?: string,
): Promise<ApiResult> {
  return await apiRequest(`/repos/${repoFullName}`, "PATCH", token, {
    archived: true,
  });
}

export async function apiSetArchived(
  repoFullName: string,
  archived: boolean,
  token?: string,
): Promise<ApiResult> {
  return await apiRequest(`/repos/${repoFullName}`, "PATCH", token, {
    archived: !!archived,
  });
}

export async function apiGetRepo(
  repoFullName: string,
  token?: string,
): Promise<ApiResult> {
  return await apiRequest(`/repos/${repoFullName}`, "GET", token);
}

export async function prepareDelete(
  options: PrepareOptions = {
    autoEnable: false,
    autoClick: false,
    countdown: 3,
  },
  signal: CancelSignal = { canceled: false },
): Promise<PrepareResult> {
  const repo = dom.getRepoFullName();
  if (!repo) return { ok: false, reason: "not_repo" };
  const input = dom.findDeleteInput();
  const confirmBtn = dom.findDeleteConfirmButton();
  if (!input || !confirmBtn) return { ok: false, reason: "not_found" };
  input.value = repo;
  input.dispatchEvent(new Event("input", { bubbles: true }));
  if (options.autoEnable) {
    try {
      confirmBtn.removeAttribute("disabled");
      confirmBtn.disabled = false;
    } catch {}
  }
  dom.highlight(confirmBtn);

  if (options.autoClick) {
    const cd = options.countdown || 3;
    for (let i = cd; i > 0; i--) {
      if (signal.canceled) return { ok: true, info: "canceled" };
      await wait(1000);
    }
    if (signal.canceled) return { ok: true, info: "canceled" };
    try {
      confirmBtn.click();
      return { ok: true, info: "clicked", target: confirmBtn };
    } catch {
      return { ok: false, reason: "click_failed" };
    }
  }

  return { ok: true, info: "prepared", target: confirmBtn };
}

export async function prepareArchive(
  options: PrepareOptions = {
    autoEnable: false,
    autoClick: false,
    countdown: 3,
  },
  signal: CancelSignal = { canceled: false },
): Promise<PrepareResult> {
  const btn = dom.findArchiveButton();
  if (!btn) return { ok: false, reason: "no_archive_button" };
  let confirm = dom.findArchiveConfirmButton();
  if (!confirm) {
    if (options.openDialog) {
      try {
        btn.click();
      } catch {}
      await wait(300);
      confirm = dom.findArchiveConfirmButton();
    }
  }
  if (!confirm) return { ok: false, reason: "no_confirm" };
  if (options.autoEnable) {
    try {
      confirm.removeAttribute("disabled");
      confirm.disabled = false;
    } catch {}
  }
  dom.highlight(confirm);

  if (options.autoClick) {
    const cd = options.countdown || 3;
    for (let i = cd; i > 0; i--) {
      if (signal.canceled) return { ok: true, info: "canceled" };
      await wait(1000);
    }
    if (signal.canceled) return { ok: true, info: "canceled" };
    try {
      confirm.click();
      return { ok: true, info: "clicked", target: confirm };
    } catch {
      return { ok: false, reason: "click_failed" };
    }
  }

  return { ok: true, info: "prepared", target: confirm };
}
