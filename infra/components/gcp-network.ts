import * as pulumi from "@pulumi/pulumi";
import * as gcp from "@pulumi/gcp";

export interface GcpNetworkArgs {
  project: pulumi.Input<string>;
  region: pulumi.Input<string>;
  environment: pulumi.Input<string>;
  cidrRange?: pulumi.Input<string>;
}

/**
 * GcpNetwork: reusable ComponentResource that provisions a VPC + subnet, a Cloud NAT (the VMs have no external
 * IP, so NAT is how they reach package mirrors) and a firewall rule allowing SSH only from Google's IAP range.
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

    const router = new gcp.compute.Router(
      `${name}-router`,
      {
        name: pulumi.interpolate`${args.environment}-${name}-router`,
        project: args.project,
        region: args.region,
        network: this.network.id,
      },
      childOpts
    );

    new gcp.compute.RouterNat(
      `${name}-nat`,
      {
        name: pulumi.interpolate`${args.environment}-${name}-nat`,
        project: args.project,
        region: args.region,
        router: router.name,
        natIpAllocateOption: "AUTO_ONLY",
        sourceSubnetworkIpRangesToNat: "ALL_SUBNETWORKS_ALL_IP_RANGES",
      },
      childOpts
    );

    // 35.235.240.0/20 is the source range of Identity-Aware Proxy TCP forwarding (gcloud compute ssh --tunnel-through-iap).
    new gcp.compute.Firewall(
      `${name}-allow-iap-ssh`,
      {
        name: pulumi.interpolate`${args.environment}-${name}-allow-iap-ssh`,
        project: args.project,
        network: this.network.id,
        direction: "INGRESS",
        sourceRanges: ["35.235.240.0/20"],
        allows: [{ protocol: "tcp", ports: ["22"] }],
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
