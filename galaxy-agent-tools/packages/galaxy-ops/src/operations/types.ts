import type { z, ZodRawShape, ZodObject } from "zod";
import type { GalaxyContext } from "../context";
import type { GalaxyErrorKind } from "../errors";

export type OperationDomain =
  | "connection"
  | "histories"
  | "datasets"
  | "collections"
  | "jobs"
  | "tools"
  | "userTools"
  | "workflows"
  | "invocations"
  | "iwc"
  | "pages";

/** The parsed input object derived from an op's raw Zod shape. */
/** What a caller hands an operation.
 *
 * The input side, not the parsed side: nothing validates or coerces before run() sees the
 * arguments, so a declared `.default()` documents the value run() applies rather than one
 * zod supplies. Using the output type here would demand callers pass what they may omit.
 */
export type InputOf<Shape extends ZodRawShape> = z.input<ZodObject<Shape>>;

export interface Pagination {
  total?: number;
  offset?: number;
  limit?: number;
}

/**
 * An operation: identity, doc string, a Zod RAW SHAPE input (what MCP's
 * registerTool wants -- Record<string, ZodType>, NOT z.object(...)), and a run
 * that returns plain typed data or throws a typed error.
 */
export interface Operation<Shape extends ZodRawShape, O> {
  readonly name: string; // parity with AgentOperationsManager, e.g. "run_tool"
  readonly domain: OperationDomain;
  readonly summary: string; // reused verbatim as the MCP tool description
  readonly input: Shape; // raw shape -> MCP inputSchema directly
  /**
   * What the op needs from the server, as `{ galaxy: ">=26.1" }`. The registry refuses the
   * op before it runs against anything older, and both surfaces say so in their own words
   * for the op's description.
   */
  readonly requires?: { galaxy: string };
  /** Read-only by default. Write/mutating ops set this false (drives MCP annotations). */
  readonly readOnly?: boolean;
  /** Destructive (delete/cancel) ops set this true (drives MCP destructiveHint). */
  readonly destructive?: boolean;
  /**
   * The top-level fields of the returned data a caller may rely on.
   *
   * Declared only by an operation that composes its own result, because only then is there a
   * shape this package owns; an operation handing back what Galaxy sent has Galaxy's shape and
   * nothing to promise. Two things read it: a test that the operation really returns each one,
   * which is the check a dropped field slips past otherwise, and the parity report, which
   * compares it against the fields the Python server's result literal names.
   */
  readonly resultFields?: readonly string[];
  run(input: InputOf<Shape>, ctx: GalaxyContext, found?: RunFindings): Promise<O>;
  project?(
    output: O,
    input: InputOf<Shape>,
    found?: RunFindings,
  ): { message?: string; pagination?: Pagination };
}

/**
 * What a run learned that belongs in the envelope rather than in the data.
 *
 * A total is the case this exists for: Galaxy reports it on a response header or a count
 * route, so only run() can see it, while only project() shapes the envelope. Putting it in
 * the returned data instead would change what the operation promises its callers.
 */
export interface RunFindings {
  pagination?: Pagination;
}

/** Heterogeneous registry element. */
export type AnyOperation = Operation<ZodRawShape, unknown>;

/** The surface envelope (MCP/CLI projection of run()). */
export interface GalaxyResult<T> {
  data: T;
  success: boolean;
  message?: string;
  pagination?: Pagination;
  errorKind?: GalaxyErrorKind;
}
