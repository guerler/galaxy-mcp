import { describe, it, expect } from "vitest";
import { getDatasetDetails } from "../../src/operations/get-dataset-details";
import { mockClient } from "../util/mock-client";
import { DEFAULT_POLL } from "../../src/context";
import type { GalaxyContext } from "../../src/context";

const ctxWith = (client: any): GalaxyContext => ({ client, poll: DEFAULT_POLL });

const bytes = (text: string) => new TextEncoder().encode(text).buffer;

/** A dataset read, and its content read from the display route. */
function client(meta: Record<string, unknown>, content?: ArrayBuffer, onDisplay?: (init: any) => void) {
  return mockClient({
    GET: (path: string, init: any) => {
      if (path === "/api/datasets/{dataset_id}") return { data: meta, response: { status: 200 } };
      expect(path).toBe("/api/datasets/{dataset_id}/display");
      onDisplay?.(init);
      if (content === undefined) return { error: { err_msg: "not ready" }, response: { status: 400 } };
      return { data: content, response: { status: 200 } };
    },
  });
}

describe("get_dataset_details", () => {
  it("shows a dataset by id", async () => {
    const out = await getDatasetDetails({ datasetId: "d1", includePreview: false }, ctxWith(client({ id: "d1" })));
    expect((out as any).id).toBe("d1");
    expect(out).not.toHaveProperty("preview");
  });

  it("previews the head of the content, saying how much it left out", async () => {
    const c = client({ id: "d1", state: "ok" }, bytes("a\nb\nc\nd"));
    const out: any = await getDatasetDetails({ datasetId: "d1", previewLines: 2 }, ctxWith(c));
    expect(out.preview).toEqual({ lines: "a\nb", total_lines: 4, preview_lines: 2, truncated: true });
  });

  it("previews by default, and only for a dataset that has content", async () => {
    const ok: any = await getDatasetDetails({ datasetId: "d1" }, ctxWith(client({ id: "d1", state: "ok" }, bytes("x"))));
    expect(ok.preview.lines).toBe("x");
    const running: any = await getDatasetDetails({ datasetId: "d1" }, ctxWith(client({ id: "d1", state: "running" })));
    expect(running).not.toHaveProperty("preview");
  });

  it("names a preview it could not read rather than dropping the field", async () => {
    const out: any = await getDatasetDetails({ datasetId: "d1" }, ctxWith(client({ id: "d1", state: "ok" })));
    expect(out.preview.lines).toBeNull();
    expect(out.preview.error).toMatch(/Preview unavailable/);
  });

  it("reports binary content as hex instead of mojibake", async () => {
    const c = client({ id: "d1", state: "ok" }, new Uint8Array([0xff, 0xfe, 0x00, 0x01]).buffer);
    const out: any = await getDatasetDetails({ datasetId: "d1" }, ctxWith(c));
    expect(out.preview.lines).toMatch(/^\[Binary content - first 4 bytes as hex: fffe0001\]/);
  });
});
