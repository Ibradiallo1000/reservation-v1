/**
 * Journal ledger : companies/{companyId}/financialTransactions + miroir sur companies/{companyId}/accounts.
 * Source de vérité financière pour encaissements, remboursements, transferts et dépenses (écritures métier).
 * Ventes espèces guichet/courrier : crédit compte « attente remise », pas la caisse physique.
 * La caisse réelle est créditée uniquement lors de la validation comptable (remise) via applyRemittancePendingToAgencyCashInTransaction.
 */
import {
  type DocumentSnapshot,
  type Transaction,
  Timestamp,
  collection,
  doc,
  getDoc,
  getDocs,
  increment,
  limit,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  where,
} from "firebase/firestore";
import { db } from "@/firebaseConfig";
import { normalizeChannel } from "@/utils/reservationStatusUtils";
import type {
  FinancialPaymentMethod,
  FinancialTransactionDoc,
  FinancialTransactionStatus,
  FinancialTransactionSource,
  FinancialTransactionType,
  LedgerAccountType,
  ReferenceType,
} from "./types";
import {
  agencyCashAccountDocId,
  agencyPendingCashAccountDocId,
  agencyMobileMoneyAccountDocId,
  companyBankAccountDocId,
  companyClearingAccountDocId,
  companyClientVirtualAccountDocId,
  getLiquidityFromAccounts,
  type LedgerAccountKind,
  ledgerAccountDocRef,
  ledgerAccountsRef,
  ensureLedgerAccountDocsInTransaction,
  specForLedgerDocId,
} from "./ledgerAccounts";
import { parseStrictLedgerAccountType } from "./ledgerAccountStrictTypes";
import { financialAccountRef } from "./financialAccounts";
import { agencyCashAccountId } from "./types";

/** Routage métier des transferts — seul moyen autorisé de résoudre une paire ledger pour `type: transfer`. */
export type LedgerTransferRoute =
  | "agency_cash_to_company_bank"
  | "company_bank_to_agency_cash"
  | "ledger_debit_to_company_bank"
  | "internal_pair";

/** Référence idempotente pour une remise (écriture `remittance`). */
export type RemittanceLedgerReference =
  | { referenceType: "shift"; referenceId: string }
  | { referenceType: "courier_session"; referenceId: string };

const FINANCIAL_TRANSACTIONS_COLLECTION = "financialTransactions";
const IDEMPOTENCY_COLLECTION = "financialTransactionIdempotency";

function financialTransactionsRef(companyId: string) {
  return collection(db, "companies", companyId, FINANCIAL_TRANSACTIONS_COLLECTION);
}

function idempotencyRef(companyId: string, uniqueReferenceKey: string) {
  return doc(db, "companies", companyId, IDEMPOTENCY_COLLECTION, uniqueReferenceKey);
}

function toSource(value: string | undefined | null): FinancialTransactionSource {
  const n = normalizeChannel(value ?? undefined);
  if (n === "guichet" || n === "cash") return "cash";
  if (n === "online" || n === "mobile_money") return "mobile_money";
  if (n === "bank") return "bank";
  if (n === "mixed") return "mixed";
  return "other";
}

function normalizeTxTypeAlias(t: FinancialTransactionType): FinancialTransactionType {
  if (t === "transfer_to_bank") return "transfer";
  return t;
}

function defaultStatusForType(_type: FinancialTransactionType): FinancialTransactionStatus {
  return "confirmed";
}

/** Caisse physique agence : docId `agency_*_cash` hors pending. */
function isAgencyPhysicalCashLedgerDocId(docId: string): boolean {
  return (
    docId.startsWith("agency_") && docId.endsWith("_cash") && !docId.includes("_pending_cash")
  );
}

/**
 * Règle produit : seuls `remittance` et `bank_withdrawal` créditent la caisse physique agence
 * (hors écriture interne produite uniquement par applyRemittance).
 */
function assertAllowedCreditToAgencyPhysicalCash(
  creditId: string,
  storedType: FinancialTransactionType
): void {
  if (!isAgencyPhysicalCashLedgerDocId(creditId)) return;
  if (storedType === "remittance" || storedType === "bank_withdrawal") return;
  throw new Error(
    `[ledger] Crédit interdit sur caisse physique (${creditId}) pour type="${storedType}". Autorisé: remittance, bank_withdrawal.`
  );
}

function ledgerMirrorTypeFromKind(kind: LedgerAccountKind): LedgerAccountType | undefined {
  if (kind === "cash" || kind === "mobile_money" || kind === "bank") return kind;
  return undefined;
}

function assertExistingLedgerAccountMatchesSpec(
  snap: DocumentSnapshot,
  docId: string,
  expectedType: LedgerAccountKind
): void {
  if (!snap.exists()) return;
  const stored = parseStrictLedgerAccountType(snap.data() as Record<string, unknown>, docId);
  if (stored !== expectedType) {
    throw new Error(
      `[ledger] Compte "${docId}" : type stocké "${stored}" ≠ attendu "${expectedType}" pour cette écriture.`
    );
  }
}

function allowsNegativeBalance(accountDocId: string): boolean {
  return accountDocId === companyClearingAccountDocId() || accountDocId === companyClientVirtualAccountDocId();
}

function isGuichetChannel(channel: string | null | undefined, source: string | null | undefined): boolean {
  const c = normalizeChannel(channel ?? source ?? "");
  return c === "guichet" || c === "cash" || c === "espèces" || c === "courrier";
}

function isOnlineChannel(channel: string | null | undefined, source: string | null | undefined): boolean {
  const c = normalizeChannel(channel ?? source ?? "");
  return c === "online" || c === "en_ligne" || c === "mobile_money" || c === "wave" || c === "orange";
}

/**
 * Résout paymentMethod : priorité paymentMethod explicite → provider → metadata → fallback contrôlé (jamais canal seul).
 */
export function resolveFinancialPaymentMethod(params: {
  type: FinancialTransactionType;
  paymentMethod?: FinancialPaymentMethod | null;
  paymentProvider?: string | null;
  paymentChannel?: string | null;
  source?: string | null;
  metadata?: Record<string, unknown> | null;
}): FinancialPaymentMethod {
  if (
    params.paymentMethod === "cash" ||
    params.paymentMethod === "mobile_money" ||
    params.paymentMethod === "card"
  ) {
    return params.paymentMethod;
  }

  const prov = String(params.paymentProvider ?? params.metadata?.provider ?? "").toLowerCase().trim();
  if (prov === "cash") return "cash";
  if (prov === "wave" || prov === "orange" || prov === "moov") return "mobile_money";
  if (prov === "card" || prov === "stripe") return "card";

  const metaPm = params.metadata?.paymentMethod;
  if (typeof metaPm === "string") {
    const m = metaPm.toLowerCase().trim();
    if (m === "cash") return "cash";
    if (m === "mobile_money") return "mobile_money";
    if (m === "card") return "card";
  }

  const txNorm = normalizeTxTypeAlias(params.type);
  if (
    txNorm === "transfer" ||
    txNorm === "expense" ||
    txNorm === "bank_withdrawal" ||
    txNorm === "remittance"
  ) {
    if (txNorm === "bank_withdrawal" || txNorm === "remittance") return "cash";
    const s = String(params.source ?? "").toLowerCase();
    if (s === "mobile_money") return "mobile_money";
    if (s === "bank") return "card";
    return "cash";
  }

  const ch = normalizeChannel(params.paymentChannel ?? params.source ?? "");
  if (ch === "guichet" || ch === "cash" || ch === "espèces") return "cash";
  if (ch === "online" || ch === "mobile_money" || ch === "wave" || ch === "orange" || ch === "moov") {
    return "mobile_money";
  }
  return "card";
}

function resolveLedgerPair(params: {
  companyId: string;
  type: FinancialTransactionType;
  agencyId?: string | null;
  paymentChannel?: string | null;
  paymentMethod?: FinancialPaymentMethod | null;
  source?: string | null;
  transferRoute?: LedgerTransferRoute | null;
  expenseDebitLedgerDocId?: string | null;
  transferDebitLedgerDocId?: string | null;
  transferCreditLedgerDocId?: string | null;
}): { debitId: string; creditId: string } {
  const agencyId = params.agencyId;
  const txType = normalizeTxTypeAlias(params.type);

  if (txType === "remittance") {
    throw new Error(
      "[ledger] type remittance : réservé à applyRemittancePendingToAgencyCashInTransaction (pas d’appel direct à createFinancialTransaction)."
    );
  }

  if (txType === "bank_withdrawal") {
    if (!agencyId) throw new Error("[ledger] bank_withdrawal : agencyId requis.");
    return {
      debitId: companyBankAccountDocId(),
      creditId: agencyCashAccountDocId(agencyId),
    };
  }

  if (txType === "payment_received") {
    if (!agencyId) {
      throw new Error("[ledger] agencyId requis pour payment_received.");
    }
    const pm = params.paymentMethod ?? null;
    if (pm === "mobile_money") {
      return {
        debitId: companyClearingAccountDocId(),
        creditId: agencyMobileMoneyAccountDocId(agencyId),
      };
    }
    if (pm === "cash") {
      return {
        debitId: companyClearingAccountDocId(),
        creditId: agencyPendingCashAccountDocId(agencyId),
      };
    }
    const g = isGuichetChannel(params.paymentChannel, params.source);
    const o = isOnlineChannel(params.paymentChannel, params.source);
    /** Fallback legacy : guichet sans canal « en ligne » → pending ; sinon mobile money agence. */
    const creditId =
      g && !o ? agencyPendingCashAccountDocId(agencyId) : agencyMobileMoneyAccountDocId(agencyId);
    return { debitId: companyClearingAccountDocId(), creditId };
  }

  if (txType === "refund") {
    if (!agencyId) throw new Error("[ledger] agencyId requis pour refund.");
    const guichet = isGuichetChannel(params.paymentChannel, params.source);
    const origin = guichet ? agencyPendingCashAccountDocId(agencyId) : agencyMobileMoneyAccountDocId(agencyId);
    return { debitId: origin, creditId: companyClientVirtualAccountDocId() };
  }

  if (txType === "transfer") {
    const route = params.transferRoute;
    if (!route) {
      throw new Error("[ledger] transfer : transferRoute requis (agency_cash_to_company_bank, ledger_debit_to_company_bank, internal_pair).");
    }
    if (route === "agency_cash_to_company_bank") {
      if (!agencyId) throw new Error("[ledger] transfer agency_cash_to_company_bank : agencyId requis.");
      return {
        debitId: agencyCashAccountDocId(agencyId),
        creditId: companyBankAccountDocId(),
      };
    }
    if (route === "company_bank_to_agency_cash") {
      throw new Error(
        '[ledger] Utilisez type "bank_withdrawal" (plus transferRoute company_bank_to_agency_cash).'
      );
    }
    if (route === "ledger_debit_to_company_bank") {
      const d = params.transferDebitLedgerDocId;
      if (!d) throw new Error("[ledger] transfer ledger_debit_to_company_bank : transferDebitLedgerDocId requis.");
      return { debitId: d, creditId: companyBankAccountDocId() };
    }
    if (route === "internal_pair") {
      const d = params.transferDebitLedgerDocId;
      const c = params.transferCreditLedgerDocId;
      if (!d || !c) {
        throw new Error("[ledger] transfer internal_pair : transferDebitLedgerDocId et transferCreditLedgerDocId requis.");
      }
      if (isAgencyPhysicalCashLedgerDocId(c)) {
        throw new Error(
          "[ledger] Crédit caisse physique via internal_pair interdit — utiliser type bank_withdrawal (banque → caisse)."
        );
      }
      return { debitId: d, creditId: c };
    }
    throw new Error(`[ledger] transferRoute inconnu: ${route}`);
  }

  if (txType === "expense") {
    const explicit = params.expenseDebitLedgerDocId;
    if (explicit) {
      return { debitId: explicit, creditId: companyClearingAccountDocId() };
    }
    if (!agencyId) {
      throw new Error("[ledger] expense : agencyId ou expenseDebitLedgerDocId requis.");
    }
    const src = toSource(params.source);
    if (src === "mobile_money") {
      return { debitId: agencyMobileMoneyAccountDocId(agencyId), creditId: companyClearingAccountDocId() };
    }
    if (src === "bank") {
      return { debitId: companyBankAccountDocId(), creditId: companyClearingAccountDocId() };
    }
    return { debitId: agencyCashAccountDocId(agencyId), creditId: companyClearingAccountDocId() };
  }

  throw new Error(`[ledger] type non géré: ${params.type}`);
}

/** Compteurs liquidité (somme des soldes comptes — pas de recalcul via transactions). */
export async function getLedgerBalances(
  companyId: string,
  agencyId?: string
): Promise<{
  mobileMoney: number;
  cash: number;
  bank: number;
  total: number;
}> {
  const r = await getLiquidityFromAccounts(companyId, agencyId);
  return { mobileMoney: r.mobileMoney, cash: r.cash, bank: r.bank, total: r.total };
}

/**
 * Remise espèces validée : débit attente remise → crédit caisse physique agence + écriture `financialTransactions` (idempotente).
 * À appeler depuis la transaction Firestore métier (validation comptable), une seule fois par remise.
 */
export async function applyRemittancePendingToAgencyCashInTransaction(
  tx: Transaction,
  companyId: string,
  agencyId: string,
  receivedAmount: number,
  currency: string,
  remittanceRef: RemittanceLedgerReference,
  context: string
): Promise<void> {
  const amt = Number(receivedAmount);
  if (!Number.isFinite(amt) || amt <= 0) return;

  const uniqueReferenceKey = `remittance_${remittanceRef.referenceType}_${remittanceRef.referenceId}`;
  const idemRef = idempotencyRef(companyId, uniqueReferenceKey);
  const idemSnap = await tx.get(idemRef);
  if (idemSnap.exists()) {
    return;
  }

  const pendingId = agencyPendingCashAccountDocId(agencyId);
  const cashId = agencyCashAccountDocId(agencyId);
  const pendingRef = ledgerAccountDocRef(companyId, pendingId);
  const cashRef = ledgerAccountDocRef(companyId, cashId);
  /** Lire le miroir financialAccounts avant toute écriture (Firestore : tous les get avant les set/update). */
  const mirrorCashRef = financialAccountRef(companyId, agencyCashAccountId(agencyId));

  const [pendingSnap, cashSnap, mirrorSnap] = await Promise.all([
    tx.get(pendingRef),
    tx.get(cashRef),
    tx.get(mirrorCashRef),
  ]);
  assertExistingLedgerAccountMatchesSpec(pendingSnap, pendingId, "virtual_clearing");
  assertExistingLedgerAccountMatchesSpec(cashSnap, cashId, "cash");

  const sPending = specForLedgerDocId(pendingId, agencyId);
  const sCash = specForLedgerDocId(cashId, agencyId);

  ensureLedgerAccountDocsInTransaction(
    tx,
    companyId,
    currency,
    [
      {
        docId: pendingId,
        type: sPending.type,
        agencyId: sPending.agencyId,
        label: sPending.label,
        includeInLiquidity: sPending.includeInLiquidity,
      },
      {
        docId: cashId,
        type: sCash.type,
        agencyId: sCash.agencyId,
        label: sCash.label,
        includeInLiquidity: sCash.includeInLiquidity,
      },
    ],
    [pendingSnap.exists(), cashSnap.exists()]
  );

  const debitBal = Number((pendingSnap.data() as { balance?: number } | undefined)?.balance ?? 0);
  const creditBal = Number((cashSnap.data() as { balance?: number } | undefined)?.balance ?? 0);
  const debitAfter = debitBal - amt;
  const creditAfter = creditBal + amt;

  if (!allowsNegativeBalance(pendingId) && debitAfter < -0.0001) {
    throw new Error(`[ledger] Solde pending insuffisant pour remise (${debitBal} < ${amt})`);
  }

  tx.update(pendingRef, { balance: increment(-amt), updatedAt: serverTimestamp() });
  tx.update(cashRef, { balance: increment(amt), updatedAt: serverTimestamp() });

  if (mirrorSnap.exists()) {
    // Keep financialAccounts mirror aligned with ledger exact balance (self-heals legacy drift).
    tx.update(mirrorCashRef, { currentBalance: creditAfter, updatedAt: serverTimestamp() });
  }

  const source = toSource("cash");
  const newRef = doc(financialTransactionsRef(companyId));
  const paymentMethod = resolveFinancialPaymentMethod({
    type: "remittance",
    paymentMethod: "cash",
    paymentProvider: null,
    paymentChannel: "guichet",
    source: "cash",
    metadata: { context },
  });
  const payload: FinancialTransactionDoc = {
    type: "remittance",
    source,
    amount: amt,
    currency,
    companyId,
    agencyId,
    reservationId: null,
    debitAccountId: pendingId,
    creditAccountId: cashId,
    debitAccountType: ledgerMirrorTypeFromKind(sPending.type),
    creditAccountType: ledgerMirrorTypeFromKind(sCash.type),
    balanceAfter: creditAfter,
    status: "confirmed",
    performedAt: Timestamp.now(),
    createdAt: Timestamp.now(),
    metadata: { context, debitAfter, creditAfter, operationKind: "encaissement" as const },
    referenceType: remittanceRef.referenceType,
    referenceId: remittanceRef.referenceId,
    uniqueReferenceKey,
    paymentChannel: "guichet",
    paymentMethod,
    paymentProvider: null,
  };
  tx.set(newRef, payload);
  tx.set(idemRef, {
    transactionId: newRef.id,
    createdAt: serverTimestamp(),
  });

  console.info(`Balance updated from remittance: +${amt} (${context})`);
}

/**
 * Annule une remise espèces (ex. session courrier renvoyée au comptable) : crédit pending, débit caisse physique.
 * Idempotent via clé `reversal_remittance_*`. Exige que la remise d’origine existe (doc idempotence `remittance_*`).
 */
export async function reverseRemittancePendingToAgencyCashInTransaction(
  tx: Transaction,
  companyId: string,
  agencyId: string,
  reverseAmount: number,
  currency: string,
  remittanceRef: RemittanceLedgerReference,
  context: string
): Promise<void> {
  const amt = Number(reverseAmount);
  if (!Number.isFinite(amt) || amt <= 0) return;

  const originalKey = `remittance_${remittanceRef.referenceType}_${remittanceRef.referenceId}`;
  const originalIdemRef = idempotencyRef(companyId, originalKey);
  const originalIdemSnap = await tx.get(originalIdemRef);
  if (!originalIdemSnap.exists()) {
    throw new Error(
      "[ledger] Aucune remise enregistrée à annuler pour cette référence — impossible de renverser le mouvement caisse."
    );
  }

  const reversalKey = `reversal_remittance_${remittanceRef.referenceType}_${remittanceRef.referenceId}`;
  const reversalIdemRef = idempotencyRef(companyId, reversalKey);
  const reversalIdemSnap = await tx.get(reversalIdemRef);
  if (reversalIdemSnap.exists()) {
    return;
  }

  const pendingId = agencyPendingCashAccountDocId(agencyId);
  const cashId = agencyCashAccountDocId(agencyId);
  const pendingRef = ledgerAccountDocRef(companyId, pendingId);
  const cashRef = ledgerAccountDocRef(companyId, cashId);
  const mirrorCashRef = financialAccountRef(companyId, agencyCashAccountId(agencyId));

  const [pendingSnap, cashSnap, mirrorSnap] = await Promise.all([
    tx.get(pendingRef),
    tx.get(cashRef),
    tx.get(mirrorCashRef),
  ]);
  assertExistingLedgerAccountMatchesSpec(pendingSnap, pendingId, "virtual_clearing");
  assertExistingLedgerAccountMatchesSpec(cashSnap, cashId, "cash");

  const sPending = specForLedgerDocId(pendingId, agencyId);
  const sCash = specForLedgerDocId(cashId, agencyId);

  ensureLedgerAccountDocsInTransaction(
    tx,
    companyId,
    currency,
    [
      {
        docId: pendingId,
        type: sPending.type,
        agencyId: sPending.agencyId,
        label: sPending.label,
        includeInLiquidity: sPending.includeInLiquidity,
      },
      {
        docId: cashId,
        type: sCash.type,
        agencyId: sCash.agencyId,
        label: sCash.label,
        includeInLiquidity: sCash.includeInLiquidity,
      },
    ],
    [pendingSnap.exists(), cashSnap.exists()]
  );

  const pendingBal = Number((pendingSnap.data() as { balance?: number } | undefined)?.balance ?? 0);
  const cashBal = Number((cashSnap.data() as { balance?: number } | undefined)?.balance ?? 0);
  const cashAfter = cashBal - amt;
  const pendingAfter = pendingBal + amt;

  if (!allowsNegativeBalance(cashId) && cashAfter < -0.0001) {
    throw new Error(`[ledger] Solde caisse insuffisant pour annuler la remise (${cashBal} < ${amt})`);
  }

  tx.update(cashRef, { balance: increment(-amt), updatedAt: serverTimestamp() });
  tx.update(pendingRef, { balance: increment(amt), updatedAt: serverTimestamp() });

  if (mirrorSnap.exists()) {
    // Keep financialAccounts mirror aligned with ledger exact balance (self-heals legacy drift).
    tx.update(mirrorCashRef, { currentBalance: cashAfter, updatedAt: serverTimestamp() });
  }

  const source = toSource("cash");
  const newRef = doc(financialTransactionsRef(companyId));
  const paymentMethod = resolveFinancialPaymentMethod({
    type: "remittance",
    paymentMethod: "cash",
    paymentProvider: null,
    paymentChannel: "guichet",
    source: "cash",
    metadata: { context, reversal: true },
  });
  const payload: FinancialTransactionDoc = {
    type: "remittance",
    source,
    amount: amt,
    currency,
    companyId,
    agencyId,
    reservationId: null,
    debitAccountId: cashId,
    creditAccountId: pendingId,
    debitAccountType: ledgerMirrorTypeFromKind(sCash.type),
    creditAccountType: ledgerMirrorTypeFromKind(sPending.type),
    balanceAfter: cashAfter,
    status: "confirmed",
    performedAt: Timestamp.now(),
    createdAt: Timestamp.now(),
    metadata: { context, debitAfter: cashAfter, creditAfter: pendingAfter, operationKind: "remittance_reversal" as const },
    referenceType: remittanceRef.referenceType,
    referenceId: remittanceRef.referenceId,
    uniqueReferenceKey: reversalKey,
    paymentChannel: "guichet",
    paymentMethod,
    paymentProvider: null,
  };
  tx.set(newRef, payload);
  tx.set(reversalIdemRef, {
    transactionId: newRef.id,
    createdAt: serverTimestamp(),
  });

  console.info(`Balance updated from remittance reversal: -${amt} cash (${context})`);
}

/** Paramètres alignés sur `createFinancialTransaction` (écriture ledger + journal dans une transaction Firestore existante). */
export type ApplyFinancialTransactionParams = {
  companyId: string;
  type: FinancialTransactionType;
  source?: string | null;
  amount: number;
  currency?: string | null;
  agencyId?: string | null;
  reservationId?: string | null;
  performedAt?: Timestamp | null;
  metadata?: Record<string, unknown> | null;
  referenceType: ReferenceType | "cash_transfer";
  referenceId: string;
  status?: FinancialTransactionStatus;
  paymentChannel?: string | null;
  paymentMethod?: FinancialPaymentMethod | null;
  paymentProvider?: string | null;
  debitAccountId?: string | null;
  creditAccountId?: string | null;
  transferRoute?: LedgerTransferRoute | null;
  expenseDebitLedgerDocId?: string | null;
  transferDebitLedgerDocId?: string | null;
  transferCreditLedgerDocId?: string | null;
};

function assertCreateFinancialTransactionParams(params: ApplyFinancialTransactionParams): {
  source: FinancialTransactionSource;
  txTypeNorm: FinancialTransactionType;
  ledgerAmount: number;
  uniqueReferenceKey: string;
} {
  if (params.debitAccountId != null && String(params.debitAccountId).trim() !== "") {
    throw new Error(
      "[ledger] debitAccountId explicite interdit — utiliser transferRoute / expenseDebitLedgerDocId / règles métier."
    );
  }
  if (params.creditAccountId != null && String(params.creditAccountId).trim() !== "") {
    throw new Error(
      "[ledger] creditAccountId explicite interdit — utiliser transferRoute / règles métier."
    );
  }

  const rawAmount = Number(params.amount) || 0;
  const txTypeNorm = normalizeTxTypeAlias(params.type);
  const ledgerAmount = Math.abs(rawAmount);
  if (ledgerAmount <= 0) {
    throw new Error("[ledger] createFinancialTransaction : montant invalide");
  }
  const source = toSource(params.source);
  const uniqueReferenceKey = `${txTypeNorm}_${params.referenceId}_${ledgerAmount}`;
  return { source, txTypeNorm, ledgerAmount, uniqueReferenceKey };
}

/**
 * Applique une écriture ledger + ligne `financialTransactions` dans une transaction Firestore déjà ouverte
 * (ex. paiement dépense atomique avec mise à jour métier).
 */
export async function applyFinancialTransactionInExistingFirestoreTransaction(
  tx: Transaction,
  params: ApplyFinancialTransactionParams
): Promise<{ transactionId: string; skippedDuplicate: boolean }> {
  const { source, txTypeNorm, ledgerAmount, uniqueReferenceKey } = assertCreateFinancialTransactionParams(params);
  const companyId = params.companyId;
  const currency = params.currency ?? "XOF";

  const idemSnap = await tx.get(idempotencyRef(companyId, uniqueReferenceKey));
  if (idemSnap.exists()) {
    const existingId = String((idemSnap.data() as { transactionId?: string }).transactionId ?? "");
    return { transactionId: existingId, skippedDuplicate: true };
  }

  let debitId: string;
  let creditId: string;
  try {
    const pair = resolveLedgerPair({
      companyId,
      type: params.type,
      agencyId: params.agencyId,
      paymentChannel: params.paymentChannel ?? params.source,
      paymentMethod: params.paymentMethod ?? null,
      source: params.source,
      transferRoute: params.transferRoute ?? null,
      expenseDebitLedgerDocId: params.expenseDebitLedgerDocId ?? null,
      transferDebitLedgerDocId: params.transferDebitLedgerDocId ?? null,
      transferCreditLedgerDocId: params.transferCreditLedgerDocId ?? null,
    });
    debitId = pair.debitId;
    creditId = pair.creditId;
  } catch (e) {
    console.error("[ledger] CRITICAL resolveLedgerPair failed:", e, params);
    throw e;
  }

  assertAllowedCreditToAgencyPhysicalCash(creditId, txTypeNorm);

  const ag = params.agencyId ?? null;
  const s0 = specForLedgerDocId(debitId, ag);
  const s1 = specForLedgerDocId(creditId, ag);

  const debitRef = ledgerAccountDocRef(companyId, debitId);
  const creditRef = ledgerAccountDocRef(companyId, creditId);
  const [debitSnap, creditSnap] = await Promise.all([tx.get(debitRef), tx.get(creditRef)]);

  assertExistingLedgerAccountMatchesSpec(debitSnap, debitId, s0.type);
  assertExistingLedgerAccountMatchesSpec(creditSnap, creditId, s1.type);

  const debitBal = Number((debitSnap.data() as { balance?: number } | undefined)?.balance ?? 0);
  const creditBal = Number((creditSnap.data() as { balance?: number } | undefined)?.balance ?? 0);
  const debitAfter = debitBal - ledgerAmount;
  const creditAfter = creditBal + ledgerAmount;

  if (!allowsNegativeBalance(debitId) && debitAfter < -0.0001) {
    throw new Error(`[ledger] Solde insuffisant sur le compte débit ${debitId} (${debitBal} < ${ledgerAmount})`);
  }

  const existingFlags = [debitSnap.exists(), creditSnap.exists()];
  ensureLedgerAccountDocsInTransaction(
    tx,
    companyId,
    currency,
    [
      {
        docId: debitId,
        type: s0.type,
        agencyId: s0.agencyId,
        label: s0.label,
        includeInLiquidity: s0.includeInLiquidity,
      },
      {
        docId: creditId,
        type: s1.type,
        agencyId: s1.agencyId,
        label: s1.label,
        includeInLiquidity: s1.includeInLiquidity,
      },
    ],
    existingFlags
  );

  // Synchronize agency cash mirror accounts from exact ledger balances (not increments).
  const mirrorTargetsByAgency = new Map<
    string,
    { ref: ReturnType<typeof financialAccountRef>; balance: number }
  >();
  if (s0.type === "cash" && s0.agencyId) {
    mirrorTargetsByAgency.set(s0.agencyId, {
      ref: financialAccountRef(companyId, agencyCashAccountId(s0.agencyId)),
      balance: debitAfter,
    });
  }
  if (s1.type === "cash" && s1.agencyId) {
    mirrorTargetsByAgency.set(s1.agencyId, {
      ref: financialAccountRef(companyId, agencyCashAccountId(s1.agencyId)),
      balance: creditAfter,
    });
  }
  const mirrorTargets = Array.from(mirrorTargetsByAgency.values());
  const mirrorSnaps = mirrorTargets.length
    ? await Promise.all(mirrorTargets.map((target) => tx.get(target.ref)))
    : [];

  tx.update(debitRef, { balance: increment(-ledgerAmount), updatedAt: serverTimestamp() });
  tx.update(creditRef, { balance: increment(ledgerAmount), updatedAt: serverTimestamp() });
  mirrorTargets.forEach((target, index) => {
    if (!mirrorSnaps[index]?.exists()) return;
    tx.update(target.ref, { currentBalance: target.balance, updatedAt: serverTimestamp() });
  });

  const newRef = doc(financialTransactionsRef(companyId));
  const kpiChannel = isGuichetChannel(params.paymentChannel, params.source) ? "guichet" : "online";
  const paymentMethod = resolveFinancialPaymentMethod({
    type: params.type,
    paymentMethod: params.paymentMethod ?? null,
    paymentProvider: params.paymentProvider ?? null,
    paymentChannel: params.paymentChannel ?? kpiChannel,
    source: params.source,
    metadata: params.metadata ?? null,
  });
  const paymentProviderStored =
    params.paymentProvider ?? (typeof params.metadata?.provider === "string" ? params.metadata.provider : null);
  const storedAmount = txTypeNorm === "refund" ? -ledgerAmount : ledgerAmount;
  const payload: FinancialTransactionDoc = {
    type: txTypeNorm,
    source,
    amount: storedAmount,
    currency: params.currency ?? "XOF",
    companyId,
    agencyId: params.agencyId ?? null,
    reservationId: params.reservationId ?? null,
    debitAccountId: debitId,
    creditAccountId: creditId,
    debitAccountType: ledgerMirrorTypeFromKind(s0.type),
    creditAccountType: ledgerMirrorTypeFromKind(s1.type),
    balanceAfter: creditAfter,
    status: params.status ?? defaultStatusForType(txTypeNorm),
    performedAt: params.performedAt ?? Timestamp.now(),
    createdAt: Timestamp.now(),
    metadata: { ...(params.metadata ?? {}), debitAfter, creditAfter },
    referenceType: params.referenceType,
    referenceId: params.referenceId,
    uniqueReferenceKey,
    paymentChannel: params.paymentChannel ?? kpiChannel,
    paymentMethod,
    paymentProvider: paymentProviderStored,
  };
  tx.set(newRef, payload);
  tx.set(idempotencyRef(companyId, uniqueReferenceKey), {
    transactionId: newRef.id,
    createdAt: serverTimestamp(),
  });
  return { transactionId: newRef.id, skippedDuplicate: false };
}

export async function createFinancialTransaction(
  params: ApplyFinancialTransactionParams
): Promise<string> {
  let createdId = "";
  await runTransaction(db, async (tx) => {
    const r = await applyFinancialTransactionInExistingFirestoreTransaction(tx, params);
    createdId = r.transactionId;
  });
  return createdId;
}

export async function findFinancialTransactionByReference(
  companyId: string,
  referenceType: ReferenceType | "cash_transfer",
  referenceId: string
): Promise<{ id: string; data: FinancialTransactionDoc } | null> {
  const q = query(
    financialTransactionsRef(companyId),
    where("referenceType", "==", referenceType),
    where("referenceId", "==", referenceId),
    limit(1)
  );
  const snap = await getDocs(q);
  if (snap.empty) return null;
  return { id: snap.docs[0].id, data: snap.docs[0].data() as FinancialTransactionDoc };
}

export async function getFinancialTransactionById(
  companyId: string,
  transactionId: string
): Promise<{ id: string; data: FinancialTransactionDoc } | null> {
  const ref = doc(db, "companies", companyId, FINANCIAL_TRANSACTIONS_COLLECTION, transactionId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;
  return { id: snap.id, data: snap.data() as FinancialTransactionDoc };
}

/** Remboursements ledger liés à une écriture d’origine (referenceType financial_transaction). */
export async function listRefundsForOriginalLedgerTransaction(
  companyId: string,
  originalTransactionId: string
): Promise<Array<FinancialTransactionDoc & { id: string }>> {
  const q = query(
    financialTransactionsRef(companyId),
    where("type", "==", "refund"),
    where("referenceType", "==", "financial_transaction"),
    where("referenceId", "==", originalTransactionId),
    limit(10)
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as FinancialTransactionDoc) }));
}

export async function listFinancialTransactionsByPeriod(
  companyId: string,
  start: Timestamp,
  end: Timestamp,
  agencyId?: string
): Promise<Array<FinancialTransactionDoc & { id: string }>> {
  const constraints: any[] = [
    where("performedAt", ">=", start),
    where("performedAt", "<=", end),
    orderBy("performedAt", "asc"),
    limit(5000),
  ];
  if (agencyId) constraints.unshift(where("agencyId", "==", agencyId));
  try {
    const snap = await getDocs(query(financialTransactionsRef(companyId), ...constraints));
    const rows = snap.docs.map((d) => ({ id: d.id, ...(d.data() as FinancialTransactionDoc) }));
    if (rows.length > 0 || !agencyId) {
      return rows;
    }
    // Legacy fallback: older docs may have createdAt but no performedAt.
    const fallbackSnap = await getDocs(
      query(
        financialTransactionsRef(companyId),
        where("createdAt", ">=", start),
        where("createdAt", "<=", end),
        orderBy("createdAt", "asc"),
        limit(5000)
      )
    );
    return fallbackSnap.docs
      .map((d) => ({ id: d.id, ...(d.data() as FinancialTransactionDoc) }))
      .filter((row) => String(row.agencyId ?? "") === agencyId);
  } catch (error) {
    const code = (error as { code?: string } | null)?.code;
    if (code !== "failed-precondition") {
      throw error;
    }
    // Missing index fallback: query by createdAt then filter agency in memory.
    const fallbackSnap = await getDocs(
      query(
        financialTransactionsRef(companyId),
        where("createdAt", ">=", start),
        where("createdAt", "<=", end),
        orderBy("createdAt", "asc"),
        limit(5000)
      )
    );
    const rows = fallbackSnap.docs.map((d) => ({ id: d.id, ...(d.data() as FinancialTransactionDoc) }));
    return agencyId ? rows.filter((row) => String(row.agencyId ?? "") === agencyId) : rows;
  }
}

/** KPI encaissements : transactions confirmées (hors pending/failed). */
export function isConfirmedTransactionStatus(s: FinancialTransactionStatus | undefined): boolean {
  if (!s) return true;
  if (s === "failed" || s === "pending" || s === "rejected") return false;
  if (s === "confirmed" || s === "received" || s === "verified" || s === "refunded") return true;
  return true;
}

/**
 * Somme des encaissements ledger (payment_received confirmés) pour des reservationId (ex. shipmentId courrier).
 * Source de vérité : financialTransactions uniquement.
 */
export async function sumPaymentReceivedForReservationIds(
  companyId: string,
  reservationIds: string[]
): Promise<number> {
  const unique = [...new Set(reservationIds.filter(Boolean))];
  let total = 0;
  for (const rid of unique) {
    const q = query(
      financialTransactionsRef(companyId),
      where("type", "==", "payment_received"),
      where("reservationId", "==", rid),
      limit(25)
    );
    const snap = await getDocs(q);
    for (const d of snap.docs) {
      const row = d.data() as FinancialTransactionDoc;
      if (!isConfirmedTransactionStatus(row.status)) continue;
      const amt = Number(row.amount ?? 0);
      if (amt > 0) total += amt;
    }
  }
  return total;
}

export { getLiquidityFromAccounts } from "./ledgerAccounts";
