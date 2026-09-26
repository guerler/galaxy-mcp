import { z } from "zod";
import type { GetJson } from "../bindings";
import type { GalaxyContext } from "../context";
import { classifyHttp } from "../errors";
import { register, runOperation } from "./registry";
import type { AnyOperation, Operation } from "./types";

export type History = GetJson<"/api/histories/{history_id}">;

/** The history, and how many items it holds without listing any of them. */
export interface HistoryDetail {
  history: History;
  contents_summary: { total_items: number; note: string };
}

const CONTENTS_NOTE =
  "This is just a count. To get actual datasets, use " +
  "get_history_contents(history_id, limit=25, order='create_time-dsc') for newest datasets first.";

const input = { historyId: z.string().describe("Encoded history id") };
type In = { historyId: string };

async function run(i: In, ctx: GalaxyContext): Promise<HistoryDetail> {
  const { data, error, response } = await ctx.client.GET("/api/histories/{history_id}", {
    params: { path: { history_id: i.historyId } },
  });
  if (error || !data) throw classifyHttp(response.status, error);
  // Galaxy counts the history's items itself; listing every one to length it would make the
  // cost of this call grow with the history.
  const history = data as History & { count?: number };
  return { history, contents_summary: { total_items: history.count ?? 0, note: CONTENTS_NOTE } };
}

export const getHistoryDetailsOp: Operation<typeof input, HistoryDetail> = {
  name: "get_history_details",
  domain: "histories",
  summary: "Show a single history's details by id (name, state, counts).",
  input,
  run,
  project: (d) => {
    const h = d.history as { id?: string; state?: string };
    return { message: `History ${h.id} state=${h.state} (${d.contents_summary.total_items} item(s))` };
  },
};

register(getHistoryDetailsOp as AnyOperation);

export const getHistoryDetails = (i: In, ctx: GalaxyContext) => runOperation(getHistoryDetailsOp, i, ctx);
