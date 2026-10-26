/**
 * index.ts — Pulumi CrossGuard policy pack entry point (L4).
 * The policies themselves live in policies.ts so they can be unit tested.
 */

import { PolicyPack } from "@pulumi/policy";
import { policies } from "./policies";

new PolicyPack("gcp-infra-policies", { policies });
