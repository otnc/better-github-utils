// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { extractFeedNodes } from "./feed";

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
