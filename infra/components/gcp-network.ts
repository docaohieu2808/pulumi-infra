import * as pulumi from "@pulumi/pulumi";
import * as gcp from "@pulumi/gcp";

export interface GcpNetworkArgs {
  project: pulumi.Input<string>;
  region: pulumi.Input<string>;
  environment: pulumi.Input<string>;
  cidrRange?: pulumi.Input<string>;
}

/**
 * GcpNetwork: reusable ComponentResource that provisions a VPC + subnet.
 * L2 pattern: encapsulates related resources behind a clean interface.
 */
export class GcpNetwork extends pulumi.ComponentResource {
  public readonly network: gcp.compute.Network;
  public readonly subnet: gcp.compute.Subnetwork;
  public readonly networkId: pulumi.Output<string>;
  public readonly subnetId: pulumi.Output<string>;

  constructor(
    name: string,
    args: GcpNetworkArgs,
    opts?: pulumi.ComponentResourceOptions
  ) {
    super("custom:gcp:Network", name, {}, opts);

    const childOpts = { parent: this };

    this.network = new gcp.compute.Network(
      `${name}-vpc`,
      {
        name: pulumi.interpolate`${args.environment}-${name}-vpc`,
        project: args.project,
        autoCreateSubnetworks: false,
        description: pulumi.interpolate`VPC for ${args.environment} environment`,
      },
      childOpts
    );

    this.subnet = new gcp.compute.Subnetwork(
      `${name}-subnet`,
      {
        name: pulumi.interpolate`${args.environment}-${name}-subnet`,
        project: args.project,
        region: args.region,
        network: this.network.selfLink,
        ipCidrRange: args.cidrRange ?? "10.0.0.0/24",
        privateIpGoogleAccess: true,
      },
      childOpts
    );

    this.networkId = this.network.id;
    this.subnetId = this.subnet.id;

    this.registerOutputs({
      networkId: this.networkId,
      subnetId: this.subnetId,
    });
  }
}
