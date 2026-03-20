import * as pulumi from "@pulumi/pulumi";
import * as gcp from "@pulumi/gcp";

export interface GcpStorageArgs {
  project: pulumi.Input<string>;
  location: pulumi.Input<string>;
  environment: pulumi.Input<string>;
  /** Storage class: STANDARD | NEARLINE | COLDLINE | ARCHIVE */
  storageClass?: pulumi.Input<string>;
  /** Retention in days for lifecycle rule */
  retentionDays?: number;
  /** Enable versioning */
  versioning?: boolean;
}

/**
 * GcpStorage: reusable ComponentResource for a GCS bucket with
 * versioning, lifecycle rules, and uniform bucket-level access enforced.
 */
export class GcpStorage extends pulumi.ComponentResource {
  public readonly bucket: gcp.storage.Bucket;
  public readonly bucketName: pulumi.Output<string>;
  public readonly bucketUrl: pulumi.Output<string>;

  constructor(
    name: string,
    args: GcpStorageArgs,
    opts?: pulumi.ComponentResourceOptions
  ) {
    super("custom:gcp:Storage", name, {}, opts);

    const childOpts = { parent: this };

    this.bucket = new gcp.storage.Bucket(
      `${name}-bucket`,
      {
        name: pulumi.interpolate`${args.project}-${args.environment}-${name}`,
        project: args.project,
        location: args.location,
        storageClass: args.storageClass ?? "STANDARD",
        uniformBucketLevelAccess: true,
        // Prevent public access
        publicAccessPrevention: "enforced",
        versioning: {
          enabled: args.versioning ?? true,
        },
        lifecycleRules:
          args.retentionDays != null
            ? [
                {
                  condition: {
                    age: args.retentionDays,
                    withState: "ARCHIVED",
                  },
                  action: { type: "Delete" },
                },
              ]
            : [],
        labels: {
          environment: args.environment as string,
          managed_by: "pulumi",
        },
      },
      childOpts
    );

    this.bucketName = this.bucket.name;
    this.bucketUrl = this.bucket.url;

    this.registerOutputs({
      bucketName: this.bucketName,
      bucketUrl: this.bucketUrl,
    });
  }
}
