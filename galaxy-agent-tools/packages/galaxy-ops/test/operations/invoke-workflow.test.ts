import { describe, it, expect } from "vitest";
import { invokeWorkflowOp, invokeWorkflow, getDatatypesMapping } from "../../src/operations/invoke-workflow";
import { validateInputs, subtypeSatisfies } from "../../src/workflow-inputs";
import { mockClient } from "../util/mock-client";
import { DEFAULT_POLL } from "../../src/context";
import { GalaxyConnectionError } from "../../src/errors";
import type { GalaxyContext } from "../../src/context";

const ctxWith = (client: any): GalaxyContext => ({ client, poll: DEFAULT_POLL });

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/** Minimal style=run model with one data input step. */
const RUN_MODEL = {
  steps: {
    "0": {
      step_type: "data_input",
      step_index: 0,
      step_label: "Input reads",
      uuid: "uuid-0",
      inputs: [{ extensions: ["fastq"], acceptable_extensions: ["fastq", "fastq.gz"], optional: false }],
    },
  },
};

/** A minimal invocation response */
const INVOCATION_RESPONSE = { id: "inv42", state: "scheduled", model_class: "WorkflowInvocation" };

/** Datatypes mapping fixture: bed -> TabularData, tabular -> TabularData (bed satisfies tabular) */
const DATATYPES_MAPPING = {
  ext_to_class_name: {
    fastq: "FastqSanger",
    "fastq.gz": "FastqSanger",
    bed: "Bed",
    vcf: "Vcf",
  },
  class_to_classes: {
    FastqSanger: { FastqSanger: true, NucleotideSequence: true },
    Bed: { Bed: true, Tabular: true },
    Vcf: { Vcf: true },
  },
};

const DATATYPES_COMBINED = { datatypes: ["fastq", "bed"], datatypes_mapping: DATATYPES_MAPPING };

// ---------------------------------------------------------------------------
// Helper: build a mock client covering the full preflight + invoke flow
// ---------------------------------------------------------------------------

function buildPreflightClient({
  datasetExt = "fastq",
  postSpy,
}: {
  datasetExt?: string;
  postSpy?: (path: string, init?: any) => void;
} = {}) {
  return mockClient({
    GET: (path: string, init?: any) => {
      if (path === "/api/workflows/{workflow_id}/download") {
        return { data: RUN_MODEL, response: { status: 200 } };
      }
      if (path === "/api/datatypes/types_and_mapping") {
        return { data: DATATYPES_COMBINED, response: { status: 200 } };
      }
      if (path === "/api/datasets/{dataset_id}") {
        return { data: { extension: datasetExt }, response: { status: 200 } };
      }
      return { error: "unexpected GET", response: { status: 500 } };
    },
    POST: (path: string, init?: any) => {
      postSpy?.(path, init);
      if (path === "/api/workflows/{workflow_id}/invocations") {
        return { data: INVOCATION_RESPONSE, response: { status: 200 } };
      }
      return { error: "unexpected POST", response: { status: 500 } };
    },
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("invoke_workflow op", () => {
  it("has the correct name, domain, and readOnly=false", () => {
    expect(invokeWorkflowOp.name).toBe("invoke_workflow");
    expect(invokeWorkflowOp.domain).toBe("workflows");
    expect(invokeWorkflowOp.readOnly).toBe(false);
  });

  // (a) no inputs -> skips preflight, POSTs directly
  it("skips preflight when no inputs supplied (no datasets or mapping GETs fired)", async () => {
    let datasetsGetCalled = false;
    let mappingGetCalled = false;
    let downloadGetCalled = false;
    const client = mockClient({
      GET: (path: string) => {
        if (path === "/api/datatypes/types_and_mapping") mappingGetCalled = true;
        if (path === "/api/datasets/{dataset_id}") datasetsGetCalled = true;
        if (path === "/api/workflows/{workflow_id}/download") downloadGetCalled = true;
        return { data: INVOCATION_RESPONSE, response: { status: 200 } };
      },
      POST: () => ({ data: INVOCATION_RESPONSE, response: { status: 200 } }),
    });
    const out = await invokeWorkflow({ workflowId: "wf1" }, ctxWith(client));
    expect(out.id).toBe("inv42");
    expect(datasetsGetCalled).toBe(false);
    expect(mappingGetCalled).toBe(false);
    expect(downloadGetCalled).toBe(false);
  });

  // (b) valid inputs -> enrich + validate pass -> POST with correct body shape
  it("runs preflight when inputs provided and POSTs with correct body shape", async () => {
    let capturedBody: any = null;
    let capturedPath = "";
    const client = buildPreflightClient({
      datasetExt: "fastq",
      postSpy: (path, init) => {
        capturedPath = path;
        capturedBody = init?.body;
      },
    });
    const out = await invokeWorkflow(
      {
        workflowId: "wf1",
        historyId: "h99",
        inputs: { "0": { src: "hda", id: "ds1" } },
        inputsBy: "step_index|step_uuid",
      },
      ctxWith(client),
    );
    expect(out.id).toBe("inv42");
    expect(capturedPath).toBe("/api/workflows/{workflow_id}/invocations");
    // The original inputs (without the enriched ext field) are passed to POST
    expect(capturedBody.inputs).toEqual({ "0": { src: "hda", id: "ds1" } });
    expect(capturedBody.history).toBe("hist_id=h99");
    expect(capturedBody.inputs_by).toBe("step_index|step_uuid");
  });

  // (c) rejecting input -> throws, NO POST fired
  it("throws GalaxyConnectionError and does NOT POST when inputs fail validation", async () => {
    let postCalled = false;
    const client = buildPreflightClient({
      datasetExt: "vcf", // fastq slot won't accept vcf
      postSpy: () => {
        postCalled = true;
      },
    });
    await expect(
      invokeWorkflow(
        {
          workflowId: "wf1",
          inputs: { "0": { src: "hda", id: "ds_bad" } },
        },
        ctxWith(client),
      ),
    ).rejects.toBeInstanceOf(GalaxyConnectionError);
    expect(postCalled).toBe(false);
  });

  // (d) history by name (no historyId) -> `history` = the name
  it("sets history to the name string when historyName is given without historyId", async () => {
    let capturedBody: any = null;
    const client = buildPreflightClient({
      postSpy: (_path, init) => {
        capturedBody = init?.body;
      },
    });
    await invokeWorkflow({ workflowId: "wf1", historyName: "My new history" }, ctxWith(client));
    expect(capturedBody.history).toBe("My new history");
  });

  it("omits history field when neither historyId nor historyName given", async () => {
    let capturedBody: any = null;
    const client = buildPreflightClient({
      postSpy: (_path, init) => {
        capturedBody = init?.body;
      },
    });
    await invokeWorkflow({ workflowId: "wf1" }, ctxWith(client));
    expect("history" in capturedBody).toBe(false);
  });

  it("project message includes workflowId and invocation id when present", () => {
    const msg = invokeWorkflowOp.project!({ id: "inv1", state: "scheduled" }, { workflowId: "wf42" });
    expect(msg.message).toContain("wf42");
    expect(msg.message).toContain("inv1");
  });

  it("project message omits invocation id when absent", () => {
    const msg = invokeWorkflowOp.project!({}, { workflowId: "wf42" });
    expect(msg.message).toContain("wf42");
    expect(msg.message).not.toContain("invocation");
  });

  // (e) HDCA enrichment -- collection show GET fires, enriched metadata drives validation
  describe("HDCA enrichment integration", () => {
    /** Workflow with a collection input slot (list:fastq). */
    const COLLECTION_WORKFLOW = {
      steps: {
        "0": {
          step_type: "data_collection_input",
          step_index: 0,
          step_label: "Input collection",
          uuid: "uuid-coll",
          inputs: [
            {
              extensions: ["fastq"],
              acceptable_extensions: ["fastq", "fastq.gz"],
              optional: false,
              collection_type: "list",
            },
          ],
        },
      },
    };

    function buildHdcaClient({
      collectionType = "list",
      elementExtensions = ["fastq"],
      postSpy,
      hdcaGetSpy,
    }: {
      collectionType?: string;
      elementExtensions?: string[];
      postSpy?: (path: string, init?: any) => void;
      hdcaGetSpy?: (path: string, init?: any) => void;
    } = {}) {
      return mockClient({
        GET: (path: string, init?: any) => {
          if (path === "/api/workflows/{workflow_id}/download") {
            return { data: COLLECTION_WORKFLOW, response: { status: 200 } };
          }
          if (path === "/api/datatypes/types_and_mapping") {
            return { data: DATATYPES_COMBINED, response: { status: 200 } };
          }
          if (path === "/api/dataset_collections/{hdca_id}") {
            hdcaGetSpy?.(path, init);
            const elements = elementExtensions.map((ext) => ({ object: { extension: ext } }));
            return {
              data: { collection_type: collectionType, elements },
              response: { status: 200 },
            };
          }
          return { error: "unexpected GET", response: { status: 500 } };
        },
        POST: (path: string, init?: any) => {
          postSpy?.(path, init);
          if (path === "/api/workflows/{workflow_id}/invocations") {
            return { data: INVOCATION_RESPONSE, response: { status: 200 } };
          }
          return { error: "unexpected POST", response: { status: 500 } };
        },
      });
    }

    it("fires the collection show GET via legacyGet path-param substitution", async () => {
      let hdcaGetPath: string | undefined;
      let hdcaGetInit: any;
      const client = buildHdcaClient({
        collectionType: "list",
        elementExtensions: ["fastq"],
        hdcaGetSpy: (path, init) => {
          hdcaGetPath = path;
          hdcaGetInit = init;
        },
      });
      await invokeWorkflow(
        { workflowId: "wf1", inputs: { "0": { src: "hdca", id: "coll1" } } },
        ctxWith(client),
      );
      expect(hdcaGetPath).toBe("/api/dataset_collections/{hdca_id}");
      expect(hdcaGetInit?.params?.path?.hdca_id).toBe("coll1");
    });

    it("type-mismatched collection (wrong collection_type) -> throws, no POST", async () => {
      let postCalled = false;
      // Slot expects collection_type "list"; supply "paired" to trigger a mismatch.
      // We also give a non-list collection_type in the enriched response so validation
      // can detect it via the collection_type field.
      const client = buildHdcaClient({
        collectionType: "paired",
        elementExtensions: ["fastq"],
        postSpy: () => { postCalled = true; },
      });
      await expect(
        invokeWorkflow(
          { workflowId: "wf1", inputs: { "0": { src: "hdca", id: "coll_bad" } } },
          ctxWith(client),
        ),
      ).rejects.toBeInstanceOf(GalaxyConnectionError);
      expect(postCalled).toBe(false);
    });

    it("compatible collection (matching collection_type) -> POST proceeds", async () => {
      let postCalled = false;
      const client = buildHdcaClient({
        collectionType: "list",
        elementExtensions: ["fastq"],
        postSpy: () => { postCalled = true; },
      });
      await invokeWorkflow(
        { workflowId: "wf1", inputs: { "0": { src: "hdca", id: "coll_good" } } },
        ctxWith(client),
      );
      expect(postCalled).toBe(true);
    });
  });

  it("preflight failure (slot resolve error) falls through to invoke, not abort", async () => {
    // If the slot resolution throws, we still POST
    let postCalled = false;
    const client = mockClient({
      GET: (path: string) => {
        if (path === "/api/workflows/{workflow_id}/download") {
          return { error: "not found", response: { status: 404 } };
        }
        return { error: "unexpected", response: { status: 500 } };
      },
      POST: () => {
        postCalled = true;
        return { data: INVOCATION_RESPONSE, response: { status: 200 } };
      },
    });
    // Providing inputs triggers the preflight, but slot resolution fails -> falls through
    const out = await invokeWorkflow(
      { workflowId: "wf1", inputs: { "0": { src: "hda", id: "ds1" } } },
      ctxWith(client),
    );
    expect(out.id).toBe("inv42");
    expect(postCalled).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// validateInputs unit tests (golden: valid -> no rejects; type mismatch -> reject)
// ---------------------------------------------------------------------------

describe("validateInputs", () => {
  const DATA_SLOT = {
    step_index: 0,
    step_uuid: "uuid-0",
    label: "Input reads",
    input_type: "data",
    src: "hda",
    accepted_formats: ["fastq"],
    acceptable_extensions: [] as string[],
    collection_type: null,
    parameter_type: null,
    optional: false,
    options: [],
  };

  const EMPTY_MAPPING = { ext_to_class_name: {}, class_to_classes: {} };

  it("returns no rejects for a valid hda input with matching ext", () => {
    const report = validateInputs(
      [DATA_SLOT],
      { "0": { src: "hda", id: "ds1", ext: "fastq" } },
      EMPTY_MAPPING,
    );
    expect(report.rejects).toHaveLength(0);
  });

  it("rejects when a data slot receives an hdca reference", () => {
    const report = validateInputs(
      [DATA_SLOT],
      { "0": { src: "hdca", id: "col1" } },
      EMPTY_MAPPING,
    );
    expect(report.rejects).toHaveLength(1);
    expect(report.rejects[0].step_index).toBe(0);
    expect(report.rejects[0].reason).toContain("hda");
  });

  it("rejects when datatype does not satisfy accepted formats (provable mismatch)", () => {
    // fastq slot, vcf supplied, and vcf's class ancestry doesn't include FastqSanger
    const mapping = {
      ext_to_class_name: { fastq: "FastqSanger", vcf: "Vcf" },
      class_to_classes: { FastqSanger: { FastqSanger: true }, Vcf: { Vcf: true } },
    };
    const report = validateInputs(
      [DATA_SLOT],
      { "0": { src: "hda", id: "ds1", ext: "vcf" } },
      mapping,
    );
    expect(report.rejects).toHaveLength(1);
    expect(report.rejects[0].reason).toContain("vcf");
    expect(report.rejects[0].reason).toContain("fastq");
  });

  it("warns but does not reject when ext is missing and slot has accepted_formats", () => {
    const report = validateInputs(
      [DATA_SLOT],
      { "0": { src: "hda", id: "ds1" } }, // no ext
      EMPTY_MAPPING,
    );
    expect(report.rejects).toHaveLength(0);
    expect(report.warnings.some((w) => w.message.includes("datatype"))).toBe(true);
  });

  it("rejects a parameter slot that receives a dataset reference", () => {
    const paramSlot = { ...DATA_SLOT, step_index: 1, input_type: "parameter", src: null };
    const report = validateInputs(
      [paramSlot],
      { "1": { src: "hda", id: "ds1" } },
      EMPTY_MAPPING,
    );
    expect(report.rejects).toHaveLength(1);
    expect(report.rejects[0].reason).toContain("scalar");
  });

  it("warns on a required slot that is not supplied", () => {
    const report = validateInputs([DATA_SLOT], {}, EMPTY_MAPPING);
    expect(report.rejects).toHaveLength(0);
    expect(report.warnings.some((w) => w.message.includes("Required"))).toBe(true);
  });

  it("does not warn on a missing optional slot", () => {
    const optSlot = { ...DATA_SLOT, optional: true };
    const report = validateInputs([optSlot], {}, EMPTY_MAPPING);
    expect(report.rejects).toHaveLength(0);
    expect(report.warnings.filter((w) => w.message.includes("Required"))).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// subtypeSatisfies unit tests
// ---------------------------------------------------------------------------

describe("subtypeSatisfies", () => {
  const MAPPING = {
    ext_to_class_name: { bed: "Bed", tabular: "Tabular", fastq: "FastqSanger", vcf: "Vcf" },
    class_to_classes: {
      Bed: { Bed: true, Tabular: true, Data: true },
      Tabular: { Tabular: true, Data: true },
      FastqSanger: { FastqSanger: true },
      Vcf: { Vcf: true },
    },
  };

  it("accepts any datatype when acceptedExts is empty", () => {
    expect(subtypeSatisfies("vcf", [], MAPPING)).toBe(true);
  });

  it("bed satisfies tabular (subtype relationship)", () => {
    expect(subtypeSatisfies("bed", ["tabular"], MAPPING)).toBe(true);
  });

  it("fastq does not satisfy tabular", () => {
    expect(subtypeSatisfies("fastq", ["tabular"], MAPPING)).toBe(false);
  });

  it("unknown supplied ext is treated permissively", () => {
    expect(subtypeSatisfies("unknown_ext", ["tabular"], MAPPING)).toBe(true);
  });

  it("unknown accepted ext is treated permissively", () => {
    expect(subtypeSatisfies("vcf", ["unknown_format"], MAPPING)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// getDatatypesMapping unit tests
// ---------------------------------------------------------------------------

describe("getDatatypesMapping", () => {
  it("returns the inner datatypes_mapping from the response", async () => {
    const client = mockClient({
      GET: () => ({ data: DATATYPES_COMBINED, response: { status: 200 } }),
    });
    const mapping = await getDatatypesMapping(ctxWith(client));
    expect(mapping.ext_to_class_name).toEqual(DATATYPES_MAPPING.ext_to_class_name);
    expect(mapping.class_to_classes).toEqual(DATATYPES_MAPPING.class_to_classes);
  });

  it("returns an empty mapping when the GET fails", async () => {
    const client = mockClient({
      GET: () => ({ error: "fail", response: { status: 500 } }),
    });
    const mapping = await getDatatypesMapping(ctxWith(client));
    expect(mapping.ext_to_class_name).toEqual({});
    expect(mapping.class_to_classes).toEqual({});
  });
});
