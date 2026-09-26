import { describe, it, expect } from "vitest";
import { getDatasetDetails } from "../../src/operations/get-dataset-details";
import { mockClient } from "../util/mock-client";
import { DEFAULT_POLL } from "../../src/context";
import type { GalaxyContext } from "../../src/context";

const ctxWith = (client: any): GalaxyContext => ({ client, poll: DEFAULT_POLL });

/** A dataset read, and Galaxy's own text peek of it. `text: undefined` serves no peek at all. */
function client(
  meta: Record<string, unknown>,
  opts: { text?: string | null; truncated?: boolean; seen?: string[] } = {},
) {
  return mockClient({
    GET: (path: string) => {
      if (path === "/api/datasets/{dataset_id}") return { data: meta, response: { status: 200 } };
      expect(path).toBe("/api/datasets/{dataset_id}/get_content_as_text");
      opts.seen?.push(path);
      if (opts.text === undefined) return { error: { err_msg: "boom" }, response: { status: 400 } };
      return {
        data: { item_data: opts.text, truncated: Boolean(opts.truncated), item_url: "/datasets/d1/display" },
        response: { status: 200 },
      };
    },
  });
}

describe("get_dataset_details", () => {
  it("shows a dataset by id", async () => {
    const out = await getDatasetDetails({ datasetId: "d1", includePreview: false }, ctxWith(client({ id: "d1" })));
    expect((out as any).id).toBe("d1");
    expect(out).not.toHaveProperty("preview");
  });

  it("previews the lines asked for and says its own slice cut the rest", async () => {
    const c = client({ id: "d1", state: "ok" }, { text: "line1\nline2\nline3\nline4\nline5\n" });
    const out: any = await getDatasetDetails({ datasetId: "d1", previewLines: 3 }, ctxWith(c));
    // No total: what came back is a peek, and a line count taken from it reads as a
    // count of the dataset.
    expect(out.preview).toEqual({
      lines: "line1\nline2\nline3",
      preview_lines: 3,
      truncated: true,
      content_truncated_by_galaxy: false,
    });
  });

  it("asks the text route, which is the one that stops at a megabyte", async () => {
    const seen: string[] = [];
    await getDatasetDetails({ datasetId: "d1" }, ctxWith(client({ id: "d1", state: "ok" }, { text: "a\nb\n", seen })));
    expect(seen).toEqual(["/api/datasets/{dataset_id}/get_content_as_text"]);
  });

  it("passes Galaxy's own truncation flag through as a separate fact", async () => {
    // `truncated` is this slice; `content_truncated_by_galaxy` is Galaxy's byte cap, and
    // Galaxy reads that from the stored size while counting decoded characters, so it is
    // reported as what Galaxy said rather than as how much of the dataset this is.
    const c = client({ id: "d1", state: "ok" }, { text: "a\nb\n", truncated: true });
    const out: any = await getDatasetDetails({ datasetId: "d1", previewLines: 10 }, ctxWith(c));
    expect(out.preview.content_truncated_by_galaxy).toBe(true);
    expect(out.preview.truncated).toBe(false);
    expect(out.preview.lines).toBe("a\nb\n");
  });

  it("previews by default, and only for a dataset that has content", async () => {
    const ok: any = await getDatasetDetails(
      { datasetId: "d1" },
      ctxWith(client({ id: "d1", state: "ok" }, { text: "x" })),
    );
    expect(ok.preview.lines).toBe("x");
    const running: any = await getDatasetDetails({ datasetId: "d1" }, ctxWith(client({ id: "d1", state: "running" })));
    expect(running).not.toHaveProperty("preview");
  });

  it("says why a datatype has no text preview instead of showing a hex dump", async () => {
    const c = client({ id: "d1", state: "ok" }, { text: null, truncated: true });
    const out: any = await getDatasetDetails({ datasetId: "d1" }, ctxWith(c));
    expect(out.preview).toEqual({
      lines: null,
      error: "No text preview: Galaxy previews text datatypes only",
      content_truncated_by_galaxy: true,
    });
  });

  it("names a preview it could not read rather than dropping the field", async () => {
    const out: any = await getDatasetDetails({ datasetId: "d1" }, ctxWith(client({ id: "d1", state: "ok" })));
    expect(out.preview.lines).toBeNull();
    expect(out.preview.error).toMatch(/Preview unavailable/);
  });
});
