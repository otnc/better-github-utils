import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { apiRequest } from "./actions.js";

const fetchMock = vi.fn();

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  fetchMock.mockReset();
});

describe("apiRequest", () => {
  it("sends an authorized request and parses the JSON response", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response('{"archived":true}', { status: 200 }),
    );

    const result = await apiRequest("/repos/octocat/hello", "GET", "tok");

    expect(result.ok).toBe(true);
    expect(result.status).toBe(200);
    expect(result.json).toEqual({ archived: true });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.github.com/repos/octocat/hello",
      expect.objectContaining({
        method: "GET",
        headers: expect.objectContaining({
          Authorization: "token tok",
        }),
      }),
    );
  });

  it("serializes the request body as JSON", async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 200 }));

    const result = await apiRequest("/repos/octocat/hello", "PATCH", "tok", {
      archived: true,
    });

    expect(result.status).toBe(200);
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.body).toBe('{"archived":true}');
    expect(init.headers).toMatchObject({ "Content-Type": "application/json" });
  });

  it("throws when no token is provided", async () => {
    await expect(apiRequest("/repos/octocat/hello", "GET")).rejects.toThrow(
      "no_token",
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("reports non-ok responses without throwing", async () => {
    fetchMock.mockResolvedValueOnce(new Response("Not Found", { status: 404 }));

    const result = await apiRequest("/repos/octocat/hello", "GET", "tok");

    expect(result.ok).toBe(false);
    expect(result.status).toBe(404);
    expect(result.text).toBe("Not Found");
    expect(result.json).toBeNull();
  });
});
