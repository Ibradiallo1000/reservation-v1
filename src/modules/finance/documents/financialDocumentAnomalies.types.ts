import type { FinancialDocumentSourceType, FinancialDocumentType } from "./financialDocuments.types";

export const FINANCIAL_DOCUMENT_ANOMALY_TYPES = [
  "document_missing",
  "ready_not_printed",
  "printed_not_signed",
  "signed_scan_missing",
  "signed_not_archived",
  "business_reference_mismatch",
  "duplicate_document",
  "stale_document_state",
] as const;

export type FinancialDocumentAnomalyType =
  (typeof FINANCIAL_DOCUMENT_ANOMALY_TYPES)[number];

export const FINANCIAL_DOCUMENT_ANOMALY_SEVERITIES = [
  "critique",
  "attention",
  "information",
] as const;

export type FinancialDocumentAnomalySeverity =
  (typeof FINANCIAL_DOCUMENT_ANOMALY_SEVERITIES)[number];

export const FINANCIAL_DOCUMENT_ANOMALY_STATUSES = [
  "open",
  "resolved",
  "ignored",
] as const;

export type FinancialDocumentAnomalyStatus =
  (typeof FINANCIAL_DOCUMENT_ANOMALY_STATUSES)[number];

export const FINANCIAL_DOCUMENT_ANOMALY_TYPE_LABELS: Record<
  FinancialDocumentAnomalyType,
  string
> = {
  document_missing: "Piece manquante",
  ready_not_printed: "Pret mais non imprime",
  printed_not_signed: "Imprime mais non signe",
  signed_scan_missing: "Scan signe manquant",
  signed_not_archived: "Signe mais non archive",
  business_reference_mismatch: "Incoherence entre la piece et l'operation",
  duplicate_document: "Doublon de piece",
  stale_document_state: "Piece non finalisee",
};

export const FINANCIAL_DOCUMENT_ANOMALY_SEVERITY_LABELS: Record<
  FinancialDocumentAnomalySeverity,
  string
> = {
  critique: "Critique",
  attention: "Attention",
  information: "Information",
};

export const FINANCIAL_DOCUMENT_ANOMALY_STATUS_LABELS: Record<
  FinancialDocumentAnomalyStatus,
  string
> = {
  open: "Ouverte",
  resolved: "Resolue",
  ignored: "Ignoree",
};

export interface FinancialDocumentAnomaly {
  anomalyId: string;
  anomalyType: FinancialDocumentAnomalyType;
  severity: FinancialDocumentAnomalySeverity;
  message: string;
  documentType: FinancialDocumentType | null;
  sourceType: FinancialDocumentSourceType | null;
  businessReference: string | null;
  relatedDocumentId: string | null;
  relatedDocumentNumber?: string | null;
  agencyId: string | null;
  companyId: string;
  actorSummary: string | null;
  amountPrincipal: number | null;
  detectedAt: Date;
  status: FinancialDocumentAnomalyStatus;
  resolutionNote?: string | null;
  metadata?: Record<string, unknown>;
}

export type FinancialDocumentAnomalyFilter = {
  agencyId?: string | null;
  documentType?: FinancialDocumentType | "all";
  severity?: FinancialDocumentAnomalySeverity | "all";
  anomalyType?: FinancialDocumentAnomalyType | "all";
  status?: FinancialDocumentAnomalyStatus | "all";
  periodStart?: Date | null;
  periodEnd?: Date | null;
  actorQuery?: string;
  businessReferenceQuery?: string;
  referenceQuery?: string;
};

export interface FinancialDocumentAnomalyAggregateRow {
  key: string;
  label: string;
  openCount: number;
  totalCount: number;
  criticalCount: number;
}

export interface FinancialDocumentAnomalySummary {
  total: number;
  open: number;
  resolved: number;
  ignored: number;
  critical: number;
  attention: number;
  information: number;
  documentsMissing: number;
  signedScanMissing: number;
  printedNotSigned: number;
  signedNotArchived: number;
  readyNotPrinted: number;
}

export interface FinancialDocumentAnomalyComputation {
  anomalies: FinancialDocumentAnomaly[];
  summary: FinancialDocumentAnomalySummary;
  byAgency: FinancialDocumentAnomalyAggregateRow[];
  byDocumentType: FinancialDocumentAnomalyAggregateRow[];
  byAnomalyType: FinancialDocumentAnomalyAggregateRow[];
  byActor: FinancialDocumentAnomalyAggregateRow[];
}
