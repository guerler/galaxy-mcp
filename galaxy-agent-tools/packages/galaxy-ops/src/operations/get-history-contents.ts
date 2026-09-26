import { z } from "zod";
import type { GetJson } from "../bindings";
import type { GalaxyContext } from "../context";
import { classifyHttp } from "../errors";
import { register, runOperation } from "./registry";
import type { AnyOperation, Operation } from "./types";

export type HistoryContents = GetJson<"/api/histories/{history_id}/contents">;

const input = {
  historyId: z.string().describe("Encoded history id"),
  limit: z.coerce.number().int().positive().optional().describe("Max items"),
  offset: z.coerce.number().int().min(0).optional().describe("Skip the first N"),
  deleted: z.boolean().optional().describe("Include deleted items"),
  visible: z.boolean().optional().describe("Only visible items"),
  order: z.string().default("hid-asc").describe("Sort order, e.g. 'hid-asc', 'hid-dsc', 'create_time-dsc'"),
};
type In = { historyId: string; limit?: number; offset?: number; deleted?: boolean; visible?: boolean; order?: string };

async function run(i: In, ctx: GalaxyContext): Promise<HistoryContents> {
  const order = i.order ?? "hid-asc";
  const { data, error, response } = await ctx.client.GET("/api/histories/{history_id}/contents", {
    params: {
      path: { history_id: i.historyId },
      query: {
        limit: i.limit ?? null,
        offset: i.offset ?? null,
        deleted: i.deleted ?? null,
        visible: i.visible ?? null,
        order: order,
        // Galaxy honours `order` only alongside v=dev; without it the parameter is silently
        // ignored. The item shape is identical either way.
        v: "dev",
      },
    },
  });
  if (error || !data) throw classifyHttp(response.status, error);
  return data as HistoryContents;
}

export const getHistoryContentsOp: Operation<typeof input, HistoryContents> = {
  name: "get_history_contents",
  domain: "histories",
  summary: "List the datasets and collections in a history.",
  input,
  run,
  project: (items) => ({ message: `${(items as unknown[]).length} item(s)` }),
};

register(getHistoryContentsOp as AnyOperation);

export const getHistoryContents = (i: In, ctx: GalaxyContext) => runOperation(getHistoryContentsOp, i, ctx);
