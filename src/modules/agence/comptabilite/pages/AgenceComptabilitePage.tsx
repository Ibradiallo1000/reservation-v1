// src/pages/AgenceComptabilitePage.tsx
// Comptabilité d'agence (contrôle des postes, réceptions, rapports, caisse, réconciliation)
// ============================================================================
// RESPONSABLE : Comptable d'agence
// OBJECTIF : Contrôle financier des opérations de vente en guichet ET en ligne
// FONCTIONNALITÉS :
// 1. Contrôle des postes de vente (activation/pause/clôture)
// 2. Réception et validation des remises de caisse
// 3. Consultation des rapports détaillés (guichet + ligne)
// 4. Gestion de la caisse d'agence (entrées/sorties/soldes)
// 5. Réconciliation des ventes vs encaissements
// ============================================================================

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  addDoc, collection, doc, getDoc, getDocs, onSnapshot, orderBy, query,
  runTransaction, Timestamp, updateDoc, where, writeBatch
} from 'firebase/firestore';
import { db } from '@/firebaseConfig';
import { useAuth } from '@/contexts/AuthContext';
import { activateSession, pauseSession, continueSession, validateSessionByAccountant } from '@/modules/agence/services/sessionService';
import { activateCourierSession, validateCourierSession } from '@/modules/logistics/services/courierSessionService';
import type { CourierSession } from '@/modules/logistics/domain/courierSession.types';
import { courierSessionsRef } from '@/modules/logistics/domain/courierSessionPaths';
import { getDeviceFingerprint } from '@/utils/deviceFingerprint';
import useCompanyTheme from '@/shared/hooks/useCompanyTheme';
import {
  Activity, AlertTriangle, Banknote, Building2, CheckCircle2, Clock4,
  Download, FileText, HandIcon, LogOut, MapPin, Package, Pause, Play, Plus, StopCircle,
  Ticket, Wallet, Info as InfoIcon, Shield, Receipt, BarChart3,
  RefreshCw, TrendingUp, CreditCard, Smartphone
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Button } from '@/shared/ui/button';
import { useFormatCurrency, useCurrencySymbol } from '@/shared/currency/CurrencyContext';
import { useOnlineStatus, useAgencyDarkMode, AgencyHeaderExtras } from '@/modules/agence/shared';
import { listCompanyBanks } from '@/modules/compagnie/treasury/companyBanks';
import { recordMovement } from '@/modules/compagnie/treasury/financialMovements';
import { agencyCashAccountId, companyBankAccountId } from '@/modules/compagnie/treasury/types';
import { ensureDefaultAgencyAccounts } from '@/modules/compagnie/treasury/financialAccounts';

/* ============================================================================
   SECTION : TYPES ET INTERFACES
   Description : Définition des structures de données principales
   ============================================================================ */

type ShiftStatus = 'pending' | 'active' | 'paused' | 'closed' | 'validated';

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
  onlineAmount?: number; // NOUVEAU : montant en ligne
};

/* ============================================================================
   SECTION : TYPES CAISSE
   Description : Structures pour la gestion de la caisse d'agence
   ============================================================================ */

type CashDay = { dateISO: string; entrees: number; sorties: number; solde: number };
type MovementKind = 'depense' | 'transfert_banque';

type NewOutForm = {
  kind: MovementKind;
  montant: string;
  libelle: string;
  banque?: string;
  companyBankId?: string;
  note?: string;
};

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

/* ============================================================================
   SECTION : COMPOSANT PRINCIPAL
   Description : Page principale de comptabilité d'agence avec réconciliation
   ============================================================================ */

const AgenceComptabilitePage: React.FC = () => {
  console.log('[AgenceCompta] Initialisation de la page de comptabilité');
  
  const navigate = useNavigate();
  const { user, company, logout } = useAuth() as any;
  const theme = useCompanyTheme(company) || { primary: '#EA580C', secondary: '#F97316' };
  const money = useFormatCurrency();
  const currencySymbol = useCurrencySymbol();
  const isOnline = useOnlineStatus();
  const [darkMode, toggleDarkMode] = useAgencyDarkMode();

  /* ============================================================================
     SECTION : ÉTATS REACT - HEADER ET BRANDING
     Description : Données d'entreprise et d'agence pour l'affichage
     ============================================================================ */
  
  const [companyLogo, setCompanyLogo] = useState<string | null>(null);
  const [companyName, setCompanyName] = useState<string>('Compagnie');
  const [companyCurrency, setCompanyCurrency] = useState<string>('XOF');
  const [agencyName, setAgencyName] = useState<string>('Agence');
  const [companyBanks, setCompanyBanks] = useState<{ id: string; name: string; iban?: string | null }[]>([]);

  /* ============================================================================
     SECTION : ÉTATS REACT - NAVIGATION ET UTILISATEUR
     Description : Gestion des onglets et profil comptable
     ============================================================================ */
  
  const [tab, setTab] = useState<'controle' | 'receptions' | 'rapports' | 'caisse' | 'reconciliation' | 'courrier'>('controle');
  const [accountant, setAccountant] = useState<AccountantProfile | null>(null);
  const [accountantCode, setAccountantCode] = useState<string>('ACCOUNT');
  const [userRole, setUserRole] = useState<string>('');
  const prevCourierPendingCountRef = useRef(0);

  /* ============================================================================
     SECTION : ÉTATS REACT - SESSIONS COURRIER (séparé du Guichet)
     Description : Listes et saisies pour l'onglet Courrier uniquement
     ============================================================================ */
  type CourierSessionDoc = CourierSession & { id: string };
  const [pendingCourierSessions, setPendingCourierSessions] = useState<CourierSessionDoc[]>([]);
  const [activeCourierSessions, setActiveCourierSessions] = useState<CourierSessionDoc[]>([]);
  const [closedCourierSessions, setClosedCourierSessions] = useState<CourierSessionDoc[]>([]);
  const [validatedCourierSessions, setValidatedCourierSessions] = useState<CourierSessionDoc[]>([]);
  const [receptionInputsCourier, setReceptionInputsCourier] = useState<Record<string, { countedAmount: string }>>({});
  const [savingCourierSessionIds, setSavingCourierSessionIds] = useState<Record<string, boolean>>({});

  /* ============================================================================
     SECTION : ÉTATS REACT - POSTES DE VENTE
     Description : Liste des postes groupés par statut
     ============================================================================ */
  
  const [pendingShifts, setPendingShifts] = useState<ShiftDoc[]>([]);
  const [activeShifts, setActiveShifts] = useState<ShiftDoc[]>([]);
  const [pausedShifts, setPausedShifts] = useState<ShiftDoc[]>([]);
  const [closedShifts, setClosedShifts] = useState<ShiftDoc[]>([]);
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
  
  const [usersCache, setUsersCache] = useState<Record<string, { name?: string; email?: string; code?: string }>>({});
  const [liveStats, setLiveStats] = useState<Record<string, { reservations: number; tickets: number; amount: number }>>({});
  const liveUnsubsRef = useRef<Record<string, () => void>>({});

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
  const [totIn, setTotIn] = useState(0);
  const [totOut, setTotOut] = useState(0);
  const [loadingCash, setLoadingCash] = useState(false);

  /* ============================================================================
     SECTION : ÉTATS REACT - RÉCONCILIATION
     Description : Données pour la réconciliation des ventes vs encaissements
     ============================================================================ */
  
  const [reconciliationData, setReconciliationData] = useState<ReconciliationData | null>(null);
  const [loadingReconciliation, setLoadingReconciliation] = useState(false);
  const [reconciliationDate, setReconciliationDate] = useState<string>(() => {
    const today = new Date();
    return today.toISOString().split('T')[0];
  });

  /* ============================================================================
     SECTION : ÉTATS REACT - MODALES
     Description : Gestion des modales pour les sorties de caisse
     ============================================================================ */
  
  const [showOutModal, setShowOutModal] = useState(false);
  const [outForm, setOutForm] = useState<NewOutForm>({ kind: 'depense', montant: '', libelle: '', banque: '', companyBankId: '', note: '' });

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
          setCompanyCurrency(c.devise || 'XOF');
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

        // Banques de la compagnie (pour transferts caisse → banque)
        const banks = await listCompanyBanks(user.companyId);
        setCompanyBanks(banks);

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
          setAccountantCode(u.staffCode || u.codeCourt || u.code || 'ACCOUNT');
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
  
  const normalizeShift = (id: string, r: any): ShiftDoc => ({
    id,
    userId: r.userId || r.openedById || '',
    userName: r.userName || r.openedByName || r.userEmail || '',
    userEmail: r.userEmail || '',
    userCode: r.userCode || r.openedByCode || '',
    companyId: r.companyId,
    agencyId: r.agencyId,
    status: r.status,
    startTime: r.startTime || r.openedAt,
    endTime: r.endTime || r.closedAt,
    totalTickets: r.totalTickets,
    totalReservations: r.totalReservations,
    totalAmount: r.totalAmount,
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
  });

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

      // Cache des informations utilisateur
      const needed = Array.from(new Set(all.map(s => s.userId).filter(uid => !!uid && !usersCache[uid])));
      if (needed.length) {
        console.log(`[AgenceCompta] Chargement de ${needed.length} utilisateur(s) manquant(s)`);
        const entries = await Promise.all(needed.map(async uid => {
          const us = await getDoc(doc(db, 'users', uid));
          if (!us.exists()) return [uid, {}] as const;
          const ud = us.data() as any;
          return [uid, {
            name: ud.displayName || ud.nom || ud.email || '',
            email: ud.email || '',
            code: ud.staffCode || ud.codeCourt || ud.code || '',
          }] as const;
        }));
        setUsersCache(prev => Object.fromEntries([...Object.entries(prev), ...entries]));
      }

      // Tri par temps
      const byTime = (s: ShiftDoc) =>
        (s.validatedAt?.toMillis?.() ?? 0) ||
        (s.endTime?.toMillis?.() ?? 0) ||
        (s.startTime?.toMillis?.() ?? 0);

      // Mise à jour des listes groupées par statut
      setPendingShifts(all.filter(s => s.status === 'pending').sort((a,b)=>byTime(b)-byTime(a)));
      setActiveShifts(all.filter(s => s.status === 'active').sort((a,b)=>byTime(b)-byTime(a)));
      setPausedShifts(all.filter(s => s.status === 'paused').sort((a,b)=>byTime(b)-byTime(a)));
      setClosedShifts(all.filter(s => s.status === 'closed').sort((a,b)=>byTime(b)-byTime(a)));
      setValidatedShifts(all.filter(s => s.status === 'validated').sort((a,b)=>byTime(b)-byTime(a)));

      console.log('[AgenceCompta] Postes mis à jour:', {
        pending: all.filter(s => s.status === 'pending').length,
        active: all.filter(s => s.status === 'active').length,
        paused: all.filter(s => s.status === 'paused').length,
        closed: all.filter(s => s.status === 'closed').length,
        validated: all.filter(s => s.status === 'validated').length
      });
    });
    
    return () => {
      console.log('[AgenceCompta] Arrêt de l\'écoute des postes');
      unsub();
    };
  }, [user?.companyId, user?.agencyId]);

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
      setValidatedCourierSessions(all.filter(s => s.status === 'VALIDATED').sort((a, b) => byTime(b) - byTime(a)));
    });
    return () => unsub();
  }, [user?.companyId, user?.agencyId]);

  // Toast "Nouvelle demande d'activation Courrier" quand PENDING passe de 0 à > 0 (comptable uniquement)
  useEffect(() => {
    const count = pendingCourierSessions.length;
    if (userRole === 'agency_accountant' && count > 0 && prevCourierPendingCountRef.current === 0) {
      toast.info('Nouvelle demande d\'activation Courrier');
    }
    prevCourierPendingCountRef.current = count;
  }, [pendingCourierSessions.length, userRole]);

  /* ============================================================================
     SECTION : STATISTIQUES EN TEMPS RÉEL (ÉTENDU POUR TOUS LES CANAUX)
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
      // Écoute TOUTES les réservations du poste (guichet + ligne)
      const qLive = query(rRef, where('shiftId', '==', s.id));
      const unsub = onSnapshot(qLive, (snap) => {
        let reservations = 0, tickets = 0, amount = 0;
        snap.forEach(d => {
          const r = d.data() as any;
          reservations += 1;
          tickets += (r.seatsGo || 0) + (r.seatsReturn || 0);
          amount += r.montant || 0;
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
     SECTION : AGRÉGATS POUR RÉCEPTIONS (ÉTENDU POUR INCLURE EN LIGNE)
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
        const snap = await getDocs(query(rRef, where('shiftId', '==', s.id)));
        let reservations = 0, tickets = 0, amount = 0, cashExpected = 0, mmExpected = 0, onlineAmount = 0;
        
        snap.forEach(d => {
          const r = d.data() as any;
          reservations += 1;
          tickets += (r.seatsGo || 0) + (r.seatsReturn || 0);
          amount += (r.montant || 0);
          
          const pay = String(r.paiement || '').toLowerCase();
          const canal = String(r.canal || '').toLowerCase();
          
          if (canal === 'guichet' || canal === '') {
            if (pay.includes('esp')) { 
              cashExpected += (r.montant || 0); 
            }
            if (pay.includes('mobile') || pay.includes('mm')) { 
              mmExpected += (r.montant || 0); 
            }
          } else if (canal === 'en_ligne') {
            onlineAmount += (r.montant || 0);
          }
        });
        
        map[s.id] = { 
          reservations, 
          tickets, 
          amount, 
          cashExpected, 
          mmExpected,
          onlineAmount 
        };
      }
      
      setAggByShift(map);
      console.log('[AgenceCompta] Agrégats calculés:', Object.keys(map).length);
    })().catch((e) => console.error('[AgenceCompta] Erreur agrégats réceptions:', e));
  }, [closedShifts, user?.companyId, user?.agencyId]);

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

  const pauseShift = useCallback(async (id:string) => {
    if(!user?.companyId||!user?.agencyId) return;
    try {
      await pauseSession(user.companyId, user.agencyId, id);
    } catch (error: unknown) {
      console.error(`[AgenceCompta] Erreur pause poste ${id}:`, error);
    }
  },[user?.companyId, user?.agencyId]);

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

    const inputs = receptionInputs[shift.id] || { cashReceived: '0' };
    const toAmount = (s: string) => {
      const clean = (s || '').replace(/[^\d.,]/g, '').replace(',', '.');
      const n = Number(clean);
      return Number.isFinite(n) && n >= 0 ? n : NaN;
    };

    const cashRcv = toAmount(inputs.cashReceived || '');
    if (!Number.isFinite(cashRcv)) {
      alert('Montant espèces reçu invalide.');
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

      setReceptionInputs(prev => ({ ...prev, [shift.id]: { cashReceived: '' } }));
      if (computedDifference !== 0) {
        alert(`Validation enregistrée. Écart (reçu - attendu) : ${computedDifference >= 0 ? '+' : ''}${computedDifference.toFixed(0)} ${currencySymbol}`);
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
      setReceptionInputsCourier(prev => ({ ...prev, [session.id]: { countedAmount: '' } }));
      if (difference !== 0) {
        alert(`Validation enregistrée. Écart (compté - attendu) : ${difference >= 0 ? '+' : ''}${difference.toFixed(0)} ${currencySymbol}`);
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
     SECTION : RAPPORTS DÉTAILLÉS (ÉTENDU POUR TOUS LES CANAUX)
     Description : Génération des rapports de vente avec déduplication
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
      
      const startRaw = sDoc.startTime?.toDate?.() ?? sDoc.openedAt?.toDate?.() ?? null;
      const endRaw   = sDoc.endTime?.toDate?.()   ?? sDoc.closedAt?.toDate?.()   ?? null;
      const userId   = sDoc.userId || sDoc.openedById || '';
      const userCode = sDoc.userCode || sDoc.openedByCode || '';

      const start = startRaw ? new Date(startRaw.getTime() - 5 * 60 * 1000) : null;
      const end   = endRaw   ? new Date(endRaw.getTime()   + 6 * 60 * 60 * 1000) : null;

      // Réservations attachées au shift (TOUS les canaux)
      const snap1 = await getDocs(query(
        rRef,
        where('shiftId','==', shiftId),
        orderBy('createdAt','asc')
      ));

      let extraDocs: any[] = [];
      // Recherche des transactions orphelines dans la période
      if (start && end) {
        const snapAll = await getDocs(query(
          rRef,
          where('createdAt','>=', Timestamp.fromDate(start)),
          orderBy('createdAt','asc')
        ));
        extraDocs = snapAll.docs.filter(d => {
          const r = d.data() as any;
          const dt = r.createdAt?.toDate?.() ?? new Date(0);
          const inRange = dt >= start && dt <= end;
          
          // Pour guichet : vérifier le vendeur
          const canal = String(r.canal || '').toLowerCase();
          if (canal === 'guichet' || canal === '') {
            const sameSeller =
              (!!userId   && r.guichetierId   === userId) ||
              (!!userCode && r.guichetierCode === userCode);
            const noShiftId = !r.shiftId || r.shiftId === '';
            return inRange && sameSeller && noShiftId;
          }
          
          // Pour en ligne : vérifier l'agence
          if (canal === 'en_ligne') {
            const sameAgency = r.agencyId === user.agencyId;
            const noShiftId = !r.shiftId || r.shiftId === '';
            return inRange && sameAgency && noShiftId;
          }
          
          return false;
        });
      }

      const mk = (d:any) => {
        const r = d.data() as any;
        const canal = String(r.canal || '').toLowerCase();
        const encaissement = canal === 'guichet' || canal === '' ? 'agence' : 'compagnie';
        
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
          canal: r.canal,
          encaissement, // NOUVEAU : source d'encaissement
        } as TicketRow;
      };

      const rawDocs = [...snap1.docs, ...extraDocs];
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

  /* ============================================================================
     SECTION : KPI COURRIER (séparé du Guichet, pour onglet Courrier uniquement)
     ============================================================================ */
  const courierKpis = useMemo(() => {
    const totalCAValidated = validatedCourierSessions.reduce((sum, s) => sum + (Number(s.expectedAmount) || 0), 0);
    return {
      pendingCount: pendingCourierSessions.length,
      activeCount: activeCourierSessions.length,
      closedCount: closedCourierSessions.length,
      totalCAValidated,
    };
  }, [pendingCourierSessions.length, activeCourierSessions.length, closedCourierSessions.length, validatedCourierSessions]);

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

    try {
      const rRef = collection(db, `companies/${user.companyId}/agences/${user.agencyId}/cashReceipts`);
      const mRef = collection(db, `companies/${user.companyId}/agences/${user.agencyId}/cashMovements`);

      const qR = query(rRef, where('createdAt', '>=', Timestamp.fromDate(currentRange.from)), orderBy('createdAt', 'asc'));
      const qM = query(mRef, where('createdAt', '>=', Timestamp.fromDate(currentRange.from)), orderBy('createdAt', 'asc'));

      const [sr, sm] = await Promise.all([getDocs(qR), getDocs(qM)]);

      const map: Record<string, { in: number; out: number }> = {};

      // Agrégation des entrées (reçus de caisse)
      sr.forEach(d => {
        const r = d.data() as any;
        const dt = r.createdAt?.toDate?.() ?? new Date();
        if (dt < currentRange.from || dt >= currentRange.to) return;
        const key = dt.toISOString().split('T')[0];
        const inc = Number(r.cashReceived || 0);
        if (!map[key]) map[key] = { in: 0, out: 0 };
        map[key].in += Math.max(0, inc);
      });

      // Agrégation des sorties (dépenses et transferts)
      sm.forEach(d => {
        const r = d.data() as any;
        const dt = r.createdAt?.toDate?.() ?? new Date();
        if (dt < currentRange.from || dt >= currentRange.to) return;
        const key = dt.toISOString().split('T')[0];
        const kind = String(r.kind || '');
        const amount = Number(r.amount || 0);
        if (!map[key]) map[key] = { in: 0, out: 0 };
        if (kind === 'depense' || kind === 'transfert_banque') {
          map[key].out += Math.max(0, amount);
        } else if (kind === 'entree_manual') {
          map[key].in += Math.max(0, amount);
        }
      });

      const sortedKeys = Object.keys(map).sort();
      let running = 0;
      const rows: CashDay[] = [];
      let IN = 0, OUT = 0;
      
      for (const k of sortedKeys) {
        const e = map[k].in || 0;
        const s = map[k].out || 0;
        if (e === 0 && s === 0) continue;
        running += e - s;
        IN += e; OUT += s;
        rows.push({ dateISO: k, entrees: e, sorties: s, solde: running });
      }

      setDays(rows);
      setTotIn(IN);
      setTotOut(OUT);
      
      console.log('[AgenceCompta] Données de caisse chargées:', { 
        jours: rows.length, 
        entrées: IN, 
        sorties: OUT, 
        solde: IN - OUT 
      });
    } catch (error) {
      console.error('[AgenceCompta] Erreur lors du chargement de la caisse:', error);
      alert('Erreur lors du chargement des données de caisse');
    } finally {
      setLoadingCash(false);
    }
  }, [user?.companyId, user?.agencyId, currentRange]);

  useEffect(() => { 
    console.log('[AgenceCompta] Déclenchement du chargement de la caisse');
    void reloadCash(); 
  }, [reloadCash]);

  /* ============================================================================
     SECTION : RÉCONCILIATION DES VENTES vs ENCAISSEMENTS
     Description : Calcul de la cohérence entre billets vendus et argent encaissé
     ============================================================================ */
  
  const loadReconciliation = useCallback(async () => {
    console.log('[AgenceCompta] Chargement des données de réconciliation pour', reconciliationDate);
    
    if (!user?.companyId || !user?.agencyId) return;
    
    setLoadingReconciliation(true);
    
    try {
      const date = new Date(reconciliationDate);
      const start = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);
      const end = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999);
      
      // 1. Récupérer TOUTES les réservations de l'agence pour la journée
      const rRef = collection(db, `companies/${user.companyId}/agences/${user.agencyId}/reservations`);
      const q = query(
        rRef,
        where('date', '==', reconciliationDate),
        orderBy('createdAt', 'asc')
      );
      
      const snap = await getDocs(q);
      
      // 2. Calculer les agrégats
      let ventesGuichet = { reservations: 0, tickets: 0, montant: 0 };
      let ventesEnLigne = { reservations: 0, tickets: 0, montant: 0 };
      let encaissementsEspeces = 0;
      let encaissementsMobileMoney = 0;
      
      snap.forEach(d => {
        const r = d.data() as any;
        const canal = String(r.canal || '').toLowerCase();
        const paiement = String(r.paiement || '').toLowerCase();
        const montant = r.montant || 0;
        const tickets = (r.seatsGo || 0) + (r.seatsReturn || 0);
        
        if (canal === 'guichet' || canal === '') {
          ventesGuichet.reservations += 1;
          ventesGuichet.tickets += tickets;
          ventesGuichet.montant += montant;
          
          if (paiement.includes('esp')) {
            encaissementsEspeces += montant;
          }
          if (paiement.includes('mobile') || paiement.includes('mm')) {
            encaissementsMobileMoney += montant;
          }
        } else if (canal === 'en_ligne') {
          ventesEnLigne.reservations += 1;
          ventesEnLigne.tickets += tickets;
          ventesEnLigne.montant += montant;
          // En ligne : pas d'encaissement dans la caisse agence
        }
      });
      
      // 3. Calculer l'écart
      const encaissementsTotal = encaissementsEspeces + encaissementsMobileMoney;
      const ecart = ventesGuichet.montant - encaissementsTotal;
      
      // 4. Mettre à jour l'état
      setReconciliationData({
        ventesGuichet,
        ventesEnLigne,
        encaissementsEspeces,
        encaissementsMobileMoney,
        encaissementsTotal,
        ecart
      });
      
      console.log('[AgenceCompta] Réconciliation calculée:', {
        ventesGuichet,
        ventesEnLigne,
        encaissementsTotal,
        ecart
      });
      
    } catch (error) {
      console.error('[AgenceCompta] Erreur lors du chargement de la réconciliation:', error);
      alert('Erreur lors du chargement de la réconciliation');
    } finally {
      setLoadingReconciliation(false);
    }
  }, [user?.companyId, user?.agencyId, reconciliationDate]);
  
  useEffect(() => {
    if (tab === 'reconciliation') {
      loadReconciliation();
    }
  }, [tab, reconciliationDate, loadReconciliation]);

  /* ============================================================================
     SECTION : GESTION DE LA CAISSE - NOUVELLES SORTIES
     Description : Création de nouveaux mouvements de sortie (dépenses/transferts)
     ============================================================================ */
  
  const createOutMovement = async () => {
    console.log('[AgenceCompta] Création d\'un nouveau mouvement de sortie', outForm);
    
    if (!user?.companyId || !user?.agencyId) return;
    
    const amount = Number(outForm.montant || 0);
    if (!Number.isFinite(amount) || amount <= 0) { 
      console.warn('[AgenceCompta] Montant invalide pour le mouvement');
      alert('Montant invalide'); 
      return; 
    }

    const bankLabel = outForm.kind === 'transfert_banque'
      ? (outForm.companyBankId ? companyBanks.find(b => b.id === outForm.companyBankId)?.name : null) || outForm.banque || ''
      : '';

    if (outForm.kind === 'transfert_banque' && !bankLabel) {
      alert('Veuillez sélectionner une banque de la compagnie ou indiquer le nom du compte.');
      return;
    }
    
    try {
      const payload = {
        kind: outForm.kind,
        amount,
        label: outForm.libelle || (outForm.kind === 'transfert_banque' ? 'Transfert vers banque' : 'Dépense'),
        bankName: bankLabel,
        companyBankId: outForm.kind === 'transfert_banque' ? (outForm.companyBankId || null) : null,
        note: outForm.note || '',
        companyId: user.companyId,
        agencyId: user.agencyId,
        accountantId: accountant?.id || null,
        accountantCode,
        createdAt: Timestamp.now(),
      };
      
      const movRef = await addDoc(collection(db, `companies/${user.companyId}/agences/${user.agencyId}/cashMovements`), payload);
      const movementId = movRef.id;

      if (outForm.kind === 'transfert_banque' && outForm.companyBankId) {
        await ensureDefaultAgencyAccounts(user.companyId, user.agencyId, companyCurrency, agencyName);
        await recordMovement({
          companyId: user.companyId,
          fromAccountId: agencyCashAccountId(user.agencyId),
          toAccountId: companyBankAccountId(outForm.companyBankId),
          amount,
          currency: companyCurrency,
          movementType: 'deposit_to_bank',
          referenceType: 'transfer',
          referenceId: movementId,
          agencyId: user.agencyId,
          performedBy: user.uid,
          notes: `Transfert caisse → ${bankLabel}`,
        });
      }
      
      console.log('[AgenceCompta] Mouvement de sortie enregistré avec succès');
      setShowOutModal(false);
      setOutForm({ kind: 'depense', montant: '', libelle: '', banque: '', companyBankId: '', note: '' });
      await reloadCash();
    } catch (error) {
      console.error('[AgenceCompta] Erreur lors de l\'enregistrement du mouvement:', error);
      alert('Erreur lors de l\'enregistrement du mouvement');
    }
  };

  /* ============================================================================
     SECTION : HELPER FUNCTIONS - RECHERCHE
     Description : Fonctions utilitaires pour la recherche de données
     ============================================================================ */
  
  const findShift = useCallback(
    (id?: string) => [...activeShifts, ...pausedShifts, ...closedShifts, ...validatedShifts].find(s => s.id === id),
    [activeShifts, pausedShifts, closedShifts, validatedShifts]
  );

  /* ============================================================================
     SECTION : RENDU PRINCIPAL
     Description : Interface utilisateur de la page de comptabilité
     ============================================================================ */
  
  return (
    <div className={`min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 ${darkMode ? 'agency-dark' : ''}`}>
      {/* ============================================================================
         HEADER : EN-TÊTE AVEC BRANDING ET NAVIGATION
         Description : Logo, nom d'entreprise, onglets et informations comptable
         ============================================================================ */}
      
      <div className="sticky top-0 z-10 border-b bg-white/95 backdrop-blur-sm supports-[backdrop-filter]:bg-white/90 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            {/* Branding */}
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-3">
                {companyLogo ? (
                  <div className="relative">
                    <img 
                      src={companyLogo} 
                      alt="Logo compagnie" 
                      className="h-12 w-12 rounded-xl object-contain border-2 border-white shadow-sm"
                    />
                    <div className="absolute -bottom-1 -right-1 h-5 w-5 bg-gradient-to-br from-emerald-500 to-cyan-500 rounded-full border border-white flex items-center justify-center">
                      <Shield className="h-3 w-3 text-white" />
                    </div>
                  </div>
                ) : (
                  <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-gray-100 to-gray-200 border-2 border-white shadow-sm grid place-items-center">
                    <Building2 className="h-6 w-6 text-gray-600"/>
                  </div>
                )}
                <div className="min-w-0">
                  <div
                    className="text-xl font-bold tracking-tight truncate bg-gradient-to-r from-gray-900 to-gray-700 bg-clip-text text-transparent"
                    title={companyName}
                  >
                    {companyName}
                  </div>
                  <div className="text-sm text-gray-600 flex items-center gap-1.5 truncate">
                    <MapPin className="h-4 w-4 flex-shrink-0"/>
                    <span className="truncate">{agencyName}</span>
                    <span className="text-xs px-2 py-0.5 bg-gradient-to-r from-blue-50 to-indigo-50 text-blue-700 rounded-full">
                      Comptabilité
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Onglets */}
            <div className="w-full sm:w-auto">
              <div className="inline-flex rounded-xl p-1.5 bg-gradient-to-r from-slate-100 to-slate-50 shadow-inner w-full sm:w-auto">
                <TabButton 
                  active={tab==='controle'}   
                  onClick={()=>setTab('controle')}   
                  label="Contrôle" 
                  icon={<Activity className="h-4 w-4" />}
                  theme={theme}
                />
                <TabButton 
                  active={tab==='receptions'} 
                  onClick={()=>setTab('receptions')} 
                  label="Réceptions" 
                  icon={<HandIcon className="h-4 w-4" />}
                  theme={theme}
                />
                <TabButton 
                  active={tab==='rapports'}   
                  onClick={()=>setTab('rapports')}   
                  label="Rapports" 
                  icon={<BarChart3 className="h-4 w-4" />}
                  theme={theme}
                />
                <TabButton 
                  active={tab==='caisse'}     
                  onClick={()=>setTab('caisse')}     
                  label="Caisse" 
                  icon={<Banknote className="h-4 w-4" />}
                  theme={theme}
                />
                <TabButton 
                  active={tab==='reconciliation'}     
                  onClick={()=>setTab('reconciliation')}     
                  label="Réconciliation" 
                  icon={<RefreshCw className="h-4 w-4" />}
                  theme={theme}
                />
                <TabButton 
                  active={tab==='courrier'} 
                  onClick={()=>setTab('courrier')} 
                  label="Courrier" 
                  icon={<Package className="h-4 w-4" />}
                  theme={theme}
                  badgeCount={userRole === 'agency_accountant' ? pendingCourierSessions.length : 0}
                />
              </div>
            </div>

            {/* Actions et profil — aligné guichet : réseau + mode sombre */}
            <div className="flex items-center gap-3 w-full sm:w-auto justify-between sm:justify-end">
              <AgencyHeaderExtras isOnline={isOnline} darkMode={darkMode} onDarkModeToggle={toggleDarkMode} />
              {accountant && (
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-gradient-to-r from-indigo-50 to-purple-50 border border-indigo-100 shadow-sm">
                  <div className="h-7 w-7 rounded-full bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center text-white text-xs font-bold">
                    {accountant.displayName?.charAt(0) || 'C'}
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs font-medium text-gray-900 truncate">
                      {(accountant.displayName || accountant.email || '—')}
                    </div>
                    <div className="text-xs text-gray-600 truncate">
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
                className="inline-flex items-center gap-2 px-4 py-2 text-sm rounded-lg border border-gray-200 bg-white hover:bg-gray-50 shadow-sm transition-colors"
                title="Déconnexion"
              >
                <LogOut className="h-4 w-4"/> 
                <span className="hidden sm:inline">Déconnexion</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ============================================================================
         CONTENU PRINCIPAL
         Description : Contenu des différents onglets
         ============================================================================ */}
      
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6">
        {/* ============================================================================
           ONGLET : CONTRÔLE DES POSTES
           Description : Gestion des postes de vente en temps réel
           ============================================================================ */}
        
        {tab === 'controle' && (
          <div className="space-y-6">
            {/* KPI Globaux */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6">
              <KpiCard 
                icon={<Ticket className="h-6 w-6" />} 
                label="Billets vendus" 
                value={liveTotalsGlobal.tickets.toString()} 
                sublabel="en direct"
                theme={theme}
                emphasis={false}
              />
              <KpiCard 
                icon={<Wallet className="h-6 w-6" />} 
                label="Chiffre d'affaires" 
                value={money(liveTotalsGlobal.amount)} 
                sublabel="en direct"
                theme={theme}
                emphasis={true}
              />
              <KpiCard 
                icon={<Activity className="h-6 w-6" />} 
                label="Réservations" 
                value={liveTotalsGlobal.reservations.toString()} 
                sublabel="en direct"
                theme={theme}
                emphasis={false}
              />
            </div>

            {/* Stats rapides */}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 sm:gap-4">
              <StatCard tone="indigo" label="En attente" value={pendingShifts.length} icon={<Clock4 className="h-4 w-4" />} />
              <StatCard tone="emerald" label="En service" value={activeShifts.length} icon={<Play className="h-4 w-4" />} />
              <StatCard tone="amber" label="En pause" value={pausedShifts.length} icon={<Pause className="h-4 w-4" />} />
              <StatCard tone="rose" label="Clôturés" value={closedShifts.length} icon={<StopCircle className="h-4 w-4" />} />
              <StatCard tone="slate" label="Validés" value={validatedShifts.length} icon={<CheckCircle2 className="h-4 w-4" />} />
            </div>

            {/* Postes en attente */}
            <SectionShifts
              title="Postes en attente d'activation"
              hint="Le guichetier est connecté mais ne peut pas vendre tant que vous n'activez pas."
              icon={<Clock4 className="h-5 w-5" />}
              list={pendingShifts}
              usersCache={usersCache}
              liveStats={{}}
              theme={theme}
              actions={(s) => (
                <Button variant="primary" onClick={() => activateShift(s.id)}>
                  <Play className="h-4 w-4 mr-2" />
                  Activer le poste
                </Button>
              )}
            />

            {/* Postes en service */}
            <SectionShifts
              title="Postes en service"
              hint="Statistiques mises à jour en direct."
              icon={<Play className="h-5 w-5" />}
              list={activeShifts}
              usersCache={usersCache}
              liveStats={liveStats}
              theme={theme}
              actions={(s) => (
                <div className="flex flex-col sm:flex-row gap-2">
                  <Button variant="secondary" onClick={() => pauseShift(s.id)}>
                    <Pause className="h-4 w-4 mr-2" /> 
                    Pause
                  </Button>
                  <span className="text-xs text-gray-500 self-center">Clôture par le guichetier uniquement.</span>
                </div>
              )}
            />

            {/* Postes en pause */}
            <SectionShifts
              title="Postes en pause"
              hint="Peuvent être remis en service."
              icon={<Pause className="h-5 w-5" />}
              list={pausedShifts}
              usersCache={usersCache}
              liveStats={liveStats}
              theme={theme}
              actions={(s) => (
                <div className="flex flex-col sm:flex-row gap-2">
                  <Button variant="primary" onClick={() => continueShift(s.id)}>
                    <Play className="h-4 w-4 mr-2" />
                    Continuer
                  </Button>
                  <span className="text-xs text-gray-500 self-center">Clôture par le guichetier uniquement.</span>
                </div>
              )}
            />
          </div>
        )}

        {/* ============================================================================
           ONGLET : RÉCEPTIONS DE CAISSE
           Description : Validation des remises d'espèces des postes clôturés
           ============================================================================ */}
        
        {tab === 'receptions' && (
          <div className="space-y-6">
            <SectionHeader
              icon={<Receipt className="h-6 w-6" />}
              title="Réceptions de caisse à valider"
              subtitle="Validez la remise d'espèces des postes clôturés par les guichetiers."
            />

            {(() => {
              const toReceive = closedShifts.filter(s => s.status === 'closed');
              
              if (toReceive.length === 0) {
                return (
                  <EmptyState
                    icon={<CheckCircle2 className="h-12 w-12" />}
                    title="Aucune réception en attente"
                    description="Toutes les remises de caisse ont été validées."
                  />
                );
              }
              
              return (
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
                    const mmExpectedAgg = agg?.mmExpected ?? (payBy['mobile_money'] ?? s.mmExpected ?? 0);
                    const onlineAmountAgg = agg?.onlineAmount ?? 0;

                    const cashReceived = Number((inputs.cashReceived || '').replace(/[^\d.]/g,''));
                    const ecart = (Number.isFinite(cashReceived) ? cashReceived : 0) - (cashExpectedAgg || 0);
                    const disableValidate = !Number.isFinite(cashReceived) || cashReceived < 0;
                    const hasDifference = Number.isFinite(cashReceived) && ecart !== 0;

                    const ui = usersCache[s.userId] || {};
                    const name = ui.name || s.userName || s.userEmail || s.userId;
                    const code = ui.code || s.userCode || '—';

                    return (
                      <div key={s.id} className="group relative">
                        <div className="absolute inset-0 bg-gradient-to-br from-white to-gray-50 rounded-xl transform group-hover:scale-[1.02] transition-all duration-300"></div>
                        <div className="relative rounded-xl border border-gray-200 bg-white/80 p-5 shadow-sm hover:shadow-md transition-all duration-300">
                          {/* En-tête du poste */}
                          <div className="flex items-start justify-between gap-3 mb-4">
                            <div className="min-w-0">
                              <div className="text-xs font-medium text-gray-500 uppercase tracking-wider">Guichetier</div>
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
                            <InfoCard label="Montant total" value={money(amountAgg)} emphasis />
                            <InfoCard label="Espèces attendu" value={money(cashExpectedAgg)} emphasis />
                            <InfoCard label="Mobile Money" value={money(mmExpectedAgg)} />
                            <InfoCard label="En ligne" value={money(onlineAmountAgg)} />
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
                                Espèces reçues <span className="text-red-500">*</span>
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
                              <div className="text-xs font-medium text-gray-700 mb-1">Écart (reçu - attendu)</div>
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
                            <Button 
                              variant="secondary"
                              onClick={() => { setTab('rapports'); loadReportForShift(s.id); }}
                              className="w-full sm:w-auto"
                            >
                              <FileText className="h-4 w-4 mr-2" /> 
                              Voir le détail
                            </Button>
                            <Button 
                              variant="primary"
                              disabled={disableValidate || !!savingShiftIds[s.id]} 
                              onClick={() => validateReception(s)} 
                              className="w-full sm:w-auto"
                            >
                              <CheckCircle2 className="h-4 w-4 mr-2" /> 
                              {savingShiftIds[s.id] ? 'Validation...' : 'Valider la réception'}
                            </Button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })()}
          </div>
        )}

        {/* ============================================================================
           ONGLET : RAPPORTS
           Description : Consultation détaillée des ventes par poste (tous canaux)
           ============================================================================ */}
        
        {tab === 'rapports' && (
          <div className="space-y-6">
            {/* Sélecteur de poste et filtres */}
            <div className="rounded-xl border border-gray-200 shadow-sm p-5 bg-gradient-to-r from-white to-gray-50/50">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-3">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-blue-50 to-indigo-50 flex items-center justify-center">
                    <BarChart3 className="h-5 w-5 text-blue-600" />
                  </div>
                  <div>
                    <div className="text-lg font-bold text-gray-900">Rapports détaillés par poste</div>
                    <div className="text-sm text-gray-600">Analyse complète des ventes (guichet + en ligne)</div>
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
                    {[...activeShifts, ...pausedShifts, ...closedShifts, ...validatedShifts].map(s => {
                      const ui   = usersCache[s.userId] || {};
                      const name = ui.name || s.userName || s.userEmail || s.userId;
                      const code = ui.code || s.userCode || '—';
                      const start = s.startTime ? new Date(s.startTime.toDate?.() ?? s.startTime) : null;
                      const end   = s.endTime   ? new Date(s.endTime.toDate?.()   ?? s.endTime)   : null;

                      const statutFr =
                        s.status === 'active'    ? 'En service'  :
                        s.status === 'paused'    ? 'En pause'    :
                        s.status === 'closed'    ? 'Clôturé'     :
                        s.status === 'validated' ? 'Validé'      : 'En attente';

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
                      Guichet
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

            {/* KPI du rapport */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6">
              <KpiCard 
                icon={<Ticket className="h-6 w-6" />} 
                label="Billets vendus" 
                value={totals.billets.toString()} 
                sublabel={`${totals.guichet.billets} guichet + ${totals.en_ligne.billets} ligne`}
                theme={theme}
                emphasis={false}
              />
              <KpiCard 
                icon={<Wallet className="h-6 w-6" />} 
                label="Chiffre d'affaires" 
                value={money(totals.montant)} 
                sublabel={`${money(totals.guichet.montant)} guichet + ${money(totals.en_ligne.montant)} ligne`}
                theme={theme}
                emphasis={true}
              />
              <KpiCard 
                icon={<Activity className="h-6 w-6" />} 
                label="Réservations" 
                value={tickets.length.toString()} 
                sublabel={`${tickets.filter(t => t.canal === 'guichet' || t.canal === '').length} guichet + ${tickets.filter(t => t.canal === 'en_ligne').length} ligne`}
                theme={theme}
                emphasis={false}
              />
            </div>

            {/* Tableau détaillé */}
            <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between mb-5">
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
                <EmptyState
                  icon={<FileText className="h-12 w-12" />}
                  title="Aucune donnée disponible"
                  description="Sélectionnez un poste pour afficher son rapport détaillé"
                />
              ) : (
                <div className="overflow-hidden rounded-xl border border-gray-200">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
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
                                      {t.canal === 'en_ligne' ? 'En ligne' : 'Guichet'}
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
          </div>
        )}

        {/* ============================================================================
           ONGLET : CAISSE AGENCE
           Description : Gestion des mouvements financiers de l'agence
           ============================================================================ */}
        
        {tab === 'caisse' && (
          <div className="space-y-6">
            {/* En-tête et filtres */}
            <div className="rounded-xl border border-gray-200 shadow-sm p-5 bg-gradient-to-r from-white to-gray-50/50">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-5">
                <div className="flex items-center gap-3">
                  <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-emerald-50 to-green-50 flex items-center justify-center">
                    <Banknote className="h-6 w-6 text-emerald-600" />
                  </div>
                  <div>
                    <div className="text-xl font-bold text-gray-900">Caisse d'agence</div>
                    <div className="text-sm text-gray-600">Gestion des mouvements financiers</div>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <Button 
                    variant="primary"
                    onClick={() => setShowOutModal(true)} 
                    className="whitespace-nowrap"
                  >
                    <Plus className="h-4 w-4 mr-2" /> 
                    Nouveau mouvement
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() => exportCsv(days, currencySymbol)}
                    disabled={days.length === 0}
                    className="whitespace-nowrap"
                  >
                    <Download className="h-4 w-4 mr-2" /> 
                    Export CSV
                  </Button>
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
                  
                  <Button variant="secondary" onClick={reloadCash} disabled={loadingCash}>
                    {loadingCash ? 'Actualisation...' : 'Actualiser'}
                  </Button>
                </div>
              </div>
            </div>

            {/* KPI de caisse */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6">
              <KpiCard 
                icon={<Wallet className="h-6 w-6" />} 
                label="Entrées totales" 
                value={money(totIn)} 
                theme={theme}
                emphasis={false}
              />
              <KpiCard 
                icon={<AlertTriangle className="h-6 w-6" />} 
                label="Sorties totales" 
                value={money(totOut)} 
                theme={theme}
                emphasis={false}
              />
              <KpiCard 
                icon={<Banknote className="h-6 w-6" />} 
                label="Solde de période" 
                value={money(totIn - totOut)} 
                sublabel={totIn - totOut >= 0 ? "Positif" : "Déficitaire"}
                theme={theme}
                emphasis={true}
              />
            </div>

            {/* Journal de caisse */}
            <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between mb-5">
                <div className="text-lg font-bold text-gray-900">Journal des mouvements</div>
                <div className="text-sm text-gray-600">
                  {days.length} jour{days.length > 1 ? 's' : ''} avec activité
                </div>
              </div>
              
              {loadingCash ? (
                <div className="flex items-center justify-center py-12">
                  <div className="text-center">
                    <div className="h-12 w-12 border-4 border-gray-200 border-t-emerald-500 rounded-full animate-spin mx-auto mb-3"></div>
                    <div className="text-gray-600">Chargement des données de caisse...</div>
                  </div>
                </div>
              ) : days.length === 0 ? (
                <EmptyState
                  icon={<Banknote className="h-12 w-12" />}
                  title="Aucun mouvement enregistré"
                  description={`Aucun mouvement de caisse sur la période sélectionnée`}
                />
              ) : (
                <div className="overflow-hidden rounded-xl border border-gray-200">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-gradient-to-r from-gray-50 to-gray-100/50">
                        <tr>
                          <Th>Date</Th>
                          <Th align="right">Entrées</Th>
                          <Th align="right">Sorties</Th>
                          <Th align="right">Solde journalier</Th>
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
                          <Td className="font-bold text-gray-900">TOTAUX</Td>
                          <Td align="right" className="font-bold text-emerald-700">{money(totIn)}</Td>
                          <Td align="right" className="font-bold text-rose-700">{money(totOut)}</Td>
                          <Td align="right" className="font-bold text-gray-900">{money(totIn - totOut)}</Td>
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
           ONGLET : RÉCONCILIATION
           Description : Vue cohérente billets vendus vs argent encaissé
           ============================================================================ */}
        
        {tab === 'reconciliation' && (
          <div className="space-y-6">
            {/* En-tête et sélecteur de date */}
            <div className="rounded-xl border border-gray-200 shadow-sm p-5 bg-gradient-to-r from-white to-gray-50/50">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-5">
                <div className="flex items-center gap-3">
                  <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-amber-50 to-orange-50 flex items-center justify-center">
                    <RefreshCw className="h-6 w-6 text-amber-600" />
                  </div>
                  <div>
                    <div className="text-xl font-bold text-gray-900">Réconciliation des ventes</div>
                    <div className="text-sm text-gray-600">Cohérence billets vendus vs argent encaissé</div>
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
                  <Button variant="secondary" onClick={loadReconciliation} disabled={loadingReconciliation}>
                    {loadingReconciliation ? 'Chargement...' : 'Actualiser'}
                  </Button>
                </div>
              </div>
              
              <div className="text-sm text-gray-600">
                Compare les billets vendus par votre agence avec l'argent réellement encaissé
              </div>
            </div>

            {/* Tableau de réconciliation */}
            {loadingReconciliation ? (
              <div className="flex items-center justify-center py-12">
                <div className="text-center">
                  <div className="h-12 w-12 border-4 border-gray-200 border-t-amber-500 rounded-full animate-spin mx-auto mb-3"></div>
                  <div className="text-gray-600">Chargement de la réconciliation...</div>
                </div>
              </div>
            ) : !reconciliationData ? (
              <EmptyState
                icon={<RefreshCw className="h-12 w-12" />}
                title="Aucune donnée disponible"
                description="Sélectionnez une date pour voir la réconciliation"
              />
            ) : (
              <>
                {/* KPI de réconciliation */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6">
                  <KpiCard 
                    icon={<Ticket className="h-6 w-6" />} 
                    label="Billets vendus" 
                    value={(reconciliationData.ventesGuichet.tickets + reconciliationData.ventesEnLigne.tickets).toString()} 
                    sublabel={`${reconciliationData.ventesGuichet.tickets} guichet + ${reconciliationData.ventesEnLigne.tickets} ligne`}
                    theme={theme}
                    emphasis={false}
                  />
                  <KpiCard 
                    icon={<TrendingUp className="h-6 w-6" />} 
                    label="Chiffre d'affaires total" 
                    value={money(reconciliationData.ventesGuichet.montant + reconciliationData.ventesEnLigne.montant)} 
                    sublabel={`${money(reconciliationData.ventesGuichet.montant)} guichet + ${money(reconciliationData.ventesEnLigne.montant)} ligne`}
                    theme={theme}
                    emphasis={true}
                  />
                  <KpiCard 
                    icon={reconciliationData.ecart === 0 ? <CheckCircle2 className="h-6 w-6" /> : <AlertTriangle className="h-6 w-6" />} 
                    label="Écart de caisse" 
                    value={money(reconciliationData.ecart)} 
                    sublabel={reconciliationData.ecart === 0 ? "Caisse OK" : reconciliationData.ecart > 0 ? "Caisse en déficit" : "Excédent"}
                    theme={theme}
                    emphasis={true}
                  />
                </div>

                {/* Tableau détaillé */}
                <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
                  <div className="text-lg font-bold text-gray-900 mb-5">Réconciliation détaillée</div>
                  
                  <div className="overflow-hidden rounded-xl border border-gray-200">
                    <table className="w-full text-sm">
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
                        
                        {/* Guichet */}
                        <tr className="hover:bg-gray-50/50">
                          <Td>
                            <div className="flex items-center gap-2">
                              <div className="h-6 w-6 rounded-md bg-emerald-100 flex items-center justify-center">
                                <Wallet className="h-3 w-3 text-emerald-600" />
                              </div>
                              <span className="font-medium">Ventes guichet</span>
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
                        
                        {/* Total ventes */}
                        <tr className="border-t-2 border-gray-300">
                          <Td className="font-bold text-gray-900">TOTAL VENTES AGENCE</Td>
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
                              Billets consommés
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
                            <div className="flex items-center justify-between py-3">
                              <div className="text-sm font-bold text-gray-900">
                                ÉCART (Ventes guichet - Encaissements)
                              </div>
                              <div className={`text-xl font-bold ${reconciliationData.ecart === 0 ? 'text-emerald-700' : reconciliationData.ecart > 0 ? 'text-rose-700' : 'text-amber-700'}`}>
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
                  
                  {/* Résumé */}
                  <div className="mt-6 p-4 rounded-xl bg-gradient-to-r from-gray-50 to-gray-100/50 border border-gray-200">
                    <div className="text-sm font-medium text-gray-700 mb-2">Résumé de la journée</div>
                    <div className="text-sm text-gray-600 space-y-1">
                      <div>• <span className="font-medium">{reconciliationData.ventesGuichet.reservations + reconciliationData.ventesEnLigne.reservations}</span> réservations effectuées</div>
                      <div>• <span className="font-medium">{reconciliationData.ventesGuichet.tickets + reconciliationData.ventesEnLigne.tickets}</span> billets vendus</div>
                      <div>• <span className="font-medium">{money(reconciliationData.ventesGuichet.montant + reconciliationData.ventesEnLigne.montant)}</span> chiffre d'affaires généré</div>
                      <div>• <span className="font-medium">{money(reconciliationData.encaissementsTotal)}</span> réellement encaissés dans la caisse</div>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {/* ============================================================================
           ONGLET : COURRIER (sessions courrier, séparé du Guichet)
           Description : Activation PENDING → ACTIVE ; validation CLOSED → VALIDATED
           ============================================================================ */}
        {tab === 'courrier' && (
          <div className="space-y-6">
            <SectionHeader
              icon={<Package className="h-6 w-6" />}
              title="Sessions courrier"
              subtitle="Activation des sessions en attente et validation des sessions clôturées."
            />

            {/* KPI Courrier */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <StatCard tone="indigo" label="En attente" value={courierKpis.pendingCount} icon={<Clock4 className="h-4 w-4" />} />
              <StatCard tone="emerald" label="Actives" value={courierKpis.activeCount} icon={<Play className="h-4 w-4" />} />
              <StatCard tone="rose" label="Clôturées" value={courierKpis.closedCount} icon={<StopCircle className="h-4 w-4" />} />
              <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                <div className="flex items-center gap-2 text-gray-600 mb-1">
                  <Wallet className="h-4 w-4" />
                  <span className="text-sm font-medium">Total CA Courrier (validées)</span>
                </div>
                <div className="text-xl font-bold" style={{ color: theme.primary }}>
                  {money(courierKpis.totalCAValidated)}
                </div>
              </div>
            </div>

            {/* Sessions PENDING */}
            <div className="rounded-xl border border-gray-200 shadow-sm p-5 bg-gradient-to-r from-white to-gray-50/50">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-xl bg-indigo-50 flex items-center justify-center">
                    <Clock4 className="h-5 w-5 text-indigo-600" />
                  </div>
                  <div>
                    <div className="text-lg font-bold text-gray-900">Sessions en attente d&apos;activation</div>
                    <div className="text-sm text-gray-600">L&apos;agent a créé une session ; activez-la pour qu&apos;il puisse enregistrer des envois.</div>
                  </div>
                </div>
                <span className="text-sm font-medium px-3 py-1.5 rounded-full bg-gray-100 text-gray-700">
                  {pendingCourierSessions.length} session{pendingCourierSessions.length > 1 ? 's' : ''}
                </span>
              </div>
              {pendingCourierSessions.length === 0 ? (
                <EmptyState
                  icon={<Clock4 className="h-12 w-12" />}
                  title="Aucune session en attente"
                  description="Aucune session courrier en attente d'activation."
                />
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {pendingCourierSessions.map(s => (
                    <div key={s.id} className="rounded-xl border border-gray-200 bg-white p-5">
                      <div className="flex items-start justify-between gap-3 mb-4">
                        <div>
                          <div className="text-xs text-gray-500 uppercase tracking-wider">Agent</div>
                          <div className="font-semibold text-gray-900">{s.agentCode || s.agentId}</div>
                        </div>
                        <span className="px-3 py-1 rounded-full text-xs font-medium bg-indigo-50 text-indigo-700 border border-indigo-200">En attente</span>
                      </div>
                      <div className="text-xs text-gray-500 mb-3">
                        Créée le {s.createdAt ? fmtDT((s.createdAt as { toDate: () => Date }).toDate?.()) : '—'}
                      </div>
                      <Button variant="primary" onClick={() => activateCourierSessionAction(s.id)}>
                        <Play className="h-4 w-4 mr-2" />
                        Activer
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Sessions ACTIVE */}
            <div className="rounded-xl border border-gray-200 shadow-sm p-5 bg-gradient-to-r from-white to-gray-50/50">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-xl bg-emerald-50 flex items-center justify-center">
                    <Play className="h-5 w-5 text-emerald-600" />
                  </div>
                  <div>
                    <div className="text-lg font-bold text-gray-900">Sessions actives</div>
                    <div className="text-sm text-gray-600">L&apos;agent peut enregistrer des envois. Clôture par l&apos;agent uniquement.</div>
                  </div>
                </div>
                <span className="text-sm font-medium px-3 py-1.5 rounded-full bg-gray-100 text-gray-700">
                  {activeCourierSessions.length} session{activeCourierSessions.length > 1 ? 's' : ''}
                </span>
              </div>
              {activeCourierSessions.length === 0 ? (
                <EmptyState
                  icon={<Play className="h-12 w-12" />}
                  title="Aucune session active"
                  description="Aucune session courrier en cours."
                />
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {activeCourierSessions.map(s => (
                    <div key={s.id} className="rounded-xl border border-gray-200 bg-white p-5">
                      <div className="flex items-start justify-between gap-3 mb-4">
                        <div>
                          <div className="text-xs text-gray-500 uppercase tracking-wider">Agent</div>
                          <div className="font-semibold text-gray-900">{s.agentCode || s.agentId}</div>
                        </div>
                        <span className="px-3 py-1 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">Active</span>
                      </div>
                      <div className="text-xs text-gray-500">
                        Ouverte le {s.openedAt ? fmtDT((s.openedAt as { toDate: () => Date }).toDate?.()) : '—'}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Sessions CLOSED — validation avec montant compté */}
            <div className="rounded-xl border border-gray-200 shadow-sm p-5 bg-gradient-to-r from-white to-gray-50/50">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-xl bg-rose-50 flex items-center justify-center">
                    <StopCircle className="h-5 w-5 text-rose-600" />
                  </div>
                  <div>
                    <div className="text-lg font-bold text-gray-900">Sessions clôturées à valider</div>
                    <div className="text-sm text-gray-600">Saisissez le montant compté et validez la réception.</div>
                  </div>
                </div>
                <span className="text-sm font-medium px-3 py-1.5 rounded-full bg-gray-100 text-gray-700">
                  {closedCourierSessions.length} session{closedCourierSessions.length > 1 ? 's' : ''}
                </span>
              </div>
              {closedCourierSessions.length === 0 ? (
                <EmptyState
                  icon={<CheckCircle2 className="h-12 w-12" />}
                  title="Aucune réception en attente"
                  description="Toutes les sessions clôturées ont été validées."
                />
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {closedCourierSessions.map(s => {
                    const input = receptionInputsCourier[s.id] || { countedAmount: '' };
                    const counted = Number(String(input.countedAmount).replace(/[^\d.,]/g, '').replace(',', '.'));
                    const expected = Number(s.expectedAmount) || 0;
                    const ecart = Number.isFinite(counted) ? counted - expected : 0;
                    return (
                      <div key={s.id} className="rounded-xl border border-gray-200 bg-white p-5">
                        <div className="flex items-start justify-between gap-3 mb-4">
                          <div>
                            <div className="text-xs text-gray-500 uppercase tracking-wider">Agent</div>
                            <div className="font-semibold text-gray-900">{s.agentCode || s.agentId}</div>
                          </div>
                          <span className="px-3 py-1 rounded-full text-xs font-medium bg-rose-50 text-rose-700 border border-rose-200">Clôturée</span>
                        </div>
                        <div className="grid grid-cols-2 gap-3 mb-4">
                          <InfoCard label="Montant attendu" value={money(expected)} emphasis />
                          <InfoCard label="Écart" value={Number.isFinite(counted) ? money(ecart) : '—'} />
                        </div>
                        <div className="mb-4">
                          <label className="block text-xs font-medium text-gray-700 mb-2">Montant compté</label>
                          <input
                            type="text"
                            inputMode="decimal"
                            className="w-full border border-gray-300 rounded-lg px-3 py-2"
                            placeholder="0"
                            value={input.countedAmount}
                            onChange={e => setReceptionInputCourier(s.id, e.target.value)}
                          />
                        </div>
                        <Button
                          variant="primary"
                          disabled={!Number.isFinite(counted) || counted < 0 || !!savingCourierSessionIds[s.id]}
                          onClick={() => validateCourierSessionAction(s)}
                        >
                          <CheckCircle2 className="h-4 w-4 mr-2" />
                          {savingCourierSessionIds[s.id] ? 'Validation...' : 'Valider'}
                        </Button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ============================================================================
         MODALE : NOUVEAU MOUVEMENT DE SORTIE
         Description : Formulaire pour enregistrer une dépense ou un transfert
         ============================================================================ */}
      
      {showOutModal && (
        <div className="fixed inset-0 bg-black/50 grid place-items-center z-50 p-4">
          <div className="w-full max-w-md bg-white rounded-xl p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-6">
              <div className="text-xl font-bold text-gray-900">Nouveau mouvement de sortie</div>
              <button
                onClick={() => setShowOutModal(false)}
                className="h-8 w-8 rounded-full flex items-center justify-center hover:bg-gray-100"
              >
                <span className="text-gray-500">×</span>
              </button>
            </div>
            
            <div className="space-y-6">
              {/* Type de mouvement */}
              <div>
                <div className="text-sm font-medium text-gray-700 mb-3">Type de mouvement</div>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    className={`p-4 rounded-xl border-2 text-center transition-all ${outForm.kind === 'depense' 
                      ? 'border-blue-500 bg-blue-50 text-blue-700' 
                      : 'border-gray-200 bg-gray-50 text-gray-700 hover:border-gray-300'}`}
                    onClick={() => setOutForm(f => ({...f, kind: 'depense'}))}
                  >
                    <div className="font-medium">Dépense</div>
                    <div className="text-xs text-gray-500 mt-1">Achat, frais, etc.</div>
                  </button>
                  <button
                    type="button"
                    className={`p-4 rounded-xl border-2 text-center transition-all ${outForm.kind === 'transfert_banque' 
                      ? 'border-blue-500 bg-blue-50 text-blue-700' 
                      : 'border-gray-200 bg-gray-50 text-gray-700 hover:border-gray-300'}`}
                    onClick={() => setOutForm(f => ({...f, kind: 'transfert_banque'}))}
                  >
                    <div className="font-medium">Transfert banque</div>
                    <div className="text-xs text-gray-500 mt-1">Vers compte bancaire</div>
                  </button>
                </div>
              </div>

              {/* Champs du formulaire */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Libellé <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  className="w-full border border-gray-300 rounded-xl px-4 py-3 bg-white focus:outline-none focus:ring-2 focus:border-transparent"
                  style={{ outlineColor: theme.primary }}
                  placeholder="Ex: Achat fournitures bureau"
                  value={outForm.libelle}
                  onChange={e => setOutForm(f => ({...f, libelle: e.target.value}))}
                />
              </div>

              {outForm.kind === 'transfert_banque' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Banque de la compagnie <span className="text-red-500">*</span>
                  </label>
                  {companyBanks.length > 0 ? (
                    <select
                      className="w-full border border-gray-300 rounded-xl px-4 py-3 bg-white focus:outline-none focus:ring-2 focus:border-transparent"
                      style={{ outlineColor: theme.primary }}
                      value={outForm.companyBankId || ''}
                      onChange={e => setOutForm(f => ({ ...f, companyBankId: e.target.value, banque: '' }))}
                      required
                    >
                      <option value="">— Choisir une banque —</option>
                      {companyBanks.map(b => (
                        <option key={b.id} value={b.id}>{b.name}{b.iban ? ` (${b.iban})` : ''}</option>
                      ))}
                    </select>
                  ) : (
                    <>
                      <p className="text-xs text-amber-700 mb-2">Aucune banque configurée par la compagnie. Indiquez le compte manuellement (la traçabilité trésorerie ne sera pas mise à jour).</p>
                      <input
                        type="text"
                        className="w-full border border-gray-300 rounded-xl px-4 py-3 bg-white focus:outline-none focus:ring-2 focus:border-transparent"
                        style={{ outlineColor: theme.primary }}
                        placeholder="Ex: BICIS - Compte principal"
                        value={outForm.banque}
                        onChange={e => setOutForm(f => ({ ...f, banque: e.target.value, companyBankId: '' }))}
                      />
                    </>
                  )}
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Montant ({currencySymbol}) <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <input
                    type="number"
                    min="0"
                    inputMode="numeric"
                    className="w-full border border-gray-300 rounded-xl px-4 py-3 bg-white focus:outline-none focus:ring-2 focus:border-transparent text-lg font-medium"
                    style={{ outlineColor: theme.primary }}
                    placeholder="0"
                    value={outForm.montant}
                    onChange={e => setOutForm(f => ({...f, montant: e.target.value}))}
                  />
                  <div className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-500 font-medium">
                    {currencySymbol}
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Note (facultatif)
                </label>
                <textarea
                  className="w-full border border-gray-300 rounded-xl px-4 py-3 bg-white focus:outline-none focus:ring-2 focus:border-transparent resize-none"
                  style={{ outlineColor: theme.primary }}
                  placeholder="Informations complémentaires..."
                  rows={3}
                  value={outForm.note}
                  onChange={e => setOutForm(f => ({...f, note: e.target.value}))}
                />
              </div>
            </div>

            {/* Actions de la modale */}
            <div className="mt-8 flex justify-end gap-3">
              <Button variant="secondary" onClick={() => setShowOutModal(false)}>
                Annuler
              </Button>
              <Button variant="primary" onClick={createOutMovement}>
                <Plus className="h-4 w-4 mr-2" />
                Enregistrer le mouvement
              </Button>
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

const TabButton: React.FC<{
  active: boolean; 
  onClick: () => void; 
  label: string;
  icon: React.ReactNode;
  theme: { primary: string; secondary: string };
  badgeCount?: number;
}> = ({ active, onClick, label, icon, theme, badgeCount = 0 }) => (
  <button
    className={`
      flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all relative
      ${active 
        ? 'text-white shadow-sm transform scale-105' 
        : 'text-gray-600 hover:text-gray-900 hover:bg-white/80'
      }
    `}
    onClick={onClick}
    style={active ? { 
      background: `linear-gradient(135deg, ${theme.primary}, ${theme.secondary})`,
      boxShadow: `0 4px 12px ${theme.primary}40`
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


const KpiCard: React.FC<{
  icon: React.ReactNode; 
  label: string; 
  value: string; 
  sublabel?: string;
  theme: { primary: string; secondary: string };
  emphasis: boolean;
}> = ({ icon, label, value, sublabel, theme, emphasis }) => (
  <div
  className={`relative overflow-hidden rounded-xl border border-gray-200 p-5 bg-white shadow-sm
    hover:shadow-sm transition-all duration-300
    ${emphasis ? 'ring-2 ring-offset-2' : ''}`}
  style={
    emphasis
      ? { ['--tw-ring-color' as any]: theme.primary }
      : undefined
  }
>
    <div className="absolute top-0 right-0 h-20 w-20 opacity-10">
      <div className="absolute inset-0 bg-gradient-to-br from-gray-200 to-gray-300 rounded-full blur-xl"></div>
    </div>
    
    <div className="flex items-start justify-between mb-4">
      <div className="text-sm font-medium text-gray-500 uppercase tracking-wider">{label}</div>
      <div className="h-10 w-10 rounded-xl grid place-items-center"
           style={{background: `linear-gradient(135deg, ${theme.primary}20, ${theme.secondary}20)`}}>
        <span className="text-gray-700">{icon}</span>
      </div>
    </div>
    
    <div className="space-y-1">
      <div className={`font-bold ${emphasis ? 'text-3xl' : 'text-2xl'} text-gray-900`}>{value}</div>
      {sublabel && <div className="text-xs font-medium text-gray-500">{sublabel}</div>}
    </div>
  </div>
);

const StatCard: React.FC<{
  tone: 'indigo'|'emerald'|'amber'|'rose'|'slate'; 
  label: string; 
  value: number;
  icon: React.ReactNode;
}> = ({ tone, label, value, icon }) => {
  const styles = {
    indigo: { bg: 'bg-indigo-50', text: 'text-indigo-700', border: 'border-indigo-100' },
    emerald: { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-100' },
    amber: { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-100' },
    rose: { bg: 'bg-rose-50', text: 'text-rose-700', border: 'border-rose-100' },
    slate: { bg: 'bg-slate-50', text: 'text-slate-700', border: 'border-slate-100' },
  }[tone];

  return (
    <div className={`rounded-xl border ${styles.border} p-4 bg-white shadow-sm hover:shadow-sm transition-shadow`}>
      <div className="flex items-center justify-between mb-2">
        <div className={`px-2.5 py-1 rounded-lg text-xs font-medium ${styles.bg} ${styles.text}`}>
          {label}
        </div>
        <div className={`h-8 w-8 rounded-lg flex items-center justify-center ${styles.bg}`}>
          <span className={styles.text}>{icon}</span>
        </div>
      </div>
      <div className="text-2xl font-bold text-gray-900">{value}</div>
    </div>
  );
};

const SectionHeader: React.FC<{
  icon: React.ReactNode; 
  title: string; 
  subtitle?: string;
}> = ({ icon, title, subtitle }) => (
  <div className="rounded-xl border border-gray-200 shadow-sm p-6 bg-gradient-to-r from-white to-gray-50/50">
    <div className="flex items-center gap-4">
      <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-blue-50 to-indigo-50 flex items-center justify-center">
        {icon}
      </div>
      <div>
        <div className="text-xl font-bold text-gray-900">{title}</div>
        {subtitle && <div className="text-sm text-gray-600 mt-1">{subtitle}</div>}
      </div>
    </div>
  </div>
);

const SectionShifts: React.FC<{
  title: string; 
  hint?: string; 
  icon: React.ReactNode;
  list: ShiftDoc[];
  usersCache: Record<string, { name?: string; email?: string; code?: string }>;
  liveStats: Record<string, { reservations: number; tickets: number; amount: number }>;
  actions: (s: ShiftDoc) => React.ReactNode;
  theme: { primary: string; secondary: string };
}> = ({ title, hint, icon, list, usersCache, liveStats, actions, theme }) => {
  const money = useFormatCurrency();
  return (
  <div className="rounded-xl border border-gray-200 shadow-sm p-5 bg-gradient-to-r from-white to-gray-50/50">
    <div className="flex items-center justify-between mb-4">
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-gray-100 to-gray-200 flex items-center justify-center">
          {icon}
        </div>
        <div>
          <div className="text-lg font-bold text-gray-900">{title}</div>
          {hint && <div className="text-sm text-gray-600">{hint}</div>}
        </div>
      </div>
      <div className="text-sm font-medium px-3 py-1.5 rounded-full bg-gradient-to-r from-gray-100 to-gray-200 text-gray-700 shadow-inner">
        {list.length} poste{list.length > 1 ? 's' : ''}
      </div>
    </div>

    {list.length === 0 ? (
      <EmptyState
        icon={icon}
        title={`Aucun ${title.toLowerCase()}`}
        description="Aucun poste dans cet état pour le moment"
      />
    ) : (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {list.map(s => {
          const ui   = usersCache[s.userId] || {};
          const name = ui.name || s.userName || s.userEmail || s.userId;
          const code = ui.code || s.userCode || '—';
          const live = liveStats[s.id];
          const reservations = (live?.reservations ?? s.totalReservations ?? 0);
          const tickets      = (live?.tickets      ?? s.totalTickets      ?? 0);
          const amount       = (live?.amount       ?? s.totalAmount       ?? 0);

          const statusConfig = {
            active: { label: 'En service', colors: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
            paused: { label: 'En pause', colors: 'bg-amber-50 text-amber-700 border-amber-200' },
            closed: { label: 'Clôturé', colors: 'bg-rose-50 text-rose-700 border-rose-200' },
            pending: { label: 'En attente', colors: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
            validated: { label: 'Validé', colors: 'bg-slate-50 text-slate-700 border-slate-200' },
          }[s.status];

          return (
            <div
              key={s.id}
              className="group relative rounded-xl border border-gray-200 bg-white p-5 
                         hover:border-gray-300 hover:shadow-md transition-all duration-300"
            >
              {/* Effet de survol */}
              <div
                className="absolute inset-0 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300"
                style={{background: `linear-gradient(135deg, ${theme.primary}08, ${theme.secondary}08)`}}
              />

              <div className="relative">
                {/* En-tête */}
                <div className="flex items-start justify-between gap-3 mb-4">
                  <div className="min-w-0">
                    <div className="text-xs font-medium text-gray-500 uppercase tracking-wider">Guichetier</div>
                    <div className="font-semibold text-gray-900 truncate">
                      {name} 
                      <span className="text-gray-500 text-sm ml-2">({code})</span>
                    </div>
                  </div>
                  <span className={`px-3 py-1 rounded-full text-xs font-medium border ${statusConfig.colors}`}>
                    {statusConfig.label}
                  </span>
                </div>

                {/* Statistiques */}
                <div className="grid grid-cols-2 gap-4 mb-4">
                  <InfoCard label="Réservations" value={reservations.toString()} />
                  <InfoCard label="Billets" value={tickets.toString()} />
                  <InfoCard label="Début" value={s.startTime ? new Date(s.startTime.toDate?.() ?? s.startTime).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : '—'} />
                  <InfoCard label="Fin" value={s.endTime ? new Date(s.endTime.toDate?.() ?? s.endTime).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : '—'} />
                </div>

                {/* Montant total */}
                <div className="mb-5 p-3 rounded-xl bg-gradient-to-r from-gray-50 to-gray-100/50 border border-gray-200">
                  <div className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">Montant total</div>
                  <div className="text-xl font-bold" style={{ color: theme.primary }}>
                    {money(amount)}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex justify-end">
                  {actions(s)}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    )}
  </div>
  );
};

const InfoCard: React.FC<{ label: string; value: string; emphasis?: boolean }> = ({ 
  label, 
  value, 
  emphasis = false 
}) => (
  <div>
    <div className="text-xs text-gray-500 mb-1">{label}</div>
    <div className={`font-medium ${emphasis ? 'text-gray-900' : 'text-gray-700'}`}>{value}</div>
  </div>
);

const EmptyState: React.FC<{
  icon: React.ReactNode;
  title: string;
  description: string;
}> = ({ icon, title, description }) => (
  <div className="text-center py-12 px-4 rounded-xl border-2 border-dashed border-gray-300 bg-gradient-to-b from-white to-gray-50/50">
    <div className="inline-flex h-16 w-16 rounded-xl bg-gradient-to-br from-gray-100 to-gray-200 items-center justify-center mb-4">
      {icon}
    </div>
    <div className="text-lg font-medium text-gray-900 mb-2">{title}</div>
    <div className="text-sm text-gray-600 max-w-md mx-auto">{description}</div>
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