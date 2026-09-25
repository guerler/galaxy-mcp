import { describe, it, expect } from "vitest";
import { getHistoriesOp, getHistories } from "../../src/operations/get-histories";
import { mockClient } from "../util/mock-client";
import { runWithEnvelope } from "../../src/operations/registry";
import { DEFAULT_POLL } from "../../src/context";
import type { GalaxyContext } from "../../src/context";

const ctxWith = (client: any): GalaxyContext => ({ client, poll: DEFAULT_POLL });

describe("get_histories", () => {
  it("passes limit/offset as query and filters name client-side", async () => {
    const client = mockClient({
      GET: (path, init) => {
        expect(path).toBe("/api/histories");
        expect(init.params.query.limit).toBe(2);
        return { data: [{ id: "h1", name: "alpha" }, { id: "h2", name: "beta" }], response: { status: 200 } };
      },
    });
    const out = await getHistories({ limit: 2, name: "alp" }, ctxWith(client));
    expect(out.map((h: any) => h.id)).toEqual(["h1"]);
  });
});

describe("get_histories totals", () => {
  const route = (total?: unknown) => (path: string) =>
    path === "/api/histories/count"
      ? { data: total, response: { status: 200 } }
      : { data: [{ id: "h1" }, { id: "h2" }], response: { status: 200 } };

  it("reports how many the account has, not how many this page holds", async () => {
    const r = await runWithEnvelope(
      getHistoriesOp as never,
      { limit: 2 } as never,
      ctxWith(mockClient({ GET: route(2851) })),
    );
    expect(r.pagination).toEqual({ total: 2851, limit: 2, offset: 0 });
    expect(r.message).toBe("2 histories of 2851");
  });

  it("does not ask for a count when nothing was paged", async () => {
    const asked: string[] = [];
    const client = mockClient({
      GET: (path) => {
        asked.push(path);
        return route()(path);
      },
    });
    const r = await runWithEnvelope(getHistoriesOp as never, {} as never, ctxWith(client));
    expect(asked).toEqual(["/api/histories"]);
    expect(r.pagination).toEqual({ total: 2 });
  });

  it("leaves the total unstated when the count route will not answer", async () => {
    const client = mockClient({
      GET: (path) =>
        path === "/api/histories/count"
          ? { error: "nope", response: { status: 404 } }
          : { data: [{ id: "h1" }], response: { status: 200 } },
    });
    const r = await runWithEnvelope(getHistoriesOp as never, { limit: 2 } as never, ctxWith(client));
    expect(r.pagination).toBeUndefined();
    expect(r.message).toBe("1 history");
  });
});
