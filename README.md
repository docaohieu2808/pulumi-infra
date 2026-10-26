# pulumi-infra

**Tier 3 of 5 - Pulumi: real-language IaC with the Automation API and CrossGuard policy**

[![ci](https://github.com/docaohieu2808/pulumi-infra/actions/workflows/ci.yml/badge.svg)](https://github.com/docaohieu2808/pulumi-infra/actions/workflows/ci.yml)

## What it teaches

GCP infrastructure in TypeScript using Pulumi's `ComponentResource` pattern (network, compute, storage), the
Automation API for programmatic stack lifecycle, a CrossGuard policy pack mirroring the OPA rules from
`terraform-modules`, a dynamic provider, and - the part most Pulumi repos skip - tests that run without a cloud.

## Position in the IaC spectrum

| Tier | Tool | Trade-off vs this tier |
|------|------|----------------------|
| 1 | Terraform + Terragrunt | Larger module registry, more operators know HCL. Limited abstraction - no real loops or types. |
| 2 | OpenTofu | Drop-in HCL compatible, open-source. Same abstraction ceiling as Terraform. |
| **3 (this)** | Pulumi TypeScript | Full language: loops, types, unit tests with mocks, npm ecosystem. Trade-off: a Node runtime dependency and a smaller registry than Terraform's. |
| 4 | AWS CDK | TypeScript too, but AWS-only. CDK synthesizes to CloudFormation; Pulumi talks to cloud APIs directly. |
| 5 | Crossplane | No local tooling - a Kubernetes control plane. GitOps-native but operationally heavy. |

## Level map

| Level | Where | What |
|-------|-------|------|
| L1 | `infra/index.ts` | Config, stack outputs, one program |
| L2 | `infra/components/` | `GcpNetwork` (VPC, subnet, Cloud NAT, IAP-only SSH firewall), `GcpCompute` (private VMs, shielded, OS Login), `GcpStorage` (locked-down versioned bucket) |
| L3 | `automation/deploy.ts` | Automation API: preview / up / destroy / outputs per environment |
| L4 | `policy/` | CrossGuard policy pack, five policies, unit tested |
| MAX | `custom-provider/` | Dynamic provider `GcpTagPolicy` with check / diff / create / read / update / delete |
| - | `violating-example/` | A program that breaks the policies on purpose; CI requires the policy pack to reject it |

### Policies (`policy/policies.ts`)

| Policy | Level | Rule |
|--------|-------|------|
| `no-public-ip-without-approval` | mandatory | no `accessConfigs` on GCE instances |
| `require-resource-labels` | mandatory | `environment` + `managed_by` labels, only on types that can carry labels (Instance, Bucket, Disk, Address; a VPC or subnetwork has no labels) |
| `allowed-machine-types` | advisory | per-environment allowlist, restricted families flagged |
| `no-public-bucket-access` | mandatory | `publicAccessPrevention = enforced` and uniform bucket-level access |
| `require-bucket-versioning` | advisory | object versioning on |

Policies match on the Pulumi type token (`args.type`) rather than `validateResourceOfType`, which would pull the whole
`@pulumi/gcp` SDK into the policy pack just to compare a string.

## Running it

Prerequisites: Node 24 LTS, Pulumi CLI 3.272 or newer, a GCP project for a real `up`.

```bash
export GCP_PROJECT="your-gcp-project"
export GOOGLE_APPLICATION_CREDENTIALS="/path/to/sa.json"

# Standard CLI
cd infra && npm ci
pulumi stack init dev
pulumi config set gcp:project "$GCP_PROJECT"
pulumi preview --policy-pack ../policy     # CrossGuard enforced during the plan
pulumi up --policy-pack ../policy

# Automation API (installs nothing; run npm ci in infra/ first)
cd automation && npm ci
GCP_PROJECT="$GCP_PROJECT" POLICY_PACK_DIR=../policy npx ts-node deploy.ts preview dev

# Publish the policy pack to your Pulumi organisation (needs a Pulumi Cloud login)
cd policy && npm ci && pulumi policy publish <org>
```

### Try it without any cloud account

`pulumi preview` computes the plan offline, so a dummy token is enough. This is exactly what CI does:

```bash
export PULUMI_CONFIG_PASSPHRASE="" GOOGLE_OAUTH_ACCESS_TOKEN=dummy
pulumi login --local
cd infra && npm ci && (cd ../policy && npm ci)
pulumi stack init demo && pulumi config set gcp:project demo-project
pulumi preview --policy-pack ../policy                 # passes, 11 resources to create
cd ../violating-example && npm ci && pulumi stack init demo && pulumi config set gcp:project demo-project
pulumi preview --policy-pack ../policy                 # fails: three mandatory policies reject it
```

The provider prints one `failed to list regions` warning with the dummy token; it is harmless.

### Unit tests

```bash
cd infra && npm ci && npm test            # components, with pulumi.runtime.setMocks (vitest)
cd policy && npm ci && npm test           # every policy: violating and compliant resources
cd custom-provider && npm ci && npm test  # dynamic provider lifecycle
```

## What CI checks (`.github/workflows/ci.yml`)

Runs on push, pull request, manual dispatch and every Monday 02:23 UTC.

- **lint**: actionlint; every action pinned to a commit SHA that exists.
- **test** (matrix over the five packages): `npm ci`, `tsc --noEmit`, unit tests (infra mocks, policy rules, provider
  lifecycle).
- **preview**: real Pulumi CLI on a local file backend with a dummy GCP token. The infra program must plan cleanly
  under the policy pack; the same preview through the Automation API script must pass; `violating-example` must be
  rejected with the mandatory policies named.

## Honest limits

- `pulumi up` is never run in CI: it needs a real GCP project. Everything up to the plan is exercised, apply is not.
- TypeScript is pinned to 6.x, not 7: `@pulumi/pulumi` and ts-node declare `typescript < 7`.
- The dynamic provider's backing API is an in-memory fake (`InMemoryTagPolicyApi`), so the lifecycle is real but no
  Google API is called. Dynamic providers are Pulumi's least portable extension point (TypeScript/Python only); for a
  reusable provider use a native provider.
- Demo infrastructure: private VMs reach the internet through Cloud NAT and are reached only through IAP SSH.
- `Pulumi.*.yaml` stack files (they can hold encrypted secrets) are gitignored.
