/**
 * What an invocation amounts to once its jobs are counted.
 *
 * Galaxy's invocation `state` describes scheduling, not results: 26.x reports `completed` for a
 * run whose jobs failed, and `scheduled` while every job is still queued. The jobs summary
 * (`GET /api/invocations/{id}/jobs_summary`) says what happened, and this reads one off the other.
 */

/** How many of an invocation's jobs are in each state, as jobs_summary counts them. */
export type JobStates = Record<string, number>;

import { JOB_FAILED_STATES, JOB_SETTLED_STATES } from "./terminal-states";

export { JOB_FAILED_STATES, JOB_SETTLED_STATES };

/** Invocation states after which nothing more is scheduled. */
const SCHEDULING_DONE = new Set(["scheduled", "cancelled", "failed", "completed"]);

/** Invocations a listing reads the jobs of, one request each. */
export const ROLLUP_LIMIT = 20;

const counted = (jobStates: JobStates, wanted: (state: string) => boolean) =>
  Object.entries(jobStates).reduce((sum, [state, n]) => (n && wanted(state) ? sum + n : sum), 0);

/**
 * The outcome `state` amounts to: `failing` while a job has failed and others still move,
 * `failed` once everything settled with a failure, `cancelled` for a stop someone asked for,
 * `completed` when every job came back ok, and Galaxy's own state otherwise.
 */
export function invocationOutcome(state: string | undefined, jobStates: JobStates = {}): string | undefined {
  const failed = counted(jobStates, (s) => (JOB_FAILED_STATES as readonly string[]).includes(s));
  const active = counted(jobStates, (s) => !(JOB_SETTLED_STATES as readonly string[]).includes(s));
  if (!SCHEDULING_DONE.has(state ?? "") || active) {
    return failed ? "failing" : state;
  }
  if (state === "cancelled") return "cancelled";
  if (failed || state === "failed") return "failed";
  return jobStates["ok"] ? "completed" : state;
}

const NOTES: Record<string, string> = {
  failed:
    "A job in this invocation failed. Galaxy's `state` describes scheduling only. " +
    "Report the failure rather than the state, and read the failing dataset's " +
    "get_job_details before proposing a repair.",
  failing:
    "A job in this invocation failed while others are still running. The run is not " +
    "over, so do not report it as finished, and do not repair it until it settles.",
  cancelled: "This invocation was cancelled, so its outputs are incomplete.",
};

/** `invocation` with its jobs' states, the outcome they give it, and a note where one helps. */
export function withOutcome<T>(invocation: T, jobStates: JobStates): T {
  if (!invocation || typeof invocation !== "object" || Array.isArray(invocation)) return invocation;
  const record = invocation as Record<string, unknown>;
  const outcome = invocationOutcome(record["state"] as string | undefined, jobStates);
  const out: Record<string, unknown> = { ...record, job_states: jobStates, outcome };
  if (outcome && outcome in NOTES) out["outcome_note"] = NOTES[outcome];
  return out as T;
}
