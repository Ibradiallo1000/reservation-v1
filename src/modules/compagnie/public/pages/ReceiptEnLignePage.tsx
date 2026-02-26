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

import {
  doc,
  getDoc,
  collectionGroup,
  getDocs,
  query,
  where,
  limit
} from 'firebase/firestore';

import { db } from '@/firebaseConfig';
import { ChevronLeft, Download, Printer, Home } from 'lucide-react';
import html2pdf from 'html2pdf.js';
import { safeTextColor } from '@/utils/color';
import { format, parseISO } from 'date-fns';
import { fr } from 'date-fns/locale';

import TicketOnline from '@/modules/compagnie/public/components/ticket/TicketOnline';
import { getEffectiveStatut } from '@/utils/reservationStatusUtils';
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

  const {
    companyInfo: companyInfoFromState,
    reservation: reservationFromState,
    companyId: companyIdFromState,
    agencyId: agencyIdFromState,
  } = (location.state || {}) as {
    companyInfo?: CompanyInfo;
    reservation?: Reservation;
    companyId?: string;
    agencyId?: string;
  };

  const [reservation, setReservation] = useState<Reservation | null>(reservationFromState ?? null);
  const [companyInfo, setCompanyInfo] = useState<CompanyInfo | null>(companyInfoFromState ?? null);
  const [agencyName, setAgencyName] = useState<string>('Agence');
  const [loading, setLoading] = useState<boolean>(!reservationFromState);
  const [notFound, setNotFound] = useState<boolean>(false);

  const receiptRef = useRef<HTMLDivElement>(null);

  const primaryColor = companyInfo?.couleurPrimaire ?? '#8b3a2f';
  const secondaryColor = companyInfo?.couleurSecondaire ?? '#f59e0b';
  const textColor = safeTextColor(primaryColor);

  /* LOAD RESERVATION — par ID uniquement, sans filtre statut */
  useEffect(() => {
    if (!id) {
      setLoading(false);
      setNotFound(true);
      return;
    }
    if (reservationFromState?.id === id) {
      setLoading(false);
      return;
    }

    const companyId = companyIdFromState ?? reservation?.companyId;
    const agencyId = agencyIdFromState ?? reservation?.agencyId;

    const load = async () => {
      setLoading(true);
      setNotFound(false);

      const firestorePath = companyId && agencyId
        ? `companies/${companyId}/agences/${agencyId}/reservations/${id}`
        : null;

      console.log('[ReceiptEnLignePage] load', { id, companyId, agencyId, firestorePath });

      try {
        // 1) Si on a companyId + agencyId (ex: depuis Mes Billets), lecture directe par path
        if (companyId && agencyId) {
          const resRef = doc(db, 'companies', companyId, 'agences', agencyId, 'reservations', id);
          const snap = await getDoc(resRef);
          console.log('[ReceiptEnLignePage] getDoc path', resRef.path, 'exists:', snap.exists());

          if (snap.exists()) {
            const data = snap.data() as Record<string, unknown>;
            setReservation({
              id: snap.id,
              companyId,
              agencyId,
              companySlug: (data.companySlug as string) ?? '',
              nomClient: (data.nomClient as string) ?? (data.clientNom as string) ?? '',
              telephone: (data.telephone as string) ?? '',
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
            });
            setLoading(false);
            return;
          }
        }

        // 2) Sinon fallback: collectionGroup par referenceCode ou par __name__ (aucun filtre statut)
        let snap = await getDocs(
          query(
            collectionGroup(db, 'reservations'),
            where('referenceCode', '==', id),
            limit(1)
          )
        );

        if (snap.empty) {
          snap = await getDocs(
            query(
              collectionGroup(db, 'reservations'),
              where('__name__', '==', id),
              limit(1)
            )
          );
        }

        if (!snap.empty) {
          const d = snap.docs[0];
          const refPath = d.ref.path;
          const pathSegments = refPath.split('/');
          const cId = pathSegments[1];
          const aId = pathSegments[3];
          const data = d.data() as Record<string, unknown>;
          setReservation({
            ...(data as Partial<Reservation>),
            id: d.id,
            companyId: cId,
            agencyId: aId,
            companySlug: (data.companySlug as string) ?? '',
            nomClient: (data.nomClient as string) ?? (data.clientNom as string) ?? '',
            telephone: (data.telephone as string) ?? '',
            depart: (data.depart as string) ?? (data.departure as string) ?? '',
            arrivee: (data.arrivee as string) ?? (data.arrival as string) ?? '',
            date: typeof data.date === 'string' ? data.date : (data.date as any)?.seconds ? new Date((data.date as any).seconds * 1000).toISOString().slice(0, 10) : '',
            heure: (data.heure as string) ?? '',
            montant: Number(data.montant ?? data.montant_total ?? 0),
            seatsGo: Number(data.seatsGo ?? data.nombre_places ?? data.seats ?? 1),
          });
        } else {
          setNotFound(true);
        }
      } catch (err) {
        console.error('[ReceiptEnLignePage] load error', err);
        setNotFound(true);
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [id, companyIdFromState, agencyIdFromState, reservationFromState?.id]);

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
      } finally {
        setLoading(false);
      }
    };

    fetchCompany();
  }, [reservation?.companyId, companyInfo]);

  /* AGENCY */
  useEffect(() => {
    const inline =
      reservation?.nomAgence ||
      reservation?.agencyNom ||
      reservation?.agenceNom;
    if (inline) setAgencyName(inline.toString().trim());
  }, [reservation]);

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
      <div className="flex items-center justify-center min-h-screen">
        Chargement du reçu...
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
      <header
        className="sticky top-0 z-20 px-4 py-2 shadow-sm"
        style={{ backgroundColor: primaryColor, color: textColor }}
      >
        <div className="flex items-center justify-between max-w-md mx-auto">
          <button onClick={() => navigate(-1)} className="p-2 rounded-full">
            <ChevronLeft size={22} />
          </button>
          <h1 className="font-bold text-lg">Reçu de réservation</h1>
          <div className="w-8" />
        </div>
      </header>

      <main className="max-w-md mx-auto px-4 py-6">
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
