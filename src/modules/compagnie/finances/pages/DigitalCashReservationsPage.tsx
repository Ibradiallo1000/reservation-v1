// src/pages/chef-comptable/ReservationsEnLigne.tsx
import React, { useEffect, useMemo, useState } from 'react';
import {
  collection, query, where, orderBy, limit, doc,
  deleteDoc, onSnapshot, getDoc, updateDoc, serverTimestamp, getDocs, Timestamp
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
import type { Reservation, ReservationStatus } from '@/types/reservation';
import InternalLayout from '@/shared/layout/InternalLayout';

/** Réservation avec champs preuve (Firestore peut avoir paymentReference) */
type ReservationWithProof = Reservation & { paymentReference?: string };
import { useFormatCurrency } from '@/shared/currency/CurrencyContext';
import { Button } from '@/shared/ui/button';
import { MetricCard, SectionCard, StatusBadge, type StatusVariant, StandardLayoutWrapper, PageHeader } from '@/ui';
import { upsertCustomerFromReservation } from '@/modules/compagnie/crm/customerService';
import { decrementReservedSeats } from '@/modules/compagnie/tripInstances/tripInstanceService';
import { ensurePendingOnlinePaymentFromReservation, getPaymentByReservationId } from '@/services/paymentService';
import { validatePendingOnlinePaymentAndSyncReservation } from '@/services/onlinePaymentOperatorService';

/** Son Shopify (alarme / preuve reçue) : public/splash/son.mp3 */
const NOTIFICATION_SOUND_URL = '/splash/son.mp3';

/* ================= NORMALISATION DES STATUTS ================= */
/** Modèle Firestore `status` : en_attente | payé | annulé (+ ticketValidatedAt pour billet validé). */
const normalizeReservationRowStatus = (d: Record<string, unknown>): ReservationStatus => {
  const status = String(d.status ?? "").toLowerCase();
  if (status === "annulé" || status === "annule") return "annule";
  if (status === "en_attente") return "en_attente";
  if (status === "payé" || status === "paye") {
    return d.ticketValidatedAt ? "confirme" : "verification";
  }
  const raw = String(d.statut ?? "");
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

const ITEMS_PER_PAGE = 20;

/* ================= TYPES POUR LA PAGINATION ET FILTRES ================= */
interface FilterOptions {
  period: 'today' | 'tomorrow' | 'week' | 'all';
  startDate?: Date;
  endDate?: Date;
}

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

const getPaymentInfo = (reservation: Reservation) => {
  const p = ((reservation as any).payment ?? {}) as {
    status?: string;
    validationLevel?: string;
    parsed?: { amount?: number; transactionId?: string };
    totalAmount?: number;
  };
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

const getPriorityRank = (reservation: Reservation): number => {
  const info = getPaymentInfo(reservation);
  if (info.paymentStatus === "auto_detected" && info.validationLevel === "valid") return 1;
  if (info.paymentStatus === "auto_detected" && info.validationLevel === "suspicious") return 2;
  if (info.paymentStatus === "declared_paid") return 3;
  return 4;
};

/* ================= COMPOSANT PRINCIPAL ================= */
/** Construit l'URL publique du billet pour une réservation */
const getBilletUrl = (r: Reservation, companySlugFallback?: string) => {
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
  r: Reservation,
  billetUrl: string,
  companyName: string
) => {
  const departure = r.depart || "—";
  const arrival = r.arrivee || "—";
  const formattedDate = formatDepartureDateFr(r.date);
  const time = formatDepartureTime((r as any).heure);

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
  const money = useFormatCurrency();
  const { initializeAudio, playNotification, resetNotification, playSoundNow, isAudioReady } = useNotificationSound();
  const [darkMode, toggleDarkMode] = useAgencyDarkMode();

  const [verificationReservations, setVerificationReservations] = useState<Reservation[]>([]);
  /** Réservations venant d'être validées : on garde la carte visible avec "Billet validé" + actions */
  const [recentlyValidatedReservations, setRecentlyValidatedReservations] = useState<Reservation[]>([]);
  const [otherReservations, setOtherReservations] = useState<Reservation[]>([]);
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
  // Temporal filtering mobile-first: aujourd'hui / demain / semaine / tout.
  const [filterPeriod, setFilterPeriod] = useState<FilterOptions['period']>('all');
  const [filterAgencyId, setFilterAgencyId] = useState<string>('');
  const [expandedCardKeys, setExpandedCardKeys] = useState<Record<string, boolean>>({});
  const [requestedOtherReservations, setRequestedOtherReservations] = useState(false);
  const [filterTab, setFilterTab] = useState<"today" | "pending" | "history" | "all">("pending");
  const [recentlyRefusedReservations, setRecentlyRefusedReservations] = useState<Reservation[]>([]);

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

    // week: aujourd'hui + 6 jours (prochaine semaine)
    const weekStart = todayStart;
    const weekEnd = new Date(todayStart);
    weekEnd.setDate(weekEnd.getDate() + 6);
    weekEnd.setHours(23, 59, 59, 999);
    return { start: weekStart, end: weekEnd };
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

    let unsubs: Array<() => void> = [];

    (async () => {
      try {
        const agencesSnap = await getDocs(
          collection(db, 'companies', user.companyId, 'agences')
        );
        
        if (agencesSnap.empty) {
          setLoading(false);
          return;
        }
        
        const agenceIds = agencesSnap.docs.map((d) => d.id);

        // Paiement déclaré côté client : status payé, en attente de validation opérateur
        agenceIds.forEach((agencyId) => {
          const qRef = query(
            collection(db, 'companies', user.companyId!, 'agences', agencyId, 'reservations'),
            where('status', '==', 'payé'),
            orderBy('createdAt', 'desc'),
            limit(50)
          );

          const unsub = onSnapshot(qRef, (snap) => {
            // CORRECTION CRITIQUE ICI : Utiliser une Map pour gérer proprement les changements
            setVerificationReservations(prev => {
              const map = new Map<string, Reservation>();

              // Garder l'existant
              prev.forEach(r => {
                map.set(`${r.agencyId}_${r.id}`, r);
              });

              // Appliquer les changements
              snap.docChanges().forEach(chg => {
                const d = chg.doc.data() as any;
                const keyEarly = `${d.agencyId ?? agencyId}_${chg.doc.id}`;
                if (d.ticketValidatedAt) {
                  map.delete(keyEarly);
                  if (chg.type === 'removed') resetNotification(keyEarly);
                  return;
                }

                const row: Reservation = {
                  ...d,
                  id: chg.doc.id,
                  companyId: d.companyId ?? user.companyId!,
                  agencyId: d.agencyId ?? agencyId,
                  statut: normalizeReservationRowStatus(d as Record<string, unknown>),
                  clientNom: d.nomClient ?? d.clientNom,
                  createdAt: d.createdAt ?? Timestamp.now(),
                } as Reservation;

                const key = `${row.agencyId}_${row.id}`;

                if (chg.type === 'removed') {
                  map.delete(key);
                  resetNotification(key);
                } else {
                  // Ajout ou modification
                  if (chg.type === 'added' && row.statut === 'verification') {
                    // Jouer le son uniquement pour les nouvelles réservations à vérifier
                    if (isAudioReady) {
                      playNotification(key);
                    }
                    
                    toast('Nouveau justificatif reçu', {
                      description: `${row.clientNom || 'Client'} a envoyé un justificatif de paiement`,
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

              // Convertir en tableau et trier par date décroissante
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
          }, (error) => {
            console.error('Erreur Firestore (verification):', error);
            toast.error('Erreur de connexion', {
              description: 'Impossible de charger les réservations à vérifier',
            });
          });

          unsubs.push(unsub);
        });

        setLoading(false);
      } catch (error) {
        console.error('Erreur initiale:', error);
        setLoading(false);
        toast.error('Erreur', {
          description: 'Impossible de charger les agences',
        });
      }
    })();

    return () => {
      unsubs.forEach((u) => u());
    };
  }, [user?.companyId, isAudioReady]);

  /* ================= CHARGEMENT PAGINÉ DES AUTRES RÉSERVATIONS ================= */
  const loadOtherReservations = async (page: number = 1) => {
    if (!user?.companyId) return;

    try {
      const agencesSnap = await getDocs(
        collection(db, 'companies', user.companyId, 'agences')
      );
      
      if (agencesSnap.empty) return;

      const agenceIds = agencesSnap.docs.map((d) => d.id);
      const allOtherReservations: Reservation[] = [];

      for (const agencyId of agenceIds) {
        const qRef = query(
          collection(db, 'companies', user.companyId!, 'agences', agencyId, 'reservations'),
          where('status', 'in', ['payé', 'annulé']),
          orderBy('createdAt', 'desc'),
          limit(ITEMS_PER_PAGE * page)
        );

        const snap = await getDocs(qRef);
        snap.docs.forEach(doc => {
          const d = doc.data() as any;
          const normalizedStatus = normalizeReservationRowStatus(d as Record<string, unknown>);
          
          // CORRECTION : S'assurer que les réservations confirmées sont bien incluses
          allOtherReservations.push({
            ...d,
            id: doc.id,
            companyId: d.companyId ?? user.companyId!,
            agencyId: d.agencyId ?? agencyId,
            statut: normalizedStatus,
            clientNom: d.nomClient ?? d.clientNom,
            createdAt: d.createdAt ?? Timestamp.now(),
          } as Reservation);
        });
      }

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

  /* ================= CORRECTION CRITIQUE : FUSION DES RÉSERVATIONS POUR LE FILTRAGE ================= */
  const allReservations = useMemo(() => {
    // Fusionner les deux listes en évitant les doublons
    const combinedMap = new Map<string, Reservation>();
    
    // Ajouter d'abord les réservations à vérifier
    verificationReservations.forEach(r => {
      const key = `${r.agencyId}_${r.id}`;
      combinedMap.set(key, r);
    });
    
    // Ajouter les autres réservations (elles remplacent celles qui auraient changé de statut)
    otherReservations.forEach(r => {
      const key = `${r.agencyId}_${r.id}`;
      // Ne pas écraser une réservation qui est encore à vérifier
      if (!combinedMap.has(key) || combinedMap.get(key)?.statut !== 'verification') {
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
  const filterReservationsByPeriod = (reservations: Reservation[], period: FilterOptions['period']) => {
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
      result = agencyFilteredAll.filter(r => r.statut === filterStatus);
    }
    
    // Enfin appliquer la recherche textuelle
    if (!searchTerm) return result;
    
    const term = searchTerm.toLowerCase();
    return result.filter((r) => {
      const searchable = [
        r.clientNom || '',
        r.telephone || '',
        r.referenceCode || '',
        r.depart || '',
        r.arrivee || '',
        r.email || '',
        (r as ReservationWithProof).paymentReference || r.preuveMessage || '',
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
      enAttente: agencyFilteredAll.filter(r => r.statut === 'en_attente').length,
      verification: agencyFilteredVerification.length,
      confirme: agencyFilteredAll.filter(r => r.statut === 'confirme').length,
      refuse: agencyFilteredAll.filter(r => r.statut === 'refuse').length,
      annule: agencyFilteredAll.filter(r => r.statut === 'annule').length,
      total: agencyFilteredAll.length,
      totalAmount: agencyFilteredAll.reduce((sum, r) => sum + (r.montant || 0), 0)
    };
  }, [allReservations, verificationReservations, filterPeriod, filterAgencyId]);

  /* ================= ACTIONS ================= */
  const handleValidate = async (reservation: Reservation) => {
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
      const data = snap.data() as any;
      const lifecycle = String(data?.status ?? '');
      const legacy = (data?.statut ?? '').toString().toLowerCase();
      const canConfirm =
        (lifecycle === 'payé' && !data?.ticketValidatedAt) || legacy === 'preuve_recue';
      if (!canConfirm) {
        toast.error('Erreur', { description: 'Cette réservation ne peut plus être confirmée' });
        return;
      }
      const montant = Number(data?.montant ?? reservation.montant ?? 0);
      const paymentMethodLabel = (data?.paymentMethod ?? data?.paiement ?? '').toString();
      const ensured = await ensurePendingOnlinePaymentFromReservation({
        companyId: user.companyId,
        agencyId: reservation.agencyId,
        reservationId: reservation.id,
        montant,
        paymentMethodLabel,
      });
      if (!ensured.ok) {
        toast.error('Erreur', {
          description: ensured.error ?? 'Impossible de préparer le paiement en ligne pour cette réservation.',
        });
        return;
      }

      const payment = await getPaymentByReservationId(user.companyId, reservation.id);
      if (!payment) {
        toast.error('Erreur', {
          description: 'Aucun paiement en attente pour cette réservation. Vérifiez la configuration ou contactez le support.',
        });
        return;
      }
      if (payment.status === 'pending') {
        await validatePendingOnlinePaymentAndSyncReservation(payment, user.companyId, {
          uid: user.uid ?? '',
          role: (user as { role?: string | string[] }).role,
        });
        await updateDoc(reservationRef, {
          "payment.status": "validated",
          "payment.validatedAt": serverTimestamp(),
          "payment.validatedBy": user.uid ?? "",
          updatedAt: serverTimestamp(),
        });
      } else {
        toast.error('Erreur', {
          description:
            `Ce paiement n'est pas en attente (statut : ${payment.status}). Impossible de valider depuis cet écran sans flux confirmPayment pending.`,
        });
        return;
      }

      // CRM: sync customer (create or update stats by phone)
      const phone = (data?.telephone ?? data?.telephoneOriginal ?? reservation.telephone ?? '')?.toString() || '';
      const departureDate = (data?.date ?? reservation.date ?? '')?.toString() || '';
      if (phone) {
        upsertCustomerFromReservation({
          companyId: user.companyId,
          name: (data?.nomClient ?? data?.clientNom ?? reservation.clientNom ?? '')?.toString() || '',
          phone,
          email: (data?.email ?? reservation.email) ?? null,
          montant: Number(data?.montant ?? reservation.montant ?? 0),
          departureDate: departureDate || new Date().toISOString().slice(0, 10),
        }).catch(() => {});
      }
      
      // Garder la carte visible avec état "Billet validé" + boutons (PDF, WhatsApp, Copier)
      const validatedRow: Reservation = {
        ...reservation,
        ...data,
        id: reservation.id,
        agencyId: reservation.agencyId,
        companyId: reservation.companyId ?? user.companyId,
        statut: 'confirme',
        companySlug: reservation.companySlug || data?.companySlug || (company as { slug?: string })?.slug,
        clientNom: data?.nomClient ?? data?.clientNom ?? reservation.clientNom,
        telephone: data?.telephone ?? reservation.telephone,
        depart: data?.depart ?? reservation.depart,
        arrivee: data?.arrivee ?? reservation.arrivee,
        date: data?.date ?? reservation.date,
        montant: Number(data?.montant ?? reservation.montant ?? 0),
      };
      setRecentlyValidatedReservations(prev => [validatedRow, ...prev]);

      // Retirer de la liste des réservations à vérifier (le snapshot le fera aussi)
      setVerificationReservations(prev => 
        prev.filter(r => !(r.id === reservation.id && r.agencyId === reservation.agencyId))
      );

      // Afficher immédiatement les actions de suivi (copie lien + WhatsApp)
      setFilterTab('history');
      
      // Réinitialiser la notification pour cette réservation
      resetNotification(`${reservation.agencyId}_${reservation.id}`);
      
      // UI simplifiée : on ne recharge plus l'historique (seule la liste "preuve_recue" est affichée)
      
      toast.success('Réservation confirmée', {
        description: `Le billet est maintenant disponible pour ${reservation.clientNom}`,
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

  const handleRefuse = async (reservation: Reservation) => {
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
      const data = snap.data() as any;
      const lifecycle = String(data?.status ?? '');
      const legacy = (data?.statut ?? '').toString().toLowerCase();
      const canRefuse =
        (lifecycle === 'payé' && !data?.ticketValidatedAt) || legacy === 'preuve_recue';
      if (!canRefuse) {
        toast.error('Erreur', { description: 'Cette réservation ne peut plus être refusée' });
        return;
      }
      await updateDoc(reservationRef, {
        status: 'annulé',
        refusedBy: user.uid ?? '',
        refusedAt: serverTimestamp(),
        refusalReason: 'Refus opérateur digital',
        "payment.status": "rejected",
        "payment.rejectedAt": serverTimestamp(),
        "payment.rejectedBy": user.uid ?? "",
        updatedAt: serverTimestamp(),
      });

      const tripInstanceId = data.tripInstanceId ?? null;
      const seats = (data.seatsGo ?? 0) + (data.seatsReturn ?? 0);
      if (tripInstanceId && seats > 0) {
        decrementReservedSeats(user.companyId, tripInstanceId, seats, {
          originStopOrder: data?.originStopOrder as number | null | undefined,
          destinationStopOrder: data?.destinationStopOrder as number | null | undefined,
          depart: String(data?.depart ?? ""),
          arrivee: String(data?.arrivee ?? ""),
        }).catch((err) => {
          console.error('[ReservationsEnLigne] decrementReservedSeats on refuse:', err);
        });
      }

      // Ajouter à l'historique UI (refus) pour éviter toute perte d'information.
      const refusedRow: Reservation = {
        ...reservation,
        ...data,
        id: reservation.id,
        agencyId: reservation.agencyId,
        companyId: reservation.companyId ?? user.companyId,
        statut: 'refuse',
        clientNom: data?.nomClient ?? data?.clientNom ?? reservation.clientNom,
        telephone: data?.telephone ?? reservation.telephone,
        depart: data?.depart ?? reservation.depart,
        arrivee: data?.arrivee ?? reservation.arrivee,
        date: data?.date ?? reservation.date,
        montant: Number(data?.montant ?? reservation.montant ?? 0),
      };
      setRecentlyRefusedReservations((prev) => [refusedRow, ...prev]);
      
      // Retirer de la liste des réservations à vérifier
      setVerificationReservations(prev => 
        prev.filter(r => !(r.id === reservation.id && r.agencyId === reservation.agencyId))
      );

      // Afficher l'historique tout de suite
      setFilterTab('history');
      
      // Réinitialiser la notification pour cette réservation
      resetNotification(`${reservation.agencyId}_${reservation.id}`);
      
      // UI simplifiée : on ne recharge plus l'historique (seule la liste "preuve_recue" est affichée)
      
      toast.info('Réservation refusée', {
        description: `La réservation de ${reservation.clientNom} a été refusée`,
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

  const handleDelete = async (reservation: Reservation) => {
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
      if (reservation.statut === 'verification') {
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

  const handleViewDetails = (reservation: Reservation) => {
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
        agencyStats[r.agencyId].amount += r.montant || 0;
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

  const getProofUrl = (reservation: Reservation) => {
    return reservation.preuveUrl ??
           reservation.paymentProofUrl ??
           reservation.paiementPreuveUrl ??
           reservation.proofUrl ??
           reservation.receiptUrl;
  };

  const isImageProofUrl = (url?: string | null) => {
    if (!url) return false;
    const s = url.toLowerCase();
    if (s.startsWith("data:image/")) return true;
    return /\.(png|jpe?g|gif|webp|bmp|svg)(\?.*)?$/.test(s);
  };

  const getCardKey = (r: Reservation) => `${r.agencyId}_${r.id ?? ""}`;

  const handleCopyBilletLink = async (reservation: Reservation) => {
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

  const handleOpenWhatsApp = (reservation: Reservation) => {
    const phone = toWhatsAppPhone(
      reservation.telephone || (reservation as any).telephoneOriginal || ""
    );
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
    if (filterTab !== "pending" && otherReservations.length === 0) {
      if (!requestedOtherReservations) {
        setRequestedOtherReservations(true);
        loadOtherReservations(1);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterTab, user?.companyId, otherReservations.length, requestedOtherReservations]);

  /* ================= RENDU ================= */
  const pendingReservations = verificationReservations;

  const historyReservations = useMemo(() => {
    const merged: Reservation[] = [
      ...recentlyValidatedReservations,
      ...recentlyRefusedReservations,
      ...otherReservations.filter((r) => r.statut === "confirme" || r.statut === "refuse"),
    ];

    // Dedup par clé
    const map = new Map<string, Reservation>();
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

  const visibleReservations = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();

    let list: Reservation[] = [];
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
        (r as ReservationWithProof).paymentReference || r.preuveMessage || "";
      const info = getPaymentInfo(r);
      const searchable = [
        r.clientNom || "",
        r.telephone || "",
        r.referenceCode || "",
        proofText,
        String(info.parsedTransactionId ?? ""),
        String(info.parsedAmount ?? ""),
        r.depart || "",
        r.arrivee || "",
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

  const waitingCount = useMemo(() => {
    let list = pendingReservations;
    if (filterAgencyId) list = list.filter((r) => r.agencyId === filterAgencyId);

    const term = searchTerm.trim().toLowerCase();
    if (term) {
      list = list.filter((r) => {
        const searchable = [
          r.clientNom || "",
          r.telephone || "",
          r.referenceCode || "",
          (r as ReservationWithProof).paymentReference || r.preuveMessage || "",
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
            <span className="inline-flex items-center gap-2 rounded-full border border-amber-200 dark:border-amber-800 bg-amber-50/70 dark:bg-amber-950/30 px-3 py-1 text-xs font-semibold text-amber-800 dark:text-amber-200 truncate">
              🔥 {waitingCount} en attente
            </span>
          </div>

          {/* Barre filtre compacte */}
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
              value={filterTab}
              onChange={(e) => setFilterTab(e.target.value as "today" | "pending" | "history" | "all")}
              className="h-9 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white px-2 text-sm shrink-0"
            >
              <option value="all">Tout</option>
              <option value="today">Aujourd'hui</option>
              <option value="pending">En attente</option>
              <option value="history">Historique</option>
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

          {/* Liste cartes compactes */}
          <AnimatePresence mode="popLayout">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
              {visibleReservations.map((reservation) => {
                const cardKey = `${reservation.agencyId}_${reservation.id}`;
                const isExpanded = Boolean(expandedCardKeys[cardKey]);
                const proofUrl = getProofUrl(reservation);
                const proofText =
                  (reservation as ReservationWithProof).paymentReference || reservation.preuveMessage || "";
                const agencyInfo = reservation.agencyId ? agencies[reservation.agencyId] : null;
                const statusConfig = getStatusConfig(reservation.statut);
                const isProcessing = processingId === reservation.id;
                const paymentInfo = getPaymentInfo(reservation);
                const referenceCode =
                  reservation.referenceCode ||
                  (reservation as ReservationWithProof).paymentReference ||
                  "";
                const rawPaymentMethod =
                  reservation.paymentMethodLabel ||
                  (reservation as any).paymentMethod ||
                  (reservation as any).paiement ||
                  "";
                const pm = String(rawPaymentMethod || "").toLowerCase();
                const paymentMethodLabel =
                  pm.includes("orange") || pm.includes("mobile_money")
                    ? "Orange Money"
                    : pm === "transfer" || pm.includes("virement")
                      ? "Virement"
                      : rawPaymentMethod
                        ? String(rawPaymentMethod)
                        : "—";

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
                          {reservation.clientNom || "—"} • {reservation.telephone || "N/A"}
                        </div>

                        {/* Trajet */}
                        <div className="text-xs text-gray-700 dark:text-gray-200 truncate">
                          {reservation.depart || "—"} → {reservation.arrivee || "—"}
                        </div>

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
                          {fmtMoney(reservation.montant || 0)} • {paymentMethodLabel}
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
                          {reservation.statut === "confirme" ? (
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
                          ) : reservation.statut === "refuse" ? (
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
              {visibleReservations.length === 0 && (
                <div className="col-span-full text-center py-6 text-sm text-gray-600 dark:text-gray-300">
                  Aucune réservation en attente.
                </div>
              )}
            </div>
          </AnimatePresence>
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
                  r.clientNom,
                  r.telephone,
                  r.referenceCode,
                  (r as ReservationWithProof).paymentReference,
                  r.preuveMessage
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
                const phoneForWhatsApp = toWhatsAppPhone(reservation.telephone || '');
                const whatsAppUrl = phoneForWhatsApp
                  ? `https://wa.me/${phoneForWhatsApp}?text=${encodeURIComponent(confirmationMessage)}`
                  : '';
                const proofUrl = getProofUrl(reservation);
                const proofText =
                  (reservation as ReservationWithProof).paymentReference || reservation.preuveMessage;
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
                                {reservation.clientNom || 'Sans nom'}
                              </div>
                              <div className="flex items-center gap-2 mt-1">
                                <Smartphone className="h-4 w-4 text-gray-600 dark:text-gray-300 shrink-0" />
                                <div className="text-sm font-extrabold text-gray-900 dark:text-white break-words">
                                  {reservation.telephone || 'Non renseigné'}
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
                              {fmtMoney(reservation.montant || 0)}
                            </span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-sm text-gray-500 dark:text-gray-300">Trajet</span>
                            <span className="text-sm font-medium text-gray-900 dark:text-white text-right truncate">
                              {reservation.depart || 'N/A'} → {reservation.arrivee || 'N/A'}
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

                const statusConfig = getStatusConfig(reservation.statut);
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
                              {reservation.clientNom || 'Sans nom'}
                            </div>
                            <div className="flex items-center gap-2 mt-1">
                              <Smartphone className="h-4 w-4 text-gray-600 dark:text-gray-300 shrink-0" />
                              <div className="text-sm font-extrabold text-gray-900 dark:text-white break-words">
                                {reservation.telephone || 'Non renseigné'}
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
                            {fmtMoney(reservation.montant || 0)}
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-gray-500 dark:text-gray-300">Trajet</span>
                          <span className="text-sm font-medium text-gray-900 dark:text-white text-right truncate">
                            {reservation.depart || 'N/A'} → {reservation.arrivee || 'N/A'}
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
          right={<span className="text-sm text-gray-600">{filterStatus ? `${filteredReservations.filter(r => r.statut !== 'verification').length} réservation${filteredReservations.filter(r => r.statut !== 'verification').length > 1 ? 's' : ''}` : 'Historique'}</span>}
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
              {filteredReservations.filter(r => r.statut !== 'verification').length === 0 ? (
                <div className="text-center py-8 border border-gray-200 rounded-lg">
                  <div className="text-gray-500">Aucune réservation à afficher</div>
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {filteredReservations
                      .filter(r => r.statut !== 'verification')
                      .map((reservation) => {
                        const statusConfig = getStatusConfig(reservation.statut);
                        const isProcessing = processingId === reservation.id;
                        const agencyInfo = reservation.agencyId ? agencies[reservation.agencyId] : null;
                        const proofUrl = getProofUrl(reservation);
                        const proofText =
                          (reservation as ReservationWithProof).paymentReference || reservation.preuveMessage;
                        
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
                                  {reservation.telephone || 'Non renseigné'}
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
                                  {fmtMoney(reservation.montant || 0)}
                                </span>
                              </div>

                              {/* Trajet */}
                              <div className="flex items-center justify-between px-1">
                                <span className="text-sm text-gray-500">Trajet</span>
                                <span className="text-sm font-medium text-gray-900 text-right">
                                  {reservation.depart || 'N/A'} → {reservation.arrivee || 'N/A'}
                                </span>
                              </div>

                              {/* Client (après les priorités) */}
                              <div className="flex items-center justify-between px-1">
                                <span className="text-sm text-gray-500">Client</span>
                                <span className="text-sm font-medium text-gray-900 truncate max-w-[170px] text-right">
                                  {reservation.clientNom || 'Sans nom'}
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

