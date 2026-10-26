import * as gcp from "@pulumi/gcp";

// Violates no-public-ip-without-approval (accessConfigs), require-resource-labels (no labels)
// and allowed-machine-types (restricted family).
new gcp.compute.Instance("public-vm", {
  zone: "us-central1-a",
  machineType: "n2-standard-8",
  bootDisk: { initializeParams: { image: "debian-cloud/debian-12" } },
  networkInterfaces: [{ network: "default", accessConfigs: [{}] }],
});

// Violates no-public-bucket-access (no publicAccessPrevention, no uniform access) and require-resource-labels.
new gcp.storage.Bucket("open-bucket", { location: "US" });
