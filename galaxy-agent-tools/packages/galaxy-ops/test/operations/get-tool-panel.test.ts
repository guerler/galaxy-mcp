import { describe, it, expect } from "vitest";
import { getToolPanelOp, getToolPanel, type PanelSummary, type SlimTool } from "../../src/operations/get-tool-panel";
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
  it("reports what the server holds, not what the page shows", async () => {
    // Olit's contract points the model at tool_count to answer "how many tools are available",
    // and warns it off counting the entries: the top level is mostly sections.
    const out = (await getToolPanel({}, ctxWith(panelClient()))) as any;
    expect(out.tool_count).toBe(2);
    expect(out.section_count).toBe(2);
    expect(out.entries).toHaveLength(3);
  });

  it("counts the same totals through nested sections", async () => {
    const nested = [
      {
        id: "outer",
        name: "Outer",
        model_class: "ToolSection",
        elems: [
          { id: "t1", name: "One", model_class: "Tool" },
          { id: "inner", name: "Inner", model_class: "ToolSection", elems: [{ id: "t2", model_class: "Tool" }] },
        ],
      },
    ];
    const client = mockClient({ GET: () => ({ data: nested, response: { status: 200 } }) });
    const out = (await getToolPanel({}, ctxWith(client))) as any;
    expect(out).toMatchObject({ tool_count: 2, section_count: 2 });
  });

  it("carries the totals when one section is opened", async () => {
    const out = (await getToolPanel({ sectionId: "section1" }, ctxWith(panelClient()))) as any;
    expect(out).toMatchObject({ tool_count: 2, section_count: 2 });
  });

  it("keeps the totals whole when the page is narrowed", async () => {
    const out = (await getToolPanel({ limit: 1 }, ctxWith(panelClient()))) as any;
    expect(out.entries).toHaveLength(1);
    expect(out.tool_count).toBe(2);
  });

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
    expect(out).toMatchObject({
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

  it("keeps every tool class, naming only the structural entries it drops", async () => {
    // Galaxy ships 25+ tool classes; listing the ones to keep would silently drop tools.
    const panel = [
      {
        id: "getext",
        name: "Get Data",
        model_class: "ToolSection",
        elems: [
          { id: "upload1", name: "Upload File", model_class: "Tool" },
          { id: "ucsc", name: "UCSC Main", model_class: "DataSourceTool" },
          { id: "label", text: "Build", model_class: "ToolSectionLabel" },
        ],
      },
      { id: "expr", name: "Expression", model_class: "ExpressionTool" },
      { id: "top", text: "divider", model_class: "ToolSectionLabel" },
    ];
    const client = mockClient({ GET: () => ({ data: panel, response: { status: 200 } }) });
    const top = (await getToolPanel({}, ctxWith(client))) as { entries: PanelSummary[] };
    expect(top.entries).toEqual([
      { id: "getext", name: "Get Data", type: "section", tool_count: 2 },
      { id: "expr", name: "Expression", type: "tool", description: "" },
    ]);
    const section = (await getToolPanel({ sectionId: "getext" }, ctxWith(client))) as { tools: SlimTool[] };
    expect(section.tools.map((t) => t.id)).toEqual(["upload1", "ucsc"]);
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

describe("get_tool_panel with an explicitly null argument", () => {
  // Models send optional arguments as explicit nulls, and nothing validates the input
  // against the declared shape before run() sees it. Taking null for a section id spent a
  // call answering that no section is named "null", which a live eval paid for every time.
  const client = () =>
    mockClient({
      GET: () => ({
        data: [{ id: "s1", name: "One", model_class: "ToolSection", elems: [{ id: "t1", model_class: "Tool" }] }],
        response: { status: 200 },
      }),
    });

  it("reads a null section id as no section", async () => {
    const out = (await getToolPanel({ sectionId: null } as any, ctxWith(client()))) as any;
    expect(out.entries).toHaveLength(1);
    expect(out.tool_count).toBe(1);
  });

  it("reads an empty section id as no section", async () => {
    const out = (await getToolPanel({ sectionId: "" } as any, ctxWith(client()))) as any;
    expect(out.entries).toHaveLength(1);
  });

  it("reads null paging as the defaults", async () => {
    const out = (await getToolPanel({ sectionId: null, limit: null, offset: null } as any, ctxWith(client()))) as any;
    expect(out.entries).toHaveLength(1);
  });

  it("still opens a section that is named", async () => {
    const out = (await getToolPanel({ sectionId: "s1" }, ctxWith(client()))) as any;
    expect(out.section_id).toBe("s1");
  });
});
