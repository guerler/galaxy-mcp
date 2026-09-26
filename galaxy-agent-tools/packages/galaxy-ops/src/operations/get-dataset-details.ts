import { z } from "zod";
import type { GetJson } from "../bindings";
import type { GalaxyContext } from "../context";
import { classifyHttp } from "../errors";
import { register, runOperation } from "./registry";
import type { AnyOperation, Operation } from "./types";

export type DatasetDetail = GetJson<"/api/datasets/{dataset_id}">;

/** Galaxy's own text peek, sliced to the lines the caller asked for. */
export interface DatasetPreview {
  lines?: string | null;
  preview_lines?: number;
  truncated?: boolean;
  /** Galaxy's own flag, verbatim: it reads the stored byte size, not what this peek covers. */
  content_truncated_by_galaxy?: boolean;
  error?: string;
}

const DEFAULT_PREVIEW_LINES = 10;

const input = {
  datasetId: z.string().describe("Encoded dataset id"),
  includePreview: z.boolean().default(true).describe("Include a preview of the content (default true)"),
  previewLines: z
    .number()
    .int()
    .default(DEFAULT_PREVIEW_LINES)
    .describe(`Lines of content to preview (default ${DEFAULT_PREVIEW_LINES})`),
};
type In = { datasetId: string; includePreview?: boolean; previewLines?: number };

type TextContent = GetJson<"/api/datasets/{dataset_id}/get_content_as_text">;

async function preview(ctx: GalaxyContext, datasetId: string, want: number): Promise<DatasetPreview> {
  try {
    // Galaxy reads about a megabyte of text here, so a ten-line preview is not a download.
    const { data, error, response } = await ctx.client.GET("/api/datasets/{dataset_id}/get_content_as_text", {
      params: { path: { dataset_id: datasetId } },
    });
    if (error || !data) throw classifyHttp(response.status, error);
    const body = data as TextContent;
    const cutByGalaxy = Boolean(body.truncated);
    if (body.item_data == null) {
      return {
        lines: null,
        error: "No text preview: Galaxy previews text datatypes only",
        content_truncated_by_galaxy: cutByGalaxy,
      };
    }
    const lines = body.item_data.split("\n");
    return {
      lines: lines.slice(0, want).join("\n"),
      preview_lines: Math.min(want, lines.length),
      truncated: lines.length > want,
      content_truncated_by_galaxy: cutByGalaxy,
    };
  } catch (err) {
    // Name an unreadable preview: an absent field reads as a dataset with no content.
    return { error: `Preview unavailable: ${err instanceof Error ? err.message : String(err)}`, lines: null };
  }
}

async function run(i: In, ctx: GalaxyContext): Promise<DatasetDetail> {
  const { data, error, response } = await ctx.client.GET("/api/datasets/{dataset_id}", {
    params: { path: { dataset_id: i.datasetId } },
  });
  if (error || !data) throw classifyHttp(response.status, error);
  const dataset = data as DatasetDetail & { state?: string; preview?: DatasetPreview };
  // Only a dataset in `ok` state has content to read, as on the Python side.
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
