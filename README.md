# pulumi-infra

Pulumi TypeScript infrastructure for GCP with reusable component resources, Automation API, and CrossGuard policy enforcement.

## What's Inside

| Path | Description |
|------|-------------|
| `infra/index.ts` | Main stack: GCP network, compute, storage |
| `infra/components/gcp-network.ts` | L2 ComponentResource: VPC + subnet |
| `infra/components/gcp-compute.ts` | L2 ComponentResource: GCE instances |
| `infra/components/gcp-storage.ts` | L2 ComponentResource: GCS bucket |
| `automation/deploy.ts` | L3 Automation API: programmatic up/destroy/preview |
| `policy/index.ts` | L4 CrossGuard policy pack (5 GCP policies) |
| `custom-provider/provider.ts` | MAX custom dynamic provider skeleton |

## Levels

| Level | Skill | What You Do |
|-------|-------|-------------|
| L1 | Pulumi basics | `pulumi up/down/preview`; understand stacks and config |
| L2 | Components | Write `ComponentResource` classes; compose infra from typed inputs/outputs |
| L3 | Automation API | Drive stacks programmatically via `deploy.ts` without the CLI |
| L4 | CrossGuard | Write and enforce policy packs; run `pulumi up --policy-pack` |
| L5 | Stack references | Wire outputs across stacks; manage secrets with `pulumi config set --secret` |
| L6 | Testing | Unit-test resources with `@pulumi/pulumi/testing`; mock providers |
| MAX | Custom provider | Implement `create/read/update/delete` in `custom-provider/provider.ts` |

## Prerequisites

- Node.js >= 18
- Pulumi CLI >= 3.x (`brew install pulumi`)
- GCP project with credentials: `export GOOGLE_CREDENTIALS=$(cat /home/hieudc/iac-devops-terraform.json)`
- Pulumi account or self-hosted backend

```bash
brew install pulumi
cd infra && npm install
pulumi login          # or: pulumi login --local  for file-based backend
```

## Quick Start

```bash
cd infra
pulumi stack init dev
pulumi config set gcp:project iac-devops-484714
pulumi config set gcp:region us-central1
pulumi up
```

## Usage Examples

### Preview changes without deploying

```bash
cd infra
pulumi preview --diff
```

### Enforce CrossGuard policies on deploy

```bash
cd infra
pulumi up --policy-pack ../policy
```

### Run policies in advisory mode (warn, don't block)

Edit `policy/index.ts` and set `enforcementLevel: "advisory"` on any policy, then:

```bash
pulumi up --policy-pack ../policy
```

### Use Automation API to deploy programmatically

```bash
cd automation
npm install
# Deploy dev stack
ts-node deploy.ts up dev

# Preview staging
ts-node deploy.ts preview staging

# Destroy dev
ts-node deploy.ts destroy dev

# Print stack outputs
ts-node deploy.ts outputs dev
```

### Configure per-environment values

```bash
pulumi stack select staging
pulumi config set environment staging
pulumi config set machineType e2-medium
pulumi config set instanceCount 2
pulumi up
```

## CrossGuard Policies Enforced

| Policy | Enforcement |
|--------|-------------|
| `no-public-ip-without-approval` | mandatory |
| `require-resource-labels` (`environment`, `managed_by`) | mandatory |
| `allowed-machine-types` (per env tier) | mandatory |
| `no-public-bucket-access` | mandatory |
| `require-bucket-versioning` | mandatory |

## Stack Config Files

| File | Environment |
|------|-------------|
| `infra/Pulumi.dev.yaml` | Dev stack config |
| `infra/Pulumi.yaml` | Project definition |
