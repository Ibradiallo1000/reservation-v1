// src/pages/chef-comptable/ReservationsEnLigne.tsx
import React, { useEffect, useMemo, useState } from 'react';
import {
  collection, query, where, orderBy, limit, doc,
  deleteDoc, onSnapshot, getDoc, updateDoc, serverTimestamp, getDocs, Timestamp
} from 'firebase/firestore';
import { db } from '@/firebaseConfig';
import { getStartOfDayBamako, getEndOfDayBamako, getTodayBamako } from '@/shared/date/dateUtilsTz';
import { useAuth } from '@/contexts/AuthContext';
import useCompanyTheme from '@/shared/hooks/useCompanyTheme';
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
  Copy
} from 'lucide-react';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
import type { Reservation, ReservationStatus } from '@/types/reservation';

/** Réservation avec champs preuve (Firestore peut avoir paymentReference) */
type ReservationWithProof = Reservation & { paymentReference?: string };
import { useFormatCurrency } from '@/shared/currency/CurrencyContext';
import { Button } from '@/shared/ui/button';
import { MetricCard, SectionCard, StatusBadge, type StatusVariant } from '@/ui';
import { upsertCustomerFromReservation } from '@/modules/compagnie/crm/customerService';
import { transitionToConfirmedOrPaidWithDailyStats } from '@/modules/agence/services/reservationStatutService';
import { decrementReservedSeats } from '@/modules/compagnie/tripInstances/tripInstanceService';
import { createCashTransaction } from '@/modules/compagnie/cash/cashService';
import { LOCATION_TYPE } from '@/modules/compagnie/cash/cashTypes';

/** Son Shopify (alarme / preuve reçue) : public/splash/son.mp3 */
const NOTIFICATION_SOUND_URL = '/splash/son.mp3';

/* ================= NORMALISATION DES STATUTS ================= */
const normalizeStatut = (raw?: string): ReservationStatus => {
  if (!raw) return 'en_attente';

  const s = raw.toLowerCase().trim();

  if (s.includes('preuve')) return 'verification';
  if (s.includes('verif')) return 'verification';
  if (s.includes('pay')) return 'confirme';
  if (s.includes('confirm')) return 'confirme';
  if (s.includes('valid')) return 'confirme';
  if (s.includes('refus')) return 'refuse';
  if (s.includes('annul')) return 'annule';
  if (s.includes('cancel')) return 'annule';
  if (s.includes('attente')) return 'en_attente';
  if (s === 'pending') return 'en_attente';

  return 'en_attente';
};

const ITEMS_PER_PAGE = 20;

/* ================= TYPES POUR LA PAGINATION ET FILTRES ================= */
interface FilterOptions {
  period: 'today' | '7days' | '30days';
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
      return { label: 'Confirmé', statusVariant: 'success', icon: <CheckCircle className="h-3 w-3" />, priority: 2 };
    case 'refuse':
      return { label: 'Refusé', statusVariant: 'danger', icon: <XCircle className="h-3 w-3" />, priority: 3 };
    case 'annule':
      return { label: 'Annulé', statusVariant: 'neutral', icon: <XCircle className="h-3 w-3" />, priority: 4 };
    default:
      return { label: 'Inconnu', statusVariant: 'neutral', icon: <AlertCircle className="h-3 w-3" />, priority: 5 };
  }
};

/* ================= COMPOSANT PRINCIPAL ================= */
/** Construit l'URL publique du billet pour une réservation */
const getBilletUrl = (r: Reservation, companySlugFallback?: string) => {
  const slug = r.companySlug || companySlugFallback || '';
  if (!slug || !r.id) return '';
  return `${typeof window !== 'undefined' ? window.location.origin : ''}/${slug}/reservation/${r.id}`;
};

/** Message de confirmation pour WhatsApp / copie (sauts de ligne pour lisibilité) */
const getBilletConfirmationMessage = (r: Reservation, billetUrl: string) => {
  const trajet = [r.depart, r.arrivee].filter(Boolean).join(' → ') || 'Trajet';
  const date = r.date || '';
  const lines = [
    'Bonjour,',
    '',
    'Votre billet a été validé.',
    '',
    `Trajet : ${trajet}`,
    ...(date ? [`Date : ${date}`] : []),
    '',
    'Voir votre billet :',
    billetUrl,
    '',
    'Merci.',
  ];
  return lines.join('\n');
};

/** Numéro au format wa.me (chiffres uniquement, sans +) */
const toWhatsAppPhone = (phone: string) => (phone || '').replace(/\D/g, '');

const ReservationsEnLigne: React.FC = () => {
  const { user, company } = useAuth() as any;
  const navigate = useNavigate();
  const theme = useCompanyTheme(company) || { primary: '#2563eb', secondary: '#3b82f6' };
  const money = useFormatCurrency();
  const { initializeAudio, playNotification, resetNotification, playSoundNow, isAudioReady } = useNotificationSound();

  const [verificationReservations, setVerificationReservations] = useState<Reservation[]>([]);
  /** Réservations venant d'être validées : on garde la carte visible avec "Billet validé" + actions */
  const [recentlyValidatedReservations, setRecentlyValidatedReservations] = useState<Reservation[]>([]);
  const [otherReservations, setOtherReservations] = useState<Reservation[]>([]);
  const [agencies, setAgencies] = useState<Record<string, {name: string, ville: string}>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<ReservationStatus | ''>('');
  const [otherPage, setOtherPage] = useState(1);
  const [showStats, setShowStats] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [filterPeriod, setFilterPeriod] = useState<FilterOptions['period']>('7days');

  /* ================= FONCTIONS UTILITAIRES DATE ================= */
  const getPeriodDates = (period: FilterOptions['period']) => {
    const now = new Date();
    const start = new Date();
    
    switch (period) {
      case 'today':
        start.setHours(0, 0, 0, 0);
        break;
      case '7days':
        start.setDate(start.getDate() - 7);
        start.setHours(0, 0, 0, 0);
        break;
      case '30days':
        start.setDate(start.getDate() - 30);
        start.setHours(0, 0, 0, 0);
        break;
    }
    
    return { start, end: now };
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

        // Écouter en temps réel uniquement les réservations à vérifier (preuve_recue)
        agenceIds.forEach((agencyId) => {
          const qRef = query(
            collection(db, 'companies', user.companyId!, 'agences', agencyId, 'reservations'),
            where('statut', '==', 'preuve_recue'),
            orderBy('createdAt', 'desc')
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
                const row: Reservation = {
                  ...d,
                  id: chg.doc.id,
                  companyId: d.companyId ?? user.companyId!,
                  agencyId: d.agencyId ?? agencyId,
                  statut: normalizeStatut(d.statut),
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

        // Charger les autres réservations (non vérification) une seule fois, paginé
        loadOtherReservations();
        
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
        // 🔧 CORRECTION : Charger tous les statuts sauf 'preuve_recue' (qui est géré en temps réel)
        const qRef = query(
          collection(db, 'companies', user.companyId!, 'agences', agencyId, 'reservations'),
          where('statut', 'not-in', ['preuve_recue']),
          orderBy('createdAt', 'desc'),
          limit(ITEMS_PER_PAGE * page)
        );

        const snap = await getDocs(qRef);
        snap.docs.forEach(doc => {
          const d = doc.data() as any;
          const normalizedStatus = normalizeStatut(d.statut);
          
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
    if (period === 'today') {
      // Pour "aujourd'hui", filtrer en fuseau Africa/Bamako (cohérent avec les dashboards)
      const todayStart = getStartOfDayBamako();
      const todayEnd = getEndOfDayBamako();

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

        return reservationDate >= todayStart && reservationDate <= todayEnd;
      });
    }
    
    const { start } = getPeriodDates(period);
    
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
      
      return reservationDate >= start;
    });
  };

  /* ================= CORRECTION DU BUG DU FILTRE "CONFIRMÉES" ================= */
  const filteredReservations = useMemo(() => {
    // Appliquer d'abord le filtre par période
    const periodFiltered = filterReservationsByPeriod(allReservations, filterPeriod);
    
    // Puis appliquer le filtre par statut
    let result = periodFiltered;
    
    if (filterStatus === 'verification') {
      // Pour le filtre "verification", on utilise uniquement verificationReservations
      result = filterReservationsByPeriod(verificationReservations, filterPeriod);
    } else if (filterStatus) {
      // 🔧 CORRECTION CRITIQUE : Bien filtrer par statut normalisé
      result = periodFiltered.filter(r => r.statut === filterStatus);
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
  }, [allReservations, verificationReservations, searchTerm, filterStatus, filterPeriod]);

  /* ================= STATISTIQUES AVEC FILTRE DE PÉRIODE ================= */
  const stats = useMemo(() => {
    const periodFiltered = filterReservationsByPeriod(allReservations, filterPeriod);
    
    // 🔧 CORRECTION : Statistiques cohérentes avec les listes affichées
    const verificationInPeriod = filterReservationsByPeriod(verificationReservations, filterPeriod);
    
    return {
      enAttente: periodFiltered.filter(r => r.statut === 'en_attente').length,
      verification: verificationInPeriod.length,
      confirme: periodFiltered.filter(r => r.statut === 'confirme').length,
      refuse: periodFiltered.filter(r => r.statut === 'refuse').length,
      annule: periodFiltered.filter(r => r.statut === 'annule').length,
      total: periodFiltered.length,
      totalAmount: periodFiltered.reduce((sum, r) => sum + (r.montant || 0), 0)
    };
  }, [allReservations, verificationReservations, filterPeriod]);

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
      const currentStatut = (data?.statut ?? '').toString().toLowerCase();
      if (currentStatut !== 'preuve_recue') {
        toast.error('Erreur', { description: 'Cette réservation ne peut plus être confirmée' });
        return;
      }
      await transitionToConfirmedOrPaidWithDailyStats(
        reservationRef,
        'confirme',
        { userId: user.uid ?? '', userRole: (user as { role?: string }).role ?? '' },
        { validatedBy: user.uid ?? '', validatedAt: serverTimestamp() }
      );

      const montant = Number(data?.montant ?? reservation.montant ?? 0);
      if (montant > 0) {
        try {
          const paymentMethod = (data?.paymentMethod ?? data?.paiement ?? 'transfer').toString();
          const cashTxId = await createCashTransaction({
            companyId: user.companyId,
            reservationId: reservation.id,
            tripInstanceId: data?.tripInstanceId ?? undefined,
            amount: montant,
            currency: 'XOF',
            paymentMethod: paymentMethod === 'mobile_money' ? 'mobile_money' : paymentMethod === 'virement' ? 'transfer' : 'transfer',
            locationType: LOCATION_TYPE.AGENCE,
            locationId: reservation.agencyId,
            routeId: data?.routeId ?? undefined,
            createdBy: user.uid ?? '',
            paidAt: getTodayBamako(),
          });
          await updateDoc(reservationRef, {
            cashTransactionId: cashTxId,
            paymentStatus: 'paid',
            paymentMethod: data?.paymentMethod ?? data?.paiement ?? 'transfer',
          });
        } catch (err) {
          console.error('[ReservationsEnLigne] createCashTransaction on confirm:', err);
        }
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
      
      // Réinitialiser la notification pour cette réservation
      resetNotification(`${reservation.agencyId}_${reservation.id}`);
      
      // Recharger les autres réservations pour l'historique
      setTimeout(() => {
        loadOtherReservations(otherPage);
      }, 500);
      
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
      const inputReason = window.prompt('Raison du refus ?') ?? '';
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
      const currentStatut = (data?.statut ?? '').toString().toLowerCase();
      if (currentStatut !== 'preuve_recue') {
        toast.error('Erreur', { description: 'Cette réservation ne peut plus être refusée' });
        return;
      }
      await updateDoc(reservationRef, {
        statut: 'refuse',
        refusedBy: user.uid ?? '',
        refusedAt: serverTimestamp(),
        refusalReason: inputReason.trim() || 'Raison non spécifiée',
      });

      const tripInstanceId = data.tripInstanceId ?? null;
      const seats = (data.seatsGo ?? 0) + (data.seatsReturn ?? 0);
      if (tripInstanceId && seats > 0) {
        decrementReservedSeats(user.companyId, tripInstanceId, seats).catch((err) => {
          console.error('[ReservationsEnLigne] decrementReservedSeats on refuse:', err);
        });
      }
      
      // Retirer de la liste des réservations à vérifier
      setVerificationReservations(prev => 
        prev.filter(r => !(r.id === reservation.id && r.agencyId === reservation.agencyId))
      );
      
      // Réinitialiser la notification pour cette réservation
      resetNotification(`${reservation.agencyId}_${reservation.id}`);
      
      // Recharger les autres réservations pour inclure celle-ci dans la liste refusée
      setTimeout(() => {
        loadOtherReservations(otherPage);
      }, 500);
      
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

  /* ================= RENDU ================= */
  return (
    <div className="space-y-6">
      {/* ================= EN-TÊTE ================= */}
      <SectionCard
        title="Réservations en ligne"
        help={<span className="text-sm font-normal text-gray-500">Gestion des réservations et paiements</span>}
        right={
          <button
            onClick={handleRefresh}
            className="p-2.5 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-xl transition-colors"
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
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="text"
                className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-xl bg-white focus:outline-none focus:ring-2 focus:border-transparent"
                style={{ outlineColor: theme.primary }}
                placeholder="Rechercher par nom, téléphone ou référence..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>
          
          <div>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value as ReservationStatus | '')}
              className="w-full border border-gray-300 rounded-xl px-4 py-2.5 bg-white focus:outline-none focus:ring-2 focus:border-transparent"
              style={{ outlineColor: theme.primary }}
            >
              <option value="">Toutes les réservations</option>
              <option value="verification">En attente de validation ({stats.verification})</option>
              <option value="en_attente">En attente ({stats.enAttente})</option>
              <option value="confirme">Réservations confirmées ({stats.confirme})</option>
              <option value="refuse">Refusées ({stats.refuse})</option>
              <option value="annule">Annulées ({stats.annule})</option>
            </select>
          </div>
          
          <div>
            <select
              value={filterPeriod}
              onChange={(e) => setFilterPeriod(e.target.value as FilterOptions['period'])}
              className="w-full border border-gray-300 rounded-xl px-4 py-2.5 bg-white focus:outline-none focus:ring-2 focus:border-transparent"
              style={{ outlineColor: theme.primary }}
            >
              <option value="today">Aujourd'hui</option>
              <option value="7days">7 derniers jours</option>
              <option value="30days">30 derniers jours</option>
            </select>
          </div>
        </div>
        
        <div className="mt-3 flex gap-2">
          <button 
            onClick={() => setShowStats(!showStats)}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border-2 border-gray-200 bg-white text-gray-700 font-medium shadow-sm hover:shadow-md hover:border-gray-300 hover:bg-gray-50 transition-all duration-200"
          >
            {showStats ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            {showStats ? 'Masquer les stats' : 'Afficher les stats'}
          </button>
          <Button variant="primary" className="flex-1">
            <Download className="h-4 w-4 mr-2" />
            Exporter
          </Button>
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
            title={`Période : ${filterPeriod === 'today' ? 'Aujourd\'hui' : filterPeriod === '7days' ? '7 derniers jours' : '30 derniers jours'}`}
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
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[
              ...recentlyValidatedReservations,
              ...filterReservationsByPeriod(verificationReservations, filterPeriod).filter(
                r => !recentlyValidatedReservations.some(v => v.id === r.id && v.agencyId === r.agencyId)
              ),
            ]
              .filter(r => !searchTerm || 
                [r.clientNom, r.telephone, r.referenceCode, (r as ReservationWithProof).paymentReference, r.preuveMessage]
                  .join(' ')
                  .toLowerCase()
                  .includes(searchTerm.toLowerCase())
              )
              .map((reservation) => {
                const isJustValidated = recentlyValidatedReservations.some(
                  v => v.id === reservation.id && v.agencyId === reservation.agencyId
                );
                const billetUrl = getBilletUrl(reservation, (company as { slug?: string })?.slug);
                const confirmationMessage = getBilletConfirmationMessage(reservation, billetUrl);
                const phoneForWhatsApp = toWhatsAppPhone(reservation.telephone || '');
                const whatsAppUrl = phoneForWhatsApp
                  ? `https://wa.me/${phoneForWhatsApp}?text=${encodeURIComponent(confirmationMessage)}`
                  : '';

                if (isJustValidated) {
                  return (
                    <div
                      id={`reservation-${reservation.id}`}
                      key={`validated-${reservation.agencyId}_${reservation.id}`}
                      className="border border-green-200 rounded-xl overflow-hidden bg-white shadow-md"
                    >
                      {/* Bandeau vert : Billet validé */}
                      <div className="flex items-center justify-center gap-2 py-3 px-4 bg-green-600 text-white">
                        <CheckCircle className="h-5 w-5 shrink-0" aria-hidden />
                        <span className="font-semibold">Billet validé</span>
                        {reservation.referenceCode && (
                          <span className="ml-auto text-xs font-mono text-green-100">#{reservation.referenceCode}</span>
                        )}
                      </div>
                      <div className="px-4 py-2 border-b border-gray-100 bg-gray-50/50">
                        <p className="text-sm text-gray-700">
                          {reservation.clientNom || 'Client'} · {reservation.depart || '—'} → {reservation.arrivee || '—'}
                        </p>
                      </div>
                      {/* Actions */}
                      <div className="p-4">
                        <div className="flex flex-col gap-2">
                          <a
                            href={billetUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center justify-center gap-2 w-full rounded-lg font-medium transition focus:outline-none focus:ring-2 focus:ring-offset-2 h-10 px-4 py-2 bg-[var(--btn-primary,#FF6600)] text-white hover:brightness-90 active:brightness-85 disabled:pointer-events-none disabled:opacity-50"
                          >
                            <Eye className="h-4 w-4" />
                            Voir billet
                          </a>
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
                            className="w-full flex items-center justify-center gap-2 border-green-300 text-green-800 hover:bg-green-50"
                            onClick={() => {
                              if (whatsAppUrl) {
                                window.open(whatsAppUrl, '_blank');
                                toast.success('WhatsApp ouvert avec le message prêt');
                              }
                            }}
                            disabled={!phoneForWhatsApp}
                          >
                            <MessageCircle className="h-4 w-4" />
                            Envoyer WhatsApp
                          </Button>
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
                        </div>
                      </div>
                    </div>
                  );
                }

                const statusConfig = getStatusConfig(reservation.statut);
                const isProcessing = processingId === reservation.id;
                const proofUrl = getProofUrl(reservation);
                const agencyInfo = reservation.agencyId ? agencies[reservation.agencyId] : null;

                return (
                  <div
                    id={`reservation-${reservation.id}`}
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
                        <StatusBadge status="warning">À vérifier</StatusBadge>
                      </div>
                      
                      {reservation.referenceCode && (
                        <div className="text-xs font-mono text-gray-600">
                          #{reservation.referenceCode}
                        </div>
                      )}
                    </div>
                    
                    {/* Détails de la réservation - INFORMATIONS CRITIQUES VISIBLES */}
                    <div className="p-4 space-y-3">
                      {/* 📞 Numéro de téléphone du client - PRIORITÉ ABSOLUE */}
                      <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
                        <div className="flex items-center gap-2 mb-1">
                          <Smartphone className="h-4 w-4 text-gray-600" />
                          <span className="text-sm font-medium text-gray-700">Téléphone client</span>
                        </div>
                        <div className="text-lg font-bold text-gray-900">
                          {reservation.telephone || 'Non renseigné'}
                        </div>
                      </div>

                      {/* 🧾 Preuve de paiement - PRIORITÉ ABSOLUE */}
                      {((reservation as ReservationWithProof).paymentReference || reservation.preuveMessage) && (
                        <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
                          <div className="flex items-center gap-2 mb-1">
                            <FileText className="h-4 w-4 text-gray-600" />
                            <span className="text-sm font-medium text-gray-700">Référence / Message</span>
                          </div>
                          <div className="text-sm text-gray-800">
                            {(reservation as ReservationWithProof).paymentReference || reservation.preuveMessage}
                          </div>
                        </div>
                      )}

                      {/* Informations supplémentaires */}
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-gray-500">Client</span>
                          <span className="text-sm font-medium text-gray-900 truncate max-w-[150px] text-right">
                            {reservation.clientNom || 'Sans nom'}
                          </span>
                        </div>
                        
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-gray-500">Trajet</span>
                          <span className="text-sm font-medium text-gray-900 text-right">
                            {reservation.depart || 'N/A'} → {reservation.arrivee || 'N/A'}
                          </span>
                        </div>
                        
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-gray-500">Montant</span>
                          <span className="text-sm font-bold text-gray-900">
                            {fmtMoney(reservation.montant || 0)}
                          </span>
                        </div>
                      </div>
                      
                      {/* Lien vers la preuve de paiement si disponible - PRIORITÉ ABSOLUE */}
                      {proofUrl && (
                        <a
                          href={proofUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-2 text-sm text-blue-600 hover:text-blue-800 font-medium p-2 rounded-lg hover:bg-blue-50 w-full justify-center border border-blue-200"
                        >
                          <FileText className="h-4 w-4" />
                          Voir le justificatif
                        </a>
                      )}
                      
                      {/* Date de création */}
                      <div className="text-xs text-gray-400">
                        Reçu le: {fmtDate(reservation.createdAt)}
                      </div>
                    </div>
                    
                    {/* Actions */}
                    <div className="p-4 border-t border-gray-200 bg-gray-50/50 space-y-2">
                      <div className="grid grid-cols-2 gap-2">
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
                          className="border-red-300 text-red-700 hover:bg-red-50"
                        >
                          <XCircle className="h-4 w-4" />
                          Refuser
                        </Button>
                      </div>
                      
                      <div className="grid grid-cols-2 gap-2">
                        <Button 
                          variant="secondary"
                          onClick={() => handleViewDetails(reservation)}
                          className="flex items-center justify-center gap-2"
                        >
                          <Eye className="h-4 w-4" />
                          Détails
                        </Button>
                        <Button 
                          variant="secondary"
                          onClick={() => handleDelete(reservation)}
                          disabled={isProcessing}
                        >
                          Supprimer
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })}
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
                            <div className="p-4 space-y-2">
                              <div className="flex items-center justify-between">
                                <span className="text-sm text-gray-500">Client</span>
                                <span className="text-sm font-medium text-gray-900">
                                  {reservation.clientNom || 'Sans nom'}
                                </span>
                              </div>
                              
                              {/* 📞 Téléphone toujours visible */}
                              <div className="flex items-center justify-between">
                                <span className="text-sm text-gray-500">Téléphone</span>
                                <span className="text-sm font-medium text-gray-900">
                                  {reservation.telephone || 'N/A'}
                                </span>
                              </div>
                              
                              <div className="flex items-center justify-between">
                                <span className="text-sm text-gray-500">Montant</span>
                                <span className="text-sm font-bold text-gray-900">
                                  {fmtMoney(reservation.montant || 0)}
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
  );
};

export default ReservationsEnLigne;