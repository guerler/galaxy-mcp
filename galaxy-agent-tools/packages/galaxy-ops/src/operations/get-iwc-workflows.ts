import { z } from "zod";
import { fetchIwcWorkflows, enrichWorkflowResult, type EnrichedIwcWorkflow } from "../iwc-manifest";
import type { GalaxyContext } from "../context";
import { register, runOperation } from "./registry";
import type { AnyOperation, Operation, Pagination, RunFindings } from "./types";

// A raw manifest entry carries the whole workflow definition -- median ~50 KB, largest
// ~500 KB -- so a page of them overflows a client's output budget on its own.
const DEFAULT_LIMIT = 20;

const input = {
  limit: z.coerce.number().int().positive().max(100).default(DEFAULT_LIMIT).describe("Max workflows to return"),
  offset: z.coerce.number().int().min(0).default(0).describe("Skip the first N"),
};
type In = { limit?: number; offset?: number };

async function run(i: In, _ctx: GalaxyContext, found?: RunFindings): Promise<EnrichedIwcWorkflow[]> {
  const all = await fetchIwcWorkflows();
  const limit = i.limit ?? DEFAULT_LIMIT;
  const offset = i.offset ?? 0;
  if (found) {
    found.pagination = { total: all.length, limit, offset };
  }
  return all.slice(offset, offset + limit).map((wf) => enrichWorkflowResult(wf));
}

export const getIwcWorkflowsOp: Operation<typeof input, EnrichedIwcWorkflow[]> = {
  name: "get_iwc_workflows",
  domain: "iwc",
  summary:
    "List IWC (Intergalactic Workflow Commission) workflows as summaries, one page at a time. " +
    "Use get_iwc_workflow_details(trs_id) for a full record.",
  input,
  run,
  project: (out, _i, found) => {
    const pagination: Pagination | undefined = found?.pagination;
    const total = pagination?.total;
    return {
      message: total != null ? `${out.length} of ${total} IWC workflows` : `${out.length} IWC workflows`,
      ...(pagination ? { pagination } : {}),
    };
  },
};

register(getIwcWorkflowsOp as AnyOperation);

export const getIwcWorkflows = (i: In, ctx: GalaxyContext) => runOperation(getIwcWorkflowsOp, i, ctx);
