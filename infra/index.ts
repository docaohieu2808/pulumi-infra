import * as pulumi from "@pulumi/pulumi";
import { GcpNetwork } from "./components/gcp-network";
import { GcpCompute } from "./components/gcp-compute";
import { GcpStorage } from "./components/gcp-storage";

// --- Config ---
const config = new pulumi.Config();
const gcpConfig = new pulumi.Config("gcp");

const project = gcpConfig.require("project");
const region = gcpConfig.get("region") ?? "us-central1";
const zone = `${region}-a`;
const environment = config.get("environment") ?? "dev";
const machineType = config.get("machineType") ?? "e2-micro";
const instanceCount = config.getNumber("instanceCount") ?? 1;

// --- L2: Network component ---
const network = new GcpNetwork("main", {
  project,
  region,
  environment,
  cidrRange: "10.0.0.0/24",
});

// --- L2: Compute component (uses network output via stack reference pattern) ---
const compute = new GcpCompute(
  "app",
  {
    project,
    zone,
    environment,
    machineType,
    subnetId: network.subnetId,
    instanceCount,
    diskSizeGb: 20,
  },
  { dependsOn: [network.network, network.subnet] }
);

// --- L2: Storage component ---
const storage = new GcpStorage("artifacts", {
  project,
  location: region.toUpperCase(),
  environment,
  storageClass: "STANDARD",
  retentionDays: 90,
  versioning: true,
});

// --- Stack outputs (L1 pattern) ---
export const networkId = network.networkId;
export const subnetId = network.subnetId;
export const instanceIds = compute.instanceIds;
export const internalIps = compute.internalIps;
export const bucketName = storage.bucketName;
export const bucketUrl = storage.bucketUrl;
export const stackEnvironment = environment;
