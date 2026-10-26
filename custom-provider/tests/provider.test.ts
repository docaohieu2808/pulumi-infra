import { describe, expect, it } from "vitest";
import { GcpTagPolicyState, gcpTagPolicyProvider as provider } from "../provider";

const base = {
  parent: "organizations/123",
  tagKeyShortName: "cost-center",
  allowedValues: ["eng", "ops"],
  description: "billing",
} as GcpTagPolicyState;

describe("check", () => {
  it("accepts valid inputs", async () => {
    expect((await provider.check!(base, base)).failures).toEqual([]);
  });
  it("rejects an empty parent, a bad key name and no values", async () => {
    const bad = { ...base, parent: " ", tagKeyShortName: "Bad Name", allowedValues: [] };
    const props = ((await provider.check!(base, bad)).failures ?? []).map((f) => f.property);
    expect(props).toEqual(["parent", "tagKeyShortName", "allowedValues"]);
  });
});

describe("diff", () => {
  it("replaces when the key name changes", async () => {
    const d = await provider.diff!("id", base, { ...base, tagKeyShortName: "team" });
    expect(d.replaces).toEqual(["tagKeyShortName"]);
  });
  it("updates in place when only the values change", async () => {
    const d = await provider.diff!("id", base, { ...base, allowedValues: ["eng"] });
    expect(d.changes).toBe(true);
    expect(d.replaces).toEqual([]);
  });
  it("reports no change for identical state", async () => {
    expect((await provider.diff!("id", base, { ...base })).changes).toBe(false);
  });
});

describe("lifecycle", () => {
  it("creates, reads, updates and deletes", async () => {
    const created = await provider.create(base);
    expect(created.id).toMatch(/^tagKeys\/\d+$/);
    expect(created.outs).toMatchObject({ tagKeyId: created.id, allowedValues: ["eng", "ops"] });

    const read = await provider.read!(created.id, created.outs as GcpTagPolicyState);
    expect(read.id).toBe(created.id);
    expect(read.props).toMatchObject({ tagKeyShortName: "cost-center" });

    const updated = await provider.update!(created.id, created.outs as GcpTagPolicyState, {
      ...base,
      allowedValues: ["eng"],
    });
    expect(updated.outs).toMatchObject({ allowedValues: ["eng"] });
    expect((await provider.read!(created.id, created.outs as GcpTagPolicyState)).props).toMatchObject({
      allowedValues: ["eng"],
    });

    await provider.delete!(created.id, created.outs as GcpTagPolicyState);
    const gone = await provider.read!(created.id, created.outs as GcpTagPolicyState);
    expect(gone.id).toBeUndefined();
  });
});
