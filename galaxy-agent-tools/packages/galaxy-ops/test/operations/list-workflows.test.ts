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
    { id: "w1", name: "RNA-seq" },
    { id: "w2", name: "Assembly" },
  ];
  const ctx: any = { client: mockClient({ GET: () => ({ data: ROWS, response: { status: 200 } }) }), poll: DEFAULT_POLL };

  it("matches a substring of the name, whatever its case", async () => {
    expect(await listWorkflows({ name: "assem" }, ctx)).toEqual([ROWS[1]]);
    expect(await listWorkflows({ name: "RNA" }, ctx)).toEqual([ROWS[0]]);
  });

  it("keeps a name a query cannot spell out of the alphabet it is written in", async () => {
    const rows = [{ id: "w1", name: "\u89e3\u6790\u30d1\u30a4\u30d7\u30e9\u30a4\u30f3" }, { id: "w2", name: "Assembly" }];
    const jp: any = { client: mockClient({ GET: () => ({ data: rows, response: { status: 200 } }) }), poll: DEFAULT_POLL };
    expect(await listWorkflows({ name: "\u89e3\u6790" }, jp)).toEqual([rows[0]]);
  });

  it("returns everything when no name is given", async () => {
    expect(await listWorkflows({}, ctx)).toHaveLength(2);
  });
});

describe("list_workflows id filter and paging", () => {
  const ROWS = [
    { id: "w1", name: "one" },
    { id: "w2", name: "two" },
    { id: "w3", name: "three" },
  ];
  const ctx: any = { client: mockClient({ GET: () => ({ data: ROWS, response: { status: 200 } }) }), poll: DEFAULT_POLL };

  it("keeps only the workflow an id names", async () => {
    expect(await listWorkflows({ workflowId: "w2" }, ctx)).toEqual([ROWS[1]]);
  });

  it("pages, and reports the total that matched rather than what Galaxy holds", async () => {
    const found: any = {};
    const out = await listWorkflowsOp.run({ limit: 1, offset: 1 } as any, ctx, found);
    expect(out).toEqual([ROWS[1]]);
    expect(found.pagination).toEqual({ total: 3, limit: 1, offset: 1 });
    expect(listWorkflowsOp.project!(out, {}, found).message).toBe("1 of 3 workflow(s)");
  });

  it("leaves an unpaged listing whole", async () => {
    const found: any = {};
    expect(await listWorkflowsOp.run({} as any, ctx, found)).toHaveLength(3);
    expect(found.pagination).toBeUndefined();
  });
});
