/** Every declared result field is a field the operation actually returns.
 *
 * `resultFields` is what a caller is told it may read. Nothing else checks it: the types say
 * the shape at compile time, and a projection that quietly stops building one of them still
 * satisfies an index signature. get_tool_panel shipped for a release without the tool_count
 * its own summary promised, and a scenario found it rather than a test.
 */
import { describe, it, expect } from "vitest";
import "../../src/operations/all";
import { allOperations } from "../../src/operations/registry";
import { mockClient } from "../util/mock-client";
import { DEFAULT_POLL } from "../../src/context";
import type { GalaxyContext } from "../../src/context";

/** One panel section holding one tool, which every panel projection has to cope with. */
const PANEL = [
  { id: "sec", name: "Section", elems: [{ id: "cat1", name: "Concatenate", description: "join" }] },
  { id: "loose", name: "Loose tool", description: "outside a section" },
];

/** Answers every route any declaring op reads, so one mock serves the whole table. */
function client(): GalaxyContext {
  const body = {
    id: "x1",
    name: "thing",
    version: "1.0",
    state: "ok",
    file_ext: "txt",
    count: 3,
    citations: [],
    inputs: [],
    elements: [],
    element_count: 0,
    populated: true,
    collection_type: "list",
    job: { id: "j1", state: "ok" },
    // get_job_details reads the job id off the dataset before it reads the job.
    creating_job: "j1",
  };
  return {
    client: mockClient({
      GET: (path: string, init?: any) => {
        if (path === "/api/tools") return { data: PANEL, response: { status: 200 } };
        if (path.endsWith("/test_data")) return { data: [], response: { status: 200 } };
        if (init?.parseAs === "arrayBuffer") {
          return { data: new TextEncoder().encode("a\nb").buffer, response: { status: 200 } };
        }
        return { data: body, response: { status: 200 } };
      },
      DELETE: () => ({ data: {}, response: { status: 200 } }),
    }),
    poll: DEFAULT_POLL,
  } as GalaxyContext;
}

/** The smallest arguments each declaring op needs; a new declaration without one fails below. */
const ARGS: Record<string, Record<string, unknown>> = {
  get_tool_panel: {},
  get_collection_details: { collectionId: "c1" },
  get_history_details: { historyId: "h1" },
  get_tool_run_examples: { toolId: "cat1" },
  get_tool_input_template: { toolId: "cat1" },
  get_tool_citations: { toolId: "cat1" },
  get_job_details: { datasetId: "d1" },
  cancel_workflow_invocation: { invocationId: "i1" },
  delete_user_tool: { uuid: "u1" },
  download_dataset: { datasetId: "d1" },
};

const declaring = allOperations.filter((op) => op.resultFields?.length);

describe("declared result fields", () => {
  it("covers every op that declares them", () => {
    const missing = declaring.map((op) => op.name).filter((name) => !(name in ARGS));
    expect(missing, "declared a result shape with no way to read it back").toEqual([]);
  });

  it.each(declaring.map((op) => [op.name, op] as const))("%s returns each one", async (name, op) => {
    const data = (await op.run(ARGS[name] as never, client())) as Record<string, unknown>;
    const absent = op.resultFields!.filter((field) => !(field in data));
    expect(absent, `${name} promises fields its result does not carry`).toEqual([]);
  });
});
