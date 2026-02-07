// src/pages/ReservationClientPage.tsx
import React, { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import { useParams, useLocation, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { format, isToday, isTomorrow, parseISO, parse } from 'date-fns';
import { fr } from 'date-fns/locale';
import { ChevronLeft, Phone, Plus, Minus, CheckCircle, Upload, User, AlertCircle, ArrowRight, Info, Clock, Check } from 'lucide-react';
import {
  collection, getDocs, query, where, addDoc, doc, updateDoc, serverTimestamp, getDoc,
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from '@/firebaseConfig';
import { Trip } from '@/types';
import { generateWebReferenceCode } from '@/utils/tickets';

/* ============== Anti-spam: mémoire locale ============== */
const PENDING_KEY = 'pendingReservation';
const isBlockingStatus = (s?: string) =>
  ['en_attente', 'en_attente_paiement', 'paiement_en_cours', 'preuve_recue'].includes(String(s || '').toLowerCase());
const rememberPending = (payload: { slug: string; id: string; referenceCode?: string; status: string; companyId?: string; agencyId?: string; }) => {
  try { localStorage.setItem(PENDING_KEY, JSON.stringify(payload)); } catch {}
};
const readPending = (): { slug: string; id: string; referenceCode?: string; status: string; companyId?: string; agencyId?: string; } | null => {
  try { const r = localStorage.getItem(PENDING_KEY); return r ? JSON.parse(r) : null; } catch { return null; }
};
const clearPendingIfNotBlocking = () => {
  try {
    const raw = localStorage.getItem(PENDING_KEY);
    if (!raw) return;
    const p = JSON.parse(raw);
    if (!isBlockingStatus(p?.status)) localStorage.removeItem(PENDING_KEY);
  } catch {}
};
const clearPending = () => {
  try { localStorage.removeItem(PENDING_KEY); } catch {}
};
/* ======================================================= */

// util pour token public
const randomToken = () => Math.random().toString(36).slice(2, 8).toUpperCase();

// ---------- helpers ----------
const normalize = (s: string) =>
  s?.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/-/g,' ').replace(/\s+/g,' ') || '';
const toYMD = (d: Date) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
const formatCity = (s: string) => s ? s.charAt(0).toUpperCase()+s.slice(1).toLowerCase() : s;
const addMin = (d: Date, m: number) => new Date(d.getTime() + m*60000);
const DAYS = ['dimanche','lundi','mardi','mercredi','jeudi','vendredi','samedi'];

type ExistingReservation = {
  id: string;
  companyId: string;
  agencyId: string;
  canal?: string;
  statut?: string;
  nomClient?: string;
  telephone?: string;
  depart?: string;
  arrivee?: string;
  date?: string;
  heure?: string;
  montant?: number;
  seatsGo?: number;
  referenceCode?: string;
};

// ===== Téléphone Mali (8 chiffres, format 22 22 22 22) =====
const formatMaliPhone = (value: string) => {
  const digits = value.replace(/\D/g, '').slice(0, 8); // uniquement chiffres, max 8
  return digits.replace(/(\d{2})(?=\d)/g, '$1 ').trim();
};

const isValidMaliPhone = (value: string) => {
  return value.replace(/\s/g, '').length === 8;
};

// Composant réutilisable pour la preuve de paiement
const PaymentProofSection = ({ 
  reservationId,
  paymentMethods,
  paymentMethodKey,
  onChoosePayment,
  message,
  setMessage,
  referenceInputRef,
  canConfirm,
  submitProofInline,
  uploading,
  paymentHints,
  existing,
  selectedTrip,
  seats,
  theme
}: {
  reservationId: string | null;
  paymentMethods: Record<string, {
    url?: string; logoUrl?: string; ussdPattern?: string; merchantNumber?: string;
  }>;
  paymentMethodKey: string | null;
  onChoosePayment: (key: string) => void;
  message: string;
  setMessage: (message: string) => void;
  referenceInputRef: React.RefObject<HTMLTextAreaElement>;
  canConfirm: boolean;
  submitProofInline: () => Promise<void>;
  uploading: boolean;
  paymentHints: string;
  existing: ExistingReservation | null;
  selectedTrip: any;
  seats: number;
  theme: any;
}) => {
  const isLocked = (existing?.statut === 'preuve_recue' || existing?.statut === 'confirme') ?? false;
  const isProofSent = existing?.statut === 'preuve_recue';
  const isConfirmed = existing?.statut === 'confirme';
  const hasChosenPayment = !!paymentMethodKey;
  
  return (
    <section className="bg-white rounded-2xl border border-gray-100 p-4">
      <h2 className="text-sm font-semibold text-gray-900 mb-2">
        {reservationId ? 'Paiement' : 'Preuve de paiement'}
      </h2>

      {isProofSent && (
        <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
          <div className="flex items-center gap-2 text-blue-800">
            <Clock className="w-4 h-4" />
            <span className="text-sm font-medium">Preuve envoyée</span>
          </div>
          <p className="text-xs text-blue-700 mt-1">
            Votre preuve de paiement est en cours de vérification par la compagnie.
          </p>
        </div>
      )}

      {isConfirmed && (
        <div className="mb-4 p-3 bg-emerald-50 border border-emerald-200 rounded-lg">
          <div className="flex items-center gap-2 text-emerald-800">
            <Check className="w-4 h-4" />
            <span className="text-sm font-medium">Paiement confirmé</span>
          </div>
          <p className="text-xs text-emerald-700 mt-1">
            Votre paiement a été validé. Votre billet est confirmé.
          </p>
        </div>
      )}

      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
        {Object.entries(paymentMethods).map(([k,m]) => m && (
          <button
            key={k}
            onClick={() => !isLocked && onChoosePayment(k)}
            disabled={isLocked}
            className={`h-12 px-3 rounded-xl border flex items-center gap-2 text-sm w-full transition ${
              isLocked ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'
            } ${paymentMethodKey === k ? 'bg-white shadow-sm' : 'bg-gray-50 hover:bg-gray-100'}`}
            style={{ 
              borderColor: paymentMethodKey === k ? theme.primary : '#e5e7eb',
              cursor: isLocked ? 'not-allowed' : 'pointer'
            }}
            title={isLocked ? "Le paiement a déjà été traité" : ""}
          >
            {m.logoUrl ? (
              <img src={m.logoUrl} alt={k} className="h-6 w-6 object-contain rounded" />
            ) : (
              <div className="h-6 w-6 rounded bg-gray-100" />
            )}
            <div className="text-left min-w-0">
              <div className="font-medium capitalize truncate">{k.replace(/_/g,' ')}</div>
              {m.merchantNumber && (
                <div className="text-[11px] text-gray-500 truncate">N° {m.merchantNumber}</div>
              )}
            </div>
            {paymentMethodKey === k && !isLocked && (
              <div 
                className="ml-auto h-5 w-5 rounded-full flex items-center justify-center" 
                style={{ backgroundColor: theme.primary, color: '#fff' }}
              >
                <CheckCircle className="w-3 h-3" />
              </div>
            )}
          </button>
        ))}
      </div>

      {/* Section preuve de paiement - UNIQUEMENT visible après choix d'un moyen de paiement */}
      {hasChosenPayment && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="mt-4"
        >
          <div className="mb-3">
            <h3 className="text-sm font-semibold text-gray-900 mb-2">Preuve de paiement</h3>
            <p className="text-xs text-gray-600 mb-3">{paymentHints}</p>
            
            {paymentMethodKey && paymentMethods[paymentMethodKey]?.ussdPattern && !isLocked && (
              <div className="mt-1 text-xs text-gray-600">
                Code USSD : <span className="font-mono bg-gray-50 px-2 py-1 rounded">
                  {paymentMethods[paymentMethodKey]!.ussdPattern!
                    .replace('MERCHANT', paymentMethods[paymentMethodKey]!.merchantNumber || '')
                    .replace('AMOUNT', String(
                      existing?.montant || (selectedTrip ? selectedTrip.price * seats : 0)
                    ))}
                </span>
              </div>
            )}
          </div>

          {!isLocked && (
            <>
              <div className="mt-3">
                <div>
                  <textarea
                    ref={referenceInputRef}
                    rows={3}
                    className="w-full border border-gray-200 rounded-lg p-3 text-sm focus:ring-2 focus:outline-none"
                    placeholder="Ex : code reçu par SMS (ex. 123456) ou n° de transfert"
                    value={message}
                    onChange={e => setMessage(e.target.value)}
                  />
                  <div className="text-xs text-gray-500 mt-1">
                    Minimum 4 caractères
                  </div>
                </div>
              </div>

              <div className="mt-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div className="text-xs text-amber-600">
                  {!canConfirm && paymentMethodKey && (
                    <span className="flex items-center gap-1">
                      <AlertCircle className="w-3 h-3" />
                      Entrez une référence (≥ 4 caractères)
                    </span>
                  )}
                </div>
                <button
                  onClick={submitProofInline}
                  disabled={uploading || !canConfirm || isLocked}
                  title={!canConfirm ? "Ajoutez la référence" : isLocked ? "Le paiement a déjà été traité" : ""}
                  className="h-11 px-5 rounded-xl font-semibold shadow-sm disabled:opacity-60 disabled:cursor-not-allowed transition hover:brightness-[0.98]"
                  style={{ background: `linear-gradient(135deg, ${theme.primary}, ${theme.secondary})`, color: '#fff' }}
                >
                  {uploading ? 'Envoi…' : 'Confirmer l\'envoi'}
                </button>
              </div>
            </>
          )}
        </motion.div>
      )}

      {/* Message d'instruction quand aucun moyen n'a encore été choisi */}
      {!hasChosenPayment && !isLocked && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="mt-4 p-3 bg-gray-50 border border-gray-200 rounded-lg"
        >
          <div className="flex items-center gap-2 text-gray-700">
            <Info className="w-4 h-4 text-gray-500" />
            <p className="text-xs">
              Choisissez un moyen de paiement ci-dessus pour continuer.
            </p>
          </div>
        </motion.div>
      )}
    </section>
  );
};

export default function ReservationClientPage() {
  const { slug, id: reservationRouteId } = useParams<{ slug: string; id?: string }>();
  const location = useLocation();
  const navigate = useNavigate();

  // Refs pour le scroll automatique
  const paymentSectionRef = useRef<HTMLDivElement>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const phoneInputRef = useRef<HTMLInputElement>(null);
  const referenceInputRef = useRef<HTMLTextAreaElement>(null);

  const routeState = (location.state || {}) as { companyId?: string; agencyId?: string };

  const search = new URLSearchParams(location.search);
  const departureQ = normalize(search.get('departure') || '');
  const arrivalQ   = normalize(search.get('arrival') || '');

  const [company, setCompany] = useState({ 
    id: '', 
    name: '', 
    couleurPrimaire: '#f43f5e', 
    couleurSecondaire: '#f97316', 
    logoUrl: '', 
    code: 'MT' 
  });
  const theme = useMemo(() => ({
    primary: company.couleurPrimaire,
    secondary: company.couleurSecondaire,
    lightPrimary: `${company.couleurPrimaire}1A`,
    lightSecondary: `${company.couleurSecondaire}1A`,
  }), [company]);

  const [agencyInfo, setAgencyInfo] = useState<{
    id?: string; 
    nom?: string; 
    telephone?: string; 
    code?: string;
  }>({});
  const [paymentMethods, setPaymentMethods] = useState<Record<string, {
    url?: string; logoUrl?: string; ussdPattern?: string; merchantNumber?: string;
  }>>({});
  const [paymentMethodKey, setPaymentMethodKey] = useState<string | null>(null);
  const [paymentTriggeredAt, setPaymentTriggeredAt] = useState<number | null>(null);

  const [trips, setTrips] = useState<Trip[]>([]);
  const [dates, setDates] = useState<string[]>([]);
  const [selectedDate, setSelectedDate] = useState('');
  const [selectedTime, setSelectedTime] = useState('');
  const [seats, setSeats] = useState(1);
  const [passenger, setPassenger] = useState({ fullName: '', phone: '' });

  const [message, setMessage] = useState('');
  const [reservationId, setReservationId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [uploading, setUploading] = useState(false);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const [existing, setExisting] = useState<ExistingReservation | null>(null);
  const [showPaymentPopup, setShowPaymentPopup] = useState(false);
  const [currentStep, setCurrentStep] = useState<'personal' | 'payment' | 'proof'>('personal');

  // ========== Variable centrale de vérité ==========
  const hasActiveReservation = useMemo(() => {
    if (existing) {
      const statut = String(existing.statut || '').toLowerCase();
      return isBlockingStatus(statut);
    }
    if (reservationId) return true;
    const p = readPending();
    return Boolean(p && isBlockingStatus(p.status) && p.slug === slug);
  }, [reservationId, existing, slug]);

  // ========== Effets ==========
  useEffect(() => {
    clearPendingIfNotBlocking();
    const p = readPending();
    if (p && isBlockingStatus(p.status) && p.slug === slug && !reservationRouteId) {
      navigate(`/${slug}/reservation/${p.id}`, { 
        replace: true, 
        state: { companyId: p.companyId, agencyId: p.agencyId } 
      });
    }
  }, [slug, navigate, reservationRouteId]);

  // Nettoyer le pending si la réservation est confirmée
  useEffect(() => {
    if (existing?.statut === 'confirme') {
      clearPending();
    }
  }, [existing?.statut]);

  // Mode consultation
  useEffect(() => {
    const loadExisting = async () => {
      if (!reservationRouteId) return;
      setLoading(true);
      try {
        if (!routeState.companyId || !routeState.agencyId) {
          setError("Information manquante (company/agency). Revenez en arrière et réessayez.");
          setLoading(false);
          return;
        }

        const refDoc = doc(db, 'companies', routeState.companyId, 'agences', routeState.agencyId, 'reservations', reservationRouteId);
        const snap = await getDoc(refDoc);
        if (!snap.exists()) {
          setError("Réservation introuvable.");
          setLoading(false);
          return;
        }
        const r = snap.data() as any;

        const compSnap = await getDoc(doc(db, 'companies', routeState.companyId));
        const comp = compSnap.exists() ? (compSnap.data() as any) : {};
        setCompany({
          id: routeState.companyId,
          name: comp.nom || comp.name || '',
          code: (comp.code || 'MT').toString().toUpperCase(),
          couleurPrimaire: comp.couleurPrimaire || '#f43f5e',
          couleurSecondaire: comp.couleurSecondaire || '#f97316',
          logoUrl: comp.logoUrl || ''
        });

        const agSnap = await getDoc(doc(db, 'companies', routeState.companyId, 'agences', routeState.agencyId));
        const ag = agSnap.exists() ? (agSnap.data() as any) : {};
        setAgencyInfo({
          id: routeState.agencyId,
          nom: ag.nomAgence || ag.nom || ag.name || 'Agence',
          telephone: ag.telephone,
          code: (ag.code || ag.codeAgence || '').toString().toUpperCase() || undefined
        });

        const pmSnap = await getDocs(query(
          collection(db, 'paymentMethods'), 
          where('companyId', '==', routeState.companyId)
        ));
        const pms: any = {};
        pmSnap.forEach(ds => {
          const d = ds.data() as any;
          if (d.name) pms[d.name] = { 
            url: d.defaultPaymentUrl || '', 
            logoUrl: d.logoUrl || '', 
            ussdPattern: d.ussdPattern || '', 
            merchantNumber: d.merchantNumber || '' 
          };
        });
        setPaymentMethods(pms);

        setExisting({
          id: reservationRouteId,
          companyId: routeState.companyId,
          agencyId: routeState.agencyId,
          canal: r.canal,
          statut: r.statut,
          nomClient: r.nomClient,
          telephone: r.telephone,
          depart: r.depart,
          arrivee: r.arrivee || r.arrival,
          date: r.date,
          heure: r.heure,
          montant: r.montant ?? r.montant_total,
          seatsGo: r.seatsGo,
          referenceCode: r.referenceCode
        });

        setReservationId(reservationRouteId);
        setLoading(false);
      } catch (e: any) {
        console.error(e);
        setError(e?.message || "Erreur de chargement");
        setLoading(false);
      }
    };

    void loadExisting();
  }, [reservationRouteId, routeState.companyId, routeState.agencyId]);

  // Mode création
  useEffect(() => {
    if (reservationRouteId) return;
    if (!slug || !departureQ || !arrivalQ) { 
      setLoading(false); 
      return; 
    }

    const load = async () => {
      setLoading(true);
      try {
        const cSnap = await getDocs(query(collection(db, 'companies'), where('slug', '==', slug)));
        if (cSnap.empty) throw new Error('Compagnie introuvable');
        const cdoc = cSnap.docs[0]; 
        const cdata = cdoc.data() as any;

        setCompany({
          id: cdoc.id,
          name: cdata.nom || cdata.name || '',
          code: (cdata.code || 'MT').toString().toUpperCase(),
          couleurPrimaire: cdata.couleurPrimaire || '#f43f5e',
          couleurSecondaire: cdata.couleurSecondaire || '#f97316',
          logoUrl: cdata.logoUrl || ''
        });

        const agencesSnap = await getDocs(collection(db, 'companies', cdoc.id, 'agences'));
        const agences = agencesSnap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));
        if (agences[0]) {
          const a = agences[0];
          setAgencyInfo({
            id: a.id,
            nom: a.nomAgence || a.nom || a.name,
            telephone: a.telephone,
            code: (a.code || a.codeAgence || '').toString().toUpperCase() || undefined
          });
        }

        const pmSnap = await getDocs(query(
          collection(db, 'paymentMethods'), 
          where('companyId', '==', cdoc.id)
        ));
        const pms: any = {};
        pmSnap.forEach(ds => {
          const d = ds.data() as any;
          if (d.name) pms[d.name] = { 
            url: d.defaultPaymentUrl || '', 
            logoUrl: d.logoUrl || '', 
            ussdPattern: d.ussdPattern || '', 
            merchantNumber: d.merchantNumber || '' 
          };
        });
        setPaymentMethods(pms);

        const next8 = Array.from({ length: 8 }, (_, i) => { 
          const d = new Date(); 
          d.setDate(d.getDate() + i); 
          return toYMD(d); 
        });

        const allTrips: Trip[] = [];
        for (const a of agences) {
          const [wSnap, rSnap] = await Promise.all([
            getDocs(query(
              collection(db, 'companies', cdoc.id, 'agences', a.id, 'weeklyTrips'), 
              where('active', '==', true)
            )),
            getDocs(collection(db, 'companies', cdoc.id, 'agences', a.id, 'reservations'))
          ]);
          const weekly = wSnap.docs.map(d => ({ id: d.id, ...(d.data() as any) }))
            .filter(t => normalize(t.depart || t.departure || '') === departureQ && 
                         normalize(t.arrivee || t.arrival || '') === arrivalQ);
          const reservations = rSnap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));
          
          next8.forEach(dateStr => {
            const d = new Date(dateStr); 
            const dayName = DAYS[d.getDay()];
            weekly.forEach((t: any) => {
              (t.horaires?.[dayName] || []).forEach((heure: string) => {
                if (dateStr === toYMD(new Date())) {
                  const now = new Date();
                  const nowHHMM = parse(
                    `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`,
                    'HH:mm',
                    new Date()
                  );
                  if (parse(heure, 'HH:mm', new Date()) <= nowHHMM) return;
                }
                const trajetId = `${t.id}_${dateStr}_${heure}`;
                const total = t.places || 30;
                const reserved = reservations
                  .filter(r => String((r as any).trajetId) === trajetId && 
                          ['confirme', 'payé'].includes(
                          String((r as any).statut).toLowerCase()
                          ))
                  .reduce((a, r: any) => a + (r.seatsGo || 0), 0);
                const remaining = total - reserved;
                if (remaining > 0) {
                  allTrips.push({
                    id: trajetId,
                    date: dateStr, 
                    time: heure,
                    departure: t.depart || t.departure || '',
                    arrival: t.arrivee || t.arrival || '',
                    price: t.price,
                    agencyId: a.id as any, 
                    companyId: cdoc.id as any,
                    places: total, 
                    remainingSeats: remaining
                  } as any);
                }
              });
            });
          });
        }
        const sorted = allTrips.sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time));
        const uniqDates = [...new Set(sorted.map(t => t.date))];

        setTrips(sorted); 
        setDates(uniqDates); 
        setSelectedDate(uniqDates[0] || '');

        sessionStorage.setItem(`preload_${slug}_${departureQ}_${arrivalQ}`, JSON.stringify({
          company: {
            id: cdoc.id, 
            name: cdata.nom || '',
            couleurPrimaire: cdata.couleurPrimaire || '#f43f5e',
            couleurSecondaire: cdata.couleurSecondaire || '#f97316',
            logoUrl: cdata.logoUrl || '', 
            code: (cdata.code || 'MT').toString().toUpperCase()
          }, 
          trips: sorted, 
          dates: uniqDates,
          agencyInfo: { 
            nom: agences[0]?.nomAgence || agences[0]?.nom || '', 
            telephone: agences[0]?.telephone || '', 
            code: agences[0]?.code 
          }
        }));
      } catch (e: any) {
        setError(e?.message || 'Erreur de chargement');
      } finally { 
        setLoading(false); 
      }
    };

    load();
  }, [slug, departureQ, arrivalQ, reservationRouteId]);

  // Mise à jour automatique des étapes
  useEffect(() => {
    if (reservationId && currentStep === 'personal') {
      setCurrentStep('payment');
    }
  }, [reservationId, currentStep]);

  useEffect(() => {
    if (paymentMethodKey && currentStep === 'payment') {
      setCurrentStep('proof');
    }
  }, [paymentMethodKey, currentStep]);

  const filteredTrips = useMemo(() => {
    if (!selectedDate) return [] as any[];
    const base = trips.filter((t: any) => t.date === selectedDate);
    if (isToday(parseISO(selectedDate))) {
      const now = new Date();
      const nowHHMM = parse(
        `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`,
        'HH:mm',
        new Date()
      );
      return base.filter((t: any) => parse(t.time, 'HH:mm', new Date()) > nowHHMM);
    }
    return base;
  }, [trips, selectedDate]);

  useEffect(() => {
    if (!reservationRouteId && filteredTrips.length && !selectedTime) {
      setSelectedTime(filteredTrips[0].time);
    }
  }, [filteredTrips, selectedTime, reservationRouteId]);

  const selectedTrip: any = filteredTrips.find((t: any) => t.time === selectedTime);
  const topPrice = (selectedTrip?.price ?? (filteredTrips[0] as any)?.price);

  const seatColor = (remaining: number, total: number) => {
    const ratio = remaining / total;
    if (ratio > 0.7) return '#16a34a';
    if (ratio > 0.3) return '#f59e0b';
    return '#dc2626';
  };

  // ---------- Validation et scroll ----------
  const validatePersonalInfo = () => {
    const errors: Record<string, string> = {};
    
    if (!passenger.fullName.trim()) {
      errors.fullName = 'Le nom complet est requis';
    }
    
    if (!passenger.phone.trim()) {
    errors.phone = 'Le numéro de téléphone est requis';
    } else if (!isValidMaliPhone(passenger.phone)) {
    errors.phone = 'Numéro invalide (format attendu : 22 22 22 22)';
    }
    
    setFieldErrors(errors);
    
    if (Object.keys(errors).length > 0) {
      if (errors.fullName && nameInputRef.current) {
        nameInputRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
        nameInputRef.current.focus();
      } else if (errors.phone && phoneInputRef.current) {
        phoneInputRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
        phoneInputRef.current.focus();
      }
      return false;
    }
    
    return true;
  };

  // ---------- Création draft ----------
  const createReservationDraft = useCallback(async () => {
    // DOUBLE SÉCURITÉ : bloquer si réservation active existe
    if (hasActiveReservation) {
      const pending = readPending();
      if (pending && isBlockingStatus(pending.status) && pending.slug === slug) {
        navigate(`/${slug}/reservation/${pending.id}`, { 
          replace: true, 
          state: { companyId: pending.companyId, agencyId: pending.agencyId } 
        });
      }
      return;
    }
    
    if (!validatePersonalInfo()) {
      setError('Veuillez corriger les erreurs ci-dessus');
      return;
    }
    
    if (!selectedTrip) {
      setError('Veuillez sélectionner un horaire');
      return;
    }
    
    const pending = readPending();
    if (pending && isBlockingStatus(pending.status) && pending.slug === slug) {
      navigate(`/${slug}/reservation/${pending.id}`, { 
        replace: true, 
        state: { companyId: pending.companyId, agencyId: pending.agencyId } 
      });
      return;
    }

    if (creating) return;

    setCreating(true); 
    setError('');
    setFieldErrors({});
    
    try {
      const agSnap = await getDoc(doc(db, 'companies', selectedTrip.companyId, 'agences', selectedTrip.agencyId));
      const ag = agSnap.exists() ? (agSnap.data() as any) : {};
      const agencyName = ag.nomAgence || ag.nom || ag.name || 'Agence';
      const agencyCode = (ag.code || ag.codeAgence || '').toString().toUpperCase() || undefined;

      const compSnap = await getDoc(doc(db, 'companies', selectedTrip.companyId));
      const comp = compSnap.exists() ? (compSnap.data() as any) : {};
      const companyCode = (comp.code || company.code || 'MT').toString().toUpperCase();

      const referenceCode = await generateWebReferenceCode({
        companyId: selectedTrip.companyId,
        companyCode,
        agencyId: selectedTrip.agencyId,
        agencyCode,
        agencyName,
        tripInstanceId: selectedTrip.id
      });

      const now = new Date();
      const reservation = {
        nomClient: passenger.fullName.trim(),
        telephone: passenger.phone.trim(),
        depart: selectedTrip.departure,
        arrivee: selectedTrip.arrival,
        date: selectedTrip.date,
        heure: selectedTrip.time,
        montant: selectedTrip.price * seats,
        seatsGo: seats, 
        seatsReturn: 0, 
        tripType: 'aller_simple',
        statut: 'en_attente_paiement', 
        canal: 'en_ligne',
        companyId: selectedTrip.companyId,
        companySlug: slug,
        companyName: company.name,
        agencyId: selectedTrip.agencyId,
        agencyNom: agencyName,
        nomAgence: agencyName,
        referenceCode,
        trajetId: selectedTrip.id,
        holdUntil: addMin(now, 15),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };

      const refDoc = await addDoc(
        collection(db, 'companies', selectedTrip.companyId, 'agences', selectedTrip.agencyId, 'reservations'),
        reservation
      );

      const token = randomToken();
      const publicUrl = `${window.location.origin}/${slug}/mon-billet?r=${encodeURIComponent(token)}`;
      await updateDoc(
        doc(db, 'companies', selectedTrip.companyId, 'agences', selectedTrip.agencyId, 'reservations', refDoc.id),
        { publicToken: token, publicUrl }
      );
      
      try { 
        await navigator.clipboard.writeText(publicUrl); 
      } catch {}

      setReservationId(refDoc.id);
      setCurrentStep('payment');
      
      setTimeout(() => {
        paymentSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 100);

      setShowPaymentPopup(true);

      rememberPending({
        slug: slug!,
        id: refDoc.id,
        referenceCode,
        status: 'en_attente_paiement',
        companyId: selectedTrip.companyId,
        agencyId: selectedTrip.agencyId
      });

      sessionStorage.setItem('reservationDraft', JSON.stringify({ ...reservation, id: refDoc.id, publicUrl }));
      sessionStorage.setItem('companyInfo', JSON.stringify({
        id: company.id, 
        name: company.name, 
        logoUrl: company.logoUrl,
        couleurPrimaire: company.couleurPrimaire, 
        couleurSecondaire: company.couleurSecondaire, 
        slug
      }));
    } catch (e: any) {
      setError(e?.message || 'Impossible de créer la réservation');
    } finally { 
      setCreating(false); 
    }
  }, [hasActiveReservation, selectedTrip, passenger, seats, creating, slug, company, navigate, validatePersonalInfo]);

  const onChoosePayment = useCallback((key: string) => {
    setPaymentMethodKey(key); 
    setPaymentTriggeredAt(Date.now());
    setCurrentStep('proof');
    
    // Scroll automatique vers le champ de preuve
    setTimeout(() => {
      referenceInputRef.current?.scrollIntoView({ 
        behavior: 'smooth', 
        block: 'center' 
      });
      referenceInputRef.current?.focus();
    }, 300);
    
    const method = paymentMethods[key || '']; 
    if (!method) return;
    
    const total = existing
      ? (existing.montant || 0)
      : selectedTrip ? selectedTrip.price * seats : (topPrice || 0);
      
    const ussd = method.ussdPattern
      ?.replace('MERCHANT', method.merchantNumber || '')
      .replace('AMOUNT', String(total));
    
    if (method.url) {
      try { 
        new URL(method.url); 
        window.open(method.url, '_blank', 'noopener,noreferrer'); 
      } catch {}
    } else if (ussd) {
      window.location.href = `tel:${encodeURIComponent(ussd)}`;
    }
  }, [paymentMethods, existing, selectedTrip, seats, topPrice]);

  const paymentHints = useMemo(() => {
    if (!paymentMethodKey) return "Choisissez un moyen de paiement pour voir les instructions.";
    switch (paymentMethodKey) {
      case "orangemoney":
        return "Après votre paiement Orange Money, copiez le code reçu par SMS";
      case "moov":
        return "Après votre paiement Moov Money, indiquez la référence reçue par SMS";
      case "wave":
        return "Après votre paiement Wave, copiez le code du reçu";
      case "cash":
        return "Paiement au guichet : entrez le n° du reçu";
      default:
        return "Copiez la référence reçue par SMS après paiement";
    }
  }, [paymentMethodKey]);

  const canConfirm = useMemo(() => {
    if (!reservationId) return false;
    if (!paymentMethodKey) return false;
    return message.trim().length >= 4;
  }, [reservationId, paymentMethodKey, message]);

  const submitProofInline = async () => {
    const effectiveCompanyId = existing?.companyId || company.id;
    const effectiveAgencyId  = existing?.agencyId || agencyInfo?.id;
    
    if (!reservationId || !effectiveCompanyId || !effectiveAgencyId) { 
      setError('Réservation introuvable'); 
      return; 
    }
    
    if (!paymentMethodKey) { 
      setError('Sélectionnez un moyen de paiement'); 
      return; 
    }
    
    if (!canConfirm) {
      setError("Ajoutez la référence du paiement (≥ 4 caractères) avant de confirmer.");
      return;
    }
    
    if (uploading) return;

    setUploading(true); 
    setError('');
    try {
      // ⚠️ NE JAMAIS basculer un billet "guichet" en "en_ligne"
      const nextCanal = (existing?.canal && existing.canal.toLowerCase() !== 'en_ligne')
        ? existing.canal
        : 'en_ligne';

      await updateDoc(
        doc(db, 'companies', effectiveCompanyId, 'agences', effectiveAgencyId, 'reservations', reservationId), 
        {
          statut: 'preuve_recue',
          canal: nextCanal,
          preuveVia: paymentMethodKey, 
          preuveMessage: message.trim(), 
          paymentHint: paymentMethodKey, 
          paymentTriggeredAt: paymentTriggeredAt ? new Date(paymentTriggeredAt) : null,
          updatedAt: serverTimestamp(),
        }
      );

      // Mise à jour IMMÉDIATE de l'état local pour feedback instantané
      setExisting(prev => prev ? { 
        ...prev, 
        statut: 'preuve_recue',
        canal: nextCanal
      } : prev);

      // Suppression du double navigate - un seul appel
      navigate(`/${slug}/reservation/${reservationId}`, {
        replace: true,
        state: {
          companyId: effectiveCompanyId,
          agencyId: effectiveAgencyId
        }
      });

      // Mise à jour du pending local
      const p = readPending();
      if (p && p.id === reservationId) {
        rememberPending({ ...p, status: 'preuve_recue' });
      }
    } catch (e) { 
      setError("Échec de l'envoi de la preuve"); 
    } finally { 
      setUploading(false); 
    }
  };

  // ---------- UI components ----------
  const RouteCard = (titleRight?: string) => (
    <section className="bg-white rounded-2xl border border-gray-100 shadow-sm">
      <div className="flex items-center justify-between gap-4 px-4 sm:px-5 py-3">
        <div className="flex items-center gap-3 min-w-0">
          {company.logoUrl && (
            <img src={company.logoUrl} alt="" className="h-8 w-8 rounded-full object-cover ring-1 ring-gray-200" />
          )}
          <div className="min-w-0">
            <div className="flex items-center text-gray-900 font-semibold">
              <span className="truncate">
                {existing?.depart ? formatCity(existing.depart) : formatCity(departureQ)}
              </span>
              <svg 
                viewBox="0 0 24 24" 
                className="mx-2 h-5 w-5 shrink-0" 
                style={{ color: theme.primary }}
              >
                <path fill="currentColor" d="M5 12h12l-4-4 1.4-1.4L21.8 12l-7.4 5.4L13 16l4-4H5z"/>
              </svg>
              <span className="truncate">
                {existing?.arrivee ? formatCity(existing.arrivee) : formatCity(arrivalQ)}
              </span>
            </div>
            <p className="text-xs text-gray-500">
              {existing?.date ? `${existing.date} · ${existing.heure || ''}` : 'Sélectionnez la date et l\'heure'}
            </p>
          </div>
        </div>
        <div className="text-right">
          {titleRight ? (
            <div className="text-lg sm:text-xl font-extrabold" style={{ color: theme.primary }}>
              {titleRight}
            </div>
          ) : (
            <>
              <div className="text-xs text-gray-500">À partir de</div>
              <div className="text-lg sm:text-xl font-extrabold" style={{ color: theme.primary }}>
                { (existing?.montant || topPrice) 
                  ? `${(existing?.montant || topPrice).toLocaleString('fr-FR')} FCFA` 
                  : '—' 
                }
              </div>
            </>
          )}
        </div>
      </div>
    </section>
  );

  const StepIndicator = () => (
    <div className="flex items-center justify-center mb-4">
      <div className="flex items-center">
        <div className={`h-8 w-8 rounded-full flex items-center justify-center ${
          currentStep === 'personal' ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-600'
        }`}>
          1
        </div>
        <div className={`h-1 w-12 ${currentStep === 'personal' ? 'bg-gray-300' : 'bg-gray-200'}`} />
        <div className={`h-8 w-8 rounded-full flex items-center justify-center ${
          currentStep === 'payment' ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-600'
        }`}>
          2
        </div>
        <div className={`h-1 w-12 ${currentStep === 'proof' ? 'bg-gray-300' : 'bg-gray-200'}`} />
        <div className={`h-8 w-8 rounded-full flex items-center justify-center ${
          currentStep === 'proof' ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-600'
        }`}>
          3
        </div>
      </div>
    </div>
  );

  const PaymentInstructionsPopup = () => {
    if (!showPaymentPopup) return null;
    
    return (
      <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-4">
        <motion.div 
          initial={{ opacity: 0, y: 50 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-t-2xl sm:rounded-2xl max-w-md w-full"
        >
          <div className="p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-3">
              Étape suivante : Paiement
            </h3>
            
            <div className="space-y-3 mb-6">
              <div className="flex items-start gap-3">
                <div className="h-6 w-6 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-sm font-bold">
                  1
                </div>
                <div>
                  <p className="font-medium text-gray-900">Choisissez un moyen de paiement</p>
                  <p className="text-sm text-gray-600">Sélectionnez Orange Money, Moov Money, etc.</p>
                </div>
              </div>
              
              <div className="flex items-start gap-3">
                <div className="h-6 w-6 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-sm font-bold">
                  2
                </div>
                <div>
                  <p className="font-medium text-gray-900">Effectuez le paiement</p>
                  <p className="text-sm text-gray-600">Sortez de l'app pour payer (USSD ou app externe)</p>
                </div>
              </div>
              
              <div className="flex items-start gap-3">
                <div className="h-6 w-6 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-sm font-bold">
                  3
                </div>
                <div>
                  <p className="font-medium text-gray-900">Revenez coller la référence</p>
                  <p className="text-sm text-gray-600">Après paiement, copiez le code reçu par SMS</p>
                </div>
              </div>
            </div>
            
            <div className="flex gap-3">
              <button
                onClick={() => setShowPaymentPopup(false)}
                className="flex-1 h-11 border border-gray-300 rounded-xl font-medium hover:bg-gray-50 transition"
              >
                Compris
              </button>
            </div>
          </div>
        </motion.div>
      </div>
    );
  };

  // ---------- Rendu en-tête ----------
  if (loading) {
    return (
      <div className="min-h-screen grid place-items-center bg-gray-50">
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }} 
          animate={{ opacity: 1, scale: 1 }} 
          className="bg-white/70 backdrop-blur rounded-2xl p-6 shadow-sm"
        >
          <div className="flex items-center gap-3">
            {company.logoUrl && (
              <img src={company.logoUrl} alt="" className="h-10 w-10 rounded-full object-cover ring-1 ring-gray-200" />
            )}
            <div>
              <div className="h-4 w-40 bg-gray-200 rounded mb-2" />
              <div className="h-3 w-24 bg-gray-200 rounded" />
            </div>
          </div>
        </motion.div>
      </div>
    );
  }

  const header = (
    <header className="sticky top-0 z-50 shadow-sm" style={{ backgroundColor: theme.primary }}>
      <div className="max-w-[1100px] mx-auto px-3 sm:px-4 py-2 flex items-center justify-between text-white">
        <button 
          onClick={() => navigate(-1)} 
          className="p-2 rounded-full hover:bg-white/10 transition" 
          aria-label="Retour"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <div className="flex items-center gap-2">
          {company.logoUrl && (
            <img src={company.logoUrl} alt="" className="h-7 w-7 rounded-full object-cover ring-1 ring-white/30" />
          )}
          <span className="font-semibold tracking-wide">{company.name || 'MALI TRANS'}</span>
        </div>
        <div className="w-9" />
      </div>
    </header>
  );

  // ---------- Décision d'affichage ----------
  const canal  = String(existing?.canal || '').toLowerCase();
  const statut = String(existing?.statut || '').toLowerCase();
  const isPaidLike = ['pay', 'confirm', 'valid'].some(k => statut.includes(k));
  const showTicketDirect = !!existing && (canal === 'guichet' || isPaidLike);

  // ---------- Vue BILLET (direct) ----------
  const TicketView = existing && (
    <div className="max-w-[1100px] mx-auto px-3 sm:px-4 py-4 space-y-4">
      {RouteCard("Billet")}
      <section className="bg-white rounded-2xl border p-4">
        <div className="text-sm text-gray-600 mb-3">
          <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 border border-emerald-200 mr-2">
            {canal === 'guichet' ? 'Guichet' : 'En ligne'}
          </span>
          <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-gray-100 text-gray-700 border">
            Référence: {existing.referenceCode || existing.id}
          </span>
        </div>
        <div className="grid sm:grid-cols-2 gap-3 text-sm">
          <div><span className="text-gray-500">Passager</span><div className="font-medium">{existing.nomClient || '—'}</div></div>
          <div><span className="text-gray-500">Téléphone</span><div className="font-medium">{existing.telephone || '—'}</div></div>
          <div><span className="text-gray-500">Trajet</span><div className="font-medium">{existing.depart} → {existing.arrivee}</div></div>
          <div><span className="text-gray-500">Date & heure</span><div className="font-medium">{existing.date} · {existing.heure}</div></div>
          <div><span className="text-gray-500">Places</span><div className="font-medium">{existing.seatsGo || 1}</div></div>
          <div><span className="text-gray-500">Montant</span><div className="font-medium">{(existing.montant || 0).toLocaleString('fr-FR')} FCFA</div></div>
        </div>
      </section>
    </div>
  );

  // ---------- Vue ÉTAT/PAIEMENT (en ligne non payé) ----------
  const OnlineStateView = (
    <div className="max-w-[1100px] mx-auto px-3 sm:px-4 py-4 space-y-4">
      {RouteCard()}
      {agencyInfo?.nom && (
        <div className="text-xs text-gray-500 px-1">Agence : {agencyInfo.nom} — {agencyInfo.telephone}</div>
      )}
      
      {/* Affichage clair du statut */}
      {existing?.statut && (
        <div className="bg-white rounded-2xl border border-gray-100 p-4">
          <div className="flex items-center gap-3">
            {existing.statut === 'en_attente_paiement' && (
              <>
                <Clock className="w-5 h-5 text-amber-500" />
                <div>
                  <div className="font-medium text-gray-900">En attente de paiement</div>
                  <div className="text-sm text-gray-600">Veuillez effectuer le paiement et envoyer la preuve</div>
                </div>
              </>
            )}
            {existing.statut === 'preuve_recue' && (
              <>
                <Clock className="w-5 h-5 text-blue-500" />
                <div>
                  <div className="font-medium text-gray-900">Preuve reçue – en vérification</div>
                  <div className="text-sm text-gray-600">Votre preuve de paiement est en cours de vérification par la compagnie</div>
                </div>
              </>
            )}
            {existing.statut === 'confirme' && (
              <>
                <Check className="w-5 h-5 text-emerald-500" />
                <div>
                  <div className="font-medium text-gray-900">Paiement confirmé</div>
                  <div className="text-sm text-gray-600">Votre billet est confirmé et valide pour le voyage</div>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-800">{error}</div>
      )}

      {/* Indicateur contextuel pour guider l'utilisateur */}
      {paymentTriggeredAt && existing?.statut === 'en_attente_paiement' && !paymentMethodKey && (
        <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800">
          💡 Après votre paiement, choisissez un moyen de paiement ci-dessous, puis collez le code reçu par SMS.
        </div>
      )}

      <PaymentProofSection
        reservationId={reservationId}
        paymentMethods={paymentMethods}
        paymentMethodKey={paymentMethodKey}
        onChoosePayment={onChoosePayment}
        message={message}
        setMessage={setMessage}
        referenceInputRef={referenceInputRef}
        canConfirm={canConfirm}
        submitProofInline={submitProofInline}
        uploading={uploading}
        paymentHints={paymentHints}
        existing={existing}
        selectedTrip={selectedTrip}
        seats={seats}
        theme={theme}
      />

      {existing && existing.statut && (
        <div className="text-sm text-gray-600">
          {existing.canal && (
            <span className="mr-3">Canal : <b>{existing.canal}</b></span>
          )}
        </div>
      )}
    </div>
  );

  // ---------- Rendu principal ----------
  return (
    <div className="min-h-screen bg-gradient-to-br from-white to-gray-50">
      {header}
      <PaymentInstructionsPopup />

      {/* Mode consultation (id présent) */}
      {existing ? (
        showTicketDirect ? TicketView : OnlineStateView
      ) : (
        // Mode achat en ligne (logique d'origine)
        <main className="max-w-[1100px] mx-auto px-3 sm:px-4 py-4 space-y-4 sm:space-y-5">
          {RouteCard()}

          {agencyInfo?.nom && (
            <div className="text-xs text-gray-500 px-1">Agence : {agencyInfo.nom} — {agencyInfo.telephone}</div>
          )}

          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-800">{error}</div>
          )}

          {/* Avertissement si réservation en cours */}
          {hasActiveReservation && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
              <div className="flex items-start gap-3">
                <AlertCircle className="h-5 w-5 text-amber-600 mt-0.5" />
                <div className="flex-1">
                  <h3 className="font-medium text-amber-800 mb-1">
                    Une réservation est déjà en cours
                  </h3>
                  <p className="text-sm text-amber-700">
                    Vous avez déjà une réservation en attente de paiement.
                    Veuillez terminer le paiement et envoyer la preuve.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* dates */}
          <section className="bg-white rounded-2xl border border-gray-100 p-4">
            <h2 className="text-sm font-semibold text-gray-900 mb-3">Choisissez votre date de départ</h2>
            <div className="flex gap-2 overflow-x-auto scrollbar-none">
              {dates.map(d => (
                <button
                  key={d}
                  onClick={() => { setSelectedDate(d); setSelectedTime(''); }}
                  className="h-10 px-3 rounded-xl border text-sm whitespace-nowrap transition"
                  style={{
                    borderColor: selectedDate === d ? theme.primary : '#e5e7eb',
                    color: selectedDate === d ? '#111827' : '#374151',
                    backgroundColor: selectedDate === d ? theme.lightPrimary : '#f9fafb'
                  }}
                >
                  <span className="font-medium">{format(parseISO(d), 'EEE d', { locale: fr })}</span>
                  {isToday(parseISO(d)) && (
                    <span className="ml-2 text-xs text-gray-500">Aujourd'hui</span>
                  )}
                  {isTomorrow(parseISO(d)) && (
                    <span className="ml-2 text-xs text-gray-500">Demain</span>
                  )}
                </button>
              ))}
            </div>
          </section>

          {/* heures */}
          {!!filteredTrips.length && (
            <section className="bg-white rounded-2xl border border-gray-100 p-4">
              <h2 className="text-sm font-semibold text-gray-900 mb-3">Choisissez votre heure de départ</h2>
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-2">
                {filteredTrips.map((t: any) => (
                  <button
                    key={t.id}
                    onClick={() => setSelectedTime(t.time)}
                    className="h-11 px-3 rounded-lg border text-sm text-left transition"
                    style={{
                      borderColor: selectedTime === t.time ? theme.secondary : '#e5e7eb',
                      backgroundColor: selectedTime === t.time ? theme.lightSecondary : '#f9fafb'
                    }}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-semibold">{t.time}</span>
                      <span
                        className="text-[11px] px-2 h-5 rounded-md grid place-items-center whitespace-nowrap leading-none"
                        style={{ 
                          color: seatColor(t.remainingSeats, t.places), 
                          border: `1px solid ${seatColor(t.remainingSeats, t.places)}` 
                        }}
                      >
                        {t.remainingSeats} pl.
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            </section>
          )}

          {/* infos personnelles */}
          {selectedTrip && !hasActiveReservation && (
            <>
              <section className="bg-white rounded-2xl border border-gray-100 p-4">
                <StepIndicator />
                <h2 className="text-sm font-semibold text-gray-900 mb-2">Informations personnelles</h2>
                <p className="text-xs text-gray-500 mb-3">
                  Entrez votre <span className="font-medium">nom complet</span> et votre <span className="font-medium">numéro de téléphone</span> utilisés pour voyager.
                </p>
                <div className="grid sm:grid-cols-2 gap-3">
                  {/* Nom */}
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <User className="h-5 w-5 text-gray-400" />
                    </div>
                    <input
                      ref={nameInputRef}
                      className={`h-11 pl-10 pr-3 w-full border rounded-lg focus:ring-2 focus:outline-none ${
                        fieldErrors.fullName ? 'border-red-300' : 'border-gray-200'
                      }`}
                      placeholder="Nom complet *"
                      value={passenger.fullName}
                      onChange={e => {
                        setPassenger(p => ({ ...p, fullName: e.target.value }));
                        if (fieldErrors.fullName) {
                          setFieldErrors(prev => ({ ...prev, fullName: '' }));
                        }
                      }}
                    />
                    {fieldErrors.fullName && (
                      <div className="text-xs text-red-600 mt-1 flex items-center gap-1">
                        <AlertCircle className="w-3 h-3" /> {fieldErrors.fullName}
                    </div>
                    )}
                  </div>

                  {/* Téléphone */}
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <Phone className="h-5 w-5 text-gray-400" />
                    </div>
                    <input
                      ref={phoneInputRef}
                      inputMode="numeric"
                      autoComplete="tel"
                      maxLength={11} // 8 chiffres + 3 espaces
                      className={`h-11 pl-10 pr-3 w-full border rounded-lg focus:ring-2 focus:outline-none ${
                        fieldErrors.phone ? 'border-red-300' : 'border-gray-200'
                      }`}
                      placeholder="Téléphone * (ex: 22 22 22 22)"
                      value={passenger.phone}
                      onChange={e => {
                        const formatted = formatMaliPhone(e.target.value);
                        setPassenger(p => ({ ...p, phone: formatted }));

                        if (fieldErrors.phone) {
                        setFieldErrors(prev => ({ ...prev, phone: '' }));
                        }
                      }}
                    />
                    {fieldErrors.phone && (
                      <div className="text-xs text-red-600 mt-1 flex items-center gap-1">
                        <AlertCircle className="w-3 h-3" /> {fieldErrors.phone}
                      </div>
                    )}
                  </div>

                  {/* Places */}
                  <div className="sm:col-span-2 flex items-center gap-4 mt-2">
                    <span className="text-sm text-gray-600">Places</span>
                    <button 
                      onClick={() => setSeats(s => Math.max(1, s - 1))} 
                      className="w-9 h-9 rounded-full border grid place-items-center hover:bg-gray-50" 
                      style={{ borderColor: theme.lightPrimary, color: theme.primary }}
                    >
                      <Minus className="w-4 h-4" />
                    </button>
                    <span 
                      className="px-3 py-1.5 rounded-lg text-sm font-semibold" 
                      style={{ background: theme.lightPrimary, color: theme.primary }}
                    >
                      {seats}
                    </span>
                    <button 
                      onClick={() => setSeats(s => Math.min(Math.min(5, selectedTrip.remainingSeats), s + 1))} 
                      className="w-9 h-9 rounded-full border grid place-items-center hover:bg-gray-50" 
                      style={{ borderColor: theme.lightPrimary, color: theme.primary }}
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                    <span className="text-xs" style={{ color: seatColor(selectedTrip.remainingSeats, selectedTrip.places) }}>
                      {selectedTrip.remainingSeats} pl. dispo
                    </span>
                  </div>
                </div>
                
                <button
                  onClick={createReservationDraft}
                  disabled={creating || hasActiveReservation}
                  title={hasActiveReservation ? "Une réservation est déjà en cours" : ""}
                  className="mt-4 w-full h-11 rounded-xl font-semibold shadow-sm disabled:opacity-60 transition hover:brightness-[0.98] flex items-center justify-center gap-2"
                  style={{ 
                    background: `linear-gradient(135deg, ${theme.secondary}, ${theme.primary})`, 
                    color: '#fff' 
                  }}
                >
                  {creating ? 'Traitement…' : (
                    <>
                      Passer au paiement
                      <ArrowRight className="w-4 h-4" />
                      <span className="font-bold">
                        {(selectedTrip.price * seats).toLocaleString('fr-FR')} FCFA
                      </span>
                    </>
                  )}
                </button>
              </section>
            </>
          )}

          {/* Section paiement (seulement après création de réservation) */}
          {reservationId && (
            <section ref={paymentSectionRef} className="bg-white rounded-2xl border border-gray-100 p-4">
              <PaymentProofSection
                reservationId={reservationId}
                paymentMethods={paymentMethods}
                paymentMethodKey={paymentMethodKey}
                onChoosePayment={onChoosePayment}
                message={message}
                setMessage={setMessage}
                referenceInputRef={referenceInputRef}
                canConfirm={canConfirm}
                submitProofInline={submitProofInline}
                uploading={uploading}
                paymentHints={paymentHints}
                existing={existing}
                selectedTrip={selectedTrip}
                seats={seats}
                theme={theme}
              />
            </section>
          )}
        </main>
      )}
    </div>
  );
}