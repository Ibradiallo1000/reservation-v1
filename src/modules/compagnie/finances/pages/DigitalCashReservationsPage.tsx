import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  collection,
  collectionGroup,
  doc,
  getDoc,
  getDocs,
  limit,
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
  Loader2,
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
  preuveMessage?: string;
  proofSubmittedAt?: unknown;
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
  if (p === "orange") return "bg-orange-100 text-orange-700 border-orange-200 dark:bg-orange-900/30 dark:text-orange-400 dark:border-orange-800";
  if (p === "moov") return "bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-800";
  if (p === "wave") return "bg-cyan-100 text-cyan-700 border-cyan-200 dark:bg-cyan-900/30 dark:text-cyan-400 dark:border-cyan-800";
  if (p === "sarali") return "bg-lime-100 text-lime-700 border-lime-200 dark:bg-lime-900/30 dark:text-lime-400 dark:border-lime-800";
  return "bg-gray-100 text-gray-700 border-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:border-gray-600";
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

// Fonction pour récupérer les preuves depuis publicReservations
const fetchPublicReservationsProofs = async (companyId: string): Promise<ReservationRow[]> => {
  try {
    const q = query(
      collection(db, "publicReservations"),
      where("companyId", "==", companyId),
      where("status", "==", "payé"),
      orderBy("proofSubmittedAt", "desc"),
      limit(PENDING_LIMIT)
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        companyId: data.companyId,
        agencyId: data.agencyId,
        statut: "payé",
        status: "payé",
        nomClient: data.nomClient || "Client",
        clientNom: data.nomClient || "Client",
        telephone: data.telephone || "",
        depart: data.depart || "",
        arrivee: data.arrivee || "",
        date: data.date || "",
        heure: data.heure || "",
        montant: data.montant || 0,
        seatsGo: data.seatsGo || 1,
        createdAt: data.proofSubmittedAt || data.createdAt || Timestamp.now(),
        preuveMessage: data.preuveMessage || "",
        payment: {
          status: "pending",
          provider: data.paymentMethod || data.preuveVia,
          parsed: { transactionId: data.transactionReference || data.paymentReference },
          totalAmount: data.montant || 0
        },
        canonical: normalizeReservationDocument(data, { id: doc.id })
      } as ReservationRow;
    });
  } catch (error) {
    console.error("Erreur chargement publicReservations", error);
    return [];
  }
};

// Délai pour éviter les rate limits
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

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

  // Chargement manuel - combine les réservations et les preuves publicReservations
  const loadPendingReservations = useCallback(async () => {
    if (!companyId) {
      setPendingReservations([]);
      setLoadingPending(false);
      return;
    }

    setLoadingPending(true);
    
    try {
      // 1. Charger les réservations normales
      const q = query(
        collectionGroup(db, "reservations"),
        where("companyId", "==", companyId),
        where("status", "==", "payé"),
        orderBy("createdAt", "desc"),
        limit(PENDING_LIMIT)
      );
      
      const snapshot = await getDocs(q);
      
      const reservationsRows = snapshot.docs.map((doc) => {
        const data = doc.data();
        const canonical = normalizeReservationDocument(data, { id: doc.id });
        return {
          id: doc.id,
          companyId: String(data.companyId ?? companyId),
          agencyId: String(data.agencyId ?? ""),
          statut: String(data.statut ?? "en_attente") as Reservation["statut"],
          clientNom: String(data.nomClient ?? data.clientNom ?? ""),
          createdAt: data.createdAt ?? Timestamp.now(),
          montant: Number(data.montant ?? 0),
          depart: String(data.depart ?? ""),
          arrivee: String(data.arrivee ?? ""),
          telephone: String(data.telephone ?? ""),
          preuveMessage: String(data.preuveMessage ?? ""),
          canonical,
        } as ReservationRow;
      }).filter((row) => isCanonicalPendingOnlineReview(getCanonicalReservation(row)));
      
      // 2. Charger les preuves depuis publicReservations
      const publicProofs = await fetchPublicReservationsProofs(companyId);
      
      // 3. Fusionner les deux sources (sans doublons)
      const allRows = [...reservationsRows];
      const existingIds = new Set(reservationsRows.map(r => r.id));
      
      for (const proof of publicProofs) {
        if (!existingIds.has(proof.id)) {
          allRows.push(proof);
          existingIds.add(proof.id);
        }
      }
      
      // 4. Trier par date
      allRows.sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt));
      
      setPendingReservations(allRows);
    } catch (error) {
      console.error("[DigitalCash] loadPendingReservations error", error);
      toast.error("Erreur de chargement des paiements");
    } finally {
      setLoadingPending(false);
    }
  }, [companyId]);

  // Chargement initial
  useEffect(() => {
    void loadPendingReservations();
  }, [loadPendingReservations]);

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
    Promise.all([loadPendingReservations(), refreshSecondary()]).finally(() => setRefreshing(false));
  };

  const toggleCard = (id: string) => setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));

  const handleValidate = async (row: ReservationRow) => {
    if (!companyId || !row.agencyId || !row.id || !user?.uid) {
      toast.error("Informations manquantes");
      return;
    }
    
    if (processingId) {
      toast.info("Une validation est déjà en cours");
      return;
    }
    
    setProcessingId(row.id);
    
    try {
      await delay(500);
      
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
        toast.error(ensured.error ?? "Préparation paiement impossible.");
        return;
      }
      
      const payment = await getPaymentByReservationId(companyId, row.id, { skipLegacyFallback: true });
      
      if (!payment) {
        toast.error("Aucun paiement trouvé pour cette réservation.");
        return;
      }
      
      if (payment.status !== "pending") {
        toast.info(`Ce paiement est déjà ${payment.status}.`);
        return;
      }
      
      await validatePendingOnlinePaymentAndSyncReservation(payment, companyId, { 
        uid: user.uid, 
        role: user.role ?? null 
      });
      
      await loadPendingReservations();
      toast.success("✅ Paiement validé avec succès !");
      void refreshSecondary();
      
    } catch (error: any) {
      console.error("[DigitalCash] handleValidate", error);
      toast.error(error?.message || "Validation impossible.");
    } finally {
      setProcessingId(null);
    }
  };

  const handleReject = async (row: ReservationRow) => {
    if (!companyId || !row.agencyId || !row.id || !user?.uid) {
      toast.error("Informations manquantes");
      return;
    }
    
    if (processingId) {
      toast.info("Une action est déjà en cours");
      return;
    }
    
    setProcessingId(row.id);
    
    try {
      await delay(500);
      
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
      
      const payment = await getPaymentByReservationId(companyId, row.id, { skipLegacyFallback: true });
      
      if (!payment || payment.status !== "pending") {
        toast.error("Ce paiement n'est plus en attente.");
        return;
      }
      
      await rejectPendingOnlinePaymentAndSyncReservation(payment, companyId, { uid: user.uid, role: user.role ?? null }, "À revoir opérateur digital");
      
      await loadPendingReservations();
      toast.success("Paiement rejeté.");
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
      if (term) {
        const searchable = normalize(`${r.clientNom ?? ""} ${r.telephone ?? ""} ${r.referenceCode ?? ""} ${r.depart ?? ""} ${r.arrivee ?? ""} ${p.txRef ?? ""} ${r.preuveMessage ?? ""}`);
        if (!searchable.includes(term)) return false;
      }
      return true;
    });
  }, [agencyFilter, dateFilter, pendingReservations, providerFilter, search]);

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
        {/* Section résumé */}
        <section className="rounded-xl border border-gray-200 bg-white p-3 shadow-sm dark:border-gray-800 dark:bg-gray-900">
          <div className="mb-3 flex items-center justify-between gap-2">
            <div className="text-sm font-semibold">À traiter maintenant</div>
            <Button size="sm" variant="secondary" onClick={handleRefresh} disabled={refreshing} className="hidden sm:inline-flex">
              <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} /> Actualiser
            </Button>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <button type="button" onClick={() => setTab("to_process")} className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-left dark:border-amber-800 dark:bg-amber-950/30">
              <div className="text-[11px] text-amber-700 dark:text-amber-400">En attente</div>
              <div className="text-lg font-bold text-amber-800 dark:text-amber-300">{summary.pendingCount}</div>
            </button>
            <button type="button" onClick={() => setTab("to_process")} className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-left dark:border-red-800 dark:bg-red-950/30">
              <div className="text-[11px] text-red-700 dark:text-red-400">Rejetés</div>
              <div className="text-lg font-bold text-red-800 dark:text-red-300">{summary.rejectedCount}</div>
            </button>
            <button type="button" onClick={() => setTab("transfers")} className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-left dark:border-blue-800 dark:bg-blue-950/30">
              <div className="text-[11px] text-blue-700 dark:text-blue-400">Transferts</div>
              <div className="text-lg font-bold text-blue-800 dark:text-blue-300">{summary.unconfirmedTransfers}</div>
            </button>
            <button type="button" onClick={() => setTab("wallets")} className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-left dark:border-emerald-800 dark:bg-emerald-950/30">
              <div className="text-[11px] text-emerald-700 dark:text-emerald-400">Validés</div>
              <div className="text-lg font-bold text-emerald-800 dark:text-emerald-300">{summary.validatedTodayCount}</div>
            </button>
          </div>
        </section>

        {/* Navigation tabs - responsive */}
        <section className="rounded-xl border border-gray-200 bg-white p-2 shadow-sm dark:border-gray-800 dark:bg-gray-900">
          <div className="grid grid-cols-4 gap-1 sm:gap-2">
            <button type="button" onClick={() => setTab("to_process")} className={`rounded-lg border px-2 py-2 text-xs font-semibold sm:px-3 sm:text-sm ${tab === "to_process" ? "border-orange-300 bg-orange-50 text-orange-700 dark:border-orange-700 dark:bg-orange-950/50 dark:text-orange-400" : "border-gray-200 text-gray-700 dark:border-gray-700 dark:text-gray-300"}`}>
              <Clock3 className="mx-auto h-4 w-4 sm:mr-1 sm:inline" />
              <span className="hidden sm:inline">À traiter</span>
            </button>
            <button type="button" onClick={() => setTab("wallets")} className={`rounded-lg border px-2 py-2 text-xs font-semibold sm:px-3 sm:text-sm ${tab === "wallets" ? "border-orange-300 bg-orange-50 text-orange-700 dark:border-orange-700 dark:bg-orange-950/50 dark:text-orange-400" : "border-gray-200 text-gray-700 dark:border-gray-700 dark:text-gray-300"}`}>
              <Wallet className="mx-auto h-4 w-4 sm:mr-1 sm:inline" />
              <span className="hidden sm:inline">Soldes</span>
            </button>
            <button type="button" onClick={() => setTab("transfers")} className={`rounded-lg border px-2 py-2 text-xs font-semibold sm:px-3 sm:text-sm ${tab === "transfers" ? "border-orange-300 bg-orange-50 text-orange-700 dark:border-orange-700 dark:bg-orange-950/50 dark:text-orange-400" : "border-gray-200 text-gray-700 dark:border-gray-700 dark:text-gray-300"}`}>
              <Building2 className="mx-auto h-4 w-4 sm:mr-1 sm:inline" />
              <span className="hidden sm:inline">Transferts</span>
            </button>
            <button type="button" onClick={() => setTab("history")} className={`rounded-lg border px-2 py-2 text-xs font-semibold sm:px-3 sm:text-sm ${tab === "history" ? "border-orange-300 bg-orange-50 text-orange-700 dark:border-orange-700 dark:bg-orange-950/50 dark:text-orange-400" : "border-gray-200 text-gray-700 dark:border-gray-700 dark:text-gray-300"}`}>
              <History className="mx-auto h-4 w-4 sm:mr-1 sm:inline" />
              <span className="hidden sm:inline">Historique</span>
            </button>
          </div>
        </section>

        {/* Onglet À traiter - Version responsive */}
        {tab === "to_process" && (
          <section className="rounded-xl border border-gray-200 bg-white p-3 shadow-sm dark:border-gray-800 dark:bg-gray-900">
            {/* Filtres - version responsive */}
            <div className="mb-3 space-y-2">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <input 
                  value={search} 
                  onChange={(e) => setSearch(e.target.value)} 
                  placeholder="Rechercher client, téléphone..." 
                  className="h-10 w-full rounded-lg border border-gray-200 bg-white pl-10 pr-3 text-sm dark:border-gray-700 dark:bg-gray-900" 
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <select value={agencyFilter} onChange={(e) => setAgencyFilter(e.target.value)} className="h-10 rounded-lg border border-gray-200 bg-white px-3 text-sm dark:border-gray-700 dark:bg-gray-900">
                  <option value="">Toutes agences</option>
                  {Object.entries(agencies).map(([id, name]) => <option key={id} value={id}>{name}</option>)}
                </select>
                <select value={providerFilter} onChange={(e) => setProviderFilter(e.target.value as Provider)} className="h-10 rounded-lg border border-gray-200 bg-white px-3 text-sm dark:border-gray-700 dark:bg-gray-900">
                  <option value="all">Tous opérateurs</option>
                  <option value="orange">Orange</option>
                  <option value="moov">Moov</option>
                  <option value="wave">Wave</option>
                  <option value="sarali">Sarali</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <select value={dateFilter} onChange={(e) => setDateFilter(e.target.value as DateFilter)} className="h-10 rounded-lg border border-gray-200 bg-white px-3 text-sm dark:border-gray-700 dark:bg-gray-900">
                  <option value="all">Toutes dates</option>
                  <option value="today">Aujourd'hui</option>
                  <option value="7d">7 jours</option>
                  <option value="30d">30 jours</option>
                </select>
                <Button size="sm" variant="secondary" onClick={handleRefresh} disabled={refreshing} className="h-10">
                  <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
                  <span className="ml-1 hidden sm:inline">Actualiser</span>
                </Button>
              </div>
            </div>

            {loadingPending ? (
              <div className="rounded-lg border border-dashed border-gray-300 px-3 py-8 text-center text-sm text-gray-500 dark:border-gray-700">Chargement...</div>
            ) : filteredPending.length === 0 ? (
              <div className="rounded-lg border border-dashed border-gray-300 px-3 py-8 text-center text-sm text-gray-500 dark:border-gray-700">Aucun paiement en attente.</div>
            ) : (
              <div className="space-y-3">
                {filteredPending.map((row) => {
                  const canonical = getCanonicalReservation(row);
                  const p = getPaymentInfo(row);
                  const proof = proofUrl(row);
                  const isBusy = processingId === row.id;
                  const cardId = `${row.agencyId}_${row.id}`;
                  const isOpen = Boolean(expanded[cardId]);
                  
                  return (
                    <div 
                      key={cardId}
                      className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden dark:border-gray-700 dark:bg-gray-800"
                    >
                      {/* Version mobile : carte verticale */}
                      <div className="p-3">
                        <div className="flex gap-3">
                          {/* Miniature preuve */}
                          <div 
                            className="relative h-16 w-16 flex-shrink-0 overflow-hidden rounded-lg bg-gray-100 dark:bg-gray-700 cursor-pointer"
                            onClick={() => proof && window.open(proof, '_blank')}
                          >
                            {proof ? (
                              <img 
                                src={proof} 
                                alt="Preuve" 
                                className="h-full w-full object-cover"
                              />
                            ) : (
                              <div className="flex h-full w-full items-center justify-center text-xl">
                                📷
                              </div>
                            )}
                          </div>
                          
                          {/* Infos client */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-1">
                              <span className="font-semibold text-gray-900 dark:text-white truncate text-sm">
                                {row.clientNom || "Client"}
                              </span>
                              <span className={`inline-flex flex-shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${providerBadge(p.provider)}`}>
                                {providerLabel(p.provider)}
                              </span>
                            </div>
                            <div className="mt-0.5 text-xs text-gray-500 dark:text-gray-400 truncate">
                              {row.depart} → {row.arrivee}
                            </div>
                            <div className="mt-0.5 text-xs text-gray-400 dark:text-gray-500">
                              {row.telephone || "—"} • {formatDateTime(row.createdAt)}
                            </div>
                            <div className="mt-1 text-base font-bold" style={{ color: theme.primary }}>
                              {formatCurrency(Number(row.montant ?? 0), "XOF")}
                            </div>
                          </div>
                        </div>

                        {/* Message preuve */}
                        {(row.preuveMessage || canonical.onlinePayment?.proofMessage) && (
                          <div className="mt-2 rounded-lg bg-blue-50 p-2 text-xs text-blue-800 dark:bg-blue-900/30 dark:text-blue-300">
                            <span className="font-medium">💬 Message :</span>
                            <span className="ml-1 line-clamp-2">{row.preuveMessage || canonical.onlinePayment?.proofMessage}</span>
                          </div>
                        )}

                        {/* Actions principales */}
                        <div className="mt-3 flex flex-wrap gap-2">
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => void handleValidate(row)}
                            className="flex-1 inline-flex items-center justify-center gap-1 rounded-lg px-3 py-2 text-sm font-medium text-white transition-all hover:opacity-90 disabled:opacity-50"
                            style={{ backgroundColor: theme.primary }}
                          >
                            {isBusy ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <CheckCircle2 className="h-4 w-4" />
                            )}
                            {isBusy ? "..." : "Valider"}
                          </button>
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => void handleReject(row)}
                            className="flex-1 inline-flex items-center justify-center gap-1 rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm font-medium text-red-700 transition-all hover:bg-red-100 dark:border-red-700 dark:bg-red-900/30 dark:text-red-400"
                          >
                            <XCircle className="h-4 w-4" />
                            Rejeter
                          </button>
                          <button
                            type="button"
                            onClick={() => toggleCard(cardId)}
                            className="inline-flex items-center justify-center gap-1 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200"
                          >
                            <Eye className="h-4 w-4" />
                            {isOpen ? "Masquer" : "Détails"}
                          </button>
                        </div>

                        {/* Actions secondaires */}
                        <div className="mt-2 flex gap-2">
                          <button
                            type="button"
                            onClick={() => void handleCopyBillet(row)}
                            className="flex-1 inline-flex items-center justify-center gap-1 rounded-lg border border-gray-200 bg-gray-50 px-3 py-1.5 text-xs font-medium text-gray-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400"
                          >
                            <Copy className="h-3 w-3" />
                            Copier lien
                          </button>
                          <button
                            type="button"
                            onClick={() => handleWhatsapp(row)}
                            className="flex-1 inline-flex items-center justify-center gap-1 rounded-lg border border-green-200 bg-green-50 px-3 py-1.5 text-xs font-medium text-green-700 dark:border-green-800 dark:bg-green-900/30 dark:text-green-400"
                          >
                            <MessageCircle className="h-3 w-3" />
                            WhatsApp
                          </button>
                        </div>
                      </div>

                      {/* Section détails expansible */}
                      {isOpen && (
                        <div className="border-t border-gray-200 bg-gray-50 p-3 dark:border-gray-700 dark:bg-gray-900">
                          <div className="space-y-2 text-sm">
                            <div className="grid grid-cols-2 gap-2">
                              <div>
                                <div className="text-xs text-gray-500">Référence transaction</div>
                                <div className="font-mono text-xs break-all">{p.txRef || "—"}</div>
                              </div>
                              <div>
                                <div className="text-xs text-gray-500">Montant détecté</div>
                                <div className="font-medium">{p.detectedAmount ? formatCurrency(p.detectedAmount, "XOF") : "—"}</div>
                              </div>
                            </div>
                            <div>
                              <div className="text-xs text-gray-500">Fiabilité</div>
                              <div className="inline-flex items-center gap-1">
                                <span className={`inline-block h-2 w-2 rounded-full ${
                                  p.validationLevel === "valid" ? "bg-green-500" : 
                                  p.validationLevel === "suspicious" ? "bg-yellow-500" : "bg-red-500"
                                }`} />
                                <span className="text-sm">
                                  {p.validationLevel === "valid" ? "Fiable" : 
                                   p.validationLevel === "suspicious" ? "Suspect" : 
                                   p.validationLevel === "invalid" ? "Invalide" : "Non définie"}
                                </span>
                              </div>
                            </div>
                            <div>
                              <div className="text-xs text-gray-500">Trajet complet</div>
                              <div className="text-sm">{row.depart} → {row.arrivee}</div>
                              <div className="text-xs text-gray-400">{row.date} • {row.heure}</div>
                            </div>
                            <div>
                              <div className="text-xs text-gray-500">Agence</div>
                              <div className="text-sm">{agencies[row.agencyId] ?? row.agencyId}</div>
                            </div>
                            {proof && !isImage(proof) && (
                              <div>
                                <a 
                                  href={proof} 
                                  target="_blank" 
                                  rel="noopener noreferrer" 
                                  className="inline-flex w-full items-center justify-center gap-2 rounded-lg px-3 py-2 text-center text-sm font-semibold text-white transition hover:opacity-90"
                                  style={{ backgroundColor: theme.primary }}
                                >
                                  <Eye className="h-4 w-4" />
                                  Voir la preuve complète
                                </a>
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Paiements rejetés - version compacte */}
            {reviewRows.length > 0 && (
              <div className="mt-4 border-t border-gray-200 pt-4 dark:border-gray-700">
                <div className="mb-2 text-xs font-semibold text-gray-500">Rejetés récents ({reviewRows.length})</div>
                <div className="space-y-1">
                  {reviewRows.slice(0, 5).map((p) => (
                    <div key={p.id} className="flex items-center justify-between rounded-lg bg-red-50 px-3 py-2 text-xs dark:bg-red-950/30">
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-red-800 dark:text-red-400 truncate">{p.reservationId.slice(-8)}</div>
                        <div className="text-red-600 dark:text-red-300">{formatCurrency(p.amount, p.currency)}</div>
                      </div>
                      <div className="text-red-500 text-[10px]">{providerLabel(providerFrom(p.provider))}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>
        )}

        {/* Onglet Soldes Wallets - Version simplifiée */}
        {tab === "wallets" && (
          <section className="rounded-xl border border-gray-200 bg-white p-3 shadow-sm dark:border-gray-800 dark:bg-gray-900">
            {loadingSecondary ? (
              <div className="rounded-lg border border-dashed border-gray-300 px-3 py-8 text-center text-sm text-gray-500 dark:border-gray-700">Chargement des soldes...</div>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                  <div className="rounded-lg border border-gray-200 bg-gray-50 p-2 sm:p-3 dark:border-gray-700 dark:bg-gray-800">
                    <div className="text-[10px] sm:text-xs text-gray-500 dark:text-gray-400">Orange</div>
                    <div className="text-sm sm:text-lg font-bold">{formatCurrency(summary.byProvider.orange, "XOF")}</div>
                  </div>
                  <div className="rounded-lg border border-gray-200 bg-gray-50 p-2 sm:p-3 dark:border-gray-700 dark:bg-gray-800">
                    <div className="text-[10px] sm:text-xs text-gray-500 dark:text-gray-400">Moov</div>
                    <div className="text-sm sm:text-lg font-bold">{formatCurrency(summary.byProvider.moov, "XOF")}</div>
                  </div>
                  <div className="rounded-lg border border-gray-200 bg-gray-50 p-2 sm:p-3 dark:border-gray-700 dark:bg-gray-800">
                    <div className="text-[10px] sm:text-xs text-gray-500 dark:text-gray-400">Wave</div>
                    <div className="text-sm sm:text-lg font-bold">{formatCurrency(summary.byProvider.wave, "XOF")}</div>
                  </div>
                  <div className="rounded-lg border border-gray-200 bg-gray-50 p-2 sm:p-3 dark:border-gray-700 dark:bg-gray-800">
                    <div className="text-[10px] sm:text-xs text-gray-500 dark:text-gray-400">Sarali</div>
                    <div className="text-sm sm:text-lg font-bold">{formatCurrency(summary.byProvider.sarali, "XOF")}</div>
                  </div>
                  <div className="rounded-lg border border-gray-200 bg-gray-50 p-2 sm:p-3 dark:border-gray-700 dark:bg-gray-800">
                    <div className="text-[10px] sm:text-xs text-gray-500 dark:text-gray-400">Autres</div>
                    <div className="text-sm sm:text-lg font-bold">{formatCurrency(summary.byProvider.other, "XOF")}</div>
                  </div>
                </div>

                <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-2 dark:border-emerald-800 dark:bg-emerald-950/30">
                    <div className="text-[10px] sm:text-xs text-emerald-700 dark:text-emerald-400">Total mobile</div>
                    <div className="text-sm sm:text-lg font-bold text-emerald-800 dark:text-emerald-300">{formatCurrency(summary.walletsTotal, "XOF")}</div>
                  </div>
                  <div className="rounded-lg border border-blue-200 bg-blue-50 p-2 dark:border-blue-800 dark:bg-blue-950/30">
                    <div className="text-[10px] sm:text-xs text-blue-700 dark:text-blue-400">Validé aujourd'hui</div>
                    <div className="text-sm sm:text-lg font-bold text-blue-800 dark:text-blue-300">{formatCurrency(summary.validatedTodayAmount, "XOF")}</div>
                  </div>
                  <div className="rounded-lg border border-indigo-200 bg-indigo-50 p-2 dark:border-indigo-800 dark:bg-indigo-950/30">
                    <div className="text-[10px] sm:text-xs text-indigo-700 dark:text-indigo-400">Validé ce mois</div>
                    <div className="text-sm sm:text-lg font-bold text-indigo-800 dark:text-indigo-300">{formatCurrency(summary.validatedMonthAmount, "XOF")}</div>
                  </div>
                  <div className="rounded-lg border border-amber-200 bg-amber-50 p-2 dark:border-amber-800 dark:bg-amber-950/30">
                    <div className="text-[10px] sm:text-xs text-amber-700 dark:text-amber-400">Non transféré</div>
                    <div className="text-sm sm:text-lg font-bold text-amber-800 dark:text-amber-300">{formatCurrency(summary.walletsTotal, "XOF")}</div>
                  </div>
                </div>
              </>
            )}
          </section>
        )}

        {/* Onglet Transferts - Version simplifiée */}
        {tab === "transfers" && (
          <section className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            <article className="rounded-xl border border-gray-200 bg-white p-3 shadow-sm dark:border-gray-800 dark:bg-gray-900">
              <div className="mb-3 text-sm font-semibold">Nouveau transfert → banque</div>
              <form onSubmit={handleSubmitTransfer} className="space-y-2">
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400">Portefeuille source</label>
                  <select value={sourceWalletId} onChange={(e) => setSourceWalletId(e.target.value)} className="h-10 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm dark:border-gray-700 dark:bg-gray-900">
                    <option value="">Sélectionner</option>
                    {walletAccounts.map((w) => <option key={w.id} value={w.id}>{w.accountName || w.id} • {formatCurrency(w.currentBalance, w.currency)}</option>)}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400">Banque destination</label>
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
                    <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400">Montant</label>
                    <input type="number" min={0} value={transferAmount} onChange={(e) => setTransferAmount(e.target.value)} className="h-10 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm dark:border-gray-700 dark:bg-gray-900" />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400">Date</label>
                    <input type="date" value={transferDate} onChange={(e) => setTransferDate(e.target.value)} className="h-10 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm dark:border-gray-700 dark:bg-gray-900" />
                  </div>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400">Référence</label>
                  <input type="text" value={transferReference} onChange={(e) => setTransferReference(e.target.value)} className="h-10 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm dark:border-gray-700 dark:bg-gray-900" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400">Observation</label>
                  <textarea value={transferObservation} onChange={(e) => setTransferObservation(e.target.value)} className="min-h-[60px] w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-900" />
                </div>
                <Button type="submit" size="sm" variant="primary" disabled={submittingTransfer} className="w-full">
                  {submittingTransfer ? "Enregistrement..." : "Enregistrer"}
                </Button>
              </form>

              {lastDocument && (
                <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 p-2 text-xs dark:border-emerald-800 dark:bg-emerald-950/30">
                  <div className="font-semibold">Bordereau #{lastDocument.number}</div>
                  {canOpenPrint && <Button size="sm" variant="secondary" onClick={() => navigate(`/compagnie/${companyId}/accounting/documents/${lastDocument.id}/print`)} className="mt-2">Imprimer</Button>}
                </div>
              )}
            </article>

            <article className="rounded-xl border border-gray-200 bg-white p-3 shadow-sm dark:border-gray-800 dark:bg-gray-900">
              <div className="mb-3 flex items-center justify-between gap-2">
                <div className="text-sm font-semibold">Transferts récents</div>
                <select value={transferFilter} onChange={(e) => setTransferFilter(e.target.value as TransferStateFilter)} className="h-8 rounded-lg border px-2 text-xs dark:border-gray-700 dark:bg-gray-900">
                  <option value="all">Tous</option>
                  <option value="non_confirmed">Non confirmés</option>
                  <option value="confirmed">Confirmés</option>
                </select>
              </div>

              {loadingSecondary ? (
                <div className="rounded-lg border border-dashed border-gray-300 px-3 py-8 text-center text-sm text-gray-500">Chargement...</div>
              ) : transferRows.length === 0 ? (
                <div className="rounded-lg border border-dashed border-gray-300 px-3 py-8 text-center text-sm text-gray-500">Aucun transfert</div>
              ) : (
                <div className="space-y-1">
                  {transferRows.slice(0, 15).map((t) => {
                    const confirmed = t.documentStatus === "signed" || t.documentStatus === "archived";
                    return (
                      <div key={t.id} className="flex items-center justify-between rounded border p-2 text-xs dark:border-gray-700">
                        <div className="min-w-0 flex-1">
                          <div className="font-semibold">{formatCurrency(t.amount, t.currency)}</div>
                          <div className="text-gray-500 truncate">{t.referenceId.slice(-8)}</div>
                        </div>
                        <span className={`rounded-full px-2 py-0.5 text-[10px] ${confirmed ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>
                          {confirmed ? "✅" : "⏳"}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </article>
          </section>
        )}

        {/* Onglet Historique - Version simplifiée */}
        {tab === "history" && (
          <section className="rounded-xl border border-gray-200 bg-white p-3 shadow-sm dark:border-gray-800 dark:bg-gray-900">
            <div className="mb-3 space-y-2">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <input value={historySearch} onChange={(e) => setHistorySearch(e.target.value)} placeholder="Recherche..." className="h-10 w-full rounded-lg border border-gray-200 bg-white pl-10 pr-3 text-sm dark:border-gray-700 dark:bg-gray-900" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <select value={historyType} onChange={(e) => setHistoryType(e.target.value as HistoryType)} className="h-10 rounded-lg border border-gray-200 bg-white px-3 text-sm dark:border-gray-700 dark:bg-gray-900">
                  <option value="all">Tous</option>
                  <option value="validation">Validations</option>
                  <option value="rejet">Rejets</option>
                  <option value="transfert">Transferts</option>
                </select>
                <select value={historyDateFilter} onChange={(e) => setHistoryDateFilter(e.target.value as DateFilter)} className="h-10 rounded-lg border border-gray-200 bg-white px-3 text-sm dark:border-gray-700 dark:bg-gray-900">
                  <option value="today">Aujourd'hui</option>
                  <option value="7d">7j</option>
                  <option value="30d">30j</option>
                  <option value="all">Tout</option>
                </select>
              </div>
            </div>

            {loadingSecondary ? (
              <div className="rounded-lg border border-dashed border-gray-300 px-3 py-8 text-center text-sm text-gray-500">Chargement...</div>
            ) : historyRows.length === 0 ? (
              <div className="rounded-lg border border-dashed border-gray-300 px-3 py-8 text-center text-sm text-gray-500">Aucun historique</div>
            ) : (
              <div className="space-y-1">
                {historyRows.slice(0, 50).map((h) => (
                  <div key={h.id} className="flex items-center justify-between rounded border p-2 text-xs dark:border-gray-700">
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold truncate">{h.title}</div>
                      <div className="text-gray-500 text-[10px] truncate">{h.subtitle.slice(0, 40)}</div>
                    </div>
                    <div className="text-right ml-2">
                      <div className="font-medium">{formatCurrency(h.amount, h.currency)}</div>
                      <div className="text-gray-400 text-[9px]">{formatDateTime(h.date)}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        <footer className="pb-4 text-[11px] text-gray-500">
          <div className="rounded-lg border border-gray-200 bg-white px-3 py-2 dark:border-gray-800 dark:bg-gray-900">
            Espace opérateur digital - Validation mobile money
          </div>
        </footer>
      </main>
    </div>
  );
};

export default DigitalCashReservationsPage;