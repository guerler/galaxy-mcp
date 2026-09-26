import { describe, it, expect } from "vitest";
import { getHistoriesOp, getHistories } from "../../src/operations/get-histories";
import { mockClient } from "../util/mock-client";
import { runWithEnvelope } from "../../src/operations/registry";
import { DEFAULT_POLL } from "../../src/context";
import type { GalaxyContext } from "../../src/context";

const ctxWith = (client: any): GalaxyContext => ({ client, poll: DEFAULT_POLL });

describe("get_histories", () => {
  it("passes limit and offset as the query", async () => {
    const client = mockClient({
      GET: (path, init) => {
        expect(path).toBe("/api/histories");
        expect(init.params.query.limit).toBe(2);
        expect(init.params.query.offset).toBe(5);
        return { data: [{ id: "h1" }], response: { status: 200 } };
      },
    });
    expect((await getHistories({ limit: 2, offset: 5 }, ctxWith(client))).map((h: any) => h.id)).toEqual(["h1"]);
  });

  it("hands the name filter to Galaxy so it narrows before it pages", async () => {
    // Filtering the page here instead would answer a window of the unfiltered list: with
    // limit=2 over [alpha, beta, alpine], the alpine match never reaches the filter.
    let seen: any = null;
    const client = mockClient({
      GET: (_path, init) => {
        seen = init.params.query;
        return { data: [{ id: "h1", name: "alpha" }], response: { status: 200 } };
      },
    });
    const out = await getHistories({ limit: 2, name: "alp" }, ctxWith(client));
    expect(seen.q).toEqual(["name-contains"]);
    expect(seen.qv).toEqual(["alp"]);
    expect(out.map((h: any) => h.id)).toEqual(["h1"]);
  });

  it("sends no filter when no name was given", async () => {
    let seen: any = null;
    const client = mockClient({
      GET: (_path, init) => {
        seen = init.params.query;
        return { data: [], response: { status: 200 } };
      },
    });
    await getHistories({}, ctxWith(client));
    expect(seen.q).toBeUndefined();
    expect(seen.qv).toBeUndefined();
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

  it("asks for no count when a name narrowed the set", async () => {
    // The count route counts every history; reporting it beside a filtered page would state a
    // total for a different set than the one shown.
    const asked: string[] = [];
    const client = mockClient({
      GET: (path) => {
        asked.push(path);
        return route(2851)(path);
      },
    });
    const r = await runWithEnvelope(getHistoriesOp as never, { limit: 2, name: "alp" } as never, ctxWith(client));
    expect(asked).toEqual(["/api/histories"]);
    expect(r.pagination).toBeUndefined();
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
