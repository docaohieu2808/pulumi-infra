/**
 * index.ts — Pulumi CrossGuard Policy Pack (L4)
 *
 * Policies enforced:
 *   1. no-public-ip-without-approval  — GCE instances must not have external IPs
 *   2. require-resource-labels        — All resources must have environment + managed_by labels
 *   3. allowed-machine-types          — GCE machine types restricted to approved list
 *   4. no-public-bucket-access        — GCS buckets must enforce public access prevention
 *   5. require-bucket-versioning      — GCS buckets must enable versioning
 */

import { PolicyPack, validateResourceOfType } from "@pulumi/policy";

// Approved machine types per tier
const ALLOWED_MACHINE_TYPES: Record<string, string[]> = {
  dev: ["e2-micro", "e2-small"],
  staging: ["e2-micro", "e2-small", "e2-medium"],
  prod: ["e2-small", "e2-medium", "e2-standard-2", "e2-standard-4"],
};

// Machine types that always require manual approval
const RESTRICTED_MACHINE_TYPES = [
  "n1-standard",
  "n2-standard",
  "c2-standard",
  "a2-",
];

const REQUIRED_LABELS = ["environment", "managed_by"];

new PolicyPack("gcp-infra-policies", {
  policies: [
    // ─── Policy 1: No public IP without approval ───────────────────────────
    {
      name: "no-public-ip-without-approval",
      description:
        "GCE instances must not have external IPs unless explicitly approved via enforcement level.",
      enforcementLevel: "mandatory",
      validateResource: validateResourceOfType(
        // Use generic resource type string matching since @pulumi/gcp types
        // are not available in the policy pack's own dependencies.
        // The resource type is checked via the URN type token.
        {} as any,
        (instance: any, args, reportViolation) => {
          // Only apply to gcp:compute/instance:Instance
          if (args.type !== "gcp:compute/instance:Instance") return;

          const networkInterfaces: any[] = instance.networkInterfaces ?? [];
          for (const nic of networkInterfaces) {
            const accessConfigs: any[] = nic.accessConfigs ?? [];
            if (accessConfigs.length > 0) {
              reportViolation(
                `Instance "${args.name}" has an external IP (accessConfigs present). ` +
                  `Remove accessConfigs or request an advisory-level exception.`
              );
            }
          }
        }
      ),
    },

    // ─── Policy 2: Require resource labels ────────────────────────────────
    {
      name: "require-resource-labels",
      description: `All GCP resources must have labels: ${REQUIRED_LABELS.join(", ")}.`,
      enforcementLevel: "mandatory",
      validateResource(args, reportViolation) {
        // Only check GCP resources (type prefix gcp:)
        if (!args.type.startsWith("gcp:")) return;

        const labels: Record<string, string> =
          (args.props as any)?.labels ?? {};

        for (const required of REQUIRED_LABELS) {
          if (!labels[required]) {
            reportViolation(
              `Resource "${args.name}" (${args.type}) is missing required label "${required}".`
            );
          }
        }
      },
    },

    // ─── Policy 3: Allowed machine types ──────────────────────────────────
    {
      name: "allowed-machine-types",
      description:
        "GCE instances must use approved machine types. High-cost types require approval.",
      enforcementLevel: "advisory",
      validateResource(args, reportViolation) {
        if (args.type !== "gcp:compute/instance:Instance") return;

        const machineType: string = (args.props as any)?.machineType ?? "";
        const environment: string =
          (args.props as any)?.labels?.environment ?? "dev";

        // Check for always-restricted types
        const isRestricted = RESTRICTED_MACHINE_TYPES.some((prefix) =>
          machineType.startsWith(prefix)
        );
        if (isRestricted) {
          reportViolation(
            `Instance "${args.name}" uses restricted machine type "${machineType}". ` +
              `High-performance types require explicit approval.`
          );
          return;
        }

        // Check against per-environment allowlist
        const allowed = ALLOWED_MACHINE_TYPES[environment] ?? ALLOWED_MACHINE_TYPES["dev"];
        if (!allowed.includes(machineType)) {
          reportViolation(
            `Instance "${args.name}" uses machine type "${machineType}" ` +
              `which is not in the allowed list for environment "${environment}": [${allowed.join(", ")}].`
          );
        }
      },
    },

    // ─── Policy 4: No public bucket access ────────────────────────────────
    {
      name: "no-public-bucket-access",
      description:
        "GCS buckets must enforce public access prevention (no public ACLs).",
      enforcementLevel: "mandatory",
      validateResource(args, reportViolation) {
        if (args.type !== "gcp:storage/bucket:Bucket") return;

        const prevention: string =
          (args.props as any)?.publicAccessPrevention ?? "";
        if (prevention !== "enforced") {
          reportViolation(
            `Bucket "${args.name}" does not enforce publicAccessPrevention. ` +
              `Set publicAccessPrevention = "enforced".`
          );
        }

        const uniformAccess: boolean =
          (args.props as any)?.uniformBucketLevelAccess ?? false;
        if (!uniformAccess) {
          reportViolation(
            `Bucket "${args.name}" must enable uniformBucketLevelAccess = true.`
          );
        }
      },
    },

    // ─── Policy 5: Require bucket versioning ──────────────────────────────
    {
      name: "require-bucket-versioning",
      description: "GCS buckets must enable object versioning.",
      enforcementLevel: "advisory",
      validateResource(args, reportViolation) {
        if (args.type !== "gcp:storage/bucket:Bucket") return;

        const versioning: any = (args.props as any)?.versioning;
        const enabled: boolean = versioning?.enabled ?? false;
        if (!enabled) {
          reportViolation(
            `Bucket "${args.name}" does not have versioning enabled. ` +
              `Set versioning.enabled = true.`
          );
        }
      },
    },
  ],
});
