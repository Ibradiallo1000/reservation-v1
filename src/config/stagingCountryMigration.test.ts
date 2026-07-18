import { describe, expect, it } from "vitest";
import {
  PRODUCTION_PROJECT_ID, STAGING_PROJECT_ID, assertStagingProject, buildAuditRow,
  countAuditActions, createMinimalBackup, sha256, stableJson, validateApprovals,
} from "../../scripts/lib/stagingCountryMigration.mjs";

describe("staging country migration safety", () => {
  it("accepts staging and rejects production or unknown projects", () => {
    expect(() => assertStagingProject(STAGING_PROJECT_ID)).not.toThrow();
    expect(() => assertStagingProject(PRODUCTION_PROJECT_ID)).toThrow(/production/i);
    expect(() => assertStagingProject("other")).toThrow(/attendu/i);
  });
  it("builds stable, minimal and restorable backups", () => {
    const backup = createMinimalBackup([{ id: "b", pays: "Mali", privateEmail: "secret" }, { id: "a", countryCode: "SN", devise: "XOF" }]);
    expect(backup.map((row: { id: string }) => row.id)).toEqual(["a", "b"]);
    expect(backup[1]).not.toHaveProperty("privateEmail");
    expect(sha256(stableJson(backup))).toHaveLength(64);
  });
  it("requires human approvals to exactly match safe dry-run rows", () => {
    const rows = [buildAuditRow({ id: "m", pays: "Mali" }), buildAuditRow({ id: "x", pays: "Congo" })];
    expect(validateApprovals([{ companyId: "m", countryCode: "ML" }], rows)).toEqual([{ companyId: "m", countryCode: "ML" }]);
    expect(() => validateApprovals([{ companyId: "x", countryCode: "ML" }], rows)).toThrow(/différente/i);
  });
  it("reports agency conflicts and never proposes them as safe", () => {
    const row = buildAuditRow({ id: "m", pays: "Mali" }, [{ pays: "Sénégal" }]);
    expect(row).toMatchObject({ action: "conflict", anomalies: ["agency-country-conflict"] });
    expect(countAuditActions([row, buildAuditRow({ id: "s", countryCode: "SN" })])).toEqual({ conflict: 1, "already-canonical": 1 });
  });
});
