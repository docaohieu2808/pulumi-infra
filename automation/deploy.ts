/**
 * deploy.ts — Pulumi Automation API (L3)
 * Demonstrates programmatic stack create/update/destroy without CLI.
 *
 * Usage:
 *   ts-node deploy.ts up [stack]
 *   ts-node deploy.ts destroy [stack]
 *   ts-node deploy.ts preview [stack]
 *   ts-node deploy.ts outputs [stack]
 *
 * Env: GCP_PROJECT (required), GCP_REGION, POLICY_PACK_DIR (enforce the CrossGuard pack, e.g. ../policy).
 */

import * as fs from "fs";
import * as path from "path";
import {
  LocalWorkspace,
  Stack,
  OutputMap,
  UpResult,
  DestroyResult,
  PreviewResult,
} from "@pulumi/pulumi/automation";

// GCP_PROJECT must be set via env var — no fallback to prevent accidental deploys
const GCP_PROJECT = (() => {
  const p = process.env.GCP_PROJECT;
  if (!p) {
    console.error("[automation] Error: GCP_PROJECT env var is required");
    process.exit(1);
  }
  return p;
})();
const GCP_REGION = process.env.GCP_REGION ?? "us-central1";
const INFRA_DIR = path.resolve(__dirname, "../infra");
// Optional: run the CrossGuard policy pack (a directory containing PulumiPolicy.yaml) during preview/up.
const POLICY_PACKS = process.env.POLICY_PACK_DIR ? [path.resolve(process.env.POLICY_PACK_DIR)] : [];

// Stack config per environment
const ENV_CONFIGS: Record<string, Record<string, string>> = {
  dev: {
    "gcp:project": GCP_PROJECT,
    "gcp:region": GCP_REGION,
    "gcp-infra:environment": "dev",
    "gcp-infra:machineType": "e2-micro",
    "gcp-infra:instanceCount": "1",
  },
  staging: {
    "gcp:project": GCP_PROJECT,
    "gcp:region": GCP_REGION,
    "gcp-infra:environment": "staging",
    "gcp-infra:machineType": "e2-small",
    "gcp-infra:instanceCount": "2",
  },
  prod: {
    "gcp:project": GCP_PROJECT,
    "gcp:region": GCP_REGION,
    "gcp-infra:environment": "prod",
    "gcp-infra:machineType": "e2-medium",
    "gcp-infra:instanceCount": "3",
  },
};

async function getOrCreateStack(stackName: string): Promise<Stack> {
  console.log(`[automation] Initializing stack: ${stackName}`);

  if (!fs.existsSync(path.join(INFRA_DIR, "node_modules"))) {
    throw new Error(`Dependencies missing: run "npm ci" in ${INFRA_DIR} first`);
  }

  const stack = await LocalWorkspace.createOrSelectStack({
    stackName,
    workDir: INFRA_DIR,
  });

  // Apply environment config
  const envKey = stackName.split("/").pop() ?? "dev";
  const cfg = ENV_CONFIGS[envKey] ?? ENV_CONFIGS["dev"];

  console.log(`[automation] Setting config for env: ${envKey}`);
  for (const [key, value] of Object.entries(cfg)) {
    await stack.setConfig(key, { value });
  }

  // The Pulumi CLI downloads the gcp provider plugin by itself, at the version the SDK in infra/package.json
  // asks for. It does not run `npm install`, so fail early with a clear message instead.
  return stack;
}

async function runPreview(stackName: string): Promise<void> {
  const stack = await getOrCreateStack(stackName);

  console.log("[automation] Running preview...");
  const result: PreviewResult = await stack.preview({
    policyPacks: POLICY_PACKS,
    onOutput: (msg) => process.stdout.write(msg),
  });

  console.log("\n[automation] Preview summary:");
  console.log(JSON.stringify(result.changeSummary, null, 2));
}

async function runUp(stackName: string): Promise<void> {
  const stack = await getOrCreateStack(stackName);

  console.log("[automation] Running up (deploy)...");
  const result: UpResult = await stack.up({
    policyPacks: POLICY_PACKS,
    onOutput: (msg) => process.stdout.write(msg),
  });

  console.log("\n[automation] Deploy summary:");
  console.log(`  Message: ${result.summary.message}`);
  console.log(`  Result:  ${result.summary.result}`);

  const outputs: OutputMap = result.outputs;
  if (Object.keys(outputs).length > 0) {
    console.log("\n[automation] Stack outputs:");
    for (const [k, v] of Object.entries(outputs)) {
      console.log(`  ${k}: ${v.value}`);
    }
  }
}

async function runDestroy(stackName: string): Promise<void> {
  const stack = await getOrCreateStack(stackName);

  console.log("[automation] Running destroy...");
  const result: DestroyResult = await stack.destroy({
    onOutput: (msg) => process.stdout.write(msg),
  });

  console.log("\n[automation] Destroy summary:");
  console.log(`  Message: ${result.summary.message}`);
  console.log(`  Result:  ${result.summary.result}`);
}

async function printOutputs(stackName: string): Promise<void> {
  const stack = await getOrCreateStack(stackName);
  const outputs: OutputMap = await stack.outputs();

  console.log(`[automation] Outputs for stack: ${stackName}`);
  if (Object.keys(outputs).length === 0) {
    console.log("  (no outputs — stack may not be deployed yet)");
    return;
  }
  for (const [k, v] of Object.entries(outputs)) {
    const display = v.secret ? "[secret]" : v.value;
    console.log(`  ${k}: ${display}`);
  }
}

// --- CLI entrypoint ---
async function main(): Promise<void> {
  const [, , command = "preview", stackName = "dev"] = process.argv;

  const commands: Record<string, (s: string) => Promise<void>> = {
    preview: runPreview,
    up: runUp,
    destroy: runDestroy,
    outputs: printOutputs,
  };

  const handler = commands[command];
  if (!handler) {
    console.error(
      `Unknown command: ${command}. Valid: ${Object.keys(commands).join(", ")}`
    );
    process.exit(1);
  }

  try {
    await handler(stackName);
  } catch (err) {
    console.error("[automation] Error:", err);
    process.exit(1);
  }
}

main();
