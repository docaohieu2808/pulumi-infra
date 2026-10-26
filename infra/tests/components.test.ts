/**
 * Unit tests for the components, using Pulumi's mock runtime: no cloud, no credentials, no engine.
 * The mocks record every resource the program registers, then the tests assert on their inputs.
 */
import { beforeAll, describe, expect, it } from "vitest";
import * as pulumi from "@pulumi/pulumi";

interface Registered {
  type: string;
  name: string;
  inputs: Record<string, any>;
}
const registered: Registered[] = [];

pulumi.runtime.setMocks(
  {
    newResource: (args) => {
      registered.push({ type: args.type, name: args.name, inputs: args.inputs });
      return {
        id: `${args.name}-id`,
        state: {
          ...args.inputs,
          selfLink: `https://example.invalid/${args.name}`,
          url: `gs://${args.inputs.name ?? args.name}`,
          networkInterfaces: [{ ...(args.inputs.networkInterfaces?.[0] ?? {}), networkIp: "10.0.0.5" }],
        },
      };
    },
    call: (args) => args.inputs,
  },
  "gcp-infra-test",
  "test",
  false
);

const ofType = (type: string) => registered.filter((r) => r.type === type);
const promise = <T>(o: pulumi.Output<T>) => new Promise<T>((resolve) => o.apply(resolve));

let network: import("../components/gcp-network").GcpNetwork;
let compute: import("../components/gcp-compute").GcpCompute;
let storage: import("../components/gcp-storage").GcpStorage;

beforeAll(async () => {
  // Components must be imported after setMocks.
  const { GcpNetwork } = await import("../components/gcp-network");
  const { GcpCompute } = await import("../components/gcp-compute");
  const { GcpStorage } = await import("../components/gcp-storage");
  network = new GcpNetwork("main", { project: "demo", region: "us-central1", environment: "dev" });
  compute = new GcpCompute("app", {
    project: "demo",
    zone: "us-central1-a",
    environment: "dev",
    machineType: "e2-micro",
    subnetId: network.subnetId,
    instanceCount: 2,
  });
  storage = new GcpStorage("artifacts", {
    project: "demo",
    location: "US-CENTRAL1",
    environment: "dev",
    retentionDays: 90,
  });
  // Resource registration is asynchronous (the instances wait for the subnet id): wait for every output.
  await Promise.all([
    promise(network.networkId),
    promise(pulumi.all(compute.instanceIds)),
    promise(storage.bucketName),
  ]);
  // Let the remaining registrations (router, NAT, firewall) finish.
  await new Promise((resolve) => setTimeout(resolve, 100));
});

describe("GcpNetwork", () => {
  it("creates a custom-mode VPC (no auto subnets) and one private-Google-access subnet", async () => {
    const [vpc] = ofType("gcp:compute/network:Network");
    expect(vpc.inputs.autoCreateSubnetworks).toBe(false);
    const [subnet] = ofType("gcp:compute/subnetwork:Subnetwork");
    expect(subnet.inputs.privateIpGoogleAccess).toBe(true);
    expect(subnet.inputs.ipCidrRange).toBe("10.0.0.0/24");
    expect(await promise(network.networkId)).toBe("main-vpc-id");
  });

  it("gives private VMs egress through Cloud NAT and SSH only through IAP", () => {
    const [nat] = ofType("gcp:compute/routerNat:RouterNat");
    expect(nat.inputs.natIpAllocateOption).toBe("AUTO_ONLY");
    const [fw] = ofType("gcp:compute/firewall:Firewall");
    expect(fw.inputs.sourceRanges).toEqual(["35.235.240.0/20"]);
    expect(fw.inputs.allows).toEqual([{ protocol: "tcp", ports: ["22"] }]);
  });
});

describe("GcpCompute", () => {
  it("creates the requested number of instances", () => {
    expect(ofType("gcp:compute/instance:Instance")).toHaveLength(2);
    expect(compute.instances).toHaveLength(2);
  });

  it("gives every instance a private-only NIC", () => {
    for (const { inputs } of ofType("gcp:compute/instance:Instance")) {
      expect(inputs.networkInterfaces).toHaveLength(1);
      expect(inputs.networkInterfaces[0].accessConfigs).toBeUndefined();
    }
  });

  it("labels instances and enables shielded VM and OS Login", () => {
    for (const { inputs } of ofType("gcp:compute/instance:Instance")) {
      expect(inputs.labels).toMatchObject({ environment: "dev", managed_by: "pulumi" });
      expect(inputs.shieldedInstanceConfig).toEqual({
        enableSecureBoot: true,
        enableVtpm: true,
        enableIntegrityMonitoring: true,
      });
      expect(inputs.metadata.enable_oslogin).toBe("TRUE");
    }
  });

  it("exposes the internal IPs", async () => {
    expect(await promise(pulumi.all(compute.internalIps))).toEqual(["10.0.0.5", "10.0.0.5"]);
  });
});

describe("GcpStorage", () => {
  it("locks the bucket down and turns on versioning", () => {
    const [b] = ofType("gcp:storage/bucket:Bucket");
    expect(b.inputs.publicAccessPrevention).toBe("enforced");
    expect(b.inputs.uniformBucketLevelAccess).toBe(true);
    expect(b.inputs.versioning).toEqual({ enabled: true });
    expect(b.inputs.labels).toMatchObject({ environment: "dev", managed_by: "pulumi" });
  });

  it("deletes archived objects after the retention period", () => {
    const [b] = ofType("gcp:storage/bucket:Bucket");
    expect(b.inputs.lifecycleRules).toEqual([
      { condition: { age: 90, withState: "ARCHIVED" }, action: { type: "Delete" } },
    ]);
    expect(storage.bucket).toBeDefined();
  });
});
