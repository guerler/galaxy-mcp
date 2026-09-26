import { z } from "zod";
import type { GetJson } from "../bindings";
import type { GalaxyContext } from "../context";
import { classifyHttp } from "../errors";
import { register, runOperation } from "./registry";
import type { AnyOperation, Operation, Pagination, RunFindings } from "./types";

export type Workflows = GetJson<"/api/workflows">;

/** Letters and digits only, so "rna seq", "rna-seq" and "RNAseq" are one query. */
function alnum(text: string | undefined): string {
  return (text ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

const input = {
  name: z.string().optional().describe("Case-insensitive substring filter on workflow name or tag"),
  published: z.boolean().optional().describe("Only published workflows"),
  workflowId: z.string().optional().describe("Keep only the workflow with this id"),
  limit: z.coerce.number().int().positive().optional().describe("Max workflows to return"),
  offset: z.coerce.number().int().min(0).optional().describe("Skip the first N"),
};
type In = { name?: string; published?: boolean; workflowId?: string; limit?: number; offset?: number };

async function run(i: In, ctx: GalaxyContext, found?: RunFindings): Promise<Workflows> {
  const { data, error, response } = await ctx.client.GET("/api/workflows", {
    params: { query: { show_published: i.published ?? null } },
  });
  if (error || !data) throw classifyHttp(response.status, error);
  let rows = data as Array<{ id?: string; name?: string; tags?: string[] }>;
  if (i.workflowId) rows = rows.filter((w) => w.id === i.workflowId);
  if (i.name) {
    // Galaxy's own ?search drops short terms, so the filter is applied here -- over tags as
    // well as the name, because a workflow is as often found by its tag as by what it is called.
    const needle = alnum(i.name);
    rows = rows.filter((w) => {
      const named = alnum(w.name).includes(needle);
      return named || (w.tags ?? []).some((t) => alnum(String(t)).includes(needle));
    });
  }
  // Every filter is applied here, so the total is what matched rather than what Galaxy holds.
  if (i.limit == null && i.offset == null) return rows as Workflows;
  const limit = i.limit ?? rows.length;
  const offset = i.offset ?? 0;
  if (found) found.pagination = { total: rows.length, limit, offset };
  return rows.slice(offset, offset + limit) as Workflows;
}

export const listWorkflowsOp: Operation<typeof input, Workflows> = {
  name: "list_workflows",
  domain: "workflows",
  summary: "List stored workflows (id, name). Optional name-or-tag substring, id, published filter and paging.",
  input,
  run,
  project: (ws, _i, found) => {
    const shown = (ws as unknown[]).length;
    const pagination: Pagination | undefined = found?.pagination;
    const total = pagination?.total;
    return {
      message: total != null && total !== shown ? `${shown} of ${total} workflow(s)` : `${shown} workflow(s)`,
      ...(pagination ? { pagination } : {}),
    };
  },
};

register(listWorkflowsOp as AnyOperation);

export const listWorkflows = (i: In, ctx: GalaxyContext) => runOperation(listWorkflowsOp, i, ctx);
