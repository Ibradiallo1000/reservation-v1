// src/pages/chef-comptable/ReservationsEnLigne.tsx
import React, { useEffect, useMemo, useState } from 'react';
import {
  collection, collectionGroup, query, where, orderBy, limit, doc,
  deleteDoc, onSnapshot, getDoc, updateDoc, serverTimestamp, getDocs, Timestamp, and, or
} from 'firebase/firestore';
import { db } from '@/firebaseConfig';
import { getStartOfDayBamako, getEndOfDayBamako } from '@/shared/date/dateUtilsTz';
import { useAuth } from '@/contexts/AuthContext';
import useCompanyTheme from '@/shared/hooks/useCompanyTheme';
import { useAgencyDarkMode } from '@/modules/agence/shared';
import { 
  RotateCw, 
  Search, 
  CheckCircle, 
  XCircle, 
  Clock, 
  AlertCircle, 
  Eye, 
  Filter, 
  Download,
  Building2,
  CreditCard,
  TrendingUp,
  AlertTriangle,
  RefreshCw,
  FileText,
  Smartphone,
  Info,
  ChevronDown,
  ChevronUp,
  Bell,
  Calendar,
  Receipt,
  MessageCircle,
  Copy,
  Sun,
  Moon,
  LogOut
} from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
import type { ReservationStatus } from '@/types/reservation';
import InternalLayout from '@/shared/layout/InternalLayout';
import { normalizeReservation } from '@/lib/normalizeReservation';

import { useFormatCurrency } from '@/shared/currency/CurrencyContext';
import { Button } from '@/shared/ui/button';
import { MetricCard, SectionCard, StatusBadge, type StatusVariant, StandardLayoutWrapper, PageHeader } from '@/ui';
import { upsertCustomerFromReservation } from '@/modules/compagnie/crm/customerService';
import { decrementReservedSeats } from '@/modules/compagnie/tripInstances/tripInstanceService';
import { ensurePendingOnlinePaymentFromReservation, getPaymentByReservationId } from '@/services/paymentService';
import { validatePendingOnlinePaymentAndSyncReservation, rejectPendingOnlinePaymentAndSyncReservation } from '@/services/onlinePaymentOperatorService';

/** Son Shopify (alarme / preuve reçue) : public/splash/son.mp3 */
const NOTIFICATION_SOUND_URL = '/splash/son.mp3';

/* ================= NORMALISATION DES STATUTS ================= */
type NormalizedReservationResult = ReturnType<typeof normalizeReservation>;

type DigitalReservationRow = {
  id: string;
  companyId: string;
  agencyId: string;
  companySlug?: string;
  referenceCode?: string;
  email?: string | null;
  createdAt: string | Date | Timestamp;
  ticketValidatedAt?: string | Date | Timestamp | null;
  validatedAt?: string | Date | Timestamp | null;
  refusedAt?: string | Date | Timestamp | null;
  validatedBy?: string | null;
  refusedBy?: string | null;
  refusalReason?: string | null;
  seatsGo?: number;
  seatsReturn?: number;
  tripInstanceId?: string | null;
  originStopOrder?: number | null;
  destinationStopOrder?: number | null;
  reservation: {
    status: ReservationStatus;
    channel: string;
    createdAt?: Date;
  };
  payment: NormalizedReservationResult["payment"] & {
    validationLevel?: string;
    parsed?: {
      amount?: number;
      transactionId?: string;
    };
    totalAmount?: number;
  };
  trip: NormalizedReservationResult["trip"];
  customer: NormalizedReservationResult["customer"];
  proof: {
    url?: string;
    message?: string;
  };
};

/** Modèle Firestore `status` : en_attente | payé | annulé (+ ticketValidatedAt pour billet validé). */
const normalizeReservationRowStatus = (
  d: Record<string, unknown>,
  normalized: NormalizedReservationResult = normalizeReservation(d)
): ReservationStatus => {
  const status = String(normalized.reservation.status ?? "").toLowerCase();
  if (status === "annulé" || status === "annule") return "annule";
  if (status === "en_attente") return "en_attente";
  if (status === "payé" || status === "paye") {
    return d.ticketValidatedAt ? "confirme" : "verification";
  }
  const raw = String(normalized.reservation.status ?? "");
  return normalizeStatutLegacy(raw);
};

const normalizeStatutLegacy = (raw?: string): ReservationStatus => {
  if (!raw) return "en_attente";
  const s = raw.toLowerCase().trim();
  if (s.includes("preuve")) return "verification";
  if (s.includes("verif")) return "verification";
  if (s.includes("pay")) return "confirme";
  if (s.includes("confirm")) return "confirme";
  if (s.includes("valid")) return "confirme";
  if (s.includes("refus")) return "refuse";
  if (s.includes("annul")) return "annule";
  if (s.includes("cancel")) return "annule";
  if (s.includes("attente")) return "en_attente";
  if (s === "pending") return "en_attente";
  return "en_attente";
};

const isRecordValue = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const asOptionalString = (value: unknown): string | undefined => {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
};

const asOptionalNumber = (value: unknown): number | undefined => {
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  if (typeof value !== "string") return undefined;
  const parsed = Number(value.trim().replace(/\s/g, ""));
  return Number.isFinite(parsed) ? parsed : undefined;
};

const asReservationCreatedAt = (value: unknown): string | Date | Timestamp => {
  if (value instanceof Timestamp || value instanceof Date || typeof value === "string") return value;
  return Timestamp.now();
};

const dateValueMs = (date?: string | Date | Timestamp | null) => {
  if (!date) return 0;
  if (date instanceof Timestamp) return date.toMillis();
  if (date instanceof Date) return date.getTime();
  const ms = new Date(date).getTime();
  return Number.isFinite(ms) ? ms : 0;
};

const asOptionalDateValue = (value: unknown): string | Date | Timestamp | null => {
  if (value instanceof Timestamp || value instanceof Date || typeof value === "string") return value;
  return null;
};

const getProofUrlFromRaw = (source: Record<string, unknown>) =>
  asOptionalString(source.preuveUrl) ??
  asOptionalString(source.paymentProofUrl) ??
  asOptionalString(source.paiementPreuveUrl) ??
  asOptionalString(source.proofUrl) ??
  asOptionalString(source.receiptUrl);

type BuildReservationRowParams = {
  id: string;
  raw: Record<string, unknown>;
  agencyId: string;
  companyId: string;
  statusOverride?: ReservationStatus;
  companySlugFallback?: string;
};

const buildDigitalReservationRow = ({
  id,
  raw,
  agencyId,
  companyId,
  statusOverride,
  companySlugFallback,
}: BuildReservationRowParams): DigitalReservationRow => {
  // ⚠️ utiliser normalizeReservation pour toute lecture de réservation
  const normalized = normalizeReservation(raw);
  const rawPayment = isRecordValue(raw.payment) ? raw.payment : {};
  const parsedPayment = isRecordValue(rawPayment.parsed) ? rawPayment.parsed : {};
  const paymentParsedAmount = asOptionalNumber(parsedPayment.amount);
  const paymentParsedTransactionId = asOptionalString(parsedPayment.transactionId);

  return {
    id,
    companyId: asOptionalString(raw.companyId) ?? companyId,
    agencyId: asOptionalString(raw.agencyId) ?? agencyId,
    companySlug: asOptionalString(raw.companySlug) ?? companySlugFallback,
    referenceCode: normalized.reservation.reference ?? asOptionalString(raw.referenceCode),
    email: asOptionalString(raw.email) ?? null,
    createdAt: asReservationCreatedAt(raw.createdAt),
    ticketValidatedAt: asOptionalDateValue(raw.ticketValidatedAt),
    validatedAt:
      asOptionalDateValue(raw.validatedAt) ??
      asOptionalDateValue(raw.ticketValidatedAt) ??
      asOptionalDateValue(rawPayment.validatedAt),
    refusedAt:
      asOptionalDateValue(raw.refusedAt) ??
      asOptionalDateValue(raw.rejectedAt) ??
      asOptionalDateValue(rawPayment.rejectedAt),
    validatedBy: asOptionalString(raw.validatedBy) ?? asOptionalString(rawPayment.validatedBy) ?? null,
    refusedBy: asOptionalString(raw.refusedBy) ?? asOptionalString(rawPayment.rejectedBy) ?? null,
    refusalReason:
      asOptionalString(raw.refusalReason) ??
      asOptionalString(raw.rejectionReason) ??
      asOptionalString(rawPayment.rejectionReason) ??
      null,
    seatsGo: asOptionalNumber(raw.seatsGo),
    seatsReturn: asOptionalNumber(raw.seatsReturn),
    tripInstanceId: asOptionalString(raw.tripInstanceId) ?? null,
    originStopOrder: asOptionalNumber(raw.originStopOrder) ?? null,
    destinationStopOrder: asOptionalNumber(raw.destinationStopOrder) ?? null,
    reservation: {
      status: statusOverride ?? normalizeReservationRowStatus(raw, normalized),
      channel: normalized.reservation.channel,
      createdAt: normalized.reservation.createdAt,
    },
    payment: {
      amount: normalized.payment.amount,
      status: normalized.payment.status,
      method: normalized.payment.method,
      wallet: normalized.payment.wallet,
      reference: normalized.payment.reference,
      ledgerStatus: normalized.payment.ledgerStatus,
      validationLevel: asOptionalString(rawPayment.validationLevel),
      parsed:
        paymentParsedAmount !== undefined || paymentParsedTransactionId
          ? {
              amount: paymentParsedAmount,
              transactionId: paymentParsedTransactionId,
            }
          : undefined,
      totalAmount: asOptionalNumber(rawPayment.totalAmount),
    },
    trip: {
      departure: normalized.trip.departure,
      arrival: normalized.trip.arrival,
      date: normalized.trip.date,
      time: normalized.trip.time,
      tripInstanceId: normalized.trip.tripInstanceId,
    },
    customer: {
      name: normalized.customer.name ?? asOptionalString(raw.clientNom),
      phone: normalized.customer.phone ?? asOptionalString(raw.telephoneOriginal),
    },
    proof: {
      url: getProofUrlFromRaw(raw),
      message: asOptionalString(raw.preuveMessage),
    },
  };
};

const ITEMS_PER_PAGE = 20;

/* ================= TYPES POUR LA PAGINATION ET FILTRES ================= */
interface FilterOptions {
  period: 'today' | 'tomorrow' | 'week' | 'month' | 'custom' | 'all';
  startDate?: Date;
  endDate?: Date;
}

type DigitalOperatorView = "dashboard" | "pending" | "validated" | "refused";

type OnlineFinancialRow = {
  id: string;
  amount: number;
  agencyId?: string | null;
  reservationId?: string | null;
  paymentProvider?: string | null;
  paymentMethod?: string | null;
  paymentChannel?: string | null;
  performedAt?: Timestamp | null;
  createdAt?: Timestamp | null;
  metadata?: Record<string, unknown> | null;
};

type ConfiguredPaymentMethod = {
  id: string;
  label: string;
  providerCode?: string | null;
};

/* ================= HOOK POUR LA NOTIFICATION SONORE (son Shopify : splash/son.mp3) ================= */
const useNotificationSound = () => {
  const [audio, setAudio] = useState<HTMLAudioElement | null>(null);
  const [playedReservations, setPlayedReservations] = useState<Set<string>>(new Set());
  const [isAudioReady, setIsAudioReady] = useState(false);

  const initializeAudio = () => {
    if (audio || typeof window === 'undefined') return;
    const audioElement = new Audio(NOTIFICATION_SOUND_URL);
    audioElement.preload = 'auto';
    audioElement.load();
    audioElement.addEventListener('canplaythrough', () => {
      setAudio(audioElement);
      setIsAudioReady(true);
    });
    audioElement.addEventListener('error', () => setIsAudioReady(false));
  };

  const playNotification = (reservationId: string) => {
    if (!isAudioReady || !audio || playedReservations.has(reservationId)) return;
    audio.currentTime = 0;
    audio.play().catch(() => {});
    setPlayedReservations(prev => {
      const next = new Set(prev);
      next.add(reservationId);
      return next;
    });
  };

  /** Joue le son (ex. après validation) sans déduplication. */
  const playSoundNow = () => {
    if (audio && isAudioReady) {
      audio.currentTime = 0;
      audio.play().catch(() => {});
    } else {
      const a = new Audio(NOTIFICATION_SOUND_URL);
      a.play().catch(() => {});
    }
  };

  const resetNotification = (reservationId: string) => {
    setPlayedReservations(prev => {
      const next = new Set(prev);
      next.delete(reservationId);
      return next;
    });
  };

  return { initializeAudio, playNotification, resetNotification, playSoundNow, isAudioReady };
};

/* ================= CONFIGURATION DES STATUTS ================= */
const getStatusConfig = (status?: ReservationStatus): { label: string; statusVariant: StatusVariant; icon: React.ReactNode; priority: number } => {
  switch (status) {
    case 'en_attente':
      return { label: 'En attente', statusVariant: 'info', icon: <Clock className="h-3 w-3" />, priority: 0 };
    case 'verification':
      return { label: 'À vérifier', statusVariant: 'warning', icon: <AlertCircle className="h-3 w-3" />, priority: 1 };
    case 'confirme':
      return { label: 'Validé', statusVariant: 'success', icon: <CheckCircle className="h-3 w-3" />, priority: 2 };
    case 'refuse':
      return { label: 'Refusé', statusVariant: 'danger', icon: <XCircle className="h-3 w-3" />, priority: 3 };
    case 'annule':
      return { label: 'Annulé', statusVariant: 'neutral', icon: <XCircle className="h-3 w-3" />, priority: 4 };
    default:
      return { label: 'Inconnu', statusVariant: 'neutral', icon: <AlertCircle className="h-3 w-3" />, priority: 5 };
  }
};

type PaymentUiStatus = "auto_detected" | "declared_paid" | "rejected" | "validated" | "pending" | "unknown";
type PaymentValidationLevel = "valid" | "suspicious" | "invalid" | "unknown";

const getPaymentInfo = (reservation: DigitalReservationRow) => {
  const p = reservation.payment;
  const paymentStatus = String(p.status ?? "").toLowerCase();
  const validationLevel = String(p.validationLevel ?? "").toLowerCase();
  return {
    paymentStatus: (
      paymentStatus === "auto_detected" ||
      paymentStatus === "declared_paid" ||
      paymentStatus === "rejected" ||
      paymentStatus === "validated" ||
      paymentStatus === "pending"
        ? paymentStatus
        : "unknown"
    ) as PaymentUiStatus,
    validationLevel: (
      validationLevel === "valid" || validationLevel === "suspicious" || validationLevel === "invalid"
        ? validationLevel
        : "unknown"
    ) as PaymentValidationLevel,
    parsedAmount:
      typeof p?.parsed?.amount === "number"
        ? p.parsed.amount
        : typeof p.totalAmount === "number"
          ? p.totalAmount
          : null,
    parsedTransactionId: p?.parsed?.transactionId ? String(p.parsed.transactionId) : null,
    totalAmount: typeof p.totalAmount === "number" ? p.totalAmount : null,
  };
};

const getPriorityRank = (reservation: DigitalReservationRow): number => {
  const info = getPaymentInfo(reservation);
  if (info.paymentStatus === "auto_detected" && info.validationLevel === "valid") return 1;
  if (info.paymentStatus === "auto_detected" && info.validationLevel === "suspicious") return 2;
  if (info.paymentStatus === "declared_paid") return 3;
  return 4;
};

/* ================= COMPOSANT PRINCIPAL ================= */
/** Construit l'URL publique du billet pour une réservation */
const getBilletUrl = (r: DigitalReservationRow, companySlugFallback?: string) => {
  const slug = companySlugFallback || r.companySlug || "";
  if (!slug || !r.id) return "";

  const getBaseUrl = () => window.location.origin;
  const origin = getBaseUrl();
  const hostname = window.location.hostname;

  // Local dev: http://localhost:5173/mali-trans/reservation/abc123
  const isLocal =
    hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";
  if (isLocal) {
    return `${origin}/${slug}/reservation/${r.id}`;
  }

  // Production (subdomain): https://<slug>.<root-domain>/reservation/abc123
  // On dérive le root domain depuis le hostname courant (pas de hardcode).
  const hasSubdomain = hostname.includes(".");
  if (hasSubdomain) {
    const rootDomain = hostname.split(".").slice(1).join(".");
    const proto = window.location.protocol.replace(":", "");
    return `${proto}://${slug}.${rootDomain}/reservation/${r.id}`;
  }

  // Fallback (même format que dev si possible)
  return `${origin}/${slug}/reservation/${r.id}`;
};

const parseYYYYMMDDToLocalDate = (raw: unknown) => {
  if (typeof raw !== "string") return null;
  const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]) - 1;
  const d = Number(m[3]);
  const dt = new Date(y, mo, d);
  return isNaN(dt.getTime()) ? null : dt;
};

const formatDepartureDateFr = (raw: unknown) => {
  if (!raw) return "—";
  let d: Date | null = null;

  if (raw instanceof Timestamp) d = raw.toDate();
  else if (raw instanceof Date) d = raw;
  else if (typeof raw === "string") d = parseYYYYMMDDToLocalDate(raw) || new Date(raw);

  if (!d || isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
};

const formatDepartureTime = (raw: unknown) => {
  if (!raw) return "—";
  const s = String(raw).trim();
  const m = s.match(/^(\d{2}):(\d{2})/);
  if (m) return `${m[1]}:${m[2]}`;
  const d = new Date(s);
  if (!isNaN(d.getTime())) {
    return d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", hour12: false });
  }
  return "—";
};

/** Message WhatsApp professionnel (sauts de ligne EXACTS) */
const getBilletConfirmationMessage = (
  r: DigitalReservationRow,
  billetUrl: string,
  companyName: string
) => {
  const departure = r.trip.departure || "—";
  const arrival = r.trip.arrival || "—";
  const formattedDate = formatDepartureDateFr(r.trip.date);
  const time = formatDepartureTime(r.trip.time);

  const lines = [
    `🚍 ${companyName}`,
    "",
    "Bonjour,",
    "",
    "Votre réservation a été validée avec succès ✅",
    "",
    `🧾 Trajet : ${departure} → ${arrival}`,
    `📅 Date de départ : ${formattedDate}`,
    `⏰ Heure de départ : ${time}`,
    "",
    "📍 Merci de vous présenter au point de départ au moins 1 heure avant le départ.",
    "",
    "🎫 Consultez votre billet ici :",
    `${billetUrl}`,
    "",
    `Merci d'avoir fait confiance à ${companyName} 🙏`,
    "Bon voyage !",
  ];

  return lines.join("\n");
};

/** Numéro au format wa.me (chiffres uniquement, sans +) */
const toWhatsAppPhone = (phone: string) => (phone || '').replace(/\D/g, '');

const ReservationsEnLigne: React.FC = () => {
  const { user, company, logout } = useAuth() as any;
  const navigate = useNavigate();
  const theme = useCompanyTheme(company) || { primary: '#2563eb', secondary: '#3b82f6' };
  const primaryColor = (theme as any)?.primary ?? "#FF6600";
  const secondaryColor = (theme as any)?.secondary ?? "#F97316";
  const money = useFormatCurrency();
  const { initializeAudio, playNotification, resetNotification, playSoundNow, isAudioReady } = useNotificationSound();
  const [darkMode, toggleDarkMode] = useAgencyDarkMode();

  const [verificationReservations, setVerificationReservations] = useState<DigitalReservationRow[]>([]);
  /** Réservations venant d'être validées : on garde la carte visible avec "Billet validé" + actions */
  const [recentlyValidatedReservations, setRecentlyValidatedReservations] = useState<DigitalReservationRow[]>([]);
  const [otherReservations, setOtherReservations] = useState<DigitalReservationRow[]>([]);
  const [agencies, setAgencies] = useState<Record<string, {name: string, ville: string}>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  // Focus operator_digital: par défaut, on affiche uniquement les réservations "preuve_recue"
  // (normalisées en statut UI = "verification").
  const [filterStatus, setFilterStatus] = useState<ReservationStatus | ''>('verification');
  const [otherPage, setOtherPage] = useState(1);
  const [showStats, setShowStats] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  // Temporal filtering mobile-first: jour par défaut pour le dashboard digital.
  const [filterPeriod, setFilterPeriod] = useState<FilterOptions['period']>('today');
  const [filterAgencyId, setFilterAgencyId] = useState<string>('');
  const [expandedCardKeys, setExpandedCardKeys] = useState<Record<string, boolean>>({});
  const [requestedOtherReservations, setRequestedOtherReservations] = useState(false);
  const [filterTab, setFilterTab] = useState<"today" | "pending" | "history" | "all">("pending");
  const [recentlyRefusedReservations, setRecentlyRefusedReservations] = useState<DigitalReservationRow[]>([]);
  const [activeView, setActiveView] = useState<DigitalOperatorView>("dashboard");
  const [customStartDate, setCustomStartDate] = useState("");
  const [customEndDate, setCustomEndDate] = useState("");
  const [onlineFinancialRows, setOnlineFinancialRows] = useState<OnlineFinancialRow[]>([]);
  const [monthlyOnlineFinancialRows, setMonthlyOnlineFinancialRows] = useState<OnlineFinancialRow[]>([]);
  const [configuredPaymentMethods, setConfiguredPaymentMethods] = useState<ConfiguredPaymentMethod[]>([]);
  const [financeLoading, setFinanceLoading] = useState(false);

  const toggleExpandedCard = (key: string) => {
    setExpandedCardKeys((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  /* ================= FONCTIONS UTILITAIRES DATE ================= */
  const getPeriodDates = (period: FilterOptions['period']) => {
    const now = new Date();

    const todayStart = getStartOfDayBamako();
    const todayEnd = getEndOfDayBamako();

    if (period === 'all') {
      return { start: new Date(0), end: now };
    }

    if (period === 'today') {
      return { start: todayStart, end: todayEnd };
    }

    if (period === 'tomorrow') {
      const tomorrowStart = new Date(todayStart);
      tomorrowStart.setDate(tomorrowStart.getDate() + 1);
      const tomorrowEnd = new Date(tomorrowStart);
      tomorrowEnd.setHours(23, 59, 59, 999);
      return { start: tomorrowStart, end: tomorrowEnd };
    }

    if (period === 'week') {
      const weekStart = todayStart;
      const weekEnd = new Date(todayStart);
      weekEnd.setDate(weekEnd.getDate() + 6);
      weekEnd.setHours(23, 59, 59, 999);
      return { start: weekStart, end: weekEnd };
    }

    if (period === 'month') {
      const monthStart = new Date(todayStart.getFullYear(), todayStart.getMonth(), 1);
      const monthEnd = new Date(todayStart.getFullYear(), todayStart.getMonth() + 1, 0, 23, 59, 59, 999);
      return { start: monthStart, end: monthEnd };
    }

    if (period === 'custom') {
      const start = customStartDate ? new Date(`${customStartDate}T00:00:00`) : todayStart;
      const end = customEndDate ? new Date(`${customEndDate}T23:59:59.999`) : todayEnd;
      return { start, end };
    }

    return { start: todayStart, end: todayEnd };
  };

  /* ================= INITIALISATION AUDIO AU PREMIER CLIC ================= */
  useEffect(() => {
    const handleFirstInteraction = () => {
      initializeAudio();
      document.removeEventListener('click', handleFirstInteraction);
      document.removeEventListener('keydown', handleFirstInteraction);
      document.removeEventListener('touchstart', handleFirstInteraction);
    };

    document.addEventListener('click', handleFirstInteraction);
    document.addEventListener('keydown', handleFirstInteraction);
    document.addEventListener('touchstart', handleFirstInteraction);

    return () => {
      document.removeEventListener('click', handleFirstInteraction);
      document.removeEventListener('keydown', handleFirstInteraction);
      document.removeEventListener('touchstart', handleFirstInteraction);
    };
  }, []);

  /* ================= CHARGEMENT DES AGENCES ================= */
  useEffect(() => {
    if (!user?.companyId) return;

    (async () => {
      try {
        const agenciesSnap = await getDocs(
          collection(db, 'companies', user.companyId, 'agences')
        );
        
        const agenciesMap: Record<string, {name: string, ville: string}> = {};
        agenciesSnap.forEach(doc => {
          const data = doc.data() as any;
          agenciesMap[doc.id] = {
            name: data.nomAgence || data.nom || data.ville || 'Agence',
            ville: data.ville || data.city || ''
          };
        });
        
        setAgencies(agenciesMap);
      } catch (error) {
        console.error('Erreur chargement agences:', error);
        toast.error('Erreur', { description: 'Impossible de charger les agences' });
      }
    })();
  }, [user?.companyId]);

  /* ================= CHARGEMENT EN TEMPS RÉEL - RÉSERVATIONS À VÉRIFIER ================= */
  useEffect(() => {
    if (!user?.companyId) {
      setLoading(false);
      return;
    }

    const qRef = query(
      collectionGroup(db, 'reservations'),
      and(
        where('companyId', '==', user.companyId),
        where('canal', '==', 'en_ligne'),
        or(
          where('status', 'in', ['preuve_recue', 'verification']),
          where('statut', 'in', ['preuve_recue', 'verification']),
          where('payment.status', '==', 'pending'),
          where('paymentStatus', '==', 'pending')
        )
      ),
      orderBy('createdAt', 'desc'),
      limit(50)
    );

    const unsub = onSnapshot(qRef, (snap) => {
      setVerificationReservations(prev => {
        const map = new Map<string, DigitalReservationRow>();

        prev.forEach(r => {
          map.set(`${r.agencyId}_${r.id}`, r);
        });

        snap.docChanges().forEach(chg => {
          const raw = chg.doc.data() as Record<string, unknown>;
          const agencyId = String(raw.agencyId ?? chg.doc.ref.parent.parent?.id ?? '');
          const keyEarly = `${agencyId}_${chg.doc.id}`;
          if (raw.ticketValidatedAt) {
            map.delete(keyEarly);
            if (chg.type === 'removed') resetNotification(keyEarly);
            return;
          }

          const row = buildDigitalReservationRow({
            id: chg.doc.id,
            agencyId,
            companyId: user.companyId!,
            raw,
          });

          const key = `${row.agencyId}_${row.id}`;

          if (chg.type === 'removed') {
            map.delete(key);
            resetNotification(key);
          } else {
            if (chg.type === 'added' && row.reservation.status === 'verification') {
              if (isAudioReady) {
                playNotification(key);
              }

              toast('Nouveau justificatif reçu', {
                description: `${row.customer.name || 'Client'} a envoyé un justificatif de paiement`,
                duration: 4000,
                action: {
                  label: 'Voir',
                  onClick: () => {
                    const element = document.getElementById(`reservation-${row.id}`);
                    if (element) {
                      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
                      element.classList.add('ring-2', 'ring-amber-500');
                      setTimeout(() => {
                        element.classList.remove('ring-2', 'ring-amber-500');
                      }, 2000);
                    }
                  }
                }
              });
            }

            map.set(key, row);
          }
        });

        return Array.from(map.values()).sort((a, b) => {
          const ta = a.createdAt instanceof Timestamp
            ? a.createdAt.toMillis()
            : new Date(a.createdAt).getTime();
          const tb = b.createdAt instanceof Timestamp
            ? b.createdAt.toMillis()
            : new Date(b.createdAt).getTime();
          return tb - ta;
        });
      });
      setLoading(false);
    }, (error) => {
      console.error('Erreur Firestore (verification):', error);
      setLoading(false);
      toast.error('Erreur de connexion', {
        description: 'Impossible de charger les réservations à vérifier',
      });
    });

    return () => unsub();
  }, [user?.companyId, isAudioReady]);

  /* ================= CHARGEMENT PAGINÉ DES AUTRES RÉSERVATIONS ================= */
  const loadOtherReservations = async (page: number = 1) => {
    if (!user?.companyId) return;

    try {
      const allOtherReservations: DigitalReservationRow[] = [];

      const qRef = query(
          collectionGroup(db, 'reservations'),
          and(
            where('companyId', '==', user.companyId),
            where('canal', '==', 'en_ligne'),
            or(
              where('status', 'in', ['confirme', 'refuse', 'annulé', 'annule']),
              where('statut', 'in', ['confirme', 'refuse', 'annulé', 'annule'])
            )
          ),
          orderBy('createdAt', 'desc'),
          limit(Math.min(ITEMS_PER_PAGE * page, 200))
        );

        const snap = await getDocs(qRef);
        snap.docs.forEach(doc => {
          const raw = doc.data() as Record<string, unknown>;
          const agencyId = String(raw.agencyId ?? doc.ref.parent.parent?.id ?? '');
          
          allOtherReservations.push(buildDigitalReservationRow({
            id: doc.id,
            agencyId,
            companyId: user.companyId!,
            raw,
          }));
        });

      // Supprimer les doublons potentiels
      const uniqueReservations = Array.from(
        new Map(allOtherReservations.map(r => [`${r.agencyId}_${r.id}`, r])).values()
      );
      
      setOtherReservations(uniqueReservations);
      setOtherPage(page);
    } catch (error) {
      console.error('Erreur chargement autres réservations:', error);
    }
  };

  useEffect(() => {
    if (!user?.companyId) return;

    let cancelled = false;

    const loadConfiguredPaymentMethods = async () => {
      try {
        const configsSnap = await getDocs(
          query(
            collection(db, "companies", user.companyId!, "paymentConfigs"),
            where("active", "==", true),
            where("isEnabled", "==", true)
          )
        );

        const methods: Array<ConfiguredPaymentMethod | null> = await Promise.all(
          configsSnap.docs.map(async (configDoc) => {
            const config = configDoc.data() as Record<string, unknown>;
            const methodId = asOptionalString(config.methodId) ?? configDoc.id;
            if (!methodId) return null;

            const methodSnap = await getDoc(doc(db, "paymentMethods", methodId));
            const method = methodSnap.exists() ? (methodSnap.data() as Record<string, unknown>) : {};
            const label = asOptionalString(method.name) ?? asOptionalString(config.name) ?? methodId;

            return {
              id: methodId,
              label,
              providerCode: asOptionalString(method.providerCode) ?? asOptionalString(config.providerCode) ?? null,
            };
          })
        );

        if (!cancelled) {
          setConfiguredPaymentMethods(
            methods
              .filter((method): method is ConfiguredPaymentMethod => Boolean(method?.id && method.label))
              .sort((a, b) => a.label.localeCompare(b.label, "fr"))
          );
        }
      } catch (error) {
        console.warn("[DigitalCash] Configuration Mobile Money indisponible", error);
        if (!cancelled) setConfiguredPaymentMethods([]);
      }
    };

    void loadConfiguredPaymentMethods();
    return () => {
      cancelled = true;
    };
  }, [user?.companyId]);

  useEffect(() => {
    if (!user?.companyId) return;

    let cancelled = false;
    const { start, end } = getPeriodDates(filterPeriod);

    const toOnlineFinancialRow = (row: { id: string; data: () => Record<string, unknown> }): OnlineFinancialRow => {
      const data = row.data();
      return {
        id: row.id,
        amount: Number(data.amount ?? 0) || 0,
        agencyId: asOptionalString(data.agencyId) ?? null,
        reservationId: asOptionalString(data.reservationId) ?? null,
        paymentProvider: asOptionalString(data.paymentProvider) ?? null,
        paymentMethod: asOptionalString(data.paymentMethod) ?? null,
        paymentChannel: asOptionalString(data.paymentChannel) ?? null,
        performedAt: data.performedAt instanceof Timestamp ? data.performedAt : null,
        createdAt: data.createdAt instanceof Timestamp ? data.createdAt : null,
        metadata: isRecordValue(data.metadata) ? data.metadata : null,
      };
    };

    const loadConfirmedMobileMoney = async () => {
      setFinanceLoading(true);
      try {
        const baseRef = collection(db, "companies", user.companyId!, "financialTransactions");
        const now = new Date();
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
        const weekStart = new Date(now);
        weekStart.setDate(now.getDate() - 6);
        weekStart.setHours(0, 0, 0, 0);
        const reportStart = weekStart < monthStart ? weekStart : monthStart;
        const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
        const constraints =
          filterPeriod === "all"
            ? [
                where("companyId", "==", user.companyId),
                where("type", "==", "payment_received"),
                where("paymentMethod", "==", "mobile_money"),
                where("paymentChannel", "==", "online"),
                orderBy("performedAt", "desc"),
                limit(500),
              ]
            : [
                where("companyId", "==", user.companyId),
                where("type", "==", "payment_received"),
                where("paymentMethod", "==", "mobile_money"),
                where("paymentChannel", "==", "online"),
                where("performedAt", ">=", Timestamp.fromDate(start)),
                where("performedAt", "<=", Timestamp.fromDate(end)),
                orderBy("performedAt", "desc"),
                limit(1000),
              ];
        const [snap, monthSnap] = await Promise.all([
          getDocs(query(baseRef, ...constraints)),
          getDocs(query(
            baseRef,
            where("companyId", "==", user.companyId),
            where("type", "==", "payment_received"),
            where("paymentMethod", "==", "mobile_money"),
            where("paymentChannel", "==", "online"),
            where("performedAt", ">=", Timestamp.fromDate(reportStart)),
            where("performedAt", "<=", Timestamp.fromDate(monthEnd)),
            orderBy("performedAt", "desc"),
            limit(1500)
          )),
        ]);
        if (cancelled) return;
        setOnlineFinancialRows(snap.docs.map((row) => toOnlineFinancialRow(row as any)));
        setMonthlyOnlineFinancialRows(monthSnap.docs.map((row) => toOnlineFinancialRow(row as any)));
      } catch (error) {
        console.warn("[DigitalCash] Mobile Money confirmé indisponible", error);
        if (!cancelled) {
          setOnlineFinancialRows([]);
          setMonthlyOnlineFinancialRows([]);
        }
      } finally {
        if (!cancelled) setFinanceLoading(false);
      }
    };

    void loadConfirmedMobileMoney();
    return () => {
      cancelled = true;
    };
    // getPeriodDates depends on the custom dates used below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.companyId, filterPeriod, customStartDate, customEndDate]);

  /* ================= CORRECTION CRITIQUE : FUSION DES RÉSERVATIONS POUR LE FILTRAGE ================= */
  const allReservations = useMemo(() => {
    // Fusionner les deux listes en évitant les doublons
    const combinedMap = new Map<string, DigitalReservationRow>();
    
    // Ajouter d'abord les réservations à vérifier
    verificationReservations.forEach(r => {
      const key = `${r.agencyId}_${r.id}`;
      combinedMap.set(key, r);
    });
    
    // Ajouter les autres réservations (elles remplacent celles qui auraient changé de statut)
    otherReservations.forEach(r => {
      const key = `${r.agencyId}_${r.id}`;
      // Ne pas écraser une réservation qui est encore à vérifier
      if (!combinedMap.has(key) || combinedMap.get(key)?.reservation.status !== 'verification') {
        combinedMap.set(key, r);
      }
    });
    
    return Array.from(combinedMap.values()).sort((a, b) => {
      const ta = a.createdAt instanceof Timestamp 
        ? a.createdAt.toMillis() 
        : new Date(a.createdAt).getTime();
      const tb = b.createdAt instanceof Timestamp 
        ? b.createdAt.toMillis() 
        : new Date(b.createdAt).getTime();
      return tb - ta;
    });
  }, [verificationReservations, otherReservations]);

  /* ================= FILTRAGE AVEC PÉRIODE ================= */
  const filterReservationsByPeriod = (reservations: DigitalReservationRow[], period: FilterOptions['period']) => {
    const { start, end } = getPeriodDates(period);
    
    return reservations.filter(reservation => {
      let reservationDate: Date;
      
      if (reservation.createdAt instanceof Timestamp) {
        reservationDate = reservation.createdAt.toDate();
      } else if (typeof reservation.createdAt === 'string') {
        reservationDate = new Date(reservation.createdAt);
      } else if (reservation.createdAt instanceof Date) {
        reservationDate = reservation.createdAt;
      } else {
        return false;
      }
      
      return reservationDate >= start && reservationDate <= end;
    });
  };

  const statusDateForReservation = (reservation: DigitalReservationRow) => {
    if (reservation.reservation.status === "confirme") {
      return reservation.validatedAt ?? reservation.ticketValidatedAt ?? reservation.createdAt;
    }
    if (reservation.reservation.status === "refuse") {
      return reservation.refusedAt ?? reservation.createdAt;
    }
    return reservation.createdAt;
  };

  const filterReservationsByBusinessPeriod = (
    reservations: DigitalReservationRow[],
    period: FilterOptions['period']
  ) => {
    const { start, end } = getPeriodDates(period);

    return reservations.filter((reservation) => {
      const ms = dateValueMs(statusDateForReservation(reservation));
      if (!ms) return false;
      const reservationDate = new Date(ms);
      return reservationDate >= start && reservationDate <= end;
    });
  };

  /* ================= CORRECTION DU BUG DU FILTRE "CONFIRMÉES" ================= */
  const filteredReservations = useMemo(() => {
    // Appliquer d'abord les filtres par période
    const periodFilteredAll = filterReservationsByPeriod(allReservations, filterPeriod);
    const periodFilteredVerification = filterReservationsByPeriod(verificationReservations, filterPeriod);

    // Puis appliquer le filtre par agence (si sélectionnée)
    const agencyFilteredAll = filterAgencyId
      ? periodFilteredAll.filter(r => r.agencyId === filterAgencyId)
      : periodFilteredAll;
    const agencyFilteredVerification = filterAgencyId
      ? periodFilteredVerification.filter(r => r.agencyId === filterAgencyId)
      : periodFilteredVerification;

    // Enfin appliquer le filtre par statut
    let result = agencyFilteredAll;
    if (filterStatus === 'verification') {
      result = agencyFilteredVerification;
    } else if (filterStatus) {
      // 🔧 CORRECTION CRITIQUE : Bien filtrer par statut normalisé
      result = agencyFilteredAll.filter(r => r.reservation.status === filterStatus);
    }
    
    // Enfin appliquer la recherche textuelle
    if (!searchTerm) return result;
    
    const term = searchTerm.toLowerCase();
    return result.filter((r) => {
      const searchable = [
        r.customer.name || '',
        r.customer.phone || '',
        r.referenceCode || '',
        r.trip.departure || '',
        r.trip.arrival || '',
        r.email || '',
        r.payment.reference || r.payment.wallet || r.proof.message || '',
      ].join(' ').toLowerCase();
      
      return searchable.includes(term);
    });
  }, [allReservations, verificationReservations, searchTerm, filterStatus, filterPeriod, filterAgencyId]);

  /* ================= STATISTIQUES AVEC FILTRE DE PÉRIODE ================= */
  const stats = useMemo(() => {
    const periodFilteredAll = filterReservationsByPeriod(allReservations, filterPeriod);
    const periodFilteredVerification = filterReservationsByPeriod(verificationReservations, filterPeriod);

    const agencyFilteredAll = filterAgencyId
      ? periodFilteredAll.filter(r => r.agencyId === filterAgencyId)
      : periodFilteredAll;
    const agencyFilteredVerification = filterAgencyId
      ? periodFilteredVerification.filter(r => r.agencyId === filterAgencyId)
      : periodFilteredVerification;
    
    return {
      enAttente: agencyFilteredAll.filter(r => r.reservation.status === 'en_attente').length,
      verification: agencyFilteredVerification.length,
      confirme: agencyFilteredAll.filter(r => r.reservation.status === 'confirme').length,
      refuse: agencyFilteredAll.filter(r => r.reservation.status === 'refuse').length,
      annule: agencyFilteredAll.filter(r => r.reservation.status === 'annule').length,
      total: agencyFilteredAll.length,
      totalAmount: agencyFilteredAll.reduce((sum, r) => sum + r.payment.amount, 0)
    };
  }, [allReservations, verificationReservations, filterPeriod, filterAgencyId]);

  /* ================= ACTIONS ================= */
  const handleValidate = async (reservation: DigitalReservationRow) => {
    if (!user?.companyId || !reservation.agencyId || !reservation.id) {
      toast.error('Erreur', { description: 'Informations manquantes' });
      return;
    }
    
    setProcessingId(reservation.id);
    try {
      const reservationRef = doc(
        db,
        'companies',
        user.companyId,
        'agences',
        reservation.agencyId,
        'reservations',
        reservation.id
      );
      const snap = await getDoc(reservationRef);
      if (!snap.exists()) {
        toast.error('Erreur', { description: 'Réservation introuvable' });
        return;
      }
      const raw = snap.data() as Record<string, unknown>;
      const r = normalizeReservation(raw);
      const data = raw as any;
      const reservationStatus = String(r.reservation.status ?? '').toLowerCase();
      const paymentStatus = String(r.payment.status ?? '').toLowerCase();
      const canConfirm =
        ((paymentStatus === 'paid' || paymentStatus === 'validated' || reservationStatus === 'payé' || reservationStatus === 'paye') &&
          !data?.ticketValidatedAt) ||
        paymentStatus === 'pending_validation' ||
        reservationStatus === 'preuve_recue';
      if (!canConfirm) {
        toast.error('Erreur', { description: 'Cette réservation ne peut plus être confirmée' });
        return;
      }
      const montant = r.payment.amount;
      const paymentMethodLabel = r.payment.method ?? '';
      let ensured;
      try {
        ensured = await ensurePendingOnlinePaymentFromReservation({
          companyId: user.companyId,
          agencyId: reservation.agencyId,
          reservationId: reservation.id,
          montant,
          paymentMethodLabel,
        });
      } catch (e) {
        console.error('handleValidate: ensurePendingOnlinePaymentFromReservation failed', e);
        throw e;
      }
      if (!ensured.ok) {
        toast.error('Erreur', {
          description: ensured.error ?? 'Impossible de préparer le paiement en ligne pour cette réservation.',
        });
        return;
      }

      let payment;
      try {
        payment = await getPaymentByReservationId(user.companyId, reservation.id);
      } catch (e) {
        console.error('handleValidate: getPaymentByReservationId failed', e);
        throw e;
      }
      if (!payment) {
        toast.error('Erreur', {
          description: 'Aucun paiement en attente pour cette réservation. Vérifiez la configuration ou contactez le support.',
        });
        return;
      }
      if (payment.status === 'pending') {
        try {
          await validatePendingOnlinePaymentAndSyncReservation(payment, user.companyId, {
            uid: user.uid ?? '',
            role: (user as { role?: string | string[] }).role,
          });
        } catch (e) {
          console.error('handleValidate: validatePendingOnlinePaymentAndSyncReservation failed', e);
          throw e;
        }
      } else {
        toast.error('Erreur', {
          description:
            `Ce paiement n'est pas en attente (statut : ${payment.status}). Impossible de valider depuis cet écran sans flux confirmPayment pending.`,
        });
        return;
      }

      // CRM: sync customer (create or update stats by phone)
      const phone = r.customer.phone ?? reservation.customer.phone ?? '';
      const departureDate = r.trip.date ?? reservation.trip.date ?? '';
      if (phone) {
        upsertCustomerFromReservation({
          companyId: user.companyId,
          name: r.customer.name ?? reservation.customer.name ?? '',
          phone,
          email: (data?.email ?? reservation.email) ?? null,
          montant,
          departureDate: departureDate || new Date().toISOString().slice(0, 10),
        }).catch(() => {});
      }
      
      // Garder la carte visible avec état "Billet validé" + boutons (PDF, WhatsApp, Copier)
      const validatedRow = buildDigitalReservationRow({
        id: reservation.id,
        agencyId: reservation.agencyId,
        companyId: reservation.companyId ?? user.companyId,
        raw,
        statusOverride: 'confirme',
        companySlugFallback: reservation.companySlug || data?.companySlug || (company as { slug?: string })?.slug,
      });
      setRecentlyValidatedReservations(prev => [validatedRow, ...prev]);

      // Retirer de la liste des réservations à vérifier (le snapshot le fera aussi)
      setVerificationReservations(prev => 
        prev.filter(r => !(r.id === reservation.id && r.agencyId === reservation.agencyId))
      );

      // Afficher immédiatement les actions de suivi (copie lien + WhatsApp)
      setFilterTab('history');
      setActiveView('validated');
      
      // Réinitialiser la notification pour cette réservation
      resetNotification(`${reservation.agencyId}_${reservation.id}`);
      
      toast.success('Réservation confirmée', {
        description: `Le billet est maintenant disponible pour ${reservation.customer.name || 'ce client'}`,
      });
      playSoundNow();
    } catch (error) {
      console.error('Erreur lors de la validation:', error);
      toast.error('Erreur', {
        description: 'Impossible de confirmer la réservation',
      });
    } finally {
      setProcessingId(null);
    }
  };

  const handleRefuse = async (reservation: DigitalReservationRow) => {
    if (!user?.companyId || !reservation.agencyId || !reservation.id) {
      toast.error('Erreur', { description: 'Informations manquantes' });
      return;
    }
    
    setProcessingId(reservation.id);
    try {
      const reservationRef = doc(
        db,
        'companies',
        user.companyId,
        'agences',
        reservation.agencyId,
        'reservations',
        reservation.id
      );
      const snap = await getDoc(reservationRef);
      if (!snap.exists()) {
        toast.error('Erreur', { description: 'Réservation introuvable' });
        return;
      }
      const raw = snap.data() as Record<string, unknown>;
      const r = normalizeReservation(raw);
      const data = raw as any;
      const reservationStatus = String(r.reservation.status ?? '').toLowerCase();
      const paymentStatus = String(r.payment.status ?? '').toLowerCase();
      const canRefuse =
        ((paymentStatus === 'paid' || paymentStatus === 'validated' || reservationStatus === 'payé' || reservationStatus === 'paye') &&
          !data?.ticketValidatedAt) ||
        paymentStatus === 'pending_validation' ||
        reservationStatus === 'preuve_recue';
      if (!canRefuse) {
        toast.error('Erreur', { description: 'Cette réservation ne peut plus être refusée' });
        return;
      }

      // ============================================================
      // 🔥 CORRECTION CRITIQUE : Utiliser le service métier
      // au lieu de updateDoc direct avec status: 'annulé'
      // ============================================================
      
      // 1. Récupérer le montant et le moyen de paiement
      const montant = r.payment.amount;
      const paymentMethodLabel = r.payment.method ?? '';
      
      // 2. S'assurer qu'un payment existe
      let ensured;
      try {
        ensured = await ensurePendingOnlinePaymentFromReservation({
          companyId: user.companyId,
          agencyId: reservation.agencyId,
          reservationId: reservation.id,
          montant,
          paymentMethodLabel,
        });
      } catch (e) {
        console.error('handleRefuse: ensurePendingOnlinePaymentFromReservation failed', e);
        throw e;
      }
      if (!ensured.ok) {
        toast.error('Erreur', {
          description: ensured.error ?? 'Impossible de préparer le paiement en ligne pour cette réservation.',
        });
        return;
      }

      // 3. Récupérer le payment
      let payment;
      try {
        payment = await getPaymentByReservationId(user.companyId, reservation.id);
      } catch (e) {
        console.error('handleRefuse: getPaymentByReservationId failed', e);
        throw e;
      }
      if (!payment) {
        toast.error('Erreur', {
          description: 'Aucun paiement trouvé pour cette réservation.',
        });
        return;
      }

      // 4. Utiliser le service de refus (même flux que la validation)
      try {
        await rejectPendingOnlinePaymentAndSyncReservation(
          payment,
          user.companyId,
          {
            uid: user.uid ?? '',
            role: (user as { role?: string | string[] }).role,
          },
          'Refus opérateur digital'
        );
      } catch (e) {
        console.error('handleRefuse: rejectPendingOnlinePaymentAndSyncReservation failed', e);
        throw e;
      }

      // 5. Décrémenter les sièges si nécessaire
      const tripInstanceId = data.tripInstanceId ?? null;
      const seats = (data.seatsGo ?? 0) + (data.seatsReturn ?? 0);
      if (tripInstanceId && seats > 0) {
        decrementReservedSeats(user.companyId, tripInstanceId, seats, {
          originStopOrder: data?.originStopOrder as number | null | undefined,
          destinationStopOrder: data?.destinationStopOrder as number | null | undefined,
          depart: r.trip.departure ?? "",
          arrivee: r.trip.arrival ?? "",
        }).catch((err) => {
          console.error('[ReservationsEnLigne] decrementReservedSeats on refuse:', err);
        });
      }

      // Ajouter à l'historique UI (refus) pour éviter toute perte d'information.
      const refusedRow = buildDigitalReservationRow({
        id: reservation.id,
        agencyId: reservation.agencyId,
        companyId: reservation.companyId ?? user.companyId,
        raw,
        statusOverride: 'refuse',
        companySlugFallback: reservation.companySlug || data?.companySlug || (company as { slug?: string })?.slug,
      });
      setRecentlyRefusedReservations((prev) => [refusedRow, ...prev]);
      
      // Retirer de la liste des réservations à vérifier
      setVerificationReservations(prev => 
        prev.filter(r => !(r.id === reservation.id && r.agencyId === reservation.agencyId))
      );

      // Afficher l'historique tout de suite
      setFilterTab('history');
      setActiveView('refused');
      
      // Réinitialiser la notification pour cette réservation
      resetNotification(`${reservation.agencyId}_${reservation.id}`);
      
      toast.info('Réservation refusée', {
        description: `La réservation de ${reservation.customer.name || 'ce client'} a été refusée`,
      });
    } catch (error) {
      console.error('Erreur lors du refus:', error);
      toast.error('Erreur', {
        description: 'Impossible de refuser la réservation',
      });
    } finally {
      setProcessingId(null);
    }
  };

  const handleDelete = async (reservation: DigitalReservationRow) => {
    if (!user?.companyId || !reservation.agencyId || !reservation.id) {
      toast.error('Erreur', { description: 'Informations manquantes' });
      return;
    }
    
    if (!window.confirm('Êtes-vous sûr de vouloir supprimer cette réservation ?')) {
      return;
    }
    
    setProcessingId(reservation.id);
    try {
      await deleteDoc(
        doc(
          db,
          'companies',
          user.companyId,
          'agences',
          reservation.agencyId,
          'reservations',
          reservation.id
        )
      );
      
      // Retirer des listes locales
      if (reservation.reservation.status === 'verification') {
        setVerificationReservations(prev => 
          prev.filter(r => !(r.id === reservation.id && r.agencyId === reservation.agencyId))
        );
        resetNotification(`${reservation.agencyId}_${reservation.id}`);
      } else {
        setOtherReservations(prev => 
          prev.filter(r => !(r.id === reservation.id && r.agencyId === reservation.agencyId))
        );
      }
      
      toast.success('Réservation supprimée', {
        description: 'La réservation a été supprimée avec succès',
      });
    } catch (error) {
      console.error('Erreur lors de la suppression:', error);
      toast.error('Erreur', {
        description: 'Impossible de supprimer la réservation',
      });
    } finally {
      setProcessingId(null);
    }
  };

  const handleViewDetails = (reservation: DigitalReservationRow) => {
    if (!reservation.companySlug || !reservation.id) {
      toast.error('Erreur', { description: 'Impossible d\'afficher les détails' });
      return;
    }
    
    navigate(`/${reservation.companySlug}/reservation/${reservation.id}`, {
      state: { 
        companyId: user?.companyId,
        agencyId: reservation.agencyId,
        companyInfo: { id: user?.companyId }
      }
    });
  };

  const handleRefresh = () => {
    setRefreshing(true);
    loadOtherReservations(otherPage);
    setTimeout(() => setRefreshing(false), 1000);
  };

  const loadMoreReservations = () => {
    loadOtherReservations(otherPage + 1);
  };

  /* ================= TOP AGENCES ================= */
  const topAgencies = useMemo(() => {
    const periodFiltered = filterReservationsByPeriod(allReservations, filterPeriod);
    const agencyStats: Record<string, { count: number, amount: number }> = {};
    
    periodFiltered.forEach(r => {
      if (r.agencyId && agencies[r.agencyId]) {
        if (!agencyStats[r.agencyId]) {
          agencyStats[r.agencyId] = { count: 0, amount: 0 };
        }
        agencyStats[r.agencyId].count++;
        agencyStats[r.agencyId].amount += r.payment.amount;
      }
    });
    
    return Object.entries(agencyStats)
      .map(([id, stats]) => ({
        id,
        name: agencies[id]?.name || 'Agence inconnue',
        ville: agencies[id]?.ville || '',
        count: stats.count,
        amount: stats.amount
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
  }, [allReservations, agencies, filterPeriod]);

  /* ================= FORMATTERS ================= */
  const fmtMoney = (n: number) => money(n);
  const fmtDate = (date?: string | Date | Timestamp | null) => {
    if (!date) return 'N/A';
    
    let jsDate: Date;
    if (date instanceof Timestamp) {
      jsDate = date.toDate();
    } else if (typeof date === 'string') {
      jsDate = new Date(date);
    } else if (date instanceof Date) {
      jsDate = date;
    } else {
      return 'N/A';
    }
    
    return jsDate.toLocaleDateString('fr-FR', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getProofUrl = (reservation: DigitalReservationRow) => reservation.proof.url;

  const isImageProofUrl = (url?: string | null) => {
    if (!url) return false;
    const s = url.toLowerCase();
    if (s.startsWith("data:image/")) return true;
    return /\.(png|jpe?g|gif|webp|bmp|svg)(\?.*)?$/.test(s);
  };

  const getCardKey = (r: DigitalReservationRow) => `${r.agencyId}_${r.id ?? ""}`;

  const handleCopyBilletLink = async (reservation: DigitalReservationRow) => {
    const billetUrl = getBilletUrl(reservation, (company as any)?.slug);
    if (!billetUrl) {
      toast.error("Billet indisponible");
      return;
    }
    try {
      await navigator.clipboard.writeText(billetUrl);
      toast.success("Lien copié");
    } catch {
      toast.error("Erreur", { description: "Impossible de copier le lien." });
    }
  };

  const handleOpenWhatsApp = (reservation: DigitalReservationRow) => {
    const phone = toWhatsAppPhone(reservation.customer.phone || "");
    if (!phone) {
      toast.error("Téléphone manquant", { description: "Impossible d'ouvrir WhatsApp." });
      return;
    }
    const companyName =
      (company as any)?.name || (company as any)?.nom || (company as any)?.brandName || "Compagnie";
    const billetUrl = getBilletUrl(reservation, (company as any)?.slug);
    if (!billetUrl) {
      toast.error("Billet indisponible", { description: "Impossible de générer le lien WhatsApp." });
      return;
    }

    const message = getBilletConfirmationMessage(reservation, billetUrl, companyName);
    const waUrl = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
    window.open(waUrl, "_blank", "noopener,noreferrer");
  };

  /* Chargement "sur demande" des autres statuts */
  useEffect(() => {
    if (!user?.companyId) return;
    if ((filterTab !== "pending" || activeView === "validated" || activeView === "refused") && otherReservations.length === 0) {
      if (!requestedOtherReservations) {
        setRequestedOtherReservations(true);
        loadOtherReservations(1);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterTab, activeView, user?.companyId, otherReservations.length, requestedOtherReservations]);

  /* ================= RENDU ================= */
  const pendingReservations = verificationReservations;

  const historyReservations = useMemo(() => {
    const merged: DigitalReservationRow[] = [
      ...recentlyValidatedReservations,
      ...recentlyRefusedReservations,
      ...otherReservations.filter((r) => r.reservation.status === "confirme" || r.reservation.status === "refuse"),
    ];

    // Dedup par clé
    const map = new Map<string, DigitalReservationRow>();
    merged.forEach((r) => {
      const key = `${r.agencyId}_${r.id}`;
      map.set(key, r);
    });
    return Array.from(map.values()).sort((a, b) => {
      const ta =
        a.createdAt instanceof Timestamp ? a.createdAt.toMillis() : new Date(a.createdAt as any).getTime();
      const tb =
        b.createdAt instanceof Timestamp ? b.createdAt.toMillis() : new Date(b.createdAt as any).getTime();
      return tb - ta;
    });
  }, [recentlyValidatedReservations, recentlyRefusedReservations, otherReservations]);

  const periodReservations = useMemo(
    () => filterReservationsByBusinessPeriod([...pendingReservations, ...historyReservations], filterPeriod),
    [pendingReservations, historyReservations, filterPeriod, customStartDate, customEndDate]
  );

  const validatedReservations = useMemo(
    () => historyReservations.filter((r) => r.reservation.status === "confirme"),
    [historyReservations]
  );

  const refusedReservations = useMemo(
    () => historyReservations.filter((r) => r.reservation.status === "refuse"),
    [historyReservations]
  );

  const visibleValidatedReservations = useMemo(
    () =>
      filterReservationsByBusinessPeriod(validatedReservations, filterPeriod).sort(
        (a, b) => dateValueMs(statusDateForReservation(b)) - dateValueMs(statusDateForReservation(a))
      ),
    [validatedReservations, filterPeriod, customStartDate, customEndDate]
  );

  const visibleRefusedReservations = useMemo(
    () =>
      filterReservationsByBusinessPeriod(refusedReservations, filterPeriod).sort(
        (a, b) => dateValueMs(statusDateForReservation(b)) - dateValueMs(statusDateForReservation(a))
      ),
    [refusedReservations, filterPeriod, customStartDate, customEndDate]
  );

  const providerLabel = (value?: string | null) => {
    const raw = String(value ?? "").trim();
    if (!raw) return "Autre";
    return raw
      .replace(/[_-]+/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .replace(/\b\p{L}/gu, (letter) => letter.toLocaleUpperCase("fr"));
  };

  const providerMatchKey = (value?: string | null) =>
    String(value ?? "")
      .trim()
      .toLocaleLowerCase("fr")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[_-]+/g, " ")
      .replace(/\s+/g, " ");

  const reservationProviderLabel = (reservation: DigitalReservationRow) => {
    const method = reservation.payment.method || reservation.payment.wallet || reservation.proof.message || "";
    return providerLabel(method);
  };

  const rowTimeMs = (date?: string | Date | Timestamp | null) => {
    return dateValueMs(date);
  };

  const ageLabel = (date?: string | Date | Timestamp | null) => {
    const ms = rowTimeMs(date);
    if (!ms) return "Non disponible";
    const minutes = Math.max(0, Math.floor((Date.now() - ms) / 60000));
    if (minutes < 60) return `${minutes} min`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours} h`;
    return `${Math.floor(hours / 24)} j`;
  };

  const financialRowTimeMs = (row: OnlineFinancialRow) =>
    row.performedAt?.toMillis() ?? row.createdAt?.toMillis() ?? 0;

  const inDateRange = (ms: number, start: Date, end: Date) =>
    ms >= start.getTime() && ms <= end.getTime();

  const shortDayLabel = (date: Date) =>
    date.toLocaleDateString("fr-FR", { weekday: "short", day: "2-digit" }).replace(".", "");

  const digitalStats = useMemo(() => {
    const today = new Date();
    const dayRows = Array.from({ length: 7 }, (_, index) => {
      const day = new Date(today);
      day.setDate(today.getDate() - (6 - index));
      day.setHours(0, 0, 0, 0);
      const end = new Date(day);
      end.setHours(23, 59, 59, 999);

      const validated = validatedReservations.filter((row) =>
        inDateRange(dateValueMs(statusDateForReservation(row)), day, end)
      ).length;
      const refused = refusedReservations.filter((row) =>
        inDateRange(dateValueMs(statusDateForReservation(row)), day, end)
      ).length;
      const confirmedAmount = monthlyOnlineFinancialRows
        .filter((row) => inDateRange(financialRowTimeMs(row), day, end))
        .reduce((sum, row) => sum + Math.abs(Number(row.amount ?? 0)), 0);

      return {
        key: day.toISOString().slice(0, 10),
        label: shortDayLabel(day),
        validated,
        refused,
        confirmedAmount,
        total: validated + refused,
      };
    });

    const peak = Math.max(1, ...dayRows.map((row) => row.total));
    return { dayRows, peak };
  }, [monthlyOnlineFinancialRows, refusedReservations, validatedReservations]);

  const digitalReports = useMemo(() => {
    const now = new Date();
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date(now);
    todayEnd.setHours(23, 59, 59, 999);
    const weekStart = new Date(todayStart);
    weekStart.setDate(todayStart.getDate() - 6);
    const monthStart = new Date(todayStart.getFullYear(), todayStart.getMonth(), 1);
    const monthEnd = new Date(todayStart.getFullYear(), todayStart.getMonth() + 1, 0, 23, 59, 59, 999);

    const makeReport = (label: string, start: Date, end: Date) => {
      const validated = validatedReservations.filter((row) =>
        inDateRange(dateValueMs(statusDateForReservation(row)), start, end)
      );
      const refused = refusedReservations.filter((row) =>
        inDateRange(dateValueMs(statusDateForReservation(row)), start, end)
      );
      const confirmedAmount = monthlyOnlineFinancialRows
        .filter((row) => inDateRange(financialRowTimeMs(row), start, end))
        .reduce((sum, row) => sum + Math.abs(Number(row.amount ?? 0)), 0);

      return {
        label,
        validated: validated.length,
        refused: refused.length,
        confirmedAmount,
      };
    };

    const agencyValidationRows = [...validatedReservations]
      .reduce((map, row) => {
        const key = row.agencyId || "unknown";
        const current = map.get(key) ?? { id: key, label: agencies[key]?.name || "Agence inconnue", count: 0 };
        current.count += 1;
        map.set(key, current);
        return map;
      }, new Map<string, { id: string; label: string; count: number }>());

    const refusalReasonRows = [...visibleRefusedReservations]
      .reduce((map, row) => {
        const label = row.refusalReason || "Motif non renseigné";
        map.set(label, (map.get(label) ?? 0) + 1);
        return map;
      }, new Map<string, number>());

    return {
      periodRows: [
        makeReport("Rapport du jour", todayStart, todayEnd),
        makeReport("Rapport semaine", weekStart, todayEnd),
        makeReport("Rapport mois", monthStart, monthEnd),
      ],
      agencyValidationRows: Array.from(agencyValidationRows.values())
        .sort((a, b) => b.count - a.count)
        .slice(0, 4),
      refusalReasonRows: Array.from(refusalReasonRows.entries())
        .map(([label, count]) => ({ label, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 4),
    };
  }, [
    agencies,
    monthlyOnlineFinancialRows,
    refusedReservations,
    validatedReservations,
    visibleRefusedReservations,
  ]);

  const digitalDashboard = useMemo(() => {
    const pendingAmount = pendingReservations.reduce((sum, row) => sum + Number(row.payment.amount ?? 0), 0);
    const confirmedAmount = onlineFinancialRows.reduce((sum, row) => sum + Number(row.amount ?? 0), 0);
    const validatedCount = visibleValidatedReservations.length;
    const refusedCount = visibleRefusedReservations.length;
    const handled = validatedCount + refusedCount;
    const acceptanceRate = handled > 0 ? Math.round((validatedCount / handled) * 100) : null;

    const providerTotals = new Map<string, number>();
    onlineFinancialRows.forEach((row) => {
      const reliable = row.metadata?.paymentProviderSource === "reservation.preuveVia";
      const label = providerLabel(reliable ? row.paymentProvider : null);
      providerTotals.set(label, (providerTotals.get(label) ?? 0) + Math.abs(Number(row.amount ?? 0)));
    });

    const agencyTotals = new Map<string, { count: number; amount: number }>();
    periodReservations.forEach((row) => {
      const current = agencyTotals.get(row.agencyId) ?? { count: 0, amount: 0 };
      current.count += 1;
      current.amount += Number(row.payment.amount ?? 0);
      agencyTotals.set(row.agencyId, current);
    });

    const routeTotals = new Map<string, { count: number; amount: number }>();
    periodReservations.forEach((row) => {
      const route = `${row.trip.departure || "Trajet incomplet"} → ${row.trip.arrival || "Trajet incomplet"}`;
      const current = routeTotals.get(route) ?? { count: 0, amount: 0 };
      current.count += 1;
      current.amount += Number(row.payment.amount ?? 0);
      routeTotals.set(route, current);
    });

    const providerRows = Array.from(providerTotals.entries())
      .map(([label, amount]) => ({ label, amount }))
      .sort((a, b) => b.amount - a.amount);
    const agencyRows = Array.from(agencyTotals.entries())
      .map(([agencyId, value]) => ({
        id: agencyId,
        label: agencies[agencyId]?.name || "Agence inconnue",
        ...value,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
    const routeRows = Array.from(routeTotals.entries())
      .map(([label, value]) => ({ label, ...value }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    const urgentRows = [...pendingReservations]
      .filter((row) => {
        const info = getPaymentInfo(row);
        const ageMinutes = rowTimeMs(row.createdAt) ? (Date.now() - rowTimeMs(row.createdAt)) / 60000 : 0;
        const detectedAmount = info.parsedAmount;
        const expectedAmount = Number(row.payment.amount ?? 0);
        return (
          ageMinutes >= 30 ||
          info.validationLevel === "suspicious" ||
          info.validationLevel === "invalid" ||
          (detectedAmount != null && expectedAmount > 0 && detectedAmount !== expectedAmount)
        );
      })
      .sort((a, b) => rowTimeMs(a.createdAt) - rowTimeMs(b.createdAt))
      .slice(0, 6);

    return {
      pendingCount: pendingReservations.length,
      validatedCount,
      refusedCount,
      pendingAmount,
      confirmedAmount,
      acceptanceRate,
      providerRows,
      agencyRows,
      routeRows,
      dominantProvider: providerRows[0]?.label ?? "Aucun",
      topAgency: agencyRows[0]?.label ?? "Aucun",
      topRoute: routeRows[0]?.label ?? "Aucun",
      urgentRows,
    };
  }, [
    agencies,
    onlineFinancialRows,
    pendingReservations,
    periodReservations,
    visibleRefusedReservations,
    visibleValidatedReservations,
  ]);

  const mobileMoneyReadout = useMemo(() => {
    const methodAliases = configuredPaymentMethods.map((method) => ({
      method,
      aliases: [method.id, method.label, method.providerCode]
        .map((value) => providerMatchKey(value))
        .filter(Boolean),
    }));

    const findConfiguredMethod = (row: OnlineFinancialRow) => {
      const providerKey = providerMatchKey(row.paymentProvider ?? asOptionalString(row.metadata?.provider));
      if (!providerKey) return null;
      return methodAliases.find(({ aliases }) => aliases.includes(providerKey))?.method ?? null;
    };

    const totalsByMethod = new Map(configuredPaymentMethods.map((method) => [method.id, 0]));
    const configuredPayments = onlineFinancialRows.filter((row) => {
      const method = findConfiguredMethod(row);
      if (!method) return false;
      totalsByMethod.set(method.id, (totalsByMethod.get(method.id) ?? 0) + Math.abs(Number(row.amount ?? 0)));
      return true;
    });

    const providerRows = configuredPaymentMethods.map((method) => ({
      id: method.id,
      label: method.label,
      amount: totalsByMethod.get(method.id) ?? 0,
    }));
    const lastPayment = [...configuredPayments].sort(
      (a, b) => financialRowTimeMs(b) - financialRowTimeMs(a)
    )[0] ?? null;
    const lastPaymentMethod = lastPayment ? findConfiguredMethod(lastPayment) : null;

    return {
      providerRows,
      totalAmount: providerRows.reduce((sum, row) => sum + row.amount, 0),
      lastPayment,
      lastPaymentLabel: lastPaymentMethod?.label ?? null,
    };
  }, [configuredPaymentMethods, onlineFinancialRows]);

  const visibleReservations = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();

    let list: DigitalReservationRow[] = [];
    if (filterTab === "pending") {
      list = pendingReservations;
    } else if (filterTab === "history") {
      list = historyReservations;
    } else if (filterTab === "today") {
      list = filterReservationsByPeriod(
        [...pendingReservations, ...historyReservations],
        "today"
      );
    } else {
      // all
      list = [...pendingReservations, ...historyReservations];
    }

    if (filterAgencyId) list = list.filter((r) => r.agencyId === filterAgencyId);

    if (filterTab === "pending") {
      list = [...list].sort((a, b) => {
        const pa = getPriorityRank(a);
        const pb = getPriorityRank(b);
        if (pa !== pb) return pa - pb;
        const ta = a.createdAt instanceof Timestamp ? a.createdAt.toMillis() : new Date(a.createdAt as any).getTime();
        const tb = b.createdAt instanceof Timestamp ? b.createdAt.toMillis() : new Date(b.createdAt as any).getTime();
        return tb - ta;
      });
    }

    if (!term) return list;

    return list.filter((r) => {
      const proofText =
        r.payment.reference || r.payment.wallet || r.proof.message || "";
      const info = getPaymentInfo(r);
      const searchable = [
        r.customer.name || "",
        r.customer.phone || "",
        r.referenceCode || "",
        proofText,
        String(info.parsedTransactionId ?? ""),
        String(info.parsedAmount ?? ""),
        r.trip.departure || "",
        r.trip.arrival || "",
      ]
        .join(" ")
        .toLowerCase();
    return searchable.includes(term);
    });
  }, [
    filterTab,
    pendingReservations,
    historyReservations,
    filterAgencyId,
    searchTerm,
  ]);

  const viewReservations = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    let list: DigitalReservationRow[] = [];

    if (activeView === "pending") {
      list = [...pendingReservations].sort((a, b) => {
        const pa = getPriorityRank(a);
        const pb = getPriorityRank(b);
        if (pa !== pb) return pa - pb;
        return rowTimeMs(a.createdAt) - rowTimeMs(b.createdAt);
      });
    } else if (activeView === "validated") {
      list = visibleValidatedReservations;
    } else if (activeView === "refused") {
      list = visibleRefusedReservations;
    }

    if (filterAgencyId) list = list.filter((row) => row.agencyId === filterAgencyId);
    if (!term) return list;

    return list.filter((row) => {
      const proofText = row.payment.reference || row.payment.wallet || row.proof.message || "";
      const info = getPaymentInfo(row);
      return [
        row.customer.name || "",
        row.customer.phone || "",
        row.referenceCode || "",
        proofText,
        String(info.parsedTransactionId ?? ""),
        String(info.parsedAmount ?? ""),
        row.trip.departure || "",
        row.trip.arrival || "",
        reservationProviderLabel(row),
      ].join(" ").toLowerCase().includes(term);
    });
  }, [
    activeView,
    filterAgencyId,
    pendingReservations,
    searchTerm,
    visibleRefusedReservations,
    visibleValidatedReservations,
  ]);

  const switchDigitalView = (next: DigitalOperatorView) => {
    setActiveView(next);
    if (next === "pending") setFilterTab("pending");
    if (next === "validated" || next === "refused") setFilterTab("history");
    if (next !== "dashboard" && otherReservations.length === 0 && !requestedOtherReservations) {
      setRequestedOtherReservations(true);
      loadOtherReservations(1);
    }
  };

  const waitingCount = useMemo(() => {
    let list = pendingReservations;
    if (filterAgencyId) list = list.filter((r) => r.agencyId === filterAgencyId);

    const term = searchTerm.trim().toLowerCase();
    if (term) {
      list = list.filter((r) => {
        const searchable = [
          r.customer.name || "",
          r.customer.phone || "",
          r.referenceCode || "",
          r.payment.reference || r.payment.wallet || r.proof.message || "",
        ]
          .join(" ")
          .toLowerCase();
        return searchable.includes(term);
      });
    }

    return list.length;
  }, [pendingReservations, filterAgencyId, searchTerm]);

  if (true) {
    const companyName =
      (company as any)?.nom || (company as any)?.name || (company as any)?.brandName || "Compagnie";
    const logoUrl = (company as any)?.logoUrl || (company as any)?.logo;
    const displayName = user?.displayName || user?.email || "Utilisateur";
    const role = user?.role ? String(user.role) : "operator_digital";
    const roleLabel =
      role === "operator_digital"
        ? "Opérateur digital"
        : role.replace(/_/g, " ");

    return (
      <div className="min-h-screen bg-white dark:bg-gray-900 text-gray-900 dark:text-white">
        <header
          className="w-full flex items-center justify-between gap-2 px-2 py-2 flex-nowrap"
          style={{ backgroundColor: (theme as any)?.primary ?? "#FF6600" }}
        >
          <div className="flex items-center gap-2 min-w-0">
            {logoUrl ? (
              <img
                src={logoUrl}
                alt={companyName}
                className="w-7 h-7 rounded-full object-cover bg-white/20 border border-white/20"
                onError={(e) => {
                  (e.currentTarget as HTMLImageElement).style.display = "none";
                }}
              />
            ) : (
              <div className="w-7 h-7 rounded-full bg-white/15 border border-white/20 flex items-center justify-center text-xs font-bold text-white shrink-0">
                {(companyName || "C").slice(0, 1).toUpperCase()}
              </div>
            )}
            <div className="min-w-0">
              <div className="text-sm font-bold text-white truncate whitespace-nowrap">
                {companyName}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-nowrap min-w-0">
            <div className="min-w-0 text-right">
              <div className="text-[11px] text-white/90 truncate whitespace-nowrap">
                {displayName}
              </div>
              <div className="text-[10px] text-white/75 truncate whitespace-nowrap">
                {roleLabel}
              </div>
            </div>

            <button
              type="button"
              onClick={toggleDarkMode}
              className="h-8 w-8 rounded-lg bg-white/15 hover:bg-white/25 border border-white/20 transition text-white shrink-0 flex items-center justify-center"
              aria-label="Mode sombre"
              title="Mode sombre"
            >
              {darkMode ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>

            <button
              type="button"
              onClick={async () => {
                try {
                  await logout();
                  navigate("/login");
                } catch (e) {
                  console.error(e);
                }
              }}
              className="h-8 px-3 rounded-lg bg-white/15 hover:bg-white/25 border border-white/20 transition text-white shrink-0 text-xs font-medium whitespace-nowrap flex items-center gap-2"
              aria-label="Déconnexion"
              title="Déconnexion"
            >
              <LogOut className="h-4 w-4" />
              <span className="hidden sm:inline">Déconnexion</span>
            </button>
          </div>
        </header>

        <div className="px-2 py-2 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <h1 className="text-base sm:text-xl font-bold truncate">Réservations en ligne</h1>
              <p className="text-xs text-gray-500 dark:text-gray-300 truncate">
                {waitingCount} preuve{waitingCount > 1 ? "s" : ""} à vérifier
              </p>
            </div>
            <button
              type="button"
              onClick={handleRefresh}
              className="h-9 w-9 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 flex items-center justify-center"
              title="Actualiser"
            >
              <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
            </button>
          </div>

          <div className="hidden md:grid grid-cols-4 gap-1 rounded-xl bg-gray-100 dark:bg-gray-800 p-1 sticky top-0 z-20">
            {[
              { id: "dashboard", label: "Aujourd'hui" },
              { id: "pending", label: "À traiter" },
              { id: "validated", label: "Validées" },
              { id: "refused", label: "Refusées" },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => switchDigitalView(tab.id as DigitalOperatorView)}
                className={`h-9 rounded-lg px-2 text-xs font-semibold transition ${
                  activeView === tab.id
                    ? "bg-white text-gray-950 shadow-sm dark:bg-gray-900 dark:text-white"
                    : "text-gray-600 dark:text-gray-300"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2 overflow-x-auto pb-1 flex-nowrap">
            <div className="relative flex-1 min-w-[140px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500 dark:text-gray-400" />
              <input
                type="text"
                className="w-full pl-10 pr-3 h-9 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-transparent"
                placeholder="Rechercher..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>

            <select
              value={filterPeriod}
              onChange={(e) => setFilterPeriod(e.target.value as FilterOptions["period"])}
              className="h-9 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white px-2 text-sm shrink-0"
            >
              <option value="today">Jour</option>
              <option value="week">Semaine</option>
              <option value="month">Mois</option>
              <option value="custom">Personnalisé</option>
              <option value="all">Tout</option>
            </select>

            <select
              value={filterAgencyId}
              onChange={(e) => setFilterAgencyId(e.target.value)}
              className="h-9 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white px-2 text-sm shrink-0"
              disabled={Object.keys(agencies).length === 0}
            >
              <option value="">Agence</option>
              {Object.entries(agencies).map(([agencyId, agency]) => (
                <option key={agencyId} value={agencyId}>
                  {agency.name}
                </option>
              ))}
            </select>
          </div>

          {filterPeriod === "custom" && (
            <div className="grid grid-cols-2 gap-2">
              <input
                type="date"
                value={customStartDate}
                onChange={(e) => setCustomStartDate(e.target.value)}
                className="h-9 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 text-sm"
              />
              <input
                type="date"
                value={customEndDate}
                onChange={(e) => setCustomEndDate(e.target.value)}
                className="h-9 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 text-sm"
              />
            </div>
          )}

          {activeView === "dashboard" && (
            <div className="space-y-3 pb-20 sm:pb-2">
              <div className="grid grid-cols-1 min-[380px]:grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-2">
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-2.5 dark:border-amber-800 dark:bg-amber-950/30">
                  <div className="text-[11px] text-amber-700 dark:text-amber-200 truncate">Demandes en attente</div>
                  <div className="mt-1 text-xl font-bold text-amber-900 dark:text-amber-100">{digitalDashboard.pendingCount}</div>
                </div>
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-2.5 dark:border-emerald-800 dark:bg-emerald-950/30">
                  <div className="text-[11px] text-emerald-700 dark:text-emerald-200 truncate">Validées</div>
                  <div className="mt-1 text-xl font-bold text-emerald-900 dark:text-emerald-100">{digitalDashboard.validatedCount}</div>
                </div>
                <div className="rounded-lg border border-red-200 bg-red-50 p-2.5 dark:border-red-800 dark:bg-red-950/30">
                  <div className="text-[11px] text-red-700 dark:text-red-200 truncate">Refusées</div>
                  <div className="mt-1 text-xl font-bold text-red-900 dark:text-red-100">{digitalDashboard.refusedCount}</div>
                </div>
                <div className="rounded-lg border border-violet-200 bg-violet-50 p-2.5 dark:border-violet-800 dark:bg-violet-950/30">
                  <div className="text-[11px] text-violet-700 dark:text-violet-200 truncate">Montant confirmé</div>
                  <div className="mt-1 text-base font-bold text-violet-900 dark:text-violet-100 truncate">
                    {financeLoading ? "Chargement..." : fmtMoney(digitalDashboard.confirmedAmount)}
                  </div>
                </div>
                <div className="rounded-lg border border-orange-200 bg-orange-50 p-2.5 dark:border-orange-800 dark:bg-orange-950/30">
                  <div className="text-[11px] text-orange-700 dark:text-orange-200 truncate">Montant en attente</div>
                  <div className="mt-1 text-base font-bold text-orange-900 dark:text-orange-100 truncate">{fmtMoney(digitalDashboard.pendingAmount)}</div>
                </div>
                <div className="rounded-lg border border-gray-200 bg-white p-2.5 dark:border-gray-700 dark:bg-gray-800">
                  <div className="text-[11px] text-gray-500 dark:text-gray-300 truncate">Portefeuille dominant</div>
                  <div className="mt-1 text-sm font-bold text-gray-950 dark:text-white truncate">{digitalDashboard.dominantProvider}</div>
                </div>
              </div>

              <div className="rounded-xl border border-gray-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-800">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <div>
                    <div className="text-sm font-bold text-gray-950 dark:text-white">Statistiques digitales</div>
                    <div className="text-xs text-gray-500 dark:text-gray-300">Activité online courte, validations et refus</div>
                  </div>
                  <TrendingUp className="h-4 w-4 text-gray-500" />
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-3">
                  <div className="rounded-lg bg-gray-50 p-2 dark:bg-gray-900">
                    <div className="text-[11px] text-gray-500">Validations période</div>
                    <div className="text-lg font-bold text-emerald-700 dark:text-emerald-300">{digitalDashboard.validatedCount}</div>
                  </div>
                  <div className="rounded-lg bg-gray-50 p-2 dark:bg-gray-900">
                    <div className="text-[11px] text-gray-500">Refus période</div>
                    <div className="text-lg font-bold text-red-700 dark:text-red-300">{digitalDashboard.refusedCount}</div>
                  </div>
                  <div className="rounded-lg bg-gray-50 p-2 dark:bg-gray-900">
                    <div className="text-[11px] text-gray-500">Confirmé</div>
                    <div className="text-sm font-bold text-gray-950 dark:text-white truncate">{fmtMoney(digitalDashboard.confirmedAmount)}</div>
                  </div>
                  <div className="rounded-lg bg-gray-50 p-2 dark:bg-gray-900">
                    <div className="text-[11px] text-gray-500">En attente</div>
                    <div className="text-sm font-bold text-gray-950 dark:text-white truncate">{fmtMoney(digitalDashboard.pendingAmount)}</div>
                  </div>
                </div>

                <div className="grid grid-cols-7 gap-1.5 items-end h-28">
                  {digitalStats.dayRows.map((row) => (
                    <div key={row.key} className="flex h-full min-w-0 flex-col justify-end gap-1">
                      <div className="flex h-20 items-end gap-0.5">
                        <div
                          className="flex-1 rounded-t bg-emerald-500"
                          style={{ height: `${Math.max(6, (row.validated / digitalStats.peak) * 100)}%` }}
                          title={`${row.validated} validation(s)`}
                        />
                        <div
                          className="flex-1 rounded-t bg-red-400"
                          style={{ height: `${Math.max(6, (row.refused / digitalStats.peak) * 100)}%` }}
                          title={`${row.refused} refus`}
                        />
                      </div>
                      <div className="truncate text-center text-[10px] text-gray-500 dark:text-gray-400">{row.label}</div>
                    </div>
                  ))}
                </div>
                <div className="mt-2 flex items-center gap-3 text-[11px] text-gray-500">
                  <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-emerald-500" /> Validations</span>
                  <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-red-400" /> Refus</span>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
                <div className="rounded-xl border border-gray-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-800">
                  <div className="mb-2 text-sm font-bold">Répartition par portefeuille</div>
                  {digitalDashboard.providerRows.length === 0 ? (
                    <p className="text-sm text-gray-500">Aucune donnée</p>
                  ) : (
                    <div className="space-y-2">
                      {digitalDashboard.providerRows.map((row) => (
                        <div key={row.label}>
                          <div className="flex items-center justify-between gap-2 text-sm">
                            <span className="truncate">{row.label}</span>
                            <span className="font-semibold">{fmtMoney(row.amount)}</span>
                          </div>
                          <div className="mt-1 h-2 rounded-full bg-gray-100 dark:bg-gray-700">
                            <div
                              className="h-2 rounded-full bg-violet-600"
                              style={{ width: `${Math.min(100, (row.amount / Math.max(1, digitalDashboard.confirmedAmount)) * 100)}%` }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="rounded-xl border border-gray-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-800">
                  <div className="mb-2 text-sm font-bold">Répartition par agence</div>
                  {digitalDashboard.agencyRows.length === 0 ? (
                    <p className="text-sm text-gray-500">Aucune donnée</p>
                  ) : (
                    <div className="space-y-2">
                      {digitalDashboard.agencyRows.map((row) => (
                        <div key={row.id} className="flex items-center justify-between gap-3 text-sm">
                          <span className="truncate">{row.label}</span>
                          <span className="font-semibold">{row.count}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="rounded-xl border border-gray-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-800">
                  <div className="mb-2 text-sm font-bold">Répartition par trajet</div>
                  {digitalDashboard.routeRows.length === 0 ? (
                    <p className="text-sm text-gray-500">Aucune donnée</p>
                  ) : (
                    <div className="space-y-2">
                      {digitalDashboard.routeRows.map((row) => (
                        <div key={row.label} className="flex items-center justify-between gap-3 text-sm">
                          <span className="break-words">{row.label}</span>
                          <span className="font-semibold">{row.count}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                <div className="rounded-xl border border-gray-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-800">
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <div>
                      <div className="text-sm font-bold text-gray-950 dark:text-white">Rapports</div>
                      <div className="text-xs text-gray-500 dark:text-gray-300">Synthèse simple du canal online</div>
                    </div>
                    <FileText className="h-4 w-4 text-gray-500" />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    {digitalReports.periodRows.map((report) => (
                      <div key={report.label} className="rounded-lg bg-gray-50 p-2 dark:bg-gray-900">
                        <div className="text-[11px] font-semibold text-gray-600 dark:text-gray-300">{report.label}</div>
                        <div className="mt-1 flex items-center justify-between text-xs">
                          <span>Validées</span>
                          <span className="font-bold text-emerald-700 dark:text-emerald-300">{report.validated}</span>
                        </div>
                        <div className="flex items-center justify-between text-xs">
                          <span>Refus</span>
                          <span className="font-bold text-red-700 dark:text-red-300">{report.refused}</span>
                        </div>
                        <div className="mt-1 truncate text-xs font-bold text-gray-950 dark:text-white">
                          {fmtMoney(report.confirmedAmount)}
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <div className="rounded-lg border border-gray-100 p-2 dark:border-gray-700">
                      <div className="mb-1 text-[11px] font-bold text-gray-500">Validations par agence</div>
                      {digitalReports.agencyValidationRows.length === 0 ? (
                        <div className="text-xs text-gray-500">Aucune donnée</div>
                      ) : (
                        <div className="space-y-1">
                          {digitalReports.agencyValidationRows.map((row) => (
                            <div key={row.id} className="flex items-center justify-between gap-2 text-xs">
                              <span className="truncate">{row.label}</span>
                              <span className="font-bold">{row.count}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="rounded-lg border border-gray-100 p-2 dark:border-gray-700">
                      <div className="mb-1 text-[11px] font-bold text-gray-500">Validations par portefeuille</div>
                      {digitalDashboard.providerRows.length === 0 ? (
                        <div className="text-xs text-gray-500">Aucune donnée</div>
                      ) : (
                        <div className="space-y-1">
                          {digitalDashboard.providerRows.slice(0, 4).map((row) => (
                            <div key={row.label} className="flex items-center justify-between gap-2 text-xs">
                              <span className="truncate">{row.label}</span>
                              <span className="font-bold">{fmtMoney(row.amount)}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="rounded-lg border border-gray-100 p-2 dark:border-gray-700">
                      <div className="mb-1 text-[11px] font-bold text-gray-500">Refus et motifs</div>
                      {digitalReports.refusalReasonRows.length === 0 ? (
                        <div className="text-xs text-gray-500">Aucune donnée</div>
                      ) : (
                        <div className="space-y-1">
                          {digitalReports.refusalReasonRows.map((row) => (
                            <div key={row.label} className="flex items-center justify-between gap-2 text-xs">
                              <span className="truncate">{row.label}</span>
                              <span className="font-bold">{row.count}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <div className="rounded-xl border border-violet-200 bg-violet-50 p-3 dark:border-violet-800 dark:bg-violet-950/20">
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <div>
                      <div className="text-sm font-bold text-violet-950 dark:text-violet-100">Lecture Mobile Money</div>
                      <div className="text-xs text-violet-700 dark:text-violet-200">Consultation uniquement, pilotage trésorerie séparé</div>
                    </div>
                    <Smartphone className="h-4 w-4 text-violet-700 dark:text-violet-200" />
                  </div>

                  <div className="rounded-lg bg-white p-2 dark:bg-gray-900">
                    <div className="text-[11px] text-gray-500">Total confirmé Mobile Money</div>
                    <div className="mt-1 text-xl font-bold text-gray-950 dark:text-white">
                      {financeLoading ? "Chargement..." : fmtMoney(mobileMoneyReadout.totalAmount)}
                    </div>
                  </div>

                  {mobileMoneyReadout.providerRows.length === 0 ? (
                    <div className="mt-2 rounded-lg bg-white p-3 text-sm text-gray-500 dark:bg-gray-900">
                      Aucun portefeuille Mobile Money configuré.
                    </div>
                  ) : (
                    <div className="mt-2 grid grid-cols-2 gap-2">
                      {mobileMoneyReadout.providerRows.map((row) => (
                        <div key={row.id} className="rounded-lg bg-white p-2 dark:bg-gray-900">
                          <div className="text-[11px] text-gray-500">{row.label}</div>
                          <div className="mt-1 truncate text-sm font-bold text-gray-950 dark:text-white">{fmtMoney(row.amount)}</div>
                        </div>
                      ))}
                    </div>
                  )}

                  {mobileMoneyReadout.providerRows.length > 0 && (
                    <div className="mt-2 rounded-lg bg-white p-2 dark:bg-gray-900">
                      <div className="text-[11px] text-gray-500">Dernier paiement validé</div>
                      {mobileMoneyReadout.lastPayment ? (
                        <div className="mt-1 space-y-1">
                          <div className="text-sm font-bold text-gray-950 dark:text-white">
                            {fmtMoney(mobileMoneyReadout.lastPayment.amount)} • {mobileMoneyReadout.lastPaymentLabel}
                          </div>
                          <div className="text-[11px] text-gray-500">
                            {fmtDate(mobileMoneyReadout.lastPayment.performedAt ?? mobileMoneyReadout.lastPayment.createdAt)}
                          </div>
                        </div>
                      ) : (
                        <div className="mt-1 text-xs text-gray-500">Aucun paiement confirmé sur la période.</div>
                      )}
                    </div>
                  )}

                  {user?.companyId && (
                    <button
                      type="button"
                      onClick={() => navigate(`/compagnie/${user.companyId}/accounting/treasury`)}
                      className="mt-2 inline-flex h-9 w-full items-center justify-center rounded-lg border border-violet-200 bg-white px-3 text-sm font-semibold text-violet-800 hover:bg-violet-100 dark:border-violet-800 dark:bg-gray-900 dark:text-violet-100 dark:hover:bg-violet-950"
                    >
                      Voir trésorerie
                    </button>
                  )}
                </div>
              </div>

              <div className="rounded-xl border border-red-200 bg-red-50 p-3 dark:border-red-800 dark:bg-red-950/30">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <div className="text-sm font-bold text-red-950 dark:text-red-100">File d'urgence</div>
                  <button type="button" className="text-xs font-semibold text-red-800 dark:text-red-200" onClick={() => setActiveView("pending")}>
                    Voir à traiter
                  </button>
                </div>
                {digitalDashboard.urgentRows.length === 0 ? (
                  <p className="text-sm text-red-700 dark:text-red-200">Aucune demande urgente.</p>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {digitalDashboard.urgentRows.map((row) => {
                      const info = getPaymentInfo(row);
                      return (
                        <button
                          key={`${row.agencyId}_${row.id}`}
                          type="button"
                          onClick={() => {
                            setActiveView("pending");
                            setExpandedCardKeys((prev) => ({ ...prev, [`${row.agencyId}_${row.id}`]: true }));
                          }}
                          className="rounded-lg border border-red-200 bg-white p-3 text-left text-sm dark:border-red-800 dark:bg-gray-900"
                        >
                          <div className="font-semibold text-gray-950 dark:text-white">{row.customer.name || "Client non renseigné"}</div>
                          <div className="mt-1 text-xs text-gray-600 dark:text-gray-300 break-words">
                            {row.trip.departure || "Trajet incomplet"} → {row.trip.arrival || "Trajet incomplet"}
                          </div>
                          <div className="mt-2 flex flex-wrap gap-2">
                            <StatusBadge status={info.validationLevel === "valid" ? "success" : "warning"}>
                              {info.validationLevel === "valid" ? "Fiable" : "À vérifier"}
                            </StatusBadge>
                            <span className="text-xs font-semibold text-red-700 dark:text-red-200">{ageLabel(row.createdAt)}</span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}

          {activeView !== "dashboard" && (
          <AnimatePresence mode="popLayout">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
              {viewReservations.map((reservation) => {
                const cardKey = `${reservation.agencyId}_${reservation.id}`;
                const isExpanded = Boolean(expandedCardKeys[cardKey]);
                const proofUrl = getProofUrl(reservation);
                const proofText =
                  reservation.payment.reference || reservation.payment.wallet || reservation.proof.message || "";
                const agencyInfo = reservation.agencyId ? agencies[reservation.agencyId] : null;
                const statusConfig = getStatusConfig(reservation.reservation.status);
                const isProcessing = processingId === reservation.id;
                const paymentInfo = getPaymentInfo(reservation);
                const referenceCode =
                  reservation.referenceCode ||
                  reservation.payment.reference ||
                  "";
                const rawPaymentMethod = reservation.payment.method || "";
                const pm = String(rawPaymentMethod || "").toLowerCase();
                const paymentMethodLabel =
                  pm.includes("mobile_money")
                    ? "Mobile Money"
                    : pm === "transfer" || pm.includes("virement")
                      ? "Virement"
                      : rawPaymentMethod
                        ? String(rawPaymentMethod)
                        : reservationProviderLabel(reservation);
                const travelDate = [reservation.trip.date, reservation.trip.time].filter(Boolean).join(" ");
                const treatmentDate = statusDateForReservation(reservation);
                const operatorLabel =
                  reservation.reservation.status === "confirme"
                    ? reservation.validatedBy
                    : reservation.reservation.status === "refuse"
                      ? reservation.refusedBy
                      : null;

                return (
                  <motion.div
                    key={cardKey}
                    layout
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 8 }}
                    transition={{ duration: 0.16 }}
                    className="w-full"
                  >
                    <div className="bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden shadow-sm">
                      {/* Header agence + badge */}
                      <div className="flex items-center justify-between gap-2 px-2 py-1.5">
                        <div className="min-w-0">
                          <div className="text-xs font-semibold text-gray-900 dark:text-white truncate">
                            {agencyInfo?.name || "—"}
                          </div>
                        </div>
                        <div className="flex items-center gap-1">
                          <StatusBadge status={statusConfig.statusVariant}>{statusConfig.label}</StatusBadge>
                          {paymentInfo.paymentStatus === "auto_detected" && (
                            <StatusBadge status="success">Paiement détecté</StatusBadge>
                          )}
                          {paymentInfo.paymentStatus === "declared_paid" && (
                            <StatusBadge status="warning">Paiement déclaré</StatusBadge>
                          )}
                          {paymentInfo.paymentStatus === "rejected" && (
                            <StatusBadge status="danger">Rejeté</StatusBadge>
                          )}
                        </div>
                      </div>

                      <div className="px-2 pb-2 space-y-1">
                        {/* Client + téléphone */}
                        <div className="text-sm font-semibold text-gray-900 dark:text-white truncate">
                          {reservation.customer.name || "—"} • {reservation.customer.phone || "N/A"}
                        </div>

                        {/* Trajet */}
                        <div className="text-xs text-gray-700 dark:text-gray-200 break-words">
                          {reservation.trip.departure || "—"} → {reservation.trip.arrival || "—"}
                        </div>
                        <div className="grid grid-cols-2 gap-2 text-[11px] text-gray-600 dark:text-gray-300">
                          <div>
                            <span className="font-semibold">Voyage: </span>
                            {travelDate || "Non disponible"}
                          </div>
                          <div>
                            <span className="font-semibold">Ancienneté: </span>
                            {ageLabel(reservation.createdAt)}
                          </div>
                        </div>
                        {(reservation.reservation.status === "confirme" || reservation.reservation.status === "refuse") && (
                          <div className="grid grid-cols-2 gap-2 text-[11px] text-gray-600 dark:text-gray-300">
                            <div>
                              <span className="font-semibold">
                                {reservation.reservation.status === "confirme" ? "Validée: " : "Refusée: "}
                              </span>
                              {fmtDate(treatmentDate)}
                            </div>
                            <div className="truncate">
                              <span className="font-semibold">Opérateur: </span>
                              {operatorLabel || "Non disponible"}
                            </div>
                          </div>
                        )}
                        {reservation.reservation.status === "refuse" && (
                          <div className="rounded-md border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/20 px-2 py-1 text-[11px] text-red-800 dark:text-red-100 break-words">
                            <span className="font-semibold">Motif refus: </span>
                            {reservation.refusalReason || "Motif non disponible"}
                          </div>
                        )}

                        {/* Voir preuve */}
                        <Button
                          variant="secondary"
                          size="sm"
                          className="w-full justify-center h-8 px-3 text-sm gap-2 bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white hover:bg-gray-50 dark:hover:bg-gray-700"
                          onClick={() => toggleExpandedCard(cardKey)}
                        >
                          🧾 Voir preuve
                        </Button>

                        {/* Référence */}
                        <div className="text-[11px] font-mono text-gray-600 dark:text-gray-300 truncate">
                          Ref: {referenceCode || "—"}
                        </div>

                        {/* Montant + moyen paiement */}
                        <div className="text-sm font-extrabold text-gray-900 dark:text-white truncate">
                          {fmtMoney(reservation.payment.amount)} • {paymentMethodLabel}
                        </div>
                        <div className="flex items-center gap-2 flex-wrap">
                          {paymentInfo.validationLevel === "valid" && (
                            <StatusBadge status="success">Fiable</StatusBadge>
                          )}
                          {paymentInfo.validationLevel === "suspicious" && (
                            <StatusBadge status="warning">À vérifier</StatusBadge>
                          )}
                          {paymentInfo.validationLevel === "invalid" && (
                            <StatusBadge status="danger">Invalide</StatusBadge>
                          )}
                          <span className="text-[11px] text-gray-600 dark:text-gray-300">
                            Montant détecté: {paymentInfo.parsedAmount != null ? fmtMoney(paymentInfo.parsedAmount) : "—"}
                          </span>
                          <span className="text-[11px] font-mono text-gray-600 dark:text-gray-300">
                            Réf: {paymentInfo.parsedTransactionId || "—"}
                          </span>
                        </div>

                        {/* Expanded preuve */}
                        {isExpanded && (
                          <div className="pt-1 border-t border-gray-200 dark:border-gray-700">
                            {proofUrl && (
                              <div className="pt-1">
                                {isImageProofUrl(proofUrl) ? (
                                  <img
                                    src={proofUrl}
                                    alt="Preuve de paiement"
                                    className="w-full max-h-36 object-contain rounded-md border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800"
                                  />
                                ) : (
                                  <a
                                    href={proofUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center justify-center w-full h-9 rounded-lg bg-[var(--btn-primary,#FF6600)] text-white font-medium hover:brightness-90"
                                  >
                                    Ouvrir preuve
                                  </a>
                                )}
                              </div>
                            )}

                            {proofText && (
                              <div className="text-xs text-gray-800 dark:text-gray-100 break-words mt-2">
                                {proofText}
                              </div>
                            )}

                            <div className="text-xs font-mono text-gray-600 dark:text-gray-300 mt-1 truncate">
                              Ref: {referenceCode || "—"}
                            </div>

                            <div className="text-[11px] text-gray-500 dark:text-gray-400 mt-1">
                              {fmtDate(reservation.createdAt)}
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Actions */}
                      <div className="px-2 py-1.5 border-t border-gray-200 dark:border-gray-700 bg-gray-50/30 dark:bg-gray-800/30">
                        <div className="grid grid-cols-3 gap-2">
                          {reservation.reservation.status === "confirme" ? (
                            <>
                              <Button
                                variant="secondary"
                                size="sm"
                                className="w-full h-8 px-3 text-sm justify-center bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white hover:bg-gray-50 dark:hover:bg-gray-700"
                                onClick={() => handleCopyBilletLink(reservation)}
                              >
                                Copier lien billet
                              </Button>
                              <Button
                                variant="primary"
                                size="sm"
                                className="w-full h-8 px-3 text-sm justify-center"
                                onClick={() => handleOpenWhatsApp(reservation)}
                              >
                                Ouvrir WhatsApp
                              </Button>
                              <Button
                                variant="secondary"
                                size="sm"
                                className="w-full h-8 px-3 text-sm justify-center bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white hover:bg-gray-50 dark:hover:bg-gray-700"
                                onClick={() => toggleExpandedCard(cardKey)}
                              >
                                Détails
                              </Button>
                            </>
                          ) : reservation.reservation.status === "refuse" ? (
                            <Button
                              variant="secondary"
                              size="sm"
                              className="col-span-3 w-full h-8 px-3 text-sm justify-center bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white hover:bg-gray-50 dark:hover:bg-gray-700"
                              onClick={() => toggleExpandedCard(cardKey)}
                            >
                              Détails
                            </Button>
                          ) : (
                            <>
                              <Button
                                variant="primary"
                                size="sm"
                                className="w-full h-8 px-3 text-sm justify-center"
                                onClick={() => handleValidate(reservation)}
                                disabled={isProcessing}
                              >
                                {isProcessing ? "Validation..." : "Valider"}
                              </Button>
                              <Button
                                variant="danger"
                                size="sm"
                                className="w-full h-8 px-3 text-sm justify-center"
                                onClick={() => handleRefuse(reservation)}
                                disabled={isProcessing}
                              >
                                {isProcessing ? "..." : "Refuser"}
                              </Button>
                              <Button
                                variant="secondary"
                                size="sm"
                                className="w-full h-8 px-3 text-sm justify-center bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white hover:bg-gray-50 dark:hover:bg-gray-700"
                                onClick={() => toggleExpandedCard(cardKey)}
                              >
                                Détails
                              </Button>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  </motion.div>
                );
              })}
              {viewReservations.length === 0 && (
                <div className="col-span-full text-center py-6 text-sm text-gray-600 dark:text-gray-300">
                  Aucune réservation à afficher.
                </div>
              )}
            </div>
          </AnimatePresence>
          )}

          <div
            className="fixed bottom-0 left-0 right-0 z-30 grid grid-cols-4 gap-1 border-t border-white/40 p-1.5 shadow-[0_-10px_30px_rgba(15,23,42,0.10)] backdrop-blur md:hidden dark:border-gray-800/80"
            style={{
              background: darkMode
                ? `linear-gradient(135deg, ${primaryColor}24, ${secondaryColor}18), rgba(15,23,42,0.96)`
                : `linear-gradient(135deg, ${primaryColor}14, ${secondaryColor}10), rgba(255,255,255,0.96)`,
            }}
          >
            {[
              { id: "dashboard", label: "Aujourd'hui", icon: Calendar },
              { id: "pending", label: "À traiter", icon: Clock },
              { id: "validated", label: "Validées", icon: CheckCircle },
              { id: "refused", label: "Refusées", icon: XCircle },
            ].map((tab) => {
              const Icon = tab.icon;
              const active = activeView === tab.id;
              return (
                <button
                  key={`bottom-${tab.id}`}
                  type="button"
                  onClick={() => switchDigitalView(tab.id as DigitalOperatorView)}
                  className={`flex h-12 flex-col items-center justify-center gap-0.5 rounded-xl text-[10px] font-bold transition ${
                    active
                      ? "text-white shadow-sm"
                      : "bg-white/55 text-gray-600 dark:bg-gray-900/50 dark:text-gray-300"
                  }`}
                  style={active ? { background: `linear-gradient(135deg, ${primaryColor}, ${secondaryColor})` } : undefined}
                >
                  <Icon className="h-4 w-4" />
                  <span className="leading-none">{tab.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  /* Legacy UI (supprimée du flux opérationnel) */
  return (
    <InternalLayout
      sections={[
        {
          label: "Caisse digitale",
          icon: CreditCard,
          path: `/compagnie/${user?.companyId ?? ""}/digital-cash`,
          end: true,
        },
      ]}
      role="operator_digital"
      userName={user?.displayName ?? undefined}
      userEmail={user?.email ?? undefined}
      brandName={(company as any)?.nom || (company as any)?.name || "Compagnie"}
      logoUrl={(company as any)?.logoUrl || (company as any)?.logo}
      primaryColor={(theme as any)?.primary ?? "#FF6600"}
      secondaryColor={(theme as any)?.secondary ?? "#F97316"}
      onLogout={async () => {
        try {
          await logout();
          navigate("/login");
        } catch (e) {
          console.error(e);
        }
      }}
    >
      <StandardLayoutWrapper className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-950 text-gray-900 dark:text-white">
        <PageHeader title="Caisse digitale — Validation des paiements en ligne" />
        <div className="space-y-6">
          {/* ================= EN-TÊTE ================= */}
          <SectionCard
            title="Réservations à traiter"
            help={<span className="text-sm font-normal text-gray-500 dark:text-gray-300">Validation des paiements en ligne et paiements</span>}
            right={
              <button
                onClick={handleRefresh}
                className="p-2.5 text-gray-500 hover:text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:text-white dark:hover:bg-gray-800 rounded-xl transition-colors"
                title="Actualiser manuellement"
              >
                <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
              </button>
            }
          >
            <div className="flex flex-wrap items-center gap-4">
              <div className="flex items-center gap-2">
                <div className={`h-3 w-3 rounded-full ${verificationReservations.length > 0 ? 'bg-amber-500 animate-pulse' : 'bg-gray-300'}`} />
                <span className="text-sm text-gray-600">
                  {verificationReservations.length > 0
                    ? `${verificationReservations.length} en attente de validation`
                    : 'Tout est à jour'}
                </span>
              </div>
              <span className="text-sm text-gray-400">• Mise à jour en temps réel</span>
            </div>
          </SectionCard>

          {/* ================= FILTRES RAPIDES ================= */}
          <SectionCard title="Recherche et filtres">
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
              <div className="sm:col-span-2">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400 dark:text-gray-400" />
                  <input
                    type="text"
                    className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-xl bg-white dark:bg-gray-900 dark:border-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:border-transparent"
                    style={{ outlineColor: theme.primary }}
                    placeholder="Rechercher par nom, téléphone ou référence..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />
                </div>
              </div>

              <div>
                <select
                  value={filterPeriod}
                  onChange={(e) => setFilterPeriod(e.target.value as FilterOptions['period'])}
                  className="w-full border border-gray-300 rounded-xl px-4 py-2.5 bg-white dark:bg-gray-900 dark:border-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:border-transparent"
                  style={{ outlineColor: theme.primary }}
                >
                  <option value="today">Aujourd'hui</option>
                  <option value="week">Semaine</option>
                  <option value="all">Tout</option>
                </select>
              </div>

              <div>
                <select
                  value={filterAgencyId}
                  onChange={(e) => setFilterAgencyId(e.target.value)}
                  className="w-full border border-gray-300 rounded-xl px-4 py-2.5 bg-white dark:bg-gray-900 dark:border-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:border-transparent"
                  style={{ outlineColor: theme.primary }}
                  disabled={Object.keys(agencies).length === 0}
                >
                  <option value="">Toutes les agences</option>
                  {Object.entries(agencies).map(([agencyId, agency]) => (
                    <option key={agencyId} value={agencyId}>
                      {agency.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </SectionCard>

          {/* ================= STATISTIQUES (PLIABLE) ================= */}
          {showStats && (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 sm:gap-4">
                <MetricCard label="En attente de validation" value={stats.verification.toString()} icon={AlertCircle} valueColorVar="#b45309" />
                <MetricCard label="En attente" value={stats.enAttente.toString()} icon={Clock} valueColorVar="#1d4ed8" />
                <MetricCard label="Confirmées" value={stats.confirme.toString()} icon={CheckCircle} valueColorVar="#047857" />
                <MetricCard label="Refusées" value={stats.refuse.toString()} icon={XCircle} critical />
                <MetricCard label="Annulées" value={stats.annule.toString()} icon={XCircle} />
              </div>

              {/* ================= PÉRIODE ACTIVE ================= */}
              <SectionCard
                title={`Période : ${filterPeriod === 'today' ? "Aujourd'hui" : filterPeriod === 'week' ? 'Semaine' : 'Tout'}`}
                icon={Calendar}
                right={<span className="text-sm text-gray-600">Total : {stats.total} réservations • {fmtMoney(stats.totalAmount)}</span>}
              >
                <div className="text-sm text-gray-500">Total : {stats.total} réservations • {fmtMoney(stats.totalAmount)}</div>
              </SectionCard>

              {/* ================= TOP AGENCES ================= */}
              {topAgencies.length > 0 && (
                <SectionCard title="Top 5 Agences" help={<span className="text-sm font-normal text-gray-500">Par nombre de réservations</span>}>
                  
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
                    {topAgencies.map((agency, index) => (
                      <div key={agency.id} className="p-4 rounded-lg border border-gray-200 bg-gray-50/50">
                        <div className="flex items-center gap-3 mb-3">
                          <div className="h-10 w-10 rounded-lg bg-gray-200 flex items-center justify-center">
                            <div className="text-sm font-bold text-gray-700">#{index + 1}</div>
                          </div>
                          <div className="min-w-0">
                            <div className="font-medium text-gray-900 truncate">{agency.name}</div>
                            <div className="text-xs text-gray-500 truncate">{agency.ville}</div>
                          </div>
                        </div>
                        <div className="space-y-2">
                          <div className="flex justify-between">
                            <span className="text-sm text-gray-500">Réservations</span>
                            <span className="font-bold text-gray-900">{agency.count}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-sm text-gray-500">Montant</span>
                            <span className="font-bold text-gray-900">{fmtMoney(agency.amount)}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </SectionCard>
              )}
            </>
          )}

          {/* ================= LISTE DES RÉSERVATIONS À VÉRIFIER + VALIDÉES À L'INSTANT ================= */}
          {((recentlyValidatedReservations.length > 0) || verificationReservations.length > 0) && (!filterStatus || filterStatus === 'verification') && (
            <SectionCard
              title="En attente de validation"
              icon={AlertCircle}
              right={
                <span className="flex items-center gap-2">
                  {recentlyValidatedReservations.length > 0 && (
                    <StatusBadge status="success">{recentlyValidatedReservations.length} billet(s) validé(s)</StatusBadge>
                  )}
                  <StatusBadge status="warning">{verificationReservations.length} en attente de validation</StatusBadge>
                </span>
              }
            >
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                <AnimatePresence mode="popLayout">
                {[
                  ...recentlyValidatedReservations,
                  ...filterReservationsByPeriod(verificationReservations, filterPeriod).filter(
                    r => !recentlyValidatedReservations.some(v => v.id === r.id && v.agencyId === r.agencyId)
                  ),
                ]
                  .filter(r =>
                    !searchTerm ||
                    [
                      r.customer.name,
                      r.customer.phone,
                      r.referenceCode,
                      r.payment.reference,
                      r.payment.wallet,
                      r.proof.message
                    ]
                      .join(' ')
                      .toLowerCase()
                      .includes(searchTerm.toLowerCase())
                  )
                  .map((reservation) => {
                    const isJustValidated = recentlyValidatedReservations.some(
                      v => v.id === reservation.id && v.agencyId === reservation.agencyId
                    );
                    const billetUrl = getBilletUrl(reservation, (company as { slug?: string })?.slug);
                    const confirmationMessage = getBilletConfirmationMessage(
                      reservation,
                      billetUrl,
                      (company as any)?.name || (company as any)?.nom || "Compagnie"
                    );
                    const phoneForWhatsApp = toWhatsAppPhone(reservation.customer.phone || '');
                    const whatsAppUrl = phoneForWhatsApp
                      ? `https://wa.me/${phoneForWhatsApp}?text=${encodeURIComponent(confirmationMessage)}`
                      : '';
                    const proofUrl = getProofUrl(reservation);
                    const proofText =
                      reservation.payment.reference || reservation.payment.wallet || reservation.proof.message;
                    const cardKey = `${reservation.agencyId}_${reservation.id}`;
                    const isExpanded = Boolean(expandedCardKeys[cardKey]);

                    if (isJustValidated) {
                      return (
                        <motion.div
                          key={cardKey}
                          layout
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: 12 }}
                          transition={{ duration: 0.18 }}
                        >
                          <div
                            id={`reservation-${reservation.id}`}
                            className="border border-green-200 rounded-xl overflow-hidden bg-white shadow-md dark:bg-gray-900"
                          >
                          {/* Bandeau vert : Billet validé */}
                          <div className="flex items-center justify-center gap-2 py-3 px-4 bg-green-600 text-white">
                            <CheckCircle className="h-5 w-5 shrink-0" aria-hidden />
                            <span className="font-semibold">Billet validé</span>
                            {reservation.referenceCode && (
                              <span className="ml-auto text-xs font-mono text-green-100">#{reservation.referenceCode}</span>
                            )}
                          </div>
                          <div className="p-3 space-y-2">
                            {/* Client + téléphone (compact) */}
                            <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-3 border border-gray-200 dark:border-gray-700">
                              <div className="flex items-center justify-between gap-2">
                                <div className="min-w-0">
                                  <div className="text-xs font-medium text-gray-500 dark:text-gray-300 truncate">Client</div>
                                  <div className="text-sm font-semibold text-gray-900 dark:text-white truncate">
                                    {reservation.customer.name || 'Sans nom'}
                                  </div>
                                  <div className="flex items-center gap-2 mt-1">
                                    <Smartphone className="h-4 w-4 text-gray-600 dark:text-gray-300 shrink-0" />
                                    <div className="text-sm font-extrabold text-gray-900 dark:text-white break-words">
                                      {reservation.customer.phone || 'Non renseigné'}
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </div>

                            {/* Montant + Trajet */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                              <div className="flex items-center justify-between">
                                <span className="text-sm text-gray-500 dark:text-gray-300">Montant</span>
                                <span className="text-sm font-bold text-gray-900 dark:text-white">
                                  {fmtMoney(reservation.payment.amount)}
                                </span>
                              </div>
                              <div className="flex items-center justify-between">
                                <span className="text-sm text-gray-500 dark:text-gray-300">Trajet</span>
                                <span className="text-sm font-medium text-gray-900 dark:text-white text-right truncate">
                                  {reservation.trip.departure || 'N/A'} → {reservation.trip.arrival || 'N/A'}
                                </span>
                              </div>
                            </div>

                            {/* Indicateur preuve + expand */}
                            <div className="flex items-center justify-between gap-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 p-3">
                              <div className="flex items-center gap-2 min-w-0">
                                <FileText className="h-4 w-4 text-gray-600 dark:text-gray-300 shrink-0" />
                                <span className="text-sm font-semibold text-gray-800 dark:text-gray-100 truncate">Preuve</span>
                                {proofText ? (
                                  <span className="text-xs text-gray-500 dark:text-gray-400 truncate">{proofText}</span>
                                ) : (
                                  <span className="text-xs text-gray-500 dark:text-gray-400">—</span>
                                )}
                              </div>
                              <Button
                                variant="secondary"
                                className="h-9 px-3 flex items-center justify-center gap-2 border-blue-200 dark:border-blue-300 text-blue-700 dark:text-blue-200 hover:bg-blue-50 dark:hover:bg-blue-950/30"
                                onClick={() => toggleExpandedCard(cardKey)}
                              >
                                <FileText className="h-4 w-4" />
                                {isExpanded ? 'Réduire' : 'Voir preuve'}
                              </Button>
                            </div>

                            {/* Expanded: preuve complète + actions */}
                            {isExpanded && (
                              <div className="space-y-2">
                                {proofUrl && (
                                  <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-2">
                                    {isImageProofUrl(proofUrl) ? (
                                      <img
                                        src={proofUrl}
                                        alt="Preuve de paiement"
                                        className="w-full h-auto max-h-48 object-contain rounded-lg"
                                      />
                                    ) : (
                                      <a
                                        href={proofUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="inline-flex items-center justify-center gap-2 w-full rounded-lg font-medium transition focus:outline-none focus:ring-2 focus:ring-offset-2 h-10 px-4 py-2 bg-[var(--btn-primary,#FF6600)] text-white hover:brightness-90 active:brightness-85"
                                      >
                                        <FileText className="h-4 w-4" />
                                        Ouvrir preuve
                                      </a>
                                    )}
                                  </div>
                                )}

                                <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 p-3">
                                  <div className="text-xs font-medium text-gray-500 dark:text-gray-300 mb-1">Message / Référence</div>
                                  <div className="text-sm text-gray-800 dark:text-gray-100 break-words">
                                    {proofText || '—'}
                                  </div>
                                </div>

                                {reservation.referenceCode && (
                                  <div className="text-xs font-mono text-gray-600 dark:text-gray-300">
                                    Référence: #{reservation.referenceCode}
                                  </div>
                                )}

                                <div className="text-xs text-gray-400 dark:text-gray-400">
                                  Reçu le: {fmtDate(reservation.createdAt)}
                                </div>

                                {/* Actions "validé" conservées, mais déployées */}
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                  <Button
                                    variant="primary"
                                    className="w-full flex items-center justify-center gap-2"
                                    onClick={() => billetUrl && window.open(billetUrl, '_blank')}
                                  >
                                    <Download className="h-4 w-4" />
                                    Télécharger PDF
                                  </Button>

                                  <Button
                                    variant="secondary"
                                    className="w-full flex items-center justify-center gap-2 border-green-300 dark:border-green-400 text-green-800 dark:text-green-200 hover:bg-green-50 dark:hover:bg-green-950/30"
                                    onClick={() => {
                                      if (whatsAppUrl) {
                                        window.open(whatsAppUrl, '_blank');
                                        toast.success('WhatsApp ouvert avec le message prêt');
                                      }
                                    }}
                                    disabled={!phoneForWhatsApp}
                                  >
                                    <MessageCircle className="h-4 w-4" />
                                    WhatsApp
                                  </Button>
                                </div>

                                <Button
                                  variant="secondary"
                                  className="w-full flex items-center justify-center gap-2"
                                  onClick={async () => {
                                    try {
                                      await navigator.clipboard.writeText(confirmationMessage);
                                      toast.success('Message copié dans le presse-papiers');
                                    } catch {
                                      toast.error('Erreur', { description: 'Impossible de copier le message dans le presse-papiers.' });
                                    }
                                  }}
                                >
                                  <Copy className="h-4 w-4" />
                                  Copier message
                                </Button>

                                {/* Lien "Voir billet" (toujours disponible) */}
                                <a
                                  href={billetUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center justify-center gap-2 w-full rounded-lg font-medium transition focus:outline-none focus:ring-2 focus:ring-offset-2 h-10 px-4 py-2 bg-[var(--btn-primary,#FF6600)] text-white hover:brightness-90 active:brightness-85 disabled:pointer-events-none disabled:opacity-50"
                                >
                                  <Eye className="h-4 w-4" />
                                  Voir billet
                                </a>
                              </div>
                            )}
                          </div>

                          {/* Actions (compactes) */}
                          <div className="p-3 border-t border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-900/20">
                            <div className="grid grid-cols-2 gap-2">
                              <a
                                href={billetUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center justify-center gap-2 w-full rounded-lg font-medium transition focus:outline-none focus:ring-2 focus:ring-offset-2 h-10 px-4 py-2 bg-[var(--btn-primary,#FF6600)] text-white hover:brightness-90 active:brightness-85 disabled:pointer-events-none disabled:opacity-50"
                              >
                                <Eye className="h-4 w-4" />
                                Billet
                              </a>
                              <Button
                                variant="secondary"
                                className="w-full flex items-center justify-center gap-2"
                                onClick={() => toggleExpandedCard(cardKey)}
                              >
                                <FileText className="h-4 w-4" />
                                Détails
                              </Button>
                            </div>
                          </div>
                          </div>
                        </motion.div>
                      );
                    }

                    const statusConfig = getStatusConfig(reservation.reservation.status);
                    const isProcessing = processingId === reservation.id;
                    const agencyInfo = reservation.agencyId ? agencies[reservation.agencyId] : null;

                    return (
                      <motion.div
                        key={cardKey}
                        layout
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 12 }}
                        transition={{ duration: 0.18 }}
                      >
                        <div
                          id={`reservation-${reservation.id}`}
                          className="border border-gray-200 rounded-lg overflow-hidden hover:shadow-md transition-all duration-300 bg-white dark:bg-gray-900"
                        >
                        {/* Header avec agence */}
                        <div className="p-4 border-b border-gray-200 bg-gray-50/50 dark:border-gray-700 dark:bg-gray-900/30">
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                              <div className="h-6 w-6 rounded-md bg-gray-200 dark:bg-gray-800 flex items-center justify-center">
                                <Building2 className="h-3 w-3 text-gray-600 dark:text-gray-300" />
                              </div>
                              <span className="text-sm font-medium text-gray-900 dark:text-white truncate">
                                {agencyInfo?.name || 'Agence inconnue'}
                              </span>
                            </div>
                            <StatusBadge status="warning">À vérifier</StatusBadge>
                          </div>
                          
                          {reservation.referenceCode && (
                            <div className="text-xs font-mono text-gray-600 dark:text-gray-300">
                              #{reservation.referenceCode}
                            </div>
                          )}
                        </div>
                        
                        {/* Détails compacts — mobile-first (focus preuve) */}
                        <div className="p-3 space-y-2">
                          {/* Agence: titre (badge) + statut déjà en header ; ici on affiche client/tél */}
                          <div className="bg-gray-50 rounded-xl p-3 border border-gray-200">
                            <div className="flex items-center justify-between gap-2">
                              <div className="min-w-0">
                                <div className="text-xs font-medium text-gray-500 dark:text-gray-300 truncate">
                                  Client
                                </div>
                                <div className="text-sm font-semibold text-gray-900 dark:text-white truncate">
                                  {reservation.customer.name || 'Sans nom'}
                                </div>
                                <div className="flex items-center gap-2 mt-1">
                                  <Smartphone className="h-4 w-4 text-gray-600 dark:text-gray-300 shrink-0" />
                                  <div className="text-sm font-extrabold text-gray-900 dark:text-white break-words">
                                    {reservation.customer.phone || 'Non renseigné'}
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>

                          {/* Montant + Trajet */}
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            <div className="flex items-center justify-between">
                              <span className="text-sm text-gray-500 dark:text-gray-300">Montant</span>
                              <span className="text-sm font-bold text-gray-900 dark:text-white">
                                {fmtMoney(reservation.payment.amount)}
                              </span>
                            </div>
                            <div className="flex items-center justify-between">
                              <span className="text-sm text-gray-500 dark:text-gray-300">Trajet</span>
                              <span className="text-sm font-medium text-gray-900 dark:text-white text-right truncate">
                                {reservation.trip.departure || 'N/A'} → {reservation.trip.arrival || 'N/A'}
                              </span>
                            </div>
                          </div>

                          {/* Indicateur preuve (toujours accessible rapidement) */}
                          <div className="flex items-center justify-between gap-2 rounded-xl border border-gray-200 bg-gray-50 p-3">
                            <div className="flex items-center gap-2 min-w-0">
                              <FileText className="h-4 w-4 text-gray-600 dark:text-gray-300 shrink-0" />
                              <span className="text-sm font-semibold text-gray-800 dark:text-gray-100 truncate">
                                Preuve
                              </span>
                              {proofText ? (
                                <span className="text-xs text-gray-500 dark:text-gray-400 truncate">{proofText}</span>
                              ) : (
                                <span className="text-xs text-gray-500 dark:text-gray-400">—</span>
                              )}
                            </div>
                            <Button
                              variant="secondary"
                              className="h-9 px-3 flex items-center justify-center gap-2 border-blue-200 text-blue-700 dark:border-blue-300 dark:text-blue-200 hover:bg-blue-50 dark:hover:bg-blue-950/30"
                              onClick={() => toggleExpandedCard(cardKey)}
                            >
                              <FileText className="h-4 w-4" />
                              {isExpanded ? 'Réduire' : 'Voir preuve'}
                            </Button>
                          </div>

                          {/* Expanded: preview + message complet + référence + date */}
                          {isExpanded && (
                            <div className="space-y-2">
                              {proofUrl && (
                                <div className="rounded-xl border border-gray-200 bg-white dark:bg-gray-900 p-2">
                                  {isImageProofUrl(proofUrl) ? (
                                    <img
                                      src={proofUrl}
                                      alt="Preuve de paiement"
                                      className="w-full h-auto max-h-48 object-contain rounded-lg"
                                    />
                                  ) : (
                                    <a
                                      href={proofUrl}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="inline-flex items-center justify-center gap-2 w-full rounded-lg font-medium transition focus:outline-none focus:ring-2 focus:ring-offset-2 h-10 px-4 py-2 bg-[var(--btn-primary,#FF6600)] text-white hover:brightness-90 active:brightness-85"
                                    >
                                      <FileText className="h-4 w-4" />
                                      Ouvrir preuve
                                    </a>
                                  )}
                                </div>
                              )}

                              <div className="rounded-xl border border-gray-200 bg-gray-50 dark:bg-gray-800 p-3">
                                <div className="text-xs font-medium text-gray-500 dark:text-gray-300 mb-1">Message / Référence</div>
                                <div className="text-sm text-gray-800 dark:text-gray-100 break-words">
                                  {proofText || '—'}
                                </div>
                              </div>

                              {reservation.referenceCode && (
                                <div className="text-xs font-mono text-gray-600 dark:text-gray-300">
                                  Référence: #{reservation.referenceCode}
                                </div>
                              )}

                              <div className="text-xs text-gray-400 dark:text-gray-400">
                                Reçu le: {fmtDate(reservation.createdAt)}
                              </div>
                            </div>
                          )}
                        </div>

                        {/* Actions compactes (visibles) */}
                        <div className="p-3 border-t border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-900/20">
                          <div className="grid grid-cols-3 gap-2">
                            <Button
                              variant="primary"
                              onClick={() => handleValidate(reservation)}
                              disabled={isProcessing}
                              className="flex items-center justify-center gap-2"
                            >
                              {isProcessing ? (
                                <motion.div
                                  animate={{ rotate: 360 }}
                                  transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                                >
                                  <RotateCw className="h-4 w-4" />
                                </motion.div>
                              ) : (
                                <>
                                  <CheckCircle className="h-4 w-4" />
                                  Valider
                                </>
                              )}
                            </Button>
                            <Button
                              variant="secondary"
                              onClick={() => handleRefuse(reservation)}
                              disabled={isProcessing}
                              className="border-red-300 text-red-700 hover:bg-red-50 dark:border-red-400 dark:text-red-200 dark:hover:bg-red-950/20"
                            >
                              <XCircle className="h-4 w-4" />
                              Refuser
                            </Button>
                            <Button
                              variant="secondary"
                              onClick={() => toggleExpandedCard(cardKey)}
                              className="flex items-center justify-center gap-2"
                            >
                              <Eye className="h-4 w-4" />
                              Détails
                            </Button>
                          </div>
                        </div>
                        </div>
                      </motion.div>
                    );
                  })}
                </AnimatePresence>
              </div>
            </SectionCard>
          )}

          {/* ================= AUTRES RÉSERVATIONS ================= */}
          {((filterStatus !== 'verification' && filterStatus !== '') || 
            (filterStatus === '' && otherReservations.length > 0)) && (
            <SectionCard
              title={filterStatus ? `${getStatusConfig(filterStatus as ReservationStatus).label}s` : 'Toutes les réservations'}
              icon={Receipt}
              right={<span className="text-sm text-gray-600">{filterStatus ? `${filteredReservations.filter(r => r.reservation.status !== 'verification').length} réservation${filteredReservations.filter(r => r.reservation.status !== 'verification').length > 1 ? 's' : ''}` : 'Historique'}</span>}
            >
                <button
                  onClick={() => setShowHistory(!showHistory)}
                  className="mb-4 text-sm text-gray-600 hover:text-gray-900 flex items-center gap-1 px-3 py-1.5 rounded-lg hover:bg-gray-100 transition-colors"
                >
                  {showHistory ? (
                    <>
                      <ChevronUp className="h-4 w-4" />
                      Réduire
                    </>
                  ) : (
                    <>
                      <ChevronDown className="h-4 w-4" />
                      Développer
                    </>
                  )}
                </button>
              
              {showHistory && (
                <>
                  {filteredReservations.filter(r => r.reservation.status !== 'verification').length === 0 ? (
                    <div className="text-center py-8 border border-gray-200 rounded-lg">
                      <div className="text-gray-500">Aucune réservation à afficher</div>
                    </div>
                  ) : (
                    <>
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {filteredReservations
                          .filter(r => r.reservation.status !== 'verification')
                          .map((reservation) => {
                            const statusConfig = getStatusConfig(reservation.reservation.status);
                            const isProcessing = processingId === reservation.id;
                            const agencyInfo = reservation.agencyId ? agencies[reservation.agencyId] : null;
                            const proofUrl = getProofUrl(reservation);
                            const proofText =
                              reservation.payment.reference || reservation.payment.wallet || reservation.proof.message;
                            
                            return (
                              <div
                                key={`${reservation.agencyId}_${reservation.id}`}
                                className="border border-gray-200 rounded-lg overflow-hidden hover:shadow-md transition-all duration-300 bg-white"
                              >
                                {/* Header avec agence */}
                                <div className="p-4 border-b border-gray-200 bg-gray-50/50">
                                  <div className="flex items-center justify-between mb-2">
                                    <div className="flex items-center gap-2">
                                      <div className="h-6 w-6 rounded-md bg-gray-200 flex items-center justify-center">
                                        <Building2 className="h-3 w-3 text-gray-600" />
                                      </div>
                                      <span className="text-sm font-medium text-gray-900 truncate">
                                        {agencyInfo?.name || 'Agence inconnue'}
                                      </span>
                                    </div>
                                    <StatusBadge status={statusConfig.statusVariant}>{statusConfig.label}</StatusBadge>
                                  </div>
                                  
                                  {reservation.referenceCode && (
                                    <div className="text-xs font-mono text-gray-600">
                                      #{reservation.referenceCode}
                                    </div>
                                  )}
                                </div>
                                
                                {/* Détails */}
                                <div className="p-4 space-y-3">
                                  {/* 📞 Téléphone client (priorité) */}
                                  <div className="bg-gray-50 rounded-xl p-3 border border-gray-200">
                                    <div className="flex items-center gap-2 mb-1">
                                      <Smartphone className="h-4 w-4 text-gray-600" />
                                      <span className="text-sm font-medium text-gray-700">Téléphone client</span>
                                    </div>
                                    <div className="text-2xl sm:text-3xl font-extrabold text-gray-900 tracking-tight break-words">
                                      {reservation.customer.phone || 'Non renseigné'}
                                    </div>
                                  </div>

                                  {/* 🧾 Preuve de paiement */}
                                  {proofText && (
                                    <div className="bg-gray-50 rounded-xl p-3 border border-gray-200">
                                      <div className="flex items-center gap-2 mb-1">
                                        <FileText className="h-4 w-4 text-gray-600" />
                                        <span className="text-sm font-medium text-gray-700">Preuve de paiement</span>
                                      </div>
                                      <div className="text-sm text-gray-800 break-words">{proofText}</div>

                                      {proofUrl && (
                                        <Button
                                          variant="secondary"
                                          className="mt-3 w-full flex items-center justify-center gap-2 border-blue-200 text-blue-700 hover:bg-blue-50"
                                          onClick={() => window.open(proofUrl, '_blank')}
                                        >
                                          <FileText className="h-4 w-4" />
                                          Voir le justificatif
                                        </Button>
                                      )}
                                    </div>
                                  )}

                                  {/* Montant */}
                                  <div className="flex items-center justify-between px-1">
                                    <span className="text-sm text-gray-500">Montant</span>
                                    <span className="text-base sm:text-lg font-extrabold text-gray-900">
                                      {fmtMoney(reservation.payment.amount)}
                                    </span>
                                  </div>

                                  {/* Trajet */}
                                  <div className="flex items-center justify-between px-1">
                                    <span className="text-sm text-gray-500">Trajet</span>
                                    <span className="text-sm font-medium text-gray-900 text-right">
                                      {reservation.trip.departure || 'N/A'} → {reservation.trip.arrival || 'N/A'}
                                    </span>
                                  </div>

                                  {/* Client (après les priorités) */}
                                  <div className="flex items-center justify-between px-1">
                                    <span className="text-sm text-gray-500">Client</span>
                                    <span className="text-sm font-medium text-gray-900 truncate max-w-[170px] text-right">
                                      {reservation.customer.name || 'Sans nom'}
                                    </span>
                                  </div>

                                  <div className="text-xs text-gray-400">
                                    Créé le: {fmtDate(reservation.createdAt)}
                                  </div>
                                </div>
                                
                                {/* Actions */}
                                <div className="p-4 border-t bg-gray-50 space-y-2">
                                  <Button 
                                    variant="secondary"
                                    onClick={() => handleViewDetails(reservation)}
                                    className="w-full flex items-center justify-center gap-2"
                                  >
                                    <Eye className="h-4 w-4" />
                                    Voir détails
                                  </Button>
                                </div>
                              </div>
                            );
                          })}
                      </div>
                      
                      {/* Bouton Charger plus pour les autres réservations */}
                      {!filterStatus && otherReservations.length > 0 && otherPage * ITEMS_PER_PAGE <= otherReservations.length && (
                        <div className="text-center pt-6">
                          <Button variant="secondary" onClick={loadMoreReservations}>
                            <RefreshCw className="h-4 w-4 mr-2" />
                            Charger plus de réservations
                          </Button>
                        </div>
                      )}
                    </>
                  )}
                </>
              )}
            </SectionCard>
          )}
        </div>
      </StandardLayoutWrapper>
    </InternalLayout>
  );
};

export default ReservationsEnLigne;
