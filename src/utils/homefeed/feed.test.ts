// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildSection, extractFeedNodes, fetchFeedPages } from "./feed";

function parse(html: string): Document {
  return new DOMParser().parseFromString(html, "text/html");
}

describe("extractFeedNodes", () => {
  it("extracts feed items and pagination while dropping the live region", () => {
    const doc = parse(`
      <turbo-frame id="feed">
        <article id="first">First</article>
        <feed-live-container>Live updates</feed-live-container>
        <form class="ajax-pagination-form">
          <button class="ajax-pagination-btn">More</button>
        </form>
      </turbo-frame>
    `);

    const result = extractFeedNodes(doc);

    expect(result.items.map((item) => item.id)).toEqual(["first"]);
    expect(result.moreForm?.className).toBe("ajax-pagination-form");
  });

  it("keeps non-pagination forms as feed items", () => {
    const doc = parse(`
      <turbo-frame>
        <article id="item">Item</article>
        <form id="dismiss">Dismiss</form>
      </turbo-frame>
    `);

    const result = extractFeedNodes(doc);

    expect(result.items.map((item) => item.id)).toEqual(["item", "dismiss"]);
    expect(result.moreForm).toBeNull();
  });

  it("returns empty results when the response has no turbo frame", () => {
    const result = extractFeedNodes(
      parse("<main><article>Item</article></main>"),
    );

    expect(result).toEqual({ items: [], moreForm: null });
  });
});

function feedPage(itemId: string, nextUrl?: string): string {
  const more = nextUrl
    ? `<form class="ajax-pagination-form" action="${nextUrl}"><button class="ajax-pagination-btn">More</button></form>`
    : "";
  return `<turbo-frame><article id="${itemId}">Item</article>${more}</turbo-frame>`;
}

describe("fetchFeedPages", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function stubFeed(pages: Record<string, string>) {
    const fetchMock = vi.fn(async (url: string) => {
      const body = Object.entries(pages).find(([key]) =>
        url.startsWith(key),
      )?.[1];
      return new Response(body ?? "", { status: body ? 200 : 404 });
    });
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
  }

  it("follows the More chain up to the requested page count", async () => {
    const fetchMock = stubFeed({
      "/conduit/for_you_feed": feedPage("a", "/page2"),
      "/page2": feedPage("b", "/page3"),
      "/page3": feedPage("c", "/page4"),
    });

    const result = await fetchFeedPages(3);

    expect(result.items.map((item) => item.id)).toEqual(["a", "b", "c"]);
    expect(result.moreForm?.getAttribute("action")).toBe("/page4");
    expect(result.pages).toBe(3);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("stops early when the feed runs out of pages", async () => {
    stubFeed({
      "/conduit/for_you_feed": feedPage("a", "/page2"),
      "/page2": feedPage("b"),
    });

    const result = await fetchFeedPages(5);

    expect(result.items.map((item) => item.id)).toEqual(["a", "b"]);
    expect(result.moreForm).toBeNull();
    expect(result.pages).toBe(2);
  });
});

describe("buildSection", () => {
  it("builds a section with a header, view-all link, and item list", () => {
    const section = buildSection();

    expect(section.id).toBe("gh-utils-home-feed");
    const title = section.querySelector(".gh-utils-feed-title");
    expect(title?.textContent).toBe("Feed");
    const viewAll = section.querySelector(
      ".gh-utils-feed-view-all",
    ) as HTMLAnchorElement;
    expect(viewAll.getAttribute("href")).toBe("/feed");
    expect(section.querySelector(".gh-utils-feed-list")).not.toBeNull();
  });
});
