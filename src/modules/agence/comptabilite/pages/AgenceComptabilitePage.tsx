// src/pages/AgenceComptabilitePage.tsx
// Comptabilité d'agence — Ventes, Versements, Caisse, Comparaison, Contrôle, Corrections (UI)
// ============================================================================
// RESPONSABLE : Comptable d'agence
// OBJECTIF : Contrôle financier des opérations de vente en billetterie ET en ligne
// FONCTIONNALITÉS :
// 1. Ventes : postes billetterie, rapports détaillés, sessions courrier
// 2. Réception et validation des remises de caisse
// 3. Encaissements terrain vs ventes ; caisse ledger ; contrôle comptage ; corrections (orientation)
// 4. Gestion de la caisse d'agence (entrées/sorties/soldes)
// 5. Réconciliation des ventes vs encaissements
// ============================================================================

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  collection, doc, getDoc, getDocs, onSnapshot, orderBy, query,
  runTransaction, Timestamp, updateDoc, where, writeBatch, limit
} from 'firebase/firestore';
import { cn } from '@/lib/utils';
import { db } from '@/firebaseConfig';
import { useAuth } from '@/contexts/AuthContext';
import { activateSession, continueSession, validateSessionByAccountant } from '@/modules/agence/services/sessionService';
import { activateCourierSession, validateCourierSession } from '@/modules/logistics/services/courierSessionService';
import { getCourierSessionLedgerTotal } from '@/modules/logistics/services/courierSessionLedger';
import type { CourierSession } from '@/modules/logistics/domain/courierSession.types';
import { courierSessionsRef } from '@/modules/logistics/domain/courierSessionPaths';
import { shipmentsRef } from '@/modules/logistics/domain/firestorePaths';
import { getDeviceFingerprint } from '@/utils/deviceFingerprint';
import useCompanyTheme from '@/shared/hooks/useCompanyTheme';
import { agencyChromePageRootStyle } from '@/shared/theme/agencySurfaceGradients';
import {
  Activity, AlertTriangle, Banknote, Building2, CheckCircle2, Clock4, Scale,
  Download, FileText, HandIcon, LogOut, MapPin, Package, Pause, Play, Plus, StopCircle, Bell,
  Ticket, Wallet, Info as InfoIcon, Shield, Receipt, BarChart3,
  RefreshCw, TrendingUp, CreditCard, Smartphone
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { StandardLayoutWrapper, SectionCard, ActionButton, MetricCard, StatusBadge, EmptyState as UIEmptyState } from '@/ui';
import { typography } from '@/ui/foundation';
import { useFormatCurrency, useCurrencySymbol } from '@/shared/currency/CurrencyContext';
import { useAgencyDarkMode } from '@/modules/agence/shared';
import AgencyTreasuryNewOperationPage from '@/modules/agence/treasury/pages/AgencyTreasuryNewOperationPage';
import AgencyTreasuryTransferPage from '@/modules/agence/treasury/pages/AgencyTreasuryTransferPage';
import AgencyTreasuryNewPayablePage from '@/modules/agence/treasury/pages/AgencyTreasuryNewPayablePage';
import { getAgencyStats } from '@/modules/compagnie/networkStats/networkStatsService';
import { getCashTransactionsByLocation } from '@/modules/compagnie/cash/cashService';
import type { AgencyCashPosition } from '@/modules/agence/comptabilite/agencyCashAuditService';
import {
  getAgencyCashLedgerPeriodSummary,
  getAgencyCashPosition,
  listAgencyCashAudits,
  validateAgencyCash,
} from '@/modules/agence/comptabilite/agencyCashAuditService';
import { listComptaEncaissementsInRange } from '@/modules/agence/comptabilite/comptaEncaissementsService';
import { dispatchAgencyCashUiRefresh } from '@/modules/agence/constants/agencyCashUiRefresh';
import {
  getEndOfDay,
  getEndOfDayForDate,
  getStartOfDay,
  getStartOfDayForDate,
  getTodayForTimezone,
  normalizeDateToYYYYMMDD,
  resolveAgencyTimezone,
} from '@/shared/date/dateUtilsTz';
import { getPaymentsByDateRange } from '@/services/paymentService';
import { AGENCY_KPI_TIME } from '@/modules/agence/shared/agencyKpiTimeContract';
import { fetchAgencyStaffProfile } from '@/modules/agence/services/agencyStaffProfileService';
import { parseShiftStatusFromFirestore } from '@/modules/agence/constants/sessionLifecycle';
import {
  COMPTA_TAB_ORDER,
  type ComptaTabKey,
  canManipulateAgencyCashInComptabilite,
  canRunAgencyCashControlAudit,
  getAllowedComptaTabs,
  getDefaultComptaTab,
  logComptabiliteTabDenied,
  normalizeUserRoles,
} from '@/modules/agence/comptabilite/agencyComptabiliteTabAccess';
import {
  belongsToGuichetSession,
  fetchReservationDocsForShiftSlot,
} from '@/modules/agence/guichet/guichetSessionReservationModel';

/* ============================================================================
   SECTION : TYPES ET INTERFACES
   Description : Définition des structures de données principales
   ============================================================================ */

type ShiftStatus = 'pending' | 'active' | 'paused' | 'closed' | 'validated_agency' | 'validated';

/** Cache vendeur pour l’UI comptable (évite GUEST si le code est sur l’équipe agence). */
type ComptaUserCacheEntry = { name?: string; email?: string; code?: string; profileLookupDone?: boolean };

type CourierSessionDoc = CourierSession & { id: string };

type ShiftDoc = {
  id: string;
  userId: string;
  userName?: string;
  userEmail?: string;
  userCode?: string;
  companyId: string;
  agencyId: string;
  status: ShiftStatus;
  startTime?: any;
  endTime?: any;
  totalTickets?: number;
  totalReservations?: number;
  totalAmount?: number;
  totalRevenue?: number;
  totalCash?: number;
  totalDigital?: number;
  payBy?: Record<string, number>;
  accountantId?: string;
  accountantCode?: string;
  accountantName?: string;
  validatedAt?: any;
  cashExpected?: number;
  cashReceived?: number;
  mmExpected?: number;
  mmReceived?: number;
  comptable?: { validated?: boolean; at?: any; by?: { id?: string; name?: string } };
};

type TicketRow = {
  id: string;
  referenceCode?: string;
  date: string;
  heure: string;
  depart: string;
  arrivee: string;
  nomClient: string;
  telephone?: string;
  seatsGo: number;
  seatsReturn?: number;
  montant: number;
  paiement?: string;
  createdAt?: any;
  guichetierCode?: string;
  canal?: string;
  encaissement?: 'agence' | 'compagnie'; // NOUVEAU : source d'encaissement
};

/** Ligne tableau rapport détaillé courrier (colis liés à une session). */
type CourierShipmentReportRow = {
  id: string;
  shipmentNumber: string;
  senderName: string;
  senderPhone: string;
  receiverName: string;
  receiverPhone: string;
  nature: string;
  transportFee: number;
  paymentStatus: string;
  currentStatus: string;
  createdAt?: unknown;
};

type AccountantProfile = {
  id: string;
  displayName?: string;
  email?: string;
  staffCode?: string;
  codeCourt?: string;
  code?: string;
};

// Agrégats compta pour les réceptions (étendu)
type ShiftAgg = {
  reservations: number;
  tickets: number;
  amount: number;
  cashExpected: number;
  mmExpected: number;
};

/* ============================================================================
   SECTION : TYPES CAISSE
   Description : Structures pour la gestion de la caisse d'agence
   ============================================================================ */

type CashDay = { dateISO: string; entrees: number; sorties: number; solde: number };

/** Une ligne par jour calendaire (évite clés React dupliquées et correspond au libellé « Historique par jour »). */
function aggregateCashDaysByDate(rows: CashDay[]): CashDay[] {
  const map = new Map<string, { entrees: number; sorties: number }>();
  for (const r of rows) {
    const cur = map.get(r.dateISO) ?? { entrees: 0, sorties: 0 };
    cur.entrees += r.entrees;
    cur.sorties += r.sorties;
    map.set(r.dateISO, cur);
  }
  return Array.from(map.entries())
    .map(([dateISO, agg]) => ({
      dateISO,
      entrees: agg.entrees,
      sorties: agg.sorties,
      solde: agg.entrees - agg.sorties,
    }))
    .sort((a, b) => (a.dateISO < b.dateISO ? -1 : a.dateISO > b.dateISO ? 1 : 0));
}

type TreasuryModalView = 'new-operation' | 'transfer' | 'new-payable' | null;

/* ============================================================================
   SECTION : TYPES RÉCONCILIATION
   Description : Structures pour la réconciliation des ventes vs encaissements
   ============================================================================ */

type ReconciliationData = {
  // Ventes
  ventesGuichet: {
    reservations: number;
    tickets: number;
    montant: number;
  };
  ventesEnLigne: {
    reservations: number;
    tickets: number;
    montant: number;
  };
  /** Paiements courrier validés (entité Payment), filtrés par jour Bamako sur createdAt — hors cashTransactions POS. */
  courrier: {
    operations: number;
    montant: number;
  };
  // Encaissements
  encaissementsEspeces: number;
  encaissementsMobileMoney: number;
  encaissementsTotal: number;
  // Écart
  ecart: number;
};

/* ============================================================================
   SECTION : HELPER FUNCTIONS
   Description : Fonctions utilitaires pour le formatage et les calculs
   ============================================================================ */

const startOfMonth = (d: Date) => new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0, 0);
const endOfMonth = (d: Date) => new Date(d.getFullYear(), d.getMonth() + 1, 1, 0, 0, 0, 0);

// Formats français pour les dates
const fmtDT = (d?: Date | null) =>
  d ? d.toLocaleString('fr-FR', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' }) : '—';
const fmtD  = (dISO?: string) => {
  if (!dISO) return '—';
  const d = new Date(dISO);
  return d.toLocaleDateString('fr-FR', { day:'2-digit', month:'2-digit', year:'numeric' });
};

/** Saisie montant avec virgule ou point (contrôle caisse). */
const parseLooseAmount = (s: string) => {
  const t = s.trim().replace(/\s/g, '').replace(/,/g, '.');
  return Number(t);
};

const auditValidatedAtToDate = (v: unknown): Date | null => {
  if (v == null) return null;
  if (v instanceof Timestamp) return v.toDate();
  if (typeof v === 'object' && 'toDate' in (v as object) && typeof (v as { toDate: () => Date }).toDate === 'function') {
    try {
      return (v as { toDate: () => Date }).toDate();
    } catch {
      return null;
    }
  }
  return null;
};

const fmtClockFr = (v: unknown) => {
  const d = auditValidatedAtToDate(v);
  return d ? d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : '—';
};

const paymentStatusLabelFr = (s: string) => {
  const u = String(s || '').toUpperCase();
  if (u === 'UNPAID') return 'Non payé';
  if (u === 'PAID_ORIGIN') return 'Payé (origine)';
  if (u === 'PAID_DESTINATION') return 'Payé (destination)';
  return s || '—';
};

const courierStatusToBadge: Record<string, 'active' | 'pending' | 'success' | 'warning' | 'neutral'> = {
  PENDING: 'pending',
  ACTIVE: 'active',
  CLOSED: 'warning',
  VALIDATED: 'success',
};

/** Relief 3D + survol « levé » (ombres neutres, bordure / fond teintés via style) */
const COMPTA_POST_CARD_3D = cn(
  'group relative overflow-hidden rounded-2xl border-2 p-5 outline-none transition-all duration-300 ease-out',
  'shadow-[0_7px_0_rgb(15_23_42/0.1),0_18px_40px_-10px_rgb(15_23_42/0.3),inset_0_2px_0_rgb(255_255_255/0.98),inset_0_-5px_14px_rgb(15_23_42/0.05)]',
  'hover:-translate-y-1.5 hover:shadow-[0_10px_0_rgb(15_23_42/0.08),0_28px_56px_-14px_rgb(15_23_42/0.35),inset_0_2px_0_rgb(255_255_255/1),inset_0_-5px_16px_rgb(15_23_42/0.06)]',
  'active:translate-y-0 active:scale-[0.995] active:shadow-[0_4px_0_rgb(15_23_42/0.11),0_10px_24px_-8px_rgb(15_23_42/0.22),inset_0_4px_10px_rgb(15_23_42/0.07)]'
);

function comptaPostCardTintStyle(theme: { primary: string; secondary: string }): React.CSSProperties {
  return {
    borderColor: `${theme.primary}7A`,
    backgroundImage: `linear-gradient(152deg, ${theme.primary}40 0%, #ffffff 36%, ${theme.secondary}30 78%, #eef2f7 100%)`,
  };
}

const COMPTA_AMOUNT_PANEL_3D = cn(
  'mb-5 rounded-xl border-2 p-3',
  'bg-gradient-to-br from-white via-white to-gray-100/95',
  'shadow-[inset_0_4px_12px_rgb(15_23_42/0.08),inset_0_-2px_0_rgb(255_255_255/0.85),0_4px_0_rgb(15_23_42/0.07)]'
);

/**
 * Carte session courrier (compta agence) — même structure visuelle que le poste billetterie (SectionShifts).
 */
const CourierComptaSessionCard: React.FC<{
  session: CourierSessionDoc;
  theme: { primary: string; secondary: string };
  usersCache: Record<string, ComptaUserCacheEntry>;
  stats: { total: number; paid: number };
  ledgerAmount?: number;
  statusLabel: string;
  startField: unknown;
  endField: unknown;
  footer?: React.ReactNode;
  afterAmountBlock?: React.ReactNode;
}> = ({
  session,
  theme,
  usersCache,
  stats,
  ledgerAmount,
  statusLabel,
  startField,
  endField,
  footer,
  afterAmountBlock,
}) => {
  const money = useFormatCurrency();
  const ui = usersCache[session.agentId] || {};
  const name = (ui.name && ui.name.trim()) || session.agentId;
  const codeRaw = String(ui.code || session.agentCode || '').trim();
  const code = codeRaw || '—';
  const badgeStatus = courierStatusToBadge[session.status] ?? 'neutral';
  const amount = Number(ledgerAmount ?? 0);

  return (
    <div className={COMPTA_POST_CARD_3D} style={comptaPostCardTintStyle(theme)}>
      <div
        className="pointer-events-none absolute inset-0 rounded-2xl opacity-0 transition-opacity duration-300 group-hover:opacity-100"
        style={{
          background: `linear-gradient(125deg, ${theme.primary}22 0%, transparent 42%, ${theme.secondary}18 100%)`,
        }}
      />
      <div className="relative">
        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="min-w-0">
            <div className="text-xs font-medium text-gray-500 uppercase tracking-wider">Agent (courrier)</div>
            <div className="font-semibold text-gray-900 truncate">
              {name} <span className="text-gray-500 text-sm ml-2">({code})</span>
            </div>
          </div>
          <StatusBadge status={badgeStatus}>{statusLabel}</StatusBadge>
        </div>
        <div className="grid grid-cols-2 gap-4 mb-4">
          <InfoCard label="Colis (session)" value={String(stats.total)} />
          <InfoCard label="Colis payés" value={String(stats.paid)} />
          <InfoCard label="Début" value={fmtClockFr(startField)} />
          <InfoCard label="Fin" value={fmtClockFr(endField)} />
        </div>
        <div
          className={COMPTA_AMOUNT_PANEL_3D}
          style={{ borderColor: `${theme.primary}55` }}
        >
          <div className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">Total encaissé</div>
          <div className="text-xl font-bold drop-shadow-sm" style={{ color: theme.primary }}>
            {ledgerAmount === undefined ? '…' : money(amount)}
          </div>
        </div>
        {afterAmountBlock}
        {footer != null && footer !== false ? (
          <div className="flex justify-end w-full flex-col sm:flex-row sm:items-center gap-2">{footer}</div>
        ) : null}
      </div>
    </div>
  );
};

/* ============================================================================
   SECTION : COMPOSANT PRINCIPAL
   Description : Page principale de comptabilité d'agence avec réconciliation
   ============================================================================ */

/** Anciens signets et URLs : `receptions` → Versements ; `reconciliation` → Comparaison ventes / caisse */
const LEGACY_TAB_TO_CANONICAL: Record<string, ComptaTabKey> = {
  controle: 'ventes',
  rapports: 'ventes',
  courrier: 'ventes',
  reconciliation: 'audit',
  encaissements: 'audit',
  comparaison: 'audit',
  receptions: 'versements',
};

function resolveComptaTabParam(raw: string | null): ComptaTabKey {
  if (!raw) return 'ventes';
  const mapped = LEGACY_TAB_TO_CANONICAL[raw];
  if (mapped) return mapped;
  if ((COMPTA_TAB_ORDER as readonly string[]).includes(raw)) return raw as ComptaTabKey;
  return 'ventes';
}

const AgenceComptabilitePage: React.FC = () => {
  console.log('[AgenceCompta] Initialisation de la page de comptabilité');
  
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user, company, logout } = useAuth() as any;
  const theme = useCompanyTheme(company) || { primary: '#EA580C', secondary: '#F97316' };
  const money = useFormatCurrency();
  const currencySymbol = useCurrencySymbol();
  const [darkMode] = useAgencyDarkMode();
  const comptaRootChromeStyle = useMemo(
    () => agencyChromePageRootStyle(theme.primary, theme.secondary, darkMode),
    [theme.primary, theme.secondary, darkMode]
  );
  const agencyTz = useMemo(
    () => resolveAgencyTimezone({ timezone: user?.agencyTimezone }),
    [user?.agencyTimezone]
  );

  /* ============================================================================
     SECTION : ÉTATS REACT - HEADER ET BRANDING
     Description : Données d'entreprise et d'agence pour l'affichage
     ============================================================================ */
  
  const [companyLogo, setCompanyLogo] = useState<string | null>(null);
  const [companyName, setCompanyName] = useState<string>('Compagnie');
  const [agencyName, setAgencyName] = useState<string>('Agence');

  /* ============================================================================
     SECTION : ÉTATS REACT - NAVIGATION ET UTILISATEUR
     Description : Gestion des onglets et profil comptable
     ============================================================================ */
  
  const setComptaTab = useCallback(
    (t: ComptaTabKey) => {
      setSearchParams({ tab: t }, { replace: true });
    },
    [setSearchParams]
  );
  const [accountant, setAccountant] = useState<AccountantProfile | null>(null);
  const [accountantCode, setAccountantCode] = useState<string>('Comptable');
  const [userRole, setUserRole] = useState<string>('');
  const prevCourierPendingCountRef = useRef(0);

  const rbacRoles = useMemo(() => {
    const fromAuth = normalizeUserRoles(user?.role);
    if (fromAuth.length && fromAuth[0] !== 'unauthenticated') return fromAuth;
    return normalizeUserRoles(userRole);
  }, [user?.role, userRole]);

  const allowedTabs = useMemo(() => getAllowedComptaTabs(rbacRoles), [rbacRoles]);
  const canManipulateCash = useMemo(() => canManipulateAgencyCashInComptabilite(rbacRoles), [rbacRoles]);
  const canRunCashAudit = useMemo(() => canRunAgencyCashControlAudit(rbacRoles), [rbacRoles]);

  const tabParam = searchParams.get('tab');
  const requestedTab = resolveComptaTabParam(tabParam);
  const tab: ComptaTabKey = allowedTabs.includes(requestedTab)
    ? requestedTab
    : getDefaultComptaTab(allowedTabs);

  useEffect(() => {
    if (allowedTabs.length === 0) return;
    if (!allowedTabs.includes(requestedTab)) {
      logComptabiliteTabDenied(requestedTab, rbacRoles);
      const fallback = getDefaultComptaTab(allowedTabs);
      setSearchParams({ tab: fallback }, { replace: true });
    }
  }, [requestedTab, allowedTabs, rbacRoles, setSearchParams]);

  /* ============================================================================
     SECTION : ÉTATS REACT - SESSIONS COURRIER (séparé du Guichet)
     Description : Listes et saisies pour l'onglet Courrier uniquement
     ============================================================================ */
  const [pendingCourierSessions, setPendingCourierSessions] = useState<CourierSessionDoc[]>([]);
  const [activeCourierSessions, setActiveCourierSessions] = useState<CourierSessionDoc[]>([]);
  const [closedCourierSessions, setClosedCourierSessions] = useState<CourierSessionDoc[]>([]);
  const [validatedCourierSessions, setValidatedCourierSessions] = useState<CourierSessionDoc[]>([]);
  const [courierValidatedAgencySessions, setCourierValidatedAgencySessions] = useState<CourierSessionDoc[]>([]);
  const [receptionInputsCourier, setReceptionInputsCourier] = useState<Record<string, { countedAmount: string }>>({});
  const [savingCourierSessionIds, setSavingCourierSessionIds] = useState<Record<string, boolean>>({});
  const [courierLedgerBySessionId, setCourierLedgerBySessionId] = useState<Record<string, number>>({});
  /** Colis rattachés à la session (temps réel), pour aligner l’UI sur le poste billetterie. */
  const [courierSessionStats, setCourierSessionStats] = useState<Record<string, { total: number; paid: number }>>({});
  const courierStatsUnsubsRef = useRef<Record<string, () => void>>({});

  /* ============================================================================
     SECTION : ÉTATS REACT - POSTES DE VENTE
     Description : Liste des postes groupés par statut
     ============================================================================ */
  
  const [pendingShifts, setPendingShifts] = useState<ShiftDoc[]>([]);
  const [activeShifts, setActiveShifts] = useState<ShiftDoc[]>([]);
  const [pausedShifts, setPausedShifts] = useState<ShiftDoc[]>([]);
  const [closedShifts, setClosedShifts] = useState<ShiftDoc[]>([]);
  const [validatedAgencyShifts, setValidatedAgencyShifts] = useState<ShiftDoc[]>([]);
  const [validatedShifts, setValidatedShifts] = useState<ShiftDoc[]>([]);
  const [validatedLimit, setValidatedLimit] = useState(10);

  /* ============================================================================
     SECTION : ÉTATS REACT - RAPPORTS
     Description : Données pour les rapports détaillés
     ============================================================================ */
  
  const [tickets, setTickets] = useState<TicketRow[]>([]);
  const [loadingReport, setLoadingReport] = useState(false);
  const [selectedShiftForReport, setSelectedShiftForReport] = useState<string>('');
  const [dedupCollapsed, setDedupCollapsed] = useState<number>(0);
  const [reportFilter, setReportFilter] = useState<'all' | 'guichet' | 'en_ligne'>('all');

  const [courierReportRows, setCourierReportRows] = useState<CourierShipmentReportRow[]>([]);
  const [loadingCourierReport, setLoadingCourierReport] = useState(false);
  const [selectedCourierSessionForReport, setSelectedCourierSessionForReport] = useState('');
  const [courierReportPaymentFilter, setCourierReportPaymentFilter] = useState<'all' | 'paid' | 'unpaid'>('all');

  /* ============================================================================
     SECTION : ÉTATS REACT - RÉCEPTIONS
     Description : Gestion des saisies pour la réception d'espèces
     ============================================================================ */
  
  const [receptionInputs, setReceptionInputs] = useState<Record<string, { cashReceived: string }>>({});
  const [savingShiftIds, setSavingShiftIds] = useState<Record<string, boolean>>({});

  /* ============================================================================
     SECTION : ÉTATS REACT - CACHES ET STATISTIQUES LIVE
     Description : Cache utilisateurs et statistiques en temps réel
     ============================================================================ */
  
  const [usersCache, setUsersCache] = useState<Record<string, ComptaUserCacheEntry>>({});
  const usersCacheRef = useRef<Record<string, ComptaUserCacheEntry>>({});
  usersCacheRef.current = usersCache;
  const [liveStats, setLiveStats] = useState<Record<string, { reservations: number; tickets: number; amount: number }>>({});
  const liveUnsubsRef = useRef<Record<string, () => void>>({});
  /** Pointe vers le dernier `reloadCash` (défini plus bas) pour rafraîchir la caisse après validation sans recharger la page. */
  const reloadCashRef = useRef<(() => Promise<void>) | null>(null);

  /* OPERATIONAL (métier) : réservations vendues jour — pas la vérité financière ledger. */
  const [agencyStatsToday, setAgencyStatsToday] = useState<{
    totalTickets: number;
    totalRevenue: number;
    onlineTickets: number;
    counterTickets: number;
  } | null>(null);

  /* ============================================================================
     SECTION : ÉTATS REACT - AGRÉGATS COMPTABLES (ÉTENDU)
     Description : Calculs agrégés pour la validation des réceptions
     ============================================================================ */
  
  const [aggByShift, setAggByShift] = useState<Record<string, ShiftAgg>>({});

  /* ============================================================================
     SECTION : ÉTATS REACT - CAISSE D'AGENCE
     Description : Gestion des mouvements de caisse et filtres
     ============================================================================ */
  
  const [useCustomRange, setUseCustomRange] = useState(false);
  const [monthValue, setMonthValue] = useState<string>(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });
  const [rangeFrom, setRangeFrom] = useState<string>('');
  const [rangeTo, setRangeTo] = useState<string>('');
  const [days, setDays] = useState<CashDay[]>([]);
  /** DOCUMENTARY journal (cashReceipts / cashMovements) — not financial truth. */
  const [totIn, setTotIn] = useState(0);
  const [totOut, setTotOut] = useState(0);
  /** Flux période : entrées (comptaEncaissements) + sorties (ledger) filtrés par createdAt / performedAt. */
  const [ledgerPeriodCash, setLedgerPeriodCash] = useState<AgencyCashPosition | null>(null);
  const [ledgerPeriodError, setLedgerPeriodError] = useState<string | null>(null);
  /** Stock global : indépendant du filtre mois / plage (toutes périodes). */
  const [cashGlobalPosition, setCashGlobalPosition] = useState<AgencyCashPosition | null>(null);
  const [loadingCash, setLoadingCash] = useState(false);
  const [treasuryModalView, setTreasuryModalView] = useState<TreasuryModalView>(null);

  /** Caisse théorique (ledger financialTransactions) + audits de contrôle */
  const [ledgerCashPosition, setLedgerCashPosition] = useState<AgencyCashPosition | null>(null);
  const [loadingLedgerCash, setLoadingLedgerCash] = useState(false);
  const [cashAuditActualInput, setCashAuditActualInput] = useState('');
  const [savingCashAudit, setSavingCashAudit] = useState(false);
  const [cashAudits, setCashAudits] = useState<
    Awaited<ReturnType<typeof listAgencyCashAudits>>
  >([]);
  const [loadingCashAudits, setLoadingCashAudits] = useState(false);

  /* ============================================================================
     SECTION : ÉTATS REACT - RÉCONCILIATION
     Description : Données pour la réconciliation des ventes vs encaissements
     ============================================================================ */

  const defaultReconciliationData: ReconciliationData = {
    ventesGuichet: { reservations: 0, tickets: 0, montant: 0 },
    ventesEnLigne: { reservations: 0, tickets: 0, montant: 0 },
    courrier: { operations: 0, montant: 0 },
    encaissementsEspeces: 0,
    encaissementsMobileMoney: 0,
    encaissementsTotal: 0,
    ecart: 0,
  };
  const [reconciliationData, setReconciliationData] = useState<ReconciliationData>(defaultReconciliationData);
  const [reconciliationLoaded, setReconciliationLoaded] = useState(false);
  const [showReconciliationDetails, setShowReconciliationDetails] = useState(false);
  const [loadingReconciliation, setLoadingReconciliation] = useState(false);
  const [reconciliationDate, setReconciliationDate] = useState<string>(() => {
    const today = new Date();
    return today.toISOString().split('T')[0];
  });

  useEffect(() => {
    if (!treasuryModalView) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setTreasuryModalView(null);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [treasuryModalView]);

  useEffect(() => {
    if (!canManipulateCash && treasuryModalView) setTreasuryModalView(null);
  }, [canManipulateCash, treasuryModalView]);

  /* ============================================================================
     SECTION : INITIALISATION DU HEADER ET PROFIL COMPTABLE
     Description : Chargement des données d'entreprise et du profil utilisateur
     ============================================================================ */
  
  useEffect(() => {
    console.log('[AgenceCompta] Chargement des données header et profil');
    
    (async () => {
      if (!user?.companyId || !user?.agencyId) {
        console.warn('[AgenceCompta] Données utilisateur incomplètes');
        return;
      }

      try {
        // Chargement des données de la compagnie
        const compSnap = await getDoc(doc(db, 'companies', user.companyId));
        if (compSnap.exists()) {
          const c = compSnap.data() as any;
          setCompanyLogo(c.logoUrl || c.logo || null);
          setCompanyName(c.nom || c.name || 'Compagnie');
          console.log(`[AgenceCompta] Compagnie chargée: ${c.nom || c.name}`);
        }

        // Chargement des données de l'agence
        const agSnap = await getDoc(doc(db, `companies/${user.companyId}/agences/${user.agencyId}`));
        if (agSnap.exists()) {
          const a = agSnap.data() as any;
          const ville = a?.ville || a?.city || a?.nomVille || a?.villeDepart || '';
          setAgencyName(a?.nomAgence || a?.nom || ville || 'Agence');
          console.log(`[AgenceCompta] Agence chargée: ${a?.nomAgence || a?.nom || ville}`);
        }

        // Chargement du profil comptable et du rôle (pour alertes Courrier)
        const uSnap = await getDoc(doc(db, 'users', user.uid));
        if (uSnap.exists()) {
          const u = uSnap.data() as any;
          setUserRole(u.role || '');
          const prof: AccountantProfile = {
            id: user.uid,
            displayName: u.displayName || user.displayName || '',
            email: u.email || user.email || '',
            staffCode: u.staffCode, codeCourt: u.codeCourt, code: u.code,
          };
          setAccountant(prof);
          setAccountantCode(u.staffCode || u.codeCourt || u.code || 'Comptable');
          console.log(`[AgenceCompta] Comptable identifié: ${prof.displayName} (${accountantCode})`);
        }
      } catch (error) {
        console.error('[AgenceCompta] Erreur lors du chargement des données:', error);
      }
    })().catch(console.error);
  }, [user?.uid, user?.companyId, user?.agencyId]);

  /* ============================================================================
     SECTION : NORMALISATION DES DONNÉES SHIFT
     Description : Uniformisation des données de poste depuis Firestore
     ============================================================================ */
  
  const normalizeShift = (id: string, r: any): ShiftDoc => {
    /** Même règle que le guichet : uniquement `shifts/{id}.status` Firestore. */
    const status = parseShiftStatusFromFirestore(r as Record<string, unknown>) as ShiftStatus;
    console.log('session status', status);
    return {
    id,
    userId: r.userId || r.openedById || '',
    userName: r.userName || r.openedByName || r.userEmail || '',
    userEmail: r.userEmail || '',
    userCode: r.userCode || r.openedByCode || '',
    companyId: r.companyId,
    agencyId: r.agencyId,
    status,
    startTime: r.startTime || r.startAt || r.openedAt,
    endTime: r.endTime || r.endAt || r.closedAt,
    totalTickets: r.totalTickets ?? r.tickets,
    totalReservations: r.totalReservations,
    totalAmount: r.totalAmount ?? r.amount,
    totalRevenue: r.totalRevenue ?? r.amount,
    totalCash: r.totalCash ?? r.amount,
    payBy: r.payBy,
    accountantId: r.accountantId,
    accountantCode: r.accountantCode,
    accountantName: r.accountantName,
    validatedAt: r.validatedAt,
    cashExpected: r.cashExpected,
    cashReceived: r.cashReceived,
    mmExpected: r.mmExpected,
    mmReceived: r.mmReceived,
    comptable: r.comptable,
  };
  };

  /* ============================================================================
     SECTION : ABONNEMENT AUX POSTES DE VENTE
     Description : Écoute en temps réel des changements dans Firestore
     ============================================================================ */
  
  useEffect(() => {
    console.log('[AgenceCompta] Démarrage de l\'écoute des postes');
    
    if (!user?.companyId || !user?.agencyId) {
      console.warn('[AgenceCompta] Abandon de l\'écoute - IDs manquants');
      return;
    }
    
    const ref = collection(db, `companies/${user.companyId}/agences/${user.agencyId}/shifts`);
    const unsub = onSnapshot(ref, async (snap) => {
      console.log(`[AgenceCompta] Mise à jour des postes: ${snap.docs.length} document(s)`);
      
      const all = snap.docs.map(d => normalizeShift(d.id, d.data()));

      // Cache vendeur : users/{uid} puis équipe agence (même logique que le guichet)
      const needed = Array.from(
        new Set(
          all
            .map((s) => s.userId)
            .filter((uid) => {
              if (!uid) return false;
              const c = usersCacheRef.current[uid];
              if (!c) return true;
              return !c.profileLookupDone;
            })
        )
      );
      if (needed.length) {
        console.log(`[AgenceCompta] Chargement de ${needed.length} utilisateur(s) (profil vendeur)`);
        const entries = await Promise.all(
          needed.map(async (uid) => {
            try {
              const profile = await fetchAgencyStaffProfile(user.companyId, user.agencyId, uid);
              return [
                uid,
                {
                  name: profile.name || '',
                  email: profile.email || '',
                  code: profile.code || '',
                  profileLookupDone: true,
                },
              ] as const;
            } catch (error) {
              console.warn('[AgenceCompta] Profil vendeur non résolu:', uid, error);
              return [uid, { profileLookupDone: true }] as const;
            }
          })
        );
        setUsersCache((prev) => {
          const next = { ...prev, ...Object.fromEntries(entries) };
          usersCacheRef.current = next;
          return next;
        });
      }

      // Tri par temps
      const byTime = (s: ShiftDoc) =>
        (s.validatedAt?.toMillis?.() ?? 0) ||
        (s.endTime?.toMillis?.() ?? 0) ||
        (s.startTime?.toMillis?.() ?? 0);

      // Mise à jour des listes groupées par statut (incl. validated_agency pour visibilité chef)
      setPendingShifts(all.filter(s => s.status === 'pending').sort((a,b)=>byTime(b)-byTime(a)));
      setActiveShifts(all.filter(s => s.status === 'active').sort((a,b)=>byTime(b)-byTime(a)));
      setPausedShifts(all.filter(s => s.status === 'paused').sort((a,b)=>byTime(b)-byTime(a)));
      setClosedShifts(all.filter(s => s.status === 'closed').sort((a,b)=>byTime(b)-byTime(a)));
      setValidatedAgencyShifts(all.filter(s => s.status === 'validated_agency').sort((a,b)=>byTime(b)-byTime(a)));
      setValidatedShifts(all.filter(s => s.status === 'validated').sort((a,b)=>byTime(b)-byTime(a)));

      console.log('[AgenceCompta] Postes mis à jour:', {
        pending: all.filter(s => s.status === 'pending').length,
        active: all.filter(s => s.status === 'active').length,
        paused: all.filter(s => s.status === 'paused').length,
        closed: all.filter(s => s.status === 'closed').length,
        validated_agency: all.filter(s => s.status === 'validated_agency').length,
        validated: all.filter(s => s.status === 'validated').length
      });
    });
    
    return () => {
      console.log('[AgenceCompta] Arrêt de l\'écoute des postes');
      unsub();
    };
  }, [user?.companyId, user?.agencyId]);

  /* KPI jour : statistiques réservations / ventes (fuseau agence). */
  useEffect(() => {
    if (!user?.companyId || !user?.agencyId) return;
    const todayKey = getTodayForTimezone(agencyTz);
    getAgencyStats(user.companyId, user.agencyId, todayKey, todayKey, agencyTz)
      .then((stats) => {
        setAgencyStatsToday({
          totalTickets: stats.totalTickets,
          totalRevenue: stats.totalRevenue,
          onlineTickets: stats.onlineTickets,
          counterTickets: stats.counterTickets,
        });
      })
      .catch(() => {
        setAgencyStatsToday(null);
      });
  }, [user?.companyId, user?.agencyId, agencyTz]);

  /* ============================================================================
     SECTION : ABONNEMENT SESSIONS COURRIER (temps réel, séparé du Guichet)
     Description : Écoute courierSessions pour l'onglet Courrier uniquement
     ============================================================================ */
  useEffect(() => {
    if (!user?.companyId || !user?.agencyId) return;
    const col = courierSessionsRef(db, user.companyId, user.agencyId);
    const unsub = onSnapshot(col, (snap) => {
      const all = snap.docs.map(d => ({ ...d.data(), id: d.id } as CourierSessionDoc));
      const byTime = (s: CourierSessionDoc) =>
        (s.validatedAt as { toMillis?: () => number })?.toMillis?.() ??
        (s.closedAt as { toMillis?: () => number })?.toMillis?.() ??
        (s.openedAt as { toMillis?: () => number })?.toMillis?.() ??
        (s.createdAt as { toMillis?: () => number })?.toMillis?.() ??
        0;
      setPendingCourierSessions(all.filter(s => s.status === 'PENDING').sort((a, b) => byTime(b) - byTime(a)));
      setActiveCourierSessions(all.filter(s => s.status === 'ACTIVE').sort((a, b) => byTime(b) - byTime(a)));
      setClosedCourierSessions(all.filter(s => s.status === 'CLOSED').sort((a, b) => byTime(b) - byTime(a)));
      setCourierValidatedAgencySessions(
        all.filter((s) => s.status === 'VALIDATED_AGENCY').sort((a, b) => byTime(b) - byTime(a))
      );
      setValidatedCourierSessions(all.filter(s => s.status === 'VALIDATED').sort((a, b) => byTime(b) - byTime(a)));
    });
    return () => unsub();
  }, [user?.companyId, user?.agencyId]);

  const courierShipmentWatchKey = useMemo(
    () =>
      [...new Set([
        ...pendingCourierSessions.map((s) => s.id),
        ...activeCourierSessions.map((s) => s.id),
        ...closedCourierSessions.map((s) => s.id),
      ])].sort().join(','),
    [pendingCourierSessions, activeCourierSessions, closedCourierSessions]
  );

  useEffect(() => {
    if (!user?.companyId) return;
    const wanted = new Set(
      courierShipmentWatchKey ? courierShipmentWatchKey.split(',').filter(Boolean) : []
    );
    const cur = courierStatsUnsubsRef.current;
    for (const id of Object.keys(cur)) {
      if (!wanted.has(id)) {
        try {
          cur[id]();
        } catch {
          /* ignore */
        }
        delete cur[id];
      }
    }
    for (const id of wanted) {
      if (cur[id]) continue;
      const qSh = query(shipmentsRef(db, user.companyId), where('sessionId', '==', id));
      cur[id] = onSnapshot(
        qSh,
        (snap) => {
          let paid = 0;
          for (const d of snap.docs) {
            const ps = (d.data() as { paymentStatus?: string }).paymentStatus;
            if (ps && ps !== 'UNPAID') paid += 1;
          }
          setCourierSessionStats((p) => ({ ...p, [id]: { total: snap.docs.length, paid } }));
        },
        () => {}
      );
    }
  }, [user?.companyId, courierShipmentWatchKey]);

  const courierAgentWatchKey = useMemo(
    () =>
      [...new Set([
        ...pendingCourierSessions.map((s) => s.agentId),
        ...activeCourierSessions.map((s) => s.agentId),
        ...closedCourierSessions.map((s) => s.agentId),
        ...courierValidatedAgencySessions.map((s) => s.agentId),
      ].filter(Boolean))].sort().join(','),
    [pendingCourierSessions, activeCourierSessions, closedCourierSessions, courierValidatedAgencySessions]
  );

  useEffect(() => {
    if (!user?.companyId || !user?.agencyId || !courierAgentWatchKey) return;
    const agentIds = courierAgentWatchKey.split(',').filter(Boolean);
    const needed = agentIds.filter((uid) => {
      const c = usersCacheRef.current[uid];
      return !c || !c.profileLookupDone;
    });
    if (!needed.length) return;
    void (async () => {
      const entries = await Promise.all(
        needed.map(async (uid) => {
          try {
            const profile = await fetchAgencyStaffProfile(user.companyId!, user.agencyId!, uid);
            return [
              uid,
              {
                name: profile.name || '',
                email: profile.email || '',
                code: profile.code || '',
                profileLookupDone: true,
              },
            ] as const;
          } catch {
            return [uid, { profileLookupDone: true }] as const;
          }
        })
      );
      setUsersCache((prev) => {
        const next = { ...prev, ...Object.fromEntries(entries) };
        usersCacheRef.current = next;
        return next;
      });
    })();
  }, [user?.companyId, user?.agencyId, courierAgentWatchKey]);

  useEffect(() => {
    if (!user?.companyId) return;
    let cancelled = false;
    const ids = [
      ...new Set([
        ...pendingCourierSessions.map(s => s.id),
        ...closedCourierSessions.map(s => s.id),
        ...validatedCourierSessions.map(s => s.id),
        ...activeCourierSessions.map(s => s.id),
      ]),
    ];
    if (ids.length === 0) {
      setCourierLedgerBySessionId({});
      return;
    }
    void (async () => {
      const next: Record<string, number> = {};
      for (const id of ids) {
        try {
          next[id] = await getCourierSessionLedgerTotal(user.companyId!, id);
        } catch {
          next[id] = 0;
        }
      }
      if (!cancelled) setCourierLedgerBySessionId(next);
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.companyId, closedCourierSessions, validatedCourierSessions, activeCourierSessions]);

  // Toast "Nouvelle demande d'activation Courrier" quand PENDING passe de 0 à > 0 (comptable uniquement)
  useEffect(() => {
    const count = pendingCourierSessions.length;
    if (userRole === 'agency_accountant' && count > 0 && prevCourierPendingCountRef.current === 0) {
      toast.info('Nouvelle demande d\'activation Courrier');
    }
    prevCourierPendingCountRef.current = count;
  }, [pendingCourierSessions.length, userRole]);

  /* ============================================================================
     SECTION : STATISTIQUES EN TEMPS RÉEL (GUICHET — POSTE + VENDEUR UNIQUEMENT)
     Description : Calcul des stats live pour les postes actifs/en pause
     ============================================================================ */
  
  useEffect(() => {
    console.log('[AgenceCompta] Mise à jour des statistiques live');
    
    if (!user?.companyId || !user?.agencyId) return;
    const rRef = collection(db, `companies/${user.companyId}/agences/${user.agencyId}/reservations`);

    // Nettoyage des écouteurs inutiles
    for (const id of Object.keys(liveUnsubsRef.current)) {
      const stillNeeded = !![...activeShifts, ...pausedShifts].find(s => s.id === id);
      if (!stillNeeded) {
        console.log(`[AgenceCompta] Arrêt de l'écoute pour le poste ${id}`);
        liveUnsubsRef.current[id]?.();
        delete liveUnsubsRef.current[id];
      }
    }

    // Ajout des écouteurs pour les postes actifs/en pause
    for (const s of [...activeShifts, ...pausedShifts]) {
      if (liveUnsubsRef.current[s.id]) continue;
      
      console.log(`[AgenceCompta] Démarrage de l'écoute pour le poste ${s.id}`);
      const qLive = query(rRef, where('sessionId', '==', s.id));
      const unsub = onSnapshot(qLive, (snap) => {
        let reservations = 0, tickets = 0, amount = 0;
        snap.forEach(d => {
          const r = d.data() as Record<string, unknown>;
          if (!belongsToGuichetSession(r, s.id, s.userId)) return;
          reservations += 1;
          tickets += (Number(r.seatsGo) || 0) + (Number(r.seatsReturn) || 0);
          amount += Number(r.montant) || 0;
        });
        setLiveStats(prev => ({ ...prev, [s.id]: { reservations, tickets, amount } }));
      });
      liveUnsubsRef.current[s.id] = unsub;
    }

    return () => {
      console.log('[AgenceCompta] Nettoyage des écouteurs live');
      for (const k of Object.keys(liveUnsubsRef.current)) liveUnsubsRef.current[k]?.();
      liveUnsubsRef.current = {};
    };
  }, [activeShifts, pausedShifts, user?.companyId, user?.agencyId]);

  /* ============================================================================
     SECTION : AGRÉGATS POUR RÉCEPTIONS (GUICHET UNIQUEMENT)
     Description : Calcul des montants attendus pour validation comptable
     ============================================================================ */
  
  useEffect(() => {
    console.log('[AgenceCompta] Calcul des agrégats pour réceptions');
    
    (async () => {
      if (!user?.companyId || !user?.agencyId) return;
      const rRef = collection(db, `companies/${user.companyId}/agences/${user.agencyId}/reservations`);
      const map: Record<string, ShiftAgg> = {};
      
      console.log(`[AgenceCompta] ${closedShifts.length} poste(s) clôturé(s) à analyser`);
      
      for (const s of closedShifts) {
        const docs = await fetchReservationDocsForShiftSlot(user.companyId, user.agencyId, s.id);
        let reservations = 0, tickets = 0, amount = 0, cashExpected = 0, mmExpected = 0;
        
        docs.forEach(d => {
          const r = d.data() as Record<string, unknown>;
          if (!belongsToGuichetSession(r, s.id, s.userId)) return;
          reservations += 1;
          tickets += (Number(r.seatsGo) || 0) + (Number(r.seatsReturn) || 0);
          const montant = Number(r.montant) || 0;
          amount += montant;
          
          const pay = String(r.paiement || '').toLowerCase();
          if (pay.includes('esp')) {
            cashExpected += montant;
          }
          if (pay.includes('mobile') || pay.includes('mm')) {
            mmExpected += montant;
          }
        });
        
        map[s.id] = { 
          reservations, 
          tickets, 
          amount, 
          cashExpected, 
          mmExpected,
        };
      }
      
      setAggByShift(map);
      console.log('[AgenceCompta] Agrégats calculés:', Object.keys(map).length);
    })().catch((e) => console.error('[AgenceCompta] Erreur agrégats réceptions:', e));
  }, [closedShifts, user?.companyId, user?.agencyId]);

  /** Préremplit « Montant reçu » avec l’attendu espèces pour éviter une validation à 0 (champ vide → Number('') === 0). */
  useEffect(() => {
    const pending = closedShifts.filter((s) => s.status === 'closed');
    if (pending.length === 0) return;
    setReceptionInputs((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const s of pending) {
        if (Object.prototype.hasOwnProperty.call(next, s.id)) continue;
        const payBy = s.payBy || {};
        const agg = aggByShift[s.id];
        const expected = Number(
          s.totalCash ?? agg?.cashExpected ?? payBy['espèces'] ?? s.cashExpected ?? 0
        );
        if (expected > 0) {
          next[s.id] = { cashReceived: String(Math.round(expected)) };
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [closedShifts, aggByShift]);

  /* ============================================================================
     SECTION : ACTIONS SUR LES POSTES
     Description : Gestion du cycle de vie des postes (activation/pause/continuer)
     ============================================================================ */
  
  const activateShift = useCallback(async (id:string) => {
    if(!user?.companyId||!user?.agencyId||!accountant) return;
    try {
      await activateSession({
        companyId: user.companyId,
        agencyId: user.agencyId,
        shiftId: id,
        activatedBy: { id: accountant.id, name: accountant.displayName || accountant.email || null },
      });
    } catch (error: unknown) {
      console.error(`[AgenceCompta] Erreur activation poste ${id}:`, error);
      alert((error instanceof Error ? error.message : 'Erreur lors de l\'activation du poste'));
    }
  },[user?.companyId, user?.agencyId, accountant]);

  const continueShift = useCallback(async (id:string) => {
    if(!user?.companyId||!user?.agencyId) return;
    try {
      await continueSession(user.companyId, user.agencyId, id);
    } catch (error: unknown) {
      console.error(`[AgenceCompta] Erreur reprise poste ${id}:`, error);
    }
  },[user?.companyId, user?.agencyId]);

  /* ============================================================================
     SECTION : RÉCEPTION ET VALIDATION COMPTABLE
     Description : Validation des remises d'espèces et génération de reçus
     ============================================================================ */
  
  const setReceptionInput = (shiftId: string, value: string) =>
    setReceptionInputs(prev => ({ ...prev, [shiftId]: { cashReceived: value } }));

  const validateReception = useCallback(async (shift: ShiftDoc) => {
    console.log(`[AgenceCompta] Validation de la réception pour le poste ${shift.id}`);
    
    if (!user?.companyId || !user?.agencyId || !accountant) {
      console.warn('[AgenceCompta] Données manquantes pour la validation');
      return;
    }
    
    if (savingShiftIds[shift.id]) {
      console.log(`[AgenceCompta] Validation déjà en cours pour le poste ${shift.id}`);
      return;
    }
    
    setSavingShiftIds(p => ({ ...p, [shift.id]: true }));

    const inputs = receptionInputs[shift.id] ?? { cashReceived: '' };
    const toAmount = (s: string) => {
      const raw = String(s ?? '').trim();
      if (raw === '') return NaN;
      const clean = raw.replace(/[^\d.,]/g, '').replace(',', '.');
      if (clean === '' || clean === '.') return NaN;
      const n = Number(clean);
      return Number.isFinite(n) && n >= 0 ? n : NaN;
    };

    const cashRcv = toAmount(inputs.cashReceived ?? '');
    if (!Number.isFinite(cashRcv)) {
      alert('Saisissez le montant espèces reçu (champ obligatoire). Le montant attendu est affiché sur la carte du poste.');
      setSavingShiftIds(p => ({ ...p, [shift.id]: false }));
      return;
    }

    try {
      const { computedDifference } = await validateSessionByAccountant({
        companyId: user.companyId,
        agencyId: user.agencyId,
        shiftId: shift.id,
        receivedCashAmount: cashRcv,
        validatedBy: { id: accountant.id, name: accountant.displayName || accountant.email || null },
        accountantDeviceFingerprint: getDeviceFingerprint(),
      });

      try {
        await reloadCashRef.current?.();
      } catch (reErr) {
        console.warn('[AgenceCompta] Rafraîchissement caisse après validation:', reErr);
      }
      dispatchAgencyCashUiRefresh();

      setReceptionInputs(prev => ({ ...prev, [shift.id]: { cashReceived: '' } }));
      if (computedDifference !== 0) {
        alert(`Validation enregistrée. Écart (reçu − montant attendu) : ${computedDifference >= 0 ? '+' : ''}${computedDifference.toFixed(0)} ${currencySymbol}`);
      } else {
        alert('Validation enregistrée ✓');
      }
    } catch (e: unknown) {
      console.error(`[AgenceCompta] Erreur validation poste ${shift.id}:`, e);
      alert(e instanceof Error ? e.message : 'Erreur lors de la validation.');
    } finally {
      setSavingShiftIds(p => ({ ...p, [shift.id]: false }));
    }
  }, [user?.companyId, user?.agencyId, accountant, receptionInputs, currencySymbol, savingShiftIds]);

  /* ============================================================================
     SECTION : ACTIONS COURRIER (activation et validation, séparé du Guichet)
     Description : Activer une session PENDING ; valider une session CLOSED avec montant compté
     ============================================================================ */
  const setReceptionInputCourier = (sessionId: string, value: string) =>
    setReceptionInputsCourier(prev => ({ ...prev, [sessionId]: { countedAmount: value } }));

  const activateCourierSessionAction = useCallback(async (sessionId: string) => {
    if (!user?.companyId || !user?.agencyId || !accountant) return;
    try {
      await activateCourierSession({
        companyId: user.companyId,
        agencyId: user.agencyId,
        sessionId,
        activatedBy: { id: accountant.id, name: accountant.displayName || accountant.email || null },
      });
    } catch (e: unknown) {
      console.error('[AgenceCompta] Erreur activation session courrier:', e);
      alert(e instanceof Error ? e.message : 'Erreur lors de l\'activation.');
    }
  }, [user?.companyId, user?.agencyId, accountant]);

  const validateCourierSessionAction = useCallback(async (session: CourierSessionDoc) => {
    if (!user?.companyId || !user?.agencyId || !accountant) return;
    const raw = (receptionInputsCourier[session.id] || { countedAmount: '' }).countedAmount || '0';
    const counted = Number(String(raw).replace(/[^\d.,]/g, '').replace(',', '.'));
    if (!Number.isFinite(counted) || counted < 0) {
      alert('Montant compté invalide.');
      return;
    }
    if (savingCourierSessionIds[session.id]) return;
    setSavingCourierSessionIds(p => ({ ...p, [session.id]: true }));
    try {
      const { difference } = await validateCourierSession({
        companyId: user.companyId,
        agencyId: user.agencyId,
        sessionId: session.id,
        validatedAmount: counted,
        validatedBy: { id: accountant.id, name: accountant.displayName || accountant.email || null },
      });
      try {
        await reloadCashRef.current?.();
      } catch (reErr) {
        console.warn('[AgenceCompta] Rafraîchissement caisse après validation courrier:', reErr);
      }
      dispatchAgencyCashUiRefresh();
      setReceptionInputsCourier(prev => ({ ...prev, [session.id]: { countedAmount: '' } }));
      if (difference !== 0) {
        alert(`Validation enregistrée. Écart (compté − montant attendu) : ${difference >= 0 ? '+' : ''}${difference.toFixed(0)} ${currencySymbol}`);
      } else {
        alert('Validation enregistrée ✓');
      }
    } catch (e: unknown) {
      console.error('[AgenceCompta] Erreur validation session courrier:', e);
      alert(e instanceof Error ? e.message : 'Erreur lors de la validation.');
    } finally {
      setSavingCourierSessionIds(p => ({ ...p, [session.id]: false }));
    }
  }, [user?.companyId, user?.agencyId, accountant, receptionInputsCourier, currencySymbol, savingCourierSessionIds]);

  /* ============================================================================
     SECTION : RAPPORTS DÉTAILLÉS (GUICHET — SESSION + VENDEUR)
     Description : Détail des ventes du poste, sans mélange avec l’en ligne
     ============================================================================ */
  
  const loadReportForShift = useCallback(async (shiftId: string) => {
    console.log(`[AgenceCompta] Chargement du rapport pour le poste ${shiftId}`);
    
    if (!user?.companyId || !user?.agencyId || !shiftId) { 
      console.log('[AgenceCompta] Données manquantes pour le rapport');
      setTickets([]); 
      setDedupCollapsed(0); 
      return; 
    }
    
    setLoadingReport(true);
    setSelectedShiftForReport(shiftId);

    try {
      const base = `companies/${user.companyId}/agences/${user.agencyId}`;
      const rRef = collection(db, `${base}/reservations`);
      const sRef = doc(db, `${base}/shifts/${shiftId}`);
      const sSnap = await getDoc(sRef);
      const sDoc: any = sSnap.exists() ? sSnap.data() : {};
      
      const userId   = String(sDoc.userId || sDoc.openedById || '');

      const merged = await fetchReservationDocsForShiftSlot(user.companyId, user.agencyId, shiftId, {
        perQueryLimit: 800,
      });

      const mk = (d: any) => {
        const r = d.data() as any;
        const canal = 'guichet';
        const encaissement = 'agence' as const;

        return {
          id: d.id,
          referenceCode: r.referenceCode,
          date: r.date,
          heure: r.heure,
          depart: r.depart,
          arrivee: r.arrivee,
          nomClient: r.nomClient,
          telephone: r.telephone,
          seatsGo: r.seatsGo || 1,
          seatsReturn: r.seatsReturn || 0,
          montant: r.montant || 0,
          paiement: r.paiement,
          createdAt: r.createdAt,
          guichetierCode: r.guichetierCode || '',
          canal,
          encaissement,
        } as TicketRow;
      };

      const rawDocs = merged.filter((d) =>
        belongsToGuichetSession(d.data() as Record<string, unknown>, shiftId, userId)
      );
      const raw = rawDocs.map(mk);

      // Déduplication basée sur les références uniques
      const norm = (v?: string) => String(v || '').normalize('NFKC').replace(/\s+/g,' ').trim().toLowerCase();
      const keyOf = (t: TicketRow) =>
        (t.referenceCode && norm(t.referenceCode)) ||
        [norm(t.date), norm(t.heure), norm(t.depart), norm(t.arrivee), norm(t.nomClient), norm(t.telephone)].join('|');

      const map = new Map<string, TicketRow>();
      for (const t of raw) {
        const k = keyOf(t);
        const prev = map.get(k);
        if (!prev) map.set(k, t);
        else {
          const prevTs = (prev.createdAt?.toMillis?.() ?? 0);
          const curTs  = (t.createdAt?.toMillis?.() ?? 0);
          map.set(k, curTs >= prevTs ? t : prev);
        }
      }

      const rows = [...map.values()].sort((a,b)=>(a.createdAt?.toMillis?.() ?? 0) - (b.createdAt?.toMillis?.() ?? 0));
      setTickets(rows);
      setDedupCollapsed(raw.length - rows.length);
      
      console.log(`[AgenceCompta] Rapport chargé: ${rows.length} ligne(s), ${raw.length - rows.length} doublon(s) éliminé(s)`);
    } catch (error) {
      console.error(`[AgenceCompta] Erreur lors du chargement du rapport:`, error);
      alert('Erreur lors du chargement du rapport');
    } finally {
      setLoadingReport(false);
    }
  }, [user?.companyId, user?.agencyId]);

  const loadCourierReportForSession = useCallback(
    async (sessionId: string) => {
      if (!user?.companyId || !sessionId) {
        setCourierReportRows([]);
        setSelectedCourierSessionForReport('');
        return;
      }
      setLoadingCourierReport(true);
      setSelectedCourierSessionForReport(sessionId);
      try {
        const snap = await getDocs(
          query(shipmentsRef(db, user.companyId), where('sessionId', '==', sessionId))
        );
        const rows: CourierShipmentReportRow[] = snap.docs.map((d) => {
          const r = d.data() as Record<string, unknown>;
          const sender = (r.sender as { name?: string; phone?: string }) || {};
          const receiver = (r.receiver as { name?: string; phone?: string }) || {};
          return {
            id: d.id,
            shipmentNumber: String(r.shipmentNumber || d.id),
            senderName: String(sender.name || '—'),
            senderPhone: String(sender.phone || ''),
            receiverName: String(receiver.name || '—'),
            receiverPhone: String(receiver.phone || ''),
            nature: String(r.nature || '—'),
            transportFee: Number(r.transportFee ?? 0),
            paymentStatus: String(r.paymentStatus || 'UNPAID'),
            currentStatus: String(r.currentStatus || '—'),
            createdAt: r.createdAt,
          };
        });
        rows.sort((a, b) => {
          const ta =
            a.createdAt && typeof (a.createdAt as { toMillis?: () => number }).toMillis === 'function'
              ? (a.createdAt as { toMillis: () => number }).toMillis()
              : 0;
          const tb =
            b.createdAt && typeof (b.createdAt as { toMillis?: () => number }).toMillis === 'function'
              ? (b.createdAt as { toMillis: () => number }).toMillis()
              : 0;
          return ta - tb;
        });
        setCourierReportRows(rows);
      } catch (e) {
        console.error('[AgenceCompta] Rapport courrier:', e);
        alert('Erreur lors du chargement des colis de la session');
        setCourierReportRows([]);
      } finally {
        setLoadingCourierReport(false);
      }
    },
    [user?.companyId]
  );

  /* ============================================================================
     SECTION : CALCULS DES TOTAUX (ÉTENDU POUR FILTRES)
     Description : Agrégation des montants pour les rapports et statistiques
     ============================================================================ */
  
  const totals = useMemo(() => {
    const agg = { 
      billets: 0, 
      montant: 0,
      guichet: { billets: 0, montant: 0 },
      en_ligne: { billets: 0, montant: 0 }
    };
    
    for (const t of tickets) {
      const nb = (t.seatsGo || 0) + (t.seatsReturn || 0);
      agg.billets += nb; 
      agg.montant += t.montant || 0;
      
      if (t.canal === 'guichet' || t.canal === '') {
        agg.guichet.billets += nb;
        agg.guichet.montant += t.montant || 0;
      } else if (t.canal === 'en_ligne') {
        agg.en_ligne.billets += nb;
        agg.en_ligne.montant += t.montant || 0;
      }
    }
    return agg;
  }, [tickets]);

  const courierReportFilteredRows = useMemo(() => {
    if (courierReportPaymentFilter === 'all') return courierReportRows;
    if (courierReportPaymentFilter === 'paid')
      return courierReportRows.filter((r) => r.paymentStatus && r.paymentStatus !== 'UNPAID');
    return courierReportRows.filter((r) => !r.paymentStatus || r.paymentStatus === 'UNPAID');
  }, [courierReportRows, courierReportPaymentFilter]);

  const courierReportTotals = useMemo(
    () => ({
      colis: courierReportFilteredRows.length,
      fraisTransport: courierReportFilteredRows.reduce((s, r) => s + (Number(r.transportFee) || 0), 0),
    }),
    [courierReportFilteredRows]
  );

  const liveTotalsGlobal = useMemo(() => {
    let reservations = 0, tickets = 0, amount = 0;
    for (const s of [...activeShifts, ...pausedShifts]) {
      const lv = liveStats[s.id];
      if (lv) { 
        reservations += lv.reservations; 
        tickets += lv.tickets; 
        amount += lv.amount; 
      }
    }
    console.log('[AgenceCompta] Totaux globaux live:', { reservations, tickets, amount });
    return { reservations, tickets, amount };
  }, [activeShifts, pausedShifts, liveStats]);

  /** Billetterie (postes clôturés) + courrier (sessions clôturées) : à traiter sous l’onglet Versements. */
  const receptionsBilletteriePendingCount = useMemo(
    () => closedShifts.filter((s) => s.status === 'closed').length,
    [closedShifts]
  );
  const receptionsPendingTotal =
    receptionsBilletteriePendingCount + closedCourierSessions.length;

  /* ============================================================================
     SECTION : GESTION DE LA CAISSE - CONFIGURATION
     Description : Configuration des périodes pour les rapports de caisse
     ============================================================================ */
  
  const currentRange = useMemo(() => {
    if (useCustomRange && rangeFrom && rangeTo) {
      const from = new Date(rangeFrom); from.setHours(0,0,0,0);
      const to = new Date(rangeTo); to.setHours(24,0,0,0);
      return { from, to };
    }
    const [y,m] = monthValue.split('-').map(Number);
    const d = new Date(y, (m||1)-1, 1);
    return { from: startOfMonth(d), to: endOfMonth(d) };
  }, [useCustomRange, rangeFrom, rangeTo, monthValue]);

  /* ============================================================================
     SECTION : GESTION DE LA CAISSE - CHARGEMENT DES DONNÉES
     Description : Récupération et agrégation des mouvements de caisse
     ============================================================================ */
  
  const reloadCash = useCallback(async () => {
    console.log('[AgenceCompta] Chargement des données de caisse', currentRange);
    
    if (!user?.companyId || !user?.agencyId) return;
    setLoadingCash(true);
    setLedgerPeriodError(null);

    /** Stock caisse : ne dépend pas de la période (solde ledger + cumul encaissements / sorties tout temps). */
    try {
      const globalPos = await getAgencyCashPosition(user.companyId, user.agencyId);
      setCashGlobalPosition(globalPos);
      console.log('[AgenceCompta][caisse] solde global (hors période):', {
        soldeLedger: globalPos.soldeCash,
        cumulEncaissementsToutTemps: globalPos.totalCashIn,
        cumulSortiesToutTemps: globalPos.totalCashOut,
      });
    } catch (globalErr) {
      console.warn('[AgenceCompta] Solde global caisse:', globalErr);
      setCashGlobalPosition(null);
    }

    try {
      // Sorties caisse : financialTransactions. Entrées comptables : comptaEncaissements (validation session).
      const txRef = collection(db, `companies/${user.companyId}/financialTransactions`);
      let snap;
      try {
        const qTx = query(
          txRef,
          where("agencyId", "==", user.agencyId),
          where("createdAt", ">=", Timestamp.fromDate(currentRange.from)),
          where("createdAt", "<", Timestamp.fromDate(currentRange.to)),
          orderBy("createdAt", "desc"),
          limit(50)
        );
        snap = await getDocs(qTx);
      } catch (rangeErr) {
        // Fallback robuste: certains jeux de données historiques ont des createdAt manquants
        // ou des index/règles partiels sur la requête bornée.
        console.warn("[AgenceCompta] reloadCash range query failed, fallback agency-only:", rangeErr);
        const qFallback = query(
          txRef,
          where("agencyId", "==", user.agencyId),
          orderBy("createdAt", "desc"),
          limit(200)
        );
        snap = await getDocs(qFallback);
      }

      const txRows: CashDay[] = snap.docs
        .map((d) => d.data() as Record<string, unknown>)
        .map((tx) => {
          const createdAt = (tx.createdAt as Timestamp | undefined)?.toDate?.() ?? null;
          return { tx, createdAt };
        })
        .filter(
          (x): x is { tx: Record<string, unknown>; createdAt: Date } =>
            x.createdAt instanceof Date &&
            x.createdAt >= currentRange.from &&
            x.createdAt < currentRange.to
        )
        .map(({ tx, createdAt }) => {
          const amount = Math.max(0, Number(tx.amount ?? 0));
          const type = String(tx.type ?? "").toLowerCase();
          const source = String(tx.source ?? "").toLowerCase();

          /** Entrées : uniquement via comptaEncaissements (pas les lignes ledger ici). */
          const isOut =
            type === "expense" ||
            type === "payment_sent" ||
            type === "transfer" ||
            type === "transfer_to_bank" ||
            type === "adjustment" ||
            source === "cashout";

          const entrees = 0;
          const sorties = isOut ? amount : 0;

          return {
            dateISO: createdAt.toISOString().split("T")[0],
            entrees,
            sorties,
            solde: entrees - sorties,
          };
        });

      let comptaRows: CashDay[] = [];
      try {
        const enc = await listComptaEncaissementsInRange(
          user.companyId,
          user.agencyId,
          currentRange.from,
          currentRange.to,
          500
        );
        comptaRows = enc
          .map((e) => {
            const raw = e.createdAt as Timestamp | undefined;
            const dt = raw?.toDate?.() ?? null;
            if (!(dt instanceof Date)) return null;
            const m = Math.max(0, Number(e.montant ?? 0));
            return {
              dateISO: dt.toISOString().split("T")[0],
              entrees: m,
              sorties: 0,
              solde: m,
            };
          })
          .filter((x): x is CashDay => x != null);
      } catch (encErr) {
        console.warn("[AgenceCompta] comptaEncaissements (période):", encErr);
      }

      const rows = aggregateCashDaysByDate([...txRows, ...comptaRows]);
      let totalIn = 0;
      let totalOut = 0;
      for (const r of rows) {
        totalIn += r.entrees;
        totalOut += r.sorties;
      }

      setDays(rows);
      setTotIn(totalIn);
      setTotOut(totalOut);

      let periodSummary: AgencyCashPosition | null = null;
      try {
        periodSummary = await getAgencyCashLedgerPeriodSummary(
          user.companyId,
          user.agencyId,
          currentRange.from,
          currentRange.to
        );
        setLedgerPeriodCash(periodSummary);
      } catch (periodErr) {
        console.warn("[AgenceCompta] Période caisse ledger:", periodErr);
        setLedgerPeriodCash(null);
      }

      const netPeriode = periodSummary
        ? periodSummary.totalCashIn - periodSummary.totalCashOut
        : totalIn - totalOut;
      console.log("[AgenceCompta] Données de caisse chargées:", {
        jours: rows.length,
        entreesPeriode: periodSummary?.totalCashIn ?? totalIn,
        sortiesPeriode: periodSummary?.totalCashOut ?? totalOut,
        netFluxPeriode: netPeriode,
        entrées_documentaire_fallback: totalIn,
        sorties_documentaire_fallback: totalOut,
      });
    } catch (error) {
      console.error('[AgenceCompta] Erreur lors du chargement de la caisse (période / journal):', error);
      setLedgerPeriodCash(null);
      setDays([]);
      setTotIn(0);
      setTotOut(0);
      setLedgerPeriodError("Impossible de charger les mouvements de la période. Le solde global reste affiché si disponible.");
      console.log("[AgenceCompta][caisse] erreur période — entrees/sorties période indisponibles");
    } finally {
      setLoadingCash(false);
    }
  }, [user?.companyId, user?.agencyId, currentRange]);

  reloadCashRef.current = reloadCash;

  useEffect(() => { 
    console.log('[AgenceCompta] Déclenchement du chargement de la caisse');
    void reloadCash(); 
  }, [reloadCash]);

  const reloadLedgerCashAudit = useCallback(async () => {
    if (!user?.companyId || !user?.agencyId) return;
    setLoadingLedgerCash(true);
    setLoadingCashAudits(true);
    try {
      const [pos, audits] = await Promise.all([
        getAgencyCashPosition(user.companyId, user.agencyId),
        listAgencyCashAudits(user.companyId, user.agencyId, 50),
      ]);
      setLedgerCashPosition(pos);
      setCashAudits(audits);
    } catch (error) {
      console.error('[AgenceCompta] Contrôle caisse ledger:', error);
      toast.error('Impossible de charger le montant attendu (ventes) de la caisse.');
    } finally {
      setLoadingLedgerCash(false);
      setLoadingCashAudits(false);
    }
  }, [user?.companyId, user?.agencyId]);

  useEffect(() => {
    if (tab !== 'audit') return;
    if (!user?.companyId || !user?.agencyId) return;
    void reloadLedgerCashAudit();
  }, [tab, user?.companyId, user?.agencyId, reloadLedgerCashAudit]);

  const cashAuditGapPreview = useMemo(() => {
    const actual = parseLooseAmount(cashAuditActualInput);
    const th = ledgerCashPosition?.soldeCash;
    if (!Number.isFinite(actual) || th === undefined || !Number.isFinite(th)) return null;
    return actual - th;
  }, [cashAuditActualInput, ledgerCashPosition?.soldeCash]);

  const handleValidateAgencyCash = useCallback(async () => {
    if (!canRunAgencyCashControlAudit(rbacRoles)) {
      toast.error('Seul le chef d’agence (ou un administrateur) peut enregistrer un contrôle de caisse.');
      return;
    }
    if (!user?.companyId || !user?.agencyId || !user?.uid) {
      toast.error('Session ou profil incomplet.');
      return;
    }
    const actual = parseLooseAmount(cashAuditActualInput);
    if (!Number.isFinite(actual) || actual < 0) {
      toast.error('Montant réel invalide.');
      return;
    }
    setSavingCashAudit(true);
    try {
      await validateAgencyCash({
        companyId: user.companyId,
        agencyId: user.agencyId,
        actualAmount: actual,
        validatedBy: {
          id: user.uid,
          name: accountant?.displayName ?? user.email ?? null,
        },
      });
      toast.success('Contrôle de caisse enregistré.');
      setCashAuditActualInput('');
      await reloadLedgerCashAudit();
    } catch (e) {
      console.error(e);
      toast.error(e instanceof Error ? e.message : 'Échec de la validation.');
    } finally {
      setSavingCashAudit(false);
    }
  }, [
    user?.companyId,
    user?.agencyId,
    user?.uid,
    user?.email,
    accountant?.displayName,
    cashAuditActualInput,
    reloadLedgerCashAudit,
    rbacRoles,
  ]);

  /* ============================================================================
     SECTION : RÉCONCILIATION DES VENTES vs ENCAISSEMENTS
     Description : Calcul de la cohérence entre billets vendus et argent encaissé
     ============================================================================ */
  
  const loadReconciliation = useCallback(async () => {
    console.log('[AgenceCompta] Chargement des données de réconciliation pour', reconciliationDate);

    if (!user?.companyId || !user?.agencyId) return;

    setLoadingReconciliation(true);

    try {
      // operational data, not financial truth — cashTransactions (sessions / closeSession), not ledger
      const dateStr = reconciliationDate.trim() || new Date().toISOString().split('T')[0];
      let list: Array<{ id: string; sourceType?: string; locationId?: string; amount?: number; seats?: number; paymentMethod?: string; status?: string }>;
      try {
        list = await getCashTransactionsByLocation(user.companyId, user.agencyId, dateStr, agencyTz);
      } catch (idxErr) {
        console.warn('[AgenceCompta] getCashTransactionsByLocation (createdAt) failed, trying createdAt range fallback', idxErr);
        const { getCashTransactionsByPaidAtRange } = await import('@/modules/compagnie/cash/cashService');
        const all = await getCashTransactionsByPaidAtRange(user.companyId, dateStr, dateStr, agencyTz);
        list = all.filter((t: { locationId?: string }) => t.locationId === user.agencyId);
      }

      const ventesGuichet = { reservations: 0, tickets: 0, montant: 0 };
      const ventesEnLigne = { reservations: 0, tickets: 0, montant: 0 };
      let encaissementsEspeces = 0;
      let encaissementsMobileMoney = 0;

      const refunded = 'refunded';
      list.forEach((t) => {
        if ((t as { status?: string }).status === refunded) return;
        const amount = Number(t.amount || 0);
        const seats = Number(t.seats || 0);
        const source = String((t as { sourceType?: string }).sourceType || '').toLowerCase();
        const payment = String((t as { paymentMethod?: string }).paymentMethod || '').toLowerCase();

        if (source === 'guichet') {
          ventesGuichet.reservations += 1;
          ventesGuichet.tickets += seats || 1;
          ventesGuichet.montant += amount;
          if (payment.includes('cash') || payment.includes('esp')) encaissementsEspeces += amount;
          else if (payment.includes('mobile') || payment.includes('mm')) encaissementsMobileMoney += amount;
        } else if (source === 'online') {
          ventesEnLigne.reservations += 1;
          ventesEnLigne.tickets += seats || 1;
          ventesEnLigne.montant += amount;
        }
      });

      const encaissementsTotal = encaissementsEspeces + encaissementsMobileMoney;
      const ecart = ventesGuichet.montant - encaissementsTotal;

      const dayKey = normalizeDateToYYYYMMDD(dateStr);
      let courrierOps = 0;
      let courrierMontant = 0;
      try {
        const from = getStartOfDayForDate(dayKey, agencyTz);
        const to = getEndOfDayForDate(dayKey, agencyTz);
        const payments = await getPaymentsByDateRange(user.companyId, from, to);
        for (const p of payments) {
          if (p.agencyId !== user.agencyId) continue;
          if (p.channel !== 'courrier') continue;
          if (p.status !== 'validated') continue;
          courrierOps += 1;
          courrierMontant += Number(p.amount) || 0;
        }
      } catch (courrierErr) {
        console.warn('[AgenceCompta] Paiements courrier (jour):', courrierErr);
      }

      setReconciliationData({
        ventesGuichet,
        ventesEnLigne,
        courrier: { operations: courrierOps, montant: courrierMontant },
        encaissementsEspeces,
        encaissementsMobileMoney,
        encaissementsTotal,
        ecart,
      });
      setReconciliationLoaded(true);

      console.log('[AgenceCompta] Réconciliation calculée (cashTransactions):', {
        ventesGuichet,
        ventesEnLigne,
        courrier: { operations: courrierOps, montant: courrierMontant },
        encaissementsTotal,
        ecart,
      });
    } catch (error) {
      console.error('[AgenceCompta] Erreur lors du chargement de la réconciliation:', error);
      setReconciliationLoaded(false);
      alert('Erreur lors du chargement de la réconciliation');
    } finally {
      setLoadingReconciliation(false);
    }
  }, [user?.companyId, user?.agencyId, reconciliationDate, agencyTz]);
  
  useEffect(() => {
    if (tab === 'audit') {
      loadReconciliation();
    }
  }, [tab, reconciliationDate, loadReconciliation]);

  /* ============================================================================
     SECTION : HELPER FUNCTIONS - RECHERCHE
     Description : Fonctions utilitaires pour la recherche de données
     ============================================================================ */
  
  const findShift = useCallback(
    (id?: string) => [...activeShifts, ...pausedShifts, ...closedShifts, ...validatedAgencyShifts, ...validatedShifts].find(s => s.id === id),
    [activeShifts, pausedShifts, closedShifts, validatedAgencyShifts, validatedShifts]
  );

  const findCourierSession = useCallback(
    (id?: string) =>
      [
        ...pendingCourierSessions,
        ...activeCourierSessions,
        ...closedCourierSessions,
        ...validatedCourierSessions,
      ].find((s) => s.id === id),
    [pendingCourierSessions, activeCourierSessions, closedCourierSessions, validatedCourierSessions]
  );

  const courierSessionsForReportOptions = useMemo(
    () => [
      ...pendingCourierSessions.map((s) => ({ s, statutFr: 'En attente' as const })),
      ...activeCourierSessions.map((s) => ({ s, statutFr: 'En service' as const })),
      ...closedCourierSessions.map((s) => ({ s, statutFr: 'Clôturé' as const })),
      ...validatedCourierSessions.map((s) => ({ s, statutFr: 'Validé' as const })),
    ],
    [pendingCourierSessions, activeCourierSessions, closedCourierSessions, validatedCourierSessions]
  );

  /* ============================================================================
     SECTION : RENDU PRINCIPAL
     Description : Interface utilisateur de la page de comptabilité
     ============================================================================ */
  
  return (
    <div
      className={`min-h-screen min-w-0 w-full overflow-x-hidden ${darkMode ? 'agency-dark' : ''}`}
      style={comptaRootChromeStyle}
    >
      {/* ============================================================================
         HEADER : EN-TÊTE AVEC BRANDING ET NAVIGATION
         Description : Logo, nom d'entreprise, onglets et informations comptable
         ============================================================================ */}
      
      <div className="sticky top-0 z-10 shadow-sm">
        {/* Barre globale — même chrome dégradé que InternalLayout */}
        <div
          className="h-16 border-b border-gray-200/60"
          style={{ backgroundImage: 'var(--agency-gradient-header)' }}
        >
          <div className="max-w-7xl mx-auto min-w-0 h-full px-3 sm:px-6 flex items-center justify-between gap-2 sm:gap-3">
            <div className="flex items-center gap-2 sm:gap-3 min-w-0">
              {companyLogo ? (
                <img
                  src={companyLogo}
                  alt="Logo compagnie"
                  className="h-10 w-10 rounded-lg object-contain border border-gray-200 bg-white p-0.5"
                />
              ) : (
                <div className="h-10 w-10 rounded-lg border border-gray-200 bg-white grid place-items-center">
                  <Building2 className="h-5 w-5 text-gray-500" />
                </div>
              )}
              <div className="min-w-0">
                <div
                  className="text-xs sm:text-sm font-semibold text-gray-900 truncate"
                  style={{ color: theme?.primary }}
                  title={companyName}
                >
                  {companyName}
                </div>
                <div className="hidden sm:flex text-xs text-gray-500 items-center gap-1.5 truncate">
                  <MapPin className="h-3.5 w-3.5 flex-shrink-0" />
                  <span className="truncate">{agencyName}</span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-1 sm:gap-2">
              {(userRole === 'agency_accountant' ||
                userRole === 'chefAgence' ||
                userRole === 'superviseur' ||
                userRole === 'admin_compagnie') && (
                <Link
                  to="/agence/comptabilite/journal-agents"
                  className="hidden sm:inline-flex items-center px-2.5 py-1.5 text-xs font-medium rounded-lg border border-gray-200 bg-white text-gray-700 hover:bg-gray-50"
                >
                  Journal agents
                </Link>
              )}
              <button
                type="button"
                className="relative inline-flex items-center justify-center h-8 w-8 sm:h-9 sm:w-9 rounded-lg border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 transition-colors"
                title="Notifications"
              >
                <Bell className="h-4 w-4" />
                {userRole === 'agency_accountant' &&
                  allowedTabs.includes('versements') &&
                  pendingCourierSessions.length > 0 && (
                  <span className="absolute -top-1 -right-1 min-w-[1rem] h-4 px-1 rounded-full bg-red-500 text-white text-[10px] font-bold leading-4 text-center">
                    {pendingCourierSessions.length > 99 ? '99+' : pendingCourierSessions.length}
                  </span>
                )}
              </button>

              {accountant && (
                <div className="hidden md:flex items-center gap-2 px-2.5 py-1.5 rounded-lg border border-gray-200 bg-white text-gray-800">
                  <div
                    className="h-7 w-7 rounded-full flex items-center justify-center text-xs font-bold text-white"
                    style={{ backgroundColor: theme?.primary }}
                  >
                    {accountant.displayName?.charAt(0) || 'C'}
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs font-medium truncate text-gray-900">
                      {(accountant.displayName || accountant.email || '—')}
                    </div>
                    <div className="text-[11px] text-gray-500 truncate">
                      {accountantCode || '—'}
                    </div>
                  </div>
                </div>
              )}

              <button
                onClick={async () => {
                  console.log('[AgenceCompta] Déconnexion du comptable');
                  await logout();
                  navigate('/login');
                }}
                className="inline-flex items-center gap-1 sm:gap-2 px-2 sm:px-3 py-2 text-sm rounded-lg border border-gray-200 bg-white text-gray-700 hover:bg-gray-50 transition-colors"
                title="Déconnexion"
              >
                <LogOut className="h-4 w-4" />
                <span className="hidden lg:inline">Déconnexion</span>
              </button>
            </div>
          </div>
        </div>

        {/* Barre de navigation module */}
        <div
          className="border-b border-gray-200/60"
          style={{ backgroundImage: 'var(--agency-gradient-subheader)' }}
        >
          <div className="max-w-7xl mx-auto min-w-0 px-4 sm:px-6 py-2">
            <div className="flex min-w-0 gap-2 overflow-x-auto whitespace-nowrap pb-1 [-webkit-overflow-scrolling:touch]">
              {allowedTabs.includes('ventes') && (
                <TabButton
                  active={tab === 'ventes'}
                  onClick={() => setComptaTab('ventes')}
                  label="Ventes"
                  icon={<Ticket className="h-4 w-4" />}
                  theme={theme}
                  badgeCount={
                    userRole === 'agency_accountant' && allowedTabs.includes('ventes')
                      ? pendingCourierSessions.length
                      : 0
                  }
                />
              )}
              {allowedTabs.includes('versements') && (
                <TabButton
                  active={tab === 'versements'}
                  onClick={() => setComptaTab('versements')}
                  label="Versements"
                  icon={<HandIcon className="h-4 w-4" />}
                  theme={theme}
                  badgeCount={userRole === 'agency_accountant' ? receptionsPendingTotal : 0}
                />
              )}
              {allowedTabs.includes('caisse') && (
                <TabButton
                  active={tab === 'caisse'}
                  onClick={() => setComptaTab('caisse')}
                  label="Caisse"
                  icon={<Banknote className="h-4 w-4" />}
                  theme={theme}
                />
              )}
              {allowedTabs.includes('audit') && (
                <TabButton
                  active={tab === 'audit'}
                  onClick={() => setComptaTab('audit')}
                  label="Contrôle"
                  icon={<Scale className="h-4 w-4" />}
                  theme={theme}
                />
              )}
              {allowedTabs.includes('corrections') && (
                <TabButton
                  active={tab === 'corrections'}
                  onClick={() => setComptaTab('corrections')}
                  label="Corrections"
                  icon={<Shield className="h-4 w-4" />}
                  theme={theme}
                />
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ============================================================================
         CONTENU PRINCIPAL
         Description : Contenu des différents onglets
         ============================================================================ */}
      
      <StandardLayoutWrapper className="min-w-0">
        {userRole === 'agency_accountant' &&
          allowedTabs.includes('versements') &&
          receptionsPendingTotal > 0 &&
          tab !== 'versements' && (
            <div className="mb-4 flex flex-col gap-3 rounded-xl border border-amber-200 bg-amber-50/90 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex min-w-0 items-start gap-3">
                <Bell className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" aria-hidden />
                <div className="min-w-0 text-sm text-amber-950">
                  <div className="font-semibold">Versements à valider</div>
                  <p className="mt-0.5 text-amber-900/90">
                    {receptionsPendingTotal} session
                    {receptionsPendingTotal > 1 ? 's' : ''} fermée
                    {receptionsPendingTotal > 1 ? 's' : ''} en attente
                    {receptionsBilletteriePendingCount > 0 && closedCourierSessions.length > 0
                      ? ' (guichet et courrier)'
                      : receptionsBilletteriePendingCount > 0
                        ? ' (guichet)'
                        : closedCourierSessions.length > 0
                          ? ' (courrier)'
                          : ''}
                    . Ouvrez l’onglet <strong>Versements</strong>.
                  </p>
                </div>
              </div>
              <ActionButton
                type="button"
                className="w-full shrink-0 sm:w-auto"
                onClick={() => setComptaTab('versements')}
              >
                Ouvrir Versements
              </ActionButton>
            </div>
          )}

        {/* ============================================================================
           ONGLET : VENTES — activité du jour, postes, rapports, courrier
           ============================================================================ */}
        
        {tab === 'ventes' && (
          <div className="space-y-6">
            <div className="w-full overflow-x-auto sm:overflow-x-visible pb-1 -mx-1 px-1 sm:mx-0 sm:px-0">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-4 lg:gap-6 min-w-0 w-full [&>*]:min-w-0">
                <MetricCard
                  label="Guichets en service"
                  value={activeShifts.length.toString()}
                  icon={Play}
                  valueColorVar={theme?.primary}
                  hint="Postes guichet ouverts maintenant"
                />
                <MetricCard
                  label="Billets vendus (jour)"
                  value={agencyStatsToday !== null ? agencyStatsToday.totalTickets.toString() : "—"}
                  icon={Ticket}
                  valueColorVar={theme?.primary}
                  hint={AGENCY_KPI_TIME.CREATION_RESERVATION_BAMAKO}
                />
                <MetricCard
                  label="Montant des ventes (jour)"
                  value={agencyStatsToday !== null ? money(agencyStatsToday.totalRevenue) : "—"}
                  icon={Wallet}
                  valueColorVar={theme?.primary}
                  hint={AGENCY_KPI_TIME.CREATION_RESERVATION_BAMAKO}
                />
                <MetricCard
                  label="Ventes en ligne (jour)"
                  value={agencyStatsToday !== null ? agencyStatsToday.onlineTickets.toString() : "—"}
                  icon={Activity}
                  valueColorVar={theme?.primary}
                  hint={AGENCY_KPI_TIME.CREATION_RESERVATION_BAMAKO}
                />
              </div>
            </div>

            {/* Postes en service */}
            <SectionShifts
              title="Postes en service"
              icon={Play}
              list={activeShifts}
              usersCache={usersCache}
              liveStats={liveStats}
              theme={theme}
              actions={() => null}
            />

            {pendingShifts.length > 0 ? (
              <SectionShifts
                title="Postes en attente d'activation"
                hint="Le vendeur billetterie est connecté mais ne peut pas vendre tant que vous n'activez pas."
                icon={Clock4}
                list={pendingShifts}
                usersCache={usersCache}
                liveStats={{}}
                theme={theme}
                actions={(s) => (
                  <ActionButton onClick={() => activateShift(s.id)}>
                    <Play className="h-4 w-4 mr-2" />
                    Activer le poste
                  </ActionButton>
                )}
              />
            ) : null}

            {pausedShifts.length > 0 ? (
              <SectionShifts
                title="Postes en pause"
                hint="Peuvent être remis en service. Clôture par le vendeur uniquement."
                icon={Pause}
                list={pausedShifts}
                usersCache={usersCache}
                liveStats={liveStats}
                theme={theme}
                actions={(s) => (
                  <ActionButton onClick={() => continueShift(s.id)}>
                    <Play className="h-4 w-4 mr-2" />
                    Continuer
                  </ActionButton>
                )}
              />
            ) : null}

            {/* —— Rapports détaillés (ex-onglet Rapports) —— */}
            <div className="rounded-xl border border-gray-200 shadow-sm p-5 bg-gradient-to-r from-white to-gray-50/50">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-3">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-blue-50 to-indigo-50 flex items-center justify-center">
                    <BarChart3 className="h-5 w-5 text-blue-600" />
                  </div>
                  <div>
                    <div className="text-lg font-bold text-gray-900">Détail par poste guichet</div>
                    <div className="text-sm text-gray-600">
                      Ventes du poste choisi + les réservations <strong>en ligne</strong> de l’agence sur la même période
                      (ouverture du poste → clôture, ou maintenant si le poste est encore ouvert).
                    </div>
                  </div>
                </div>
                <div className="w-full sm:w-96">
                  <select
                    className="w-full border border-gray-300 rounded-xl px-4 py-3 bg-white shadow-sm focus:outline-none focus:ring-2 focus:border-transparent text-sm"
                    style={{ outlineColor: theme.primary }}
                    value={selectedShiftForReport}
                    onChange={(e) => loadReportForShift(e.target.value)}
                  >
                    <option value="">— Sélectionnez un poste —</option>
                    {[...activeShifts, ...pausedShifts, ...closedShifts, ...validatedAgencyShifts, ...validatedShifts].map(s => {
                      const ui   = usersCache[s.userId] || {};
                      const name = ui.name || s.userName || s.userEmail || s.userId;
                      const code = ui.code || s.userCode || 'GUEST';
                      const start = s.startTime ? new Date(s.startTime.toDate?.() ?? s.startTime) : null;
                      const end   = s.endTime   ? new Date(s.endTime.toDate?.()   ?? s.endTime)   : null;

                      const statutFr =
                        s.status === 'active'           ? 'En service'  :
                        s.status === 'paused'           ? 'En pause'    :
                        s.status === 'closed'           ? 'Clôturé'     :
                        s.status === 'validated_agency' ? 'Validé agence' :
                        s.status === 'validated'        ? 'Validé'      : 'En attente';

                      const periode = `${start ? start.toLocaleDateString('fr-FR') : '?'} → ${end ? end.toLocaleDateString('fr-FR') : '?'}`;

                      return (
                        <option key={s.id} value={s.id}>
                          {`${name} (${code}) • ${periode} • ${statutFr}`}
                        </option>
                      );
                    })}
                  </select>
                </div>
              </div>
              
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mt-4">
                {selectedShiftForReport && (() => {
                  const s = findShift(selectedShiftForReport);
                  const start = s?.startTime ? new Date(s.startTime.toDate?.() ?? s.startTime) : null;
                  const end   = s?.endTime   ? new Date(s.endTime.toDate?.()   ?? s.endTime)   : null;
                  return (
                    <div className="text-sm text-gray-600">
                      Période analysée : {fmtDT(start)} → {fmtDT(end)}
                      {dedupCollapsed > 0 && (
                        <span className="ml-3 px-2 py-1 rounded-full bg-gradient-to-r from-blue-50 to-indigo-50 text-blue-700 text-xs font-medium">
                          {dedupCollapsed} doublon{dedupCollapsed>1?'s':''} consolidé{dedupCollapsed>1?'s':''}
                        </span>
                      )}
                    </div>
                  );
                })()}
                
                <div className="flex items-center gap-3">
                  <div className="text-sm font-medium text-gray-700">Filtrer par canal :</div>
                  <div className="flex rounded-xl border border-gray-300 p-1">
                    <button
                      className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${reportFilter === 'all' ? 'bg-blue-50 text-blue-700' : 'text-gray-600 hover:bg-gray-100'}`}
                      onClick={() => setReportFilter('all')}
                    >
                      Tous
                    </button>
                    <button
                      className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${reportFilter === 'guichet' ? 'bg-emerald-50 text-emerald-700' : 'text-gray-600 hover:bg-gray-100'}`}
                      onClick={() => setReportFilter('guichet')}
                    >
                      Billetterie
                    </button>
                    <button
                      className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${reportFilter === 'en_ligne' ? 'bg-indigo-50 text-indigo-700' : 'text-gray-600 hover:bg-gray-100'}`}
                      onClick={() => setReportFilter('en_ligne')}
                    >
                      En ligne
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* KPI du rapport (opérationnel) */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6">
              <MetricCard label="Billets vendus (terrain)" value={totals.billets.toString()} icon={Ticket} valueColorVar={theme?.primary} hint={AGENCY_KPI_TIME.SESSION_POSTE} />
              <MetricCard label="Montant total des ventes" value={money(totals.montant)} icon={Wallet} valueColorVar={theme?.primary} hint={AGENCY_KPI_TIME.SESSION_POSTE} />
              <MetricCard label="Lignes réservations" value={tickets.length.toString()} icon={Activity} valueColorVar={theme?.primary} hint={AGENCY_KPI_TIME.SESSION_POSTE} />
            </div>

            {/* Tableau détaillé */}
            <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
              <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="text-lg font-bold text-gray-900">Détail des réservations</div>
                <div className="text-sm text-gray-600">
                  {tickets.length} ligne{tickets.length > 1 ? 's' : ''}
                </div>
              </div>
              
              {loadingReport ? (
                <div className="flex items-center justify-center py-12">
                  <div className="text-center">
                    <div className="h-12 w-12 border-4 border-gray-200 border-t-blue-500 rounded-full animate-spin mx-auto mb-3"></div>
                    <div className="text-gray-600">Chargement des données...</div>
                  </div>
                </div>
              ) : !tickets.length ? (
                <UIEmptyState message="Aucune donnée disponible — Sélectionnez un poste pour afficher son rapport détaillé" />
              ) : (
                <div className="min-w-0 overflow-hidden rounded-xl border border-gray-200">
                  <div className="overflow-x-auto [-webkit-overflow-scrolling:touch]">
                    <table className="w-full min-w-[44rem] text-sm">
                      <thead className="bg-gradient-to-r from-gray-50 to-gray-100/50">
                        <tr>
                          <Th>Date/Heure</Th>
                          <Th>Canal</Th>
                          <Th>Trajet</Th>
                          <Th>Client</Th>
                          <Th align="right">Billets</Th>
                          <Th align="right">Montant</Th>
                          <Th align="right">Paiement</Th>
                          <Th align="right">Vendeur</Th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200">
                        {tickets
                          .filter(t => {
                            if (reportFilter === 'all') return true;
                            if (reportFilter === 'guichet') return t.canal === 'guichet' || t.canal === '';
                            if (reportFilter === 'en_ligne') return t.canal === 'en_ligne';
                            return true;
                          })
                          .map((t, index) => {
                            const canalColor = t.canal === 'en_ligne' 
                              ? 'bg-indigo-100 text-indigo-700' 
                              : 'bg-emerald-100 text-emerald-700';
                              
                            const encaissementText = t.encaissement === 'agence' ? 'Caisse agence' : 'Compte compagnie';
                            const encaissementColor = t.encaissement === 'agence' 
                              ? 'bg-blue-100 text-blue-700' 
                              : 'bg-purple-100 text-purple-700';
                              
                            return (
                              <tr key={t.id} className={`hover:bg-gray-50/50 ${index % 2 === 0 ? 'bg-white' : 'bg-gray-50/30'}`}>
                                <Td>
                                  <div className="font-medium">{fmtD(t.date)}</div>
                                  <div className="text-xs text-gray-500">{t.heure}</div>
                                </Td>
                                <Td>
                                  <div className="flex flex-col gap-1">
                                    <span className={`text-xs px-2 py-1 rounded-full ${canalColor} font-medium`}>
                                      {t.canal === 'en_ligne' ? 'En ligne' : 'Billetterie'}
                                    </span>
                                    <span className={`text-xs px-2 py-0.5 rounded-full ${encaissementColor}`}>
                                      {encaissementText}
                                    </span>
                                  </div>
                                </Td>
                                <Td>
                                  <div className="font-medium">{t.depart} → {t.arrivee}</div>
                                </Td>
                                <Td>
                                  <div className="font-medium">{t.nomClient}</div>
                                  {t.telephone && <div className="text-xs text-gray-500">{t.telephone}</div>}
                                </Td>
                                <Td align="right">
                                  <span className="font-medium">{(t.seatsGo||0)+(t.seatsReturn||0)}</span>
                                </Td>
                                <Td align="right">
                                  <span className="font-bold text-gray-900">{money(t.montant)}</span>
                                </Td>
                                <Td align="right">
                                  <span className="text-xs text-gray-600">{t.paiement || '—'}</span>
                                </Td>
                                <Td align="right">
                                  <span className="text-xs px-2 py-1 rounded-full bg-gray-100 text-gray-700">
                                    {t.guichetierCode || '—'}
                                  </span>
                                </Td>
                              </tr>
                            );
                          })
                        }
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>

            {/* —— Courrier (ex-onglet Courrier) —— */}
            <SectionCard title="Paiements courrier" icon={Package}>
            <div className="space-y-6">
            <SectionCard
              title="Sessions actives"
              icon={Play}
              right={
                <StatusBadge status="neutral">
                  {activeCourierSessions.length} session{activeCourierSessions.length > 1 ? 's' : ''}
                </StatusBadge>
              }
            >
              {activeCourierSessions.length === 0 ? (
                <UIEmptyState message="Aucune session courrier en cours." />
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {activeCourierSessions.map((s) => (
                    <CourierComptaSessionCard
                      key={s.id}
                      session={s}
                      theme={theme}
                      usersCache={usersCache}
                      stats={courierSessionStats[s.id] ?? { total: 0, paid: 0 }}
                      ledgerAmount={courierLedgerBySessionId[s.id]}
                      statusLabel="En service"
                      startField={s.openedAt ?? s.createdAt}
                      endField={null}
                    />
                  ))}
                </div>
              )}
            </SectionCard>

            {pendingCourierSessions.length > 0 ? (
              <SectionCard
                title="Sessions en attente d'activation"
                icon={Clock4}
                description="L'agent a créé une session ; activez-la pour qu'il puisse enregistrer des envois."
                right={
                  <StatusBadge status="neutral">
                    {pendingCourierSessions.length} session{pendingCourierSessions.length > 1 ? 's' : ''}
                  </StatusBadge>
                }
              >
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {pendingCourierSessions.map((s) => (
                    <CourierComptaSessionCard
                      key={s.id}
                      session={s}
                      theme={theme}
                      usersCache={usersCache}
                      stats={courierSessionStats[s.id] ?? { total: 0, paid: 0 }}
                      ledgerAmount={courierLedgerBySessionId[s.id] ?? 0}
                      statusLabel="En attente"
                      startField={s.createdAt}
                      endField={null}
                      footer={
                        <ActionButton onClick={() => activateCourierSessionAction(s.id)}>
                          <Play className="h-4 w-4 mr-2" />
                          Activer le poste
                        </ActionButton>
                      }
                    />
                  ))}
                </div>
              </SectionCard>
            ) : null}

            </div>
            </SectionCard>

            {/* Rapports détaillés par session courrier */}
            <div className="rounded-xl border border-gray-200 shadow-sm p-5 bg-gradient-to-r from-white to-violet-50/40">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-3">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-violet-50 to-purple-100 flex items-center justify-center">
                    <Package className="h-5 w-5 text-violet-700" />
                  </div>
                  <div>
                    <div className="text-lg font-bold text-gray-900">Rapports détaillés par session courrier</div>
                    <div className="text-sm text-gray-600">
                      Liste des colis enregistrés sur la session sélectionnée (même base que les paiements courrier).
                    </div>
                  </div>
                </div>
                <div className="w-full sm:w-[28rem]">
                  <select
                    className="w-full border border-gray-300 rounded-xl px-4 py-3 bg-white shadow-sm focus:outline-none focus:ring-2 focus:border-transparent text-sm"
                    style={{ outlineColor: theme.primary }}
                    value={selectedCourierSessionForReport}
                    onChange={(e) => {
                      const v = e.target.value;
                      setCourierReportPaymentFilter('all');
                      void loadCourierReportForSession(v);
                    }}
                  >
                    <option value="">— Sélectionnez une session courrier —</option>
                    {courierSessionsForReportOptions.map(({ s, statutFr }) => {
                      const ui = usersCache[s.agentId] || {};
                      const name = (ui.name && ui.name.trim()) || s.agentId;
                      const code = String(ui.code || s.agentCode || '').trim() || '—';
                      const opened = auditValidatedAtToDate(s.openedAt ?? s.createdAt);
                      const closed = auditValidatedAtToDate(s.closedAt);
                      const periode = `${opened ? opened.toLocaleDateString('fr-FR') : '?'} → ${closed ? closed.toLocaleDateString('fr-FR') : '—'}`;
                      return (
                        <option key={s.id} value={s.id}>
                          {`${name} (${code}) • ${periode} • ${statutFr}`}
                        </option>
                      );
                    })}
                  </select>
                </div>
              </div>

              {selectedCourierSessionForReport ? (
                <>
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mt-4 mb-4">
                    {(() => {
                      const cs = findCourierSession(selectedCourierSessionForReport);
                      const o = cs ? auditValidatedAtToDate(cs.openedAt ?? cs.createdAt) : null;
                      const c = cs ? auditValidatedAtToDate(cs.closedAt) : null;
                      const ledgerVal = courierLedgerBySessionId[selectedCourierSessionForReport];
                      return (
                        <div className="text-sm text-gray-600 space-y-1">
                          <div>
                            Période session : {fmtDT(o)} → {c ? fmtDT(c) : '—'}
                          </div>
                          {ledgerVal !== undefined && (
                            <div className="text-violet-900 font-medium">
                              Montant attendu (ventes) : {money(Number(ledgerVal) || 0)}
                            </div>
                          )}
                        </div>
                      );
                    })()}
                    <div className="flex flex-wrap items-center gap-3">
                      <div className="text-sm font-medium text-gray-700">Paiement colis :</div>
                      <div className="flex rounded-xl border border-gray-300 p-1">
                        <button
                          type="button"
                          className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${courierReportPaymentFilter === 'all' ? 'bg-violet-50 text-violet-800' : 'text-gray-600 hover:bg-gray-100'}`}
                          onClick={() => setCourierReportPaymentFilter('all')}
                        >
                          Tous
                        </button>
                        <button
                          type="button"
                          className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${courierReportPaymentFilter === 'paid' ? 'bg-emerald-50 text-emerald-800' : 'text-gray-600 hover:bg-gray-100'}`}
                          onClick={() => setCourierReportPaymentFilter('paid')}
                        >
                          Payés
                        </button>
                        <button
                          type="button"
                          className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${courierReportPaymentFilter === 'unpaid' ? 'bg-amber-50 text-amber-900' : 'text-gray-600 hover:bg-gray-100'}`}
                          onClick={() => setCourierReportPaymentFilter('unpaid')}
                        >
                          Non payés
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6 mb-6">
                    <MetricCard
                      label="Colis (lignes)"
                      value={courierReportTotals.colis.toString()}
                      icon={Package}
                      valueColorVar={theme?.primary}
                      hint={AGENCY_KPI_TIME.SESSION_POSTE}
                    />
                    <MetricCard
                      label="Frais transport (somme)"
                      value={money(courierReportTotals.fraisTransport)}
                      icon={Wallet}
                      valueColorVar={theme?.primary}
                      hint={AGENCY_KPI_TIME.SESSION_POSTE}
                    />
                    <MetricCard
                      label="Colis en base (session)"
                      value={courierReportRows.length.toString()}
                      icon={Activity}
                      valueColorVar={theme?.primary}
                      hint={AGENCY_KPI_TIME.SESSION_POSTE}
                    />
                  </div>

                  <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
                    <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <div className="text-lg font-bold text-gray-900">Détail des colis</div>
                      <div className="text-sm text-gray-600">
                        {courierReportFilteredRows.length} ligne{courierReportFilteredRows.length > 1 ? 's' : ''}
                        {courierReportPaymentFilter !== 'all' ? ' (filtré)' : ''}
                      </div>
                    </div>
                    {loadingCourierReport ? (
                      <div className="flex items-center justify-center py-12">
                        <div className="text-center">
                          <div className="h-12 w-12 border-4 border-gray-200 border-t-violet-500 rounded-full animate-spin mx-auto mb-3" />
                          <div className="text-gray-600">Chargement des colis…</div>
                        </div>
                      </div>
                    ) : courierReportFilteredRows.length === 0 ? (
                      <UIEmptyState message="Aucun colis pour cette session (ou aucun ne correspond au filtre)." />
                    ) : (
                      <div className="min-w-0 overflow-x-auto rounded-xl border border-gray-200 [-webkit-overflow-scrolling:touch]">
                        <table className="min-w-[48rem] divide-y divide-gray-200 text-sm">
                          <thead className="bg-gray-50">
                            <tr>
                              <Th>Date</Th>
                              <Th>N° colis</Th>
                              <Th>Expéditeur</Th>
                              <Th>Destinataire</Th>
                              <Th>Nature</Th>
                              <Th align="right">Frais</Th>
                              <Th>Paiement</Th>
                              <Th>Statut</Th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100 bg-white">
                            {courierReportFilteredRows.map((row) => {
                              const created = auditValidatedAtToDate(row.createdAt);
                              return (
                                <tr key={row.id} className="hover:bg-gray-50/80">
                                  <Td>{created ? fmtDT(created) : '—'}</Td>
                                  <Td className="font-mono text-xs">{row.shipmentNumber}</Td>
                                  <Td>
                                    <div className="font-medium">{row.senderName}</div>
                                    {row.senderPhone ? (
                                      <div className="text-xs text-gray-500">{row.senderPhone}</div>
                                    ) : null}
                                  </Td>
                                  <Td>
                                    <div className="font-medium">{row.receiverName}</div>
                                    {row.receiverPhone ? (
                                      <div className="text-xs text-gray-500">{row.receiverPhone}</div>
                                    ) : null}
                                  </Td>
                                  <Td>{row.nature}</Td>
                                  <Td align="right" className="font-semibold">
                                    {money(row.transportFee)}
                                  </Td>
                                  <Td>
                                    <span
                                      className={`text-xs px-2 py-1 rounded-full font-medium ${
                                        row.paymentStatus === 'UNPAID'
                                          ? 'bg-amber-50 text-amber-900'
                                          : 'bg-emerald-50 text-emerald-800'
                                      }`}
                                    >
                                      {paymentStatusLabelFr(row.paymentStatus)}
                                    </span>
                                  </Td>
                                  <Td className="text-xs text-gray-700">{row.currentStatus}</Td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <div className="mt-2 text-sm text-gray-500">
                  {courierSessionsForReportOptions.length === 0
                    ? 'Aucune session courrier pour cette agence.'
                    : 'Choisissez une session pour afficher les colis liés.'}
                </div>
              )}
            </div>

          </div>
        )}

        {/* ============================================================================
           ONGLET : VERSEMENTS — valider les sessions fermées (guichet + courrier)
           ============================================================================ */}
        
        {tab === 'versements' && (
          <div className="space-y-6">
            {receptionsPendingTotal > 0 && (
              <div className="rounded-xl border border-amber-200 bg-amber-50/85 px-4 py-3 text-sm text-amber-950">
                <span className="font-semibold">À traiter : </span>
                {receptionsBilletteriePendingCount > 0 ? (
                  <span>
                    {receptionsBilletteriePendingCount} guichet
                    {receptionsBilletteriePendingCount > 1 ? 's' : ''} à valider
                  </span>
                ) : null}
                {receptionsBilletteriePendingCount > 0 && closedCourierSessions.length > 0 ? (
                  <span className="text-amber-800/80"> · </span>
                ) : null}
                {closedCourierSessions.length > 0 ? (
                  <span>
                    {closedCourierSessions.length} session courrier clôturée
                    {closedCourierSessions.length > 1 ? 's' : ''}
                  </span>
                ) : null}
              </div>
            )}

            {(() => {
              const toReceive = closedShifts.filter((s) => s.status === 'closed');
              const hasBilletterieReception = toReceive.length > 0;
              const hasCourrierReception = closedCourierSessions.length > 0;

              return (
                <>
                  {!hasBilletterieReception && !hasCourrierReception ? (
                    <SectionCard title="Versements à valider" icon={HandIcon}>
                      <UIEmptyState message="Rien à valider pour le moment — guichet et courrier sont à jour." />
                    </SectionCard>
                  ) : null}

                  {hasBilletterieReception ? (
            <SectionCard title="Guichet — sessions fermées" help="Comparez le montant attendu (ventes) et le montant reçu, puis validez le versement.">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
                  {toReceive.map(s => {
                    const payBy = s.payBy || {};
                    const inputs = receptionInputs[s.id] || { cashReceived: '' };

                    const agg = aggByShift[s.id];
                    const reservationsAgg = agg?.reservations ?? s.totalReservations ?? 0;
                    const ticketsAgg = agg?.tickets ?? s.totalTickets ?? 0;
                    const amountAgg = agg?.amount ?? s.totalAmount ?? 0;
                    const expectedCash = s.totalCash ?? agg?.cashExpected ?? (payBy['espèces'] ?? s.cashExpected ?? 0);
                    const cashExpectedAgg = expectedCash;

                    const rawCashIn = String(inputs.cashReceived ?? '').trim();
                    const cashReceived =
                      rawCashIn === ''
                        ? NaN
                        : Number(rawCashIn.replace(/[^\d.,]/g, '').replace(',', '.'));
                    const ecart = (Number.isFinite(cashReceived) ? cashReceived : 0) - (cashExpectedAgg || 0);
                    const disableValidate =
                      rawCashIn === '' || !Number.isFinite(cashReceived) || cashReceived < 0;
                    const hasDifference = Number.isFinite(cashReceived) && ecart !== 0;

                    const ui = usersCache[s.userId] || {};
                    const name = ui.name || s.userName || s.userEmail || s.userId;
                    const code = ui.code || s.userCode || 'GUEST';

                    return (
                      <div key={s.id} className="group relative">
                        <div className="absolute inset-0 bg-gradient-to-br from-white to-gray-50 rounded-xl transform group-hover:scale-[1.02] transition-all duration-300"></div>
                        <div className="relative rounded-xl border border-gray-200 bg-white/80 p-5 shadow-sm hover:shadow-md transition-all duration-300">
                          {/* En-tête du poste */}
                          <div className="flex items-start justify-between gap-3 mb-4">
                            <div className="min-w-0">
                              <div className="text-xs font-medium text-gray-500 uppercase tracking-wider">Vendeur (billetterie)</div>
                              <div className="font-semibold text-gray-900 truncate">
                                {name} 
                                <span className="text-gray-500 text-sm ml-2">({code})</span>
                              </div>
                            </div>
                            <div className="flex-shrink-0">
                              <div className="px-3 py-1 rounded-full bg-gradient-to-r from-amber-50 to-amber-100 border border-amber-200">
                                <div className="text-xs font-medium text-amber-800">À valider</div>
                              </div>
                            </div>
                          </div>

                          {/* Statistiques du poste */}
                          <div className="grid grid-cols-2 gap-4 mb-4">
                            <InfoCard label="Réservations" value={reservationsAgg.toString()} />
                            <InfoCard label="Billets" value={ticketsAgg.toString()} />
                            <InfoCard label="Total ventes (poste)" value={money(amountAgg)} emphasis />
                            <InfoCard label="Montant attendu (ventes)" value={money(cashExpectedAgg)} emphasis />
                          </div>

                          {/* Période */}
                          <div className="mb-4 p-3 rounded-xl bg-gradient-to-r from-gray-50 to-gray-100/50">
                            <div className="text-xs text-gray-600 mb-1">Période de vente</div>
                            <div className="text-sm font-medium text-gray-900">
                              {s.startTime ? fmtDT(new Date(s.startTime.toDate?.() ?? s.startTime)) : '—'} 
                              <span className="mx-2 text-gray-400">→</span>
                              {s.endTime ? fmtDT(new Date(s.endTime.toDate?.() ?? s.endTime)) : '—'}
                            </div>
                          </div>

                          {/* Saisie de réception */}
                          <div className="space-y-3">
                            <div>
                              <label className="block text-xs font-medium text-gray-700 mb-2">
                                Montant reçu <span className="text-red-500">*</span>
                              </label>
                              <div className="relative">
                                <input
                                  type="number"
                                  min="0"
                                  inputMode="numeric"
                                  className="w-full border border-gray-300 rounded-xl px-4 py-3 bg-white focus:outline-none focus:ring-2 focus:border-transparent text-lg font-medium"
                                  style={{ outlineColor: theme.primary }}
                                  placeholder="0"
                                  value={inputs.cashReceived}
                                  onChange={e => setReceptionInput(s.id, e.target.value)}
                                />
                                <div className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-500">
                                  {currencySymbol}
                                </div>
                              </div>
                            </div>

                            <div className={`p-3 rounded-xl border ${hasDifference ? 'ring-2 ring-red-400' : ''}`} style={{ 
                              borderColor: ecart === 0 ? '#d1fae5' : ecart > 0 ? '#bbf7d0' : '#fecaca',
                              backgroundColor: ecart === 0 ? '#f0fdf4' : ecart > 0 ? '#dcfce7' : '#fef2f2'
                            }}>
                              <div className="text-xs font-medium text-gray-700 mb-1">Écart</div>
                              <div className={`text-lg font-bold ${ecart === 0 ? 'text-emerald-700' : ecart > 0 ? 'text-green-700' : 'text-red-700'}`}>
                                {Number.isFinite(ecart) ? money(ecart) : '—'}
                              </div>
                              {hasDifference && (
                                <div className="mt-2 text-xs font-medium text-red-700">Écart à justifier avant validation.</div>
                              )}
                            </div>
                          </div>

                          {/* Actions */}
                          <div className="mt-6 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
                            {allowedTabs.includes('ventes') && (
                            <ActionButton 
                              variant="secondary"
                              onClick={() => { setComptaTab('ventes'); loadReportForShift(s.id); }}
                              className="w-full sm:w-auto"
                            >
                              <FileText className="h-4 w-4 mr-2" /> 
                              Voir le détail
                            </ActionButton>
                            )}
                            <ActionButton 
                              disabled={disableValidate || !!savingShiftIds[s.id]} 
                              onClick={() => validateReception(s)} 
                              className="w-full sm:w-auto"
                            >
                              <CheckCircle2 className="h-4 w-4 mr-2" /> 
                              {savingShiftIds[s.id] ? 'Validation...' : 'Valider le versement'}
                            </ActionButton>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
            </SectionCard>
                  ) : null}

                  {hasCourrierReception ? (
            <SectionCard
              title="Courrier — sessions fermées"
              icon={StopCircle}
              description="Montant attendu (ventes) d’après les colis payés. Saisissez le montant compté, puis validez."
              right={
                <StatusBadge status="neutral">
                  {closedCourierSessions.length} session{closedCourierSessions.length > 1 ? 's' : ''}
                </StatusBadge>
              }
            >
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {closedCourierSessions.map((s) => {
                    const input = receptionInputsCourier[s.id] || { countedAmount: '' };
                    const counted = Number(String(input.countedAmount).replace(/[^\d.,]/g, '').replace(',', '.'));
                    const ledger = courierLedgerBySessionId[s.id];
                    const ledgerNum = Number(ledger);
                    const ecart = Number.isFinite(counted) && Number.isFinite(ledgerNum) ? counted - ledgerNum : NaN;
                    return (
                      <CourierComptaSessionCard
                        key={s.id}
                        session={s}
                        theme={theme}
                        usersCache={usersCache}
                        stats={courierSessionStats[s.id] ?? { total: 0, paid: 0 }}
                        ledgerAmount={courierLedgerBySessionId[s.id]}
                        statusLabel="Clôturé"
                        startField={s.openedAt ?? s.createdAt}
                        endField={s.closedAt}
                        afterAmountBlock={
                          <div className="space-y-3 mb-4">
                            <InfoCard
                              label="Écart (compté − montant attendu)"
                              value={Number.isFinite(ecart) ? money(ecart) : '—'}
                            />
                            <div>
                              <label className="block text-xs font-medium text-gray-700 mb-2">Montant compté</label>
                              <input
                                type="text"
                                inputMode="decimal"
                                className="w-full border border-gray-300 rounded-lg px-3 py-2"
                                placeholder="0"
                                value={input.countedAmount}
                                onChange={(e) => setReceptionInputCourier(s.id, e.target.value)}
                              />
                            </div>
                          </div>
                        }
                        footer={
                          <ActionButton
                            disabled={!Number.isFinite(counted) || counted < 0 || !!savingCourierSessionIds[s.id]}
                            onClick={() => validateCourierSessionAction(s)}
                          >
                            <CheckCircle2 className="h-4 w-4 mr-2" />
                            {savingCourierSessionIds[s.id] ? 'Validation...' : 'Valider le versement'}
                          </ActionButton>
                        }
                      />
                    );
                  })}
                </div>
            </SectionCard>
                  ) : null}
                </>
              );
            })()}

            {/* Postes validés agence (visibles pour le chef d'agence, en attente de son contrôle final) */}
            {(validatedAgencyShifts.length > 0 || courierValidatedAgencySessions.length > 0) && (
              <SectionCard
                title="Validé agence (en attente validation chef)"
                help="Sessions déjà validées par le comptable agence ; en attente de validation par le chef d'agence."
              >
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {validatedAgencyShifts.map((s) => {
                    const ui = usersCache[s.userId] || {};
                    const name = ui.name || s.userName || s.userEmail || s.userId;
                    const code = ui.code || s.userCode || 'GUEST';
                    return (
                      <div key={s.id} className="rounded-xl border border-teal-200 bg-teal-50/30 p-4">
                        <div className="font-semibold text-gray-900">{name} <span className="text-gray-500 text-sm">({code})</span></div>
                        <div className="text-sm text-gray-600 mt-1">
                          {s.startTime ? new Date(s.startTime.toDate?.() ?? s.startTime).toLocaleString('fr-FR') : '—'} → {s.endTime ? new Date(s.endTime.toDate?.() ?? s.endTime).toLocaleString('fr-FR') : '—'}
                        </div>
                        <div className="mt-2 text-lg font-bold" style={{ color: theme?.primary }}>{money(s.totalAmount ?? s.totalRevenue ?? 0)}</div>
                        <div className="mt-2 text-xs text-teal-700">Billetterie · Validé agence · En attente chef d'agence</div>
                      </div>
                    );
                  })}
                  {courierValidatedAgencySessions.map((s) => {
                    const ui = usersCache[s.agentId] || {};
                    const name = ui.name || s.agentId;
                    const code = ui.code || s.agentCode || '—';
                    return (
                      <div key={`courier-va-${s.id}`} className="rounded-xl border border-violet-200 bg-violet-50/30 p-4">
                        <div className="font-semibold text-gray-900">Courrier · {name} <span className="text-gray-500 text-sm">({code})</span></div>
                        <div className="text-sm text-gray-600 mt-1">
                          {s.openedAt ? new Date((s.openedAt as { toDate?: () => Date }).toDate?.() ?? s.openedAt as Date).toLocaleString('fr-FR') : '—'}
                          {' → '}
                          {s.closedAt ? new Date((s.closedAt as { toDate?: () => Date }).toDate?.() ?? s.closedAt as Date).toLocaleString('fr-FR') : '—'}
                        </div>
                        <div className="mt-2 text-lg font-bold" style={{ color: theme?.primary }}>{money(Number(s.validatedAmount ?? 0))}</div>
                        <div className="mt-2 text-xs text-violet-800">Courrier · Validé agence · En attente chef d'agence</div>
                      </div>
                    );
                  })}
                </div>
              </SectionCard>
            )}
          </div>
        )}

        {/* ============================================================================
           ONGLET : CONTRÔLE — caisse réelle vs solde attendu
           ============================================================================ */}
        {tab === 'audit' && (
          <div className="space-y-6">
            <div className="text-sm text-gray-700">
              Commencez par vérifier l’écart, puis validez la caisse.
            </div>
            {/* ============================================================================
               SECTION 1 : RÉSUMÉ AUTOMATIQUE (ventes vs caisse)
               ============================================================================ */}
            <div className="rounded-xl border border-gray-200 shadow-sm p-5 bg-gradient-to-r from-white to-gray-50/50">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-5">
                <div className="flex items-center gap-3">
                  <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-amber-50 to-orange-50 flex items-center justify-center">
                    <RefreshCw className="h-6 w-6 text-amber-600" />
                  </div>
                  <div>
                    <div className="text-xl font-bold text-gray-900">Résumé ventes et caisse</div>
                    <div className="text-sm text-gray-600">
                      Vérifiez que l'argent en caisse correspond aux ventes avant de valider.
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-sm font-medium text-gray-700">Date :</div>
                  <input
                    type="date"
                    className="border border-gray-300 rounded-xl px-4 py-2.5 bg-white shadow-sm focus:outline-none focus:ring-2 focus:border-transparent text-sm"
                    style={{ outlineColor: theme.primary }}
                    value={reconciliationDate}
                    onChange={(e) => setReconciliationDate(e.target.value)}
                  />
                  <ActionButton variant="secondary" onClick={loadReconciliation} disabled={loadingReconciliation}>
                    {loadingReconciliation ? 'Chargement...' : 'Actualiser'}
                  </ActionButton>
                </div>
              </div>

              {loadingReconciliation ? (
                <div className="flex items-center justify-center py-12">
                  <div className="text-center">
                    <div className="h-12 w-12 border-4 border-gray-200 border-t-amber-500 rounded-full animate-spin mx-auto mb-3"></div>
                    <div className="text-gray-600">Chargement…</div>
                  </div>
                </div>
              ) : !reconciliationLoaded ? (
                <UIEmptyState message="Choisissez une date pour afficher la comparaison." />
              ) : (
                <>
                  {/* SECTION 1 — RÉSULTAT */}
                  <div className="w-full">
                    <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                      <div>
                        <div className="text-xs sm:text-sm font-semibold text-gray-500 uppercase tracking-wider">
                          Écart de caisse
                        </div>
                        <div className="mt-1 text-lg font-bold text-gray-900">SECTION 1 — RÉSULTAT</div>
                      </div>
                      <div
                        className={`text-2xl sm:text-3xl font-bold leading-tight ${
                          reconciliationData.ecart === 0 ? 'text-emerald-700' : 'text-rose-700'
                        }`}
                      >
                        {money(reconciliationData.ecart)}
                      </div>
                    </div>

                    <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                      <div className="rounded-lg border border-gray-200 bg-white px-3 py-2">
                        <div className="text-xs text-gray-500 uppercase tracking-wide">Total ventes</div>
                        <div className="text-lg font-bold text-gray-900">
                          {money(reconciliationData.ventesGuichet.montant + reconciliationData.ventesEnLigne.montant)}
                        </div>
                      </div>
                      <div className="rounded-lg border border-gray-200 bg-white px-3 py-2">
                        <div className="text-xs text-gray-500 uppercase tracking-wide">Total en caisse</div>
                        <div className="text-lg font-bold text-gray-900">{money(reconciliationData.encaissementsTotal)}</div>
                      </div>
                    </div>
                  </div>

                  {/* Tableau détaillé */}
                  <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
                    <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0">
                        <div className="text-lg font-bold text-gray-900">SECTION 2 — DÉTAILS</div>
                        <div className="text-sm text-gray-600">Ventes vs caisse</div>
                      </div>
                      <ActionButton
                        type="button"
                        variant="secondary"
                        className="w-full shrink-0 sm:w-auto"
                        onClick={() => setShowReconciliationDetails((v) => !v)}
                      >
                        {showReconciliationDetails ? 'Masquer les détails' : 'Voir les détails'}
                      </ActionButton>
                    </div>
                    <div
                      className={cn(
                        'min-w-0 overflow-hidden rounded-xl border border-gray-200',
                        !showReconciliationDetails && 'hidden'
                      )}
                    >
                      <div className="overflow-x-auto [-webkit-overflow-scrolling:touch]">
                      <table className="w-full min-w-[36rem] text-sm">
                        <thead className="bg-gradient-to-r from-gray-50 to-gray-100/50">
                          <tr>
                            <Th>Catégorie</Th>
                            <Th align="right">Réservations</Th>
                            <Th align="right">Billets</Th>
                            <Th align="right">Montant</Th>
                            <Th align="right">Commentaire</Th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200">
                          {/* VENTES */}
                          <tr className="bg-gradient-to-r from-blue-50/30 to-indigo-50/30">
                            <Td colSpan={5}>
                              <div className="text-sm font-bold text-blue-700 uppercase tracking-wider py-2">
                                VENTES DE L'AGENCE
                              </div>
                            </Td>
                          </tr>

                          {/* Billetterie */}
                          <tr className="hover:bg-gray-50/50">
                            <Td>
                              <div className="flex items-center gap-2">
                                <div className="h-6 w-6 rounded-md bg-emerald-100 flex items-center justify-center">
                                  <Wallet className="h-3 w-3 text-emerald-600" />
                                </div>
                                <span className="font-medium">Ventes billetterie</span>
                              </div>
                            </Td>
                            <Td align="right">
                              <span className="font-medium">{reconciliationData.ventesGuichet.reservations}</span>
                            </Td>
                            <Td align="right">
                              <span className="font-medium">{reconciliationData.ventesGuichet.tickets}</span>
                            </Td>
                            <Td align="right">
                              <span className="font-bold text-gray-900">{money(reconciliationData.ventesGuichet.montant)}</span>
                            </Td>
                            <Td align="right">
                              <span className="text-xs px-2 py-1 rounded-full bg-emerald-100 text-emerald-700">
                                À encaisser en caisse
                              </span>
                            </Td>
                          </tr>

                          {/* En ligne */}
                          <tr className="hover:bg-gray-50/50">
                            <Td>
                              <div className="flex items-center gap-2">
                                <div className="h-6 w-6 rounded-md bg-indigo-100 flex items-center justify-center">
                                  <CreditCard className="h-3 w-3 text-indigo-600" />
                                </div>
                                <span className="font-medium">Ventes en ligne</span>
                              </div>
                            </Td>
                            <Td align="right">
                              <span className="font-medium">{reconciliationData.ventesEnLigne.reservations}</span>
                            </Td>
                            <Td align="right">
                              <span className="font-medium">{reconciliationData.ventesEnLigne.tickets}</span>
                            </Td>
                            <Td align="right">
                              <span className="font-bold text-gray-900">{money(reconciliationData.ventesEnLigne.montant)}</span>
                            </Td>
                            <Td align="right">
                              <span className="text-xs px-2 py-1 rounded-full bg-indigo-100 text-indigo-700">
                                Encaissé en ligne
                              </span>
                            </Td>
                          </tr>

                          {/* Courrier */}
                          <tr className="hover:bg-gray-50/50">
                            <Td>
                              <div className="flex items-center gap-2">
                                <div className="h-6 w-6 rounded-md bg-violet-100 flex items-center justify-center">
                                  <Package className="h-3 w-3 text-violet-600" />
                                </div>
                                <span className="font-medium">Courrier (colis payés)</span>
                              </div>
                            </Td>
                            <Td align="right">
                              <span className="font-medium">{reconciliationData.courrier.operations}</span>
                            </Td>
                            <Td align="right">
                              <span className="text-gray-400">—</span>
                            </Td>
                            <Td align="right">
                              <span className="font-bold text-gray-900">{money(reconciliationData.courrier.montant)}</span>
                            </Td>
                            <Td align="right">
                              <span className="text-xs px-2 py-1 rounded-full bg-violet-100 text-violet-800">
                                Paiements courrier
                              </span>
                            </Td>
                          </tr>

                          {/* Total ventes billets uniquement */}
                          <tr className="border-t-2 border-gray-300">
                            <Td className="font-bold text-gray-900">Total billets (billetterie + ligne)</Td>
                            <Td align="right" className="font-bold text-gray-900">
                              {reconciliationData.ventesGuichet.reservations + reconciliationData.ventesEnLigne.reservations}
                            </Td>
                            <Td align="right" className="font-bold text-gray-900">
                              {reconciliationData.ventesGuichet.tickets + reconciliationData.ventesEnLigne.tickets}
                            </Td>
                            <Td align="right" className="font-bold text-gray-900">
                              {money(reconciliationData.ventesGuichet.montant + reconciliationData.ventesEnLigne.montant)}
                            </Td>
                            <Td align="right">
                              <span className="text-xs px-2 py-1 rounded-full bg-blue-100 text-blue-700">
                                Hors courrier
                              </span>
                            </Td>
                          </tr>

                          {/* ENCAISSEMENTS */}
                          <tr className="bg-gradient-to-r from-emerald-50/30 to-green-50/30">
                            <Td colSpan={5}>
                              <div className="text-sm font-bold text-emerald-700 uppercase tracking-wider py-2">
                                ENCAISSEMENTS DANS LA CAISSE
                              </div>
                            </Td>
                          </tr>

                          {/* Espèces */}
                          <tr className="hover:bg-gray-50/50">
                            <Td>
                              <div className="flex items-center gap-2">
                                <div className="h-6 w-6 rounded-md bg-amber-100 flex items-center justify-center">
                                  <Banknote className="h-3 w-3 text-amber-600" />
                                </div>
                                <span className="font-medium">Espèces reçues</span>
                              </div>
                            </Td>
                            <Td align="right">—</Td>
                            <Td align="right">—</Td>
                            <Td align="right">
                              <span className="font-bold text-gray-900">{money(reconciliationData.encaissementsEspeces)}</span>
                            </Td>
                            <Td align="right">
                              <span className="text-xs px-2 py-1 rounded-full bg-amber-100 text-amber-700">
                                Caisse agence
                              </span>
                            </Td>
                          </tr>

                          {/* Mobile Money */}
                          <tr className="hover:bg-gray-50/50">
                            <Td>
                              <div className="flex items-center gap-2">
                                <div className="h-6 w-6 rounded-md bg-purple-100 flex items-center justify-center">
                                  <Smartphone className="h-3 w-3 text-purple-600" />
                                </div>
                                <span className="font-medium">Mobile Money</span>
                              </div>
                            </Td>
                            <Td align="right">—</Td>
                            <Td align="right">—</Td>
                            <Td align="right">
                              <span className="font-bold text-gray-900">{money(reconciliationData.encaissementsMobileMoney)}</span>
                            </Td>
                            <Td align="right">
                              <span className="text-xs px-2 py-1 rounded-full bg-purple-100 text-purple-700">
                                Compte compagnie
                              </span>
                            </Td>
                          </tr>

                          {/* Total encaissements */}
                          <tr className="border-t-2 border-gray-300">
                            <Td className="font-bold text-gray-900">TOTAL ENCAISSÉS</Td>
                            <Td align="right">—</Td>
                            <Td align="right">—</Td>
                            <Td align="right" className="font-bold text-gray-900">
                              {money(reconciliationData.encaissementsTotal)}
                            </Td>
                            <Td align="right">
                              <span className="text-xs px-2 py-1 rounded-full bg-emerald-100 text-emerald-700">
                                Argent réellement reçu
                              </span>
                            </Td>
                          </tr>

                          {/* ÉCART */}
                          <tr
                            className={`${
                              reconciliationData.ecart === 0
                                ? 'bg-gradient-to-r from-emerald-50/30 to-green-50/30'
                                : reconciliationData.ecart > 0
                                  ? 'bg-gradient-to-r from-rose-50/30 to-red-50/30'
                                  : 'bg-gradient-to-r from-amber-50/30 to-orange-50/30'
                            }`}
                          >
                            <Td colSpan={5}>
                              <div className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
                                <div className="min-w-0 text-sm font-bold text-gray-900">
                                  Écart (ventes billets − caisse guichet)
                                </div>
                                <div
                                  className={`min-w-0 text-xl font-bold ${
                                    reconciliationData.ecart === 0
                                      ? 'text-emerald-700'
                                      : reconciliationData.ecart > 0
                                        ? 'text-rose-700'
                                        : 'text-amber-700'
                                  }`}
                                >
                                  {money(reconciliationData.ecart)}
                                  {reconciliationData.ecart === 0 ? (
                                    <span className="ml-2 text-sm font-medium text-emerald-600">✓ Équilibre parfait</span>
                                  ) : reconciliationData.ecart > 0 ? (
                                    <span className="ml-2 text-sm font-medium text-rose-600">⚠️ Manque dans la caisse</span>
                                  ) : (
                                    <span className="ml-2 text-sm font-medium text-amber-600">ℹ️ Excédent en caisse</span>
                                  )}
                                </div>
                              </div>
                            </Td>
                          </tr>
                        </tbody>
                      </table>
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>

            <div className="rounded-xl border border-gray-200 shadow-sm p-5 bg-gradient-to-r from-white to-slate-50/50">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-4">
                <div className="flex items-center gap-3">
                  <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-slate-100 to-slate-200 flex items-center justify-center">
                    <Scale className="h-6 w-6 text-slate-700" />
                  </div>
                  <div>
                    <div className="text-lg font-bold text-gray-900">Contrôle de caisse</div>
                    <div className="text-sm text-gray-600">
                      Vérifiez que l'argent en caisse correspond aux ventes avant de valider.
                    </div>
                  </div>
                </div>
                <ActionButton
                  variant="secondary"
                  type="button"
                  onClick={() => void reloadLedgerCashAudit()}
                  disabled={loadingLedgerCash || loadingCashAudits}
                >
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Actualiser
                </ActionButton>
              </div>

              {ledgerCashPosition?.capped && (
                <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                  Vérifiez que l'argent en caisse correspond aux ventes avant de valider.
                </div>
              )}

              {!canRunCashAudit && (
                <div className="mb-4 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800">
                  Vérifiez que l'argent en caisse correspond aux ventes avant de valider.
                </div>
              )}

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="space-y-4 rounded-lg border border-gray-200 bg-white p-4">
                  <div className="text-sm font-semibold text-gray-800">SECTION 3 — VALIDATION</div>
                  <p className="text-[11px] text-slate-500">Montant attendu (ventes) sur la période sélectionnée.</p>
                  {loadingLedgerCash ? (
                    <div className="text-sm text-gray-500">Chargement…</div>
                  ) : ledgerCashPosition ? (
                    <>
                      <div className="text-2xl font-bold text-gray-900">{money(ledgerCashPosition.soldeCash)}</div>
                      <div className="grid grid-cols-2 gap-2 text-xs text-gray-600">
                        <div>Entrées (guichet et courrier)</div>
                        <div className="text-right font-medium text-emerald-700">{money(ledgerCashPosition.totalCashIn)}</div>
                        <div>Sorties caisse (dépenses, transferts…)</div>
                        <div className="text-right font-medium text-rose-700">{money(ledgerCashPosition.totalCashOut)}</div>
                      </div>
                    </>
                  ) : (
                    <div className="text-sm text-gray-500">—</div>
                  )}

                  <div className="pt-2 border-t border-gray-100 space-y-2">
                    <label className="block text-sm font-medium text-gray-700">Montant en caisse</label>
                    <input
                      type="text"
                      inputMode="decimal"
                      readOnly={!canRunCashAudit}
                      className="w-full border border-gray-300 rounded-xl px-4 py-2.5 bg-white shadow-sm focus:outline-none focus:ring-2 focus:border-transparent text-sm disabled:bg-gray-50 disabled:text-gray-500"
                      style={{ outlineColor: theme.primary }}
                      placeholder="0"
                      value={cashAuditActualInput}
                      onChange={(e) => setCashAuditActualInput(e.target.value)}
                      disabled={!canRunCashAudit}
                    />
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="text-xs text-gray-500 uppercase tracking-wide">Écart</div>
                      <div
                        className={`text-lg font-bold ${
                          cashAuditGapPreview === null
                            ? 'text-gray-400'
                            : cashAuditGapPreview === 0
                              ? 'text-emerald-700'
                              : cashAuditGapPreview > 0
                                ? 'text-amber-700'
                                : 'text-rose-700'
                        }`}
                      >
                        {cashAuditGapPreview === null ? '—' : money(cashAuditGapPreview)}
                      </div>
                    </div>
                    <ActionButton
                      type="button"
                      onClick={() => void handleValidateAgencyCash()}
                      disabled={
                        !canRunCashAudit ||
                        savingCashAudit ||
                        loadingLedgerCash ||
                        ledgerCashPosition == null ||
                        !cashAuditActualInput.trim()
                      }
                    >
                      {savingCashAudit ? 'Enregistrement…' : 'Valider la caisse'}
                    </ActionButton>
                  </div>
                </div>

                <div className="rounded-lg border border-gray-200 bg-white p-4 min-h-[200px]">
                  <div className="text-sm font-semibold text-gray-800 mb-3">Historique des contrôles</div>
                  {loadingCashAudits ? (
                    <div className="text-sm text-gray-500">Chargement…</div>
                  ) : cashAudits.length === 0 ? (
                    <UIEmptyState message="Aucun contrôle enregistré pour cette agence." />
                  ) : (
                    <div className="max-h-72 min-w-0 overflow-x-auto overflow-y-auto rounded-lg border border-gray-100 [-webkit-overflow-scrolling:touch]">
                      <table className="w-full min-w-[40rem] text-sm">
                        <thead className="bg-gray-50 sticky top-0">
                          <tr>
                            <Th>Date</Th>
                            <Th align="right">Montant attendu (ventes)</Th>
                            <Th align="right">Montant en caisse</Th>
                            <Th align="right">Écart</Th>
                            <Th>Par</Th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {cashAudits.map((a) => {
                            const dt = auditValidatedAtToDate(a.validatedAt);
                            const who = a.validatedBy?.name || a.validatedBy?.id || '—';
                            return (
                              <tr key={a.id} className="hover:bg-gray-50/80">
                                <Td>{dt ? fmtDT(dt) : '—'}</Td>
                                <Td align="right">{money(a.expectedAmount)}</Td>
                                <Td align="right">{money(a.actualAmount)}</Td>
                                <Td align="right">
                                  <span
                                    className={
                                      a.difference === 0
                                        ? 'text-emerald-700 font-medium'
                                        : a.difference > 0
                                          ? 'text-amber-700 font-medium'
                                          : 'text-rose-700 font-medium'
                                    }
                                  >
                                    {money(a.difference)}
                                  </span>
                                </Td>
                                <Td className="text-xs text-gray-600 max-w-[140px] truncate">
                                  <span title={who}>{who}</span>
                                </Td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ============================================================================
           ONGLET : CAISSE AGENCE
           Description : Gestion des mouvements financiers de l'agence
           ============================================================================ */}
        
        {tab === 'caisse' && (
          <div className="space-y-6">
            {!canManipulateCash && (
              <div
                className="rounded-xl border border-slate-200 bg-slate-50/90 px-4 py-3 text-sm text-slate-800"
                role="status"
              >
                Consultation seule : les dépenses, versements vers la compagnie et paiements fournisseurs sont réservés au{' '}
                <strong>comptable d’agence</strong> (ou à un administrateur).
              </div>
            )}
            {/* En-tête et filtres */}
            <div className="rounded-xl border border-gray-200 shadow-sm p-5 bg-gradient-to-r from-white to-gray-50/50">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-5">
                <div className="flex items-center gap-3">
                  <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-emerald-50 to-green-50 flex items-center justify-center">
                    <Banknote className="h-6 w-6 text-emerald-600" />
                  </div>
                  <div className="text-xl font-bold text-gray-900">Caisse de l’agence</div>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  {canManipulateCash && (
                    <>
                      <ActionButton
                        onClick={() => setTreasuryModalView('new-operation')}
                        className="whitespace-nowrap"
                      >
                        <Plus className="h-4 w-4 mr-2" />
                        Dépense caisse
                      </ActionButton>
                      <ActionButton
                        variant="secondary"
                        onClick={() => setTreasuryModalView('transfer')}
                        className="whitespace-nowrap"
                      >
                        Versement compagnie
                      </ActionButton>
                      <ActionButton
                        variant="secondary"
                        onClick={() => setTreasuryModalView('new-payable')}
                        className="whitespace-nowrap"
                      >
                        Paiement fournisseur
                      </ActionButton>
                    </>
                  )}
                  <ActionButton
                    variant="secondary"
                    onClick={() => exportCsv(days, currencySymbol)}
                    disabled={days.length === 0}
                    className="whitespace-nowrap"
                  >
                    <Download className="h-4 w-4 mr-2" /> 
                    Export CSV
                  </ActionButton>
                </div>
              </div>

              {/* Filtres de période */}
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-2 text-sm text-gray-700">
                    <input 
                      type="checkbox" 
                      checked={useCustomRange} 
                      onChange={(e)=>setUseCustomRange(e.target.checked)}
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    Période personnalisée
                  </label>
                </div>
                
                <div className="flex flex-wrap items-center gap-4">
                  {!useCustomRange ? (
                    <div className="flex items-center gap-3">
                      <div className="text-sm font-medium text-gray-700">Période :</div>
                      <div className="relative">
                        <input 
                          type="month" 
                          className="border border-gray-300 rounded-xl px-4 py-2.5 bg-white shadow-sm focus:outline-none focus:ring-2 focus:border-transparent text-sm"
                          style={{ outlineColor: theme.primary }}
                          value={monthValue} 
                          onChange={(e)=>setMonthValue(e.target.value)} 
                        />
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-center gap-3">
                        <div className="text-sm font-medium text-gray-700">Du</div>
                        <input 
                          type="date" 
                          className="border border-gray-300 rounded-xl px-4 py-2.5 bg-white shadow-sm focus:outline-none focus:ring-2 focus:border-transparent text-sm"
                          style={{ outlineColor: theme.primary }}
                          value={rangeFrom} 
                          onChange={(e)=>setRangeFrom(e.target.value)} 
                        />
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="text-sm font-medium text-gray-700">Au</div>
                        <input 
                          type="date" 
                          className="border border-gray-300 rounded-xl px-4 py-2.5 bg-white shadow-sm focus:outline-none focus:ring-2 focus:border-transparent text-sm"
                          style={{ outlineColor: theme.primary }}
                          value={rangeTo} 
                          onChange={(e)=>setRangeTo(e.target.value)} 
                        />
                      </div>
                    </>
                  )}
                  
                  <ActionButton variant="secondary" onClick={reloadCash} disabled={loadingCash}>
                    {loadingCash ? 'Actualisation...' : 'Actualiser'}
                  </ActionButton>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6">
              <MetricCard
                label="Caisse disponible (global)"
                value={
                  loadingCash && cashGlobalPosition == null
                    ? '…'
                    : money(cashGlobalPosition?.soldeCash ?? 0)
                }
                icon={Banknote}
                valueColorVar={theme?.primary}
              />
              <MetricCard
                label="Entrées espèces (période)"
                value={
                  loadingCash
                    ? '…'
                    : ledgerPeriodError
                      ? '—'
                      : money(ledgerPeriodCash?.totalCashIn ?? 0)
                }
                icon={Wallet}
                valueColorVar={theme?.primary}
              />
              <MetricCard
                label="Sorties espèces (période)"
                value={
                  loadingCash
                    ? '…'
                    : ledgerPeriodError
                      ? '—'
                      : money(ledgerPeriodCash?.totalCashOut ?? 0)
                }
                icon={AlertTriangle}
                valueColorVar="#b91c1c"
              />
            </div>

            {cashGlobalPosition?.capped && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                Solde global : agrégation tronquée (limite de lecture) — le montant peut être incomplet.
              </div>
            )}

            {ledgerPeriodError && (
              <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-900">
                {ledgerPeriodError}
              </div>
            )}

            {ledgerPeriodCash?.capped && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                Flux période : historique tronqué (limite d’affichage) — entrées / sorties période peuvent être sous-estimées.
              </div>
            )}

            <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
              <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="text-lg font-bold text-gray-900">Historique par jour</div>
                <div className="text-sm text-gray-600">
                  {days.length} jour{days.length > 1 ? 's' : ''} avec activité
                </div>
              </div>
              
              {loadingCash ? (
                <div className="flex items-center justify-center py-12">
                  <div className="text-center">
                    <div className="h-12 w-12 border-4 border-gray-200 border-t-emerald-500 rounded-full animate-spin mx-auto mb-3"></div>
                    <div className="text-gray-600">Chargement des données de caisse…</div>
                  </div>
                </div>
              ) : days.length === 0 ? (
                <UIEmptyState message="Aucun mouvement enregistré sur la période sélectionnée" />
              ) : (
                <div className="min-w-0 overflow-hidden rounded-xl border border-gray-200">
                  <div className="overflow-x-auto [-webkit-overflow-scrolling:touch]">
                    <table className="w-full min-w-[28rem] text-sm">
                      <thead className="bg-gradient-to-r from-gray-50 to-gray-100/50">
                        <tr>
                          <Th>Date</Th>
                          <Th align="right">Entrées</Th>
                          <Th align="right">Sorties</Th>
                          <Th align="right">Net jour (période)</Th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200">
                        {days.map((d, index) => (
                          <tr key={d.dateISO} className={`hover:bg-gray-50/50 ${index % 2 === 0 ? 'bg-white' : 'bg-gray-50/30'}`}>
                            <Td>
                              <div className="font-medium">
                                {new Date(d.dateISO).toLocaleDateString('fr-FR', {
                                  weekday: 'long',
                                  day: 'numeric',
                                  month: 'long',
                                  year: 'numeric'
                                })}
                              </div>
                            </Td>
                            <Td align="right">
                              <span className="font-medium text-emerald-700">{money(d.entrees)}</span>
                            </Td>
                            <Td align="right">
                              <span className="font-medium text-rose-700">{money(d.sorties)}</span>
                            </Td>
                            <Td align="right">
                              <span className={`font-bold ${d.solde >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                                {money(d.solde)}
                              </span>
                            </Td>
                          </tr>
                        ))}
                      </tbody>
                      {/* Pied de tableau avec totaux */}
                      <tfoot className="bg-gradient-to-r from-gray-50 to-gray-100/80 border-t-2 border-gray-300">
                        <tr>
                          <Td className="font-bold text-gray-900">TOTAUX (période)</Td>
                          <Td align="right" className="font-bold text-emerald-700">{money(totIn)}</Td>
                          <Td align="right" className="font-bold text-rose-700">{money(totOut)}</Td>
                          <Td align="right" className="font-bold text-gray-900">
                            {money(totIn - totOut)}
                          </Td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ============================================================================
           ONGLET : COMPARAISON ventes (billets) et caisse guichet
           ============================================================================ */}
        
        {false && (
          <div className="space-y-6">
            {/* En-tête et sélecteur de date */}
            <div className="rounded-xl border border-gray-200 shadow-sm p-5 bg-gradient-to-r from-white to-gray-50/50">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-5">
                <div className="flex items-center gap-3">
                  <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-amber-50 to-orange-50 flex items-center justify-center">
                    <RefreshCw className="h-6 w-6 text-amber-600" />
                  </div>
                  <div>
                    <div className="text-xl font-bold text-gray-900">Comparaison ventes et caisse</div>
                    <div className="text-sm text-gray-600">
                      Billetterie et ventes en ligne d’un côté, espèces et mobile money passés en caisse guichet de l’autre. Le courrier est indiqué à part.
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-sm font-medium text-gray-700">Date :</div>
                  <input 
                    type="date" 
                    className="border border-gray-300 rounded-xl px-4 py-2.5 bg-white shadow-sm focus:outline-none focus:ring-2 focus:border-transparent text-sm"
                    style={{ outlineColor: theme.primary }}
                    value={reconciliationDate} 
                    onChange={(e) => setReconciliationDate(e.target.value)} 
                  />
                  <ActionButton variant="secondary" onClick={loadReconciliation} disabled={loadingReconciliation}>
                    {loadingReconciliation ? 'Chargement...' : 'Actualiser'}
                  </ActionButton>
                </div>
              </div>
              
              <div className="text-sm text-gray-600">
                Pour la date choisie : ventes de <strong>billets</strong> (guichet + en ligne) comparées à l’argent <strong>passé en caisse</strong> (espèces et mobile money guichet).
                Le <strong>courrier</strong> est affiché séparément ({AGENCY_KPI_TIME.WORKFLOW_PAIEMENT.toLowerCase()}).
                L’écart des cartes concerne uniquement les <strong>billets</strong> vs caisse guichet. Pour le détail courrier, voir l’onglet <strong>Ventes</strong>.
              </div>
            </div>

            {/* Tableau encaissements / ventes */}
            {loadingReconciliation ? (
              <div className="flex items-center justify-center py-12">
                <div className="text-center">
                  <div className="h-12 w-12 border-4 border-gray-200 border-t-amber-500 rounded-full animate-spin mx-auto mb-3"></div>
                  <div className="text-gray-600">Chargement…</div>
                </div>
              </div>
            ) : !reconciliationLoaded ? (
              <UIEmptyState message="Choisissez une date pour afficher la comparaison." />
            ) : (
              <>
                <div className="rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-2 text-xs text-slate-700">
                  <span className="font-semibold">Billets / montants vente :</span> {AGENCY_KPI_TIME.CREATION_RESERVATION_BAMAKO}.{" "}
                  <span className="font-semibold">Courrier :</span> {AGENCY_KPI_TIME.WORKFLOW_PAIEMENT}.{" "}
                  <span className="font-semibold">Écart caisse :</span> {AGENCY_KPI_TIME.SESSION_POSTE} — ce sont trois lectures différentes.
                </div>
                {/* KPI encaissements — 4 cartes sur une ligne */}
                <div className="w-full overflow-x-auto sm:overflow-x-visible pb-1 -mx-1 px-1 sm:mx-0 sm:px-0">
                  <div className="grid grid-cols-4 gap-2 sm:gap-4 lg:gap-6 min-w-[36rem] sm:min-w-0 w-full [&>*]:min-w-0">
                    <MetricCard label="Billets vendus (terrain)" value={(reconciliationData.ventesGuichet.tickets + reconciliationData.ventesEnLigne.tickets).toString()} icon={Ticket} valueColorVar={theme?.primary} hint={AGENCY_KPI_TIME.CREATION_RESERVATION_BAMAKO} />
                    <MetricCard label="Montant ventes billets" value={money(reconciliationData.ventesGuichet.montant + reconciliationData.ventesEnLigne.montant)} icon={TrendingUp} valueColorVar={theme?.primary} hint={AGENCY_KPI_TIME.CREATION_RESERVATION_BAMAKO} />
                    <MetricCard label="Courrier (jour)" value={money(reconciliationData.courrier.montant)} icon={Package} valueColorVar={theme?.primary} hint={AGENCY_KPI_TIME.WORKFLOW_PAIEMENT} />
                    <MetricCard label="Écart (ventes billets − caisse guichet)" value={money(reconciliationData.ecart)} icon={reconciliationData.ecart === 0 ? CheckCircle2 : AlertTriangle} critical={reconciliationData.ecart !== 0} criticalMessage={reconciliationData.ecart !== 0 ? (reconciliationData.ecart > 0 ? "Manque en caisse" : "Excédent en caisse") : undefined} valueColorVar={reconciliationData.ecart === 0 ? theme?.primary : undefined} hint={AGENCY_KPI_TIME.SESSION_POSTE} />
                  </div>
                </div>
                <p className="text-xs text-gray-500">
                  Courrier : {reconciliationData.courrier.operations} paiement{reconciliationData.courrier.operations > 1 ? 's' : ''} validé{reconciliationData.courrier.operations > 1 ? 's' : ''} sur la date (création du paiement, fuseau Bamako).
                </p>

                {/* Tableau détaillé */}
                <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
                  <div className="text-lg font-bold text-gray-900 mb-5">Détail de la journée</div>
                  
                  <div className="min-w-0 overflow-hidden rounded-xl border border-gray-200">
                    <div className="overflow-x-auto [-webkit-overflow-scrolling:touch]">
                    <table className="w-full min-w-[36rem] text-sm">
                      <thead className="bg-gradient-to-r from-gray-50 to-gray-100/50">
                        <tr>
                          <Th>Catégorie</Th>
                          <Th align="right">Réservations</Th>
                          <Th align="right">Billets</Th>
                          <Th align="right">Montant</Th>
                          <Th align="right">Commentaire</Th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200">
                        {/* VENTES */}
                        <tr className="bg-gradient-to-r from-blue-50/30 to-indigo-50/30">
                          <Td colSpan={5}>
                            <div className="text-sm font-bold text-blue-700 uppercase tracking-wider py-2">
                              VENTES DE L'AGENCE
                            </div>
                          </Td>
                        </tr>
                        
                        {/* Billetterie */}
                        <tr className="hover:bg-gray-50/50">
                          <Td>
                            <div className="flex items-center gap-2">
                              <div className="h-6 w-6 rounded-md bg-emerald-100 flex items-center justify-center">
                                <Wallet className="h-3 w-3 text-emerald-600" />
                              </div>
                              <span className="font-medium">Ventes billetterie</span>
                            </div>
                          </Td>
                          <Td align="right">
                            <span className="font-medium">{reconciliationData.ventesGuichet.reservations}</span>
                          </Td>
                          <Td align="right">
                            <span className="font-medium">{reconciliationData.ventesGuichet.tickets}</span>
                          </Td>
                          <Td align="right">
                            <span className="font-bold text-gray-900">{money(reconciliationData.ventesGuichet.montant)}</span>
                          </Td>
                          <Td align="right">
                            <span className="text-xs px-2 py-1 rounded-full bg-emerald-100 text-emerald-700">
                              À encaisser en caisse
                            </span>
                          </Td>
                        </tr>
                        
                        {/* En ligne */}
                        <tr className="hover:bg-gray-50/50">
                          <Td>
                            <div className="flex items-center gap-2">
                              <div className="h-6 w-6 rounded-md bg-indigo-100 flex items-center justify-center">
                                <CreditCard className="h-3 w-3 text-indigo-600" />
                              </div>
                              <span className="font-medium">Ventes en ligne</span>
                            </div>
                          </Td>
                          <Td align="right">
                            <span className="font-medium">{reconciliationData.ventesEnLigne.reservations}</span>
                          </Td>
                          <Td align="right">
                            <span className="font-medium">{reconciliationData.ventesEnLigne.tickets}</span>
                          </Td>
                          <Td align="right">
                            <span className="font-bold text-gray-900">{money(reconciliationData.ventesEnLigne.montant)}</span>
                          </Td>
                          <Td align="right">
                            <span className="text-xs px-2 py-1 rounded-full bg-indigo-100 text-indigo-700">
                              Encaissé en ligne
                            </span>
                          </Td>
                        </tr>

                        {/* Courrier (paiements colis) */}
                        <tr className="hover:bg-gray-50/50">
                          <Td>
                            <div className="flex items-center gap-2">
                              <div className="h-6 w-6 rounded-md bg-violet-100 flex items-center justify-center">
                                <Package className="h-3 w-3 text-violet-600" />
                              </div>
                              <span className="font-medium">Courrier (colis payés)</span>
                            </div>
                          </Td>
                          <Td align="right">
                            <span className="font-medium">{reconciliationData.courrier.operations}</span>
                          </Td>
                          <Td align="right">
                            <span className="text-gray-400">—</span>
                          </Td>
                          <Td align="right">
                            <span className="font-bold text-gray-900">{money(reconciliationData.courrier.montant)}</span>
                          </Td>
                          <Td align="right">
                            <span className="text-xs px-2 py-1 rounded-full bg-violet-100 text-violet-800">
                              Paiements courrier
                            </span>
                          </Td>
                        </tr>
                        
                        {/* Total ventes billets uniquement */}
                        <tr className="border-t-2 border-gray-300">
                          <Td className="font-bold text-gray-900">Total billets (billetterie + ligne)</Td>
                          <Td align="right" className="font-bold text-gray-900">
                            {reconciliationData.ventesGuichet.reservations + reconciliationData.ventesEnLigne.reservations}
                          </Td>
                          <Td align="right" className="font-bold text-gray-900">
                            {reconciliationData.ventesGuichet.tickets + reconciliationData.ventesEnLigne.tickets}
                          </Td>
                          <Td align="right" className="font-bold text-gray-900">
                            {money(reconciliationData.ventesGuichet.montant + reconciliationData.ventesEnLigne.montant)}
                          </Td>
                          <Td align="right">
                            <span className="text-xs px-2 py-1 rounded-full bg-blue-100 text-blue-700">
                              Hors courrier
                            </span>
                          </Td>
                        </tr>
                        
                        {/* ENCAISSEMENTS */}
                        <tr className="bg-gradient-to-r from-emerald-50/30 to-green-50/30">
                          <Td colSpan={5}>
                            <div className="text-sm font-bold text-emerald-700 uppercase tracking-wider py-2">
                              ENCAISSEMENTS DANS LA CAISSE
                            </div>
                          </Td>
                        </tr>
                        
                        {/* Espèces */}
                        <tr className="hover:bg-gray-50/50">
                          <Td>
                            <div className="flex items-center gap-2">
                              <div className="h-6 w-6 rounded-md bg-amber-100 flex items-center justify-center">
                                <Banknote className="h-3 w-3 text-amber-600" />
                              </div>
                              <span className="font-medium">Espèces reçues</span>
                            </div>
                          </Td>
                          <Td align="right">—</Td>
                          <Td align="right">—</Td>
                          <Td align="right">
                            <span className="font-bold text-gray-900">{money(reconciliationData.encaissementsEspeces)}</span>
                          </Td>
                          <Td align="right">
                            <span className="text-xs px-2 py-1 rounded-full bg-amber-100 text-amber-700">
                              Caisse agence
                            </span>
                          </Td>
                        </tr>
                        
                        {/* Mobile Money */}
                        <tr className="hover:bg-gray-50/50">
                          <Td>
                            <div className="flex items-center gap-2">
                              <div className="h-6 w-6 rounded-md bg-purple-100 flex items-center justify-center">
                                <Smartphone className="h-3 w-3 text-purple-600" />
                              </div>
                              <span className="font-medium">Mobile Money</span>
                            </div>
                          </Td>
                          <Td align="right">—</Td>
                          <Td align="right">—</Td>
                          <Td align="right">
                            <span className="font-bold text-gray-900">{money(reconciliationData.encaissementsMobileMoney)}</span>
                          </Td>
                          <Td align="right">
                            <span className="text-xs px-2 py-1 rounded-full bg-purple-100 text-purple-700">
                              Compte compagnie
                            </span>
                          </Td>
                        </tr>
                        
                        {/* Total encaissements */}
                        <tr className="border-t-2 border-gray-300">
                          <Td className="font-bold text-gray-900">TOTAL ENCAISSÉS</Td>
                          <Td align="right">—</Td>
                          <Td align="right">—</Td>
                          <Td align="right" className="font-bold text-gray-900">
                            {money(reconciliationData.encaissementsTotal)}
                          </Td>
                          <Td align="right">
                            <span className="text-xs px-2 py-1 rounded-full bg-emerald-100 text-emerald-700">
                              Argent réellement reçu
                            </span>
                          </Td>
                        </tr>
                        
                        {/* ÉCART */}
                        <tr className={`${reconciliationData.ecart === 0 ? 'bg-gradient-to-r from-emerald-50/30 to-green-50/30' : reconciliationData.ecart > 0 ? 'bg-gradient-to-r from-rose-50/30 to-red-50/30' : 'bg-gradient-to-r from-amber-50/30 to-orange-50/30'}`}>
                          <Td colSpan={5}>
                            <div className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
                              <div className="min-w-0 text-sm font-bold text-gray-900">
                                Écart (ventes billets − caisse guichet)
                              </div>
                              <div className={`min-w-0 text-xl font-bold ${reconciliationData.ecart === 0 ? 'text-emerald-700' : reconciliationData.ecart > 0 ? 'text-rose-700' : 'text-amber-700'}`}>
                                {money(reconciliationData.ecart)}
                                {reconciliationData.ecart === 0 && (
                                  <span className="ml-2 text-sm font-medium text-emerald-600">✓ Équilibre parfait</span>
                                )}
                                {reconciliationData.ecart > 0 && (
                                  <span className="ml-2 text-sm font-medium text-rose-600">⚠️ Manque dans la caisse</span>
                                )}
                                {reconciliationData.ecart < 0 && (
                                  <span className="ml-2 text-sm font-medium text-amber-600">ℹ️ Excédent en caisse</span>
                                )}
                              </div>
                            </div>
                          </Td>
                        </tr>
                      </tbody>
                    </table>
                    </div>
                  </div>
                  
                  {/* Résumé */}
                  <div className="mt-6 p-4 rounded-xl bg-gradient-to-r from-gray-50 to-gray-100/50 border border-gray-200">
                    <div className="text-sm font-medium text-gray-700 mb-2">Résumé de la journée</div>
                    <div className="text-sm text-gray-600 space-y-1">
                      <div>• <span className="font-medium">{reconciliationData.ventesGuichet.reservations + reconciliationData.ventesEnLigne.reservations}</span> réservations billets</div>
                      <div>• <span className="font-medium">{reconciliationData.ventesGuichet.tickets + reconciliationData.ventesEnLigne.tickets}</span> billets vendus</div>
                      <div>• <span className="font-medium">{money(reconciliationData.ventesGuichet.montant + reconciliationData.ventesEnLigne.montant)}</span> chiffre d’affaires billets</div>
                      <div>• <span className="font-medium">{reconciliationData.courrier.operations}</span> paiement{reconciliationData.courrier.operations > 1 ? 's' : ''} courrier · <span className="font-medium">{money(reconciliationData.courrier.montant)}</span></div>
                      <div>• <span className="font-medium">{money(reconciliationData.encaissementsTotal)}</span> passé en caisse guichet (espèces + mobile money)</div>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {tab === 'corrections' && (
          <div className="space-y-6">
            <SectionCard
              title="Corrections exceptionnelles"
              help="Réservé aux cas rares : toujours avec la compagnie."
            >
              <p className="text-sm text-gray-700 leading-relaxed">
                Aucune correction de solde ou d’historique ne se fait depuis cet écran. En cas d’erreur (saisie, versement, session),
                contactez le <strong>comptable compagnie</strong> ou l’<strong>admin compagnie</strong>.
              </p>
            </SectionCard>
          </div>
        )}

        {treasuryModalView && canManipulateCash && (
          <div
            className="fixed inset-0 z-50 flex items-end justify-center overflow-y-auto bg-black/50 p-0 sm:items-center sm:p-4 md:p-6"
            role="dialog"
            aria-modal="true"
          >
            <div className="mx-auto w-full max-w-5xl max-h-[min(92dvh,920px)] overflow-y-auto overflow-x-hidden rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl">
              <div className="sticky top-0 z-10 flex flex-col gap-2 border-b border-gray-200 bg-white px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6">
                <div className="min-w-0 text-sm font-semibold text-gray-900 sm:text-base">
                  {treasuryModalView === 'new-operation' && 'Dépense caisse'}
                  {treasuryModalView === 'transfer' && 'Versement vers la compagnie'}
                  {treasuryModalView === 'new-payable' && 'Paiement fournisseur'}
                </div>
                <button
                  type="button"
                  onClick={() => setTreasuryModalView(null)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 sm:w-auto"
                >
                  Fermer
                </button>
              </div>
              <div className="p-4 sm:p-6">
                {treasuryModalView === 'new-operation' && <AgencyTreasuryNewOperationPage />}
                {treasuryModalView === 'transfer' && <AgencyTreasuryTransferPage />}
                {treasuryModalView === 'new-payable' && <AgencyTreasuryNewPayablePage />}
              </div>
            </div>
          </div>
        )}

    </StandardLayoutWrapper>
    </div>
  );
};

/* ============================================================================
   SECTION : COMPOSANTS UI RÉUTILISABLES
   Description : Composants d'interface utilisateur modulaires
   ============================================================================ */

const TabButton: React.FC<{
  active: boolean; 
  onClick: () => void; 
  label: string;
  icon: React.ReactNode;
  theme: { primary: string; secondary: string };
  badgeCount?: number;
  /** Infobulle (ex. libellé long sur onglet court). */
  htmlTitle?: string;
}> = ({ active, onClick, label, icon, theme, badgeCount = 0, htmlTitle }) => (
  <button
    type="button"
    title={htmlTitle}
    className={`
      flex shrink-0 items-center gap-2 px-3 sm:px-4 py-2 rounded-lg text-sm font-medium transition-all relative border
      ${active 
        ? 'text-gray-900 border-transparent' 
        : 'text-gray-600 border-slate-200 hover:text-gray-900 hover:bg-white'
      }
    `}
    onClick={onClick}
    style={active ? {
      backgroundColor: theme.secondary,
      borderColor: `${theme.primary}66`,
    } : {}}
  >
    {icon}
    <span className="whitespace-nowrap">{label}</span>
    {badgeCount > 0 && (
      <span className="absolute -top-1 -right-1 min-w-[1.25rem] h-5 px-1 flex items-center justify-center rounded-full bg-red-500 text-white text-xs font-bold">
        {badgeCount > 99 ? '99+' : badgeCount}
      </span>
    )}
  </button>
);


const shiftStatusToBadge: Record<string, "active" | "pending" | "success" | "warning" | "neutral"> = {
  active: "active",
  paused: "pending",
  closed: "warning",
  pending: "pending",
  validated_agency: "success",
  validated: "success",
};

const SectionShifts: React.FC<{
  title: string;
  hint?: string;
  icon: LucideIcon;
  list: ShiftDoc[];
  usersCache: Record<string, ComptaUserCacheEntry>;
  liveStats: Record<string, { reservations: number; tickets: number; amount: number }>;
  actions: (s: ShiftDoc) => React.ReactNode;
  theme: { primary: string; secondary: string };
}> = ({ title, hint, icon, list, usersCache, liveStats, actions, theme }) => {
  const money = useFormatCurrency();
  const statusLabels: Record<string, string> = {
    active: "En service",
    paused: "En pause",
    closed: "Clôturé",
    pending: "En attente",
    validated_agency: "Validé agence (en attente chef d'agence)",
    validated: "Validé",
  };
  return (
    <SectionCard
      title={title}
      icon={icon}
      description={hint}
      right={<StatusBadge status="neutral">{list.length} poste{list.length > 1 ? "s" : ""}</StatusBadge>}
    >
      {list.length === 0 ? (
        <UIEmptyState message={`Aucun ${title.toLowerCase()} — Aucun poste dans cet état pour le moment`} />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {list.map((s) => {
            const ui = usersCache[s.userId] || {};
            const name = ui.name || s.userName || s.userEmail || s.userId;
            const code = ui.code || s.userCode || "GUEST";
            const live = liveStats[s.id];
            const reservations = live?.reservations ?? s.totalReservations ?? 0;
            const tickets = live?.tickets ?? s.totalTickets ?? 0;
            const amount = live?.amount ?? s.totalAmount ?? 0;
            const badgeStatus = shiftStatusToBadge[s.status] ?? "neutral";

            return (
              <div key={s.id} className={COMPTA_POST_CARD_3D} style={comptaPostCardTintStyle(theme)}>
                <div
                  className="pointer-events-none absolute inset-0 rounded-2xl opacity-0 transition-opacity duration-300 group-hover:opacity-100"
                  style={{
                    background: `linear-gradient(125deg, ${theme.primary}22 0%, transparent 42%, ${theme.secondary}18 100%)`,
                  }}
                />
                <div className="relative">
                  <div className="flex items-start justify-between gap-3 mb-4">
                    <div className="min-w-0">
                      <div className="text-xs font-medium text-gray-500 uppercase tracking-wider">Vendeur (billetterie)</div>
                      <div className="font-semibold text-gray-900 truncate">
                        {name} <span className="text-gray-500 text-sm ml-2">({code})</span>
                      </div>
                    </div>
                    <StatusBadge status={badgeStatus}>{statusLabels[s.status] ?? s.status}</StatusBadge>
                  </div>
                  <div className="grid grid-cols-2 gap-4 mb-4">
                    <InfoCard label="Réservations" value={reservations.toString()} />
                    <InfoCard label="Billets" value={tickets.toString()} />
                    <InfoCard label="Début" value={s.startTime ? new Date(s.startTime.toDate?.() ?? s.startTime).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }) : "—"} />
                    <InfoCard label="Fin" value={s.endTime ? new Date(s.endTime.toDate?.() ?? s.endTime).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }) : "—"} />
                  </div>
                  <div
                    className={COMPTA_AMOUNT_PANEL_3D}
                    style={{ borderColor: `${theme.primary}55` }}
                  >
                    <div className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">Ventes du poste</div>
                    <div className="text-xl font-bold drop-shadow-sm" style={{ color: theme.primary }}>
                      {money(amount)}
                    </div>
                  </div>
                  <div className="flex justify-end">{actions(s)}</div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </SectionCard>
  );
};

const InfoCard: React.FC<{ label: string; value: string; emphasis?: boolean }> = ({
  label,
  value,
  emphasis = false,
}) => (
  <div>
    <div className={cn(typography.mutedSm, "mb-1")}>{label}</div>
    <div className={cn("font-medium", emphasis ? "text-gray-900 dark:text-gray-100" : "text-gray-700 dark:text-gray-300")}>{value}</div>
  </div>
);

const Th: React.FC<{
  children: React.ReactNode;
  align?: "left" | "right";
  className?: string;
  colSpan?: number; // AJOUTÉ : support pour colSpan
}> = ({ children, align = "left", className = "", colSpan }) => (
  <th
    colSpan={colSpan} // AJOUTÉ
    className={`px-4 py-3 text-xs font-semibold text-gray-700 uppercase tracking-wider
      ${align === 'right' ? 'text-right' : 'text-left'}
      ${className}`}
  >
    {children}
  </th>
);

const Td: React.FC<{
  children: React.ReactNode;
  align?: "left" | "right";
  className?: string;
  colSpan?: number; // AJOUTÉ : support pour colSpan
}> = ({ children, align = "left", className = "", colSpan }) => (
  <td
    colSpan={colSpan} // AJOUTÉ
    className={`px-4 py-3
      ${align === 'right' ? 'text-right' : 'text-left'}
      ${className}`}
  >
    {children}
  </td>
);

/* ============================================================================
   SECTION : FONCTIONS UTILITAIRES - EXPORT CSV
   Description : Export des données de caisse au format CSV
   ============================================================================ */

function exportCsv(rows: CashDay[], currencySymbol: string) {
  console.log('[AgenceCompta] Export CSV des données de caisse');
  
  if (!rows.length) { 
    console.warn('[AgenceCompta] Aucune donnée à exporter');
    alert('Aucune donnée à exporter'); 
    return; 
  }
  
  try {
    const header = ['Date', `Entrées (${currencySymbol})`, `Sorties (${currencySymbol})`, `Solde (${currencySymbol})`];
    const body = rows.map(r => [
      new Date(r.dateISO).toLocaleDateString('fr-FR'),
      r.entrees.toLocaleString('fr-FR'),
      r.sorties.toLocaleString('fr-FR'),
      r.solde.toLocaleString('fr-FR')
    ].join(';'));
    
    const csv = [header.join(';'), ...body].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `caisse_agence_${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    console.log('[AgenceCompta] Export CSV terminé avec succès');
  } catch (error) {
    console.error('[AgenceCompta] Erreur lors de l\'export CSV:', error);
    alert('Erreur lors de l\'export CSV');
  }
}

export default AgenceComptabilitePage;