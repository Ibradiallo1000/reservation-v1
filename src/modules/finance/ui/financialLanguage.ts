import {
  FINANCIAL_DOCUMENT_ANOMALY_TYPE_LABELS,
  type FinancialDocumentAnomalyType,
} from "@/modules/finance/documents/financialDocumentAnomalies.types";

export const FINANCIAL_UI_LABELS = {
  dashboard: "Tableau de bord",
  kpi: "Indicateurs cles",
  metrics: "Indicateurs",
  ledger: "Journal financier",
  posted: "Comptabilise",
  pending: "En attente",
  failed: "A corriger",
  payables: "Montants a payer",
  reconciliation: "Rapprochement",
  override: "Ajustement manuel",
  realMoney: "Argent reel",
  pendingMoney: "Argent en attente",
  commercialActivity: "Activite commerciale",
  documentsAndArchives: "Documents et archives",
  documentaryAnomalies: "Anomalies documentaires",
} as const;

export const FINANCIAL_UI_TOOLTIPS = {
  realMoney:
    "Argent deja reconnu dans la tresorerie de l'entreprise.",
  pendingMoney:
    "Argent lie a des operations faites, mais pas encore entierement finalisees.",
  commercialActivity:
    "Valeur des ventes et operations. Ce montant ne correspond pas toujours a de l'argent deja disponible.",
  missingDocument:
    "L'operation existe, mais le document justificatif attendu est absent.",
  missingSignedScan:
    "Le document est declare signe, mais sa copie signee n'a pas encore ete deposee.",
  posted:
    "Operation deja integree dans le suivi financier reel.",
  toFix:
    "Une anomalie ou un blocage empeche la finalisation correcte de cette operation.",
  documentaryControl:
    "Suivi des pieces imprimees, signees et archivees pour chaque operation sensible.",
  documentaryAnomaly:
    "Ecart entre l'etat de l'operation et l'etat de sa piece justificative.",
  indicators:
    "Indicateurs cles pour piloter rapidement les priorites financieres.",
  pendingCash:
    "Montant des remises et validations en attente de consolidation finale.",
} as const;

function normalizeToken(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");
}

export function toLedgerStatusLabel(status: string): string {
  const token = normalizeToken(status);
  if (token === "posted") return FINANCIAL_UI_LABELS.posted;
  if (token === "pending") return "En attente de comptabilisation";
  if (token === "failed") return FINANCIAL_UI_LABELS.failed;
  if (token === "validated") return "Valide";
  if (token === "rejected") return "Refuse";
  return status;
}

export function toWorkflowStatusLabel(status: string | null | undefined): string {
  const token = normalizeToken(status);
  if (!token) return "Inconnu";
  if (token === "pending_manager") return "A verser (visa chef agence)";
  if (token === "pending_head_accountant") return "En attente chef comptable";
  if (token === "pending_dg") return "En attente DG";
  if (token === "authorized" || token === "approved") return "Sortie autorisee";
  if (token === "in_transit_bank") return "En transit vers banque";
  if (token === "deposited_bank") return "Depose en banque";
  if (token === "in_transit_inter_agency") return "En transit inter-agence";
  if (token === "received_inter_agency") return "Depose en caisse destination";
  if (token === "pending" || token === "en_attente") return "En attente";
  if (token === "validated" || token === "valide") return "Valide";
  if (token === "rejected" || token === "refused") return "Refuse";
  if (token === "failed") return "A corriger";
  if (token === "executed") return "Depose en banque";
  return status ?? "Inconnu";
}

export function toPaymentChannelLabel(channel: string | null | undefined): string {
  const token = normalizeToken(channel);
  if (!token) return "Autre";
  if (token === "online" || token === "en_ligne") return "En ligne";
  if (token === "guichet" || token === "counter") return "Guichet";
  if (token === "courier" || token === "courrier") return "Courrier";
  if (token === "mobile_money") return "Mobile money";
  if (token === "cash" || token === "especes") return "Especes";
  return channel ?? "Autre";
}

export function toPaymentProviderLabel(provider: string | null | undefined): string {
  const token = normalizeToken(provider);
  if (!token) return "Autre";
  if (token === "wave") return "Wave";
  if (token === "orange") return "Orange Money";
  if (token === "moov") return "Moov Money";
  if (token === "sarali") return "Sarali";
  if (token === "cash" || token === "especes") return "Especes";
  return provider ?? "Autre";
}

export function toFlowTypeLabel(flowType: string | null | undefined): string {
  const token = normalizeToken(flowType);
  if (!token) return "Autre";
  if (token === "bank_deposit") return "Versement banque";
  if (token === "inter_agency_transfer") return "Transfert inter-agence";
  if (token === "payment_received") return "Encaissement";
  if (token === "remittance") return "Remise";
  if (token === "transfer" || token === "transfer_to_bank") return "Transfert";
  if (token === "internal_transfer") return "Transfert interne";
  if (token === "bank_withdrawal") return "Retrait banque";
  if (token === "refund") return "Remboursement";
  if (token === "expense") return "Depense";
  return flowType ?? "Autre";
}

export function toTechnicalFailureLabel(code: string | null | undefined): string {
  const token = normalizeToken(code);
  if (!token) return "Blocage a corriger";
  if (token === "ledger_write_failed") {
    return "Ecriture dans le journal financier non finalisee";
  }
  if (token === "finance_side_effects_failed") {
    return "Mise a jour financiere incomplete";
  }
  if (token === "permission-denied") {
    return "Acces refuse pour finaliser l'operation";
  }
  return "Blocage a corriger";
}

export function toAnomalyTypeLabel(type: string): string {
  const token = normalizeToken(type) as FinancialDocumentAnomalyType;
  return FINANCIAL_DOCUMENT_ANOMALY_TYPE_LABELS[token] ?? type;
}
