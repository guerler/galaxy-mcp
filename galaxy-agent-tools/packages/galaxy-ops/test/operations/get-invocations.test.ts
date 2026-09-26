import { describe, it, expect } from "vitest";
import { getInvocationsOp, getInvocations } from "../../src/operations/get-invocations";
import { mockClient } from "../util/mock-client";
import { DEFAULT_POLL } from "../../src/context";
import { GalaxyNotFoundError } from "../../src/errors";
import type { GalaxyContext } from "../../src/context";

const ctxWith = (client: any): GalaxyContext => ({ client, poll: DEFAULT_POLL });

describe("get_invocations", () => {
  it("has parity name and returns the invocation", async () => {
    expect(getInvocationsOp.name).toBe("get_invocations");
    const client = mockClient({
      GET: (path, init) => {
        expect(path).toBe("/api/invocations/{invocation_id}");
        expect(init.params.path.invocation_id).toBe("inv1");
        return { data: { id: "inv1", state: "scheduled", steps: [] }, response: { status: 200 } };
      },
    });
    const inv = await getInvocations({ invocationId: "inv1" }, ctxWith(client));
    expect((inv as any).id).toBe("inv1");
  });

  it("throws GalaxyNotFoundError on 404", async () => {
    const client = mockClient({ GET: () => ({ error: {}, response: { status: 404 } }) });
    await expect(getInvocations({ invocationId: "x" }, ctxWith(client))).rejects.toBeInstanceOf(
      GalaxyNotFoundError,
    );
  });

  it("lists invocations when no id is given, passing the filters through", async () => {
    const client = mockClient({
      GET: (path, init) => {
        expect(path).toBe("/api/invocations");
        expect(init.params.query).toMatchObject({ workflow_id: "w1", history_id: "h1", limit: 2, view: "collection" });
        return { data: [{ id: "inv1" }, { id: "inv2" }], response: { status: 200 } };
      },
    });
    const out = await getInvocations({ workflowId: "w1", historyId: "h1", limit: 2 }, ctxWith(client));
    expect(out).toHaveLength(2);
  });

  it("projects a listing by count and a single invocation by state", () => {
    expect(getInvocationsOp.project!([{}, {}] as any, {})).toEqual({ message: "2 workflow invocation(s)" });
    expect(getInvocationsOp.project!({ id: "inv1", state: "ok" } as any, {}).message).toBe(
      "Invocation inv1 state=ok",
    );
  });
});
