import React, { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import { useParams, useLocation, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { isToday, isTomorrow, parseISO, parse } from 'date-fns';
import { ChevronLeft, Phone, Plus, Minus, CheckCircle, User } from 'lucide-react';
import {
  collection, getDocs, query, where, addDoc, doc, updateDoc, serverTimestamp, getDoc,
} from 'firebase/firestore';
import { db } from '@/firebaseConfig';
import { Trip } from '@/types';
import { generateWebReferenceCode } from '@/utils/tickets';

/* ============== Anti-spam: mémoire locale ============== */
const PENDING_KEY = 'pendingReservation';
const isBlockingStatus = (s?: string) =>
  ['preuve_recue'].includes(String(s || '').toLowerCase());

const rememberPending = (payload: {
  slug: string; id: string; referenceCode?: string; status: string;
  companyId?: string; agencyId?: string;
}) => { try { localStorage.setItem(PENDING_KEY, JSON.stringify(payload)); } catch {} };

const readPending = (): {
  slug: string; id: string; referenceCode?: string; status: string;
  companyId?: string; agencyId?: string;
} | null => { try { const r = localStorage.getItem(PENDING_KEY); return r ? JSON.parse(r) : null; } catch { return null; } };

const clearPendingIfNotBlocking = () => {
  try {
    const raw = localStorage.getItem(PENDING_KEY);
    if (!raw) return;
    const p = JSON.parse(raw);
    if (!isBlockingStatus(p?.status)) localStorage.removeItem(PENDING_KEY);
  } catch {}
};
/* ======================================================= */

const randomToken = () => Math.random().toString(36).slice(2, 8).toUpperCase();

// ---------- helpers ----------
const normalize = (s: string) =>
  s?.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/-/g,' ').replace(/\s+/g,' ') || '';
const toYMD = (d: Date) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
const formatCity = (s: string) => s ? s.charAt(0).toUpperCase()+s.slice(1).toLowerCase() : s;
const addMin = (d: Date, m: number) => new Date(d.getTime() + m*60000);
const DAYS = ['dimanche','lundi','mardi','mercredi','jeudi','vendredi','samedi'];

/* ---- format téléphonique 8 chiffres -> 12 34 56 78 ---- */
const onlyDigits = (s: string) => s.replace(/\D+/g, '');
const toPhonePretty = (raw8: string) =>
  raw8.replace(/(\d{2})(\d{0,2})(\d{0,2})(\d{0,2}).*/, (_, a, b, c, d) =>
    [a, b, c, d].filter(Boolean).join(' ')
  );

export default function ReservationClientPage() {
  const { slug } = useParams<{ slug: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const search = new URLSearchParams(location.search);
  const departureQ = normalize(search.get('departure') || '');
  const arrivalQ   = normalize(search.get('arrival') || '');

  const [company, setCompany] = useState({ id:'', name:'', couleurPrimaire:'#c1121f', couleurSecondaire:'#f97316', logoUrl:'', code:'MT' });
  const theme = useMemo(()=>({
    primary: company.couleurPrimaire,
    secondary: company.couleurSecondaire,
    lightPrimary: `${company.couleurPrimaire}1A`,
    lightSecondary: `${company.couleurSecondaire}1A`,
  }), [company]);

  const paymentSectionRef = useRef<HTMLDivElement|null>(null);

  const [agencyInfo, setAgencyInfo] = useState<{id?:string; nom?:string; telephone?:string; code?:string}>({});
  const [paymentMethods, setPaymentMethods] = useState<Record<string, {
    url?: string; logoUrl?: string; ussdPattern?: string; merchantNumber?: string;
  }>>({});
  const [paymentMethodKey, setPaymentMethodKey] = useState<string|null>(null);
  const [paymentTriggeredAt, setPaymentTriggeredAt] = useState<number|null>(null);

  const [trips, setTrips] = useState<Trip[]>([]);
  const [dates, setDates] = useState<string[]>([]);
  const [selectedDate, setSelectedDate] = useState('');
  const [selectedTime, setSelectedTime] = useState('');
  const [seats, setSeats] = useState(1);
  const [passenger, setPassenger] = useState<{ fullName: string; phone: string }>({ fullName:'', phone:'' });

  const [message, setMessage] = useState('');

  const [reservationId, setReservationId] = useState<string|null>(null);
  const [creating, setCreating] = useState(false);
  const [uploading, setUploading] = useState(false);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  /* ========== Garde-fou au montage ========== */
  useEffect(() => {
    clearPendingIfNotBlocking();
    const p = readPending();
    if (p && p.slug === slug && p.status === 'preuve_recue') {
      navigate(`/${slug}/reservation/${p.id}`, {
        replace: true,
        state: { companyId: p.companyId, agencyId: p.agencyId }
      });
    }
  }, [slug, navigate]);

  useEffect(() => {
    try {
      const key = `preload_${slug}_${departureQ}_${arrivalQ}`;
      const cached = sessionStorage.getItem(key);
      if (cached) {
        const { company, trips, dates, agencyInfo } = JSON.parse(cached);
        setCompany(company); setTrips(trips); setDates(dates);
        setSelectedDate(dates[0] || ''); setAgencyInfo(agencyInfo);
      }
    } catch {}
  }, [slug, departureQ, arrivalQ]);

  useEffect(() => {
    if (!slug || !departureQ || !arrivalQ) return;

    const load = async () => {
      setLoading(true);
      try {
        const cSnap = await getDocs(query(collection(db, 'companies'), where('slug','==',slug)));
        if (cSnap.empty) throw new Error('Compagnie introuvable');
        const cdoc = cSnap.docs[0]; const cdata = cdoc.data() as any;

        setCompany({
          id: cdoc.id,
          name: (cdata.nom || cdata.name || '').toString(),
          code: (cdata.code || 'MT').toString().toUpperCase(),
          couleurPrimaire: cdata.couleurPrimaire || '#c1121f',
          couleurSecondaire: cdata.couleurSecondaire || '#f97316',
          logoUrl: cdata.logoUrl || ''
        });

        const agencesSnap = await getDocs(collection(db, 'companies', cdoc.id, 'agences'));
        const agences = agencesSnap.docs.map(d=>({ id:d.id, ...(d.data() as any) }));
        if (agences[0]) {
          const a = agences[0];
          setAgencyInfo({
            id: a.id,
            nom: a.nomAgence || a.nom || a.name,
            telephone: a.telephone,
            code: (a.code || a.codeAgence || '').toString().toUpperCase() || undefined
          });
        }

        const pmSnap = await getDocs(query(collection(db, 'paymentMethods'), where('companyId','==',cdoc.id)));
        const pms: any = {};
        pmSnap.forEach(ds => {
          const d = ds.data() as any;
          if (d.name) pms[d.name] = { url:d.defaultPaymentUrl||'', logoUrl:d.logoUrl||'', ussdPattern:d.ussdPattern||'', merchantNumber:d.merchantNumber||'' };
        });
        setPaymentMethods(pms);

        const next8 = Array.from({length:8},(_,i)=>{ const d=new Date(); d.setDate(d.getDate()+i); return toYMD(d); });

        const allTrips: Trip[] = [];
        for (const a of agences) {
          const [wSnap, rSnap] = await Promise.all([
            getDocs(query(collection(db,'companies',cdoc.id,'agences',a.id,'weeklyTrips'), where('active','==',true))),
            getDocs(collection(db,'companies',cdoc.id,'agences',a.id,'reservations'))
          ]);
          const weekly = wSnap.docs.map(d=>({ id:d.id, ...(d.data() as any)}))
            .filter(t => normalize(t.depart||t.departure||'')===departureQ && normalize(t.arrivee||t.arrival||'')===arrivalQ);
          const reservations = rSnap.docs.map(d=>({ id:d.id, ...(d.data() as any)}));
          next8.forEach(dateStr=>{
            const d = new Date(dateStr); const dayName = DAYS[d.getDay()];
            ((weekly as any[])).forEach((t:any)=>{
              ((t.horaires?.[dayName] || []) as string[]).forEach((heure) => {
                if (dateStr===toYMD(new Date())) {
                  const now = new Date();
                  const nowHHMM = parse(`${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`,'HH:mm',new Date());
                  if (parse(heure,'HH:mm',new Date()) <= nowHHMM) return;
                }
                const trajetId = `${t.id}_${dateStr}_${heure}`;
                const total = t.places || 30;
                const reserved = reservations
                  .filter(r=> String((r as any).trajetId)===trajetId && ['payé','preuve_recue'].includes(String((r as any).statut).toLowerCase()))
                  .reduce((a,r:any)=> a + (r.seatsGo||0), 0);
                const remaining = total - reserved;
                if (remaining>0) {
                  allTrips.push({
                    id: trajetId,
                    date: dateStr, time: heure,
                    departure: t.depart || t.departure || '',
                    arrival: t.arrivee || t.arrival || '',
                    price: t.price,
                    agencyId: a.id as any, companyId: cdoc.id as any,
                    places: total, remainingSeats: remaining
                  } as any);
                }
              });
            });
          });
        }
        const sorted = allTrips.sort((a,b)=> a.date.localeCompare(b.date) || a.time.localeCompare(b.time));
        const uniqDates = [...new Set(sorted.map(t=>t.date))];

        setTrips(sorted); setDates(uniqDates); setSelectedDate(uniqDates[0] || '');

        sessionStorage.setItem(`preload_${slug}_${departureQ}_${arrivalQ}`, JSON.stringify({
          company: {
            id: cdoc.id, name: cdata.nom || '',
            couleurPrimaire: cdata.couleurPrimaire || '#c1121f',
            couleurSecondaire: cdata.couleurSecondaire || '#f97316',
            logoUrl: cdata.logoUrl || '', code: (cdata.code || 'MT').toString().toUpperCase()
          }, trips: sorted, dates: uniqDates,
          agencyInfo: { nom: agences[0]?.nomAgence || agences[0]?.nom || '', telephone: agences[0]?.telephone || '', code: agences[0]?.code }
        }));
      } catch (e:any) {
        setError(e?.message || 'Erreur de chargement');
      } finally { setLoading(false); }
    };

    load();
  }, [slug, departureQ, arrivalQ]);

  const filteredTrips = useMemo(()=>{
    if (!selectedDate) return [] as any[];
    const base = trips.filter((t:any)=> t.date===selectedDate);
    if (isToday(parseISO(selectedDate))) {
      const now=new Date();
      const nowHHMM=parse(`${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`,'HH:mm',new Date());
      return base.filter((t:any)=> parse(t.time,'HH:mm',new Date()) > nowHHMM);
    }
    return base;
  }, [trips, selectedDate]);

  useEffect(()=> {
    if (filteredTrips.length && !selectedTime) setSelectedTime(filteredTrips[0].time);
  }, [filteredTrips, selectedTime]);

  const selectedTrip: any = filteredTrips.find((t:any)=> t.time===selectedTime);
  const topPrice = (selectedTrip?.price ?? (filteredTrips[0] as any)?.price);
  const priceText = topPrice ? `${topPrice.toLocaleString('fr-FR')} FCFA` : '—';

  const seatColor = (remaining:number, total:number) => {
    const ratio = remaining / total;
    if (ratio > 0.7) return '#16a34a';
    if (ratio > 0.3) return '#f59e0b';
    return '#dc2626';
  };

  const triggerUSSD = (code: string) => {
    const tel = `tel:${encodeURIComponent(code)}`;
    const a = document.createElement('a');
    a.href = tel;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { try { a.click(); } catch {} document.body.removeChild(a); }, 180);
    setTimeout(() => { try { window.location.assign(tel); } catch {} }, 320);
  };

  /* ------------------ HANDLERS ------------------ */

  // Nom – simple set, pas de refocus
  const onNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setPassenger(p => ({ ...p, fullName: e.target.value }));
  };

  // Téléphone – digits -> 8 max, pas de refocus
  const onPhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = onlyDigits(e.target.value).slice(0, 8);
    setPassenger(p => ({ ...p, phone: raw }));
  };

  const createReservationDraft = useCallback(async () => {
    const pending = readPending();
    if (pending && isBlockingStatus(pending.status) && pending.slug === slug) {
      navigate(`/${slug}/reservation/${pending.id}`, { replace: true, state: { companyId: pending.companyId, agencyId: pending.agencyId } });
      return;
    }

    if (!selectedTrip) return;
    if (!passenger.fullName || passenger.phone.length !== 8) {
      setError('Entrez votre nom et un numéro de téléphone de 8 chiffres.');
      return;
    }
    if (creating) return;

    setCreating(true); setError('');
    try {
      const agSnap = await getDoc(doc(db, 'companies', selectedTrip.companyId, 'agences', selectedTrip.agencyId));
      const ag = agSnap.exists() ? (agSnap.data() as any) : {};
      const agencyName = ag.nomAgence || ag.nom || ag.name || 'Agence';
      const agencyCode = (ag.code || ag.codeAgence || '').toString().toUpperCase() || undefined;

      const compSnap = await getDoc(doc(db, 'companies', selectedTrip.companyId));
      const comp = compSnap.exists() ? (compSnap.data() as any) : {};
      const companyCode = (comp.code || company.code || 'MT').toString().toUpperCase();

      const referenceCode = await generateWebReferenceCode({
        companyId: selectedTrip.companyId, companyCode,
        agencyId: selectedTrip.agencyId, agencyCode, agencyName,
        tripInstanceId: selectedTrip.id
      });

      const now = new Date();
      const reservation = {
        nomClient: passenger.fullName,
        telephone: passenger.phone, // stocké sans espaces
        depart: selectedTrip.departure,
        arrivee: selectedTrip.arrival,
        date: selectedTrip.date,
        heure: selectedTrip.time,
        montant: selectedTrip.price * seats,
        seatsGo: seats, seatsReturn: 0, tripType: 'aller_simple',
        statut: 'en_attente_paiement', canal: 'en_ligne',

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
        collection(db,'companies',selectedTrip.companyId,'agences',selectedTrip.agencyId,'reservations'),
        reservation
      );

      const token = randomToken();
      const publicUrl = `${window.location.origin}/${slug}/mon-billet?r=${encodeURIComponent(token)}`;
      await updateDoc(
        doc(db,'companies',selectedTrip.companyId,'agences',selectedTrip.agencyId,'reservations',refDoc.id),
        { publicToken: token, publicUrl }
      );

      setReservationId(refDoc.id);
      rememberPending({ slug: slug!, id: refDoc.id, referenceCode, status: 'en_attente_paiement', companyId: selectedTrip.companyId, agencyId: selectedTrip.agencyId });

      sessionStorage.setItem('reservationDraft', JSON.stringify({ ...reservation, id: refDoc.id, publicUrl }));
      sessionStorage.setItem('companyInfo', JSON.stringify({
        id: company.id, name: company.name, logoUrl: company.logoUrl,
        couleurPrimaire: company.couleurPrimaire, couleurSecondaire: company.couleurSecondaire, slug
      }));

      setTimeout(() => paymentSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);
    } catch (e:any) {
      setError(e?.message || 'Impossible de créer la réservation');
    } finally { setCreating(false); }
  }, [selectedTrip, passenger, seats, creating, slug, company, navigate]);

  const onChoosePayment = (key: string) => {
    setPaymentMethodKey(key);
    setPaymentTriggeredAt(Date.now());

    const method = paymentMethods[key||'']; if (!method) return;
    const total = selectedTrip ? selectedTrip.price*seats : (topPrice||0);
    const ussd = method.ussdPattern?.replace('MERCHANT', method.merchantNumber||'').replace('AMOUNT', String(total));

    if (method.url) {
      try { new URL(method.url); window.open(method.url, '_blank', 'noopener,noreferrer'); } catch {}
    } else if (ussd) {
      triggerUSSD(ussd);
    }
  };

  const canConfirm = useMemo(() => {
    if (!reservationId) return false;
    if (!paymentMethodKey) return false;
    return message.trim().length >= 4;
  }, [reservationId, paymentMethodKey, message]);

  const submitProofInline = async () => {
    if (!reservationId || !company.id || !agencyInfo?.id) { setError('Réservation introuvable'); return; }
    if (!paymentMethodKey) { setError('Sélectionnez un moyen de paiement'); return; }
    if (!canConfirm) { setError("Entrez la référence (≥ 4 caractères)."); return; }
    if (uploading) return;

    setUploading(true); setError('');
    try {
      await updateDoc(doc(db,'companies',company.id,'agences',agencyInfo.id!,'reservations',reservationId), {
        statut: 'preuve_recue', canal: 'en_ligne',
        preuveVia: paymentMethodKey, preuveMessage: message.trim(), preuveUrl: null,
        paymentHint: paymentMethodKey, paymentTriggeredAt: paymentTriggeredAt ? new Date(paymentTriggeredAt) : null,
        updatedAt: new Date(),
      });

      const p = readPending();
      if (p && p.id === reservationId) rememberPending({ ...p, status: 'preuve_recue' });

      navigate(`/${slug}/reservation/${reservationId}`, { state: { companyId: company.id, agencyId: agencyInfo.id } });
    } catch (e) { setError("Échec de l'envoi de la preuve"); }
    finally { setUploading(false); }
  };

  // ---------- UI ----------
  const Card = ({ children }: { children: React.ReactNode }) => (
    <section
      className="rounded-2xl border shadow-sm"
      style={{ borderColor: `${theme.primary}20`, background: `linear-gradient(180deg, #fff, ${theme.lightPrimary})` }}
    >
      {children}
    </section>
  );

  const SectionTitle = ({ children }: { children: React.ReactNode }) => (
    <h2 className="text-sm font-semibold text-gray-900 mb-3">{children}</h2>
  );

  const RouteCard = () => (
    <Card>
      <div className="flex items-center justify-between gap-4 px-4 sm:px-5 py-3">
        <div className="flex items-center gap-3 min-w-0">
          {company.logoUrl && (
            <img src={company.logoUrl} alt="" className="h-8 w-8 rounded-full object-cover border" style={{ borderColor: '#e5e7eb' }} />
          )}
          <div className="min-w-0">
            <div className="flex items-center text-gray-900 font-semibold">
              <span className="truncate">{formatCity(departureQ)}</span>
              <svg viewBox="0 0 24 24" className="mx-2 h-5 w-5 shrink-0" style={{color: theme.primary}}>
                <path fill="currentColor" d="M5 12h12l-4-4 1.4-1.4L21.8 12l-7.4 5.4L13 16l4-4H5z"/>
              </svg>
              <span className="truncate">{formatCity(arrivalQ)}</span>
            </div>
          </div>
        </div>
        <div className="text-right">
          <div className="text-xs text-gray-500">À partir de</div>
          <div className="text-lg sm:text-xl font-extrabold" style={{ color: theme.primary }}>
            { priceText }
          </div>
        </div>
      </div>
    </Card>
  );

  const DateChip: React.FC<{d:string}> = ({ d }) => (
    <button
      onClick={()=>{ setSelectedDate(d); setSelectedTime(''); }}
      className="h-10 px-3 rounded-xl border text-sm whitespace-nowrap transition"
      style={{
        borderColor: selectedDate===d ? theme.primary : '#e5e7eb',
        color: selectedDate===d ? '#111827' : '#374151',
        backgroundColor: selectedDate===d ? theme.lightPrimary : '#f9fafb'
      }}
    >
      <span className="font-medium">
        {new Intl.DateTimeFormat('fr-FR', { weekday:'short', day:'numeric' }).format(new Date(d))}
      </span>
      {isToday(parseISO(d)) && <span className="ml-2 text-xs text-gray-500">Aujourd’hui</span>}
      {isTomorrow(parseISO(d)) && <span className="ml-2 text-xs text-gray-500">Demain</span>}
    </button>
  );

  const TimeBtn: React.FC<{t:any}> = ({ t }) => (
    <button
      onClick={()=> setSelectedTime(t.time)}
      className="h-11 px-3 rounded-lg border text-sm text-left transition"
      style={{
        borderColor: selectedTime===t.time ? theme.secondary : '#e5e7eb',
        backgroundColor: selectedTime===t.time ? theme.lightSecondary : '#f9fafb'
      }}
    >
      <div className="flex items-center gap-2">
        <span className="font-semibold">{t.time}</span>
        <span
          className="text-xs px-2 py-[2px] rounded-md whitespace-nowrap"
          style={{ color: seatColor(t.remainingSeats, t.places), border: `1px solid ${seatColor(t.remainingSeats, t.places)}` }}
        >
          {t.remainingSeats} pl.
        </span>
      </div>
    </button>
  );

  const PaymentPill: React.FC<{k:string; m: NonNullable<{url?:string;logoUrl?:string;ussdPattern?:string;merchantNumber?:string}>}> = ({ k, m }) => (
    <button
      onClick={()=> onChoosePayment(k)}
      className={`h-12 px-3 rounded-xl border flex items-center gap-2 text-sm w-full transition ${paymentMethodKey===k ? 'bg-white shadow-sm' : 'bg-gray-50 hover:bg-gray-100'}`}
      style={{ borderColor: paymentMethodKey===k ? theme.primary : '#e5e7eb' }}
    >
      {m.logoUrl ? <img src={m.logoUrl} alt={k} className="h-6 w-6 object-contain rounded" /> : <div className="h-6 w-6 rounded bg-gray-100" />}
      <div className="text-left min-w-0">
        <div className="font-medium capitalize truncate">{k.replace(/_/g,' ')}</div>
        {m.merchantNumber && <div className="text-[11px] text-gray-500 truncate">N° {m.merchantNumber}</div>}
      </div>
      {paymentMethodKey===k && (
        <div className="ml-auto h-5 w-5 rounded-full flex items-center justify-center" style={{ backgroundColor: theme.primary, color:'#fff' }}>
          <CheckCircle className="w-3 h-3" />
        </div>
      )}
    </button>
  );

  if (loading || !company.id || dates.length===0) {
    return (
      <div className="min-h-screen grid place-items-center bg-gray-50">
        <motion.div initial={{opacity:0, scale:0.95}} animate={{opacity:1, scale:1}} className="bg-white/70 backdrop-blur rounded-2xl p-6 shadow-sm">
          <div className="flex items-center gap-3">
            {company.logoUrl && (
              <img src={company.logoUrl} alt="" className="h-10 w-10 rounded-full object-cover border" style={{ borderColor: '#e5e7eb' }} />
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

  return (
    <div className="min-h-screen" style={{ background: `linear-gradient(180deg, ${theme.lightPrimary}, #fff)` }}>
      {/* header */}
      <header className="sticky top-0 z-50 shadow-sm" style={{ backgroundColor: theme.primary }}>
        <div className="max-w-[1100px] mx-auto px-3 sm:px-4 py-2 flex items-center justify-between text-white">
          <button onClick={()=> navigate(-1)} className="p-2 rounded-full hover:bg-white/10 transition" aria-label="Retour">
            <ChevronLeft className="h-5 w-5" />
          </button>
          <div className="flex items-center gap-2">
            {company.logoUrl && (
              <img src={company.logoUrl} alt="" className="h-7 w-7 rounded-full object-cover border" style={{ borderColor: 'rgba(255,255,255,0.35)' }} />
            )}
            <span className="font-semibold tracking-wide">{company.name || 'MALI TRANS'}</span>
          </div>
          <div className="w-9" />
        </div>
      </header>

      {/* body */}
      <main className="max-w-[1100px] mx-auto px-3 sm:px-4 py-4 space-y-4 sm:space-y-5">
        <RouteCard />

        {agencyInfo?.nom && (
          <div className="text-xs px-2 py-2 rounded-lg inline-block"
               style={{ backgroundColor: `${theme.secondary}12`, color: '#374151', border: `1px solid ${theme.secondary}33` }}>
            <span className="font-medium">Agence :</span> {agencyInfo.nom} — {agencyInfo.telephone}
          </div>
        )}

        {error && <div className="p-3 rounded-lg" style={{ backgroundColor:'#FEF2F2', color:'#991B1B', border:'1px solid #FECACA' }}>{error}</div>}

        {/* dates */}
        <Card>
          <div className="p-4">
            <SectionTitle>Choisissez votre date de départ</SectionTitle>
            <div className="flex gap-2 overflow-x-auto scrollbar-none">
              {dates.map(d=> <DateChip key={d} d={d} />)}
            </div>
          </div>
        </Card>

        {/* heures */}
        {!!filteredTrips.length && (
          <Card>
            <div className="p-4">
              <SectionTitle>Choisissez votre heure de départ</SectionTitle>
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-2">
                {filteredTrips.map((t:any)=> <TimeBtn key={t.id} t={t} />)}
              </div>
            </div>
          </Card>
        )}

        {/* infos + paiement */}
        {selectedTrip && (
          <>
            <Card>
              <div className="p-4">
                <SectionTitle>Informations personnelles</SectionTitle>
                <p className="text-xs text-gray-500 mb-3">
                  Entrez votre <span className="font-medium">nom complet</span> et votre <span className="font-medium">numéro de téléphone (8 chiffres)</span>.
                </p>
                <div className="grid sm:grid-cols-2 gap-3">
                  {/* Nom */}
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <User className="h-5 w-5 text-gray-400" />
                    </div>
                    <input
                      className="h-11 pl-10 pr-3 w-full border rounded-lg focus:ring-2 focus:outline-none"
                      style={{ borderColor:'#E5E7EB' }}
                      placeholder="Nom complet *"
                      value={passenger.fullName}
                      onChange={onNameChange}
                      autoComplete="name"
                    />
                  </div>

                  {/* Téléphone */}
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <Phone className="h-5 w-5 text-gray-400" />
                    </div>
                    <input
                      className="h-11 pl-10 pr-3 w-full border rounded-lg focus:ring-2 focus:outline-none"
                      style={{ borderColor:'#E5E7EB' }}
                      placeholder="Téléphone (8 chiffres) *"
                      value={toPhonePretty(passenger.phone)}
                      onChange={onPhoneChange}
                      inputMode="numeric"
                      pattern="[0-9]*"
                      autoComplete="tel-national"
                    />
                    <div className="mt-1 text-[11px] text-gray-500">
                      Exemple : <span className="font-mono">12 34 56 78</span> — 8 chiffres requis
                    </div>
                  </div>

                  {/* Places */}
                  <div className="sm:col-span-2 flex items-center gap-4">
                    <span className="text-sm text-gray-600">Places</span>
                    <button onClick={()=> setSeats(s=> Math.max(1, s-1))}
                            className="w-9 h-9 rounded-full border grid place-items-center hover:bg-gray-50"
                            style={{ borderColor: theme.lightPrimary, color: theme.primary }}>
                      <Minus className="w-4 h-4" />
                    </button>
                    <span className="px-3 py-1.5 rounded-lg text-sm font-semibold"
                          style={{ background: theme.lightPrimary, color: theme.primary }}>{seats}</span>
                    <button onClick={()=> setSeats(s=> Math.min(Math.min(5, selectedTrip.remainingSeats), s+1))}
                            className="w-9 h-9 rounded-full border grid place-items-center hover:bg-gray-50"
                            style={{ borderColor: theme.lightPrimary, color: theme.primary }}>
                      <Plus className="w-4 h-4" />
                    </button>
                    <span className="text-xs" style={{ color: seatColor(selectedTrip.remainingSeats, selectedTrip.places) }}>
                      {selectedTrip.remainingSeats} pl. dispo
                    </span>
                  </div>
                </div>
              </div>
            </Card>

            <Card>
              <div className="p-4" ref={paymentSectionRef}>
                <SectionTitle>{reservationId ? 'Choisissez le moyen de paiement' : 'Paiement'}</SectionTitle>

                {/* CTA pour créer le draft */}
                {!reservationId ? (
                  <div className="space-y-3">
                    <p className="text-sm text-gray-700">
                      Cliquez sur <span className="font-semibold">« Passer au paiement »</span> pour bloquer vos places pendant 15 minutes.
                    </p>
                    <button
                      onClick={createReservationDraft}
                      disabled={creating || !passenger.fullName || passenger.phone.length !== 8}
                      className="w-full h-11 rounded-xl font-semibold shadow-sm disabled:opacity-60 transition hover:brightness-[0.98]"
                      style={{ background: `linear-gradient(135deg, ${theme.secondary}, ${theme.primary})`, color: '#fff' }}
                    >
                      {creating ? 'Traitement…' : `Passer au paiement (${(selectedTrip.price * seats).toLocaleString('fr-FR')} FCFA)`}
                    </button>
                  </div>
                ) : (
                  <>
                    {/* moyens de paiement */}
                    <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
                      {Object.entries(paymentMethods).map(([k,m])=> m && <PaymentPill key={k} k={k} m={m} />)}
                    </div>

                    {/* USSD juste sous les boutons */}
                    {paymentMethodKey && paymentMethods[paymentMethodKey]?.ussdPattern && (
                      <div className="mt-3 text-xs text-gray-700">
                        <span className="block text-[13px] font-medium mb-1">Code USSD :</span>
                        <span className="font-mono bg-gray-50 px-2 py-1 rounded border">
                          {paymentMethods[paymentMethodKey]!.ussdPattern!
                            .replace('MERCHANT', paymentMethods[paymentMethodKey]!.merchantNumber || '')
                            .replace('AMOUNT', String(selectedTrip.price * seats))}
                        </span>
                      </div>
                    )}

                    {/* Preuve = champ texte uniquement */}
                    <div className="mt-4">
                      <h3 className="text-sm font-semibold text-gray-900 mb-2">Preuve de paiement</h3>
                      <p className="text-xs text-gray-600 mb-3">Après votre paiement, copiez la référence reçue par SMS et collez-la ci-dessous.</p>
                      <textarea
                        rows={3}
                        className="w-full border rounded-lg p-3 text-sm focus:ring-2 focus:outline-none"
                        style={{ borderColor:'#E5E7EB' }}
                        placeholder="Ex : code reçu par SMS (ex. 123456) ou n° de transfert"
                        value={message}
                        onChange={(e)=>setMessage(e.target.value)}
                      />
                    </div>

                    {/* bouton confirmé */}
                    <div className="mt-3 flex items-center justify-end">
                      <button
                        onClick={submitProofInline}
                        disabled={uploading || !canConfirm}
                        title={!canConfirm ? "Entrez au moins 4 caractères" : ""}
                        className="h-11 px-5 rounded-xl font-semibold shadow-sm disabled:opacity-60 disabled:cursor-not-allowed transition hover:brightness-[0.98]"
                        style={{ background: `linear-gradient(135deg, ${theme.primary}, ${theme.secondary})`, color: '#fff' }}
                      >
                        {uploading ? 'Envoi…' : 'Confirmer l’envoi'}
                      </button>
                    </div>
                  </>
                )}
              </div>
            </Card>
          </>
        )}
      </main>
    </div>
  );
}
