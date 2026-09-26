import { z } from "zod";
import type { GetJson } from "../bindings";
import type { GalaxyContext } from "../context";
import { classifyHttp } from "../errors";
import { register, runOperation } from "./registry";
import type { AnyOperation, Operation } from "./types";

export type DatasetDetail = GetJson<"/api/datasets/{dataset_id}">;

/** The head of a dataset's content, and what was left out of it. */
export interface DatasetPreview {
  lines?: string | null;
  total_lines?: number;
  preview_lines?: number;
  truncated?: boolean;
  error?: string;
}

// A preview is the head of a file, so only the head is fetched: a whole dataset can be
// gigabytes and none of it past the first lines can appear in the answer.
const PREVIEW_BYTES = 256 * 1024;
const DEFAULT_PREVIEW_LINES = 10;

const input = {
  datasetId: z.string().describe("Encoded dataset id"),
  includePreview: z.boolean().optional().describe("Include a preview of the content (default true)"),
  previewLines: z.coerce.number().int().positive().optional().describe("Lines of content to preview (default 10)"),
};
type In = { datasetId: string; includePreview?: boolean; previewLines?: number };

/** The first bytes of a dataset as text, or null when it does not decode as text. */
async function head(ctx: GalaxyContext, datasetId: string): Promise<string | null> {
  // parseAs is not on the typed client; the cast is localized to this call, as in download_dataset.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error, response } = await (ctx.client.GET as any)("/api/datasets/{dataset_id}/display", {
    params: { path: { dataset_id: datasetId } },
    parseAs: "arrayBuffer",
  });
  if (error || data == null) throw classifyHttp(response.status, error);
  const bytes = new Uint8Array(data as ArrayBuffer).slice(0, PREVIEW_BYTES);
  const text = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
  // U+FFFD in the first bytes means this is not text; a hex head says so without pretending.
  if (text.includes("�")) {
    const hex = Array.from(bytes.slice(0, 100), (b) => b.toString(16).padStart(2, "0")).join("");
    return `[Binary content - first ${Math.min(100, bytes.length)} bytes as hex: ${hex}]`;
  }
  return text;
}

async function preview(ctx: GalaxyContext, datasetId: string, want: number): Promise<DatasetPreview> {
  try {
    const text = (await head(ctx, datasetId)) ?? "";
    const lines = text.split("\n");
    return {
      lines: lines.slice(0, want).join("\n"),
      total_lines: lines.length,
      preview_lines: Math.min(want, lines.length),
      truncated: lines.length > want,
    };
  } catch (err) {
    // A dataset still running has nothing to read yet. Naming that beats an absent field,
    // which reads the same as a dataset with no content at all.
    return { error: `Preview unavailable: ${err instanceof Error ? err.message : String(err)}`, lines: null };
  }
}

async function run(i: In, ctx: GalaxyContext): Promise<DatasetDetail> {
  const { data, error, response } = await ctx.client.GET("/api/datasets/{dataset_id}", {
    params: { path: { dataset_id: i.datasetId } },
  });
  if (error || !data) throw classifyHttp(response.status, error);
  const dataset = data as DatasetDetail & { state?: string; preview?: DatasetPreview };
  if ((i.includePreview ?? true) && dataset.state === "ok") {
    return { ...dataset, preview: await preview(ctx, i.datasetId, i.previewLines ?? DEFAULT_PREVIEW_LINES) };
  }
  return dataset;
}

export const getDatasetDetailsOp: Operation<typeof input, DatasetDetail> = {
  name: "get_dataset_details",
  domain: "datasets",
  summary: "Show a dataset's metadata by id (state, extension, name), with a preview of its content.",
  input,
  run,
  project: (d) => ({ message: `Dataset ${(d as { id?: string }).id} state=${(d as { state?: string }).state}` }),
};

register(getDatasetDetailsOp as AnyOperation);

export const getDatasetDetails = (i: In, ctx: GalaxyContext) => runOperation(getDatasetDetailsOp, i, ctx);
