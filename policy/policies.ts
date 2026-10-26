/**
 * policies.ts — CrossGuard policy definitions (L4), kept separate from the PolicyPack so unit tests can import
 * them without starting the policy engine.
 *
 * Policies enforced:
 *   1. no-public-ip-without-approval  — GCE instances must not have external IPs
 *   2. require-resource-labels        — label-capable GCP resources need environment + managed_by labels
 *   3. allowed-machine-types          — GCE machine types restricted to an approved list
 *   4. no-public-bucket-access        — GCS buckets must enforce public access prevention
 *   5. require-bucket-versioning      — GCS buckets must enable versioning
 *
 * Every policy matches on the Pulumi type token (`args.type`). validateResourceOfType would need the whole
 * @pulumi/gcp SDK inside the policy pack just to compare a string, so it is deliberately not used.
 */

import { ResourceValidationPolicy } from "@pulumi/policy";

export const INSTANCE_TYPE = "gcp:compute/instance:Instance";
export const BUCKET_TYPE = "gcp:storage/bucket:Bucket";

// Types that have a `labels` property in GCP. Network and Subnetwork (VPC) cannot carry labels,
// so requiring labels on "every gcp: resource" would reject valid infrastructure.
export const LABELED_TYPES: ReadonlySet<string> = new Set([
  INSTANCE_TYPE,
  BUCKET_TYPE,
  "gcp:compute/disk:Disk",
  "gcp:compute/address:Address",
]);

// Approved machine types per tier
export const ALLOWED_MACHINE_TYPES: Record<string, string[]> = {
  dev: ["e2-micro", "e2-small"],
  staging: ["e2-micro", "e2-small", "e2-medium"],
  prod: ["e2-small", "e2-medium", "e2-standard-2", "e2-standard-4"],
};

// Machine type families that are never approved without an explicit exception
export const RESTRICTED_MACHINE_TYPES = ["n1-standard", "n2-standard", "c2-standard", "a2-"];

export const REQUIRED_LABELS = ["environment", "managed_by"];

interface InstanceProps {
  machineType?: string;
  labels?: Record<string, string>;
  networkInterfaces?: Array<{ accessConfigs?: unknown[]; ipv6AccessConfigs?: unknown[] }>;
}

interface BucketProps {
  publicAccessPrevention?: string;
  uniformBucketLevelAccess?: boolean;
  versioning?: { enabled?: boolean };
}

export const policies: ResourceValidationPolicy[] = [
  {
    name: "no-public-ip-without-approval",
    description: "GCE instances must not have external IPs unless the policy is relaxed to advisory.",
    enforcementLevel: "mandatory",
    validateResource: (args, reportViolation) => {
      if (args.type !== INSTANCE_TYPE) return;
      const props = args.props as InstanceProps;
      for (const nic of props.networkInterfaces ?? []) {
        if ((nic.accessConfigs ?? []).length > 0 || (nic.ipv6AccessConfigs ?? []).length > 0) {
          reportViolation(
            `Instance "${args.name}" has an external IP (accessConfigs present). ` +
              `Remove accessConfigs or request an advisory-level exception.`
          );
        }
      }
    },
  },

  {
    name: "require-resource-labels",
    description: `Label-capable GCP resources must have labels: ${REQUIRED_LABELS.join(", ")}.`,
    enforcementLevel: "mandatory",
    validateResource: (args, reportViolation) => {
      if (!LABELED_TYPES.has(args.type)) return;
      const labels = (args.props as { labels?: Record<string, string> }).labels ?? {};
      for (const required of REQUIRED_LABELS) {
        if (!labels[required]) {
          reportViolation(`Resource "${args.name}" (${args.type}) is missing required label "${required}".`);
        }
      }
    },
  },

  {
    name: "allowed-machine-types",
    description: "GCE instances must use approved machine types. High-cost types require approval.",
    enforcementLevel: "advisory",
    validateResource: (args, reportViolation) => {
      if (args.type !== INSTANCE_TYPE) return;
      const props = args.props as InstanceProps;
      const machineType = props.machineType ?? "";
      const environment = props.labels?.environment ?? "dev";

      if (RESTRICTED_MACHINE_TYPES.some((prefix) => machineType.startsWith(prefix))) {
        reportViolation(
          `Instance "${args.name}" uses restricted machine type "${machineType}". ` +
            `High-performance types require explicit approval.`
        );
        return;
      }

      const allowed = ALLOWED_MACHINE_TYPES[environment] ?? ALLOWED_MACHINE_TYPES["dev"];
      if (!allowed.includes(machineType)) {
        reportViolation(
          `Instance "${args.name}" uses machine type "${machineType}" ` +
            `which is not in the allowed list for environment "${environment}": [${allowed.join(", ")}].`
        );
      }
    },
  },

  {
    name: "no-public-bucket-access",
    description: "GCS buckets must enforce public access prevention and uniform bucket-level access.",
    enforcementLevel: "mandatory",
    validateResource: (args, reportViolation) => {
      if (args.type !== BUCKET_TYPE) return;
      const props = args.props as BucketProps;
      if (props.publicAccessPrevention !== "enforced") {
        reportViolation(
          `Bucket "${args.name}" does not enforce publicAccessPrevention. Set publicAccessPrevention = "enforced".`
        );
      }
      if (!props.uniformBucketLevelAccess) {
        reportViolation(`Bucket "${args.name}" must enable uniformBucketLevelAccess = true.`);
      }
    },
  },

  {
    name: "require-bucket-versioning",
    description: "GCS buckets must enable object versioning.",
    enforcementLevel: "advisory",
    validateResource: (args, reportViolation) => {
      if (args.type !== BUCKET_TYPE) return;
      if (!(args.props as BucketProps).versioning?.enabled) {
        reportViolation(`Bucket "${args.name}" does not have versioning enabled. Set versioning.enabled = true.`);
      }
    },
  },
];
