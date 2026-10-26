/**
 * provider.ts — Custom Pulumi dynamic provider (MAX level)
 *
 * Implements a dynamic provider that manages a hypothetical "GcpTagPolicy"
 * resource. It talks to an in-memory fake API (see InMemoryTagPolicyApi); swap that for HTTP calls to go live.
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
export interface GcpTagPolicyState {
  parent: string;
  tagKeyShortName: string;
  allowedValues: string[];
  description: string;
  // Computed by the provider
  tagKeyId: string;
  createTime: string;
  updateTime: string;
}

// ─── In-memory API client ─────────────────────────────────────────────────────

/**
 * Stands in for the real REST API (the Cloud Resource Manager v3 tagKeys API). It keeps resources in memory so the
 * provider's create/read/update/delete lifecycle is real and testable without credentials. To manage a real API,
 * replace the bodies of these four methods with HTTP calls (e.g. with google-auth-library); nothing else changes.
 */
export class InMemoryTagPolicyApi {
  private readonly store = new Map<string, GcpTagPolicyState>();
  private seq = 0;

  async create(input: GcpTagPolicyState): Promise<{ id: string; createTime: string }> {
    const id = `tagKeys/${++this.seq}`;
    const createTime = new Date().toISOString();
    this.store.set(id, { ...input, tagKeyId: id, createTime, updateTime: createTime });
    return { id, createTime };
  }

  async read(id: string): Promise<GcpTagPolicyState | undefined> {
    return this.store.get(id);
  }

  async update(id: string, patch: Partial<GcpTagPolicyState>): Promise<{ updateTime: string }> {
    const current = this.store.get(id);
    if (!current) throw new Error(`tag key ${id} not found`);
    const updateTime = new Date().toISOString();
    this.store.set(id, { ...current, ...patch, updateTime });
    return { updateTime };
  }

  async delete(id: string): Promise<void> {
    this.store.delete(id);
  }
}

export const apiClient = new InMemoryTagPolicyApi();

// ─── Dynamic Resource Provider ────────────────────────────────────────────────

export const gcpTagPolicyProvider: pulumi.dynamic.ResourceProvider = {
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
      // Resource gone externally — an undefined id tells Pulumi to drop it from state
      return { id: undefined, props: undefined };
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
