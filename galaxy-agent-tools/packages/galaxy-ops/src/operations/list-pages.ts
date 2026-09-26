import { z } from "zod";
import type { GalaxyContext } from "../context";
import { classifyHttp } from "../errors";
import type { PageSummary } from "./pages-common";
import { register, runOperation } from "./registry";
import type { AnyOperation, Operation, Pagination, RunFindings } from "./types";

const DEFAULT_LIMIT = 100;

const input = {
  historyId: z.string().min(1).optional().describe("Encoded history id; lists only that history's notebooks"),
  search: z.string().optional().describe("Freetext filter over title, slug, tag and owner"),
  limit: z.coerce.number().int().positive().optional().describe("Max pages to return (default 100)"),
  offset: z.coerce.number().int().min(0).optional().describe("Skip the first N"),
  showPublished: z.boolean().optional().describe("Also include pages published by other users (default false)"),
  showShared: z.boolean().optional().describe("Also include pages shared with the user (default false)"),
};
type In = {
  historyId?: string;
  search?: string;
  limit?: number;
  offset?: number;
  showPublished?: boolean;
  showShared?: boolean;
};

async function run(i: In, ctx: GalaxyContext, found?: RunFindings): Promise<PageSummary[]> {
  const { data, error, response } = await ctx.client.GET("/api/pages", {
    params: {
      query: {
        limit: i.limit ?? DEFAULT_LIMIT,
        offset: i.offset ?? 0,
        // The index's own defaults (show_own and show_published both on) would hand an agent
        // every published page on the server, so send each visibility flag explicitly.
        show_own: true,
        show_published: i.showPublished ?? false,
        show_shared: i.showShared ?? false,
        search: i.search ?? null,
        // history_id is a 26.1 filter the pinned bindings do not carry, so it goes in through
        // its own cast. That is belt and braces rather than a guard: openapi-fetch infers the
        // init generically, so an unknown query key compiles either way. The VALUES above are
        // checked.
        ...(i.historyId === undefined ? {} : ({ history_id: i.historyId } as never)),
      },
    },
  });
  if (error || !data) throw classifyHttp(response.status, error);
  // The index reports how many matched on a header; only the run sees the response. Read the
  // header before converting: Number(null) is 0, so an absent header would claim none matched.
  const header = response.headers?.get("total_matches");
  const matches = header == null ? Number.NaN : Number(header);
  if (found && Number.isFinite(matches)) {
    found.pagination = { total: matches, limit: i.limit ?? DEFAULT_LIMIT, offset: i.offset ?? 0 };
  }
  return data as PageSummary[];
}

export const listPagesOp: Operation<typeof input, PageSummary[]> = {
  name: "list_pages",
  domain: "pages",
  summary:
    "List Galaxy pages (markdown notebooks and reports) the user can see. " +
    "Pass historyId to list only that history's notebooks. The history filter is what needs " +
    "26.1: an older server ignores it and answers with every page instead of that history's.",
  input,
  requires: { galaxy: ">=26.1" },
  run,
  project: (pages, i, found) => {
    const total = found?.pagination?.total;
    // The paging run() used, which is what the caller asked for or the default it applied.
    const asked: Pagination = { offset: Number(i.offset ?? 0), limit: Number(i.limit ?? DEFAULT_LIMIT) };
    return {
      message: total != null ? `${pages.length} of ${total} page(s)` : `${pages.length} page(s)`,
      pagination: found?.pagination ?? asked,
    };
  },
};

register(listPagesOp as AnyOperation);

export const listPages = (i: In, ctx: GalaxyContext) => runOperation(listPagesOp, i, ctx);
