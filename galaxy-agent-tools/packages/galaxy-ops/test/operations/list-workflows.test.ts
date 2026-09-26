import { describe, it, expect } from "vitest";
import { listWorkflowsOp, listWorkflows } from "../../src/operations/list-workflows";
import { mockClient } from "../util/mock-client";
import { DEFAULT_POLL } from "../../src/context";
import type { GalaxyContext } from "../../src/context";

const ctxWith = (client: any): GalaxyContext => ({ client, poll: DEFAULT_POLL });

describe("list_workflows", () => {
  it("lists workflows and filters by name client-side", async () => {
    const client = mockClient({
      GET: (path) => {
        expect(path).toBe("/api/workflows");
        return { data: [{ id: "w1", name: "RNAseq" }, { id: "w2", name: "VarCall" }], response: { status: 200 } };
      },
    });
    const out = await listWorkflows({ name: "rna" }, ctxWith(client));
    expect((out as any[]).map((w) => w.id)).toEqual(["w1"]);
  });
});

describe("list_workflows name filter", () => {
  const ROWS = [
    { id: "w1", name: "RNA-seq", tags: ["rnaseq"] },
    { id: "w2", name: "Assembly", tags: ["long-read", "qc"] },
  ];
  const ctx: any = { client: mockClient({ GET: () => ({ data: ROWS, response: { status: 200 } }) }), poll: DEFAULT_POLL };

  it("matches a tag as well as a name", async () => {
    expect(await listWorkflows({ name: "long-read" }, ctx)).toEqual([ROWS[1]]);
    expect(await listWorkflows({ name: "assem" }, ctx)).toEqual([ROWS[1]]);
  });

  it("returns everything when no name is given", async () => {
    expect(await listWorkflows({}, ctx)).toHaveLength(2);
  });
});
