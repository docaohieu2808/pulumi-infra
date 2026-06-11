# pulumi-infra

**Tier 3 of 5 — Pulumi: real-language IaC with Automation API and CrossGuard policy**

## Purpose

GCP infrastructure in TypeScript using Pulumi's `ComponentResource` pattern (network, compute, storage components). Includes the Automation API (`automation/deploy.ts`) for programmatic stack lifecycle, and a CrossGuard policy pack mirroring the OPA rules from `terraform-modules` — enabling direct tier comparison.

## Position in the IaC spectrum

| Tier | Tool | Trade-off vs this tier |
|------|------|----------------------|
| 1 | Terraform + Terragrunt | Larger module registry, more operators know HCL. Limited abstraction — no real loops or types. |
| 2 | OpenTofu | Drop-in HCL compatible, open-source. Same abstraction ceiling as Terraform. |
| **3 (this)** | Pulumi TypeScript | Full language: real loops, generics, unit tests (`@pulumi/pulumi/testing`), npm ecosystem. Trade-off: JS/TS runtime dependency, smaller community registry than TF Registry. |
| 4 | AWS CDK | TypeScript too, but AWS-only. CDK synthesizes to CloudFormation; Pulumi talks directly to cloud APIs. |
| 5 | Crossplane | No local tooling — Kubernetes control plane. GitOps-native but operationally heavy. |

## Key differentiators vs Terraform/OpenTofu (interview talking points)

- **Real language**: loops, helper functions, generics, conditional types — no HCL workarounds
- **Automation API** (`automation/`): `LocalWorkspace.createOrSelectStack()` — embed IaC in CI scripts, CLI tools, web services without shelling out to `pulumi` CLI
- **CrossGuard** (`policy/`): policy as TypeScript — same language as infra, same test framework. Compare with OPA Rego (terraform-modules tier) and Composition pipeline functions (crossplane tier)
- **`ComponentResource`** pattern: encapsulate related resources into a single logical unit with typed inputs/outputs

## Structure

```
infra/            # Main Pulumi program (ComponentResource components)
  components/     # GcpNetwork, GcpCompute, GcpStorage components
automation/       # Automation API — programmatic deploy/destroy/preview
policy/           # CrossGuard policy pack (5 policies mirroring OPA rules)
custom-provider/  # Dynamic provider example (no SDK needed)
```

## Running

```bash
# Prerequisites: node >= 18, pulumi CLI >= 3.x

export GCP_PROJECT="your-gcp-project"
export GOOGLE_APPLICATION_CREDENTIALS="/path/to/sa.json"

# Standard CLI
cd infra
npm install
pulumi stack init dev
pulumi up

# Automation API
cd automation
npm install
ts-node deploy.ts up dev

# Policy check
cd policy
npm install
pulumi policy publish
```

## Notes

- `Pulumi.*.yaml` stack files (contain encrypted secrets) are gitignored — correct pattern.
- `GCP_PROJECT` env var is required; no hardcoded fallback in `automation/deploy.ts`.
- Unit tests gap: `@pulumi/pulumi/testing` mock framework not yet added — see `opentofu-modules/tests/` for the OpenTofu equivalent pattern.
