import { describe, expect, it } from "vitest";
import { ResourceValidationArgs } from "@pulumi/policy";
import { policies } from "../policies";

/** Run one named policy against a fake resource and return the violation messages it reports. */
function run(policyName: string, type: string, props: Record<string, unknown>, name = "res"): string[] {
  const policy = policies.find((p) => p.name === policyName);
  if (!policy || !("validateResource" in policy)) throw new Error(`no resource policy ${policyName}`);
  const validators = [policy.validateResource].flat();
  const violations: string[] = [];
  const args = { type, name, props, urn: `urn:pulumi:s::p::${type}::${name}` } as unknown as ResourceValidationArgs;
  for (const validate of validators) {
    validate?.(args, (message) => violations.push(message));
  }
  return violations;
}

const instance = "gcp:compute/instance:Instance";
const bucket = "gcp:storage/bucket:Bucket";
const goodLabels = { environment: "dev", managed_by: "pulumi" };

describe("no-public-ip-without-approval", () => {
  it("rejects an instance with an external IP", () => {
    const v = run("no-public-ip-without-approval", instance, { networkInterfaces: [{ accessConfigs: [{}] }] });
    expect(v).toHaveLength(1);
    expect(v[0]).toContain("external IP");
  });
  it("accepts a private-only instance", () => {
    expect(run("no-public-ip-without-approval", instance, { networkInterfaces: [{ subnetwork: "s" }] })).toEqual([]);
  });
  it("ignores other resource types", () => {
    expect(run("no-public-ip-without-approval", bucket, { networkInterfaces: [{ accessConfigs: [{}] }] })).toEqual([]);
  });
});

describe("require-resource-labels", () => {
  it("rejects a labelable resource without labels", () => {
    expect(run("require-resource-labels", instance, {})).toHaveLength(2);
  });
  it("rejects a bucket missing managed_by", () => {
    const v = run("require-resource-labels", bucket, { labels: { environment: "dev" } });
    expect(v).toHaveLength(1);
    expect(v[0]).toContain("managed_by");
  });
  it("accepts a labelled instance", () => {
    expect(run("require-resource-labels", instance, { labels: goodLabels })).toEqual([]);
  });
  it("does not block a VPC or subnetwork, which cannot carry labels", () => {
    expect(run("require-resource-labels", "gcp:compute/network:Network", {})).toEqual([]);
    expect(run("require-resource-labels", "gcp:compute/subnetwork:Subnetwork", {})).toEqual([]);
  });
});

describe("allowed-machine-types", () => {
  it("rejects a restricted family", () => {
    expect(run("allowed-machine-types", instance, { machineType: "n2-standard-8", labels: goodLabels })).toHaveLength(1);
  });
  it("rejects a type outside the environment allowlist", () => {
    expect(run("allowed-machine-types", instance, { machineType: "e2-medium", labels: goodLabels })).toHaveLength(1);
  });
  it("accepts an approved type", () => {
    expect(run("allowed-machine-types", instance, { machineType: "e2-micro", labels: goodLabels })).toEqual([]);
    expect(
      run("allowed-machine-types", instance, { machineType: "e2-medium", labels: { ...goodLabels, environment: "prod" } })
    ).toEqual([]);
  });
});

describe("no-public-bucket-access", () => {
  it("rejects a bucket that does not enforce public access prevention", () => {
    expect(run("no-public-bucket-access", bucket, { uniformBucketLevelAccess: true })).toHaveLength(1);
  });
  it("rejects a bucket without uniform access", () => {
    expect(run("no-public-bucket-access", bucket, { publicAccessPrevention: "enforced" })).toHaveLength(1);
  });
  it("accepts a locked-down bucket", () => {
    expect(
      run("no-public-bucket-access", bucket, { publicAccessPrevention: "enforced", uniformBucketLevelAccess: true })
    ).toEqual([]);
  });
});

describe("require-bucket-versioning", () => {
  it("rejects an unversioned bucket", () => {
    expect(run("require-bucket-versioning", bucket, {})).toHaveLength(1);
  });
  it("accepts a versioned bucket", () => {
    expect(run("require-bucket-versioning", bucket, { versioning: { enabled: true } })).toEqual([]);
  });
});
