
import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  type QueryConstraint,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
} from "firebase/firestore";
import { db } from "@/firebaseConfig";
import { financialAccountRef } from "@/modules/compagnie/treasury/financialAccounts";
import { agencyCashAccountId } from "@/modules/compagnie/treasury/types";
import {
  agencyDepositToBank,
  bankWithdrawalToAgency,
} from "@/modules/compagnie/treasury/treasuryTransferService";
import {
  upsertBankDepositDocument,
  upsertInternalTreasuryTransferDocument,
  upsertTreasuryTransferDocument,
} from "@/modules/finance/documents/financialDocumentsService";

export type TransferRequestFlowType = "bank_deposit" | "inter_agency_transfer";

export type TransferRequestStatus =
  | "pending_manager"
  | "pending_head_accountant"
  | "pending_dg"
  | "authorized"
  | "in_transit_bank"
  | "deposited_bank"
  | "in_transit_inter_agency"
  | "received_inter_agency"
  | "approved"
  | "rejected"
  | "executed";

export type TransferApprovalLevel = "agency_only" | "head_accountant" | "dg";
export type TransferCaptureMode = "normal" | "after_entry";

export type TransferRequestDoc = {
  companyId: string;
  agencyId: string;
  flowType: TransferRequestFlowType;
  destinationAgencyId: string | null;
  fromAccountId: string;
  toAccountId: string;
  relayBankAccountId: string | null;
  bankBranchName: string | null;
  amount: number;
  currency: string;
  description: string | null;
  plannedDate: Timestamp | null;
  plannedExecutorName: string | null;
  plannedExecutorUid: string | null;
  executionObservation: string | null;
  approvalLevelRequired: TransferApprovalLevel;
  status: TransferRequestStatus;
  initiatedBy: string;
  initiatedByRole: string | null;
  managerDecisionBy: string | null;
  managerDecisionAt: Timestamp | null;
  managerDecisionReason: string | null;
  headAccountantDecisionBy: string | null;
  headAccountantDecisionAt: Timestamp | null;
  headAccountantDecisionReason: string | null;
  dgDecisionBy: string | null;
  dgDecisionAt: Timestamp | null;
  dgDecisionReason: string | null;
  authorizedBy: string | null;
  authorizedAt: Timestamp | null;
  inTransitBy: string | null;
  inTransitAt: Timestamp | null;
  depositConfirmedBy: string | null;
  depositConfirmedAt: Timestamp | null;
  receivedBy: string | null;
  receivedAt: Timestamp | null;
  amountDeposited: number | null;
  amountReceived: number | null;
  receivedDifference: number | null;
  effectiveOperationDate: Timestamp | null;
  effectiveOperationHour: string | null;
  bankReceiptNumber: string | null;
  manualReceiptNumber: string | null;
  captureMode: TransferCaptureMode;
  manualDocumentUsed: boolean;
  manualDocumentType: string | null;
  manualDocumentNumber: string | null;
  regularizedByUid: string | null;
  regularizedByName: string | null;
  regularizedAt: Timestamp | null;
  executedBy: string | null;
  executedAt: Timestamp | null;
  idempotencyKey: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
};

const COLLECTION = "treasuryTransferRequests";

export const TRANSFER_INITIATOR_ROLES = ["agency_accountant", "admin_compagnie"] as const;
export const TRANSFER_MANAGER_ROLES = ["chefAgence", "superviseur", "admin_compagnie"] as const;
export const TRANSFER_HEAD_ACCOUNTANT_ROLES = [
  "company_accountant",
  "financial_director",
  "admin_compagnie",
] as const;
export const TRANSFER_DG_ROLES = ["admin_compagnie", "company_ceo"] as const;
export const TRANSFER_EXECUTOR_ROLES = [
  "agency_accountant",
  "chefAgence",
  "superviseur",
  "admin_compagnie",
] as const;

const INITIATOR_SET = new Set<string>(TRANSFER_INITIATOR_ROLES);
const MANAGER_SET = new Set<string>(TRANSFER_MANAGER_ROLES);
const HEAD_ACCOUNTANT_SET = new Set<string>(TRANSFER_HEAD_ACCOUNTANT_ROLES);
const DG_SET = new Set<string>(TRANSFER_DG_ROLES);
const EXECUTOR_SET = new Set<string>(TRANSFER_EXECUTOR_ROLES);

export const TRANSFER_HEAD_ACCOUNTANT_THRESHOLD = 750_000;
export const TRANSFER_DG_THRESHOLD = 2_500_000;
const INTER_AGENCY_OUTBOUND_DOC_TITLE = "Bordereau de sortie inter-agence";
const INTER_AGENCY_RECEPTION_DOC_TITLE = "Recu de reception inter-agence";
const INTER_AGENCY_OUTBOUND_DOC_EVENT = "sortie";
const INTER_AGENCY_RECEPTION_DOC_EVENT = "reception";

type ManualCaptureInput = {
  captureMode?: TransferCaptureMode | null;
  manualDocumentUsed?: boolean | null;
  manualDocumentType?: string | null;
  manualDocumentNumber?: string | null;
  regularizedByUid?: string | null;
  regularizedByName?: string | null;
  regularizedAt?: Date | Timestamp | string | number | null;
};

function requestsRef(companyId: string) {
  return collection(db, `companies/${companyId}/${COLLECTION}`);
}

function requestRef(companyId: string, requestId: string) {
  return doc(db, `companies/${companyId}/${COLLECTION}/${requestId}`);
}

function normalizeRoles(roles: string[] | null | undefined): string[] {
  return (roles ?? []).map((r) => String(r ?? "").trim()).filter(Boolean);
}

function canInitiateWithRoles(roles: string[]): boolean {
  return roles.some((r) => INITIATOR_SET.has(r));
}

function firstInitiatorRole(roles: string[]): string | null {
  for (const r of roles) {
    if (INITIATOR_SET.has(r)) return r;
  }
  return null;
}

function canValidateWithRoles(roles: string[]): boolean {
  return roles.some((r) => MANAGER_SET.has(r));
}

function firstManagerRole(roles: string[]): string | null {
  for (const r of roles) {
    if (MANAGER_SET.has(r)) return r;
  }
  return null;
}

function canValidateByHeadAccountant(roles: string[]): boolean {
  return roles.some((r) => HEAD_ACCOUNTANT_SET.has(r));
}

function firstHeadAccountantRole(roles: string[]): string | null {
  for (const r of roles) {
    if (HEAD_ACCOUNTANT_SET.has(r)) return r;
  }
  return null;
}

function canValidateByDg(roles: string[]): boolean {
  return roles.some((r) => DG_SET.has(r));
}

function firstDgRole(roles: string[]): string | null {
  for (const r of roles) {
    if (DG_SET.has(r)) return r;
  }
  return null;
}

function canExecuteWithRoles(roles: string[]): boolean {
  return roles.some((r) => EXECUTOR_SET.has(r));
}

function firstExecutorRole(roles: string[]): string | null {
  for (const r of roles) {
    if (EXECUTOR_SET.has(r)) return r;
  }
  return null;
}

function toTimestampOrNull(value: unknown): Timestamp | null {
  if (!value) return null;
  if (value instanceof Timestamp) return value;
  if (value instanceof Date) return Timestamp.fromDate(value);
  if (typeof value === "number" && Number.isFinite(value)) return Timestamp.fromMillis(value);
  if (typeof value === "string") {
    const ms = Date.parse(value);
    if (!Number.isNaN(ms)) return Timestamp.fromMillis(ms);
  }
  return null;
}

function computeApprovalLevel(amount: number): TransferApprovalLevel {
  if (amount >= TRANSFER_DG_THRESHOLD) return "dg";
  if (amount >= TRANSFER_HEAD_ACCOUNTANT_THRESHOLD) return "head_accountant";
  return "agency_only";
}

export function isSimpleLocalBankDepositEligible(amount: number): boolean {
  return computeApprovalLevel(amount) === "agency_only";
}

function normalizeTransferStatus(status: unknown): TransferRequestStatus {
  const token = String(status ?? "").trim();
  if (token === "approved") return "authorized";
  if (token === "executed") return "deposited_bank";
  if (
    token === "pending_manager" ||
    token === "pending_head_accountant" ||
    token === "pending_dg" ||
    token === "authorized" ||
    token === "in_transit_bank" ||
    token === "deposited_bank" ||
    token === "in_transit_inter_agency" ||
    token === "received_inter_agency" ||
    token === "rejected"
  ) {
    return token;
  }
  return "pending_manager";
}

function isLegacyLocalBankDepositStatus(status: TransferRequestStatus): boolean {
  return (
    status === "pending_manager" ||
    status === "pending_head_accountant" ||
    status === "pending_dg" ||
    status === "authorized" ||
    status === "in_transit_bank"
  );
}

function normalizeManualCapture(input: ManualCaptureInput | null | undefined) {
  const captureMode: TransferCaptureMode =
    input?.captureMode === "after_entry" ? "after_entry" : "normal";
  return {
    captureMode,
    manualDocumentUsed: Boolean(input?.manualDocumentUsed),
    manualDocumentType: String(input?.manualDocumentType ?? "").trim() || null,
    manualDocumentNumber: String(input?.manualDocumentNumber ?? "").trim() || null,
    regularizedByUid: String(input?.regularizedByUid ?? "").trim() || null,
    regularizedByName: String(input?.regularizedByName ?? "").trim() || null,
    regularizedAt: toTimestampOrNull(input?.regularizedAt ?? null),
  };
}

function assertSensitiveFlowSegregation(req: TransferRequestDoc, actorUid: string) {
  if (req.approvalLevelRequired === "agency_only") return;
  const blocked = new Set<string>(
    [
      req.initiatedBy,
      req.managerDecisionBy,
      req.headAccountantDecisionBy,
      req.dgDecisionBy,
      req.authorizedBy,
    ]
      .map((v) => String(v ?? "").trim())
      .filter(Boolean)
  );
  if (blocked.has(actorUid)) {
    throw new Error(
      "Flux sensible: un meme acteur ne peut pas demander, autoriser et executer seul une grosse sortie."
    );
  }
}

async function resolveTransferAccountDetails(params: {
  companyId: string;
  fromAccountId: string;
  toAccountId: string;
}): Promise<{
  sourceAccountLabel: string;
  destinationAccountLabel: string;
  bankName: string | null;
  accountNumber: string | null;
  accountHolder: string | null;
}> {
  const [fromSnap, toSnap] = await Promise.all([
    getDoc(financialAccountRef(params.companyId, params.fromAccountId)),
    getDoc(financialAccountRef(params.companyId, params.toAccountId)),
  ]);
  const fromData = fromSnap.exists() ? (fromSnap.data() as { accountName?: string }) : {};
  const toData = toSnap.exists()
    ? (toSnap.data() as {
        accountName?: string;
        accountNumber?: string;
        number?: string;
        titulaire?: string;
        holderName?: string;
      })
    : {};
  const bankId = params.toAccountId.startsWith("company_bank_")
    ? params.toAccountId.slice("company_bank_".length)
    : "";
  let bankName: string | null = null;
  if (bankId) {
    try {
      const bankSnap = await getDoc(doc(db, "companies", params.companyId, "companyBanks", bankId));
      if (bankSnap.exists()) {
        const bankData = bankSnap.data() as { name?: string };
        bankName = String(bankData.name ?? "").trim() || null;
      }
    } catch {
      bankName = null;
    }
  }
  return {
    sourceAccountLabel: String(fromData.accountName ?? "").trim() || params.fromAccountId,
    destinationAccountLabel: String(toData.accountName ?? "").trim() || params.toAccountId,
    bankName,
    accountNumber: String(toData.accountNumber ?? toData.number ?? "").trim() || null,
    accountHolder: String(toData.titulaire ?? toData.holderName ?? "").trim() || null,
  };
}

function mapRequestRow(id: string, row: TransferRequestDoc): TransferRequestDoc & { id: string } {
  const flowType = row.flowType ?? "bank_deposit";
  const normalizedStatus = normalizeTransferStatus(row.status);
  const computedApprovalLevel =
    row.approvalLevelRequired ?? computeApprovalLevel(Number(row.amount ?? 0));
  const isLocalBankDeposit = flowType === "bank_deposit";
  const forceDirectDepositMode = isLocalBankDeposit && isLegacyLocalBankDepositStatus(normalizedStatus);
  const effectiveStatus: TransferRequestStatus = forceDirectDepositMode
    ? "deposited_bank"
    : normalizedStatus;

  return {
    id,
    ...row,
    flowType,
    destinationAgencyId: row.destinationAgencyId ?? null,
    relayBankAccountId: row.relayBankAccountId ?? row.toAccountId ?? null,
    bankBranchName: row.bankBranchName ?? null,
    approvalLevelRequired: isLocalBankDeposit ? "agency_only" : computedApprovalLevel,
    status: effectiveStatus,
    managerDecisionBy: isLocalBankDeposit ? null : row.managerDecisionBy ?? null,
    managerDecisionAt: isLocalBankDeposit ? null : row.managerDecisionAt ?? null,
    managerDecisionReason: isLocalBankDeposit ? null : row.managerDecisionReason ?? null,
    headAccountantDecisionBy: isLocalBankDeposit ? null : row.headAccountantDecisionBy ?? null,
    headAccountantDecisionAt: isLocalBankDeposit ? null : row.headAccountantDecisionAt ?? null,
    headAccountantDecisionReason: isLocalBankDeposit ? null : row.headAccountantDecisionReason ?? null,
    dgDecisionBy: isLocalBankDeposit ? null : row.dgDecisionBy ?? null,
    dgDecisionAt: isLocalBankDeposit ? null : row.dgDecisionAt ?? null,
    dgDecisionReason: isLocalBankDeposit ? null : row.dgDecisionReason ?? null,
    authorizedBy: isLocalBankDeposit ? null : row.authorizedBy ?? null,
    authorizedAt: isLocalBankDeposit ? null : row.authorizedAt ?? null,
    inTransitBy: row.inTransitBy ?? row.executedBy ?? row.initiatedBy ?? null,
    inTransitAt: row.inTransitAt ?? row.executedAt ?? row.updatedAt ?? row.createdAt ?? null,
    depositConfirmedBy: row.depositConfirmedBy ?? row.executedBy ?? row.initiatedBy ?? null,
    depositConfirmedAt:
      row.depositConfirmedAt ?? row.executedAt ?? row.updatedAt ?? row.createdAt ?? null,
    amountDeposited:
      isLocalBankDeposit && effectiveStatus === "deposited_bank"
        ? Number(row.amountDeposited ?? row.amount ?? 0)
        : row.amountDeposited ?? null,
  };
}

export async function createTransferRequest(params: {
  companyId: string;
  agencyId: string;
  fromAccountId: string;
  toAccountId: string;
  bankBranchName?: string | null;
  amount: number;
  currency: string;
  description?: string | null;
  plannedDate?: Date | Timestamp | string | number | null;
  plannedExecutorName?: string | null;
  plannedExecutorUid?: string | null;
  executionObservation?: string | null;
  authorizedBy?: string | null;
  authorizedByRole?: string | null;
  simpleLocalMode?: boolean;
  manualCapture?: ManualCaptureInput | null;
  initiatedBy: string;
  initiatedByRole?: string | null;
  initiatedByRoles?: string[] | null;
}): Promise<string> {
  const roleList = normalizeRoles(
    params.initiatedByRoles?.length
      ? params.initiatedByRoles
      : params.initiatedByRole
        ? [params.initiatedByRole]
        : []
  );
  if (!canInitiateWithRoles(roleList)) {
    throw new Error("Seul le comptable agence peut initier un versement.");
  }
  const amount = Number(params.amount);
  if (!Number.isFinite(amount) || amount <= 0) throw new Error("Montant invalide.");
  const initiatedRole = firstInitiatorRole(roleList) ?? params.initiatedByRole ?? null;
  const manual = normalizeManualCapture(params.manualCapture);
  return recordDirectLocalBankDeposit({
    companyId: params.companyId,
    agencyId: params.agencyId,
    fromAccountId: params.fromAccountId,
    toAccountId: params.toAccountId,
    bankBranchName: params.bankBranchName?.trim() || null,
    amount,
    currency: params.currency,
    operationDate: params.plannedDate ?? null,
    operationHour: null,
    bankReceiptNumber: null,
    manualReceiptNumber: manual.manualDocumentUsed ? manual.manualDocumentNumber : null,
    description: params.description?.trim() || "Dépôt banque local",
    observation: params.executionObservation?.trim() || null,
    manualCapture: params.manualCapture ?? null,
    actorId: params.initiatedBy,
    actorName: params.plannedExecutorName?.trim() || null,
    actorRole: initiatedRole,
    actorRoles: roleList,
  });
}

export async function recordDirectLocalBankDeposit(params: {
  companyId: string;
  agencyId: string;
  fromAccountId: string;
  toAccountId: string;
  bankBranchName?: string | null;
  amount: number;
  currency: string;
  operationDate?: Date | Timestamp | string | number | null;
  operationHour?: string | null;
  bankReceiptNumber?: string | null;
  manualReceiptNumber?: string | null;
  description?: string | null;
  observation?: string | null;
  manualCapture?: ManualCaptureInput | null;
  actorId: string;
  actorName?: string | null;
  actorRole?: string | null;
  actorRoles?: string[] | null;
}): Promise<string> {
  const roleList = normalizeRoles(
    params.actorRoles?.length
      ? params.actorRoles
      : params.actorRole
        ? [params.actorRole]
        : []
  );
  if (!canInitiateWithRoles(roleList)) {
    throw new Error("Seul le comptable agence peut enregistrer ce depot local.");
  }
  const actorRole = firstInitiatorRole(roleList) ?? "agency_accountant";
  const amount = Number(params.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("Montant versé invalide.");
  }

  const ref = doc(requestsRef(params.companyId));
  const now = Timestamp.now();
  const operationDateTs = toTimestampOrNull(params.operationDate ?? null) ?? now;
  const manual = normalizeManualCapture(params.manualCapture);

  await agencyDepositToBank({
    companyId: params.companyId,
    agencyCashAccountId: params.fromAccountId,
    companyBankAccountId: params.toAccountId,
    amount,
    currency: params.currency,
    performedBy: params.actorId,
    performedByRole: actorRole,
    idempotencyKey: `direct_bank_deposit_${ref.id}`,
    description: params.description?.trim() || "Dépôt banque local enregistré",
  });

  const payload: TransferRequestDoc = {
    companyId: params.companyId,
    agencyId: params.agencyId,
    flowType: "bank_deposit",
    destinationAgencyId: null,
    fromAccountId: params.fromAccountId,
    toAccountId: params.toAccountId,
    relayBankAccountId: params.toAccountId,
    bankBranchName: params.bankBranchName?.trim() || null,
    amount,
    currency: params.currency,
    description: params.description?.trim() || "Dépôt banque local",
    plannedDate: operationDateTs,
    plannedExecutorName: params.actorName?.trim() || null,
    plannedExecutorUid: params.actorId,
    executionObservation: params.observation?.trim() || null,
    approvalLevelRequired: "agency_only",
    status: "deposited_bank",
    initiatedBy: params.actorId,
    initiatedByRole: actorRole,
    managerDecisionBy: null,
    managerDecisionAt: null,
    managerDecisionReason: null,
    headAccountantDecisionBy: null,
    headAccountantDecisionAt: null,
    headAccountantDecisionReason: null,
    dgDecisionBy: null,
    dgDecisionAt: null,
    dgDecisionReason: null,
    authorizedBy: null,
    authorizedAt: null,
    inTransitBy: params.actorId,
    inTransitAt: operationDateTs,
    depositConfirmedBy: params.actorId,
    depositConfirmedAt: now,
    receivedBy: null,
    receivedAt: null,
    amountDeposited: amount,
    amountReceived: null,
    receivedDifference: null,
    effectiveOperationDate: operationDateTs,
    effectiveOperationHour: params.operationHour?.trim() || null,
    bankReceiptNumber: params.bankReceiptNumber?.trim() || null,
    manualReceiptNumber: params.manualReceiptNumber?.trim() || null,
    captureMode: manual.captureMode,
    manualDocumentUsed: manual.manualDocumentUsed,
    manualDocumentType: manual.manualDocumentType,
    manualDocumentNumber: manual.manualDocumentNumber,
    regularizedByUid: manual.regularizedByUid,
    regularizedByName: manual.regularizedByName,
    regularizedAt: manual.regularizedAt,
    executedBy: params.actorId,
    executedAt: now,
    idempotencyKey: `direct_bank_deposit_req_${ref.id}`,
    createdAt: now,
    updatedAt: now,
  };

  await setDoc(ref, payload);

  try {
    const accountDetails = await resolveTransferAccountDetails({
      companyId: params.companyId,
      fromAccountId: params.fromAccountId,
      toAccountId: params.toAccountId,
    });

    await upsertTreasuryTransferDocument({
      companyId: params.companyId,
      requestId: ref.id,
      agencyId: params.agencyId,
      sourceAccountLabel: accountDetails.sourceAccountLabel,
      destinationAccountLabel: accountDetails.destinationAccountLabel,
      bankName: accountDetails.bankName,
      bankBranchName: payload.bankBranchName,
      amount,
      currency: params.currency,
      movementType: "agency_cash_to_company_bank",
      initiator: {
        uid: params.actorId,
        role: actorRole,
        name: params.actorName?.trim() || null,
      },
      validator: null,
      carrier: {
        uid: params.actorId,
        role: actorRole,
        name: params.actorName?.trim() || null,
      },
      observations:
        params.observation?.trim() || "Depot local enregistre apres versement effectif.",
      bankReference:
        params.bankReceiptNumber?.trim() ||
        params.manualReceiptNumber?.trim() ||
        payload.idempotencyKey,
      status: "ready_to_print",
      createdByUid: params.actorId,
      occurredAt: operationDateTs,
    });

    await upsertBankDepositDocument({
      companyId: params.companyId,
      sourceId: ref.id,
      agencyId: params.agencyId,
      compteSourceLibelle: accountDetails.sourceAccountLabel,
      banqueNom: accountDetails.bankName,
      agenceBancaireNom: payload.bankBranchName,
      numeroCompte: accountDetails.accountNumber,
      titulaireCompte: accountDetails.accountHolder,
      referenceDepotBancaire:
        params.bankReceiptNumber?.trim() ||
        params.manualReceiptNumber?.trim() ||
        payload.idempotencyKey,
      montantVerse: amount,
      devise: params.currency,
      natureFonds: "remise_caisse_agence",
      motifVersement:
        payload.description ?? "Versement caisse agence vers banque compagnie",
      commentaire: params.observation?.trim() || null,
      initiateur: {
        uid: params.actorId,
        role: actorRole,
        name: params.actorName?.trim() || null,
      },
      valideur: null,
      executant: {
        uid: params.actorId,
        role: actorRole,
        name: params.actorName?.trim() || null,
      },
      preuveJointeDisponible: false,
      nombrePiecesJointes: 0,
      dateExecution: operationDateTs,
      status: "ready_to_print",
      createdByUid: params.actorId,
    });
  } catch (docError) {
    console.error("[treasuryTransfer] echec generation documents depot direct", {
      companyId: params.companyId,
      requestId: ref.id,
      docError,
    });
  }

  return ref.id;
}

export async function createInterAgencyTransferRequest(params: {
  companyId: string;
  agencyId: string;
  destinationAgencyId: string;
  fromAccountId: string;
  relayBankAccountId: string;
  amount: number;
  currency: string;
  description?: string | null;
  plannedDate?: Date | Timestamp | string | number | null;
  plannedExecutorName?: string | null;
  plannedExecutorUid?: string | null;
  executionObservation?: string | null;
  manualCapture?: ManualCaptureInput | null;
  initiatedBy: string;
  initiatedByRole?: string | null;
  initiatedByRoles?: string[] | null;
}): Promise<string> {
  if (!params.destinationAgencyId || params.destinationAgencyId === params.agencyId) {
    throw new Error("L'agence destination doit etre differente de l'agence source.");
  }
  const roleList = normalizeRoles(
    params.initiatedByRoles?.length
      ? params.initiatedByRoles
      : params.initiatedByRole
        ? [params.initiatedByRole]
        : []
  );
  if (!canInitiateWithRoles(roleList)) {
    throw new Error("Seul le comptable agence peut initier ce transfert inter-agence.");
  }

  const amount = Number(params.amount);
  if (!Number.isFinite(amount) || amount <= 0) throw new Error("Montant invalide.");
  const role = firstInitiatorRole(roleList);

  const ref = doc(requestsRef(params.companyId));
  const now = Timestamp.now();
  const manual = normalizeManualCapture(params.manualCapture);
  const approvalLevelRequired = computeApprovalLevel(amount);

  const payload: TransferRequestDoc = {
    companyId: params.companyId,
    agencyId: params.agencyId,
    flowType: "inter_agency_transfer",
    destinationAgencyId: params.destinationAgencyId,
    fromAccountId: params.fromAccountId,
    toAccountId: params.relayBankAccountId,
    relayBankAccountId: params.relayBankAccountId,
    bankBranchName: null,
    amount,
    currency: params.currency,
    description: params.description?.trim() || null,
    plannedDate: toTimestampOrNull(params.plannedDate ?? null),
    plannedExecutorName: params.plannedExecutorName?.trim() || null,
    plannedExecutorUid: params.plannedExecutorUid?.trim() || null,
    executionObservation: params.executionObservation?.trim() || null,
    approvalLevelRequired,
    status: "pending_manager",
    initiatedBy: params.initiatedBy,
    initiatedByRole: role ?? null,
    managerDecisionBy: null,
    managerDecisionAt: null,
    managerDecisionReason: null,
    headAccountantDecisionBy: null,
    headAccountantDecisionAt: null,
    headAccountantDecisionReason: null,
    dgDecisionBy: null,
    dgDecisionAt: null,
    dgDecisionReason: null,
    authorizedBy: null,
    authorizedAt: null,
    inTransitBy: null,
    inTransitAt: null,
    depositConfirmedBy: null,
    depositConfirmedAt: null,
    receivedBy: null,
    receivedAt: null,
    amountDeposited: null,
    amountReceived: null,
    receivedDifference: null,
    effectiveOperationDate: null,
    effectiveOperationHour: null,
    bankReceiptNumber: null,
    manualReceiptNumber: null,
    captureMode: manual.captureMode,
    manualDocumentUsed: manual.manualDocumentUsed,
    manualDocumentType: manual.manualDocumentType,
    manualDocumentNumber: manual.manualDocumentNumber,
    regularizedByUid: manual.regularizedByUid,
    regularizedByName: manual.regularizedByName,
    regularizedAt: manual.regularizedAt,
    executedBy: null,
    executedAt: null,
    idempotencyKey: `inter_agency_transfer_req_${ref.id}`,
    createdAt: now,
    updatedAt: now,
  };

  await setDoc(ref, payload);
  try {
    await upsertInternalTreasuryTransferDocument({
      companyId: params.companyId,
      sourceId: ref.id,
      eventKey: INTER_AGENCY_OUTBOUND_DOC_EVENT,
      documentTitle: INTER_AGENCY_OUTBOUND_DOC_TITLE,
      sourceLabel: INTER_AGENCY_OUTBOUND_DOC_TITLE,
      agencyId: params.agencyId,
      sourceTypeLabel: "Caisse agence source",
      sourceLibelle: params.agencyId,
      destinationTypeLabel: "Agence relais / hub",
      destinationLibelle: params.destinationAgencyId,
      montant: amount,
      devise: params.currency,
      motif: payload.description ?? "Transfert physique inter-agence",
      initiateur: {
        uid: params.initiatedBy,
        role: role ?? "agency_accountant",
      },
      observations:
        payload.executionObservation ??
        "Bordereau de sortie inter-agence (en attente d'autorisation).",
      dateCreation: now,
      status: "draft",
      createdByUid: params.initiatedBy,
    });
  } catch (docError) {
    console.error("[treasuryTransfer] echec creation document inter-agence", {
      companyId: params.companyId,
      requestId: ref.id,
      docError,
    });
  }
  return ref.id;
}

export async function listTransferRequests(
  companyId: string,
  options?: {
    agencyId?: string;
    destinationAgencyId?: string;
    flowType?: TransferRequestFlowType;
    status?: TransferRequestStatus;
    statusIn?: TransferRequestStatus[];
    limitCount?: number;
  }
): Promise<(TransferRequestDoc & { id: string })[]> {
  const constraints: QueryConstraint[] = [];
  if (options?.agencyId) constraints.push(where("agencyId", "==", options.agencyId));
  if (options?.destinationAgencyId) {
    constraints.push(where("destinationAgencyId", "==", options.destinationAgencyId));
  }
  if (options?.flowType) constraints.push(where("flowType", "==", options.flowType));
  if (options?.statusIn && options.statusIn.length > 0) {
    constraints.push(where("status", "in", options.statusIn.slice(0, 10)));
  } else if (options?.status) {
    constraints.push(where("status", "==", options.status));
  }

  const q = query(
    requestsRef(companyId),
    ...constraints,
    orderBy("createdAt", "desc"),
    limit(options?.limitCount ?? 50)
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => mapRequestRow(d.id, d.data() as TransferRequestDoc));
}

async function loadTransferRequest(companyId: string, requestId: string): Promise<TransferRequestDoc & { id: string }> {
  const snap = await getDoc(requestRef(companyId, requestId));
  if (!snap.exists()) throw new Error("Demande introuvable.");
  return mapRequestRow(snap.id, snap.data() as TransferRequestDoc);
}

export async function approveTransferRequest(params: {
  companyId: string;
  requestId: string;
  managerId: string;
  managerRole?: string | null;
  managerRoles?: string[] | null;
}): Promise<void> {
  const roleList = normalizeRoles(
    params.managerRoles?.length
      ? params.managerRoles
      : params.managerRole
        ? [params.managerRole]
        : []
  );
  if (!canValidateWithRoles(roleList)) {
    throw new Error("Seul le chef d'agence peut valider ce versement.");
  }
  const role = firstManagerRole(roleList);
  const req = await loadTransferRequest(params.companyId, params.requestId);

  if (req.flowType === "bank_deposit") {
    throw new Error("Le dépôt banque local est enregistré directement, sans visa.");
  }

  if (req.status !== "pending_manager") {
    throw new Error("Cette demande n'est plus en attente de validation.");
  }
  if (req.initiatedBy === params.managerId) {
    throw new Error("L'initiateur ne peut pas valider sa propre demande.");
  }

  const nextStatus: TransferRequestStatus =
    req.approvalLevelRequired === "agency_only" ? "authorized" : "pending_head_accountant";
  const now = Timestamp.now();

  await updateDoc(requestRef(params.companyId, params.requestId), {
    status: nextStatus,
    managerDecisionBy: params.managerId,
    managerDecisionAt: now,
    managerDecisionReason: null,
    authorizedBy: nextStatus === "authorized" ? params.managerId : null,
    authorizedAt: nextStatus === "authorized" ? now : null,
    updatedAt: serverTimestamp(),
  });

  try {
    await upsertInternalTreasuryTransferDocument({
      companyId: req.companyId,
      sourceId: params.requestId,
      eventKey: INTER_AGENCY_OUTBOUND_DOC_EVENT,
      documentTitle: INTER_AGENCY_OUTBOUND_DOC_TITLE,
      sourceLabel: INTER_AGENCY_OUTBOUND_DOC_TITLE,
      agencyId: req.agencyId,
      sourceTypeLabel: "Caisse agence source",
      sourceLibelle: req.agencyId,
      destinationTypeLabel: "Agence relais / hub",
      destinationLibelle: req.destinationAgencyId ?? "-",
      montant: Number(req.amount ?? 0),
      devise: req.currency,
      motif: req.description ?? "Transfert physique inter-agence",
      initiateur: {
        uid: req.initiatedBy,
        role: req.initiatedByRole ?? "agency_accountant",
      },
      valideur: {
        uid: params.managerId,
        role: role ?? "chefAgence",
      },
      observations:
        req.approvalLevelRequired === "agency_only"
          ? "Sortie inter-agence autorisee."
          : "Visa agence enregistre, attente validation siege.",
      dateCreation: now,
      status: req.approvalLevelRequired === "agency_only" ? "ready_to_print" : "draft",
      createdByUid: params.managerId,
    });
  } catch (docError) {
    console.error("[treasuryTransfer] echec mise a jour document validation agence", {
      companyId: params.companyId,
      requestId: params.requestId,
      docError,
    });
  }
}

export async function approveTransferByHeadAccountant(params: {
  companyId: string;
  requestId: string;
  approverId: string;
  approverRole?: string | null;
  approverRoles?: string[] | null;
}): Promise<void> {
  const roleList = normalizeRoles(
    params.approverRoles?.length
      ? params.approverRoles
      : params.approverRole
        ? [params.approverRole]
        : []
  );
  if (!canValidateByHeadAccountant(roleList)) {
    throw new Error("Seul le chef comptable peut valider ce niveau.");
  }
  const role = firstHeadAccountantRole(roleList);
  const req = await loadTransferRequest(params.companyId, params.requestId);

  if (req.flowType === "bank_deposit") {
    throw new Error("Le dépôt banque local est enregistré directement, sans visa.");
  }

  if (req.status !== "pending_head_accountant") {
    throw new Error("Cette demande n'attend pas le visa du chef comptable.");
  }
  if (!req.managerDecisionBy) {
    throw new Error("Le visa chef d'agence est requis avant cette validation.");
  }
  if (req.initiatedBy === params.approverId || req.managerDecisionBy === params.approverId) {
    throw new Error("Le chef comptable doit etre distinct du demandeur et du validateur agence.");
  }

  const now = Timestamp.now();
  const nextStatus: TransferRequestStatus =
    req.approvalLevelRequired === "dg" ? "pending_dg" : "authorized";

  await updateDoc(requestRef(params.companyId, params.requestId), {
    status: nextStatus,
    headAccountantDecisionBy: params.approverId,
    headAccountantDecisionAt: now,
    headAccountantDecisionReason: null,
    authorizedBy: nextStatus === "authorized" ? params.approverId : null,
    authorizedAt: nextStatus === "authorized" ? now : null,
    updatedAt: serverTimestamp(),
  });

  try {
    await upsertInternalTreasuryTransferDocument({
      companyId: req.companyId,
      sourceId: params.requestId,
      eventKey: INTER_AGENCY_OUTBOUND_DOC_EVENT,
      documentTitle: INTER_AGENCY_OUTBOUND_DOC_TITLE,
      sourceLabel: INTER_AGENCY_OUTBOUND_DOC_TITLE,
      agencyId: req.agencyId,
      sourceTypeLabel: "Caisse agence source",
      sourceLibelle: req.agencyId,
      destinationTypeLabel: "Agence relais / hub",
      destinationLibelle: req.destinationAgencyId ?? "-",
      montant: Number(req.amount ?? 0),
      devise: req.currency,
      motif: req.description ?? "Transfert physique inter-agence",
      initiateur: { uid: req.initiatedBy, role: req.initiatedByRole ?? "agency_accountant" },
      valideur: { uid: params.approverId, role: role ?? "company_accountant" },
      observations:
        nextStatus === "authorized"
          ? "Visa chef comptable effectue. Sortie autorisee."
          : "Visa chef comptable effectue. Validation DG requise.",
      status: nextStatus === "authorized" ? "ready_to_print" : "draft",
      createdByUid: params.approverId,
      dateCreation: now,
    });
  } catch (docError) {
    console.error("[treasuryTransfer] echec mise a jour document visa chef comptable", {
      companyId: params.companyId,
      requestId: params.requestId,
      docError,
    });
  }
}

export async function approveTransferByDg(params: {
  companyId: string;
  requestId: string;
  approverId: string;
  approverRole?: string | null;
  approverRoles?: string[] | null;
}): Promise<void> {
  const roleList = normalizeRoles(
    params.approverRoles?.length
      ? params.approverRoles
      : params.approverRole
        ? [params.approverRole]
        : []
  );
  if (!canValidateByDg(roleList)) {
    throw new Error("Seul le DG peut valider ce niveau.");
  }
  const role = firstDgRole(roleList);
  const req = await loadTransferRequest(params.companyId, params.requestId);

  if (req.flowType === "bank_deposit") {
    throw new Error("Le dépôt banque local est enregistré directement, sans validation DG.");
  }

  if (req.status !== "pending_dg") {
    throw new Error("Cette demande n'attend pas de validation DG.");
  }
  if (!req.managerDecisionBy || !req.headAccountantDecisionBy) {
    throw new Error("Visa agence et visa chef comptable requis avant la validation DG.");
  }
  if (
    req.initiatedBy === params.approverId ||
    req.managerDecisionBy === params.approverId ||
    req.headAccountantDecisionBy === params.approverId
  ) {
    throw new Error("Le DG validateur doit etre distinct des acteurs precedents.");
  }

  const now = Timestamp.now();
  await updateDoc(requestRef(params.companyId, params.requestId), {
    status: "authorized",
    dgDecisionBy: params.approverId,
    dgDecisionAt: now,
    dgDecisionReason: null,
    authorizedBy: params.approverId,
    authorizedAt: now,
    updatedAt: serverTimestamp(),
  });

  try {
    await upsertInternalTreasuryTransferDocument({
      companyId: req.companyId,
      sourceId: params.requestId,
      eventKey: INTER_AGENCY_OUTBOUND_DOC_EVENT,
      documentTitle: INTER_AGENCY_OUTBOUND_DOC_TITLE,
      sourceLabel: INTER_AGENCY_OUTBOUND_DOC_TITLE,
      agencyId: req.agencyId,
      sourceTypeLabel: "Caisse agence source",
      sourceLibelle: req.agencyId,
      destinationTypeLabel: "Agence relais / hub",
      destinationLibelle: req.destinationAgencyId ?? "-",
      montant: Number(req.amount ?? 0),
      devise: req.currency,
      motif: req.description ?? "Transfert physique inter-agence",
      initiateur: { uid: req.initiatedBy, role: req.initiatedByRole ?? "agency_accountant" },
      valideur: { uid: params.approverId, role: role ?? "admin_compagnie" },
      observations: "Validation DG enregistree. Sortie inter-agence autorisee.",
      status: "ready_to_print",
      createdByUid: params.approverId,
      dateCreation: now,
    });
  } catch (docError) {
    console.error("[treasuryTransfer] echec mise a jour document validation DG", {
      companyId: params.companyId,
      requestId: params.requestId,
      docError,
    });
  }
}

export async function markTransferAsInTransit(params: {
  companyId: string;
  requestId: string;
  actorId: string;
  actorName?: string | null;
  actorRole?: string | null;
  actorRoles?: string[] | null;
  observation?: string | null;
  actualOperationDate?: Date | Timestamp | string | number | null;
  captureMode?: TransferCaptureMode | null;
  manualDocumentUsed?: boolean | null;
  manualDocumentType?: string | null;
  manualDocumentNumber?: string | null;
  regularizedByUid?: string | null;
  regularizedByName?: string | null;
}): Promise<void> {
  const roleList = normalizeRoles(
    params.actorRoles?.length
      ? params.actorRoles
      : params.actorRole
        ? [params.actorRole]
        : []
  );
  if (!canExecuteWithRoles(roleList)) {
    throw new Error("Role non autorise pour declarer la sortie physique.");
  }
  const role = firstExecutorRole(roleList);
  const req = await loadTransferRequest(params.companyId, params.requestId);

  if (req.flowType === "bank_deposit") {
    throw new Error("Le dépôt banque local est enregistré directement, sans étape transit.");
  }

  if (req.status !== "authorized") {
    throw new Error("La sortie physique n'est possible qu'apres autorisation complete.");
  }
  assertSensitiveFlowSegregation(req, params.actorId);

  const manual = normalizeManualCapture({
    captureMode: params.captureMode,
    manualDocumentUsed: params.manualDocumentUsed,
    manualDocumentType: params.manualDocumentType,
    manualDocumentNumber: params.manualDocumentNumber,
    regularizedByUid: params.regularizedByUid,
    regularizedByName: params.regularizedByName,
  });

  const now = Timestamp.now();
  const nextStatus: TransferRequestStatus = "in_transit_inter_agency";

  await updateDoc(requestRef(params.companyId, params.requestId), {
    status: nextStatus,
    inTransitBy: params.actorId,
    inTransitAt: now,
    executedBy: params.actorId,
    executedAt: now,
    executionObservation: params.observation?.trim() || req.executionObservation || null,
    effectiveOperationDate:
      toTimestampOrNull(params.actualOperationDate ?? null) ??
      req.effectiveOperationDate ??
      null,
    captureMode: manual.captureMode,
    manualDocumentUsed: manual.manualDocumentUsed,
    manualDocumentType: manual.manualDocumentType,
    manualDocumentNumber: manual.manualDocumentNumber,
    regularizedByUid: manual.regularizedByUid,
    regularizedByName: manual.regularizedByName,
    regularizedAt: manual.regularizedAt ?? req.regularizedAt ?? null,
    updatedAt: serverTimestamp(),
  });

  try {
    await upsertInternalTreasuryTransferDocument({
      companyId: req.companyId,
      sourceId: params.requestId,
      eventKey: INTER_AGENCY_OUTBOUND_DOC_EVENT,
      documentTitle: INTER_AGENCY_OUTBOUND_DOC_TITLE,
      sourceLabel: INTER_AGENCY_OUTBOUND_DOC_TITLE,
      agencyId: req.agencyId,
      sourceTypeLabel: "Caisse agence source",
      sourceLibelle: req.agencyId,
      destinationTypeLabel: "Agence relais / hub",
      destinationLibelle: req.destinationAgencyId ?? "-",
      montant: Number(req.amount ?? 0),
      devise: req.currency,
      motif: req.description ?? "Transfert physique inter-agence",
      initiateur: { uid: req.initiatedBy, role: req.initiatedByRole ?? "agency_accountant" },
      valideur: req.authorizedBy ? { uid: req.authorizedBy, role: "validator" } : null,
      executant: {
        uid: params.actorId,
        role: role ?? "executant",
        name: params.actorName ?? req.plannedExecutorName ?? null,
      },
      observations: "Sortie inter-agence effectuee. Fonds en transit inter-agence.",
      dateExecution: now,
      status: "ready_to_print",
      createdByUid: params.actorId,
    });
  } catch (docError) {
    console.error("[treasuryTransfer] echec document passage en transit", {
      companyId: params.companyId,
      requestId: params.requestId,
      docError,
    });
  }
}

export async function confirmBankDeposit(params: {
  companyId: string;
  requestId: string;
  actorId: string;
  actorName?: string | null;
  actorRole?: string | null;
  actorRoles?: string[] | null;
  bankName?: string | null;
  bankBranchName?: string | null;
  amountDeposited: number;
  operationDate?: Date | Timestamp | string | number | null;
  operationHour?: string | null;
  bankReceiptNumber?: string | null;
  manualReceiptNumber?: string | null;
  observation?: string | null;
  captureMode?: TransferCaptureMode | null;
  manualDocumentUsed?: boolean | null;
  manualDocumentType?: string | null;
  manualDocumentNumber?: string | null;
  regularizedByUid?: string | null;
  regularizedByName?: string | null;
}): Promise<void> {
  const roleList = normalizeRoles(
    params.actorRoles?.length
      ? params.actorRoles
      : params.actorRole
        ? [params.actorRole]
        : []
  );
  if (!canExecuteWithRoles(roleList)) {
    throw new Error("Role non autorise pour confirmer le depot.");
  }
  const actorRole = firstExecutorRole(roleList);
  const req = await loadTransferRequest(params.companyId, params.requestId);

  if (req.flowType !== "bank_deposit") {
    throw new Error("Cette action est reservee aux versements banque.");
  }
  if (req.approvalLevelRequired === "agency_only") {
    throw new Error("Le dépôt banque local est déjà enregistré directement.");
  }
  if (req.status !== "in_transit_bank") {
    throw new Error("Le depot ne peut etre confirme qu'apres passage en transit.");
  }
  assertSensitiveFlowSegregation(req, params.actorId);

  const amountDeposited = Number(params.amountDeposited);
  if (!Number.isFinite(amountDeposited) || amountDeposited <= 0) {
    throw new Error("Montant depose invalide.");
  }

  await agencyDepositToBank({
    companyId: req.companyId,
    agencyCashAccountId: req.fromAccountId,
    companyBankAccountId: req.toAccountId,
    amount: amountDeposited,
    currency: req.currency,
    performedBy: params.actorId,
    performedByRole: actorRole ?? null,
    idempotencyKey: `${req.idempotencyKey}_bank_deposit`,
    description: req.description || "Depot banque confirme",
  });

  const operationDateTs = toTimestampOrNull(params.operationDate ?? null) ?? Timestamp.now();
  const manual = normalizeManualCapture({
    captureMode: params.captureMode,
    manualDocumentUsed: params.manualDocumentUsed,
    manualDocumentType: params.manualDocumentType,
    manualDocumentNumber: params.manualDocumentNumber,
    regularizedByUid: params.regularizedByUid,
    regularizedByName: params.regularizedByName,
  });
  const now = Timestamp.now();

  await updateDoc(requestRef(params.companyId, params.requestId), {
    status: "deposited_bank",
    executedBy: params.actorId,
    executedAt: now,
    depositConfirmedBy: params.actorId,
    depositConfirmedAt: now,
    amountDeposited,
    effectiveOperationDate: operationDateTs,
    effectiveOperationHour: params.operationHour?.trim() || null,
    bankReceiptNumber: params.bankReceiptNumber?.trim() || null,
    manualReceiptNumber: params.manualReceiptNumber?.trim() || null,
    bankBranchName: params.bankBranchName?.trim() || req.bankBranchName || null,
    executionObservation: params.observation?.trim() || req.executionObservation || null,
    captureMode: manual.captureMode,
    manualDocumentUsed: manual.manualDocumentUsed,
    manualDocumentType: manual.manualDocumentType,
    manualDocumentNumber: manual.manualDocumentNumber,
    regularizedByUid: manual.regularizedByUid,
    regularizedByName: manual.regularizedByName,
    regularizedAt: manual.regularizedAt ?? req.regularizedAt ?? null,
    updatedAt: serverTimestamp(),
  });

  try {
    const accountDetails = await resolveTransferAccountDetails({
      companyId: req.companyId,
      fromAccountId: req.fromAccountId,
      toAccountId: req.toAccountId,
    });
    await upsertBankDepositDocument({
      companyId: req.companyId,
      sourceId: params.requestId,
      agencyId: req.agencyId,
      compteSourceLibelle: accountDetails.sourceAccountLabel,
      banqueNom: params.bankName?.trim() || accountDetails.bankName,
      agenceBancaireNom: params.bankBranchName?.trim() || req.bankBranchName || null,
      numeroCompte: accountDetails.accountNumber,
      titulaireCompte: accountDetails.accountHolder,
      referenceDepotBancaire:
        params.bankReceiptNumber?.trim() ||
        params.manualReceiptNumber?.trim() ||
        req.idempotencyKey,
      montantVerse: amountDeposited,
      devise: req.currency,
      natureFonds: "remise_caisse_agence",
      motifVersement:
        req.description ?? "Versement caisse agence vers banque compagnie",
      commentaire: params.observation?.trim() || null,
      initiateur: {
        uid: req.initiatedBy,
        role: req.initiatedByRole ?? "agency_accountant",
      },
      valideur: req.authorizedBy
        ? {
            uid: req.authorizedBy,
            role: "validator",
          }
        : null,
      executant: {
        uid: params.actorId,
        role: actorRole ?? "agency_accountant",
        name: params.actorName ?? null,
      },
      preuveJointeDisponible: false,
      nombrePiecesJointes: 0,
      dateExecution: operationDateTs,
      status: "ready_to_print",
      createdByUid: params.actorId,
    });
    await upsertTreasuryTransferDocument({
      companyId: req.companyId,
      requestId: params.requestId,
      agencyId: req.agencyId,
      sourceAccountLabel: accountDetails.sourceAccountLabel,
      destinationAccountLabel: accountDetails.destinationAccountLabel,
      bankName: params.bankName?.trim() || accountDetails.bankName,
      bankBranchName: params.bankBranchName?.trim() || req.bankBranchName || null,
      amount: Number(req.amount ?? 0),
      currency: req.currency,
      movementType: "agency_cash_to_company_bank",
      initiator: {
        uid: req.initiatedBy,
        role: req.initiatedByRole ?? "agency_accountant",
      },
      validator: req.authorizedBy ? { uid: req.authorizedBy, role: "validator" } : null,
      carrier: {
        uid: params.actorId,
        role: actorRole ?? "agency_accountant",
        name: params.actorName ?? null,
      },
      observations: "Depot banque confirme. Piece imprimee disponible.",
      bankReference:
        params.bankReceiptNumber?.trim() ||
        params.manualReceiptNumber?.trim() ||
        req.idempotencyKey,
      status: "ready_to_print",
      createdByUid: params.actorId,
      occurredAt: operationDateTs,
    });
  } catch (docError) {
    console.error("[treasuryTransfer] echec generation documents depot banque confirme", {
      companyId: params.companyId,
      requestId: params.requestId,
      docError,
    });
  }
}

export async function confirmInterAgencyReception(params: {
  companyId: string;
  requestId: string;
  actorId: string;
  actorName?: string | null;
  actorRole?: string | null;
  actorRoles?: string[] | null;
  amountReceived: number;
  operationDate?: Date | Timestamp | string | number | null;
  operationHour?: string | null;
  manualReceiptNumber?: string | null;
  observation?: string | null;
  captureMode?: TransferCaptureMode | null;
  manualDocumentUsed?: boolean | null;
  manualDocumentType?: string | null;
  manualDocumentNumber?: string | null;
  regularizedByUid?: string | null;
  regularizedByName?: string | null;
}): Promise<void> {
  const roleList = normalizeRoles(
    params.actorRoles?.length
      ? params.actorRoles
      : params.actorRole
        ? [params.actorRole]
        : []
  );
  if (!canExecuteWithRoles(roleList)) {
    throw new Error("Role non autorise pour confirmer la reception inter-agence.");
  }
  const actorRole = firstExecutorRole(roleList);
  const req = await loadTransferRequest(params.companyId, params.requestId);

  if (req.flowType !== "inter_agency_transfer") {
    throw new Error("Cette action est reservee aux transferts inter-agence.");
  }
  if (!req.destinationAgencyId) {
    throw new Error("Agence destination manquante.");
  }
  if (req.status !== "in_transit_inter_agency") {
    throw new Error("La reception inter-agence n'est possible qu'apres passage en transit.");
  }

  const amountReceived = Number(params.amountReceived);
  if (!Number.isFinite(amountReceived) || amountReceived <= 0) {
    throw new Error("Montant recu invalide.");
  }

  const relayBankAccountId = req.relayBankAccountId ?? req.toAccountId;
  await agencyDepositToBank({
    companyId: req.companyId,
    agencyCashAccountId: req.fromAccountId,
    companyBankAccountId: relayBankAccountId,
    amount: amountReceived,
    currency: req.currency,
    performedBy: params.actorId,
    performedByRole: actorRole ?? null,
    idempotencyKey: `${req.idempotencyKey}_inter_source`,
    description: "Transfert inter-agence - sortie source",
  });
  await bankWithdrawalToAgency({
    companyId: req.companyId,
    companyBankAccountId: relayBankAccountId,
    agencyCashAccountId: agencyCashAccountId(req.destinationAgencyId),
    amount: amountReceived,
    currency: req.currency,
    performedBy: params.actorId,
    performedByRole: actorRole ?? null,
    idempotencyKey: `${req.idempotencyKey}_inter_destination`,
    description: "Transfert inter-agence - entree destination",
  });

  const operationDateTs = toTimestampOrNull(params.operationDate ?? null) ?? Timestamp.now();
  const receivedDifference = amountReceived - Number(req.amount ?? 0);
  const manual = normalizeManualCapture({
    captureMode: params.captureMode,
    manualDocumentUsed: params.manualDocumentUsed,
    manualDocumentType: params.manualDocumentType,
    manualDocumentNumber: params.manualDocumentNumber,
    regularizedByUid: params.regularizedByUid,
    regularizedByName: params.regularizedByName,
  });
  const now = Timestamp.now();

  await updateDoc(requestRef(params.companyId, params.requestId), {
    status: "received_inter_agency",
    receivedBy: params.actorId,
    receivedAt: now,
    executedBy: params.actorId,
    executedAt: now,
    amountReceived,
    receivedDifference,
    effectiveOperationDate: operationDateTs,
    effectiveOperationHour: params.operationHour?.trim() || null,
    manualReceiptNumber: params.manualReceiptNumber?.trim() || null,
    executionObservation: params.observation?.trim() || req.executionObservation || null,
    captureMode: manual.captureMode,
    manualDocumentUsed: manual.manualDocumentUsed,
    manualDocumentType: manual.manualDocumentType,
    manualDocumentNumber: manual.manualDocumentNumber,
    regularizedByUid: manual.regularizedByUid,
    regularizedByName: manual.regularizedByName,
    regularizedAt: manual.regularizedAt ?? req.regularizedAt ?? null,
    updatedAt: serverTimestamp(),
  });

  try {
    await upsertInternalTreasuryTransferDocument({
      companyId: req.companyId,
      sourceId: params.requestId,
      eventKey: INTER_AGENCY_RECEPTION_DOC_EVENT,
      documentTitle: INTER_AGENCY_RECEPTION_DOC_TITLE,
      sourceLabel: INTER_AGENCY_RECEPTION_DOC_TITLE,
      agencyId: req.agencyId,
      sourceTypeLabel: "Caisse agence source",
      sourceLibelle: req.agencyId,
      destinationTypeLabel: "Agence relais / hub",
      destinationLibelle: req.destinationAgencyId,
      montant: Number(req.amount ?? 0),
      devise: req.currency,
      motif: req.description ?? "Transfert physique inter-agence",
      initiateur: {
        uid: req.initiatedBy,
        role: req.initiatedByRole ?? "agency_accountant",
      },
      valideur: req.authorizedBy ? { uid: req.authorizedBy, role: "validator" } : null,
      executant: {
        uid: params.actorId,
        role: actorRole ?? "agency_accountant",
        name: params.actorName ?? null,
      },
      observations:
        params.observation?.trim() ||
        `Reception confirmee. Ecart: ${receivedDifference >= 0 ? "+" : ""}${receivedDifference.toFixed(0)} ${req.currency}.`,
      dateExecution: operationDateTs,
      status: "ready_to_print",
      createdByUid: params.actorId,
    });
  } catch (docError) {
    console.error("[treasuryTransfer] echec generation document reception inter-agence", {
      companyId: params.companyId,
      requestId: params.requestId,
      docError,
    });
  }
}

export async function rejectTransferRequest(params: {
  companyId: string;
  requestId: string;
  managerId: string;
  managerRole?: string | null;
  managerRoles?: string[] | null;
  reason?: string | null;
}): Promise<void> {
  const roleList = normalizeRoles(
    params.managerRoles?.length
      ? params.managerRoles
      : params.managerRole
        ? [params.managerRole]
        : []
  );
  const isManagerRole = canValidateWithRoles(roleList);
  const isHeadRole = canValidateByHeadAccountant(roleList);
  const isDgRole = canValidateByDg(roleList);
  if (!isManagerRole && !isHeadRole && !isDgRole) {
    throw new Error("Role non autorise pour refuser ce transfert.");
  }

  const req = await loadTransferRequest(params.companyId, params.requestId);

  if (req.flowType === "bank_deposit") {
    throw new Error("Le dépôt banque local n'utilise plus de circuit refus/validation.");
  }

  if (
    req.status !== "pending_manager" &&
    req.status !== "pending_head_accountant" &&
    req.status !== "pending_dg" &&
    req.status !== "authorized"
  ) {
    throw new Error("Cette demande n'est plus dans un etat refusables.");
  }
  if (req.status === "pending_manager" && !isManagerRole && !isDgRole) {
    throw new Error("Le refus au niveau agence requiert un role chef d'agence.");
  }
  if (req.status === "pending_head_accountant" && !isHeadRole && !isDgRole) {
    throw new Error("Le refus a ce stade requiert un role chef comptable.");
  }
  if (req.status === "pending_dg" && !isDgRole) {
    throw new Error("Le refus a ce stade requiert le DG.");
  }

  const rejectReason = params.reason?.trim() || null;

  await updateDoc(requestRef(params.companyId, params.requestId), {
    status: "rejected",
    managerDecisionBy: params.managerId,
    managerDecisionAt: serverTimestamp(),
    managerDecisionReason: rejectReason,
    updatedAt: serverTimestamp(),
  });

  try {
    await upsertInternalTreasuryTransferDocument({
      companyId: req.companyId,
      sourceId: params.requestId,
      eventKey: INTER_AGENCY_OUTBOUND_DOC_EVENT,
      documentTitle: INTER_AGENCY_OUTBOUND_DOC_TITLE,
      sourceLabel: INTER_AGENCY_OUTBOUND_DOC_TITLE,
      agencyId: req.agencyId,
      sourceTypeLabel: "Caisse agence source",
      sourceLibelle: req.agencyId,
      destinationTypeLabel: "Agence relais / hub",
      destinationLibelle: req.destinationAgencyId ?? "-",
      montant: Number(req.amount ?? 0),
      devise: req.currency,
      motif: req.description ?? "Transfert physique inter-agence",
      initiateur: {
        uid: req.initiatedBy,
        role: req.initiatedByRole ?? "agency_accountant",
      },
      valideur: {
        uid: params.managerId,
        role:
          firstManagerRole(roleList) ??
          firstHeadAccountantRole(roleList) ??
          firstDgRole(roleList) ??
          "validator",
      },
      observations: rejectReason || "Demande inter-agence refusee",
      status: "archived",
      createdByUid: params.managerId,
      dateCreation: Timestamp.now(),
    });
  } catch (docError) {
    console.error("[treasuryTransfer] echec archivage document transfert rejete", {
      companyId: req.companyId,
      requestId: params.requestId,
      docError,
    });
  }
}
