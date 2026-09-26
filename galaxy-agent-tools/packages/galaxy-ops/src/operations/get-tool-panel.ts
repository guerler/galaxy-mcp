import { z } from "zod";
import type { GalaxyContext } from "../context";
import { GalaxyNotFoundError } from "../errors";
import { legacyGet } from "../legacy";
import { register, runOperation } from "./registry";
import type { AnyOperation, Operation, Pagination, RunFindings } from "./types";

/** Hand-typed: Galaxy's tool panel endpoint is not in the OpenAPI bindings. */
interface PanelEntry {
  id?: string;
  name?: string;
  description?: string;
  versions?: unknown[];
  model_class?: string;
  elems?: unknown;
  [k: string]: unknown;
}

/** One top-level entry, described without listing what is inside it. */
export interface PanelSummary {
  id: string;
  name: string;
  type: "section" | "tool";
  tool_count?: number;
  description?: string;
}

/** The four fields an agent needs to pick a tool and then call get_tool_details. */
export interface SlimTool {
  id: string;
  name: string;
  description: string;
  versions: unknown[];
}

/** What the server holds, counted over the whole panel rather than over the page. */
export interface PanelTotals {
  tool_count: number;
  section_count: number;
}

export type ToolPanel =
  | ({ entries: PanelSummary[] } & PanelTotals)
  | ({ section_id: string; section_name: string; tools: SlimTool[] } & PanelTotals);

// The whole panel is megabytes on a production server, so it is never returned whole.
const DEFAULT_LIMIT = 100;

/** Tool panel entries are sections, labels or tools; only the tools are runnable. */
function isPanelTool(entry: unknown): entry is PanelEntry {
  if (entry === null || typeof entry !== "object") return false;
  const e = entry as PanelEntry;
  return e.elems === undefined && e.model_class !== "ToolSectionLabel";
}

function elemsOf(entry: PanelEntry): unknown[] {
  return Array.isArray(entry.elems) ? entry.elems : [];
}

/** Returns null for a divider label, which is neither a section to open nor a tool to run. */
function summarize(entry: PanelEntry): PanelSummary | null {
  if (entry.elems !== undefined) {
    return {
      id: entry.id ?? "",
      name: entry.name ?? "",
      type: "section",
      tool_count: elemsOf(entry).filter(isPanelTool).length,
    };
  }
  if (!isPanelTool(entry)) return null;
  return { id: entry.id ?? "", name: entry.name ?? "", type: "tool", description: entry.description ?? "" };
}

/** Every tool and section in a panel subtree, counted through nested sections.
 *
 * Counted over the whole panel and reported on every answer, page or section: an agent asked
 * how many tools a server has must not have to add up the pages, and the top level is mostly
 * sections, so counting the entries undercounts by an order of magnitude.
 */
function totals(entries: unknown[]): PanelTotals {
  let tool_count = 0;
  let section_count = 0;
  for (const entry of entries) {
    if (entry === null || typeof entry !== "object") continue;
    const e = entry as PanelEntry;
    if (e.elems !== undefined) {
      section_count += 1;
      const inner = totals(elemsOf(e));
      tool_count += inner.tool_count;
      section_count += inner.section_count;
    } else if (isPanelTool(e)) {
      tool_count += 1;
    }
  }
  return { tool_count, section_count };
}

function slim(tool: PanelEntry): SlimTool {
  return {
    id: tool.id ?? "",
    name: tool.name ?? "",
    description: tool.description ?? "",
    versions: Array.isArray(tool.versions) ? tool.versions : [],
  };
}

const input = {
  sectionId: z.string().optional().describe("Panel section to open; omit to list the sections themselves"),
  limit: z.coerce.number().int().positive().max(500).optional().describe("Max entries to return (default 100)"),
  offset: z.coerce.number().int().min(0).optional().describe("Skip the first N"),
};
type In = { sectionId?: string; limit?: number; offset?: number };

function pageOf<T>(rows: T[], i: In, found?: RunFindings): T[] {
  const limit = i.limit ?? DEFAULT_LIMIT;
  const offset = i.offset ?? 0;
  if (found) found.pagination = { total: rows.length, limit, offset };
  return rows.slice(offset, offset + limit);
}

async function run(i: In, ctx: GalaxyContext, found?: RunFindings): Promise<ToolPanel> {
  const panel = await legacyGet<PanelEntry[]>(ctx, "/api/tools", { params: { query: { in_panel: true } } });
  const entries = Array.isArray(panel) ? panel : [];
  const counted = totals(entries);

  if (i.sectionId === undefined) {
    const summaries = entries
      .filter((e): e is PanelEntry => e !== null && typeof e === "object")
      .map(summarize)
      .filter((s): s is PanelSummary => s !== null);
    return { ...counted, entries: pageOf(summaries, i, found) };
  }

  const section = entries.find((e) => e && typeof e === "object" && e.id === i.sectionId && e.elems !== undefined);
  if (!section) {
    throw new GalaxyNotFoundError(
      `Tool panel section '${i.sectionId}' not found. ` +
        "Call get_tool_panel with no arguments to list the available section ids.",
    );
  }
  const tools = elemsOf(section).filter(isPanelTool).map(slim);
  return { ...counted, section_id: i.sectionId, section_name: section.name ?? "", tools: pageOf(tools, i, found) };
}

export const getToolPanelOp: Operation<typeof input, ToolPanel> = {
  name: "get_tool_panel",
  domain: "tools",
  summary:
    "Browse the Galaxy tool panel one level at a time. Every answer carries tool_count, how many " +
    "tools the server has installed, and section_count. With no arguments it lists the top-level " +
    "entries, each section with the number of tools in it; pass section_id to list a section's tools.",
  input,
  run,
  project: (out, i, found) => {
    const pagination: Pagination | undefined = found?.pagination;
    const total = pagination?.total;
    const shown = "entries" in out ? out.entries.length : out.tools.length;
    const noun =
      "entries" in out ? "tool panel entries; pass section_id to list a section's tools" : `tools in '${i.sectionId}'`;
    return {
      message: total != null ? `${shown} of ${total} ${noun}` : `${shown} ${noun}`,
      ...(pagination ? { pagination } : {}),
    };
  },
};

register(getToolPanelOp as AnyOperation);

export const getToolPanel = (i: In, ctx: GalaxyContext) => runOperation(getToolPanelOp, i, ctx);
