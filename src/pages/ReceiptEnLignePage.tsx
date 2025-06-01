import React, { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import QRCode from 'react-qr-code';
import html2pdf from 'html2pdf.js';
import { format, parseISO } from 'date-fns';
import { fr } from 'date-fns/locale';

interface ReservationData {
  id: string;
  nomClient: string;
  telephone: string;
  date: string;
  heure: string;
  depart: string;
  arrivee: string;
  seatsGo: number;
  seatsReturn?: number;
  montant: number;
  statut: 'confirmé' | 'annulé' | 'en attente';
  paiement: 'espèces' | 'mobile_money' | 'carte';
  compagnieId: string;
  compagnieNom: string;
  compagnieLogo: string;
  compagnieCouleur: string;
  agencyId?: string;
  canal: 'en ligne' | 'agence' | 'téléphone';
  createdAt: { seconds: number; nanoseconds: number } | Date;
  companySlug: string;
}

interface CompagnieData {
  nom: string;
  logoUrl: string;
  couleurPrimaire: string;
  slug: string;
  signatureUrl?: string;
  agenceNom?: string;
}

const ReceiptEnLignePage: React.FC = () => {
  const { id, slug } = useParams<{ id: string; slug: string }>();
  const navigate = useNavigate();
  const [reservation, setReservation] = useState<ReservationData | null>(null);
  const [compagnie, setCompagnie] = useState<CompagnieData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const receiptRef = useRef<HTMLDivElement>(null);

  const formatDate = (dateInput: string | Date | { seconds: number; nanoseconds: number }, formatStr: string) => {
    try {
      let date: Date;
      
      if (typeof dateInput === 'string') {
        date = parseISO(dateInput);
      } else if (dateInput instanceof Date) {
        date = dateInput;
      } else {
        date = new Date(dateInput.seconds * 1000);
      }
      
      return format(date, formatStr, { locale: fr });
    } catch {
      return 'Date invalide';
    }
  };

  const generateReceiptNumber = () => {
    if (!reservation) return 'ONL-000000';
    const date = reservation.createdAt instanceof Date ? 
      reservation.createdAt : 
      new Date(reservation.createdAt.seconds * 1000);
    const year = date.getFullYear();
    const num = reservation.id.slice(0, 6).toUpperCase();
    return `ONL-${year}-${num}`;
  };

  useEffect(() => {
    const fetchData = async () => {
      if (!id || !slug) {
        setError("Paramètres manquants dans l'URL");
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        const ref = doc(db, 'reservations', id);
        const snap = await getDoc(ref);

        if (!snap.exists()) {
          setError("Réservation introuvable");
          setLoading(false);
          return;
        }

        const data = snap.data() as Omit<ReservationData, 'id'>;
        if (!data.companySlug || data.companySlug !== slug) {
          setError("URL invalide pour cette réservation");
          setLoading(false);
          return;
        }

        const reservationData: ReservationData = {
          ...data,
          id: snap.id,
          createdAt: data.createdAt instanceof Date ? 
            data.createdAt : 
            new Date(data.createdAt.seconds * 1000)
        };

        // Charger les infos de l'agence si elle existe
        let agenceNom = '';
        if (data.agencyId) {
          const agencySnap = await getDoc(doc(db, 'agences', data.agencyId));
          if (agencySnap.exists()) {
            agenceNom = agencySnap.data().nom || '';
          }
        }

        setReservation(reservationData);
        setCompagnie({
          nom: data.compagnieNom,
          logoUrl: data.compagnieLogo,
          couleurPrimaire: data.compagnieCouleur || '#3b82f6',
          slug: data.companySlug,
          agenceNom: agenceNom
        });

      } catch (err) {
        console.error("Erreur lors du chargement :", err);
        setError(err instanceof Error ? err.message : "Une erreur s'est produite");
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [id, slug]);

  const handlePDF = () => {
    if (receiptRef.current) {
      const opt = {
        margin: 5,
        filename: `recu-${generateReceiptNumber()}.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { 
          scale: 2,
          useCORS: true,
          allowTaint: true,
          scrollX: 0,
          scrollY: 0
        },
        jsPDF: { unit: 'mm', format: 'a5', orientation: 'portrait' }
      };

      html2pdf()
        .set(opt)
        .from(receiptRef.current)
        .save();
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto"></div>
          <p className="mt-4 text-gray-600">Chargement du reçu...</p>
        </div>
      </div>
    );
  }

  if (error || !reservation || !compagnie) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="text-center p-6 max-w-md bg-white rounded-lg shadow-md">
          <div className="text-red-500 mb-4">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-gray-800 mb-2">Erreur</h2>
          <p className="text-gray-600 mb-6">{error || 'Données introuvables'}</p>
          <button 
            onClick={() => navigate('/')}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
          >
            Retour à l'accueil
          </button>
        </div>
      </div>
    );
  }

  const qrContent = JSON.stringify({
    receiptNumber: generateReceiptNumber(),
    compagnie: compagnie.nom,
    nom: reservation.nomClient,
    tel: reservation.telephone,
    date: reservation.date,
    heure: reservation.heure,
    depart: reservation.depart,
    arrivee: reservation.arrivee,
    places: `${reservation.seatsGo} aller${reservation.seatsReturn ? ` + ${reservation.seatsReturn} retour` : ''}`,
    montant: `${reservation.montant?.toLocaleString('fr-FR')} FCFA`,
    statut: reservation.statut,
    paiement: reservation.paiement,
    canal: reservation.canal
  });

  return (
    <div className="bg-gray-50 min-h-screen py-4 px-2 sm:px-4 print:bg-white print:py-0">
      <div 
        ref={receiptRef} 
        className="max-w-md mx-auto bg-white rounded-lg shadow-sm overflow-hidden print:shadow-none print:border-none print:rounded-none"
        style={{ borderTop: `6px solid ${compagnie.couleurPrimaire}` }}
      >
        {/* En-tête amélioré avec nom d'agence */}
<div 
  className="p-4"
  style={{ backgroundColor: compagnie.couleurPrimaire }}
>
  <div className="flex justify-between items-start">
    <div>
      <h1 className="text-xl font-bold text-white truncate">
        {compagnie.nom}
      </h1>
      {compagnie.agenceNom && (
        <p className="text-xs text-white opacity-80 mt-1 italic">
          Agence : {compagnie.agenceNom}
        </p>
      )}
      <p className="text-xs text-white opacity-80 mt-1">
        Reçu en ligne • {generateReceiptNumber()}
      </p>
    </div>
    <img 
      src={compagnie.logoUrl} 
      alt={compagnie.nom} 
      className="h-12 object-contain bg-white p-1 rounded"
      onError={(e) => {
        const target = e.target as HTMLImageElement;
        target.src = '/default-company.png';
      }}
    />
  </div>
</div>

        {/* Corps du reçu (inchangé) */}
        <div className="p-4">
          <div className="space-y-4">
            {/* Section Client */}
            <div className="bg-gray-50 p-3 rounded-lg border border-gray-200">
              <h2 className="font-semibold text-base mb-2" style={{ color: compagnie.couleurPrimaire }}>
                Informations client
              </h2>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-600">Nom :</span>
                  <span className="text-gray-800 font-medium">{reservation.nomClient}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Téléphone :</span>
                  <span className="text-gray-800">{reservation.telephone}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Canal :</span>
                  <span className="text-gray-800 capitalize">{reservation.canal}</span>
                </div>
              </div>
            </div>

            {/* Section Voyage */}
            <div className="bg-gray-50 p-3 rounded-lg border border-gray-200">
              <h2 className="font-semibold text-base mb-2" style={{ color: compagnie.couleurPrimaire }}>
                Détails du voyage
              </h2>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-600">Trajet :</span>
                  <span className="text-gray-800 text-right">
                    {reservation.depart} → {reservation.arrivee}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Date :</span>
                  <span className="text-gray-800">
                    {formatDate(reservation.date, 'dd MMM yyyy')}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Heure :</span>
                  <span className="text-gray-800">{reservation.heure}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Places :</span>
                  <span className="text-gray-800">
                    {reservation.seatsGo} aller
                    {reservation.seatsReturn ? ` + ${reservation.seatsReturn} retour` : ''}
                  </span>
                </div>
              </div>
            </div>

            {/* Section Paiement */}
            <div className="bg-gray-50 p-3 rounded-lg border border-gray-200">
              <h2 className="font-semibold text-base mb-2" style={{ color: compagnie.couleurPrimaire }}>
                Paiement
              </h2>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-600">Montant :</span>
                  <span className="text-gray-800 font-bold">
                    {reservation.montant?.toLocaleString('fr-FR')} FCFA
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Méthode :</span>
                  <span className="text-gray-800 capitalize">
                    {reservation.paiement}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-600">Statut :</span>
                  <span 
                    className={`px-2 py-1 rounded text-xs ${
                      reservation.statut === 'confirmé' 
                        ? 'bg-green-100 text-green-800' 
                        : reservation.statut === 'annulé'
                        ? 'bg-red-100 text-red-800'
                        : 'bg-yellow-100 text-yellow-800'
                    }`}
                  >
                    {reservation.statut}
                  </span>
                </div>
              </div>
            </div>

            {/* QR Code */}
            <div className="bg-gray-50 p-4 rounded-lg border border-gray-200 flex flex-col items-center">
              <h2 className="font-semibold text-base mb-2" style={{ color: compagnie.couleurPrimaire }}>
                Code d'embarquement
              </h2>
              <div className="bg-white p-2 rounded border" style={{ borderColor: compagnie.couleurPrimaire }}>
                <QRCode 
                  value={qrContent} 
                  size={120}
                  fgColor={compagnie.couleurPrimaire}
                />
              </div>
              <p className="text-xs text-gray-500 mt-2 text-center">
                Présentez ce code au chauffeur
              </p>
            </div>
          </div>

          {/* Mentions légales */}
          <div className="mt-4 text-center text-xs text-gray-500">
            <p>Émis le {formatDate(reservation.createdAt, 'dd/MM/yyyy à HH:mm')}</p>
            <p className="mt-1">Ce reçu est valable uniquement pour le trajet indiqué</p>
          </div>
        </div>
      </div>

      {/* Boutons d'actions */}
      <div className="print:hidden flex flex-col sm:flex-row justify-center gap-3 mt-6 px-2">
        <button 
          onClick={handlePDF}
          className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 text-white rounded-lg shadow hover:bg-blue-700 transition-colors"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3V10" />
          </svg>
          Télécharger
        </button>
        <button 
          onClick={() => window.print()}
          className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-green-600 text-white rounded-lg shadow hover:bg-green-700 transition-colors"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
          </svg>
          Imprimer
        </button>
        <button 
          onClick={() => navigate('/')}
          className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-gray-600 text-white rounded-lg shadow hover:bg-gray-700 transition-colors"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
          Accueil
        </button>
      </div>
    </div>
  );
};

export default ReceiptEnLignePage;