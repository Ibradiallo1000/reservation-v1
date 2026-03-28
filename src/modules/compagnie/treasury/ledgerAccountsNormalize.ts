/**
 * Migration unique : normalise les documents `accounts` (type, agencyId, includeInLiquidity).
 * Seul module autorisé à inférer depuis doc id / accountType legacy.
 */

import { collection, getDocs, limit, query, writeBatch } from "firebase/firestore";
import { db } from "@/firebaseConfig";
import {
  agencyCashAccountDocId,
  agencyMobileMoneyAccountDocId,
  ledgerAccountDocRef,
  ledgerAccountsRef,
  specForLedgerDocId,
} from "./ledgerAccounts";
import { STRICT_LEDGER_ACCOUNT_TYPES, type StrictLedgerAccountType } from "./ledgerAccountStrictTypes";

function inferAgencyIdFromCanonicalDocId(docId: string, agencyIds: string[]): string | null {
  for (const aid of agencyIds) {
    if (agencyCashAccountDocId(aid) === docId || agencyMobileMoneyAccountDocId(aid) === docId) return aid;
  }
  return null;
}

function mapLegacyAccountTypeToStrict(
  accountType: string | undefined | null
): StrictLedgerAccountType | null {
  if (!accountType) return null;
  const t = String(accountType).toLowerCase().trim();
  if (t === "agency_cash") return "cash";
  if (t === "agency_bank") return "bank";
  if (t === "company_bank") return "bank";
  if (t === "company_mobile_money" || t === "mobile_money") return "mobile_money";
  return null;
}

export type NormalizeAccountsResult = {
  updated: number;
  skipped: number;
  dryRun: boolean;
  details: string[];
};

/**
 * Parcourt `companies/{companyId}/accounts` et écrit type / agencyId / includeInLiquidity cohérents.
 * À lancer une fois (admin) après déploiement du mode strict.
 */
export async function normalizeAccountsData(
  companyId: string,
  options?: { dryRun?: boolean }
): Promise<NormalizeAccountsResult> {
  const dryRun = options?.dryRun === true;
  const details: string[] = [];
  let updated = 0;
  let skipped = 0;

  const agSnap = await getDocs(collection(db, "companies", companyId, "agences"));
  const agencyIds = agSnap.docs.map((d) => d.id);

  const accSnap = await getDocs(query(ledgerAccountsRef(companyId), limit(500)));
  let batch = dryRun ? null : writeBatch(db);
  let batchCount = 0;

  for (const d of accSnap.docs) {
    const docId = d.id;
    const raw = d.data() as Record<string, unknown>;
    let nextType: StrictLedgerAccountType | null = null;
    let nextAgencyId: string | null = (raw.agencyId as string | null | undefined) ?? null;
    let nextInclude =
      raw.includeInLiquidity === undefined ? true : Boolean(raw.includeInLiquidity);

    const existingType = raw.type !== undefined && raw.type !== null ? String(raw.type).toLowerCase().trim() : "";
    if (existingType && STRICT_LEDGER_ACCOUNT_TYPES.includes(existingType as StrictLedgerAccountType)) {
      nextType = existingType as StrictLedgerAccountType;
    } else if (existingType === "agency_cash") {
      nextType = "cash";
    } else {
      const fromLegacy = mapLegacyAccountTypeToStrict(raw.accountType as string | undefined);
      if (fromLegacy) nextType = fromLegacy;
    }

    const inferredAgency = inferAgencyIdFromCanonicalDocId(docId, agencyIds);
    const specAgency = inferredAgency ?? nextAgencyId;
    const spec = specForLedgerDocId(docId, specAgency);

    if (!nextType) {
      nextType = spec.type as StrictLedgerAccountType;
    }
    if (nextAgencyId == null) {
      nextAgencyId = inferredAgency ?? spec.agencyId;
    }

    nextInclude = spec.includeInLiquidity;

    const curTypeNorm = String(raw.type ?? "").toLowerCase().trim();
    const curAg = (raw.agencyId as string | null | undefined) ?? null;
    const curInc = raw.includeInLiquidity === false ? false : true;

    const unchanged =
      curTypeNorm === nextType && curAg === nextAgencyId && curInc === nextInclude;

    if (unchanged) {
      skipped += 1;
      continue;
    }

    details.push(`${docId}: type=${nextType} agencyId=${nextAgencyId ?? "null"} includeInLiquidity=${nextInclude}`);
    updated += 1;

    if (!dryRun && batch) {
      const ref = ledgerAccountDocRef(companyId, docId);
      batch.set(
        ref,
        {
          ...raw,
          type: nextType,
          agencyId: nextAgencyId,
          includeInLiquidity: nextInclude,
          companyId,
          id: docId,
        },
        { merge: true }
      );
      batchCount += 1;
      if (batchCount >= 450) {
        await batch.commit();
        batch = writeBatch(db);
        batchCount = 0;
      }
    }
  }

  if (!dryRun && batch && batchCount > 0) {
    await batch.commit();
  }

  return { updated, skipped, dryRun, details };
}
