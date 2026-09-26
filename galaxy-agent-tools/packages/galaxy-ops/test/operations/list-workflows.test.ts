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

describe("list_workflows id filter and paging", () => {
  const ROWS = [
    { id: "w1", name: "one", tags: [] },
    { id: "w2", name: "two", tags: [] },
    { id: "w3", name: "three", tags: [] },
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

describe("list_workflows separator-insensitive matching", () => {
  const ROWS = [
    { id: "w1", name: "RNA-seq quantification", tags: [] },
    { id: "w2", name: "RNAseq differential expression", tags: [] },
    { id: "w3", name: "Read quality control", tags: ["long-read", "qc"] },
  ];
  const ctx: any = { client: mockClient({ GET: () => ({ data: ROWS, response: { status: 200 } }) }), poll: DEFAULT_POLL };
  const names = async (name: string) => ((await listWorkflows({ name }, ctx)) as any[]).map((w) => w.id);

  it("reads a spaced query as a hyphenated name", async () => {
    expect(await names("rna seq")).toEqual(["w1", "w2"]);
  });

  it("agrees across separator variants", async () => {
    expect(await names("rna-seq")).toEqual(await names("rnaseq"));
    expect(await names("rnaseq")).toEqual(await names("rna seq"));
  });

  it("matches a tag across separators too", async () => {
    expect(await names("long read")).toEqual(["w3"]);
  });

  it("matches nothing unrelated", async () => {
    expect(await names("proteomics")).toEqual([]);
  });
});
