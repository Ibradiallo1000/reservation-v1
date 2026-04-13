import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { collection, getDocs } from "firebase/firestore";
import { ArrowRightLeft, Landmark, ShieldCheck, Truck } from "lucide-react";
import { toast } from "sonner";
import { db } from "@/firebaseConfig";
import { useAuth } from "@/contexts/AuthContext";
import { ActionButton, SectionCard, StandardLayoutWrapper, StatusBadge } from "@/ui";
import {
  ensureCompanyBankAccount,
  getAccount,
  listAccounts,
} from "@/modules/compagnie/treasury/financialAccounts";
import { listCompanyBanks } from "@/modules/compagnie/treasury/companyBanks";
import { getFinancialAccountDisplayName } from "@/modules/compagnie/treasury/accountDisplay";
import { getAgencyTreasuryLedgerCashDisplay } from "@/modules/agence/comptabilite/agencyCashAuditService";
import { agencyCashAccountId } from "@/modules/compagnie/treasury/types";
import {
  approveTransferByDg,
  approveTransferByHeadAccountant,
  approveTransferRequest,
  confirmBankDeposit,
  confirmInterAgencyReception,
  createInterAgencyTransferRequest,
  listTransferRequests,
  markTransferAsInTransit,
  recordDirectLocalBankDeposit,
  rejectTransferRequest,
  type TransferCaptureMode,
  type TransferRequestDoc,
  type TransferRequestFlowType,
} from "@/modules/agence/treasury/transferRequestsService";
import {
  getBankDepositDocumentId,
  getInternalTransferDocumentId,
  getTreasuryTransferDocumentId,
} from "@/modules/finance/documents/financialDocumentsService";
import { formatCurrency } from "@/shared/utils/formatCurrency";

type AccountRow = {
  id: string;
  agencyId: string | null;
  accountType: string;
  accountName: string;
  currentBalance: number;
  currency: string;
};

type AgencyOption = {
  id: string;
  name: string;
};

type RequestRow = TransferRequestDoc & { id: string };

type ManualCreateForm = {
  captureMode: TransferCaptureMode;
  manualDocumentUsed: boolean;
  manualDocumentType: string;
  manualDocumentNumber: string;
  regularizedByName: string;
};

type BankRequestForm = {
  toAccountId: string;
  bankBranchName: string;
  amount: string;
  operationDate: string;
  operationHour: string;
  bankReceiptNumber: string;
  observation: string;
} & ManualCreateForm;

type InterAgencyRequestForm = {
  destinationAgencyId: string;
  relayBankAccountId: string;
  amount: string;
  plannedDate: string;
  plannedExecutorName: string;
  observation: string;
} & ManualCreateForm;

type ActionManualForm = {
  captureMode: TransferCaptureMode;
  manualDocumentUsed: boolean;
  manualDocumentType: string;
  manualDocumentNumber: string;
  regularizedByName: string;
};

type InTransitDialogState = {
  row: RequestRow;
  operationDate: string;
  observation: string;
} & ActionManualForm;

type ConfirmDepositDialogState = {
  row: RequestRow;
  bankName: string;
  bankBranchName: string;
  amountDeposited: string;
  operationDate: string;
  operationHour: string;
  bankReceiptNumber: string;
  manualReceiptUsed: boolean;
  manualReceiptNumber: string;
  observation: string;
} & ActionManualForm;

type PrintReadyState = {
  title: string;
  subtitle: string;
  primaryLabel: string;
  documentId: string;
  messageLines?: string[];
  showSecondaryAction?: boolean;
  secondaryLabel?: string;
  showArchiveAction?: boolean;
  openPrimaryInNewTab?: boolean;
  depositSummary?: {
    bankLabel: string;
    amount: number;
    currency: string;
    operationDate: string;
    receiptNumber: string;
  };
};

type RejectDialogState = {
  row: RequestRow;
  reason: string;
};

type ConfirmInterReceptionDialogState = {
  row: RequestRow;
  amountReceived: string;
  operationDate: string;
  operationHour: string;
  manualReceiptUsed: boolean;
  manualReceiptNumber: string;
  observation: string;
} & ActionManualForm;

type InterReceptionReadyState = {
  row: RequestRow;
  amountReceived: number;
};

type StatusFilter = "all" | "open" | "transit" | "closed";
type FlowFilter = "all" | TransferRequestFlowType;

const ROLE_INITIATOR = new Set(["agency_accountant", "admin_compagnie"]);
const ROLE_MANAGER = new Set(["chefAgence", "chefagence", "superviseur", "admin_compagnie"]);
const ROLE_HEAD_ACCOUNTANT = new Set([
  "company_accountant",
  "financial_director",
  "admin_compagnie",
]);
const ROLE_DG = new Set(["company_ceo", "admin_compagnie"]);

const INITIAL_MANUAL_FORM: ManualCreateForm = {
  captureMode: "normal",
  manualDocumentUsed: false,
  manualDocumentType: "",
  manualDocumentNumber: "",
  regularizedByName: "",
};

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function nowHourMinute(): string {
  const d = new Date();
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

function parseNumber(input: string): number {
  const normalized = String(input ?? "").replace(",", ".").trim();
  if (!normalized) return Number.NaN;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

function toManualActionForm(row: RequestRow, fallbackRegularizer: string): ActionManualForm {
  return {
    captureMode: row.captureMode ?? "normal",
    manualDocumentUsed: Boolean(row.manualDocumentUsed),
    manualDocumentType: String(row.manualDocumentType ?? "").trim(),
    manualDocumentNumber: String(row.manualDocumentNumber ?? "").trim(),
    regularizedByName:
      String(row.regularizedByName ?? "").trim() || fallbackRegularizer || "",
  };
}

function toMillis(value: unknown): number {
  if (!value) return 0;
  if (value instanceof Date) return value.getTime();
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const ms = Date.parse(value);
    return Number.isNaN(ms) ? 0 : ms;
  }
  if (typeof value === "object") {
    const row = value as { toMillis?: () => number; toDate?: () => Date; seconds?: number };
    if (typeof row.toMillis === "function") {
      const ms = row.toMillis();
      return Number.isFinite(ms) ? ms : 0;
    }
    if (typeof row.toDate === "function") {
      const d = row.toDate();
      return d instanceof Date ? d.getTime() : 0;
    }
    if (typeof row.seconds === "number" && Number.isFinite(row.seconds)) return row.seconds * 1000;
  }
  return 0;
}

function formatDateTime(value: unknown): string {
  const ms = toMillis(value);
  if (!ms) return "-";
  return new Date(ms).toLocaleString("fr-FR");
}

function formatDateOnly(value: string): string {
  const raw = String(value ?? "").trim();
  if (!raw) return "-";
  const parsed = new Date(`${raw}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return raw;
  return parsed.toLocaleDateString("fr-FR");
}

function hasAnyRole(roles: string[], target: Set<string>): boolean {
  return roles.some((role) => target.has(role));
}

function getFlowLabel(flowType: TransferRequestFlowType): string {
  return flowType === "inter_agency_transfer"
    ? "Transfert physique inter-agence"
    : "Versement banque";
}

function getApprovalLevelLabel(level: string | null | undefined): string {
  if (level === "agency_only") return "Validation locale (chef d'agence)";
  if (level === "head_accountant") return "Visa chef comptable requis";
  if (level === "dg") return "Visa DG requis";
  return "Niveau non defini";
}

function getStatusLabel(request: RequestRow): string {
  if (request.flowType === "bank_deposit") {
    return "Dépôt enregistré";
  }

  if (
    request.status === "pending_manager" ||
    request.status === "pending_head_accountant" ||
    request.status === "pending_dg"
  ) {
    return "A transferer";
  }
  if (request.status === "authorized") return "Sortie autorisee";
  if (request.status === "in_transit_inter_agency") return "En transit inter-agence";
  if (request.status === "received_inter_agency") return "Depose en caisse destination";
  if (request.status === "rejected") return "Refuse";
  return request.status;
}

function getStatusBadge(request: RequestRow): "success" | "warning" | "pending" | "danger" | "neutral" {
  if (request.flowType === "bank_deposit") {
    return "success";
  }
  if (request.status === "rejected") return "danger";
  if (request.status === "deposited_bank" || request.status === "received_inter_agency") return "success";
  if (request.status === "in_transit_bank" || request.status === "in_transit_inter_agency") return "warning";
  if (
    request.status === "pending_manager" ||
      request.status === "pending_head_accountant" ||
      request.status === "pending_dg"
  ) {
    return "pending";
  }
  if (request.status === "authorized") return "neutral";
  return "neutral";
}

function getCaptureModeLabel(mode: TransferCaptureMode): string {
  return mode === "after_entry" ? "Saisie après coup" : "Saisie normale";
}

function normalizeActorDisplay(uid: string | null | undefined, role: string | null | undefined): string {
  const roleLabel = String(role ?? "").trim();
  const actor = String(uid ?? "").trim() || "-";
  return roleLabel ? `${actor} (${roleLabel})` : actor;
}

function toRoleList(role: string | string[] | null | undefined): string[] {
  if (Array.isArray(role)) return role.map((r) => String(r ?? "").trim()).filter(Boolean);
  if (role) return [String(role).trim()].filter(Boolean);
  return [];
}

function isOpenStatus(status: string, flowType: TransferRequestFlowType): boolean {
  if (flowType === "bank_deposit") return false;
  return (
    status === "pending_manager" ||
    status === "pending_head_accountant" ||
    status === "pending_dg" ||
    status === "authorized"
  );
}

function isTransitStatus(status: string, flowType: TransferRequestFlowType): boolean {
  if (flowType === "bank_deposit") return false;
  return status === "in_transit_bank" || status === "in_transit_inter_agency";
}

function isClosedStatus(status: string, flowType: TransferRequestFlowType): boolean {
  if (flowType === "bank_deposit") return true;
  return status === "deposited_bank" || status === "received_inter_agency" || status === "rejected";
}

function isSensitiveRequest(row: RequestRow): boolean {
  return row.approvalLevelRequired !== "agency_only";
}

export default function AgencyTreasuryTransferPage() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const isStandaloneComptaTreasury = pathname.startsWith("/agence/comptabilite/treasury");
  const { user } = useAuth() as {
    user?: {
      uid?: string;
      role?: string | string[];
      companyId?: string;
      agencyId?: string;
      displayName?: string | null;
      email?: string | null;
    } | null;
  };
  const companyId = String(user?.companyId ?? "").trim();
  const agencyId = String(user?.agencyId ?? "").trim();
  const roles = useMemo(() => toRoleList(user?.role), [user?.role]);
  const actorDisplayName =
    String(user?.displayName ?? "").trim() || String(user?.email ?? "").trim() || String(user?.uid ?? "").trim();

  const canInitiate = hasAnyRole(roles, ROLE_INITIATOR);
  const canManager = hasAnyRole(roles, ROLE_MANAGER);
  const canHeadAccountant = hasAnyRole(roles, ROLE_HEAD_ACCOUNTANT);
  const canDg = hasAnyRole(roles, ROLE_DG);
  const canDestinationReceive = roles.includes("agency_accountant") || roles.includes("admin_compagnie");
  const canAccessTransferPage =
    canInitiate || canManager || canHeadAccountant || canDg || canDestinationReceive;
  const canRejectAtAnyLevel = canManager || canHeadAccountant || canDg;
  const managerOnlyView = canManager && !canInitiate;

  const [companyBankAccounts, setCompanyBankAccounts] = useState<AccountRow[]>([]);
  const [agencyCashAccount, setAgencyCashAccount] = useState<{
    id: string;
    currentBalance: number;
    currency: string;
  } | null>(null);
  const [ledgerCash, setLedgerCash] = useState<number>(0);
  const [mirrorCashSecondary, setMirrorCashSecondary] = useState<number | null>(null);
  const [companyBankNameById, setCompanyBankNameById] = useState<Record<string, string>>({});
  const [agencyOptions, setAgencyOptions] = useState<AgencyOption[]>([]);
  const [agencyNameById, setAgencyNameById] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [requestsLoading, setRequestsLoading] = useState(false);
  const [submittingBank, setSubmittingBank] = useState(false);
  const [submittingInter, setSubmittingInter] = useState(false);
  const [busyRequestId, setBusyRequestId] = useState<string | null>(null);
  const [requests, setRequests] = useState<RequestRow[]>([]);
  const [flowFilter, setFlowFilter] = useState<FlowFilter>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [afterEntryOnly, setAfterEntryOnly] = useState(false);
  const [showResponsibilityHelp, setShowResponsibilityHelp] = useState(false);
  const [showBankManualMode, setShowBankManualMode] = useState(false);
  const [showInTransitAdvanced, setShowInTransitAdvanced] = useState(false);
  const [showConfirmDepositAdvanced, setShowConfirmDepositAdvanced] = useState(false);
  const [showInterReceptionAdvanced, setShowInterReceptionAdvanced] = useState(false);
  const [bankForm, setBankForm] = useState<BankRequestForm>({
    toAccountId: "",
    bankBranchName: "",
    amount: "",
    operationDate: todayIsoDate(),
    operationHour: nowHourMinute(),
    bankReceiptNumber: "",
    observation: "",
    ...INITIAL_MANUAL_FORM,
  });
  const [interForm, setInterForm] = useState<InterAgencyRequestForm>({
    destinationAgencyId: "",
    relayBankAccountId: "",
    amount: "",
    plannedDate: todayIsoDate(),
    plannedExecutorName: "",
    observation: "",
    ...INITIAL_MANUAL_FORM,
  });
  const [inTransitDialog, setInTransitDialog] = useState<InTransitDialogState | null>(null);
  const [confirmDepositDialog, setConfirmDepositDialog] = useState<ConfirmDepositDialogState | null>(null);
  const [confirmInterReceptionDialog, setConfirmInterReceptionDialog] =
    useState<ConfirmInterReceptionDialogState | null>(null);
  const [rejectDialog, setRejectDialog] = useState<RejectDialogState | null>(null);
  const [printReady, setPrintReady] = useState<PrintReadyState | null>(null);
  const [interReceptionReady, setInterReceptionReady] = useState<InterReceptionReadyState | null>(null);
  const bankSectionRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!actorDisplayName) return;
    setInterForm((prev) => ({
      ...prev,
      plannedExecutorName: prev.plannedExecutorName || actorDisplayName,
    }));
  }, [actorDisplayName]);

  const loadRequests = useCallback(async () => {
    if (!companyId || !agencyId) return;
    setRequestsLoading(true);
    try {
      const [sourceRows, destinationRows] = await Promise.all([
        listTransferRequests(companyId, {
          agencyId,
          limitCount: 200,
        }),
        listTransferRequests(companyId, {
          destinationAgencyId: agencyId,
          limitCount: 200,
        }),
      ]);
      const map = new Map<string, RequestRow>();
      [...sourceRows, ...destinationRows].forEach((row) => {
        map.set(row.id, row as RequestRow);
      });
      const merged = Array.from(map.values()).sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt));
      setRequests(merged);
    } catch (error) {
      console.error("[AgencyTreasuryTransferPage] chargement demandes", error);
      toast.error("Impossible de charger les demandes de trésorerie.");
      setRequests([]);
    } finally {
      setRequestsLoading(false);
    }
  }, [companyId, agencyId]);

  useEffect(() => {
    if (!companyId || !agencyId) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const [configuredBanks, agencySnap] = await Promise.all([
          listCompanyBanks(companyId),
          getDocs(collection(db, "companies", companyId, "agences")),
        ]);

        await Promise.all(
          configuredBanks.map((bank) =>
            ensureCompanyBankAccount(
              companyId,
              bank.id,
              String(bank.name ?? bank.id),
              String(bank.currency ?? "XOF")
            )
          )
        );

        const [cashAccount, cashDisplay, bankAccounts] = await Promise.all([
          getAccount(companyId, agencyCashAccountId(agencyId)),
          getAgencyTreasuryLedgerCashDisplay(companyId, agencyId),
          listAccounts(companyId, { agencyId: null, accountType: "company_bank" }),
        ]);

        if (cancelled) return;

        const filteredAgencies = agencySnap.docs
          .map((snap) => {
            const raw = snap.data() as { nom?: string; nomAgence?: string; name?: string };
            const label = String(raw.nom ?? raw.nomAgence ?? raw.name ?? snap.id).trim() || snap.id;
            return { id: snap.id, name: label };
          })
          .filter((row) => row.id !== agencyId)
          .sort((a, b) => a.name.localeCompare(b.name, "fr-FR"));
        const agencyLabels = filteredAgencies.reduce<Record<string, string>>((acc, row) => {
          acc[row.id] = row.name;
          return acc;
        }, {});
        agencyLabels[agencyId] = "Agence source";

        const bankNameById = configuredBanks.reduce<Record<string, string>>((acc, row) => {
          acc[row.id] = String(row.name ?? row.id).trim() || row.id;
          return acc;
        }, {});
        setAgencyCashAccount(cashAccount);
        setLedgerCash(Number(cashDisplay.ledgerCash ?? 0));
        setMirrorCashSecondary(cashDisplay.mirrorCash ?? null);
        setCompanyBankAccounts(bankAccounts as AccountRow[]);
        setCompanyBankNameById(bankNameById);
        setAgencyOptions(filteredAgencies);
        setAgencyNameById(agencyLabels);

        setBankForm((prev) => ({
          ...prev,
          toAccountId: prev.toAccountId || bankAccounts[0]?.id || "",
        }));
        setInterForm((prev) => ({
          ...prev,
          relayBankAccountId: prev.relayBankAccountId || bankAccounts[0]?.id || "",
        }));
      } catch (error) {
        console.error("[AgencyTreasuryTransferPage] chargement base", error);
        toast.error("Impossible de charger la caisse et les comptes bancaires.");
        setAgencyCashAccount(null);
        setCompanyBankAccounts([]);
        setAgencyOptions([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [agencyId, companyId]);

  useEffect(() => {
    if (!companyId || !agencyId) return;
    void loadRequests();
    const id = window.setInterval(() => {
      void loadRequests();
    }, 20_000);
    return () => window.clearInterval(id);
  }, [companyId, agencyId, loadRequests]);

  const outboundTransitInter = useMemo(
    () =>
      requests
        .filter((row) => row.agencyId === agencyId && row.status === "in_transit_inter_agency")
        .reduce((sum, row) => sum + Number(row.amount ?? 0), 0),
    [requests, agencyId]
  );
  const operationalCash = Math.max(0, ledgerCash - outboundTransitInter);

  const filteredRequests = useMemo(() => {
    return requests.filter((row) => {
      if (flowFilter !== "all" && row.flowType !== flowFilter) return false;
      if (statusFilter === "open" && !isOpenStatus(row.status, row.flowType)) return false;
      if (statusFilter === "transit" && !isTransitStatus(row.status, row.flowType)) return false;
      if (statusFilter === "closed" && !isClosedStatus(row.status, row.flowType)) return false;
      if (afterEntryOnly && row.captureMode !== "after_entry") return false;
      return true;
    });
  }, [requests, flowFilter, statusFilter, afterEntryOnly]);

  const interTransitCount = useMemo(
    () => requests.filter((row) => row.status === "in_transit_inter_agency").length,
    [requests]
  );
  const bankConfirmedCount = useMemo(
    () => requests.filter((row) => row.flowType === "bank_deposit" && row.status === "deposited_bank").length,
    [requests]
  );
  const incomingToReceiveRows = useMemo(
    () =>
      requests
        .filter(
          (row) =>
            row.flowType === "inter_agency_transfer" &&
            row.destinationAgencyId === agencyId &&
            row.status === "in_transit_inter_agency"
        )
        .sort((a, b) => toMillis(b.updatedAt ?? b.createdAt) - toMillis(a.updatedAt ?? a.createdAt)),
    [agencyId, requests]
  );
  const incomingReceivedRows = useMemo(
    () =>
      requests
        .filter(
          (row) =>
            row.flowType === "inter_agency_transfer" &&
            row.destinationAgencyId === agencyId &&
            row.status === "received_inter_agency"
        )
        .sort((a, b) => toMillis(b.updatedAt ?? b.createdAt) - toMillis(a.updatedAt ?? a.createdAt)),
    [agencyId, requests]
  );
  const bankHistoryRows = useMemo(
    () =>
      requests
        .filter((row) => row.flowType === "bank_deposit")
        .sort((a, b) => toMillis(b.updatedAt ?? b.createdAt) - toMillis(a.updatedAt ?? a.createdAt)),
    [requests]
  );
  const interHistoryRows = useMemo(
    () =>
      requests
        .filter((row) => row.flowType === "inter_agency_transfer")
        .sort((a, b) => toMillis(b.updatedAt ?? b.createdAt) - toMillis(a.updatedAt ?? a.createdAt)),
    [requests]
  );
  const printableRows = useMemo(
    () =>
      requests
        .filter((row) => row.flowType === "bank_deposit" || row.flowType === "inter_agency_transfer")
        .filter((row) =>
          row.flowType === "bank_deposit"
            ? row.status === "deposited_bank"
            : row.status === "in_transit_inter_agency" || row.status === "received_inter_agency"
        )
        .sort((a, b) => toMillis(b.updatedAt ?? b.createdAt) - toMillis(a.updatedAt ?? a.createdAt))
        .slice(0, 10),
    [requests]
  );
  const sensitiveToValidateRows = useMemo(
    () =>
      requests.filter(
        (row) =>
          row.flowType === "inter_agency_transfer" &&
          isSensitiveRequest(row) &&
          (row.status === "pending_manager" ||
            row.status === "pending_head_accountant" ||
            row.status === "pending_dg" ||
            row.status === "authorized")
      ),
    [requests]
  );
  const afterEntryCount = useMemo(
    () => requests.filter((row) => row.captureMode === "after_entry").length,
    [requests]
  );
  const manualPieceCount = useMemo(
    () => requests.filter((row) => Boolean(row.manualDocumentUsed)).length,
    [requests]
  );
  const transferDifferenceCount = useMemo(
    () =>
      interHistoryRows.filter((row) => {
        const diff = Number(row.receivedDifference ?? 0);
        return row.status === "received_inter_agency" && Number.isFinite(diff) && diff !== 0;
      }).length,
    [interHistoryRows]
  );
  const depositedTodayAmount = useMemo(() => {
    const now = new Date();
    return bankHistoryRows.reduce((sum, row) => {
      if (row.status !== "deposited_bank") return sum;
      const ms = toMillis(row.effectiveOperationDate ?? row.depositConfirmedAt ?? row.updatedAt ?? row.createdAt);
      if (!ms) return sum;
      const d = new Date(ms);
      const sameDay =
        d.getFullYear() === now.getFullYear() &&
        d.getMonth() === now.getMonth() &&
        d.getDate() === now.getDate();
      return sameDay ? sum + Number(row.amountDeposited ?? row.amount ?? 0) : sum;
    }, 0);
  }, [bankHistoryRows]);
  const depositedMonthAmount = useMemo(() => {
    const now = new Date();
    return bankHistoryRows.reduce((sum, row) => {
      if (row.status !== "deposited_bank") return sum;
      const ms = toMillis(row.effectiveOperationDate ?? row.depositConfirmedAt ?? row.updatedAt ?? row.createdAt);
      if (!ms) return sum;
      const d = new Date(ms);
      const sameMonth = d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
      return sameMonth ? sum + Number(row.amountDeposited ?? row.amount ?? 0) : sum;
    }, 0);
  }, [bankHistoryRows]);

  const getPrintDocumentPath = useCallback(
    (documentId: string) => `/agence/comptabilite/documents/${documentId}/print`,
    []
  );

  const openPrintDocument = useCallback(
    (documentId: string) => {
      navigate(getPrintDocumentPath(documentId));
    },
    [getPrintDocumentPath, navigate]
  );

  const openPrintDocumentInNewTab = useCallback(
    (documentId: string) => {
      const path = getPrintDocumentPath(documentId);
      const newTab = window.open(path, "_blank", "noopener,noreferrer");
      if (!newTab) navigate(path);
    },
    [getPrintDocumentPath, navigate]
  );

  const openDocumentsArchive = useCallback(() => {
    navigate("/agence/comptabilite/documents");
  }, [navigate]);

  const showOrderPrintReady = useCallback((row: RequestRow) => {
    setPrintReady({
      title: "Sortie vers banque autorisee",
      subtitle: "Le document est pret a imprimer",
      primaryLabel: "Imprimer l'ordre de sortie",
      documentId: getTreasuryTransferDocumentId(row.id),
    });
  }, []);

  const showDepositPrintReady = useCallback((row: RequestRow) => {
    setPrintReady({
      title: "Dépôt enregistré",
      subtitle: "Le bordereau est pret a imprimer",
      primaryLabel: "Imprimer le bordereau de dépôt",
      documentId: getBankDepositDocumentId("transfer_request", row.id),
    });
  }, []);

  const openInTransitDialogForRow = useCallback(
    (row: RequestRow) => {
      const manual = toManualActionForm(row, actorDisplayName || String(user?.uid ?? ""));
      setInTransitDialog({
        row,
        operationDate: todayIsoDate(),
        observation: String(row.executionObservation ?? "").trim(),
        ...manual,
      });
      setShowInTransitAdvanced(manual.captureMode === "after_entry" || manual.manualDocumentUsed);
    },
    [actorDisplayName, user?.uid]
  );

  const openConfirmDepositDialogForRow = useCallback(
    (row: RequestRow) => {
      const bankId = String(row.toAccountId ?? "").replace("company_bank_", "");
      const defaultBankName = companyBankNameById[bankId] || "Banque compagnie";
      const manual = toManualActionForm(row, actorDisplayName || String(user?.uid ?? ""));
      const manualReceipt = String(row.manualReceiptNumber ?? "").trim();
      setConfirmDepositDialog({
        row,
        bankName: defaultBankName,
        bankBranchName: String(row.bankBranchName ?? "").trim(),
        amountDeposited: String(Number(row.amount ?? 0)),
        operationDate: todayIsoDate(),
        operationHour: nowHourMinute(),
        bankReceiptNumber: String(row.bankReceiptNumber ?? "").trim(),
        manualReceiptUsed: manualReceipt.length > 0,
        manualReceiptNumber: manualReceipt,
        observation: String(row.executionObservation ?? "").trim(),
        ...manual,
      });
      setShowConfirmDepositAdvanced(
        manual.captureMode === "after_entry" || manual.manualDocumentUsed || manualReceipt.length > 0
      );
    },
    [actorDisplayName, companyBankNameById, user?.uid]
  );

  const openConfirmInterReceptionDialogForRow = useCallback(
    (row: RequestRow) => {
      const manual = toManualActionForm(row, actorDisplayName || String(user?.uid ?? ""));
      const manualReceipt = String(row.manualReceiptNumber ?? "").trim();
      setConfirmInterReceptionDialog({
        row,
        amountReceived: String(Number(row.amount ?? 0)),
        operationDate: todayIsoDate(),
        operationHour: nowHourMinute(),
        manualReceiptUsed: manualReceipt.length > 0,
        manualReceiptNumber: manualReceipt,
        observation: String(row.executionObservation ?? "").trim(),
        ...manual,
      });
      setShowInterReceptionAdvanced(
        manual.captureMode === "after_entry" || manual.manualDocumentUsed || manualReceipt.length > 0
      );
    },
    [actorDisplayName, user?.uid]
  );

  const handleCreateBankRequest = useCallback(async () => {
    if (!companyId || !agencyId || !user?.uid) return;
    if (!canInitiate) {
      toast.error("Seul le comptable agence peut enregistrer ce dépôt.");
      return;
    }
    const amount = parseNumber(bankForm.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error("Montant propose invalide.");
      return;
    }
    if (amount > operationalCash) {
      toast.error("Montant superieur a la caisse operationnelle disponible.");
      return;
    }
    if (!bankForm.toAccountId) {
      toast.error("Selectionnez la banque de destination.");
      return;
    }
    if (!agencyCashAccount) {
      toast.error("Caisse agence introuvable.");
      return;
    }
    const bankReceiptNumber = bankForm.bankReceiptNumber.trim() || null;
    const manualNumber =
      showBankManualMode && bankForm.manualDocumentUsed
        ? bankForm.manualDocumentNumber.trim() || null
        : null;
    if (!bankReceiptNumber && !manualNumber) {
      toast.error("Indiquez le numéro du reçu ou le numéro de pièce manuelle.");
      return;
    }
    const selectedBank = companyBankAccounts.find((account) => account.id === bankForm.toAccountId);
    const bankLabel = selectedBank
      ? getFinancialAccountDisplayName(selectedBank, { companyBankNameById })
      : "Banque compagnie";
    const operationDateSummary = bankForm.operationDate || todayIsoDate();
    const receiptSummary = bankReceiptNumber ?? manualNumber ?? "-";

    setSubmittingBank(true);
    try {
      const manualCapture = {
        captureMode: showBankManualMode ? bankForm.captureMode : "normal",
        manualDocumentUsed: showBankManualMode ? bankForm.manualDocumentUsed : false,
        manualDocumentType:
          showBankManualMode && bankForm.manualDocumentUsed
            ? bankForm.manualDocumentType.trim() || null
            : null,
        manualDocumentNumber:
          showBankManualMode && bankForm.manualDocumentUsed
            ? bankForm.manualDocumentNumber.trim() || null
            : null,
        regularizedByUid:
          showBankManualMode && bankForm.captureMode === "after_entry" ? user.uid : null,
        regularizedByName:
          showBankManualMode && bankForm.captureMode === "after_entry"
            ? bankForm.regularizedByName.trim() || actorDisplayName || null
            : null,
        regularizedAt:
          showBankManualMode && bankForm.captureMode === "after_entry" ? new Date() : null,
      };
      const requestId = await recordDirectLocalBankDeposit({
        companyId,
        agencyId,
        fromAccountId: agencyCashAccount.id,
        toAccountId: bankForm.toAccountId,
        bankBranchName: bankForm.bankBranchName.trim() || null,
        amount,
        currency: agencyCashAccount.currency || "XOF",
        operationDate: bankForm.operationDate || null,
        operationHour: bankForm.operationHour || null,
        bankReceiptNumber,
        manualReceiptNumber: manualNumber,
        description: "Dépôt banque local",
        observation: bankForm.observation.trim() || null,
        manualCapture,
        actorId: user.uid,
        actorName: actorDisplayName || null,
        actorRoles: roles,
      });
      toast.success("Dépôt enregistré.");
      setBankForm((prev) => ({
        ...prev,
        amount: "",
        bankBranchName: "",
        operationDate: todayIsoDate(),
        operationHour: nowHourMinute(),
        bankReceiptNumber: "",
        observation: "",
        captureMode: "normal",
        manualDocumentUsed: false,
        manualDocumentType: "",
        manualDocumentNumber: "",
        regularizedByName: "",
      }));
      setShowBankManualMode(false);
      await loadRequests();
      setPrintReady({
        title: "Dépôt enregistré",
        subtitle: "Le dépôt a été pris en compte.",
        messageLines: [
          "La caisse a été mise à jour.",
          "Le bordereau de versement est prêt à imprimer.",
        ],
        primaryLabel: "Imprimer le bordereau",
        documentId: getBankDepositDocumentId("transfer_request", requestId),
        showSecondaryAction: true,
        secondaryLabel: "Voir le bordereau",
        showArchiveAction: true,
        openPrimaryInNewTab: true,
        depositSummary: {
          bankLabel,
          amount,
          currency: agencyCashAccount.currency || "XOF",
          operationDate: operationDateSummary,
          receiptNumber: receiptSummary,
        },
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Échec enregistrement dépôt.");
    } finally {
      setSubmittingBank(false);
    }
  }, [
    agencyCashAccount,
    agencyId,
    actorDisplayName,
    bankForm,
    canInitiate,
    companyBankAccounts,
    companyBankNameById,
    companyId,
    loadRequests,
    operationalCash,
    roles,
    showBankManualMode,
    user?.uid,
  ]);

  const handleCreateInterAgencyRequest = useCallback(async () => {
    if (!companyId || !agencyId || !user?.uid) return;
    if (!canInitiate) {
      toast.error("Seul le comptable agence peut preparer ce transfert.");
      return;
    }
    if (!interForm.destinationAgencyId || interForm.destinationAgencyId === agencyId) {
      toast.error("Selectionnez une agence destination differente.");
      return;
    }
    if (!interForm.relayBankAccountId) {
      toast.error("Selectionnez le compte relais.");
      return;
    }
    const amount = parseNumber(interForm.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error("Montant propose invalide.");
      return;
    }
    if (amount > operationalCash) {
      toast.error("Montant superieur a la caisse operationnelle disponible.");
      return;
    }
    if (!agencyCashAccount) {
      toast.error("Caisse agence introuvable.");
      return;
    }
    setSubmittingInter(true);
    try {
      await createInterAgencyTransferRequest({
        companyId,
        agencyId,
        destinationAgencyId: interForm.destinationAgencyId,
        fromAccountId: agencyCashAccount.id,
        relayBankAccountId: interForm.relayBankAccountId,
        amount,
        currency: agencyCashAccount.currency || "XOF",
        description: interForm.observation.trim() || "Transfert physique inter-agence",
        plannedDate: interForm.plannedDate || null,
        plannedExecutorName: interForm.plannedExecutorName.trim() || null,
        manualCapture: {
          captureMode: interForm.captureMode,
          manualDocumentUsed: interForm.manualDocumentUsed,
          manualDocumentType: interForm.manualDocumentType.trim() || null,
          manualDocumentNumber: interForm.manualDocumentNumber.trim() || null,
          regularizedByUid: interForm.captureMode === "after_entry" ? user.uid : null,
          regularizedByName:
            interForm.captureMode === "after_entry"
              ? interForm.regularizedByName.trim() || actorDisplayName || null
              : null,
          regularizedAt: interForm.captureMode === "after_entry" ? new Date() : null,
        },
        initiatedBy: user.uid,
        initiatedByRoles: roles,
      });
      toast.success("Demande de transfert inter-agence enregistree.");
      setInterForm((prev) => ({
        ...prev,
        amount: "",
        plannedExecutorName: actorDisplayName || "",
        observation: "",
        captureMode: "normal",
        manualDocumentUsed: false,
        manualDocumentType: "",
        manualDocumentNumber: "",
        regularizedByName: "",
      }));
      await loadRequests();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Echec creation transfert inter-agence.");
    } finally {
      setSubmittingInter(false);
    }
  }, [
    agencyCashAccount,
    agencyId,
    actorDisplayName,
    canInitiate,
    companyId,
    interForm,
    loadRequests,
    operationalCash,
    roles,
    user?.uid,
  ]);

  const handleApproveByManager = useCallback(
    async (row: RequestRow) => {
      if (!companyId || !user?.uid) return;
      setBusyRequestId(row.id);
      try {
        await approveTransferRequest({
          companyId,
          requestId: row.id,
          managerId: user.uid,
          managerRoles: roles,
        });
        toast.success("Visa chef d'agence enregistre.");
        await loadRequests();
        if (row.flowType === "inter_agency_transfer" && row.approvalLevelRequired === "agency_only") {
          showOrderPrintReady(row);
        }
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Echec visa agence.");
      } finally {
        setBusyRequestId(null);
      }
    },
    [companyId, loadRequests, roles, showOrderPrintReady, user?.uid]
  );

  const handleApproveByHead = useCallback(
    async (row: RequestRow) => {
      if (!companyId || !user?.uid) return;
      setBusyRequestId(row.id);
      try {
        await approveTransferByHeadAccountant({
          companyId,
          requestId: row.id,
          approverId: user.uid,
          approverRoles: roles,
        });
        toast.success("Visa chef comptable enregistre.");
        await loadRequests();
        if (row.flowType === "inter_agency_transfer" && row.approvalLevelRequired !== "dg") {
          showOrderPrintReady(row);
        }
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Echec visa chef comptable.");
      } finally {
        setBusyRequestId(null);
      }
    },
    [companyId, loadRequests, roles, showOrderPrintReady, user?.uid]
  );

  const handleApproveByDg = useCallback(
    async (row: RequestRow) => {
      if (!companyId || !user?.uid) return;
      setBusyRequestId(row.id);
      try {
        await approveTransferByDg({
          companyId,
          requestId: row.id,
          approverId: user.uid,
          approverRoles: roles,
        });
        toast.success("Validation DG enregistree.");
        await loadRequests();
        if (row.flowType === "bank_deposit") {
          showOrderPrintReady(row);
        }
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Echec validation DG.");
      } finally {
        setBusyRequestId(null);
      }
    },
    [companyId, loadRequests, roles, showOrderPrintReady, user?.uid]
  );

  const handleReject = useCallback(
    async (row: RequestRow) => {
      setRejectDialog({ row, reason: "" });
    },
    []
  );

  const handleSubmitReject = useCallback(async () => {
    if (!companyId || !user?.uid || !rejectDialog) return;
    const row = rejectDialog.row;
    setBusyRequestId(row.id);
    try {
      await rejectTransferRequest({
        companyId,
        requestId: row.id,
        managerId: user.uid,
        managerRoles: roles,
        reason: rejectDialog.reason.trim() || null,
      });
      toast.success("Demande refusee.");
      setRejectDialog(null);
      await loadRequests();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Échec refus demande.");
    } finally {
      setBusyRequestId(null);
    }
  }, [companyId, loadRequests, rejectDialog, roles, user?.uid]);

  const handleMarkInTransit = useCallback(
    (row: RequestRow) => {
      openInTransitDialogForRow(row);
    },
    [openInTransitDialogForRow]
  );

  const handleSubmitInTransit = useCallback(async () => {
    if (!inTransitDialog || !companyId || !user?.uid) return;
    const useAdvanced = showInTransitAdvanced;
    const captureMode: TransferCaptureMode = useAdvanced ? inTransitDialog.captureMode : "normal";
    const manualDocumentUsed = useAdvanced ? inTransitDialog.manualDocumentUsed : false;
    const manualDocumentType = manualDocumentUsed ? inTransitDialog.manualDocumentType.trim() || null : null;
    const manualDocumentNumber = manualDocumentUsed ? inTransitDialog.manualDocumentNumber.trim() || null : null;
    const regularizedByName =
      captureMode === "after_entry" ? inTransitDialog.regularizedByName.trim() || actorDisplayName || null : null;

    if (captureMode === "after_entry" && !regularizedByName) {
      toast.error("Indiquez l'acteur ayant régularisé la saisie.");
      return;
    }
    if (manualDocumentUsed && !manualDocumentNumber) {
      toast.error("Indiquez le numéro de pièce manuelle.");
      return;
    }
    const row = inTransitDialog.row;
    setBusyRequestId(row.id);
    try {
      await markTransferAsInTransit({
        companyId,
        requestId: row.id,
        actorId: user.uid,
        actorName: actorDisplayName || null,
        actorRoles: roles,
        observation: inTransitDialog.observation.trim() || null,
        actualOperationDate: inTransitDialog.operationDate || null,
        captureMode,
        manualDocumentUsed,
        manualDocumentType,
        manualDocumentNumber,
        regularizedByUid: captureMode === "after_entry" ? user.uid : null,
        regularizedByName,
      });
      toast.success("Sortie physique enregistree. Montant passe en transit.");
      setInTransitDialog(null);
      setShowInTransitAdvanced(false);
      await loadRequests();
      if (row.flowType === "inter_agency_transfer") {
        setPrintReady({
          title: "Sortie inter-agence enregistree",
          subtitle: "Le bordereau de sortie est pret a imprimer",
          primaryLabel: "Imprimer le bordereau de sortie",
          documentId: getInternalTransferDocumentId(row.id, "sortie"),
        });
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Echec passage en transit.");
    } finally {
      setBusyRequestId(null);
    }
  }, [
    actorDisplayName,
    companyId,
    inTransitDialog,
    loadRequests,
    roles,
    showInTransitAdvanced,
    user?.uid,
  ]);

  const handleConfirmBankDeposit = useCallback(
    (row: RequestRow) => {
      openConfirmDepositDialogForRow(row);
    },
    [openConfirmDepositDialogForRow]
  );

  const handleSubmitConfirmBankDeposit = useCallback(async () => {
    if (!confirmDepositDialog || !companyId || !user?.uid) return;
    const amountDeposited = parseNumber(confirmDepositDialog.amountDeposited);
    if (!Number.isFinite(amountDeposited) || amountDeposited <= 0) {
      toast.error("Montant depose invalide.");
      return;
    }
    const useAdvanced = showConfirmDepositAdvanced;
    const captureMode: TransferCaptureMode = useAdvanced ? confirmDepositDialog.captureMode : "normal";
    const manualDocumentUsed = useAdvanced ? confirmDepositDialog.manualDocumentUsed : false;
    const manualDocumentType = manualDocumentUsed
      ? confirmDepositDialog.manualDocumentType.trim() || null
      : null;
    const manualDocumentNumber = manualDocumentUsed
      ? confirmDepositDialog.manualDocumentNumber.trim() || null
      : null;
    const manualReceiptUsed = useAdvanced ? confirmDepositDialog.manualReceiptUsed : false;
    const manualReceiptNumber = manualReceiptUsed
      ? confirmDepositDialog.manualReceiptNumber.trim() || null
      : null;
    const regularizedByName =
      captureMode === "after_entry"
        ? confirmDepositDialog.regularizedByName.trim() || actorDisplayName || null
        : null;

    if (captureMode === "after_entry" && !regularizedByName) {
      toast.error("Indiquez l'acteur ayant régularisé la saisie.");
      return;
    }
    if (manualDocumentUsed && !manualDocumentNumber) {
      toast.error("Indiquez le numéro de pièce manuelle.");
      return;
    }
    if (manualReceiptUsed && !manualReceiptNumber) {
      toast.error("Indiquez le numéro du reçu manuel.");
      return;
    }

    const row = confirmDepositDialog.row;
    setBusyRequestId(row.id);
    try {
      await confirmBankDeposit({
        companyId,
        requestId: row.id,
        actorId: user.uid,
        actorName: actorDisplayName || null,
        actorRoles: roles,
        bankName: confirmDepositDialog.bankName.trim() || null,
        bankBranchName: confirmDepositDialog.bankBranchName.trim() || null,
        amountDeposited,
        operationDate: confirmDepositDialog.operationDate || null,
        operationHour: confirmDepositDialog.operationHour || null,
        bankReceiptNumber: confirmDepositDialog.bankReceiptNumber.trim() || null,
        manualReceiptNumber,
        observation: confirmDepositDialog.observation.trim() || null,
        captureMode,
        manualDocumentUsed,
        manualDocumentType,
        manualDocumentNumber,
        regularizedByUid: captureMode === "after_entry" ? user.uid : null,
        regularizedByName,
      });
      toast.success("Dépôt banque confirmé.");
      setConfirmDepositDialog(null);
      setShowConfirmDepositAdvanced(false);
      await loadRequests();
      showDepositPrintReady(row);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Échec confirmation dépôt.");
    } finally {
      setBusyRequestId(null);
    }
  }, [
    actorDisplayName,
    companyId,
    confirmDepositDialog,
    loadRequests,
    roles,
    showConfirmDepositAdvanced,
    showDepositPrintReady,
    user?.uid,
  ]);

  const handleConfirmInterAgencyReception = useCallback(
    (row: RequestRow) => {
      openConfirmInterReceptionDialogForRow(row);
    },
    [openConfirmInterReceptionDialogForRow]
  );

  const handleSubmitConfirmInterReception = useCallback(async () => {
    if (!confirmInterReceptionDialog || !companyId || !user?.uid) return;
    const amountReceived = parseNumber(confirmInterReceptionDialog.amountReceived);
    if (!Number.isFinite(amountReceived) || amountReceived <= 0) {
      toast.error("Montant reçu invalide.");
      return;
    }
    const useAdvanced = showInterReceptionAdvanced;
    const captureMode: TransferCaptureMode = useAdvanced ? confirmInterReceptionDialog.captureMode : "normal";
    const manualDocumentUsed = useAdvanced ? confirmInterReceptionDialog.manualDocumentUsed : false;
    const manualDocumentType = manualDocumentUsed
      ? confirmInterReceptionDialog.manualDocumentType.trim() || null
      : null;
    const manualDocumentNumber = manualDocumentUsed
      ? confirmInterReceptionDialog.manualDocumentNumber.trim() || null
      : null;
    const manualReceiptUsed = useAdvanced ? confirmInterReceptionDialog.manualReceiptUsed : false;
    const manualReceiptNumber = manualReceiptUsed
      ? confirmInterReceptionDialog.manualReceiptNumber.trim() || null
      : null;
    const regularizedByName =
      captureMode === "after_entry"
        ? confirmInterReceptionDialog.regularizedByName.trim() || actorDisplayName || null
        : null;
    if (captureMode === "after_entry" && !regularizedByName) {
      toast.error("Indiquez l'acteur ayant régularisé la saisie.");
      return;
    }
    if (manualDocumentUsed && !manualDocumentNumber) {
      toast.error("Indiquez le numéro de pièce manuelle.");
      return;
    }
    if (manualReceiptUsed && !manualReceiptNumber) {
      toast.error("Indiquez le numéro du reçu manuel.");
      return;
    }

    const row = confirmInterReceptionDialog.row;
    setBusyRequestId(row.id);
    try {
      await confirmInterAgencyReception({
        companyId,
        requestId: row.id,
        actorId: user.uid,
        actorName: actorDisplayName || null,
        actorRoles: roles,
        amountReceived,
        operationDate: confirmInterReceptionDialog.operationDate || null,
        operationHour: confirmInterReceptionDialog.operationHour || null,
        manualReceiptNumber,
        observation: confirmInterReceptionDialog.observation.trim() || null,
        captureMode,
        manualDocumentUsed,
        manualDocumentType,
        manualDocumentNumber,
        regularizedByUid: captureMode === "after_entry" ? user.uid : null,
        regularizedByName,
      });
      toast.success("Reception inter-agence confirmee.");
      setConfirmInterReceptionDialog(null);
      setShowInterReceptionAdvanced(false);
      await loadRequests();
      setInterReceptionReady({ row, amountReceived });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Echec reception inter-agence.");
    } finally {
      setBusyRequestId(null);
    }
  }, [
    actorDisplayName,
    companyId,
    confirmInterReceptionDialog,
    loadRequests,
    roles,
    showInterReceptionAdvanced,
    user?.uid,
  ]);

  const handlePrepareBankFromInterReception = useCallback(
    (row: RequestRow) => {
      const receivedAmount = Number(row.amountReceived ?? row.amount ?? 0);
      setBankForm((prev) => ({
        ...prev,
        amount: receivedAmount > 0 ? String(receivedAmount) : prev.amount,
        operationDate: todayIsoDate(),
        operationHour: nowHourMinute(),
        observation:
          `Dépôt banque après réception inter-agence (${agencyNameById[row.agencyId] || row.agencyId}).`,
      }));
      bankSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      toast.success("Formulaire de versement banque pré-rempli.");
    },
    [actorDisplayName, agencyNameById]
  );

  if (!companyId || !agencyId) {
    const missing = <div className="p-6 text-gray-500">Contexte agence introuvable.</div>;
    return isStandaloneComptaTreasury ? (
      <StandardLayoutWrapper className="min-w-0">{missing}</StandardLayoutWrapper>
    ) : (
      missing
    );
  }

  if (!canAccessTransferPage) {
    return <Navigate to="/agence/activite" replace />;
  }

  const body = (
    <div className="min-w-0 space-y-6">
      <SectionCard
        title="Sortie de caisse agence"
        icon={ShieldCheck}
        description="Pilotage terrain: dépôt banque local direct, flux inter-agence sensibles maintenus."
      >
        <div className="flex justify-end">
          <ActionButton
            size="sm"
            variant="secondary"
            onClick={() => setShowResponsibilityHelp((prev) => !prev)}
          >
            {showResponsibilityHelp ? "Masquer l'aide" : "Qui fait quoi ?"}
          </ActionButton>
        </div>
        {showResponsibilityHelp ? (
          <div className="mt-3 grid grid-cols-1 gap-3 text-sm md:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-lg border border-gray-200 bg-white p-3">
              <div className="font-semibold text-gray-900">Dépôt local</div>
              <div className="mt-1 text-gray-600">Comptable agence</div>
            </div>
            <div className="rounded-lg border border-gray-200 bg-white p-3">
              <div className="font-semibold text-gray-900">Validation locale</div>
              <div className="mt-1 text-gray-600">Aucune demande interne, enregistrement direct.</div>
            </div>
            <div className="rounded-lg border border-gray-200 bg-white p-3">
              <div className="font-semibold text-gray-900">Transferts sensibles</div>
              <div className="mt-1 text-gray-600">Visa chef d'agence / siège selon le seuil.</div>
            </div>
            <div className="rounded-lg border border-gray-200 bg-white p-3">
              <div className="font-semibold text-gray-900">Supervision</div>
              <div className="mt-1 text-gray-600">Chef d'agence: alertes, écarts, historiques.</div>
            </div>
          </div>
        ) : null}
      </SectionCard>

      <SectionCard title="Position de caisse" icon={Landmark}>
        {loading ? (
          <div className="py-6 text-sm text-gray-500">Chargement position caisse...</div>
        ) : (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-lg border border-gray-200 p-3">
              <div className="text-xs uppercase tracking-wide text-gray-500">Caisse comptable totale</div>
              <div className="mt-1 text-lg font-semibold text-gray-900">
                {formatCurrency(ledgerCash, agencyCashAccount?.currency ?? "XOF")}
              </div>
              {mirrorCashSecondary != null && agencyCashAccount ? (
                <div className="mt-1 text-xs text-gray-500">
                  Miroir secondaire: {formatCurrency(mirrorCashSecondary, agencyCashAccount.currency)}
                </div>
              ) : null}
            </div>
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
              <div className="text-xs uppercase tracking-wide text-amber-700">Montant versé aujourd'hui</div>
              <div className="mt-1 text-lg font-semibold text-amber-900">
                {formatCurrency(depositedTodayAmount, agencyCashAccount?.currency ?? "XOF")}
              </div>
            </div>
            <div className="rounded-lg border border-indigo-200 bg-indigo-50 p-3">
              <div className="text-xs uppercase tracking-wide text-indigo-700">En transit inter-agence</div>
              <div className="mt-1 text-lg font-semibold text-indigo-900">
                {formatCurrency(outboundTransitInter, agencyCashAccount?.currency ?? "XOF")}
              </div>
            </div>
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3">
              <div className="text-xs uppercase tracking-wide text-emerald-700">Caisse disponible operationnelle</div>
              <div className="mt-1 text-lg font-semibold text-emerald-900">
                {formatCurrency(operationalCash, agencyCashAccount?.currency ?? "XOF")}
              </div>
              <div className="mt-1 text-xs text-emerald-800">
                Caisse brute - montants deja sortis physiquement en transit.
              </div>
            </div>
          </div>
        )}
      </SectionCard>

      {managerOnlyView ? (
        <SectionCard
          title="Supervision trésorerie"
          icon={ShieldCheck}
          description="Vue chef d'agence: supervision des montants, écarts et mouvements inter-agence."
          right={
            <ActionButton
              size="sm"
              variant="secondary"
              onClick={() => void loadRequests()}
              disabled={requestsLoading}
            >
              Actualiser
            </ActionButton>
          }
        >
          <div className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold uppercase tracking-wide text-amber-900">
                  Caisse disponible
                </span>
                <StatusBadge status="success">
                  {formatCurrency(operationalCash, agencyCashAccount?.currency ?? "XOF")}
                </StatusBadge>
              </div>
              <div className="mt-1 text-xs text-amber-800">Montant réellement mobilisable en agence.</div>
            </div>
            <div className="rounded-lg border border-indigo-200 bg-indigo-50 p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold uppercase tracking-wide text-indigo-900">
                  Mouvements inter-agence en transit
                </span>
                <StatusBadge status="warning">{interTransitCount}</StatusBadge>
              </div>
              <div className="mt-1 text-xs text-indigo-800">
                {formatCurrency(outboundTransitInter, agencyCashAccount?.currency ?? "XOF")} en sortie.
              </div>
            </div>
            <div className="rounded-lg border border-sky-200 bg-sky-50 p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold uppercase tracking-wide text-sky-900">
                  Entrants à recevoir
                </span>
                <StatusBadge status="pending">{incomingToReceiveRows.length}</StatusBadge>
              </div>
              <div className="mt-1 text-xs text-sky-800">Transferts inter-agence attendus à destination.</div>
            </div>
            <div className="rounded-lg border border-rose-200 bg-rose-50 p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold uppercase tracking-wide text-rose-900">
                  Écarts / régularisations
                </span>
                <StatusBadge status="danger">{transferDifferenceCount + afterEntryCount}</StatusBadge>
              </div>
              <div className="mt-1 text-xs text-rose-800">
                Écarts réception: {transferDifferenceCount} | Saisies après coup: {afterEntryCount}
              </div>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-lg border border-gray-200 p-3">
              <div className="text-xs uppercase tracking-wide text-gray-500">Montant versé aujourd'hui</div>
              <div className="mt-1 text-lg font-semibold text-gray-900">
                {formatCurrency(depositedTodayAmount, agencyCashAccount?.currency ?? "XOF")}
              </div>
            </div>
            <div className="rounded-lg border border-gray-200 p-3">
              <div className="text-xs uppercase tracking-wide text-gray-500">Montant versé ce mois</div>
              <div className="mt-1 text-lg font-semibold text-gray-900">
                {formatCurrency(depositedMonthAmount, agencyCashAccount?.currency ?? "XOF")}
              </div>
            </div>
            <div className="rounded-lg border border-gray-200 p-3">
              <div className="text-xs uppercase tracking-wide text-gray-500">Dépôts enregistrés</div>
              <div className="mt-1 text-lg font-semibold text-gray-900">{bankConfirmedCount}</div>
            </div>
            <div className="rounded-lg border border-gray-200 p-3">
              <div className="text-xs uppercase tracking-wide text-gray-500">Pièces manuelles</div>
              <div className="mt-1 text-lg font-semibold text-gray-900">{manualPieceCount}</div>
            </div>
          </div>
        </SectionCard>
      ) : null}

      {canInitiate ? (
        <div ref={bankSectionRef}>
          <SectionCard
            title="Nouveau dépôt banque"
            icon={ArrowRightLeft}
            description="Saisie directe du dépôt réel après passage à la banque."
          >
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Comptable saisissant</label>
                <input
                  type="text"
                  value={actorDisplayName || "-"}
                  readOnly
                  className="w-full cursor-not-allowed rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Banque</label>
                <select
                  value={bankForm.toAccountId}
                  onChange={(e) => setBankForm((prev) => ({ ...prev, toAccountId: e.target.value }))}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                >
                  <option value="">Selectionner</option>
                  {companyBankAccounts.map((account) => (
                    <option key={account.id} value={account.id}>
                      {getFinancialAccountDisplayName(account, { companyBankNameById })}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Montant versé</label>
                <input
                  type="number"
                  min={0}
                  value={bankForm.amount}
                  onChange={(e) => setBankForm((prev) => ({ ...prev, amount: e.target.value }))}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  placeholder="0"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Date du dépôt</label>
                <input
                  type="date"
                  value={bankForm.operationDate}
                  onChange={(e) => setBankForm((prev) => ({ ...prev, operationDate: e.target.value }))}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  Numéro du reçu / bordereau banque
                </label>
                <input
                  type="text"
                  value={bankForm.bankReceiptNumber}
                  onChange={(e) => setBankForm((prev) => ({ ...prev, bankReceiptNumber: e.target.value }))}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  placeholder="Reference banque"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  Agence bancaire (optionnel)
                </label>
                <input
                  type="text"
                  value={bankForm.bankBranchName}
                  onChange={(e) => setBankForm((prev) => ({ ...prev, bankBranchName: e.target.value }))}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  placeholder="Ex: Bamako Centre"
                />
              </div>
              <div className="md:col-span-2">
                <label className="mb-1 block text-sm font-medium text-gray-700">Observation</label>
                <textarea
                  value={bankForm.observation}
                  onChange={(e) => setBankForm((prev) => ({ ...prev, observation: e.target.value }))}
                  className="min-h-[88px] w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  placeholder="Observation terrain (optionnel)"
                />
              </div>
            </div>
            <div className="mt-4 rounded-lg border border-dashed border-gray-300 p-3">
              <label className="inline-flex items-center gap-2 text-sm font-semibold text-gray-800">
                <input
                  type="checkbox"
                  checked={showBankManualMode}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    setShowBankManualMode(checked);
                    if (!checked) {
                      setBankForm((prev) => ({
                        ...prev,
                        captureMode: "normal",
                        manualDocumentUsed: false,
                        manualDocumentType: "",
                        manualDocumentNumber: "",
                        regularizedByName: "",
                      }));
                    }
                  }}
                />
                Pièce manuelle / saisie après coup
              </label>
              {showBankManualMode ? (
                <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-2">
                  <select
                    value={bankForm.captureMode}
                    onChange={(e) =>
                      setBankForm((prev) => ({
                        ...prev,
                        captureMode: e.target.value === "after_entry" ? "after_entry" : "normal",
                      }))
                    }
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  >
                    <option value="normal">Saisie normale</option>
                    <option value="after_entry">Saisie après coup</option>
                  </select>
                  <label className="inline-flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700">
                    <input
                      type="checkbox"
                      checked={bankForm.manualDocumentUsed}
                      onChange={(e) =>
                        setBankForm((prev) => ({ ...prev, manualDocumentUsed: e.target.checked }))
                      }
                    />
                    Pièce manuelle utilisée
                  </label>
                </div>
              ) : null}
              {showBankManualMode && bankForm.manualDocumentUsed ? (
                <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-2">
                  <input
                    type="text"
                    value={bankForm.manualDocumentType}
                    onChange={(e) => setBankForm((prev) => ({ ...prev, manualDocumentType: e.target.value }))}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                    placeholder="Type de pièce manuelle"
                  />
                  <input
                    type="text"
                    value={bankForm.manualDocumentNumber}
                    onChange={(e) => setBankForm((prev) => ({ ...prev, manualDocumentNumber: e.target.value }))}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                    placeholder="Numéro de pièce"
                  />
                </div>
              ) : null}
              {showBankManualMode && bankForm.captureMode === "after_entry" ? (
                <input
                  type="text"
                  value={bankForm.regularizedByName}
                  onChange={(e) => setBankForm((prev) => ({ ...prev, regularizedByName: e.target.value }))}
                  className="mt-2 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  placeholder="Nom de l'acteur ayant régularisé"
                />
              ) : null}
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <ActionButton onClick={() => void handleCreateBankRequest()} disabled={submittingBank || !canInitiate}>
                {submittingBank ? "Enregistrement..." : "Enregistrer le dépôt"}
              </ActionButton>
            </div>
          </SectionCard>
        </div>
      ) : null}

      {canInitiate ? (
        <SectionCard title="Transfert vers agence relais" icon={Truck}>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Demandeur</label>
            <input
              type="text"
              value={actorDisplayName || "-"}
              readOnly
              className="w-full cursor-not-allowed rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Agence destination (hub / relais)</label>
            <select
              value={interForm.destinationAgencyId}
              onChange={(e) => setInterForm((prev) => ({ ...prev, destinationAgencyId: e.target.value }))}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            >
              <option value="">Selectionner</option>
              {agencyOptions.map((agency) => (
                <option key={agency.id} value={agency.id}>
                  {agency.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Compte relais compagnie</label>
            <select
              value={interForm.relayBankAccountId}
              onChange={(e) => setInterForm((prev) => ({ ...prev, relayBankAccountId: e.target.value }))}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            >
              <option value="">Selectionner</option>
              {companyBankAccounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {getFinancialAccountDisplayName(account, { companyBankNameById })}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Montant</label>
            <input
              type="number"
              min={0}
              value={interForm.amount}
              onChange={(e) => setInterForm((prev) => ({ ...prev, amount: e.target.value }))}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              placeholder="0"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Date prevue</label>
            <input
              type="date"
              value={interForm.plannedDate}
              onChange={(e) => setInterForm((prev) => ({ ...prev, plannedDate: e.target.value }))}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Convoyeur / chauffeur prevu</label>
            <input
              type="text"
              value={interForm.plannedExecutorName}
              onChange={(e) => setInterForm((prev) => ({ ...prev, plannedExecutorName: e.target.value }))}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              placeholder="Nom executant"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Observation</label>
            <input
              type="text"
              value={interForm.observation}
              onChange={(e) => setInterForm((prev) => ({ ...prev, observation: e.target.value }))}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              placeholder="Contexte localite sans banque..."
            />
          </div>
        </div>
        <div className="mt-3 text-xs text-gray-500">
          Mode degrade pris en compte au moment de la sortie/reception via les ecrans d'action.
        </div>
        <div className="mt-4">
          <ActionButton
            onClick={() => void handleCreateInterAgencyRequest()}
            disabled={submittingInter || !canInitiate}
          >
            {submittingInter ? "Enregistrement..." : "Enregistrer le transfert inter-agence"}
          </ActionButton>
        </div>
        </SectionCard>
      ) : null}

      <SectionCard
        title="Transferts entrants a recevoir"
        icon={Truck}
        description={`A receptionner: ${incomingToReceiveRows.length} | Deja reçus: ${incomingReceivedRows.length}`}
      >
        {incomingToReceiveRows.length === 0 ? (
          <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-3 text-sm text-gray-600">
            Aucun transfert entrant en attente de reception.
          </div>
        ) : (
          <div className="space-y-3">
            {incomingToReceiveRows.map((row) => (
              <div key={row.id} className="rounded-xl border border-indigo-200 bg-indigo-50/40 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <StatusBadge status="warning">En transit inter-agence</StatusBadge>
                    <span className="text-sm font-semibold text-gray-900">
                      Depuis {agencyNameById[row.agencyId] || row.agencyId}
                    </span>
                  </div>
                  <div className="text-sm font-semibold text-gray-900">
                    {formatCurrency(Number(row.amount ?? 0), row.currency || agencyCashAccount?.currency || "XOF")}
                  </div>
                </div>
                <div className="mt-2 grid grid-cols-1 gap-2 text-xs text-gray-700 md:grid-cols-2 xl:grid-cols-3">
                  <div>
                    Agence source: <span className="font-semibold">{agencyNameById[row.agencyId] || row.agencyId}</span>
                  </div>
                  <div>
                    Date prevue:{" "}
                    <span className="font-semibold">{formatDateTime(row.plannedDate)}</span>
                  </div>
                  <div>
                    Convoyeur / executant:{" "}
                    <span className="font-semibold">{row.plannedExecutorName || "-"}</span>
                  </div>
                  <div>
                    Reference: <span className="font-semibold">{row.id}</span>
                  </div>
                  <div className="md:col-span-2 xl:col-span-2">
                    Observation: <span className="font-semibold">{row.description || "-"}</span>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {canDestinationReceive && !managerOnlyView ? (
                    <ActionButton
                      size="sm"
                      variant="secondary"
                      onClick={() => handleConfirmInterAgencyReception(row)}
                      disabled={busyRequestId === row.id}
                    >
                      Receptionner
                    </ActionButton>
                  ) : null}
                  <ActionButton
                    size="sm"
                    variant="ghost"
                    onClick={() => openPrintDocument(getInternalTransferDocumentId(row.id, "sortie"))}
                  >
                    Imprimer le bordereau de sortie
                  </ActionButton>
                </div>
              </div>
            ))}
          </div>
        )}

        {incomingReceivedRows.length > 0 ? (
          <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3">
            <div className="mb-2 text-sm font-semibold text-emerald-900">Derniers transferts receptionnes</div>
            <div className="space-y-2">
              {incomingReceivedRows.slice(0, 5).map((row) => (
                <div
                  key={row.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded border border-emerald-200 bg-white px-3 py-2 text-xs"
                >
                  <span>
                    {agencyNameById[row.agencyId] || row.agencyId} {"->"}{" "}
                    {formatCurrency(Number(row.amountReceived ?? row.amount ?? 0), row.currency || "XOF")}
                  </span>
                  <div className="flex flex-wrap items-center gap-2">
                    <ActionButton
                      size="sm"
                      variant="ghost"
                      onClick={() => openPrintDocument(getInternalTransferDocumentId(row.id, "reception"))}
                    >
                      Imprimer le reçu de reception
                    </ActionButton>
                    {canInitiate ? (
                      <ActionButton
                        size="sm"
                        variant="secondary"
                        onClick={() => handlePrepareBankFromInterReception(row)}
                      >
                        Preparer un versement banque
                      </ActionButton>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </SectionCard>

      <SectionCard
        title={managerOnlyView ? "Derniers dépôts et transferts" : "Historique des dépôts"}
        icon={ShieldCheck}
        description={
          managerOnlyView
            ? `Dépôts enregistrés: ${bankConfirmedCount} | Transferts entrants: ${incomingToReceiveRows.length}`
            : `Dépôts enregistrés: ${bankConfirmedCount}`
        }
        right={
          <ActionButton size="sm" variant="secondary" onClick={() => void loadRequests()} disabled={requestsLoading}>
            Actualiser
          </ActionButton>
        }
      >
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <select
            value={flowFilter}
            onChange={(e) => setFlowFilter(e.target.value as FlowFilter)}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
          >
            <option value="all">Tous les flux</option>
            <option value="bank_deposit">Versement banque</option>
            <option value="inter_agency_transfer">Transfert inter-agence</option>
          </select>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
          >
            <option value="all">Tous les statuts</option>
            <option value="open">A traiter</option>
            <option value="transit">En transit</option>
            <option value="closed">Termines / refuses</option>
          </select>
          <label className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={afterEntryOnly}
              onChange={(e) => setAfterEntryOnly(e.target.checked)}
            />
            Regularisations apres coup
          </label>
        </div>

        <div className="mb-4 grid grid-cols-1 gap-2 text-xs sm:grid-cols-3">
          <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
            <div className="font-semibold text-gray-900">Dépôts enregistrés</div>
            <div className="mt-0.5 text-gray-600">{bankConfirmedCount}</div>
          </div>
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
            <div className="font-semibold text-amber-900">Transferts inter-agence à traiter</div>
            <div className="mt-0.5 text-amber-800">{incomingToReceiveRows.length}</div>
          </div>
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2">
            <div className="font-semibold text-emerald-900">Régularisations après coup</div>
            <div className="mt-0.5 text-emerald-800">{afterEntryCount}</div>
          </div>
        </div>

        {!managerOnlyView && sensitiveToValidateRows.length > 0 ? (
          <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            Flux sensibles à valider (hors dépôt local): {sensitiveToValidateRows.length}
          </div>
        ) : null}

        {requestsLoading ? (
          <div className="py-4 text-sm text-gray-500">Chargement des opérations...</div>
        ) : filteredRequests.length === 0 ? (
          <div className="py-4 text-sm text-gray-500">Aucune opération pour ce filtre.</div>
        ) : (
          <div className="space-y-3">
            {filteredRequests.map((row) => {
              const isSourceAgency = row.agencyId === agencyId;
              const isDestinationAgency = row.destinationAgencyId === agencyId;
              const sensitiveRequest = isSensitiveRequest(row);
              const bankName =
                companyBankNameById[row.toAccountId.replace("company_bank_", "")] ||
                row.toAccountId ||
                "Banque";
              const canApproveManager =
                row.flowType === "inter_agency_transfer" &&
                sensitiveRequest &&
                canManager &&
                row.status === "pending_manager" &&
                row.initiatedBy !== user?.uid;
              const canApproveHead =
                row.flowType === "inter_agency_transfer" &&
                sensitiveRequest &&
                canHeadAccountant &&
                row.status === "pending_head_accountant";
              const canApproveDgAction =
                row.flowType === "inter_agency_transfer" && sensitiveRequest && canDg && row.status === "pending_dg";
              const canMarkTransit =
                canInitiate && isSourceAgency && row.flowType === "inter_agency_transfer" && row.status === "authorized";
              const canConfirmBank = false;
              const canConfirmInter =
                canDestinationReceive && isDestinationAgency && row.status === "in_transit_inter_agency";
              const canReject =
                row.flowType === "inter_agency_transfer" &&
                sensitiveRequest &&
                canRejectAtAnyLevel &&
                isOpenStatus(row.status, row.flowType);

              return (
                <div key={row.id} className="rounded-xl border border-gray-200 bg-white p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <StatusBadge status={getStatusBadge(row)}>{getStatusLabel(row)}</StatusBadge>
                      <span className="text-sm font-semibold text-gray-900">{getFlowLabel(row.flowType)}</span>
                    </div>
                    <div className="text-sm font-semibold text-gray-900">
                      {formatCurrency(Number(row.amount ?? 0), row.currency || agencyCashAccount?.currency || "XOF")}
                    </div>
                  </div>
                  <div className="mt-2 grid grid-cols-1 gap-2 text-xs text-gray-600 md:grid-cols-2 xl:grid-cols-4">
                    <div>Source: {agencyNameById[row.agencyId] || row.agencyId}</div>
                    <div>
                      Destination:{" "}
                      {row.flowType === "bank_deposit"
                        ? bankName
                        : agencyNameById[String(row.destinationAgencyId ?? "")] || row.destinationAgencyId || "-"}
                    </div>
                    <div>
                      Agence bancaire: {row.flowType === "bank_deposit" ? row.bankBranchName || "-" : "-"}
                    </div>
                    <div>
                      {row.flowType === "bank_deposit" ? "Date dépôt" : "Date demande"}:{" "}
                      {formatDateTime(row.createdAt)}
                    </div>
                    {row.flowType === "inter_agency_transfer" ? (
                      <div>Niveau autorisation: {getApprovalLevelLabel(row.approvalLevelRequired)}</div>
                    ) : (
                      <div>Référence reçu: {row.bankReceiptNumber || row.manualReceiptNumber || "-"}</div>
                    )}
                    <div>Executant prevu: {row.plannedExecutorName || "-"}</div>
                    <div>Date prevue: {formatDateTime(row.plannedDate)}</div>
                    <div>Observation: {row.description || "-"}</div>
                    <div>Mode: {row.flowType === "bank_deposit" ? "Dépôt direct" : "Transfert inter-agence"}</div>
                  </div>

                  <div className="mt-3 grid grid-cols-1 gap-2 text-xs text-gray-700 md:grid-cols-2 xl:grid-cols-4">
                    <div>
                      <div className="font-semibold text-gray-900">
                        {row.flowType === "bank_deposit" ? "Comptable saisissant" : "Qui demande"}
                      </div>
                      <div>{normalizeActorDisplay(row.initiatedBy, row.initiatedByRole)}</div>
                    </div>
                    {row.flowType === "inter_agency_transfer" ? (
                      <div>
                        <div className="font-semibold text-gray-900">Qui autorise</div>
                        <div>Visa agence: {normalizeActorDisplay(row.managerDecisionBy, "chefAgence")}</div>
                        {row.approvalLevelRequired !== "agency_only" ? (
                          <div>
                            Visa chef comptable:{" "}
                            {normalizeActorDisplay(row.headAccountantDecisionBy, "company_accountant")}
                          </div>
                        ) : null}
                        {row.approvalLevelRequired === "dg" ? (
                          <div>Visa DG: {normalizeActorDisplay(row.dgDecisionBy, "company_ceo")}</div>
                        ) : null}
                      </div>
                    ) : (
                      <div>
                        <div className="font-semibold text-gray-900">Dépôt local</div>
                        <div>Enregistrement direct sans circuit de validation interne.</div>
                      </div>
                    )}
                    <div>
                      <div className="font-semibold text-gray-900">Qui execute</div>
                      <div>Sortie physique: {normalizeActorDisplay(row.inTransitBy, "executant")}</div>
                      <div>Execution finale: {normalizeActorDisplay(row.executedBy, "executant")}</div>
                    </div>
                    <div>
                      <div className="font-semibold text-gray-900">Qui controle</div>
                      <div>
                        {row.flowType === "inter_agency_transfer"
                          ? `Reception destination: ${normalizeActorDisplay(row.receivedBy, "agency_accountant")}`
                          : `Dépôt confirmé: ${normalizeActorDisplay(row.depositConfirmedBy, "agency_accountant")}`}
                      </div>
                    </div>
                  </div>

                  <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                    <StatusBadge status={row.captureMode === "after_entry" ? "warning" : "info"}>
                      {getCaptureModeLabel(row.captureMode)}
                    </StatusBadge>
                    {row.manualDocumentUsed ? (
                      <StatusBadge status="warning">Pièce manuelle utilisée</StatusBadge>
                    ) : null}
                    {row.manualDocumentUsed && row.manualDocumentNumber ? (
                      <span className="rounded bg-gray-100 px-2 py-1 text-gray-700">
                        Piece: {row.manualDocumentType || "-"} / {row.manualDocumentNumber}
                      </span>
                    ) : null}
                    {row.captureMode === "after_entry" ? (
                      <span className="rounded bg-gray-100 px-2 py-1 text-gray-700">
                        régularisé par: {row.regularizedByName || row.regularizedByUid || "-"}
                      </span>
                    ) : null}
                  </div>

                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    {canApproveManager ? (
                      <ActionButton
                        size="sm"
                        onClick={() => void handleApproveByManager(row)}
                        disabled={busyRequestId === row.id}
                      >
                        Visa chef d'agence
                      </ActionButton>
                    ) : null}
                    {canApproveHead ? (
                      <ActionButton
                        size="sm"
                        onClick={() => void handleApproveByHead(row)}
                        disabled={busyRequestId === row.id}
                      >
                        Visa chef comptable
                      </ActionButton>
                    ) : null}
                    {canApproveDgAction ? (
                      <ActionButton
                        size="sm"
                        onClick={() => void handleApproveByDg(row)}
                        disabled={busyRequestId === row.id}
                      >
                        Validation DG
                      </ActionButton>
                    ) : null}
                    {canMarkTransit ? (
                      <ActionButton
                        size="sm"
                        variant="secondary"
                        onClick={() => void handleMarkInTransit(row)}
                        disabled={busyRequestId === row.id}
                      >
                        Declarer sortie physique
                      </ActionButton>
                    ) : null}
                    {canConfirmBank ? (
                      <ActionButton
                        size="sm"
                        variant="secondary"
                        onClick={() => void handleConfirmBankDeposit(row)}
                        disabled={busyRequestId === row.id}
                      >
                        Confirmer dépôt banque
                      </ActionButton>
                    ) : null}
                    {canConfirmInter ? (
                      <ActionButton
                        size="sm"
                        variant="secondary"
                        onClick={() => void handleConfirmInterAgencyReception(row)}
                        disabled={busyRequestId === row.id}
                      >
                        Confirmer reception destination
                      </ActionButton>
                    ) : null}
                    {canReject ? (
                      <ActionButton
                        size="sm"
                        variant="danger"
                        onClick={() => void handleReject(row)}
                        disabled={busyRequestId === row.id}
                      >
                        Refuser
                      </ActionButton>
                    ) : null}

                    {row.flowType === "bank_deposit" ? (
                      <>

                        <ActionButton
                          size="sm"
                          variant="ghost"
                          onClick={() =>
                            openPrintDocument(getBankDepositDocumentId("transfer_request", row.id))
                          }
                        >
                          Imprimer le bordereau de dépôt
                        </ActionButton>
                      </>
                    ) : (
                      <ActionButton
                        size="sm"
                        variant="ghost"
                        onClick={() =>
                          openPrintDocument(
                            getInternalTransferDocumentId(
                              row.id,
                              row.status === "received_inter_agency" ? "reception" : "sortie"
                            )
                          )
                        }
                      >
                        {row.status === "received_inter_agency"
                          ? "Imprimer reçu reception inter-agence"
                          : "Imprimer bordereau sortie inter-agence"}
                      </ActionButton>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </SectionCard>

      <SectionCard
        title="Documents imprimables"
        icon={ShieldCheck}
        description="Pieces recentes pretes a imprimer pour suivi terrain et archive locale."
      >
        {printableRows.length === 0 ? (
          <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-3 text-sm text-gray-600">
            Aucun document imprimable pour le moment.
          </div>
        ) : (
          <div className="space-y-2">
            {printableRows.map((row) => (
              <div
                key={`print-${row.id}`}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs"
              >
                <div>
                  <div className="font-semibold text-gray-900">
                    {row.flowType === "bank_deposit" ? "Versement banque" : "Transfert inter-agence"}
                  </div>
                  <div className="text-gray-600">
                    {formatDateTime(row.updatedAt ?? row.createdAt)} | {getStatusLabel(row)}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold text-gray-900">
                    {formatCurrency(Number(row.amountDeposited ?? row.amount ?? 0), row.currency || "XOF")}
                  </span>
                  {row.flowType === "bank_deposit" ? (
                    <>

                      <ActionButton
                        size="sm"
                        variant="ghost"
                        onClick={() => openPrintDocument(getBankDepositDocumentId("transfer_request", row.id))}
                      >
                        Bordereau
                      </ActionButton>
                    </>
                  ) : (
                    <>
                      <ActionButton
                        size="sm"
                        variant="ghost"
                        onClick={() => openPrintDocument(getInternalTransferDocumentId(row.id, "sortie"))}
                      >
                        Sortie
                      </ActionButton>
                      {row.status === "received_inter_agency" ? (
                        <ActionButton
                          size="sm"
                          variant="ghost"
                          onClick={() => openPrintDocument(getInternalTransferDocumentId(row.id, "reception"))}
                        >
                          Reception
                        </ActionButton>
                      ) : null}
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      {inTransitDialog ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-3">
          <div className="w-full max-w-xl rounded-xl bg-white p-4 shadow-xl">
            <h3 className="text-base font-semibold text-gray-900">Sortie physique vers banque</h3>
            <p className="mt-1 text-sm text-gray-600">
              Renseignez la sortie reelle pour passer le montant en transit vers banque.
            </p>
            <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Date reelle de sortie
                </label>
                <input
                  type="date"
                  value={inTransitDialog.operationDate}
                  onChange={(e) =>
                    setInTransitDialog((prev) => (prev ? { ...prev, operationDate: e.target.value } : prev))
                  }
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Mode d'enregistrement
                </label>
                <select
                  value={inTransitDialog.captureMode}
                  onChange={(e) =>
                    setInTransitDialog((prev) =>
                      prev
                        ? { ...prev, captureMode: e.target.value === "after_entry" ? "after_entry" : "normal" }
                        : prev
                    )
                  }
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                >
                  <option value="normal">Saisie normale</option>
                  <option value="after_entry">Saisie après coup</option>
                </select>
              </div>
              <div className="md:col-span-2">
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Observation
                </label>
                <textarea
                  value={inTransitDialog.observation}
                  onChange={(e) =>
                    setInTransitDialog((prev) => (prev ? { ...prev, observation: e.target.value } : prev))
                  }
                  className="min-h-[72px] w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  placeholder="Commentaire terrain (optionnel)"
                />
              </div>
            </div>

            <label className="mt-3 inline-flex items-center gap-2 text-sm font-semibold text-gray-800">
              <input
                type="checkbox"
                checked={showInTransitAdvanced}
                onChange={(e) => {
                  const checked = e.target.checked;
                  setShowInTransitAdvanced(checked);
                  if (!checked) {
                    setInTransitDialog((prev) =>
                      prev
                        ? {
                            ...prev,
                            captureMode: "normal",
                            manualDocumentUsed: false,
                            manualDocumentType: "",
                            manualDocumentNumber: "",
                            regularizedByName: "",
                          }
                        : prev
                    );
                  }
                }}
              />
              Piece manuelle / Saisie après coup
            </label>

            {showInTransitAdvanced ? (
              <div className="mt-2 rounded-lg border border-dashed border-gray-300 p-3">
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Mode d'enregistrement
                </label>
                <select
                  value={inTransitDialog.captureMode}
                  onChange={(e) =>
                    setInTransitDialog((prev) =>
                      prev
                        ? { ...prev, captureMode: e.target.value === "after_entry" ? "after_entry" : "normal" }
                        : prev
                    )
                  }
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                >
                  <option value="normal">Saisie normale</option>
                  <option value="after_entry">Saisie après coup</option>
                </select>

                <label className="mt-2 inline-flex items-center gap-2 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    checked={inTransitDialog.manualDocumentUsed}
                    onChange={(e) =>
                      setInTransitDialog((prev) =>
                        prev ? { ...prev, manualDocumentUsed: e.target.checked } : prev
                      )
                    }
                  />
                  Pièce manuelle utilisée
                </label>
                {inTransitDialog.manualDocumentUsed ? (
                  <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-2">
                    <input
                      type="text"
                      value={inTransitDialog.manualDocumentType}
                      onChange={(e) =>
                        setInTransitDialog((prev) =>
                          prev ? { ...prev, manualDocumentType: e.target.value } : prev
                        )
                      }
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                      placeholder="Type de pièce manuelle"
                    />
                    <input
                      type="text"
                      value={inTransitDialog.manualDocumentNumber}
                      onChange={(e) =>
                        setInTransitDialog((prev) =>
                          prev ? { ...prev, manualDocumentNumber: e.target.value } : prev
                        )
                      }
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                      placeholder="Numéro de pièce"
                    />
                  </div>
                ) : null}
                {inTransitDialog.captureMode === "after_entry" ? (
                  <input
                    type="text"
                    value={inTransitDialog.regularizedByName}
                    onChange={(e) =>
                      setInTransitDialog((prev) =>
                        prev ? { ...prev, regularizedByName: e.target.value } : prev
                      )
                    }
                    className="mt-2 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                    placeholder="Nom de l'acteur ayant régularisé"
                  />
                ) : null}
              </div>
            ) : null}

            <div className="mt-4 flex justify-end gap-2">
              <ActionButton
                type="button"
                variant="secondary"
                onClick={() => {
                  setInTransitDialog(null);
                  setShowInTransitAdvanced(false);
                }}
                disabled={busyRequestId === inTransitDialog.row.id}
              >
                Fermer
              </ActionButton>
              <ActionButton
                type="button"
                onClick={() => void handleSubmitInTransit()}
                disabled={busyRequestId === inTransitDialog.row.id}
              >
                {busyRequestId === inTransitDialog.row.id ? "Validation..." : "Valider la sortie"}
              </ActionButton>
            </div>
          </div>
        </div>
      ) : null}

      {confirmDepositDialog ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-3">
          <div className="w-full max-w-2xl rounded-xl bg-white p-4 shadow-xl">
            <h3 className="text-base font-semibold text-gray-900">Confirmation du dépôt bancaire</h3>
            <p className="mt-1 text-sm text-gray-600">
              Le scan/photo du reçu bancaire est facultatif. Saisissez les references papier si necessaire.
            </p>
            <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">Banque</label>
                <input
                  type="text"
                  value={confirmDepositDialog.bankName}
                  onChange={(e) =>
                    setConfirmDepositDialog((prev) => (prev ? { ...prev, bankName: e.target.value } : prev))
                  }
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Agence bancaire
                </label>
                <input
                  type="text"
                  value={confirmDepositDialog.bankBranchName}
                  onChange={(e) =>
                    setConfirmDepositDialog((prev) =>
                      prev ? { ...prev, bankBranchName: e.target.value } : prev
                    )
                  }
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  placeholder="Optionnel"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Montant depose
                </label>
                <input
                  type="number"
                  min={0}
                  value={confirmDepositDialog.amountDeposited}
                  onChange={(e) =>
                    setConfirmDepositDialog((prev) =>
                      prev ? { ...prev, amountDeposited: e.target.value } : prev
                    )
                  }
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Date reelle du dépôt
                </label>
                <input
                  type="date"
                  value={confirmDepositDialog.operationDate}
                  onChange={(e) =>
                    setConfirmDepositDialog((prev) =>
                      prev ? { ...prev, operationDate: e.target.value } : prev
                    )
                  }
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Heure reelle
                </label>
                <input
                  type="time"
                  value={confirmDepositDialog.operationHour}
                  onChange={(e) =>
                    setConfirmDepositDialog((prev) =>
                      prev ? { ...prev, operationHour: e.target.value } : prev
                    )
                  }
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Numéro du reçu bancaire
                </label>
                <input
                  type="text"
                  value={confirmDepositDialog.bankReceiptNumber}
                  onChange={(e) =>
                    setConfirmDepositDialog((prev) =>
                      prev ? { ...prev, bankReceiptNumber: e.target.value } : prev
                    )
                  }
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  placeholder="Optionnel"
                />
              </div>
              <div className="md:col-span-2">
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">Observation</label>
                <textarea
                  value={confirmDepositDialog.observation}
                  onChange={(e) =>
                    setConfirmDepositDialog((prev) => (prev ? { ...prev, observation: e.target.value } : prev))
                  }
                  className="min-h-[70px] w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  placeholder="Commentaire dépôt (optionnel)"
                />
              </div>
            </div>

            <label className="mt-3 inline-flex items-center gap-2 text-sm font-semibold text-gray-800">
              <input
                type="checkbox"
                checked={showConfirmDepositAdvanced}
                onChange={(e) => {
                  const checked = e.target.checked;
                  setShowConfirmDepositAdvanced(checked);
                  if (!checked) {
                    setConfirmDepositDialog((prev) =>
                      prev
                        ? {
                            ...prev,
                            captureMode: "normal",
                            manualDocumentUsed: false,
                            manualDocumentType: "",
                            manualDocumentNumber: "",
                            manualReceiptUsed: false,
                            manualReceiptNumber: "",
                            regularizedByName: "",
                          }
                        : prev
                    );
                  }
                }}
              />
              Piece manuelle / Saisie après coup
            </label>

            {showConfirmDepositAdvanced ? (
              <div className="mt-2 rounded-lg border border-dashed border-gray-300 p-3">
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Mode d'enregistrement
                </label>
                <select
                  value={confirmDepositDialog.captureMode}
                  onChange={(e) =>
                    setConfirmDepositDialog((prev) =>
                      prev
                        ? { ...prev, captureMode: e.target.value === "after_entry" ? "after_entry" : "normal" }
                        : prev
                    )
                  }
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                >
                  <option value="normal">Saisie normale</option>
                  <option value="after_entry">Saisie après coup</option>
                </select>

                <label className="mt-2 inline-flex items-center gap-2 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    checked={confirmDepositDialog.manualReceiptUsed}
                    onChange={(e) =>
                      setConfirmDepositDialog((prev) =>
                        prev
                          ? {
                              ...prev,
                              manualReceiptUsed: e.target.checked,
                              manualReceiptNumber: e.target.checked ? prev.manualReceiptNumber : "",
                            }
                          : prev
                      )
                    }
                  />
                  reçu manuel utilise
                </label>
                {confirmDepositDialog.manualReceiptUsed ? (
                  <input
                    type="text"
                    value={confirmDepositDialog.manualReceiptNumber}
                    onChange={(e) =>
                      setConfirmDepositDialog((prev) =>
                        prev ? { ...prev, manualReceiptNumber: e.target.value } : prev
                      )
                    }
                    className="mt-2 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                    placeholder="Numéro du reçu manuel"
                  />
                ) : null}

                <label className="mt-3 inline-flex items-center gap-2 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    checked={confirmDepositDialog.manualDocumentUsed}
                    onChange={(e) =>
                      setConfirmDepositDialog((prev) =>
                        prev ? { ...prev, manualDocumentUsed: e.target.checked } : prev
                      )
                    }
                  />
                  Pièce manuelle utilisée
                </label>
                {confirmDepositDialog.manualDocumentUsed ? (
                  <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-2">
                    <input
                      type="text"
                      value={confirmDepositDialog.manualDocumentType}
                      onChange={(e) =>
                        setConfirmDepositDialog((prev) =>
                          prev ? { ...prev, manualDocumentType: e.target.value } : prev
                        )
                      }
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                      placeholder="Type de pièce manuelle"
                    />
                    <input
                      type="text"
                      value={confirmDepositDialog.manualDocumentNumber}
                      onChange={(e) =>
                        setConfirmDepositDialog((prev) =>
                          prev ? { ...prev, manualDocumentNumber: e.target.value } : prev
                        )
                      }
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                      placeholder="Numéro de pièce"
                    />
                  </div>
                ) : null}
                {confirmDepositDialog.captureMode === "after_entry" ? (
                  <input
                    type="text"
                    value={confirmDepositDialog.regularizedByName}
                    onChange={(e) =>
                      setConfirmDepositDialog((prev) =>
                        prev ? { ...prev, regularizedByName: e.target.value } : prev
                      )
                    }
                    className="mt-2 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                    placeholder="Nom de l'acteur ayant régularisé"
                  />
                ) : null}
              </div>
            ) : null}

            <div className="mt-4 flex justify-end gap-2">
              <ActionButton
                type="button"
                variant="secondary"
                onClick={() => {
                  setConfirmDepositDialog(null);
                  setShowConfirmDepositAdvanced(false);
                }}
                disabled={busyRequestId === confirmDepositDialog.row.id}
              >
                Fermer
              </ActionButton>
              <ActionButton
                type="button"
                onClick={() => void handleSubmitConfirmBankDeposit()}
                disabled={busyRequestId === confirmDepositDialog.row.id}
              >
                {busyRequestId === confirmDepositDialog.row.id ? "Validation..." : "Confirmer le dépôt"}
              </ActionButton>
            </div>
          </div>
        </div>
      ) : null}

      {confirmInterReceptionDialog ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-3">
          <div className="w-full max-w-2xl rounded-xl bg-white p-4 shadow-xl">
            <h3 className="text-base font-semibold text-gray-900">Reception inter-agence</h3>
            <p className="mt-1 text-sm text-gray-600">
              Confirmez la reception pour alimenter la caisse de destination.
            </p>
            <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Montant reçu
                </label>
                <input
                  type="number"
                  min={0}
                  value={confirmInterReceptionDialog.amountReceived}
                  onChange={(e) =>
                    setConfirmInterReceptionDialog((prev) =>
                      prev ? { ...prev, amountReceived: e.target.value } : prev
                    )
                  }
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                />
              </div>
              <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-700">
                <div>
                  Montant attendu:{" "}
                  <span className="font-semibold">
                    {formatCurrency(
                      Number(confirmInterReceptionDialog.row.amount ?? 0),
                      confirmInterReceptionDialog.row.currency || agencyCashAccount?.currency || "XOF"
                    )}
                  </span>
                </div>
                <div className="mt-1">
                  Ecart:{" "}
                  <span className="font-semibold">
                    {formatCurrency(
                      parseNumber(confirmInterReceptionDialog.amountReceived) -
                        Number(confirmInterReceptionDialog.row.amount ?? 0),
                      confirmInterReceptionDialog.row.currency || agencyCashAccount?.currency || "XOF"
                    )}
                  </span>
                </div>
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Date reelle de reception
                </label>
                <input
                  type="date"
                  value={confirmInterReceptionDialog.operationDate}
                  onChange={(e) =>
                    setConfirmInterReceptionDialog((prev) =>
                      prev ? { ...prev, operationDate: e.target.value } : prev
                    )
                  }
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Heure
                </label>
                <input
                  type="time"
                  value={confirmInterReceptionDialog.operationHour}
                  onChange={(e) =>
                    setConfirmInterReceptionDialog((prev) =>
                      prev ? { ...prev, operationHour: e.target.value } : prev
                    )
                  }
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                />
              </div>
              <div className="md:col-span-2">
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Observation
                </label>
                <textarea
                  value={confirmInterReceptionDialog.observation}
                  onChange={(e) =>
                    setConfirmInterReceptionDialog((prev) =>
                      prev ? { ...prev, observation: e.target.value } : prev
                    )
                  }
                  className="min-h-[70px] w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  placeholder="Ecart, commentaire terrain (optionnel)"
                />
              </div>
            </div>

            <label className="mt-3 inline-flex items-center gap-2 text-sm font-semibold text-gray-800">
              <input
                type="checkbox"
                checked={showInterReceptionAdvanced}
                onChange={(e) => {
                  const checked = e.target.checked;
                  setShowInterReceptionAdvanced(checked);
                  if (!checked) {
                    setConfirmInterReceptionDialog((prev) =>
                      prev
                        ? {
                            ...prev,
                            captureMode: "normal",
                            manualReceiptUsed: false,
                            manualReceiptNumber: "",
                            manualDocumentUsed: false,
                            manualDocumentType: "",
                            manualDocumentNumber: "",
                            regularizedByName: "",
                          }
                        : prev
                    );
                  }
                }}
              />
              Piece manuelle / Saisie après coup
            </label>

            {showInterReceptionAdvanced ? (
              <div className="mt-2 rounded-lg border border-dashed border-gray-300 p-3">
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Mode d'enregistrement
                </label>
                <select
                  value={confirmInterReceptionDialog.captureMode}
                  onChange={(e) =>
                    setConfirmInterReceptionDialog((prev) =>
                      prev
                        ? { ...prev, captureMode: e.target.value === "after_entry" ? "after_entry" : "normal" }
                        : prev
                    )
                  }
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                >
                  <option value="normal">Saisie normale</option>
                  <option value="after_entry">Saisie après coup</option>
                </select>

                <label className="mt-2 inline-flex items-center gap-2 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    checked={confirmInterReceptionDialog.manualReceiptUsed}
                    onChange={(e) =>
                      setConfirmInterReceptionDialog((prev) =>
                        prev
                          ? {
                              ...prev,
                              manualReceiptUsed: e.target.checked,
                              manualReceiptNumber: e.target.checked ? prev.manualReceiptNumber : "",
                            }
                          : prev
                      )
                    }
                  />
                  reçu manuel utilise
                </label>
                {confirmInterReceptionDialog.manualReceiptUsed ? (
                  <input
                    type="text"
                    value={confirmInterReceptionDialog.manualReceiptNumber}
                    onChange={(e) =>
                      setConfirmInterReceptionDialog((prev) =>
                        prev ? { ...prev, manualReceiptNumber: e.target.value } : prev
                      )
                    }
                    className="mt-2 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                    placeholder="Numéro du reçu manuel"
                  />
                ) : null}

                <label className="mt-3 inline-flex items-center gap-2 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    checked={confirmInterReceptionDialog.manualDocumentUsed}
                    onChange={(e) =>
                      setConfirmInterReceptionDialog((prev) =>
                        prev ? { ...prev, manualDocumentUsed: e.target.checked } : prev
                      )
                    }
                  />
                  Pièce manuelle utilisée
                </label>
                {confirmInterReceptionDialog.manualDocumentUsed ? (
                  <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-2">
                    <input
                      type="text"
                      value={confirmInterReceptionDialog.manualDocumentType}
                      onChange={(e) =>
                        setConfirmInterReceptionDialog((prev) =>
                          prev ? { ...prev, manualDocumentType: e.target.value } : prev
                        )
                      }
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                      placeholder="Type de pièce manuelle"
                    />
                    <input
                      type="text"
                      value={confirmInterReceptionDialog.manualDocumentNumber}
                      onChange={(e) =>
                        setConfirmInterReceptionDialog((prev) =>
                          prev ? { ...prev, manualDocumentNumber: e.target.value } : prev
                        )
                      }
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                      placeholder="Numéro de pièce"
                    />
                  </div>
                ) : null}
                {confirmInterReceptionDialog.captureMode === "after_entry" ? (
                  <input
                    type="text"
                    value={confirmInterReceptionDialog.regularizedByName}
                    onChange={(e) =>
                      setConfirmInterReceptionDialog((prev) =>
                        prev ? { ...prev, regularizedByName: e.target.value } : prev
                      )
                    }
                    className="mt-2 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                    placeholder="Nom de l'acteur ayant régularisé"
                  />
                ) : null}
              </div>
            ) : null}

            <div className="mt-4 flex justify-end gap-2">
              <ActionButton
                type="button"
                variant="secondary"
                onClick={() => {
                  setConfirmInterReceptionDialog(null);
                  setShowInterReceptionAdvanced(false);
                }}
                disabled={busyRequestId === confirmInterReceptionDialog.row.id}
              >
                Fermer
              </ActionButton>
              <ActionButton
                type="button"
                onClick={() => void handleSubmitConfirmInterReception()}
                disabled={busyRequestId === confirmInterReceptionDialog.row.id}
              >
                {busyRequestId === confirmInterReceptionDialog.row.id ? "Validation..." : "Confirmer la reception"}
              </ActionButton>
            </div>
          </div>
        </div>
      ) : null}

      {rejectDialog ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-3">
          <div className="w-full max-w-md rounded-xl bg-white p-4 shadow-xl">
            <h3 className="text-base font-semibold text-gray-900">Refuser la demande</h3>
            <p className="mt-1 text-sm text-gray-600">Ajoutez un motif de refus (optionnel).</p>
            <textarea
              value={rejectDialog.reason}
              onChange={(e) =>
                setRejectDialog((prev) => (prev ? { ...prev, reason: e.target.value } : prev))
              }
              className="mt-3 min-h-[90px] w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              placeholder="Motif de refus"
            />
            <div className="mt-4 flex justify-end gap-2">
              <ActionButton
                type="button"
                variant="secondary"
                onClick={() => setRejectDialog(null)}
                disabled={busyRequestId === rejectDialog.row.id}
              >
                Fermer
              </ActionButton>
              <ActionButton
                type="button"
                variant="danger"
                onClick={() => void handleSubmitReject()}
                disabled={busyRequestId === rejectDialog.row.id}
              >
                {busyRequestId === rejectDialog.row.id ? "Validation..." : "Confirmer le refus"}
              </ActionButton>
            </div>
          </div>
        </div>
      ) : null}

      {printReady ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-3">
          <div className="w-full max-w-lg rounded-xl bg-white p-4 shadow-xl">
            <h3 className="text-base font-semibold text-gray-900">{printReady.title}</h3>
            <p className="mt-1 text-sm text-gray-600">{printReady.subtitle}</p>
            {printReady.messageLines?.length ? (
              <div className="mt-2 space-y-1 text-sm text-gray-700">
                {printReady.messageLines.map((line, idx) => (
                  <p key={`print-ready-line-${idx}`}>{line}</p>
                ))}
              </div>
            ) : null}
            {printReady.depositSummary ? (
              <div className="mt-3 rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm">
                <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
                  <div className="text-gray-500">Banque</div>
                  <div className="font-medium text-gray-900">{printReady.depositSummary.bankLabel}</div>
                  <div className="text-gray-500">Montant versé</div>
                  <div className="font-medium text-gray-900">
                    {formatCurrency(printReady.depositSummary.amount, printReady.depositSummary.currency)}
                  </div>
                  <div className="text-gray-500">Date du dépôt</div>
                  <div className="font-medium text-gray-900">
                    {formatDateOnly(printReady.depositSummary.operationDate)}
                  </div>
                  <div className="text-gray-500">Numéro du reçu / bordereau banque</div>
                  <div className="font-medium text-gray-900">{printReady.depositSummary.receiptNumber || "-"}</div>
                </div>
              </div>
            ) : null}
            <div className="mt-4 flex flex-wrap justify-end gap-2">
              <ActionButton type="button" variant="ghost" onClick={() => setPrintReady(null)}>
                Fermer
              </ActionButton>
              {printReady.showArchiveAction ? (
                <ActionButton
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    openDocumentsArchive();
                    setPrintReady(null);
                  }}
                >
                  Voir dans les documents et archives
                </ActionButton>
              ) : null}
              {printReady.showSecondaryAction ? (
                <ActionButton
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    openPrintDocument(printReady.documentId);
                    setPrintReady(null);
                  }}
                >
                  {printReady.secondaryLabel ?? "Voir le document"}
                </ActionButton>
              ) : null}
              <ActionButton
                type="button"
                onClick={() => {
                  if (printReady.openPrimaryInNewTab) {
                    openPrintDocumentInNewTab(printReady.documentId);
                  } else {
                    openPrintDocument(printReady.documentId);
                  }
                  setPrintReady(null);
                }}
              >
                {printReady.primaryLabel}
              </ActionButton>
            </div>
          </div>
        </div>
      ) : null}

      {interReceptionReady ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-3">
          <div className="w-full max-w-lg rounded-xl bg-white p-4 shadow-xl">
            <h3 className="text-base font-semibold text-gray-900">Reception destination confirmee</h3>
            <p className="mt-1 text-sm text-gray-600">
              Le reçu de reception est pret a imprimer et le montant est ajoute en caisse destination.
            </p>
            <p className="mt-2 text-sm text-gray-700">
              Montant reçu:{" "}
              <span className="font-semibold">
                {formatCurrency(
                  interReceptionReady.amountReceived,
                  interReceptionReady.row.currency || agencyCashAccount?.currency || "XOF"
                )}
              </span>
            </p>
            <div className="mt-4 flex flex-wrap justify-end gap-2">
              <ActionButton
                type="button"
                variant="secondary"
                onClick={() => setInterReceptionReady(null)}
              >
                Fermer
              </ActionButton>
              <ActionButton
                type="button"
                variant="ghost"
                onClick={() => {
                  handlePrepareBankFromInterReception(interReceptionReady.row);
                  setInterReceptionReady(null);
                }}
              >
                Preparer un versement banque
              </ActionButton>
              <ActionButton
                type="button"
                onClick={() => {
                  openPrintDocument(getInternalTransferDocumentId(interReceptionReady.row.id, "reception"));
                  setInterReceptionReady(null);
                }}
              >
                Imprimer le reçu de reception
              </ActionButton>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );

  return isStandaloneComptaTreasury ? (
    <StandardLayoutWrapper className="min-w-0">{body}</StandardLayoutWrapper>
  ) : (
    body
  );
}
