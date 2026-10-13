// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";

// background.ts touches chrome APIs at module scope (listener registration
// and cache restore), so the stub must exist before the module is imported.
vi.stubGlobal("chrome", {
  runtime: {
    onMessage: { addListener: vi.fn() },
  },
  storage: {
    local: {
      get: (_keys: string[], callback: () => void) => callback(),
      set: (_items: Record<string, unknown>, callback?: () => void) =>
        callback?.(),
    },
    sync: {
      get: (_keys: string[], callback: () => void) => callback(),
    },
  },
});

const { parseLinkHeader } = await import("./background.js");

describe("parseLinkHeader", () => {
  it("parses next and last links", () => {
    const header =
      '<https://api.github.com/users/octocat/followers?page=2>; rel="next", ' +
      '<https://api.github.com/users/octocat/followers?page=4>; rel="last"';

    expect(parseLinkHeader(header)).toEqual({
      next: "https://api.github.com/users/octocat/followers?page=2",
      last: "https://api.github.com/users/octocat/followers?page=4",
    });
  });

  it("returns an empty map for null or empty headers", () => {
    expect(parseLinkHeader(null)).toEqual({});
    expect(parseLinkHeader("")).toEqual({});
  });

  it("ignores malformed segments", () => {
    const header = 'not-a-link; rel="next", <https://example.com>; rel="prev"';

    expect(parseLinkHeader(header)).toEqual({
      prev: "https://example.com",
    });
  });
});
