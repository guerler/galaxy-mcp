import { z } from "zod";
import type { components } from "@galaxyproject/galaxy-api-client";
import type { GalaxyContext } from "../context";
import { classifyHttp } from "../errors";
import { legacyGet } from "../legacy";
import { register, runOperation } from "./registry";
import type { AnyOperation, Operation } from "./types";

export type InvocationDetail = components["schemas"]["WorkflowInvocationElementView"];

/** One invocation when asked for by id, or the page of them when listing. */
export type Invocations = InvocationDetail | InvocationDetail[];

const input = {
  invocationId: z.string().optional().describe("Encoded workflow invocation id; omit to list"),
  workflowId: z.string().optional().describe("List only invocations of this workflow"),
  historyId: z.string().optional().describe("List only invocations in this history"),
  limit: z.coerce.number().int().positive().optional().describe("Max invocations to return"),
  view: z.enum(["element", "collection"]).optional().describe("'element' for detail, 'collection' for summary"),
  stepDetails: z.boolean().optional().describe("Include each step's detail"),
};
type In = {
  invocationId?: string;
  workflowId?: string;
  historyId?: string;
  limit?: number;
  view?: "element" | "collection";
  stepDetails?: boolean;
};

async function run(i: In, ctx: GalaxyContext): Promise<Invocations> {
  if (i.invocationId) {
    const { data, error, response } = await ctx.client.GET("/api/invocations/{invocation_id}", {
      params: { path: { invocation_id: i.invocationId }, query: { step_details: i.stepDetails ?? undefined } },
    });
    if (error || !data) throw classifyHttp(response.status, error);
    return data as InvocationDetail;
  }
  // The listing route's filters are off the typed query shape, so it goes through legacyGet.
  return legacyGet<InvocationDetail[]>(ctx, "/api/invocations", {
    params: {
      query: {
        workflow_id: i.workflowId ?? null,
        history_id: i.historyId ?? null,
        limit: i.limit ?? null,
        view: i.view ?? "collection",
        step_details: i.stepDetails ?? null,
      },
    },
  });
}

export const getInvocationsOp: Operation<typeof input, Invocations> = {
  name: "get_invocations", // parity: mcp-server-galaxy-py get_invocations
  domain: "invocations",
  summary: "View a workflow invocation by id, or list invocations filtered by workflow or history.",
  input,
  run,
  project: (out) =>
    Array.isArray(out)
      ? { message: `${out.length} workflow invocation(s)` }
      : { message: `Invocation ${(out as { id?: string }).id} state=${(out as { state?: string }).state}` },
};

register(getInvocationsOp as AnyOperation);

export const getInvocations = (i: In, ctx: GalaxyContext) => runOperation(getInvocationsOp, i, ctx);
