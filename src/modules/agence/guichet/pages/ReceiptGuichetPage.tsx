// src/pages/ReceiptGuichetPage.tsx

import React, {
  useEffect,
  useState,
  useRef,
  useCallback,
  useMemo
} from 'react';

import { useParams, useNavigate, useLocation } from 'react-router-dom';

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
import html2pdf from 'html2pdf.js';
import { format, parseISO } from 'date-fns';
import { fr } from 'date-fns/locale';
import { ChevronLeft, Download, Home, Printer } from 'lucide-react';
import { safeTextColor } from '@/utils/color';
import LoadingSpinner from '@/shared/ui/LoadingSpinner';
import ErrorMessage from '@/shared/ui/ErrorMessage';

import ReceiptModal from '@/modules/agence/guichet/components/ReceiptModal';
import type { ReservationStatus } from '@/types/reservation';

interface ReservationData {
  id: string;
  nomClient: string;
  telephone: string;
  date: string;
  heure: string;
  depart: string;
  arrivee: string;
  seatsGo: number;
  montant: number;
  statut: ReservationStatus;
  compagnieId: string;
  agencyNom?: string;
  nomAgence?: string;
  canal: string;
  createdAt:
    | { seconds: number; nanoseconds: number }
    | Date
    | undefined;
  referenceCode?: string;
  guichetierCode?: string;
  shiftId?: string | null;
}

interface CompanyData {
  id: string;
  nom: string;
  logoUrl?: string;
  couleurPrimaire: string;
  couleurSecondaire?: string;
  slug: string;
  telephone?: string;
}

interface LocationState {
  companyInfo?: CompanyData;
  reservation?: ReservationData;
  from?: string;
}

const ReceiptGuichetPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();

  const {
    companyInfo: companyInfoFromState,
    reservation: reservationFromState,
    from
  } = (location.state as LocationState) || {};

  const [reservation, setReservation] =
    useState<ReservationData | null>(
      reservationFromState || null
    );

  const [company, setCompany] =
    useState<CompanyData | null>(
      companyInfoFromState || null
    );

  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState<string | null>(null);

  const receiptRef =
    useRef<HTMLDivElement>(null);

  /* ================================
     FORMAT DATE SAFE
  =================================*/

  const formatDate = useCallback(
    (
      dateInput:
        | string
        | Date
        | { seconds: number; nanoseconds: number },
      formatStr: string
    ) => {
      try {
        let date: Date;

        if (typeof dateInput === 'string')
          date = parseISO(dateInput);
        else if (dateInput instanceof Date)
          date = dateInput;
        else
          date = new Date(
            dateInput.seconds * 1000
          );

        return format(date, formatStr, {
          locale: fr
        });
      } catch {
        return '--/--/----';
      }
    },
    []
  );

  /* ================================
     FALLBACK RESERVATION
  =================================*/

  const fetchReservationFallback =
    useCallback(async () => {
      if (!id)
        throw new Error('ID manquant');

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

      if (snap.empty)
        throw new Error('Réservation introuvable');

      const d = snap.docs[0];
      const data = d.data() as any;
      const parts = d.ref.path.split('/');

      const companyId = parts[1];

      return {
        ...data,
        id: d.id,
        compagnieId:
          data.compagnieId || companyId,
        createdAt:
          data.createdAt?.seconds
            ? new Date(
                data.createdAt.seconds * 1000
              )
            : undefined
      } as ReservationData;
    }, [id]);

  /* ================================
     FETCH COMPANY
  =================================*/

  const fetchCompany = useCallback(
    async (companyId: string) => {
      const snap = await getDoc(
        doc(db, 'companies', companyId)
      );

      if (!snap.exists())
        throw new Error('Compagnie non trouvée');

      const raw = snap.data() as any;

      return {
        id: snap.id,
        nom: raw.nom || raw.name,
        logoUrl: raw.logoUrl,
        couleurPrimaire:
          raw.couleurPrimaire ||
          raw.theme?.primary ||
          '#3b82f6',
        couleurSecondaire:
          raw.couleurSecondaire ||
          raw.theme?.secondary,
        slug: raw.slug,
        telephone: raw.telephone
      } as CompanyData;
    },
    []
  );

  /* ================================
     INIT LOAD
  =================================*/

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);

        let res =
          reservationFromState || null;
        let comp =
          companyInfoFromState || null;

        if (!res)
          res =
            await fetchReservationFallback();

        if (!comp)
          comp = await fetchCompany(
            res!.compagnieId
          );

        setReservation(res!);
        setCompany(comp!);
      } catch (e: any) {
        setError(
          e?.message ||
            'Erreur de chargement'
        );
      } finally {
        setLoading(false);
      }
    })();
  }, [
    fetchCompany,
    fetchReservationFallback,
    reservationFromState,
    companyInfoFromState
  ]);

  if (loading || !company)
    return <LoadingSpinner fullScreen />;

  if (error || !reservation)
    return (
      <ErrorMessage
        message={
          error ||
          'Erreur de chargement'
        }
        onRetry={() =>
          window.location.reload()
        }
        onHome={() =>
          navigate('/')
        }
      />
    );

  /* ================================
     VALUES
  =================================*/

  const receiptNumber =
    reservation.referenceCode ||
    reservation.id;

  const qrValue = `${window.location.origin}/r/${encodeURIComponent(
    receiptNumber
  )}`;

  const emissionDate = formatDate(
    reservation.createdAt ||
      new Date(),
    'dd/MM/yyyy'
  );

  const primaryColor =
    company.couleurPrimaire;

  const secondaryColor =
    company.couleurSecondaire;

  const textColor =
    safeTextColor(primaryColor);

  /* ================================
     PDF
  =================================*/

  const handlePDF =
    useCallback(() => {
      if (!receiptRef.current)
        return;

      const opt = {
        margin: 2,
        filename: `recu-${receiptNumber}.pdf`,
        image: {
          type: 'jpeg',
          quality: 0.98
        },
        html2canvas: {
          scale: 2,
          useCORS: true
        },
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

  const handleBack =
    useCallback(() => {
      if (from) navigate(from);
      else navigate('/agence/guichet');
    }, [navigate, from]);

  /* ================================
     RENDER
  =================================*/

  return (
    <div className="min-h-screen bg-gray-50 print:bg-white">
      <header
        className="sticky top-0 z-50 px-4 py-3 shadow-sm no-print"
        style={{
          backgroundColor: primaryColor,
          color: textColor
        }}
      >
        <div className="flex items-center justify-between max-w-7xl mx-auto">
          <button
            onClick={handleBack}
            className="p-2 rounded-full"
          >
            <ChevronLeft />
          </button>

          <h1 className="font-bold text-sm">
            Reçu de voyage
          </h1>

          <div className="w-6" />
        </div>
      </header>

      <div
        className="max-w-[81mm] mx-auto p-2"
        ref={receiptRef}
      >
        <ReceiptModal
  open={true}
  onClose={() => navigate('/agence/guichet')}
  reservation={{
    ...reservation,
    agencyNom: reservation.agencyNom || reservation.nomAgence
  }}
  company={{
    id: company.id,
    nom: company.nom,
    logoUrl: company.logoUrl,
    couleurPrimaire: company.couleurPrimaire,
    couleurSecondaire: company.couleurSecondaire,
    telephone: company.telephone,
    slug: company.slug
  }}
/>
      </div>

      <div className="no-print fixed bottom-0 left-0 right-0 bg-white border-t py-3 px-4 grid grid-cols-3 gap-2">
        <button
          onClick={handlePDF}
          className="py-2 rounded-lg font-medium flex items-center justify-center gap-1"
          style={{
            backgroundColor: primaryColor,
            color: textColor
          }}
        >
          <Download size={16} /> PDF
        </button>

        <button
          onClick={() => window.print()}
          className="py-2 rounded-lg font-medium flex items-center justify-center gap-1"
          style={{
            backgroundColor:
              secondaryColor ||
              primaryColor,
            color: safeTextColor(
              secondaryColor ||
                primaryColor
            )
          }}
        >
          <Printer size={16} /> Imprimer
        </button>

        <button
          onClick={() =>
            navigate('/agence/guichet')
          }
          className="py-2 rounded-lg bg-gray-200 text-gray-800 flex items-center justify-center gap-1"
        >
          <Home size={16} /> Retour
        </button>
      </div>
    </div>
  );
};

export default ReceiptGuichetPage;
