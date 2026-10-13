// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearCache,
  getCachedFollowStatus,
  getFollowStatusOnce,
} from "./client.js";

const sendMessageMock = vi.fn();

function stubChromeStorage() {
  const store = new Map<string, unknown>();
  const storage = {
    local: {
      get: (
        _keys: string[],
        callback: (items: Record<string, unknown>) => void,
      ) => {
        callback(Object.fromEntries(store));
      },
      set: (items: Record<string, unknown>, callback?: () => void) => {
        Object.entries(items).forEach(([k, v]) => store.set(k, v));
        callback?.();
      },
    },
  };
  vi.stubGlobal("chrome", {
    storage,
    runtime: {
      lastError: null,
      sendMessage: sendMessageMock,
    },
  });
  return store;
}

beforeEach(() => {
  clearCache();
  sendMessageMock.mockReset();
  stubChromeStorage();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("getFollowStatusOnce", () => {
  it("derives the badge from the viewer follower list", async () => {
    sendMessageMock.mockImplementation(
      (_msg: unknown, callback: (r: unknown) => void) => {
        callback({ followers: ["alice"] });
      },
    );

    const status = await getFollowStatusOnce("viewer", "alice");

    expect(status).toEqual({
      viewerFollowsTarget: null,
      targetFollowsViewer: true,
    });
  });

  it("reports not-followed for users missing from the list", async () => {
    sendMessageMock.mockImplementation(
      (_msg: unknown, callback: (r: unknown) => void) => {
        callback({ followers: ["alice"] });
      },
    );

    const status = await getFollowStatusOnce("viewer", "bob");

    expect(status).toEqual({
      viewerFollowsTarget: null,
      targetFollowsViewer: false,
    });
  });

  it("caches the resolved status for repeated lookups", async () => {
    sendMessageMock.mockImplementation(
      (_msg: unknown, callback: (r: unknown) => void) => {
        callback({ followers: ["alice"] });
      },
    );

    await getFollowStatusOnce("viewer", "alice");
    const cached = getCachedFollowStatus("viewer", "alice");

    expect(cached).toEqual({
      viewerFollowsTarget: null,
      targetFollowsViewer: true,
    });
  });

  it("falls back to a direct checkFollow message when the list is empty", async () => {
    sendMessageMock.mockImplementation(
      (msg: { type: string }, callback: (r: unknown) => void) => {
        if (msg.type === "getLists") callback({ followers: [] });
        if (msg.type === "checkFollow")
          callback({ viewerFollowsTarget: false, targetFollowsViewer: true });
      },
    );

    const status = await getFollowStatusOnce("viewer", "alice");

    expect(status).toEqual({
      viewerFollowsTarget: false,
      targetFollowsViewer: true,
    });
  });
});
