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
  const { id, slug } =
    useParams<{ id: string; slug: string }>();

  const navigate = useNavigate();
  const location = useLocation();

  const {
    companyInfo: companyInfoFromState,
    reservation: reservationFromState
  } = (location.state || {}) as {
    companyInfo?: CompanyInfo;
    reservation?: Reservation;
  };

  const [reservation, setReservation] =
    useState<Reservation | null>(
      reservationFromState || null
    );

  const [companyInfo, setCompanyInfo] =
    useState<CompanyInfo | null>(
      companyInfoFromState || null
    );

  const [agencyName, setAgencyName] =
    useState<string>('Agence');

  const receiptRef =
    useRef<HTMLDivElement>(null);

  const primaryColor =
    companyInfo?.couleurPrimaire ||
    '#8b3a2f';

  const secondaryColor =
    companyInfo?.couleurSecondaire ||
    '#f59e0b';

  const textColor =
    safeTextColor(primaryColor);

  /* LOAD RESERVATION */
  useEffect(() => {
    if (!id || reservation) return;

    const load = async () => {
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
        setReservation({
          ...(d.data() as Reservation),
          id: d.id
        });
      }
    };

    load();
  }, [id, reservation]);

  /* LOAD COMPANY */
  useEffect(() => {
    if (!reservation?.companyId || companyInfo)
      return;

    const fetchCompany = async () => {
      const snap = await getDoc(
        doc(db, 'companies', reservation.companyId)
      );

      if (!snap.exists()) return;

      const d = snap.data() as any;

      setCompanyInfo({
        id: snap.id,
        name: d.nom || d.name,
        couleurPrimaire:
          d.couleurPrimaire ||
          d.primaryColor,
        couleurSecondaire:
          d.couleurSecondaire ||
          d.secondaryColor,
        logoUrl: d.logoUrl,
        slug: d.slug,
        telephone: d.telephone
      });
    };

    fetchCompany();
  }, [reservation?.companyId, companyInfo]);

  /* AGENCY */
  useEffect(() => {
    const inline =
      reservation?.nomAgence ||
      reservation?.agencyNom ||
      reservation?.agenceNom;

    if (inline)
      setAgencyName(inline.toString().trim());
  }, [reservation]);

  const receiptNumber =
    reservation?.referenceCode ||
    reservation?.id ||
    'BIL-INCONNU';

  const qrValue = useMemo(() => {
    const base = window.location.origin;
    return `${base}/r/${encodeURIComponent(
      receiptNumber
    )}`;
  }, [receiptNumber]);

  const emissionDate = useMemo(() => {
    const ca = reservation?.createdAt;
    let d: Date;

    if (!ca) d = new Date();
    else if (ca instanceof Date)
      d = ca;
    else if (ca?.seconds)
      d = new Date(ca.seconds * 1000);
    else d = new Date();

    return format(d, 'dd/MM/yyyy', {
      locale: fr
    });
  }, [reservation?.createdAt]);

  const formattedDate =
    reservation?.date
      ? format(
          parseISO(reservation.date),
          'dd/MM/yyyy',
          { locale: fr }
        )
      : '';

  const handlePDF =
    useCallback(() => {
      if (!receiptRef.current) return;

      const opt = {
        margin: 2,
        filename: `recu-${receiptNumber}.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true },
        jsPDF: {
          unit: 'mm',
          format: [81, 200],
          orientation: 'portrait'
        }
      };

      // @ts-ignore
      html2pdf()
        .set(opt)
        .from(receiptRef.current)
        .save();
    }, [receiptNumber]);

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
        style={{
          backgroundColor: primaryColor,
          color: textColor
        }}
      >
        <div className="flex items-center justify-between max-w-md mx-auto">
          <button
            onClick={() => navigate(-1)}
            className="p-2 rounded-full"
          >
            <ChevronLeft size={22} />
          </button>
          <h1 className="font-bold text-lg">
            Reçu de réservation
          </h1>
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
            statut={reservation.statut}
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
          style={{
            backgroundColor: primaryColor,
            color: textColor
          }}
        >
          <Download size={16} />
          Télécharger
        </button>

        <button
          onClick={() => window.print()}
          className="py-2 rounded-lg font-medium flex items-center justify-center gap-1"
          style={{
            backgroundColor: secondaryColor,
            color: safeTextColor(secondaryColor)
          }}
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
