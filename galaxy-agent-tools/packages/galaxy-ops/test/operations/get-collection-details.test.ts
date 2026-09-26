import { describe, it, expect } from "vitest";
import { getCollectionDetailsOp, getCollectionDetails } from "../../src/operations/get-collection-details";
import { mockClient } from "../util/mock-client";
import { DEFAULT_POLL } from "../../src/context";
import type { GalaxyContext } from "../../src/context";

const ctxWith = (client: any): GalaxyContext => ({ client, poll: DEFAULT_POLL });

describe("get_collection_details", () => {
  it("shows a collection by hdca id and truncates elements", async () => {
    const client = mockClient({
      GET: (path, init) => {
        expect(path).toBe("/api/dataset_collections/{hdca_id}");
        expect(init.params.path.hdca_id).toBe("c1");
        return { data: { id: "c1", elements: [{ e: 1 }, { e: 2 }, { e: 3 }] }, response: { status: 200 } };
      },
    });
    const out = await getCollectionDetails({ collectionId: "c1", maxElements: 2 }, ctxWith(client));
    expect((out as any).elements.length).toBe(2);
  });
});

describe("get_collection_details truncation", () => {
  const collection = (n: number) => ({ id: "c1", element_count: n, elements: Array.from({ length: n }, (_, k) => k) });
  const ctxFor = (n: number): any => ({
    client: mockClient({ GET: () => ({ data: collection(n), response: { status: 200 } }) }),
    poll: DEFAULT_POLL,
  });

  it("says when it left elements out", async () => {
    const out: any = await getCollectionDetails({ collectionId: "c1", maxElements: 2 }, ctxFor(5));
    expect(out.elements).toHaveLength(2);
    expect(out.elements_truncated).toBe(true);
    expect(out.elements_shown).toBe(2);
  });

  it("stays quiet when the whole list fits", async () => {
    const out: any = await getCollectionDetails({ collectionId: "c1", maxElements: 9 }, ctxFor(3));
    expect(out.elements).toHaveLength(3);
    expect(out).not.toHaveProperty("elements_truncated");
  });
});
