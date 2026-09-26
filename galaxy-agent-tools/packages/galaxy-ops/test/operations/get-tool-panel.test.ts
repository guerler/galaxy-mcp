import { describe, it, expect } from "vitest";
import { getToolPanelOp, getToolPanel } from "../../src/operations/get-tool-panel";
import { mockClient } from "../util/mock-client";
import { DEFAULT_POLL } from "../../src/context";
import { GalaxyNotFoundError } from "../../src/errors";
import type { GalaxyContext } from "../../src/context";

const ctxWith = (client: any): GalaxyContext => ({ client, poll: DEFAULT_POLL });

const PANEL = [
  {
    id: "section1",
    name: "Genomics",
    model_class: "ToolSection",
    elems: [
      { id: "fastqc", name: "FastQC", description: "read qc", versions: ["0.74"] },
      { id: "label1", model_class: "ToolSectionLabel", name: "divider" },
    ],
  },
  { id: "section2", name: "Assembly", model_class: "ToolSection", elems: [] },
  { id: "upload1", name: "Upload", description: "load data", model_class: "Tool" },
  { id: "label0", model_class: "ToolSectionLabel", name: "top divider" },
];

const panelClient = () =>
  mockClient({
    GET: (path, init) => {
      expect(path).toBe("/api/tools");
      expect(init.params.query.in_panel).toBe(true);
      return { data: PANEL, response: { status: 200 } };
    },
  });

describe("get_tool_panel", () => {
  it("summarizes the top level, counting a section's tools without listing them", async () => {
    const out = (await getToolPanel({}, ctxWith(panelClient()))) as { entries: unknown[] };
    expect(out.entries).toEqual([
      { id: "section1", name: "Genomics", type: "section", tool_count: 1 },
      { id: "section2", name: "Assembly", type: "section", tool_count: 0 },
      { id: "upload1", name: "Upload", type: "tool", description: "load data" },
    ]);
  });

  it("opens one section, slimmed to what picking a tool needs", async () => {
    const out = await getToolPanel({ sectionId: "section1" }, ctxWith(panelClient()));
    expect(out).toEqual({
      section_id: "section1",
      section_name: "Genomics",
      tools: [{ id: "fastqc", name: "FastQC", description: "read qc", versions: ["0.74"] }],
    });
  });

  it("names an unknown section rather than answering with an empty one", async () => {
    await expect(getToolPanel({ sectionId: "nope" }, ctxWith(panelClient()))).rejects.toBeInstanceOf(
      GalaxyNotFoundError,
    );
  });

  it("pages the top level and reports the total", async () => {
    const found: any = {};
    const out = (await getToolPanelOp.run({ limit: 1, offset: 1 } as any, ctxWith(panelClient()), found)) as {
      entries: unknown[];
    };
    expect(out.entries).toEqual([{ id: "section2", name: "Assembly", type: "section", tool_count: 0 }]);
    expect(found.pagination).toEqual({ total: 3, limit: 1, offset: 1 });
  });

  it("throws GalaxyNotFoundError on 404", async () => {
    const client = mockClient({ GET: () => ({ error: { err_msg: "not found" }, response: { status: 404 } }) });
    await expect(getToolPanel({}, ctxWith(client))).rejects.toBeInstanceOf(GalaxyNotFoundError);
  });

  it("project counts what the page holds and carries the pagination", () => {
    const msg = getToolPanelOp.project!({ entries: [{}, {}] } as any, {}, { pagination: { total: 9 } });
    expect(msg.message).toBe("2 of 9 tool panel entries; pass section_id to list a section's tools");
    expect(msg.pagination).toEqual({ total: 9 });
  });
});
