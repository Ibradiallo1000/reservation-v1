// src/pages/ReceiptEnLignePage.tsx

import React, {
  useEffect,
  useState,
  useRef,
  useCallback,
  useMemo
} from 'react';

import {
  useParams,
  useNavigate,
  useLocation
} from 'react-router-dom';

import { doc, getDoc, onSnapshot } from 'firebase/firestore';
import { db } from '@/firebaseConfig';
import { resolveReservationById } from '@/modules/compagnie/public/utils/resolveReservation';
import { Download, Printer, Home } from 'lucide-react';
import ReservationStepHeader from '@/modules/compagnie/public/components/ReservationStepHeader';
import html2pdf from 'html2pdf.js';
import { safeTextColor } from '@/utils/color';
import { format, parseISO } from 'date-fns';
import { fr } from 'date-fns/locale';
import { useOnlineStatus } from '@/shared/hooks/useOnlineStatus';
import { PageLoadingState } from '@/shared/ui/PageStates';

import TicketOnline from '@/modules/compagnie/public/components/ticket/TicketOnline';
import { getEffectiveStatut } from '@/utils/reservationStatusUtils';
import { getDisplayPhone } from '@/utils/phoneUtils';
import type { ReservationStatus } from '@/types/reservation';

interface Reservation {
  id: string;
  nomClient: string;
  telephone: string;
  depart: string;
  arrivee: string;
  date: string;
  heure: string;
  montant: number;
  referenceCode?: string;
  companyId: string;
  companySlug: string;
  agencyId?: string;
  nomAgence?: string;
  agencyNom?: string;
  agenceNom?: string;
  statut?: ReservationStatus;
  canal?: string;
  seatsGo: number;
  createdAt?: any;
  modePaiement?: string;
  preuveVia?: string;
  remboursement?: { mode?: string };
}

interface CompanyInfo {
  id: string;
  name: string;
  couleurPrimaire?: string;
  couleurSecondaire?: string;
  logoUrl?: string;
  slug?: string;
  telephone?: string;
}

const ReceiptEnLignePage: React.FC = () => {
  const params = useParams<{ slug?: string; id?: string }>();
  const location = useLocation();
  const navigate = useNavigate();

  // RouteResolver uses /:slug/* so "id" is not in params; extract from pathname
  const pathParts = useMemo(() => location.pathname.split('/').filter(Boolean), [location.pathname]);
  const slug = params.slug ?? pathParts[0] ?? '';
  const id = params.id ?? (pathParts[1] === 'receipt' ? pathParts[2] : undefined);

  const [reservation, setReservation] = useState<Reservation | null>(null);
  const [companyInfo, setCompanyInfo] = useState<CompanyInfo | null>(null);
  const [agencyName, setAgencyName] = useState<string>('Agence');
  const [agencyLatitude, setAgencyLatitude] = useState<number | null>(null);
  const [agencyLongitude, setAgencyLongitude] = useState<number | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [notFound, setNotFound] = useState<boolean>(false);
  const [loadError, setLoadError] = useState<string>('');
  const [reloadKey, setReloadKey] = useState(0);
  const isOnline = useOnlineStatus();

  const receiptRef = useRef<HTMLDivElement>(null);

  const primaryColor = companyInfo?.couleurPrimaire ?? '#8b3a2f';
  const secondaryColor = companyInfo?.couleurSecondaire ?? '#f59e0b';
  const textColor = safeTextColor(primaryColor);

  /* LOAD RESERVATION — onSnapshot for real-time update when company validates (statut → confirme) */
  useEffect(() => {
    if (!id || !slug) {
      setLoading(false);
      setNotFound(!id);
      return;
    }

    let unsub: (() => void) | undefined;
    (async () => {
      setLoading(true);
      setNotFound(false);
      setLoadError('');
      try {
        const { ref: resRef } = await resolveReservationById(slug, id);
        unsub = onSnapshot(resRef, (snap) => {
          if (!snap.exists()) {
            setNotFound(true);
            setReservation(null);
            setLoading(false);
            return;
          }
          const data = snap.data() as Record<string, unknown>;
          const companyId = resRef.path.split('/')[1];
          const agencyId = resRef.path.split('/')[3];
          setReservation({
            id: snap.id,
            companyId,
            agencyId,
            companySlug: (data.companySlug as string) ?? '',
            nomClient: (data.nomClient as string) ?? (data.clientNom as string) ?? '',
            telephone: getDisplayPhone(data),
            depart: (data.depart as string) ?? (data.departure as string) ?? '',
            arrivee: (data.arrivee as string) ?? (data.arrival as string) ?? '',
            date: typeof data.date === 'string' ? data.date : (data.date as any)?.seconds ? new Date((data.date as any).seconds * 1000).toISOString().slice(0, 10) : '',
            heure: (data.heure as string) ?? '',
            montant: Number(data.montant ?? data.montant_total ?? 0),
            referenceCode: data.referenceCode as string | undefined,
            statut: data.statut as ReservationStatus | undefined,
            canal: (data.canal as string) ?? 'en_ligne',
            seatsGo: Number(data.seatsGo ?? data.nombre_places ?? data.seats ?? 1),
            createdAt: data.createdAt,
            nomAgence: data.nomAgence as string | undefined,
            agencyNom: data.agencyNom as string | undefined,
            agenceNom: data.agenceNom as string | undefined,
            modePaiement: data.modePaiement as string | undefined,
            preuveVia: data.preuveVia as string | undefined,
            remboursement: data.remboursement as { mode?: string } | undefined,
          });
          setLoading(false);
        }, (err) => {
          console.error('ReceiptEnLignePage onSnapshot error:', err);
          setLoadError(!isOnline ? 'Connexion indisponible.' : 'Erreur de chargement du reçu.');
          setNotFound(true);
          setLoading(false);
        });
      } catch (err) {
        setLoadError(
          !isOnline
            ? 'Connexion indisponible. Impossible de charger le reçu.'
            : 'Erreur de chargement du reçu. Veuillez réessayer.'
        );
        setNotFound(true);
        setLoading(false);
      }
    })();
    return () => {
      if (unsub) unsub();
    };
  }, [id, slug, isOnline, reloadKey]);

  /* LOAD COMPANY */
  useEffect(() => {
    if (!reservation?.companyId || companyInfo) return;

    const fetchCompany = async () => {
      try {
        const snap = await getDoc(doc(db, 'companies', reservation.companyId));
        if (!snap.exists()) return;
        const d = snap.data() as any;
        setCompanyInfo({
          id: snap.id,
          name: d.nom || d.name,
          couleurPrimaire: d.couleurPrimaire || d.primaryColor,
          couleurSecondaire: d.couleurSecondaire || d.secondaryColor,
          logoUrl: d.logoUrl,
          slug: d.slug,
          telephone: d.telephone,
        });
      } catch {
        setLoadError(
          !isOnline
            ? 'Connexion indisponible. Impossible de charger les infos compagnie.'
            : 'Erreur lors du chargement des informations de la compagnie.'
        );
      } finally {
        setLoading(false);
      }
    };

    fetchCompany();
  }, [reservation?.companyId, companyInfo, isOnline]);

  /* AGENCY name + coords (for itinéraire) */
  useEffect(() => {
    const inline =
      reservation?.nomAgence ||
      reservation?.agencyNom ||
      reservation?.agenceNom;
    if (inline) setAgencyName(inline.toString().trim());
  }, [reservation]);

  useEffect(() => {
    const companyId = reservation?.companyId;
    const agencyId = reservation?.agencyId;
    if (!companyId || !agencyId) return;
    let cancelled = false;
    (async () => {
      try {
        const agSnap = await getDoc(doc(db, 'companies', companyId, 'agences', agencyId));
        if (cancelled) return;
        const ag = agSnap.exists() ? (agSnap.data() as any) : {};
        const lat = ag?.latitude != null ? Number(ag.latitude) : null;
        const lng = ag?.longitude != null ? Number(ag.longitude) : null;
        if (!cancelled) {
          setAgencyLatitude(Number.isFinite(lat) ? lat : null);
          setAgencyLongitude(Number.isFinite(lng) ? lng : null);
        }
      } catch {}
    })();
    return () => { cancelled = true; };
  }, [reservation?.companyId, reservation?.agencyId]);

  const receiptNumber = reservation?.referenceCode ?? reservation?.id ?? 'BIL-INCONNU';
  const qrValue = useMemo(() => {
    const base = window.location.origin;
    return `${base}/r/${encodeURIComponent(receiptNumber)}`;
  }, [receiptNumber]);

  const emissionDate = useMemo(() => {
    const ca = reservation?.createdAt;
    let d: Date;
    if (!ca) d = new Date();
    else if (ca instanceof Date) d = ca;
    else if (ca?.seconds) d = new Date(ca.seconds * 1000);
    else d = new Date();
    return format(d, 'dd/MM/yyyy', { locale: fr });
  }, [reservation?.createdAt]);

  const formattedDate = reservation?.date
    ? format(parseISO(reservation.date), 'dd/MM/yyyy', { locale: fr })
    : '';

  /** Libellé dynamique mode de paiement : guichet → espèces, en_ligne → preuveVia, remboursé → mode remboursement. */
  const paymentMethodDisplay = useMemo(() => {
    if (!reservation) return undefined;
    const effective = getEffectiveStatut(reservation) ?? reservation.statut;
    if (effective === 'rembourse' && reservation.remboursement?.mode) {
      const m = reservation.remboursement.mode.toLowerCase();
      if (m === 'especes' || m === 'espèces') return 'Remboursé (espèces)';
      if (m.includes('mobile') || m === 'mobile_money') return 'Remboursé (Mobile Money)';
      return `Remboursé (${reservation.remboursement.mode})`;
    }
    if ((reservation.canal ?? '').toLowerCase() === 'guichet') return reservation.modePaiement ? `Paiement ${reservation.modePaiement}` : undefined;
    return reservation.preuveVia ?? undefined;
  }, [reservation]);

  const handlePDF = useCallback(() => {
    if (!receiptRef.current) return;
    const opt = {
      margin: 2,
      filename: `recu-${receiptNumber}.pdf`,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true },
      jsPDF: { unit: 'mm', format: [81, 200], orientation: 'portrait' },
    };
    // @ts-ignore
    html2pdf().set(opt).from(receiptRef.current).save();
  }, [receiptNumber]);

  if (loading) {
    return (
      <div className="min-h-screen p-6 bg-gray-50">
        <div className="max-w-md mx-auto">
          <PageLoadingState />
        </div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-6">
        <h1 className="text-xl font-semibold text-gray-800 mb-2">Erreur de chargement</h1>
        <p className="text-gray-500 text-center mb-4">{loadError}</p>
        <button
          type="button"
          onClick={() => setReloadKey((v) => v + 1)}
          className="px-4 py-2 rounded-lg font-medium text-white"
          style={{ backgroundColor: primaryColor }}
        >
          Réessayer
        </button>
      </div>
    );
  }

  if (notFound || !id) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-6">
        <h1 className="text-xl font-semibold text-gray-800 mb-2">Réservation introuvable</h1>
        <p className="text-gray-500 text-center mb-4">
          Ce reçu n’existe pas ou le lien est incorrect.
        </p>
        <button
          type="button"
          onClick={() => navigate(slug ? `/${slug}` : '/')}
          className="px-4 py-2 rounded-lg font-medium text-white"
          style={{ backgroundColor: primaryColor }}
        >
          Retour à l’accueil
        </button>
      </div>
    );
  }

  if (!reservation || !companyInfo) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        Chargement du reçu...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <ReservationStepHeader
        onBack={() => navigate(-1)}
        primaryColor={primaryColor}
        secondaryColor={secondaryColor}
        title="Confirmation"
        subtitle={reservation ? `${reservation.depart} → ${reservation.arrivee}` : undefined}
        logoUrl={companyInfo.logoUrl}
      />

      <main className="max-w-md mx-auto px-4 py-6 -mt-2">
        <div ref={receiptRef}>
          <TicketOnline
            companyName={companyInfo.name}
            logoUrl={companyInfo.logoUrl}
            primaryColor={primaryColor}
            secondaryColor={secondaryColor}
            agencyName={agencyName}
            receiptNumber={receiptNumber}
            statut={getEffectiveStatut(reservation) ?? reservation.statut}
            nomClient={reservation.nomClient}
            telephone={reservation.telephone}
            depart={reservation.depart}
            arrivee={reservation.arrivee}
            date={formattedDate}
            heure={reservation.heure}
            seats={reservation.seatsGo}
            canal={reservation.canal || 'en_ligne'}
            montant={reservation.montant}
            qrValue={qrValue}
            emissionDate={emissionDate}
            paymentMethod={paymentMethodDisplay}
            agencyLatitude={agencyLatitude}
            agencyLongitude={agencyLongitude}
          />
        </div>
      </main>

      <div className="fixed bottom-0 left-0 right-0 bg-white border-t py-3 px-4 grid grid-cols-3 gap-2">
        <button
          onClick={handlePDF}
          className="py-2 rounded-lg font-medium flex items-center justify-center gap-1"
          style={{ backgroundColor: primaryColor, color: textColor }}
        >
          <Download size={16} />
          Télécharger
        </button>
        <button
          onClick={() => window.print()}
          className="py-2 rounded-lg font-medium flex items-center justify-center gap-1"
          style={{ backgroundColor: secondaryColor, color: safeTextColor(secondaryColor) }}
        >
          <Printer size={16} />
          Imprimer
        </button>
        <button
          onClick={() => navigate(`/${slug}`)}
          className="py-2 rounded-lg bg-gray-200 text-gray-800 flex items-center justify-center gap-1"
        >
          <Home size={16} />
          Retour
        </button>
      </div>
    </div>
  );
};

export default ReceiptEnLignePage;
