/** What an operation declares about itself beyond its input and result, read back off the ops. */
import { describe, it, expect } from "vitest";
import "../../src/operations/all";
import { allOperations } from "../../src/operations/registry";

const named = (name: string) => allOperations.find((op) => op.name === name)!;

describe("operation metadata", () => {
  it("polls through an argument the operation takes", () => {
    const polling = allOperations.filter((op) => op.polls);
    expect(polling.map((op) => op.name).sort()).toEqual([
      "get_dataset_details",
      "get_invocations",
      "get_job_details",
    ]);
    for (const op of polling) {
      expect(Object.keys(op.input), op.name).toContain(op.polls!.argument);
    }
  });

  it("calls update_history destructive only when it deletes", () => {
    const when = named("update_history").destructiveWhen!;
    expect(when({ historyId: "h1", deleted: true } as never)).toBe(true);
    expect(when({ historyId: "h1", name: "renamed" } as never)).toBe(false);
    expect(when({ historyId: "h1", deleted: false } as never)).toBe(false);
  });

  it("declares a destroying op one way or the other, never both", () => {
    for (const op of allOperations) {
      expect(op.destructive === true && op.destructiveWhen !== undefined, op.name).toBe(false);
    }
  });

  it("calls the tool searches stable for a session, and nothing that writes", () => {
    const stable = allOperations.filter((op) => op.stableForSession);
    expect(stable.map((op) => op.name).sort()).toEqual(["search_tools_by_keywords", "search_tools_by_name"]);
    for (const op of stable) expect(op.readOnly, op.name).not.toBe(false);
  });
});
