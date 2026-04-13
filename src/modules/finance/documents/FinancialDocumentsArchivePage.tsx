import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { ActionButton, SectionCard, StandardLayoutWrapper, StatusBadge } from "@/ui";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import InfoTooltip from "@/shared/ui/InfoTooltip";
import {
  FINANCIAL_DOCUMENT_STATUSES,
  FINANCIAL_DOCUMENT_STATUS_LABELS,
  FINANCIAL_DOCUMENT_TYPE_LABELS,
  FINANCIAL_DOCUMENT_TYPES,
  type FinancialDocumentDoc,
  type FinancialDocumentFilter,
} from "./financialDocuments.types";
import {
  FINANCIAL_DOCUMENT_ANOMALY_SEVERITY_LABELS,
  FINANCIAL_DOCUMENT_ANOMALY_STATUSES,
  FINANCIAL_DOCUMENT_ANOMALY_STATUS_LABELS,
  FINANCIAL_DOCUMENT_ANOMALY_TYPE_LABELS,
  FINANCIAL_DOCUMENT_ANOMALY_TYPES,
  type FinancialDocumentAnomaly,
  type FinancialDocumentAnomalyFilter,
  type FinancialDocumentAnomalyStatus,
} from "./financialDocumentAnomalies.types";
import {
  applyFinancialDocumentFilters,
  attachFinancialDocumentSignedAttachment,
  isSignedAttachmentMissing,
  listFinancialDocuments,
  setFinancialDocumentStatus,
  uploadFinancialDocumentSignedAttachmentFile,
} from "./financialDocumentsService";
import {
  applyFinancialDocumentAnomalyFilters,
  listFinancialDocumentAnomalies,
  setFinancialDocumentAnomalyStatus,
} from "./financialDocumentAnomaliesService";
import {
  FINANCIAL_UI_LABELS,
  FINANCIAL_UI_TOOLTIPS,
  toAnomalyTypeLabel,
} from "@/modules/finance/ui/financialLanguage";

const DOCUMENTS_ARCHIVE_PAGE_SIZE = 250;

function toDateInput(value: Date): string {
  const y = value.getFullYear();
  const m = String(value.getMonth() + 1).padStart(2, "0");
  const d = String(value.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function buildTodayPeriod() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
  return { start, end };
}

function statusToUiStatus(
  status: FinancialDocumentDoc["status"]
): "active" | "pending" | "success" | "warning" | "neutral" {
  if (status === "signed" || status === "archived") return "success";
  if (status === "printed") return "active";
  if (status === "ready_to_print") return "warning";
  if (status === "draft") return "pending";
  return "neutral";
}

function toDateLabel(value: unknown): string {
  if (!value) return "-";
  if (typeof value === "object" && value != null && "toDate" in value) {
    try {
      const d = (value as { toDate: () => Date }).toDate();
      return d.toLocaleString("fr-FR");
    } catch {
      return "-";
    }
  }
  if (value instanceof Date) return value.toLocaleString("fr-FR");
  const d = new Date(String(value));
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleString("fr-FR");
}

function anomalySeverityBadgeClass(severity: FinancialDocumentAnomaly["severity"]): string {
  if (severity === "critique") return "bg-rose-100 text-rose-700";
  if (severity === "attention") return "bg-amber-100 text-amber-700";
  return "bg-sky-100 text-sky-700";
}

function anomalyStatusUi(
  status: FinancialDocumentAnomaly["status"]
): "active" | "pending" | "success" | "warning" | "neutral" {
  if (status === "resolved") return "success";
  if (status === "ignored") return "neutral";
  return "warning";
}

function summarizeAnomalies(rows: FinancialDocumentAnomaly[]) {
  const openRows = rows.filter((row) => row.status === "open");
  const countType = (type: FinancialDocumentAnomaly["anomalyType"]) =>
    openRows.filter((row) => row.anomalyType === type).length;
  return {
    total: rows.length,
    open: openRows.length,
    resolved: rows.filter((row) => row.status === "resolved").length,
    ignored: rows.filter((row) => row.status === "ignored").length,
    critical: openRows.filter((row) => row.severity === "critique").length,
    attention: openRows.filter((row) => row.severity === "attention").length,
    information: openRows.filter((row) => row.severity === "information").length,
    documentsMissing: countType("document_missing"),
    signedScanMissing: countType("signed_scan_missing"),
    printedNotSigned: countType("printed_not_signed"),
    signedNotArchived: countType("signed_not_archived"),
    readyNotPrinted: countType("ready_not_printed"),
  };
}

function anomalyPrimaryActionLabel(type: FinancialDocumentAnomaly["anomalyType"]): string {
  if (type === "document_missing") return "Créer / retrouver la pièce";
  if (type === "ready_not_printed") return "Imprimer la pièce";
  if (type === "printed_not_signed") return "Marquer signé";
  if (type === "signed_scan_missing") return "Ajouter la pièce signée";
  if (type === "signed_not_archived") return "Archiver";
  if (type === "duplicate_document") return "Vérifier le doublon";
  if (type === "business_reference_mismatch") return "Vérifier la référence";
  return "Ouvrir la source";
}

function aggregateAnomalies(
  rows: FinancialDocumentAnomaly[],
  keyFn: (row: FinancialDocumentAnomaly) => string | null,
  labelFn?: (key: string) => string
) {
  const map = new Map<string, { open: number; total: number; critical: number }>();
  rows.forEach((row) => {
    const key = keyFn(row);
    if (!key) return;
    const current = map.get(key) ?? { open: 0, total: 0, critical: 0 };
    current.total += 1;
    if (row.status === "open") {
      current.open += 1;
      if (row.severity === "critique") current.critical += 1;
    }
    map.set(key, current);
  });
  return Array.from(map.entries())
    .map(([key, value]) => ({
      key,
      label: labelFn ? labelFn(key) : key,
      openCount: value.open,
      totalCount: value.total,
      criticalCount: value.critical,
    }))
    .sort((a, b) => {
      if (b.openCount !== a.openCount) return b.openCount - a.openCount;
      if (b.criticalCount !== a.criticalCount) return b.criticalCount - a.criticalCount;
      return a.label.localeCompare(b.label, "fr");
    });
}

export default function FinancialDocumentsArchivePage() {
  const { user } = useAuth() as any;
  const { companyId: companyIdParam } = useParams<{ companyId: string }>();
  const companyId = companyIdParam ?? user?.companyId ?? "";
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const defaultAgencyId = pathname.startsWith("/agence") ? user?.agencyId ?? "" : "";
  const isAgencyScope = pathname.startsWith("/agence");

  const [documents, setDocuments] = useState<Array<FinancialDocumentDoc & { id: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filters, setFilters] = useState<FinancialDocumentFilter>(() => {
    const today = buildTodayPeriod();
    return {
      agencyId: defaultAgencyId || undefined,
      documentType: "all",
      status: "all",
      periodStart: today.start,
      periodEnd: today.end,
      actorQuery: "",
      businessReferenceQuery: "",
    };
  });
  const [anomalyFilters, setAnomalyFilters] = useState<FinancialDocumentAnomalyFilter>(() => {
    const today = buildTodayPeriod();
    return {
      agencyId: defaultAgencyId || undefined,
      documentType: "all",
      severity: "all",
      anomalyType: "all",
      status: "all",
      periodStart: today.start,
      periodEnd: today.end,
      actorQuery: "",
      businessReferenceQuery: "",
    };
  });
  const [documentAnomalyFilter, setDocumentAnomalyFilter] = useState<"all" | "with_anomaly" | "without_anomaly">("all");
  const [anomalies, setAnomalies] = useState<FinancialDocumentAnomaly[]>([]);
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [visibleLimit, setVisibleLimit] = useState(DOCUMENTS_ARCHIVE_PAGE_SIZE);

  const loadDocuments = useCallback(async () => {
    if (!companyId) {
      setDocuments([]);
      setAnomalies([]);
      setLoading(false);
      return;
    }
    setRefreshing(true);
    try {
      const rows = await listFinancialDocuments({
        companyId,
        limitCount: visibleLimit,
      });
      setDocuments(rows);
      setSelectedId((prev) => prev && rows.some((row) => row.id === prev) ? prev : rows[0]?.id ?? null);
      const anomalyResult = await listFinancialDocumentAnomalies({
        companyId,
        documents: rows,
      });
      setAnomalies(anomalyResult.anomalies);
    } catch (error) {
      console.error("[FinancialDocumentsArchive] load error", error);
      toast.error("Impossible de charger les documents financiers.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [companyId, visibleLimit]);

  useEffect(() => {
    setVisibleLimit(DOCUMENTS_ARCHIVE_PAGE_SIZE);
  }, [companyId]);

  useEffect(() => {
    void loadDocuments();
  }, [loadDocuments]);

  const filteredDocuments = useMemo(
    () => applyFinancialDocumentFilters(documents, filters),
    [documents, filters]
  );

  const mergedAnomalyFilters = useMemo<FinancialDocumentAnomalyFilter>(
    () => ({
      ...anomalyFilters,
      documentType:
        anomalyFilters.documentType && anomalyFilters.documentType !== "all"
          ? anomalyFilters.documentType
          : (filters.documentType ?? "all"),
      agencyId: anomalyFilters.agencyId ?? filters.agencyId ?? undefined,
      periodStart: anomalyFilters.periodStart ?? (filters.periodStart as Date | null) ?? null,
      periodEnd: anomalyFilters.periodEnd ?? (filters.periodEnd as Date | null) ?? null,
      actorQuery: anomalyFilters.actorQuery ?? filters.actorQuery ?? "",
      businessReferenceQuery:
        anomalyFilters.businessReferenceQuery ?? filters.businessReferenceQuery ?? "",
    }),
    [
      anomalyFilters,
      filters.actorQuery,
      filters.agencyId,
      filters.businessReferenceQuery,
      filters.periodEnd,
      filters.periodStart,
    ]
  );

  const filteredAnomalies = useMemo(
    () => applyFinancialDocumentAnomalyFilters(anomalies, mergedAnomalyFilters),
    [anomalies, mergedAnomalyFilters]
  );

  const actionableOpenAnomalies = useMemo(() => {
    const severityRank: Record<FinancialDocumentAnomaly["severity"], number> = {
      critique: 0,
      attention: 1,
      information: 2,
    };
    return filteredAnomalies
      .filter((row) => row.status === "open")
      .sort((a, b) => {
        const severityDiff = severityRank[a.severity] - severityRank[b.severity];
        if (severityDiff !== 0) return severityDiff;
        return a.detectedAt.getTime() - b.detectedAt.getTime();
      })
      .slice(0, 5);
  }, [filteredAnomalies]);

  const anomalySummary = useMemo(
    () => summarizeAnomalies(filteredAnomalies),
    [filteredAnomalies]
  );

  const agencyLabelById = useMemo(() => {
    const map = new Map<string, string>();
    documents.forEach((row) => {
      if (!row.agencyId) return;
      map.set(row.agencyId, row.agencyName ?? row.agencyId);
    });
    return map;
  }, [documents]);

  const anomalyByAgency = useMemo(
    () =>
      aggregateAnomalies(filteredAnomalies, (row) => row.agencyId, (id) => agencyLabelById.get(id) ?? id),
    [agencyLabelById, filteredAnomalies]
  );

  const anomalyByType = useMemo(
    () => aggregateAnomalies(filteredAnomalies, (row) => row.anomalyType),
    [filteredAnomalies]
  );

  const anomalyByDocType = useMemo(
    () => aggregateAnomalies(filteredAnomalies, (row) => row.documentType),
    [filteredAnomalies]
  );

  const anomalyByActor = useMemo(
    () =>
      aggregateAnomalies(
        filteredAnomalies,
        (row) => (row.actorSummary ? row.actorSummary : null)
      ),
    [filteredAnomalies]
  );

  const anomaliesByDocumentId = useMemo(() => {
    const map = new Map<string, FinancialDocumentAnomaly[]>();
    filteredAnomalies.forEach((row) => {
      if (!row.relatedDocumentId) return;
      const current = map.get(row.relatedDocumentId) ?? [];
      current.push(row);
      map.set(row.relatedDocumentId, current);
    });
    return map;
  }, [filteredAnomalies]);

  const displayedDocuments = useMemo(() => {
    if (documentAnomalyFilter === "all") return filteredDocuments;
    return filteredDocuments.filter((docRow) => {
      const count = (anomaliesByDocumentId.get(docRow.id) ?? []).length;
      if (documentAnomalyFilter === "with_anomaly") return count > 0;
      return count === 0;
    });
  }, [anomaliesByDocumentId, documentAnomalyFilter, filteredDocuments]);

  const selectedDocument = useMemo(
    () => displayedDocuments.find((docRow) => docRow.id === selectedId) ?? null,
    [displayedDocuments, selectedId]
  );

  const selectedDocumentAnomalies = useMemo(
    () => (selectedDocument ? anomaliesByDocumentId.get(selectedDocument.id) ?? [] : []),
    [anomaliesByDocumentId, selectedDocument]
  );

  const agencyOptions = useMemo(() => {
    const map = new Map<string, string>();
    documents.forEach((docRow) => {
      if (!docRow.agencyId) return;
      map.set(docRow.agencyId, docRow.agencyName ?? docRow.agencyId);
    });
    return Array.from(map.entries())
      .map(([id, label]) => ({ id, label }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [documents]);
  const canLoadMoreDocuments = documents.length >= visibleLimit;

  const updateStatus = useCallback(
    async (documentId: string, status: FinancialDocumentDoc["status"]) => {
      if (!companyId) return;
      try {
        await setFinancialDocumentStatus({
          companyId,
          documentId,
          status,
          updatedByUid: user?.uid ?? null,
        });
        toast.success("Statut du document mis a jour.");
        await loadDocuments();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Echec de mise a jour du statut.");
      }
    },
    [companyId, loadDocuments, user?.uid]
  );

  const uploadSignedFile = useCallback(
    async (documentId: string, file: File | null) => {
      if (!companyId || !file) return;
      try {
        const uploaded = await uploadFinancialDocumentSignedAttachmentFile(file, documentId);
        await attachFinancialDocumentSignedAttachment({
          companyId,
          documentId,
          url: uploaded.url,
          fileName: uploaded.fileName,
          mimeType: uploaded.mimeType,
          uploadedByUid: user?.uid ?? null,
        });
        toast.success("Piece signee archivee.");
        await loadDocuments();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Echec upload piece signee.");
      }
    },
    [companyId, loadDocuments, user?.uid]
  );

  const updateAnomalyStatus = useCallback(
    async (anomalyId: string, status: FinancialDocumentAnomalyStatus) => {
      if (!companyId) return;
      try {
        await setFinancialDocumentAnomalyStatus({
          companyId,
          anomalyId,
          status,
          updatedByUid: user?.uid ?? null,
        });
        toast.success("Statut anomalie mis a jour.");
        await loadDocuments();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Echec mise a jour anomalie.");
      }
    },
    [companyId, loadDocuments, user?.uid]
  );

  const applyQuickView = useCallback(
    (preset: "today" | "ready_to_print" | "printed" | "signed") => {
      if (preset === "today") {
        const today = buildTodayPeriod();
        setFilters((prev) => ({
          ...prev,
          status: "all",
          periodStart: today.start,
          periodEnd: today.end,
        }));
        setAnomalyFilters((prev) => ({
          ...prev,
          periodStart: today.start,
          periodEnd: today.end,
        }));
        return;
      }
      setFilters((prev) => ({
        ...prev,
        status: preset,
      }));
    },
    []
  );

  const openAnomalySource = useCallback(
    (anomaly: FinancialDocumentAnomaly) => {
      if (anomaly.relatedDocumentId) {
        navigate(`${anomaly.relatedDocumentId}/print`);
        return;
      }
      if (anomaly.sourceType === "shift_session" || anomaly.sourceType === "courier_session") {
        if (isAgencyScope) navigate("/agence/comptabilite?tab=versements");
        else navigate(`/compagnie/${companyId}/accounting/controle-validations`);
        return;
      }
      if (anomaly.sourceType === "transfer_request" || anomaly.sourceType === "internal_transfer") {
        if (isAgencyScope) navigate("/agence/comptabilite/treasury/transfer");
        else navigate(`/compagnie/${companyId}/accounting/tresorerie-reseau/transfer`);
        return;
      }
      if (
        anomaly.sourceType === "expense" ||
        anomaly.sourceType === "payable" ||
        anomaly.sourceType === "payable_payment" ||
        anomaly.sourceType === "payment_proposal" ||
        anomaly.sourceType === "fleet_maintenance"
      ) {
        if (isAgencyScope) navigate("/agence/comptabilite?tab=caisse");
        else navigate(`/compagnie/${companyId}/accounting/depenses`);
        return;
      }
      if (anomaly.sourceType === "payment") {
        navigate(`/compagnie/${companyId}/digital-cash`);
        return;
      }
      if (anomaly.sourceType === "daily_stats" || anomaly.sourceType === "monthly_report") {
        if (isAgencyScope) navigate("/agence/comptabilite");
        else navigate(`/compagnie/${companyId}/accounting/journal-rapports`);
      }
    },
    [companyId, isAgencyScope, navigate]
  );

  const runAnomalyPrimaryAction = useCallback(
    async (anomaly: FinancialDocumentAnomaly) => {
      if (anomaly.anomalyType === "printed_not_signed" && anomaly.relatedDocumentId) {
        await updateStatus(anomaly.relatedDocumentId, "signed");
        await updateAnomalyStatus(anomaly.anomalyId, "resolved");
        return;
      }
      if (anomaly.anomalyType === "signed_not_archived" && anomaly.relatedDocumentId) {
        await updateStatus(anomaly.relatedDocumentId, "archived");
        await updateAnomalyStatus(anomaly.anomalyId, "resolved");
        return;
      }
      if (anomaly.anomalyType === "signed_scan_missing" && anomaly.relatedDocumentId) {
        setSelectedId(anomaly.relatedDocumentId);
        toast.info("Ajoutez le scan signé depuis le détail du document.");
        return;
      }
      openAnomalySource(anomaly);
    },
    [openAnomalySource, updateAnomalyStatus, updateStatus]
  );

  if (!companyId) {
    return (
      <StandardLayoutWrapper className="space-y-4">
        <SectionCard
          title={FINANCIAL_UI_LABELS.documentsAndArchives}
          help={<InfoTooltip label={FINANCIAL_UI_TOOLTIPS.documentaryControl} />}
        >
          <div className="text-sm text-gray-600">Compagnie introuvable.</div>
        </SectionCard>
      </StandardLayoutWrapper>
    );
  }

  return (
    <StandardLayoutWrapper className="space-y-4">
      <SectionCard
        title="Documents et archives financieres"
        help={<InfoTooltip label={FINANCIAL_UI_TOOLTIPS.documentaryControl} />}
      >
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <label className="text-sm text-gray-700">
            Agence
            <select
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              value={filters.agencyId ?? ""}
              onChange={(e) =>
                setFilters((prev) => ({ ...prev, agencyId: e.target.value || undefined }))
              }
            >
              <option value="">Toutes</option>
              {agencyOptions.map((agency) => (
                <option key={agency.id} value={agency.id}>
                  {agency.label}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm text-gray-700">
            Type
            <select
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              value={filters.documentType ?? "all"}
              onChange={(e) =>
                setFilters((prev) => ({
                  ...prev,
                  documentType: e.target.value as FinancialDocumentFilter["documentType"],
                }))
              }
            >
              <option value="all">Tous</option>
              {FINANCIAL_DOCUMENT_TYPES.map((docType) => (
                <option key={docType} value={docType}>
                  {FINANCIAL_DOCUMENT_TYPE_LABELS[docType]}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm text-gray-700">
            Statut
            <select
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              value={filters.status ?? "all"}
              onChange={(e) =>
                setFilters((prev) => ({
                  ...prev,
                  status: e.target.value as FinancialDocumentFilter["status"],
                }))
              }
            >
              <option value="all">Tous</option>
              {FINANCIAL_DOCUMENT_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {FINANCIAL_DOCUMENT_STATUS_LABELS[status]}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="mt-3 rounded-lg border border-indigo-100 bg-indigo-50/40 p-3">
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-indigo-800">
            Vue terrain prioritaire
          </div>
          <div className="flex flex-wrap gap-2">
            <ActionButton type="button" size="sm" variant="secondary" onClick={() => applyQuickView("today")}>
              Documents du jour
            </ActionButton>
            <ActionButton
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => applyQuickView("ready_to_print")}
            >
              A imprimer
            </ActionButton>
            <ActionButton type="button" size="sm" variant="secondary" onClick={() => applyQuickView("printed")}>
              Non signes
            </ActionButton>
            <ActionButton type="button" size="sm" variant="secondary" onClick={() => applyQuickView("signed")}>
              Non archives
            </ActionButton>
            <ActionButton
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => {
                const today = buildTodayPeriod();
                setFilters((prev) => ({
                  ...prev,
                  status: "all",
                  periodStart: today.start,
                  periodEnd: today.end,
                  actorQuery: "",
                  businessReferenceQuery: "",
                }));
                setAnomalyFilters((prev) => ({
                  ...prev,
                  severity: "all",
                  anomalyType: "all",
                  status: "all",
                  periodStart: today.start,
                  periodEnd: today.end,
                  actorQuery: "",
                  businessReferenceQuery: "",
                }));
                setDocumentAnomalyFilter("all");
              }}
            >
              Reinitialiser
            </ActionButton>
            <ActionButton
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => setShowAdvancedFilters((prev) => !prev)}
            >
              {showAdvancedFilters ? "Masquer filtres avances" : "Afficher filtres avances"}
            </ActionButton>
          </div>
        </div>

        {showAdvancedFilters ? (
          <div className="mt-3 space-y-3 rounded-lg border border-gray-200 bg-white p-3">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
              <label className="text-sm text-gray-700">
                Debut
                <input
                  type="date"
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  value={filters.periodStart ? toDateInput(new Date(filters.periodStart as Date)) : ""}
                  onChange={(e) =>
                    setFilters((prev) => ({
                      ...prev,
                      periodStart: e.target.value ? new Date(`${e.target.value}T00:00:00`) : null,
                    }))
                  }
                />
              </label>
              <label className="text-sm text-gray-700">
                Fin
                <input
                  type="date"
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  value={filters.periodEnd ? toDateInput(new Date(filters.periodEnd as Date)) : ""}
                  onChange={(e) =>
                    setFilters((prev) => ({
                      ...prev,
                      periodEnd: e.target.value ? new Date(`${e.target.value}T23:59:59`) : null,
                    }))
                  }
                />
              </label>
              <label className="text-sm text-gray-700">
                Acteur
                <input
                  type="text"
                  placeholder="Nom / role / telephone"
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  value={filters.actorQuery ?? ""}
                  onChange={(e) =>
                    setFilters((prev) => ({ ...prev, actorQuery: e.target.value }))
                  }
                />
              </label>
              <label className="text-sm text-gray-700">
                Reference metier
                <input
                  type="text"
                  placeholder="Session / transfert / depense"
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  value={filters.businessReferenceQuery ?? ""}
                  onChange={(e) =>
                    setFilters((prev) => ({
                      ...prev,
                      businessReferenceQuery: e.target.value,
                    }))
                  }
                />
              </label>
            </div>
          </div>
        ) : null}

        <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
          <div className="rounded-lg border border-gray-200 bg-white px-3 py-2">
            <div className="flex items-center gap-1 text-xs text-gray-500">
              Anomalies ouvertes
              <InfoTooltip label={FINANCIAL_UI_TOOLTIPS.documentaryAnomaly} />
            </div>
            <div className="text-lg font-semibold text-gray-900">{anomalySummary.open}</div>
          </div>
          <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2">
            <div className="text-xs text-rose-600">Critiques</div>
            <div className="text-lg font-semibold text-rose-700">{anomalySummary.critical}</div>
          </div>
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
            <div className="text-xs text-amber-700">Imprimes non signes</div>
            <div className="text-lg font-semibold text-amber-700">{anomalySummary.printedNotSigned}</div>
          </div>
          <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2">
            <div className="flex items-center gap-1 text-xs text-rose-600">
              Scan signe manquant
              <InfoTooltip label={FINANCIAL_UI_TOOLTIPS.missingSignedScan} />
            </div>
            <div className="text-lg font-semibold text-rose-700">{anomalySummary.signedScanMissing}</div>
          </div>
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
            <div className="text-xs text-amber-700">Signes non archives</div>
            <div className="text-lg font-semibold text-amber-700">{anomalySummary.signedNotArchived}</div>
          </div>
          <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2">
            <div className="flex items-center gap-1 text-xs text-rose-600">
              Documents manquants
              <InfoTooltip label={FINANCIAL_UI_TOOLTIPS.missingDocument} />
            </div>
            <div className="text-lg font-semibold text-rose-700">{anomalySummary.documentsMissing}</div>
          </div>
        </div>

        {showAdvancedFilters ? (
          <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-4">
            <label className="text-sm text-gray-700">
              Filtre anomalie documentaire
              <select
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                value={documentAnomalyFilter}
                onChange={(e) =>
                  setDocumentAnomalyFilter(
                    e.target.value as "all" | "with_anomaly" | "without_anomaly"
                  )
                }
              >
                <option value="all">Tous les documents</option>
                <option value="with_anomaly">Documents avec anomalie</option>
                <option value="without_anomaly">Documents sans anomalie</option>
              </select>
            </label>
            <label className="text-sm text-gray-700">
              Gravite anomalie
              <select
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                value={anomalyFilters.severity ?? "all"}
                onChange={(e) =>
                  setAnomalyFilters((prev) => ({
                    ...prev,
                    severity: e.target.value as FinancialDocumentAnomalyFilter["severity"],
                  }))
                }
              >
                <option value="all">Toutes</option>
                <option value="critique">Critique</option>
                <option value="attention">Attention</option>
                <option value="information">Information</option>
              </select>
            </label>
            <label className="text-sm text-gray-700">
              Type anomalie
              <select
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                value={anomalyFilters.anomalyType ?? "all"}
                onChange={(e) =>
                  setAnomalyFilters((prev) => ({
                    ...prev,
                    anomalyType: e.target.value as FinancialDocumentAnomalyFilter["anomalyType"],
                  }))
                }
              >
                <option value="all">Tous</option>
                {FINANCIAL_DOCUMENT_ANOMALY_TYPES.map((anomalyType) => (
                  <option key={anomalyType} value={anomalyType}>
                    {FINANCIAL_DOCUMENT_ANOMALY_TYPE_LABELS[anomalyType]}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm text-gray-700">
              Statut resolution
              <select
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                value={anomalyFilters.status ?? "all"}
                onChange={(e) =>
                  setAnomalyFilters((prev) => ({
                    ...prev,
                    status: e.target.value as FinancialDocumentAnomalyFilter["status"],
                  }))
                }
              >
                <option value="all">Tous</option>
                {FINANCIAL_DOCUMENT_ANOMALY_STATUSES.map((anomalyStatus) => (
                  <option key={anomalyStatus} value={anomalyStatus}>
                    {FINANCIAL_DOCUMENT_ANOMALY_STATUS_LABELS[anomalyStatus]}
                  </option>
                ))}
              </select>
            </label>
          </div>
        ) : null}

        <div className="mt-4 flex items-center justify-between gap-2">
          <div className="text-sm text-gray-600">
            {displayedDocuments.length} document(s) trouve(s) - {filteredAnomalies.length} anomalie(s) - limite chargee {documents.length}/{visibleLimit}
          </div>
          <div className="flex items-center gap-2">
            <ActionButton
              type="button"
              variant="secondary"
              disabled={!canLoadMoreDocuments}
              onClick={() => setVisibleLimit((prev) => prev + DOCUMENTS_ARCHIVE_PAGE_SIZE)}
            >
              {canLoadMoreDocuments
                ? `Charger ${DOCUMENTS_ARCHIVE_PAGE_SIZE} de plus`
                : "Fin des resultats charges"}
            </ActionButton>
            <ActionButton type="button" variant="secondary" onClick={() => void loadDocuments()}>
              {refreshing ? "Actualisation..." : "Actualiser"}
            </ActionButton>
          </div>
        </div>
      </SectionCard>

      <SectionCard
        title="À traiter maintenant"
        help={<InfoTooltip label="Anomalies documentaires à action immédiate." />}
      >
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-gray-600">
            Priorité terrain: corriger les pièces manquantes, signatures et archivages sans parcourir tout l'historique.
          </p>
          <StatusBadge status={actionableOpenAnomalies.length > 0 ? "warning" : "success"}>
            {actionableOpenAnomalies.length > 0
              ? `${actionableOpenAnomalies.length} action(s)`
              : "Aucune action urgente"}
          </StatusBadge>
        </div>
        {actionableOpenAnomalies.length === 0 ? (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
            Aucun dossier documentaire urgent sur le filtre courant.
          </div>
        ) : (
          <div className="space-y-2">
            {actionableOpenAnomalies.map((anomaly) => (
              <div
                key={`priority-${anomaly.anomalyId}`}
                className="flex flex-col gap-2 rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-2 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge status={anomaly.severity === "critique" ? "danger" : "warning"}>
                      {FINANCIAL_DOCUMENT_ANOMALY_SEVERITY_LABELS[anomaly.severity]}
                    </StatusBadge>
                    <div className="text-sm font-medium text-slate-900">
                      {toAnomalyTypeLabel(anomaly.anomalyType)}
                    </div>
                  </div>
                  <div className="mt-0.5 text-xs text-slate-600">{anomaly.message}</div>
                </div>
                <ActionButton
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={() => void runAnomalyPrimaryAction(anomaly)}
                >
                  {anomalyPrimaryActionLabel(anomaly.anomalyType)}
                </ActionButton>
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      <SectionCard
        title="Registre documentaire"
        help={<InfoTooltip label={FINANCIAL_UI_TOOLTIPS.documentaryAnomaly} />}
      >
        {loading ? (
          <div className="py-6 text-sm text-gray-500">Chargement des archives...</div>
        ) : displayedDocuments.length === 0 ? (
          <div className="py-6 text-sm text-gray-500">Aucun document selon les filtres.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-left text-xs uppercase tracking-wide text-gray-500">
                  <th className="px-3 py-2">Document</th>
                  <th className="px-3 py-2">Type</th>
                  <th className="px-3 py-2">Agence</th>
                  <th className="px-3 py-2 text-right">Montant</th>
                  <th className="px-3 py-2">Statut</th>
                  <th className="px-3 py-2">Anomalies</th>
                  <th className="px-3 py-2">Piece signee</th>
                </tr>
              </thead>
              <tbody>
                {displayedDocuments.map((docRow) => {
                  const missingSigned = isSignedAttachmentMissing(docRow);
                  const docAnomalies = anomaliesByDocumentId.get(docRow.id) ?? [];
                  const hasCritical = docAnomalies.some(
                    (anomaly) => anomaly.status === "open" && anomaly.severity === "critique"
                  );
                  return (
                    <tr
                      key={docRow.id}
                      className={`border-b border-gray-100 cursor-pointer ${
                        selectedId === docRow.id ? "bg-indigo-50/40" : "hover:bg-gray-50"
                      }`}
                      onClick={() => setSelectedId(docRow.id)}
                    >
                      <td className="px-3 py-2">
                        <div className="font-semibold text-gray-900">{docRow.documentNumber}</div>
                        <div className="text-xs text-gray-500">
                          {toDateLabel(docRow.occurredAt)}
                        </div>
                      </td>
                      <td className="px-3 py-2 text-gray-700">
                        {FINANCIAL_DOCUMENT_TYPE_LABELS[docRow.documentType]}
                      </td>
                      <td className="px-3 py-2 text-gray-700">
                        {docRow.agencyName ?? docRow.agencyId ?? "-"}
                      </td>
                      <td className="px-3 py-2 text-right font-medium text-gray-900">
                        {Number(docRow.amountTotal ?? 0).toLocaleString("fr-FR")}{" "}
                        {docRow.currency ?? "XOF"}
                      </td>
                      <td className="px-3 py-2">
                        <StatusBadge status={statusToUiStatus(docRow.status)}>
                          {FINANCIAL_DOCUMENT_STATUS_LABELS[docRow.status]}
                        </StatusBadge>
                      </td>
                      <td className="px-3 py-2">
                        {docAnomalies.length > 0 ? (
                          <span
                            className={`rounded-full px-2 py-1 text-xs font-semibold ${
                              hasCritical
                                ? "bg-rose-100 text-rose-700"
                                : "bg-amber-100 text-amber-700"
                            }`}
                          >
                            {docAnomalies.length} anomalie(s)
                          </span>
                        ) : (
                          <span className="rounded-full bg-emerald-100 px-2 py-1 text-xs font-semibold text-emerald-700">
                            Aucune
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        {missingSigned ? (
                          <span className="rounded-full bg-rose-100 px-2 py-1 text-xs font-semibold text-rose-700">
                            Manquante
                          </span>
                        ) : (
                          <span className="rounded-full bg-emerald-100 px-2 py-1 text-xs font-semibold text-emerald-700">
                            OK
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      <SectionCard
        title={
          isAgencyScope
            ? "Pieces manquantes / anomalies documentaires (agence)"
            : "Pilotage des anomalies documentaires (reseau)"
        }
        help={<InfoTooltip label={FINANCIAL_UI_TOOLTIPS.documentaryAnomaly} />}
      >
        {filteredAnomalies.length === 0 ? (
          <div className="py-4 text-sm text-gray-600">Aucune anomalie selon les filtres.</div>
        ) : (
          <div className="space-y-4">
            {!isAgencyScope && (
              <div className="grid grid-cols-1 gap-3 xl:grid-cols-4">
                <div className="rounded-lg border border-gray-200 p-3">
                  <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Agences les plus en retard
                  </div>
                  <div className="space-y-1 text-sm">
                    {anomalyByAgency.slice(0, 5).map((row) => (
                      <div key={row.key} className="flex items-center justify-between gap-3">
                        <span className="truncate">{row.label}</span>
                        <span className="font-semibold text-rose-700">{row.openCount}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="rounded-lg border border-gray-200 p-3">
                  <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Types documents impactes
                  </div>
                  <div className="space-y-1 text-sm">
                    {anomalyByDocType.slice(0, 5).map((row) => (
                      <div key={row.key} className="flex items-center justify-between gap-3">
                        <span className="truncate">{FINANCIAL_DOCUMENT_TYPE_LABELS[row.key as keyof typeof FINANCIAL_DOCUMENT_TYPE_LABELS] ?? row.label}</span>
                        <span className="font-semibold text-amber-700">{row.openCount}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="rounded-lg border border-gray-200 p-3">
                  <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Types anomalies
                  </div>
                  <div className="space-y-1 text-sm">
                    {anomalyByType.slice(0, 5).map((row) => (
                      <div key={row.key} className="flex items-center justify-between gap-3">
                        <span className="truncate">
                          {toAnomalyTypeLabel(row.key)}
                        </span>
                        <span className="font-semibold text-gray-900">{row.openCount}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="rounded-lg border border-gray-200 p-3">
                  <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Acteurs recurrents
                  </div>
                  <div className="space-y-1 text-sm">
                    {anomalyByActor.slice(0, 5).map((row) => (
                      <div key={row.key} className="flex items-center justify-between gap-3">
                        <span className="truncate">{row.label}</span>
                        <span className="font-semibold text-gray-900">{row.openCount}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 text-left text-xs uppercase tracking-wide text-gray-500">
                    <th className="px-3 py-2">Gravite</th>
                    <th className="px-3 py-2">Anomalie</th>
                    <th className="px-3 py-2">Document</th>
                    <th className="px-3 py-2">Agence</th>
                    <th className="px-3 py-2">Reference</th>
                    <th className="px-3 py-2">Statut</th>
                    <th className="px-3 py-2">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredAnomalies.slice(0, 200).map((anomaly) => (
                    <tr key={anomaly.anomalyId} className="border-b border-gray-100">
                      <td className="px-3 py-2">
                        <span className={`rounded-full px-2 py-1 text-xs font-semibold ${anomalySeverityBadgeClass(anomaly.severity)}`}>
                          {FINANCIAL_DOCUMENT_ANOMALY_SEVERITY_LABELS[anomaly.severity]}
                        </span>
                      </td>
                      <td className="px-3 py-2">
                        <div className="font-medium text-gray-900">
                          {toAnomalyTypeLabel(anomaly.anomalyType)}
                        </div>
                        <div className="text-xs text-gray-500">{anomaly.message}</div>
                      </td>
                      <td className="px-3 py-2 text-gray-700">
                        {anomaly.documentType
                          ? FINANCIAL_DOCUMENT_TYPE_LABELS[anomaly.documentType]
                          : "-"}
                      </td>
                      <td className="px-3 py-2 text-gray-700">
                        {anomaly.agencyId ? agencyLabelById.get(anomaly.agencyId) ?? anomaly.agencyId : "Niveau compagnie"}
                      </td>
                      <td className="px-3 py-2 text-gray-700">
                        {anomaly.businessReference ?? "-"}
                      </td>
                      <td className="px-3 py-2">
                        <StatusBadge status={anomalyStatusUi(anomaly.status)}>
                          {FINANCIAL_DOCUMENT_ANOMALY_STATUS_LABELS[anomaly.status]}
                        </StatusBadge>
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex flex-wrap gap-2">
                          <ActionButton
                            type="button"
                            size="sm"
                            variant="secondary"
                            onClick={() => void runAnomalyPrimaryAction(anomaly)}
                          >
                            {anomalyPrimaryActionLabel(anomaly.anomalyType)}
                          </ActionButton>
                          <ActionButton
                            type="button"
                            size="sm"
                            variant="secondary"
                            onClick={() => openAnomalySource(anomaly)}
                          >
                            Ouvrir source
                          </ActionButton>
                          {anomaly.status !== "resolved" && (
                            <ActionButton
                              type="button"
                              size="sm"
                              variant="secondary"
                              onClick={() => void updateAnomalyStatus(anomaly.anomalyId, "resolved")}
                            >
                              Resoudre
                            </ActionButton>
                          )}
                          {anomaly.status !== "ignored" && (
                            <ActionButton
                              type="button"
                              size="sm"
                              variant="secondary"
                              onClick={() => void updateAnomalyStatus(anomaly.anomalyId, "ignored")}
                            >
                              Ignorer
                            </ActionButton>
                          )}
                          {anomaly.status !== "open" && (
                            <ActionButton
                              type="button"
                              size="sm"
                              variant="secondary"
                              onClick={() => void updateAnomalyStatus(anomaly.anomalyId, "open")}
                            >
                              Reouvrir
                            </ActionButton>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </SectionCard>

      {selectedDocument && (
        <SectionCard title="Detail du document">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="space-y-2 text-sm text-gray-700">
              <div>
                <span className="font-semibold text-gray-900">Numero:</span>{" "}
                {selectedDocument.documentNumber}
              </div>
              <div>
                <span className="font-semibold text-gray-900">Reference:</span>{" "}
                {selectedDocument.businessReference ?? selectedDocument.sourceId}
              </div>
              <div>
                <span className="font-semibold text-gray-900">Service:</span>{" "}
                {selectedDocument.service ?? "-"}
              </div>
              <div>
                <span className="font-semibold text-gray-900">Observations:</span>{" "}
                {selectedDocument.observations ?? "-"}
              </div>
            </div>
            <div className="space-y-2 text-sm text-gray-700">
              <div>
                <span className="font-semibold text-gray-900">Acteurs:</span>
              </div>
              <ul className="space-y-1">
                {selectedDocument.actors.length === 0 ? (
                  <li>-</li>
                ) : (
                  selectedDocument.actors.map((actor, idx) => (
                    <li key={`${actor.uid ?? actor.name}-${idx}`}>
                      {actor.name} - {actor.role}
                      {actor.phone ? ` - ${actor.phone}` : ""}
                    </li>
                  ))
                )}
              </ul>
            </div>
          </div>

          <div className="mt-4 rounded-lg border border-gray-200 bg-gray-50 p-3">
            <div className="text-sm font-semibold text-gray-900">
              Anomalies liees a ce document ({selectedDocumentAnomalies.length})
            </div>
            {selectedDocumentAnomalies.length === 0 ? (
              <div className="mt-1 text-sm text-gray-600">Aucune anomalie active sur ce document.</div>
            ) : (
              <div className="mt-2 space-y-2">
                {selectedDocumentAnomalies.map((anomaly) => (
                  <div
                    key={anomaly.anomalyId}
                    className="flex flex-wrap items-center gap-2 rounded border border-gray-200 bg-white px-2 py-1.5 text-xs"
                  >
                    <span className={`rounded-full px-2 py-0.5 font-semibold ${anomalySeverityBadgeClass(anomaly.severity)}`}>
                      {FINANCIAL_DOCUMENT_ANOMALY_SEVERITY_LABELS[anomaly.severity]}
                    </span>
                    <span className="font-medium text-gray-900">
                      {toAnomalyTypeLabel(anomaly.anomalyType)}
                    </span>
                    <span className="text-gray-600">{anomaly.message}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <ActionButton
              type="button"
              onClick={() => navigate(`${selectedDocument.id}/print`)}
            >
              Ouvrir / imprimer
            </ActionButton>
            <ActionButton
              type="button"
              variant="secondary"
              onClick={() => void updateStatus(selectedDocument.id, "printed")}
            >
              Marquer imprime
            </ActionButton>
            <ActionButton
              type="button"
              variant="secondary"
              onClick={() => void updateStatus(selectedDocument.id, "signed")}
            >
              Marquer signe
            </ActionButton>
            <ActionButton
              type="button"
              variant="secondary"
              onClick={() => void updateStatus(selectedDocument.id, "archived")}
            >
              Archiver
            </ActionButton>
          </div>

          <div className="mt-3 text-sm text-gray-700">
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-gray-300 px-3 py-2 hover:bg-gray-50">
              <span>Uploader scan/photo signee</span>
              <input
                type="file"
                className="hidden"
                accept="image/*"
                onChange={(e) => {
                  const file = e.target.files?.[0] ?? null;
                  void uploadSignedFile(selectedDocument.id, file);
                  e.currentTarget.value = "";
                }}
              />
            </label>
            {selectedDocument.signedAttachment?.url ? (
              <a
                href={selectedDocument.signedAttachment.url}
                target="_blank"
                rel="noreferrer"
                className="ml-3 text-sm font-medium text-indigo-700 hover:underline"
              >
                Voir la piece archivee
              </a>
            ) : null}
          </div>
        </SectionCard>
      )}
    </StandardLayoutWrapper>
  );
}




