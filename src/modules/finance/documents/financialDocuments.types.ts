import type { Timestamp } from "firebase/firestore";

export const FINANCIAL_DOCUMENT_TYPES = [
  "session_remittance",
  "accounting_remittance_receipt",
  "treasury_transfer",
  "bank_deposit_slip",
  "treasury_internal_transfer_slip",
  "cash_disbursement",
  "supplier_payment_order",
  "local_expense_request",
  "maintenance_request",
  "purchase_order",
  "agency_daily_report",
  "monthly_consolidated_report",
  "mobile_money_validation_sheet",
] as const;

export type FinancialDocumentType = (typeof FINANCIAL_DOCUMENT_TYPES)[number];

export const FINANCIAL_DOCUMENT_STATUSES = [
  "draft",
  "ready_to_print",
  "printed",
  "signed",
  "archived",
] as const;

export type FinancialDocumentStatus = (typeof FINANCIAL_DOCUMENT_STATUSES)[number];

export const FINANCIAL_DOCUMENT_STATUS_RANK: Record<FinancialDocumentStatus, number> = {
  draft: 0,
  ready_to_print: 1,
  printed: 2,
  signed: 3,
  archived: 4,
};

export const FINANCIAL_DOCUMENT_TYPE_LABELS: Record<FinancialDocumentType, string> = {
  session_remittance: "Fiche de remise de session",
  accounting_remittance_receipt: "Recu de remise comptable",
  treasury_transfer: "Bordereau de versement / transfert",
  bank_deposit_slip: "Bordereau de versement banque",
  treasury_internal_transfer_slip: "Bordereau de transfert interne",
  cash_disbursement: "Bon de decaissement / ordre de paiement",
  supplier_payment_order: "Ordre de paiement fournisseur",
  local_expense_request: "Demande de depense locale",
  maintenance_request: "Demande maintenance / approvisionnement",
  purchase_order: "Bon de commande / approvisionnement",
  agency_daily_report: "Rapport journalier agence",
  monthly_consolidated_report: "Rapport mensuel consolide",
  mobile_money_validation_sheet: "Fiche validation paiement mobile money",
};

export const FINANCIAL_DOCUMENT_STATUS_LABELS: Record<FinancialDocumentStatus, string> = {
  draft: "Brouillon",
  ready_to_print: "Pret a imprimer",
  printed: "Imprime",
  signed: "Signe",
  archived: "Archive",
};

export const FINANCIAL_DOCUMENT_SOURCE_TYPES = [
  "shift_session",
  "courier_session",
  "transfer_request",
  "internal_transfer",
  "expense",
  "payable_payment",
  "payment_proposal",
  "fleet_maintenance",
  "payable",
  "payment",
  "daily_stats",
  "monthly_report",
] as const;

export type FinancialDocumentSourceType = (typeof FINANCIAL_DOCUMENT_SOURCE_TYPES)[number];

export type FinancialDocumentActor = {
  uid?: string | null;
  name: string;
  role: string;
  phone?: string | null;
};

export type FinancialDocumentLineItem = {
  label: string;
  value: string;
};

export type FinancialDocumentSignatureZone = {
  label: string;
  signerRole?: string | null;
};

export type FinancialDocumentSignedAttachment = {
  url: string;
  fileName?: string | null;
  mimeType?: string | null;
  uploadedBy?: string | null;
  uploadedAt?: Timestamp | null;
};

export interface FinancialDocumentDoc {
  companyId: string;
  agencyId: string | null;
  agencyName?: string | null;
  city?: string | null;
  service?: string | null;
  documentType: FinancialDocumentType;
  title: string;
  documentNumber: string;
  status: FinancialDocumentStatus;
  sourceType: FinancialDocumentSourceType;
  sourceId: string;
  sourceLookupKey: string;
  sourceLabel?: string | null;
  businessReference?: string | null;
  periodLabel?: string | null;
  currency?: string | null;
  amountTotal?: number | null;
  amountTheoretical?: number | null;
  amountDeclared?: number | null;
  amountDifference?: number | null;
  movementType?: string | null;
  occurredAt: Timestamp;
  actors: FinancialDocumentActor[];
  observations?: string | null;
  lineItems: FinancialDocumentLineItem[];
  signatureZones: FinancialDocumentSignatureZone[];
  stampRequired: boolean;
  requiresSignedAttachment: boolean;
  signedAttachment?: FinancialDocumentSignedAttachment | null;
  pdfUrl?: string | null;
  details?: Record<string, unknown>;
  archiveMetadata?: {
    documentId: string;
    typeDocument: FinancialDocumentType;
    numeroDocument: string;
    referenceSysteme: string | null;
    agenceId: string | null;
    ville: string | null;
    periode: string | null;
    acteursPrincipaux: string[];
    montantPrincipal: number | null;
    statutArchivage: FinancialDocumentStatus;
    pdfUrl: string | null;
    scanSigneUrl: string | null;
    creePar: string | null;
    validePar: string | null;
    dateCreation: Timestamp;
    dateArchivage: Timestamp | null;
  };
  searchText: string;
  createdBy?: string | null;
  updatedBy?: string | null;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  printedAt?: Timestamp | null;
  signedAt?: Timestamp | null;
  archivedAt?: Timestamp | null;
}

export type FinancialDocumentFilter = {
  agencyId?: string | null;
  documentType?: FinancialDocumentType | "all";
  status?: FinancialDocumentStatus | "all";
  periodStart?: Date | Timestamp | null;
  periodEnd?: Date | Timestamp | null;
  actorQuery?: string;
  businessReferenceQuery?: string;
};
