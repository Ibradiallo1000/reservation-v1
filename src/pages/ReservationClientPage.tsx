import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { useParams, useLocation, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { format, isToday, isTomorrow, parseISO, parse } from 'date-fns';
import { fr } from 'date-fns/locale';
import { ChevronLeft, Phone, Plus, Minus, CheckCircle, Upload, User } from 'lucide-react';
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

export default function ReservationClientPage() {
  const { slug } = useParams<{ slug: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const search = new URLSearchParams(location.search);
  const departureQ = normalize(search.get('departure') || '');
  const arrivalQ   = normalize(search.get('arrival') || '');

  const [company, setCompany] = useState({ id:'', name:'', couleurPrimaire:'#f43f5e', couleurSecondaire:'#f97316', logoUrl:'', code:'MT' });
  const theme = useMemo(()=>({
    primary: company.couleurPrimaire,
    secondary: company.couleurSecondaire,
    lightPrimary: `${company.couleurPrimaire}1A`,
    lightSecondary: `${company.couleurSecondaire}1A`,
  }), [company]);

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
  const [passenger, setPassenger] = useState({ fullName:'', phone:'' });

  const [message, setMessage] = useState('');
  const [file, setFile] = useState<File|null>(null);

  const [reservationId, setReservationId] = useState<string|null>(null);
  const [creating, setCreating] = useState(false);
  const [uploading, setUploading] = useState(false);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  /* ========== Garde-fou au montage ========== */
  useEffect(() => {
    // si la mémoire existe mais n'est plus bloquante, on nettoie
    clearPendingIfNotBlocking();

    // redirection si réservation bloquante du même slug
    const p = readPending();
    if (p && isBlockingStatus(p.status) && p.slug === slug) {
      navigate(`/${slug}/reservation/${p.id}`, { replace: true, state: { companyId: p.companyId, agencyId: p.agencyId } });
    }
  }, [slug, navigate]);
  /* =========================================== */

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
          name: cdata.nom || cdata.name || '',
          code: (cdata.code || 'MT').toString().toUpperCase(),
          couleurPrimaire: cdata.couleurPrimaire || '#f43f5e',
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
            couleurPrimaire: cdata.couleurPrimaire || '#f43f5e',
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

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    try {
      const f = e.target.files?.[0]; if (!f) return setFile(null);
      const valid = ['image/jpeg','image/png','application/pdf']; if (!valid.includes(f.type)) throw new Error('Fichier non supporté');
      if (f.size > 5*1024*1024) throw new Error('Fichier trop volumineux (5MB max)');
      setFile(f); setError('');
    } catch (err:any) { setError(err?.message || 'Erreur fichier'); setFile(null); }
  };

  const createReservationDraft = useCallback(async () => {
    // 🛑 Anti-spam : rediriger si une réservation bloquante du même slug existe
    const pending = readPending();
    if (pending && isBlockingStatus(pending.status) && pending.slug === slug) {
      navigate(`/${slug}/reservation/${pending.id}`, { replace: true, state: { companyId: pending.companyId, agencyId: pending.agencyId } });
      return;
    }

    if (!selectedTrip) return;
    if (!passenger.fullName || !passenger.phone) { setError('Nom et téléphone requis'); return; }
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
        companyId: selectedTrip.companyId,
        companyCode,
        agencyId: selectedTrip.agencyId,
        agencyCode,
        agencyName,
        tripInstanceId: selectedTrip.id
      });

      const now = new Date();
      const reservation = {
        nomClient: passenger.fullName,
        telephone: passenger.phone,
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

      // ✅ token public + URL partage
      const token = randomToken();
      const publicUrl = `${window.location.origin}/${slug}/mon-billet?r=${encodeURIComponent(token)}`;
      await updateDoc(
        doc(db,'companies',selectedTrip.companyId,'agences',selectedTrip.agencyId,'reservations',refDoc.id),
        { publicToken: token, publicUrl }
      );
      try { await navigator.clipboard.writeText(publicUrl); } catch {}

      setReservationId(refDoc.id);

      // 🧠 mémoriser comme “bloquante”
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
        id: company.id, name: company.name, logoUrl: company.logoUrl,
        couleurPrimaire: company.couleurPrimaire, couleurSecondaire: company.couleurSecondaire, slug
      }));
    } catch (e:any) {
      setError(e?.message || 'Impossible de créer la réservation');
    }
    finally { setCreating(false); }
  }, [selectedTrip, passenger, seats, creating, slug, company, navigate]);

  const onChoosePayment = (key: string) => {
    setPaymentMethodKey(key); setPaymentTriggeredAt(Date.now());
    const method = paymentMethods[key||'']; if (!method) return;
    const total = selectedTrip ? selectedTrip.price*seats : (topPrice||0);
    const ussd = method.ussdPattern?.replace('MERCHANT', method.merchantNumber||'').replace('AMOUNT', String(total));
    if (method.url) {
      try { new URL(method.url); window.open(method.url, '_blank', 'noopener,noreferrer'); } catch {}
    } else if (ussd) {
      window.location.href = `tel:${encodeURIComponent(ussd)}`;
    }
  };

  const submitProofInline = async () => {
    if (!reservationId || !company.id || !agencyInfo?.id) { setError('Réservation introuvable'); return; }
    if (!paymentMethodKey) { setError('Sélectionnez un moyen de paiement'); return; }
    if (uploading) return;

    setUploading(true); setError('');
    try {
      let preuveUrl: string|null = null;
      if (file) {
        const ext = file.name.split('.').pop(); const filename = `preuves/preuve_${Date.now()}.${ext}`;
        const fileRef = ref(storage, filename); const snap = await uploadBytes(fileRef, file);
        preuveUrl = await getDownloadURL(snap.ref);
      }
      await updateDoc(doc(db,'companies',company.id,'agences',agencyInfo.id!,'reservations',reservationId), {
        statut: 'preuve_recue', canal: 'en_ligne',
        preuveVia: paymentMethodKey, preuveMessage: message.trim(), preuveUrl: preuveUrl || null,
        paymentHint: paymentMethodKey, paymentTriggeredAt: paymentTriggeredAt ? new Date(paymentTriggeredAt) : null,
        updatedAt: new Date(),
      });

      // 🧠 garder comme bloquante mais maj du statut
      const p = readPending();
      if (p && p.id === reservationId) {
        rememberPending({ ...p, status: 'preuve_recue' });
      }

      navigate(`/${slug}/reservation/${reservationId}`, {
        state: { companyId: company.id, agencyId: agencyInfo.id }
      });
    } catch (e) { setError("Échec de l'envoi de la preuve"); }
    finally { setUploading(false); }
  };

  // ---------- UI ----------
  const RouteCard = () => (
    <section className="bg-white rounded-2xl border border-gray-100 shadow-sm">
      <div className="flex items-center justify-between gap-4 px-4 sm:px-5 py-3">
        <div className="flex items-center gap-3 min-w-0">
          {company.logoUrl && <img src={company.logoUrl} alt="" className="h-8 w-8 rounded-full object-cover ring-1 ring-gray-200" />}
          <div className="min-w-0">
            <div className="flex items-center text-gray-900 font-semibold">
              <span className="truncate">{formatCity(departureQ)}</span>
              <svg viewBox="0 0 24 24" className="mx-2 h-5 w-5 shrink-0" style={{color: theme.primary}}>
                <path fill="currentColor" d="M5 12h12l-4-4 1.4-1.4L21.8 12l-7.4 5.4L13 16l4-4H5z"/>
              </svg>
              <span className="truncate">{formatCity(arrivalQ)}</span>
            </div>
            <p className="text-xs text-gray-500">Sélectionnez la date et l’heure</p>
          </div>
        </div>
        <div className="text-right">
          <div className="text-xs text-gray-500">À partir de</div>
          <div className="text-lg sm:text-xl font-extrabold" style={{ color: theme.primary }}>
            { (selectedTrip?.price ?? (filteredTrips[0] as any)?.price)
              ? `${(selectedTrip?.price ?? (filteredTrips[0] as any)?.price).toLocaleString('fr-FR')} FCFA` : '—'}
          </div>
        </div>
      </div>
    </section>
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
      <span className="font-medium">{format(parseISO(d), 'EEE d', { locale: fr })}</span>
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
          className="text-xs px-2 py-[2px] rounded-md"
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

  // ---------- skeleton ----------
  if (loading || !company.id || dates.length===0) {
    return (
      <div className="min-h-screen grid place-items-center bg-gray-50">
        <motion.div initial={{opacity:0, scale:0.95}} animate={{opacity:1, scale:1}} className="bg-white/70 backdrop-blur rounded-2xl p-6 shadow-sm">
          <div className="flex items-center gap-3">
            {company.logoUrl && <img src={company.logoUrl} alt="" className="h-10 w-10 rounded-full object-cover ring-1 ring-gray-200" />}
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
    <div className="min-h-screen bg-gradient-to-br from-white to-gray-50">
      {/* header */}
      <header className="sticky top-0 z-50 shadow-sm" style={{ backgroundColor: theme.primary }}>
        <div className="max-w-[1100px] mx-auto px-3 sm:px-4 py-2 flex items-center justify-between text-white">
          <button onClick={()=> navigate(-1)} className="p-2 rounded-full hover:bg-white/10 transition" aria-label="Retour">
            <ChevronLeft className="h-5 w-5" />
          </button>
          <div className="flex items-center gap-2">
            {company.logoUrl && <img src={company.logoUrl} alt="" className="h-7 w-7 rounded-full object-cover ring-1 ring-white/30" />}
            <span className="font-semibold tracking-wide">{company.name || 'MALI TRANS'}</span>
          </div>
          <div className="w-9" />
        </div>
      </header>

      {/* body */}
      <main className="max-w-[1100px] mx-auto px-3 sm:px-4 py-4 space-y-4 sm:space-y-5">
        <RouteCard />

        {agencyInfo?.nom && (
          <div className="text-xs text-gray-500 px-1">Agence : {agencyInfo.nom} — {agencyInfo.telephone}</div>
        )}

        {error && <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-800">{error}</div>}

        {/* dates */}
        <section className="bg-white rounded-2xl border border-gray-100 p-4">
          <h2 className="text-sm font-semibold text-gray-900 mb-3">Choisissez votre date</h2>
          <div className="flex gap-2 overflow-x-auto scrollbar-none">
            {dates.map(d=> <DateChip key={d} d={d} />)}
          </div>
        </section>

        {/* heures */}
        {!!filteredTrips.length && (
          <section className="bg-white rounded-2xl border border-gray-100 p-4">
            <h2 className="text-sm font-semibold text-gray-900 mb-3">Choisissez votre heure</h2>
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-2">
              {filteredTrips.map((t:any)=> <TimeBtn key={t.id} t={t} />)}
            </div>
          </section>
        )}

        {/* infos + paiement */}
        {selectedTrip && (
          <>
            <section className="bg-white rounded-2xl border border-gray-100 p-4">
              <h2 className="text-sm font-semibold text-gray-900 mb-3">Informations personnelles</h2>
              <div className="grid sm:grid-cols-2 gap-3">
                {/* Nom */}
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <User className="h-5 w-5 text-gray-400" />
                  </div>
                  <input
                    className="h-11 pl-10 pr-3 w-full border border-gray-200 rounded-lg focus:ring-2 focus:outline-none"
                    placeholder="Nom complet *"
                    value={passenger.fullName}
                    onChange={e=> setPassenger(p=>({...p, fullName: e.target.value}))}
                  />
                </div>

                {/* Téléphone */}
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Phone className="h-5 w-5 text-gray-400" />
                  </div>
                  <input
                    className="h-11 pl-10 pr-3 w-full border border-gray-200 rounded-lg focus:ring-2 focus:outline-none"
                    placeholder="Téléphone *"
                    value={passenger.phone}
                    onChange={e=> setPassenger(p=>({...p, phone: e.target.value}))}
                  />
                </div>

                {/* Places */}
                <div className="sm:col-span-2 flex items-center gap-4">
                  <span className="text-sm text-gray-600">Places</span>
                  <button onClick={()=> setSeats(s=> Math.max(1, s-1))} className="w-9 h-9 rounded-full border grid place-items-center hover:bg-gray-50" style={{ borderColor: theme.lightPrimary, color: theme.primary }}>
                    <Minus className="w-4 h-4" />
                  </button>
                  <span className="px-3 py-1.5 rounded-lg text-sm font-semibold" style={{ background: theme.lightPrimary, color: theme.primary }}>{seats}</span>
                  <button onClick={()=> setSeats(s=> Math.min(Math.min(5, selectedTrip.remainingSeats), s+1))} className="w-9 h-9 rounded-full border grid place-items-center hover:bg-gray-50" style={{ borderColor: theme.lightPrimary, color: theme.primary }}>
                    <Plus className="w-4 h-4" />
                  </button>
                  <span className="text-xs" style={{ color: seatColor(selectedTrip.remainingSeats, selectedTrip.places) }}>
                    {selectedTrip.remainingSeats} pl. dispo
                  </span>
                </div>
              </div>
            </section>

            <section className="bg-white rounded-2xl border border-gray-100 p-4">
              <h2 className="text-sm font-semibold text-gray-900 mb-3">Paiement & preuve</h2>

              {/* CTA pour créer le draft */}
              {!reservationId ? (
                <div className="space-y-3">
                  <p className="text-sm text-gray-600">Cliquez sur « Réserver & Payer » pour bloquer vos places pendant 15 minutes.</p>
                  <button
                    onClick={createReservationDraft}
                    disabled={creating}
                    className="w-full h-11 rounded-xl font-semibold shadow-sm disabled:opacity-60 transition hover:brightness-[0.98]"
                    style={{ background: `linear-gradient(135deg, ${theme.secondary}, ${theme.primary})`, color: '#fff' }}
                  >
                    {creating ? 'Traitement…' : `Réserver & Payer (${(selectedTrip.price * seats).toLocaleString('fr-FR')} FCFA)`}
                  </button>
                </div>
              ) : (
                <>
                  {/* moyens de paiement */}
                  <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
                    {Object.entries(paymentMethods).map(([k,m])=> m && <PaymentPill key={k} k={k} m={m} />)}
                  </div>

                  {/* code USSD réduit */}
                  {paymentMethodKey && paymentMethods[paymentMethodKey]?.ussdPattern && (
                    <div className="mt-3 text-xs text-gray-600">
                      Code USSD : <span className="font-mono bg-gray-50 px-2 py-1 rounded">
                        {paymentMethods[paymentMethodKey]!.ussdPattern!
                          .replace('MERCHANT', paymentMethods[paymentMethodKey]!.merchantNumber || '')
                          .replace('AMOUNT', String(selectedTrip.price * seats))}
                      </span>
                    </div>
                  )}

                  {/* preuve compacte */}
                  <div className="mt-4 grid sm:grid-cols-2 gap-3">
                    <textarea
                      rows={3}
                      className="w-full border border-gray-200 rounded-lg p-3 text-sm focus:ring-2 focus:outline-none"
                      placeholder="Détails du paiement (ID, référence, n° transfert, etc.) — optionnel"
                      value={message}
                      onChange={e=> setMessage(e.target.value)}
                    />
                    <label className="border-2 border-dashed rounded-lg h-[104px] grid place-items-center text-sm text-gray-600 cursor-pointer">
                      <input type="file" className="hidden" onChange={onFile} accept=".png,.jpg,.jpeg,.pdf" />
                      {file ? (
                        <span className="flex items-center gap-2 text-gray-800">
                          <CheckCircle className="w-4 h-4 text-emerald-600" /> {file.name}
                        </span>
                      ) : (
                        <span className="flex items-center gap-2">
                          <Upload className="w-4 h-4" /> Capture (PNG, JPG, PDF · 5MB)
                        </span>
                      )}
                    </label>
                  </div>

                  <div className="mt-3 flex justify-end">
                    <button
                      onClick={submitProofInline}
                      disabled={uploading || !paymentMethodKey}
                      className="h-11 px-5 rounded-xl font-semibold shadow-sm disabled:opacity-60 transition hover:brightness-[0.98]"
                      style={{ background: `linear-gradient(135deg, ${theme.primary}, ${theme.secondary})`, color: '#fff' }}
                    >
                      {uploading ? 'Envoi…' : 'Confirmer l’envoi'}
                    </button>
                  </div>
                </>
              )}
            </section>
          </>
        )}
      </main>

      {/* footer total */}
      {selectedTrip && (
        <div className="fixed bottom-0 inset-x-0 bg-white/90 backdrop-blur border-t border-gray-200">
          <div className="max-w-[1100px] mx-auto px-3 sm:px-4 py-2 flex items-center justify-between">
            <div className="text-sm text-gray-600">
              Total {seats} place{seats>1?'s':''} — <span className="font-semibold" style={{ color: theme.primary }}>
                {(selectedTrip.price * seats).toLocaleString('fr-FR')} FCFA
              </span>
            </div>

            {!reservationId ? (
              <button
                onClick={createReservationDraft}
                disabled={creating || !passenger.fullName || !passenger.phone || !selectedTime}
                className="h-10 px-4 rounded-xl font-semibold shadow-sm disabled:opacity-60 transition hover:brightness-[0.98]"
                style={{ background: `linear-gradient(135deg, ${theme.secondary}, ${theme.primary})`, color: '#fff' }}
              >
                {creating ? 'Traitement…' : 'Réserver & Payer'}
              </button>
            ) : (
              <button
                onClick={submitProofInline}
                disabled={uploading || !paymentMethodKey}
                className="h-10 px-4 rounded-xl font-semibold shadow-sm disabled:opacity-60 transition hover:brightness-[0.98]"
                style={{ background: `linear-gradient(135deg, ${theme.primary}, ${theme.secondary})`, color: '#fff' }}
              >
                {uploading ? 'Envoi…' : 'Confirmer l’envoi'}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
