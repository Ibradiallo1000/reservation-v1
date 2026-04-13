import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  Timestamp,
  where,
} from "firebase/firestore";
import { useNavigate } from "react-router-dom";
import {
  Building2,
  CheckCircle2,
  Clock3,
  Copy,
  Eye,
  History,
  LogOut,
  MessageCircle,
  Moon,
  RefreshCw,
  Search,
  Sun,
  Wallet,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { db } from "@/firebaseConfig";
import { useAuth } from "@/contexts/AuthContext";
import useCompanyTheme from "@/shared/hooks/useCompanyTheme";
import { useAgencyDarkMode } from "@/modules/agence/shared";
import { Button } from "@/shared/ui/button";
import type { Reservation } from "@/types/reservation";
import { ensurePendingOnlinePaymentFromReservation, getPaymentByReservationId } from "@/services/paymentService";
import {
  rejectPendingOnlinePaymentAndSyncReservation,
  validatePendingOnlinePaymentAndSyncReservation,
} from "@/services/onlinePaymentOperatorService";
import { formatCurrency } from "@/shared/utils/formatCurrency";
import { listAccounts } from "@/modules/compagnie/treasury/financialAccounts";
import { mobileToBankTransfer } from "@/modules/compagnie/treasury/treasuryTransferService";
import { listFinancialDocuments, upsertBankDepositDocument } from "@/modules/finance/documents/financialDocumentsService";
import type { FinancialDocumentStatus } from "@/modules/finance/documents/financialDocuments.types";
import {
  isCanonicalPendingOnlineReview,
  normalizeReservationDocument,
  type CanonicalReservationDocument,
} from "@/modules/reservations/canonicalReservation";

type Tab = "to_process" | "wallets" | "transfers" | "history";
type Provider = "all" | "orange" | "moov" | "wave" | "sarali" | "other";
type DateFilter = "today" | "7d" | "30d" | "all";
type HistoryType = "all" | "validation" | "rejet" | "transfert";
type TransferStateFilter = "all" | "confirmed" | "non_confirmed";

type AuthUser = {
  uid?: string;
  companyId?: string;
  role?: string | string[] | null;
  displayName?: string;
  email?: string;
  phone?: string;
};

type AuthCompany = {
  nom?: string;
  name?: string;
  brandName?: string;
  slug?: string;
  logoUrl?: string;
  logo?: string;
};

type ReservationRow = Reservation & {
  status?: string;
  nomClient?: string;
  payment?: {
    status?: string;
    provider?: string;
    validationLevel?: string;
    parsed?: { amount?: number; transactionId?: string };
    totalAmount?: number;
  };
  ticketValidatedAt?: unknown;
  canonical?: CanonicalReservationDocument;
};

type AccountRow = {
  id: string;
  agencyId: string | null;
  accountType: string;
  accountName: string;
  currentBalance: number;
  currency: string;
};

type PaymentHistoryRow = {
  id: string;
  reservationId: string;
  agencyId: string;
  amount: number;
  currency: string;
  provider: string;
  status: string;
  ledgerStatus: string;
  validatedAt: unknown;
  createdAt: unknown;
  rejectionReason: string | null;
};

type TransferRow = {
  id: string;
  amount: number;
  currency: string;
  referenceId: string;
  performedAt: unknown;
  sourceLabel: string;
  destinationLabel: string;
  documentId: string | null;
  documentNumber: string | null;
  documentStatus: FinancialDocumentStatus | null;
};

const PENDING_LIMIT = 80;
const HISTORY_LIMIT = 700;
const TRANSFER_LIMIT = 300;
const DOC_LIMIT = 900;

const normalize = (v: unknown): string =>
  String(v ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

const toMillis = (v: unknown): number => {
  if (v instanceof Timestamp) return v.toMillis();
  if (v instanceof Date) return v.getTime();
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  if (typeof v === "string") {
    const parsed = Date.parse(v);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  if (v && typeof v === "object" && "seconds" in (v as Record<string, unknown>)) {
    const sec = Number((v as { seconds?: unknown }).seconds ?? 0);
    return Number.isFinite(sec) ? sec * 1000 : 0;
  }
  return 0;
};

const formatDateTime = (v: unknown): string => {
  const ms = toMillis(v);
  if (!ms) return "—";
  return new Date(ms).toLocaleString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const isToday = (v: unknown): boolean => {
  const ms = toMillis(v);
  if (!ms) return false;
  const d = new Date(ms);
  const n = new Date();
  return d.getDate() === n.getDate() && d.getMonth() === n.getMonth() && d.getFullYear() === n.getFullYear();
};

const inCurrentMonth = (v: unknown): boolean => {
  const ms = toMillis(v);
  if (!ms) return false;
  const d = new Date(ms);
  const n = new Date();
  return d.getMonth() === n.getMonth() && d.getFullYear() === n.getFullYear();
};

const inDateFilter = (v: unknown, filter: DateFilter): boolean => {
  if (filter === "all") return true;
  if (filter === "today") return isToday(v);
  const ms = toMillis(v);
  if (!ms) return false;
  const limitDays = filter === "7d" ? 7 : 30;
  const min = new Date();
  min.setDate(min.getDate() - limitDays);
  return ms >= min.getTime();
};

const providerFrom = (v: unknown): Provider => {
  const n = normalize(v);
  if (n.includes("orange")) return "orange";
  if (n.includes("moov")) return "moov";
  if (n.includes("wave")) return "wave";
  if (n.includes("sarali")) return "sarali";
  return "other";
};

const providerLabel = (p: Provider): string => {
  if (p === "orange") return "Orange Money";
  if (p === "moov") return "Moov Money";
  if (p === "wave") return "Wave";
  if (p === "sarali") return "Sarali";
  return "Autre wallet";
};

const providerBadge = (p: Provider): string => {
  if (p === "orange") return "bg-orange-100 text-orange-700 border-orange-200";
  if (p === "moov") return "bg-blue-100 text-blue-700 border-blue-200";
  if (p === "wave") return "bg-cyan-100 text-cyan-700 border-cyan-200";
  if (p === "sarali") return "bg-lime-100 text-lime-700 border-lime-200";
  return "bg-gray-100 text-gray-700 border-gray-200";
};

const inputDate = (): string => {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

const newId = (): string => {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `mobile_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
};

const proofUrl = (r: ReservationRow): string | null =>
  r.preuveUrl ?? r.paymentProofUrl ?? r.paiementPreuveUrl ?? r.proofUrl ?? r.receiptUrl ?? null;

const isImage = (url: string | null): boolean => !!url && /\.(png|jpe?g|gif|webp|bmp|svg)(\?.*)?$/i.test(url);

const getCanonicalReservation = (row: ReservationRow): CanonicalReservationDocument =>
  row.canonical ?? normalizeReservationDocument(row as unknown as Record<string, unknown>, { id: row.id });

const billetUrl = (r: ReservationRow, slugFallback?: string): string => {
  if (!r.id || typeof window === "undefined") return "";
  const slug = slugFallback || r.companySlug || "";
  if (!slug) return "";
  const origin = window.location.origin;
  const hostname = window.location.hostname;
  if (hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]") {
    return `${origin}/${slug}/reservation/${r.id}`;
  }
  if (hostname.includes(".")) {
    const root = hostname.split(".").slice(1).join(".");
    const proto = window.location.protocol.replace(":", "");
    return `${proto}://${slug}.${root}/reservation/${r.id}`;
  }
  return `${origin}/${slug}/reservation/${r.id}`;
};

const whatsappPhone = (v: string): string => v.replace(/\D/g, "");

const getPaymentInfo = (r: ReservationRow) => {
  const canonical = getCanonicalReservation(r);
  const pay = r.payment ?? {};
  return {
    status: canonical.payment.status,
    digitalValidationStatus: canonical.payment.digitalValidationStatus,
    provider: providerFrom(canonical.payment.walletProvider ?? pay.provider ?? r.paymentMethodLabel ?? ""),
    validationLevel: normalize(canonical.onlinePayment?.validationLevel ?? pay.validationLevel) || "unknown",
    detectedAmount:
      canonical.onlinePayment?.parsedAmount ??
      (typeof pay.parsed?.amount === "number" ? pay.parsed.amount : typeof pay.totalAmount === "number" ? pay.totalAmount : null),
    txRef:
      canonical.payment.reference ??
      (typeof pay.parsed?.transactionId === "string" ? pay.parsed.transactionId : r.paymentReference || r.referenceCode || ""),
  };
};

const DigitalCashReservationsPage: React.FC = () => {
  const { user, company, logout } = useAuth() as { user?: AuthUser; company?: AuthCompany; logout: () => Promise<void> };
  const navigate = useNavigate();
  const theme = useCompanyTheme(company as any) || { primary: "#FF6600", secondary: "#F97316" };
  const [darkMode, toggleDarkMode] = useAgencyDarkMode();

  const companyId = user?.companyId ?? "";

  const [tab, setTab] = useState<Tab>("to_process");
  const [agencies, setAgencies] = useState<Record<string, string>>({});
  const [companyBanks, setCompanyBanks] = useState<Record<string, string>>({});

  const [pendingReservations, setPendingReservations] = useState<ReservationRow[]>([]);
  const [payments, setPayments] = useState<PaymentHistoryRow[]>([]);
  const [transfers, setTransfers] = useState<TransferRow[]>([]);
  const [accounts, setAccounts] = useState<AccountRow[]>([]);

  const [loadingPending, setLoadingPending] = useState(true);
  const [loadingSecondary, setLoadingSecondary] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [processingId, setProcessingId] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [agencyFilter, setAgencyFilter] = useState("");
  const [providerFilter, setProviderFilter] = useState<Provider>("all");
  const [dateFilter, setDateFilter] = useState<DateFilter>("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "pending" | "review">("all");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const [transferFilter, setTransferFilter] = useState<TransferStateFilter>("all");
  const [historyType, setHistoryType] = useState<HistoryType>("all");
  const [historyDateFilter, setHistoryDateFilter] = useState<DateFilter>("30d");
  const [historySearch, setHistorySearch] = useState("");

  const [sourceWalletId, setSourceWalletId] = useState("");
  const [destinationBankId, setDestinationBankId] = useState("");
  const [transferAmount, setTransferAmount] = useState("");
  const [transferDate, setTransferDate] = useState(inputDate());
  const [transferReference, setTransferReference] = useState("");
  const [bankAgencyName, setBankAgencyName] = useState("");
  const [transferObservation, setTransferObservation] = useState("");
  const [manualPiece, setManualPiece] = useState(false);
  const [submittingTransfer, setSubmittingTransfer] = useState(false);
  const [lastDocument, setLastDocument] = useState<{ id: string; number: string; status: FinancialDocumentStatus } | null>(null);

  const walletAccounts = useMemo(
    () => accounts.filter((a) => a.accountType === "company_mobile_money" || a.accountType === "mobile_money"),
    [accounts]
  );
  const bankAccounts = useMemo(() => accounts.filter((a) => a.accountType === "company_bank"), [accounts]);

  const accountById = useMemo(() => {
    const map = new Map<string, AccountRow>();
    accounts.forEach((row) => map.set(row.id, row));
    return map;
  }, [accounts]);

  useEffect(() => {
    if (!sourceWalletId && walletAccounts.length > 0) setSourceWalletId(walletAccounts[0].id);
  }, [sourceWalletId, walletAccounts]);

  useEffect(() => {
    if (!destinationBankId && bankAccounts.length > 0) setDestinationBankId(bankAccounts[0].id);
  }, [destinationBankId, bankAccounts]);

  useEffect(() => {
    if (!companyId) return;
    const loadRefs = async () => {
      try {
        const [agencySnap, bankSnap] = await Promise.all([
          getDocs(collection(db, "companies", companyId, "agences")),
          getDocs(collection(db, "companies", companyId, "companyBanks")),
        ]);

        const agencyMap: Record<string, string> = {};
        agencySnap.forEach((d) => {
          const data = d.data() as { nom?: string; nomAgence?: string; name?: string; ville?: string };
          agencyMap[d.id] = data.nom ?? data.nomAgence ?? data.name ?? data.ville ?? d.id;
        });
        setAgencies(agencyMap);

        const bankMap: Record<string, string> = {};
        bankSnap.forEach((d) => {
          const data = d.data() as { name?: string; isActive?: boolean };
          if (data.isActive === false) return;
          bankMap[d.id] = data.name ?? d.id;
        });
        setCompanyBanks(bankMap);
      } catch (error) {
        console.error("[DigitalCash] loadRefs", error);
        toast.error("Impossible de charger agences et banques.");
      }
    };
    void loadRefs();
  }, [companyId]);

  useEffect(() => {
    if (!companyId) {
      setPendingReservations([]);
      setLoadingPending(false);
      return;
    }

    setLoadingPending(true);
    const unsubs: Array<() => void> = [];
    const byAgency = new Map<string, ReservationRow[]>();

    const rebuild = () => {
      const merged = Array.from(byAgency.values()).flat();
      const unique = new Map<string, ReservationRow>();
      merged.forEach((row) => unique.set(`${row.agencyId}_${row.id ?? ""}`, row));
      setPendingReservations(Array.from(unique.values()).sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt)));
    };

    const start = async () => {
      try {
        const agencySnap = await getDocs(collection(db, "companies", companyId, "agences"));
        if (agencySnap.empty) {
          setLoadingPending(false);
          return;
        }
        agencySnap.docs.forEach((agencyDoc) => {
          const agencyId = agencyDoc.id;
          const q = query(
            collection(db, "companies", companyId, "agences", agencyId, "reservations"),
            where("status", "==", "payé"),
            orderBy("createdAt", "desc"),
            limit(PENDING_LIMIT)
          );
          const stop = onSnapshot(
            q,
            (snap) => {
              const rows = snap.docs
                .map((reservationDoc) => {
                  const data = reservationDoc.data() as Record<string, unknown>;
                  const canonical = normalizeReservationDocument(data, { id: reservationDoc.id });
                  const row: ReservationRow = {
                    ...(data as unknown as Partial<ReservationRow>),
                    id: reservationDoc.id,
                    companyId: String(data.companyId ?? companyId),
                    agencyId: String(data.agencyId ?? agencyId),
                    statut: String(data.statut ?? "en_attente") as Reservation["statut"],
                    clientNom: String(data.nomClient ?? data.clientNom ?? ""),
                    createdAt: data.createdAt ?? Timestamp.now(),
                    canonical,
                  };
                  return row;
                })
                .filter((row) => isCanonicalPendingOnlineReview(getCanonicalReservation(row)));

              byAgency.set(agencyId, rows);
              rebuild();
              setLoadingPending(false);
            },
            (error) => {
              console.error("[DigitalCash] pending listener", error);
              toast.error("Impossible de suivre les paiements en attente.");
            }
          );
          unsubs.push(stop);
        });
      } catch (error) {
        console.error("[DigitalCash] pending init", error);
        setLoadingPending(false);
        toast.error("Chargement des paiements en attente impossible.");
      }
    };

    void start();
    return () => unsubs.forEach((u) => u());
  }, [companyId]);

  const refreshSecondary = useCallback(async () => {
    if (!companyId) {
      setPayments([]);
      setTransfers([]);
      setAccounts([]);
      setLoadingSecondary(false);
      return;
    }
    setLoadingSecondary(true);
    try {
      const [accountsRows, paymentsSnap, transfersSnap, docs] = await Promise.all([
        listAccounts(companyId),
        getDocs(query(collection(db, "companies", companyId, "payments"), where("channel", "==", "online"), limit(HISTORY_LIMIT))),
        getDocs(query(collection(db, "companies", companyId, "financialTransactions"), where("referenceType", "==", "mobile_to_bank"), limit(TRANSFER_LIMIT))),
        listFinancialDocuments({ companyId, limitCount: DOC_LIMIT, filters: { documentType: "bank_deposit_slip" } }),
      ]);

      setAccounts(accountsRows);

      const payRows: PaymentHistoryRow[] = paymentsSnap.docs
        .map((d) => {
          const data = d.data() as Record<string, unknown>;
          return {
            id: d.id,
            reservationId: String(data.reservationId ?? ""),
            agencyId: String(data.agencyId ?? ""),
            amount: Number(data.amount ?? 0),
            currency: String(data.currency ?? "XOF"),
            provider: String(data.provider ?? ""),
            status: String(data.status ?? ""),
            ledgerStatus: String(data.ledgerStatus ?? "pending"),
            validatedAt: data.validatedAt ?? null,
            createdAt: data.createdAt ?? null,
            rejectionReason: typeof data.rejectionReason === "string" && data.rejectionReason.trim().length > 0 ? data.rejectionReason : null,
          };
        })
        .sort((a, b) => (toMillis(b.validatedAt) || toMillis(b.createdAt)) - (toMillis(a.validatedAt) || toMillis(a.createdAt)));
      setPayments(payRows);

      const docBySource = new Map<string, { id: string; number: string; status: FinancialDocumentStatus; createdAt: unknown }>();
      docs
        .filter((r) => r.documentType === "bank_deposit_slip" && normalize(r.details?.natureFonds ?? "").includes("mobile"))
        .forEach((r) => {
          const current = docBySource.get(r.sourceId);
          if (!current || toMillis(r.createdAt) > toMillis(current.createdAt)) {
            docBySource.set(r.sourceId, { id: r.id, number: r.documentNumber, status: r.status, createdAt: r.createdAt });
          }
        });

      const transferRows: TransferRow[] = transfersSnap.docs
        .map((d) => {
          const data = d.data() as Record<string, unknown>;
          const meta = (data.metadata ?? {}) as Record<string, unknown>;
          const sourceId = typeof meta.fromAccountId === "string" ? meta.fromAccountId : "";
          const destinationId = typeof meta.toAccountId === "string" ? meta.toAccountId : "";
          const ref = String(data.referenceId ?? d.id);
          const linked = docBySource.get(ref);
          return {
            id: d.id,
            amount: Number(data.amount ?? 0),
            currency: String(data.currency ?? "XOF"),
            referenceId: ref,
            performedAt: data.performedAt ?? data.createdAt ?? null,
            sourceLabel: sourceId ? accountById.get(sourceId)?.accountName ?? sourceId : "Wallet mobile",
            destinationLabel: destinationId ? accountById.get(destinationId)?.accountName ?? destinationId : "Banque",
            documentId: linked?.id ?? null,
            documentNumber: linked?.number ?? null,
            documentStatus: linked?.status ?? null,
          };
        })
        .sort((a, b) => toMillis(b.performedAt) - toMillis(a.performedAt));

      setTransfers(transferRows);
    } catch (error) {
      console.error("[DigitalCash] refreshSecondary", error);
      toast.error("Chargement soldes / transferts / historique impossible.");
    } finally {
      setLoadingSecondary(false);
      setRefreshing(false);
    }
  }, [accountById, companyId]);

  useEffect(() => {
    void refreshSecondary();
  }, [refreshSecondary]);

  const handleRefresh = () => {
    setRefreshing(true);
    void refreshSecondary();
  };

  const toggleCard = (id: string) => setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));

  const handleValidate = async (row: ReservationRow) => {
    if (!companyId || !row.agencyId || !row.id || !user?.uid) return;
    setProcessingId(row.id);
    try {
      const reservationRef = doc(db, "companies", companyId, "agences", row.agencyId, "reservations", row.id);
      const snap = await getDoc(reservationRef);
      if (!snap.exists()) {
        toast.error("Réservation introuvable.");
        return;
      }
      const data = snap.data() as Record<string, unknown>;
      const ensured = await ensurePendingOnlinePaymentFromReservation({
        companyId,
        agencyId: row.agencyId,
        reservationId: row.id,
        montant: Number(data.montant ?? row.montant ?? 0),
        paymentMethodLabel: String(
          row.canonical?.raw.legacyWalletProvider ??
            row.canonical?.payment.walletProvider ??
            data.preuveVia ??
            data.paymentMethod ??
            data.paiement ??
            row.paymentMethodLabel ??
            ""
        ),
      });
      if (!ensured.ok) {
        toast.error(ensured.error ?? "Préparation paiement impossible.");
        return;
      }
      const payment = await getPaymentByReservationId(companyId, row.id);
      if (!payment || payment.status !== "pending") {
        toast.error("Aucun paiement pending pour cette réservation.");
        return;
      }
      await validatePendingOnlinePaymentAndSyncReservation(payment, companyId, { uid: user.uid, role: user.role ?? null });
      setPendingReservations((prev) => prev.filter((r) => !(r.id === row.id && r.agencyId === row.agencyId)));
      toast.success("Paiement validé.");
      void refreshSecondary();
    } catch (error) {
      console.error("[DigitalCash] handleValidate", error);
      toast.error("Validation impossible.");
    } finally {
      setProcessingId(null);
    }
  };

  const handleReject = async (row: ReservationRow) => {
    if (!companyId || !row.agencyId || !row.id || !user?.uid) return;
    setProcessingId(row.id);
    try {
      const ensured = await ensurePendingOnlinePaymentFromReservation({
        companyId,
        agencyId: row.agencyId,
        reservationId: row.id,
        montant: Number(row.montant ?? 0),
        paymentMethodLabel: String(
          row.canonical?.raw.legacyWalletProvider ??
            row.canonical?.payment.walletProvider ??
            row.paymentMethodLabel ??
            ""
        ),
      });
      if (!ensured.ok) {
        toast.error(ensured.error ?? "Préparation rejet impossible.");
        return;
      }
      const payment = await getPaymentByReservationId(companyId, row.id);
      if (!payment || payment.status !== "pending") {
        toast.error("Ce paiement n'est plus pending.");
        return;
      }
      await rejectPendingOnlinePaymentAndSyncReservation(payment, companyId, { uid: user.uid, role: user.role ?? null }, "À revoir opérateur digital");
      setPendingReservations((prev) => prev.filter((r) => !(r.id === row.id && r.agencyId === row.agencyId)));
      toast.success("Paiement rejeté / à revoir.");
      void refreshSecondary();
    } catch (error) {
      console.error("[DigitalCash] handleReject", error);
      toast.error("Rejet impossible.");
    } finally {
      setProcessingId(null);
    }
  };

  const handleCopyBillet = async (row: ReservationRow) => {
    const url = billetUrl(row, company?.slug);
    if (!url) {
      toast.error("Lien billet indisponible.");
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Lien billet copié.");
    } catch {
      toast.error("Impossible de copier le lien billet.");
    }
  };

  const handleWhatsapp = (row: ReservationRow) => {
    const phone = whatsappPhone(String(row.telephone ?? ""));
    if (!phone) {
      toast.error("Téléphone client manquant.");
      return;
    }
    const url = billetUrl(row, company?.slug);
    const msg = [
      `Bonjour ${row.clientNom ?? ""},`,
      `Votre réservation ${row.referenceCode ?? ""} est suivie par l'opérateur digital.`,
      `Trajet: ${row.depart ?? "—"} -> ${row.arrivee ?? "—"}`,
      url ? `Billet: ${url}` : "",
    ]
      .filter(Boolean)
      .join("\n");
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(msg)}`, "_blank", "noopener,noreferrer");
  };

  const handleSubmitTransfer = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!companyId || !user?.uid) return;
    if (!sourceWalletId || !destinationBankId) {
      toast.error("Sélectionnez wallet source et banque destination.");
      return;
    }
    const amount = Number(transferAmount.replace(",", "."));
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error("Montant transféré invalide.");
      return;
    }

    const source = accountById.get(sourceWalletId);
    const destination = accountById.get(destinationBankId);
    const operationRef = transferReference.trim() || newId();
    const actorName = String(user.displayName ?? user.email ?? user.uid).trim() || user.uid;
    const actorRole = Array.isArray(user.role)
      ? String(user.role[0] ?? "").trim() || "operator_digital"
      : String(user.role ?? "").trim() || "operator_digital";

    setSubmittingTransfer(true);
    try {
      await mobileToBankTransfer({
        companyId,
        mobileMoneyAccountId: sourceWalletId,
        companyBankAccountId: destinationBankId,
        amount,
        currency: source?.currency ?? "XOF",
        performedBy: user.uid,
        performedByRole: actorRole,
        idempotencyKey: operationRef,
        description: transferObservation.trim() || "Transfert mobile money vers banque",
      });

      const docResult = await upsertBankDepositDocument({
        companyId,
        sourceId: operationRef,
        agencyId: source?.agencyId ?? null,
        compteSourceLibelle: source?.accountName ?? sourceWalletId,
        banqueNom: destination?.accountName ?? destinationBankId,
        agenceBancaireNom: bankAgencyName.trim() || null,
        referenceDepotBancaire: operationRef,
        montantVerse: amount,
        devise: source?.currency ?? "XOF",
        natureFonds: "mobile_money",
        motifVersement: transferObservation.trim() || "Transfert mobile money vers banque",
        initiateur: { uid: user.uid, name: actorName, role: actorRole, phone: user.phone ?? null },
        executant: { uid: user.uid, name: actorName, role: actorRole, phone: user.phone ?? null },
        commentaire: transferObservation.trim() || null,
        preuveJointeDisponible: manualPiece,
        nombrePiecesJointes: manualPiece ? 1 : 0,
        dateCreation: new Date(),
        dateExecution: new Date(`${transferDate}T08:00:00`),
        status: "ready_to_print",
        createdByUid: user.uid,
      });

      setLastDocument({ id: docResult.id, number: docResult.documentNumber, status: docResult.status });
      setTransferAmount("");
      setTransferReference("");
      setBankAgencyName("");
      setTransferObservation("");
      setManualPiece(false);

      toast.success("Transfert mobile money vers banque enregistré.");
      void refreshSecondary();
    } catch (error) {
      console.error("[DigitalCash] handleSubmitTransfer", error);
      toast.error(error instanceof Error ? error.message : "Transfert impossible.");
    } finally {
      setSubmittingTransfer(false);
    }
  };

  const filteredPending = useMemo(() => {
    const term = normalize(search);
    return pendingReservations.filter((r) => {
      const p = getPaymentInfo(r);
      if (agencyFilter && r.agencyId !== agencyFilter) return false;
      if (providerFilter !== "all" && p.provider !== providerFilter) return false;
      if (!inDateFilter(r.createdAt, dateFilter)) return false;
      const isReview =
        p.validationLevel === "suspicious" ||
        p.status === "rejected" ||
        p.digitalValidationStatus === "rejected";
      if (statusFilter === "review" && !isReview) return false;
      if (statusFilter === "pending" && isReview) return false;
      if (term) {
        const searchable = normalize(`${r.clientNom ?? ""} ${r.telephone ?? ""} ${r.referenceCode ?? ""} ${r.depart ?? ""} ${r.arrivee ?? ""} ${p.txRef ?? ""}`);
        if (!searchable.includes(term)) return false;
      }
      return true;
    });
  }, [agencyFilter, dateFilter, pendingReservations, providerFilter, search, statusFilter]);

  const reviewRows = useMemo(
    () => payments.filter((p) => normalize(p.status) === "rejected").filter((p) => (!agencyFilter ? true : p.agencyId === agencyFilter)),
    [agencyFilter, payments]
  );

  const transferRows = useMemo(() => {
    return transfers.filter((t) => {
      if (!inDateFilter(t.performedAt, historyDateFilter)) return false;
      const confirmed = t.documentStatus === "signed" || t.documentStatus === "archived";
      if (transferFilter === "confirmed" && !confirmed) return false;
      if (transferFilter === "non_confirmed" && confirmed) return false;
      const term = normalize(historySearch);
      if (!term) return true;
      return normalize(`${t.referenceId} ${t.sourceLabel} ${t.destinationLabel} ${t.documentNumber ?? ""}`).includes(term);
    });
  }, [historyDateFilter, historySearch, transferFilter, transfers]);

  const summary = useMemo(() => {
    const validated = payments.filter((p) => normalize(p.status) === "validated");
    const validatedToday = validated.filter((p) => isToday(p.validatedAt || p.createdAt));
    const validatedMonth = validated.filter((p) => inCurrentMonth(p.validatedAt || p.createdAt));
    const walletsTotal = walletAccounts.reduce((sum, w) => sum + Number(w.currentBalance ?? 0), 0);

    const byProvider: Record<Provider, number> = { all: 0, orange: 0, moov: 0, wave: 0, sarali: 0, other: 0 };
    walletAccounts.forEach((w) => {
      const provider = providerFrom(w.accountName || w.id);
      byProvider[provider] += Number(w.currentBalance ?? 0);
      byProvider.all += Number(w.currentBalance ?? 0);
    });

    const unconfirmedTransfers = transfers.filter((t) => !(t.documentStatus === "signed" || t.documentStatus === "archived"));

    return {
      pendingCount: pendingReservations.length,
      rejectedCount: reviewRows.length,
      validatedTodayCount: validatedToday.length,
      validatedTodayAmount: validatedToday.reduce((sum, p) => sum + p.amount, 0),
      validatedMonthAmount: validatedMonth.reduce((sum, p) => sum + p.amount, 0),
      walletsTotal,
      byProvider,
      unconfirmedTransfers: unconfirmedTransfers.length,
    };
  }, [payments, pendingReservations.length, reviewRows.length, transfers, walletAccounts]);

  const historyRows = useMemo(() => {
    const items: Array<{
      id: string;
      type: "validation" | "rejet" | "transfert";
      amount: number;
      currency: string;
      date: unknown;
      title: string;
      subtitle: string;
      status: string;
      ref: string;
    }> = [];

    payments.forEach((p) => {
      const st = normalize(p.status);
      if (st !== "validated" && st !== "rejected") return;
      items.push({
        id: `pay_${p.id}`,
        type: st === "validated" ? "validation" : "rejet",
        amount: p.amount,
        currency: p.currency,
        date: p.validatedAt || p.createdAt,
        title: st === "validated" ? "Validation mobile money" : "Rejet / à revoir",
        subtitle: `Réservation ${p.reservationId || "—"}`,
        status: st === "validated" ? `Ledger ${p.ledgerStatus}` : p.rejectionReason || "Rejet opérateur",
        ref: p.id,
      });
    });

    transfers.forEach((t) => {
      items.push({
        id: `tr_${t.id}`,
        type: "transfert",
        amount: t.amount,
        currency: t.currency,
        date: t.performedAt,
        title: "Transfert wallet vers banque",
        subtitle: `${t.sourceLabel} -> ${t.destinationLabel}`,
        status: t.documentStatus ? `Document ${t.documentStatus}` : "Document à contrôler",
        ref: t.referenceId,
      });
    });

    const term = normalize(historySearch);
    return items
      .filter((it) => (historyType === "all" ? true : it.type === historyType))
      .filter((it) => inDateFilter(it.date, historyDateFilter))
      .filter((it) => (term ? normalize(`${it.title} ${it.subtitle} ${it.status} ${it.ref}`).includes(term) : true))
      .sort((a, b) => toMillis(b.date) - toMillis(a.date));
  }, [historyDateFilter, historySearch, historyType, payments, transfers]);

  const roleTokens = useMemo(() => {
    if (Array.isArray(user?.role)) return user.role.map((r) => normalize(r)).filter(Boolean);
    return String(user?.role ?? "")
      .split(",")
      .map((r) => normalize(r))
      .filter(Boolean);
  }, [user?.role]);

  const canOpenPrint = useMemo(
    () => roleTokens.some((r) => ["admin_compagnie", "admin_platforme", "company_accountant", "financial_director"].includes(r)),
    [roleTokens]
  );

  if (!companyId) return <div className="p-4 text-sm text-gray-600">Compagnie introuvable.</div>;

  const companyName = company?.nom || company?.name || company?.brandName || "Compagnie";
  const logo = company?.logoUrl || company?.logo || "";
  const userLabel = user?.displayName || user?.email || "Utilisateur";
  const roleLabel = roleTokens.includes("operator_digital") ? "Opérateur digital" : String(user?.role ?? "");

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 dark:bg-gray-950 dark:text-white">
      <header className="sticky top-0 z-20 border-b border-white/20" style={{ backgroundColor: theme.primary }}>
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-2 px-3 py-2">
          <div className="flex min-w-0 items-center gap-2">
            {logo ? (
              <img src={logo} alt={companyName} className="h-8 w-8 rounded-full border border-white/30 object-cover" />
            ) : (
              <div className="flex h-8 w-8 items-center justify-center rounded-full border border-white/30 bg-white/20 text-xs font-bold text-white">
                {companyName.slice(0, 1).toUpperCase()}
              </div>
            )}
            <div className="min-w-0">
              <div className="truncate text-sm font-bold text-white">{companyName}</div>
              <div className="truncate text-[11px] text-white/80">{userLabel} • {roleLabel}</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={toggleDarkMode} className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-white/30 bg-white/15 text-white">
              {darkMode ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
            <button
              type="button"
              className="inline-flex h-8 items-center gap-2 rounded-lg border border-white/30 bg-white/15 px-3 text-xs font-semibold text-white"
              onClick={async () => {
                try {
                  await logout();
                  navigate("/login");
                } catch (error) {
                  console.error("logout", error);
                }
              }}
            >
              <LogOut className="h-4 w-4" />
              <span className="hidden sm:inline">Déconnexion</span>
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-7xl flex-col gap-3 px-3 py-3">
        <section className="rounded-xl border border-gray-200 bg-white p-3 shadow-sm dark:border-gray-800 dark:bg-gray-900">
          <div className="mb-3 flex items-center justify-between gap-2">
            <div className="text-sm font-semibold">À traiter maintenant</div>
            <Button size="sm" variant="secondary" onClick={handleRefresh} disabled={refreshing}>
              <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} /> Actualiser
            </Button>
          </div>
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
            <button type="button" onClick={() => setTab("to_process")} className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-left">
              <div className="text-[11px] text-amber-700">Paiements en attente</div>
              <div className="text-lg font-bold text-amber-800">{summary.pendingCount}</div>
            </button>
            <button type="button" onClick={() => setTab("to_process")} className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-left">
              <div className="text-[11px] text-red-700">Rejetés / à revoir</div>
              <div className="text-lg font-bold text-red-800">{summary.rejectedCount}</div>
            </button>
            <button type="button" onClick={() => setTab("transfers")} className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-left">
              <div className="text-[11px] text-blue-700">Transferts non confirmés</div>
              <div className="text-lg font-bold text-blue-800">{summary.unconfirmedTransfers}</div>
            </button>
            <button type="button" onClick={() => setTab("wallets")} className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-left">
              <div className="text-[11px] text-emerald-700">Validés aujourd'hui</div>
              <div className="text-lg font-bold text-emerald-800">{summary.validatedTodayCount}</div>
            </button>
          </div>
        </section>

        <section className="rounded-xl border border-gray-200 bg-white p-2 shadow-sm dark:border-gray-800 dark:bg-gray-900">
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
            <button type="button" onClick={() => setTab("to_process")} className={`rounded-lg border px-3 py-2 text-sm font-semibold ${tab === "to_process" ? "border-orange-300 bg-orange-50 text-orange-700" : "border-gray-200 text-gray-700"}`}><Clock3 className="mr-1 inline h-4 w-4" />À traiter</button>
            <button type="button" onClick={() => setTab("wallets")} className={`rounded-lg border px-3 py-2 text-sm font-semibold ${tab === "wallets" ? "border-orange-300 bg-orange-50 text-orange-700" : "border-gray-200 text-gray-700"}`}><Wallet className="mr-1 inline h-4 w-4" />Soldes mobile money</button>
            <button type="button" onClick={() => setTab("transfers")} className={`rounded-lg border px-3 py-2 text-sm font-semibold ${tab === "transfers" ? "border-orange-300 bg-orange-50 text-orange-700" : "border-gray-200 text-gray-700"}`}><Building2 className="mr-1 inline h-4 w-4" />Transferts vers banque</button>
            <button type="button" onClick={() => setTab("history")} className={`rounded-lg border px-3 py-2 text-sm font-semibold ${tab === "history" ? "border-orange-300 bg-orange-50 text-orange-700" : "border-gray-200 text-gray-700"}`}><History className="mr-1 inline h-4 w-4" />Historique</button>
          </div>
        </section>

        {tab === "to_process" && (
          <section className="rounded-xl border border-gray-200 bg-white p-3 shadow-sm dark:border-gray-800 dark:bg-gray-900">
            <div className="mb-3 grid grid-cols-1 gap-2 md:grid-cols-5">
              <label className="relative md:col-span-2">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Rechercher client, téléphone, référence" className="h-10 w-full rounded-lg border border-gray-200 bg-white pl-10 pr-3 text-sm dark:border-gray-700 dark:bg-gray-900" />
              </label>
              <select value={agencyFilter} onChange={(e) => setAgencyFilter(e.target.value)} className="h-10 rounded-lg border border-gray-200 bg-white px-3 text-sm dark:border-gray-700 dark:bg-gray-900">
                <option value="">Toutes agences</option>
                {Object.entries(agencies).map(([id, name]) => <option key={id} value={id}>{name}</option>)}
              </select>
              <div className="grid grid-cols-2 gap-2 md:col-span-2">
                <select value={providerFilter} onChange={(e) => setProviderFilter(e.target.value as Provider)} className="h-10 rounded-lg border border-gray-200 bg-white px-3 text-sm dark:border-gray-700 dark:bg-gray-900">
                  <option value="all">Tous opérateurs</option>
                  <option value="orange">Orange</option>
                  <option value="moov">Moov</option>
                  <option value="wave">Wave</option>
                  <option value="sarali">Sarali</option>
                  <option value="other">Autres</option>
                </select>
                <select value={dateFilter} onChange={(e) => setDateFilter(e.target.value as DateFilter)} className="h-10 rounded-lg border border-gray-200 bg-white px-3 text-sm dark:border-gray-700 dark:bg-gray-900">
                  <option value="all">Toutes dates</option>
                  <option value="today">Aujourd'hui</option>
                  <option value="7d">7 jours</option>
                  <option value="30d">30 jours</option>
                </select>
                <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as "all" | "pending" | "review")} className="h-10 rounded-lg border border-gray-200 bg-white px-3 text-sm dark:border-gray-700 dark:bg-gray-900">
                  <option value="all">Tous statuts</option>
                  <option value="pending">En attente</option>
                  <option value="review">À revoir</option>
                </select>
              </div>
            </div>

            {loadingPending ? (
              <div className="rounded-lg border border-dashed border-gray-300 px-3 py-8 text-center text-sm text-gray-500">Chargement des paiements en attente...</div>
            ) : filteredPending.length === 0 ? (
              <div className="rounded-lg border border-dashed border-gray-300 px-3 py-8 text-center text-sm text-gray-500">Aucun paiement en attente pour ces filtres.</div>
            ) : (
              <div className="space-y-3">
                {filteredPending.map((row) => {
                  const cardId = `${row.agencyId}_${row.id ?? ""}`;
                  const isOpen = Boolean(expanded[cardId]);
                  const canonical = getCanonicalReservation(row);
                  const p = getPaymentInfo(row);
                  const proof = proofUrl(row);
                  const isBusy = processingId === row.id;
                  return (
                    <article key={cardId} className="rounded-xl border border-gray-200 bg-gray-50 p-3 dark:border-gray-700 dark:bg-gray-900">
                      <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <div className="text-sm font-semibold">{row.clientNom || "Client"}</div>
                          <div className="text-xs text-gray-500">{agencies[row.agencyId] ?? row.agencyId} • {row.telephone || "—"}</div>
                        </div>
                        <div className="flex items-center gap-1">
                          <span className={`rounded-full border px-2 py-0.5 text-[11px] ${providerBadge(p.provider)}`}>{providerLabel(p.provider)}</span>
                          <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] text-amber-700">{p.status === "pending" ? "En attente" : "À vérifier"}</span>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 gap-1 text-xs text-gray-700 dark:text-gray-200 sm:grid-cols-2">
                        <div><span className="font-medium">Service:</span> {row.depart || "—"} {"→"} {row.arrivee || "—"}</div>
                        <div><span className="font-medium">Montant attendu:</span> {formatCurrency(Number(row.montant ?? 0), "XOF")}</div>
                        <div><span className="font-medium">Montant détecté:</span> {p.detectedAmount != null ? formatCurrency(p.detectedAmount, "XOF") : "—"}</div>
                        <div><span className="font-medium">Référence transaction:</span> {p.txRef || "—"}</div>
                        <div><span className="font-medium">Fiabilité:</span> {p.validationLevel === "valid" ? "Fiable" : p.validationLevel === "suspicious" ? "Suspect" : p.validationLevel === "invalid" ? "Invalide" : "Non définie"}</div>
                        <div><span className="font-medium">Date / heure:</span> {formatDateTime(row.createdAt)}</div>
                      </div>

                      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
                        <Button size="sm" variant="secondary" onClick={() => toggleCard(cardId)}><Eye className="h-4 w-4" />Voir preuve</Button>
                        <Button size="sm" variant="primary" disabled={isBusy} onClick={() => void handleValidate(row)}><CheckCircle2 className="h-4 w-4" />{isBusy ? "Validation..." : "Valider"}</Button>
                        <Button size="sm" variant="danger" disabled={isBusy} onClick={() => void handleReject(row)}><XCircle className="h-4 w-4" />Rejeter / à revoir</Button>
                        <Button size="sm" variant="secondary" onClick={() => void handleCopyBillet(row)}><Copy className="h-4 w-4" />Copier lien billet</Button>
                        <Button size="sm" variant="secondary" onClick={() => handleWhatsapp(row)}><MessageCircle className="h-4 w-4" />Ouvrir WhatsApp</Button>
                        <Button size="sm" variant="secondary" onClick={() => toggleCard(cardId)}>Détails</Button>
                      </div>

                      {isOpen && (
                        <div className="mt-3 space-y-2 rounded-lg border border-gray-200 bg-white p-2 dark:border-gray-700 dark:bg-gray-950">
                          {proof ? (
                            isImage(proof) ? <img src={proof} alt="Preuve" className="max-h-64 w-full rounded-md border border-gray-200 object-contain dark:border-gray-700" /> : <a href={proof} target="_blank" rel="noopener noreferrer" className="inline-flex w-full items-center justify-center rounded-lg bg-orange-600 px-3 py-2 text-sm font-semibold text-white">Ouvrir la preuve</a>
                          ) : <div className="text-xs text-gray-500">Aucune preuve jointe.</div>}
                          {(canonical.onlinePayment?.proofMessage ?? row.preuveMessage) ? (
                            <div className="rounded-md bg-gray-50 p-2 text-xs text-gray-700 dark:bg-gray-900 dark:text-gray-200">
                              {canonical.onlinePayment?.proofMessage ?? row.preuveMessage}
                            </div>
                          ) : null}
                        </div>
                      )}
                    </article>
                  );
                })}
              </div>
            )}

            <div className="mt-4">
              <div className="mb-2 text-sm font-semibold">Paiements rejetés / à revoir ({reviewRows.length})</div>
              {reviewRows.length === 0 ? (
                <div className="rounded-lg border border-dashed border-gray-300 px-3 py-4 text-center text-xs text-gray-500">Aucun rejet récent.</div>
              ) : (
                <div className="space-y-2">
                  {reviewRows.slice(0, 12).map((p) => (
                    <div key={p.id} className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
                      <div className="font-semibold">Paiement #{p.id}</div>
                      <div>Agence: {(agencies[p.agencyId] ?? p.agencyId) || "—"}</div>
                      <div>Montant: {formatCurrency(p.amount, p.currency)} • {providerLabel(providerFrom(p.provider))}</div>
                      <div>Motif: {p.rejectionReason || "À revoir opérateur digital"}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>
        )}

        {tab === "wallets" && (
          <section className="rounded-xl border border-gray-200 bg-white p-3 shadow-sm dark:border-gray-800 dark:bg-gray-900">
            {loadingSecondary ? (
              <div className="rounded-lg border border-dashed border-gray-300 px-3 py-8 text-center text-sm text-gray-500">Chargement des soldes...</div>
            ) : (
              <>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-5">
                  <div className="rounded-lg border border-gray-200 bg-gray-50 p-3"><div className="text-xs text-gray-500">Orange Money</div><div className="text-lg font-bold">{formatCurrency(summary.byProvider.orange, "XOF")}</div></div>
                  <div className="rounded-lg border border-gray-200 bg-gray-50 p-3"><div className="text-xs text-gray-500">Moov Money</div><div className="text-lg font-bold">{formatCurrency(summary.byProvider.moov, "XOF")}</div></div>
                  <div className="rounded-lg border border-gray-200 bg-gray-50 p-3"><div className="text-xs text-gray-500">Wave</div><div className="text-lg font-bold">{formatCurrency(summary.byProvider.wave, "XOF")}</div></div>
                  <div className="rounded-lg border border-gray-200 bg-gray-50 p-3"><div className="text-xs text-gray-500">Sarali</div><div className="text-lg font-bold">{formatCurrency(summary.byProvider.sarali, "XOF")}</div></div>
                  <div className="rounded-lg border border-gray-200 bg-gray-50 p-3"><div className="text-xs text-gray-500">Autres wallets</div><div className="text-lg font-bold">{formatCurrency(summary.byProvider.other, "XOF")}</div></div>
                </div>

                <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
                  <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3"><div className="text-xs text-emerald-700">Total mobile disponible</div><div className="text-lg font-bold text-emerald-800">{formatCurrency(summary.walletsTotal, "XOF")}</div></div>
                  <div className="rounded-lg border border-blue-200 bg-blue-50 p-3"><div className="text-xs text-blue-700">Validé aujourd'hui</div><div className="text-lg font-bold text-blue-800">{formatCurrency(summary.validatedTodayAmount, "XOF")}</div></div>
                  <div className="rounded-lg border border-indigo-200 bg-indigo-50 p-3"><div className="text-xs text-indigo-700">Validé ce mois</div><div className="text-lg font-bold text-indigo-800">{formatCurrency(summary.validatedMonthAmount, "XOF")}</div></div>
                  <div className="rounded-lg border border-amber-200 bg-amber-50 p-3"><div className="text-xs text-amber-700">Non transféré vers banque</div><div className="text-lg font-bold text-amber-800">{formatCurrency(summary.walletsTotal, "XOF")}</div></div>
                </div>

                <div className="mt-3 rounded-lg border border-gray-200">
                  <div className="border-b border-gray-200 px-3 py-2 text-xs font-semibold text-gray-600">Soldes réels par wallet</div>
                  <div className="divide-y divide-gray-100">
                    {walletAccounts.map((w) => (
                      <div key={w.id} className="flex items-center justify-between px-3 py-2 text-sm">
                        <div><div className="font-medium">{w.accountName || w.id}</div><div className="text-xs text-gray-500">{providerLabel(providerFrom(w.accountName || w.id))}</div></div>
                        <div className="font-semibold">{formatCurrency(w.currentBalance, w.currency)}</div>
                      </div>
                    ))}
                    {walletAccounts.length === 0 && <div className="px-3 py-4 text-center text-xs text-gray-500">Aucun wallet mobile money trouvé.</div>}
                  </div>
                </div>
              </>
            )}
          </section>
        )}

        {tab === "transfers" && (
          <section className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            <article className="rounded-xl border border-gray-200 bg-white p-3 shadow-sm dark:border-gray-800 dark:bg-gray-900">
              <div className="mb-3 text-sm font-semibold">Nouveau transfert mobile money {"→"} banque</div>
              <form onSubmit={handleSubmitTransfer} className="space-y-2">
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-600">Portefeuille source</label>
                  <select value={sourceWalletId} onChange={(e) => setSourceWalletId(e.target.value)} className="h-10 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm dark:border-gray-700 dark:bg-gray-900">
                    <option value="">Sélectionner</option>
                    {walletAccounts.map((w) => <option key={w.id} value={w.id}>{w.accountName || w.id} • {formatCurrency(w.currentBalance, w.currency)}</option>)}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-600">Banque destination</label>
                  <select value={destinationBankId} onChange={(e) => setDestinationBankId(e.target.value)} className="h-10 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm dark:border-gray-700 dark:bg-gray-900">
                    <option value="">Sélectionner</option>
                    {bankAccounts.map((b) => {
                      const bankName = b.id.startsWith("company_bank_") ? companyBanks[b.id.replace("company_bank_", "")] ?? b.accountName : b.accountName;
                      return <option key={b.id} value={b.id}>{bankName || b.id}</option>;
                    })}
                  </select>
                </div>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-gray-600">Montant transféré</label>
                    <input type="number" min={0} value={transferAmount} onChange={(e) => setTransferAmount(e.target.value)} className="h-10 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm dark:border-gray-700 dark:bg-gray-900" />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-gray-600">Date du transfert</label>
                    <input type="date" value={transferDate} onChange={(e) => setTransferDate(e.target.value)} className="h-10 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm dark:border-gray-700 dark:bg-gray-900" />
                  </div>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-600">Référence transfert / reçu</label>
                  <input type="text" value={transferReference} onChange={(e) => setTransferReference(e.target.value)} className="h-10 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm dark:border-gray-700 dark:bg-gray-900" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-600">Agence bancaire (optionnel)</label>
                  <input type="text" value={bankAgencyName} onChange={(e) => setBankAgencyName(e.target.value)} className="h-10 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm dark:border-gray-700 dark:bg-gray-900" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-600">Observation (optionnel)</label>
                  <textarea value={transferObservation} onChange={(e) => setTransferObservation(e.target.value)} className="min-h-[70px] w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-900" />
                </div>
                <label className="flex items-center gap-2 text-xs text-gray-600"><input type="checkbox" checked={manualPiece} onChange={(e) => setManualPiece(e.target.checked)} />Pièce manuelle / saisie après coup</label>
                <Button type="submit" size="sm" variant="primary" disabled={submittingTransfer}>{submittingTransfer ? "Enregistrement..." : "Enregistrer le transfert"}</Button>
              </form>

              {lastDocument && (
                <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800">
                  <div className="font-semibold">Bordereau généré</div>
                  <div>Numéro: {lastDocument.number}</div>
                  <div>Statut: {lastDocument.status}</div>
                  {canOpenPrint && <div className="mt-2"><Button size="sm" variant="secondary" onClick={() => navigate(`/compagnie/${companyId}/accounting/documents/${lastDocument.id}/print`)}>Voir / imprimer le bordereau</Button></div>}
                </div>
              )}
            </article>

            <article className="rounded-xl border border-gray-200 bg-white p-3 shadow-sm dark:border-gray-800 dark:bg-gray-900">
              <div className="mb-3 flex items-center justify-between gap-2">
                <div className="text-sm font-semibold">Transferts récents</div>
                <select value={transferFilter} onChange={(e) => setTransferFilter(e.target.value as TransferStateFilter)} className="h-9 rounded-lg border border-gray-200 bg-white px-3 text-xs dark:border-gray-700 dark:bg-gray-900">
                  <option value="all">Tous</option>
                  <option value="non_confirmed">Non confirmés</option>
                  <option value="confirmed">Confirmés</option>
                </select>
              </div>

              {loadingSecondary ? (
                <div className="rounded-lg border border-dashed border-gray-300 px-3 py-8 text-center text-sm text-gray-500">Chargement des transferts...</div>
              ) : transferRows.length === 0 ? (
                <div className="rounded-lg border border-dashed border-gray-300 px-3 py-8 text-center text-sm text-gray-500">Aucun transfert sur la période.</div>
              ) : (
                <div className="space-y-2">
                  {transferRows.slice(0, 25).map((t) => {
                    const confirmed = t.documentStatus === "signed" || t.documentStatus === "archived";
                    return (
                      <div key={t.id} className="rounded-lg border border-gray-200 bg-gray-50 p-2 text-xs">
                        <div className="flex items-center justify-between gap-2"><div className="font-semibold">{formatCurrency(t.amount, t.currency)}</div><span className={`rounded-full px-2 py-0.5 text-[11px] ${confirmed ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>{confirmed ? "Confirmé" : "Non confirmé"}</span></div>
                        <div className="mt-1 text-gray-600">{t.sourceLabel} {"→"} {t.destinationLabel}</div>
                        <div className="mt-1 text-gray-500">Référence: {t.referenceId}</div>
                        <div className="text-gray-500">Date: {formatDateTime(t.performedAt)}</div>
                        <div className="text-gray-500">Bordereau: {t.documentNumber ?? "non généré"}{t.documentStatus ? ` (${t.documentStatus})` : ""}</div>
                      </div>
                    );
                  })}
                </div>
              )}
            </article>
          </section>
        )}

        {tab === "history" && (
          <section className="rounded-xl border border-gray-200 bg-white p-3 shadow-sm dark:border-gray-800 dark:bg-gray-900">
            <div className="mb-3 grid grid-cols-1 gap-2 md:grid-cols-4">
              <label className="relative md:col-span-2"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" /><input value={historySearch} onChange={(e) => setHistorySearch(e.target.value)} placeholder="Recherche historique" className="h-10 w-full rounded-lg border border-gray-200 bg-white pl-10 pr-3 text-sm dark:border-gray-700 dark:bg-gray-900" /></label>
              <select value={historyType} onChange={(e) => setHistoryType(e.target.value as HistoryType)} className="h-10 rounded-lg border border-gray-200 bg-white px-3 text-sm dark:border-gray-700 dark:bg-gray-900"><option value="all">Tous types</option><option value="validation">Validations</option><option value="rejet">Rejets</option><option value="transfert">Transferts</option></select>
              <select value={historyDateFilter} onChange={(e) => setHistoryDateFilter(e.target.value as DateFilter)} className="h-10 rounded-lg border border-gray-200 bg-white px-3 text-sm dark:border-gray-700 dark:bg-gray-900"><option value="today">Aujourd'hui</option><option value="7d">7 jours</option><option value="30d">30 jours</option><option value="all">Toute période</option></select>
            </div>

            {loadingSecondary ? (
              <div className="rounded-lg border border-dashed border-gray-300 px-3 py-8 text-center text-sm text-gray-500">Chargement de l'historique...</div>
            ) : historyRows.length === 0 ? (
              <div className="rounded-lg border border-dashed border-gray-300 px-3 py-8 text-center text-sm text-gray-500">Aucun élément historique.</div>
            ) : (
              <div className="space-y-2">
                {historyRows.slice(0, 80).map((h) => (
                  <article key={h.id} className="rounded-lg border border-gray-200 bg-gray-50 p-2 text-xs">
                    <div className="flex flex-wrap items-center justify-between gap-2"><div className="font-semibold">{h.title}</div><div className="text-gray-500">{formatDateTime(h.date)}</div></div>
                    <div className="mt-1 text-gray-700">{h.subtitle}</div>
                    <div className="mt-1 text-gray-500">Référence: {h.ref}</div>
                    <div className="mt-1 text-gray-500">Statut: {h.status}</div>
                    <div className="mt-1 font-medium">{formatCurrency(h.amount, h.currency)}</div>
                  </article>
                ))}
              </div>
            )}
          </section>
        )}

        <footer className="pb-4 text-[11px] text-gray-500">
          <div className="rounded-lg border border-gray-200 bg-white px-3 py-2 dark:border-gray-800 dark:bg-gray-900">
            Espace limité au pilotage mobile money: validations, soldes wallet, transferts vers banque, historique.
            Aucun écran de caisse agence, dépenses locales ou comptabilité générale.
          </div>
        </footer>
      </main>
    </div>
  );
};

export default DigitalCashReservationsPage;

