/**
 * provider.ts — Custom Pulumi Provider Skeleton (MAX level)
 *
 * Implements a dynamic provider that manages a hypothetical "GcpTagPolicy"
 * resource — a custom organization tag policy not natively in @pulumi/gcp.
 *
 * Pattern: pulumi.dynamic.Resource + pulumi.dynamic.ResourceProvider
 *
 * CRUD lifecycle:
 *   create  → POST to external API / GCP API
 *   read    → GET current state (for refresh/import)
 *   update  → PATCH changed properties
 *   delete  → DELETE the resource
 *   diff    → determine what changed (optional, defaults to replace-on-change)
 *   check   → validate inputs before create/update
 */

import * as pulumi from "@pulumi/pulumi";

// ─── Resource Inputs ──────────────────────────────────────────────────────────

export interface GcpTagPolicyInputs {
  /** GCP organization or project ID that owns this tag policy */
  parent: pulumi.Input<string>;
  /** Tag key short name (e.g. "cost-center") */
  tagKeyShortName: pulumi.Input<string>;
  /** Allowed tag values */
  allowedValues: pulumi.Input<string[]>;
  /** Human-readable description */
  description?: pulumi.Input<string>;
}

// Properties stored in state after create (includes computed fields)
interface GcpTagPolicyState {
  parent: string;
  tagKeyShortName: string;
  allowedValues: string[];
  description: string;
  // Computed by the provider
  tagKeyId: string;
  createTime: string;
  updateTime: string;
}

// ─── Simulated API Client ─────────────────────────────────────────────────────

/** Simulates calls to a REST API (replace with actual GCP Tag API calls). */
class TagPolicyApiClient {
  private readonly baseUrl = "https://cloudresourcemanager.googleapis.com/v3";

  async create(input: GcpTagPolicyState): Promise<{ id: string; createTime: string }> {
    // TODO: replace with actual HTTP call using google-auth-library
    pulumi.log.info(`[custom-provider] CREATE tag key: ${input.tagKeyShortName} on ${input.parent}`);
    const id = `tagKeys/${input.parent.replace("/", "-")}-${input.tagKeyShortName}-${Date.now()}`;
    return { id, createTime: new Date().toISOString() };
  }

  async read(id: string): Promise<GcpTagPolicyState | null> {
    pulumi.log.info(`[custom-provider] READ tag key: ${id}`);
    // TODO: GET ${this.baseUrl}/${id}
    return null; // null means resource not found (triggers replacement)
  }

  async update(id: string, patch: Partial<GcpTagPolicyState>): Promise<{ updateTime: string }> {
    pulumi.log.info(`[custom-provider] UPDATE tag key: ${id}`);
    // TODO: PATCH ${this.baseUrl}/${id}
    return { updateTime: new Date().toISOString() };
  }

  async delete(id: string): Promise<void> {
    pulumi.log.info(`[custom-provider] DELETE tag key: ${id}`);
    // TODO: DELETE ${this.baseUrl}/${id}
  }
}

const apiClient = new TagPolicyApiClient();

// ─── Dynamic Resource Provider ────────────────────────────────────────────────

const gcpTagPolicyProvider: pulumi.dynamic.ResourceProvider = {
  /**
   * check: validate inputs before create or update.
   * Returns { inputs } if valid, or throws with failures list.
   */
  async check(
    _olds: GcpTagPolicyState,
    news: GcpTagPolicyState
  ): Promise<pulumi.dynamic.CheckResult> {
    const failures: pulumi.dynamic.CheckFailure[] = [];

    if (!news.parent || news.parent.trim() === "") {
      failures.push({ property: "parent", reason: "parent must not be empty" });
    }
    if (!news.tagKeyShortName || !/^[a-z][a-z0-9-]{0,62}$/.test(news.tagKeyShortName)) {
      failures.push({
        property: "tagKeyShortName",
        reason: "tagKeyShortName must match ^[a-z][a-z0-9-]{0,62}$",
      });
    }
    if (!news.allowedValues || news.allowedValues.length === 0) {
      failures.push({
        property: "allowedValues",
        reason: "allowedValues must contain at least one value",
      });
    }

    return { inputs: news, failures };
  },

  /**
   * diff: compare old vs new state to decide update vs replace.
   */
  async diff(
    _id: string,
    olds: GcpTagPolicyState,
    news: GcpTagPolicyState
  ): Promise<pulumi.dynamic.DiffResult> {
    const replaces: string[] = [];
    const changes: string[] = [];

    // Changing parent or tagKeyShortName requires replacement
    if (olds.parent !== news.parent) replaces.push("parent");
    if (olds.tagKeyShortName !== news.tagKeyShortName) replaces.push("tagKeyShortName");

    // allowedValues and description can be updated in-place
    if (JSON.stringify(olds.allowedValues) !== JSON.stringify(news.allowedValues)) {
      changes.push("allowedValues");
    }
    if (olds.description !== news.description) {
      changes.push("description");
    }

    return {
      changes: changes.length > 0 || replaces.length > 0,
      replaces,
      deleteBeforeReplace: replaces.length > 0,
    };
  },

  /**
   * create: provision the resource and return its ID + initial state.
   */
  async create(inputs: GcpTagPolicyState): Promise<pulumi.dynamic.CreateResult> {
    const { id, createTime } = await apiClient.create(inputs);

    return {
      id,
      outs: {
        ...inputs,
        tagKeyId: id,
        createTime,
        updateTime: createTime,
      } satisfies GcpTagPolicyState,
    };
  },

  /**
   * read: refresh state from the real API (used by pulumi refresh / import).
   */
  async read(id: string, props: GcpTagPolicyState): Promise<pulumi.dynamic.ReadResult> {
    const state = await apiClient.read(id);
    if (!state) {
      // Resource gone externally — return empty to signal deletion
      return { id, props: {} };
    }
    return { id, props: state };
  },

  /**
   * update: apply in-place changes (no replacement needed).
   */
  async update(
    id: string,
    olds: GcpTagPolicyState,
    news: GcpTagPolicyState
  ): Promise<pulumi.dynamic.UpdateResult> {
    const { updateTime } = await apiClient.update(id, {
      allowedValues: news.allowedValues,
      description: news.description,
    });

    return {
      outs: {
        ...olds,
        allowedValues: news.allowedValues,
        description: news.description ?? olds.description,
        updateTime,
      } satisfies GcpTagPolicyState,
    };
  },

  /**
   * delete: tear down the resource.
   */
  async delete(id: string, _props: GcpTagPolicyState): Promise<void> {
    await apiClient.delete(id);
  },
};

// ─── Resource Class (public API) ──────────────────────────────────────────────

/**
 * GcpTagPolicy: custom Pulumi resource managing a GCP organization tag policy.
 *
 * Example usage in a Pulumi program:
 *   const policy = new GcpTagPolicy("cost-center-policy", {
 *     parent: "organizations/123456789",
 *     tagKeyShortName: "cost-center",
 *     allowedValues: ["engineering", "marketing", "ops"],
 *     description: "Cost center tag for billing allocation",
 *   });
 *   export const tagKeyId = policy.tagKeyId;
 */
export class GcpTagPolicy extends pulumi.dynamic.Resource {
  /** The GCP tag key resource ID, e.g. tagKeys/123456 */
  public readonly tagKeyId!: pulumi.Output<string>;
  /** ISO8601 timestamp of when the tag key was created */
  public readonly createTime!: pulumi.Output<string>;
  /** ISO8601 timestamp of the last update */
  public readonly updateTime!: pulumi.Output<string>;
  /** The parent org/project */
  public readonly parent!: pulumi.Output<string>;
  /** Short name of the tag key */
  public readonly tagKeyShortName!: pulumi.Output<string>;
  /** List of allowed tag values */
  public readonly allowedValues!: pulumi.Output<string[]>;

  constructor(
    name: string,
    args: GcpTagPolicyInputs,
    opts?: pulumi.CustomResourceOptions
  ) {
    super(
      gcpTagPolicyProvider,
      name,
      {
        // Computed outputs start undefined; provider fills them in
        tagKeyId: undefined,
        createTime: undefined,
        updateTime: undefined,
        description: args.description ?? "",
        ...args,
      },
      opts
    );
  }
}

// ─── Example usage (runs when executed directly, not when imported) ───────────

if (require.main === module) {
  // This block is for illustration only — in real use, import GcpTagPolicy
  // into your Pulumi program's index.ts.
  console.log("GcpTagPolicy custom provider loaded.");
  console.log("Import GcpTagPolicy from this module in your Pulumi program.");
  console.log("Example:");
  console.log('  import { GcpTagPolicy } from "./custom-provider/provider";');
  console.log('  const p = new GcpTagPolicy("my-policy", {');
  console.log('    parent: "organizations/123456789",');
  console.log('    tagKeyShortName: "cost-center",');
  console.log('    allowedValues: ["eng", "ops"],');
  console.log("  });");
}
