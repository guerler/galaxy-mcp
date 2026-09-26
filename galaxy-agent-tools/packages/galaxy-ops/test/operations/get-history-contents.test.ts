import { describe, it, expect } from "vitest";
import { getHistoryContentsOp, getHistoryContents } from "../../src/operations/get-history-contents";
import { mockClient } from "../util/mock-client";
import { DEFAULT_POLL } from "../../src/context";
import type { GalaxyContext } from "../../src/context";

const ctxWith = (client: any): GalaxyContext => ({ client, poll: DEFAULT_POLL });

describe("get_history_contents", () => {
  it("lists a history's contents by id", async () => {
    const client = mockClient({
      GET: (path, init) => {
        expect(path).toBe("/api/histories/{history_id}/contents");
        expect(init.params.path.history_id).toBe("h1");
        return { data: [{ id: "ds1", history_content_type: "dataset" }], response: { status: 200 } };
      },
    });
    const out = await getHistoryContents({ historyId: "h1" }, ctxWith(client));
    expect((out as any[]).length).toBe(1);
  });

  it("passes the sort order through with the v=dev that makes Galaxy honour it", async () => {
    // Without v=dev Galaxy ignores `order` outright, which made the parameter inert.
    const client = mockClient({
      GET: (_path, init) => {
        expect(init.params.query.order).toBe("hid-dsc");
        expect(init.params.query.v).toBe("dev");
        return { data: [], response: { status: 200 } };
      },
    });
    await getHistoryContents({ historyId: "h1", order: "hid-dsc" }, ctxWith(client));
  });

  it("orders by hid ascending when the caller says nothing", async () => {
    const client = mockClient({
      GET: (_path, init) => {
        expect(init.params.query.order).toBe("hid-asc");
        return { data: [], response: { status: 200 } };
      },
    });
    await getHistoryContents({ historyId: "h1" }, ctxWith(client));
  });
});
