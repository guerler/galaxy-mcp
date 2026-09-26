import { z } from "zod";
import type { GetJson } from "../bindings";
import type { GalaxyContext } from "../context";
import { classifyHttp } from "../errors";
import { legacyGet } from "../legacy";
import { register, runOperation } from "./registry";
import type { AnyOperation, Operation, Pagination, RunFindings } from "./types";

/** How many histories the account has, or undefined on a server that will not say.
 *
 * Off the bindings: /api/histories/count answers a bare number rather than a document.
 */
async function totalHistories(ctx: GalaxyContext): Promise<number | undefined> {
  try {
    const total = Number(await legacyGet<unknown>(ctx, "/api/histories/count"));
    return Number.isFinite(total) ? total : undefined;
  } catch {
    return undefined;
  }
}

export type Histories = GetJson<"/api/histories">;

const input = {
  limit: z.coerce.number().int().positive().optional().describe("Max histories to return"),
  offset: z.coerce.number().int().min(0).optional().describe("Skip the first N"),
  name: z.string().optional().describe("Case-insensitive substring filter on history name"),
};
type In = { limit?: number; offset?: number; name?: string };

async function run(i: In, ctx: GalaxyContext, found?: RunFindings): Promise<Histories> {
  // Galaxy filters and pages in that order; filtering a page here instead would answer a
  // window of the unfiltered list, and `name-contains` is case-insensitive server-side.
  const filter = i.name ? { q: ["name-contains"], qv: [i.name] } : {};
  const { data, error, response } = await ctx.client.GET("/api/histories", {
    params: { query: { limit: i.limit ?? null, offset: i.offset ?? null, ...filter } },
  });
  if (error || !data) throw classifyHttp(response.status, error);
  // Only when the caller paged, and only unfiltered: an unpaged listing is its own total, and
  // the count route counts every history rather than the ones a name matched. A total that
  // describes a different set than the page is worse than no total.
  if (found && i.limit != null && !i.name) {
    const total = await totalHistories(ctx);
    if (total != null) {
      found.pagination = { total, limit: i.limit, offset: i.offset ?? 0 };
    }
  }
  return data;
}

export const getHistoriesOp: Operation<typeof input, Histories> = {
  name: "get_histories",
  domain: "histories",
  summary: "List the current user's histories (id, name, counts). Optional name substring filter.",
  input,
  run,
  project: (hs, i, found) => {
    const arr = hs as unknown[];
    const shown = `${arr.length} histor${arr.length === 1 ? "y" : "ies"}`;
    // Unpaged, the page is everything there is; paged, the count route said how many when it
    // could be asked, which is when no name narrowed the set.
    const pagination: Pagination | undefined =
      found?.pagination ?? (i.limit == null ? { total: arr.length } : undefined);
    const total = pagination?.total;
    return {
      message: total != null && total !== arr.length ? `${shown} of ${total}` : shown,
      ...(pagination ? { pagination } : {}),
    };
  },
};

register(getHistoriesOp as AnyOperation);

export const getHistories = (i: In, ctx: GalaxyContext) => runOperation(getHistoriesOp, i, ctx);
