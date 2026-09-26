import { describe, it, expect, beforeEach } from "vitest";
import { getIwcWorkflowsOp, getIwcWorkflows } from "../../src/operations/get-iwc-workflows";
import { __resetIwcCacheForTest, __setIwcCacheForTest, type IwcWorkflow } from "../../src/iwc-manifest";
import { DEFAULT_POLL } from "../../src/context";
import type { GalaxyContext } from "../../src/context";
import { mockClient } from "../util/mock-client";

const ctxWith = (client: any): GalaxyContext => ({ client, poll: DEFAULT_POLL });

const WF_A: IwcWorkflow = {
  trsID: "#workflow/github.com/iwc-workflows/alpha/main",
  definition: { name: "Alpha" },
};
const WF_B: IwcWorkflow = {
  trsID: "#workflow/github.com/iwc-workflows/beta/main",
  definition: { name: "Beta" },
};

beforeEach(() => __resetIwcCacheForTest());

describe("get_iwc_workflows", () => {
  it("returns summaries, never the definition a raw entry carries", async () => {
    __setIwcCacheForTest([WF_A]);
    const out = await getIwcWorkflows({} as any, ctxWith(mockClient({})));
    expect(out[0]).not.toHaveProperty("definition");
    expect(out[0]).toMatchObject({ trsID: WF_A.trsID, name: "Alpha" });
  });

  it("pages, and reports how many there are altogether", async () => {
    __setIwcCacheForTest([WF_A, WF_B]);
    const found: any = {};
    const out = await getIwcWorkflowsOp.run({ limit: 1, offset: 1 } as any, ctxWith(mockClient({})), found);
    expect(out).toHaveLength(1);
    expect(out[0].trsID).toBe(WF_B.trsID);
    expect(found.pagination).toEqual({ total: 2, limit: 1, offset: 1 });
  });

  it("returns all workflows from the primed cache", async () => {
    __setIwcCacheForTest([WF_A, WF_B]);
    const out = await getIwcWorkflows({} as any, ctxWith(mockClient({})));
    expect(out).toHaveLength(2);
    expect(out[0].trsID).toBe(WF_A.trsID);
  });

  it("is read-only by default", () => {
    expect(getIwcWorkflowsOp.readOnly).not.toBe(false);
  });

  it("project returns the count message", async () => {
    __setIwcCacheForTest([WF_A, WF_B]);
    const out = await getIwcWorkflows({} as any, ctxWith(mockClient({})));
    const meta = getIwcWorkflowsOp.project!(out, {} as any);
    expect(meta.message).toBe("2 IWC workflows");
  });
});
