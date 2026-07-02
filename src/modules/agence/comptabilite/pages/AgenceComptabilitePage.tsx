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
import { normalizeReservation } from '@/lib/normalizeReservation';
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
  Download, FileText, HandIcon, LogOut, MapPin, Package, Play, Plus, StopCircle, Bell,
  Ticket, Wallet, BarChart3,
  RefreshCw, TrendingUp, CreditCard, Smartphone, ArrowDownCircle, Menu, X, Printer
} from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { SectionCard, ActionButton, MetricCard, StatusBadge, EmptyState as UIEmptyState } from '@/ui';
import { useFormatCurrency, useCurrencySymbol } from '@/shared/currency/CurrencyContext';
import { useAgencyDarkMode } from '@/modules/agence/shared';
import AgencyTreasuryNewOperationPage from '@/modules/agence/treasury/pages/AgencyTreasuryNewOperationPage';
import AgencyTreasuryTransferPage from '@/modules/agence/treasury/pages/AgencyTreasuryTransferPage';
import AgencyTreasuryNewPayablePage from '@/modules/agence/treasury/pages/AgencyTreasuryNewPayablePage';
// ✅ NOUVEAU : Import de la page des payables
import AgencyTreasuryPayablesListPage from '@/modules/agence/treasury/pages/AgencyTreasuryPayablesListPage';
import { getAgencyStats } from '@/modules/compagnie/networkStats/networkStatsService';
import { getUnifiedCommercialActivity } from '@/modules/compagnie/networkStats/activityCore';
import { getCashTransactionsByLocation } from '@/modules/compagnie/cash/cashService';
import type { AgencyCashPosition } from '@/modules/agence/comptabilite/agencyCashAuditService';
import {
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
import { AccountantKpiCards } from '@/modules/agence/comptabilite/components/phase1/AccountantKpiCards';
import { ActivePostsPanel } from '@/modules/agence/comptabilite/components/phase1/ActivePostsPanel';
import { AccountantControlLayout } from '@/modules/agence/comptabilite/components/phase1/AccountantControlLayout';
import AgencyCashStatement from '@/modules/agence/cashStatement/AgencyCashStatement';
import {
  buildAgencyCashStatementSummary,
  loadAgencyCashStatementCached,
} from '@/modules/agence/cashStatement/agencyCashStatementService';
import type {
  AgencyCashStatementRow,
  AgencyCashStatementSummary,
} from '@/modules/agence/cashStatement/agencyCashStatementTypes';
import {
  CourierComptaSessionCard,
  InfoCard,
  Th,
  Td,
} from '@/modules/agence/comptabilite/components/phase1/AccountantSharedUi';

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
  expectedAmount?: number;
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
  time: string;
  departure: string;
  arrival: string;
  customerName: string;
  customerPhone?: string;
  seatsGo: number;
  seatsReturn?: number;
  amount: number;
  paymentMethod?: string;
  createdAt?: any;
  guichetierCode?: string;
  channel?: string;
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

type TreasuryModalView = 'new-operation' | 'transfer' | 'new-payable' | 'payables' | null;
type ReportPeriodPreset = 'today' | '7d' | '30d' | 'month' | 'custom';

type AccountingReportBreakdown = {
  billetterie: number;
  courrier: number;
  ajustements: number;
  depenses: number;
  versementsCompagnie: number;
};

function classifyReportBreakdown(rows: AgencyCashStatementRow[]): AccountingReportBreakdown {
  return rows.reduce<AccountingReportBreakdown>(
    (sum, row) => {
      const label = `${row.label} ${row.typeLabel}`.toLowerCase();
      if (row.entry > 0) {
        if (row.category === 'validation' && label.includes('courrier')) {
          sum.courrier += row.entry;
        } else if (row.category === 'validation') {
          sum.billetterie += row.entry;
        } else {
          sum.ajustements += row.entry;
        }
      }
      if (row.exit > 0) {
        if (row.category === 'transfer') {
          sum.versementsCompagnie += row.exit;
        } else {
          sum.depenses += row.exit;
        }
      }
      return sum;
    },
    {
      billetterie: 0,
      courrier: 0,
      ajustements: 0,
      depenses: 0,
      versementsCompagnie: 0,
    }
  );
}

function toDateInputValue(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function buildReportPeriodRange(
  preset: ReportPeriodPreset,
  customFrom: string,
  customTo: string
): { from: Date; to: Date } {
  const now = new Date();
  const endToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
  if (preset === 'today') {
    return {
      from: new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0),
      to: endToday,
    };
  }
  if (preset === '7d' || preset === '30d') {
    const days = preset === '7d' ? 6 : 29;
    return {
      from: new Date(now.getFullYear(), now.getMonth(), now.getDate() - days, 0, 0, 0, 0),
      to: endToday,
    };
  }
  if (preset === 'month') {
    return {
      from: new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0),
      to: endToday,
    };
  }
  const fallback = {
    from: new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0),
    to: endToday,
  };
  if (!customFrom || !customTo) return fallback;
  const from = new Date(customFrom);
  const to = new Date(customTo);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return fallback;
  from.setHours(0, 0, 0, 0);
  to.setHours(23, 59, 59, 999);
  return { from, to };
}

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

const paymentStatusLabelFr = (s: string) => {
  const u = String(s || '').toUpperCase();
  if (u === 'UNPAID') return 'Non payé';
  if (u === 'PAID_ORIGIN') return 'Payé (origine)';
  if (u === 'PAID_DESTINATION') return 'Payé (destination)';
  return s || '—';
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

type AccountantPhaseView = 'dashboard' | 'postes' | 'receptions' | 'caisse' | 'historique' | 'rapports';

function resolvePhaseViewFromTab(raw: string | null): AccountantPhaseView {
  if (raw === 'versements' || raw === 'receptions') return 'receptions';
  if (raw === 'caisse') return 'caisse';
  if (raw === 'rapports') return 'rapports';
  return 'dashboard';
}

const AgenceComptabilitePage: React.FC = () => {
  console.log('[AgenceCompta] Initialisation de la page de comptabilité');
  
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user, company, logout } = useAuth() as any;
  const theme = useCompanyTheme(company) || { primary: '#EA580C', secondary: '#F97316' };
  const money = useFormatCurrency();
  const currencySymbol = useCurrencySymbol();
  const [darkMode, toggleDarkMode] = useAgencyDarkMode();
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
  const [phaseView, setPhaseView] = useState<AccountantPhaseView>(() => resolvePhaseViewFromTab(tabParam));
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
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
  const [courierSessionStats, setCourierSessionStats] = useState<
    Record<
      string,
      {
        total: number;
        paid: number;
        paidAmount: number;
      }
    >
  >({});
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
  const reloadCashRef = useRef<((force?: boolean) => Promise<void>) | null>(null);

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
  const [cashDashboardSummary, setCashDashboardSummary] = useState<AgencyCashStatementSummary | null>(null);
  const [ledgerPeriodError, setLedgerPeriodError] = useState<string | null>(null);
  const [loadingCash, setLoadingCash] = useState(false);
  const [treasuryModalView, setTreasuryModalView] = useState<TreasuryModalView>(null);
  const [cashStatementInitialRange, setCashStatementInitialRange] = useState<{ from: Date; to: Date } | undefined>();

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
     SECTION : ÉTATS REACT - TABLEAU DE BORD JOURNALIER (NOUVEAU)
     Description : Données dédiées au dashboard journalier
     ============================================================================ */
  
  const [dailyCashData, setDailyCashData] = useState({
    ticketRevenue: 0,
    courierRevenue: 0,
    totalCashIn: 0,
    totalCashOut: 0,
    netCash: 0,
    date: '',
  });
  const [loadingDailyDashboard, setLoadingDailyDashboard] = useState(false);
  const [reportDailySummary, setReportDailySummary] = useState<AgencyCashStatementSummary | null>(null);
  const [reportPeriodSummary, setReportPeriodSummary] = useState<AgencyCashStatementSummary | null>(null);
  const [reportPeriodPreset, setReportPeriodPreset] = useState<ReportPeriodPreset>('month');
  const [reportCustomFrom, setReportCustomFrom] = useState<string>(() => {
    const d = new Date();
    return toDateInputValue(new Date(d.getFullYear(), d.getMonth(), 1));
  });
  const [reportCustomTo, setReportCustomTo] = useState<string>(() => toDateInputValue(new Date()));
  const [loadingAccountingReports, setLoadingAccountingReports] = useState(false);
  const [accountingReportsError, setAccountingReportsError] = useState<string | null>(null);

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
    expectedAmount: r.expectedAmount ?? r.totalSalesAmount ?? r.grossSalesAmount ?? r.totalAmount ?? r.amount,
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
    const unsub = onSnapshot(query(ref, limit(200)), async (snap) => {
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
    const unsub = onSnapshot(query(col, limit(200)), (snap) => {
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
    if (!user?.companyId || !user?.agencyId) return;
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
      const qSh = query(shipmentsRef(db, user.companyId), where('sessionId', '==', id), limit(200));
      cur[id] = onSnapshot(
        qSh,
        (snap) => {
          let paid = 0;
          let paidAmount = 0;
          for (const d of snap.docs) {
            const data = d.data() as any;
            const ps = data?.paymentStatus as string | undefined;
            const isPaid = ps && ps !== 'UNPAID';
            if (isPaid) {
              paid += 1;
              paidAmount += coerceCourierShipmentAmount(data);
            }
          }
          setCourierSessionStats((p) => ({
            ...p,
            [id]: { total: snap.docs.length, paid, paidAmount },
          }));

          // Alignement UI : le résumé de carte “Total encaissé” affiche le montant attendu (paidAmount)
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
    // Ledger “attendu” pour la validation chef/compta.
    // Ne pas l’utiliser pour l’affichage “Postes actifs” (indicateur opérationnel depuis shipments).
    // On ne calcule le ledger que pour les sessions réellement nécessaires :
    // - closed (à valider)
    // - validated_agency / validated (en attente chef)
    if (!user?.companyId) return;

    let cancelled = false;

    const ids = [
      ...new Set([
        ...closedCourierSessions.map((s) => s.id),
        ...validatedCourierSessions.map((s) => s.id),
        ...courierValidatedAgencySessions.map((s) => s.id),
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
          next[id] = await getCourierSessionLedgerTotal(user.companyId!, id, {
            agencyId: user.agencyId,
            paymentChannel: "courrier",
          });
        } catch {
          // fallback non bloquant : pas d’impact sur “Postes actifs”
          next[id] = 0;
        }
      }
      if (!cancelled) setCourierLedgerBySessionId(next);
    })();

    return () => {
      cancelled = true;
    };
  }, [
    user?.companyId,
    user?.agencyId,
    closedCourierSessions,
    validatedCourierSessions,
    courierValidatedAgencySessions,
  ]);

  function coerceCourierShipmentAmount(d: any): number {
    const transportFee = Number(d?.transportFee ?? 0);
    const insuranceAmount = Number(d?.insuranceAmount ?? 0);
    const shipmentTotal =
      (Number.isFinite(transportFee) && transportFee > 0 ? transportFee : 0) +
      (Number.isFinite(insuranceAmount) && insuranceAmount > 0 ? insuranceAmount : 0);
    if (shipmentTotal > 0) return shipmentTotal;

    const candidates = [
      d?.paidAmount,
      d?.destinationCollectedAmount,
      d?.amount,
      d?.totalAmount,
      d?.price,
      d?.transportFee,
      d?.deliveryFee,
      d?.shippingFee,
      d?.fee,
    ];
    for (const c of candidates) {
      const n = Number(c ?? 0);
      if (Number.isFinite(n) && n > 0) return n;
      // allow 0 amounts explicitly but only if everything else failed
    }
    const last = Number(candidates[candidates.length - 1] ?? 0);
    return Number.isFinite(last) ? last : 0;
  }

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
  
  const liveWatchKey = useMemo(
    () =>
      [...new Set([...activeShifts, ...pausedShifts].map((s) => s.id))]
        .sort()
        .join(','),
    [activeShifts, pausedShifts]
  );

  const liveWatchKeyRef = useRef<string>('');

  useEffect(() => {
    // Évite les relances inutiles si React rejoue l’effet (StrictMode/dev) sans changement réel de la clé.
    if (liveWatchKeyRef.current === liveWatchKey) {
      return;
    }
    liveWatchKeyRef.current = liveWatchKey;

    console.log('[AgenceCompta] Mise à jour des statistiques live');

    if (!user?.companyId || !user?.agencyId) return;
    if (!liveWatchKey) return;

    const rRef = collection(db, `companies/${user.companyId}/agences/${user.agencyId}/reservations`);
    const wantedIds = new Set(liveWatchKey.split(',').filter(Boolean));


    // Nettoyage des écouteurs inutiles
    for (const id of Object.keys(liveUnsubsRef.current)) {
      if (!wantedIds.has(id)) {
        console.log(`[AgenceCompta] Arrêt de l'écoute pour le poste ${id}`);
        liveUnsubsRef.current[id]?.();
        delete liveUnsubsRef.current[id];
      }
    }

    // Ajout des écouteurs pour les postes actifs/en pause
    for (const s of [...activeShifts, ...pausedShifts]) {
      if (!wantedIds.has(s.id)) continue;
      if (liveUnsubsRef.current[s.id]) continue;

      console.log(`[AgenceCompta] Démarrage de l'écoute pour le poste ${s.id}`);
      const qLive = query(rRef, where('sessionId', '==', s.id), limit(100));
      const unsub = onSnapshot(qLive, (snap) => {
        let reservations = 0, tickets = 0, amount = 0;
        snap.forEach(d => {
          const doc = d.data() as Record<string, unknown>;
          const r = normalizeReservation(doc);
          if (!belongsToGuichetSession(doc, s.id, s.userId)) return;
          reservations += 1;
          tickets += (Number(doc.seatsGo) || 0) + (Number(doc.seatsReturn) || 0);
          amount += r.payment.amount;
        });
        setLiveStats(prev => ({ ...prev, [s.id]: { reservations, tickets, amount } }));
      });
      liveUnsubsRef.current[s.id] = unsub;
    }

    // Important: on ne cleanup pas tout au moindre changement de shifts.
    // Les écouteurs sont gérés par diff (wantedIds) pour éviter les rafales.
  }, [liveWatchKey, user?.companyId, user?.agencyId]);


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
      const shiftsToAggregate = [...closedShifts, ...validatedAgencyShifts];
      
      console.log(`[AgenceCompta] ${shiftsToAggregate.length} poste(s) clôturé(s) ou validé(s) comptable à analyser`);
      
      for (const s of shiftsToAggregate) {
        const docs = await fetchReservationDocsForShiftSlot(user.companyId, user.agencyId, s.id);
        let reservations = 0, tickets = 0, amount = 0, cashExpected = 0, mmExpected = 0;
        
        docs.forEach(d => {
          const doc = d.data() as Record<string, unknown>;
          const r = normalizeReservation(doc);
          if (!belongsToGuichetSession(doc, s.id, s.userId)) return;
          reservations += 1;
          tickets += (Number(doc.seatsGo) || 0) + (Number(doc.seatsReturn) || 0);
          const amountValue = r.payment.amount;
          amount += amountValue;
          
          const pay = String(r.payment.method || '').toLowerCase();
          if (pay.includes('esp')) {
            cashExpected += amountValue;
          }
          if (pay.includes('mobile') || pay.includes('mm')) {
            mmExpected += amountValue;
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
  }, [closedShifts, validatedAgencyShifts, user?.companyId, user?.agencyId]);

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
          s.expectedAmount ?? s.totalCash ?? agg?.cashExpected ?? payBy['espèces'] ?? s.cashExpected ?? 0
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
        await reloadCashRef.current?.(true);
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
    const rawTrim = String((receptionInputsCourier[session.id] || { countedAmount: '' }).countedAmount ?? '').trim();
    if (rawTrim === '') {
      alert('Saisissez le montant versé par l’agent courrier avant de valider.');
      return;
    }
    const counted = Number(rawTrim.replace(/[^\d.,]/g, '').replace(',', '.'));
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
        await reloadCashRef.current?.(true);
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
        const doc = d.data() as any;
        const r = normalizeReservation(doc);
        const channel = r.reservation.channel;
        const encaissement = 'agence' as const;

        return {
          id: d.id,
          referenceCode: doc.referenceCode,
          date: r.trip.date ?? '',
          time: r.trip.time ?? '',
          departure: r.trip.departure ?? '',
          arrival: r.trip.arrival ?? '',
          customerName: r.customer.name ?? '',
          customerPhone: r.customer.phone,
          seatsGo: doc.seatsGo || 1,
          seatsReturn: doc.seatsReturn || 0,
          amount: r.payment.amount,
          paymentMethod: r.payment.method,
          createdAt: doc.createdAt,
          guichetierCode: doc.guichetierCode || '',
          channel,
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
        [norm(t.date), norm(t.time), norm(t.departure), norm(t.arrival), norm(t.customerName), norm(t.customerPhone)].join('|');

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
      agg.montant += t.amount || 0;
      
      if (t.channel === 'guichet') {
        agg.guichet.billets += nb;
        agg.guichet.montant += t.amount || 0;
      } else if (t.channel === 'en_ligne') {
        agg.en_ligne.billets += nb;
        agg.en_ligne.montant += t.amount || 0;
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
      const to = new Date(rangeTo); to.setHours(23,59,59,999);
      return { from, to };
    }
    const [y,m] = monthValue.split('-').map(Number);
    const d = new Date(y, (m||1)-1, 1);
    const now = new Date();
    const isCurrentMonth = d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
    const to = isCurrentMonth
      ? new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999)
      : new Date(y, m, 0, 23, 59, 59, 999);
    return { from: startOfMonth(d), to };
  }, [useCustomRange, rangeFrom, rangeTo, monthValue]);

  /* ============================================================================
     SECTION : GESTION DE LA CAISSE - CHARGEMENT DES DONNÉES
     Description : Récupération et agrégation des mouvements de caisse
     ============================================================================ */
  
  const reloadCash = useCallback(async (force = false) => {
    console.log('[AgenceCompta] Chargement des données de caisse', currentRange);
    
    if (!user?.companyId || !user?.agencyId) return;
    setLoadingCash(true);
    setLedgerPeriodError(null);

    try {
      const statement = await loadAgencyCashStatementCached(
        {
          companyId: user.companyId,
          agencyId: user.agencyId,
          from: currentRange.from,
          to: currentRange.to,
        },
        { force }
      );
      const summary = buildAgencyCashStatementSummary(statement, 'all');
      setCashDashboardSummary(summary);
      console.log("[AgenceCompta] Données de caisse chargées:", {
        mouvements: summary.rows.length,
        entreesPeriode: summary.totalEntries,
        sortiesPeriode: summary.totalExits,
        netFluxPeriode: summary.net,
        soldeActuel: summary.currentBalance,
      });
    } catch (error) {
      console.error('[AgenceCompta] Erreur lors du chargement de la caisse (période / journal):', error);
      setCashDashboardSummary(null);
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

      const dayKey = normalizeDateToYYYYMMDD(dateStr);
      const activity = await getUnifiedCommercialActivity(
        user.companyId,
        { dateFrom: dayKey, dateTo: dayKey },
        { agencyId: user.agencyId, timeZone: agencyTz }
      );
      const ventesGuichet = {
        reservations: activity.billets.guichet.reservationCount,
        tickets: activity.billets.guichet.tickets,
        montant: activity.billets.guichet.amount,
      };
      const ventesEnLigne = {
        reservations: activity.billets.online.reservationCount,
        tickets: activity.billets.online.tickets,
        montant: activity.billets.online.amount,
      };
      let encaissementsEspeces = 0;
      let encaissementsMobileMoney = 0;

      const refunded = 'refunded';
      list.forEach((t) => {
        if ((t as { status?: string }).status === refunded) return;
        const amount = Number(t.amount || 0);
        const source = String((t as { sourceType?: string }).sourceType || '').toLowerCase();
        const payment = String((t as { paymentMethod?: string }).paymentMethod || '').toLowerCase();

        if (source === 'guichet') {
          if (payment.includes('cash') || payment.includes('esp')) encaissementsEspeces += amount;
          else if (payment.includes('mobile') || payment.includes('mm')) encaissementsMobileMoney += amount;
        }
      });

      const encaissementsTotal = encaissementsEspeces + encaissementsMobileMoney;
      const ecart = ventesGuichet.montant - encaissementsTotal;

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

  /* ============================================================================
     SECTION : CHARGEMENT DES DONNÉES DU TABLEAU DE BORD JOURNALIER (NOUVEAU)
     Description : Chargement des données journalières pour le dashboard
     ============================================================================ */
  
  const loadDailyDashboardData = useCallback(async () => {
    console.log('[AgenceCompta] Chargement des données du tableau de bord journalier');
    
    if (!user?.companyId || !user?.agencyId) {
      console.warn('[AgenceCompta] Données manquantes pour le dashboard journalier');
      return;
    }

    setLoadingDailyDashboard(true);

    try {
      const todayKey = getTodayForTimezone(agencyTz);
      const todayStr = new Date(todayKey).toISOString().split('T')[0];
      
      // 1. Recettes billetterie du jour (via getAgencyStats)
      const stats = await getAgencyStats(user.companyId, user.agencyId, todayKey, todayKey, agencyTz);
      const ticketRevenue = stats.totalRevenue || 0;

      // 2. Recettes colis du jour (via getPaymentsByDateRange)
      const from = getStartOfDayForDate(todayKey, agencyTz);
      const to = getEndOfDayForDate(todayKey, agencyTz);
      const payments = await getPaymentsByDateRange(user.companyId, from, to);
      let courierRevenue = 0;
      for (const p of payments) {
        if (p.agencyId === user.agencyId && p.channel === 'courrier' && p.status === 'validated') {
          courierRevenue += Number(p.amount) || 0;
        }
      }

      // 3. Entrées du jour (encaissements validés) - via comptaEncaissements
      let dailyCashIn = 0;
      try {
        const encaissements = await listComptaEncaissementsInRange(
          user.companyId,
          user.agencyId,
          from,
          to,
          500
        );
        for (const e of encaissements) {
          dailyCashIn += Math.max(0, Number(e.montant ?? 0));
        }
      } catch (encErr) {
        console.warn('[AgenceCompta] Erreur chargement encaissements journaliers:', encErr);
        // Fallback: utiliser ticketRevenue + courierRevenue
        dailyCashIn = ticketRevenue + courierRevenue;
      }

      // 4. Sorties du jour (via financialTransactions)
      let dailyCashOut = 0;
      try {
        const txRef = collection(db, `companies/${user.companyId}/financialTransactions`);
        const qTx = query(
          txRef,
          where("companyId", "==", user.companyId),
          where("agencyId", "==", user.agencyId),
          where("createdAt", ">=", Timestamp.fromDate(from)),
          where("createdAt", "<", Timestamp.fromDate(to))
        );
        const snap = await getDocs(qTx);
        for (const doc of snap.docs) {
          const tx = doc.data() as Record<string, unknown>;
          const type = String(tx.type ?? "").toLowerCase();
          const source = String(tx.source ?? "").toLowerCase();
          const isOut =
            type === "expense" ||
            type === "payment_sent" ||
            type === "transfer" ||
            type === "transfer_to_bank" ||
            type === "adjustment" ||
            source === "cashout";
          if (isOut) {
            dailyCashOut += Math.max(0, Number(tx.amount ?? 0));
          }
        }
      } catch (txErr) {
        console.warn('[AgenceCompta] Erreur chargement sorties journalières:', txErr);
        dailyCashOut = 0;
      }

      // 5. Net du jour
      const netCash = dailyCashIn - dailyCashOut;

      setDailyCashData({
        ticketRevenue,
        courierRevenue,
        totalCashIn: dailyCashIn,
        totalCashOut: dailyCashOut,
        netCash,
        date: todayStr,
      });

      console.log('[AgenceCompta] Dashboard journalier chargé:', {
        ticketRevenue,
        courierRevenue,
        totalCashIn: dailyCashIn,
        totalCashOut: dailyCashOut,
        netCash,
        date: todayStr,
      });

    } catch (error) {
      console.error('[AgenceCompta] Erreur chargement dashboard journalier:', error);
      toast.error('Impossible de charger les données du tableau de bord');
    } finally {
      setLoadingDailyDashboard(false);
    }
  }, [user?.companyId, user?.agencyId, agencyTz]);

  const reportPeriodRange = useMemo(
    () => buildReportPeriodRange(reportPeriodPreset, reportCustomFrom, reportCustomTo),
    [reportPeriodPreset, reportCustomFrom, reportCustomTo]
  );

  const reportDailyBreakdown = useMemo(
    () => classifyReportBreakdown(reportDailySummary?.rows ?? []),
    [reportDailySummary]
  );

  const reportPeriodBreakdown = useMemo(
    () => classifyReportBreakdown(reportPeriodSummary?.rows ?? []),
    [reportPeriodSummary]
  );

  const loadAccountingReports = useCallback(async (force = false) => {
    if (!user?.companyId || !user?.agencyId) return;
    setLoadingAccountingReports(true);
    setAccountingReportsError(null);
    try {
      const todayKey = getTodayForTimezone(agencyTz);
      const dailyRange = {
        from: getStartOfDayForDate(todayKey, agencyTz),
        to: getEndOfDayForDate(todayKey, agencyTz),
      };
      const [dailyStatement, periodStatement] = await Promise.all([
        loadAgencyCashStatementCached(
          {
            companyId: user.companyId,
            agencyId: user.agencyId,
            from: dailyRange.from,
            to: dailyRange.to,
          },
          { force }
        ),
        loadAgencyCashStatementCached(
          {
            companyId: user.companyId,
            agencyId: user.agencyId,
            from: reportPeriodRange.from,
            to: reportPeriodRange.to,
          },
          { force }
        ),
      ]);
      setReportDailySummary(buildAgencyCashStatementSummary(dailyStatement, 'all'));
      setReportPeriodSummary(buildAgencyCashStatementSummary(periodStatement, 'all'));
    } catch (error) {
      console.error('[AgenceCompta] Rapports comptables:', error);
      setReportDailySummary(null);
      setReportPeriodSummary(null);
      setAccountingReportsError('Impossible de charger la synthèse comptable.');
    } finally {
      setLoadingAccountingReports(false);
    }
  }, [agencyTz, reportPeriodRange, user?.agencyId, user?.companyId]);

  const exportAccountingReportsCsv = useCallback(() => {
    const day = reportDailySummary;
    const period = reportPeriodSummary;
    if (!day || !period) {
      toast.error('Aucune synthèse à exporter.');
      return;
    }
    const lines = [
      ['Section', 'Libellé', 'Montant'].join(';'),
      ['Rapport journalier', 'Total des entrées', String(day.totalEntries)].join(';'),
      ['Rapport journalier', 'Total des sorties', String(day.totalExits)].join(';'),
      ['Rapport journalier', 'Net de la journée', String(day.net)].join(';'),
      ['Rapport journalier', 'Solde caisse actuel', String(day.currentBalance)].join(';'),
      ['Rapport journalier', 'Billetterie', String(reportDailyBreakdown.billetterie)].join(';'),
      ['Rapport journalier', 'Courrier', String(reportDailyBreakdown.courrier)].join(';'),
      ['Rapport journalier', 'Dépenses', String(reportDailyBreakdown.depenses)].join(';'),
      ['Rapport journalier', 'Versements compagnie', String(reportDailyBreakdown.versementsCompagnie)].join(';'),
      ['Rapport période', 'Billetterie', String(reportPeriodBreakdown.billetterie)].join(';'),
      ['Rapport période', 'Courrier', String(reportPeriodBreakdown.courrier)].join(';'),
      ['Rapport période', 'Ajustements', String(reportPeriodBreakdown.ajustements)].join(';'),
      ['Rapport période', 'Dépenses', String(reportPeriodBreakdown.depenses)].join(';'),
      ['Rapport période', 'Versements compagnie', String(reportPeriodBreakdown.versementsCompagnie)].join(';'),
      ['Rapport période', 'Total entrées', String(period.totalEntries)].join(';'),
      ['Rapport période', 'Total sorties', String(period.totalExits)].join(';'),
      ['Rapport période', 'Net période', String(period.net)].join(';'),
      ['Rapport période', 'Solde actuel', String(period.currentBalance)].join(';'),
    ];
    const blob = new Blob([`\uFEFF${lines.join('\n')}`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `rapport-comptable-${user?.agencyId ?? 'agence'}-${toDateInputValue(new Date())}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [
    reportDailyBreakdown,
    reportDailySummary,
    reportPeriodBreakdown,
    reportPeriodSummary,
    user?.agencyId,
  ]);

  // Chargement initial du dashboard et rafraîchissement périodique
  useEffect(() => {
    if (phaseView === 'dashboard') {
      void loadDailyDashboardData();
    }
  }, [phaseView, loadDailyDashboardData]);

  useEffect(() => {
    if (phaseView === 'rapports') {
      void loadAccountingReports();
    }
  }, [phaseView, loadAccountingReports]);

  // Rafraîchissement du dashboard après validation d'une réception
  useEffect(() => {
    const handleRefresh = () => {
      if (phaseView === 'dashboard') {
        void loadDailyDashboardData();
      }
    };
    // Écouter l'événement de rafraîchissement
    window.addEventListener('agency-cash-refresh', handleRefresh);
    return () => {
      window.removeEventListener('agency-cash-refresh', handleRefresh);
    };
  }, [phaseView, loadDailyDashboardData]);

  /* ============================================================================
     SECTION : RÉCONCILIATION - MISE À JOUR APRÈS CHANGEMENT DE TAB
     ============================================================================ */
  
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

  const activePhaseMeta =
    ACCOUNTANT_PHASE_NAV.find((item) => item.key === phaseView) ?? ACCOUNTANT_PHASE_NAV[0];

  /* ============================================================================
     SECTION : RENDU PRINCIPAL
     Description : Interface utilisateur de la page de comptabilité
     ============================================================================ */
  
  return (
    <div
      className={`accountant-workspace min-h-screen min-w-0 w-full overflow-x-hidden ${darkMode ? 'agency-dark' : ''}`}
      style={comptaRootChromeStyle}
    >
      {/* ============================================================================
         HEADER : EN-TÊTE AVEC BRANDING ET NAVIGATION
         Description : Logo, nom d'entreprise, onglets et informations comptable
         ============================================================================ */}
      
      <div className="fixed inset-x-0 top-0 z-40 shadow-sm print:static">
        <div
          className="h-16 border-b border-gray-200/60"
          style={{ backgroundImage: 'var(--agency-gradient-header)' }}
        >
          <div className="min-w-0 h-full px-3 sm:px-6 lg:px-8 flex items-center justify-between gap-2 sm:gap-3">
            <div className="flex items-center gap-2 sm:gap-3 min-w-0">
              <button
                type="button"
                onClick={() => setMobileNavOpen(true)}
                className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-gray-200 bg-white text-gray-700 shadow-sm transition-colors hover:bg-gray-50 lg:hidden"
                aria-label="Ouvrir le menu comptable"
              >
                <Menu className="h-5 w-5" />
              </button>
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
              <button
                type="button"
                onClick={toggleDarkMode}
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 bg-white text-sm text-gray-700 transition-colors hover:bg-gray-50 sm:h-9 sm:w-9"
                title={darkMode ? 'Mode jour' : 'Mode nuit'}
              >
                <span aria-hidden>{darkMode ? '☀️' : '🌙'}</span>
              </button>
            </div>
          </div>
        </div>

        {false && tab !== 'ventes' && (
          <div
            className="border-b border-gray-200/60"
            style={{ backgroundImage: 'var(--agency-gradient-subheader)' }}
          >
            <div className="max-w-7xl mx-auto min-w-0 px-4 sm:px-6 py-2">
              <div className="flex min-w-0 gap-2 overflow-x-auto whitespace-nowrap pb-1 [-webkit-overflow-scrolling:touch]">
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
              </div>
            </div>
          </div>
        )}
      </div>

      <AccountantPhaseSidebar
        activeView={phaseView}
        onChange={setPhaseView}
        theme={theme}
        pendingPostsCount={pendingShifts.length + pendingCourierSessions.length}
        pendingReceiptsCount={receptionsPendingTotal}
        variant="desktop"
        userName={accountant?.displayName || accountant?.email || user?.email || 'Utilisateur'}
        userRoleLabel={accountantCode || 'Comptable'}
        onLogout={async () => {
          console.log('[AgenceCompta] Déconnexion du comptable');
          await logout();
          navigate('/login');
        }}
      />

      {mobileNavOpen && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true">
          <button
            type="button"
            className="absolute inset-0 bg-slate-950/40"
            aria-label="Fermer le menu comptable"
            onClick={() => setMobileNavOpen(false)}
          />
          <AccountantPhaseSidebar
            activeView={phaseView}
            onChange={setPhaseView}
            theme={theme}
            pendingPostsCount={pendingShifts.length + pendingCourierSessions.length}
            pendingReceiptsCount={receptionsPendingTotal}
            variant="mobile"
            onClose={() => setMobileNavOpen(false)}
            userName={accountant?.displayName || accountant?.email || user?.email || 'Utilisateur'}
            userRoleLabel={accountantCode || 'Comptable'}
            onLogout={async () => {
              console.log('[AgenceCompta] Déconnexion du comptable');
              await logout();
              navigate('/login');
            }}
          />
        </div>
      )}

      {/* ============================================================================
         CONTENU PRINCIPAL
         Description : Contenu des différents onglets
         ============================================================================ */}
      
      <div className="min-w-0 pt-16 lg:pl-72">
        <main className="min-w-0 px-3 py-5 sm:px-6 lg:px-8">
          <div className="mx-auto min-w-0 max-w-[1600px] space-y-6">
            <div className="min-w-0 rounded-2xl border border-slate-200 bg-white px-4 py-4 shadow-sm sm:px-5">
              <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                <div className="min-w-0">
                  <h1 className="break-words text-2xl font-bold tracking-normal text-slate-950 sm:text-3xl">
                    {activePhaseMeta.title}
                  </h1>
                  <p className="mt-1 text-sm text-slate-600">
                    {activePhaseMeta.subtitle}
                  </p>
                </div>
                <StatusBadge status="neutral">{activePhaseMeta.label}</StatusBadge>
              </div>
            </div>
        {userRole === 'agency_accountant' &&
          allowedTabs.includes('versements') &&
          receptionsPendingTotal > 0 &&
          tab !== 'versements' &&
          tab !== 'ventes' && (
            <div className="mb-4 flex flex-col gap-3 rounded-xl border border-amber-200 bg-amber-50/90 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex min-w-0 items-start gap-3">
                <Bell className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" aria-hidden />
                <div className="min-w-0 text-sm text-amber-950">
                  <div className="font-semibold">Réceptions à valider</div>
                  <p className="mt-0.5 text-amber-900/90">
                    {receptionsPendingTotal} réception
                    {receptionsPendingTotal > 1 ? 's' : ''} en attente
                    {receptionsBilletteriePendingCount > 0 && closedCourierSessions.length > 0
                      ? ' (billetterie et courrier)'
                      : receptionsBilletteriePendingCount > 0
                        ? ' (billetterie)'
                        : closedCourierSessions.length > 0
                          ? ' (courrier)'
                          : ''}
                    . Ouvrez la section <strong>Réceptions</strong>.
                  </p>
                </div>
              </div>
              <ActionButton
                type="button"
                className="w-full shrink-0 sm:w-auto"
                onClick={() => setPhaseView('receptions')}
              >
                Ouvrir Réceptions
              </ActionButton>
            </div>
          )}

        {/* ============================================================================
           ONGLET : VENTES — activité du jour, postes, rapports, courrier
           ============================================================================ */}
        
        {phaseView === 'dashboard' && (
          <AccountantControlLayout>
            <AccountantKpiCards
              activeShiftsCount={activeShifts.length + activeCourierSessions.length}
              pendingPostsCount={pendingShifts.length + pendingCourierSessions.length}
              pendingReceiptsCount={receptionsPendingTotal}
              dayCashIn={dailyCashData.totalCashIn}
              agencyStatsToday={agencyStatsToday}
              money={money}
              theme={theme}
              onNavigate={(target) => setPhaseView(target)}
            />

            
                {/* BLOC RÉSUMÉ CAISSE JOURNALIER - COMPTABLE UNIQUEMENT */}
    <SectionCard 
      title="Résumé caisse du jour" 
      icon={BarChart3}
      right={
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <span>📅 {dailyCashData.date ? new Date(dailyCashData.date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }) : 'Aujourd\'hui'}</span>
          {loadingDailyDashboard && <RefreshCw className="h-4 w-4 animate-spin" />}
        </div>
      }
    >
      <div className="mb-4 rounded-lg border border-blue-100 bg-blue-50 px-4 py-2 text-sm text-blue-800">
        <span className="font-medium">ℹ️ Ce résumé affiche uniquement les montants validés par le comptable aujourd'hui.</span>
      </div>
      {loadingDailyDashboard ? (
        <div className="flex items-center justify-center py-8">
          <div className="text-center">
            <RefreshCw className="h-8 w-8 animate-spin mx-auto mb-2 text-gray-400" />
            <div className="text-sm text-gray-500">Chargement des données du jour...</div>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <MetricCard
            label="Encaissements validés du jour"
            value={money(dailyCashData.totalCashIn)}
            icon={Wallet}
            valueColorVar={theme?.primary}
            hint="Total des encaissements validés comptablement aujourd'hui"
          />
          <MetricCard
            label="Sorties du jour"
            value={money(dailyCashData.totalCashOut)}
            icon={AlertTriangle}
            valueColorVar="#b91c1c"
            hint="Dépenses et sorties de caisse aujourd'hui"
          />
          <MetricCard
            label="Solde net du jour"
            value={money(dailyCashData.netCash)}
            icon={TrendingUp}
            valueColorVar={dailyCashData.netCash >= 0 ? theme?.primary : '#b91c1c'}
            hint="Encaissements validés - Sorties du jour"
          />
        </div>
      )}
    </SectionCard>

            {(pendingShifts.length + pendingCourierSessions.length > 0 || receptionsPendingTotal > 0) && (
              <SectionCard title="Alertes prioritaires" icon={Bell}>
                <div className="grid min-w-0 grid-cols-1 gap-3 md:grid-cols-2">
                  {pendingShifts.length + pendingCourierSessions.length > 0 ? (
                    <button
                      type="button"
                      onClick={() => setPhaseView('postes')}
                      className="min-w-0 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-left transition hover:bg-amber-100/70"
                    >
                      <div className="text-sm font-semibold text-amber-950">Postes à activer</div>
                      <div className="mt-1 text-sm text-amber-800">
                        {pendingShifts.length + pendingCourierSessions.length} poste
                        {pendingShifts.length + pendingCourierSessions.length > 1 ? 's' : ''} en attente.
                      </div>
                    </button>
                  ) : null}
                  {receptionsPendingTotal > 0 ? (
                    <button
                      type="button"
                      onClick={() => setPhaseView('receptions')}
                      className="min-w-0 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-left transition hover:bg-rose-100/70"
                    >
                      <div className="text-sm font-semibold text-rose-950">Réceptions à valider</div>
                      <div className="mt-1 text-sm text-rose-800">
                        {receptionsPendingTotal} réception{receptionsPendingTotal > 1 ? 's' : ''} en attente.
                      </div>
                    </button>
                  ) : null}
                </div>
              </SectionCard>
            )}
          </AccountantControlLayout>
        )}

        {phaseView === 'postes' && (
          <div className="space-y-6">
            <ActivePostsPanel
              activeShifts={activeShifts}
              pendingShifts={pendingShifts}
              pausedShifts={pausedShifts}
              usersCache={usersCache}
              liveStats={liveStats}
              theme={theme}
              renderPendingAction={(s) => (
                <ActionButton onClick={() => activateShift(s.id)}>
                  <Play className="h-4 w-4 mr-2" />
                  Activer le poste
                </ActionButton>
              )}
              renderPausedAction={(s) => (
                <ActionButton onClick={() => continueShift(s.id)}>
                  <Play className="h-4 w-4 mr-2" />
                  Continuer
                </ActionButton>
              )}
            />

            <SectionCard
              title="Service courrier actif"
              icon={Package}
              right={
                <StatusBadge status="neutral">
                  {activeCourierSessions.length} poste{activeCourierSessions.length > 1 ? 's' : ''}
                </StatusBadge>
              }
            >
              {activeCourierSessions.length === 0 ? (
                <UIEmptyState message="Aucun poste courrier actif." />
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                  {activeCourierSessions.map((s) => (
                    <CourierComptaSessionCard
                      key={s.id}
                      session={s}
                      theme={theme}
                      usersCache={usersCache}
                      stats={courierSessionStats[s.id] ?? { total: 0, paid: 0, paidAmount: 0 }}
                      ledgerAmount={courierSessionStats[s.id]?.paidAmount}
                      statusLabel="En service"
                      startField={s.openedAt ?? s.createdAt}
                      endField={null}
                    />
                  ))}
                </div>
              )}
            </SectionCard>

            <SectionCard
              title="Demandes d'ouverture"
              icon={Clock4}
              right={
                <StatusBadge status="neutral">
                  {pendingShifts.length + pendingCourierSessions.length} demande{pendingShifts.length + pendingCourierSessions.length > 1 ? 's' : ''}
                </StatusBadge>
              }
            >
              {pendingShifts.length === 0 && pendingCourierSessions.length === 0 ? (
                <UIEmptyState message="Aucune demande d'ouverture en attente." />
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                  {pendingCourierSessions.map((s) => (
                    <CourierComptaSessionCard
                      key={s.id}
                      session={s}
                      theme={theme}
                      usersCache={usersCache}
                      stats={courierSessionStats[s.id] ?? { total: 0, paid: 0, paidAmount: 0 }}
                      ledgerAmount={courierSessionStats[s.id]?.paidAmount}
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
              )}
            </SectionCard>
          </div>
        )}

        {phaseView === 'rapports' && (
          <div className="hidden">
            <div className="accountant-night-surface rounded-xl border border-gray-200 shadow-sm p-4 sm:p-5 bg-gradient-to-r from-white to-gray-50/50">
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
                        s.status === 'validated_agency' ? 'Validé comptable' :
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
                            if (reportFilter === 'guichet') return t.channel === 'guichet';
                            if (reportFilter === 'en_ligne') return t.channel === 'en_ligne';
                            return true;
                          })
                          .map((t, index) => {
                            const canalColor = t.channel === 'en_ligne'
                              ? 'bg-indigo-100 text-indigo-700'
                              : t.channel === 'guichet'
                                ? 'bg-emerald-100 text-emerald-700'
                                : 'bg-gray-100 text-gray-700';
                            const canalLabel = t.channel === 'en_ligne'
                              ? 'En ligne'
                              : t.channel === 'guichet'
                                ? 'Billetterie'
                                : 'Inconnu';
                              
                            const encaissementText = t.encaissement === 'agence' ? 'Caisse agence' : 'Compte compagnie';
                            const encaissementColor = t.encaissement === 'agence' 
                              ? 'bg-blue-100 text-blue-700' 
                              : 'bg-purple-100 text-purple-700';
                              
                            return (
                              <tr key={t.id} className={`hover:bg-gray-50/50 ${index % 2 === 0 ? 'bg-white' : 'bg-gray-50/30'}`}>
                                <Td>
                                  <div className="font-medium">{fmtD(t.date)}</div>
                                  <div className="text-xs text-gray-500">{t.time}</div>
                                </Td>
                                <Td>
                                  <div className="flex flex-col gap-1">
                                    <span className={`text-xs px-2 py-1 rounded-full ${canalColor} font-medium`}>
                                      {canalLabel}
                                    </span>
                                    <span className={`text-xs px-2 py-0.5 rounded-full ${encaissementColor}`}>
                                      {encaissementText}
                                    </span>
                                  </div>
                                </Td>
                                <Td>
                                  <div className="font-medium">{t.departure} → {t.arrival}</div>
                                </Td>
                                <Td>
                                  <div className="font-medium">{t.customerName}</div>
                                  {t.customerPhone && <div className="text-xs text-gray-500">{t.customerPhone}</div>}
                                </Td>
                                <Td align="right">
                                  <span className="font-medium">{(t.seatsGo||0)+(t.seatsReturn||0)}</span>
                                </Td>
                                <Td align="right">
                                  <span className="font-bold text-gray-900">{money(t.amount)}</span>
                                </Td>
                                <Td align="right">
                                  <span className="text-xs text-gray-600">{t.paymentMethod || '—'}</span>
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
                      stats={courierSessionStats[s.id] ?? { total: 0, paid: 0, paidAmount: 0 }}
                      ledgerAmount={courierSessionStats[s.id]?.paidAmount}
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
                      stats={courierSessionStats[s.id] ?? { total: 0, paid: 0, paidAmount: 0 }}
                      ledgerAmount={courierSessionStats[s.id]?.paidAmount}
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
                    const paidAmount = courierSessionStats[selectedCourierSessionForReport]?.paidAmount;
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
        
        {phaseView === 'receptions' && (
          <div className="space-y-6">
            {receptionsPendingTotal > 0 && (
              <div className="rounded-xl border border-amber-200 bg-amber-50/85 px-4 py-3 text-sm text-amber-950">
                <span className="font-semibold">À traiter : </span>
                {receptionsBilletteriePendingCount > 0 ? (
                  <span>
                    {receptionsBilletteriePendingCount} réception
                    {receptionsBilletteriePendingCount > 1 ? 's' : ''} billetterie
                  </span>
                ) : null}
                {receptionsBilletteriePendingCount > 0 && closedCourierSessions.length > 0 ? (
                  <span className="text-amber-800/80"> · </span>
                ) : null}
                {closedCourierSessions.length > 0 ? (
                  <span>
                    {closedCourierSessions.length} réception courrier
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
                    <SectionCard title="Réceptions à valider" icon={HandIcon}>
                      <UIEmptyState message="Aucune réception à valider." />
                    </SectionCard>
                  ) : null}

                  {hasBilletterieReception ? (
            <SectionCard title="Réceptions billetterie">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
                  {toReceive.map(s => {
                    const payBy = s.payBy || {};
                    const inputs = receptionInputs[s.id] || { cashReceived: '' };

                    const agg = aggByShift[s.id];
                    const reservationsAgg = agg?.reservations ?? s.totalReservations ?? 0;
                    const ticketsAgg = agg?.tickets ?? s.totalTickets ?? 0;
                    const amountAgg = agg?.amount ?? s.totalAmount ?? 0;
                    const expectedCash = s.expectedAmount ?? s.totalCash ?? agg?.cashExpected ?? (payBy['espèces'] ?? s.cashExpected ?? 0);
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
                        <div className="accountant-night-card absolute inset-0 bg-gradient-to-br from-white to-gray-50 rounded-xl transform group-hover:scale-[1.02] transition-all duration-300"></div>
                        <div className="accountant-night-card relative rounded-xl border border-gray-200 bg-white/80 p-4 shadow-sm transition-all duration-300 hover:shadow-md sm:p-5">
                          {/* En-tête du poste */}
                          <div className="flex items-start justify-between gap-3 mb-4">
                            <div className="min-w-0">
                              <div className="text-xs font-medium text-gray-500 uppercase tracking-wider">Agent</div>
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
                            <InfoCard label="Service" value="Service billetterie" />
                            <InfoCard label="Montant attendu" value={money(cashExpectedAgg)} emphasis />
                          </div>

                          {/* Période */}
                          <div className="accountant-night-card-detail mb-4 p-3 rounded-xl bg-gradient-to-r from-gray-50 to-gray-100/50">
                              <div className="text-xs text-gray-600 mb-1">Période</div>
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
                                Montant versé <span className="text-red-500">*</span>
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

                            <div className={`accountant-night-status-panel p-3 rounded-xl border ${hasDifference ? 'ring-2 ring-red-400' : ''}`} style={{
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
                              onClick={() => { setPhaseView('rapports'); loadReportForShift(s.id); }}
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
                              {savingShiftIds[s.id] ? 'Validation...' : 'Valider'}
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
              title="Réceptions courrier"
              icon={StopCircle}
              right={
                <StatusBadge status="neutral">
                  {closedCourierSessions.length} session{closedCourierSessions.length > 1 ? 's' : ''}
                </StatusBadge>
              }
            >
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {closedCourierSessions.map((s) => {
                    const input = receptionInputsCourier[s.id] || { countedAmount: '' };
                    const rawIn = String(input.countedAmount ?? '').trim();
                    const counted =
                      rawIn === ''
                        ? NaN
                        : Number(rawIn.replace(/[^\d.,]/g, '').replace(',', '.'));
                    const stats = courierSessionStats[s.id] ?? { total: 0, paid: 0, paidAmount: 0 };
                    const paidAmount = Number(stats.paidAmount ?? 0);
                    const ledger = Number(courierLedgerBySessionId[s.id] ?? 0);
                    const sessionExpected = Number(s.expectedAmount ?? 0);
                    const expectedAmount = paidAmount > 0 ? paidAmount : ledger > 0 ? ledger : sessionExpected;
                    const ecart = Number.isFinite(counted) ? counted - expectedAmount : NaN;
                    const disableCourierValidate =
                      rawIn === '' || !Number.isFinite(counted) || counted < 0 || !!savingCourierSessionIds[s.id];
                    return (
                      <CourierComptaSessionCard
                        key={s.id}
                        session={s}
                        theme={theme}
                        usersCache={usersCache}
                        stats={stats}
                        ledgerAmount={expectedAmount}
                        statusLabel="Clôturé"
                        startField={s.openedAt ?? s.createdAt}
                        endField={s.closedAt}
                        afterAmountBlock={
                          <div className="space-y-3 mb-4">
                            <InfoCard
                              label="Écart"
                              value={Number.isFinite(ecart) ? money(ecart) : '—'}
                            />
                            <div>
                              <label className="block text-xs font-medium text-gray-700 mb-2">
                                Montant versé <span className="text-red-500">*</span>
                              </label>
                              <input
                                type="text"
                                inputMode="decimal"
                                className="w-full border border-gray-300 rounded-lg px-3 py-2"
                                placeholder="Obligatoire"
                                value={input.countedAmount}
                                onChange={(e) => setReceptionInputCourier(s.id, e.target.value)}
                              />
                            </div>
                          </div>
                        }
                        footer={
                          <ActionButton
                            disabled={disableCourierValidate}
                            onClick={() => validateCourierSessionAction(s)}
                          >
                            <CheckCircle2 className="h-4 w-4 mr-2" />
                            {savingCourierSessionIds[s.id] ? 'Validation...' : 'Valider'}
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

            {/* Postes validés par le comptable agence (en attente validation chef) */}
            {(validatedAgencyShifts.length > 0 || courierValidatedAgencySessions.length > 0) && (
              <SectionCard
                title="Validé comptable (en attente validation chef)"
                help="Sessions validées par le comptable agence ; le chef d’agence finalise le contrôle."
              >
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {validatedAgencyShifts.map((s) => {
                    const ui = usersCache[s.userId] || {};
                    const name = ui.name || s.userName || s.userEmail || s.userId;
                    const code = ui.code || s.userCode || 'GUEST';
                    const amount = aggByShift[s.id]?.amount ?? s.expectedAmount ?? s.totalAmount ?? s.totalRevenue ?? 0;
                    return (
                      <div key={s.id} className="rounded-xl border border-teal-200 bg-teal-50/30 p-4">
                        <div className="font-semibold text-gray-900">{name} <span className="text-gray-500 text-sm">({code})</span></div>
                        <div className="text-sm text-gray-600 mt-1">
                          {s.startTime ? new Date(s.startTime.toDate?.() ?? s.startTime).toLocaleString('fr-FR') : '—'} → {s.endTime ? new Date(s.endTime.toDate?.() ?? s.endTime).toLocaleString('fr-FR') : '—'}
                        </div>
                        <div className="mt-2 text-lg font-bold" style={{ color: theme?.primary }}>{money(amount)}</div>
                        <div className="mt-2 text-xs text-teal-700">Billetterie · Validé comptable · En attente chef d&apos;agence</div>
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
                        <div className="mt-2 text-xs text-violet-800">Courrier · Validé comptable · En attente chef d&apos;agence</div>
                      </div>
                    );
                  })}
                </div>
              </SectionCard>
            )}
          </div>
        )}

        {phaseView === 'historique' && (
          <AgencyCashStatement initialRange={cashStatementInitialRange} />
        )}

        {/* ============================================================================
           ONGLET : CONTRÔLE — caisse réelle vs solde attendu
           ============================================================================ */}
        {false && tab === 'audit' && (
          <AccountantControlLayout>
            <div className="text-sm text-gray-700">
              Commencez par vérifier l’écart, puis validez la caisse.
            </div>
            {/* ============================================================================
               SECTION 1 : RÉSUMÉ AUTOMATIQUE (ventes vs caisse)
               ============================================================================ */}
            <div className="accountant-night-surface rounded-xl border border-gray-200 shadow-sm p-4 sm:p-5 bg-gradient-to-r from-white to-gray-50/50">
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

            <div className="accountant-night-surface rounded-xl border border-gray-200 p-4 shadow-sm sm:p-5 bg-gradient-to-r from-white to-slate-50/50">
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
                <div className="accountant-night-card space-y-4 rounded-lg border border-gray-200 bg-white p-4">
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

                <div className="accountant-night-card rounded-lg border border-gray-200 bg-white p-4 min-h-[200px]">
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
          </AccountantControlLayout>
        )}

        {/* ============================================================================
           ONGLET : CAISSE AGENCE
           Description : Gestion des mouvements financiers de l'agence
           ============================================================================ */}
        
        {phaseView === 'caisse' && (
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
            <div className="accountant-night-surface rounded-xl border border-gray-200 shadow-sm p-4 sm:p-5 bg-gradient-to-r from-white to-gray-50/50">
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
                      {/* ✅ NOUVEAU : Bouton Payables */}
                      <ActionButton
                        variant="secondary"
                        onClick={() => setTreasuryModalView('payables')}
                        className="whitespace-nowrap"
                      >
                        <CreditCard className="h-4 w-4 mr-2" />
                        Payables
                      </ActionButton>
                    </>
                  )}
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
                  
                  <ActionButton variant="secondary" onClick={() => void reloadCash(true)} disabled={loadingCash}>
                    {loadingCash ? 'Actualisation...' : 'Actualiser'}
                  </ActionButton>
                </div>
              </div>
            </div>

            {/* ===== SECTION CARTES KPI — CAISSE (CORRIGÉE) ===== */}
            {(() => {
              const summary = cashDashboardSummary;

              return (
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 sm:gap-6">
                  <MetricCard
                    label="Fonds reçus période"
                    value={
                      loadingCash
                        ? '…'
                        : ledgerPeriodError
                          ? 'Indisponible'
                          : money(summary?.totalEntries ?? 0)
                    }
                    icon={HandIcon}
                    valueColorVar={theme?.primary}
                    hint="Même calcul que le relevé Historique"
                  />
                  <MetricCard
                    label="Sorties période"
                    value={
                      loadingCash
                        ? '…'
                        : ledgerPeriodError
                          ? 'Indisponible'
                          : money(summary?.totalExits ?? 0)
                    }
                    icon={AlertTriangle}
                    valueColorVar="#b91c1c"
                    hint="Même calcul que le relevé Historique"
                  />
                  <MetricCard
                    label="Net période"
                    value={
                      loadingCash
                        ? '…'
                        : ledgerPeriodError
                          ? 'Indisponible'
                          : money(summary?.net ?? 0)
                    }
                    icon={TrendingUp}
                    valueColorVar={theme?.primary}
                    hint="Entrées - sorties, même calcul que le relevé Historique"
                  />
                  <MetricCard
                    label="Solde caisse actuel"
                    value={
                      summary == null
                        ? loadingCash
                          ? '…'
                          : 'Indisponible'
                        : money(summary.currentBalance)
                    }
                    icon={Banknote}
                    valueColorVar={theme?.primary}
                    hint="Solde actuel lu depuis le même relevé"
                  />
                </div>
              );
            })()}

            {ledgerPeriodError && (
              <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-900">
                {ledgerPeriodError} Consultez l’onglet Historique pour le relevé détaillé si le problème persiste.
              </div>
            )}

            {(cashDashboardSummary?.transactionsCapped || cashDashboardSummary?.legacyCapped) && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                Flux période : historique tronqué (limite d’affichage) — entrées / sorties période peuvent être sous-estimées.
              </div>
            )}

            <SectionCard
              title="Derniers mouvements"
              icon={ArrowDownCircle}
              right={
                <ActionButton
                  variant="secondary"
                  onClick={() => {
                    setCashStatementInitialRange({ from: currentRange.from, to: currentRange.to });
                    setPhaseView('historique');
                  }}
                  className="whitespace-nowrap"
                >
                  Voir le relevé complet
                </ActionButton>
              }
            >
              {loadingCash ? (
                <div className="py-8 text-center text-sm text-gray-500">Chargement des derniers mouvements…</div>
              ) : ledgerPeriodError ? (
                <UIEmptyState message="Derniers mouvements indisponibles pour le moment." />
              ) : !cashDashboardSummary || cashDashboardSummary.rows.length === 0 ? (
                <UIEmptyState message="Aucun mouvement sur la période sélectionnée." />
              ) : (
                <div className="overflow-x-auto rounded-xl border border-slate-200">
                  <table className="min-w-full divide-y divide-slate-200 text-sm">
                    <thead className="bg-slate-50">
                      <tr>
                        <Th>Date</Th>
                        <Th>Type</Th>
                        <Th>Libellé</Th>
                        <Th align="right">Entrée</Th>
                        <Th align="right">Sortie</Th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 bg-white">
                      {cashDashboardSummary.rows.slice(0, 10).map((row) => (
                        <tr key={row.id} className="hover:bg-slate-50/80">
                          <Td>{fmtDT(row.date)}</Td>
                          <Td>{row.typeLabel}</Td>
                          <Td>{row.label}</Td>
                          <Td align="right">
                            {row.entry ? (
                              <span className="font-semibold text-emerald-700">+ {money(row.entry)}</span>
                            ) : (
                              <span className="text-slate-400">—</span>
                            )}
                          </Td>
                          <Td align="right">
                            {row.exit ? (
                              <span className="font-semibold text-rose-700">− {money(row.exit)}</span>
                            ) : (
                              <span className="text-slate-400">—</span>
                            )}
                          </Td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </SectionCard>
          </div>
        )}

        {/* ============================================================================
           ONGLET : COMPARAISON ventes (billets) et caisse guichet
           ============================================================================ */}
        
        {phaseView === 'rapports' && (
          <div className="space-y-6 print:space-y-4">
            <div className="accountant-night-surface rounded-2xl border border-gray-200 bg-white p-5 shadow-sm print:border-gray-300 print:shadow-none">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="flex min-w-0 items-start gap-4">
                  {companyLogo ? (
                    <img src={companyLogo} alt={companyName} className="h-12 w-12 rounded-xl object-contain" />
                  ) : (
                    <div className="grid h-12 w-12 place-items-center rounded-xl bg-slate-100 text-slate-700">
                      <FileText className="h-6 w-6" />
                    </div>
                  )}
                  <div className="min-w-0">
                    <div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Synthèse comptable</div>
                    <h2 className="mt-1 text-2xl font-bold text-slate-950">Rapports</h2>
                    <p className="mt-1 text-sm text-slate-600">
                      Bilan imprimable de la période — sans relevé détaillé. Le relevé complet reste dans Historique.
                    </p>
                    <div className="mt-3 grid gap-1 text-sm text-slate-600 sm:grid-cols-3">
                      <span><strong className="text-slate-900">Compagnie :</strong> {companyName}</span>
                      <span><strong className="text-slate-900">Agence :</strong> {agencyName}</span>
                      <span><strong className="text-slate-900">Comptable :</strong> {accountant?.displayName || accountant?.email || user?.email || accountantCode}</span>
                    </div>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2 print:hidden">
                  <ActionButton variant="secondary" onClick={() => loadAccountingReports(true)} disabled={loadingAccountingReports}>
                    <RefreshCw className="mr-2 h-4 w-4" />
                    {loadingAccountingReports ? 'Chargement…' : 'Actualiser'}
                  </ActionButton>
                  <ActionButton variant="secondary" onClick={exportAccountingReportsCsv} disabled={!reportDailySummary || !reportPeriodSummary}>
                    <Download className="mr-2 h-4 w-4" />
                    Export CSV
                  </ActionButton>
                  <ActionButton onClick={() => window.print()} disabled={!reportDailySummary || !reportPeriodSummary}>
                    <Printer className="mr-2 h-4 w-4" />
                    Imprimer
                  </ActionButton>
                </div>
              </div>
            </div>

            {accountingReportsError && (
              <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
                {accountingReportsError}
              </div>
            )}

            <SectionCard
              title="Rapport journalier"
              icon={FileText}
              help="Synthèse du jour, calculée depuis la même source que Finances et Historique."
            >
              {loadingAccountingReports && !reportDailySummary ? (
                <div className="py-10 text-center text-sm text-slate-500">Chargement du rapport journalier…</div>
              ) : !reportDailySummary ? (
                <UIEmptyState message="Aucune synthèse journalière disponible." />
              ) : (
                <div className="space-y-5">
                  <div className="grid gap-3 text-sm text-slate-600 sm:grid-cols-3">
                    <div><span className="font-semibold text-slate-900">Date :</span> {new Date().toLocaleDateString('fr-FR')}</div>
                    <div><span className="font-semibold text-slate-900">Agence :</span> {agencyName}</div>
                    <div><span className="font-semibold text-slate-900">Comptable :</span> {accountant?.displayName || accountant?.email || user?.email || accountantCode}</div>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    <MetricCard label="Total des entrées" value={money(reportDailySummary.totalEntries)} icon={ArrowDownCircle} valueColorVar={theme.primary} />
                    <MetricCard label="Total des sorties" value={money(reportDailySummary.totalExits)} icon={TrendingUp} valueColorVar="#b91c1c" />
                    <MetricCard label="Net de la journée" value={money(reportDailySummary.net)} icon={Scale} valueColorVar={reportDailySummary.net >= 0 ? theme.primary : '#b91c1c'} />
                    <MetricCard label="Solde caisse actuel" value={money(reportDailySummary.currentBalance)} icon={Wallet} valueColorVar={theme.primary} />
                  </div>

                  <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
                    <div className="mb-3 text-sm font-bold uppercase tracking-wide text-slate-700">Résumé</div>
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                      <div className="rounded-xl bg-white p-4 shadow-sm">
                        <div className="text-xs text-slate-500">Billetterie</div>
                        <div className="mt-1 text-lg font-bold text-slate-950">{money(reportDailyBreakdown.billetterie)}</div>
                      </div>
                      <div className="rounded-xl bg-white p-4 shadow-sm">
                        <div className="text-xs text-slate-500">Courrier</div>
                        <div className="mt-1 text-lg font-bold text-slate-950">{money(reportDailyBreakdown.courrier)}</div>
                      </div>
                      <div className="rounded-xl bg-white p-4 shadow-sm">
                        <div className="text-xs text-slate-500">Dépenses</div>
                        <div className="mt-1 text-lg font-bold text-rose-700">{money(reportDailyBreakdown.depenses)}</div>
                      </div>
                      <div className="rounded-xl bg-white p-4 shadow-sm">
                        <div className="text-xs text-slate-500">Versements compagnie</div>
                        <div className="mt-1 text-lg font-bold text-rose-700">{money(reportDailyBreakdown.versementsCompagnie)}</div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </SectionCard>

            <SectionCard
              title="Rapport de période"
              icon={BarChart3}
              help="Vue agrégée : les lignes détaillées restent uniquement dans Historique."
              right={
                <div className="flex flex-wrap items-center gap-2 print:hidden">
                  {[
                    ['today', 'Aujourd’hui'],
                    ['7d', '7 jours'],
                    ['30d', '30 jours'],
                    ['month', 'Ce mois'],
                    ['custom', 'Personnalisé'],
                  ].map(([key, label]) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setReportPeriodPreset(key as ReportPeriodPreset)}
                      className={cn(
                        'rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors',
                        reportPeriodPreset === key
                          ? 'border-transparent text-white'
                          : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                      )}
                      style={reportPeriodPreset === key ? { backgroundColor: theme.primary } : undefined}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              }
            >
              <div className="space-y-5">
                {reportPeriodPreset === 'custom' && (
                  <div className="grid gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3 sm:grid-cols-[1fr_1fr_auto] print:hidden">
                    <label className="text-sm text-slate-700">
                      <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Du</span>
                      <input
                        type="date"
                        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                        value={reportCustomFrom}
                        onChange={(e) => setReportCustomFrom(e.target.value)}
                      />
                    </label>
                    <label className="text-sm text-slate-700">
                      <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Au</span>
                      <input
                        type="date"
                        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                        value={reportCustomTo}
                        onChange={(e) => setReportCustomTo(e.target.value)}
                      />
                    </label>
                    <div className="flex items-end">
                      <ActionButton variant="secondary" onClick={() => loadAccountingReports(true)} disabled={loadingAccountingReports}>
                        Appliquer
                      </ActionButton>
                    </div>
                  </div>
                )}

                <div className="text-sm text-slate-600">
                  Période : <span className="font-semibold text-slate-900">{reportPeriodRange.from.toLocaleDateString('fr-FR')}</span>
                  {' '}→{' '}
                  <span className="font-semibold text-slate-900">{reportPeriodRange.to.toLocaleDateString('fr-FR')}</span>
                </div>

                {loadingAccountingReports && !reportPeriodSummary ? (
                  <div className="py-10 text-center text-sm text-slate-500">Chargement du rapport de période…</div>
                ) : !reportPeriodSummary ? (
                  <UIEmptyState message="Aucune synthèse de période disponible." />
                ) : (
                  <>
                    <div className="grid gap-4 lg:grid-cols-2">
                      <div className="rounded-2xl border border-emerald-100 bg-emerald-50/60 p-4">
                        <div className="mb-3 text-sm font-bold uppercase tracking-wide text-emerald-800">Entrées par type</div>
                        <div className="space-y-3">
                          <div className="flex items-center justify-between gap-3 rounded-xl bg-white p-3">
                            <span className="text-sm text-slate-600">Billetterie</span>
                            <span className="font-bold text-slate-950">{money(reportPeriodBreakdown.billetterie)}</span>
                          </div>
                          <div className="flex items-center justify-between gap-3 rounded-xl bg-white p-3">
                            <span className="text-sm text-slate-600">Courrier</span>
                            <span className="font-bold text-slate-950">{money(reportPeriodBreakdown.courrier)}</span>
                          </div>
                          <div className="flex items-center justify-between gap-3 rounded-xl bg-white p-3">
                            <span className="text-sm text-slate-600">Ajustements</span>
                            <span className="font-bold text-slate-950">{money(reportPeriodBreakdown.ajustements)}</span>
                          </div>
                        </div>
                      </div>

                      <div className="rounded-2xl border border-rose-100 bg-rose-50/60 p-4">
                        <div className="mb-3 text-sm font-bold uppercase tracking-wide text-rose-800">Sorties par type</div>
                        <div className="space-y-3">
                          <div className="flex items-center justify-between gap-3 rounded-xl bg-white p-3">
                            <span className="text-sm text-slate-600">Dépenses</span>
                            <span className="font-bold text-rose-700">{money(reportPeriodBreakdown.depenses)}</span>
                          </div>
                          <div className="flex items-center justify-between gap-3 rounded-xl bg-white p-3">
                            <span className="text-sm text-slate-600">Versements compagnie</span>
                            <span className="font-bold text-rose-700">{money(reportPeriodBreakdown.versementsCompagnie)}</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                      <MetricCard label="Total entrées" value={money(reportPeriodSummary.totalEntries)} icon={ArrowDownCircle} valueColorVar={theme.primary} />
                      <MetricCard label="Total sorties" value={money(reportPeriodSummary.totalExits)} icon={TrendingUp} valueColorVar="#b91c1c" />
                      <MetricCard label="Net période" value={money(reportPeriodSummary.net)} icon={Scale} valueColorVar={reportPeriodSummary.net >= 0 ? theme.primary : '#b91c1c'} />
                      <MetricCard label="Solde actuel" value={money(reportPeriodSummary.currentBalance)} icon={Wallet} valueColorVar={theme.primary} />
                    </div>
                  </>
                )}
              </div>
            </SectionCard>
          </div>
        )}

        {false && phaseView === 'rapports' && (
          <div className="space-y-6">
            {/* En-tête et sélecteur de date */}
            <div className="accountant-night-surface rounded-xl border border-gray-200 shadow-sm p-4 sm:p-5 bg-gradient-to-r from-white to-gray-50/50">
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
                <div className="accountant-night-card rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-2 text-xs text-slate-700">
                  <span className="font-semibold">Ventes billets (guichet + en ligne)</span> — même calcul que l&apos;activité réseau.{" "}
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
                <div className="accountant-night-surface rounded-xl border border-gray-200 bg-white p-4 shadow-sm sm:p-5">
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
                  <div className="accountant-night-card mt-6 p-4 rounded-xl bg-gradient-to-r from-gray-50 to-gray-100/50 border border-gray-200">
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

        {false && tab === 'corrections' && (
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

          </div>
          </main>
        </div>

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
                  {treasuryModalView === 'transfer' && 'Transfert'}
                  {treasuryModalView === 'new-payable' && 'Paiement fournisseur'}
                  {treasuryModalView === 'payables' && 'Payables fournisseurs'}
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
                {treasuryModalView === 'payables' && <AgencyTreasuryPayablesListPage />}
              </div>
            </div>
          </div>
        )}
    </div>
  );
};

/* ============================================================================
   SECTION : COMPOSANTS UI RÉUTILISABLES
   Description : Composants d'interface utilisateur modulaires
   ============================================================================ */

const ACCOUNTANT_PHASE_NAV: Array<{
  key: AccountantPhaseView;
  label: string;
  title: string;
  subtitle: string;
  icon: React.ReactNode;
}> = [
  {
    key: 'dashboard',
    label: 'Tableau de bord',
    title: 'Tableau de bord comptable',
    subtitle: 'Suivi des postes, réceptions et caisse de l’agence',
    icon: <BarChart3 className="h-4 w-4" />,
  },
  {
    key: 'postes',
    label: 'Postes',
    title: 'Postes',
    subtitle: 'Suivi des services billetterie et courrier',
    icon: <Play className="h-4 w-4" />,
  },
  {
    key: 'receptions',
    label: 'Réceptions',
    title: 'Réceptions',
    subtitle: 'Réceptions à valider et encaissements associés',
    icon: <HandIcon className="h-4 w-4" />,
  },
  {
    key: 'caisse',
    label: 'Finances',
    title: 'Finances',
    subtitle: 'Suivi des fonds, dépenses et mouvements de l’agence',
    icon: <Banknote className="h-4 w-4" />,
  },
  {
    key: 'historique',
    label: 'Historique',
    title: 'Historique',
    subtitle: 'Historique des mouvements de caisse',
    icon: <Clock4 className="h-4 w-4" />,
  },
  {
    key: 'rapports',
    label: 'Rapports',
    title: 'Rapports',
    subtitle: 'Synthèse comptable imprimable de la période',
    icon: <FileText className="h-4 w-4" />,
  },
];

const AccountantPhaseSidebar: React.FC<{
  activeView: AccountantPhaseView;
  onChange: (view: AccountantPhaseView) => void;
  theme: { primary: string; secondary: string };
  pendingPostsCount: number;
  pendingReceiptsCount: number;
  variant: 'desktop' | 'mobile';
  onClose?: () => void;
  userName: string;
  userRoleLabel: string;
  onLogout: () => Promise<void>;
}> = ({ activeView, onChange, theme, pendingPostsCount, pendingReceiptsCount, variant, onClose, userName, userRoleLabel, onLogout }) => (
  <aside
    className={cn(
      'accountant-night-sidebar min-w-0 bg-white shadow-xl',
      variant === 'desktop'
        ? 'fixed bottom-0 left-0 top-16 z-30 hidden w-72 border-r border-slate-200 lg:flex lg:flex-col'
        : 'absolute left-0 top-0 h-full w-[min(20rem,86vw)] border-r border-slate-200'
    )}
  >
    <nav className="flex min-h-0 flex-1 flex-col p-3">
      <div className="flex items-center justify-between gap-3 px-3 py-3">
        <div className="min-w-0">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Navigation</div>
          <div className="truncate text-sm font-bold text-slate-950">Comptable agence</div>
        </div>
        {variant === 'mobile' ? (
          <button
            type="button"
            onClick={onClose}
            className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-slate-200 text-slate-600"
            aria-label="Fermer le menu comptable"
          >
            <X className="h-4 w-4" />
          </button>
        ) : null}
      </div>
      <div className="mt-2 flex min-w-0 flex-1 flex-col gap-1 overflow-y-auto">
        {ACCOUNTANT_PHASE_NAV.map((item) => {
          const active = item.key === activeView;
          const count =
            item.key === 'postes'
              ? pendingPostsCount
              : item.key === 'receptions'
                ? pendingReceiptsCount
                : 0;
          return (
            <button
              key={item.key}
              type="button"
              onClick={() => {
                onChange(item.key);
                onClose?.();
              }}
              className={cn(
                'flex w-full min-w-0 items-center gap-3 rounded-xl border px-3 py-2.5 text-left text-sm font-medium transition-colors',
                active
                  ? 'border-transparent text-slate-950 shadow-sm'
                  : 'border-transparent text-slate-600 hover:border-slate-200 hover:bg-slate-50 hover:text-slate-950'
              )}
              style={active ? { backgroundColor: theme.secondary, borderColor: `${theme.primary}66` } : undefined}
            >
              <span className="shrink-0" style={active ? { color: theme.primary } : undefined}>
                {item.icon}
              </span>
              <span className="min-w-0 truncate">{item.label}</span>
              {count > 0 ? (
                <span className="ml-auto shrink-0 rounded-full bg-red-500 px-1.5 py-0.5 text-[10px] font-bold leading-none text-white">
                  {count > 99 ? '99+' : count}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
      <div className="mt-4 border-t border-slate-200 pt-4">
        <div className="accountant-night-user flex min-w-0 items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-3">
          <div
            className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-sm font-bold text-white"
            style={{ backgroundColor: theme.primary }}
          >
            {(userName || 'U').charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold text-slate-950">{userName}</div>
            <div className="truncate text-xs text-slate-500">{userRoleLabel}</div>
          </div>
          <button
            type="button"
            onClick={onLogout}
            className="accountant-night-logout grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-slate-200 bg-white text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-950"
            aria-label="Déconnexion"
            title="Déconnexion"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </nav>
  </aside>
);

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


export default AgenceComptabilitePage;
