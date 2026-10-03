document.addEventListener("DOMContentLoaded", () => {
  const tokenInput = document.getElementById("token") as HTMLInputElement;
  const saveBtn = document.getElementById("save") as HTMLButtonElement;
  const clearBtn = document.getElementById("clear") as HTMLButtonElement;
  const checkBtn = document.getElementById("check") as HTMLButtonElement;
  const status = document.getElementById("status") as HTMLDivElement;
  const rateStatus = document.getElementById("rate-status") as HTMLDivElement;

  function setStatus(msg: string) {
    status.textContent = msg;
  }
  function setRate(html: string) {
    rateStatus.innerHTML = html;
  }

  function readableReset(ts: number): string {
    try {
      const d = new Date(ts * 1000);
      return d.toLocaleString();
    } catch {
      return String(ts);
    }
  }

  chrome.storage.sync.get<{ github_utils_token?: string | null }>(
    ["github_utils_token"],
    (items) => {
      tokenInput.value = items.github_utils_token || "";
      checkRate();
    },
  );

  saveBtn.addEventListener("click", () => {
    const token = tokenInput.value.trim();
    chrome.storage.sync.set({ github_utils_token: token }, () => {
      setStatus(token ? "Token saved." : "Empty token saved.");
      setTimeout(() => {
        try {
          window.close();
        } catch {}
      }, 800);
      checkRate();
    });
  });

  clearBtn.addEventListener("click", () => {
    chrome.storage.sync.remove("github_utils_token", () => {
      tokenInput.value = "";
      setStatus("Token removed.");
      setTimeout(() => {
        try {
          window.close();
        } catch {}
      }, 800);
      checkRate();
    });
  });

  checkBtn.addEventListener("click", () => checkRate());

  async function checkRate(): Promise<void> {
    setRate("Checking rate limit...");
    const token = tokenInput.value.trim();
    const headers: Record<string, string> = {
      Accept: "application/vnd.github.v3+json",
    };
    if (token) headers["Authorization"] = `token ${token}`;
    try {
      const res = await fetch("https://api.github.com/rate_limit", {
        headers,
        cache: "no-store",
      });
      if (res.status === 401) {
        setRate('<span class="warn">Invalid token</span>');
        return;
      }
      if (!res.ok) {
        setRate('<span class="warn">Rate status unavailable</span>');
        return;
      }
      const json = await res.json();
      const core = json.resources.core ||
        json.resources.core || { remaining: 0, limit: 0, reset: 0 };
      const rem = core.remaining;
      const lim = core.limit;
      const reset = core.reset;
      if (rem <= 0)
        setRate(
          `<span class="warn">Rate limited</span> — ${rem}/${lim} (resets ${readableReset(reset)})`,
        );
      else
        setRate(
          `<span class="ok">${rem}/${lim} remaining</span> (resets ${readableReset(reset)})`,
        );
    } catch {
      setRate('<span class="warn">Network error</span>');
    }
  }
});
