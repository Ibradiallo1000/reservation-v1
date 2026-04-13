import axios from "axios";
import {
  collectionGroup,
  Timestamp,
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  where,
  serverTimestamp,
  setDoc,
  updateDoc,
} from "firebase/firestore";
import { db } from "@/firebaseConfig";
import {
  agencyPendingCashAccountDocId,
  getLiquidityFromAccounts,
} from "@/modules/compagnie/treasury/ledgerAccounts";
import type {
  FinancialDocumentActor,
  FinancialDocumentDoc,
  FinancialDocumentFilter,
  FinancialDocumentLineItem,
  FinancialDocumentSignatureZone,
  FinancialDocumentSourceType,
  FinancialDocumentStatus,
  FinancialDocumentType,
} from "./financialDocuments.types";
import {
  FINANCIAL_DOCUMENT_STATUS_RANK,
  FINANCIAL_DOCUMENT_TYPE_LABELS,
} from "./financialDocuments.types";

const COLLECTION = "financialDocuments";
const CLOUDINARY_SIGNED_DOC_UPLOAD_URL =
  "https://api.cloudinary.com/v1_1/dj697honl/image/upload";
const CLOUDINARY_UPLOAD_PRESET = "ml_default";

const DOCUMENT_TYPE_PREFIX: Record<FinancialDocumentType, string> = {
  session_remittance: "REM",
  accounting_remittance_receipt: "RCP",
  treasury_transfer: "TRS",
  bank_deposit_slip: "BNK",
  treasury_internal_transfer_slip: "INT",
  cash_disbursement: "DEC",
  supplier_payment_order: "OPF",
  local_expense_request: "DLO",
  maintenance_request: "MNT",
  purchase_order: "BCA",
  agency_daily_report: "RJA",
  monthly_consolidated_report: "RMC",
  mobile_money_validation_sheet: "MMV",
};

type ActorInput = {
  uid?: string | null;
  name?: string | null;
  role?: string | null;
  phone?: string | null;
};

type UpsertFinancialDocumentParams = {
  companyId: string;
  documentType: FinancialDocumentType;
  sourceType: FinancialDocumentSourceType;
  sourceId: string;
  eventKey?: string | null;
  status?: FinancialDocumentStatus;
  title: string;
  occurredAt?: unknown;
  agencyId?: string | null;
  agencyName?: string | null;
  city?: string | null;
  service?: string | null;
  sourceLabel?: string | null;
  businessReference?: string | null;
  periodLabel?: string | null;
  currency?: string | null;
  amountTotal?: number | null;
  amountTheoretical?: number | null;
  amountDeclared?: number | null;
  amountDifference?: number | null;
  movementType?: string | null;
  lineItems?: FinancialDocumentLineItem[];
  actors?: Array<ActorInput | null | undefined>;
  observations?: string | null;
  signatureZones?: FinancialDocumentSignatureZone[];
  stampRequired?: boolean;
  requiresSignedAttachment?: boolean;
  details?: Record<string, unknown>;
  createdByUid?: string | null;
  validatedByUid?: string | null;
  pdfUrl?: string | null;
};

export type SessionRemittanceDocumentParams = {
  companyId: string;
  agencyId: string;
  sessionId: string;
  sessionType: "guichet" | "courrier";
  sourceType: "shift_session" | "courier_session";
  periodStart?: unknown;
  periodEnd?: unknown;
  agent?: ActorInput | null;
  receiver?: ActorInput | null;
  controller?: ActorInput | null;
  amountTheoretical: number;
  amountRemitted: number;
  amountDifference: number;
  currency?: string | null;
  ventilationByMode?: Record<string, number> | null;
  observations?: string | null;
  status?: FinancialDocumentStatus;
  createdByUid?: string | null;
};

export type TreasuryTransferDocumentParams = {
  companyId: string;
  requestId: string;
  agencyId: string;
  sourceAccountLabel: string;
  destinationAccountLabel: string;
  bankName?: string | null;
  bankBranchName?: string | null;
  amount: number;
  currency?: string | null;
  movementType?: string | null;
  initiator?: ActorInput | null;
  validator?: ActorInput | null;
  carrier?: ActorInput | null;
  bankReference?: string | null;
  observations?: string | null;
  occurredAt?: unknown;
  status?: FinancialDocumentStatus;
  createdByUid?: string | null;
};

export type AccountingRemittanceReceiptDocumentParams = {
  companyId: string;
  agencyId: string;
  sessionId: string;
  sourceType: "shift_session" | "courier_session";
  agent?: ActorInput | null;
  accountant?: ActorInput | null;
  amountRemitted: number;
  amountDifference: number;
  currency?: string | null;
  referenceSessionRemittanceId?: string | null;
  dateHeure?: unknown;
  observations?: string | null;
  status?: FinancialDocumentStatus;
  createdByUid?: string | null;
};

export type BankDepositDocumentParams = {
  companyId: string;
  sourceId: string;
  agencyId?: string | null;
  agencySourceName?: string | null;
  villeSource?: string | null;
  compteSourceLibelle?: string | null;
  banqueNom?: string | null;
  agenceBancaireNom?: string | null;
  numeroCompte?: string | null;
  titulaireCompte?: string | null;
  referenceDepotBancaire?: string | null;
  montantVerse: number;
  devise?: string | null;
  natureFonds?: string | null;
  motifVersement?: string | null;
  commentaire?: string | null;
  initiateur?: ActorInput | null;
  valideur?: ActorInput | null;
  executant?: ActorInput | null;
  preuveJointeDisponible?: boolean;
  nombrePiecesJointes?: number | null;
  observationControle?: string | null;
  dateCreation?: unknown;
  dateExecution?: unknown;
  status?: FinancialDocumentStatus;
  createdByUid?: string | null;
};

export type InternalTreasuryTransferDocumentParams = {
  companyId: string;
  sourceId: string;
  agencyId?: string | null;
  eventKey?: string | null;
  documentTitle?: string | null;
  sourceLabel?: string | null;
  sourceTypeLabel?: string | null;
  sourceLibelle: string;
  destinationTypeLabel?: string | null;
  destinationLibelle: string;
  montant: number;
  devise?: string | null;
  motif?: string | null;
  initiateur?: ActorInput | null;
  valideur?: ActorInput | null;
  executant?: ActorInput | null;
  observations?: string | null;
  dateCreation?: unknown;
  dateExecution?: unknown;
  status?: FinancialDocumentStatus;
  createdByUid?: string | null;
};

export type CashDisbursementDocumentParams = {
  companyId: string;
  agencyId?: string | null;
  sourceType: "expense" | "payable_payment" | "payment_proposal";
  sourceId: string;
  eventKey?: string | null;
  requester?: ActorInput | null;
  approver?: ActorInput | null;
  beneficiaryName?: string | null;
  amount: number;
  currency?: string | null;
  expenseCategory?: string | null;
  reason?: string | null;
  accountSourceLabel?: string | null;
  validationLevel?: string | null;
  executionDate?: unknown;
  observations?: string | null;
  status?: FinancialDocumentStatus;
  createdByUid?: string | null;
};

export type SupplierPaymentOrderDocumentParams = {
  companyId: string;
  sourceType: "payable_payment" | "payment_proposal";
  sourceId: string;
  eventKey?: string | null;
  agenceId?: string | null;
  fournisseurNom?: string | null;
  fournisseurTelephone?: string | null;
  fournisseurAdresse?: string | null;
  fournisseurReference?: string | null;
  factureNumero?: string | null;
  devisNumero?: string | null;
  objetPaiement?: string | null;
  montantHT?: number | null;
  montantTTC?: number | null;
  montantAPayer: number;
  devise?: string | null;
  modePaiement?: string | null;
  sourcePaiement?: string | null;
  dateExecution?: unknown;
  depenseLieeId?: string | null;
  validationChefComptable?: ActorInput | null;
  validationDirection?: ActorInput | null;
  signatures?: FinancialDocumentSignatureZone[];
  observations?: string | null;
  status?: FinancialDocumentStatus;
  createdByUid?: string | null;
};

export type LocalExpenseRequestDocumentParams = {
  companyId: string;
  depenseId: string;
  agenceId?: string | null;
  agenceNom?: string | null;
  demandeur?: ActorInput | null;
  categorie?: string | null;
  motif?: string | null;
  montantEstime: number;
  devise?: string | null;
  urgence?: string | null;
  fournisseurPressenti?: string | null;
  telephoneFournisseur?: string | null;
  dateSouhaitee?: unknown;
  justificatifDisponible?: boolean;
  validationAttendue?: string | null;
  observations?: string | null;
  signaturesLocales?: FinancialDocumentSignatureZone[];
  status?: FinancialDocumentStatus;
  createdByUid?: string | null;
};

export type MaintenanceRequestDocumentParams = {
  companyId: string;
  agencyId?: string | null;
  sourceType: "fleet_maintenance" | "payable";
  sourceId: string;
  vehicle?: string | null;
  registration?: string | null;
  incidentType?: string | null;
  urgency?: string | null;
  requiredItems?: string | null;
  estimatedAmount?: number | null;
  currency?: string | null;
  proposedSupplier?: string | null;
  requester?: ActorInput | null;
  expectedValidation?: string | null;
  linkedExpenseId?: string | null;
  linkedPayableId?: string | null;
  observations?: string | null;
  status?: FinancialDocumentStatus;
  createdByUid?: string | null;
};

export type PurchaseOrderDocumentParams = {
  companyId: string;
  sourceId: string;
  agenceOuService?: string | null;
  fournisseurNom?: string | null;
  fournisseurTelephone?: string | null;
  referenceDemande?: string | null;
  listeArticles?: string | null;
  quantites?: string | null;
  prixUnitaires?: string | null;
  totalPrevisionnel?: number | null;
  delaiSouhaite?: string | null;
  responsableCommande?: ActorInput | null;
  validationFinanciere?: ActorInput | null;
  observations?: string | null;
  status?: FinancialDocumentStatus;
  createdByUid?: string | null;
};

export type AgencyDailyReportDocumentParams = {
  companyId: string;
  agencyId: string;
  date: Date;
  responsableJournee?: ActorInput | null;
  signataires?: FinancialDocumentSignatureZone[];
  createdByUid?: string | null;
};

export type MonthlyConsolidatedReportDocumentParams = {
  companyId: string;
  month: Date;
  signataires?: FinancialDocumentSignatureZone[];
  createdByUid?: string | null;
};

export type MobileMoneyValidationDocumentParams = {
  companyId: string;
  paymentId: string;
  reservationOuOperationId: string;
  agencyId?: string | null;
  clientNom?: string | null;
  numeroClient?: string | null;
  montant: number;
  operateur?: ActorInput | null;
  preuveVerifiee?: boolean;
  referenceTransactionMobileMoney?: string | null;
  statutValidation?: string | null;
  commentaire?: string | null;
  visaControle?: ActorInput | null;
  dateHeure?: unknown;
  status?: FinancialDocumentStatus;
  createdByUid?: string | null;
};

export type UploadSignedDocumentResult = {
  url: string;
  fileName: string;
  mimeType: string;
};

function financialDocumentsRef(companyId: string) {
  return collection(db, "companies", companyId, COLLECTION);
}

function financialDocumentRef(companyId: string, documentId: string) {
  return doc(db, "companies", companyId, COLLECTION, documentId);
}

function normalizeIdComponent(value: string): string {
  return String(value ?? "")
    .trim()
    .replace(/[^a-zA-Z0-9_-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 120);
}

function normalizeSearch(value: string): string {
  return String(value ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function formatDateToken(date: Date): string {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yyyy}${mm}${dd}`;
}

function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function endOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
}

function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1, 0, 0, 0, 0);
}

function endOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999);
}

function formatMonthLabel(date: Date): string {
  return date.toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
}

function valueToDate(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (value instanceof Timestamp) return value.toDate();
  if (typeof value === "number") {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  if (typeof value === "string") {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  if (
    typeof value === "object" &&
    value != null &&
    "toDate" in (value as Record<string, unknown>) &&
    typeof (value as { toDate?: () => Date }).toDate === "function"
  ) {
    try {
      return (value as { toDate: () => Date }).toDate();
    } catch {
      return null;
    }
  }
  return null;
}

function valueToTimestamp(value: unknown): Timestamp | null {
  if (!value) return null;
  if (value instanceof Timestamp) return value;
  const d = valueToDate(value);
  return d ? Timestamp.fromDate(d) : null;
}

function valueToMillis(value: unknown): number | null {
  if (!value) return null;
  if (value instanceof Timestamp) return value.toMillis();
  const d = valueToDate(value);
  return d ? d.getTime() : null;
}

function formatDateTime(value: unknown): string {
  const d = valueToDate(value);
  if (!d) return "—";
  return d.toLocaleString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatAmount(value: number | null | undefined, currency = "XOF"): string {
  if (!Number.isFinite(Number(value ?? 0))) return `0 ${currency}`;
  return `${Number(value ?? 0).toLocaleString("fr-FR")} ${currency}`;
}

function cleanLineItems(items: FinancialDocumentLineItem[] | undefined): FinancialDocumentLineItem[] {
  return (items ?? [])
    .map((item) => ({
      label: String(item?.label ?? "").trim(),
      value: String(item?.value ?? "").trim(),
    }))
    .filter((item) => item.label.length > 0 && item.value.length > 0);
}

function cleanSignatureZones(
  zones: FinancialDocumentSignatureZone[] | undefined
): FinancialDocumentSignatureZone[] {
  return (zones ?? [])
    .map((zone) => ({
      label: String(zone?.label ?? "").trim(),
      signerRole: zone?.signerRole ? String(zone.signerRole).trim() : null,
    }))
    .filter((zone) => zone.label.length > 0);
}

function resolveStatusTransition(
  current: FinancialDocumentStatus | undefined,
  incoming: FinancialDocumentStatus
): FinancialDocumentStatus {
  if (!current) return incoming;
  if (current === "archived" || incoming === "archived") return "archived";
  return FINANCIAL_DOCUMENT_STATUS_RANK[current] >= FINANCIAL_DOCUMENT_STATUS_RANK[incoming]
    ? current
    : incoming;
}

function buildSearchText(parts: Array<string | null | undefined>): string {
  return parts
    .map((part) => normalizeSearch(part ?? ""))
    .filter(Boolean)
    .join(" ")
    .trim();
}

function buildArchiveMetadata(params: {
  documentId: string;
  documentType: FinancialDocumentType;
  documentNumber: string;
  businessReference: string | null;
  agencyId: string | null;
  city: string | null;
  periodLabel: string | null;
  actors: FinancialDocumentActor[];
  amountTotal: number | null;
  status: FinancialDocumentStatus;
  pdfUrl: string | null;
  signedUrl: string | null;
  createdBy: string | null;
  validatedBy: string | null;
  createdAt: Timestamp;
  archivedAt: Timestamp | null;
}) {
  return {
    documentId: params.documentId,
    typeDocument: params.documentType,
    numeroDocument: params.documentNumber,
    referenceSysteme: params.businessReference ?? null,
    agenceId: params.agencyId ?? null,
    ville: params.city ?? null,
    periode: params.periodLabel ?? null,
    acteursPrincipaux: params.actors.map((actor) => `${actor.name} (${actor.role})`),
    montantPrincipal: params.amountTotal ?? null,
    statutArchivage: params.status,
    pdfUrl: params.pdfUrl ?? null,
    scanSigneUrl: params.signedUrl ?? null,
    creePar: params.createdBy ?? null,
    validePar: params.validatedBy ?? null,
    dateCreation: params.createdAt,
    dateArchivage: params.archivedAt ?? null,
  };
}

async function resolveAgencySnapshot(
  companyId: string,
  agencyId: string | null | undefined
): Promise<{ agencyName: string | null; city: string | null; phone: string | null }> {
  if (!agencyId) return { agencyName: null, city: null, phone: null };
  try {
    const snap = await getDoc(doc(db, "companies", companyId, "agences", agencyId));
    if (!snap.exists()) return { agencyName: null, city: null, phone: null };
    const data = snap.data() as Record<string, unknown>;
    const agencyName = String(
      data.nom ?? data.nomAgence ?? data.name ?? data.agencyName ?? ""
    ).trim();
    const city = String(data.ville ?? data.city ?? data.locality ?? "").trim();
    const phone = String(data.telephone ?? data.phone ?? data.contactPhone ?? "").trim();
    return {
      agencyName: agencyName || null,
      city: city || null,
      phone: phone || null,
    };
  } catch {
    return { agencyName: null, city: null, phone: null };
  }
}

async function hydrateActor(
  actor: ActorInput | null | undefined,
  cache: Map<string, FinancialDocumentActor>
): Promise<FinancialDocumentActor | null> {
  if (!actor) return null;
  const uid = actor.uid ? String(actor.uid).trim() : "";
  if (uid && cache.has(uid)) return cache.get(uid) ?? null;

  let name = String(actor.name ?? "").trim();
  let role = String(actor.role ?? "").trim();
  let phone = String(actor.phone ?? "").trim();

  if (uid && (!name || !phone || !role)) {
    try {
      const userSnap = await getDoc(doc(db, "users", uid));
      if (userSnap.exists()) {
        const userData = userSnap.data() as Record<string, unknown>;
        if (!name) {
          name = String(
            userData.displayName ??
              userData.nomComplet ??
              userData.fullName ??
              userData.name ??
              uid
          ).trim();
        }
        if (!role) {
          const rawRole = userData.role;
          role = Array.isArray(rawRole)
            ? String(rawRole[0] ?? "acteur").trim()
            : String(rawRole ?? "acteur").trim();
        }
        if (!phone) {
          phone = String(userData.phone ?? userData.telephone ?? "").trim();
        }
      }
    } catch {
      // Ignore actor hydration errors and fallback to provided values.
    }
  }

  const hydrated: FinancialDocumentActor = {
    uid: uid || null,
    name: name || uid || "acteur",
    role: role || "acteur",
    phone: phone || null,
  };

  if (uid) cache.set(uid, hydrated);
  return hydrated;
}

async function hydrateActors(
  actors: Array<ActorInput | null | undefined> | undefined
): Promise<FinancialDocumentActor[]> {
  const cache = new Map<string, FinancialDocumentActor>();
  const hydrated = await Promise.all((actors ?? []).map((actor) => hydrateActor(actor, cache)));
  return hydrated.filter((actor): actor is FinancialDocumentActor => Boolean(actor));
}

export function buildFinancialDocumentId(params: {
  documentType: FinancialDocumentType;
  sourceType: FinancialDocumentSourceType;
  sourceId: string;
  eventKey?: string | null;
}): string {
  const base = [
    normalizeIdComponent(params.documentType),
    normalizeIdComponent(params.sourceType),
    normalizeIdComponent(params.sourceId),
  ].filter(Boolean);
  if (params.eventKey) {
    base.push(normalizeIdComponent(params.eventKey));
  }
  return base.join("__");
}

export function buildFinancialDocumentNumber(
  documentType: FinancialDocumentType,
  documentId: string,
  date = new Date()
): string {
  const prefix = DOCUMENT_TYPE_PREFIX[documentType] ?? "DOC";
  const token = formatDateToken(date);
  const suffix = normalizeIdComponent(documentId).slice(-6).toUpperCase().padStart(6, "0");
  return `FD-${prefix}-${token}-${suffix}`;
}

export function getSessionRemittanceDocumentId(
  sourceType: "shift_session" | "courier_session",
  sessionId: string
): string {
  return buildFinancialDocumentId({
    documentType: "session_remittance",
    sourceType,
    sourceId: sessionId,
  });
}

export function getSessionRemittanceReceiptDocumentId(
  sourceType: "shift_session" | "courier_session",
  sessionId: string
): string {
  return buildFinancialDocumentId({
    documentType: "accounting_remittance_receipt",
    sourceType,
    sourceId: sessionId,
  });
}

export function getTreasuryTransferDocumentId(requestId: string): string {
  return buildFinancialDocumentId({
    documentType: "treasury_transfer",
    sourceType: "transfer_request",
    sourceId: requestId,
  });
}

export function getBankDepositDocumentId(sourceType: "transfer_request" | "internal_transfer", sourceId: string): string {
  return buildFinancialDocumentId({
    documentType: "bank_deposit_slip",
    sourceType,
    sourceId,
  });
}

export function getInternalTransferDocumentId(sourceId: string, eventKey?: string | null): string {
  return buildFinancialDocumentId({
    documentType: "treasury_internal_transfer_slip",
    sourceType: "internal_transfer",
    sourceId,
    eventKey: eventKey ?? null,
  });
}

export function getExpenseDisbursementDocumentId(expenseId: string): string {
  return buildFinancialDocumentId({
    documentType: "cash_disbursement",
    sourceType: "expense",
    sourceId: expenseId,
  });
}

export function getPayablePaymentDocumentId(payableId: string, eventKey: string): string {
  return buildFinancialDocumentId({
    documentType: "cash_disbursement",
    sourceType: "payable_payment",
    sourceId: payableId,
    eventKey,
  });
}

export function getSupplierPaymentOrderDocumentId(
  sourceType: "payable_payment" | "payment_proposal",
  sourceId: string,
  eventKey?: string | null
): string {
  return buildFinancialDocumentId({
    documentType: "supplier_payment_order",
    sourceType,
    sourceId,
    eventKey: eventKey ?? null,
  });
}

export function getPaymentProposalDisbursementDocumentId(proposalId: string): string {
  return buildFinancialDocumentId({
    documentType: "cash_disbursement",
    sourceType: "payment_proposal",
    sourceId: proposalId,
  });
}

export function getMaintenanceRequestDocumentId(
  sourceType: "fleet_maintenance" | "payable",
  sourceId: string
): string {
  return buildFinancialDocumentId({
    documentType: "maintenance_request",
    sourceType,
    sourceId,
  });
}

export function getLocalExpenseRequestDocumentId(expenseId: string): string {
  return buildFinancialDocumentId({
    documentType: "local_expense_request",
    sourceType: "expense",
    sourceId: expenseId,
  });
}

export function getPurchaseOrderDocumentId(payableId: string): string {
  return buildFinancialDocumentId({
    documentType: "purchase_order",
    sourceType: "payable",
    sourceId: payableId,
  });
}

export function getAgencyDailyReportDocumentId(agencyId: string, date: Date): string {
  const dateToken = formatDateToken(date);
  return buildFinancialDocumentId({
    documentType: "agency_daily_report",
    sourceType: "daily_stats",
    sourceId: `${agencyId}_${dateToken}`,
  });
}

export function getMonthlyConsolidatedReportDocumentId(month: Date): string {
  const yyyy = month.getFullYear();
  const mm = String(month.getMonth() + 1).padStart(2, "0");
  return buildFinancialDocumentId({
    documentType: "monthly_consolidated_report",
    sourceType: "monthly_report",
    sourceId: `${yyyy}-${mm}`,
  });
}

export function getMobileMoneyValidationDocumentId(paymentId: string): string {
  return buildFinancialDocumentId({
    documentType: "mobile_money_validation_sheet",
    sourceType: "payment",
    sourceId: paymentId,
  });
}

async function upsertFinancialDocument(
  params: UpsertFinancialDocumentParams
): Promise<{ id: string; documentNumber: string; status: FinancialDocumentStatus }> {
  const documentId = buildFinancialDocumentId({
    documentType: params.documentType,
    sourceType: params.sourceType,
    sourceId: params.sourceId,
    eventKey: params.eventKey ?? null,
  });
  const ref = financialDocumentRef(params.companyId, documentId);
  const existingSnap = await getDoc(ref);
  const existing = existingSnap.exists()
    ? (existingSnap.data() as FinancialDocumentDoc)
    : null;

  const occurredAt = valueToTimestamp(params.occurredAt) ?? existing?.occurredAt ?? Timestamp.now();
  const targetStatus = params.status ?? "ready_to_print";
  const status = resolveStatusTransition(existing?.status, targetStatus);
  const documentNumber =
    existing?.documentNumber ??
    buildFinancialDocumentNumber(params.documentType, documentId, occurredAt.toDate());
  const createdAt = existing?.createdAt ?? occurredAt;
  const archivedAt =
    status === "archived"
      ? existing?.archivedAt ?? Timestamp.now()
      : existing?.archivedAt ?? null;
  const validatedByUid =
    params.validatedByUid ??
    (typeof existing?.archiveMetadata?.validePar === "string"
      ? existing.archiveMetadata.validePar
      : null);
  const agencySnapshot = await resolveAgencySnapshot(params.companyId, params.agencyId);
  const actors = await hydrateActors(params.actors);
  const lineItems = cleanLineItems(params.lineItems);
  const signatureZones = cleanSignatureZones(params.signatureZones);
  const sourceLookupKey = `${params.sourceType}:${params.sourceId}${
    params.eventKey ? `:${params.eventKey}` : ""
  }`;
  const details = {
    ...(existing?.details ?? {}),
    ...(params.details ?? {}),
  };

  const searchText = buildSearchText([
    documentNumber,
    params.title,
    FINANCIAL_DOCUMENT_TYPE_LABELS[params.documentType],
    params.businessReference,
    params.sourceId,
    params.sourceLabel,
    params.service,
    params.observations,
    params.agencyName ?? agencySnapshot.agencyName,
    params.city ?? agencySnapshot.city,
    actors.map((actor) => `${actor.name} ${actor.role} ${actor.phone ?? ""}`).join(" "),
    lineItems.map((item) => `${item.label} ${item.value}`).join(" "),
  ]);

  const amountTotal = Number(params.amountTotal ?? existing?.amountTotal ?? 0);
  const pdfUrl = params.pdfUrl ?? existing?.pdfUrl ?? null;
  const createdBy = existing?.createdBy ?? params.createdByUid ?? null;
  const archiveMetadata = buildArchiveMetadata({
    documentId,
    documentType: params.documentType,
    documentNumber,
    businessReference: params.businessReference ?? existing?.businessReference ?? null,
    agencyId: params.agencyId ?? existing?.agencyId ?? null,
    city: params.city ?? existing?.city ?? agencySnapshot.city ?? null,
    periodLabel: params.periodLabel ?? existing?.periodLabel ?? null,
    actors,
    amountTotal,
    status,
    pdfUrl,
    signedUrl: existing?.signedAttachment?.url ?? null,
    createdBy,
    validatedBy: validatedByUid,
    createdAt,
    archivedAt,
  });

  const payload: Record<string, unknown> = {
    companyId: params.companyId,
    agencyId: params.agencyId ?? null,
    agencyName: params.agencyName ?? agencySnapshot.agencyName ?? null,
    city: params.city ?? agencySnapshot.city ?? null,
    service: params.service ?? null,
    documentType: params.documentType,
    title: params.title,
    documentNumber,
    status,
    sourceType: params.sourceType,
    sourceId: params.sourceId,
    sourceLookupKey,
    sourceLabel: params.sourceLabel ?? null,
    businessReference: params.businessReference ?? null,
    periodLabel: params.periodLabel ?? existing?.periodLabel ?? null,
    currency: params.currency ?? null,
    amountTotal,
    amountTheoretical: params.amountTheoretical ?? null,
    amountDeclared: params.amountDeclared ?? null,
    amountDifference: params.amountDifference ?? null,
    movementType: params.movementType ?? null,
    occurredAt,
    actors,
    observations: params.observations ?? null,
    lineItems,
    signatureZones,
    stampRequired: params.stampRequired ?? true,
    requiresSignedAttachment: params.requiresSignedAttachment ?? true,
    details,
    pdfUrl,
    archiveMetadata,
    searchText,
    createdBy,
    updatedBy: params.createdByUid ?? null,
    createdAt,
    archivedAt,
    updatedAt: serverTimestamp(),
  };

  await setDoc(ref, payload, { merge: true });
  return { id: documentId, documentNumber, status };
}

export async function getFinancialDocumentById(
  companyId: string,
  documentId: string
): Promise<(FinancialDocumentDoc & { id: string }) | null> {
  const snap = await getDoc(financialDocumentRef(companyId, documentId));
  if (!snap.exists()) return null;
  return { id: snap.id, ...(snap.data() as FinancialDocumentDoc) };
}

export function isSignedAttachmentMissing(doc: FinancialDocumentDoc): boolean {
  return Boolean(doc.requiresSignedAttachment) && !Boolean(doc.signedAttachment?.url);
}

export function applyFinancialDocumentFilters(
  docs: Array<FinancialDocumentDoc & { id: string }>,
  filters: FinancialDocumentFilter
): Array<FinancialDocumentDoc & { id: string }> {
  const normalizedActorQuery = normalizeSearch(filters.actorQuery ?? "");
  const normalizedReference = normalizeSearch(filters.businessReferenceQuery ?? "");
  const startMs = valueToMillis(filters.periodStart ?? null);
  const endMs = valueToMillis(filters.periodEnd ?? null);

  return docs.filter((docRow) => {
    if (filters.agencyId && docRow.agencyId !== filters.agencyId) return false;
    if (filters.documentType && filters.documentType !== "all" && docRow.documentType !== filters.documentType)
      return false;
    if (filters.status && filters.status !== "all" && docRow.status !== filters.status) return false;

    const occurredMs = valueToMillis(docRow.occurredAt) ?? valueToMillis(docRow.createdAt);
    if (startMs != null && (occurredMs == null || occurredMs < startMs)) return false;
    if (endMs != null && (occurredMs == null || occurredMs > endMs + 86_399_999)) return false;

    if (normalizedActorQuery && !normalizeSearch(docRow.searchText ?? "").includes(normalizedActorQuery))
      return false;
    if (
      normalizedReference &&
      !normalizeSearch(
        `${docRow.businessReference ?? ""} ${docRow.sourceId ?? ""} ${docRow.documentNumber ?? ""}`
      ).includes(normalizedReference)
    )
      return false;

    return true;
  });
}

export async function listFinancialDocuments(params: {
  companyId: string;
  limitCount?: number;
  filters?: FinancialDocumentFilter;
}): Promise<Array<FinancialDocumentDoc & { id: string }>> {
  const snap = await getDocs(
    query(
      financialDocumentsRef(params.companyId),
      orderBy("createdAt", "desc"),
      limit(params.limitCount ?? 800)
    )
  );
  const rows = snap.docs.map((d) => ({ id: d.id, ...(d.data() as FinancialDocumentDoc) }));
  return applyFinancialDocumentFilters(rows, params.filters ?? {});
}

export async function setFinancialDocumentStatus(params: {
  companyId: string;
  documentId: string;
  status: FinancialDocumentStatus;
  updatedByUid?: string | null;
}): Promise<void> {
  const ref = financialDocumentRef(params.companyId, params.documentId);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error("Document introuvable.");
  const current = snap.data() as FinancialDocumentDoc;
  const nextStatus = resolveStatusTransition(current.status, params.status);
  const currentRank = FINANCIAL_DOCUMENT_STATUS_RANK[current.status];
  const nextRank = FINANCIAL_DOCUMENT_STATUS_RANK[nextStatus];
  const patch: Record<string, unknown> = {
    status: nextStatus,
    updatedBy: params.updatedByUid ?? null,
    updatedAt: serverTimestamp(),
    "archiveMetadata.statutArchivage": nextStatus,
  };
  if (params.updatedByUid) {
    patch["archiveMetadata.validePar"] = params.updatedByUid;
  }

  if (nextRank >= FINANCIAL_DOCUMENT_STATUS_RANK.printed && currentRank < FINANCIAL_DOCUMENT_STATUS_RANK.printed) {
    patch.printedAt = serverTimestamp();
  }
  if (nextRank >= FINANCIAL_DOCUMENT_STATUS_RANK.signed && currentRank < FINANCIAL_DOCUMENT_STATUS_RANK.signed) {
    patch.signedAt = serverTimestamp();
  }
  if (nextStatus === "archived" && current.status !== "archived") {
    patch.archivedAt = serverTimestamp();
    patch["archiveMetadata.dateArchivage"] = serverTimestamp();
  }

  await updateDoc(ref, patch);
}

export async function attachFinancialDocumentSignedAttachment(params: {
  companyId: string;
  documentId: string;
  url: string;
  uploadedByUid?: string | null;
  fileName?: string | null;
  mimeType?: string | null;
}): Promise<void> {
  const ref = financialDocumentRef(params.companyId, params.documentId);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error("Document introuvable.");
  const current = snap.data() as FinancialDocumentDoc;
  const nextStatus = resolveStatusTransition(current.status, "signed");
  await updateDoc(ref, {
    signedAttachment: {
      url: params.url,
      fileName: params.fileName ?? null,
      mimeType: params.mimeType ?? null,
      uploadedBy: params.uploadedByUid ?? null,
      uploadedAt: serverTimestamp(),
    },
    status: nextStatus,
    signedAt: serverTimestamp(),
    updatedBy: params.uploadedByUid ?? null,
    updatedAt: serverTimestamp(),
    "archiveMetadata.statutArchivage": nextStatus,
    "archiveMetadata.scanSigneUrl": params.url,
    ...(params.uploadedByUid ? { "archiveMetadata.validePar": params.uploadedByUid } : {}),
  });
}

export async function uploadFinancialDocumentSignedAttachmentFile(
  file: File,
  documentId: string
): Promise<UploadSignedDocumentResult> {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("upload_preset", CLOUDINARY_UPLOAD_PRESET);
  formData.append(
    "public_id",
    `financial_documents/${normalizeIdComponent(documentId)}/${Date.now()}`
  );
  const response = await axios.post(CLOUDINARY_SIGNED_DOC_UPLOAD_URL, formData);
  const url = String(response?.data?.secure_url ?? "").trim();
  if (!url) throw new Error("Upload du fichier signe echoue.");
  return {
    url,
    fileName: file.name,
    mimeType: file.type || "image/*",
  };
}

export async function upsertSessionRemittanceDocument(
  params: SessionRemittanceDocumentParams
): Promise<{ id: string; documentNumber: string; status: FinancialDocumentStatus }> {
  const periodStartTs = valueToTimestamp(params.periodStart);
  const periodEndTs = valueToTimestamp(params.periodEnd);
  const requiresManagerVisa = Math.abs(Number(params.amountDifference ?? 0)) > 0;
  const periodLibelle = `${formatDateTime(params.periodStart)} -> ${formatDateTime(params.periodEnd)}`;
  const totalCash = Number(params.ventilationByMode?.cash ?? params.amountRemitted ?? 0);
  const totalBilletterie = Number(params.ventilationByMode?.billetterie ?? 0);
  const totalCourrier = Number(params.ventilationByMode?.courrier ?? 0);
  const totalMobileMoneyValide = Number(
    params.ventilationByMode?.mobile_money ??
      params.ventilationByMode?.mobileMoney ??
      params.ventilationByMode?.digital ??
      0
  );
  const totalAutresModes = Object.entries(params.ventilationByMode ?? {}).reduce((sum, [mode, amount]) => {
    const m = normalizeSearch(mode);
    if (
      m === "cash" ||
      m === "billetterie" ||
      m === "courrier" ||
      m === "mobile_money" ||
      m === "mobilemoney" ||
      m === "mobile money" ||
      m === "digital"
    ) {
      return sum;
    }
    return sum + Number(amount ?? 0);
  }, 0);

  const lineItems: FinancialDocumentLineItem[] = [
    { label: "Type document", value: "Fiche de remise de session" },
    { label: "Reference systeme", value: params.sessionId },
    { label: "Session", value: params.sessionId },
    { label: "Type session", value: params.sessionType === "courrier" ? "Courrier" : "Guichet" },
    { label: "Periode", value: periodLibelle },
    { label: "Periode debut", value: formatDateTime(params.periodStart) },
    { label: "Periode fin", value: formatDateTime(params.periodEnd) },
    {
      label: "Montant theorique",
      value: formatAmount(params.amountTheoretical, params.currency ?? "XOF"),
    },
    {
      label: "Montant remis",
      value: formatAmount(params.amountRemitted, params.currency ?? "XOF"),
    },
    {
      label: "Ecart",
      value: formatAmount(params.amountDifference, params.currency ?? "XOF"),
    },
    { label: "Total billetterie", value: formatAmount(totalBilletterie, params.currency ?? "XOF") },
    { label: "Total courrier", value: formatAmount(totalCourrier, params.currency ?? "XOF") },
    { label: "Total cash", value: formatAmount(totalCash, params.currency ?? "XOF") },
    {
      label: "Total mobile money valide",
      value: formatAmount(totalMobileMoneyValide, params.currency ?? "XOF"),
    },
    { label: "Total autres modes", value: formatAmount(totalAutresModes, params.currency ?? "XOF") },
  ];

  Object.entries(params.ventilationByMode ?? {}).forEach(([mode, amount]) => {
    lineItems.push({
      label: `Ventilation ${mode}`,
      value: formatAmount(amount, params.currency ?? "XOF"),
    });
  });

  const signatureZones: FinancialDocumentSignatureZone[] = [
    { label: "Agent remettant", signerRole: "agent" },
    { label: "Comptable receveur", signerRole: "agency_accountant" },
  ];
  if (requiresManagerVisa) {
    signatureZones.push({ label: "Visa chef d'agence", signerRole: "chefAgence" });
  }

  return upsertFinancialDocument({
    companyId: params.companyId,
    agencyId: params.agencyId,
    documentType: "session_remittance",
    sourceType: params.sourceType,
    sourceId: params.sessionId,
    title: FINANCIAL_DOCUMENT_TYPE_LABELS.session_remittance,
    service: params.sessionType === "courrier" ? "Courrier" : "Guichet",
    sourceLabel:
      params.sessionType === "courrier"
        ? "Session courrier"
        : "Session guichet",
    businessReference: params.sessionId,
    currency: params.currency ?? "XOF",
    amountTotal: params.amountRemitted,
    amountTheoretical: params.amountTheoretical,
    amountDeclared: params.amountRemitted,
    amountDifference: params.amountDifference,
    periodLabel: periodLibelle,
    movementType: "remise_session",
    occurredAt: params.periodEnd ?? params.periodStart ?? Timestamp.now(),
    lineItems,
    actors: [params.agent ?? null, params.receiver ?? null, params.controller ?? null],
    observations: params.observations ?? null,
    signatureZones,
    stampRequired: true,
    requiresSignedAttachment: true,
    details: {
      typeDocument: "session_remittance",
      dateCreation: Timestamp.now(),
      dateValidation: periodEndTs ?? periodStartTs ?? Timestamp.now(),
      referenceSysteme: params.sessionId,
      sessionId: params.sessionId,
      sessionType: params.sessionType,
      dateOuvertureSession: periodStartTs,
      dateFermetureSession: periodEndTs,
      periodeLibelle: periodLibelle,
      canalPrincipal: params.sessionType === "courrier" ? "courrier" : "guichet",
      periodStart: periodStartTs,
      periodEnd: periodEndTs,
      montantTheorique: params.amountTheoretical,
      montantRemis: params.amountRemitted,
      ecartMontant: params.amountDifference,
      totalBilletterie,
      totalCourrier,
      totalCash,
      totalMobileMoneyValide,
      totalAutresModes,
      motifEcart: requiresManagerVisa
        ? "Ecart detecte entre montant theorique et montant remis."
        : null,
      visaChefAgenceRequis: requiresManagerVisa,
      ventilationByMode: params.ventilationByMode ?? {},
    },
    status: params.status ?? "ready_to_print",
    createdByUid: params.createdByUid ?? null,
  });
}

export async function upsertTreasuryTransferDocument(
  params: TreasuryTransferDocumentParams
): Promise<{ id: string; documentNumber: string; status: FinancialDocumentStatus }> {
  const isBankCashOut = (params.movementType ?? "transfer") === "agency_cash_to_company_bank";
  const documentTitle = isBankCashOut
    ? "Ordre de sortie vers banque"
    : FINANCIAL_DOCUMENT_TYPE_LABELS.treasury_transfer;
  return upsertFinancialDocument({
    companyId: params.companyId,
    agencyId: params.agencyId,
    documentType: "treasury_transfer",
    sourceType: "transfer_request",
    sourceId: params.requestId,
    title: documentTitle,
    sourceLabel: isBankCashOut ? "Ordre de sortie vers banque" : "Demande transfert tresorerie",
    businessReference: params.bankReference ?? params.requestId,
    currency: params.currency ?? "XOF",
    amountTotal: params.amount,
    movementType: params.movementType ?? "transfer",
    occurredAt: params.occurredAt ?? Timestamp.now(),
    lineItems: [
      { label: "Source", value: params.sourceAccountLabel },
      { label: "Destination", value: params.destinationAccountLabel },
      { label: "Banque", value: params.bankName ?? "-" },
      { label: "Agence bancaire", value: params.bankBranchName ?? "-" },
      { label: "Montant", value: formatAmount(params.amount, params.currency ?? "XOF") },
      {
        label: "Type mouvement",
        value: params.movementType ?? "Versement / transfert de tresorerie",
      },
      { label: "Reference bancaire", value: params.bankReference ?? "—" },
    ],
    actors: [params.initiator ?? null, params.validator ?? null, params.carrier ?? null],
    observations: params.observations ?? null,
    signatureZones: [
      { label: "Initiateur", signerRole: "agency_accountant" },
      { label: "Validateur", signerRole: "chefAgence" },
      { label: "Executant / porteur", signerRole: "transporteur" },
    ],
    stampRequired: true,
    requiresSignedAttachment: true,
    details: {
      sourceAccountLabel: params.sourceAccountLabel,
      destinationAccountLabel: params.destinationAccountLabel,
      bankName: params.bankName ?? null,
      bankBranchName: params.bankBranchName ?? null,
      bankReference: params.bankReference ?? null,
      movementType: params.movementType ?? "transfer",
    },
    status: params.status ?? "draft",
    createdByUid: params.createdByUid ?? null,
  });
}

export async function upsertCashDisbursementDocument(
  params: CashDisbursementDocumentParams
): Promise<{ id: string; documentNumber: string; status: FinancialDocumentStatus }> {
  const defaultTitle = FINANCIAL_DOCUMENT_TYPE_LABELS.cash_disbursement;
  const validationLevel = params.validationLevel ?? "en_attente_validation";
  return upsertFinancialDocument({
    companyId: params.companyId,
    agencyId: params.agencyId ?? null,
    documentType: "cash_disbursement",
    sourceType: params.sourceType,
    sourceId: params.sourceId,
    eventKey: params.eventKey ?? null,
    title: defaultTitle,
    sourceLabel:
      params.sourceType === "expense"
        ? "Depense"
        : params.sourceType === "payment_proposal"
          ? "Proposition de paiement fournisseur"
          : "Paiement fournisseur",
    businessReference: params.sourceId,
    currency: params.currency ?? "XOF",
    amountTotal: params.amount,
    movementType: "cash_out",
    occurredAt: params.executionDate ?? Timestamp.now(),
    lineItems: [
      { label: "Demandeur", value: params.requester?.name ?? params.requester?.uid ?? "—" },
      { label: "Beneficiaire", value: params.beneficiaryName ?? "—" },
      {
        label: "Categorie depense",
        value: params.expenseCategory ?? "depense_operationnelle",
      },
      { label: "Montant", value: formatAmount(params.amount, params.currency ?? "XOF") },
      { label: "Motif", value: params.reason ?? "—" },
      { label: "Source de sortie", value: params.accountSourceLabel ?? "—" },
      { label: "Niveau de validation", value: validationLevel },
      { label: "Date execution", value: formatDateTime(params.executionDate) },
    ],
    actors: [params.requester ?? null, params.approver ?? null],
    observations: params.observations ?? null,
    signatureZones: [
      { label: "Demandeur", signerRole: "requester" },
      { label: "Validateur", signerRole: "validator" },
      { label: "Caisse / Tresorerie", signerRole: "cashier" },
    ],
    stampRequired: true,
    requiresSignedAttachment: true,
    details: {
      validationLevel,
      accountSourceLabel: params.accountSourceLabel ?? null,
      beneficiaryName: params.beneficiaryName ?? null,
    },
    status: params.status ?? "draft",
    createdByUid: params.createdByUid ?? null,
  });
}

export async function upsertMaintenanceRequestDocument(
  params: MaintenanceRequestDocumentParams
): Promise<{ id: string; documentNumber: string; status: FinancialDocumentStatus }> {
  return upsertFinancialDocument({
    companyId: params.companyId,
    agencyId: params.agencyId ?? null,
    documentType: "maintenance_request",
    sourceType: params.sourceType,
    sourceId: params.sourceId,
    title: FINANCIAL_DOCUMENT_TYPE_LABELS.maintenance_request,
    sourceLabel:
      params.sourceType === "fleet_maintenance"
        ? "Intervention maintenance"
        : "Demande approvisionnement",
    businessReference: params.sourceId,
    currency: params.currency ?? "XOF",
    amountTotal: Number(params.estimatedAmount ?? 0),
    movementType: "maintenance_request",
    occurredAt: Timestamp.now(),
    lineItems: [
      { label: "Vehicule", value: params.vehicle ?? "—" },
      { label: "Immatriculation", value: params.registration ?? "—" },
      { label: "Type incident", value: params.incidentType ?? "—" },
      { label: "Urgence", value: params.urgency ?? "normale" },
      { label: "Pieces / besoin", value: params.requiredItems ?? "—" },
      {
        label: "Estimation",
        value: formatAmount(Number(params.estimatedAmount ?? 0), params.currency ?? "XOF"),
      },
      { label: "Fournisseur pressenti", value: params.proposedSupplier ?? "—" },
      {
        label: "Validation attendue",
        value: params.expectedValidation ?? "comptable / direction",
      },
      { label: "Lien depense", value: params.linkedExpenseId ?? "—" },
    ],
    actors: [params.requester ?? null],
    observations: params.observations ?? null,
    signatureZones: [
      { label: "Responsable demandeur", signerRole: "requester" },
      { label: "Validation operationnelle", signerRole: "validator" },
      { label: "Validation financiere", signerRole: "financial_validator" },
    ],
    stampRequired: true,
    requiresSignedAttachment: true,
    details: {
      linkedExpenseId: params.linkedExpenseId ?? null,
      linkedPayableId: params.linkedPayableId ?? null,
      sourceType: params.sourceType,
    },
    status: params.status ?? "draft",
    createdByUid: params.createdByUid ?? null,
  });
}

export async function upsertAccountingRemittanceReceiptDocument(
  params: AccountingRemittanceReceiptDocumentParams
): Promise<{ id: string; documentNumber: string; status: FinancialDocumentStatus }> {
  const ficheReference =
    params.referenceSessionRemittanceId ??
    getSessionRemittanceDocumentId(params.sourceType, params.sessionId);
  return upsertFinancialDocument({
    companyId: params.companyId,
    agencyId: params.agencyId,
    documentType: "accounting_remittance_receipt",
    sourceType: params.sourceType,
    sourceId: params.sessionId,
    title: FINANCIAL_DOCUMENT_TYPE_LABELS.accounting_remittance_receipt,
    sourceLabel: "Recu de remise comptable",
    businessReference: params.sessionId,
    currency: params.currency ?? "XOF",
    amountTotal: Number(params.amountRemitted ?? 0),
    amountDeclared: Number(params.amountRemitted ?? 0),
    amountDifference: Number(params.amountDifference ?? 0),
    movementType: "session_remittance_receipt",
    occurredAt: params.dateHeure ?? Timestamp.now(),
    lineItems: [
      { label: "Session", value: params.sessionId },
      { label: "Agence", value: params.agencyId },
      { label: "Agent", value: params.agent?.name ?? params.agent?.uid ?? "-" },
      { label: "Role agent", value: params.agent?.role ?? "-" },
      { label: "Comptable", value: params.accountant?.name ?? params.accountant?.uid ?? "-" },
      { label: "Montant remis", value: formatAmount(params.amountRemitted, params.currency ?? "XOF") },
      { label: "Ecart", value: formatAmount(params.amountDifference, params.currency ?? "XOF") },
      { label: "Reference fiche remise", value: ficheReference },
    ],
    actors: [params.agent ?? null, params.accountant ?? null],
    observations: params.observations ?? null,
    signatureZones: [
      { label: "Agent", signerRole: params.agent?.role ?? "agent" },
      { label: "Comptable", signerRole: params.accountant?.role ?? "agency_accountant" },
    ],
    stampRequired: true,
    requiresSignedAttachment: true,
    details: {
      typeDocument: "accounting_remittance_receipt",
      dateHeure: valueToTimestamp(params.dateHeure),
      sessionId: params.sessionId,
      referenceFicheRemise: ficheReference,
    },
    status: params.status ?? "ready_to_print",
    createdByUid: params.createdByUid ?? null,
  });
}

export async function upsertBankDepositDocument(
  params: BankDepositDocumentParams
): Promise<{ id: string; documentNumber: string; status: FinancialDocumentStatus }> {
  const documentTitle = "Bordereau de dépôt confirmé";
  return upsertFinancialDocument({
    companyId: params.companyId,
    agencyId: params.agencyId ?? null,
    agencyName: params.agencySourceName ?? null,
    city: params.villeSource ?? null,
    documentType: "bank_deposit_slip",
    sourceType: "transfer_request",
    sourceId: params.sourceId,
    title: documentTitle,
    sourceLabel: documentTitle,
    businessReference: params.referenceDepotBancaire ?? params.sourceId,
    currency: params.devise ?? "XOF",
    amountTotal: Number(params.montantVerse ?? 0),
    movementType: "bank_deposit",
    occurredAt: params.dateExecution ?? params.dateCreation ?? Timestamp.now(),
    lineItems: [
      { label: "Compte source", value: params.compteSourceLibelle ?? "-" },
      { label: "Banque", value: params.banqueNom ?? "-" },
      { label: "Agence bancaire", value: params.agenceBancaireNom ?? "-" },
      { label: "Numero compte", value: params.numeroCompte ?? "-" },
      { label: "Titulaire", value: params.titulaireCompte ?? "-" },
      { label: "Référence dépôt", value: params.referenceDepotBancaire ?? "-" },
      { label: "Montant verse", value: formatAmount(params.montantVerse, params.devise ?? "XOF") },
      { label: "Nature fonds", value: params.natureFonds ?? "-" },
      { label: "Motif versement", value: params.motifVersement ?? "-" },
      { label: "Preuve jointe", value: params.preuveJointeDisponible ? "Oui" : "Non" },
      { label: "Pieces jointes", value: String(Number(params.nombrePiecesJointes ?? 0)) },
    ],
    actors: [params.initiateur ?? null, params.valideur ?? null, params.executant ?? null],
    observations: params.commentaire ?? params.observationControle ?? null,
    signatureZones: [
      { label: "Comptable saisissant", signerRole: params.initiateur?.role ?? "agency_accountant" },
      { label: "Déposant", signerRole: params.executant?.role ?? "agency_accountant" },
    ],
    stampRequired: true,
    requiresSignedAttachment: true,
    details: {
      typeDocument: "bank_deposit_slip",
      dateCreation: valueToTimestamp(params.dateCreation),
      dateExecution: valueToTimestamp(params.dateExecution),
      referenceDepotBancaire: params.referenceDepotBancaire ?? null,
      compteSourceLibelle: params.compteSourceLibelle ?? null,
      banqueNom: params.banqueNom ?? null,
      agenceBancaireNom: params.agenceBancaireNom ?? null,
      numeroCompte: params.numeroCompte ?? null,
      titulaireCompte: params.titulaireCompte ?? null,
      natureFonds: params.natureFonds ?? null,
      motifVersement: params.motifVersement ?? null,
      preuveJointeDisponible: Boolean(params.preuveJointeDisponible),
      nombrePiecesJointes: Number(params.nombrePiecesJointes ?? 0),
    },
    status: params.status ?? "ready_to_print",
    createdByUid: params.createdByUid ?? null,
  });
}

export async function upsertInternalTreasuryTransferDocument(
  params: InternalTreasuryTransferDocumentParams
): Promise<{ id: string; documentNumber: string; status: FinancialDocumentStatus }> {
  const documentTitle =
    String(params.documentTitle ?? "").trim() ||
    FINANCIAL_DOCUMENT_TYPE_LABELS.treasury_internal_transfer_slip;
  const documentSourceLabel = String(params.sourceLabel ?? "").trim() || documentTitle;
  return upsertFinancialDocument({
    companyId: params.companyId,
    agencyId: params.agencyId ?? null,
    documentType: "treasury_internal_transfer_slip",
    sourceType: "internal_transfer",
    sourceId: params.sourceId,
    eventKey: params.eventKey ?? null,
    title: documentTitle,
    sourceLabel: documentSourceLabel,
    businessReference: params.sourceId,
    currency: params.devise ?? "XOF",
    amountTotal: Number(params.montant ?? 0),
    movementType: "internal_treasury_transfer",
    occurredAt: params.dateExecution ?? params.dateCreation ?? Timestamp.now(),
    lineItems: [
      { label: "Source type", value: params.sourceTypeLabel ?? "-" },
      { label: "Source", value: params.sourceLibelle },
      { label: "Destination type", value: params.destinationTypeLabel ?? "-" },
      { label: "Destination", value: params.destinationLibelle },
      { label: "Montant", value: formatAmount(params.montant, params.devise ?? "XOF") },
      { label: "Motif", value: params.motif ?? "-" },
    ],
    actors: [params.initiateur ?? null, params.valideur ?? null, params.executant ?? null],
    observations: params.observations ?? null,
    signatureZones: [
      { label: "Initiateur", signerRole: params.initiateur?.role ?? "initiateur" },
      { label: "Validateur", signerRole: params.valideur?.role ?? "valideur" },
      { label: "Executant", signerRole: params.executant?.role ?? "executant" },
    ],
    stampRequired: true,
    requiresSignedAttachment: true,
    details: {
      typeDocument: "treasury_internal_transfer_slip",
      dateCreation: valueToTimestamp(params.dateCreation),
      dateExecution: valueToTimestamp(params.dateExecution),
      sourceType: params.sourceTypeLabel ?? null,
      sourceLibelle: params.sourceLibelle,
      destinationType: params.destinationTypeLabel ?? null,
      destinationLibelle: params.destinationLibelle,
      motif: params.motif ?? null,
    },
    status: params.status ?? "ready_to_print",
    createdByUid: params.createdByUid ?? null,
  });
}

export async function upsertSupplierPaymentOrderDocument(
  params: SupplierPaymentOrderDocumentParams
): Promise<{ id: string; documentNumber: string; status: FinancialDocumentStatus }> {
  return upsertFinancialDocument({
    companyId: params.companyId,
    agencyId: params.agenceId ?? null,
    documentType: "supplier_payment_order",
    sourceType: params.sourceType,
    sourceId: params.sourceId,
    eventKey: params.eventKey ?? null,
    title: FINANCIAL_DOCUMENT_TYPE_LABELS.supplier_payment_order,
    sourceLabel: "Ordre de paiement fournisseur",
    businessReference: params.fournisseurReference ?? params.sourceId,
    currency: params.devise ?? "XOF",
    amountTotal: Number(params.montantAPayer ?? 0),
    movementType: "supplier_payment_order",
    occurredAt: params.dateExecution ?? Timestamp.now(),
    lineItems: [
      { label: "Fournisseur", value: params.fournisseurNom ?? "-" },
      { label: "Telephone fournisseur", value: params.fournisseurTelephone ?? "-" },
      { label: "Adresse fournisseur", value: params.fournisseurAdresse ?? "-" },
      { label: "Reference fournisseur", value: params.fournisseurReference ?? "-" },
      { label: "Facture numero", value: params.factureNumero ?? "-" },
      { label: "Devis numero", value: params.devisNumero ?? "-" },
      { label: "Objet paiement", value: params.objetPaiement ?? "-" },
      { label: "Montant HT", value: formatAmount(Number(params.montantHT ?? 0), params.devise ?? "XOF") },
      { label: "Montant TTC", value: formatAmount(Number(params.montantTTC ?? 0), params.devise ?? "XOF") },
      { label: "Montant a payer", value: formatAmount(Number(params.montantAPayer ?? 0), params.devise ?? "XOF") },
      { label: "Mode paiement", value: params.modePaiement ?? "-" },
      { label: "Source paiement", value: params.sourcePaiement ?? "-" },
    ],
    actors: [params.validationChefComptable ?? null, params.validationDirection ?? null],
    observations: params.observations ?? null,
    signatureZones:
      params.signatures?.length && params.signatures.length > 0
        ? params.signatures
        : [
            { label: "Validation chef comptable", signerRole: "company_accountant" },
            { label: "Validation direction", signerRole: "admin_compagnie" },
          ],
    stampRequired: true,
    requiresSignedAttachment: true,
    details: {
      typeDocument: "supplier_payment_order",
      depenseLieeId: params.depenseLieeId ?? null,
      dateExecution: valueToTimestamp(params.dateExecution),
    },
    status: params.status ?? "draft",
    createdByUid: params.createdByUid ?? null,
  });
}

export async function upsertLocalExpenseRequestDocument(
  params: LocalExpenseRequestDocumentParams
): Promise<{ id: string; documentNumber: string; status: FinancialDocumentStatus }> {
  return upsertFinancialDocument({
    companyId: params.companyId,
    agencyId: params.agenceId ?? null,
    agencyName: params.agenceNom ?? null,
    documentType: "local_expense_request",
    sourceType: "expense",
    sourceId: params.depenseId,
    title: FINANCIAL_DOCUMENT_TYPE_LABELS.local_expense_request,
    sourceLabel: "Demande depense locale",
    businessReference: params.depenseId,
    currency: params.devise ?? "XOF",
    amountTotal: Number(params.montantEstime ?? 0),
    movementType: "local_expense_request",
    occurredAt: params.dateSouhaitee ?? Timestamp.now(),
    lineItems: [
      { label: "Agence", value: params.agenceNom ?? params.agenceId ?? "-" },
      { label: "Demandeur", value: params.demandeur?.name ?? params.demandeur?.uid ?? "-" },
      { label: "Role demandeur", value: params.demandeur?.role ?? "-" },
      { label: "Categorie", value: params.categorie ?? "-" },
      { label: "Motif", value: params.motif ?? "-" },
      { label: "Montant estime", value: formatAmount(params.montantEstime, params.devise ?? "XOF") },
      { label: "Urgence", value: params.urgence ?? "normale" },
      { label: "Fournisseur pressenti", value: params.fournisseurPressenti ?? "-" },
      { label: "Telephone fournisseur", value: params.telephoneFournisseur ?? "-" },
      { label: "Justificatif disponible", value: params.justificatifDisponible ? "Oui" : "Non" },
      { label: "Validation attendue", value: params.validationAttendue ?? "-" },
    ],
    actors: [params.demandeur ?? null],
    observations: params.observations ?? null,
    signatureZones:
      params.signaturesLocales?.length && params.signaturesLocales.length > 0
        ? params.signaturesLocales
        : [
            { label: "Demandeur local", signerRole: "requester" },
            { label: "Validation locale", signerRole: "chefAgence" },
          ],
    stampRequired: true,
    requiresSignedAttachment: true,
    details: {
      typeDocument: "local_expense_request",
      dateSouhaitee: valueToTimestamp(params.dateSouhaitee),
      categorie: params.categorie ?? null,
      motif: params.motif ?? null,
      urgence: params.urgence ?? null,
      fournisseurPressenti: params.fournisseurPressenti ?? null,
      justificatifDisponibleOuiNon: Boolean(params.justificatifDisponible),
      validationAttendue: params.validationAttendue ?? null,
    },
    status: params.status ?? "draft",
    createdByUid: params.createdByUid ?? null,
  });
}

export async function upsertPurchaseOrderDocument(
  params: PurchaseOrderDocumentParams
): Promise<{ id: string; documentNumber: string; status: FinancialDocumentStatus }> {
  return upsertFinancialDocument({
    companyId: params.companyId,
    agencyId: null,
    documentType: "purchase_order",
    sourceType: "payable",
    sourceId: params.sourceId,
    title: FINANCIAL_DOCUMENT_TYPE_LABELS.purchase_order,
    sourceLabel: "Bon de commande / approvisionnement",
    businessReference: params.referenceDemande ?? params.sourceId,
    currency: "XOF",
    amountTotal: Number(params.totalPrevisionnel ?? 0),
    movementType: "purchase_order",
    occurredAt: Timestamp.now(),
    lineItems: [
      { label: "Agence ou service", value: params.agenceOuService ?? "-" },
      { label: "Fournisseur", value: params.fournisseurNom ?? "-" },
      { label: "Telephone fournisseur", value: params.fournisseurTelephone ?? "-" },
      { label: "Reference demande", value: params.referenceDemande ?? "-" },
      { label: "Liste articles", value: params.listeArticles ?? "-" },
      { label: "Quantites", value: params.quantites ?? "-" },
      { label: "Prix unitaires", value: params.prixUnitaires ?? "-" },
      { label: "Total previsionnel", value: formatAmount(Number(params.totalPrevisionnel ?? 0), "XOF") },
      { label: "Delai souhaite", value: params.delaiSouhaite ?? "-" },
    ],
    actors: [params.responsableCommande ?? null, params.validationFinanciere ?? null],
    observations: params.observations ?? null,
    signatureZones: [
      { label: "Responsable commande", signerRole: "requester" },
      { label: "Validation financiere", signerRole: "financial_validator" },
    ],
    stampRequired: true,
    requiresSignedAttachment: true,
    details: {
      typeDocument: "purchase_order",
      referenceDemande: params.referenceDemande ?? null,
      listeArticles: params.listeArticles ?? null,
      quantites: params.quantites ?? null,
      prixUnitaires: params.prixUnitaires ?? null,
      totalPrevisionnel: Number(params.totalPrevisionnel ?? 0),
      delaiSouhaite: params.delaiSouhaite ?? null,
    },
    status: params.status ?? "draft",
    createdByUid: params.createdByUid ?? null,
  });
}

export async function createAgencyDailyReportDocument(
  params: AgencyDailyReportDocumentParams
): Promise<{ id: string; documentNumber: string; status: FinancialDocumentStatus }> {
  const dayStart = startOfDay(params.date);
  const dayEnd = endOfDay(params.date);
  const dayToken = formatDateToken(params.date);
  const dayKey = `${params.date.getFullYear()}-${String(params.date.getMonth() + 1).padStart(2, "0")}-${String(
    params.date.getDate()
  ).padStart(2, "0")}`;
  const [agencySnapshot, dailyStatsSnap, docs, paymentsSnap, pendingCashSnap] = await Promise.all([
    getDoc(doc(db, "companies", params.companyId, "agences", params.agencyId)),
    getDoc(doc(db, "companies", params.companyId, "agences", params.agencyId, "dailyStats", dayKey)),
    listFinancialDocuments({
      companyId: params.companyId,
      limitCount: 2000,
      filters: {
        agencyId: params.agencyId,
        periodStart: dayStart,
        periodEnd: dayEnd,
      },
    }),
    getDocs(
      query(
        collection(db, "companies", params.companyId, "payments"),
        where("agencyId", "==", params.agencyId),
        orderBy("createdAt", "desc"),
        limit(500)
      )
    ),
    getDoc(doc(db, "companies", params.companyId, "accounts", agencyPendingCashAccountDocId(params.agencyId))),
  ]);

  const agencyData = agencySnapshot.exists()
    ? (agencySnapshot.data() as Record<string, unknown>)
    : {};
  const dailyStats = dailyStatsSnap.exists()
    ? (dailyStatsSnap.data() as Record<string, unknown>)
    : {};

  const payments = paymentsSnap.docs
    .map((row) => row.data() as Record<string, unknown>)
    .filter((row) => {
      const createdMs = valueToMillis(row.createdAt ?? null);
      if (createdMs == null || createdMs < dayStart.getTime() || createdMs > dayEnd.getTime()) return false;
      const status = normalizeSearch(String(row.status ?? ""));
      if (status !== "validated") return false;
      const provider = normalizeSearch(String(row.provider ?? ""));
      return provider === "wave" || provider === "orange" || provider === "moov" || provider === "sarali";
    });

  const remises = docs.filter((row) => row.documentType === "session_remittance");
  const bankDeposits = docs.filter(
    (row) => row.documentType === "bank_deposit_slip" || row.documentType === "treasury_transfer"
  );
  const localExpenses = docs.filter(
    (row) => row.documentType === "local_expense_request" || row.documentType === "cash_disbursement"
  );

  const totalActiviteBilletterie = Number(dailyStats.ticketRevenue ?? 0);
  const totalActiviteCourrier = Number(dailyStats.courierRevenue ?? 0);
  const totalArgentRemis = remises.reduce((sum, row) => sum + Number(row.amountDeclared ?? row.amountTotal ?? 0), 0);
  const totalValideAgence = Number(dailyStats.totalRevenue ?? totalArgentRemis);
  const totalMobileMoneyValide = payments.reduce((sum, row) => sum + Number(row.amount ?? 0), 0);
  const totalPendingCashRestant = Number(
    pendingCashSnap.exists() ? (pendingCashSnap.data() as { balance?: number }).balance ?? 0 : 0
  );
  const totalEcarts = remises.reduce((sum, row) => sum + Math.abs(Number(row.amountDifference ?? 0)), 0);
  const depensesLocalesJour = localExpenses.reduce((sum, row) => sum + Number(row.amountTotal ?? 0), 0);
  const versementsBanqueJour = bankDeposits.reduce((sum, row) => sum + Number(row.amountTotal ?? 0), 0);
  const anomaliesJour = remises.filter((row) => Math.abs(Number(row.amountDifference ?? 0)) > 0).length;

  const agencyName = String(
    agencyData.nom ?? agencyData.nomAgence ?? agencyData.name ?? params.agencyId
  ).trim();
  const city = String(agencyData.ville ?? agencyData.city ?? "").trim() || null;

  return upsertFinancialDocument({
    companyId: params.companyId,
    agencyId: params.agencyId,
    agencyName: agencyName || params.agencyId,
    city,
    documentType: "agency_daily_report",
    sourceType: "daily_stats",
    sourceId: `${params.agencyId}_${dayToken}`,
    title: FINANCIAL_DOCUMENT_TYPE_LABELS.agency_daily_report,
    sourceLabel: "Rapport journalier agence",
    businessReference: `${params.agencyId}/${dayKey}`,
    periodLabel: dayKey,
    currency: "XOF",
    amountTotal: totalArgentRemis,
    movementType: "agency_daily_financial_report",
    occurredAt: dayEnd,
    lineItems: [
      { label: "Date", value: dayKey },
      { label: "Agence", value: agencyName || params.agencyId },
      {
        label: "Responsable journee",
        value: params.responsableJournee?.name ?? params.responsableJournee?.uid ?? "-",
      },
      { label: "Total activite billetterie", value: formatAmount(totalActiviteBilletterie, "XOF") },
      { label: "Total activite courrier", value: formatAmount(totalActiviteCourrier, "XOF") },
      { label: "Total argent remis", value: formatAmount(totalArgentRemis, "XOF") },
      { label: "Total valide agence", value: formatAmount(totalValideAgence, "XOF") },
      { label: "Total mobile money valide", value: formatAmount(totalMobileMoneyValide, "XOF") },
      { label: "Total pending cash restant", value: formatAmount(totalPendingCashRestant, "XOF") },
      { label: "Ecarts constates", value: formatAmount(totalEcarts, "XOF") },
      { label: "Depenses locales jour", value: formatAmount(depensesLocalesJour, "XOF") },
      { label: "Versements banque jour", value: formatAmount(versementsBanqueJour, "XOF") },
      { label: "Anomalies jour", value: String(anomaliesJour) },
    ],
    actors: [params.responsableJournee ?? null],
    observations:
      anomaliesJour > 0
        ? "Des ecarts ont ete detectes. Controle renforce recommande."
        : "Aucune anomalie majeure detectee.",
    signatureZones:
      params.signataires?.length && params.signataires.length > 0
        ? params.signataires
        : [
            { label: "Responsable journee", signerRole: "agency_accountant" },
            { label: "Visa chef d'agence", signerRole: "chefAgence" },
          ],
    stampRequired: true,
    requiresSignedAttachment: true,
    details: {
      typeDocument: "agency_daily_report",
      date: dayKey,
      totalActiviteBilletterie,
      totalActiviteCourrier,
      totalArgentRemis,
      totalValideAgence,
      totalMobileMoneyValide,
      totalPendingCashRestant,
      ecartsConstates: totalEcarts,
      depensesLocalesJour,
      versementsBanqueJour,
      anomaliesJour,
    },
    status: "ready_to_print",
    createdByUid: params.createdByUid ?? null,
  });
}

export async function createMonthlyConsolidatedReportDocument(
  params: MonthlyConsolidatedReportDocumentParams
): Promise<{ id: string; documentNumber: string; status: FinancialDocumentStatus }> {
  const periodStart = startOfMonth(params.month);
  const periodEnd = endOfMonth(params.month);
  const monthKey = `${params.month.getFullYear()}-${String(params.month.getMonth() + 1).padStart(2, "0")}`;
  const [agenciesSnap, docs, liquidity, dailyStatsSnap] = await Promise.all([
    getDocs(collection(db, "companies", params.companyId, "agences")),
    listFinancialDocuments({
      companyId: params.companyId,
      limitCount: 4000,
      filters: { periodStart, periodEnd },
    }),
    getLiquidityFromAccounts(params.companyId),
    getDocs(
      query(
        collectionGroup(db, "dailyStats"),
        where("companyId", "==", params.companyId),
        where("date", ">=", `${monthKey}-01`),
        where("date", "<=", `${monthKey}-31`),
        limit(3000)
      )
    ),
  ]);

  const dailyRows = dailyStatsSnap.docs.map((row) => row.data() as Record<string, unknown>);
  const totalActiviteCommerciale = dailyRows.reduce(
    (sum, row) => sum + Number(row.totalRevenue ?? row.ticketRevenue ?? 0),
    0
  );
  const totalDepenses = docs
    .filter((row) => row.documentType === "cash_disbursement" || row.documentType === "supplier_payment_order")
    .reduce((sum, row) => sum + Number(row.amountTotal ?? 0), 0);
  const totalVersements = docs
    .filter(
      (row) =>
        row.documentType === "bank_deposit_slip" ||
        row.documentType === "treasury_transfer" ||
        row.documentType === "treasury_internal_transfer_slip"
    )
    .reduce((sum, row) => sum + Number(row.amountTotal ?? 0), 0);
  const totalEcarts = docs
    .filter((row) => row.documentType === "session_remittance")
    .reduce((sum, row) => sum + Math.abs(Number(row.amountDifference ?? 0)), 0);

  const agencyRiskMap = new Map<string, number>();
  docs
    .filter((row) => row.documentType === "session_remittance" && Math.abs(Number(row.amountDifference ?? 0)) > 0)
    .forEach((row) => {
      const key = row.agencyId ?? "unknown";
      agencyRiskMap.set(key, (agencyRiskMap.get(key) ?? 0) + 1);
    });
  const agencyNameById = new Map<string, string>();
  agenciesSnap.docs.forEach((row) => {
    const d = row.data() as Record<string, unknown>;
    const name = String(d.nom ?? d.nomAgence ?? d.name ?? row.id).trim() || row.id;
    agencyNameById.set(row.id, name);
  });
  const agencesARisque = Array.from(agencyRiskMap.keys()).map(
    (agencyId) => agencyNameById.get(agencyId) ?? agencyId
  );
  const anomaliesCritiques = docs.filter(
    (row) => isSignedAttachmentMissing(row) || Math.abs(Number(row.amountDifference ?? 0)) > 0
  ).length;

  return upsertFinancialDocument({
    companyId: params.companyId,
    agencyId: null,
    documentType: "monthly_consolidated_report",
    sourceType: "monthly_report",
    sourceId: monthKey,
    title: FINANCIAL_DOCUMENT_TYPE_LABELS.monthly_consolidated_report,
    sourceLabel: "Rapport mensuel consolide",
    businessReference: monthKey,
    periodLabel: formatMonthLabel(params.month),
    currency: "XOF",
    amountTotal: totalActiviteCommerciale,
    movementType: "monthly_consolidation",
    occurredAt: periodEnd,
    lineItems: [
      { label: "Mois", value: formatMonthLabel(params.month) },
      { label: "Total activite commerciale", value: formatAmount(totalActiviteCommerciale, "XOF") },
      { label: "Total tresorerie reelle", value: formatAmount(liquidity.total, "XOF") },
      { label: "Total mobile money", value: formatAmount(liquidity.mobileMoney, "XOF") },
      { label: "Total caisse agence", value: formatAmount(liquidity.cash, "XOF") },
      { label: "Total banque", value: formatAmount(liquidity.bank, "XOF") },
      { label: "Total depenses", value: formatAmount(totalDepenses, "XOF") },
      { label: "Total versements", value: formatAmount(totalVersements, "XOF") },
      { label: "Total ecarts", value: formatAmount(totalEcarts, "XOF") },
      { label: "Agences a risque", value: agencesARisque.length > 0 ? agencesARisque.join(", ") : "Aucune" },
      { label: "Anomalies critiques", value: String(anomaliesCritiques) },
    ],
    actors: [],
    observations:
      anomaliesCritiques > 0
        ? "Anomalies critiques detectees. Revue direction recommandee."
        : "Consolidation mensuelle sans anomalie critique majeure.",
    signatureZones:
      params.signataires?.length && params.signataires.length > 0
        ? params.signataires
        : [
            { label: "Chef comptable", signerRole: "company_accountant" },
            { label: "Direction", signerRole: "admin_compagnie" },
          ],
    stampRequired: true,
    requiresSignedAttachment: true,
    details: {
      typeDocument: "monthly_consolidated_report",
      mois: monthKey,
      totalActiviteCommerciale,
      totalTresorerieReelle: liquidity.total,
      totalMobileMoney: liquidity.mobileMoney,
      totalCaisseAgence: liquidity.cash,
      totalBanque: liquidity.bank,
      totalDepenses,
      totalVersements,
      totalEcarts,
      agencesARisque,
      anomaliesCritiques,
    },
    status: "ready_to_print",
    createdByUid: params.createdByUid ?? null,
  });
}

export async function upsertMobileMoneyValidationDocument(
  params: MobileMoneyValidationDocumentParams
): Promise<{ id: string; documentNumber: string; status: FinancialDocumentStatus }> {
  return upsertFinancialDocument({
    companyId: params.companyId,
    agencyId: params.agencyId ?? null,
    documentType: "mobile_money_validation_sheet",
    sourceType: "payment",
    sourceId: params.paymentId,
    title: FINANCIAL_DOCUMENT_TYPE_LABELS.mobile_money_validation_sheet,
    sourceLabel: "Validation paiement mobile money",
    businessReference: params.reservationOuOperationId,
    currency: "XOF",
    amountTotal: Number(params.montant ?? 0),
    movementType: "mobile_money_validation",
    occurredAt: params.dateHeure ?? Timestamp.now(),
    lineItems: [
      { label: "Reservation / operation", value: params.reservationOuOperationId },
      { label: "Client", value: params.clientNom ?? "-" },
      { label: "Numero client", value: params.numeroClient ?? "-" },
      { label: "Montant", value: formatAmount(params.montant, "XOF") },
      { label: "Operateur", value: params.operateur?.name ?? params.operateur?.uid ?? "-" },
      { label: "Preuve verifiee", value: params.preuveVerifiee ? "Oui" : "Non" },
      {
        label: "Reference transaction mobile money",
        value: params.referenceTransactionMobileMoney ?? params.paymentId,
      },
      { label: "Statut validation", value: params.statutValidation ?? "validee" },
      { label: "Commentaire", value: params.commentaire ?? "-" },
    ],
    actors: [params.operateur ?? null, params.visaControle ?? null],
    observations: params.commentaire ?? null,
    signatureZones: [
      { label: "Signature operateur", signerRole: params.operateur?.role ?? "operator_digital" },
      { label: "Visa controle", signerRole: params.visaControle?.role ?? "company_accountant" },
    ],
    stampRequired: true,
    requiresSignedAttachment: true,
    details: {
      typeDocument: "mobile_money_validation_sheet",
      reservationOuOperationId: params.reservationOuOperationId,
      clientNom: params.clientNom ?? null,
      numeroClient: params.numeroClient ?? null,
      preuveVerifieeOuiNon: Boolean(params.preuveVerifiee),
      referenceTransactionMobileMoney: params.referenceTransactionMobileMoney ?? params.paymentId,
      statutValidation: params.statutValidation ?? "validee",
      commentaire: params.commentaire ?? null,
    },
    status: params.status ?? "ready_to_print",
    createdByUid: params.createdByUid ?? null,
  });
}
