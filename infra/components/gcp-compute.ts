import * as pulumi from "@pulumi/pulumi";
import * as gcp from "@pulumi/gcp";

export interface GcpComputeArgs {
  project: pulumi.Input<string>;
  zone: pulumi.Input<string>;
  environment: pulumi.Input<string>;
  machineType: pulumi.Input<string>;
  subnetId: pulumi.Input<string>;
  instanceCount?: number;
  /** Boot disk size in GB */
  diskSizeGb?: pulumi.Input<number>;
  imageFamily?: pulumi.Input<string>;
  imageProject?: pulumi.Input<string>;
}

/**
 * GcpCompute: reusable ComponentResource for one or more GCE instances.
 * Enforces no external IP (private-only) and required labels.
 */
export class GcpCompute extends pulumi.ComponentResource {
  public readonly instances: gcp.compute.Instance[];
  public readonly instanceIds: pulumi.Output<string>[];
  public readonly internalIps: pulumi.Output<string>[];

  constructor(
    name: string,
    args: GcpComputeArgs,
    opts?: pulumi.ComponentResourceOptions
  ) {
    super("custom:gcp:Compute", name, {}, opts);

    const childOpts = { parent: this };
    const count = args.instanceCount ?? 1;

    this.instances = [];
    this.instanceIds = [];
    this.internalIps = [];

    for (let i = 0; i < count; i++) {
      const instance = new gcp.compute.Instance(
        `${name}-instance-${i}`,
        {
          name: pulumi.interpolate`${args.environment}-${name}-${i}`,
          project: args.project,
          zone: args.zone,
          machineType: args.machineType,
          labels: {
            environment: args.environment as string,
            managed_by: "pulumi",
            component: name,
          },
          bootDisk: {
            initializeParams: {
              image: pulumi.interpolate`${args.imageProject ?? "debian-cloud"}/${args.imageFamily ?? "debian-12"}`,
              size: args.diskSizeGb ?? 20,
            },
          },
          networkInterfaces: [
            {
              subnetwork: args.subnetId,
              // No accessConfigs = no external IP (policy-compliant)
            },
          ],
          shieldedInstanceConfig: {
            enableSecureBoot: true,
            enableVtpm: true,
            enableIntegrityMonitoring: true,
          },
          metadata: {
            enable_oslogin: "TRUE",
          },
        },
        childOpts
      );

      this.instances.push(instance);
      this.instanceIds.push(instance.id);
      this.internalIps.push(
        instance.networkInterfaces.apply(
          (nics) => nics[0]?.networkIp ?? "unknown"
        )
      );
    }

    this.registerOutputs({
      instanceIds: this.instanceIds,
      internalIps: this.internalIps,
    });
  }
}
